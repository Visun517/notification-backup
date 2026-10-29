import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Terminal,
  Send,
  FileCode2,
  Settings,
  Radio,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  X,
} from "lucide-react";
import { fetchOverviewApi } from "../../api/notificationApi";

export const Sidebar = ({ isOpen, onClose }) => {
  const [dlqCount, setDlqCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      try {
        const res = await fetchOverviewApi();
        if (isMounted && res?.data?.queueStatus) {
          const count = res.data.queueStatus.dlqCount ?? res.data.queueStatus.failed ?? 0;
          setDlqCount(count);
        }
      } catch (_) {}
    };

    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    {
      name: "Overview",
      path: "/",
      icon: BarChart3,
      badge: null,
    },
    {
      name: "Live Logs",
      path: "/logs",
      icon: Terminal,
      badge: "LIVE",
    },
    {
      name: "Sandbox",
      path: "/sandbox",
      icon: Send,
      badge: "TEST",
    },
    {
      name: "Templates",
      path: "/templates",
      icon: FileCode2,
      badge: null,
    },
    {
      name: "Dead-Letter Queue",
      path: "/dlq",
      icon: ShieldAlert,
      badge: dlqCount > 0 ? `${dlqCount}` : null,
      badgeType: "dlq",
    },
    {
      name: "Settings",
      path: "/settings",
      icon: Settings,
      badge: null,
    },
  ];
  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-64 bg-[#0B0D13] border-r border-zinc-800/80 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-md shadow-indigo-500/20">
              <Radio className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                NOTIF<span className="text-indigo-400">ENGINE</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                Control Plane
              </span>
            </div>
          </div>

          {/* Close button for Mobile */}
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-md lg:hidden hover:bg-zinc-800/50"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Environment Indicator Pill */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Environment
            </span>
            <span className="text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px]">
              PROD-V1
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
            Engine Core
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                onClick={() => onClose && onClose()}
                className={({ isActive }) =>
                  `group relative flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-zinc-800/90 text-white shadow-sm border border-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/70"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive
                            ? "text-indigo-400"
                            : "text-zinc-400 group-hover:text-zinc-200"
                        }`}
                      />
                      <span className="tracking-wide">{item.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.badge && (
                        <span
                          className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                            item.badge === "LIVE"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse"
                              : item.badgeType === "dlq"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold"
                              : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400" />
                      )}
                    </div>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Technical Status & Docs */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/40 space-y-3">
          <NavLink
            to="/dlq"
            onClick={() => onClose && onClose()}
            className="p-2.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/60 hover:border-amber-500/40 flex items-start gap-2.5 transition-all group"
          >
            <ShieldAlert
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                dlqCount > 0 ? "text-amber-400 animate-pulse" : "text-emerald-400"
              }`}
            />
            <div className="text-[11px] leading-tight flex-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-300 group-hover:text-white font-medium block">
                  Dead-Letter Queue
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    dlqCount > 0
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  {dlqCount}
                </span>
              </div>
              <span className="text-zinc-500 font-mono text-[10px] mt-0.5 block">
                {dlqCount === 1 ? "1 message pending" : `${dlqCount} messages pending`}
              </span>
            </div>
          </NavLink>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 font-mono">
            <span>Cluster v2.4.0</span>
            <a
              href="#docs"
              className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
            >
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
