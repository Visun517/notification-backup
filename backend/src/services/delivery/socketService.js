const logger = require("../../utils/logger");

/**
 * Socket Tag Room Manager.
 *
 * Manages Socket.io room membership based on generic string tags.
 * Rooms are named "tag:<tagName>" — completely domain-agnostic.
 *
 * The host application assigns tags to users (via NotificationProfile or the
 * subscribe_tags socket event). This service only handles the mechanical
 * join/leave operations.
 *
 * @param {Socket} socket  - The authenticated Socket.io socket instance
 * @param {string[]} tags  - Array of tag strings (e.g. ["colombo","driver"])
 * @param {"join"|"leave"} action
 */
exports.manageTagRooms = (socket, tags, action = "join") => {
  if (!Array.isArray(tags) || tags.length === 0) {
    logger.warn(`Socket tag room ${action} skipped: empty or invalid tags array.`);
    return;
  }

  const rooms = tags.map((tag) => `tag:${tag}`);

  rooms.forEach((room) => {
    if (action === "join") {
      socket.join(room);
    } else {
      socket.leave(room);
    }
  });

  logger.info(
    `Socket Rooms ${action}ed: [${rooms.join(", ")}] for User=${socket.userId}`,
  );
};