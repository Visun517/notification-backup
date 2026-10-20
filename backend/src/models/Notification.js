const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  NOTIFICATION_SCOPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
} = require("../constants/notificationConstants");

const notificationSchema = new Schema(
  {
    // Multi-Tenancy Partitioning
    tenantId: {
      type: String,
      default: "default",
      trim: true,
      index: true,
    },

    // 1. Target Audience & Scope
    scope: {
      type: String,
      enum: Object.values(NOTIFICATION_SCOPES),
      default: NOTIFICATION_SCOPES.UNICAST,
      required: [true, "Notification scope is required"],
    },

    // recipientId is required for private notifications (UNICAST).
    // Stored as String to support any external auth system (UUID, ObjectId, Clerk, etc.)
    recipientId: {
      type: String,
      required: function () {
        return this.scope === NOTIFICATION_SCOPES.UNICAST;
      },
      index: true,
    },

    // Dynamic targeting tags for multicast/segmentation (e.g., ["role:driver", "tier:gold", "region:balangoda"])
    tags: {
      type: [String],
      default: [],
      index: true,
    },

    // Standardized delivery channels to dispatch through
    channels: {
      type: [String],
      enum: Object.values(NOTIFICATION_CHANNELS),
      default: [NOTIFICATION_CHANNELS.IN_APP],
    },

    // @deprecated — use tags instead (e.g. ["role:admin", "role:driver"]).
    // Kept for backward compatibility with older payloads.
    // The pre-save hook auto-migrates this into a "role:<value>" tag.
    recipientRole: {
      type: String,
      trim: true,
    },

    // Optional sender tracking (string userId, not an ObjectId ref)
    senderId: { type: String },

    // 2. Content
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true },

    // Generic categorization without restrictive domain enums
    category: {
      type: String,
      trim: true,
      default: "GENERAL",
    },

    priority: {
      type: String,
      enum: Object.values(NOTIFICATION_PRIORITIES),
      default: NOTIFICATION_PRIORITIES.NORMAL,
    },

    status: {
      type: String,
      enum: Object.values(NOTIFICATION_STATUSES),
      default: NOTIFICATION_STATUSES.QUEUED,
    },

    // @deprecated — use notification.tags for audience segmentation instead.
    // e.g. tags: ["region:colombo", "district:gampaha"] replaces these fields.
    // Kept for backward compatibility only.
    region:   { type: String, trim: true },
    district: { type: String, trim: true },

    // Optional GeoJSON point — kept for spatial indexing if needed by host app.
    // The engine itself no longer reads this field.
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number] }, // [longitude, latitude]
    },

    // 4. Flexible Metadata & Actions
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    actionUrl: { type: String, default: "" },
    actionData: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Read status for UNICAST messages
    isRead: { type: Boolean, default: false },

    // Device token tracking for direct push overrides
    fcmToken: { type: String, default: null },

    // TTL for automatic document eviction
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

// --- INDEXES ---

// 1. Geospatial index
notificationSchema.index({ location: "2dsphere" }, { sparse: true });

// 2. Multi-tenant compound query indexes for feed loading & filtering
notificationSchema.index({ tenantId: 1, recipientId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, tags: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, scope: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, status: 1 });
notificationSchema.index({ tenantId: 1, channels: 1 });

// Query indexes for feed loading (backward compatibility)
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ tags: 1, createdAt: -1 });
notificationSchema.index({ scope: 1, createdAt: -1 });
notificationSchema.index({ channels: 1 });

// 3. TTL index
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// --- PRE-SAVE HOOK ---
notificationSchema.pre("save", async function () {
  try {
    // Auto-sync legacy recipientRole into tags
    if (this.recipientRole && !this.tags.includes(`role:${this.recipientRole}`)) {
      this.tags.push(`role:${this.recipientRole}`);
    }

    // Default channels to IN_APP if empty
    if (!this.channels || this.channels.length === 0) {
      this.channels = [NOTIFICATION_CHANNELS.IN_APP];
    }

    // NOTE: We intentionally do NOT validate NotificationProfile existence here.
    // Early-lifecycle notifications (Welcome, OTP, password reset) are sent before
    // a user registers an FCM token. The worker handles missing-profile cases
    // gracefully: it skips PUSH delivery and logs a warning instead of crashing.

    // Clean up empty or invalid coordinates
    if (this.location) {
      if (
        !this.location.coordinates ||
        this.location.coordinates.length < 2 ||
        this.location.coordinates.some((c) => c === null || c === undefined)
      ) {
        this.location = undefined;
      }
    }
  } catch (error) {
    throw error;
  }
});

module.exports = mongoose.model("Notification", notificationSchema);
