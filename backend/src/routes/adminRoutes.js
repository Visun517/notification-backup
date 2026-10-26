const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const { strictRateLimiter } = require("../middleware/rateLimitMiddleware");
const { retryDlqJobs } = require("../controllers/adminController");

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADMIN ROUTES
 * 
 * Privileged operational endpoints for Dead-Letter Queue management and triage.
 * 
 * Middleware Pipeline:
 *   1. protect           — Cryptographically verifies JWT token & extracts user identity.
 *   2. strictRateLimiter — Applies atomic sliding-window rate limit (10 req / 60s)
 *                          to prevent operational abuse or queue thrashing.
 *   3. retryDlqJobs      — Controller handling batch recovery with idempotency protection.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * POST /api/admin/dlq/retry
 * Retries permanently failed jobs from the Dead-Letter Queue (DLQ).
 * 
 * Request Body (Optional):
 *   { "limit": 50 }  // Defaults to 50, maximum capped at 50
 */
router.post(
  "/dlq/retry",
  protect,
  strictRateLimiter,
  retryDlqJobs
);

module.exports = router;
