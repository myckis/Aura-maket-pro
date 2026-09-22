// firebase-messaging-sw.js — App ADMIN
// À placer à la RACINE de "ADMIN APPLICATION" (même niveau que index.html)
// Ce fichier gère à la fois :
//  1. Les notifications push Firebase (FCM) en arrière-plan
//  2. L'installabilité PWA minimale (pas d'interception réseau agressive,
//     pour ne jamais risquer de casser le chargement normal du CSS/JS)

const CACHE_NAME = "aura-market-admin-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Pas d'interception "fetch" globale : on laisse le navigateur gérer le
// réseau normalement pour éviter tout risque de page cassée (CSS/JS non
// chargés). Le Service Worker sert ici uniquement à rendre l'app
// installable et à recevoir les notifications push en arrière-plan.

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD1xS9TQl-rGFIPgjX1ivdaJ40WuOYWHf4",
  authDomain: "aura-market-ci-d3d41.firebaseapp.com",
  projectId: "aura-market-ci-d3d41",
  storageBucket: "aura-market-ci-d3d41.firebasestorage.app",
  messagingSenderId: "954865931309",
  appId: "1:954865931309:web:3ea5a5c1de8f967f3a14a4",
  measurementId: "G-JKNBGK1X18",
});

const messaging = firebase.messaging();

const LOGO_ADMIN = "https://i.ibb.co/svYJjM44/file-0000000021907246ba6da0966d20d855.png";

messaging.onBackgroundMessage((payload) => {
  const titre = payload.notification?.title || payload.data?.titre || "Aura Market Admin";
  const corps = payload.notification?.body || payload.data?.corps || "";
  const lien = payload.data?.lien || payload.fcmOptions?.link || "/";

  self.registration.showNotification(titre, {
    body: corps,
    icon: LOGO_ADMIN,
    badge: LOGO_ADMIN,
    data: { lien },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const lien = event.notification.data?.lien || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(lien);
          }
          return;
        }
      }
      return clients.openWindow(lien);
    })
  );
});
