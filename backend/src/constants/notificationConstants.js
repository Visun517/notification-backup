/**
 * Enterprise Notification Constants
 * Generic, domain-agnostic definitions for multi-channel notification engine.
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
  PROCESSING: "PROCESSING",
  DELIVERED: "DELIVERED",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
};

/**
 * Legacy application roles preserved for backward compatibility with User model.
 * Note: New notification features should use dynamic 'tags' (e.g. ['role:driver', 'tier:gold']) instead of hardcoded enums.
 */
const RECIPIENT_ROLES = {
  TOURIST: "TOURIST",
  DRIVER: "DRIVER",
  VEHICLE_OWNER: "VEHICLE_OWNER",
  HOTEL_OWNER: "HOTEL_OWNER",
  RESTAURANT_OWNER: "RESTAURANT_OWNER",
  LOCAL_FOOD_PROVIDER: "LOCAL_FOOD_PROVIDER",
  SURF_INSTRUCTOR: "SURF_INSTRUCTOR",
  TRAVEL_AGENCY: "TRAVEL_AGENCY",
  DESTINATION_MANAGER: "DESTINATION_MANAGER",
  SAFETY_MANAGER: "SAFETY_MANAGER",
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  ADVERTISER: "ADVERTISER",
  EMERGENCY_PROVIDER: "EMERGENCY_PROVIDER",
  EVENT_ORGANIZER: "EVENT_ORGANIZER",
  ALL: "ALL",
};

module.exports = {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SCOPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
  RECIPIENT_ROLES,
};