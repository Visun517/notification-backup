const { notificationQueue, deadLetterQueue, enqueueNotification } = require("../queues/notificationQueue");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");
const { emitLiveLog } = require("../utils/adminLogEmitter");

/**
 * GET /api/notifications/dlq
 * Fetches jobs in the Dead-Letter Queue with pagination.
 */
exports.getDLQJobs = catchAsync(async (req, res, next) => {
  if (!deadLetterQueue) {
    return next(new AppError("Dead-Letter Queue is not initialized.", 503));
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  // Retrieve jobs in waiting/failed state from DLQ
  const [waitingJobs, failedJobs] = await Promise.all([
    deadLetterQueue.getJobs(["waiting"], 0, 500),
    deadLetterQueue.getJobs(["failed"], 0, 500),
  ]);

  const allJobs = [...waitingJobs, ...failedJobs].sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
  );

  const totalCount = allJobs.length;
  const paginatedJobs = allJobs.slice(start, start + limit);

  const formattedJobs = paginatedJobs.map((job) => {
    const data = job.data || {};
    return {
      id: String(job.id),
      name: job.name || "dead-letter-job",
      originalJobId: data.originalJobId || job.id,
      notificationId: data.notificationId || data.payload?._id || data.payload?.id,
      tenantId: data.tenantId || "default",
      failedReason: data.failedReason || job.failedReason || "Unknown failure reason",
      failedAt: data.failedAt || (job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString()),
      attemptsMade: data.attemptsMade || job.attemptsMade || 3,
      payload: data.payload || {},
      recipientMeta: data.recipientMeta || {},
      timestamp: job.timestamp,
    };
  });

  res.status(200).json({
    status: "success",
    results: formattedJobs.length,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
      totalCount,
    },
    data: {
      jobs: formattedJobs,
      totalCount,
    },
  });
});

/**
 * POST /api/notifications/dlq/:jobId/retry
 * Replays a specific job from DLQ back into the active dispatch queue.
 */
exports.retryDLQJob = catchAsync(async (req, res, next) => {
  if (!deadLetterQueue) {
    return next(new AppError("Dead-Letter Queue is not initialized.", 503));
  }

  const { jobId } = req.params;
  const job = await deadLetterQueue.getJob(jobId);

  if (!job) {
    return next(new AppError(`DLQ job with ID ${jobId} not found.`, 404));
  }

  const jobData = job.data || {};
  const payload = jobData.payload || jobData;
  const tenantId = jobData.tenantId || "default";
  const notificationId = jobData.notificationId || payload?._id || payload?.id;

  // Re-enqueue into primary notification queue
  const newJob = await enqueueNotification(payload, {
    tenantId,
    recipientMeta: jobData.recipientMeta || {},
    templateContext: jobData.templateContext || {},
    attempts: 3,
  });

  // Remove from DLQ strictly after successful re-enqueuing
  await job.remove();

  logger.info(`♻️ [DLQ] Retried job ${jobId} -> Re-enqueued as ${newJob.id}`);

  emitLiveLog({
    level: "INFO",
    event: "DLQ_JOB_RETRIED",
    message: `DLQ job #${jobId} re-enqueued for dispatch (Notification: ${notificationId || "N/A"})`,
    tenantId,
    details: {
      dlqJobId: jobId,
      newJobId: newJob.id,
      notificationId,
    },
  });

  res.status(200).json({
    status: "success",
    message: `Job ${jobId} successfully re-enqueued as ${newJob.id}`,
    data: {
      dlqJobId: jobId,
      newJobId: newJob.id,
    },
  });
});

/**
 * POST /api/notifications/dlq/retry-all
 * Retries all failed jobs currently in the DLQ (capped at 50 per batch).
 */
