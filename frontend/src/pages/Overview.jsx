import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Radio,
  Users,
  Activity,
  TrendingUp,
  RefreshCw,
  Database,
  Server,
  Cpu,
  Layers,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { fetchOverviewApi } from "../api/notificationApi";

// ---------------------------------------------------------------------------
// Helper Formatters
// ---------------------------------------------------------------------------
const formatNumber = (num) => {
  if (num === null || num === undefined) return "0";
  return Number(num).toLocaleString();
};

const formatUptime = (seconds) => {
  if (!seconds || seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatTimeAgo = (dateString) => {
  if (!dateString) return "just now";
  const diffSec = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

// ---------------------------------------------------------------------------
// Loading Skeleton Component
// ---------------------------------------------------------------------------
const OverviewSkeleton = () => (
  <div className="space-y-6 animate-pulse" role="status" aria-label="Loading dashboard metrics">
    {/* Header Skeleton */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-zinc-800/80 rounded-lg"></div>
        <div className="h-4 w-96 bg-zinc-800/50 rounded"></div>
      </div>
      <div className="h-9 w-32 bg-zinc-800/70 rounded-lg"></div>
    </div>

    {/* Metric Cards Skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 bg-zinc-800/70 rounded"></div>
            <div className="h-9 w-9 rounded-xl bg-zinc-800/60"></div>
          </div>
          <div className="h-8 w-24 bg-zinc-700/60 rounded"></div>
          <div className="h-3 w-36 bg-zinc-800/50 rounded"></div>
        </div>
      ))}
    </div>

    {/* Chart Skeleton */}
    <div className="p-6 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 space-y-4">
      <div className="h-5 w-48 bg-zinc-800/70 rounded"></div>
      <div className="h-64 w-full bg-zinc-900/60 rounded-xl"></div>
    </div>

    {/* Bottom Dual Grid Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="h-64 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 p-6"></div>
      <div className="h-64 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 p-6"></div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Custom Recharts Dark Tooltip
// ---------------------------------------------------------------------------
const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-[#0B0D13]/95 p-3.5 shadow-2xl backdrop-blur-md">
        <p className="mb-2 text-xs font-mono font-semibold text-zinc-300">
          {label}
        </p>
        <div className="space-y-1.5 text-xs font-mono">
          {payload.map((entry, index) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name}:
              </span>
              <span className="font-semibold text-zinc-200">
                {formatNumber(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Main Overview Page Component
// ---------------------------------------------------------------------------
export const Overview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const loadOverviewData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const response = await fetchOverviewApi();
      if (response && response.status === "success") {
        setData(response.data);
      } else {
        throw new Error(response?.message || "Failed to load overview data.");
      }
    } catch (err) {
      console.error("Overview metrics fetch failed:", err);
      setError(err?.response?.data?.message || err.message || "Failed to connect to engine.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastRefreshed(new Date());
    }
  }, []);

  useEffect(() => {
    loadOverviewData();

    // Automatic polling interval every 30 seconds for live operations
    const interval = setInterval(() => {
      loadOverviewData(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [loadOverviewData]);

  if (loading) {
    return <OverviewSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-[#0B0D13]/60 rounded-2xl border border-zinc-800/80">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
          <AlertOctagon className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Engine Telemetry Unavailable</h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
          {error}
        </p>
        <button
          onClick={() => loadOverviewData(false)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
        >
          <RefreshCw className="w-4 h-4" /> Retry Connection
        </button>
      </div>
    );
  }

  const {
    metrics = {},
    chartData = [],
    queueStatus = {},
    systemHealth = {},
    recentActivities = [],
  } = data || {};

  const {
    totalNotifications = 0,
    successRate = 100,
    activeSockets = 0,
    totalUsers = 0,
    statuses = {},
  } = metrics;

  return (
    <div className="space-y-6">
      {/* ── Page Header & Controls ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            Engine Overview
            <span className="text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              Live Production
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-time pipeline metrics, BullMQ background queues, and distribution throughput.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-zinc-500 hidden md:inline">
            Updated {formatTimeAgo(lastRefreshed)}
          </span>
          <button
            onClick={() => loadOverviewData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-medium rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-all disabled:opacity-50"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            <span>{refreshing ? "Syncing..." : "Sync Now"}</span>
          </button>
        </div>
      </div>

      {/* ── Section 1: Key Metrics Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Notifications */}
        <div className="p-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all group shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Total Dispatches
            </span>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:scale-105 transition-transform">
              <Bell className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight font-mono">
              {formatNumber(totalNotifications)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span className="text-emerald-400 flex items-center font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" />
              {statuses.DELIVERED || 0}
            </span>
            <span>delivered across channels</span>
          </div>
        </div>

        {/* Metric 2: Delivery Success Rate */}
        <div className="p-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all group shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Success Rate
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight font-mono">
              {successRate}%
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>SLA Target: &ge;99.5%</span>
          </div>
        </div>

        {/* Metric 3: Active Sockets */}
        <div className="p-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all group shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Connected Sockets
            </span>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-105 transition-transform">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight font-mono">
              {formatNumber(activeSockets)}
            </span>
            <span className="text-xs text-cyan-400 font-mono font-medium">live</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span className="text-zinc-500">Redis adapter clustered</span>
          </div>
        </div>

        {/* Metric 4: Registered Users */}
        <div className="p-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all group shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Targeted Users
            </span>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight font-mono">
              {formatNumber(totalUsers)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span className="text-zinc-500">Profiles in Registry</span>
          </div>
        </div>
      </div>

      {/* ── Section 2: 7-Day Trend Chart ── */}
      <div className="p-6 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              7-Day Notification Volume & Delivery Trend
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Breakdown of delivered, queued, and failed messages over the last 7 calendar days.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span> Total
            </span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400"></span> Delivered
            </span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-400"></span> Failed
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradientTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradientDelivered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradientFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
              />
              <YAxis
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomChartTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#gradientTotal)"
              />
              <Area
                type="monotone"
                dataKey="delivered"
                name="Delivered"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#gradientDelivered)"
              />
              <Area
                type="monotone"
                dataKey="failed"
                name="Failed"
                stroke="#f43f5e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#gradientFailed)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Section 3: Dual Grid (Queue Status & Engine Health) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queue Status (BullMQ) */}
        <div className="p-6 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Queue & Pipeline State (BullMQ)
              </h2>
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                notification-dispatch-queue
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-6">
              Asynchronous worker throughput and dead-letter queue (DLQ) backlog status.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/60">
                <span className="text-[11px] text-zinc-400 uppercase font-mono">Waiting</span>
                <p className="text-xl font-bold font-mono text-amber-400 mt-1">
                  {formatNumber(queueStatus.waiting)}
                </p>
                <span className="text-[10px] text-zinc-500">pending dispatch</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/60">
                <span className="text-[11px] text-zinc-400 uppercase font-mono">Active</span>
                <p className="text-xl font-bold font-mono text-cyan-400 mt-1">
                  {formatNumber(queueStatus.active)}
                </p>
                <span className="text-[10px] text-zinc-500">in worker execution</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/60">
                <span className="text-[11px] text-zinc-400 uppercase font-mono">Completed</span>
                <p className="text-xl font-bold font-mono text-emerald-400 mt-1">
                  {formatNumber(queueStatus.completed)}
                </p>
                <span className="text-[10px] text-zinc-500">last 1h retained</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/60">
                <span className="text-[11px] text-zinc-400 uppercase font-mono">Delayed</span>
                <p className="text-xl font-bold font-mono text-zinc-300 mt-1">
                  {formatNumber(queueStatus.delayed)}
                </p>
                <span className="text-[10px] text-zinc-500">scheduled/retry backoff</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/60">
                <span className="text-[11px] text-zinc-400 uppercase font-mono">Failed</span>
                <p className="text-xl font-bold font-mono text-rose-400 mt-1">
                  {formatNumber(queueStatus.failed)}
                </p>
                <span className="text-[10px] text-zinc-500">retry budget exhausted</span>
              </div>

              <div className={`p-3.5 rounded-xl border ${queueStatus.dlqCount > 0 ? "bg-rose-500/10 border-rose-500/30" : "bg-zinc-900/80 border-zinc-800/60"}`}>
                <span className="text-[11px] text-zinc-400 uppercase font-mono flex items-center justify-between">
                  DLQ Depth
                  {queueStatus.dlqCount > 0 && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                </span>
                <p className={`text-xl font-bold font-mono mt-1 ${queueStatus.dlqCount > 0 ? "text-rose-400" : "text-zinc-300"}`}>
                  {formatNumber(queueStatus.dlqCount)}
                </p>
                <span className="text-[10px] text-zinc-500">dead-letter queue</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
            <span>Dead-letter auto-retry available via API</span>
            <span className="font-mono text-indigo-400 font-medium">POST /api/admin/dlq/retry</span>
          </div>
        </div>

        {/* System Health */}
        <div className="p-6 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Infrastructure Health Status
              </h2>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[11px] font-mono font-semibold text-emerald-400">
                  {systemHealth.status || "HEALTHY"}
                </span>
              </div>
            </div>
            <p className="text-xs text-zinc-400 mb-6">
              Operational latency and connectivity across primary storage and worker clusters.
            </p>

            <div className="space-y-3 font-mono text-xs">
              {/* MongoDB */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="font-semibold text-zinc-200">MongoDB ReplicaSet</span>
                    <p className="text-[10px] text-zinc-500">Document persistence & feeds</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {systemHealth.services?.mongodb?.latencyMs !== null && (
                    <span className="text-[11px] text-zinc-400">
                      {systemHealth.services?.mongodb?.latencyMs}ms
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${systemHealth.services?.mongodb?.status === "UP" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                    {systemHealth.services?.mongodb?.status || "UP"}
                  </span>
                </div>
              </div>

              {/* Redis */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                <div className="flex items-center gap-3">
                  <Server className="w-4 h-4 text-rose-400" />
                  <div>
                    <span className="font-semibold text-zinc-200">Redis Clustered Node</span>
                    <p className="text-[10px] text-zinc-500">Queue & socket adapter broker</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {systemHealth.services?.redis?.latencyMs !== null && (
                    <span className="text-[11px] text-zinc-400">
                      {systemHealth.services?.redis?.latencyMs}ms
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${systemHealth.services?.redis?.status === "UP" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                    {systemHealth.services?.redis?.status || "UP"}
                  </span>
                </div>
              </div>

              {/* Worker Pool */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                <div className="flex items-center gap-3">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="font-semibold text-zinc-200">Background Worker Pool</span>
                    <p className="text-[10px] text-zinc-500">
                      Concurrency: {systemHealth.services?.worker?.concurrency || 5} concurrent threads
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${systemHealth.services?.worker?.status === "UP" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                  {systemHealth.services?.worker?.status || "UP"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              Engine Uptime
            </span>
            <span className="text-zinc-200 font-semibold">
              {formatUptime(systemHealth.uptimeSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Section 4: 5 Most Recent Activities ── */}
      <div className="p-6 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400" />
              Recent Dispatch Activity
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Live audit stream of the 5 most recent notifications handled by the engine.
            </p>
          </div>
        </div>

        {recentActivities.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 font-mono bg-zinc-900/40 rounded-xl border border-zinc-800/50">
            No notification dispatches recorded in the database yet. Send a test message from Sandbox to see it appear here!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-zinc-800/80 text-zinc-400 uppercase text-[10px]">
                  <th className="pb-3 font-semibold">Title / Notification</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Priority</th>
                  <th className="pb-3 font-semibold">Channels</th>
                  <th className="pb-3 font-semibold">Scope / Target</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recentActivities.map((item) => {
                  const priority = item.priority?.toLowerCase();
                  const priorityColor =
                    priority === "critical"
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : priority === "high"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-zinc-800/80 text-zinc-300 border-zinc-700/50";

                  const status = item.status?.toUpperCase();
                  const statusColor =
                    status === "DELIVERED" || status === "SENT"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : status === "FAILED"
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20";

                  return (
                    <tr key={item._id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3 pr-4 font-sans font-medium text-zinc-200 max-w-xs truncate">
                        {item.title}
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">
                        {item.category || "GENERAL"}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityColor}`}>
                          {item.priority || "normal"}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1">
                          {(item.channels || ["IN_APP"]).map((ch, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] text-zinc-300 border border-zinc-700/50"
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">
                        <span className="text-zinc-500">{item.scope}: </span>
                        {item.recipientId ? item.recipientId.slice(0, 10) + "..." : "ALL"}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor}`}>
                          {status || "QUEUED"}
                        </span>
                      </td>
                      <td className="py-3 text-right text-zinc-500">
                        {formatTimeAgo(item.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Overview;
