import React, { useState, useEffect } from "react";
import {
  Menu,
  Activity,
  Radio,
  Search,
  Command,
  ChevronDown,
  User,
  ShieldCheck,
  Server,
} from "lucide-react";
import NotificationBell from "../notifications/NotificationBell";
import CommandPalette from "../common/CommandPalette";

export const Header = ({ onMenuClick }) => {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  // Global shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-[#0B0D13]/90 backdrop-blur-md border-b border-zinc-800/80">
        {/* Left Section: Mobile Trigger & Search / Breadcrumbs */}
        <div className="flex items-center gap-3 lg:gap-4">
          {/* Mobile Hamburger Toggle */}
          <button
            onClick={onMenuClick}
            className="p-2 text-zinc-400 hover:text-white rounded-lg lg:hidden hover:bg-zinc-800/60 focus:outline-none"
            aria-label="Open navigation sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile Search Button */}
          <button
            onClick={() => setIsPaletteOpen(true)}
            className="p-2 text-zinc-400 hover:text-white rounded-lg md:hidden hover:bg-zinc-800/60"
            title="Search (Cmd+K)"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Global Search / Command Bar */}
          <div
            onClick={() => setIsPaletteOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-xs text-zinc-400 w-56 lg:w-72 hover:border-zinc-700 transition-colors cursor-pointer group"
          >
            <Search className="w-3.5 h-3.5 text-zinc-400 group-hover:text-cyan-400 shrink-0 transition-colors" />
            <span className="truncate group-hover:text-zinc-300 transition-colors">
              Search events, users, templates...
            </span>
            <div className="flex items-center gap-0.5 ml-auto text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 group-hover:border-zinc-600 transition-colors">
              <Command className="w-3 h-3 inline" />K
            </div>
          </div>
        </div>

      {/* Right Section: System Status + Telemetry Metric + User Profile */}
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Engine System Status Badge */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
          <span className="text-[11px] font-mono font-medium tracking-tight text-emerald-400 flex items-center gap-1">
            <span className="text-zinc-400 hidden xl:inline">Engine Status:</span>
            <span className="font-semibold">HEALTHY</span>
          </span>
        </div>

        {/* Telemetry Metric: Active Sockets */}
        <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800/80 font-mono text-xs">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-zinc-400 text-[11px] hidden md:inline">
            Active Sockets:
          </span>
          <span className="text-cyan-300 font-bold tracking-tight text-[11px] sm:text-xs">
            1,420
          </span>
        </div>

        {/* Real-time Notification Bell Widget */}
        <div className="border-l border-zinc-800/80 pl-3 sm:pl-4">
          <NotificationBell />
        </div>

        {/* Developer / Admin Profile Placeholder */}
        <div className="flex items-center gap-2.5 pl-1 cursor-pointer group">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-[1.5px]">
              <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center text-white text-xs font-semibold">
                OP
              </div>
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0B0D13]"></span>
          </div>

          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">
              Operator
            </span>
            <span className="text-[10px] font-mono text-indigo-400 font-medium">
              ADMIN ROLE
            </span>
          </div>

          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors hidden sm:block" />
        </div>
      </div>
    </header>

      {/* Central Global Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
      />
    </>
  );
};

export default Header;
