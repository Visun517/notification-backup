const NotificationProfile = require("../src/models/NotificationProfile");
const AppError = require("../src/errors/appError");
const logger = require("../src/utils/logger");
const { manageTagTopics } = require("../src/services/delivery/fcmService");

/**
 * Notification Handler — Generic Tag/Topics Socket Gateway.
 *
 * This handler is 100% domain-agnostic. It knows nothing about geography,
 * roles, or any other host-application concepts.
 *
 * How it works:
 *  1. On connect  → load the user's subscribedTags from NotificationProfile
 *  2. Join one Socket.io room per tag  (e.g. room "tag:colombo", "tag:driver")
 *  3. On "subscribe_tags" event → host app can update live tag rooms
 *  4. On disconnect → Socket.io auto-leaves all rooms
 *
 * The host application is fully responsible for deciding which tags a user
 * should have. The engine only reacts to what it is told.
 */
module.exports = (io) => {
  io.on("connection", async (socket) => {
    const userId   = socket.userId;
    const tenantId = socket.tenantId || "default";

    logger.info(
      `🔒 Socket Connected: User=${userId}, Tenant=${tenantId}, SocketID=${socket.id}`,
    );

    // --- Private room: always available for UNICAST delivery ---
    socket.join(`user_${userId}`);

    /**
     * Emits a structured error event back to this specific client.
     * Prevents the server from crashing on unhandled errors inside socket handlers.
     */
    const handleSocketError = (err, eventName) => {
      const statusCode = err.statusCode || 500;
      const message    = err.message    || "Internal Socket Error";
      logger.error(`❌ [Socket:${eventName}] User=${userId}: ${message}`);
      socket.emit("error", { status: err.status || "error", statusCode, message, event: eventName });
    };

    // -----------------------------------------------------------------------
    // INITIAL SYNC
    // Load the user's current tag subscriptions, join the corresponding
    // Socket.io rooms, and sync FCM topic subscriptions.
    // -----------------------------------------------------------------------
    try {
      const profile = await NotificationProfile.findOne({ userId, tenantId })
        .select("subscribedTags fcmTokens")
        .lean();

      const tags      = profile?.subscribedTags ?? [];
      const fcmTokens = profile?.fcmTokens      ?? [];

      // --- Socket.io rooms ---
      // One room per tag — rooms are named "tag:<tagName>"
      tags.forEach((tag) => socket.join(`tag:${tag}`));

      // --- FCM topic subscriptions ---
      // Subscribe each registered device token to:
      //   1. One FCM topic per subscribed tag   ("tag_<tagName>")
      //   2. The reserved "broadcast_all" topic  (required for BROADCAST push)
      for (const token of fcmTokens) {
        if (tags.length > 0) {
          await manageTagTopics(token, tags, "subscribe");
        }
        await manageTagTopics(token, ["broadcast_all"], "subscribe");
      }

      // Store on socket session for later diffing in subscribe_tags
      socket.subscribedTags = new Set(tags);
      socket.fcmTokens      = fcmTokens;

      logger.info(
        `✅ Initial Sync: User=${userId}, Tags=[${tags.join(", ")}], FCM tokens=${fcmTokens.length}`,
      );
    } catch (err) {
      handleSocketError(err, "initial_sync");
    }

    // -----------------------------------------------------------------------
    // SUBSCRIBE_TAGS  (Host app → Engine)
    // The host app calls this when the user's tag membership changes
    // (e.g. user moves to a new city, changes role, upgrades plan).
    //
    // Payload:  { tags: string[], mode: "replace" | "merge" }
    //   replace  → leave rooms for removed tags, join rooms for new tags
    //   merge    → only add new tags (never remove)
    // -----------------------------------------------------------------------
    socket.on("subscribe_tags", async ({ tags: newTags = [], mode = "replace" } = {}) => {
      try {
        if (!Array.isArray(newTags)) {
          return handleSocketError(new AppError("'tags' must be an array of strings.", 400), "subscribe_tags");
        }

        const sanitized = [...new Set(
          newTags.map((t) => String(t).trim().toLowerCase()).filter(Boolean),
        )];

        const current = socket.subscribedTags ?? new Set();
        const next    = mode === "merge"
          ? new Set([...current, ...sanitized])
          : new Set(sanitized);

        const added   = [...next].filter((t) => !current.has(t));
        const removed = [...current].filter((t) => !next.has(t));

        // --- Socket.io rooms ---
        removed.forEach((tag) => socket.leave(`tag:${tag}`));
        added.forEach((tag) => socket.join(`tag:${tag}`));

        // --- FCM topic subscriptions (mirror the Socket.io room diff) ---
        const fcmTokens = socket.fcmTokens ?? [];
        for (const token of fcmTokens) {
          if (removed.length > 0) await manageTagTopics(token, removed, "unsubscribe");
          if (added.length   > 0) await manageTagTopics(token, added,   "subscribe");
        }

        socket.subscribedTags = next;

        logger.info(
          `🏷️  [subscribe_tags] User=${userId}, Mode=${mode}, Tags=[${[...next].join(", ")}]`,
        );

        socket.emit("tags_updated", {
          status: "success",
          subscribedTags: [...next],
        });
      } catch (err) {
        handleSocketError(err, "subscribe_tags");
      }
    });

    // -----------------------------------------------------------------------
    // DISCONNECT
    // Socket.io automatically leaves all rooms on disconnect — nothing to do.
    // -----------------------------------------------------------------------
    socket.on("disconnect", () => {
      logger.info(`👋 Socket Disconnected: User=${userId}`);
    });
  });
};