const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const logger = require("../utils/logger");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Shared IORedis connection configuration for BullMQ Queues.
 * maxRetriesPerRequest MUST be null as required by BullMQ.
 */
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 5) {
      return null; // Stop reconnecting after 5 attempts to prevent CPU/event loop spin
    }
    return Math.min(times * 500, 2000);
  },
});

connection.on("error", (err) => {
  logger.warn(`⚠️ [BullMQ Redis Connection] ${err.message}`);
});

/**
 * Priority mapping for BullMQ jobs (Lower number = Higher priority in BullMQ).
 */
function getJobPriority(priorityString) {
  switch (priorityString) {
    case "critical":
      return 1;
    case "high":
      return 2;
    case "medium":
    case "normal":
      return 3;
    case "low":
      return 4;
    default:
      return 3;
  }
}

/**
 * Primary Notification Dispatch Queue.
 * Configured with 3 retry attempts and exponential backoff (2000ms delay base).
 */
const notificationQueue = new Queue("notification-dispatch-queue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000, // 2s -> 4s -> 8s
    },
    removeOnComplete: {
      age: 3600, // Retain completed jobs for 1 hour for audit/status tracking
      count: 2000,
    },
    removeOnFail: false, // Do not auto-delete failed jobs; retained for DLQ triage
  },
});

/**
 * Dead-Letter Queue (DLQ).
 * Holds permanently failed notification jobs exceeding maximum retry attempts.
 */
const deadLetterQueue = new Queue("notification-dlq", {
  connection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});

/**
 * Enqueues a notification into the dispatch queue.
 *
 * @param {Object} notification - Persisted Notification document
 * @param {Object} [options={}] - Options (recipientMeta, templateContext, etc.)
 * @returns {Promise<Object>} BullMQ Job instance
 */
async function enqueueNotification(notification, options = {}) {
  const notifId = notification._id ? notification._id.toString() : notification.id;
  const priority = notification.priority || "normal";
  const tenantId = notification.tenantId || options.tenantId || "default";

  const jobData = {
    tenantId,
    notificationId: notifId,
    payload: notification.toObject ? notification.toObject() : notification,
    recipientMeta: options.recipientMeta || {},
    templateContext: options.templateContext || {},
    enqueuedAt: new Date().toISOString(),
  };

  const job = await notificationQueue.add("dispatch-notification", jobData, {
    priority: getJobPriority(priority),
    attempts: options.attempts || 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    jobId: `tenant_${tenantId}_notif_${notifId}_${Date.now()}`,
  });

  try {
    const { telemetry } = require("../utils/telemetry");
    telemetry.recordEnqueued({
      tenantId,
      channels: notification.channels,
      priority,
    });
  } catch (_) { }

  logger.info(`📥 [NotificationQueue] Enqueued notification ${notifId} [Tenant: ${tenantId}] (Job ID: ${job.id}, Priority: ${priority})`);
  return job;
}

module.exports = {
  notificationQueue,
  deadLetterQueue,
  enqueueNotification,
  getJobPriority,
  connection,
};
