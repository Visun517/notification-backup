const Notification = require("../models/Notification");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");
const { templateEngine } = require("../utils/TemplateEngine");
const { channelRegistry } = require("../registry/ChannelRegistry");
const { NOTIFICATION_CHANNELS } = require("../constants/notificationConstants");

/**
 * Enterprise Notification Service.
 * Orchestrates template rendering, persistence, and multi-channel dispatching
 * via decoupled channel providers registered in the ChannelRegistry.
 *
 * Supports both modern decoupled signature:
 *   sendNotification(data, options)
 * And backward-compatible signature:
 *   sendNotification(io, data)
 *
 * @param {Object} arg1 - Notification payload or legacy Socket.io instance
 * @param {Object} [arg2={}] - Options or legacy notification payload
 * @returns {Promise<Object>} The persisted Notification document
 */
const sendNotification = async (arg1, arg2 = {}) => {
  try {
    // 1. Handle flexible signatures for backward compatibility
    const isLegacyCall = arg1 && (typeof arg1.emit === "function" || typeof arg1.to === "function");
    const io = isLegacyCall ? arg1 : (arg2.io || null);
    const data = isLegacyCall ? arg2 : arg1;
    const options = isLegacyCall ? {} : arg2;

    if (!data || typeof data !== "object") {
      throw new AppError("Notification payload is required", 400);
    }

    // Ensure SocketChannelProvider has io if provided
    if (io) {
      const socketProvider = channelRegistry.getProvider(NOTIFICATION_CHANNELS.IN_APP);
      if (socketProvider && typeof socketProvider.setIo === "function") {
        socketProvider.setIo(io);
      }
    }

    // 2. Compile message templates (e.g. "Hello {{name}}") using TemplateEngine
    const renderedContent = templateEngine.renderNotification(data, options.templateContext || {});
    const processedData = {
      ...data,
      title: renderedContent.title || data.title,
      message: renderedContent.message || data.message,
    };

    // 3. Persist notification to database
    const newNotification = await Notification.create(processedData);
    logger.info(`💾 Notification saved to DB: ${newNotification._id}`);

    // 4. Resolve target delivery channels
    const channels = Array.isArray(newNotification.channels) && newNotification.channels.length > 0
      ? newNotification.channels
      : [NOTIFICATION_CHANNELS.IN_APP];

    // 5. Dispatch to registered channel providers via ChannelRegistry
    const registry = options.registry || channelRegistry;
    const dispatchPromises = [];

    const plainPayload = newNotification.toObject ? newNotification.toObject() : newNotification;
    const recipientMeta = {
      io,
      ...options.recipientMeta,
    };

    for (const channel of channels) {
      const provider = registry.getProvider(channel);

      if (!provider) {
        logger.warn(`⚠️ [NotificationService] No provider registered for channel '${channel}'. Skipping.`);
        continue;
      }

      if (!provider.isConfigured()) {
        logger.warn(`⚠️ [NotificationService] Provider for channel '${channel}' is not configured. Skipping.`);
        continue;
      }

      dispatchPromises.push(provider.send(plainPayload, recipientMeta));
    }

    // 6. Execute multi-channel delivery concurrently
    const results = await Promise.allSettled(dispatchPromises);

    const summaryParts = results.map((res) => {
      if (res.status === "fulfilled") {
        const val = res.value;
        return `${val.channel || "CHANNEL"}=${val.success ? "✅" : "❌"}`;
      }
      return "CHANNEL=❌";
    });

    logger.info(
      `📢 Dispatch Summary for ${newNotification._id}: ${summaryParts.join(", ") || "None"}`,
    );

    return newNotification;
  } catch (error) {
    logger.error(`Notification Engine Failure: ${error.message}`);
    if (error.isOperational) throw error;
    throw new AppError(`Notification processing failed: ${error.message}`, 500);
  }
};

module.exports = { sendNotification };
