const User = require("../src/models/User.js");
const { getRegionFromCoords } = require("../src/utils/locationHelper.js");
const socketService = require("../src/services/delivery/socketService");
const fcmService = require("../src/services/delivery/fcmService");
const calculateDistance = require("../src/utils/geoUtils.js");
const AppError = require("../src/errors/appError");
const logger = require("../src/utils/logger");

module.exports = (io) => {
  io.on("connection", async (socket) => {
    // Get user details attached by the Socket Auth Middleware
    const userId = socket.userId;
    const role = socket.userRole;

    logger.info(
      `🔒 Secure Socket Connected: User=${userId}, Role=${role}, SocketID=${socket.id}`,
    );

    // Join the basic private room and role-specific room
    socket.join(`user_${userId}`);
    socket.join(`role_${role}`);

    /**
     * Helper function to handle and emit socket errors to the frontend.
     * Prevents the server from crashing when an error occurs inside the socket.
     */
    const handleSocketError = (err, eventName) => {
      const statusCode = err.statusCode || 500;
      const message = err.message || "Internal Socket Error";

      logger.error(`❌ [Socket ${eventName}] User=${userId}: ${message}`);

      // Send the error back to the client
      socket.emit("error", {
        status: err.status || "error",
        statusCode,
        message,
        event: eventName,
      });
    };

    // --- INITIAL SYNC ---
    // When the user connects, load their last known location and add them to regional rooms
    try {
      const user = await User.findById(userId).select(
        "currentLocation fcmToken",
      );

      if (!user) throw new AppError("User not found during initial sync", 404);

      // Attach FCM token to the socket session for later use
      socket.fcmToken = user.fcmToken;

      if (user.currentLocation?.coordinates) {
        // MongoDB uses [longitude, latitude] format
        const [lng, lat] = user.currentLocation.coordinates;
        const regionData = await getRegionFromCoords(lat, lng);

        if (regionData && typeof regionData === "object") {
          // Add user to the relevant Socket rooms (instant in-memory operation)
          socketService.manageRegionalRooms(socket, regionData, role, "join");

          // Save current location details in the socket session to track future movements
          socket.currentDivision = regionData.division;
          socket.currentDistrict = regionData.district;

          // DECOUPLED ASYNC TASK: Subscribe to FCM topics without blocking WebSocket event loop
          if (socket.fcmToken) {
            const token = socket.fcmToken;
            setImmediate(async () => {
              try {
                await fcmService.manageRegionalTopics(
                  token,
                  regionData,
                  role,
                  "subscribe",
                );
              } catch (fcmErr) {
                logger.error(
                  `Background FCM initial subscribe failed for User=${userId}: ${fcmErr.message}`,
                );
              }
            });
          }

          logger.info(
            `Initial Sync Success: User=${userId}, Region=${regionData.division}`,
          );
        }
      }
    } catch (err) {
      handleSocketError(err, "initial_sync");
    }

    // --- LOCATION UPDATE ---
    // Listens to live GPS updates from the client app
    socket.on("update_location", async (data) => {
      try {
        // Concurrency lock: prevent overlapping location updates for this socket
        if (socket.isUpdatingLocation) {
          logger.debug(`Location update already running for user ${userId}`);
          return;
        }

        socket.isUpdatingLocation = true;

        const { lat, lng } = data;

        if (lat === undefined || lng === undefined) {
          throw new AppError("Latitude and Longitude are required", 400);
        }

        // PERFORMANCE OPTIMIZATION (Throttling)
        // If user moved less than 100 meters, skip the expensive region check
        if (socket.lastLat && socket.lastLng) {
          const distance = calculateDistance(
            socket.lastLat,
            socket.lastLng,
            lat,
            lng,
          );
          if (distance < 100) {
            return await updateDBLocation(userId, lat, lng, role);
          }
        }

        // Update last known coordinates in socket session
        socket.lastLat = lat;
        socket.lastLng = lng;

        // Check if the user entered a new region
        const regionData = await getRegionFromCoords(lat, lng);

        if (
          regionData &&
          typeof regionData === "object" &&
          regionData.division !== socket.currentDivision
        ) {
          const oldRegion = {
            division: socket.currentDivision,
            district: socket.currentDistrict,
          };

          // 1. Manage Socket.io rooms immediately in memory
          socketService.manageRegionalRooms(socket, oldRegion, role, "leave");
          socketService.manageRegionalRooms(socket, regionData, role, "join");

          logger.info(
            `🔄 Region Switch: User=${userId}, From=${socket.currentDivision}, To=${regionData.division}`,
          );

          // Update current region in socket session
          socket.currentDivision = regionData.division;
          socket.currentDistrict = regionData.district;

          // 2. DECOUPLED ASYNC TASK: Handle external FCM topic un/subscribes in the background
          if (socket.fcmToken) {
            const token = socket.fcmToken;
            setImmediate(async () => {
              try {
                if (oldRegion.division && oldRegion.district) {
                  await fcmService.manageRegionalTopics(
                    token,
                    oldRegion,
                    role,
                    "unsubscribe",
                  );
                }
                await fcmService.manageRegionalTopics(
                  token,
                  regionData,
                  role,
                  "subscribe",
                );
              } catch (fcmErr) {
                logger.error(
                  `Background FCM region switch failed for User=${userId}: ${fcmErr.message}`,
                );
              }
            });
          }
        }

        // Always update the exact GPS location in the Database
        await updateDBLocation(userId, lat, lng, role);
      } catch (error) {
        handleSocketError(error, "update_location");
      } finally {
        socket.isUpdatingLocation = false;
      }
    });

    socket.on("disconnect", () => {
      logger.info(`👋 Socket Disconnected: User=${userId}`);
    });
  });
};

/**
 * Helper function to update the user's live location in MongoDB.
 * If the user is a DRIVER, it also sets 'showCurrentLocation' to true.
 */
const updateDBLocation = async (userId, lat, lng, role) => {
  try {
    await User.findByIdAndUpdate(userId, {
      currentLocation: { type: "Point", coordinates: [lng, lat] },
      ...(role === "DRIVER" && { showCurrentLocation: true }),
    });
  } catch (err) {
    logger.error(`DB Update Failed for User=${userId}: ${err.message}`);
  }
};