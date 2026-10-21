const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const createRateLimiter = require("../src/middleware/rateLimitMiddleware");
const redisClientModule = require("../src/config/redisClient");

describe("Rate Limiter Middleware", () => {
  beforeEach(() => {
    // Reset defaults before each test
    redisClientModule.isRedisConnected = () => true;
  });

  test("should allow requests under limit and set proper RFC & legacy headers", async () => {
    redisClientModule.safeEvalScript = async () => [1, 60];

    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 5,
    });

    const headers = {};
    const req = { ip: "192.168.1.10", headers: {} };
    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
    };

    let nextCalled = false;
    await limiter(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(headers["RateLimit-Limit"], 5);
    assert.equal(headers["RateLimit-Remaining"], 4);
    assert.equal(headers["RateLimit-Reset"], 60);
    assert.equal(headers["X-RateLimit-Limit"], 5);
    assert.equal(headers["X-RateLimit-Remaining"], 4);
    assert.equal(headers["X-RateLimit-Reset"], 60);
  });

  test("should return 429 and Retry-After when limit is exceeded", async () => {
    redisClientModule.safeEvalScript = async () => [6, 45];

    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 5,
    });

    const headers = {};
    let statusSent = null;
    let jsonSent = null;

    const req = { ip: "192.168.1.10", headers: {} };
    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
      status: (code) => {
        statusSent = code;
        return {
          json: (body) => {
            jsonSent = body;
          },
        };
      },
    };

    let nextCalled = false;
    await limiter(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(statusSent, 429);
    assert.equal(headers["Retry-After"], 45);
    assert.equal(headers["RateLimit-Remaining"], 0);
    assert.equal(jsonSent.statusCode, 429);
    assert.equal(jsonSent.status, "fail");
    assert.equal(jsonSent.retryAfter, 45);
  });

  test("should support custom tenant/user key generation", async () => {
    let evaluatedKey = null;
    redisClientModule.safeEvalScript = async (script, keys) => {
      evaluatedKey = keys[0];
      return [1, 60];
    };

    const limiter = createRateLimiter({
      prefix: "test-rl",
    });

    const req = {
      tenantId: "tenant_alpha",
      userId: "user_123",
      headers: {},
    };
    const res = { setHeader: () => {} };

    await limiter(req, res, () => {});

    assert.equal(evaluatedKey, "test-rl:tenant:tenant_alpha:user:user_123");
  });

  test("should fail open if Redis is disconnected", async () => {
    redisClientModule.isRedisConnected = () => false;

    const limiter = createRateLimiter({ max: 5 });
    const headers = {};
    const req = { ip: "10.0.0.1", headers: {} };
    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
    };

    let nextCalled = false;
    await limiter(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(headers["X-RateLimit-Fallback"], "true");
  });

  test("should fail open if safeEvalScript returns null", async () => {
    redisClientModule.safeEvalScript = async () => null;

    const limiter = createRateLimiter({ max: 5 });
    const headers = {};
    const req = { ip: "10.0.0.1", headers: {} };
    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
    };

    let nextCalled = false;
    await limiter(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(headers["X-RateLimit-Fallback"], "true");
  });

  test("should fail open if an unexpected runtime error is thrown", async () => {
    redisClientModule.safeEvalScript = async () => {
      throw new Error("Redis cluster failover in progress");
    };

    const limiter = createRateLimiter({ max: 5 });
    const headers = {};
    const req = { ip: "10.0.0.1", headers: {} };
    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
    };

    let nextCalled = false;
    await limiter(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(headers["X-RateLimit-Fallback"], "true");
  });

  test("should bypass rate limiter when skip returns true", async () => {
    const limiter = createRateLimiter({
      skip: (req) => req.path === "/health",
    });

    const req = { path: "/health", headers: {} };
    const res = { setHeader: () => {} };

    let nextCalled = false;
    await limiter(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  });

  test("should invoke custom handler when threshold is exceeded", async () => {
    redisClientModule.safeEvalScript = async () => [15, 30];

    let customHandlerInvoked = false;
    const limiter = createRateLimiter({
      max: 10,
      handler: (req, res, next, info) => {
        customHandlerInvoked = true;
        assert.equal(info.current, 15);
        assert.equal(info.limit, 10);
        assert.equal(info.ttl, 30);
      },
    });

    const req = { ip: "127.0.0.1", headers: {} };
    const res = { setHeader: () => {} };

    await limiter(req, res, () => {});
    assert.equal(customHandlerInvoked, true);
  });

  test("presets apiRateLimiter and strictRateLimiter should be properly configured functions", () => {
    const { apiRateLimiter, strictRateLimiter } = createRateLimiter;
    assert.equal(typeof apiRateLimiter, "function");
    assert.equal(typeof strictRateLimiter, "function");
  });
});
