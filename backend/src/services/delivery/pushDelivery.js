const NotificationProfile = require("../models/NotificationProfile");
const sendPush = require("../utils/pushNotificationHelper");
const logger = require("../utils/logger");

/**
 * Helper function to clean up topic names.
 * Firebase topics cannot contain spaces or special characters.
 */
const sanitizeTopic = (name) =>
  name ? name.replace(/[^a-zA-Z0-9-_.~%]/g, "") : "";

/**
 * Delivers notifications to mobile devices via Firebase Cloud Messaging (FCM).
 * This runs in the background and does not block the main Socket.io delivery.
 *
 * DECOUPLED: FCM tokens are now sourced from the engine's own NotificationProfile
 * collection, replacing the previous tight coupling to the host app's User model.
 */
exports.deliverViaPush = async (notification) => {
  // Extract notification details
  const {
    _id,
    scope,
    recipientId,
    recipientRole,
    region,
    district,
    title,
    message,
    actionUrl,
    tenantId = "default",
  } = notification;

  // Extra data sent invisibly to the app (FCM requires all values to be strings)
  const pushData = { url: String(actionUrl), notificationId: String(_id) };

  try {
    // --- 1. PERSONAL MESSAGES (UNICAST) ---
    if (scope === "UNICAST") {
      // Look up the user's registered FCM tokens from the decoupled NotificationProfile
      const profile = await NotificationProfile.findOne({
        userId: String(recipientId),
        tenantId,
      }).select("fcmTokens");

      if (profile?.fcmTokens?.length > 0) {
        // Send to all registered device tokens for this user
        for (const token of profile.fcmTokens) {
          await sendPush(token, title, message, pushData);
        }
        logger.info(`📲 FCM Unicast sent to User: ${recipientId} (${profile.fcmTokens.length} device(s))`);
      } else {
        logger.warn(`⚠️ FCM Unicast skipped: No registered tokens for User ${recipientId}`);
      }
    }

    // --- 2. GROUP MESSAGES (MULTICAST) ---
    else if (scope === "MULTICAST") {
      const role = recipientRole;
      const div = sanitizeTopic(region);
      const dist = sanitizeTopic(district);
      let targetTopic = "";

      // Determine the most specific Firebase topic to send the message to

      // A. If sending to EVERYONE in a specific Division
      if (region && (!role || role === "ALL")) targetTopic = `topic_div_${div}`;

      // B. If sending to EVERYONE in a specific District
      else if (district && (!role || role === "ALL")) targetTopic = `topic_dist_${dist}`;

      // C. If sending to a specific Role in a Division (e.g., Drivers in Balangoda)
      else if (region && role) targetTopic = `topic_div_${div}_role_${role}`;

      // D. If sending to a specific Role in a District (e.g., Tourists in Ratnapura)
      else if (district && role) targetTopic = `topic_dist_${dist}_role_${role}`;

      // E. If sending to a Role across the whole country (e.g., All System Admins)
      else if (role) targetTopic = `topic_role_${role}`;

      // Send the push message to the determined topic
      if (targetTopic) {
        await sendPush(targetTopic, title, message, pushData);
        logger.info(` FCM Multicast sent to Topic: ${targetTopic}`);
      }
    }

    // --- 3. PUBLIC MESSAGES (BROADCAST) ---
    else if (scope === "BROADCAST") {
      // Send to the global topic that every user is subscribed to
      await sendPush("topic_all_users", title, message, pushData);
      logger.info(` FCM Broadcast sent to all users`);
    }
  } catch (error) {
    // If FCM fails, log the error but do not crash the server
    logger.error(` FCM Delivery Failed for Notif ${_id}: ${error.message}`);
  }
};