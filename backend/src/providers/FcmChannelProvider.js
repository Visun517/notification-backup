const IChannelProvider = require("./IChannelProvider");
const { NOTIFICATION_CHANNELS } = require("../constants/notificationConstants");
const sendPush = require("../utils/pushNotificationHelper");
const NotificationProfile = require("../models/NotificationProfile");
const logger = require("../utils/logger");

/**
 * Sanitize a tag string into a valid FCM topic component.
 * FCM topics allow: letters, digits, hyphens, underscores, tildes, percent.
 * Mirrors the sanitizeTag() helpers in fcmService.js and pushDelivery.js.
 *
 * @param {string} tag
 * @returns {string}
 */
const sanitizeTag = (tag) => tag.replace(/[^a-zA-Z0-9-_.~%]/g, "_");

/**
 * FcmChannelProvider — Concrete Strategy for PUSH notifications.
 *
 * Delivers mobile push notifications via Firebase Cloud Messaging (FCM).
 * Routing is 100% domain-agnostic and mirrors FcmDelivery / socketDelivery:
 *
 *   UNICAST   → send to every FCM token registered for the recipient user
 *               (all tokens fetched from NotificationProfile — multi-device)
 *   MULTICAST → fan-out to one FCM topic per tag in notification.tags
 *               Topic naming: "tag_<tagName>"
 *               Users subscribe to these topics on socket connect via
 *               notificationHandler.js → fcmService.manageTagTopics()
 *   BROADCAST → send to the reserved "broadcast_all" FCM topic
 *               All users auto-subscribe to this topic on socket connect
 *
 * No geography, roles, regions, or districts anywhere in this file.
 */
class FcmChannelProvider extends IChannelProvider {
  constructor() {
    super(NOTIFICATION_CHANNELS.PUSH);
  }

  isConfigured() {
    return true;
  }

  /**
   * Delivers the notification to target device token(s) or FCM topic(s).
   *
   * @param {Object} payload         - Notification document/payload
   * @param {Object} [recipientMeta] - Optional context (fcmToken override, etc.)
   * @returns {Promise<{ channel: string, success: boolean, messageId?: string, targetTopics?: string[], error?: string }>}
   */
  async send(payload, recipientMeta = {}) {
    const {
      _id,
      scope,
      recipientId,
      tags = [],
      title,
      message,
      actionUrl = "",
      tenantId = "default",
    } = payload;

    const pushData = {
      url: String(actionUrl),
      notificationId: String(_id || ""),
    };

    try {
      switch (scope) {
        // -----------------------------------------------------------------
        // UNICAST — send to every FCM token registered for the target user.
        // Multi-device: all tokens from NotificationProfile are targeted.
        // -----------------------------------------------------------------
        case "UNICAST": {
          // Allow override via recipientMeta (e.g. worker passes cached token)
          let fcmTokens = recipientMeta.fcmToken ? [recipientMeta.fcmToken] : null;

          if (!fcmTokens) {
            const profile = await NotificationProfile.findOne({
              userId: String(recipientId),
              tenantId,
            }).select("fcmTokens");
            fcmTokens = profile?.fcmTokens ?? [];
          }

          if (!fcmTokens.length) {
            logger.warn(
              `⚠️ [FcmChannelProvider] UNICAST skipped: no FCM tokens for User ${recipientId} [Tenant: ${tenantId}]`,
            );
            return {
              channel: this.channelName,
              success: false,
              error: "No FCM tokens registered for recipient",
            };
          }

          const results = [];
          for (const token of fcmTokens) {
            const r = await sendPush(token, title, message, pushData);
            results.push(r);
          }

          const anySuccess = results.some((r) => r.success);
          logger.info(
            `📲 [FcmChannelProvider] UNICAST → User ${recipientId} (${fcmTokens.length} device(s)) [Notif ${_id}]`,
          );
          return {
            channel: this.channelName,
            success: anySuccess,
            messageId: results.find((r) => r.messageId)?.messageId,
          };
        }

        // -----------------------------------------------------------------
        // MULTICAST — fan-out to one FCM topic per tag in notification.tags.
        // "tag_<tagName>" topics are kept in sync with socket rooms via
        // notificationHandler → fcmService.manageTagTopics on connect.
        // -----------------------------------------------------------------
        case "MULTICAST": {
          if (!tags.length) {
            logger.warn(
              `⚠️ [FcmChannelProvider] MULTICAST Notif ${_id} has no tags — skipping FCM delivery.`,
            );
            return {
              channel: this.channelName,
              success: false,
              error: "No tags provided for MULTICAST delivery",
            };
          }

          const topics = tags.map((tag) => `tag_${sanitizeTag(tag)}`);
          const results = [];

          for (const topic of topics) {
            const r = await sendPush(topic, title, message, pushData);
            logger.info(`📡 [FcmChannelProvider] MULTICAST → FCM Topic "${topic}" [Notif ${_id}]`);
            results.push({ topic, ...r });
          }

          const anySuccess = results.some((r) => r.success);
          return {
            channel: this.channelName,
            success: anySuccess,
            targetTopics: topics,
          };
        }

        // -----------------------------------------------------------------
        // BROADCAST — send to the reserved "broadcast_all" FCM topic.
        // All users auto-subscribe to this topic on socket connect.
        // -----------------------------------------------------------------
        case "BROADCAST": {
          const topic = "broadcast_all";
          const result = await sendPush(topic, title, message, pushData);
          logger.info(`📢 [FcmChannelProvider] BROADCAST → FCM Topic "${topic}" [Notif ${_id}]`);
          return {
            channel: this.channelName,
            success: result.success,
            messageId: result.messageId,
            targetTopics: [topic],
            error: result.error,
          };
        }

        default:
          logger.warn(`⚠️ [FcmChannelProvider] Unknown scope "${scope}" for Notif ${_id}.`);
          return {
            channel: this.channelName,
            success: false,
            error: `Unknown notification scope: ${scope}`,
          };
      }
    } catch (error) {
      logger.error(`❌ [FcmChannelProvider] Delivery failure for Notif ${_id}: ${error.message}`);
      return { channel: this.channelName, success: false, error: error.message };
    }
  }
}

module.exports = FcmChannelProvider;
