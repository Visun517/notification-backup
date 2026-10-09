const IChannelProvider = require("./IChannelProvider");
const { NOTIFICATION_CHANNELS } = require("../constants/notificationConstants");
const sendPush = require("../utils/pushNotificationHelper");
const User = require("../models/User");
const logger = require("../utils/logger");

const sanitizeTopic = (name) =>
  name ? name.replace(/[^a-zA-Z0-9-_.~%]/g, "") : "";

/**
 * FcmChannelProvider (Concrete Strategy for PUSH notifications).
 * Delivers mobile push notifications via Firebase Cloud Messaging (FCM).
 */
class FcmChannelProvider extends IChannelProvider {
  constructor() {
    super(NOTIFICATION_CHANNELS.PUSH);
  }

  isConfigured() {
    return true;
  }

  /**
   * Delivers the notification to target user device token or topic.
   *
   * @param {Object} payload - Notification document/payload
   * @param {Object} [recipientMeta] - Optional contextual data (fcmToken override, etc.)
   * @returns {Promise<{ channel: string, success: boolean, messageId?: string, error?: string }>}
   */
  async send(payload, recipientMeta = {}) {
    const {
      _id,
      scope,
      recipientId,
      recipientRole,
      region,
      district,
      tags = [],
      title,
      message,
      actionUrl,
    } = payload;

    const pushData = {
      url: String(actionUrl || ""),
      notificationId: String(_id || ""),
    };

    try {
      // 1. UNICAST: Send directly to recipient device token
      if (scope === "UNICAST") {
        let fcmToken = recipientMeta.fcmToken || payload.fcmToken;

        if (!fcmToken && recipientId) {
          const user = await User.findById(recipientId).select("fcmToken");
          fcmToken = user?.fcmToken;
        }

        if (fcmToken) {
          const result = await sendPush(fcmToken, title, message, pushData);
          if (result.success) {
            logger.info(`📲 [FcmChannelProvider] Unicast FCM delivered to User: ${recipientId}`);
            return {
              channel: this.channelName,
              success: true,
              messageId: result.messageId,
            };
          } else {
            return {
              channel: this.channelName,
              success: false,
              error: result.error,
            };
          }
        } else {
          logger.warn(`⚠️ [FcmChannelProvider] Unicast FCM skipped: No token for User ${recipientId}`);
          return {
            channel: this.channelName,
            success: false,
            error: "No FCM token registered for recipient",
          };
        }
      }

      // 2. BROADCAST: Send to global subscriber topic
      if (scope === "BROADCAST") {
        const result = await sendPush("topic_all_users", title, message, pushData);
        logger.info(`📢 [FcmChannelProvider] Broadcast FCM delivered to topic_all_users`);
        return {
          channel: this.channelName,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        };
      }

      // 3. MULTICAST: Resolve target topic using dynamic tags or legacy regional combinations
      let targetTopic = "";

      // Prioritize tags if provided (e.g. "role:driver" -> "topic_tag_role_driver")
      if (Array.isArray(tags) && tags.length > 0) {
        const primaryTag = sanitizeTopic(tags[0].replace(/:/g, "_"));
        targetTopic = `topic_tag_${primaryTag}`;
      } else {
        const div = sanitizeTopic(region);
        const dist = sanitizeTopic(district);
        const role = recipientRole;

        if (region && (!role || role === "ALL")) {
          targetTopic = `topic_div_${div}`;
        } else if (district && (!role || role === "ALL")) {
          targetTopic = `topic_dist_${dist}`;
        } else if (region && role) {
          targetTopic = `topic_div_${div}_role_${role}`;
        } else if (district && role) {
          targetTopic = `topic_dist_${dist}_role_${role}`;
        } else if (role) {
          targetTopic = `topic_role_${role}`;
        }
      }

      if (targetTopic) {
        const result = await sendPush(targetTopic, title, message, pushData);
        logger.info(`📡 [FcmChannelProvider] Multicast FCM delivered to Topic: ${targetTopic}`);
        return {
          channel: this.channelName,
          success: result.success,
          messageId: result.messageId,
          targetTopic,
          error: result.error,
        };
      }

      logger.warn(`⚠️ [FcmChannelProvider] No matching topic resolved for notification ${_id}`);
      return {
        channel: this.channelName,
        success: false,
        error: "No valid FCM topic resolved for multicast",
      };
    } catch (error) {
      logger.error(`❌ [FcmChannelProvider] Delivery failure for notif ${_id}: ${error.message}`);
      return {
        channel: this.channelName,
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = FcmChannelProvider;
