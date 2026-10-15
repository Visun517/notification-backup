const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

/**
 * Socket Authentication Middleware.
 * Cryptographically verifies the JWT token of connecting clients
 * and binds authenticated user details to the socket instance.
 *
 * DECOUPLED: No longer queries the host app's User model.
 * Identity is fully asserted by the JWT payload — the host application
 * is responsible for issuing valid tokens.
 */
const socketAuth = async (socket, next) => {
  try {
    // 1. Extract token from auth payload or headers
    let token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.token ||
      socket.handshake.headers?.authorization;

    // Reject connection if no token is provided
    if (!token) {
      logger.warn(
        `Socket Connection Denied: Token missing. Socket ID: ${socket.id}`,
      );
      return next(new Error("Authentication error: Token missing"));
    }

    // Handle 'Bearer <token>' prefix if present
    if (typeof token === "string" && token.startsWith("Bearer ")) {
      token = token.slice(7).trim();
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error(
        "Socket Auth Error: JWT_SECRET environment variable is not defined",
      );
      return next(new Error("Authentication error: Server configuration error"));
    }

    // 2. Cryptographically verify the token signature and expiration
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        logger.warn(
          `Socket Connection Denied: Token expired. Socket ID: ${socket.id}`,
        );
        return next(new Error("Authentication error: Token expired"));
      }
      if (err.name === "JsonWebTokenError") {
        logger.warn(
          `Socket Connection Denied: Invalid token signature or format. Socket ID: ${socket.id}`,
        );
        return next(new Error("Authentication error: Invalid token"));
      }

      logger.warn(
        `Socket Connection Denied: Token verification failed (${err.message}). Socket ID: ${socket.id}`,
      );
      return next(new Error("Authentication error: Verification failed"));
    }

    // 3. Extract user identity from the verified JWT payload
    const userId = decoded.id || decoded._id || decoded.userId || decoded.sub;

    if (!userId) {
      logger.error(
        `Socket Auth Failed: Token payload missing user ID. IP: ${socket.handshake.address}`,
      );
      return next(new Error("Authentication error: Invalid token structure"));
    }

    // 4. Attach the verified identity to the socket.
    //    No DB lookup — the JWT signature is the source of truth.
    socket.userId = String(userId);
    socket.userRole = decoded.role || null;
    socket.tenantId = decoded.tenantId || "default";

    // Log the successful connection
    logger.info(
      `🔒 Socket Authenticated: User ${socket.userId} (${socket.userRole ?? "no-role"})`,
    );

    // Allow the connection to proceed
    next();
  } catch (err) {
    // Catch and log any unexpected server errors during authentication
    logger.error(`Socket Auth Middleware Exception: ${err.message}`);
    next(new Error("Authentication error: Internal server error"));
  }
};

module.exports = socketAuth;