exports.retryAllDLQJobs = catchAsync(async (req, res, next) => {
  if (!deadLetterQueue) {
    return next(new AppError("Dead-Letter Queue is not initialized.", 503));
  }

  const maxBatch = 50;
  const [waitingJobs, failedJobs] = await Promise.all([
    deadLetterQueue.getJobs(["waiting"], 0, maxBatch),
    deadLetterQueue.getJobs(["failed"], 0, maxBatch),
  ]);

  const jobs = [...waitingJobs, ...failedJobs].slice(0, maxBatch);

  if (jobs.length === 0) {
    return res.status(200).json({
      status: "success",
      message: "No DLQ jobs found to retry.",
      data: {
        retriedCount: 0,
        failedCount: 0,
      },
    });
  }

  const retriedJobs = [];
  const errors = [];

  for (const job of jobs) {
    const dlqJobId = String(job.id);
    const jobData = job.data || {};

    try {
      const payload = jobData.payload || jobData;
      const tenantId = jobData.tenantId || "default";

      const newJob = await enqueueNotification(payload, {
        tenantId,
        recipientMeta: jobData.recipientMeta || {},
        templateContext: jobData.templateContext || {},
        attempts: 3,
      });

      await job.remove();
      retriedJobs.push({ dlqJobId, newJobId: newJob.id });
    } catch (err) {
      logger.error(`Failed to retry DLQ job ${dlqJobId}: ${err.message}`);
      errors.push({ dlqJobId, error: err.message });
    }
  }

  emitLiveLog({
    level: "INFO",
    event: "DLQ_BULK_RETRIED",
    message: `Bulk retried ${retriedJobs.length} jobs from Dead-Letter Queue`,
    tenantId: "default",
    details: {
      retriedCount: retriedJobs.length,
      failedCount: errors.length,
    },
  });

  res.status(200).json({
    status: "success",
    message: `Bulk retry completed. ${retriedJobs.length} retried successfully, ${errors.length} failed.`,
    data: {
      retriedCount: retriedJobs.length,
      failedCount: errors.length,
      retriedJobs,
      errors,
    },
  });
});

/**
 * DELETE /api/notifications/dlq/:jobId
 * Removes a specific dead-letter job permanently.
 */
exports.deleteDLQJob = catchAsync(async (req, res, next) => {
  if (!deadLetterQueue) {
    return next(new AppError("Dead-Letter Queue is not initialized.", 503));
  }

  const { jobId } = req.params;
  const job = await deadLetterQueue.getJob(jobId);

  if (!job) {
    return next(new AppError(`DLQ job with ID ${jobId} not found.`, 404));
  }

  await job.remove();
  logger.info(`🗑️ [DLQ] Deleted job ${jobId}`);

  emitLiveLog({
    level: "WARN",
    event: "DLQ_JOB_DELETED",
    message: `Job #${jobId} deleted from Dead-Letter Queue`,
    tenantId: "default",
    details: { jobId },
  });

  res.status(200).json({
    status: "success",
    message: `DLQ job ${jobId} removed successfully.`,
  });
});

/**
 * DELETE /api/notifications/dlq/clear-all
 * Purges all jobs in the Dead-Letter Queue.
 */
exports.clearAllDLQJobs = catchAsync(async (req, res, next) => {
  if (!deadLetterQueue) {
    return next(new AppError("Dead-Letter Queue is not initialized.", 503));
  }

  const [waitingJobs, failedJobs] = await Promise.all([
    deadLetterQueue.getJobs(["waiting"], 0, 500),
    deadLetterQueue.getJobs(["failed"], 0, 500),
  ]);

  const allJobs = [...waitingJobs, ...failedJobs];
  let removedCount = 0;

  for (const job of allJobs) {
    try {
      await job.remove();
      removedCount++;
    } catch (_) {}
  }

  emitLiveLog({
    level: "WARN",
    event: "DLQ_PURGED",
    message: `Dead-Letter Queue purged (${removedCount} jobs discarded)`,
    tenantId: "default",
    details: { removedCount },
  });

  res.status(200).json({
    status: "success",
    message: `Successfully purged ${removedCount} jobs from DLQ.`,
    data: { removedCount },
  });
});
