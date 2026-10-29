# ⚡ Notification Engine — Enterprise Admin Dashboard

<div align="center">

![Notification Engine Banner](https://img.shields.io/badge/CONTROL%20PLANE-ENTERPRISE-0ea5e9?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite%208-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-Queue-orange?style=for-the-badge&logo=redis&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

<p align="center">
  A state-of-the-art, real-time control plane and administrative dashboard for orchestrating, debugging, and monitoring distributed high-throughput notification pipelines across WebSockets, FCM Push, Transactional Email, and SMS.
</p>

[Explore Features](#-core-modules--features) • [Architecture](#-project-architecture) • [Getting Started](#-getting-started--installation) • [API Client](#-api-integration-map)

---

</div>

## 📖 Project Overview

The **Notification Engine Admin Dashboard** provides centralized visibility and operational control over an enterprise-grade notification delivery system. Engineered with a sleek, high-contrast dark theme (`#07090E`), the dashboard equips operators with real-time stream observability, queue lifecycle management, template authoring with live variable interpolation, interactive sandbox dispatching, and rapid command-line searching.

### Key Highlights
- **Real-Time Telemetry**: Sub-second socket streaming of queue ingestion, processing attempts, and channel delivery statuses.
- **Resilient Queue Triaging**: Full Dead-Letter Queue (DLQ) inspection with granular per-job retry, bulk replay, and purge capabilities.
- **Dynamic Template Authoring**: Blueprint editor featuring Handlebars `{{variable}}` substitution with live visual previews for both In-App feeds and Mobile Push notifications.
- **Universal Command Palette**: Global `⌘ K` search overlay querying events, templates, DLQ jobs, and user records concurrently with debounced execution.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose / Highlights |
| :--- | :--- | :--- |
| **Framework** | [React 19](https://react.dev/) | Component architecture, custom hooks, and concurrent UI rendering |
| **Build Tool** | [Vite 8](https://vitejs.dev/) | Lightning-fast HMR and optimized production asset bundling |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | Custom dark aesthetic, glassmorphism, responsive grid layouts |
| **State Management** | [Redux Toolkit](https://redux-toolkit.js.org/) | Centralized authentication, token retention, and live badge metrics |
| **Realtime Transport** | [Socket.io Client](https://socket.io/) | Full-duplex WebSocket stream for live logs and instant system metrics |
| **HTTP Client** | [Axios](https://axios-http.com/) | Dedicated instance with automatic JWT Bearer token request interceptor |
| **Data Visualization** | [Recharts 3](https://recharts.org/) | Responsive SVG 7-day throughput and delivery trend charts |
| **Icons** | [Lucide React](https://lucide.dev/) | Crisp, modern micro-icons for data statuses and channel badges |
| **Package Manager** | [pnpm](https://pnpm.io/) | Fast, deterministic disk-efficient dependency resolution |

---

## 🚀 Core Modules & Features

### 1. 📊 Overview Dashboard (`/`)
Comprehensive high-level command center aggregating telemetry across MongoDB, Redis, and BullMQ:
- **Telemetry Metric Cards**: Instant count cards for Total Notifications, System Success Rate, Active WebSockets, and Registered Users.
- **7-Day Delivery Trend Chart**: Interactive Recharts area chart contrasting queued traffic vs. successful deliveries.
- **Pipeline Health Monitor**: Real-time operational indicator verifying connectivity across MongoDB, Redis Core, and BullMQ workers.
- **Queue State Badges**: Live counters for waiting, active, delayed, completed, and DLQ-staged jobs.
- **Recent Activity Feed**: The 5 most recent dispatch operations with timestamped delivery channels and status pills.

### 2. 🖥️ Live Logs Terminal (`/logs`)
A terminal-like event streaming interface listening directly to the backend socket cluster:
- **WebSocket Streaming**: Automatically receives `admin-live-logs` events across the entire cluster.
- **Color-Coded Severity Levels**:
  - `INFO`: Cyan/Blue indicator for routine queue lifecycle events.
  - `SUCCESS`: Emerald indicator for verified message drops.
  - `WARN`: Amber indicator for retried deliveries or rate limit notifications.
  - `ERROR`: Rose/Red indicator for failed dispatches and socket timeouts.
- **Auto-Scrolling Buffer**: Live terminal scrolling with manual pause toggle.
- **Stream Controls**: Real-time text search, severity filter toggles, log buffer pause, and clear logs button.

### 3. 🧪 Sandbox Dispatch Workbench (`/sandbox`)
Safe, isolated staging environment for validating dispatches without risking production broadcasts:
- **Interactive Form**: Inputs for Notification Title, Message Body, Priority selection (`CRITICAL`, `HIGH`, `NORMAL`, `LOW`), Scope (`UNICAST` / `BROADCAST`), Category, and Target Recipient ID.
- **Channel Multi-Select**: Independent checkboxes for `IN_APP` and `PUSH` channels.
- **Live JSON Payload Preview**: Real-time compiling JSON code mirror reflecting the exact payload dispatched to `POST /api/notifications`.
- **One-Click Presets**: Pre-configured alert types (Critical Alert, Broadcast Update, Account Notification).
- **Direct Dispatch Validation**: Submits payload with loading spinners and immediate response toast alerts.

### 4. 🧩 Message Templates (`/templates`)
Production-grade blueprint repository for multi-channel notification schemas:
- **CRUD Operations**: Create, Read, Update, Duplicate, and Delete reusable templates.
- **Dynamic Handlebars Variables**: Detects `{{variable}}` syntax (e.g., `{{userName}}`, `{{orderId}}`, `{{eta}}`) dynamically.
- **Live Side-by-Side Preview**:
  - **In-App Notification Card**: Renders the exact UI card displayed to end users with interpolated sample data.
  - **Mobile Push Banner**: Lockscreen/status-bar notification preview for mobile targets.
- **Quick-Insert Variable Chips**: Interactive buttons to insert variables into subject or body at cursor position.
- **Sandbox Handoff**: "Test in Sandbox" button transfers template parameters into the sandbox with one click.

### 5. 🛡️ Dead-Letter Queue (DLQ) (`/dlq`)
Resilient triage station for messages that exceeded maximum retry thresholds:
- **Queue Metrics**: Shows staged job counts, DLQ Redis storage key, and system health status.
- **Diagnostic Table**: Displays Job ID, Original Job ID, Notification ID, Tenant, Attempts count (`3/3`), Failure Diagnostics, and Timestamp.
- **Payload Inspector Modal**: Full formatted JSON viewer displaying original message attributes and recipient metadata.
- **Granular Actions**: Individual **Retry Job** button re-enqueues payloads back into active BullMQ workers and removes them from DLQ upon success.
- **Bulk Operations**: **Retry All Batch** re-enqueues up to 50 jobs simultaneously; **Purge All** cleans out terminal records.

### 6. ⚙️ Global Settings & Policies (`/settings`)
Central configuration console organizing cluster policies into vertical tabs:
- **Global Channels**: Master circuit-breaker switches for In-App WebSockets, Mobile Push (FCM), Email (SMTP), and SMS with instant killswitch capability.
- **Queue & Routing**: Numeric controls for BullMQ max retries, exponential backoff delay (ms), worker thread concurrency, and DLQ expiration.
- **Data Retention**: Dropdown schedules for automated TTL purge of audit logs and notification history.
- **Rate Limits & Security**: Controls for requests per minute (RPM) and burst headroom, with priority bypass rules for critical safety alerts.
- **Provider Credentials**: Masked credential management for Firebase Cloud Messaging (FCM) service account keys and SMTP server hosts/ports/credentials with Show/Hide toggles.

### 7. 🔍 Universal Command Palette (`⌘ K` / `Ctrl+K`)
Universal navigation and search overlay accessible from any view:
- **Keyboard Shortcut**: Trigger via `⌘ K` on macOS or `Ctrl+K` on Windows/Linux; dismiss via `Esc`.
- **Debounced Concurrent Search**: 300ms debounce querying:
  - **Navigation Shortcuts**: Quick jump to any dashboard view.
  - **Templates**: Search by template name, subject, or category.
  - **DLQ Jobs**: Search by job ID, notification ID, or error message.
  - **Notifications**: Search by notification title, status, or recipient ID.
  - **User Profiles**: Search by user identifier or subscribed tags.
- **Contextual Actions**: Selecting a result navigates immediately to the relevant resource or stages it for testing.

---

## 🏗️ Project Architecture

```
frontend/
├── public/                     # Static assets & Firebase messaging service worker
│   ├── firebase-messaging-sw.js
│   └── vite.svg
├── src/
│   ├── api/                    # Centralized Axios API client & endpoints
│   │   ├── notificationApi.js  # Dedicated Axios instance with Redux JWT interceptor
│   │   └── userApi.js          # User profile and FCM device token synchronization
│   ├── components/             # Reusable UI component library
│   │   ├── common/             # Shared primitives
│   │   │   └── CommandPalette.jsx  # Global ⌘ K search overlay modal
│   │   ├── layout/             # Application shell & navigation
│   │   │   ├── DashboardLayout.jsx # Master layout wrapping Sidebar + Header + Outlet
│   │   │   ├── Header.jsx          # Top navigation bar with status & ⌘ K trigger
│   │   │   └── Sidebar.jsx         # Navigation sidebar with real-time DLQ counter badge
│   │   └── notifications/      # Real-time notification display widgets
│   │       ├── ConnectionStatusBanner.jsx
│   │       ├── NotificationBell.jsx
│   │       ├── NotificationModal.jsx
│   │       └── ToastContainer.jsx
│   ├── context/                # React context providers
│   │   └── SocketContext.jsx   # Authenticated WebSocket client & FCM token registrar
│   ├── pages/                  # Top-level view controllers
│   │   ├── DLQ.jsx             # Dead-Letter Queue management console
│   │   ├── LiveLogs.jsx        # Terminal event stream view
│   │   ├── Overview.jsx        # High-level metrics & Recharts graphs
│   │   ├── Sandbox.jsx         # Interactive dispatch testing workbench
│   │   ├── Settings.jsx        # Global system switches & queue policies
│   │   └── Templates.jsx       # Handlebars template blueprint editor
│   ├── store/                  # Redux Toolkit store & slices
│   │   ├── authSlice.js        # Authentication credentials & bearer token
│   │   ├── notificationSlice.js# Real-time notification store & unread counters
│   │   └── index.js            # Root Redux store configuration
│   ├── App.jsx                 # Route declarations & route guards
│   ├── firebase.js             # Firebase Cloud Messaging SDK initialization
│   ├── index.css               # Global Tailwind CSS definitions & custom scrollbars
│   └── main.jsx                # Application root mounting Redux & SocketContext
├── index.html                  # HTML entry point
├── package.json                # Project dependencies & scripts
├── tailwind.config.js          # Tailwind CSS theme extensions
└── vite.config.js              # Vite bundler plugins & dev server proxy
```

---

## 📡 API Integration Map

The dashboard interacts with the backend Notification Engine via the following routes (all authenticated requests automatically include `Authorization: Bearer <token>` via Axios interceptors):

| Method | Endpoint | Description | Consuming Component |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications/overview` | Aggregated system metrics, 7-day trend, and queue counts | `Overview.jsx`, `Sidebar.jsx` |
| `GET` | `/api/notifications/logs` | Historical live log buffer | `LiveLogs.jsx` |
| `POST` | `/api/notifications` | Dispatches notifications (unicast / broadcast) | `Sandbox.jsx` |
| `GET` | `/api/notifications/templates` | Lists all notification templates for tenant | `Templates.jsx` |
| `POST` | `/api/notifications/templates` | Creates a new notification template | `Templates.jsx` |
| `PUT` | `/api/notifications/templates/:id`| Updates an existing notification template | `Templates.jsx` |
| `DELETE`| `/api/notifications/templates/:id`| Permanently deletes a template | `Templates.jsx` |
| `GET` | `/api/notifications/dlq` | Fetches paginated failed jobs from BullMQ DLQ | `DLQ.jsx` |
| `POST` | `/api/notifications/dlq/:id/retry`| Re-enqueues a specific DLQ job | `DLQ.jsx` |
| `POST` | `/api/notifications/dlq/retry-all`| Bulk retries up to 50 DLQ jobs | `DLQ.jsx` |
| `DELETE`| `/api/notifications/dlq/:id` | Deletes a job from DLQ | `DLQ.jsx` |
| `DELETE`| `/api/notifications/dlq/clear-all`| Purges all failed jobs in DLQ | `DLQ.jsx` |
| `GET` | `/api/notifications/settings` | Retrieves global channel switches & queue configs | `Settings.jsx` |
| `PUT` | `/api/notifications/settings` | Updates cluster policies & credentials | `Settings.jsx` |
| `GET` | `/api/notifications/search?q={query}`| Global multi-entity search | `CommandPalette.jsx` |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Scope | Action |
| :--- | :--- | :--- |
| <kbd>⌘</kbd> + <kbd>K</kbd> / <kbd>Ctrl</kbd> + <kbd>K</kbd> | Global | Open / Close Universal Command Palette |
| <kbd>Esc</kbd> | Modal / Overlay | Dismiss active modal or Command Palette |
| <kbd>↵ Enter</kbd> | Command Palette | Select and navigate to highlighted search item |

---

## 🚦 Getting Started & Installation

### Prerequisites
- **Node.js**: `v18.0.0` or higher (recommended: `v20.x` or `v24.x`)
- **Package Manager**: `pnpm` (recommended) or `npm` / `yarn`
- **Backend Service**: Ensure the Notification Engine backend server is running on `http://localhost:5000` with Redis and MongoDB.

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/notification-engine.git
cd notification-engine/frontend
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables
Create a `.env` or `.env.local` file in the `frontend` root:
```env
# Backend API Base URL
VITE_API_URL=http://localhost:5000/api/notifications

# Backend WebSocket URL
VITE_SOCKET_URL=http://localhost:5000

# Firebase Web Push Configuration (Optional for FCM testing)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=notification-engine-7443d
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_VAPID_KEY=your_public_vapid_key
```

### 4. Run the Development Server
```bash
pnpm run dev
```
The dashboard will start at `http://localhost:5173`.

### 5. Production Build & Validation
To compile and test the production distribution bundle:
```bash
# Build the optimized production bundle
pnpm run build

# Preview the production build locally
pnpm run preview
```

---

## 📄 License & Attribution

This project is licensed under the **MIT License** — feel free to use, modify, and distribute for personal or commercial projects.

Designed and architected by the **Notification Engine Engineering Team**.
For issues, contributions, or enterprise feature requests, please open an issue or pull request in the repository.
