const redisHelper = require("../config/redisClient");
const logger = require("../utils/logger");

/**
 * Atomic Lua script for Fixed/Sliding Window Rate Limiting.
 *
 * Atomicity Guarantees:
 * 1. INCR key and atomically set expiration on first hit.
 * 2. If key exists with no TTL (edge-case / corrupted state), re-apply TTL.
 * 3. Return both the new counter and the remaining TTL in a single Redis round-trip.
 *
 * KEYS[1]: Redis rate limit key (e.g. "rl:ip:192.168.1.1")
 * ARGV[1]: Window duration in seconds (e.g. "60")
 *
 * Returns: [ currentCount, remainingTtlSeconds ]
 */
const RATE_LIMIT_LUA_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return { count, ttl }
`;

/**
 * Default key generator extracting client IP, with tenant/user awareness if authenticated.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
const defaultKeyGenerator = (req) => {
  // If request is authenticated and tenant/user is known, partition by user
  const tenantId = req.tenantId || req.user?.tenantId;
  const userId = req.userId || req.user?.id;
  if (tenantId && userId) {
    return `tenant:${tenantId}:user:${userId}`;
  }

  // Fallback to client IP (supports reverse proxies via X-Forwarded-For)
  const forwarded = req.headers && req.headers["x-forwarded-for"];
  const clientIp = forwarded
    ? String(forwarded).split(",")[0].trim()
    : req.ip || req.socket?.remoteAddress || "127.0.0.1";

  return `ip:${clientIp}`;
};

/**
 * Factory function creating an ultra-lightweight, atomic Redis rate limiting middleware.
 *
 * @param {Object} [options={}] Configuration options
 * @param {number} [options.windowMs=60000] Window timeframe in milliseconds (default: 1 minute)
 * @param {number} [options.max=100] Max number of requests allowed in window
 * @param {string} [options.prefix='rl'] Redis key namespace prefix
 * @param {Function} [options.keyGenerator] Function returning a unique string key per client
 * @param {Function} [options.skip] Function returning true to bypass rate limiting (e.g., health probes)
 * @param {number} [options.statusCode=429] HTTP status code returned when rate limit is exceeded
 * @param {string|Object} [options.message] Error response body/message when rate limit is exceeded
 * @param {boolean} [options.standardHeaders=true] Send draft-7 RFC RateLimit-* headers
 * @param {boolean} [options.legacyHeaders=true] Send X-RateLimit-* headers
 * @param {Function} [options.handler] Custom rate limit exceeded handler (req, res, next, options)
 * @param {Object} [options.redis] Optional override for redis helper module
 * @returns {import('express').RequestHandler} Express middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 100,
    prefix = "rl",
    keyGenerator = defaultKeyGenerator,
    skip = () => false,
    statusCode = 429,
    message = "Too many requests, please try again later.",
    standardHeaders = true,
    legacyHeaders = true,
    handler = null,
    redis = redisHelper,
  } = options;

  // Pre-calculate window duration in seconds (minimum 1 second)
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  return async function rateLimitMiddleware(req, res, next) {
    // 1. Bypass check (e.g., skip health checks or whitelisted calls)
    if (typeof skip === "function" && skip(req)) {
      return next();
    }

    // 2. Fail-Open Check: Verify Redis connection before attempting operation
    if (typeof redis.isRedisConnected === "function" && !redis.isRedisConnected()) {
      logger.debug("[RateLimiter] Redis offline. Failing open to allow traffic.");
      if (typeof res.setHeader === "function") {
        res.setHeader("X-RateLimit-Fallback", "true");
      }
      return next();
    }

    // 3. Generate key and execute atomic Lua script
    const clientIdentifier = keyGenerator(req);
    const redisKey = `${prefix}:${clientIdentifier}`;

    try {
      const result = await redis.safeEvalScript(
        RATE_LIMIT_LUA_SCRIPT,
        [redisKey],
        [windowSeconds],
      );

      // 4. Fail-Open Fallback: If safeEvalScript returns null (e.g. timeout or connection drop)
      if (!result || !Array.isArray(result) || result.length < 2) {
        logger.debug(
          `[RateLimiter] SafeEval returned null for '${redisKey}'. Failing open.`,
        );
        if (typeof res.setHeader === "function") {
          res.setHeader("X-RateLimit-Fallback", "true");
        }
        return next();
      }

      const currentCount = Number(result[0]);
      const ttlRemaining = Number(result[1]);
      const remaining = Math.max(0, max - currentCount);

      // 5. Set RFC and legacy RateLimit headers
      if (typeof res.setHeader === "function") {
        if (standardHeaders) {
          res.setHeader("RateLimit-Limit", max);
          res.setHeader("RateLimit-Remaining", remaining);
          res.setHeader("RateLimit-Reset", ttlRemaining);
        }
        if (legacyHeaders) {
          res.setHeader("X-RateLimit-Limit", max);
          res.setHeader("X-RateLimit-Remaining", remaining);
          res.setHeader("X-RateLimit-Reset", ttlRemaining);
        }
      }

      // 6. Check if client has exceeded the threshold
      if (currentCount > max) {
        logger.warn(
          `🚫 [RateLimiter] 429 Limit Exceeded for '${redisKey}': ${currentCount}/${max} (Window: ${windowSeconds}s, Reset in: ${ttlRemaining}s)`,
        );

        // Required HTTP/1.1 Retry-After header in seconds
        if (typeof res.setHeader === "function") {
          res.setHeader("Retry-After", ttlRemaining);
        }

        // Custom user handler support
        if (typeof handler === "function") {
          return handler(req, res, next, {
            current: currentCount,
            limit: max,
            ttl: ttlRemaining,
            windowSeconds,
          });
        }

        // Standardized enterprise JSON response
        const responseBody =
          typeof message === "object" && message !== null
            ? message
            : {
                status: "fail",
                statusCode,
                error: "Too Many Requests",
                message,
                retryAfter: ttlRemaining,
              };

        return res.status(statusCode).json(responseBody);
      }

      // Request allowed under threshold
      return next();
    } catch (err) {
      // 7. Defensive Fail-Open: Unexpected runtime errors never crash the pipeline
      logger.error(`[RateLimiter] Unexpected error: ${err.message}. Failing open.`);
      if (typeof res.setHeader === "function") {
        res.setHeader("X-RateLimit-Fallback", "true");
      }
      return next();
    }
  };
}

/**
 * Standard API Rate Limiter Preset (100 req / minute).
 */
const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  prefix: "rl:api",
});

/**
 * Strict Rate Limiter Preset for Auth / Simulation / Sensitive endpoints (10 req / minute).
 */
const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  prefix: "rl:strict",
  message: "Rate limit exceeded for sensitive operation. Please retry after the cooldown period.",
});

module.exports = createRateLimiter;
module.exports.createRateLimiter = createRateLimiter;
module.exports.apiRateLimiter = apiRateLimiter;
module.exports.strictRateLimiter = strictRateLimiter;
module.exports.RATE_LIMIT_LUA_SCRIPT = RATE_LIMIT_LUA_SCRIPT;
