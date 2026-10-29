import React, { useState, useEffect } from "react";
import {
  Sliders,
  Bell,
  Smartphone,
  Mail,
  MessageSquare,
  Layers,
  Database,
  ShieldCheck,
  KeyRound,
  Save,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Radio,
  Server,
  Zap,
  Check,
  X,
  Lock,
  Cpu,
  Clock,
  Gauge,
  Info,
} from "lucide-react";
import { fetchSettingsApi, updateSettingsApi } from "../api/notificationApi";

// Navigation tabs
const TABS = [
  {
    id: "channels",
    name: "Global Channels",
    desc: "Master switches & delivery toggles",
    icon: Radio,
  },
  {
    id: "queue",
    name: "Queue & Routing",
    desc: "BullMQ retry backoff & concurrency",
    icon: Cpu,
  },
  {
    id: "retention",
    name: "Data Retention",
    desc: "Automated cleanup & log lifecycle",
    icon: Database,
  },
  {
    id: "limits",
    name: "Rate Limits & Security",
    desc: "Traffic throttling & burst windows",
    icon: Gauge,
  },
  {
    id: "providers",
    name: "Provider Configs",
    desc: "FCM & SMTP credentials",
    icon: KeyRound,
  },
];

export const Settings = () => {
  const [activeTab, setActiveTab] = useState("channels");

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', message: string }

  // Masked field visibility toggles
  const [showFcmKey, setShowFcmKey] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // Form State
  const [channels, setChannels] = useState({
    inApp: true,
    push: true,
    email: false,
    sms: false,
  });

  const [queue, setQueue] = useState({
    maxRetries: 3,
    backoffDelayMs: 2000,
    concurrency: 5,
    dlqRetentionHours: 72,
  });

  const [retention, setRetention] = useState({
    logRetentionDays: 30,
    notificationRetentionDays: 60,
  });

  const [rateLimits, setRateLimits] = useState({
    requestsPerMinute: 120,
    burstLimit: 30,
  });

  const [providers, setProviders] = useState({
    fcm: {
      projectId: "notification-engine-7443d",
      serviceAccountKey: "••••••••••••••••••••••••••••••••",
    },
    smtp: {
      host: "smtp.mailgun.org",
      port: 587,
      user: "postmaster@notification-engine.io",
      password: "••••••••••••••••",
    },
  });

  // Load existing configuration from backend
  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchSettingsApi();
      if (res?.data?.settings) {
        const s = res.data.settings;
        if (s.channels) setChannels(s.channels);
        if (s.queue) setQueue(s.queue);
        if (s.retention) setRetention(s.retention);
        if (s.rateLimits) setRateLimits(s.rateLimits);
        if (s.providers) setProviders(s.providers);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError(
        err?.response?.data?.message || err.message || "Failed to load system settings"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Save changes to backend
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setNotice(null);

    const payload = {
      channels,
      queue,
      retention,
      rateLimits,
      providers,
    };

    try {
      const res = await updateSettingsApi(payload);
      setNotice({
        type: "success",
        message: res.message || "System configuration saved and applied across cluster!",
      });
      if (res?.data?.settings) {
        const s = res.data.settings;
        if (s.channels) setChannels(s.channels);
        if (s.queue) setQueue(s.queue);
        if (s.retention) setRetention(s.retention);
        if (s.rateLimits) setRateLimits(s.rateLimits);
        if (s.providers) setProviders(s.providers);
      }
      setTimeout(() => setNotice(null), 5000);
    } catch (err) {
      console.error("Failed to update settings:", err);
      setNotice({
        type: "error",
        message:
          err?.response?.data?.message ||
          err.message ||
          "Failed to save system settings",
      });
    } finally {
      setSaving(false);
    }
  };

  // Reset to system defaults
  const handleResetDefaults = () => {
    if (!window.confirm("Reset all settings to default values?")) return;
    setChannels({
      inApp: true,
      push: true,
      email: false,
      sms: false,
    });
    setQueue({
      maxRetries: 3,
      backoffDelayMs: 2000,
      concurrency: 5,
      dlqRetentionHours: 72,
    });
    setRetention({
      logRetentionDays: 30,
      notificationRetentionDays: 60,
    });
    setRateLimits({
      requestsPerMinute: 120,
      burstLimit: 30,
    });
    setNotice({
      type: "success",
      message: "Settings reset to defaults. Click 'Save Changes' to persist.",
    });
  };

  if (loading) {
    return (
      <div className="p-8 min-h-screen bg-[#07090E] text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-sm text-zinc-400 font-mono">Loading system configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 bg-[#07090E] min-h-screen text-zinc-100">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-lg shadow-violet-950/30">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              System Settings & Policies
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Manage global channel switches, BullMQ backoff schedules, data retention, and provider keys
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Defaults
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-950/50 hover:shadow-cyan-900/40 transition-all flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Feedback Notification ── */}
      {notice && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between shadow-lg transition-all ${
            notice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-emerald-950/20"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-rose-950/20"
          }`}
        >
          <div className="flex items-center gap-3">
            {notice.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-zinc-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Main Layout: Inner Sidebar Tabs + Content Panel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Inner Vertical Sidebar Tabs (4 cols) */}
        <div className="lg:col-span-4 space-y-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full p-4 rounded-2xl text-left border transition-all flex items-start gap-3.5 ${
                  isActive
                    ? "bg-[#0B0D13] border-cyan-500/50 shadow-xl shadow-cyan-950/20 text-white"
                    : "bg-[#0B0D13]/50 border-zinc-800/80 hover:border-zinc-700/80 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    isActive
                      ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-400"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-500"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-bold tracking-tight ${
                      isActive ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {tab.name}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                    {tab.desc}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Quick Engine Status Card */}
          <div className="p-5 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 text-xs text-zinc-400 space-y-2.5 mt-6">
            <div className="font-semibold text-zinc-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Runtime Cluster
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60 font-mono">
              <span className="text-zinc-500">Tenant ID:</span>
              <span className="text-zinc-200">default</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60 font-mono">
              <span className="text-zinc-500">Active Pipeline:</span>
              <span className="text-emerald-400">BullMQ + Redis</span>
            </div>
            <div className="flex justify-between py-1 font-mono">
              <span className="text-zinc-500">Sync Mode:</span>
              <span className="text-cyan-400">Distributed Multi-Node</span>
            </div>
          </div>
        </div>

        {/* Tab Content Panel (8 cols) */}
        <div className="lg:col-span-8 bg-[#0B0D13]/90 border border-zinc-800/80 rounded-2xl p-7 shadow-xl shadow-black/40 backdrop-blur-xl">
          {/* ──────────────────────────────────────────────────────── */}
          {/* TAB 1: GLOBAL CHANNELS                                   */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === "channels" && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-cyan-400" />
                  Global Channel Master Switches
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Instantly enable or disable delivery channels globally across all applications and notification scopes.
                </p>
              </div>

              {/* Warning Notice */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <span className="font-semibold">Master Circuit Breakers:</span> Disabling a channel halts instant delivery to end-user devices while queued background tasks continue staging safely in Redis.
                </div>
              </div>

              {/* Switches Grid */}
              <div className="space-y-4">
                {/* 1. In-App */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        In-App WebSockets
                        {channels.inApp ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium font-mono">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium font-mono">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Real-time bi-directional alerts via Socket.io to active web and dashboard clients.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.inApp}
                      onChange={(e) =>
                        setChannels({ ...channels, inApp: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                {/* 2. Push */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        Mobile Push (FCM / APNs)
                        {channels.push ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium font-mono">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium font-mono">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Device background push delivery via Firebase Cloud Messaging & Apple Push.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.push}
                      onChange={(e) =>
                        setChannels({ ...channels, push: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                {/* 3. Email */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        Transactional Email (SMTP)
                        {channels.email ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium font-mono">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium font-mono">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        High-deliverability transactional emails via Mailgun, SendGrid, or custom SMTP host.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.email}
                      onChange={(e) =>
                        setChannels({ ...channels, email: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                {/* 4. SMS */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        SMS Direct Carrier (Twilio)
                        {channels.sms ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium font-mono">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium font-mono">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Mission-critical SMS notifications for one-time passwords and security bypass alerts.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.sms}
                      onChange={(e) =>
                        setChannels({ ...channels, sms: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* TAB 2: QUEUE & ROUTING                                   */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === "queue" && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-cyan-400" />
                  BullMQ Queue & Dispatch Orchestration
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Configure worker concurrency thresholds, retry attempt caps, and exponential backoff schedules.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Max Retries */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Max Retry Attempts
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Number of automatic retries before moving a failed notification to Dead Letter Queue (DLQ).
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={queue.maxRetries}
                      onChange={(e) =>
                        setQueue({
                          ...queue,
                          maxRetries: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-28 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-zinc-400">retries per job</span>
                  </div>
                </div>

                {/* Backoff Delay */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Exponential Backoff Delay (ms)
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Base duration between retry attempts (delay doubles on successive failures).
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="number"
                      min={500}
                      max={60000}
                      step={500}
                      value={queue.backoffDelayMs}
                      onChange={(e) =>
                        setQueue({
                          ...queue,
                          backoffDelayMs: parseInt(e.target.value) || 500,
                        })
                      }
                      className="w-28 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-zinc-400">milliseconds</span>
                  </div>
                </div>

                {/* Worker Concurrency */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Worker Thread Concurrency
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Parallel notifications processed simultaneously per worker instance.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={queue.concurrency}
                      onChange={(e) =>
                        setQueue({
                          ...queue,
                          concurrency: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-28 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-zinc-400">concurrent jobs</span>
                  </div>
                </div>

                {/* DLQ Retention */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Dead Letter Queue (DLQ) Lifespan
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    How long failed notifications remain inspectable before being discarded.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={queue.dlqRetentionHours}
                      onChange={(e) =>
                        setQueue({
                          ...queue,
                          dlqRetentionHours: parseInt(e.target.value) || 24,
                        })
                      }
                      className="w-28 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-zinc-400">hours</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* TAB 3: DATA RETENTION                                    */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === "retention" && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-cyan-400" />
                  Automated Data Lifecycle & Retention Policies
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Specify TTL (Time To Live) limits for notification records and admin audit streams to control database growth.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Log Retention */}
                <div className="p-5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <label className="text-xs font-semibold text-zinc-200">
                      Audit & Live Logs Retention
                    </label>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    System event records (delivering, rate-limiting, socket connections) will be purged after this duration.
                  </p>
                  <select
                    value={retention.logRetentionDays}
                    onChange={(e) =>
                      setRetention({
                        ...retention,
                        logRetentionDays: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value={7}>7 Days (Aggressive cleanup)</option>
                    <option value={14}>14 Days</option>
                    <option value={30}>30 Days (Recommended)</option>
                    <option value={60}>60 Days</option>
                    <option value={90}>90 Days (Extended)</option>
                  </select>
                </div>

                {/* Notification Records */}
                <div className="p-5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-purple-400" />
                    <label className="text-xs font-semibold text-zinc-200">
                      Notification Feed History
                    </label>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    In-app notification history stored in MongoDB will be hard-deleted after this expiration threshold.
                  </p>
                  <select
                    value={retention.notificationRetentionDays}
                    onChange={(e) =>
                      setRetention({
                        ...retention,
                        notificationRetentionDays: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value={30}>30 Days</option>
                    <option value={60}>60 Days (Standard)</option>
                    <option value={90}>90 Days</option>
                    <option value={180}>180 Days (6 Months)</option>
                    <option value={365}>365 Days (1 Year)</option>
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/60 flex items-center gap-3 text-xs text-zinc-400">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>
                  Background cron sweeps run daily at 03:00 UTC using MongoDB TTL indexes for zero-downtime pruning.
                </span>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* TAB 4: RATE LIMITS & SECURITY                            */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === "limits" && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-cyan-400" />
                  Traffic Throttling & Ingestion Rate Caps
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Prevent runaway client loops and DDoS amplification through Redis atomic sliding window counters.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Requests Per Minute */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Max Requests Per Minute (RPM)
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Sustained frequency cap allowed per client IP or authenticated bearer identity.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      value={rateLimits.requestsPerMinute}
                      onChange={(e) =>
                        setRateLimits({
                          ...rateLimits,
                          requestsPerMinute: parseInt(e.target.value) || 60,
                        })
                      }
                      className="w-28 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-zinc-400">req / min</span>
                  </div>
                </div>

                {/* Burst Limit */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Instantaneous Burst Limit
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Maximum requests permitted within a sub-second burst spike before rate-limiting applies.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={rateLimits.burstLimit}
                      onChange={(e) =>
                        setRateLimits({
                          ...rateLimits,
                          burstLimit: parseInt(e.target.value) || 10,
                        })
                      }
                      className="w-28 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-zinc-400">burst headroom</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-start gap-3">
                <Zap className="w-4 h-4 flex-shrink-0 mt-0.5 text-cyan-400" />
                <div>
                  <span className="font-semibold">Priority Bypass:</span> Any notification dispatched with <code className="bg-cyan-950 px-1 py-0.5 rounded text-cyan-200">priority: &quot;critical&quot;</code> automatically bypasses standard rate limits to ensure emergency safety alerts are never throttled.
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* TAB 5: PROVIDER CONFIGS                                  */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === "providers" && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-cyan-400" />
                  Provider Credentials & Infrastructure API Keys
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Configure upstream gateway credentials for Firebase Cloud Messaging and transactional SMTP mail.
                </p>
              </div>

              {/* FCM Config */}
              <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs">
                      🔥
                    </div>
                    <span className="text-sm font-bold text-white">
                      Firebase Cloud Messaging (FCM)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    CONNECTED
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      FCM Project ID
                    </label>
                    <input
                      type="text"
                      value={providers.fcm?.projectId || ""}
                      onChange={(e) =>
                        setProviders({
                          ...providers,
                          fcm: { ...providers.fcm, projectId: e.target.value },
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-zinc-300">
                        Service Account JSON / Secret
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowFcmKey(!showFcmKey)}
                        className="text-[11px] text-zinc-400 hover:text-cyan-400 flex items-center gap-1"
                      >
                        {showFcmKey ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> Hide
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" /> Reveal
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      type={showFcmKey ? "text" : "password"}
                      value={providers.fcm?.serviceAccountKey || ""}
                      onChange={(e) =>
                        setProviders({
                          ...providers,
                          fcm: {
                            ...providers.fcm,
                            serviceAccountKey: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* SMTP Config */}
              <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-xs">
                      ✉️
                    </div>
                    <span className="text-sm font-bold text-white">
                      SMTP Email Relay (Mailgun / SendGrid)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                    READY
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      SMTP Host
                    </label>
                    <input
                      type="text"
                      value={providers.smtp?.host || ""}
                      onChange={(e) =>
                        setProviders({
                          ...providers,
                          smtp: { ...providers.smtp, host: e.target.value },
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={providers.smtp?.port || 587}
                      onChange={(e) =>
                        setProviders({
                          ...providers,
                          smtp: {
                            ...providers.smtp,
                            port: parseInt(e.target.value) || 587,
                          },
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      SMTP User
                    </label>
                    <input
                      type="text"
                      value={providers.smtp?.user || ""}
                      onChange={(e) =>
                        setProviders({
                          ...providers,
                          smtp: { ...providers.smtp, user: e.target.value },
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-zinc-300">
                        SMTP Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="text-[11px] text-zinc-400 hover:text-cyan-400 flex items-center gap-1"
                      >
                        {showSmtpPass ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> Hide
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" /> Reveal
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      type={showSmtpPass ? "text" : "password"}
                      value={providers.smtp?.password || ""}
                      onChange={(e) =>
                        setProviders({
                          ...providers,
                          smtp: {
                            ...providers.smtp,
                            password: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Save Action Button */}
          <div className="pt-6 mt-8 border-t border-zinc-800/80 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              Changes apply instantly cluster-wide without restarting worker pods.
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-950/50 hover:shadow-cyan-900/40 transition-all flex items-center gap-2 text-xs disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving Configuration...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
