require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const notificationHandler = require("./socket/notificationHandler");
const notificationRoutes = require("./src/routes/notificationRoutes.js");
const globalErrorHandler = require("./src/middleware/errorMiddleware");
require("./src/configs/firebaseConfig");
const socketAuth = require("./src/middleware/socketAuthMiddleware");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(express.json());

const morgan = require("morgan");
app.use(morgan("dev"));

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
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
    origin: process.env.CORS_ORIGIN || "http://localhost:5173", // Frontend URL
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
 * This handles user room joining and tag-based room subscriptions.
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

// --- NOTIFICATION ENGINE SETUP END ---

app.use(globalErrorHandler);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("DB connection successful!");

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err.message);
  });
