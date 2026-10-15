/**
 * Enterprise Notification Engine - Standalone SDK Package Entry Point
 * Exposes public initialization facade, strategy pattern providers, queue helpers, and models.
 */

const {
  NotificationEngine,
  NotificationEngineFacade,
  initializeNotificationEngine,
} = require("./NotificationEngineFacade");

const { sendNotification } = require("./services/NotificationService");
const IChannelProvider = require("./providers/IChannelProvider");
const SocketChannelProvider = require("./providers/SocketChannelProvider");
const FcmChannelProvider = require("./providers/FcmChannelProvider");
const { ChannelRegistry, channelRegistry } = require("./registry/ChannelRegistry");
const { templateEngine, TemplateEngine } = require("./utils/TemplateEngine");
const { telemetry, TelemetryService } = require("./utils/telemetry");
const { getHealthStatus } = require("./utils/healthCheck");
const { rateLimiter, RateLimiter, checkRateLimit } = require("./utils/rateLimiter");
const { notificationQueue, deadLetterQueue, enqueueNotification } = require("./queues/notificationQueue");
const { startNotificationWorker, stopNotificationWorker } = require("./workers/notificationWorker");
const Notification = require("./models/Notification");
const NotificationReadStatus = require("./models/NotificationReadStatus");
const NotificationProfile = require("./models/NotificationProfile");
const notificationRoutes = require("./routes/notificationRoutes");
const {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_SCOPES,
  NOTIFICATION_STATUSES,
} = require("./constants/notificationConstants");

module.exports = {
  // Main SDK Facade & Factory
  initializeNotificationEngine,
  NotificationEngine,
  NotificationEngineFacade,

  // Core Service API
  sendNotification,

  // Channel Providers & Strategy Registry
  IChannelProvider,
  SocketChannelProvider,
  FcmChannelProvider,
  ChannelRegistry,
  channelRegistry,

  // Utilities & Telemetry
  templateEngine,
  TemplateEngine,
  telemetry,
  TelemetryService,
  getHealthStatus,
  rateLimiter,
  RateLimiter,
  checkRateLimit,

  // BullMQ Queues & Worker Management
  notificationQueue,
  deadLetterQueue,
  enqueueNotification,
  startNotificationWorker,
  stopNotificationWorker,

  // Mongoose Models
  Notification,
  NotificationReadStatus,
  NotificationProfile,

  // Constants
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_SCOPES,
  NOTIFICATION_STATUSES,

  // Express Routes
  notificationRoutes,
};
