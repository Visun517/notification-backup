const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const Notification = require("../models/Notification");
const { channelRegistry } = require("../registry/ChannelRegistry");
const { NOTIFICATION_STATUSES } = require("../constants/notificationConstants");
const { deadLetterQueue } = require("../queues/notificationQueue");
const { checkRateLimit } = require("../utils/rateLimiter");
const logger = require("../utils/logger");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const workerConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 5) {
      return null; // Stop reconnecting after 5 attempts
    }
    return Math.min(times * 500, 2000);
  },
});

workerConnection.on("error", (err) => {
  logger.warn(`⚠️ [NotificationWorker Redis] ${err.message}`);
});

/**
 * Core Job Processor for Notification Dispatches.
 *
 * @param {Object} job - BullMQ Job instance
 * @returns {Promise<Object>} Execution result summary
 */
async function processNotificationJob(job) {
  const { notificationId, payload, recipientMeta } = job.data;
  const tenantId = job.data.tenantId || payload.tenantId || "default";

  // Measure Queue Wait Duration
  const enqueuedAt = job.data.enqueuedAt ? new Date(job.data.enqueuedAt).getTime() : null;
  const queueWaitMs = enqueuedAt ? Math.max(0, Date.now() - enqueuedAt) : 0;
  try {
    const { telemetry } = require("../utils/telemetry");
    telemetry.recordQueueWaitTime({ tenantId, durationMs: queueWaitMs });
  } catch (_) {}

    try {
    const { emitLiveLog } = require("../utils/adminLogEmitter");
    emitLiveLog({
      level: "INFO",
      event: "JOB_PROCESSING",
      message: `Worker thread started processing Job ${job.id} for Notification ${notificationId} (Attempt: ${job.attemptsMade + 1})`,
      tenantId,
      details: {
        jobId: job.id,
        notificationId,
        channels: targetChannels,
        queueWaitMs,
      },
    });
  } catch (_) {}

  logger.info(`⚙️ [NotificationWorker] Processing Job ${job.id} [Tenant: ${tenantId}] for Notification: ${notificationId} (Attempt: ${job.attemptsMade + 1})`);

  // 1. Update status in Database to PROCESSING
  if (notificationId) {
    try {
      await Notification.findByIdAndUpdate(notificationId, {
        status: NOTIFICATION_STATUSES.PROCESSING,
      });
    } catch (err) {
      logger.warn(`Failed to update status to PROCESSING for ${notificationId}: ${err.message}`);
    }
  }

  const targetChannels = Array.isArray(payload.channels) && payload.channels.length > 0
    ? payload.channels
    : ["IN_APP"];

  const dispatchResults = [];
  let successCount = 0;
  let failureCount = 0;

  // 2. Iterate through target channels and execute deliveries
  for (const channel of targetChannels) {
    // A. Apply Rate Limiting / Frequency Capping for Push notifications (partitioned by tenantId)
    if (channel === "PUSH" && payload.recipientId) {
      const rateCheck = await checkRateLimit(payload.recipientId, "PUSH", {
        tenantId,
        priority: payload.priority,
      });

      if (!rateCheck.allowed) {
        logger.warn(`⏳ [NotificationWorker] PUSH rate limit exceeded for Tenant ${tenantId}, User ${payload.recipientId}. Skipping PUSH delivery.`);
        dispatchResults.push({
          channel,
          success: false,
          skipped: true,
          reason: "Rate limit exceeded (frequency capping)",
        });
        continue;
      }
    }

    // B. Resolve Channel Strategy from ChannelRegistry
    const provider = channelRegistry.getProvider(channel);
    if (!provider) {
      logger.warn(`⚠️ [NotificationWorker] Provider not found for channel '${channel}'. Skipping.`);
      dispatchResults.push({ channel, success: false, reason: "Provider not registered" });
      failureCount++;
      try {
        const { telemetry } = require("../utils/telemetry");
        telemetry.recordDispatch({
          tenantId,
          channel,
          durationMs: 0,
          success: false,
          reason: "Provider not registered",
        });
      } catch (_) {}
      continue;
    }

    if (!provider.isConfigured()) {
      logger.warn(`⚠️ [NotificationWorker] Provider for channel '${channel}' is not configured. Skipping.`);
      dispatchResults.push({ channel, success: false, reason: "Provider not configured" });
      failureCount++;
      try {
        const { telemetry } = require("../utils/telemetry");
        telemetry.recordDispatch({
          tenantId,
          channel,
          durationMs: 0,
          success: false,
          reason: "Provider not configured",
        });
      } catch (_) {}
      continue;
    }

    // C. Deliver via Provider with Dispatch Latency Telemetry
    const sendStart = Date.now();
    try {
      const result = await provider.send(payload, recipientMeta || {});
      const sendDurationMs = Date.now() - sendStart;
      dispatchResults.push(result);
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
      try {
        const { telemetry } = require("../utils/telemetry");
        telemetry.recordDispatch({
          tenantId,
          channel,
          durationMs: sendDurationMs,
          success: !!result.success,
          reason: result.reason || result.error,
        });
      } catch (_) {}
    } catch (err) {
      const sendDurationMs = Date.now() - sendStart;
      logger.error(`❌ [NotificationWorker] Delivery error on channel '${channel}': ${err.message}`);
      dispatchResults.push({ channel, success: false, error: err.message });
      failureCount++;
      try {
        const { telemetry } = require("../utils/telemetry");
        telemetry.recordDispatch({
          tenantId,
          channel,
          durationMs: sendDurationMs,
          success: false,
          reason: err.message,
        });
      } catch (_) {}
    }
  }

  // 3. Determine Final Delivery Status
  let finalStatus;
  if (successCount > 0 && failureCount === 0) {
    finalStatus = NOTIFICATION_STATUSES.DELIVERED;
  } else if (successCount > 0 && failureCount > 0) {
    finalStatus = NOTIFICATION_STATUSES.PARTIAL;
  } else {
    finalStatus = NOTIFICATION_STATUSES.FAILED;
  }

  // Update Database status
  if (notificationId) {
    try {
      await Notification.findByIdAndUpdate(notificationId, {
        $set: {
          status: finalStatus,
          // Use dotted-path notation to MERGE into metadata rather than
          // replacing the entire subdocument — preserves any custom fields
          // that were set at creation time (e.g. metadata.customField).
          "metadata.dispatchResults": dispatchResults,
          "metadata.processedAt": new Date(),
        },
      });
    } catch (err) {
      logger.error(`Database status update error for ${notificationId}: ${err.message}`);
    }
  }

    try {
    const { emitLiveLog } = require("../utils/adminLogEmitter");
    const isSuccess = finalStatus === NOTIFICATION_STATUSES.DELIVERED;
    const isPartial = finalStatus === NOTIFICATION_STATUSES.PARTIAL;
    emitLiveLog({
      level: isSuccess ? "SUCCESS" : isPartial ? "WARN" : "ERROR",
      event: isSuccess ? "NOTIFICATION_DELIVERED" : isPartial ? "NOTIFICATION_PARTIAL" : "NOTIFICATION_FAILED",
      message: `Notification ${notificationId} dispatched with status ${finalStatus} (${successCount} succeeded, ${failureCount} failed)`,
      tenantId,
      details: {
        notificationId,
        status: finalStatus,
        successCount,
        failureCount,
        dispatchResults,
      },
    });
  } catch (_) {}

  // 4. If all channels failed and we still have retry attempts remaining, throw an error to trigger BullMQ retry
  if (successCount === 0 && failureCount > 0) {
    throw new Error(`All target delivery channels failed for notification ${notificationId}`);
  }

  return {
    status: finalStatus,
    results: dispatchResults,
  };
}

