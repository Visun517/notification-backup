importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts(
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js"
);

// Firebase configuration
// NOTE: These values MUST match your .env project settings and VAPID key
const firebaseConfig = {
  apiKey: "AIzaSyByO0A_IT1ZRQ6qNxhthd3DjcI1mFIkqpw",
  authDomain: "notification-engine-7443d.firebaseapp.com",
  projectId: "notification-engine-7443d",
  storageBucket: "notification-engine-7443d.firebasestorage.app",
  messagingSenderId: "139350821204",
  appId: "1:139350821204:web:a883e5df2df0ec5b7a60c1",
  measurementId: "G-ND03FVHBPQ",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message: ",
    payload
  );

  const notificationTitle = payload.notification?.title || "New Notification";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: payload.notification?.icon || "/vite.svg",
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
