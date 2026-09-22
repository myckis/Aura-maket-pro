"use strict";

/* ════════════════════════════════════════════════════════════
   MODULE NOTIFICATIONS — cloche topbar
   Agrège : produits en attente, KYC en attente, boosts/sponsoring
   en attente, signalements non traités.
════════════════════════════════════════════════════════════ */

const NOTIF_REFRESH_MS = 60000; // rafraîchissement auto toutes les 60s
const NOTIF_READ_KEY = "aura_admin_notif_read_ids";

let _notifData = {
  produits: [],
  kyc: [],
  boosts: [],
  signalements: []
};
let _notifTimer = null;

function _notifGetReadIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || "[]"));
  } catch (e) {
    return new Set();
  }
}

function _notifSaveReadIds(idsSet) {
  try {
    localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...idsSet]));
  } catch (e) {}
}

function _notifMarkAllRead() {
  const allIds = [
    ..._notifData.produits.map(p => "p_" + p.id),
    ..._notifData.kyc.map(k => "k_" + k.id),
    ..._notifData.boosts.map(b => "b_" + b.id),
    ..._notifData.signalements.map(s => "s_" + s.id)
  ];
  const readIds = _notifGetReadIds();
  allIds.forEach(id => readIds.add(id));
  _notifSaveReadIds(readIds);
  _notifRenderBadge();
  _notifRenderDropdown();
}

