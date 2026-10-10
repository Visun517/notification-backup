const { sendNotification } = require("../services/NotificationService");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");

/**
 * Example Controller for Notification Engine Integration
 * 
 * Description:
 * This controller serves as a guide for other developers on how to send notifications 
 * from their respective modules (e.g., Booking, Bidding, or Admin panels).
 * 
 * Types of Notifications you can send (Scopes):
 * 1. UNICAST: Private message to a specific user. (Requires: 'recipientId')
 * 2. MULTICAST: Group message based on Role and/or Location. (Requires: 'recipientRole', and optionally 'region' or 'district')
 * 3. BROADCAST: Public message to everyone in the system. (No specific recipient required)
 * 
 * How to send a notification (3 Simple Steps):
 * Step 1: Get the 'io' instance from the request object (req.app.get('io')).
 * Step 2: Build the payload object matching the Notification Schema.
 * Step 3: Call 'await sendNotification(io, payload)'.
 */
const triggerSimulation = catchAsync(async (req, res, next) => {
  // Step 1: Retrieve the global Socket.io instance from the Express app
  const io = req.app.get("io");
  
  const { 
    type,        // Defines the scope: 'UNICAST', 'MULTICAST', or 'BROADCAST'
    scenario,    // Used here to auto-fill test data: 'ROAD_CLOSURE', 'SURF_ALERT', etc.
    recipientId, // Target User ID (Mandatory for UNICAST)
    role,        // Target User Role (Mandatory for MULTICAST)
    region,      // Target Divisional Secretariat (Optional for MULTICAST)
    district     // Target District (Optional for MULTICAST)
  } = req.body;

  if (!type || !scenario) {
    return next(new AppError("Please provide both 'type' and 'scenario' in the request body", 400));
  }

  // Step 2: Construct the Notification Payload
  // Supports dynamic tags, multi-channel routing, and templating
  let payload = {
    scope: type,
    recipientId: recipientId,
    recipientRole: role,
    tags: req.body.tags || (role ? [`role:${role}`] : []),
    channels: req.body.channels || ["IN_APP", "PUSH"],
    region: region,
    district: district,
    title: "Test Alert",
    message: "This is a default test message.",
    category: "SYSTEM",
    priority: "normal",
    actionUrl: "/home",
    data: req.body.data || {},
  };

  // Populate dummy data based on the requested testing scenario
  switch (scenario) {
    case 'ROAD_CLOSURE': // Ideal for MULTICAST (Region)
      payload.title = "Road Closure Alert";
      payload.message = `Galle Road in ${region || 'your area'} closed for 1 hour due to a parade.`;
      payload.category = 'SAFETY';
      payload.priority = 'high';
      payload.actionUrl = '/map/alerts';
      break;

    case 'SURF_ALERT': // Ideal for MULTICAST (Region + Role)
      payload.title = "High Wave Alert";
      payload.message = "Attention Instructors: Waves are over 5ft today in Mirissa area. Safety first!";
      payload.category = 'SAFETY';
      payload.priority = 'critical';
      payload.actionUrl = '/activities/surf';
      break;

    case 'BID_ACCEPTED': // Ideal for UNICAST
      payload.title = "Bid Accepted!";
      payload.message = "Congratulations! The tourist has accepted your offer. Check your active trips.";
      payload.category = 'BOOKING';
      payload.priority = 'high';
      payload.actionUrl = '/trips/active';
      break;

    case 'EMERGENCY': // Ideal for BROADCAST
      payload.title = "National Safety Warning!";
      payload.message = "Strong winds and heavy rain expected nationwide. Avoid coastal areas.";
      payload.category = 'SAFETY';
      payload.priority = 'critical';
      payload.actionUrl = '/safety/updates';
      break;

    case 'SYSTEM_UPDATE': // Ideal for MULTICAST (Role only)
      payload.title = "New Service Charges";
      payload.message = "The system service charges have been updated. Please review the new policy.";
      payload.category = 'SYSTEM';
      payload.priority = 'low';
      payload.actionUrl = '/policy';
      break;
  }

  // Allow overriding title and message via the request body for custom testing
  if (req.body.title) payload.title = req.body.title;
  if (req.body.message) payload.message = req.body.message;

  logger.info(`Triggering Simulation: [${scenario}] | Scope: [${type}]`);

  // Step 3: Trigger the Central Notification Engine
  // This single function call handles Database saving, Socket.io live emission, and FCM Push Notifications
  const result = await sendNotification(io, payload);

  res.status(200).json({
    status: "success",
    message: `Test notification for '${scenario}' has been dispatched.`,
    data: result
  });
});

module.exports = {
  triggerSimulation,
};  
