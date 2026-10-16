const { getMessaging } = require("firebase-admin/messaging");
const logger = require("../../utils/logger");
const NotificationProfile = require("../../models/NotificationProfile");

/**
 * FCM Tag Topic Service.
 *
 * Manages Firebase Cloud Messaging topic subscriptions based on generic tags.
 * FCM topic names follow the pattern "tag_<tagName>" (underscores, not colons,
 * because FCM topics cannot contain colons).
 *
 * This service is 100% domain-agnostic. The host app controls which tags a
 * user subscribes to via the NotificationProfile; this service just translates
 * those tags into FCM topic subscribe/unsubscribe operations.
 *
 * Used by:
 *   - notificationHandler.js  on connect (initial subscribe)
 *   - notificationHandler.js  on subscribe_tags (live tag updates)
 */

// Sanitize tag to a valid FCM topic component
const sanitizeTag = (tag) => tag.replace(/[^a-zA-Z0-9-_.~%]/g, "_");

/**
 * Subscribe or unsubscribe an FCM token to/from one topic per tag.
 *
 * @param {string}   fcmToken  - The device's FCM registration token
 * @param {string[]} tags      - Array of tag strings (e.g. ["colombo","driver"])
 * @param {"subscribe"|"unsubscribe"} action
 */
exports.manageTagTopics = async (fcmToken, tags, action = "subscribe") => {
  if (!fcmToken || !Array.isArray(tags) || tags.length === 0) {
    logger.warn(`⚠️ FCM tag topic ${action} skipped: missing token or empty tags.`);
    return;
  }

  const topics = tags.map((tag) => `tag_${sanitizeTag(tag)}`);

  try {
    const results = await Promise.allSettled(
      topics.map((topic) =>
        action === "subscribe"
          ? getMessaging().subscribeToTopic([fcmToken], topic)
          : getMessaging().unsubscribeFromTopic([fcmToken], topic),
      ),
    );

    let isTokenInvalid = false;

    for (let i = 0; i < results.length; i++) {
      const res       = results[i];
      const topicName = topics[i];

      if (res.status === "fulfilled") {
        const successCount = res.value?.successCount || 0;
        if (successCount > 0) {
          logger.info(`✅ FCM tag ${action} success: ${topicName}`);
        } else {
          const errorObj     = res.value?.errors?.[0]?.error;
          const errorMessage = errorObj?.message || errorObj?.code || "Unknown error";
          logger.error(`❌ FCM tag ${action} failed for ${topicName}: ${errorMessage}`);
          if (errorMessage.includes("not registered") || errorMessage.includes("not-registered")) {
            isTokenInvalid = true;
          }
        }
      } else {
        const errorMessage = res.reason?.message || res.reason || "Unknown failure";
        logger.error(`❌ FCM tag ${action} rejected for ${topicName}: ${errorMessage}`);
        if (errorMessage.includes("not registered") || errorMessage.includes("not-registered")) {
          isTokenInvalid = true;
        }
      }
    }

    // If the token is dead, $pull it from every profile that holds it
    if (isTokenInvalid) {
      logger.warn(`⚠️  Invalid FCM token detected — removing from NotificationProfile registry.`);
      await NotificationProfile.updateMany(
        { fcmTokens: fcmToken },
        { $pull: { fcmTokens: fcmToken } },
      );
    }
  } catch (err) {
    logger.error(`Fatal error in manageTagTopics: ${err.message}`);
  }
};