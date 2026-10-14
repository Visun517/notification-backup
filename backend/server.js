require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const notificationHandler = require("./socket/notificationHandler");
const notificationRoutes = require("./src/routes/notificationRoutes.js");
const globalErrorHandler = require("./src/middleware/errorMiddleware");
require("./src/configs/firebaseConfig");
const seedRegions = require("./src/utils/dbSeeder");
const socketAuth = require("./src/middleware/socketAuthMiddleware");
const cors = require("cors");

/**
 * Enterprise-grade CORS allowlist.
 * Reads CORS_ORIGIN from the environment as a comma-separated string and
 * parses it into an array of allowed origins.
 *
 * Examples:
 *   CORS_ORIGIN=https://app.example.com
 *   CORS_ORIGIN=https://app.example.com,https://admin.example.com
 *
 * Falls back to ['http://localhost:5173'] when the variable is absent so
 * local development works without any .env configuration.
 */
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : ["http://localhost:5173"];

/**
 * CORS origin validator callback — shared by both Express cors() middleware
 * and the Socket.io server so both layers enforce the same policy.
 *
 * Rules:
 *  1. No origin (Postman, curl, server-to-server) → allowed.
 *  2. Origin in ALLOWED_ORIGINS → allowed.
 *  3. Anything else → rejected with a hard Error.
 */
function corsOriginValidator(origin, callback) {
  // Allow requests with no origin header (Postman, server-side fetches, etc.)
  if (!origin) return callback(null, true);

  if (ALLOWED_ORIGINS.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS policy: origin '${origin}' is not allowed.`));
}
const userRoutes = require("./src/routes/userRoutes");

const app = express();
const server = http.createServer(app);

app.use(express.json());

const morgan = require("morgan");
app.use(morgan("dev"));

const io = new Server(server, {
  cors: {
    // Use the same validator as Express so Socket.io and HTTP
    // always enforce an identical origin policy.
    origin: corsOriginValidator,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/*
 * Distributed Socket.io Adapter Setup.
 * Attaches @socket.io/redis-adapter so that room broadcasts propagate across clustered instances.
 */
const { createAdapter } = require("@socket.io/redis-adapter");
const { initRedis, pubClient, subClient } = require("./src/config/redisClient");

initRedis()
  .then((connected) => {
    if (connected) {
      io.adapter(createAdapter(pubClient, subClient));
      console.log("🔌 [Socket.io] Attached distributed Redis adapter.");
    }
  })
  .catch((err) => {
    console.error("⚠️ [Socket.io] Redis adapter setup failed:", err.message);
  });

app.use(
  cors({
    // Dynamic allowlist: validates every browser origin against ALLOWED_ORIGINS.
    // No-origin requests (Postman, server-to-server) are always permitted.
    // Unauthorized origins receive HTTP 500 with a descriptive CORS error.
    origin: corsOriginValidator,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  }),
);

// --- NOTIFICATION ENGINE SETUP START ---

/*
 * Make the Socket.io instance globally available in the Express app.
 * This allows our external controllers (e.g., exampleController) to access 'io'
 * and send real-time notifications via req.app.get('io').
 */
app.set("io", io);

/*
 * Secure the notification socket connection.
 * This middleware ensures that only authenticated users with a valid JWT can receive live alerts.
 */
io.use(socketAuth);

/*
 * Initialize the core real-time notification engine.
 * This handles user room joining, FCM topic subscriptions, and live GPS tracking/throttling.
 */
notificationHandler(io);

/*
 * Register channel providers with the ChannelRegistry (Strategy Pattern).
 */
const { channelRegistry } = require("./src/registry/ChannelRegistry");
const SocketChannelProvider = require("./src/providers/SocketChannelProvider");
const FcmChannelProvider = require("./src/providers/FcmChannelProvider");

channelRegistry.registerProvider(new SocketChannelProvider(io));
channelRegistry.registerProvider(new FcmChannelProvider());

/*
 * Start BullMQ asynchronous background worker for decoupled notification delivery.
 */
const { startNotificationWorker } = require("./src/workers/notificationWorker");
startNotificationWorker();

/*
 * Register the HTTP routes for the notification system.
 * This handles fetching message history, marking messages as read, and unread counts.
 */
const { getHealthStatus } = require("./src/utils/healthCheck");
app.get("/health/notifications", async (req, res) => {
  const health = await getHealthStatus();
  const statusCode = health.status === "UNHEALTHY" ? 503 : 200;
  res.status(statusCode).json(health);
});

app.use("/api/notifications", notificationRoutes);
app.use("/api/user", userRoutes);

// --- NOTIFICATION ENGINE SETUP END ---

app.use(globalErrorHandler);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("DB connection successful!");

    /*
     * Auto-seed geographic regions on startup.
     * This is required for the Notification Engine's local geo-fencing (location-based alerts) to work properly.
     */
    await seedRegions();

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err.message);
  });
