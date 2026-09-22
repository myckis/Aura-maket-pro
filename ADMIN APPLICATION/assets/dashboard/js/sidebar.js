"use strict";

(function () {
  const mount = document.getElementById("sidebarMount");
  if (!mount) return;

  const mode = mount.dataset.sidebarMode || "app";
  const isLinkMode = mode === "link";
  const base = isLinkMode ? "../../index.html" : "";
  const imgPath = isLinkMode ? "../img/Aura.png" : "assets/img/Aura.png";
  const sessionUser = (typeof AURA_AUTH !== "undefined" && AURA_AUTH.getUser()) || null;
  const adminNom    = sessionUser?.user_metadata?.nom || "Administrateur";
  const adminInit   = adminNom.trim().charAt(0).toUpperCase() || "?";

  // ─── Rôle & permissions de l'admin connecté ───
  const storedRole  = (typeof AURA_AUTH !== "undefined" && AURA_AUTH.getRole && AURA_AUTH.getRole()) || "admin";
  const isSuper     = storedRole === "super_admin";
  const storedPerms = (typeof AURA_AUTH !== "undefined" && AURA_AUTH.getPermissions && AURA_AUTH.getPermissions()) || {};
  const allowedIcones = Array.isArray(storedPerms.icones) ? storedPerms.icones : [];
  const canSee = key => isSuper || key === "compte" || allowedIcones.includes(key);

  // Chaque item porte une clé stable "perm" utilisée pour le contrôle d'accès,
  // indépendante du libellé affiché (voir ADMIN_ICONES dans admin.js pour la liste canonique).
  const mainItems = [
    { perm: "dashboard",    label: "Vue d'ensemble", view: "dashboard", icon: `<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>` },
    { perm: "utilisateurs", label: "Utilisateurs", view: "utilisateurs", icon: `<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="18" cy="9" r="2.4"/><path d="M15.5 13.5a4.6 4.6 0 0 1 6 4.3"/>` },
    { perm: "vendeurs",     label: "Vendeurs", view: "vendeurs", icon: `<path d="M4 10h16l-1-5H5z"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>` },
    { perm: "kyc",          label: "Vérifications KYC", view: "kyc", badge: "0", badgeId: "badge-kyc", icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>` },
    { perm: "validation",   label: "Validation produits", view: "validation", badge: "0", badgeId: "badge-validation", icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>` },
    { perm: "produits",     label: "Produits", view: "produits", icon: `<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>` },
    { perm: "signalements", label: "Signalements", view: "signalements", badge: "0", badgeId: "badge-signalements", icon: `<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>` },
    { perm: "commandes",    label: "Commandes", view: "commandes", icon: `<path d="M6 3h12l2 4v14H4V7z"/><path d="M6 7h12"/><path d="M9 11h6"/>` },
    { perm: "boutiques",    label: "Certifications & Boosts", view: "boutiques", badge: "0", badgeId: "badge-boosts", icon: `<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/>` },
    { perm: "bannieres",    label: "Bannière publicitaire", view: "bannieres", link: "assets/module-bannieres/module-bannieres.html", icon: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".01"/>` },
    { perm: "diffusion",    label: "Diffusion", view: "diffusion", link: "assets/module-diffusion/module-diffusion.html", icon: `<path d="M4 11v2a1 1 0 0 0 1 1h2l4 4V6L7 10H5a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M19 5a9 9 0 0 1 0 14"/>` },
    { perm: "crm",          label: "CRM & Prospection", view: "crm", link: "assets/module-crm/module-crm.html", icon: `<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="m17 8 2 2 4-4"/>` },
    { perm: "marketing",    label: "Marketing & Publicité", view: "marketing", link: "assets/module-marketing/module-marketing.html", icon: `<path d="m3 11 18-5-5 18-4-8-9-5z"/>` },
    { perm: "contenus",     label: "Contenus", view: "contenus", link: "assets/module-contenus/module-contenus.html", icon: `<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="19" cy="17" r="3"/>` },
    { perm: "automatisation", label: "Automatisation", view: "automatisation", link: "assets/module-automatisation/module-automatisation.html", icon: `<path d="M12 8V4H8"/><rect x="4" y="12" width="16" height="8" rx="2"/><path d="M2 16h2M20 16h2M9 16v2M15 16v2"/><circle cx="12" cy="8" r="4"/>` },
    { perm: "pronostics",   label: "Pronostics",   view: "pronostics",   link: "assets/module-pronostics/module-pronostics.html", icon: `<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18M3 12h18M6.5 6.5c2.5 2 2.5 9 0 11M17.5 6.5c-2.5 2-2.5 9 0 11"/>` },
    { perm: "gestion_admins", label: "Gestion des administrateurs", view: "gestion-admins", icon: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M19 3l1.5 1.5L23 2"/>` },
    { perm: "compte",       label: "Mon compte", view: "compte", link: "assets/mon-compte/moncompte.html", icon: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>` }
  ].filter(item => canSee(item.perm));

  const services = [
    { perm: "logs",        label: "Journal d'activité", view: "logs", icon: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>` },
    { perm: "parametres",  label: "Paramètres plateforme", link: "assets/module-personnalisation/module-personnalisation.html", icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>` },
    { perm: "assistant_ia", label: "Assistant IA", view: "assistant-ia", link: "assets/module-agent-ia/module-agent-ia.html", icon: `<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/>` }
  ].filter(item => canSee(item.perm));

  const svg = icon => `<svg viewBox="0 0 24 24">${icon}</svg>`;
  const itemContent = item => `${svg(item.icon)}<span>${item.label}</span>${item.badge !== undefined ? `<span class="nav-badge${item.gold ? " gold" : ""}"${item.badgeId ? ` id="${item.badgeId}"` : ""}>${item.badge}</span>` : ""}`;

  const mainMarkup = mainItems.map((item, index) => {
    if (item.link) return `<a class="nav-link" href="${item.link}">${itemContent(item)}</a>`;
    if (item.service) return `<button class="nav-link" onclick="navService(this, '${item.service}')">${itemContent(item)}</button>`;
    if (isLinkMode) return `<a class="nav-link" href="${base}?view=${item.view}">${itemContent(item)}</a>`;
    return `<button class="nav-link${index === 0 ? " active" : ""}" onclick="switchTab(this, '${item.view}')">${itemContent(item)}</button>`;
  }).join("");

  const serviceMarkup = services.map(item => {
    if (item.link) return `<a class="nav-link nav-service" href="${item.link}">${itemContent(item)}</a>`;
    if (item.view) {
      if (isLinkMode) return `<a class="nav-link nav-service" href="${base}?view=${item.view}">${itemContent(item)}</a>`;
      return `<button class="nav-link nav-service" onclick="switchTab(this, '${item.view}')">${itemContent(item)}</button>`;
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
          <div class="admin-avatar admin-avatar-initial">${adminInit}</div>
          <div class="admin-info">
            <div class="admin-name">${adminNom}</div>
            <div class="admin-role">${isSuper ? "Super Admin" : "Administrateur"}</div>
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
