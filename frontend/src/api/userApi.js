import axios from "axios";
import store from "../store";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api/notifications";

const userApiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Attach Authorization token from Redux store if available
userApiClient.interceptors.request.use(
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
  (error) => Promise.reject(error)
);

/**
 * Registers an FCM device token for the specified user profile.
 * Maps to backend: PATCH /api/notifications/profile/:userId/token
 * Body schema: { fcmToken: string, tenantId?: string }
 */
export const updateFCMTokenApi = async (userId, fcmToken) => {
  const response = await userApiClient.patch(
    `/profile/${userId}/token`,
    { fcmToken: fcmToken?.trim() },
    {
      headers: {
        "user-id": userId,
      },
    }
  );
  return response.data;
};

/**
 * Removes an FCM device token upon logout or rotation.
 * Maps to backend: DELETE /api/notifications/profile/:userId/token
 */
export const removeFCMTokenApi = async (userId, fcmToken) => {
  const response = await userApiClient.delete(`/profile/${userId}/token`, {
    data: { fcmToken: fcmToken?.trim() },
    headers: {
      "user-id": userId,
    },
  });
  return response.data;
};

export default userApiClient;
