/**
 * Notification Routes
 *
 * All routes are secured with JWT authentication (enforce via `protect`).
 * Public telemetry probes (/health, /metrics) are intentionally excluded from auth.
 *
 * Middleware stack per route (applied left-to-right):
 *   protect           — JWT bearer token verification
 *   [rateLimiter]     — Redis atomic sliding-window frequency cap
 *   validate(...)     — Zod schema validation of params / body
 *   [controller]      — Business logic handler
 *
 * Rate Limiter Policy:
 *   apiRateLimiter    — General endpoints: 100 req / 60s per identity
 *   strictRateLimiter — Sensitive / mutation endpoints: 10 req / 60s per identity
 */

const express = require("express");
const router = express.Router();

// ── Controllers ──────────────────────────────────────────────────────────────
const {
  getNotifications,
  markAsRead,
  getUnreadCount,
  markAllAsRead,
  clearAllNotifications,
  getHealth,
  getMetrics,
} = require("../controllers/notificationController");

const { triggerSimulation } = require("../controllers/exampleController");

const {
  addDeviceToken,
  removeDeviceToken,
  updatePreferences,
  updateSubscribedTags,
} = require("../controllers/profileController");

// ── Auth middleware ───────────────────────────────────────────────────────────
const protect = require("./authMiddleware");

// ── Rate limiters ─────────────────────────────────────────────────────────────
const {
  apiRateLimiter,
  strictRateLimiter,
} = require("./rateLimitMiddleware");

// ── Validation middleware & schemas ───────────────────────────────────────────
const validate = require("./validate");
const {
  addDeviceTokenBodySchema,
  removeDeviceTokenBodySchema,
  updatePreferencesBodySchema,
  updateSubscribedTagsBodySchema,
  triggerSimulationBodySchema,
  userIdParamsSchema,
} = require("../validators/notificationValidator");

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — Telemetry & Health Probes
// No auth or rate limiting: these are called by infrastructure (K8s, Prometheus).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/health",  getHealth);
router.get("/metrics", getMetrics);

// ─────────────────────────────────────────────────────────────────────────────
// Enforce JWT authentication on all routes below this line.
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION FEED  (read-heavy — standard rate limit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /
 * Fetches paginated notification feed for the authenticated user.
 */
router.get("/", apiRateLimiter, getNotifications);

/**
 * GET /unread-count
 * Returns the total number of unread notifications for the authenticated user.
 */
router.get("/unread-count", apiRateLimiter, getUnreadCount);

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION STATE MUTATIONS  (strict rate limit — prevent bulk abuse)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /:id/read
 * Marks a specific notification as read for the authenticated user.
 */
router.patch("/:id/read", strictRateLimiter, markAsRead);

/**
 * PATCH /mark-all-read
 * Marks every notification as read for the authenticated user.
 */
router.patch("/mark-all-read", strictRateLimiter, markAllAsRead);

/**
 * DELETE /clear-all-notifications
 * Soft-deletes all notifications for the authenticated user.
 */
router.delete("/clear-all-notifications", strictRateLimiter, clearAllNotifications);

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION  (strict rate limit + Zod validation — privileged operation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /simulate-system-update
 * Triggers a test notification dispatch. Requires `type` and `scenario`.
 */
router.post(
  "/simulate-system-update",
  strictRateLimiter,
  validate(triggerSimulationBodySchema),
  triggerSimulation,
);

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION REGISTRY — Notification Profile Management
//
// These routes mutate user device tokens, preferences, and tag subscriptions.
// All are strictly rate-limited and Zod-validated.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /profile/:userId/token
 * Registers a new FCM device token (idempotent via $addToSet).
 *
 * Middleware stack:
 *   strictRateLimiter → validate(body, null, params) → addDeviceToken
 */
router.patch(
  "/profile/:userId/token",
  strictRateLimiter,
  validate(addDeviceTokenBodySchema, null, userIdParamsSchema),
  addDeviceToken,
);

/**
 * DELETE /profile/:userId/token
 * Removes a specific FCM token on logout or token rotation.
 *
 * Middleware stack:
 *   strictRateLimiter → validate(body, null, params) → removeDeviceToken
 */
router.delete(
  "/profile/:userId/token",
  strictRateLimiter,
  validate(removeDeviceTokenBodySchema, null, userIdParamsSchema),
  removeDeviceToken,
);

/**
 * PATCH /profile/:userId/preferences
 * Updates the user's per-channel notification opt-in preferences.
 *
 * Middleware stack:
 *   strictRateLimiter → validate(body, null, params) → updatePreferences
 */
router.patch(
  "/profile/:userId/preferences",
  strictRateLimiter,
  validate(updatePreferencesBodySchema, null, userIdParamsSchema),
  updatePreferences,
);

/**
 * PATCH /profile/:userId/tags
 * Sets or merges the user's tag subscriptions.
 *   Body: { tags: string[], mode: "replace" | "merge" }
 *
 * Middleware stack:
 *   apiRateLimiter → validate(body, null, params) → updateSubscribedTags
 *
 * Note: Tag updates use apiRateLimiter (not strict) because the host app
 * may call this frequently on session refresh (e.g., user changes location).
 */
router.patch(
  "/profile/:userId/tags",
  apiRateLimiter,
  validate(updateSubscribedTagsBodySchema, null, userIdParamsSchema),
  updateSubscribedTags,
);

module.exports = router;
