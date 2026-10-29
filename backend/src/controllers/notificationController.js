const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const NotificationProfile = require("../models/NotificationProfile");
const NotificationReadStatus = require("../models/NotificationReadStatus");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");
const redisHelper = require("../config/redisClient");
const { getHealthStatus } = require("../utils/healthCheck");
const { telemetry } = require("../utils/telemetry");

/**
 * Notification Controller — 100% Domain-Agnostic.
 *
 * All geo/role lookups have been removed. Notification feed filtering is now
 * driven exclusively by two generic primitives:
 *
 *   1. recipientId  — UNICAST: a direct message to this specific user
 *   2. tags         — MULTICAST/BROADCAST: profile.subscribedTags ∩ notification.tags
 *
 * The host application is responsible for assigning tags to users via
 *   PATCH /api/notifications/profile/:userId/tags
 * The engine never infers tags from location, role, or any other domain concept.
 */

/**
 * Extracts tenantId from request header, query, authenticated user, or defaults to "default".
 */
const getTenantId = (req) => {
  if (!req) return "default";
  return (
    req.tenantId ||
    req.headers?.["x-tenant-id"] ||
    req.query?.tenantId ||
    req.user?.tenantId ||
    "default"
  );
};

/**
 * Resolves the user's subscribed tags from NotificationProfile.
 * Checks Redis first (24h TTL), falls back to MongoDB.
 * Returns an empty array if no profile exists — graceful degradation.
 */
const getUserTags = async (userId, tenantId, redisHelper) => {
  const cacheKey = `tenant:${tenantId}:user:${userId}:subscribedTags`;
  const legacyKey = `user:${userId}:subscribedTags`;

  // 1. Redis cache check
  let cached = await redisHelper.safeGet(cacheKey);
  if (cached === null && tenantId === "default") {
    cached = await redisHelper.safeGet(legacyKey);
  }
  if (cached) {
    try {
      return typeof cached === "string" ? JSON.parse(cached) : cached;
    } catch (_) {}
  }

  // 2. DB lookup
  try {
    const profile = await NotificationProfile.findOne({ userId, tenantId })
      .select("subscribedTags")
      .lean();
    const tags = profile?.subscribedTags ?? [];

    // Cache for 24 hours
    await redisHelper.safeSet(cacheKey, tags, 86400);
    if (tenantId === "default") {
      await redisHelper.safeSet(legacyKey, tags, 86400);
    }
    return tags;
  } catch (_) {
    return [];
  }
};

/**
 * Builds the $or match criteria for a user's notification feed.
 * Purely tag/recipientId based — no geo, no roles.
 */
const buildFeedMatchCriteria = (userId, userTags) => {
  const criteria = [
    // Direct private message to this user
    { recipientId: userId },
    // Public broadcast to everyone
    { scope: "BROADCAST" },
  ];

  // Tag-based multicast: any notification whose tags overlap this user's subscriptions
  if (userTags.length > 0) {
    criteria.push({ tags: { $in: userTags } });
  }

  return criteria;
};

// ---------------------------------------------------------------------------
// 1. Fetch Notifications with Pagination
// GET /api/notifications?page=1&limit=20
// ---------------------------------------------------------------------------
const getNotifications = catchAsync(async (req, res, next) => {
  const userId   = req.userId || req.user?.id;
  const tenantId = getTenantId(req);

  if (!userId) return next(new AppError("User identity missing from request.", 401));

  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip  = (page - 1) * limit;

  const userTags      = await getUserTags(userId, tenantId, redisHelper);
  const matchCriteria = buildFeedMatchCriteria(userId, userTags);

  const notifications = await Notification.aggregate([
    // 1. Filter by tenant + recipient/tag match
    { $match: { tenantId, $or: matchCriteria } },

    // 2. Deduplicate
    { $group: { _id: "$_id", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },

    // 3. Sort & Paginate before $lookup
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },

    // 4. Join read status
    {
      $lookup: {
        from: "notificationreadstatuses",
        let: { notifId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$notificationId", "$$notifId"] },
                  { $eq: ["$userId", userId] },
                ],
              },
            },
          },
        ],
        as: "readInfo",
      },
    },

    // 5. Exclude soft-deleted entries
    { $match: { "readInfo.isDeleted": { $ne: true } } },

    // 6. Normalise isRead across scopes
    {
      $addFields: {
        isRead: {
          $cond: {
            if:   { $eq: ["$scope", "UNICAST"] },
            then: "$isRead",
            else: { $gt: [{ $size: "$readInfo" }, 0] },
          },
        },
      },
    },
    { $project: { readInfo: 0 } },
  ]);

  res.status(200).json({
    status: "success",
    page,
    results: notifications.length,
    data: notifications,
  });
});

