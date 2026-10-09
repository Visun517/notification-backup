const IChannelProvider = require("./IChannelProvider");
const { NOTIFICATION_CHANNELS } = require("../constants/notificationConstants");
const logger = require("../utils/logger");

/**
 * SocketChannelProvider (Concrete Strategy for IN_APP / Real-time WebSockets).
 * Delivers real-time notifications via Socket.io rooms and broadcasts.
 */
class SocketChannelProvider extends IChannelProvider {
  /**
   * @param {Object} [io] - Socket.io Server instance
   */
  constructor(io = null) {
    super(NOTIFICATION_CHANNELS.IN_APP);
    this.io = io;
  }

  /**
   * Dynamically sets or updates the Socket.io server instance.
   * @param {Object} io
   */
  setIo(io) {
    this.io = io;
  }

  /**
   * Validates if Socket.io server instance is available.
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.io;
  }

  /**
   * Delivers the notification to target user rooms or broadcast stream.
   *
   * @param {Object} payload - Notification document/payload
   * @param {Object} [recipientMeta] - Context containing optional { io } override
   * @returns {Promise<{ channel: string, success: boolean, targetRooms?: string[], error?: string }>}
   */
  async send(payload, recipientMeta = {}) {
    const io = recipientMeta.io || this.io;

    if (!io) {
      logger.warn("⚠️ [SocketChannelProvider] Delivery skipped: Socket.io instance not available.");
      return {
        channel: this.channelName,
        success: false,
        error: "Socket.io instance not initialized",
      };
    }

    const {
      _id,
      scope,
      recipientId,
      recipientRole,
      region,
      district,
      tags = [],
    } = payload;

    try {
      // 1. UNICAST: Private room for single recipient
      if (scope === "UNICAST") {
        const targetRoom = `user_${recipientId}`;
        logger.info(`🔌 [SocketChannelProvider] Emitting notification ${_id} to Room: ${targetRoom}`);
        io.to(targetRoom).emit("new_notification", payload);
        return {
          channel: this.channelName,
          success: true,
          targetRooms: [targetRoom],
        };
      }

      // 2. BROADCAST: Public alert to all connected sockets
      if (scope === "BROADCAST") {
        logger.info(`📢 [SocketChannelProvider] Broadcasting notification ${_id} to ALL clients`);
        io.emit("new_notification", payload);
        return {
          channel: this.channelName,
          success: true,
          targetRooms: ["*"],
        };
      }

      // 3. MULTICAST: Dynamic tag-based routing + legacy regional/role fallback
      const targetRooms = new Set();

      // Dynamic tag-based rooms (e.g. "role:driver" -> "tag_role:driver")
      if (Array.isArray(tags)) {
        tags.forEach((tag) => {
          if (tag) {
            targetRooms.add(`tag_${tag}`);
            // Also add role-specific room if tag is role:<role>
            if (tag.startsWith("role:")) {
              targetRooms.add(`role_${tag.split(":")[1]}`);
            }
          }
        });
      }

      // Legacy regional room compatibility
      if (region && (!recipientRole || recipientRole === "ALL")) {
        targetRooms.add(`region_${region}`);
      } else if (district && (!recipientRole || recipientRole === "ALL")) {
        targetRooms.add(`district_${district}`);
      } else if (recipientRole && region) {
        targetRooms.add(`region_${region}_role_${recipientRole}`);
      } else if (recipientRole && district) {
        targetRooms.add(`district_${district}_role_${recipientRole}`);
      } else if (recipientRole) {
        targetRooms.add(`role_${recipientRole}`);
      }

      if (targetRooms.size === 0) {
        logger.warn(`⚠️ [SocketChannelProvider] Target room NOT FOUND for notification ${_id}`);
        return {
          channel: this.channelName,
          success: false,
          error: "No matching target rooms resolved",
        };
      }

      // Emit to all matching target rooms
      const resolvedRooms = Array.from(targetRooms);
      resolvedRooms.forEach((room) => {
        logger.info(`🔌 [SocketChannelProvider] Emitting notification ${_id} to Room: ${room}`);
        io.to(room).emit("new_notification", payload);
      });

      return {
        channel: this.channelName,
        success: true,
        targetRooms: resolvedRooms,
      };
    } catch (error) {
      logger.error(`❌ [SocketChannelProvider] Delivery failure: ${error.message}`);
      return {
        channel: this.channelName,
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = SocketChannelProvider;
