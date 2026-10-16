const IChannelProvider = require("./IChannelProvider");
const { NOTIFICATION_CHANNELS } = require("../constants/notificationConstants");
const logger = require("../utils/logger");

/**
 * SocketChannelProvider — Concrete Strategy for IN_APP / Real-time delivery.
 *
 * Delivers real-time notifications via Socket.io rooms. Routing is
 * 100% domain-agnostic and mirrors socketDelivery.js exactly:
 *
 *   UNICAST   → private room  "user_<recipientId>"
 *   MULTICAST → one "tag:<name>" room per tag in notification.tags
 *   BROADCAST → io.emit() to every connected socket
 *
 * No geography, roles, regions, or districts anywhere in this file.
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
   * Delivers the notification to the appropriate Socket.io room(s).
   *
   * @param {Object} payload        - Notification document/payload
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

    const { _id, scope, recipientId, tags = [] } = payload;

    try {
      switch (scope) {
        // -----------------------------------------------------------------
        // UNICAST — private message to one specific user
        // -----------------------------------------------------------------
        case "UNICAST": {
          const room = `user_${recipientId}`;
          logger.info(`🔌 [SocketChannelProvider] UNICAST → Room "${room}" (Notif ${_id})`);
          io.to(room).emit("new_notification", payload);
          return { channel: this.channelName, success: true, targetRooms: [room] };
        }

        // -----------------------------------------------------------------
        // MULTICAST — fan-out to every "tag:<name>" room in notification.tags
        // -----------------------------------------------------------------
        case "MULTICAST": {
          if (!tags.length) {
            logger.warn(
              `⚠️ [SocketChannelProvider] MULTICAST Notif ${_id} has no tags — no rooms targeted.`,
            );
            return {
              channel: this.channelName,
              success: false,
              error: "No tags provided for MULTICAST delivery",
            };
          }

          const rooms = tags.map((tag) => `tag:${tag}`);
          rooms.forEach((room) => {
            logger.info(`🔌 [SocketChannelProvider] MULTICAST → Room "${room}" (Notif ${_id})`);
            io.to(room).emit("new_notification", payload);
          });

          return { channel: this.channelName, success: true, targetRooms: rooms };
        }

        // -----------------------------------------------------------------
        // BROADCAST — emit to every connected socket
        // -----------------------------------------------------------------
        case "BROADCAST": {
          logger.info(`📢 [SocketChannelProvider] BROADCAST → all connected clients (Notif ${_id})`);
          io.emit("new_notification", payload);
          return { channel: this.channelName, success: true, targetRooms: ["*"] };
        }

        default:
          logger.warn(`⚠️ [SocketChannelProvider] Unknown scope "${scope}" for Notif ${_id}.`);
          return {
            channel: this.channelName,
            success: false,
            error: `Unknown notification scope: ${scope}`,
          };
      }
    } catch (error) {
      logger.error(`❌ [SocketChannelProvider] Delivery failure for Notif ${_id}: ${error.message}`);
      return { channel: this.channelName, success: false, error: error.message };
    }
  }
}

module.exports = SocketChannelProvider;
