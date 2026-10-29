import React, { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Send,
  Code2,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  AlertOctagon,
  CheckCircle2,
  Bell,
  Smartphone,
  Mail,
  MessageSquare,
  Radio,
  ExternalLink,
  Layers,
  ArrowRight,
  ShieldAlert,
  Info,
} from "lucide-react";
import { sendTestNotificationApi } from "../api/notificationApi";

// Default test recipient from authSlice
const DEFAULT_TEST_USER_ID = "6a3288a29a73a4c14616ed00";

const PRESETS = [
  {
    name: "🚨 Critical Alert",
    title: "Severe Weather Emergency Alert",
    message: "Flash flood warning issued for your current sector. Please seek higher ground immediately.",
    priority: "critical",
    category: "ALERT",
    scope: "UNICAST",
    recipientId: DEFAULT_TEST_USER_ID,
    channels: ["IN_APP", "PUSH"],
    actionUrl: "/safety/alerts",
  },
  {
    name: "📢 Broadcast Update",
    title: "Engine Scheduled Maintenance",
    message: "Platform services will undergo brief routine updates tonight at 02:00 UTC. No downtime expected.",
    priority: "normal",
    category: "SYSTEM",
    scope: "BROADCAST",
    recipientId: "",
    channels: ["IN_APP", "PUSH"],
    actionUrl: "/announcements",
  },
  {
    name: "💳 Account Notification",
    title: "Payment Transfer Confirmed",
    message: "Your monthly settlement batch of $1,420.50 has been processed successfully.",
    priority: "high",
    category: "PAYMENT",
    scope: "UNICAST",
    recipientId: DEFAULT_TEST_USER_ID,
    channels: ["IN_APP"],
    actionUrl: "/finance/transactions",
  },
];

