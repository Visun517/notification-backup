import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Command,
  X,
  FileCode2,
  ShieldAlert,
  Bell,
  User,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Sliders,
  Send,
  Terminal,
  BarChart3,
  Sparkles,
  Tag,
  ArrowRight,
} from "lucide-react";
import { fetchGlobalSearchApi } from "../../api/notificationApi";

const QUICK_NAV = [
  {
    name: "Overview Dashboard",
    desc: "Key metrics, delivery throughput & charts",
    path: "/",
    icon: BarChart3,
    category: "Navigation",
  },
  {
    name: "Live Logs Stream",
    desc: "Real-time socket terminal & engine events",
    path: "/logs",
    icon: Terminal,
    category: "Navigation",
  },
  {
    name: "Sandbox Testing",
    desc: "Simulate & dispatch test notifications",
    path: "/sandbox",
    icon: Send,
    category: "Navigation",
  },
  {
    name: "Message Templates",
    desc: "Manage multi-channel Handlebars blueprints",
    path: "/templates",
    icon: FileCode2,
    category: "Navigation",
  },
  {
    name: "Dead-Letter Queue (DLQ)",
    desc: "Triage & replay terminal failed jobs",
    path: "/dlq",
    icon: ShieldAlert,
    category: "Navigation",
  },
  {
    name: "System Settings",
    desc: "Global switches, BullMQ backoff & API keys",
    path: "/settings",
    icon: Sliders,
    category: "Navigation",
  },
];

