const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AppError = require("../errors/appError");
const catchAsync = require("../utils/catchAsync");
const logger = require("../utils/logger");

/**
 * HTTP Authentication Middleware (Protect).
 * Cryptographically verifies JWT from Authorization header and attaches the authenticated user to req.user.
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

  // 2. Verify token
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

  // 3. Extract user ID and verify that user still exists
  const userId = decoded.id || decoded._id || decoded.userId || decoded.sub;
  if (!userId) {
    return next(new AppError("Invalid token payload: user identifier missing.", 401));
  }

  const currentUser = await User.findById(userId);
  if (!currentUser) {
    return next(
      new AppError("The user belonging to this token no longer exists.", 401),
    );
  }

  // 4. Attach verified user to request
  req.user = currentUser;
  req.userId = (currentUser._id ? currentUser._id.toString() : String(userId));

  next();
});

module.exports = protect;
