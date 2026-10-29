import React from "react";
import { Routes, Route } from "react-router-dom";

// Layout & Pages
import DashboardLayout from "./components/layout/DashboardLayout";
import Overview from "./pages/Overview";
import LiveLogs from "./pages/LiveLogs";
import Sandbox from "./pages/Sandbox";
import Templates from "./pages/Templates";
import Settings from "./pages/Settings";
import DLQ from "./pages/DLQ";


// Notification components (used in Test Client)
import ConnectionStatusBanner from "./components/notifications/ConnectionStatusBanner";
import ToastContainer from "./components/notifications/ToastContainer";
import NotificationModal from "./components/notifications/NotificationModal";
import NotificationBell from "./components/notifications/NotificationBell";

// ---------------------------------------------------------------------------
// Admin Dashboard placeholder pages
// ---------------------------------------------------------------------------
const Placeholder = ({ icon, label }) => (
  <div className="flex items-center justify-center h-full min-h-[60vh]">
    <p className="text-zinc-400 font-mono text-lg">
      {icon} {label}
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Test Client (Old UI)
// ---------------------------------------------------------------------------
function TestClient() {
  return (
    <div className="min-h-screen bg-white">
      <ConnectionStatusBanner />
      <ToastContainer />
      <NotificationModal />

      {/* Header area with bell aligned right */}
      <header className="flex justify-end items-center px-8 py-4 border-b border-gray-200">
        <NotificationBell />
      </header>

      {/* Main content */}
      <main className="flex items-center justify-center min-h-[calc(100vh-73px)] px-8">
        <p className="text-gray-500 text-center max-w-md leading-relaxed">
          Demo Test Client — Send test messages from the dashboard to see them
          appear here.
        </p>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
function App() {
  return (
    <Routes>
      {/* ── Admin Dashboard (New UI) ── */}
      <Route path="/" element={<DashboardLayout />}>
        <Route index element={<Overview />} />
        <Route path="logs" element={<LiveLogs />} />

        <Route path="sandbox" element={<Sandbox />} />

        <Route path="templates" element={<Templates />} />
        <Route path="dlq" element={<DLQ />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* ── Test Client (Old UI) ── */}
      <Route path="/test-client" element={<TestClient />} />
    </Routes>
  );
}

export default App;
