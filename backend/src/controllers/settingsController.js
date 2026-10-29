const SystemSettings = require("../models/SystemSettings");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");
const { emitLiveLog } = require("../utils/adminLogEmitter");

/**
 * GET /api/notifications/settings
 * Retrieves singleton system settings for current tenant.
 * Auto-creates default configuration if none exists.
 */
exports.getSettings = catchAsync(async (req, res, next) => {
  const tenantId = req.user?.tenantId || req.query.tenantId || "default";

  let settings = await SystemSettings.findOne({ tenantId });
  if (!settings) {
    settings = await SystemSettings.create({ tenantId });
    logger.info(`Initialized default SystemSettings for tenant: ${tenantId}`);
  }

  res.status(200).json({
    status: "success",
    data: {
      settings,
    },
  });
});

/**
 * PUT /api/notifications/settings
 * Updates global system configuration for current tenant.
 */
exports.updateSettings = catchAsync(async (req, res, next) => {
  const tenantId = req.user?.tenantId || req.body.tenantId || "default";

  const {
    channels,
    queue,
    retention,
    rateLimits,
    providers,
  } = req.body;

  let settings = await SystemSettings.findOne({ tenantId });
  if (!settings) {
    settings = new SystemSettings({ tenantId });
  }

  // Deep update fields if provided
  if (channels) {
    settings.channels = {
      ...settings.channels.toObject(),
      ...channels,
    };
  }

  if (queue) {
    settings.queue = {
      ...settings.queue.toObject(),
      ...queue,
    };
  }

  if (retention) {
    settings.retention = {
      ...settings.retention.toObject(),
      ...retention,
    };
  }

  if (rateLimits) {
    settings.rateLimits = {
      ...settings.rateLimits.toObject(),
      ...rateLimits,
    };
  }

  if (providers) {
    // Preserve masked credentials if incoming payload has asterisks
    const currentProviders = settings.providers?.toObject() || {};
    const updatedProviders = { ...currentProviders, ...providers };

    if (providers.fcm) {
      updatedProviders.fcm = {
        ...currentProviders.fcm,
        ...providers.fcm,
      };
      if (providers.fcm.serviceAccountKey && providers.fcm.serviceAccountKey.includes("••••")) {
        updatedProviders.fcm.serviceAccountKey = currentProviders.fcm?.serviceAccountKey || "••••••••••••••••••••••••••••••••";
      }
    }

    if (providers.smtp) {
      updatedProviders.smtp = {
        ...currentProviders.smtp,
        ...providers.smtp,
      };
      if (providers.smtp.password && providers.smtp.password.includes("••••")) {
        updatedProviders.smtp.password = currentProviders.smtp?.password || "••••••••••••••••";
      }
    }

    settings.providers = updatedProviders;
  }

  await settings.save();

  logger.info(`SystemSettings updated for tenant: ${tenantId}`);

  // Emit real-time log event to Admin live stream
  emitLiveLog({
    level: "INFO",
    event: "SETTINGS_UPDATED",
    message: "Global system configuration updated by admin",
    tenantId,
    details: {
      activeChannels: Object.keys(settings.channels.toObject()).filter(
        (k) => settings.channels[k] === true
      ),
      queueRetries: settings.queue?.maxRetries,
      rateLimitRpm: settings.rateLimits?.requestsPerMinute,
    },
  });

  res.status(200).json({
    status: "success",
    message: "System configuration saved successfully",
    data: {
      settings,
    },
  });
});
