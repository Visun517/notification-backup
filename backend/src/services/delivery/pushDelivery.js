const NotificationProfile = require("../../models/NotificationProfile");
const sendPush = require("../../utils/pushNotificationHelper");
const logger = require("../../utils/logger");

/**
 * Push Delivery Service — FCM.
 *
 * Delivers notifications to mobile devices via Firebase Cloud Messaging (FCM).
 * Routing mirrors socketDelivery.js exactly — 100% domain-agnostic.
 *
 * Routing rules:
 *   UNICAST   → send directly to the recipient's registered FCM tokens
 *               (fetched from NotificationProfile by userId + tenantId)
 *   MULTICAST → fan-out to one FCM topic per tag in notification.tags
 *               Topic naming: "tag_<tagName>"  (underscores, not colons —
 *               FCM topics cannot contain colons or spaces)
 *               Users are subscribed to these topics on socket connect via
 *               notificationHandler.js → fcmService.manageTagTopics()
 *   BROADCAST → send to the reserved "broadcast_all" FCM topic.
 *               All users are auto-subscribed to this topic on connect.
 *
 * No geography, roles, regions, or districts anywhere in this file.
 * The host application controls audience targeting exclusively through tags.
 */

/**
 * Sanitize a tag string into a valid FCM topic component.
 * FCM topics allow: letters, digits, hyphens, underscores, tildes, percent.
 * Mirrors the sanitizeTag() in fcmService.js for consistency.
 *
 * @param {string} tag
 * @returns {string}
 */
const sanitizeTag = (tag) => tag.replace(/[^a-zA-Z0-9-_.~%]/g, "_");

/**
 * Build a prefixed FCM topic name from a generic tag string.
 * The "tag_" prefix lets pushNotificationHelper identify this as a topic
 * (not a device token) and route it via messaging().send({ topic }).
 *
 * @param {string} tag  e.g. "driver", "region:south", "premium"
 * @returns {string}    e.g. "tag_driver", "tag_region_south", "tag_premium"
 */
const toFcmTopic = (tag) => `tag_${sanitizeTag(tag)}`;

/**
 * Deliver a notification via FCM push to devices or FCM topics.
 *
 * @param {Object} notification - The persisted Notification document (plain object or Mongoose doc)
 */
exports.deliverViaPush = async (notification) => {
  const {
    _id,
    scope,
    recipientId,
    tags = [],
    title,
    message,
    actionUrl = "",
    tenantId = "default",
  } = notification;

  // Invisible data payload sent alongside the visible push notification.
  // FCM requires all values to be strings.
  const pushData = {
    url: String(actionUrl),
    notificationId: String(_id),
  };

  try {
    switch (scope) {
      // -----------------------------------------------------------------------
      // UNICAST — direct message to one specific user.
      // Sends to every FCM token the user has registered (multi-device support).
      // -----------------------------------------------------------------------
      case "UNICAST": {
        const profile = await NotificationProfile.findOne({
          userId: String(recipientId),
          tenantId,
        }).select("fcmTokens");

        if (!profile?.fcmTokens?.length) {
          logger.warn(
            `⚠️  [PushDelivery] UNICAST skipped: no FCM tokens registered for User ${recipientId} [Tenant: ${tenantId}]`,
          );
          break;
        }

        for (const token of profile.fcmTokens) {
          await sendPush(token, title, message, pushData);
        }

        logger.info(
          `📲 [PushDelivery] UNICAST → User ${recipientId} (${profile.fcmTokens.length} device(s)) [Notif ${_id}]`,
        );
        break;
      }

      // -----------------------------------------------------------------------
      // MULTICAST — fan-out to every FCM topic matching the notification's tags.
      //
      // Each tag in notification.tags maps to an FCM topic "tag_<tagName>".
      // Users are subscribed to these topics by notificationHandler.js on connect
      // (via fcmService.manageTagTopics). The engine never decides which topics
      // a user belongs to — the host app controls that via subscribedTags.
      // -----------------------------------------------------------------------
      case "MULTICAST": {
        if (!tags.length) {
          logger.warn(
            `⚠️  [PushDelivery] MULTICAST Notif ${_id} has no tags — skipping FCM delivery.`,
          );
          break;
        }

        for (const tag of tags) {
          const topic = toFcmTopic(tag);
          await sendPush(topic, title, message, pushData);
          logger.info(
            `📲 [PushDelivery] MULTICAST → FCM Topic "${topic}" [Notif ${_id}]`,
          );
        }
        break;
      }

      // -----------------------------------------------------------------------
      // BROADCAST — platform-wide push to every registered device.
      //
      // Sends to the reserved "broadcast_all" FCM topic.
      // All users are subscribed to this topic automatically on socket connect
      // (notificationHandler.js calls manageTagTopics with ["broadcast_all"]).
      // -----------------------------------------------------------------------
      case "BROADCAST": {
        const topic = "broadcast_all";
        await sendPush(topic, title, message, pushData);
        logger.info(
          `📲 [PushDelivery] BROADCAST → FCM Topic "${topic}" [Notif ${_id}]`,
        );
        break;
      }

      default:
        logger.warn(
          `⚠️  [PushDelivery] Unknown scope "${scope}" for Notif ${_id} — no FCM delivery attempted.`,
        );
    }
  } catch (error) {
    // Never crash the worker — log and continue.
    logger.error(
      `❌ [PushDelivery] FCM delivery failed for Notif ${_id}: ${error.message}`,
    );
  }
};