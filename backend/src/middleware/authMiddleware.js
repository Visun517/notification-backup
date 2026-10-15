const jwt = require("jsonwebtoken");
const AppError = require("../errors/appError");
const catchAsync = require("../utils/catchAsync");
const logger = require("../utils/logger");

/**
 * HTTP Authentication Middleware (Protect).
 * Cryptographically verifies the JWT from the Authorization header and
 * attaches the decoded user identity to req.user.
 *
 * DECOUPLED: The engine no longer holds a User model. Identity is fully
 * asserted by the JWT token issued by the host application. No DB lookup
 * is performed here — the token signature is the source of truth.
 */
const protect = catchAsync(async (req, res, next) => {
  let token;

  // 1. Extract token from Authorization header or custom headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.headers["x-access-token"]) {
    token = req.headers["x-access-token"];
  } else if (req.headers.token) {
    token = req.headers.token;
  }

  if (!token) {
    return next(
      new AppError("You are not logged in. Please provide a valid authentication token.", 401),
    );
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error("Auth Middleware Error: JWT_SECRET environment variable is not defined");
    return next(new AppError("Server authentication configuration error", 500));
  }

  // 2. Verify token signature and expiration
  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new AppError("Your token has expired! Please log in again.", 401));
    }
    if (err.name === "JsonWebTokenError") {
      return next(new AppError("Invalid token. Please log in again!", 401));
    }
    return next(new AppError("Token verification failed", 401));
  }

  // 3. Extract user identity from the verified JWT payload
  const userId = decoded.id || decoded._id || decoded.userId || decoded.sub;
  if (!userId) {
    return next(new AppError("Invalid token payload: user identifier missing.", 401));
  }

  // 4. Attach the verified identity to the request
  //    The host app's JWT is the source of truth — no DB round-trip needed.
  req.user = {
    id: String(userId),
    role: decoded.role || null,
    tenantId: decoded.tenantId || req.headers["x-tenant-id"] || "default",
  };
  req.userId = String(userId);

  next();
});

module.exports = protect;
