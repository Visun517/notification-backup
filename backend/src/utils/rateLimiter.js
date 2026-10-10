const redisHelper = require("../config/redisClient");
const logger = require("./logger");

/**
 * Enterprise Rate Limiter & Frequency Capper.
 * Prevents recipient alert fatigue using Redis atomic sliding-window / counters.
 * Default policy: Max 5 push notifications per recipient within a 10-minute window.
 */
class RateLimiter {
  /**
   * Evaluates if a notification dispatch is permitted under frequency capping rules.
   *
   * @param {string} recipientId - User ID of recipient
   * @param {string} channel - Channel type (e.g., 'PUSH', 'SMS')
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.maxRequests=5] - Maximum dispatches allowed in window
   * @param {number} [options.windowSeconds=600] - Window duration in seconds (default 10 min)
   * @param {string} [options.priority='normal'] - Priority level (bypassed if 'critical' or 'high')
   * @returns {Promise<{ allowed: boolean, currentCount: number, limit: number, bypassed?: boolean }>}
   */
  async checkRateLimit(recipientId, channel = "PUSH", options = {}) {
    const {
      tenantId = "default",
      maxRequests = 5,
      windowSeconds = 600,
      priority = "normal",
    } = options;

    // 1. Critical & High priority notifications ALWAYS bypass rate limiting (safety, OTPs, security)
    if (priority === "critical" || priority === "high") {
      logger.info(`⚡ [RateLimiter] Priority '${priority}' bypassed rate limit for Tenant: ${tenantId}, User: ${recipientId}`);
      return { allowed: true, currentCount: 0, limit: maxRequests, bypassed: true };
    }

    // 2. Broadcasts or messages without specific recipients bypass individual rate limiting
    if (!recipientId) {
      return { allowed: true, currentCount: 0, limit: maxRequests, bypassed: true };
    }

    // 3. Fallback check: if Redis is disconnected, fail-open to avoid dropping user alerts
    if (!redisHelper.isRedisConnected()) {
      return { allowed: true, currentCount: 0, limit: maxRequests, fallback: true };
    }

    const key = `tenant:${tenantId}:ratelimit:${channel}:${recipientId}`;

    try {
      // Atomic increment
      const count = await redisHelper.safeIncr(key);

      // If key was just created (count === 1), set expiration TTL
      if (count === 1) {
        await redisHelper.safeSet(key, 1, windowSeconds);
      }

      if (count > maxRequests) {
        logger.warn(
          `🚫 [RateLimiter] Rate limit exceeded for Tenant ${tenantId}, User ${recipientId} on channel '${channel}' (${count}/${maxRequests} in ${windowSeconds}s).`,
        );
        try {
          const { telemetry } = require("./telemetry");
          telemetry.recordRateLimited({ tenantId, channel });
        } catch (_) {}
        return {
          allowed: false,
          currentCount: count,
          limit: maxRequests,
        };
      }

      return {
        allowed: true,
        currentCount: count,
        limit: maxRequests,
      };
    } catch (err) {
      logger.error(`[RateLimiter] Error evaluating rate limit: ${err.message}`);
      // Fail-open
      return { allowed: true, currentCount: 0, limit: maxRequests, fallback: true };
    }
  }

  /**
   * Resets rate limit counter for a recipient and channel.
   */
  async resetRateLimit(recipientId, channel = "PUSH", tenantId = "default") {
    const key = `tenant:${tenantId}:ratelimit:${channel}:${recipientId}`;
    return await redisHelper.safeDel(key);
  }
}

const defaultRateLimiter = new RateLimiter();

module.exports = {
  RateLimiter,
  rateLimiter: defaultRateLimiter,
  checkRateLimit: (recipientId, channel, options) =>
    defaultRateLimiter.checkRateLimit(recipientId, channel, options),
};
