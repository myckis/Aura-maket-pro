/**
 * pwa-banners.js — App CLIENT
 * -----------------------------------------------------------------
 * Gère 2 bannières custom, professionnelles, cohérentes avec le
 * design system Aura Market :
 *   1. Bannière d'installation de l'app (PWA "beforeinstallprompt")
 *   2. Bannière d'autorisation des notifications (avant le prompt natif)
 *
 * Comportement :
 *  - Jamais les deux en même temps (installation proposée en premier)
 *  - Un refus est mémorisé 14 jours avant de reproposer
 *  - Une acceptation ne redemande plus jamais
 *  - Apparition différée de quelques secondes pour ne pas être intrusif
 */

const AURA_PWA_BANNERS = {
  LOGO: "assets/img/icons/icon-96x96.png",
  DELAY_MS: 2500,
  SNOOZE_DAYS: 14,

  _deferredInstallPrompt: null,
  _installBannerEl: null,
  _notifBannerEl: null,

  init() {
    // Le Service Worker doit être enregistré dès le chargement (connecté ou non)
    // pour que la PWA soit installable, indépendamment des notifications push.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/firebase-messaging-sw.js").catch(() => {});
    }

    // Capture l'événement natif d'installation (Chrome/Android/Edge)
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this._deferredInstallPrompt = e;
      this._maybeShowInstallBanner();
    });

    window.addEventListener("appinstalled", () => {
      this._deferredInstallPrompt = null;
      this._hideBanner(this._installBannerEl);
      localStorage.setItem("aura_pwa_installed", "1");
    });

    // Si déjà installée (mode standalone), on ne propose jamais l'installation
    if (this._isRunningStandalone()) {
      localStorage.setItem("aura_pwa_installed", "1");
    }

    // Après un délai, si l'installation n'est pas proposable/déjà faite,
    // on tente directement la bannière de notifications.
    setTimeout(() => {
      if (!this._deferredInstallPrompt) {
        this._maybeShowNotifBanner();
      }
    }, this.DELAY_MS + 500);
  },

  _isRunningStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  },

  _isSnoozed(key) {
    const until = localStorage.getItem(key);
    if (!until) return false;
    return Date.now() < Number(until);
  },

  _snooze(key) {
    const until = Date.now() + this.SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(key, String(until));
  },

  /* ─── Bannière 1 : Installation ─────────────────────────── */

  _maybeShowInstallBanner() {
    if (localStorage.getItem("aura_pwa_installed") === "1") return;
    if (this._isSnoozed("aura_pwa_install_snooze")) return;
    if (this._isRunningStandalone()) return;

    setTimeout(() => this._renderInstallBanner(), this.DELAY_MS);
  },

  _renderInstallBanner() {
    const el = document.createElement("div");
    el.className = "aura-banner";
    el.innerHTML = `
      <div class="aura-banner__icon"><img src="${this.LOGO}" alt="Aura Market Admin"></div>
      <div class="aura-banner__body">
        <p class="aura-banner__title">Installer Aura Market Admin</p>
        <p class="aura-banner__subtitle">Supervisez la plateforme plus vite, plein écran, sans navigateur.</p>
      </div>
      <div class="aura-banner__actions">
        <button class="aura-banner__btn aura-banner__btn--primary" data-action="install">Installer</button>
      </div>
      <button class="aura-banner__close" data-action="dismiss-install" aria-label="Fermer">&times;</button>
    `;
    document.body.appendChild(el);
    this._installBannerEl = el;

    requestAnimationFrame(() => el.classList.add("aura-banner--visible"));

    el.querySelector('[data-action="install"]').addEventListener("click", async () => {
      this._hideBanner(el);
      if (!this._deferredInstallPrompt) return;
      this._deferredInstallPrompt.prompt();
      const { outcome } = await this._deferredInstallPrompt.userChoice;
      this._deferredInstallPrompt = null;
      if (outcome === "accepted") {
        localStorage.setItem("aura_pwa_installed", "1");
      } else {
        this._snooze("aura_pwa_install_snooze");
      }
      // Enchaîne sur la bannière de notifications après un court délai
      setTimeout(() => this._maybeShowNotifBanner(), 1200);
    });

    el.querySelector('[data-action="dismiss-install"]').addEventListener("click", () => {
      this._snooze("aura_pwa_install_snooze");
      this._hideBanner(el);
      setTimeout(() => this._maybeShowNotifBanner(), 600);
    });
  },

  /* ─── Bannière 2 : Notifications ────────────────────────── */

  _maybeShowNotifBanner() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return; // déjà accordée ou refusée définitivement
    if (this._isSnoozed("aura_pwa_notif_snooze")) return;
    if (this._installBannerEl && this._installBannerEl.classList.contains("aura-banner--visible")) return;

    this._renderNotifBanner();
  },

  _renderNotifBanner() {
    const el = document.createElement("div");
    el.className = "aura-banner";
    el.innerHTML = `
      <div class="aura-banner__icon"><img src="${this.LOGO}" alt="Aura Market Admin"></div>
      <div class="aura-banner__body">
        <p class="aura-banner__title">Activer les notifications</p>
        <p class="aura-banner__subtitle">Validations, signalements et demandes en temps réel.</p>
      </div>
      <div class="aura-banner__actions">
        <button class="aura-banner__btn aura-banner__btn--primary" data-action="enable-notif">Activer</button>
      </div>
      <button class="aura-banner__close" data-action="dismiss-notif" aria-label="Fermer">&times;</button>
    `;
    document.body.appendChild(el);
    this._notifBannerEl = el;

    requestAnimationFrame(() => el.classList.add("aura-banner--visible"));

    el.querySelector('[data-action="enable-notif"]').addEventListener("click", async () => {
      this._hideBanner(el);
      if (window.AURA_PUSH) {
        await window.AURA_PUSH.init();
      } else {
        await Notification.requestPermission();
      }
    });

    el.querySelector('[data-action="dismiss-notif"]').addEventListener("click", () => {
      this._snooze("aura_pwa_notif_snooze");
      this._hideBanner(el);
    });
  },

  _hideBanner(el) {
    if (!el) return;
    el.classList.remove("aura-banner--visible");
    setTimeout(() => el.remove(), 400);
  },
};

document.addEventListener("DOMContentLoaded", () => AURA_PWA_BANNERS.init());
window.AURA_PWA_BANNERS = AURA_PWA_BANNERS;
