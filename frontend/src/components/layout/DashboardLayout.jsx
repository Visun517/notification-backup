import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import ToastContainer from "../notifications/ToastContainer";
import NotificationModal from "../notifications/NotificationModal";
import ConnectionStatusBanner from "../notifications/ConnectionStatusBanner";

export const DashboardLayout = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#07090E] text-zinc-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Realtime Connectivity Alert Banner */}
       {/* <ConnectionStatusBanner /> */}

      {/* Floating System Toasts & Notification Center Popover */}
      {/* <ToastContainer />
      <NotificationModal /> */}

      {/* Fixed Left Navigation Sidebar */}
      <Sidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Right Column: Header + Scrollable Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <Header onMenuClick={() => setIsMobileSidebarOpen(true)} />

        {/* Dynamic Route Content Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#07090E] p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
