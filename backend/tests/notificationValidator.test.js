const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// ── Schemas ───────────────────────────────────────────────────────────────────
const {
  addDeviceTokenBodySchema,
  removeDeviceTokenBodySchema,
  updatePreferencesBodySchema,
  updateSubscribedTagsBodySchema,
  triggerSimulationBodySchema,
  userIdParamsSchema,
} = require("../src/validators/notificationValidator");

// ── Validate middleware ────────────────────────────────────────────────────────
const validate = require("../src/middleware/validate");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates calling validate() middleware in a test context.
 * Returns { req (mutated), response { status, body } or null, nextCalled }
 */
async function runValidate(bodySchema, querySchema, paramsSchema, reqOverride = {}) {
  const req = {
    method: "PATCH",
    originalUrl: "/test",
    body: {},
    query: {},
    params: {},
    ...reqOverride,
  };

  let responseStatus = null;
  let responseBody = null;
  let nextCalled = false;

  const res = {
    status(code) {
      responseStatus = code;
      return {
        json(body) {
          responseBody = body;
        },
      };
    },
  };

  const middleware = validate(bodySchema, querySchema, paramsSchema);
  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { req, responseStatus, responseBody, nextCalled };
}

// ─────────────────────────────────────────────────────────────────────────────
// addDeviceTokenBodySchema
// ─────────────────────────────────────────────────────────────────────────────
describe("addDeviceTokenBodySchema", () => {
  test("accepts a valid fcmToken", () => {
    const result = addDeviceTokenBodySchema.safeParse({ fcmToken: "abc123token" });
    assert.equal(result.success, true);
    assert.equal(result.data.fcmToken, "abc123token");
  });

  test("rejects missing fcmToken", () => {
    const result = addDeviceTokenBodySchema.safeParse({});
    assert.equal(result.success, false);
    // Zod v4 uses generic type error instead of required_error for undefined fields
    const msg = result.error.issues[0].message;
    assert.ok(msg.length > 0, "should have an error message");
  });

  test("rejects empty or whitespace-only fcmToken string", () => {
    // Zod v4 applies .trim() first, so "   " becomes "" which fails .min(1)
    const result = addDeviceTokenBodySchema.safeParse({ fcmToken: "   " });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /not be empty|at least/i);
  });

  test("rejects fcmToken exceeding 512 chars", () => {
    const result = addDeviceTokenBodySchema.safeParse({ fcmToken: "a".repeat(513) });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /512/);
  });

  test("strips unknown fields", () => {
    const result = addDeviceTokenBodySchema.safeParse({
      fcmToken: "valid-token",
      __proto__: "evil",
      injected: true,
    });
    assert.equal(result.success, true);
    assert.equal(result.data.injected, undefined);
  });

  test("preserves optional tenantId", () => {
    const result = addDeviceTokenBodySchema.safeParse({
      fcmToken: "tok",
      tenantId: "acme",
    });
    assert.equal(result.success, true);
    assert.equal(result.data.tenantId, "acme");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updatePreferencesBodySchema
// ─────────────────────────────────────────────────────────────────────────────
describe("updatePreferencesBodySchema", () => {
  test("accepts valid preferences with at least one key", () => {
    const result = updatePreferencesBodySchema.safeParse({
      preferences: { email: true, push: false },
    });
    assert.equal(result.success, true);
    assert.equal(result.data.preferences.email, true);
    assert.equal(result.data.preferences.push, false);
  });

  test("rejects empty preferences object", () => {
    const result = updatePreferencesBodySchema.safeParse({ preferences: {} });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /at least one/i);
  });

  test("rejects non-boolean preference values", () => {
    const result = updatePreferencesBodySchema.safeParse({
      preferences: { email: "yes" },
    });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /boolean/i);
  });

  test("accepts partial preferences (only in_app)", () => {
    const result = updatePreferencesBodySchema.safeParse({
      preferences: { in_app: false },
    });
    assert.equal(result.success, true);
  });

  test("strips unknown keys inside preferences", () => {
    const result = updatePreferencesBodySchema.safeParse({
      preferences: { email: true, unknown_channel: true },
    });
    assert.equal(result.success, true);
    assert.equal(result.data.preferences.unknown_channel, undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateSubscribedTagsBodySchema
// ─────────────────────────────────────────────────────────────────────────────
describe("updateSubscribedTagsBodySchema", () => {
  test("accepts valid tags with replace mode", () => {
    const result = updateSubscribedTagsBodySchema.safeParse({
      tags: ["role:driver", "tier:gold"],
      mode: "replace",
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.data.tags, ["role:driver", "tier:gold"]);
  });

  test("defaults mode to 'replace' when omitted", () => {
    const result = updateSubscribedTagsBodySchema.safeParse({ tags: [] });
    assert.equal(result.success, true);
    assert.equal(result.data.mode, "replace");
  });

  test("accepts 'merge' mode", () => {
    const result = updateSubscribedTagsBodySchema.safeParse({
      tags: ["beta_users"],
      mode: "merge",
    });
    assert.equal(result.success, true);
    assert.equal(result.data.mode, "merge");
  });

  test("rejects invalid mode string", () => {
    const result = updateSubscribedTagsBodySchema.safeParse({
      tags: [],
      mode: "add",
    });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /replace.*merge|merge.*replace/i);
  });

  test("lowercases uppercase tag inputs (normalize, not reject)", () => {
    // tagSchema lowercases before regex check — "Driver" → "driver" → passes
    const result = updateSubscribedTagsBodySchema.safeParse({
      tags: ["Driver", "TIER:GOLD"],
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.data.tags, ["driver", "tier:gold"]);
  });

  test("rejects tags with dangerous special characters", () => {
    const result = updateSubscribedTagsBodySchema.safeParse({
      tags: ["<script>"],
    });
    assert.equal(result.success, false);
  });

  test("rejects more than 200 tags", () => {
    const result = updateSubscribedTagsBodySchema.safeParse({
      tags: Array.from({ length: 201 }, (_, i) => `tag${i}`),
    });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /200/);
  });

  test("accepts an empty tags array (clearing all tags)", () => {
    const result = updateSubscribedTagsBodySchema.safeParse({ tags: [] });
    assert.equal(result.success, true);
    assert.deepEqual(result.data.tags, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// triggerSimulationBodySchema
// ─────────────────────────────────────────────────────────────────────────────
describe("triggerSimulationBodySchema", () => {
  test("accepts a valid MULTICAST TAG_PUSH payload", () => {
    const result = triggerSimulationBodySchema.safeParse({
      type: "MULTICAST",
      scenario: "TAG_PUSH",
      tags: ["tier:gold"],
    });
    assert.equal(result.success, true);
  });

  test("rejects missing type", () => {
    const result = triggerSimulationBodySchema.safeParse({ scenario: "ALERT" });
    assert.equal(result.success, false);
  });

  test("rejects invalid scope value", () => {
    const result = triggerSimulationBodySchema.safeParse({
      type: "GROUPCAST",
      scenario: "WELCOME",
    });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /UNICAST|MULTICAST|BROADCAST/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// userIdParamsSchema
// ─────────────────────────────────────────────────────────────────────────────
describe("userIdParamsSchema", () => {
  test("accepts a valid userId param", () => {
    const result = userIdParamsSchema.safeParse({ userId: "usr_abc123" });
    assert.equal(result.success, true);
  });

  test("rejects empty userId", () => {
    const result = userIdParamsSchema.safeParse({ userId: "" });
    assert.equal(result.success, false);
  });

  test("rejects userId over 128 chars", () => {
    const result = userIdParamsSchema.safeParse({ userId: "x".repeat(129) });
    assert.equal(result.success, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate() middleware integration
// ─────────────────────────────────────────────────────────────────────────────
describe("validate() middleware", () => {
  test("calls next() when body is valid", async () => {
    const { nextCalled, responseStatus } = await runValidate(
      addDeviceTokenBodySchema,
      null,
      null,
      { body: { fcmToken: "valid-token-string" } }
    );
    assert.equal(nextCalled, true);
    assert.equal(responseStatus, null);
  });

  test("returns 400 with structured errors when body is invalid", async () => {
    const { nextCalled, responseStatus, responseBody } = await runValidate(
      addDeviceTokenBodySchema,
      null,
      null,
      { body: {} }
    );
    assert.equal(nextCalled, false);
    assert.equal(responseStatus, 400);
    assert.equal(responseBody.status, "fail");
    assert.equal(responseBody.statusCode, 400);
    assert.equal(responseBody.error, "Validation Error");
    assert.ok(Array.isArray(responseBody.errors));
    assert.ok(responseBody.errors.length > 0);
    assert.equal(responseBody.errors[0].source, "body");
    assert.ok(typeof responseBody.errors[0].field === "string");
    assert.ok(typeof responseBody.errors[0].message === "string");
  });

  test("validates req.params separately", async () => {
    const { nextCalled, responseStatus, responseBody } = await runValidate(
      null,
      null,
      userIdParamsSchema,
      { params: { userId: "" } }
    );
    assert.equal(nextCalled, false);
    assert.equal(responseStatus, 400);
    assert.equal(responseBody.errors[0].source, "params");
  });

  test("mutates req.body with Zod-transformed values (trim, lowercase tags)", async () => {
    const { req, nextCalled } = await runValidate(
      updateSubscribedTagsBodySchema,
      null,
      null,
      { body: { tags: ["  Role:Driver  ", "TIER:GOLD"] } }
    );
    // Zod v4 .trim().toLowerCase() runs before .regex(), so mixed-case normalised tags
    // are valid and the controller receives clean lowercase data
    assert.equal(nextCalled, true);
    assert.deepEqual(req.body.tags, ["role:driver", "tier:gold"]);
    assert.equal(req.body.mode, "replace");
  });

  test("aggregates errors from both body and params before responding", async () => {
    const { responseBody, responseStatus } = await runValidate(
      addDeviceTokenBodySchema,
      null,
      userIdParamsSchema,
      { body: {}, params: { userId: "" } }
    );
    assert.equal(responseStatus, 400);
    // Should have at least one error from body and one from params
    const sources = responseBody.errors.map((e) => e.source);
    assert.ok(sources.includes("body"));
    assert.ok(sources.includes("params"));
  });

  test("skips validation when no schema is provided", async () => {
    const { nextCalled } = await runValidate(null, null, null, {
      body: { anything: "goes" },
    });
    assert.equal(nextCalled, true);
  });
});
