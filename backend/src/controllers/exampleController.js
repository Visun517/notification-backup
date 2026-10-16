const { sendNotification } = require("../services/NotificationService");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");

/**
 * Example / Simulation Controller.
 *
 * Demonstrates how to send notifications using the generic Tags/Topics pattern.
 * This controller is intentionally domain-agnostic — no place names, role names,
 * or geography. All audience targeting is done through arbitrary string tags.
 *
 * HOW TO SEND A NOTIFICATION (3 steps):
 *   1. Assign tags to your users via  PATCH /api/notifications/profile/:userId/tags
 *   2. Build a payload with matching   tags: ["tag-a", "tag-b"]
 *   3. Call sendNotification(payload)
 *
 * SCOPES:
 *   UNICAST   — private message to one user (requires recipientId)
 *   MULTICAST — fan-out to all users subscribed to any of the listed tags
 *   BROADCAST — delivered to every connected user (no tags needed)
 */
const triggerSimulation = catchAsync(async (req, res, next) => {
  const io = req.app.get("io");

  const {
    type,        // "UNICAST" | "MULTICAST" | "BROADCAST"
    scenario,    // Preset name for auto-filling test data
    recipientId, // Required for UNICAST
    tags,        // Array of tag strings for MULTICAST
    channels,    // Override delivery channels
  } = req.body;

  if (!type || !scenario) {
    return next(
      new AppError("Please provide both 'type' and 'scenario' in the request body.", 400),
    );
  }

  // Base payload — all fields are generic
  let payload = {
    scope:       type,
    recipientId: recipientId || undefined,
    tags:        Array.isArray(tags) ? tags : [],
    channels:    Array.isArray(channels) ? channels : ["IN_APP", "PUSH"],
    title:       "Notification",
    message:     "This is a test notification.",
    category:    "GENERAL",
    priority:    "normal",
    actionUrl:   "/",
    metadata:    req.body.metadata || {},
  };

  // ---------------------------------------------------------------------------
  // Generic scenario presets — no domain-specific content
  // ---------------------------------------------------------------------------
  switch (scenario) {
    case "WELCOME":
      // UNICAST: greet a newly registered user
      payload.title    = "Welcome aboard!";
      payload.message  = "Your account is ready. Explore what's new.";
      payload.category = "SYSTEM";
      payload.priority = "normal";
      payload.actionUrl = "/dashboard";
      break;

    case "TAG_PUSH":
      // MULTICAST: send to all users subscribed to the provided tags
      payload.title    = "New Update for Your Group";
      payload.message  = `A new update is available for users tagged: [${(tags || []).join(", ")}].`;
      payload.category = "GENERAL";
      payload.priority = "normal";
      break;

    case "ALERT":
      // MULTICAST: high-priority alert to tagged audience
      payload.title    = "Action Required";
      payload.message  = "Please review the latest update in your dashboard.";
      payload.category = "ALERT";
      payload.priority = "high";
      payload.actionUrl = "/alerts";
      break;

    case "BROADCAST_ALL":
      // BROADCAST: platform-wide announcement
      payload.title    = "Platform Announcement";
      payload.message  = "We have an important update for all users. Please read it in the app.";
      payload.category = "SYSTEM";
      payload.priority = "normal";
      payload.actionUrl = "/announcements";
      break;

    case "MAINTENANCE":
      // BROADCAST: scheduled downtime notice
      payload.title    = "Scheduled Maintenance";
      payload.message  = "The system will be unavailable for a short period. We apologize for the inconvenience.";
      payload.category = "SYSTEM";
      payload.priority = "low";
      break;
  }

  // Allow caller to override title / message for custom testing
  if (req.body.title)   payload.title   = req.body.title;
  if (req.body.message) payload.message = req.body.message;

  logger.info(`🧪 [Simulation] Scenario="${scenario}" | Scope="${type}" | Tags=[${payload.tags.join(", ")}]`);

  const result = await sendNotification(io, payload);

  res.status(200).json({
    status: "success",
    message: `Test notification for '${scenario}' dispatched.`,
    data: result,
  });
});

module.exports = { triggerSimulation };