// ---------------------------------------------------------------------------
// 2. Mark as Read
// PATCH /api/notifications/:id/read
// ---------------------------------------------------------------------------
const markAsRead = catchAsync(async (req, res, next) => {
  const { id }   = req.params;
  const userId   = req.userId || req.user?.id;
  const tenantId = getTenantId(req);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError("Invalid Notification ID format", 400));
  }

  const notification = await Notification.findById(id);
  if (!notification) {
    logger.warn(`MarkAsRead Failed: Notification ${id} not found.`);
    return next(new AppError("No notification found with that ID", 404));
  }

  // Cross-tenant protection
  if (notification.tenantId && notification.tenantId !== tenantId) {
    logger.warn(
      `Cross-tenant markAsRead attempt: Notif ${id} belongs to ${notification.tenantId}, requested by ${tenantId}`,
    );
    return next(new AppError("Unauthorized access to notification across tenants", 403));
  }

  if (notification.scope === "UNICAST") {
    if (String(notification.recipientId) !== String(userId)) {
      logger.warn(`Unauthorized read attempt by User ${userId} on Notif ${id}`);
      return next(new AppError("Unauthorized access to this notification", 403));
    }
    notification.isRead = true;
    await notification.save();

    // Decrement cached unread counter (UNICAST only)
    await redisHelper.safeDecr(`tenant:${tenantId}:user:${userId}:unread_count`);
    if (tenantId === "default") {
      await redisHelper.safeDecr(`user:${userId}:unread_count`);
    }
  } else {
    // MULTICAST / BROADCAST — track per-user read state in NotificationReadStatus
    await NotificationReadStatus.updateOne(
      { tenantId, notificationId: id, userId },
      { $setOnInsert: { readAt: new Date() } },
      { upsert: true },
    );
  }

  logger.info(`Notification ${id} marked as read by User ${userId} [Tenant: ${tenantId}]`);
  res.status(200).json({ status: "success", message: "Marked as read successfully" });
});

// ---------------------------------------------------------------------------
// 3. Get Total Unread Count
// GET /api/notifications/unread-count
// ---------------------------------------------------------------------------
const getUnreadCount = catchAsync(async (req, res, next) => {
  const userId   = req.userId || req.user?.id;
  const tenantId = getTenantId(req);

  if (!userId) return next(new AppError("User identity missing from request.", 401));

  const countKey       = `tenant:${tenantId}:user:${userId}:unread_count`;
  const legacyCountKey = `user:${userId}:unread_count`;

  // 1. Redis cache check
  let cachedCount = await redisHelper.safeGet(countKey);
  if (cachedCount === null && tenantId === "default") {
    cachedCount = await redisHelper.safeGet(legacyCountKey);
  }
  if (cachedCount !== null && cachedCount !== undefined) {
    return res.status(200).json({
      status: "success",
      source: "cache",
      tenantId,
      data: { unreadCount: parseInt(cachedCount, 10) },
    });
  }

  // 2. Cache miss → aggregate from DB
  const userTags      = await getUserTags(userId, tenantId, redisHelper);
  const matchCriteria = buildFeedMatchCriteria(userId, userTags);

  const result = await Notification.aggregate([
    { $match: { tenantId, $or: matchCriteria } },
    { $group: { _id: "$_id", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },
    {
      $lookup: {
        from: "notificationreadstatuses",
        let: { notifId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$notificationId", "$$notifId"] },
                  { $eq: ["$userId", userId] },
                ],
              },
            },
          },
        ],
        as: "readRecord",
      },
    },
    { $match: { "readRecord.isDeleted": { $ne: true } } },
    {
      $addFields: {
        isUnread: {
          $cond: {
            if:   { $eq: ["$scope", "UNICAST"] },
            then: { $eq: ["$isRead", false] },
            else: { $eq: [{ $size: "$readRecord" }, 0] },
          },
        },
      },
    },
    { $match: { isUnread: true } },
    { $count: "totalUnread" },
  ]);

  const count = result.length > 0 ? result[0].totalUnread : 0;

  // Cache for 1 hour
  await redisHelper.safeSet(countKey, count, 3600);
  if (tenantId === "default") {
    await redisHelper.safeSet(legacyCountKey, count, 3600);
  }

  res.status(200).json({
    status: "success",
    source: "database",
    tenantId,
    data: { unreadCount: count },
  });
});