let notificationWorker = null;

/**
 * Initializes and starts the BullMQ Notification Worker.
 */
function startNotificationWorker() {
  if (notificationWorker) return notificationWorker;

  notificationWorker = new Worker(
    "notification-dispatch-queue",
    async (job) => processNotificationJob(job),
    {
      connection: workerConnection,
      concurrency: 5, // Process up to 5 notification dispatches concurrently
    },
  );

  notificationWorker.on("completed", (job, returnvalue) => {
    logger.info(`✅ [NotificationWorker] Job ${job.id} completed successfully (Status: ${returnvalue.status})`);
  });

  notificationWorker.on("failed", async (job, err) => {
    try {
      const { emitLiveLog } = require("../utils/adminLogEmitter");
      const isDlq = job.attemptsMade >= job.opts.attempts;
      const tenantId = job.data?.tenantId || "default";
      const notificationId = job.data?.notificationId;
      emitLiveLog({
        level: "ERROR",
        event: isDlq ? "ROUTED_TO_DLQ" : "JOB_FAILED",
        message: isDlq
          ? `Job ${job.id} exceeded maximum retry budget and was moved to Dead-Letter Queue (DLQ)`
          : `Job ${job.id} failed attempt ${job.attemptsMade}/${job.opts.attempts}: ${err.message}`,
        tenantId,
        details: {
          jobId: job.id,
          notificationId,
          error: err.message,
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts,
          routedToDlq: isDlq,
        },
      });
    } catch (_) {}
    logger.error(`❌ [NotificationWorker] Job ${job.id} failed (Attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`);

    // If job exceeded maximum attempts, route to Dead-Letter Queue (DLQ)
    if (job.attemptsMade >= job.opts.attempts) {
      logger.error(`🚨 [NotificationWorker] Job ${job.id} exceeded maximum retries. Routing to Dead-Letter Queue.`);

      const { notificationId, payload } = job.data;
      const tenantId = job.data.tenantId || payload.tenantId || "default";

      // Update database status to FAILED with failure metadata
      if (notificationId) {
        try {
          await Notification.findByIdAndUpdate(notificationId, {
            $set: {
              status: NOTIFICATION_STATUSES.FAILED,
              // Dotted-path $set preserves any other existing metadata fields
              "metadata.tenantId": tenantId,
              "metadata.failureReason": err.message,
              "metadata.failedAt": new Date(),
              "metadata.attempts": job.attemptsMade,
            },
          });
        } catch (dbErr) {
          logger.error(`Failed to update DB for failed job ${job.id}: ${dbErr.message}`);
        }
      }

      // Enqueue job into Dead-Letter Queue (DLQ) for inspection & replay
      try {
        await deadLetterQueue.add("dead-letter-job", {
          originalJobId: job.id,
          tenantId,
          notificationId,
          payload,
          failedReason: err.message,
          failedAt: new Date().toISOString(),
          attemptsMade: job.attemptsMade,
        });
        logger.info(`📦 [NotificationWorker] Job ${job.id} [Tenant: ${tenantId}] successfully queued into notification-dlq.`);
      } catch (dlqErr) {
        logger.error(`❌ [NotificationWorker] Failed to write to DLQ: ${dlqErr.message}`);
      }
    }
  });

  logger.info("🚀 [NotificationWorker] Worker started listening to 'notification-dispatch-queue'.");
  return notificationWorker;
}

/**
 * Gracefully shuts down the worker.
 */
async function stopNotificationWorker() {
  if (notificationWorker) {
    await notificationWorker.close();
    notificationWorker = null;
    logger.info("🛑 [NotificationWorker] Worker closed gracefully.");
  }
}

module.exports = {
  startNotificationWorker,
  stopNotificationWorker,
  processNotificationJob,
  // Getter instead of primitive snapshot: ensures callers always receive
  // the live worker instance even after startNotificationWorker() has run,
  // since the module-level `notificationWorker` variable starts as null.
  get notificationWorker() {
    return notificationWorker;
  },
};
