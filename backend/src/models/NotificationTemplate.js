const mongoose = require("mongoose");
const { Schema } = mongoose;
const { NOTIFICATION_CHANNELS } = require("../constants/notificationConstants");

/**
 * NotificationTemplate Model.
 * Stores reusable notification message layouts with Handlebars variable placeholders.
 */
const notificationTemplateSchema = new Schema(
  {
    // Unique human-readable name of the template per tenant (e.g. "order_shipped_v2", "emergency_alert")
    name: {
      type: String,
      required: [true, "Template name is required"],
      trim: true,
      maxlength: [100, "Template name cannot exceed 100 characters"],
    },

    // Categorization (e.g., SYSTEM, ALERT, PAYMENT, BOOKING, MARKETING, GENERAL)
    category: {
      type: String,
      trim: true,
      uppercase: true,
      default: "GENERAL",
    },

    // Channels enabled for this template
    channels: {
      type: [String],
      enum: Object.values(NOTIFICATION_CHANNELS),
      default: [NOTIFICATION_CHANNELS.IN_APP],
    },

    // Subject / Title template with optional dynamic variables
    subject: {
      type: String,
      required: [true, "Template subject/title is required"],
      trim: true,
      maxlength: [200, "Template subject cannot exceed 200 characters"],
    },

    // Body content with Handlebars placeholders (e.g. "Hello {{userName}}, your code is {{code}}")
    body: {
      type: String,
      required: [true, "Template body is required"],
      trim: true,
    },

    // Optional short description or admin usage notes
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Description cannot exceed 300 characters"],
      default: "",
    },

    // Mock/Sample variable values for previewing and testing
    sampleData: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Tenant partitioning
    tenantId: {
      type: String,
      default: "default",
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring template names are unique within each tenant
notificationTemplateSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("NotificationTemplate", notificationTemplateSchema);
