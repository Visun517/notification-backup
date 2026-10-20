/**
 * Enterprise Notification Constants
 * Generic, domain-agnostic definitions for multi-channel notification engine.
 *
 * Audience targeting is handled exclusively through dynamic string tags
 * (e.g. notification.tags: ["role:driver", "tier:gold", "region:south"]).
 * No hardcoded domain roles, geo-locations, or project-specific enums live here.
 */

/**
 * Standardized delivery channels supported by the engine
 */
const NOTIFICATION_CHANNELS = {
  IN_APP: "IN_APP",
  PUSH: "PUSH",
  EMAIL: "EMAIL",
  SMS: "SMS",
  WEBHOOK: "WEBHOOK",
};

/**
 * Delivery Scopes:
 * - UNICAST: Directed to a specific user.
 * - MULTICAST: Group delivery targeted by tags, regional criteria, or segments.
 * - BROADCAST: Delivered system-wide to all active users.
 */
const NOTIFICATION_SCOPES = {
  UNICAST: "UNICAST",
  MULTICAST: "MULTICAST",
  BROADCAST: "BROADCAST",
};

/**
 * Standard Notification Priorities
 */
const NOTIFICATION_PRIORITIES = {
  LOW: "low",
  NORMAL: "normal",
  MEDIUM: "medium", // Aliased to normal for backward compatibility
  HIGH: "high",
  CRITICAL: "critical",
};

/**
 * Delivery Lifecycle Statuses
 */
const NOTIFICATION_STATUSES = {
  PENDING: "PENDING",
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  DELIVERED: "DELIVERED",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
};

module.exports = {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SCOPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
};