// ---------------------------------------------------------------------------
// 4. Mark All Notifications as Read
// PATCH /api/notifications/mark-all-read
// ---------------------------------------------------------------------------
const markAllAsRead = catchAsync(async (req, res, next) => {
  const userId   = req.userId || req.user?.id;
  const tenantId = getTenantId(req);

  if (!userId) return next(new AppError("User identity missing from request.", 401));

  // Mark owned UNICAST notifications
  await Notification.updateMany(
    { tenantId, recipientId: userId, isRead: false },
    { $set: { isRead: true } },
  );

  // Collect unread MULTICAST/BROADCAST notifications this user can see
  const userTags   = await getUserTags(userId, tenantId, redisHelper);
  const orConditions = [{ scope: "BROADCAST" }];
  if (userTags.length > 0) {
    orConditions.push({ tags: { $in: userTags } });
  }

  const unreadNotifications = await Notification.aggregate([
    { $match: { tenantId, scope: { $ne: "UNICAST" }, $or: orConditions } },
    {
      $lookup: {
        from: "notificationreadstatuses",
        let: { notifId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$notificationId", "$$notifId"] },
                  { $eq: ["$userId", userId] },
                ],
              },
            },
          },
        ],
        as: "readRecord",
      },
    },
    { $match: { "readRecord.0": { $exists: false } } },
    { $group: { _id: "$_id" } },
  ]);

  if (unreadNotifications.length > 0) {
    const bulkOps = unreadNotifications.map((n) => ({
      updateOne: {
        filter: { tenantId, notificationId: n._id, userId },
        update: { $setOnInsert: { readAt: new Date() } },
        upsert: true,
      },
    }));

    await NotificationReadStatus.bulkWrite(bulkOps, { ordered: false }).catch((e) => {
      logger.error(`Error in bulkWrite for markAllAsRead: ${e.message}`);
    });
  }

  // Reset cached unread count to 0
  await redisHelper.safeSet(`tenant:${tenantId}:user:${userId}:unread_count`, 0, 3600);
  if (tenantId === "default") {
    await redisHelper.safeSet(`user:${userId}:unread_count`, 0, 3600);
  }

  res.status(200).json({ status: "success", message: "All notifications safely marked as read" });
});

// ---------------------------------------------------------------------------
// 5. Clear All Notifications
// DELETE /api/notifications/clear-all-notifications
// ---------------------------------------------------------------------------
const clearAllNotifications = catchAsync(async (req, res, next) => {
  const userId   = req.userId || req.user?.id;
  const tenantId = getTenantId(req);

  if (!userId) return next(new AppError("User identity missing from request.", 401));

  // Delete owned UNICAST notifications
  await Notification.deleteMany({ tenantId, recipientId: userId, scope: "UNICAST" });

  // Soft-delete MULTICAST/BROADCAST read-status entries for this user
  const userTags     = await getUserTags(userId, tenantId, redisHelper);
  const orConditions = [{ scope: "BROADCAST" }];
  if (userTags.length > 0) {
    orConditions.push({ tags: { $in: userTags } });
  }

  const publicNotifications = await Notification.aggregate([
    { $match: { tenantId, scope: { $ne: "UNICAST" }, $or: orConditions } },
    {
      $lookup: {
        from: "notificationreadstatuses",
        let: { notifId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$notificationId", "$$notifId"] },
                  { $eq: ["$userId", userId] },
                ],
              },
            },
          },
        ],
        as: "readRecord",
      },
    },
    { $match: { "readRecord.isDeleted": { $ne: true } } },
    { $group: { _id: "$_id" } },
  ]);

  if (publicNotifications.length > 0) {
    const bulkOps = publicNotifications.map((n) => ({
      updateOne: {
        filter: { tenantId, notificationId: n._id, userId },
        update: {
          $set: { isDeleted: true, deletedAt: new Date() },
          $setOnInsert: { readAt: new Date() },
        },
        upsert: true,
      },
    }));

    await NotificationReadStatus.bulkWrite(bulkOps, { ordered: false }).catch((e) => {
      logger.error(`Error in bulkWrite for clearAll: ${e.message}`);
    });
  }

  // Reset cached unread count to 0
  await redisHelper.safeSet(`tenant:${tenantId}:user:${userId}:unread_count`, 0, 3600);
  if (tenantId === "default") {
    await redisHelper.safeSet(`user:${userId}:unread_count`, 0, 3600);
  }

  res.status(200).json({ status: "success", message: "All notifications cleared successfully" });
});

