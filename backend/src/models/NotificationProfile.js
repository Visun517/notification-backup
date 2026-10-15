const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * NotificationProfile Model.
 *
 * Decoupled registry that the Notification Engine maintains independently
 * of the host application's User model. Each record is keyed by the external
 * app's userId (string) so any auth system (UUID, ObjectId, clerk, etc.) works.
 *
 * Stores:
 *  - Device tokens (array, deduplicated) for PUSH delivery via FCM
 *  - Per-channel delivery preferences for channel pre-filtering
 */
const notificationProfileSchema = new Schema(
  {
    // External user identifier — the host app's primary key (any string format)
    userId: {
      type: String,
      required: [true, "userId is required"],
      trim: true,
      index: true,
    },

    // Tenant partitioning — keeps profiles isolated across organisations
    tenantId: {
      type: String,
      default: "default",
      trim: true,
      index: true,
    },

    // Array of FCM device tokens registered for this user.
    // $addToSet prevents duplicates at the DB level.
    fcmTokens: {
      type: [String],
      default: [],
    },

    // Per-channel opt-in preferences.
    // The NotificationService reads these to skip unwanted channels before queuing.
    preferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      in_app: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique index — one profile per user per tenant
notificationProfileSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("NotificationProfile", notificationProfileSchema);
