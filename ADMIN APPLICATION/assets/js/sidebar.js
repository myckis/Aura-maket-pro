"use strict";

(function () {
  const mount = document.getElementById("sidebarMount");
  if (!mount) return;

  const mode = mount.dataset.sidebarMode || "app";
  const isLinkMode = mode === "link";
  const base = isLinkMode ? "../../index.html" : "";
  const imgPath = isLinkMode ? "../img/Aura.png" : "assets/img/Aura.png";
  const avatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop";

  const mainItems = [
    { label: "Vue d'ensemble", view: "dashboard", icon: `<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>` },
    { label: "Utilisateurs", view: "utilisateurs", icon: `<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="18" cy="9" r="2.4"/><path d="M15.5 13.5a4.6 4.6 0 0 1 6 4.3"/>` },
    { label: "Vendeurs", view: "vendeurs", icon: `<path d="M4 10h16l-1-5H5z"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>` },
    { label: "Vérifications KYC", view: "kyc", badge: "7", gold: true, icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>` },
    { label: "Validation produits", view: "validation", badge: "0", badgeId: "badge-validation", icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>` },
    { label: "Produits", view: "produits", icon: `<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>` },
    { label: "Commandes", view: "commandes", icon: `<path d="M6 3h12l2 4v14H4V7z"/><path d="M6 7h12"/><path d="M9 11h6"/>` },
    { label: "Certifications & Boosts", view: "boutiques", badge: "0", badgeId: "badge-boosts", icon: `<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/>` },
    { label: "Mon compte", view: "compte", icon: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>` }
  ];

  const services = [
    { label: "Équipe IA", service: "Équipe IA", slug: "equipe-ia", module: "module-equipe-ia", gold: true, icon: `<path d="M12 2a5 5 0 0 1 5 5v1a4 4 0 0 1 2 3.5V14a7 7 0 0 1-14 0v-2.5A4 4 0 0 1 7 8V7a5 5 0 0 1 5-5z"/><path d="M9 20h6"/>` },
    { label: "Automatisation", service: "Automatisation", slug: "automatisation", module: "module-automatisation", gold: true, icon: `<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.9 4.9 2.8 2.8"/><path d="m16.3 16.3 2.8 2.8"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.9 19.1 2.8-2.8"/><path d="m16.3 7.7 2.8-2.8"/>` },
    { label: "Journal d'activité", service: "Journal d'activité", slug: "logs", icon: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>` },
    { label: "Paramètres plateforme", service: "Paramètres plateforme", slug: "parametres", icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>` },
    { label: "Support & litiges", service: "Support & litiges", slug: "support", icon: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.8 2.8 0 1 1 4.8 2c-1.3 1.1-2.3 1.7-2.3 3"/><path d="M12 17h.01"/>` }
  ];

  const svg = icon => `<svg viewBox="0 0 24 24">${icon}</svg>`;
  const itemContent = item => `${svg(item.icon)}<span>${item.label}</span>${item.badge ? `<span class="nav-badge${item.gold ? " gold" : ""}">${item.badge}</span>` : ""}`;

  const mainMarkup = mainItems.map((item, index) => {
    if (isLinkMode) return `<a class="nav-link" href="${base}?view=${item.view}">${itemContent(item)}</a>`;
    return `<button class="nav-link${index === 0 ? " active" : ""}" onclick="switchTab(this, '${item.view}')">${itemContent(item)}</button>`;
  }).join("");

  const serviceMarkup = services.map(item => {
    if (item.module) {
      const href = isLinkMode
        ? `../../assets/${item.module}/${item.module}.html`
        : `assets/${item.module}/${item.module}.html`;
      return `<a class="nav-link nav-service" href="${href}">${itemContent(item)}</a>`;
    }
    if (isLinkMode) return `<a class="nav-link nav-service" href="${base}?view=compte&service=${item.slug}">${itemContent(item)}</a>`;
    return `<button class="nav-link nav-service" onclick="navService(this, '${item.service}')">${itemContent(item)}</button>`;
  }).join("");

  mount.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <img src="${imgPath}" alt="Aura Market" class="brand-logo-img">
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">Principal</div>
        ${mainMarkup}
        <div class="nav-section">Plateforme</div>
        ${serviceMarkup}
      </nav>
      <div class="sidebar-footer">
        <div class="admin-mini">
          <div class="admin-avatar">
            <img src="${avatar}" alt="Avatar">
          </div>
          <div class="admin-info">
            <div class="admin-name">Myckis K.</div>
            <div class="admin-role">Super Admin</div>
          </div>
        </div>
      </div>
    </aside>
  `;

  window.toggleSidebar = function () {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
    if (!sidebar || !overlay) return;
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  };
})();
