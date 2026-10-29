const mongoose = require("mongoose");
const crypto = require("crypto");
const Notification = require("../models/Notification");
const NotificationProfile = require("../models/NotificationProfile");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");
const { templateEngine } = require("../utils/TemplateEngine");
const { channelRegistry } = require("../registry/ChannelRegistry");
const {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
} = require("../constants/notificationConstants");
const redisHelper = require("../config/redisClient");
const queueHelper = require("../queues/notificationQueue");

/**
 * Enterprise Notification Service.
 * Decouples ingestion from delivery using an asynchronous BullMQ queue pipeline:
 * 1. Distributed Idempotency Guard (Redis SETNX with 10m TTL)
 * 2. Handlebars Template Compilation
 * 3. User Notification Preferences Caching & Pre-filtering (24h TTL)
 * 4. Fast MongoDB Persistence with status 'QUEUED'
 * 5. Atomic Redis Unread Count Increment
 * 6. BullMQ Queue Enqueueing with Exponential Backoff & DLQ
 *
 * @param {Object} arg1 - Notification payload or legacy Socket.io instance
 * @param {Object} [arg2={}] - Options or legacy notification payload
 * @returns {Promise<Object>} Persisted Notification document with { queued: true, jobId }
 */
const sendNotification = async (arg1, arg2 = {}) => {
  try {
    // 1. Support both decoupled and legacy signatures
    const isLegacyCall = arg1 && (typeof arg1.emit === "function" || typeof arg1.to === "function");
    const io = isLegacyCall ? arg1 : (arg2.io || null);
    const data = isLegacyCall ? arg2 : arg1;
    const options = isLegacyCall ? {} : arg2;

    if (!data || typeof data !== "object") {
      throw new AppError("Notification payload is required", 400);
    }

    const activeRegistry = options.registry || channelRegistry;

    // Ensure SocketChannelProvider has io if provided
    if (io) {
      const socketProvider = activeRegistry.getProvider(NOTIFICATION_CHANNELS.IN_APP);
      if (socketProvider && typeof socketProvider.setIo === "function") {
        socketProvider.setIo(io);
      }
    }

    const tenantId = data.tenantId || options.tenantId || "default";

    // 2. IDEMPOTENCY GUARD (Redis SETNX with 10-minute TTL, partitioned by tenantId)
    const idempotencyKey =
      data.idempotencyKey ||
      options.idempotencyKey ||
      crypto
        .createHash("sha256")
        .update(
          `${tenantId}:${data.recipientId || ""}:${data.scope || ""}:${data.title || ""}:${data.message || ""}:${JSON.stringify(data.tags || [])}`,
        )
        .digest("hex");

    const idempotencyRedisKey = `tenant:${tenantId}:notif:idempotency:${idempotencyKey}`;
    const legacyIdempotencyKey = `notif:idempotency:${idempotencyKey}`;
    const isUnique = await redisHelper.safeSetNx(idempotencyRedisKey, "PENDING", 600); // 10 minutes
    if (tenantId === "default") {
      await redisHelper.safeSetNx(legacyIdempotencyKey, "PENDING", 600);
    }

    if (!isUnique) {
      try {
        const { emitLiveLog } = require("../utils/adminLogEmitter");
        emitLiveLog({
          level: "WARN",
          event: "IDEMPOTENCY_BLOCKED",
          message: `Duplicate dispatch suppressed by Idempotency Guard: "${data.title || "Untitled"}" [Tenant: ${tenantId}]`,
          tenantId,
          details: {
            idempotencyKey,
            scope: data.scope,
            title: data.title,
            recipientId: data.recipientId,
          },
        });
      } catch (_) {}
      logger.warn(
        `⚠️ [NotificationService] Duplicate dispatch blocked by Idempotency Guard: Tenant=${tenantId}, Key=${idempotencyKey}`,
      );
      return {
        deduplicated: true,
        message: "Duplicate notification suppressed by idempotency guard",
        idempotencyKey,
        tenantId,
      };
    }

    // 3. Compile message templates (e.g. "Hello {{name}}") using TemplateEngine
    const renderedContent = templateEngine.renderNotification(data, options.templateContext || {});
    const processedData = {
      ...data,
      title: renderedContent.title || data.title,
      message: renderedContent.message || data.message,
    };

    // 4. USER PREFERENCES CACHING & CHANNEL FILTERING
    let targetChannels = Array.isArray(processedData.channels) && processedData.channels.length > 0
      ? [...processedData.channels]
      : [NOTIFICATION_CHANNELS.IN_APP];

    if (processedData.recipientId) {
      const prefKey = `tenant:${tenantId}:user:${processedData.recipientId}:preferences`;
      const legacyPrefKey = `user:${processedData.recipientId}:preferences`;
      let preferences = null;

      let cachedPref = await redisHelper.safeGet(prefKey);
      if (!cachedPref && tenantId === "default") {
        cachedPref = await redisHelper.safeGet(legacyPrefKey);
      }
      if (cachedPref) {
        try {
          preferences = typeof cachedPref === "string" ? JSON.parse(cachedPref) : cachedPref;
        } catch (e) {
          preferences = null;
        }
      }

      if (!preferences) {
        try {
          // Query the engine's own decoupled NotificationProfile instead of the
          // host app's User model, breaking the tight coupling.
          const profile = await NotificationProfile.findOne({
            userId: String(processedData.recipientId),
            tenantId,
          }).select("preferences");

          if (profile && profile.preferences) {
            // Remap flat profile keys (email/push/sms/in_app) to engine channel constants
            const p = profile.preferences;
            preferences = {
              channels: {
                IN_APP:  p.in_app  !== false,
                PUSH:    p.push    !== false,
                EMAIL:   p.email   !== false,
                SMS:     p.sms     !== false,
                WEBHOOK: true, // WEBHOOK has no preference field — defaults on
              },
            };
          }
        } catch (dbErr) {
          logger.debug(`NotificationProfile preferences query bypassed: ${dbErr.message}`);
        }

        if (!preferences) {
          preferences = {
            channels: { IN_APP: true, PUSH: true, EMAIL: true, SMS: true, WEBHOOK: true },
          };
        }
        await redisHelper.safeSet(prefKey, preferences, 86400); // 24-hour TTL
        if (tenantId === "default") {
          await redisHelper.safeSet(legacyPrefKey, preferences, 86400);
        }
      }

      // Filter target channels based on user preferences
      if (preferences && preferences.channels) {
        const prefChannels = preferences.channels;
        targetChannels = targetChannels.filter((channel) => {
          if (prefChannels[channel] === false) {
            logger.info(
              `🚫 [NotificationService] Channel '${channel}' filtered out by user preference for User ${processedData.recipientId} (Tenant: ${tenantId})`,
            );
            return false;
          }
          return true;
        });
      }
    }

    // 5. Persist notification to database with initial status 'QUEUED' and tenantId
    const newNotification = await Notification.create({
      ...processedData,
      tenantId,
      channels: targetChannels,
      status: NOTIFICATION_STATUSES.QUEUED,
    });
    logger.info(`💾 Notification saved to DB as QUEUED: ${newNotification._id} [Tenant: ${tenantId}]`);

    // Update idempotency key with generated notification ID
    await redisHelper.safeSet(idempotencyRedisKey, newNotification._id.toString(), 600);
    if (tenantId === "default") {
      await redisHelper.safeSet(legacyIdempotencyKey, newNotification._id.toString(), 600);
    }

    // 6. CACHE-ASIDE: ATOMIC UNREAD COUNT INCREMENT (partitioned by tenantId)
    // Only UNICAST notifications contribute to the per-user unread counter.
    // BROADCAST/MULTICAST messages use the NotificationReadStatus table instead.
    // TTL of 7 days prevents counter keys from living forever if never read.
    if (newNotification.scope === "UNICAST" && newNotification.recipientId) {
      const UNREAD_INCR_SCRIPT = `
        local v = redis.call('INCR', KEYS[1])
        if v == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return v
      `;
      const TTL_7_DAYS = 7 * 24 * 3600;
      const countKey = `tenant:${tenantId}:user:${newNotification.recipientId}:unread_count`;
      await redisHelper.safeEvalScript(UNREAD_INCR_SCRIPT, [countKey], [TTL_7_DAYS]);
      if (tenantId === "default") {
        const legacyKey = `user:${newNotification.recipientId}:unread_count`;
        await redisHelper.safeEvalScript(UNREAD_INCR_SCRIPT, [legacyKey], [TTL_7_DAYS]);
      }
    }

    // 7. ENQUEUE INTO ASYNCHRONOUS BULLMQ PIPELINE
    let job = null;
    try {
      const enqueueFn = options.enqueueNotification || queueHelper.enqueueNotification;
      const safeRecipientMeta = { ...(options.recipientMeta || {}) };
      delete safeRecipientMeta.io;

      job = await enqueueFn(newNotification, {
        tenantId,
        recipientMeta: safeRecipientMeta,
        templateContext: options.templateContext,
      });
    } catch (queueErr) {
      logger.error(`⚠️ [NotificationService] Queue enqueue error: ${queueErr.message}. Initiating synchronous fallback.`);

      // Graceful fallback: If queue is unreachable, dispatch synchronously via channel registry
      try {
        const plainPayload = newNotification.toObject ? newNotification.toObject() : newNotification;
        for (const ch of targetChannels) {
          const provider = activeRegistry.getProvider(ch);
          if (provider && provider.isConfigured()) {
            await provider.send(plainPayload, { io, ...options.recipientMeta });
          }
        }
        await Notification.findByIdAndUpdate(newNotification._id, {
          status: NOTIFICATION_STATUSES.DELIVERED,
        });
      } catch (fallbackErr) {
        logger.error(`Fallback delivery failed: ${fallbackErr.message}`);
      }
    }

    // 8. Return fast acknowledgment (<10ms)
    const resultObj = newNotification.toObject ? newNotification.toObject() : { ...newNotification };
    return {
      ...resultObj,
      queued: true, 
      jobId: job ? job.id : null,
    };
  } catch (error) {
    logger.error(`Notification Engine Ingestion Failure: ${error.message}`);
    if (error.isOperational) throw error;
    throw new AppError(`Notification processing failed: ${error.message}`, 500);
  }
};

module.exports = { sendNotification };
