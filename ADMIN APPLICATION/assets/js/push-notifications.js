/**
 * push-notifications.js — App ADMIN
 * -----------------------------------------------------------------
 * Gère l'inscription aux notifications push Firebase (FCM) et
 * l'enregistrement du token via AURA_CONFIG.WORKER_URL (le proxy
 * Cloudflare existant), en réutilisant AURA_AUTH pour le token Bearer.
 *
 * Dépend de : AURA_CONFIG et AURA_AUTH (déjà chargés via config.js)
 * À inclure dans index.html APRÈS config.js et APRÈS les <script> Firebase :
 *   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js"></script>
 *   <script src="assets/js/config.js"></script>
 *   <script src="assets/js/push-notifications.js"></script>
 */

const AURA_PUSH = {
  APP_NAME: "admin", // "client" | "vendeur" | "admin" selon l'app

  firebaseConfig: {
    apiKey: "AIzaSyD1xS9TQl-rGFIPgjX1ivdaJ40WuOYWHf4",
    authDomain: "aura-market-ci-d3d41.firebaseapp.com",
    projectId: "aura-market-ci-d3d41",
    storageBucket: "aura-market-ci-d3d41.firebasestorage.app",
    messagingSenderId: "954865931309",
    appId: "1:954865931309:web:3ea5a5c1de8f967f3a14a4", // appId propre à cette app
    measurementId: "G-JKNBGK1X18",
  },

  VAPID_KEY: "BAMf7GuOsS_PinmBil9bECQkbJcG1c-Murnc3vsy5ZITwc0y-9OYvxUUzwWu8Nqi52aw8xmlolvz65lvvH6KnJ0",

  _messaging: null,

  /**
   * À appeler juste après une connexion réussie (login ou verifyOtp),
   * une fois que AURA_AUTH.getUser() / getAccessToken() sont disponibles.
   */
  async init() {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        console.warn("[push] Notifications non supportées sur ce navigateur.");
        return;
      }

      const user = AURA_AUTH.getUser();
      const token = AURA_AUTH.getAccessToken();
      if (!user || !token) {
        console.warn("[push] Utilisateur non connecté, abandon.");
        return;
      }

      // 1. Enregistrer le service worker à la racine de l'app
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

      // 2. Initialiser Firebase une seule fois
      if (!this._messaging) {
        firebase.initializeApp(this.firebaseConfig);
        this._messaging = firebase.messaging();
      }

      // 3. Demander la permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.warn("[push] Permission refusée.");
        return;
      }

      // 4. Récupérer le token FCM
      const fcmToken = await this._messaging.getToken({
        vapidKey: this.VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!fcmToken) {
        console.warn("[push] Impossible d'obtenir un token FCM.");
        return;
      }

      // 5. Sauvegarder le token via le Worker proxy existant (PostgREST upsert)
      await this._saveToken(user.id, fcmToken, token);

      // 6. Notifications reçues app ouverte (foreground)
      this._messaging.onMessage((payload) => {
        const titre = payload.notification?.title || "Aura Market";
        const corps = payload.notification?.body || "";
        if (Notification.permission === "granted") {
          new Notification(titre, { body: corps });
        }
      });

      console.log("[push] Notifications activées.");
    } catch (err) {
      console.error("[push] Erreur init :", err);
    }
  },

  /**
   * Upsert du token FCM dans push_tokens via le proxy Worker.
   * Utilise l'en-tête PostgREST "Prefer: resolution=merge-duplicates"
   * pour gérer l'upsert sur la contrainte UNIQUE(token).
   */
  async _saveToken(userId, fcmToken, accessToken) {
    const res = await fetch(`${AURA_CONFIG.WORKER_URL}/rest/push_tokens?on_conflict=user_id,app`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        app: this.APP_NAME,
        token: fcmToken,
        user_agent: navigator.userAgent,
      }),
    });

    if (!res.ok && res.status !== 409) {
      const errText = await res.text().catch(() => "");
      console.error("[push] Échec sauvegarde token :", res.status, errText);
    } else {
      console.log("[push] Token FCM sauvegardé (ou déjà existant).");
    }
  },
};

window.AURA_PUSH = AURA_PUSH;
