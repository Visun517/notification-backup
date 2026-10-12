const { createClient } = require("redis");
const logger = require("../utils/logger");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Configure reconnection strategy to avoid runaway connection loops
 * while allowing automatic recovery from transient network issues.
 */
const clientOptions = {
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 5) {
        logger.warn("⚠️ [Redis] Max reconnect attempts reached. Operating in fallback mode.");
        return new Error("Max reconnection attempts reached");
      }
      return Math.min(retries * 500, 3000);
    },
    connectTimeout: 5000,
  },
};

// 1. Primary Redis Client (Key-value caching, counters, idempotency)
const redisClient = createClient(clientOptions);

// 2. Publisher and Subscriber Clients (For @socket.io/redis-adapter)
const pubClient = redisClient.duplicate();
const subClient = redisClient.duplicate();

let isConnected = false;

// Graceful error logging
redisClient.on("error", (err) => {
  isConnected = false;
  logger.error(`❌ [Redis Client Error]: ${err.message}`);
});
redisClient.on("ready", () => {
  isConnected = true;
  logger.info("🔌 [Redis Client] Connected and ready.");
});

pubClient.on("error", (err) => {
  logger.error(`❌ [Redis Pub Client Error]: ${err.message}`);
});
subClient.on("error", (err) => {
  logger.error(`❌ [Redis Sub Client Error]: ${err.message}`);
});

/**
 * Asynchronously initialize and connect all Redis clients.
 * Gracefully handles connection failures without crashing the application.
 */
async function initRedis() {
  try {
    await Promise.all([
      redisClient.connect(),
      pubClient.connect(),
      subClient.connect(),
    ]);
    isConnected = true;
    logger.info("✅ [Redis] All clients (Standard, Pub, Sub) connected successfully.");
    return true;
  } catch (err) {
    isConnected = false;
    logger.warn(
      `⚠️ [Redis] Unable to connect to Redis at ${redisUrl}: ${err.message}. Running in graceful fallback mode.`,
    );
    return false;
  }
}

/**
 * Check if Redis primary client is currently connected.
 */
function isRedisConnected() {
  return isConnected && redisClient.isOpen;
}

/**
 * Safe Get with fallback
 */
async function safeGet(key) {
  if (!isRedisConnected()) return null;
  try {
    return await redisClient.get(key);
  } catch (err) {
    logger.error(`[Redis] safeGet error for key '${key}': ${err.message}`);
    return null;
  }
}

/**
 * Safe Set with TTL in seconds
 */
async function safeSet(key, value, ttlSeconds = null) {
  if (!isRedisConnected()) return false;
  try {
    const valStr = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (ttlSeconds) {
      await redisClient.set(key, valStr, { EX: ttlSeconds });
    } else {
      await redisClient.set(key, valStr);
    }
    return true;
  } catch (err) {
    logger.error(`[Redis] safeSet error for key '${key}': ${err.message}`);
    return false;
  }
}

/**
 * Safe SETNX with TTL (Atomic Idempotency Guard).
 * Returns true if key was set (first time), false if key already exists (duplicate).
 */
async function safeSetNx(key, value, ttlSeconds = 600) {
  if (!isRedisConnected()) {
    // If Redis is not connected, fail-open (allow delivery)
    return true;
  }
  try {
    const valStr = typeof value === "object" ? JSON.stringify(value) : String(value);
    const result = await redisClient.set(key, valStr, { NX: true, EX: ttlSeconds });
    return result === "OK";
  } catch (err) {
    logger.error(`[Redis] safeSetNx error for key '${key}': ${err.message}`);
    return true; // Fail-open
  }
}

/**
 * Safe Atomic INCR
 */
async function safeIncr(key) {
  if (!isRedisConnected()) return null;
  try {
    return await redisClient.incr(key);
  } catch (err) {
    logger.error(`[Redis] safeIncr error for key '${key}': ${err.message}`);
    return null;
  }
}

/**
 * Safe Atomic DECR (with non-negative floor) — Atomic Lua implementation.
 * Uses a Lua script to atomically decrement and clamp to 0 in a single
 * Redis round-trip, preventing race conditions where two concurrent
 * callers both see a negative value and both reset to zero.
 */
const SAFE_DECR_SCRIPT = `
  local v = redis.call('DECR', KEYS[1])
  if v < 0 then
    redis.call('SET', KEYS[1], '0')
    return 0
  end
  return v
`;

async function safeDecr(key) {
  if (!isRedisConnected()) return null;
  try {
    const result = await redisClient.eval(SAFE_DECR_SCRIPT, {
      keys: [key],
      arguments: [],
    });
    return Number(result);
  } catch (err) {
    logger.error(`[Redis] safeDecr error for key '${key}': ${err.message}`);
    return null;
  }
}

/**
 * Safe Del
 */
async function safeDel(key) {
  if (!isRedisConnected()) return false;
  try {
    await redisClient.del(key);
    return true;
  } catch (err) {
    logger.error(`[Redis] safeDel error for key '${key}': ${err.message}`);
    return false;
  }
}

/**
 * Safe Eval — executes an arbitrary Lua script atomically on the Redis server.
 * Used by rate limiters and other components that require compound atomic operations.
 *
 * @param {string} script   - Lua script source
 * @param {string[]} keys   - KEYS[] array passed to the script
 * @param {string[]} args   - ARGV[] array passed to the script
 * @returns {Promise<any>}  - Script return value, or null on error/disconnect
 */
async function safeEvalScript(script, keys = [], args = []) {
  if (!isRedisConnected()) return null;
  try {
    const result = await redisClient.eval(script, {
      keys,
      arguments: args.map(String),
    });
    return result;
  } catch (err) {
    logger.error(`[Redis] safeEvalScript error: ${err.message}`);
    return null;
  }
}

module.exports = {
  redisClient,
  pubClient,
  subClient,
  initRedis,
  isRedisConnected,
  safeGet,
  safeSet,
  safeSetNx,
  safeIncr,
  safeDecr,
  safeDel,
  safeEvalScript,
};
