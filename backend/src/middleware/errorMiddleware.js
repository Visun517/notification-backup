const AppError = require('../errors/appError');
const logger = require('../utils/logger');

/**
 * Helper function to handle MongoDB invalid ID errors (CastError).
 */
const handleCastErrorDB = err => {
  return new AppError(`Invalid ${err.path}: ${err.value}.`, 400);
};

/**
 * Helper function to handle MongoDB duplicate key errors (Error Code 11000).
 * Fixed: Uses 'err.keyValue' instead of 'err.errmsg.match' to prevent crashes in newer MongoDB versions.
 */
const handleDuplicateFieldsDB = err => {
  // Extract the duplicate value safely
  const value = err.keyValue ? Object.values(err.keyValue)[0] : 'unknown value';
  return new AppError(`Duplicate field value: "${value}". Please use another value!`, 400);
};

/**
 * Helper function to handle MongoDB validation errors.
 */
const handleValidationErrorDB = err => {
  const errors = Object.values(err.errors).map(el => el.message);
  return new AppError(`Invalid input data. ${errors.join('. ')}`, 400);
};

/**
 * Helper function for invalid JSON Web Tokens.
 */
const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);

/**
 * Helper function for expired JSON Web Tokens.
 */
const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401);

/**
 * GLOBAL ERROR HANDLING MIDDLEWARE
 * All errors thrown inside the application will eventually reach this function.
 */
module.exports = (err, req, res, next) => {
  // Set default values if the error doesn't have them
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // --- DEVELOPMENT MODE ---
  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }
  // --- PRODUCTION MODE ---
  else {
    // Fixed: Explicitly copy 'name' and 'code' because the spread operator (...err) ignores them
    let error = { ...err, name: err.name, code: err.code, message: err.message };

    // Convert specific database and token errors into user-friendly AppErrors
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    // Check if the error is an expected operational error (e.g., created by AppError)
    if (error.isOperational) {
      res.status(error.statusCode).json({
        status: error.status,
        message: error.message
      });
    }
    // If it's a programming bug or unknown error, send a generic message to the user
    else {
      // 1) Log the error for the developer to see
      logger.error('Unhandled Exception ', {
        errorName: err.name,
        message: err.message,
        stack: err.stack
      });

      // 2) Send a generic message to the client
      res.status(500).json({
        status: 'error',
        message: 'Something went very wrong!'
      });
    }
  }
};