function _notifIcon(type) {
  const icons = {
    produit: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>`,
    kyc: `<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>`,
    boost: `<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>`,
    signalement: `<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>`
  };
  return icons[type] || icons.produit;
}

function _notifIconClass(type) {
  if (type === "signalement") return "icon-danger";
  if (type === "boost") return "icon-warn";
  return "icon-info";
}

async function _notifFetchAll() {
  try {
    const [produits, kyc, boosts, signalements] = await Promise.all([
      API.get(AURA_CONFIG.endpoints.produits_validation + "?statut=eq.en_attente&select=id,nom,nom_boutique,created_at&order=created_at.desc&limit=20").catch(() => []),
      API.get(AURA_CONFIG.endpoints.kyc_admin + "?statut=eq.en_attente&select=id,nom_responsable,nom_boutique,submitted_at&order=submitted_at.desc&limit=20").catch(() => []),
      API.get(AURA_CONFIG.endpoints.boosts_admin + "?statut=eq.en_attente&select=id,type,nom_boutique,nom_produit,created_at&order=created_at.desc&limit=20").catch(() => []),
      API.get(AURA_CONFIG.endpoints.signalements_admin + "?statut=neq.traite&select=id,produit_nom,nom_boutique,gravite,signalements_count,created_at&order=created_at.desc&limit=20").catch(() => [])
    ]);
    _notifData.produits = produits || [];
    _notifData.kyc = kyc || [];
    _notifData.boosts = boosts || [];
    _notifData.signalements = signalements || [];
    _notifPruneReadIds();
  } catch (err) {
    console.error("Erreur chargement notifications :", err.message);
  }
  _notifRenderBadge();
  _notifRenderDropdown();
}

function _notifPruneReadIds() {
  const currentIds = new Set([
    ..._notifData.produits.map(p => "p_" + p.id),
    ..._notifData.kyc.map(k => "k_" + k.id),
    ..._notifData.boosts.map(b => "b_" + b.id),
    ..._notifData.signalements.map(s => "s_" + s.id)
  ]);
  const readIds = _notifGetReadIds();
  const pruned = new Set([...readIds].filter(id => currentIds.has(id)));
  if (pruned.size !== readIds.size) _notifSaveReadIds(pruned);
}

function _notifUnreadItems() {
  const readIds = _notifGetReadIds();
  return {
    produits: _notifData.produits.filter(p => !readIds.has("p_" + p.id)),
    kyc: _notifData.kyc.filter(k => !readIds.has("k_" + k.id)),
    boosts: _notifData.boosts.filter(b => !readIds.has("b_" + b.id)),
    signalements: _notifData.signalements.filter(s => !readIds.has("s_" + s.id))
  };
}

function _notifTotalCount() {
  const unread = _notifUnreadItems();
  return unread.produits.length + unread.kyc.length + unread.boosts.length + unread.signalements.length;
}

function _notifRenderBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const total = _notifTotalCount();
  badge.textContent = total > 99 ? "99+" : total;
  badge.classList.toggle("show", total > 0);
}

function _notifTimeAgo(dateStr) {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return `il y a ${j} j`;
}

function _notifRenderDropdown() {
  const body = document.getElementById("notifBody");
  const headerCount = document.getElementById("notifHeaderCount");
  if (!body) return;

  const unread = _notifUnreadItems();
  const total = _notifTotalCount();
  if (headerCount) headerCount.textContent = total > 0 ? `${total} à traiter` : "à jour";

  const readAllBtn = document.getElementById("notifMarkAllBtn");
  if (readAllBtn) readAllBtn.style.display = total > 0 ? "" : "none";

  if (total === 0) {
    body.innerHTML = `
      <div class="notif-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        <div>Aucune notification. Tout est à jour.</div>
      </div>`;
    return;
  }

  let html = "";

  if (unread.kyc.length) {
    html += `<div class="notif-section-label">Vérifications KYC</div>`;
    html += unread.kyc.slice(0, 5).map(k => `
      <div class="notif-item" onclick="_notifGoTo('kyc','k','${k.id}')">
        <div class="notif-icon icon-info">${`<svg viewBox="0 0 24 24">${_notifIcon("kyc")}</svg>`}</div>
        <div class="notif-content">
          <div class="notif-title">${_notifEsc(k.nom_responsable || "Nouveau vendeur")}</div>
          <div class="notif-sub">${_notifEsc(k.nom_boutique || "—")} · ${_notifTimeAgo(k.submitted_at)}</div>
        </div>
      </div>`).join("");
    if (unread.kyc.length > 5) html += `<div class="notif-item" onclick="_notifGoTo('kyc')" style="justify-content:center;"><span class="notif-sub">+ ${unread.kyc.length - 5} autres</span></div>`;
  }

  if (unread.produits.length) {
    html += `<div class="notif-section-label">Produits en attente</div>`;
    html += unread.produits.slice(0, 5).map(p => `
      <div class="notif-item" onclick="_notifGoTo('validation','p','${p.id}')">
        <div class="notif-icon icon-info">${`<svg viewBox="0 0 24 24">${_notifIcon("produit")}</svg>`}</div>
        <div class="notif-content">
          <div class="notif-title">${_notifEsc(p.nom || "Nouveau produit")}</div>
          <div class="notif-sub">${_notifEsc(p.nom_boutique || "—")} · ${_notifTimeAgo(p.created_at)}</div>
        </div>
      </div>`).join("");
    if (unread.produits.length > 5) html += `<div class="notif-item" onclick="_notifGoTo('validation')" style="justify-content:center;"><span class="notif-sub">+ ${unread.produits.length - 5} autres</span></div>`;
  }

  if (unread.boosts.length) {
    html += `<div class="notif-section-label">Boosts &amp; sponsoring</div>`;
    html += unread.boosts.slice(0, 5).map(b => `
      <div class="notif-item" onclick="_notifGoTo('boutiques','b','${b.id}')">
        <div class="notif-icon icon-warn">${`<svg viewBox="0 0 24 24">${_notifIcon("boost")}</svg>`}</div>
        <div class="notif-content">
          <div class="notif-title">${b.type === "boutique" ? "Certification boutique" : "Boost produit"}</div>
          <div class="notif-sub">${_notifEsc(b.nom_boutique || b.nom_produit || "—")} · ${_notifTimeAgo(b.created_at)}</div>
        </div>
      </div>`).join("");
    if (unread.boosts.length > 5) html += `<div class="notif-item" onclick="_notifGoTo('boutiques')" style="justify-content:center;"><span class="notif-sub">+ ${unread.boosts.length - 5} autres</span></div>`;
  }

  if (unread.signalements.length) {
    html += `<div class="notif-section-label">Signalements</div>`;
    html += unread.signalements.slice(0, 5).map(s => `
      <div class="notif-item" onclick="_notifGoTo('signalements','s','${s.id}')">
        <div class="notif-icon icon-danger">${`<svg viewBox="0 0 24 24">${_notifIcon("signalement")}</svg>`}</div>
        <div class="notif-content">
          <div class="notif-title">${_notifEsc(s.produit_nom || "Produit signalé")}</div>
          <div class="notif-sub">${_notifEsc(s.nom_boutique || "—")} · ${s.signalements_count || 1} signalement(s)</div>
        </div>
        <div class="notif-count-pill">${s.gravite === "haute" ? "!" : s.signalements_count || 1}</div>
      </div>`).join("");
    if (unread.signalements.length > 5) html += `<div class="notif-item" onclick="_notifGoTo('signalements')" style="justify-content:center;"><span class="notif-sub">+ ${unread.signalements.length - 5} autres</span></div>`;
  }

  body.innerHTML = html;
}

function _notifEsc(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function _notifMarkOneRead(prefix, id) {
  const readIds = _notifGetReadIds();
  readIds.add(prefix + "_" + id);
  _notifSaveReadIds(readIds);
}

function _notifGoTo(view, prefix, id) {
  if (prefix && id) _notifMarkOneRead(prefix, id);
  document.getElementById("notifDropdown")?.classList.remove("open");
  document.getElementById("notifBtn")?.classList.remove("active");
  _notifRenderBadge();
  const navLink = document.querySelector(`.nav-link[onclick*="switchTab(this, '${view}')"]`);
  if (navLink && typeof switchTab === "function") {
    switchTab(navLink, view);
  }
}

function toggleNotifDropdown() {
  const dropdown = document.getElementById("notifDropdown");
  const btn = document.getElementById("notifBtn");
  if (!dropdown) return;
  const willOpen = !dropdown.classList.contains("open");
  dropdown.classList.toggle("open", willOpen);
  btn.classList.toggle("active", willOpen);
  if (willOpen) {
    _notifFetchAll();
    setTimeout(() => document.addEventListener("click", _notifCloseOnClickOutside), 0);
  }
}

function _notifCloseOnClickOutside(e) {
  const wrap = document.querySelector(".notif-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("notifDropdown")?.classList.remove("open");
    document.getElementById("notifBtn")?.classList.remove("active");
    document.removeEventListener("click", _notifCloseOnClickOutside);
  }
}

function _notifInit() {
  const mount = document.getElementById("topbarActionsMount");
  if (!mount) return;

  const kycBtn = `
    <button class="topbar-btn" onclick="event.stopPropagation(); switchTab(document.querySelector('.nav-link[onclick*=kyc]'), 'kyc')" aria-label="Vérifications KYC en attente">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 12l2 2 4-4"/>
        <rect x="3" y="4" width="18" height="16" rx="2"/>
      </svg>
    </button>`;

  const notifBell = `
    <div class="notif-wrap">
      <button class="notif-btn" id="notifBtn" onclick="event.stopPropagation(); toggleNotifDropdown()" aria-label="Notifications">
        <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        <span class="notif-badge" id="notifBadge">0</span>
      </button>
      <div class="notif-dropdown" id="notifDropdown">
        <div class="notif-header">
          <span class="notif-header-title">Notifications</span>
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="notif-footer-btn" id="notifMarkAllBtn" onclick="event.stopPropagation(); _notifMarkAllRead()" style="display:none;">Tout marquer lu</button>
            <span class="notif-header-count" id="notifHeaderCount">à jour</span>
          </div>
        </div>
        <div class="notif-body" id="notifBody">
          <div class="notif-empty">Chargement…</div>
        </div>
        <div class="notif-footer">
          <button class="notif-footer-btn" onclick="event.stopPropagation(); _notifFetchAll()">Actualiser</button>
        </div>
      </div>
    </div>`;

  mount.innerHTML = kycBtn + notifBell;

  _notifFetchAll();
  if (_notifTimer) clearInterval(_notifTimer);
  _notifTimer = setInterval(_notifFetchAll, NOTIF_REFRESH_MS);
}

_notifInit();
