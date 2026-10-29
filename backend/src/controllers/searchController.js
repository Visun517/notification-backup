const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const NotificationTemplate = require("../models/NotificationTemplate");
const NotificationProfile = require("../models/NotificationProfile");
const { deadLetterQueue } = require("../queues/notificationQueue");
const catchAsync = require("../utils/catchAsync");
const logger = require("../utils/logger");

/**
 * GET /api/notifications/search?q={query}
 * Concurrently searches Notifications, Templates, DLQ Jobs, and User Profiles.
 */
exports.globalSearch = catchAsync(async (req, res, next) => {
  const query = (req.query.q || "").trim();
  const tenantId = req.user?.tenantId || req.query.tenantId || "default";

  if (!query) {
    return res.status(200).json({
      status: "success",
      data: {
        query: "",
        counts: { notifications: 0, templates: 0, dlq: 0, users: 0 },
        results: { notifications: [], templates: [], dlq: [], users: [] },
      },
    });
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  // Notification search conditions
  const notificationOr = [
    { title: regex },
    { message: regex },
    { status: regex },
    { recipientId: regex },
    { category: regex },
  ];
  if (mongoose.Types.ObjectId.isValid(query)) {
    notificationOr.push({ _id: query });
  }

  // 1. Concurrently execute DB queries and DLQ scan
  const [notifications, templates, users, dlqJobs] = await Promise.all([
    // Notifications search
    Notification.find({
      tenantId,
      $or: notificationOr,
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .select("_id title status priority category recipientId createdAt")
      .lean()
      .catch((err) => {
        logger.warn(`Search error in notifications: ${err.message}`);
        return [];
      }),

    // Templates search
    NotificationTemplate.find({
      tenantId,
      $or: [{ name: regex }, { subject: regex }, { category: regex }],
    })
      .limit(6)
      .select("_id name category subject channels")
      .lean()
      .catch((err) => {
        logger.warn(`Search error in templates: ${err.message}`);
        return [];
      }),

    // User Profiles search
    NotificationProfile.find({
      tenantId,
      $or: [{ userId: regex }, { subscribedTags: regex }],
    })
      .limit(6)
      .select("userId subscribedTags preferences createdAt")
      .lean()
      .catch((err) => {
        logger.warn(`Search error in profiles: ${err.message}`);
        return [];
      }),

    // DLQ jobs search
    deadLetterQueue
      ? Promise.all([
          deadLetterQueue.getJobs(["waiting"], 0, 100),
          deadLetterQueue.getJobs(["failed"], 0, 100),
        ])
          .then(([waiting, failed]) => {
            const all = [...waiting, ...failed];
            const qLower = query.toLowerCase();
            const matches = [];

            for (const job of all) {
              const data = job.data || {};
              const idMatch = String(job.id).includes(qLower);
              const notifMatch = String(data.notificationId || "").toLowerCase().includes(qLower);
              const reasonMatch = String(data.failedReason || "").toLowerCase().includes(qLower);
              const titleMatch = String(data.payload?.title || data.payload?.subject || "").toLowerCase().includes(qLower);

              if (idMatch || notifMatch || reasonMatch || titleMatch) {
                matches.push({
                  id: String(job.id),
                  originalJobId: data.originalJobId,
                  notificationId: data.notificationId,
                  failedReason: data.failedReason || "Dispatch failed",
                  failedAt: data.failedAt || new Date(job.timestamp || Date.now()).toISOString(),
                  attemptsMade: data.attemptsMade || 3,
                });
                if (matches.length >= 6) break;
              }
            }
            return matches;
          })
          .catch((err) => {
            logger.warn(`Search error in DLQ: ${err.message}`);
            return [];
          })
      : Promise.resolve([]),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      query,
      counts: {
        notifications: notifications.length,
        templates: templates.length,
        dlq: dlqJobs.length,
        users: users.length,
      },
      results: {
        notifications,
        templates,
        dlq: dlqJobs,
        users,
      },
    },
  });
});
