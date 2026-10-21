const { ZodError } = require("zod");
const logger = require("../utils/logger");

/**
 * Reusable Zod Validation Middleware Factory.
 *
 * Creates an Express middleware that validates `req.body`, `req.query`,
 * and/or `req.params` against a given Zod schema before the request
 * reaches the controller. On failure it returns a standardized HTTP 400
 * response with a machine-readable `errors` array — ideal for API consumers
 * (frontend forms, mobile clients, third-party integrations).
 *
 * On success, the middleware mutates the request with the parsed & transformed
 * values (e.g. trimmed strings, defaults applied by Zod) so the controller
 * always receives clean, type-safe data.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * USAGE
 * ──────────────────────────────────────────────────────────────────────────
 *   const validate = require("./validate");
 *   const { addDeviceTokenBodySchema } = require("../validators/notificationValidator");
 *
 *   // Validate req.body only:
 *   router.patch("/profile/:userId/token", validate(addDeviceTokenBodySchema), addDeviceToken);
 *
 *   // Validate req.params only:
 *   router.patch("/profile/:userId/token", validate(null, null, userIdParamsSchema), addDeviceToken);
 *
 *   // Validate req.body + req.params together:
 *   router.patch(
 *     "/profile/:userId/token",
 *     validate(addDeviceTokenBodySchema, null, userIdParamsSchema),
 *     addDeviceToken
 *   );
 * ──────────────────────────────────────────────────────────────────────────
 *
 * @param {import("zod").ZodSchema | null} bodySchema  - Zod schema for req.body (pass null to skip)
 * @param {import("zod").ZodSchema | null} querySchema - Zod schema for req.query (pass null to skip)
 * @param {import("zod").ZodSchema | null} paramsSchema - Zod schema for req.params (pass null to skip)
 * @returns {import("express").RequestHandler}
 */
function validate(bodySchema = null, querySchema = null, paramsSchema = null) {
  return async function validationMiddleware(req, res, next) {
    // Collect all Zod issues from all three sources before short-circuiting,
    // so the client receives a complete error list in one response.
    const allIssues = [];

    // 1. Validate req.params
    if (paramsSchema) {
      try {
        req.params = paramsSchema.parse(req.params);
      } catch (err) {
        if (err instanceof ZodError) {
          allIssues.push(
            ...err.issues.map((issue) => ({
              source: "params",
              field: issue.path.join("."),
              message: issue.message,
            }))
          );
        } else {
          // Defensive: unexpected runtime error in schema itself — log and pass through
          logger.error(`[Validate] Unexpected params schema error: ${err.message}`);
        }
      }
    }

    // 2. Validate req.query
    if (querySchema) {
      try {
        req.query = querySchema.parse(req.query);
      } catch (err) {
        if (err instanceof ZodError) {
          allIssues.push(
            ...err.issues.map((issue) => ({
              source: "query",
              field: issue.path.join("."),
              message: issue.message,
            }))
          );
        } else {
          logger.error(`[Validate] Unexpected query schema error: ${err.message}`);
        }
      }
    }

    // 3. Validate req.body
    if (bodySchema) {
      try {
        req.body = bodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          allIssues.push(
            ...err.issues.map((issue) => ({
              source: "body",
              field: issue.path.join("."),
              message: issue.message,
            }))
          );
        } else {
          logger.error(`[Validate] Unexpected body schema error: ${err.message}`);
        }
      }
    }

    // 4. If any issues were found, return a standardized 400 response
    if (allIssues.length > 0) {
      logger.warn(
        `[Validate] Validation failed for ${req.method} ${req.originalUrl} — ${allIssues.length} error(s)`
      );

      return res.status(400).json({
        status: "fail",
        statusCode: 400,
        error: "Validation Error",
        message: `${allIssues.length} validation error(s). See 'errors' for details.`,
        errors: allIssues,
      });
    }

    // 5. All good — pass control to the next middleware / controller
    return next();
  };
}

module.exports = validate;
