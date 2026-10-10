const mongoose = require("mongoose");
const { channelRegistry } = require("./registry/ChannelRegistry");
const SocketChannelProvider = require("./providers/SocketChannelProvider");
const FcmChannelProvider = require("./providers/FcmChannelProvider");
const IChannelProvider = require("./providers/IChannelProvider");
const { sendNotification } = require("./services/NotificationService");
const { startNotificationWorker, stopNotificationWorker } = require("./workers/notificationWorker");
const { notificationQueue, deadLetterQueue } = require("./queues/notificationQueue");
const { getHealthStatus } = require("./utils/healthCheck");
const { telemetry } = require("./utils/telemetry");
const { rateLimiter } = require("./utils/rateLimiter");
const { initRedis, redisClient } = require("./config/redisClient");
const Notification = require("./models/Notification");
const NotificationReadStatus = require("./models/NotificationReadStatus");
const notificationRoutes = require("./routes/notificationRoutes");
const logger = require("./utils/logger");

/**
 * Enterprise Notification Engine Facade.
 * Unified public SDK interface encapsulating channels, queues, workers, telemetry, and persistence.
 */
class NotificationEngine {
  constructor(config = {}) {
    this.config = {
      tenantId: "default",
      defaultChannels: ["IN_APP"],
      startWorker: true,
      workerConcurrency: 5,
      ...config,
    };
    this.initialized = false;
    this.io = config.io || null;
    this.registry = channelRegistry;
  }

  /**
   * Initializes the engine: establishes Redis/DB connections, registers providers, and starts workers.
   */
  async initialize() {
    if (this.initialized) return this;

    logger.info("Initializing Enterprise Notification Engine SDK...");

    // 1. Initialize Redis connection if configured
    if (this.config.redisUrl) {
      process.env.REDIS_URL = this.config.redisUrl;
    }
    try {
      await initRedis();
    } catch (err) {
      logger.warn(`Redis connection initialization warning: ${err.message}`);
    }

    // 2. Initialize MongoDB connection if URI provided and not already connected
    if (this.config.mongoUri && mongoose.connection.readyState === 0) {
      await mongoose.connect(this.config.mongoUri);
      logger.info("Database connected successfully via Notification Engine configuration.");
    }

    // 3. Register default channel providers
    if (this.io) {
      this.registry.registerProvider(new SocketChannelProvider(this.io));
    }
    this.registry.registerProvider(new FcmChannelProvider());

    // Register any custom providers passed in config
    if (Array.isArray(this.config.providers)) {
      for (const provider of this.config.providers) {
        this.registry.registerProvider(provider);
      }
    }

    // 4. Start BullMQ background worker if requested
    if (this.config.startWorker !== false) {
      startNotificationWorker();
    }

    this.initialized = true;
    logger.info("Enterprise Notification Engine SDK initialized successfully.");
    return this;
  }

  /**
   * Dispatches a notification asynchronously via the BullMQ pipeline.
   *
   * @param {Object} payload - Notification data
   * @param {Object} [options={}] - Options (tenantId, templateContext, recipientMeta)
   * @returns {Promise<Object>} Enqueued notification document acknowledgment
   */
  async sendNotification(payload, options = {}) {
    const tenantId = payload.tenantId || options.tenantId || this.config.tenantId || "default";
    return await sendNotification(payload, {
      io: this.io,
      tenantId,
      ...options,
    });
  }

  /**
   * Register a custom channel delivery provider.
   */
  registerChannelProvider(provider) {
    this.registry.registerProvider(provider);
    return this;
  }

  /**
   * Attach or update Socket.io instance.
   */
  setIo(ioInstance) {
    this.io = ioInstance;
    const socketProvider = this.registry.getProvider("IN_APP");
    if (socketProvider && typeof socketProvider.setIo === "function") {
      socketProvider.setIo(ioInstance);
    }
  }

  /**
   * Retrieves comprehensive health status.
   */
  async getHealthStatus() {
    return await getHealthStatus();
  }

  /**
   * Retrieves Prometheus text or structured JSON metrics.
   */
  getMetrics(format = "prometheus") {
    if (format === "json") {
      return telemetry.getMetricsSummary();
    }
    return telemetry.getPrometheusMetrics();
  }

  /**
   * Returns Express router for HTTP routes.
   */
  getRouter() {
    return notificationRoutes;
  }

  /**
   * Graceful shutdown of queues, workers, and connections.
   */
  async shutdown() {
    logger.info("Shutting down Notification Engine SDK...");
    await stopNotificationWorker();
    if (notificationQueue) await notificationQueue.close().catch(() => {});
    if (deadLetterQueue) await deadLetterQueue.close().catch(() => {});
    this.initialized = false;
    logger.info("Notification Engine SDK shutdown complete.");
  }
}

/**
 * SDK factory function to instantiate and initialize the Notification Engine.
 *
 * @param {Object} [config={}] - Configuration options
 * @returns {Promise<NotificationEngine>} Initialized engine instance
 */
async function initializeNotificationEngine(config = {}) {
  const engine = new NotificationEngine(config);
  return await engine.initialize();
}

module.exports = {
  NotificationEngine,
  NotificationEngineFacade: NotificationEngine,
  initializeNotificationEngine,
};
