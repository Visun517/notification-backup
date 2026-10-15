const { getMessaging } = require("firebase-admin/messaging");
const logger = require("../../utils/logger");

// Import NotificationProfile to remove invalid tokens from the engine's registry
const NotificationProfile = require("../../models/NotificationProfile");


// Helper function to remove spaces and special characters from topic names
const sanitize = (name) => (name ? name.replace(/[^a-zA-Z0-9-_.~%]/g, "") : "");

/**
 * FCM Topic Management Service
 * Subscribes or unsubscribes a user's FCM token to regional and role-based topics.
 */
exports.manageRegionalTopics = async (
  fcmToken,
  regionData,
  role,
  action = "subscribe",
) => {
  // 1. Stop if the token or location data is missing
  if (!fcmToken || !regionData || !regionData.division || !regionData.district) {
    logger.warn(`⚠️ FCM ${action} skipped: Missing fcmToken or regionData.`);
    return;
  }

  // 2. Clean the division and district names
  const { division, district } = regionData;
  const divS = sanitize(division);
  const distS = sanitize(district);

  // 3. Create the list of 4 topics this user should listen to
  const topics = [
    `topic_div_${divS}`,
    `topic_dist_${distS}`,
    `topic_div_${divS}_role_${role}`,
    `topic_dist_${distS}_role_${role}`,
  ];

  try {
    // 4. Send requests to Firebase for all topics at the same time
    const results = await Promise.allSettled(
      topics.map((topic) =>
        action === "subscribe"
          ? getMessaging().subscribeToTopic([fcmToken], topic)
          : getMessaging().unsubscribeFromTopic([fcmToken], topic),
      ),
    );

    // Flag to check if the FCM token is expired or invalid
    let isTokenInvalid = false;

    // 5. Loop through the results to check for success or failure
    for (let index = 0; index < results.length; index++) {
      const res = results[index];
      const topicName = topics[index];

      if (res.status === "fulfilled") {
        const successCount = res.value?.successCount || 0;
        
        if (successCount > 0) {
          logger.info(`FCM ${action} success: ${topicName}`);
        } else {
          // Firebase processed the request, but returned an error for this token
          const errorObj = res.value?.errors?.[0]?.error;
          const errorMessage = errorObj?.message || errorObj?.code || "Unknown error";
          
          logger.error(`FCM ${action} failed for ${topicName}: ${errorMessage}`);

          // Check if Firebase says the token is no longer valid
          if (errorMessage.includes("not registered") || errorMessage.includes("not-registered")) {
            isTokenInvalid = true;
          }
        }
      } else {
        // The API request completely failed (e.g., network error)
        const errorMessage = res.reason?.message || res.reason || "Unknown failure";
        logger.error(`FCM ${action} rejected for ${topicName}: ${errorMessage}`);

        // Check again if the failure was due to an invalid token
        if (errorMessage.includes("not registered") || errorMessage.includes("not-registered")) {
          isTokenInvalid = true;
        }
      }
    }

    // 6. If the token is dead, remove it from the database ONCE to save server resources
    if (isTokenInvalid) {
      logger.warn(`Invalid FCM Token detected. Removing from NotificationProfile registry...`);
      // $pull removes the stale token from every profile's fcmTokens array atomically
      await NotificationProfile.updateMany(
        { fcmTokens: fcmToken },
        { $pull: { fcmTokens: fcmToken } },
      );
    }

  } catch (err) {
    // Catch any unexpected fatal errors
    logger.error(`Fatal error in manageRegionalTopics: ${err.message}`);
  }
};