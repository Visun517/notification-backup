const notificationQueueModule = require("../queues/notificationQueue");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");

/**
 * Batch limits to safeguard against memory exhaustion and event-loop blocking.
 */
const DEFAULT_BATCH_LIMIT = 50;
const MAX_BATCH_LIMIT = 50;

/**
 * Controller: retryDlqJobs
 *
 * Safely fetches a batch of permanently failed jobs from the Dead-Letter Queue (DLQ),
 * reconstructs their original payload and tenant context, re-enqueues them into the
 * primary notificationQueue, and removes the job from the DLQ strictly upon success.
 *
 * Architecture & Safety Guarantees:
 * 1. Memory Overhead Protection: Capped strictly at 50 jobs per batch.
 * 2. Duplicate Prevention / At-Least-Once Delivery: `job.remove()` is called strictly
 *    AFTER `enqueueNotification` succeeds. If re-enqueuing throws, the DLQ job is
 *    preserved for inspection and subsequent retry attempts.
 * 3. Fault Isolation: Iterative processing ensures one malformed job does not block
 *    other jobs in the batch.
 * 4. Structured Observability: Comprehensive `logger.info` and `logger.error` traces.
 */
const retryDlqJobs = catchAsync(async (req, res, next) => {
  const dlq = notificationQueueModule.deadLetterQueue;
  if (!dlq) {
    logger.error("❌ [DLQ Retry] DeadLetterQueue instance is not available.");
    return next(new AppError("Dead-Letter Queue is not initialized.", 503));
  }

  // Parse limit from request with safety bounds [1, 50]
  const requestedLimit = parseInt(req.body?.limit || req.query?.limit, 10);
  const batchLimit = Math.min(
    Math.max(Number.isInteger(requestedLimit) ? requestedLimit : DEFAULT_BATCH_LIMIT, 1),
    MAX_BATCH_LIMIT
  );

  const initiator = req.user?.id || req.userId || "anonymous-admin";
  logger.info(`🔄 [DLQ Retry] Initiated by Admin ${initiator}. Fetching up to ${batchLimit} jobs from Dead-Letter Queue.`);

  // 1. Fetch batch of failed jobs (limit to 50 max to prevent memory overhead)
  let jobs = await dlq.getFailed(0, batchLimit - 1);
  if (!jobs || jobs.length === 0) {
    // BullMQ stores jobs added via .add() without an active DLQ worker in 'waiting' state
    jobs = await dlq.getJobs(["failed", "waiting"], 0, batchLimit - 1);
  }

  // Ensure strict bounding
  if (jobs && jobs.length > batchLimit) {
    jobs = jobs.slice(0, batchLimit);
  }

  if (!jobs || jobs.length === 0) {
    logger.info("ℹ️ [DLQ Retry] No failed jobs found in Dead-Letter Queue.");
    return res.status(200).json({
      status: "success",
      message: "No failed jobs found in DLQ to retry.",
      data: {
        totalProcessed: 0,
        successCount: 0,
        failureCount: 0,
        retriedJobs: [],
        failedJobs: [],
      },
    });
  }

  const retriedJobs = [];
  const failedJobs = [];

  // 2. Iterate through jobs, extract original payload & tenantId, and re-enqueue
  for (const job of jobs) {
    const dlqJobId = String(job.id);
    const jobData = job.data || {};

    try {
      const tenantId = jobData.tenantId || "default";
      const payload = jobData.payload || jobData;
      const notificationId = jobData.notificationId || payload?._id || payload?.id;

      if (!payload) {
        throw new Error(`Job ${dlqJobId} does not contain a valid notification payload.`);
      }

      // Preserve notification identity if not directly on payload object
      if (!payload._id && !payload.id && notificationId) {
        payload.id = notificationId;
      }

      // Re-enqueue into primary notification queue
      const newJob = await notificationQueueModule.enqueueNotification(payload, {
        tenantId,
        recipientMeta: jobData.recipientMeta || {},
        templateContext: jobData.templateContext || {},
        attempts: 3,
      });

      // 3. Strictly remove from DLQ AFTER successful re-enqueue to prevent duplicate processing
      await job.remove();

      logger.info(
        `♻️ [DLQ Retry] Successfully re-enqueued DLQ Job ${dlqJobId} -> New Job ${newJob.id} [Notification: ${notificationId || "N/A"}, Tenant: ${tenantId}]`
      );

      retriedJobs.push({
        dlqJobId,
        newJobId: String(newJob.id),
        notificationId: notificationId ? String(notificationId) : null,
        tenantId,
      });
    } catch (err) {
      // DLQ job is intentionally NOT removed if re-enqueuing or removal fails
      logger.error(
        `❌ [DLQ Retry] Failed to retry DLQ Job ${dlqJobId}: ${err.message}`,
        { dlqJobId, error: err.message, stack: err.stack }
      );

      failedJobs.push({
        dlqJobId,
        error: err.message,
      });
    }
  }

  logger.info(
    `🏁 [DLQ Retry] Completed batch. Total: ${jobs.length}, Successful: ${retriedJobs.length}, Failed: ${failedJobs.length}`
  );

  return res.status(200).json({
    status: "success",
    message: `Processed ${jobs.length} DLQ jobs. ${retriedJobs.length} successfully retried, ${failedJobs.length} failed.`,
    data: {
      totalProcessed: jobs.length,
      successCount: retriedJobs.length,
      failureCount: failedJobs.length,
      retriedJobs,
      failedJobs,
    },
  });
});

module.exports = {
  retryDlqJobs,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
};
