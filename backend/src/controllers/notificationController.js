const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const NotificationReadStatus = require("../models/NotificationReadStatus");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");
const { getRegionFromCoords } = require("../utils/locationHelper");
const redisHelper = require("../config/redisClient");
const { getHealthStatus } = require("../utils/healthCheck");
const { telemetry } = require("../utils/telemetry");

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
 * 1. Fetch notifications with Pagination
 * GET /api/notifications?page=1&limit=20
 *
 * Description: Retrieves a list of notifications for the authenticated user.
 */
const getNotifications = catchAsync(async (req, res, next) => {
  // Extract authenticated user populated by JWT auth middleware
  const user = req.user;
  const userId = req.userId || user._id.toString();

  const userRole = user.role;
  let userDistrict = null;
  let userDivision = null;

  if (user.currentLocation?.coordinates) {
    const [lng, lat] = user.currentLocation.coordinates;
    const regionData = await getRegionFromCoords(lat, lng);
    if (regionData) {
      userDivision = regionData.division;
      userDistrict = regionData.district;
    }
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const matchCriteria = [
    { recipientId: new mongoose.Types.ObjectId(userId) },
    { recipientRole: userRole },
    { recipientRole: "ALL" },
    { tags: `role:${userRole}` },
    { tags: "role:ALL" },
    { scope: "BROADCAST" },
  ];

  if (userDivision) matchCriteria.push({ region: userDivision });
  if (userDistrict) matchCriteria.push({ district: userDistrict });

  const tenantId = getTenantId(req);

  const notifications = await Notification.aggregate([
    // 1. Filter Messages partitioned by tenantId
    {
      $match: {
        tenantId,
        $or: matchCriteria,
      },
    },

    // 2. Deduplicate (Remove identical messages)
    { $group: { _id: "$_id", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },

    // Sort & Paginate BEFORE $lookup
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },

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
                  { $eq: ["$userId", new mongoose.Types.ObjectId(userId)] },
                ],
              },
            },
          },
        ],
        as: "readInfo",
      },
    },

    { $match: { "readInfo.isDeleted": { $ne: true } } },

    {
      $addFields: {
        isRead: {
          $cond: {
            if: { $eq: ["$scope", "UNICAST"] },
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

/**
 * 2. Mark as read
 * PATCH /api/notifications/:id/read
 *
 * Description: Marks a specific notification as 'read' when the user clicks on it.
 */
const markAsRead = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.userId || req.user._id.toString();

  // Validate if the provided ID is a valid MongoDB ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError("Invalid Notification ID format", 400));
  }

  const tenantId = getTenantId(req);

  // Find the notification in the database
  const notification = await Notification.findById(id);

  if (!notification) {
    logger.warn(`MarkAsRead Failed: Notification ${id} not found.`);
    return next(new AppError("No notification found with that ID", 404));
  }

  // Cross-tenant protection
  if (notification.tenantId && notification.tenantId !== tenantId) {
    logger.warn(`Cross-tenant markAsRead attempt: Notification ${id} belongs to ${notification.tenantId}, requested by ${tenantId}`);
    return next(new AppError("Unauthorized access to notification across tenants", 403));
  }

  // If it's a private message, verify ownership and update 'isRead'
  if (notification.scope === "UNICAST") {
    if (notification.recipientId.toString() !== userId) {
      logger.warn(
        `Unauthorized read attempt by User ${userId} on Notif ${id}`,
      );
      return next(
        new AppError("Unauthorized access to this notification", 403),
      );
    }
    notification.isRead = true;
    await notification.save();
  } else {
    // If it's a public message, add or update a record in NotificationReadStatus
    await NotificationReadStatus.updateOne(
      { tenantId, notificationId: id, userId },
      { $setOnInsert: { readAt: new Date() } },
      { upsert: true },
    );
  }

  // Decrement cached unread count atomically in Redis (partitioned by tenantId)
  await redisHelper.safeDecr(`tenant:${tenantId}:user:${userId}:unread_count`);
  if (tenantId === "default") {
    await redisHelper.safeDecr(`user:${userId}:unread_count`);
  }

  logger.info(`Notification ${id} marked as read by User ${userId} [Tenant: ${tenantId}]`);

  res.status(200).json({
    status: "success",
    message: "Marked as read successfully",
  });
});

/**
 * 3. Get total unread count
 * GET /api/notifications/unread-count
 *
 * Description: Calculates how many unread messages the authenticated user has.
 */
const getUnreadCount = catchAsync(async (req, res, next) => {
  const user = req.user;
  const userId = req.userId || user._id.toString();

  const userRole = user.role;
  let userDistrict = null;
  let userDivision = null;

  const tenantId = getTenantId(req);
  const countKey = `tenant:${tenantId}:user:${userId}:unread_count`;
  const legacyCountKey = `user:${userId}:unread_count`;

  // 1. Check Redis Cache first (Cache-Aside Pattern)
  let cachedCount = await redisHelper.safeGet(countKey);
  if (cachedCount === null && tenantId === "default") {
    cachedCount = await redisHelper.safeGet(legacyCountKey);
  }
  if (cachedCount !== null && cachedCount !== undefined) {
    return res.status(200).json({
      status: "success",
      source: "cache",
      tenantId,
      data: {
        unreadCount: parseInt(cachedCount, 10),
      },
    });
  }

  // 2. Cache Miss: Execute MongoDB Aggregation Pipeline
  if (user.currentLocation?.coordinates) {
    const [lng, lat] = user.currentLocation.coordinates;
    const regionData = await getRegionFromCoords(lat, lng);
    if (regionData && typeof regionData === "object") {
      userDivision = regionData.division;
      userDistrict = regionData.district;
    }
  }

  const result = await Notification.aggregate([
    {
      $match: {
        tenantId,
        $or: [
          { recipientId: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId },
          { recipientRole: userRole },
          { recipientRole: "ALL" },
          { tags: `role:${userRole}` },
          { tags: "role:ALL" },
          { region: userDivision },
          { district: userDistrict },
          { scope: "BROADCAST" },
        ],
      },
    },

    {
      $group: {
        _id: "$_id",
        doc: { $first: "$$ROOT" },
      },
    },
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
                  { $eq: ["$userId", new mongoose.Types.ObjectId(userId)] },
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
            if: { $eq: ["$scope", "UNICAST"] },
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

  // 3. Cache the calculated count in Redis (1h TTL)
  await redisHelper.safeSet(countKey, count, 3600);
  if (tenantId === "default") {
    await redisHelper.safeSet(legacyCountKey, count, 3600);
  }

  res.status(200).json({
    status: "success",
    source: "database",
    tenantId,
    data: {
      unreadCount: count,
    },
  });
});

/**
 * 4. Mark all notifications as read for the authenticated user
 * PATCH /api/notifications/mark-all-read
 */
const markAllAsRead = catchAsync(async (req, res, next) => {
  const user = req.user;
  const userId = req.userId || user._id.toString();

  const { role: userRole, currentLocation } = user;

  let userDistrict = null;
  let userDivision = null;
  if (currentLocation?.coordinates) {
    const [lng, lat] = currentLocation.coordinates;
    const regionData = await getRegionFromCoords(lat, lng);
    userDivision = regionData?.division;
    userDistrict = regionData?.district;
  }

  const tenantId = getTenantId(req);

  await Notification.updateMany(
    { tenantId, recipientId: userId, isRead: false },
    { $set: { isRead: true } },
  );

  const orConditions = [
    { recipientRole: userRole },
    { recipientRole: "ALL" },
    { tags: `role:${userRole}` },
    { tags: "role:ALL" },
    { scope: "BROADCAST" },
  ];
  if (userDivision) orConditions.push({ region: userDivision });
  if (userDistrict) orConditions.push({ district: userDistrict });

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
                  { $eq: ["$userId", new mongoose.Types.ObjectId(userId)] },
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
        filter: {
          tenantId,
          notificationId: n._id,
          userId: new mongoose.Types.ObjectId(userId),
        },
        update: { $setOnInsert: { readAt: new Date() } },
        upsert: true,
      },
    }));

    await NotificationReadStatus.bulkWrite(bulkOps, { ordered: false }).catch(
      (e) => {
        logger.error(`Error in bulkWrite for markAllAsRead: ${e.message}`);
      },
    );
  }

  // Reset cached unread count in Redis to 0 (partitioned by tenantId)
  await redisHelper.safeSet(`tenant:${tenantId}:user:${userId}:unread_count`, 0, 3600);
  if (tenantId === "default") {
    await redisHelper.safeSet(`user:${userId}:unread_count`, 0, 3600);
  }

  res.status(200).json({
    status: "success",
    message: "All notifications safely marked as read",
  });
});

