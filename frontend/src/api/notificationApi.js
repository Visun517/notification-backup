import axios from "axios";
import store from "../store";

const API_URL = "http://localhost:5000/api/notifications";

// Dedicated Axios instance for notification endpoints
const notificationApi = axios.create({
  baseURL: API_URL,
});

// Request interceptor to inject JWT authorization header from Redux store
notificationApi.interceptors.request.use(
  (config) => {
    const state = store.getState();
    const token = state?.auth?.token;

    if (token) {
      config.headers.Authorization = token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const fetchNotificationsApi = async (page, limit, userId) => {
  const response = await notificationApi.get(`?page=${page}&limit=${limit}`, {
    headers: { "user-id": userId },
  });
  return response.data;
};

export const fetchUnreadCountApi = async (userId) => {
  const response = await notificationApi.get("/unread-count", {
    headers: { "user-id": userId },
  });
  return response.data;
};

export const markAsReadApi = async (notificationId, userId) => {
  const response = await notificationApi.patch(
    `/${notificationId}/read`,
    {},
    {
      headers: { "user-id": userId },
    },
  );
  return response.data;
};

export const markAllAsReadApi = async (userId) => {
  const response = await notificationApi.patch(
    "/mark-all-read",
    {},
    { headers: { "user-id": userId } },
  );
  return response.data;
};

export const clearAllNotifications = async (userId) => {
  const response = await notificationApi.delete("/clear-all-notifications", {
    headers: { "user-id": userId },
  });
  return response.data;
};

export const fetchOverviewApi = async () => {
  const response = await notificationApi.get("/overview");
  return response.data;
};

export const fetchLogsApi = async () => {
  const response = await notificationApi.get("/logs");
  return response.data;
};

export const sendTestNotificationApi = async (notificationPayload) => {
  const response = await notificationApi.post("", notificationPayload);
  return response.data;
};

// ==========================================
// Templates CRUD API
// ==========================================
export const fetchTemplatesApi = async (params = {}) => {
  const response = await notificationApi.get("/templates", { params });
  return response.data;
};

export const createTemplateApi = async (templateData) => {
  const response = await notificationApi.post("/templates", templateData);
  return response.data;
};

export const updateTemplateApi = async (id, templateData) => {
  const response = await notificationApi.put(`/templates/${id}`, templateData);
  return response.data;
};

export const deleteTemplateApi = async (id) => {
  const response = await notificationApi.delete(`/templates/${id}`);
  return response.data;
};

// ==========================================
// System Settings API
// ==========================================
export const fetchSettingsApi = async () => {
  const response = await notificationApi.get("/settings");
  return response.data;
};

export const updateSettingsApi = async (settingsPayload) => {
  const response = await notificationApi.put("/settings", settingsPayload);
  return response.data;
};

// ==========================================
// Dead-Letter Queue (DLQ) API
// ==========================================
export const fetchDLQJobsApi = async (params = {}) => {
  const response = await notificationApi.get("/dlq", { params });
  return response.data;
};

export const retryDLQJobApi = async (jobId) => {
  const response = await notificationApi.post(`/dlq/${jobId}/retry`);
  return response.data;
};

export const retryAllDLQJobsApi = async () => {
  const response = await notificationApi.post("/dlq/retry-all");
  return response.data;
};

export const deleteDLQJobApi = async (jobId) => {
  const response = await notificationApi.delete(`/dlq/${jobId}`);
  return response.data;
};

export const clearAllDLQJobsApi = async () => {
  const response = await notificationApi.delete("/dlq/clear-all");
  return response.data;
};

// ==========================================
// Global Command Palette Search API
// ==========================================
export const fetchGlobalSearchApi = async (query) => {
  const response = await notificationApi.get("/search", {
    params: { q: query },
  });
  return response.data;
};

export default notificationApi;



