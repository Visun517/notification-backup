const mongoose = require("mongoose");

/**
 * NotificationReadStatus Model
 *
 * Description:
 * This model tracks which users have read public messages (MULTICAST or BROADCAST).
 * Instead of saving thousands of user IDs inside a single Notification document,
 * we save individual records here. This keeps the database extremely fast and scalable.
 */
const readStatusSchema = new mongoose.Schema(
  {
    // Multi-Tenancy Partitioning
    tenantId: {
      type: String,
      default: "default",
      trim: true,
      index: true,
    },

    // The ID of the public notification that was read
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
    },

    // External user identity string — intentionally plain String to match
    // Notification.recipientId and NotificationProfile.userId.
    // Supports any auth system (MongoDB ObjectId, UUID, Clerk ID, Auth0 sub, etc.)
    // DO NOT change to ObjectId — the $expr pipeline comparison would silently fail.
    userId: {
      type: String,
      required: true,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Populated only when isDeleted is set via clearAllNotifications
    deletedAt: {
      type: Date,
      default: null,
    },

    // The exact time the user opened/read the message
    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // We don't need 'createdAt' and 'updatedAt' since 'readAt' does the job
    timestamps: false,
  },
);

// --- INDEXES (For Performance & Data Integrity) ---

/**
 * 1. Compound Unique Index partitioned by tenant
 */
readStatusSchema.index({ tenantId: 1, userId: 1, notificationId: 1 }, { unique: true });
readStatusSchema.index({ userId: 1, notificationId: 1 });

/**
 * 2. Notification ID Index
 */
readStatusSchema.index({ tenantId: 1, notificationId: 1 });
readStatusSchema.index({ notificationId: 1 });

module.exports = mongoose.model("NotificationReadStatus", readStatusSchema);

