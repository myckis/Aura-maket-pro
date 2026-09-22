"use strict";

(function () {
  const mount = document.getElementById("topbarActionsMount");
  if (!mount) return;

  mount.innerHTML = `
    <button class="topbar-btn" onclick="event.stopPropagation(); switchTab(document.querySelector('.nav-link[onclick*=kyc]'), 'kyc')" aria-label="Vérifications KYC en attente">
      <svg viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4"/>
        <rect x="3" y="4" width="18" height="16" rx="2"/>
      </svg>
    </button>
    <button class="topbar-btn topbar-cart" onclick="event.stopPropagation(); showToast('Notifications — bientôt disponible', 'info')" aria-label="Notifications">
      <svg viewBox="0 0 24 24">
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
      </svg>
    </button>
  `;
})();
