/**
 * Enterprise Admin Real-time Log Emitter
 * Broadcasts structured lifecycle and operational events across the administrative socket stream.
 */

const MAX_BUFFERED_LOGS = 100;
const logBuffer = [];
let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function getBufferedLogs() {
  return [...logBuffer];
}

function emitLiveLog({
  level = "INFO", // "INFO", "WARN", "ERROR", "SUCCESS"
  event = "SYSTEM_EVENT",
  message = "",
  details = {},
  tenantId = "default",
}) {
  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(), // INFO, WARN, ERROR, SUCCESS
    event,
    message,
    tenantId,
    details,
  };

  // Keep last 100 in ring buffer for initial component hydration
  logBuffer.push(logEntry);
  if (logBuffer.length > MAX_BUFFERED_LOGS) {
    logBuffer.shift();
  }

  if (ioInstance) {
    try {
      ioInstance.emit("admin-live-logs", logEntry);
    } catch (err) {
      console.warn("Failed to broadcast admin-live-logs socket event:", err.message);
    }
  }

  return logEntry;
}

module.exports = {
  setIo,
  emitLiveLog,
  getBufferedLogs,
};