/**
 * 5. Clear all notifications for the authenticated user
 * DELETE /api/notifications/clear-all-notifications
 */
const clearAllNotifications = catchAsync(async (req, res, next) => {
  const user = req.user;
  const userId = req.userId || user._id.toString();

  const { role: userRole, currentLocation } = user;

  let userDistrict = null;
  let userDivision = null;
  if (currentLocation?.coordinates) {
    const [lng, lat] = currentLocation.coordinates;
    const regionData = await getRegionFromCoords(lat, lng);
    userDivision = regionData?.division;
    userDistrict = regionData?.district;
  }
  const tenantId = getTenantId(req);

  await Notification.deleteMany({ tenantId, recipientId: userId, scope: "UNICAST" });

  const orConditions = [
    { recipientRole: userRole },
    { recipientRole: "ALL" },
    { tags: `role:${userRole}` },
    { tags: "role:ALL" },
    { scope: "BROADCAST" },
  ];
  if (userDivision) orConditions.push({ region: userDivision });
  if (userDistrict) orConditions.push({ district: userDistrict });

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
                  { $eq: ["$userId", new mongoose.Types.ObjectId(userId)] },
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
        filter: {
          tenantId,
          notificationId: n._id,
          userId: new mongoose.Types.ObjectId(userId),
        },
        update: {
          $set: { isDeleted: true, deletedAt: new Date() },
          $setOnInsert: { readAt: new Date() },
        },
        upsert: true,
      },
    }));

    await NotificationReadStatus.bulkWrite(bulkOps, { ordered: false }).catch(
      (e) => {
        logger.error(`Error in bulkWrite for clearAll: ${e.message}`);
      },
    );
  }

  // Reset cached unread count in Redis to 0 (partitioned by tenantId)
  await redisHelper.safeSet(`tenant:${tenantId}:user:${userId}:unread_count`, 0, 3600);
  if (tenantId === "default") {
    await redisHelper.safeSet(`user:${userId}:unread_count`, 0, 3600);
  }

  res.status(200).json({
    status: "success",
    message: "All notifications cleared successfully",
  });
});

/**
 * 6. Health Check Endpoint
 * GET /api/notifications/health
 */
const getHealth = catchAsync(async (req, res) => {
  const health = await getHealthStatus();
  const statusCode = health.status === "UNHEALTHY" ? 503 : 200;
  res.status(statusCode).json(health);
});

/**
 * 7. Prometheus Metrics Endpoint
 * GET /api/notifications/metrics
 */
const getMetrics = catchAsync(async (req, res) => {
  const format = req.query.format || (req.headers.accept?.includes("json") ? "json" : "prometheus");
  if (format === "json") {
    return res.status(200).json(telemetry.getMetricsSummary());
  }
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.status(200).send(telemetry.getPrometheusMetrics());
});

module.exports = {
  getNotifications,
  markAsRead,
  getUnreadCount,
  markAllAsRead,
  clearAllNotifications,
  getHealth,
  getMetrics,
};
