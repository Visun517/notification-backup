const { getMessaging } = require('firebase-admin/messaging');
const NotificationProfile = require('../models/NotificationProfile'); // Self-healing: removes stale FCM tokens
const logger = require('./logger');

/**
 * Push Notification Helper
 * 
 * Description:
 * This function acts as the "Postman" that delivers messages to the Firebase Cloud Messaging (FCM) servers.
 * It handles both private messages (using device tokens) and group messages (using topics).
 */
const sendPushNotification = async (target, title, body, data = {}) => {
  // 1. Construct the message payload
  const message = {
    notification: { title, body },
    
    // IMPORTANT: Firebase requires all values inside the 'data' object to be strings.
    // Object.fromEntries converts any numbers or booleans in our data into strings safely.
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)])
    ),
  };

  // 2. Determine the delivery method.
  //
  // FCM device tokens are long (~140-char) alphanumeric strings.
  // FCM topics are short, human-readable strings (tag_driver, broadcast_all, etc.).
  //
  // We detect topics by checking for known topic prefixes OR short length,
  // rather than a single hardcoded prefix, so new topic naming conventions
  // (tag_<name>, broadcast_all, etc.) are supported without touching this file.
  const isTopic =
    target.startsWith("topic_") || // legacy prefix — kept for backward compat
    target.startsWith("tag_")    || // generic tag topics (new pattern)
    target === "broadcast_all"   || // reserved broadcast topic
    target.length < 64;            // FCM tokens are always 140+ chars

  if (isTopic) {
    message.topic = target;
  } else {
    message.token = target;
  }

  try {
    // 3. Send the message to Firebase
    const response = await getMessaging().send(message);

    // Log the success with a truncated target name for cleaner logs
    logger.info(
      ` FCM Push Sent Successfully | Target: ${target.slice(0, 15)}... | ID: ${response}`
    );
    
    return { success: true, messageId: response };
    
  } catch (error) {
    const errorCode = error.code || error.errorInfo?.code;

    // 4. Self-Healing Database Logic (Auto Cleanup)
    // If Firebase says the token is no longer valid (e.g., the user uninstalled the app),
    // we automatically remove that dead token from our MongoDB database to keep it clean.
    if (
      errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-registration-token'
    ) {
      logger.warn(
        ` Stale FCM Token Detected. Removing from DB: ${target.slice(0, 20)}...`
      );

      // Remove the stale token from the NotificationProfile fcmTokens array.
      // Uses $pull for atomic array element removal across all matching profiles.
      await NotificationProfile.updateMany(
        { fcmTokens: target },
        { $pull: { fcmTokens: target } },
      );
    }

    // Log the exact error for debugging
    logger.error(` FCM Error [${errorCode}]: ${error.message}`);

    // Return the failure status so the calling function knows it failed, 
    // but don't crash the server.
    return { success: false, error: errorCode };
  }
};

module.exports = sendPushNotification;