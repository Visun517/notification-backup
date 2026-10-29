const mongoose = require("mongoose");

const SystemSettingsSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      default: "default",
      unique: true,
      index: true,
    },
    // Master channel switches
    channels: {
      inApp: {
        type: Boolean,
        default: true,
      },
      push: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: false,
      },
      sms: {
        type: Boolean,
        default: false,
      },
    },
    // BullMQ & Dispatch Queue settings
    queue: {
      maxRetries: {
        type: Number,
        default: 3,
        min: 0,
        max: 10,
      },
      backoffDelayMs: {
        type: Number,
        default: 2000,
        min: 500,
        max: 60000,
      },
      concurrency: {
        type: Number,
        default: 5,
        min: 1,
        max: 50,
      },
      dlqRetentionHours: {
        type: Number,
        default: 72,
        min: 1,
        max: 720,
      },
    },
    // Auto-cleanup & retention limits
    retention: {
      logRetentionDays: {
        type: Number,
        default: 30,
        min: 1,
        max: 365,
      },
      notificationRetentionDays: {
        type: Number,
        default: 60,
        min: 1,
        max: 365,
      },
    },
    // Rate Limiting & security thresholds
    rateLimits: {
      requestsPerMinute: {
        type: Number,
        default: 120,
        min: 10,
        max: 5000,
      },
      burstLimit: {
        type: Number,
        default: 30,
        min: 5,
        max: 500,
      },
    },
    // Provider configurations & API credentials
    providers: {
      fcm: {
        projectId: {
          type: String,
          default: "notification-engine-7443d",
        },
        serviceAccountKey: {
          type: String,
          default: "••••••••••••••••••••••••••••••••",
        },
      },
      smtp: {
        host: {
          type: String,
          default: "smtp.mailgun.org",
        },
        port: {
          type: Number,
          default: 587,
        },
        user: {
          type: String,
          default: "postmaster@notification-engine.io",
        },
        password: {
          type: String,
          default: "••••••••••••••••",
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Singleton helper: ensure default document exists and returns it
SystemSettingsSchema.statics.getOrCreateDefault = async function (tenantId = "default") {
  let settings = await this.findOne({ tenantId });
  if (!settings) {
    settings = await this.create({ tenantId });
  }
  return settings;
};

module.exports = mongoose.model("SystemSettings", SystemSettingsSchema);
