const mongoose = require("mongoose");
const redisHelper = require("../config/redisClient");
const { notificationQueue, deadLetterQueue } = require("../queues/notificationQueue");
const { notificationWorker } = require("../workers/notificationWorker");
const { telemetry } = require("./telemetry");

/**
 * Health check utility for Notification Engine.
 * Verifies Redis, MongoDB, and Worker pool connectivity and latency.
 *
 * @returns {Promise<Object>} Detailed health check report
 */
async function getHealthStatus() {
  const startTime = Date.now();
  const checks = {
    mongodb: { status: "DOWN", latencyMs: null },
    redis: { status: "DOWN", latencyMs: null },
    worker: { status: "DOWN", concurrency: 0 },
    queues: {
      dispatchQueue: { status: "UNKNOWN", waiting: 0, active: 0 },
      dlq: { status: "UNKNOWN", count: 0 },
    },
  };

  // 1. MongoDB Check
  try {
    const mongoState = mongoose.connection.readyState;
    if (mongoState === 1) {
      const mongoPingStart = Date.now();
      if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
      }
      checks.mongodb = {
        status: "UP",
        latencyMs: Date.now() - mongoPingStart,
      };
    } else {
      checks.mongodb = {
        status: mongoState === 2 ? "CONNECTING" : "DOWN",
        latencyMs: null,
      };
    }
  } catch (mongoErr) {
    checks.mongodb = {
      status: "DOWN",
      error: mongoErr.message,
    };
  }

  // 2. Redis Check
  try {
    const redisPingStart = Date.now();
    const isConnected = redisHelper.isRedisConnected();
    if (isConnected) {
      // Test read/write with ping
      await redisHelper.safeSet("health:ping", "pong", 10);
      const pingVal = await redisHelper.safeGet("health:ping");
      if (pingVal === "pong") {
        checks.redis = {
          status: "UP",
          latencyMs: Date.now() - redisPingStart,
        };
      } else {
        checks.redis = { status: "DEGRADED", latencyMs: Date.now() - redisPingStart };
      }
    } else {
      checks.redis = { status: "DOWN", latencyMs: null };
    }
  } catch (redisErr) {
    checks.redis = { status: "DOWN", error: redisErr.message };
  }

  // 3. Worker Pool Check
  try {
    const workerInstance = require("../workers/notificationWorker").notificationWorker || notificationWorker;
    if (workerInstance) {
      checks.worker = {
        status: workerInstance.isRunning() ? "UP" : "PAUSED",
        concurrency: workerInstance.opts?.concurrency || 5,
      };
    } else {
      checks.worker = {
        status: "INITIALIZING",
        concurrency: 5,
      };
    }
  } catch (workerErr) {
    checks.worker = { status: "ERROR", error: workerErr.message };
  }

  // 4. Queues Check
  try {
    if (notificationQueue && redisHelper.isRedisConnected()) {
      const [waiting, active] = await Promise.all([
        notificationQueue.getWaitingCount().catch(() => 0),
        notificationQueue.getActiveCount().catch(() => 0),
      ]);
      checks.queues.dispatchQueue = { status: "UP", waiting, active };
    } else {
      checks.queues.dispatchQueue = { status: "DISCONNECTED", waiting: 0, active: 0 };
    }

    if (deadLetterQueue && redisHelper.isRedisConnected()) {
      const dlqCount = await deadLetterQueue.getJobCounts().catch(() => ({ failed: 0 }));
      checks.queues.dlq = { status: "UP", count: dlqCount.failed || 0 };
    } else {
      checks.queues.dlq = { status: "DISCONNECTED", count: 0 };
    }
  } catch (queueErr) {
    checks.queues.dispatchQueue = { status: "ERROR", error: queueErr.message };
  }

  // Determine Overall Status
  let overallStatus = "HEALTHY";
  if (checks.mongodb.status !== "UP") {
    overallStatus = "UNHEALTHY";
  } else if (checks.redis.status !== "UP" || checks.worker.status === "DOWN") {
    overallStatus = "DEGRADED";
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    durationMs: Date.now() - startTime,
    services: checks,
    metricsSummary: telemetry.getMetricsSummary(),
  };
}

module.exports = {
  getHealthStatus,
};
