const logger = require("../../utils/logger");

/**
 * Socket Delivery Service.
 *
 * Routes real-time notifications to connected users via Socket.io.
 * This service is 100% domain-agnostic — it knows nothing about geography,
 * roles, or any other host-app concept.
 *
 * Routing rules:
 *   UNICAST   → private room "user_<recipientId>"         (one person)
 *   MULTICAST → one "tag:<name>" room per tag in the      (matched subscribers)
 *               notification's `tags` array
 *   BROADCAST → io.emit (every connected socket)          (everyone)
 *
 * The host application populates `notification.tags` when calling
 * sendNotification(). The engine fans out to all rooms matching those tags.
 */
exports.deliverViaSocket = (io, notification) => {
  const { _id, scope, recipientId, tags = [] } = notification;

  switch (scope) {
    // -----------------------------------------------------------------------
    // UNICAST — private message to one specific user
    // -----------------------------------------------------------------------
    case "UNICAST": {
      const room = `user_${recipientId}`;
      logger.info(`📡 [Socket] UNICAST → Room "${room}" (Notif ${_id})`);
      io.to(room).emit("new_notification", notification);
      break;
    }

    // -----------------------------------------------------------------------
    // MULTICAST — fan-out to every tag room listed on the notification.
    // Socket.io handles deduplication: if a user is in multiple matching rooms
    // they still receive the event only once per connection.
    // -----------------------------------------------------------------------
    case "MULTICAST": {
      if (!tags || tags.length === 0) {
        logger.warn(
          `⚠️  [Socket] MULTICAST Notif ${_id} has no tags — no rooms targeted.`,
        );
        break;
      }

      const rooms = tags.map((tag) => `tag:${tag}`);
      // Pass the full array to io.to() — Socket.io v4 deduplicates at the wire
      // level, so a socket subscribed to multiple matching rooms still receives
      // exactly ONE event instead of one per room.
      logger.info(`📡 [Socket] MULTICAST → Rooms [${rooms.join(", ")}] (Notif ${_id})`);
      io.to(rooms).emit("new_notification", notification);
      break;
    }

    // -----------------------------------------------------------------------
    // BROADCAST — emit to every connected socket
    // -----------------------------------------------------------------------
    case "BROADCAST": {
      logger.info(`📡 [Socket] BROADCAST → All connected clients (Notif ${_id})`);
      io.emit("new_notification", notification);
      break;
    }

    default:
      logger.warn(`⚠️  [Socket] Unknown scope "${scope}" for Notif ${_id}.`);
  }
};