// ---------------------------------------------------------------------------
// 6. Health Check
// GET /api/notifications/health
// ---------------------------------------------------------------------------
const getHealth = catchAsync(async (req, res) => {
  const health     = await getHealthStatus();
  const statusCode = health.status === "UNHEALTHY" ? 503 : 200;
  res.status(statusCode).json(health);
});

// ---------------------------------------------------------------------------
// 7. Prometheus Metrics
// GET /api/notifications/metrics
// ---------------------------------------------------------------------------
const getMetrics = catchAsync(async (req, res) => {
  const format = req.query.format || (req.headers.accept?.includes("json") ? "json" : "prometheus");
  if (format === "json") {
    return res.status(200).json(telemetry.getMetricsSummary());
  }
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.status(200).send(telemetry.getPrometheusMetrics());
});


// ---------------------------------------------------------------------------
// 8. Admin Dashboard Overview
// GET /api/notifications/overview
// ---------------------------------------------------------------------------
const getOverview = catchAsync(async (req, res) => {
  const tenantId = req.query?.tenantId || req.user?.tenantId || "default";

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Queue Statistics from BullMQ
  const queueStats = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    dlqCount: 0,
  };

  try {
    const { notificationQueue, deadLetterQueue } = require("../queues/notificationQueue");
    if (notificationQueue) {
      const counts = await notificationQueue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );
      queueStats.waiting = counts.waiting || 0;
      queueStats.active = counts.active || 0;
      queueStats.completed = counts.completed || 0;
      queueStats.failed = counts.failed || 0;
      queueStats.delayed = counts.delayed || 0;
    }
    if (deadLetterQueue) {
      const dlqCounts = await deadLetterQueue.getJobCounts("failed", "waiting");
      queueStats.dlqCount = (dlqCounts.failed || 0) + (dlqCounts.waiting || 0);
    }
  } catch (err) {
    logger.warn(`[getOverview] BullMQ status check failed: ${err.message}`);
  }

  // 2. Real-time Active Sockets
  let activeSockets = 0;
  try {
    const io = req.app.get("io");
    if (io) {
      if (typeof io.fetchSockets === "function") {
        const sockets = await io.fetchSockets();
        activeSockets = sockets ? sockets.length : 0;
      } else if (io.engine) {
        activeSockets = io.engine.clientsCount || 0;
      }
    }
  } catch (err) {
    logger.warn(`[getOverview] Sockets check failed: ${err.message}`);
  }

  // 3. System Health Check
  let health = null;
  try {
    health = await getHealthStatus();
  } catch (err) {
    health = { status: "DEGRADED", error: err.message };
  }

  // 4. MongoDB Aggregations & Metrics
  const [
    totalNotifications,
    statusBreakdown,
    totalProfiles,
    distinctRecipients,
    recentActivities,
    sevenDayAgg,
  ] = await Promise.all([
    Notification.countDocuments({}),
    Notification.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
    NotificationProfile.countDocuments({}),
    Notification.distinct("recipientId"),
    Notification.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select("_id title category priority status scope channels recipientId createdAt")
      .lean(),
    Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          total: { $sum: 1 },
          delivered: {
            $sum: {
              $cond: [{ $in: ["$status", ["DELIVERED", "SENT"]] }, 1, 0],
            },
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0],
            },
          },
          queued: {
            $sum: {
              $cond: [{ $in: ["$status", ["QUEUED", "PENDING", "PROCESSING"]] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Format Status Counts
  const statuses = {
    DELIVERED: 0,
    FAILED: 0,
    QUEUED: 0,
    PROCESSING: 0,
    PARTIAL: 0,
    PENDING: 0,
  };
  statusBreakdown.forEach((item) => {
    if (item._id) {
      statuses[item._id] = item.count;
    }
  });

  // Calculate Success Rate
  const successfulCount = statuses.DELIVERED + (statuses.SENT || 0);
  const attemptedCount = successfulCount + statuses.FAILED + statuses.PARTIAL;
  const successRate =
    attemptedCount > 0
      ? Math.round((successfulCount / attemptedCount) * 100 * 10) / 10
      : totalNotifications > 0
      ? 100
      : 100;

  // Total unique users (profiles or distinct recipients)
  const totalUsers = Math.max(totalProfiles || 0, distinctRecipients ? distinctRecipients.length : 0);

  // 7-day chronological chart filling
  const daysMap = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateKey = d.toISOString().split("T")[0];
    const displayLabel = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    daysMap.set(dateKey, {
      date: displayLabel,
      fullDate: dateKey,
      total: 0,
      delivered: 0,
      failed: 0,
      queued: 0,
    });
  }

  sevenDayAgg.forEach((item) => {
    if (daysMap.has(item._id)) {
      const existing = daysMap.get(item._id);
      existing.total = item.total;
      existing.delivered = item.delivered;
      existing.failed = item.failed;
      existing.queued = item.queued;
    }
  });

  const chartData = Array.from(daysMap.values());

  res.status(200).json({
    status: "success",
    data: {
      metrics: {
        totalNotifications,
        successRate,
        activeSockets,
        totalUsers,
        statuses,
      },
      chartData,
      queueStatus: queueStats,
      systemHealth: {
        status: health?.status || "HEALTHY",
        uptimeSeconds: health?.uptimeSeconds || Math.floor(process.uptime()),
        services: health?.services || {},
      },
      recentActivities,
    },
  });
});


// ---------------------------------------------------------------------------
// 9. Admin Live Logs History
// GET /api/notifications/logs
// ---------------------------------------------------------------------------
const getLogs = catchAsync(async (req, res) => {
  const { getBufferedLogs } = require("../utils/adminLogEmitter");
  const logs = getBufferedLogs();
  res.status(200).json({
    status: "success",
    data: { logs },
  });
});


// ---------------------------------------------------------------------------
// 10. Dispatch / Ingest Notification
// POST /api/notifications
// ---------------------------------------------------------------------------
const dispatchNotification = catchAsync(async (req, res, next) => {
  const io = req.app.get("io");
  const { sendNotification } = require("../services/NotificationService");

  const {
    title,
    message,
    priority = "normal",
    category = "GENERAL",
    scope = "UNICAST",
    recipientId,
    channels = ["IN_APP"],
    tags = [],
    actionUrl,
    actionData,
    tenantId: bodyTenantId,
  } = req.body;

  if (!title || !message) {
    return next(new AppError("Title and message are required fields.", 400));
  }

  if (scope === "UNICAST" && !recipientId) {
    return next(new AppError("recipientId is required for UNICAST notifications.", 400));
  }

  const tenantId =
    req.headers?.["x-tenant-id"] || bodyTenantId || req.user?.tenantId || "default";

  const payload = {
    title: title.trim(),
    message: message.trim(),
    priority: priority.toLowerCase(),
    category: category.toUpperCase(),
    scope: scope.toUpperCase(),
    recipientId: recipientId ? String(recipientId).trim() : undefined,
    channels: Array.isArray(channels) && channels.length > 0 ? channels : ["IN_APP"],
    tags: Array.isArray(tags) ? tags : [],
    actionUrl,
    actionData,
    tenantId,
    senderId: req.user?.id || req.userId || "admin",
  };

  const result = await sendNotification(io, payload);

  res.status(201).json({
    status: "success",
    message: "Notification successfully dispatched to engine pipeline",
    data: result,
  });
});

module.exports = {
  getNotifications,
  markAsRead,
  getUnreadCount,
  markAllAsRead,
  clearAllNotifications,
  getHealth,
  getMetrics,
  getOverview,
  getLogs,
  dispatchNotification,
};