export const CommandPalette = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({
    notifications: [],
    templates: [],
    dlq: [],
    users: [],
  });

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults({ notifications: [], templates: [], dlq: [], users: [] });
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Global keydown: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // 300ms Debounced search effect
  useEffect(() => {
    if (!query.trim()) {
      setResults({ notifications: [], templates: [], dlq: [], users: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetchGlobalSearchApi(query.trim());
        if (res?.data?.results) {
          setResults(res.data.results);
        }
      } catch (err) {
        console.error("Global search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  // Filter quick nav based on query
  const filteredQuickNav = QUICK_NAV.filter(
    (nav) =>
      !query.trim() ||
      nav.name.toLowerCase().includes(query.toLowerCase()) ||
      nav.desc.toLowerCase().includes(query.toLowerCase())
  );

  const hasAnyResults =
    filteredQuickNav.length > 0 ||
    results.templates.length > 0 ||
    results.dlq.length > 0 ||
    results.notifications.length > 0 ||
    results.users.length > 0;

  const handleSelectNav = (path) => {
    onClose();
    navigate(path);
  };

  const handleSelectTemplate = (template) => {
    onClose();
    navigate("/templates");
  };

  const handleSelectDLQ = (job) => {
    onClose();
    navigate("/dlq");
  };

  const handleSelectNotification = (notif) => {
    onClose();
    navigate("/logs");
  };

  const handleSelectUser = (user) => {
    onClose();
    navigate("/sandbox", {
      state: {
        presetTitle: `Direct Message to ${user.userId}`,
        presetMessage: "Admin targeted dispatch notification.",
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-[#0B0D13] border border-zinc-800/90 rounded-2xl shadow-2xl shadow-black/90 overflow-hidden flex flex-col max-h-[75vh]">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800/80 bg-zinc-950/60">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search templates, DLQ jobs, events, users, or jump to page..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
          />

          {loading ? (
            <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
          ) : query ? (
            <button
              onClick={() => setQuery("")}
              className="p-1 text-zinc-400 hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}

          <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 shrink-0">
            <span>ESC</span>
          </div>
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs custom-scrollbar">
          {!hasAnyResults && !loading && (
            <div className="py-12 text-center text-zinc-500 space-y-2">
              <Search className="w-8 h-8 mx-auto text-zinc-600" />
              <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-[11px] text-zinc-600">
                Try searching by template name, job ID, userId, or notification title
              </p>
            </div>
          )}

          {/* Group 1: Navigation Shortcuts */}
          {filteredQuickNav.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>Quick Navigation</span>
              </div>
              <div className="space-y-1">
                {filteredQuickNav.map((nav) => {
                  const Icon = nav.icon;
                  return (
                    <button
                      key={nav.path}
                      onClick={() => handleSelectNav(nav.path)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-zinc-900/80 hover:text-white text-zinc-300 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-colors">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-200 group-hover:text-white">
                            {nav.name}
                          </div>
                          <div className="text-[11px] text-zinc-500 line-clamp-1">
                            {nav.desc}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 2: Templates */}
          {results.templates.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FileCode2 className="w-3 h-3 text-cyan-400" />
                  <span>Templates ({results.templates.length})</span>
                </div>
                <span className="text-[10px] text-cyan-400 hover:underline cursor-pointer" onClick={() => handleSelectNav("/templates")}>
                  View all in Templates &rarr;
                </span>
              </div>
              <div className="space-y-1">
                {results.templates.map((template) => (
                  <button
                    key={template._id}
                    onClick={() => handleSelectTemplate(template)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-zinc-900/80 hover:text-white text-zinc-300 transition-colors group border border-transparent hover:border-zinc-800/80"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold">
                        🧩
                      </div>
                      <div>
                        <div className="font-semibold text-white group-hover:text-cyan-200 flex items-center gap-2">
                          #{template.name}
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            {template.category}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 line-clamp-1">
                          {template.subject}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-cyan-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Group 3: Dead-Letter Queue (DLQ) */}
          {results.dlq.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3 h-3 text-amber-400" />
                  <span>Dead-Letter Queue ({results.dlq.length})</span>
                </div>
                <span className="text-[10px] text-amber-400 hover:underline cursor-pointer" onClick={() => handleSelectNav("/dlq")}>
                  Manage in DLQ &rarr;
                </span>
              </div>
              <div className="space-y-1">
                {results.dlq.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => handleSelectDLQ(job)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-zinc-900/80 hover:text-white text-zinc-300 transition-colors group border border-transparent hover:border-zinc-800/80"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold font-mono text-[10px]">
                        DLQ
                      </div>
                      <div>
                        <div className="font-semibold text-white group-hover:text-amber-200 flex items-center gap-2 font-mono">
                          Job #{job.id}
                          {job.notificationId && (
                            <span className="text-[10px] text-zinc-400">
                              (Notif: {job.notificationId})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-rose-400/90 line-clamp-1 font-mono">
                          {job.failedReason}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-amber-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Group 4: Notifications & Events */}
          {results.notifications.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Bell className="w-3 h-3 text-purple-400" />
                  <span>Notifications & Events ({results.notifications.length})</span>
                </div>
                <span className="text-[10px] text-purple-400 hover:underline cursor-pointer" onClick={() => handleSelectNav("/logs")}>
                  View Live Stream &rarr;
                </span>
              </div>
              <div className="space-y-1">
                {results.notifications.map((notif) => (
                  <button
                    key={notif._id}
                    onClick={() => handleSelectNotification(notif)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-zinc-900/80 hover:text-white text-zinc-300 transition-colors group border border-transparent hover:border-zinc-800/80"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold">
                        🔔
                      </div>
                      <div>
                        <div className="font-semibold text-white group-hover:text-purple-200 flex items-center gap-2">
                          {notif.title || "Notification"}
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${
                              notif.status === "DELIVERED"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : notif.status === "QUEUED"
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {notif.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          ID: {notif._id} | Recipient: {notif.recipientId || "BROADCAST"}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-purple-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Group 5: User Profiles */}
          {results.users.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
                <User className="w-3 h-3 text-emerald-400" />
                <span>Registered Users & Profiles ({results.users.length})</span>
              </div>
              <div className="space-y-1">
                {results.users.map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => handleSelectUser(u)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-zinc-900/80 hover:text-white text-zinc-300 transition-colors group border border-transparent hover:border-zinc-800/80"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold">
                        👤
                      </div>
                      <div>
                        <div className="font-semibold text-white group-hover:text-emerald-200 font-mono">
                          User ID: {u.userId}
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                          <span>Tags:</span>
                          {u.subscribedTags?.length > 0 ? (
                            u.subscribedTags.map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono text-[9px]"
                              >
                                {t}
                              </span>
                            ))
                          ) : (
                            <span className="italic">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Dispatch test</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer shortcuts info */}
        <div className="px-4 py-2.5 border-t border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-3">
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">ESC</kbd> to exit</span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:inline">Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">↵</kbd> to select</span>
          </div>
          <div className="text-zinc-400 flex items-center gap-1.5">
            <Command className="w-3 h-3" />
            <span>Search Control Plane</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