export const Sandbox = () => {
  const location = useLocation();

  // Form State
  const [title, setTitle] = useState("Sandbox Test Alert");
  const [message, setMessage] = useState(
    "Testing the real-time notification engine pipeline from the admin sandbox."
  );
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("SYSTEM");
  const [scope, setScope] = useState("UNICAST");
  const [recipientId, setRecipientId] = useState(DEFAULT_TEST_USER_ID);
  const [channels, setChannels] = useState(["IN_APP", "PUSH"]);
  const [actionUrl, setActionUrl] = useState("/dashboard");

  // Load preset if passed via navigation (e.g. from Templates page)
  useEffect(() => {
    if (location.state?.presetTitle) {
      setTitle(location.state.presetTitle);
    }
    if (location.state?.presetMessage) {
      setMessage(location.state.presetMessage);
    }
    if (location.state?.presetCategory) {
      setCategory(location.state.presetCategory);
    }
    if (Array.isArray(location.state?.presetChannels) && location.state.presetChannels.length > 0) {
      setChannels(location.state.presetChannels);
    }
  }, [location.state]);

  // Interaction State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "success" | "error", message, data }
  const [copiedJson, setCopiedJson] = useState(false);

  // Compute live JSON payload
  const payload = useMemo(() => {
    const data = {
      title: title.trim(),
      message: message.trim(),
      priority: priority.toLowerCase(),
      category: category.toUpperCase(),
      scope: scope.toUpperCase(),
      channels,
    };

    if (scope === "UNICAST") {
      data.recipientId = recipientId.trim();
    }

    if (actionUrl.trim()) {
      data.actionUrl = actionUrl.trim();
    }

    return data;
  }, [title, message, priority, category, scope, recipientId, channels, actionUrl]);

  // Channel toggle handler
  const handleToggleChannel = (channelKey) => {
    setChannels((prev) => {
      if (prev.includes(channelKey)) {
        if (prev.length === 1) return prev; // Keep at least one channel
        return prev.filter((c) => c !== channelKey);
      } else {
        return [...prev, channelKey];
      }
    });
  };

  // Preset loader
  const handleApplyPreset = (preset) => {
    setTitle(preset.title);
    setMessage(preset.message);
    setPriority(preset.priority);
    setCategory(preset.category);
    setScope(preset.scope);
    setRecipientId(preset.recipientId);
    setChannels(preset.channels);
    setActionUrl(preset.actionUrl);
    setFeedback(null);
  };

  // Form Reset
  const handleResetForm = () => {
    setTitle("");
    setMessage("");
    setPriority("normal");
    setCategory("GENERAL");
    setScope("UNICAST");
    setRecipientId(DEFAULT_TEST_USER_ID);
    setChannels(["IN_APP", "PUSH"]);
    setActionUrl("");
    setFeedback(null);
  };

  // Copy JSON handler
  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Submit test dispatch
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (!title.trim() || !message.trim()) {
      setFeedback({
        type: "error",
        message: "Notification Title and Message Body are required.",
      });
      return;
    }

    if (scope === "UNICAST" && !recipientId.trim()) {
      setFeedback({
        type: "error",
        message: "Target Recipient ID is required for UNICAST notifications.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await sendTestNotificationApi(payload);
      if (response && response.status === "success") {
        setFeedback({
          type: "success",
          message: "Notification successfully enqueued into the BullMQ delivery pipeline!",
          data: response.data,
        });
      } else {
        throw new Error(response?.message || "Failed to dispatch notification.");
      }
    } catch (err) {
      console.error("Test dispatch failed:", err);
      const serverMessage =
        err?.response?.data?.message || err?.message || "Internal server error occurred.";
      setFeedback({
        type: "error",
        message: serverMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-indigo-400" />
            Notification Sandbox
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Construct, preview, and safely dispatch test notifications across in-app WebSockets and FCM push channels.
          </p>
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-2.5">
          <Link
            to="/logs"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            Watch in Live Logs
          </Link>
          <Link
            to="/test-client"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-600/30 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Test Client View
          </Link>
        </div>
      </div>

      {/* ── Preset Scenarios Bar ── */}
      <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 overflow-x-auto custom-scrollbar">
        <span className="text-xs font-mono font-semibold text-zinc-400 px-2 shrink-0">
          Quick Presets:
        </span>
        {PRESETS.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleApplyPreset(preset)}
            className="px-3 py-1 rounded-xl text-xs font-mono font-medium bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800/80 hover:border-zinc-700 transition-all shrink-0"
          >
            {preset.name}
          </button>
        ))}
        <button
          type="button"
          onClick={handleResetForm}
          className="ml-auto px-2.5 py-1 text-xs font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors shrink-0"
        >
          <RotateCcw className="w-3 h-3" /> Clear
        </button>
      </div>

      {/* ── Main Two-Column Layout (Form + JSON Preview) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 p-6 shadow-sm space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Title Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Notification Title <span className="text-rose-400">*</span>
                </label>
                <span className="text-[10px] font-mono text-zinc-500">
                  {title.length}/200
                </span>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                placeholder="e.g. Critical Safety Alert"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-sm font-sans text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/80 transition-colors"
              />
            </div>

            {/* Message Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Message Body <span className="text-rose-400">*</span>
                </label>
                <span className="text-[10px] font-mono text-zinc-500">
                  {message.length} chars
                </span>
              </div>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                placeholder="Write the notification message content..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-sm font-sans text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/80 transition-colors resize-y min-h-[90px]"
              />
            </div>

            {/* Dual Dropdowns: Priority & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Priority */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                  Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs font-mono font-medium text-zinc-200 focus:outline-none focus:border-indigo-500/80 transition-colors"
                >
                  <option value="critical">CRITICAL (Emergency alert sound & vibration)</option>
                  <option value="high">HIGH (High priority chime)</option>
                  <option value="normal">NORMAL (Standard feed notification)</option>
                  <option value="low">LOW (Background update)</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                  Category Tag
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs font-mono font-medium text-zinc-200 focus:outline-none focus:border-indigo-500/80 transition-colors"
                >
                  <option value="SYSTEM">SYSTEM</option>
                  <option value="ALERT">ALERT</option>
                  <option value="SAFETY">SAFETY</option>
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="BOOKING">BOOKING</option>
                  <option value="GENERAL">GENERAL</option>
                </select>
              </div>
            </div>

            {/* Scope Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                Delivery Scope
              </label>
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setScope("UNICAST")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    scope === "UNICAST"
                      ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-300 font-semibold"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="font-bold">UNICAST (Targeted)</div>
                  <div className="text-[10px] text-zinc-500 font-normal mt-0.5">
                    Delivered to a specific user ID
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScope("BROADCAST")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    scope === "BROADCAST"
                      ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-300 font-semibold"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="font-bold">BROADCAST (All Users)</div>
                  <div className="text-[10px] text-zinc-500 font-normal mt-0.5">
                    Delivered to every connected client
                  </div>
                </button>
              </div>
            </div>

            {/* Target Recipient ID (Visible only when UNICAST) */}
            {scope === "UNICAST" && (
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Target Recipient ID <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setRecipientId(DEFAULT_TEST_USER_ID)}
                    className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300"
                  >
                    Paste Test Driver ID
                  </button>
                </div>
                <input
                  type="text"
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  placeholder="e.g. 6a3288a29a73a4c14616ed00"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/80"
                />
                <p className="text-[11px] text-zinc-500">
                  Matches the user account active in the Test Client view so you can watch toasts appear in real-time.
                </p>
              </div>
            )}

            {/* Channels Selection Checkboxes */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                Active Delivery Channels
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                {[
                  { id: "IN_APP", label: "IN_APP", icon: Bell, desc: "WebSocket" },
                  { id: "PUSH", label: "PUSH", icon: Smartphone, desc: "FCM Web Push" },
                  { id: "EMAIL", label: "EMAIL", icon: Mail, desc: "SMTP / Resend" },
                  { id: "SMS", label: "SMS", icon: MessageSquare, desc: "Twilio / SMS" },
                ].map((item) => {
                  const isChecked = channels.includes(item.id);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleToggleChannel(item.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        isChecked
                          ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                          : "bg-zinc-900/60 border-zinc-800/80 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Icon className="w-4 h-4" />
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                            isChecked
                              ? "bg-indigo-600 border-indigo-500 text-white"
                              : "border-zinc-700 bg-zinc-950"
                          }`}
                        >
                          {isChecked && "✓"}
                        </span>
                      </div>
                      <span className="font-bold text-[11px]">{item.label}</span>
                      <span className="text-[9px] text-zinc-500">{item.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Deep-Link URL */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                Action Deep-Link URL (Optional)
              </label>
              <input
                type="text"
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                placeholder="e.g. /safety/map or /orders/123"
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/80"
              />
            </div>

            {/* Feedback Alerts */}
            {feedback && (
              <div
                className={`p-4 rounded-xl border text-xs font-mono flex items-start gap-3 ${
                  feedback.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertOctagon className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <p className="font-bold font-sans text-sm">
                    {feedback.type === "success" ? "Dispatch Queued Successfully" : "Dispatch Failed"}
                  </p>
                  <p className="leading-relaxed">{feedback.message}</p>
                  {feedback.data && (
                    <div className="mt-2 pt-2 border-t border-emerald-500/20 text-[11px] text-zinc-400 space-y-0.5">
                      <div><strong className="text-zinc-300">Notification ID:</strong> {feedback.data._id}</div>
                      <div><strong className="text-zinc-300">BullMQ Job ID:</strong> {feedback.data.jobId || "sync-fallback"}</div>
                      <div><strong className="text-zinc-300">Initial Status:</strong> {feedback.data.status}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enqueuing into Engine...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Dispatch Test Notification</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live JSON Payload Preview (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-sm overflow-hidden flex flex-col font-mono text-xs">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/80 border-b border-zinc-800/80">
            <div className="flex items-center gap-2 text-zinc-300">
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold text-xs">Engine Request Payload</span>
            </div>

            <button
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {copiedJson ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>
          </div>

          {/* JSON Syntax Viewer */}
          <div className="p-4 bg-black/60 overflow-x-auto custom-scrollbar max-h-[500px]">
            <pre className="text-indigo-300 leading-relaxed font-mono text-xs">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>

          {/* Verification Advice Footer */}
          <div className="p-4 bg-zinc-950/50 border-t border-zinc-800/80 space-y-2 text-[11px] text-zinc-400 font-sans">
            <div className="flex items-center gap-2 font-semibold text-zinc-200">
              <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              Testing Workflow Verification:
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-zinc-400 text-xs">
              <li>
                Click <strong>Dispatch Test Notification</strong> to enqueue via BullMQ.
              </li>
              <li>
                Switch to <Link to="/logs" className="text-indigo-400 hover:underline">Live Logs</Link> to watch the real-time worker process it.
              </li>
              <li>
                Open the <Link to="/test-client" className="text-indigo-400 hover:underline">Test Client</Link> tab to verify the toast alert & bell badge.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sandbox;
