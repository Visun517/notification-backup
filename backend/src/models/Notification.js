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
    // 1. Target Audience & Scope
    scope: {
      type: String,
      enum: Object.values(NOTIFICATION_SCOPES),
      default: NOTIFICATION_SCOPES.UNICAST,
      required: [true, "Notification scope is required"],
    },

    // recipientId is required for private notifications (UNICAST)
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.scope === NOTIFICATION_SCOPES.UNICAST;
      },
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

    // Legacy role support (auto-migrated into tags on save)
    recipientRole: {
      type: String,
      trim: true,
    },

    // Optional sender tracking
    senderId: { type: Schema.Types.ObjectId, ref: "User" },

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
      default: NOTIFICATION_STATUSES.PENDING,
    },

    // 3. Location Data (Spatial targeting)
    region: { type: String, trim: true },
    district: { type: String, trim: true },
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

// 2. Query indexes for feed loading
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

    // Validate recipient existence for UNICAST
    if (
      this.scope === NOTIFICATION_SCOPES.UNICAST &&
      this.isModified("recipientId") &&
      this.recipientId
    ) {
      const User = mongoose.models.User || mongoose.model("User");
      const userExists = await User.exists({ _id: this.recipientId });
      if (!userExists) {
        throw new Error(`Recipient User with ID ${this.recipientId} does not exist.`);
      }
    }

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
