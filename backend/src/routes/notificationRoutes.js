/**
 * Notification Routes
 *
 * Description:
 * This file defines the API endpoints (URL paths) for the notification system.
 * All notification endpoints are protected by cryptographic JWT authentication middleware.
 */

const express = require("express");
const router = express.Router();

// Import the main notification logic (Controllers)
const {
  getNotifications,
  markAsRead,
  getUnreadCount,
  markAllAsRead,
  clearAllNotifications,
  getHealth,
  getMetrics,
} = require("../controllers/notificationController");

// Import the testing/simulation controller
const { triggerSimulation } = require("../controllers/exampleController");

// Import JWT authentication middleware
const protect = require("../middleware/authMiddleware");

/**
 * Public Telemetry & Health Monitoring Probes
 */
router.get("/health", getHealth);
router.get("/metrics", getMetrics);

// Enforce JWT authentication on remaining user notification routes
router.use(protect);

/**
 * Route: GET /
 * Description: Fetches all notifications (with pagination) for the authenticated user.
 */
router.get("/", getNotifications);

/**
 * Route: GET /unread-count
 * Description: Gets the total number of messages that the authenticated user has not read yet.
 */
router.get("/unread-count", getUnreadCount);

/**
 * Route: PATCH /:id/read
 * Description: Marks a specific notification as "read" for the authenticated user.
 */
router.patch("/:id/read", markAsRead);

/**
 * Route: PATCH /mark-all-read
 * Description: Marks all notifications as read for the authenticated user.
 */
router.patch("/mark-all-read", markAllAsRead);

/**
 * Route: DELETE /clear-all-notifications
 * Description: Clears/deletes all notifications for the authenticated user.
 */
router.delete("/clear-all-notifications", clearAllNotifications);

/**
 * Route: POST /simulate-system-update
 * Description: Testing route to simulate notification events.
 */
router.post("/simulate-system-update", triggerSimulation);

module.exports = router;
