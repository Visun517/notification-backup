import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

let messaging = null;
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  messaging = getMessaging(app);
}

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const requestForToken = async () => {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !messaging
  ) {
    return null;
  }

  try {
    // 1. Explicitly check / request browser notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn(
        "⚠️ Notification permission not granted. Status:",
        permission
      );
      return null;
    }

    // 2. Explicitly register the service worker with root scope to prevent race conditions
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      { scope: "/" }
    );
    await navigator.serviceWorker.ready;


    // 3. Obtain FCM token bound to the active service worker registration
    const currentToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (currentToken) {
      //console.log("✅ Firebase FCM Token Generated:", currentToken);
      return currentToken;
    } else {
      console.warn(
        "⚠️ No registration token available. Check Web Push certificates in Firebase Console."
      );
      return null;
    }
  } catch (err) {
    console.error("❌ An error occurred while retrieving token:", err);
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
