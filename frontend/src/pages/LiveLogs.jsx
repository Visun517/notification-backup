import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Search,
  Filter,
  ArrowDown,
  Copy,
  Check,
  Radio,
  Wifi,
  WifiOff,
  ChevronRight,
  ChevronDown,
  Info,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Download,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { fetchLogsApi } from "../api/notificationApi";

// ---------------------------------------------------------------------------
// Badge and Level Color Configurations
// INFO (blue), WARN (yellow), ERROR (red), SUCCESS (green)
// ---------------------------------------------------------------------------
const LEVEL_STYLES = {
  INFO: {
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    text: "text-blue-400",
    border: "border-l-blue-500",
    dot: "bg-blue-400",
    icon: Info,
  },
  SUCCESS: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    text: "text-emerald-400",
    border: "border-l-emerald-500",
    dot: "bg-emerald-400",
    icon: CheckCircle2,
  },
  WARN: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    text: "text-amber-400",
    border: "border-l-amber-500",
    dot: "bg-amber-400",
    icon: AlertTriangle,
  },
  ERROR: {
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    text: "text-rose-400",
    border: "border-l-rose-500",
    dot: "bg-rose-400",
    icon: AlertOctagon,
  },
};

export const LiveLogs = () => {
  const { socket, connectionStatus } = useSocket();

  const [logs, setLogs] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("ALL");
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const terminalEndRef = useRef(null);
  const terminalContainerRef = useRef(null);

  // 1. Initial Load of buffered logs
  useEffect(() => {
    let isMounted = true;
    fetchLogsApi()
      .then((res) => {
        if (isMounted && res?.data?.logs) {
          setLogs(res.data.logs);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch initial buffered logs:", err.message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Socket Live Stream Subscription
  useEffect(() => {
    if (!socket) return;

    const handleAdminLiveLog = (newLog) => {
      if (!newLog) return;
      setLogs((prev) => {
        // Keep up to 500 logs to prevent memory bloat
        const updated = [...prev, newLog];
        return updated.length > 500 ? updated.slice(updated.length - 500) : updated;
      });
    };

    socket.on("admin-live-logs", handleAdminLiveLog);

    return () => {
      socket.off("admin-live-logs", handleAdminLiveLog);
    };
  }, [socket]);

  // 3. Auto-scroll to latest log if enabled
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Handle user scrolling: pause auto-scroll if scrolled up
  const handleScroll = () => {
    if (!terminalContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  // 4. Filtering by level and search term
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesLevel =
        selectedLevel === "ALL" || log.level?.toUpperCase() === selectedLevel;

      if (!matchesLevel) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchMsg = log.message?.toLowerCase().includes(q);
      const matchEvent = log.event?.toLowerCase().includes(q);
      const matchDetails = JSON.stringify(log.details || {}).toLowerCase().includes(q);

      return matchMsg || matchEvent || matchDetails;
    });
  }, [logs, selectedLevel, searchQuery]);

  // Counts for each level
  const counts = useMemo(() => {
    const c = { ALL: logs.length, INFO: 0, SUCCESS: 0, WARN: 0, ERROR: 0 };
    logs.forEach((l) => {
      const lvl = l.level?.toUpperCase();
      if (c[lvl] !== undefined) c[lvl]++;
    });
    return c;
  }, [logs]);

  // Clear logs handler
  const handleClearLogs = () => {
    setLogs([]);
  };

  // Copy log entry JSON
  const handleCopyLog = (log) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export logs to JSON file
  const handleExportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `engine-logs-${new Date().toISOString().replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Terminal className="w-7 h-7 text-indigo-400" />
            Live System Logs
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-time streaming telemetry across BullMQ dispatch workers, push providers, and socket channels.
          </p>
        </div>

        {/* Status & Socket Stream Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono">
            {connectionStatus === "connected" ? (
              <>
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="text-zinc-400">Stream:</span>
                <span className="text-emerald-400 font-semibold">LISTENING</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-zinc-400">Stream:</span>
                <span className="text-amber-400 font-semibold">{connectionStatus?.toUpperCase()}</span>
              </>
            )}
          </div>

          <button
            onClick={handleExportLogs}
            disabled={logs.length === 0}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
            title="Export all logs as JSON"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            Export
          </button>
        </div>
      </div>

      {/* ── Terminal Controls Toolbar ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80">
        {/* Left: Search input & Level Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter logs by message, event, or ID..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          {/* Level Filter Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-xs font-mono">
            {["ALL", "INFO", "SUCCESS", "WARN", "ERROR"].map((lvl) => {
              const isActive = selectedLevel === lvl;
              const count = counts[lvl] || 0;
              return (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-zinc-800 text-white font-semibold shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                  }`}
                >
                  <span>{lvl}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    lvl === "ERROR" && count > 0
                      ? "bg-rose-500/20 text-rose-300 font-bold"
                      : "bg-zinc-800 text-zinc-400"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Auto-scroll & Clear controls */}
        <div className="flex items-center gap-2 self-end lg:self-auto">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-xl border transition-all ${
              autoScroll
                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title={autoScroll ? "Auto-scroll is ON" : "Auto-scroll is PAUSED"}
          >
            {autoScroll ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Auto-scroll ON</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Scroll PAUSED</span>
              </>
            )}
          </button>

          {/* Jump to Bottom Button */}
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Jump to latest"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          )}

          {/* Clear Logs Button */}
          <button
            onClick={handleClearLogs}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all disabled:opacity-40"
            title="Clear all logs from terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* ── Terminal Window ── */}
      <div className="rounded-2xl bg-[#0B0D13] border border-zinc-800/90 shadow-2xl overflow-hidden flex flex-col font-mono text-xs">
        {/* Terminal Titlebar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950/80 border-b border-zinc-800/80 text-zinc-400 select-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
            </div>
            <span className="text-[11px] font-semibold text-zinc-400 ml-2">
              notification-engine://stream/admin-live-logs
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <span>Buffer: {filteredLogs.length} / {logs.length}</span>
            <span>UTF-8</span>
          </div>
        </div>

        {/* Terminal Body */}
        <div
          ref={terminalContainerRef}
          onScroll={handleScroll}
          className="p-4 space-y-2 h-[68vh] overflow-y-auto custom-scrollbar bg-black/40"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500">
                <Terminal className="w-8 h-8" />
              </div>
              <p className="text-zinc-400 font-medium">
                {logs.length === 0
                  ? "Terminal stream initialized. Waiting for engine events..."
                  : "No log records match your filter criteria."}
              </p>
              <p className="text-zinc-600 text-[11px] max-w-sm">
                Trigger a simulation or send a notification to observe real-time dispatch, queue, and worker events here.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const style = LEVEL_STYLES[log.level?.toUpperCase()] || LEVEL_STYLES.INFO;
              const isExpanded = expandedLogId === log.id;
              const IconComponent = style.icon;

              return (
                <div
                  key={log.id}
                  className={`group rounded-xl border border-zinc-800/60 bg-zinc-950/40 hover:bg-zinc-900/40 transition-colors border-l-4 ${style.border}`}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="flex items-start gap-3 p-2.5 cursor-pointer select-text"
                  >
                    {/* Timestamp */}
                    <span className="text-zinc-500 shrink-0 text-[11px] pt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        fractionalSecondDigits: 3,
                      })}
                    </span>

                    {/* Level Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase shrink-0 border ${style.badge}`}
                    >
                      <IconComponent className="w-3 h-3" />
                      {log.level}
                    </span>

                    {/* Event Type */}
                    <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-semibold text-zinc-300 shrink-0 hidden sm:inline">
                      {log.event}
                    </span>

                    {/* Log Message */}
                    <span className="text-zinc-200 flex-1 leading-relaxed break-all">
                      {log.message}
                    </span>

                    {/* Right Action Icons */}
                    <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyLog(log);
                        }}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                        title="Copy log entry JSON"
                      >
                        {copiedId === log.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {log.details && Object.keys(log.details).length > 0 && (
                        <span className="text-zinc-500">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded JSON Details Payload */}
                  {isExpanded && log.details && (
                    <div className="px-3 pb-3 pt-1 border-t border-zinc-800/40 mt-1">
                      <div className="p-3 rounded-lg bg-black/60 border border-zinc-800/80 text-[11px] text-zinc-300 overflow-x-auto">
                        <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-zinc-800/60 text-zinc-500 text-[10px]">
                          <span>Payload & Event Context [Tenant: {log.tenantId || "default"}]</span>
                          <span className="text-zinc-400 font-bold">{log.id}</span>
                        </div>
                        <pre className="text-indigo-300 leading-relaxed font-mono">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};

export default LiveLogs;
