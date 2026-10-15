const NotificationProfile = require("../models/NotificationProfile");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");
const redisHelper = require("../config/redisClient");

/**
 * Profile Controller — Notification Engine Subscription Registry.
 *
 * Manages the decoupled NotificationProfile records that the engine
 * maintains independently from the host application's User model.
 */

// ---------------------------------------------------------------------------
// Helper: invalidate the preferences cache for this user so the next
// notification send fetches fresh data from the DB.
// ---------------------------------------------------------------------------
async function invalidatePrefCache(userId, tenantId) {
  const prefKey = `tenant:${tenantId}:user:${userId}:preferences`;
  await redisHelper.safeDel(prefKey);
  if (tenantId === "default") {
    await redisHelper.safeDel(`user:${userId}:preferences`);
  }
}

// ---------------------------------------------------------------------------
// 1. Add Device Token
// PATCH /api/notifications/profile/:userId/token
// ---------------------------------------------------------------------------
exports.addDeviceToken = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { fcmToken, tenantId: bodyTenantId } = req.body;

  if (!fcmToken) {
    return next(new AppError("fcmToken is required in the request body.", 400));
  }

  const tenantId =
    req.headers["x-tenant-id"] || bodyTenantId || req.user?.tenantId || "default";

  // upsert: create the profile if it doesn't exist yet;
  // $addToSet: prevent the same token from appearing twice.
  const profile = await NotificationProfile.findOneAndUpdate(
    { userId, tenantId },
    { $addToSet: { fcmTokens: fcmToken } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info(
    `📱 [ProfileController] FCM token registered for User ${userId} [Tenant: ${tenantId}]`,
  );

  res.status(200).json({
    status: "success",
    message: "Device token registered successfully.",
    data: { userId: profile.userId, tokenCount: profile.fcmTokens.length },
  });
});

// ---------------------------------------------------------------------------
// 2. Remove Device Token (on logout / token rotation)
// DELETE /api/notifications/profile/:userId/token
// ---------------------------------------------------------------------------
exports.removeDeviceToken = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { fcmToken, tenantId: bodyTenantId } = req.body;

  if (!fcmToken) {
    return next(new AppError("fcmToken is required in the request body.", 400));
  }

  const tenantId =
    req.headers["x-tenant-id"] || bodyTenantId || req.user?.tenantId || "default";

  const profile = await NotificationProfile.findOneAndUpdate(
    { userId, tenantId },
    { $pull: { fcmTokens: fcmToken } },
    { new: true },
  );

  if (!profile) {
    return next(new AppError("No notification profile found for this user.", 404));
  }

  logger.info(
    `🗑️  [ProfileController] FCM token removed for User ${userId} [Tenant: ${tenantId}]`,
  );

  res.status(200).json({
    status: "success",
    message: "Device token removed successfully.",
    data: { userId: profile.userId, tokenCount: profile.fcmTokens.length },
  });
});

// ---------------------------------------------------------------------------
// 3. Update Notification Preferences
// PATCH /api/notifications/profile/:userId/preferences
// ---------------------------------------------------------------------------
exports.updatePreferences = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { preferences, tenantId: bodyTenantId } = req.body;

  if (!preferences || typeof preferences !== "object") {
    return next(
      new AppError("A 'preferences' object is required in the request body.", 400),
    );
  }

  // Whitelist accepted keys to prevent arbitrary field injection
  const allowedKeys = ["email", "push", "sms", "in_app"];
  const sanitized = {};
  for (const key of allowedKeys) {
    if (typeof preferences[key] === "boolean") {
      sanitized[`preferences.${key}`] = preferences[key];
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return next(
      new AppError(
        "No valid preference keys provided. Allowed: email, push, sms, in_app.",
        400,
      ),
    );
  }

  const tenantId =
    req.headers["x-tenant-id"] || bodyTenantId || req.user?.tenantId || "default";

  const profile = await NotificationProfile.findOneAndUpdate(
    { userId, tenantId },
    { $set: sanitized },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Invalidate the Redis preference cache so the next notification
  // dispatch fetches the updated preferences from the DB.
  await invalidatePrefCache(userId, tenantId);

  logger.info(
    `⚙️  [ProfileController] Preferences updated for User ${userId} [Tenant: ${tenantId}]`,
  );

  res.status(200).json({
    status: "success",
    message: "Notification preferences updated successfully.",
    data: { userId: profile.userId, preferences: profile.preferences },
  });
});
