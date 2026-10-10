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

    // The ID of the user who read the notification
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isDeleted: {
      type: Boolean,  
      default: false,
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

