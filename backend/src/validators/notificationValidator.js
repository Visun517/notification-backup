const { z } = require("zod");

/**
 * Enterprise Notification Validation Schemas.
 *
 * All schemas are built with Zod and are intentionally strict:
 *   - Unknown fields are stripped (z.object().strict() or .strip())
 *   - Error messages are human-readable for API consumers
 *   - Each schema is a pure declaration — no side effects
 *
 * Designed for use with the reusable `validate` middleware (middleware/validate.js).
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * FCM Token: non-empty string with a practical length ceiling.
 * Real FCM tokens are ~163 characters, but we leave generous headroom
 * in case the FCM spec evolves.
 */
const fcmTokenSchema = z
  .string({ required_error: "fcmToken is required." })
  .trim()
  .min(1,  { message: "fcmToken must not be empty." })
  .max(512, { message: "fcmToken exceeds maximum allowed length of 512 characters." });

/**
 * Tag string: lowercase alphanumeric with colon, hyphen, and underscore.
 * Mirrors the sanitization applied in profileController and notificationHandler.
 * Example valid tags: "role:driver", "tier:gold", "region-eu", "beta_users"
 */
const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1,   { message: "Each tag must be a non-empty string." })
  .max(128, { message: "Each tag must be 128 characters or fewer." })
  .regex(
    /^[a-z0-9:_\-\.~%]+$/,
    { message: "Tags may only contain lowercase letters, digits, and the characters :_-.~%" }
  );

// ---------------------------------------------------------------------------
// Schema: Device Token Registration
// PATCH /api/notifications/profile/:userId/token
// ---------------------------------------------------------------------------

/**
 * Body schema for registering an FCM device token.
 * `tenantId` is optional — the controller resolves it from headers/JWT if absent.
 */
const addDeviceTokenBodySchema = z
  .object({
    fcmToken: fcmTokenSchema,
    // Optional tenant override in the body (header x-tenant-id takes precedence in controller)
    tenantId: z.string().trim().max(64).optional(),
  })
  .strip(); // Silently drop any unknown fields — prevents prototype-pollution-style abuse

/**
 * Body schema for removing an FCM device token.
 */
const removeDeviceTokenBodySchema = addDeviceTokenBodySchema; // Identical structure

// ---------------------------------------------------------------------------
// Schema: Notification Preferences
// PATCH /api/notifications/profile/:userId/preferences
// ---------------------------------------------------------------------------

/**
 * Preferences object sub-schema.
 * Every channel is individually optional so callers can update a single
 * channel without resetting the others.
 * At least ONE key must be provided — enforced via the .refine() superRefine below.
 */
const preferencesObjectSchema = z
  .object({
    email:  z.boolean({ invalid_type_error: "email must be a boolean." }).optional(),
    push:   z.boolean({ invalid_type_error: "push must be a boolean." }).optional(),
    sms:    z.boolean({ invalid_type_error: "sms must be a boolean." }).optional(),
    in_app: z.boolean({ invalid_type_error: "in_app must be a boolean." }).optional(),
  })
  .strip()
  .superRefine((prefs, ctx) => {
    // Guard against a completely empty preferences object
    const hasAtLeastOneKey = Object.values(prefs).some((v) => v !== undefined);
    if (!hasAtLeastOneKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "preferences must include at least one of: email, push, sms, in_app.",
        path: [],
      });
    }
  });

/**
 * Full body schema for the preferences endpoint.
 */
const updatePreferencesBodySchema = z
  .object({
    preferences: preferencesObjectSchema,
    tenantId: z.string().trim().max(64).optional(),
  })
  .strip();

// ---------------------------------------------------------------------------
// Schema: Subscribed Tags
// PATCH /api/notifications/profile/:userId/tags
// ---------------------------------------------------------------------------

/**
 * Body schema for updating tag subscriptions.
 *
 * Rules:
 * - `tags` must be an array (may be empty — clearing all tags is valid)
 * - Maximum 200 tags per profile to prevent unbounded sets
 * - Each tag matches the shared tagSchema (lowercase, allowed chars)
 * - `mode` defaults to "replace" if omitted
 */
const updateSubscribedTagsBodySchema = z
  .object({
    tags: z
      .array(tagSchema, { required_error: "'tags' is required and must be an array." })
      .max(200, { message: "A user may subscribe to at most 200 tags at once." }),
    mode: z
      .enum(["replace", "merge"], {
        errorMap: () => ({ message: "mode must be either 'replace' or 'merge'." }),
      })
      .default("replace"),
    tenantId: z.string().trim().max(64).optional(),
  })
  .strip();

// ---------------------------------------------------------------------------
// Schema: Route params (shared)
// ---------------------------------------------------------------------------

/**
 * Validates :userId route parameter.
 * Accepts any non-empty string — the engine is auth-system agnostic (UUID, ObjectId, etc.)
 */
const userIdParamsSchema = z.object({
  userId: z
    .string({ required_error: "userId route parameter is required." })
    .min(1,   { message: "userId must not be empty." })
    .max(128, { message: "userId must be 128 characters or fewer." })
    .trim(),
});

// ---------------------------------------------------------------------------
// Schema: Simulation / Trigger (sensitive endpoint)
// POST /api/notifications/simulate-system-update
// ---------------------------------------------------------------------------

/**
 * Validates the simulation trigger body.
 * Both `type` and `scenario` are required; optional fields have safe defaults.
 */
const triggerSimulationBodySchema = z
  .object({
    type: z.enum(["UNICAST", "MULTICAST", "BROADCAST"], {
      errorMap: () => ({
        message: "type must be one of: UNICAST, MULTICAST, BROADCAST.",
      }),
    }),
    scenario: z
      .enum(["WELCOME", "TAG_PUSH", "ALERT", "BROADCAST_ALL", "MAINTENANCE"], {
        errorMap: () => ({
          message:
            "scenario must be one of: WELCOME, TAG_PUSH, ALERT, BROADCAST_ALL, MAINTENANCE.",
        }),
      }),
    recipientId: z.string().trim().max(128).optional(),
    tags: z.array(tagSchema).max(200).optional(),
    channels: z
      .array(z.enum(["IN_APP", "PUSH", "EMAIL", "SMS", "WEBHOOK"]))
      .optional(),
    title:    z.string().trim().min(1).max(200).optional(),
    message:  z.string().trim().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strip();

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Individual schemas for named import
  addDeviceTokenBodySchema,
  removeDeviceTokenBodySchema,
  updatePreferencesBodySchema,
  updateSubscribedTagsBodySchema,
  triggerSimulationBodySchema,
  userIdParamsSchema,

  // Shared sub-schemas (exported for unit tests or extension)
  fcmTokenSchema,
  tagSchema,
  preferencesObjectSchema,
};
