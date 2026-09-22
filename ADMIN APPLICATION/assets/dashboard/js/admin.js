/**
 * AURA MARKET — Logique principale (application admin)
 * Fichier : assets/js/admin.js
 * Dépend de : ./config.js
 * Architecture reprise de vendor.js, adaptée administration plateforme
 */

"use strict";

// ─── Navigation ───────────────────────────────────────────────────────────────
const VIEWS = {
  dashboard:    { title: "Vue d'ensemble",       crumb: "Plateforme / Statistiques" },
  utilisateurs: { title: "Utilisateurs",         crumb: "Gestion / Clients & Vendeurs" },
  vendeurs:     { title: "Vendeurs",             crumb: "Gestion / Boutiques actives" },
  kyc:          { title: "Vérifications KYC",    crumb: "Conformité / En attente" },
  validation:   { title: "Validation produits",  crumb: "Modération / En attente de validation" },
  produits:     { title: "Produits",             crumb: "Modération / Catalogue global" },
  signalements: { title: "Signalements",         crumb: "Modération / Produits signalés" },
  commandes:    { title: "Commandes",            crumb: "Plateforme / Toutes les ventes" },
  boutiques:    { title: "Boutiques",            crumb: "Gestion / Annuaire vendeurs" },
  compte:       { title: "Mon compte",           crumb: "Paramètres / Profil" },
  "gestion-admins": { title: "Gestion des administrateurs", crumb: "Plateforme / Équipe admin" },
  logs:         { title: "Journal d'activité",     crumb: "Plateforme / Traçabilité des actions" },
};

// Liste canonique des icônes/permissions disponibles (doit rester alignée avec sidebar.js)
const ADMIN_ICONES = [
  { key: "dashboard",       label: "Vue d'ensemble",             icon: `<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>` },
  { key: "utilisateurs",    label: "Utilisateurs",                icon: `<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="18" cy="9" r="2.4"/><path d="M15.5 13.5a4.6 4.6 0 0 1 6 4.3"/>` },
  { key: "vendeurs",        label: "Vendeurs",                    icon: `<path d="M4 10h16l-1-5H5z"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>` },
  { key: "kyc",             label: "Vérifications KYC",           icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>` },
  { key: "validation",      label: "Validation produits",         icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>` },
  { key: "produits",        label: "Produits",                    icon: `<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>` },
  { key: "signalements",    label: "Signalements",                icon: `<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>` },
  { key: "commandes",       label: "Commandes",                   icon: `<path d="M6 3h12l2 4v14H4V7z"/><path d="M6 7h12"/><path d="M9 11h6"/>` },
  { key: "boutiques",       label: "Certifications & Boosts",     icon: `<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/>` },
  { key: "bannieres",       label: "Bannière publicitaire",       icon: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".01"/>` },
  { key: "diffusion",       label: "Diffusion",                   icon: `<path d="M4 11v2a1 1 0 0 0 1 1h2l4 4V6L7 10H5a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M19 5a9 9 0 0 1 0 14"/>` },
  { key: "crm",             label: "CRM & Prospection",           icon: `<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="m17 8 2 2 4-4"/>` },
  { key: "marketing",       label: "Marketing & Publicité",       icon: `<path d="m3 11 18-5-5 18-4-8-9-5z"/>` },
  { key: "contenus",        label: "Contenus",                    icon: `<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="19" cy="17" r="3"/>` },
  { key: "automatisation",  label: "Automatisation",              icon: `<path d="M12 8V4H8"/><rect x="4" y="12" width="16" height="8" rx="2"/><path d="M2 16h2M20 16h2M9 16v2M15 16v2"/><circle cx="12" cy="8" r="4"/>` },
  { key: "pronostics",      label: "Pronostics",                  icon: `<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18M3 12h18M6.5 6.5c2.5 2 2.5 9 0 11M17.5 6.5c-2.5 2-2.5 9 0 11"/>` },
  { key: "gestion_admins",  label: "Gestion des administrateurs", icon: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M19 3l1.5 1.5L23 2"/>` },
  { key: "logs",            label: "Journal d'activité",          icon: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>` },
  { key: "parametres",      label: "Paramètres plateforme",       icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>` },
{ key: "assistant_ia",    label: "Assistant IA",                icon: `<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/>` }
  // "compte" (Mon compte) volontairement exclu : toujours visible pour tous les admins
];

function navService(el, service) {
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  el.classList.add("active");
  showToast(service + " — bientôt disponible", "info");
}

// ─── Journal d'activité : envoi best-effort, ne bloque jamais l'action métier ───
function logActivite(action, cible, cibleId, details) {
  API.post("/rest/rpc/journaliser_action", {
    p_action: action, p_cible: cible, p_cible_id: cibleId != null ? String(cibleId) : null, p_details: details || null
  }).catch(() => {});
}

function switchTab(el, view) {
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  el.classList.add("active");

  document.querySelectorAll("[id^='view-']").forEach(v => (v.style.display = "none"));
  const target = document.getElementById("view-" + view);
  if (target) target.style.display = "block";

  const info = VIEWS[view] || VIEWS.dashboard;
  document.getElementById("pageTitle").textContent      = info.title;
  document.getElementById("breadcrumbText").textContent = info.crumb;

if (view === "dashboard") { loadDashboardData(); }
if (view === "validation") { renderValidationFilterDropdown(); loadValidation("toutes"); refreshValidationCounts(); }
if (view === "kyc") { renderKycFilterDropdown(); loadKyc("toutes"); }
if (view === "logs") { renderLogsFilterDropdown(); }
  if (view === "produits") loadProduitsCatalogue();
  if (view === "signalements") { renderSignalementsFilterDropdown(); loadSignalements("toutes"); }
  if (view === "utilisateurs") loadClients();
  if (view === "vendeurs") loadVendeurs();
  if (view === "commandes") loadCommandesAdmin();
  if (view === "boutiques") loadBoostsAdmin();
  if (view === "gestion-admins") { renderGaIconesGrid(); loadAdmins(); }
  if (view === "logs") { loadLogs(true); }

  if (window.innerWidth <= 768 && document.getElementById("sidebar")?.classList.contains("open")) toggleSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  if (!sidebar || !overlay) return;
  sidebar.classList.toggle("open");
  overlay.classList.toggle("show");
}

// ─── Tabs internes (filtres utilisateurs / kyc / produits) ───────────────────
document.addEventListener("click", e => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  const group = tab.closest(".tabs");
  if (!group) return;
  group.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
});

// ─── Chargement des données (vue d'ensemble) ─────────────────────────────────
async function loadDashboardData() {
  try {
    console.info("[Aura Market] Vue d'ensemble admin — connexion Worker prête.");
  } catch (err) {
    showToast("Impossible de charger les données : " + err.message, "error");
  }
}

// ─── CLIENTS : chargement et rendu ───────────────────────────────────────────
let _allClients = [];

function _initialesAvatar(nom) {
  if (!nom) return "?";
  const parts = nom.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

function _renderClientRow(c) {
  const initiales = _initialesAvatar(c.nom);
  const tel = (c.telephone || "").replace(/\s/g, "");
  const email = c.email || "";
  const nomEsc = escHtml(c.nom || "—");
  const telEsc = escHtml(c.telephone || "—");

  const avatar = c.avatar_url
    ? `<div class="cl-avatar"><img src="${escHtml(c.avatar_url)}" alt=""></div>`
    : `<div class="cl-avatar">${initiales}</div>`;

  const whatsappHref = tel ? `https://wa.me/${tel.replace(/^\+?/, "225")}` : "#";
  const mailHref = email ? `mailto:${email}` : "#";

  return `<tr data-nom="${nomEsc.toLowerCase()}" data-tel="${escHtml(c.telephone || "").toLowerCase()}">
    <td>
      <div class="cl-name-cell">
        ${avatar}
        <span class="cl-name-text">${nomEsc}</span>
      </div>
    </td>
    <td class="cl-tel-text">${telEsc}</td>
    <td>
      <div class="cl-actions">

        <!-- Voir profil -->
        <button title="Voir le profil" class="cl-action-btn" onclick="voirClientProfil('${escHtml(c.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>

        <!-- WhatsApp -->
        <a href="${whatsappHref}" target="_blank" rel="noopener" title="WhatsApp" class="cl-action-btn${!tel ? " cl-action-disabled" : ""}">
          <svg viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2C8.268 2 2 8.268 2 16c0 2.49.658 4.83 1.806 6.852L2 30l7.374-1.782A13.94 13.94 0 0 0 16 30c7.732 0 14-6.268 14-14S23.732 2 16 2zm0 25.6a11.56 11.56 0 0 1-5.89-1.608l-.422-.25-4.374 1.056 1.092-4.26-.276-.436A11.6 11.6 0 1 1 16 27.6zm6.39-8.692c-.35-.175-2.07-1.02-2.39-1.136-.32-.116-.552-.175-.784.175s-.9 1.136-1.102 1.37c-.203.232-.406.26-.756.087-.35-.175-1.478-.544-2.815-1.736-1.04-.927-1.742-2.072-1.946-2.422-.203-.35-.022-.54.153-.714.157-.157.35-.41.525-.614.175-.204.232-.35.35-.583.116-.233.058-.437-.029-.614-.087-.175-.784-1.89-1.074-2.588-.283-.68-.57-.588-.784-.598l-.668-.012c-.233 0-.61.087-.928.437s-1.218 1.19-1.218 2.902 1.247 3.366 1.42 3.598c.175.233 2.454 3.748 5.946 5.256.831.359 1.48.573 1.986.733.834.265 1.594.228 2.194.138.67-.1 2.07-.847 2.362-1.664.29-.816.29-1.516.203-1.664-.087-.146-.32-.233-.67-.408z"/>
          </svg>
        </a>

        <!-- Mail -->
        <a href="${mailHref}" title="Envoyer un email" class="cl-action-btn${!email ? " cl-action-disabled" : ""}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>
        </a>

      </div>
    </td>
  </tr>`;
}

function _renderClientsTable(list) {
  const tbody = document.getElementById("clientsBody");
  const label = document.getElementById("clientsCountLabel");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted);">Aucun client trouvé.</td></tr>`;
    if (label) label.textContent = "0 client";
    return;
  }

  tbody.innerHTML = list.map(_renderClientRow).join("");
  if (label) label.textContent = `${list.length} client${list.length > 1 ? "s" : ""}`;
}

// ─── Tableau de bord : KPI + panneaux temps réel ─────────────────────────────
const KYC_STATUT_LABEL = {
  en_attente: { label: "En attente", cls: "badge-pending" },
  valide:     { label: "Validée",    cls: "badge-active" },
  rejete:     { label: "Rejetée",    cls: "badge-blocked" }
};

async function loadDashboardData() {
  try {
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const debutMoisPrecedent = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const [clients, vendeurs, vendeursActifs, kycEnAttente, kycRecents, commandesMois, commandesMoisPrecedent, signalements, commandesMoisStatuts] = await Promise.all([
      API.get(AURA_CONFIG.endpoints.utilisateurs + "?select=id"),
      API.get(AURA_CONFIG.endpoints.vendeurs + "?select=id"),
      API.get(AURA_CONFIG.endpoints.vendeurs + "?statut=eq.approuve&is_active=eq.true&select=id"),
      API.get(AURA_CONFIG.endpoints.kyc_admin + "?statut=eq.en_attente&select=id"),
      API.get(AURA_CONFIG.endpoints.kyc_admin + "?select=id,nom_boutique,nom_responsable,statut,submitted_at&order=submitted_at.desc&limit=3"),
      API.get(AURA_CONFIG.endpoints.commandes + "?statut=neq.annulee&created_at=gte." + debutMois + "&select=montant_total"),
      API.get(AURA_CONFIG.endpoints.commandes + "?statut=neq.annulee&created_at=gte." + debutMoisPrecedent + "&created_at=lt." + debutMois + "&select=montant_total"),
      API.get(AURA_CONFIG.endpoints.signalements_admin + "?statut=neq.traite&select=id,produit_nom,nom_boutique,gravite,signalements_count&order=created_at.desc&limit=5"),
      API.get(AURA_CONFIG.endpoints.commandes + "?created_at=gte." + debutMois + "&select=statut")
    ]);

    // — KPI Utilisateurs totaux (clients + vendeurs)
    const totalUsers = (clients?.length || 0) + (vendeurs?.length || 0);
    document.getElementById("kpi-users").textContent = new Intl.NumberFormat("fr-CI").format(totalUsers);
    document.getElementById("kpi-users-trend").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 15l7-7 7 7"/></svg> ${clients?.length || 0} clients · ${vendeurs?.length || 0} vendeurs`;

    // — KPI Boutiques actives
    document.getElementById("kpi-boutiques").textContent = vendeursActifs?.length || 0;
    document.getElementById("kpi-boutiques-trend").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 15l7-7 7 7"/></svg> sur ${vendeurs?.length || 0} boutiques`;

    // — KPI KYC en attente
    const nbKycAttente = kycEnAttente?.length || 0;
    document.getElementById("kpi-kyc").textContent = nbKycAttente;
    const kycTrendEl = document.getElementById("kpi-kyc-trend");
    kycTrendEl.className = "kpi-trend " + (nbKycAttente > 0 ? "down" : "");
    kycTrendEl.innerHTML = nbKycAttente > 0
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 9l-7 7-7-7"/></svg> À traiter`
      : `Aucune en attente`;

    // — KPI GMV du mois
    const gmvMois = (commandesMois || []).reduce((s, c) => s + (c.montant_total || 0), 0);
    const gmvMoisPrecedent = (commandesMoisPrecedent || []).reduce((s, c) => s + (c.montant_total || 0), 0);
    document.getElementById("kpi-gmv").textContent = formatCFA(gmvMois);
    const gmvTrendEl = document.getElementById("kpi-gmv-trend");
    if (gmvMoisPrecedent > 0) {
      const variation = ((gmvMois - gmvMoisPrecedent) / gmvMoisPrecedent) * 100;
      const signe = variation >= 0 ? "+" : "";
      gmvTrendEl.className = "kpi-trend " + (variation >= 0 ? "up" : "down");
      gmvTrendEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 15l7-7 7 7"/></svg> ${signe}${variation.toFixed(0)}% vs mois dernier`;
    } else {
      gmvTrendEl.innerHTML = `Premier mois d'activité`;
    }

    // — KPI Commandes du mois (répartition par statut)
    const listeCommandesMois = commandesMoisStatuts || [];
    const totalCommandesMois = listeCommandesMois.length;
    const nbAttente = listeCommandesMois.filter(c => c.statut === "en_attente").length;
    const nbConfirmees = listeCommandesMois.filter(c => c.statut === "confirmee").length;
    const nbLivrees = listeCommandesMois.filter(c => c.statut === "livree").length;
    const nbAnnulees = listeCommandesMois.filter(c => c.statut === "annulee").length;

    document.getElementById("kpi-commandes").textContent = new Intl.NumberFormat("fr-CI").format(totalCommandesMois);
    document.getElementById("kpi-cmd-attente").textContent = nbAttente;
    document.getElementById("kpi-cmd-confirmees").textContent = nbConfirmees;
    document.getElementById("kpi-cmd-livrees").textContent = nbLivrees;
    document.getElementById("kpi-cmd-annulees").textContent = nbAnnulees;

    const cmdTrendEl = document.getElementById("kpi-commandes-trend");
    const tauxCompletion = totalCommandesMois > 0 ? Math.round((nbLivrees / totalCommandesMois) * 100) : 0;
    cmdTrendEl.innerHTML = totalCommandesMois > 0
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 15l7-7 7 7"/></svg> ${tauxCompletion}% de commandes livrées`
      : `Aucune commande ce mois-ci`;

    // — Donut SVG (répartition des commandes du mois)
    const CIRCONFERENCE = 301.6; // 2 * π * 48
    const segAttente = document.getElementById("donut-seg-attente");
    const segConfirmees = document.getElementById("donut-seg-confirmees");
    const segLivrees = document.getElementById("donut-seg-livrees");
    const segAnnulees = document.getElementById("donut-seg-annulees");

    if (segAttente && segConfirmees && segLivrees && segAnnulees) {
      if (totalCommandesMois > 0) {
        const lenAttente = (nbAttente / totalCommandesMois) * CIRCONFERENCE;
        const lenConfirmees = (nbConfirmees / totalCommandesMois) * CIRCONFERENCE;
        const lenLivrees = (nbLivrees / totalCommandesMois) * CIRCONFERENCE;
        const lenAnnulees = (nbAnnulees / totalCommandesMois) * CIRCONFERENCE;

        segAttente.setAttribute("stroke-dasharray", `${lenAttente} ${CIRCONFERENCE - lenAttente}`);
        segAttente.setAttribute("stroke-dashoffset", "0");

        segConfirmees.setAttribute("stroke-dasharray", `${lenConfirmees} ${CIRCONFERENCE - lenConfirmees}`);
        segConfirmees.setAttribute("stroke-dashoffset", `${-lenAttente}`);

        segLivrees.setAttribute("stroke-dasharray", `${lenLivrees} ${CIRCONFERENCE - lenLivrees}`);
        segLivrees.setAttribute("stroke-dashoffset", `${-(lenAttente + lenConfirmees)}`);

        segAnnulees.setAttribute("stroke-dasharray", `${lenAnnulees} ${CIRCONFERENCE - lenAnnulees}`);
        segAnnulees.setAttribute("stroke-dashoffset", `${-(lenAttente + lenConfirmees + lenLivrees)}`);
      } else {
        [segAttente, segConfirmees, segLivrees, segAnnulees].forEach(seg => {
          seg.setAttribute("stroke-dasharray", "0 " + CIRCONFERENCE);
        });
      }
    }

    // — Demandes KYC récentes
    const kycBody = document.getElementById("dash-kyc-body");
    if (kycBody) {
      if (!kycRecents || kycRecents.length === 0) {
        kycBody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Aucune demande KYC</td></tr>`;
      } else {
        kycBody.innerHTML = kycRecents.map(k => {
          const s = KYC_STATUT_LABEL[k.statut] || { label: k.statut, cls: "badge-pending" };
          const date = k.submitted_at ? new Date(k.submitted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—";
          return `<tr>
            <td>${escHtml(k.nom_boutique || "—")}</td>
            <td>${escHtml(k.nom_responsable || "—")}</td>
            <td>${date}</td>
            <td><span class="status-badge ${s.cls}">${s.label}</span></td>
          </tr>`;
        }).join("");
      }
    }

    // — Signalements récents
    const sigBody = document.getElementById("dash-signalements-body");
    if (sigBody) {
      if (!signalements || signalements.length === 0) {
        sigBody.innerHTML = `<div class="prod-meta" style="text-align:center;padding:16px;color:var(--text-muted);">Aucun signalement en cours</div>`;
      } else {
        sigBody.innerHTML = signalements.map(s => {
          const isUrgent = s.gravite === "urgent";
          const count = s.signalements_count || 1;
          return `<div class="prod-cell" style="justify-content:space-between;">
            <div class="prod-info">
              <div class="prod-title">${escHtml(s.produit_nom || "Produit supprimé")}</div>
              <div class="prod-meta">${escHtml(s.nom_boutique || "—")} · ${count} signalement${count > 1 ? "s" : ""}</div>
            </div>
            <span class="status-badge ${isUrgent ? "badge-blocked" : "badge-pending"}">${isUrgent ? "Urgent" : "À revoir"}</span>
          </div>`;
        }).join("");
      }
    }
  } catch (err) {
    console.error("Erreur chargement dashboard :", err.message);
  }
}

async function loadClients() {
  const tbody = document.getElementById("clientsBody");
  const label = document.getElementById("clientsCountLabel");
  if (!tbody) return;

  tbody.innerHTML = `<tr id="clients-loading"><td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted);">Chargement des clients…</td></tr>`;
  if (label) label.textContent = "Chargement…";

  try {
    const data = await API.get(
      AURA_CONFIG.endpoints.utilisateurs + "?select=id,nom,telephone,email,avatar_url,is_active&limit=500"
    );
    _allClients = data || [];
    _renderClientsTable(_allClients);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--danger);">Erreur : ${escHtml(err.message)}</td></tr>`;
    if (label) label.textContent = "Erreur de chargement";
  }
}

function filtrerClients(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    _renderClientsTable(_allClients);
    return;
  }
  const filtered = _allClients.filter(c =>
    (c.nom || "").toLowerCase().includes(q) ||
    (c.telephone || "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
  );
  _renderClientsTable(filtered);
}

function voirClientProfil(id) {
  const client = _allClients.find(c => c.id === id);
  if (!client) return;
  const existing = document.getElementById("modal-client-profil");
  if (existing) existing.remove();

  const initiales = _initialesAvatar(client.nom);
  const avatar = client.avatar_url
    ? `<div class="cl-avatar" style="width:60px;height:60px;font-size:20px;border-radius:10px;"><img src="${escHtml(client.avatar_url)}" alt="" style="border-radius:10px;"></div>`
    : `<div class="cl-avatar" style="width:60px;height:60px;font-size:20px;border-radius:10px;">${initiales}</div>`;

  const modal = document.createElement("div");
  modal.id = "modal-client-profil";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:22px;max-width:340px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">Profil client</span>
        <button onclick="this.closest('#modal-client-profil').remove()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
        ${avatar}
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--text);">${escHtml(client.nom || "—")}</div>
          <div style="font-size:11.5px;color:${client.is_active ? "#10B981" : "#E0276F"};margin-top:4px;font-weight:600;">${client.is_active ? "● Actif" : "● Inactif"}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">Téléphone</span><span style="font-weight:600;color:var(--text);">${escHtml(client.telephone || "—")}</span></div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;"><span style="color:var(--text-muted);">Email</span><span style="font-weight:600;word-break:break-all;color:var(--text);">${escHtml(client.email || "—")}</span></div>
      </div>
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ─── Utilisateurs : bloquer / réactiver ──────────────────────────────────────
async function toggleStatutUtilisateur(btn, userId, rowEl) {
  const isBlocked = btn.dataset.blocked === "true";
  const newState = !isBlocked;
  const action = newState ? "bloquer" : "réactiver";

  if (!confirm(`Confirmer : ${action} cet utilisateur ?`)) return;

  btn.dataset.blocked = String(newState);
  const badge = rowEl?.querySelector(".status-badge");
  if (badge) {
    badge.textContent = newState ? "Bloqué" : "Actif";
    badge.classList.toggle("badge-blocked", newState);
    badge.classList.toggle("badge-active", !newState);
  }
  btn.textContent = newState ? "Réactiver" : "Bloquer";

  try {
    await API.patch(AURA_CONFIG.endpoints.utilisateurs + "?id=eq." + userId, { bloque: newState });
    showToast(newState ? "Utilisateur bloqué" : "Utilisateur réactivé", newState ? "warning" : "success");
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}
function voirKycDetail(id) {
  const row = document.querySelector('#kycBody tr[data-id="' + id + '"]');
  if (!row) return;
  let k = {};
  try { k = JSON.parse(row.dataset.kyc || "{}"); } catch (e) {}

  const photosForLabel = [k.selfie_url, k.cni_recto_url, k.cni_verso_url];
  const labels = ["Selfie", "CNI recto", "CNI verso"];
  const photos = photosForLabel.filter(Boolean);

  const existing = document.getElementById("modal-voir-kyc");
  if (existing) existing.remove();

  const slides = photosForLabel.map((src, i) => src ? `
    <div class="vp-slide" style="flex:0 0 100%;scroll-snap-align:start;position:relative;">
      <img src="${escHtml(src)}" alt="" data-idx="${i}" onclick="ouvrirPhotoPleinEcran(this)" style="width:100%;height:220px;object-fit:cover;border-radius:10px;cursor:zoom-in;">
      <span style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;">${labels[i]}</span>
    </div>` : `
    <div class="vp-slide" style="flex:0 0 100%;scroll-snap-align:start;height:220px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;">${labels[i]} manquant</div>`
  ).join("");

  const dots = `<div class="vp-dots" style="display:flex;justify-content:center;gap:5px;margin-top:8px;">
    ${photosForLabel.map((_, i) => `<div data-dot="${i}" style="width:6px;height:6px;border-radius:50%;background:${i===0?"var(--text)":"var(--border)"};"></div>`).join("")}
  </div>`;

  const carouselHtml = `
    <div class="vp-carousel" data-photos='${escHtml(JSON.stringify(photos))}' style="position:relative;margin-bottom:4px;">
      <div class="vp-track" style="overflow-x:auto;display:flex;scroll-snap-type:x mandatory;scroll-behavior:smooth;border-radius:10px;">
        ${slides}
      </div>
      <button type="button" onclick="vpCarouselNav(this,-1)" aria-label="Photo précédente" style="position:absolute;left:6px;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">‹</button>
      <button type="button" onclick="vpCarouselNav(this,1)" aria-label="Photo suivante" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">›</button>
    </div>${dots}<div style="margin-bottom:14px;"></div>`;

  const date = k.submitted_at ? new Date(k.submitted_at).toLocaleDateString("fr-CI") : "—";

  const modal = document.createElement("div");
  modal.id = "modal-voir-kyc";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;padding:0;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:16px 16px 0 0;padding:20px 20px 32px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 -8px 32px rgba(0,0,0,.5);">
      <div style="width:36px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 16px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">Dossier KYC</span>
        <button onclick="this.closest('#modal-voir-kyc').remove()" style="background:none;border:1px solid var(--border);color:var(--text-muted);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      ${carouselHtml}
      <div style="font-weight:700;font-size:16px;margin-bottom:2px;color:var(--text);">${escHtml(k.nom_responsable || "—")}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">${escHtml(k.nom_boutique || "—")}</div>
      <div style="display:flex;flex-direction:column;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Téléphone</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(k.telephone || "—")}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Boutique</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(k.nom_boutique || "—")}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;">
          <span style="color:var(--text-muted);">Soumis le</span>
          <span style="font-weight:600;color:var(--text);">${date}</span>
        </div>
      </div>
      ${k.statut === "en_attente" ? `<div style="display:flex;gap:10px;margin-top:20px;">
        <button onclick="traiterKyc('${k.id}','valide',document.querySelector('#kycBody tr[data-id=\\'${k.id}\\']'));this.closest('#modal-voir-kyc').remove();"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:#10B981;font-weight:600;font-size:13.5px;cursor:pointer;">Valider</button>
        <button onclick="traiterKyc('${k.id}','rejete',document.querySelector('#kycBody tr[data-id=\\'${k.id}\\']'));this.closest('#modal-voir-kyc').remove();"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:#E0276F;font-weight:600;font-size:13.5px;cursor:pointer;">Rejeter</button>
      </div>` : `<div style="margin-top:20px;padding:11px;border-radius:9px;border:1px solid var(--border);text-align:center;font-weight:600;font-size:13.5px;color:${k.statut === "valide" ? "#10B981" : "#E0276F"};">${k.statut === "valide" ? "● Dossier validé" : "● Dossier rejeté"}</div>`}
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ─── KYC : chargement ────────────────────────────────────────────────────────
let _kycStatut = "toutes";
let _allKyc = [];
let _kycCounts = { en_attente: 0, valide: 0, rejete: 0 };

async function loadKyc(statut, tabEl) {
  _kycStatut = statut || "toutes";
  const tbody = document.getElementById("kycBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">Chargement…</td></tr>`;

  try {
    const filtreStatut = _kycStatut === "toutes" ? "" : "&statut=eq." + _kycStatut;
    const rows = await API.get(
      AURA_CONFIG.endpoints.kyc_admin +
      "?order=submitted_at.desc" + filtreStatut +
      "&select=id,vendeur_id,selfie_url,cni_recto_url,cni_verso_url,nom_responsable,nom_boutique,telephone,logo_url,submitted_at,statut,motif_rejet"
    );

    await Promise.all(["en_attente","valide","rejete"].map(async s => {
      try {
        const r = await API.get(AURA_CONFIG.endpoints.kyc_admin + "?statut=eq." + s + "&select=id");
        const count = r?.length ?? 0;
        _kycCounts[s] = count;
        if (s === "en_attente") {
          const sideEl = document.getElementById("badge-kyc");
          if (sideEl) {
            sideEl.textContent = count;
            sideEl.style.display = count > 0 ? "" : "none";
          }
        }
      } catch(_) {}
    }));
    renderKycFilterDropdown();

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">Aucune demande.</td></tr>`;
      return;
    }

    _allKyc = rows;
    _renderKycTable(rows);

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--danger);">Erreur : ${escHtml(err.message)}</td></tr>`;
  }
}

function _renderKycRow(k) {
  const photo = k.selfie_url || k.logo_url;
  const avatarHtml = photo
    ? `<div class="cl-avatar" style="border-radius:50%;width:34px;height:34px;"><img src="${escHtml(photo)}" alt="" style="border-radius:50%;"></div>`
    : `<div class="cl-avatar" style="border-radius:50%;width:34px;height:34px;">${escHtml((k.nom_responsable||"?")[0].toUpperCase())}</div>`;
  const nom = escHtml(k.nom_responsable || "—");
  const boutique = escHtml(k.nom_boutique || "—");
  const date = k.submitted_at ? new Date(k.submitted_at).toLocaleDateString("fr-CI") : "—";

  const eyeBtn = `<button title="Voir" class="cl-action-btn" onclick="voirKycDetail('${k.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>`;

  const statusLabel = k.statut === "valide"
    ? `<span style="font-size:11px;color:#10B981;font-weight:600;">Validé</span>`
    : k.statut === "rejete"
    ? `<span style="font-size:11px;color:#E0276F;font-weight:600;">Rejeté</span>`
    : `<span style="font-size:11px;color:var(--text-muted);font-weight:600;">En attente</span>`;

  const actions = k.statut === "en_attente" ? `
    ${eyeBtn}
    <button title="Valider" class="cl-action-btn" onclick="traiterKyc('${k.id}','valide',this.closest('tr'))">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
    </button>
    <button title="Rejeter" class="cl-action-btn" onclick="traiterKyc('${k.id}','rejete',this.closest('tr'))">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>` : `<div style="display:flex;align-items:center;gap:8px;">${statusLabel}${eyeBtn}</div>`;

  return `<tr data-id="${k.id}" data-kyc='${escHtml(JSON.stringify(k))}' data-nom="${nom.toLowerCase()}" data-boutique="${boutique.toLowerCase()}">
    <td>${avatarHtml}</td>
    <td class="cl-name-text">${nom}</td>
    <td>
      <div class="cl-name-text" style="font-weight:500;">${boutique}</div>
      <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px;">${date}</div>
    </td>
    <td>
      <div class="cl-actions">${actions}</div>
    </td>
  </tr>`;
}

function _renderKycTable(list) {
  const tbody = document.getElementById("kycBody");
  if (!tbody) return;
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">Aucune demande.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(_renderKycRow).join("");
}

function filtrerKyc(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) { _renderKycTable(_allKyc); return; }
  const filtered = _allKyc.filter(k =>
    (k.nom_responsable || "").toLowerCase().includes(q) ||
    (k.nom_boutique || "").toLowerCase().includes(q) ||
    (k.telephone || "").toLowerCase().includes(q)
  );
  _renderKycTable(filtered);
}

// ─── KYC : valider / rejeter ──────────────────────────────────────────────────
async function traiterKyc(id, decision, rowEl) {
  const label = decision === "valide" ? "Valider" : "Rejeter";
  let motif = null;
  if (decision === "rejete") {
    motif = await appPrompt("Motif du rejet (optionnel)", { title: "Rejeter la demande", okLabel: "Rejeter", placeholder: "Ex: Photo floue, CNI illisible…" });
    if (motif === null) return;
  } else {
    const ok = await appConfirm("Valider cette demande KYC ?", { title: "Valider", okLabel: "Valider" });
    if (!ok) return;
  }

  try {
    const body = { statut: decision, reviewed_at: new Date().toISOString() };
    if (motif) body.motif_rejet = motif;
    await API.patch(AURA_CONFIG.endpoints.kyc + "?id=eq." + id, body);
    if (rowEl) {
      rowEl.style.opacity = "0.3";
      rowEl.style.transition = "opacity .3s";
      setTimeout(() => { rowEl.remove(); loadKyc(_kycStatut); }, 320);
    }
    showToast(decision === "valide" ? "Vendeur validé ✓" : "Demande rejetée", decision === "valide" ? "success" : "warning");
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

// ─── Produits : modération (masquer / supprimer) ─────────────────────────────
async function moderarProduit(id, action, cardEl) {
  const messages = {
    masquer: "Masquer ce produit du catalogue public ?",
    supprimer: "Supprimer définitivement ce produit ?"
  };
  if (!confirm(messages[action] || "Confirmer cette action ?")) return;

  try {
    if (action === "supprimer") {
      await API.delete(AURA_CONFIG.endpoints.produits + "?id=eq." + id);
      if (cardEl) cardEl.remove();
      showToast("Produit supprimé", "warning");
      logActivite("suppression", "produit", id, "Produit supprimé du catalogue");
    } else {
      await API.patch(AURA_CONFIG.endpoints.produits + "?id=eq." + id, { actif: false });
      showToast("Produit masqué du catalogue", "warning");
    }
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

// ─── VENDEURS : chargement, rendu, actions ────────────────────────────────────
let _allVendeurs = [];

function _initialesVendeur(nom) {
  if (!nom) return "?";
  const parts = nom.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

function _statutVendeurColor(statut) {
  const map = {
    approuve:   { color: "#10B981", label: "Approuvé" },
    en_attente: { color: "#F59E0B", label: "En attente" },
    suspendu:   { color: "#E0276F", label: "Suspendu" },
    rejete:     { color: "#E0276F", label: "Rejeté" },
  };
  return map[statut] || { color: "var(--text-muted)", label: statut };
}

function _renderVendeurRow(v) {
  const nomBoutique = escHtml(v.nom_boutique || "—");
  const nomResp     = escHtml(v.nom_responsable || "");
  const tel         = (v.telephone || "").replace(/\s/g, "");
  const telEsc      = escHtml(v.telephone || "—");
  const email       = v.email || "";
  const statut      = _statutVendeurColor(v.statut);
  const isSusp      = v.statut === "suspendu";

  const avatar = v.logo_url
    ? `<div class="cl-avatar"><img src="${escHtml(v.logo_url)}" alt=""></div>`
    : `<div class="cl-avatar">${_initialesVendeur(v.nom_boutique)}</div>`;

  const certifBadge = v.certifie
    ? `<span style="font-size:9px;color:#F59E0B;margin-left:4px;">✓</span>`
    : "";

  const whatsappHref = tel ? `https://wa.me/225${tel.replace(/^0/, "")}` : "#";

  return `<tr data-nom="${nomBoutique.toLowerCase()}" data-tel="${escHtml(v.telephone || "").toLowerCase()}" data-id="${escHtml(v.id)}">
    <td>
      <div class="cl-name-cell">
        ${avatar}
        <div style="overflow:hidden;">
          <div class="cl-name-text">${nomBoutique}${certifBadge}</div>
          <div style="font-size:10.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nomResp}</div>
        </div>
      </div>
    </td>
    <td>
      <div class="cl-tel-text">${telEsc}</div>
      <div style="font-size:10px;font-weight:600;color:${statut.color};margin-top:3px;">● ${statut.label}</div>
    </td>
    <td>
      <div class="cl-actions">

        <!-- Voir profil -->
        <button title="Voir le profil" class="cl-action-btn" onclick="voirVendeurProfil('${escHtml(v.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>

        <!-- Voir produits -->
        <button title="Voir les produits" class="cl-action-btn" onclick="voirProduitsDuVendeur('${escHtml(v.id)}', '${nomBoutique}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </button>

        <!-- WhatsApp -->
        <a href="${whatsappHref}" target="_blank" rel="noopener" title="WhatsApp" class="cl-action-btn${!tel ? " cl-action-disabled" : ""}">
          <svg viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2C8.268 2 2 8.268 2 16c0 2.49.658 4.83 1.806 6.852L2 30l7.374-1.782A13.94 13.94 0 0 0 16 30c7.732 0 14-6.268 14-14S23.732 2 16 2zm0 25.6a11.56 11.56 0 0 1-5.89-1.608l-.422-.25-4.374 1.056 1.092-4.26-.276-.436A11.6 11.6 0 1 1 16 27.6zm6.39-8.692c-.35-.175-2.07-1.02-2.39-1.136-.32-.116-.552-.175-.784.175s-.9 1.136-1.102 1.37c-.203.232-.406.26-.756.087-.35-.175-1.478-.544-2.815-1.736-1.04-.927-1.742-2.072-1.946-2.422-.203-.35-.022-.54.153-.714.157-.157.35-.41.525-.614.175-.204.232-.35.35-.583.116-.233.058-.437-.029-.614-.087-.175-.784-1.89-1.074-2.588-.283-.68-.57-.588-.784-.598l-.668-.012c-.233 0-.61.087-.928.437s-1.218 1.19-1.218 2.902 1.247 3.366 1.42 3.598c.175.233 2.454 3.748 5.946 5.256.831.359 1.48.573 1.986.733.834.265 1.594.228 2.194.138.67-.1 2.07-.847 2.362-1.664.29-.816.29-1.516.203-1.664-.087-.146-.32-.233-.67-.408z"/>
          </svg>
        </a>

        <!-- Suspendre / Réactiver -->
        <button title="${isSusp ? "Réactiver" : "Suspendre"}" class="cl-action-btn" onclick="toggleStatutVendeur('${escHtml(v.id)}', this)"
          data-statut="${escHtml(v.statut)}">
          ${isSusp
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
          }
        </button>

        <!-- Envoyer un mail -->
        <a href="${email ? "mailto:" + email : "#"}" title="Envoyer un email" class="cl-action-btn${!email ? " cl-action-disabled" : ""}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>
        </a>

      </div>
    </td>
  </tr>`;
}

function _renderVendeursTable(list) {
  const tbody = document.getElementById("vendeursBody");
  const label = document.getElementById("vendeursCountLabel");
  if (!tbody) return;
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted);">Aucun vendeur trouvé.</td></tr>`;
    if (label) label.textContent = "0 vendeur";
    return;
  }
  tbody.innerHTML = list.map(_renderVendeurRow).join("");
  if (label) label.textContent = `${list.length} vendeur${list.length > 1 ? "s" : ""}`;
}

async function loadVendeurs() {
  const tbody = document.getElementById("vendeursBody");
  const label = document.getElementById("vendeursCountLabel");
  if (!tbody) return;
  tbody.innerHTML = `<tr id="vendeurs-loading"><td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted);">Chargement des vendeurs…</td></tr>`;
  if (label) label.textContent = "Chargement…";
  try {
    const data = await API.get("/rest/v_admin_vendeurs?select=id,nom_responsable,nom_boutique,telephone,email,logo_url,statut,certifie,note_moyenne,produits_count,is_active&limit=500");
    _allVendeurs = data || [];
    _renderVendeursTable(_allVendeurs);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--danger);">Erreur : ${escHtml(err.message)}</td></tr>`;
    if (label) label.textContent = "Erreur de chargement";
  }
}

function filtrerVendeurs(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) { _renderVendeursTable(_allVendeurs); return; }
  const filtered = _allVendeurs.filter(v =>
    (v.nom_boutique || "").toLowerCase().includes(q) ||
    (v.nom_responsable || "").toLowerCase().includes(q) ||
    (v.telephone || "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
  );
  _renderVendeursTable(filtered);
}

async function toggleStatutVendeur(id, btn) {
  const statut = btn.dataset.statut;
  const isSusp = statut === "suspendu";
  const newStatut = isSusp ? "approuve" : "suspendu";
  const action = isSusp ? "réactiver" : "suspendre";
  if (!confirm(`Confirmer : ${action} ce vendeur ?`)) return;
  try {
    await API.patch(`/rest/users_vendeurs?id=eq.${id}`, { statut: newStatut });
    showToast(isSusp ? "Vendeur réactivé ✓" : "Vendeur suspendu", isSusp ? "success" : "warning");
    await loadVendeurs();
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

function voirVendeurProfil(id) {
  const v = _allVendeurs.find(x => x.id === id);
  if (!v) return;
  const existing = document.getElementById("modal-vendeur-profil");
  if (existing) existing.remove();
  const statut = _statutVendeurColor(v.statut);
  const avatar = v.logo_url
    ? `<div class="cl-avatar" style="width:60px;height:60px;font-size:20px;border-radius:10px;"><img src="${escHtml(v.logo_url)}" alt="" style="border-radius:10px;"></div>`
    : `<div class="cl-avatar" style="width:60px;height:60px;font-size:20px;border-radius:10px;">${_initialesVendeur(v.nom_boutique)}</div>`;
  const modal = document.createElement("div");
  modal.id = "modal-vendeur-profil";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:22px;max-width:340px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">Profil vendeur</span>
        <button onclick="this.closest('#modal-vendeur-profil').remove()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
        ${avatar}
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--text);">${escHtml(v.nom_boutique || "—")}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escHtml(v.nom_responsable || "")}</div>
          <div style="font-size:10.5px;font-weight:600;color:${statut.color};margin-top:5px;">● ${statut.label}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">Téléphone</span><span style="font-weight:600;color:var(--text);">${escHtml(v.telephone || "—")}</span></div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">Email</span><span style="font-weight:600;word-break:break-all;color:var(--text);">${escHtml(v.email || "—")}</span></div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">Produits</span><span style="font-weight:600;color:var(--text);">${v.produits_count ?? 0}</span></div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">Note</span><span style="font-weight:600;color:var(--text);">${v.note_moyenne ?? "—"} ★</span></div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;"><span style="color:var(--text-muted);">Certifié</span><span style="font-weight:600;color:${v.certifie ? "#F59E0B" : "var(--text-muted)"};">${v.certifie ? "✓ Oui" : "Non"}</span></div>
      </div>
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function voirProduitsDuVendeur(id, nomBoutique) {
  const existing = document.getElementById("modal-produits-vendeur");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "modal-produits-vendeur";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:22px;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">Produits — ${nomBoutique}</span>
        <button onclick="this.closest('#modal-produits-vendeur').remove()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div id="produits-vendeur-body" style="display:flex;flex-direction:column;gap:8px;">
        <div style="text-align:center;padding:24px;color:var(--text-muted);">Chargement…</div>
      </div>
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  try {
    const prods = await API.get(
      AURA_CONFIG.endpoints.produits + "?vendeur_id=eq." + id + "&select=id,nom,prix,actif,image_url&order=created_at.desc&limit=50"
    );
    const body = document.getElementById("produits-vendeur-body");
    if (!body) return;
    if (!prods || prods.length === 0) {
      body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);">Aucun produit pour ce vendeur.</div>`;
      return;
    }
    body.innerHTML = prods.map(p => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;border:1px solid var(--border);">
        <div class="cl-avatar" style="border-radius:6px;">
          ${p.image_url ? `<img src="${escHtml(p.image_url)}" alt="">` : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p.nom)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${formatCFA(p.prix)}</div>
        </div>
        <span style="font-size:10px;font-weight:600;color:${p.actif ? "#10B981" : "var(--text-muted)"};">● ${p.actif ? "Actif" : "Inactif"}</span>
      </div>
    `).join("");
  } catch (err) {
    const body = document.getElementById("produits-vendeur-body");
    if (body) body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--danger);">Erreur : ${escHtml(err.message)}</div>`;
  }
}

// ─── Boutiques : suspendre / réactiver (legacy) ────────────────────────────────
async function toggleStatutBoutique(btn, boutiqueId) {
  const isSuspended = btn.dataset.suspended === "true";
  const newState = !isSuspended;
  btn.dataset.suspended = String(newState);
  btn.textContent = newState ? "Réactiver" : "Suspendre";
  try {
    await API.patch(AURA_CONFIG.endpoints.boutiques + "?id=eq." + boutiqueId, { suspendue: newState });
    showToast(newState ? "Boutique suspendue" : "Boutique réactivée", newState ? "warning" : "success");
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

// ─── Validation produits ──────────────────────────────────────────────────────
let _validationStatut = "en_attente";

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

async function loadValidation(statut) {
  _validationStatut = statut || "toutes";
  const tbody = document.getElementById("validationBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">Chargement…</td></tr>`;

  try {
    const filtreStatut = _validationStatut === "toutes" ? "?statut=in.(en_attente,valide)" : "?statut=eq." + _validationStatut;
    const rows = await API.get(
      AURA_CONFIG.endpoints.produits_validation +
      filtreStatut +
"&order=created_at.asc&select=id,nom,prix,image_url,photos,images,description,categorie,stock,statut,created_at,vendeur_id,nom_boutique,details,motif_refus"
    );

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">Aucun produit dans cette catégorie.</td></tr>`;
      if (_validationStatut === "en_attente") updateValidationBadge(0);
      return;
    }

    if (_validationStatut === "toutes") {
      const priorite = { en_attente: 0, valide: 1, refuse: 2 };
      rows.sort((a, b) => (priorite[a.statut] ?? 3) - (priorite[b.statut] ?? 3));
    }

    tbody.innerHTML = rows.map(p => {
      const photoSrc = p.image_url || (Array.isArray(p.photos) && p.photos[0]) || (Array.isArray(p.images) && p.images[0]) || "";
      const photoHtml = photoSrc
        ? `<img src="${escHtml(photoSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>`;
      const allPhotos = JSON.stringify(Array.isArray(p.photos) && p.photos.length ? p.photos : (p.image_url ? [p.image_url] : []));
      return `<tr data-id="${p.id}"
          data-statut="${escHtml(p.statut||'')}"
          data-nom="${escHtml(p.nom||'')}"
          data-prix="${p.prix||0}"
          data-boutique="${escHtml(p.nom_boutique||'')}"
          data-desc="${escHtml(p.description||'')}"
          data-cat="${escHtml(p.categorie||'')}"
          data-stock="${p.stock||0}"
          data-date="${p.created_at||''}"
data-photos="${escHtml(allPhotos)}"
          data-details="${escHtml(JSON.stringify(p.details || {}))}"
          data-motif="${escHtml(p.motif_refus || '')}">
        <td>
          <div class="cl-avatar" style="border-radius:7px;">
            ${photoHtml}
          </div>
        </td>
        <td>
          <div class="cl-name-text">${escHtml(p.nom)}</div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.nom_boutique ? escHtml(p.nom_boutique) : "—"}</div>
        </td>
        <td>
          <div class="cl-name-text" style="font-weight:700;">${formatCFA(p.prix)}</div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${new Date(p.created_at).toLocaleDateString("fr-CI")}</div>
        </td>
        <td>
          <div class="cl-actions">
            <button title="Voir" class="cl-action-btn" onclick="voirProduitValidation('${p.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${p.statut === "en_attente" ? `
            <button title="Valider" class="cl-action-btn" onclick="deciderValidation('${p.id}','valide',this.closest('tr'))">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
            </button>
            <button title="Refuser" class="cl-action-btn" onclick="deciderValidation('${p.id}','refuse',this.closest('tr'))">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>` : p.statut === "valide" ? `
            <button title="Supprimer" class="cl-action-btn" onclick="supprimerProduitValidation('${p.id}',this.closest('tr'))">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>` : ``}
          </div>
        </td>
      </tr>`;
    }).join("");

    if (_validationStatut === "en_attente" || _validationStatut === "toutes") updateValidationBadge(rows.filter(r => r.statut === "en_attente").length);
    refreshValidationCounts();

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--danger);">Erreur : ${escHtml(err.message)}</td></tr>`;
  }
}

function filtrerValidation(statut, tabEl) {
  loadValidation(statut);
}


async function deciderValidation(id, decision, rowEl) {
  let motif = null;
  if (decision === "refuse") {
    motif = await appPrompt("Motif du refus", { title: "Refuser le produit", okLabel: "Refuser", placeholder: "Optionnel" });
    if (motif === null) return;
  } else {
    const ok = await appConfirm("Valider ce produit ?", { title: "Validation", okLabel: "Valider" });
    if (!ok) return;
  }

  try {
    // Patcher directement la table produits (la vue n'est pas writable)
    const body = { statut: decision };
    if (decision === "valide") body.actif = true;
    if (motif) body.motif_refus = motif;
    await API.patch(AURA_CONFIG.endpoints.produits + "?id=eq." + id, body);
    if (rowEl) {
      rowEl.style.opacity = "0.3";
      rowEl.style.transition = "opacity .3s";
      setTimeout(() => {
        rowEl.remove();
        const remaining = document.querySelectorAll("#validationBody tr[data-id]").length;
        if (_validationStatut === "en_attente") updateValidationBadge(remaining);
        refreshValidationCounts();
      }, 320);
    }
    showToast(decision === "valide" ? "Produit validé ✓" : "Produit refusé", decision === "valide" ? "success" : "warning");
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

function voirProduitValidation(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;

  const nom     = row.dataset.nom || "—";
  const statutProduit = row.dataset.statut || "en_attente";
  const prix    = row.dataset.prix || "0";
  const boutique= row.dataset.boutique || "—";
  const desc    = row.dataset.desc || "";
  const cat     = row.dataset.cat || "—";
  const stock   = row.dataset.stock || "0";
  const motif   = row.dataset.motif || "";
  const date    = row.dataset.date ? new Date(row.dataset.date).toLocaleDateString("fr-CI") : "—";
  let   photos  = [];
  try { photos = JSON.parse(row.dataset.photos || "[]"); } catch(e) {}
  let   details = {};
  try { details = JSON.parse(row.dataset.details || "{}"); } catch(e) {}
  const detailsEntries = Object.entries(details).filter(([k, v]) => v !== "" && v != null);
  const detailsHtml = detailsEntries.map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
      <span style="color:var(--text-muted);">${escHtml(k)}</span>
      <span style="font-weight:600;color:var(--text);">${escHtml(String(v))}</span>
    </div>`
  ).join("");

  const existing = document.getElementById("modal-voir-produit");
  if (existing) existing.remove();

  // Carrousel photos
  let carouselHtml = "";
  if (photos.length > 0) {
    const slides = photos.map((src, i) =>
      `<div class="vp-slide" style="flex:0 0 100%;scroll-snap-align:start;">
        <img src="${escHtml(src)}" alt="" data-idx="${i}" onclick="ouvrirPhotoPleinEcran(this)" style="width:100%;height:200px;object-fit:cover;border-radius:10px;cursor:zoom-in;">
      </div>`
    ).join("");
    const arrows = photos.length > 1 ? `
      <button type="button" onclick="vpCarouselNav(this,-1)" aria-label="Photo précédente" style="position:absolute;left:6px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">‹</button>
      <button type="button" onclick="vpCarouselNav(this,1)" aria-label="Photo suivante" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">›</button>` : "";
    const dots = photos.length > 1 ? `<div class="vp-dots" style="display:flex;justify-content:center;gap:5px;margin-top:8px;">
      ${photos.map((_, i) => `<div data-dot="${i}" style="width:6px;height:6px;border-radius:50%;background:${i===0?"#FFFFFF":"rgba(255,255,255,0.2)"};"></div>`).join("")}
    </div>` : "";
    carouselHtml = `
      <div class="vp-carousel" data-photos='${escHtml(JSON.stringify(photos))}' style="position:relative;margin-bottom:${photos.length>1?'4px':'14px'};">
        <div class="vp-track" style="overflow-x:auto;display:flex;scroll-snap-type:x mandatory;scroll-behavior:smooth;border-radius:10px;">
          ${slides}
        </div>${arrows}
      </div>${dots}<div style="margin-bottom:14px;"></div>`;
  }

  const modal = document.createElement("div");
  modal.id = "modal-voir-produit";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;padding:0;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:16px 16px 0 0;padding:20px 20px 32px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 -8px 32px rgba(0,0,0,.5);">
      <!-- Handle -->
      <div style="width:36px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 16px;"></div>
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">Aperçu produit</span>
        <button onclick="this.closest('#modal-voir-produit').remove()" style="background:none;border:1px solid var(--border);color:var(--text-muted);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      <!-- Photos -->
      ${carouselHtml || `<div style="width:100%;height:180px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted);margin-bottom:14px;"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>`}
      <!-- Nom + prix -->
      <div style="font-weight:700;font-size:16px;margin-bottom:4px;color:var(--text);">${escHtml(nom)}</div>
      <div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:16px;">${formatCFA(Number(prix))}</div>
      <!-- Détails -->
      <div style="display:flex;flex-direction:column;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Boutique</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(boutique)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Catégorie</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(cat)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Stock</span>
          <span style="font-weight:600;color:var(--text);">${stock} unités</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;${detailsHtml || desc ? "border-bottom:1px solid var(--border);" : ""}">
          <span style="color:var(--text-muted);">Soumis le</span>
          <span style="font-weight:600;color:var(--text);">${date}</span>
        </div>
        ${detailsHtml}
        ${desc ? `<div style="padding:9px 0;">
          <div style="color:var(--text-muted);margin-bottom:5px;">Description</div>
          <div style="font-size:13px;line-height:1.6;color:var(--text);">${escHtml(desc)}</div>
        </div>` : ""}
      </div>
      ${statutProduit === "refuse" ? `
      <div style="padding:14px 0 0;border-top:1px solid var(--border);margin-top:16px;">
        <div style="color:var(--text-muted);font-size:12px;margin-bottom:5px;">Motif du refus</div>
        <div style="font-size:13px;line-height:1.6;color:#E0276F;font-weight:600;">${motif ? escHtml(motif) : "Aucun motif renseigné"}</div>
      </div>` : `
      <!-- Boutons -->
      <div style="display:flex;gap:10px;margin-top:20px;">
        ${statutProduit === "en_attente" ? `
        <button onclick="deciderValidation('${id}','valide',document.querySelector('tr[data-id=\\'${id}\\']'));this.closest('#modal-voir-produit').remove();"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:#10B981;font-weight:600;font-size:13.5px;cursor:pointer;">Valider</button>
        <button onclick="deciderValidation('${id}','refuse',document.querySelector('tr[data-id=\\'${id}\\']'));this.closest('#modal-voir-produit').remove();"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:#E0276F;font-weight:600;font-size:13.5px;cursor:pointer;">Refuser</button>` : `
        <button onclick="supprimerProduitValidation('${id}',document.querySelector('tr[data-id=\\'${id}\\']'));this.closest('#modal-voir-produit').remove();"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:#E0276F;font-weight:600;font-size:13.5px;cursor:pointer;">Supprimer</button>`}
      </div>`}
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}
function vpCarouselNav(btn, dir) {
  const wrap = btn.closest(".vp-carousel");
  const track = wrap.querySelector(".vp-track");
  const slideW = track.clientWidth;
  const maxIdx = wrap.querySelectorAll(".vp-slide").length - 1;
  let idx = Math.round(track.scrollLeft / slideW) + dir;
  idx = Math.max(0, Math.min(maxIdx, idx));
  track.scrollTo({ left: idx * slideW, behavior: "smooth" });
  const dotsWrap = wrap.parentElement.querySelector(".vp-dots");
  if (dotsWrap) {
    dotsWrap.querySelectorAll("[data-dot]").forEach((d, i) => {
      d.style.background = i === idx ? "#FFFFFF" : "rgba(255,255,255,0.2)";
    });
  }
}

function ouvrirPhotoPleinEcran(imgEl) {
  const wrap = imgEl.closest(".vp-carousel");
  let photos = [];
  try { photos = JSON.parse(wrap.dataset.photos || "[]"); } catch (e) {}
  const startIdx = Number(imgEl.dataset.idx) || 0;
  if (!photos.length) return;

  const existing = document.getElementById("modal-photo-fullscreen");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "modal-photo-fullscreen";
  modal.dataset.idx = startIdx;
  modal.style.cssText = "position:fixed;inset:0;z-index:99999;background:#000;display:flex;align-items:center;justify-content:center;touch-action:none;";

  const navArrows = photos.length > 1 ? `
    <button type="button" onclick="vpFullscreenNav(-1)" aria-label="Photo précédente" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;border:none;background:rgba(255,255,255,0.12);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">‹</button>
    <button type="button" onclick="vpFullscreenNav(1)" aria-label="Photo suivante" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;border:none;background:rgba(255,255,255,0.12);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">›</button>` : "";

  const counter = photos.length > 1
    ? `<div id="vp-fs-counter" style="position:absolute;top:18px;left:50%;transform:translateX(-50%);color:#fff;font-size:13px;font-weight:600;background:rgba(255,255,255,0.12);padding:5px 14px;border-radius:20px;z-index:2;">${startIdx+1} / ${photos.length}</div>`
    : "";

  const thumbs = photos.length > 1 ? `
    <div id="vp-fs-thumbs" style="position:absolute;bottom:18px;left:0;right:0;display:flex;justify-content:center;gap:8px;padding:0 16px;overflow-x:auto;z-index:2;">
      ${photos.map((src, i) => `<img src="${escHtml(src)}" onclick="vpFullscreenGoTo(${i})" data-thumb="${i}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid ${i===startIdx?'#FFFFFF':'transparent'};opacity:${i===startIdx?'1':'.55'};flex-shrink:0;">`).join("")}
    </div>` : "";

  modal.innerHTML = `
    <button onclick="document.getElementById('modal-photo-fullscreen').remove()" aria-label="Fermer" style="position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,0.12);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:3;">✕</button>
    ${counter}
    <img id="vp-fs-img" src="${escHtml(photos[startIdx])}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;user-select:none;">
    ${navArrows}
    ${thumbs}`;

  modal.dataset.photosJson = JSON.stringify(photos);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.addEventListener("keydown", vpFullscreenKeyHandler);
  document.body.appendChild(modal);
}

function vpFullscreenKeyHandler(e) {
  const modal = document.getElementById("modal-photo-fullscreen");
  if (!modal) { document.removeEventListener("keydown", vpFullscreenKeyHandler); return; }
  if (e.key === "Escape") modal.remove();
  if (e.key === "ArrowLeft") vpFullscreenNav(-1);
  if (e.key === "ArrowRight") vpFullscreenNav(1);
}

function vpFullscreenNav(dir) {
  const modal = document.getElementById("modal-photo-fullscreen");
  if (!modal) return;
  const photos = JSON.parse(modal.dataset.photosJson || "[]");
  let idx = Number(modal.dataset.idx) + dir;
  idx = Math.max(0, Math.min(photos.length - 1, idx));
  vpFullscreenGoTo(idx);
}

function vpFullscreenGoTo(idx) {
  const modal = document.getElementById("modal-photo-fullscreen");
  if (!modal) return;
  const photos = JSON.parse(modal.dataset.photosJson || "[]");
  modal.dataset.idx = idx;
  document.getElementById("vp-fs-img").src = photos[idx];
  const counter = document.getElementById("vp-fs-counter");
  if (counter) counter.textContent = `${idx+1} / ${photos.length}`;
  document.querySelectorAll("#vp-fs-thumbs [data-thumb]").forEach((t, i) => {
    t.style.border = i === idx ? "2px solid #FFFFFF" : "2px solid transparent";
    t.style.opacity = i === idx ? "1" : ".55";
  });
}
function updateValidationBadge(count) {
  const badge = document.getElementById("badge-validation");
  if (badge) badge.textContent = count ?? 0;
}

async function refreshValidationBadgeCount() {
  try {
    const rows = await API.get(
      AURA_CONFIG.endpoints.produits_validation + "?statut=eq.en_attente&select=id"
    );
    updateValidationBadge(Array.isArray(rows) ? rows.length : 0);
  } catch (err) {
    console.error("Erreur badge validation :", err.message);
  }
}

async function refreshKycBadgeCount() {
  try {
    const rows = await API.get(
      AURA_CONFIG.endpoints.kyc_admin + "?statut=eq.en_attente&select=id"
    );
    const count = Array.isArray(rows) ? rows.length : 0;
    _kycCounts.en_attente = count;
    const sideEl = document.getElementById("badge-kyc");
    if (sideEl) {
      sideEl.textContent = count;
      sideEl.style.display = count > 0 ? "" : "none";
    }
  } catch (err) {
    console.error("Erreur badge KYC :", err.message);
  }
}

async function refreshBoostsBadgeCount() {
  try {
    const rows = await API.get(
      AURA_CONFIG.endpoints.boosts_admin + "?statut=eq.en_attente&select=id"
    );
    const count = Array.isArray(rows) ? rows.length : 0;
    const sideEl = document.getElementById("badge-boosts");
    if (sideEl) {
      sideEl.textContent = count;
      sideEl.style.display = count > 0 ? "" : "none";
    }
  } catch (err) {
    console.error("Erreur badge boosts :", err.message);
  }
}

async function refreshValidationCounts() {
  try {
    const [enAttente, valides, refuses] = await Promise.all([
      API.get(AURA_CONFIG.endpoints.produits_validation + "?statut=eq.en_attente&select=id"),
      API.get(AURA_CONFIG.endpoints.produits_validation + "?statut=eq.valide&select=id"),
      API.get(AURA_CONFIG.endpoints.produits_validation + "?statut=eq.refuse&select=id")
    ]);
    _validationCounts.en_attente = enAttente?.length ?? 0;
    _validationCounts.valide = valides?.length ?? 0;
    _validationCounts.refuse = refuses?.length ?? 0;
    renderValidationFilterDropdown();
  } catch (err) {
    console.error("Erreur compteurs validation :", err.message);
  }
}
// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadDashboardData();
  if (window.AURA_PUSH) AURA_PUSH.init().catch(() => {});
  refreshValidationBadgeCount();
  refreshKycBadgeCount();
  refreshBoostsBadgeCount();
  refreshSignalementsBadgeCount();

  const view = new URLSearchParams(window.location.search).get("view");
  if (!view || !VIEWS[view]) return;

  const navItem = document.querySelector(`.nav-link[onclick*="'${view}'"]`);
  if (navItem) switchTab(navItem, view);
});
// ─── Modal universel de confirmation ──────────────────────────────────────────
function appConfirm(message, { title = "Confirmation", okLabel = "OK", danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById("confirmOverlay");
    const titleEl = document.getElementById("confirmTitle");
    const msgEl = document.getElementById("confirmMsg");
    const okBtn = document.getElementById("confirmOkBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");
    if (!overlay) { resolve(window.confirm(message)); return; }

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = okLabel;
    okBtn.classList.toggle("confirm-btn-danger", danger);
    overlay.classList.add("open");

    const cleanup = (result) => {
      overlay.classList.remove("open");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlay = (e) => { if (e.target === overlay) cleanup(false); };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
  });
}

async function supprimerProduitValidation(id, rowEl) {
  const ok = await appConfirm("Cette action supprimera définitivement le produit. Continuer ?", {
    title: "Supprimer le produit", okLabel: "Supprimer", danger: true
  });
  if (!ok) return;

  try {
    await API.delete(AURA_CONFIG.endpoints.produits + "?id=eq." + id);
    logActivite("suppression", "produit", id, "Produit supprimé (file de validation)");
    if (rowEl) {
      rowEl.style.opacity = "0.3";
      rowEl.style.transition = "opacity .3s";
      setTimeout(() => {
        rowEl.remove();
        refreshValidationCounts();
      }, 320);
    }
    showToast("Produit supprimé", "success");
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}
function appPrompt(message, { title = "Confirmation", okLabel = "OK", placeholder = "" } = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById("promptOverlay");
    const titleEl = document.getElementById("promptTitle");
    const msgEl = document.getElementById("promptMsg");
    const inputEl = document.getElementById("promptInput");
    const okBtn = document.getElementById("promptOkBtn");
    const cancelBtn = document.getElementById("promptCancelBtn");
    if (!overlay) { resolve(window.prompt(message)); return; }

    titleEl.textContent = title;
    msgEl.textContent = message;
    inputEl.value = "";
    inputEl.placeholder = placeholder;
    okBtn.textContent = okLabel;
    overlay.classList.add("open");
    setTimeout(() => inputEl.focus(), 50);

    const cleanup = (result) => {
      overlay.classList.remove("open");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      inputEl.removeEventListener("keydown", onKeydown);
      resolve(result);
    };
    const onOk = () => cleanup(inputEl.value);
    const onCancel = () => cleanup(null);
    const onOverlay = (e) => { if (e.target === overlay) cleanup(null); };
    const onKeydown = (e) => { if (e.key === "Enter") onOk(); if (e.key === "Escape") onCancel(); };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
    inputEl.addEventListener("keydown", onKeydown);
  });
}
// ─── Catalogue produits validés ────────────────────────────────────────────────
async function loadProduitsCatalogue() {
  const tbody = document.getElementById("produitsCatalogueBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">Chargement…</td></tr>`;

  try {
    const rows = await API.get(
      "/rest/v_admin_produits_catalogue?order=created_at.desc&select=id,nom,prix,image_url,photos,images,description,categorie,stock,created_at,actif,mis_en_avant,nom_boutique,details,boost_expire_at"
    );

    _produitsCatalogue = rows || [];
    remplirFiltreVendeurs(_produitsCatalogue);
    filtrerProduitsCatalogue();

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--danger);">Erreur : ${escHtml(err.message)}</td></tr>`;
  }
}

let _produitsCatalogue = [];

// ─── SIGNALEMENTS ─────────────────────────────────────────────────────────────
let _signalementsData = [];
let _signalementsStatut = "toutes";
let _signalementsSearch = "";

const SIGNALEMENT_MOTIF_LABELS = {
  contrefacon:      "Produit contrefait",
  non_conforme:     "Non conforme",
  arnaque:          "Arnaque / fraude",
  contenu_choquant: "Contenu choquant",
  prix_trompeur:    "Prix trompeur",
  autre:            "Autre"
};

const SIGNALEMENT_STATUT_LABELS = {
  nouveau:  "Nouveau",
  en_cours: "En cours",
  traite:   "Traité",
  ignore:   "Ignoré"
};

async function loadSignalements(statut) {
  _signalementsStatut = statut || "toutes";
  const tbody = document.getElementById("signalementsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Chargement…</td></tr>`;

  try {
    const filtreStatut = _signalementsStatut === "toutes" ? "" : "?statut=eq." + _signalementsStatut;
    const jonction = filtreStatut ? "&" : "?";
    const rows = await API.get(
      AURA_CONFIG.endpoints.signalements_admin + filtreStatut + jonction + "order=created_at.desc"
    );
    _signalementsData = rows || [];
    updateSignalementsBadge();
    _renderSignalementsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--danger);">Erreur : ${escHtml(err.message)}</td></tr>`;
  }
}

function updateSignalementsBadge() {
  const badge = document.getElementById("badge-signalements");
  if (!badge) return;
  const nouveaux = _signalementsData.filter(s => s.statut === "nouveau" || s.statut === "en_cours").length;
  badge.textContent = nouveaux;
  badge.style.display = nouveaux > 0 ? "" : "none";
}

async function refreshSignalementsBadgeCount() {
  try {
    const rows = await API.get(AURA_CONFIG.endpoints.signalements_admin + "?statut=in.(nouveau,en_cours)&select=id");
    const count = Array.isArray(rows) ? rows.length : 0;
    const badge = document.getElementById("badge-signalements");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "" : "none";
    }
  } catch (err) {
    console.error("Erreur badge signalements :", err.message);
  }
}

function filtrerSignalementsRecherche() {
  _signalementsSearch = (document.getElementById("signalementsSearchInput")?.value || "").toLowerCase().trim();
  _renderSignalementsTable();
}

function _renderSignalementsTable() {
  const tbody = document.getElementById("signalementsBody");
  if (!tbody) return;

  let rows = _signalementsData;
  if (_signalementsSearch) {
    rows = rows.filter(s =>
      (s.produit_nom || "").toLowerCase().includes(_signalementsSearch) ||
      (s.nom_boutique || "").toLowerCase().includes(_signalementsSearch)
    );
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Aucun signalement.</td></tr>`;
    return;
  }

  const graviteColor = { haute: "var(--danger)", moyenne: "#F5A623", a_revoir: "var(--text-muted)" };
  const graviteLabel = { haute: "Urgent", moyenne: "Moyenne", a_revoir: "À revoir" };

  tbody.innerHTML = rows.map(s => `
    <tr data-id="${s.id}">
      <td>
        <div style="font-weight:700;">${escHtml(s.produit_nom || "Produit supprimé")}</div>
        <div style="font-size:12px;color:var(--text-muted);">${escHtml(s.nom_boutique || "—")} · ${s.signalements_count > 1 ? s.signalements_count + " signalements" : "1 signalement"}</div>
      </td>
      <td>
        <div style="font-weight:600;">${SIGNALEMENT_MOTIF_LABELS[s.motif] || escHtml(s.motif)}</div>
        ${s.description ? `<div style="font-size:12px;color:var(--text-muted);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(s.description)}</div>` : ""}
      </td>
      <td><span style="color:${graviteColor[s.gravite] || "var(--text-muted)"};font-weight:700;font-size:12.5px;">${graviteLabel[s.gravite] || s.gravite}</span></td>
      <td><span class="status-badge ${s.statut === "traite" ? "badge-active" : s.statut === "ignore" ? "badge-neutral" : "badge-pending"}">${SIGNALEMENT_STATUT_LABELS[s.statut] || s.statut}</span></td>
      <td>
        <div style="display:flex;gap:6px;">
          <button title="Voir le produit" class="cl-action-btn" onclick="voirProduitSignale('${s.produit_id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          ${(s.statut === "nouveau" || s.statut === "en_cours") ? `
          <button title="Marquer comme traité" class="cl-action-btn" onclick="traiterSignalement('${s.id}','traite')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
          <button title="Ignorer" class="cl-action-btn" onclick="traiterSignalement('${s.id}','ignore')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <button title="Suspendre le produit" class="cl-action-btn" style="color:var(--danger);" onclick="suspendreProduitSignale('${s.produit_id}','${s.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </button>` : ""}
        </div>
      </td>
    </tr>`).join("");
}

function voirProduitSignale(produitId) {
  if (!produitId) { showToast("Produit introuvable (peut-être supprimé)", "error"); return; }
  window.open(`https://auramarketci.com/assets/vue-produit/produit.html?id=${produitId}`, "_blank");
}

async function traiterSignalement(id, decision) {
  const label = decision === "traite" ? "marquer ce signalement comme traité" : "ignorer ce signalement";
  const ok = await appConfirm(`Confirmer : ${label} ?`, { title: "Signalement", okLabel: "Confirmer" });
  if (!ok) return;

  try {
    await API.patch(AURA_CONFIG.endpoints.signalements_admin.replace("v_admin_signalements", "signalements") + "?id=eq." + id, {
      statut: decision,
      traite_le: new Date().toISOString()
    });
    showToast(decision === "traite" ? "Signalement marqué comme traité" : "Signalement ignoré", "success");
    logActivite("modification", "signalement", id, decision === "traite" ? "Signalement traité" : "Signalement ignoré");
    loadSignalements(_signalementsStatut);
  } catch (err) {
    showToast(err.message || "Erreur", "error");
  }
}

async function suspendreProduitSignale(produitId, signalementId) {
  if (!produitId) { showToast("Produit introuvable", "error"); return; }
  const ok = await appConfirm("Suspendre ce produit ? Il ne sera plus visible sur la plateforme.", { title: "Suspendre le produit", okLabel: "Suspendre", danger: true });
  if (!ok) return;

  try {
    await API.patch(AURA_CONFIG.endpoints.produits + "?id=eq." + produitId, { actif: false, statut: "refuse", motif_refus: "Suspendu suite à signalement" });
    await API.patch(AURA_CONFIG.endpoints.signalements_admin.replace("v_admin_signalements", "signalements") + "?id=eq." + signalementId, {
      statut: "traite",
      traite_le: new Date().toISOString()
    });
    showToast("Produit suspendu", "success");
    logActivite("modification", "produit", produitId, "Produit suspendu suite à signalement");
    loadSignalements(_signalementsStatut);
  } catch (err) {
    showToast(err.message || "Erreur", "error");
  }
}

function renderSignalementsFilterDropdown() {
  const dropdown = document.getElementById("signalementsFilterDropdown");
  if (!dropdown) return;
  const statuts = [
    { v: "toutes", label: "Tous" },
    { v: "nouveau", label: "Nouveaux" },
    { v: "en_cours", label: "En cours" },
    { v: "traite", label: "Traités" },
    { v: "ignore", label: "Ignorés" }
  ];
  dropdown.innerHTML = `
    <div class="prod-filter-section-label">Statut</div>
    ${statuts.map(s =>
      `<div class="prod-filter-item${_signalementsStatut === s.v ? " selected" : ""}" onclick="selectSignalementsStatutFiltre('${s.v}')">${s.label}</div>`
    ).join("")}
  `;
  const dot = document.getElementById("signalementsFilterDot");
  if (dot) dot.style.display = _signalementsStatut !== "toutes" ? "block" : "none";
}

function selectSignalementsStatutFiltre(statut) {
  document.getElementById("signalementsFilterDropdown")?.classList.remove("open");
  document.getElementById("signalementsFilterBtn")?.classList.remove("active");
  loadSignalements(statut);
  renderSignalementsFilterDropdown();
}

function toggleSignalementsFilterDropdown() {
  const dropdown = document.getElementById("signalementsFilterDropdown");
  const btn = document.getElementById("signalementsFilterBtn");
  if (!dropdown) return;
  renderSignalementsFilterDropdown();
  const willOpen = !dropdown.classList.contains("open");
  dropdown.classList.toggle("open", willOpen);
  btn.classList.toggle("active", willOpen);
  if (willOpen) {
    setTimeout(() => document.addEventListener("click", _closeSignalementsFilterDropdownOnClickOutside), 0);
  }
}

function _closeSignalementsFilterDropdownOnClickOutside(e) {
  const wrap = document.querySelector("#view-signalements .prod-filter-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("signalementsFilterDropdown")?.classList.remove("open");
    document.getElementById("signalementsFilterBtn")?.classList.remove("active");
    document.removeEventListener("click", _closeSignalementsFilterDropdownOnClickOutside);
  }
}



let _vendeurFiltreActif = "";
let _statutFiltreActif  = "toutes";   // "toutes" | "actif" | "inactif"
let _boostFiltreActif   = "toutes";   // "toutes" | "sponsorise" | "non_sponsorise"
let _vedetteFiltreActif = "toutes";   // "toutes" | "recommande" | "non_recommande"
let _stockFiltreActif   = "toutes";   // "toutes" | "en_stock" | "rupture"
let _triActif           = "recent";   // "recent" | "prix_asc" | "prix_desc"

const PROD_STATUT_LABELS  = { toutes: "Tous les statuts", actif: "Actif", inactif: "Masqué" };
const PROD_BOOST_LABELS   = { toutes: "Tous", sponsorise: "Sponsorisé", non_sponsorise: "Non sponsorisé" };
const PROD_VEDETTE_LABELS = { toutes: "Tous", recommande: "Recommandé", non_recommande: "Non recommandé" };
const PROD_STOCK_LABELS   = { toutes: "Tous", en_stock: "En stock", rupture: "Rupture de stock" };
const PROD_TRI_LABELS     = { recent: "Plus récents", prix_asc: "Prix croissant", prix_desc: "Prix décroissant" };

function remplirFiltreVendeurs(rows) {
  const dropdown = document.getElementById("produitsVendeurDropdown");
  if (!dropdown) return;
  const boutiques = [...new Set(rows.map(p => p.nom_boutique).filter(Boolean))].sort();

  const sectionBoutique = [`<div class="prod-filter-section-label">Boutique</div>`,
    `<div class="prod-filter-item${!_vendeurFiltreActif ? " selected" : ""}" onclick="selectVendeurFiltre('')">Toutes les boutiques</div>`
  ].concat(boutiques.map(b =>
    `<div class="prod-filter-item${_vendeurFiltreActif === b ? " selected" : ""}" onclick="selectVendeurFiltre('${escHtml(b)}')">${escHtml(b)}</div>`
  )).join("");

  const sectionStatut = `<div class="prod-filter-divider"></div><div class="prod-filter-section-label">Statut</div>` +
    Object.keys(PROD_STATUT_LABELS).map(k =>
      `<div class="prod-filter-item${_statutFiltreActif === k ? " selected" : ""}" onclick="selectStatutFiltre('${k}')">${PROD_STATUT_LABELS[k]}</div>`
    ).join("");

  const sectionBoost = `<div class="prod-filter-divider"></div><div class="prod-filter-section-label">Sponsoring</div>` +
    Object.keys(PROD_BOOST_LABELS).map(k =>
      `<div class="prod-filter-item${_boostFiltreActif === k ? " selected" : ""}" onclick="selectBoostFiltre('${k}')">${PROD_BOOST_LABELS[k]}</div>`
    ).join("");

  const sectionVedette = `<div class="prod-filter-divider"></div><div class="prod-filter-section-label">Mise en avant</div>` +
    Object.keys(PROD_VEDETTE_LABELS).map(k =>
      `<div class="prod-filter-item${_vedetteFiltreActif === k ? " selected" : ""}" onclick="selectVedetteFiltre('${k}')">${PROD_VEDETTE_LABELS[k]}</div>`
    ).join("");

  const sectionStock = `<div class="prod-filter-divider"></div><div class="prod-filter-section-label">Stock</div>` +
    Object.keys(PROD_STOCK_LABELS).map(k =>
      `<div class="prod-filter-item${_stockFiltreActif === k ? " selected" : ""}" onclick="selectStockFiltre('${k}')">${PROD_STOCK_LABELS[k]}</div>`
    ).join("");

  const sectionTri = `<div class="prod-filter-divider"></div><div class="prod-filter-section-label">Trier par</div>` +
    Object.keys(PROD_TRI_LABELS).map(k =>
      `<div class="prod-filter-item${_triActif === k ? " selected" : ""}" onclick="selectTriFiltre('${k}')">${PROD_TRI_LABELS[k]}</div>`
    ).join("");

  dropdown.innerHTML = sectionBoutique + sectionStatut + sectionBoost + sectionVedette + sectionStock + sectionTri;
}

function _maj_produitsFilterDot() {
  const actif = _vendeurFiltreActif || _statutFiltreActif !== "toutes" || _boostFiltreActif !== "toutes"
    || _vedetteFiltreActif !== "toutes" || _stockFiltreActif !== "toutes" || _triActif !== "recent";
  const dot = document.getElementById("produitsFilterDot");
  if (dot) dot.style.display = actif ? "block" : "none";
}

function selectStatutFiltre(v)  { _statutFiltreActif = v;  remplirFiltreVendeurs(_produitsCatalogue); _maj_produitsFilterDot(); filtrerProduitsCatalogue(); }
function selectBoostFiltre(v)   { _boostFiltreActif = v;   remplirFiltreVendeurs(_produitsCatalogue); _maj_produitsFilterDot(); filtrerProduitsCatalogue(); }
function selectVedetteFiltre(v) { _vedetteFiltreActif = v; remplirFiltreVendeurs(_produitsCatalogue); _maj_produitsFilterDot(); filtrerProduitsCatalogue(); }
function selectStockFiltre(v)   { _stockFiltreActif = v;   remplirFiltreVendeurs(_produitsCatalogue); _maj_produitsFilterDot(); filtrerProduitsCatalogue(); }
function selectTriFiltre(v)     { _triActif = v;           remplirFiltreVendeurs(_produitsCatalogue); _maj_produitsFilterDot(); filtrerProduitsCatalogue(); }

// ─── VALIDATION PRODUITS : filtre statut en dropdown icône ──────────────────
let _validationSearch = "";

function filtrerValidationRecherche() {
  _validationSearch = (document.getElementById("validationSearchInput")?.value || "").toLowerCase().trim();
  const rows = document.querySelectorAll("#validationBody tr[data-id]");
  rows.forEach(tr => {
    const nom = (tr.getAttribute("data-nom") || "").toLowerCase();
    const boutique = (tr.getAttribute("data-boutique") || "").toLowerCase();
    const match = !_validationSearch || nom.includes(_validationSearch) || boutique.includes(_validationSearch);
    tr.style.display = match ? "" : "none";
  });
}

let _validationCounts = { en_attente: 0, valide: 0, refuse: 0 };

function renderValidationFilterDropdown() {
  const dropdown = document.getElementById("validationFilterDropdown");
  if (!dropdown) return;
  const total = _validationCounts.en_attente + _validationCounts.valide;
  const statuts = [
    { v: "toutes", label: "Tous", count: total },
    { v: "en_attente", label: "En attente", count: _validationCounts.en_attente },
    { v: "valide", label: "Validés", count: _validationCounts.valide },
    { v: "refuse", label: "Refusés", count: _validationCounts.refuse }
  ];
  dropdown.innerHTML = `
    <div class="prod-filter-section-label">Statut</div>
    ${statuts.map(s =>
      `<div class="prod-filter-item${_validationStatut === s.v ? " selected" : ""}" onclick="selectValidationStatutFiltre('${s.v}')">${s.label} (${s.count})</div>`
    ).join("")}
  `;
  const dot = document.getElementById("validationFilterDot");
  if (dot) dot.style.display = _validationStatut !== "toutes" ? "block" : "none";
}

function selectValidationStatutFiltre(statut) {
  document.getElementById("validationFilterDropdown")?.classList.remove("open");
  document.getElementById("validationFilterBtn")?.classList.remove("active");
  filtrerValidation(statut, null);
  renderValidationFilterDropdown();
}

function toggleValidationFilterDropdown() {
  const dropdown = document.getElementById("validationFilterDropdown");
  const btn = document.getElementById("validationFilterBtn");
  if (!dropdown) return;
  renderValidationFilterDropdown();
  const willOpen = !dropdown.classList.contains("open");
  dropdown.classList.toggle("open", willOpen);
  btn.classList.toggle("active", willOpen);
  if (willOpen) {
    setTimeout(() => document.addEventListener("click", closeValidationFilterDropdownOnClickOutside), 0);
  }
}

function closeValidationFilterDropdownOnClickOutside(e) {
  const wrap = document.querySelector("#view-validation .prod-filter-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("validationFilterDropdown")?.classList.remove("open");
    document.getElementById("validationFilterBtn")?.classList.remove("active");
    document.removeEventListener("click", closeValidationFilterDropdownOnClickOutside);
  }
}

// ─── KYC : filtre statut en dropdown icône ───────────────────────────────────
function renderKycFilterDropdown() {
  const dropdown = document.getElementById("kycFilterDropdown");
  if (!dropdown) return;
  const total = _kycCounts.en_attente + _kycCounts.valide + _kycCounts.rejete;
  const statuts = [
    { v: "toutes", label: "Tous", count: total },
    { v: "en_attente", label: "En attente", count: _kycCounts.en_attente },
    { v: "valide", label: "Validées", count: _kycCounts.valide },
    { v: "rejete", label: "Rejetées", count: _kycCounts.rejete }
  ];
  dropdown.innerHTML = `
    <div class="prod-filter-section-label">Statut</div>
    ${statuts.map(s =>
      `<div class="prod-filter-item${_kycStatut === s.v ? " selected" : ""}" onclick="selectKycStatutFiltre('${s.v}')">${s.label} (${s.count})</div>`
    ).join("")}
  `;
  const dot = document.getElementById("kycFilterDot");
  if (dot) dot.style.display = _kycStatut !== "toutes" ? "block" : "none";
}

function selectKycStatutFiltre(statut) {
  document.getElementById("kycFilterDropdown")?.classList.remove("open");
  document.getElementById("kycFilterBtn")?.classList.remove("active");
  loadKyc(statut, null);
  renderKycFilterDropdown();
}

function toggleKycFilterDropdown() {
  const dropdown = document.getElementById("kycFilterDropdown");
  const btn = document.getElementById("kycFilterBtn");
  if (!dropdown) return;
  renderKycFilterDropdown();
  const willOpen = !dropdown.classList.contains("open");
  dropdown.classList.toggle("open", willOpen);
  btn.classList.toggle("active", willOpen);
  if (willOpen) {
    setTimeout(() => document.addEventListener("click", closeKycFilterDropdownOnClickOutside), 0);
  }
}

function closeKycFilterDropdownOnClickOutside(e) {
  const wrap = document.querySelector("#view-kyc .prod-filter-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("kycFilterDropdown")?.classList.remove("open");
    document.getElementById("kycFilterBtn")?.classList.remove("active");
    document.removeEventListener("click", closeKycFilterDropdownOnClickOutside);
  }
}

// ─── LOGS : filtre action en dropdown icône ──────────────────────────────────
const LOGS_FILTRE_LABELS = {
  "": "Tout",
  "connexion": "Connexions",
  "deconnexion": "Déconnexions",
  "creation": "Créations",
  "modification": "Modifications",
  "suppression": "Suppressions"
};

function renderLogsFilterDropdown() {
  const dropdown = document.getElementById("logsFilterDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = Object.keys(LOGS_FILTRE_LABELS).map(action =>
    `<div class="prod-filter-item${_logsActionFiltre === action ? " selected" : ""}" onclick="selectLogsStatutFiltre('${action}')">${LOGS_FILTRE_LABELS[action]}</div>`
  ).join("");
  const dot = document.getElementById("logsFilterDot");
  if (dot) dot.style.display = _logsActionFiltre ? "block" : "none";
}

function selectLogsStatutFiltre(action) {
  document.getElementById("logsFilterDropdown")?.classList.remove("open");
  document.getElementById("logsFilterBtn")?.classList.remove("active");
  _logsActionFiltre = action;
  loadLogs(true);
  renderLogsFilterDropdown();
}

function toggleLogsFilterDropdown() {
  const dropdown = document.getElementById("logsFilterDropdown");
  const btn = document.getElementById("logsFilterBtn");
  if (!dropdown) return;
  renderLogsFilterDropdown();
  const willOpen = !dropdown.classList.contains("open");
  dropdown.classList.toggle("open", willOpen);
  btn.classList.toggle("active", willOpen);
  if (willOpen) {
    setTimeout(() => document.addEventListener("click", closeLogsFilterDropdownOnClickOutside), 0);
  }
}

function closeLogsFilterDropdownOnClickOutside(e) {
  const wrap = document.querySelector("#view-logs .prod-filter-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("logsFilterDropdown")?.classList.remove("open");
    document.getElementById("logsFilterBtn")?.classList.remove("active");
    document.removeEventListener("click", closeLogsFilterDropdownOnClickOutside);
  }
}

function toggleVendeurDropdown() {
  const dropdown = document.getElementById("produitsVendeurDropdown");
  const btn = document.getElementById("produitsFilterBtn");
  if (!dropdown) return;
  const willOpen = !dropdown.classList.contains("open");
  dropdown.classList.toggle("open", willOpen);
  btn.classList.toggle("active", willOpen);
  if (willOpen) {
    setTimeout(() => document.addEventListener("click", closeVendeurDropdownOnClickOutside), 0);
  }
}

function closeVendeurDropdownOnClickOutside(e) {
  const wrap = document.querySelector(".prod-filter-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("produitsVendeurDropdown")?.classList.remove("open");
    document.getElementById("produitsFilterBtn")?.classList.remove("active");
    document.removeEventListener("click", closeVendeurDropdownOnClickOutside);
  }
}

function selectVendeurFiltre(boutique) {
  _vendeurFiltreActif = boutique;
  document.getElementById("produitsVendeurDropdown")?.classList.remove("open");
  document.getElementById("produitsFilterBtn")?.classList.remove("active");
  remplirFiltreVendeurs(_produitsCatalogue);
  _maj_produitsFilterDot();
  filtrerProduitsCatalogue();
}

function filtrerProduitsCatalogue() {
  const q = (document.getElementById("produitsSearchInput")?.value || "").toLowerCase().trim();
  const now = new Date();

  let filtered = _produitsCatalogue.filter(p => {
    const matchRecherche = !q
      || (p.nom || "").toLowerCase().includes(q)
      || (p.nom_boutique || "").toLowerCase().includes(q);
    const matchVendeur = !_vendeurFiltreActif || p.nom_boutique === _vendeurFiltreActif;

    const estActif = !!p.actif;
    const matchStatut = _statutFiltreActif === "toutes"
      || (_statutFiltreActif === "actif" && estActif)
      || (_statutFiltreActif === "inactif" && !estActif);

    const estSponsorise = p.boost_expire_at && new Date(p.boost_expire_at) > now;
    const matchBoost = _boostFiltreActif === "toutes"
      || (_boostFiltreActif === "sponsorise" && estSponsorise)
      || (_boostFiltreActif === "non_sponsorise" && !estSponsorise);

    const matchVedette = _vedetteFiltreActif === "toutes"
      || (_vedetteFiltreActif === "recommande" && !!p.mis_en_avant)
      || (_vedetteFiltreActif === "non_recommande" && !p.mis_en_avant);

    const enStock = (Number(p.stock) || 0) > 0;
    const matchStock = _stockFiltreActif === "toutes"
      || (_stockFiltreActif === "en_stock" && enStock)
      || (_stockFiltreActif === "rupture" && !enStock);

    return matchRecherche && matchVendeur && matchStatut && matchBoost && matchVedette && matchStock;
  });

  if (_triActif === "prix_asc")  filtered = [...filtered].sort((a, b) => (Number(a.prix) || 0) - (Number(b.prix) || 0));
  if (_triActif === "prix_desc") filtered = [...filtered].sort((a, b) => (Number(b.prix) || 0) - (Number(a.prix) || 0));

  renderProduitsCatalogue(filtered);
}
function renderProduitsCatalogue(rows) {
  const tbody = document.getElementById("produitsCatalogueBody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">Aucun produit trouvé.</td></tr>`;
    return;
  }

  const btnV = "display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:transparent;cursor:pointer;flex-shrink:0;transition:background .12s,color .12s,border-color .12s;";
  tbody.innerHTML = rows.map((p, i) => {
    const photoSrc = p.image_url || (Array.isArray(p.photos) && p.photos[0]) || (Array.isArray(p.images) && p.images[0]) || "";
    const photoHtml = photoSrc
      ? `<img src="${escHtml(photoSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;">📦</div>`;
    const allPhotos = JSON.stringify(Array.isArray(p.photos) && p.photos.length ? p.photos : (p.image_url ? [p.image_url] : []));
    return `<tr data-id="${p.id}"
        data-nom="${escHtml(p.nom||'')}"
        data-prix="${p.prix||0}"
        data-boutique="${escHtml(p.nom_boutique||'')}"
        data-desc="${escHtml(p.description||'')}"
        data-cat="${escHtml(p.categorie||'')}"
        data-stock="${p.stock||0}"
        data-date="${p.created_at||''}"
        data-photos="${escHtml(allPhotos)}"
        data-details="${escHtml(JSON.stringify(p.details || {}))}"
        data-actif="${p.actif}" data-vedette="${p.mis_en_avant}" data-boost="${p.boost_expire_at || ''}" style="border-bottom:1px solid var(--border,#2a2a3e);">
      <td style="padding:6px 4px 6px 10px;font-size:12px;color:var(--text-muted);">${i + 1}</td>
      <td style="padding:6px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:36px;height:36px;border-radius:7px;overflow:hidden;background:var(--bg);border:1px solid var(--border);flex-shrink:0;">${photoHtml}</div>
          <div style="min-width:0;">
            <div style="font-size:12px;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${escHtml(p.nom)}</div>
            <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${p.nom_boutique ? escHtml(p.nom_boutique) : "—"}</div>
          </div>
        </div>
      </td>
      <td style="padding:6px;font-size:12px;font-weight:700;white-space:nowrap;">${formatCFA(p.prix)}</td>
      <td style="padding:6px;">
        <div style="display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:nowrap;">
          <button title="Voir" onclick="voirProduitCatalogue('${p.id}')" class="cl-action-btn"
            style="${btnV}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button title="${p.mis_en_avant ? "Retirer des recommandés" : "Recommander"}" onclick="toggleVedetteProduit('${p.id}',this.closest('tr'))" class="cl-action-btn"
            style="${btnV}color:${p.mis_en_avant ? "#F59E0B" : "var(--text-muted)"};${p.mis_en_avant ? "border-color:#F59E0B;" : ""}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="${p.mis_en_avant ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button title="${(p.boost_expire_at && new Date(p.boost_expire_at) > new Date()) ? "Gérer le sponsoring" : "Sponsoriser"}" onclick="ouvrirGestionSponsoring('${p.id}',this.closest('tr'))" class="cl-action-btn"
            style="${btnV}color:${(p.boost_expire_at && new Date(p.boost_expire_at) > new Date()) ? "#8B5CF6" : "var(--text-muted)"};${(p.boost_expire_at && new Date(p.boost_expire_at) > new Date()) ? "border-color:#8B5CF6;" : ""}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="${(p.boost_expire_at && new Date(p.boost_expire_at) > new Date()) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </button>
          <button title="${p.actif ? "Masquer" : "Démasquer"}" onclick="toggleActifProduit('${p.id}',this.closest('tr'))" class="cl-action-btn"
            style="${btnV}color:${p.actif ? "#10B981" : "#F59E0B"};border-color:${p.actif ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.4)"};">
            ${p.actif
              ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>`
              : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="7" y1="17" x2="17" y2="7"/></svg>`}
          </button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

async function toggleVedetteProduit(id, rowEl) {
  const current = rowEl?.dataset.vedette === "true";
  try {
    await API.patch(AURA_CONFIG.endpoints.produits + "?id=eq." + id, { mis_en_avant: !current });
    showToast(!current ? "Produit recommandé" : "Retiré des recommandés", "success");
    loadProduitsCatalogue();
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

// ─── Gestion manuelle du sponsoring (boost) d'un produit depuis le catalogue ──
function _joursRestants(dateStr) {
  if (!dateStr) return 0;
  const diffMs = new Date(dateStr) - new Date();
  return Math.max(0, Math.ceil(diffMs / 86400000));
}

function ouvrirGestionSponsoring(id, rowEl) {
  const p = _produitsCatalogue.find(x => x.id === id);
  if (!p) return;

  const boostExpireAt = rowEl?.dataset.boost || p.boost_expire_at || "";
  const estActif = boostExpireAt && new Date(boostExpireAt) > new Date();
  const jours = _joursRestants(boostExpireAt);

  document.getElementById("modal-sponsoring")?.remove();

  const statutBloc = estActif ? `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:10px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.35);margin-bottom:16px;">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#8B5CF6;margin-bottom:3px;">● Sponsorisé actuellement</div>
        <div style="font-size:12.5px;color:var(--text-muted);">Expire le ${escHtml(new Date(boostExpireAt).toLocaleDateString("fr-FR"))}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:20px;font-weight:800;color:var(--text);">${jours}</div>
        <div style="font-size:10.5px;color:var(--text-muted);">jour${jours > 1 ? "s" : ""} restant${jours > 1 ? "s" : ""}</div>
      </div>
    </div>` : `
    <div style="padding:12px 14px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);margin-bottom:16px;text-align:center;font-size:12.5px;color:var(--text-muted);">
      Ce produit n'est pas sponsorisé actuellement
    </div>`;

  const modal = document.createElement("div");
  modal.id = "modal-sponsoring";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;padding:0;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:16px 16px 0 0;padding:20px 20px 32px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 -8px 32px rgba(0,0,0,.5);">
      <div style="width:36px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 16px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">Sponsoring produit</span>
        <button onclick="this.closest('#modal-sponsoring').remove()" style="background:none;border:1px solid var(--border);color:var(--text-muted);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      <div style="font-weight:700;font-size:16px;margin-bottom:2px;color:var(--text);">${escHtml(p.nom)}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">${escHtml(p.nom_boutique || "—")}</div>
      ${statutBloc}
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button onclick="_sponsoringPrompt('${id}', ${estActif})"
          style="width:100%;padding:12px;border-radius:9px;border:none;background:#8B5CF6;color:#fff;font-weight:700;font-size:13.5px;cursor:pointer;">
          ${estActif ? "Renouveler / prolonger" : "Sponsoriser ce produit"}
        </button>
        ${estActif ? `
        <button onclick="_annulerSponsoring('${id}')"
          style="width:100%;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:#E0276F;font-weight:600;font-size:13.5px;cursor:pointer;">
          Annuler le sponsoring
        </button>` : ""}
      </div>
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function _sponsoringPrompt(id, estActif) {
  const saisie = await appPrompt(
    estActif ? "Prolonger de combien de jours à partir d'aujourd'hui ?" : "Sponsoriser pour combien de jours ?",
    { title: "Sponsoring produit", okLabel: "Continuer", placeholder: "7" }
  );
  if (saisie === null) return;

  const jours = Math.max(1, parseInt(saisie, 10) || 7);

  const ok = await appConfirm(
    `Confirmer le sponsoring de ce produit pendant ${jours} jour${jours > 1 ? "s" : ""} ?`,
    { title: "Sponsoring produit", okLabel: "Confirmer" }
  );
  if (!ok) return;

  const fin = new Date();
  fin.setDate(fin.getDate() + jours);

  try {
    await API.patch(AURA_CONFIG.endpoints.produits + "?id=eq." + id, {
      boost_expire_at: fin.toISOString()
    });
    showToast("Produit sponsorisé avec succès.", "success");
    document.getElementById("modal-sponsoring")?.remove();
    await loadProduitsCatalogue();
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

async function _annulerSponsoring(id) {
  const ok = await appConfirm(
    "Annuler le sponsoring de ce produit ? Le badge « Sponsorisé » disparaîtra immédiatement.",
    { title: "Annuler le sponsoring", okLabel: "Annuler le sponsoring" }
  );
  if (!ok) return;

  try {
    await API.patch(AURA_CONFIG.endpoints.produits + "?id=eq." + id, {
      boost_expire_at: null
    });
    showToast("Sponsoring annulé.", "success");
    document.getElementById("modal-sponsoring")?.remove();
    await loadProduitsCatalogue();
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

async function toggleActifProduit(id, rowEl) {
  const current = rowEl?.dataset.actif === "true";
  const ok = await appConfirm(
    current ? "Masquer ce produit aux clients ?" : "Rendre ce produit visible aux clients ?",
    { title: current ? "Masquer le produit" : "Démasquer le produit", okLabel: current ? "Masquer" : "Démasquer" }
  );
  if (!ok) return;
  try {
    await API.patch(AURA_CONFIG.endpoints.produits + "?id=eq." + id, { actif: !current });
    showToast(current ? "Produit masqué" : "Produit visible", "success");
    loadProduitsCatalogue();
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

// ─── Commandes (vue admin globale) ───────────────────────────────────────────
let _commandesLignes = [];   // lignes brutes venant de la vue SQL
let _commandesGroupees = []; // regroupées par numero
let _commandeStatutFiltre = "toutes";
let _commandeBoutiqueFiltre = "";

const STATUT_COMMANDE_LABELS = {
  en_attente: "En attente",
  confirmee:  "Confirmée",
  livree:     "Livrée",
  annulee:    "Annulée"
};
const STATUT_COMMANDE_BADGE = {
  en_attente: "badge-pending",
  confirmee:  "badge-transit",
  livree:     "badge-active",
  annulee:    "badge-danger"
};
// Priorité pour déduire le statut global d'une commande multi-lignes
const STATUT_COMMANDE_PRIORITE = ["en_attente", "confirmee", "livree", "annulee"];

async function loadCommandesAdmin() {
  const tbody = document.getElementById("commandesBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">Chargement…</td></tr>`;

  try {
    const rows = await API.get(
      AURA_CONFIG.endpoints.commandes_admin +
      "?select=id,numero,client_id,vendeur_id,produit_id,quantite,montant_total,statut,adresse_livraison,note_client,created_at,nom_client,telephone_client,nom_boutique,nom_produit,produit_image_url&order=created_at.desc"
    );
    _commandesLignes = rows || [];
    _commandesGroupees = grouperCommandes(_commandesLignes);
    renderCommandesFilterDropdown();
    filtrerCommandes();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--danger);">Erreur : ${escHtml(err.message)}</td></tr>`;
  }
}

function grouperCommandes(lignes) {
  const map = new Map();
  for (const l of lignes) {
    const key = l.numero || l.id;
    if (!map.has(key)) {
      map.set(key, {
        numero: l.numero || key,
        client: l.nom_client || "—",
        telephone_client: l.telephone_client || "",
        created_at: l.created_at,
        adresse_livraison: l.adresse_livraison || "",
        lignes: []
      });
    }
    map.get(key).lignes.push(l);
  }

  return [...map.values()].map(cmd => {
    const boutiques = [...new Set(cmd.lignes.map(l => l.nom_boutique).filter(Boolean))];
    const montantTotal = cmd.lignes.reduce((s, l) => s + Number(l.montant_total || 0), 0);
    const statutsPresents = new Set(cmd.lignes.map(l => l.statut));
    const statutGlobal = STATUT_COMMANDE_PRIORITE.find(s => statutsPresents.has(s)) || cmd.lignes[0]?.statut || "en_attente";
    return { ...cmd, boutiques, montantTotal, statutGlobal };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderCommandesFilterDropdown() {
  const dropdown = document.getElementById("commandesFilterDropdown");
  if (!dropdown) return;

  const compteStatut = s => s === "toutes"
    ? _commandesGroupees.length
    : _commandesGroupees.filter(c => c.statutGlobal === s).length;

  const statutsHtml = ["toutes", ...STATUT_COMMANDE_PRIORITE].map(s => {
    const label = s === "toutes" ? "Toutes" : STATUT_COMMANDE_LABELS[s];
    return `<div class="prod-filter-item${_commandeStatutFiltre === s ? " selected" : ""}" onclick="selectCommandeStatutFiltre('${s}')">${label} (${compteStatut(s)})</div>`;
  }).join("");

  const boutiques = [...new Set(_commandesGroupees.flatMap(c => c.boutiques))].sort();
  const boutiquesHtml = [`<div class="prod-filter-item${!_commandeBoutiqueFiltre ? " selected" : ""}" onclick="selectCommandeBoutiqueFiltre('')">Toutes les boutiques</div>`]
    .concat(boutiques.map(b =>
      `<div class="prod-filter-item${_commandeBoutiqueFiltre === b ? " selected" : ""}" onclick="selectCommandeBoutiqueFiltre('${escHtml(b)}')">${escHtml(b)}</div>`
    )).join("");

  dropdown.innerHTML = `
    <div class="prod-filter-section-label">Statut</div>
    ${statutsHtml}
    <div class="prod-filter-divider"></div>
    <div class="prod-filter-section-label">Boutique</div>
    ${boutiquesHtml}
  `;

  const dot = document.getElementById("commandesFilterDot");
  if (dot) dot.style.display = (_commandeStatutFiltre !== "toutes" || _commandeBoutiqueFiltre) ? "block" : "none";
}

function toggleCommandesFilterDropdown() {
  const dropdown = document.getElementById("commandesFilterDropdown");
  const btn = document.getElementById("commandesFilterBtn");
  if (!dropdown) return;
  const willOpen = !dropdown.classList.contains("open");
  dropdown.classList.toggle("open", willOpen);
  btn.classList.toggle("active", willOpen);
  if (willOpen) {
    setTimeout(() => document.addEventListener("click", closeCommandesFilterDropdownOnClickOutside), 0);
  }
}

function closeCommandesFilterDropdownOnClickOutside(e) {
  const wrap = document.querySelector("#view-commandes .prod-filter-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("commandesFilterDropdown")?.classList.remove("open");
    document.getElementById("commandesFilterBtn")?.classList.remove("active");
    document.removeEventListener("click", closeCommandesFilterDropdownOnClickOutside);
  }
}

function selectCommandeStatutFiltre(statut) {
  _commandeStatutFiltre = statut;
  document.getElementById("commandesFilterDropdown")?.classList.remove("open");
  document.getElementById("commandesFilterBtn")?.classList.remove("active");
  renderCommandesFilterDropdown();
  filtrerCommandes();
}

function selectCommandeBoutiqueFiltre(boutique) {
  _commandeBoutiqueFiltre = boutique;
  document.getElementById("commandesFilterDropdown")?.classList.remove("open");
  document.getElementById("commandesFilterBtn")?.classList.remove("active");
  renderCommandesFilterDropdown();
  filtrerCommandes();
}

function filtrerCommandes() {
  const q = (document.getElementById("commandesSearchInput")?.value || "").toLowerCase().trim();
  const filtered = _commandesGroupees.filter(c => {
    const matchStatut = _commandeStatutFiltre === "toutes" || c.statutGlobal === _commandeStatutFiltre;
    const matchBoutique = !_commandeBoutiqueFiltre || c.boutiques.includes(_commandeBoutiqueFiltre);
    const matchRecherche = !q
      || c.numero.toLowerCase().includes(q)
      || c.client.toLowerCase().includes(q)
      || c.boutiques.some(b => b.toLowerCase().includes(q));
    return matchStatut && matchBoutique && matchRecherche;
  });
  renderCommandes(filtered);
}

function renderCommandes(rows) {
  const tbody = document.getElementById("commandesBody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">Aucune commande trouvée.</td></tr>`;
    return;
  }

  const btnV = "display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:transparent;cursor:pointer;flex-shrink:0;transition:background .12s,color .12s,border-color .12s;";

  tbody.innerHTML = rows.map(c => {
    const boutiqueLabel = c.boutiques.length === 0
      ? "—"
      : c.boutiques.length === 1
        ? escHtml(c.boutiques[0])
        : `${escHtml(c.boutiques[0])} <span style="color:var(--text-muted);">+${c.boutiques.length - 1}</span>`;
    const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString("fr-CI") : "—";
    const badgeClass = STATUT_COMMANDE_BADGE[c.statutGlobal] || "badge-pending";
    const badgeLabel = STATUT_COMMANDE_LABELS[c.statutGlobal] || c.statutGlobal;

    return `<tr data-numero="${escHtml(c.numero)}" style="border-bottom:1px solid var(--border,#2a2a3e);">
      <td style="padding:6px 10px 6px 10px;">
        <div style="font-size:12px;font-weight:700;">${escHtml(c.numero)}</div>
        <div style="font-size:10px;color:var(--text-muted);">${dateStr}</div>
      </td>
      <td style="padding:6px;font-size:12px;">${escHtml(c.client)}</td>
      <td style="padding:6px;font-size:12px;">${boutiqueLabel}</td>
      <td style="padding:6px;font-size:12px;font-weight:700;white-space:nowrap;">${formatCFA(c.montantTotal)}</td>
      <td style="padding:6px;"><span class="status-badge ${badgeClass}">${escHtml(badgeLabel)}</span></td>
      <td style="padding:6px;">
        <div style="display:flex;align-items:center;justify-content:center;">
          <button title="Voir le détail" onclick="voirCommandeDetail('${escHtml(c.numero)}')" class="cl-action-btn" style="${btnV}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function voirCommandeDetail(numero) {
  const cmd = _commandesGroupees.find(c => c.numero === numero);
  if (!cmd) return;

  const existing = document.getElementById("modal-voir-commande");
  if (existing) existing.remove();

  const lignesHtml = cmd.lignes.map(l => {
    const badgeClass = STATUT_COMMANDE_BADGE[l.statut] || "badge-pending";
    const badgeLabel = STATUT_COMMANDE_LABELS[l.statut] || l.statut;
    const photo = l.produit_image_url
      ? `<img src="${escHtml(l.produit_image_url)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px;">📦</div>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="width:38px;height:38px;border-radius:7px;overflow:hidden;background:var(--bg);border:1px solid var(--border);flex-shrink:0;">${photo}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(l.nom_produit || "Produit")}</div>
        <div style="font-size:11px;color:var(--text-muted);">${escHtml(l.nom_boutique || "—")} · Qté ${l.quantite || 1}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:12px;font-weight:700;">${formatCFA(l.montant_total)}</div>
        <span class="status-badge ${badgeClass}" style="font-size:10px;padding:2px 8px;">${escHtml(badgeLabel)}</span>
      </div>
    </div>`;
  }).join("");

  const dateStr = cmd.created_at ? new Date(cmd.created_at).toLocaleString("fr-CI") : "—";

  const modal = document.createElement("div");
  modal.id = "modal-voir-commande";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;padding:0;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:16px 16px 0 0;padding:20px 20px 32px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 -8px 32px rgba(0,0,0,.5);">
      <div style="width:36px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 16px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">Commande ${escHtml(cmd.numero)}</span>
        <button onclick="this.closest('#modal-voir-commande').remove()" style="background:none;border:1px solid var(--border);color:var(--text-muted);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;font-size:13px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Client</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(cmd.client)}${cmd.telephone_client ? " · " + escHtml(cmd.telephone_client) : ""}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Passée le</span>
          <span style="font-weight:600;color:var(--text);">${dateStr}</span>
        </div>
        ${cmd.adresse_livraison ? `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);gap:12px;">
          <span style="color:var(--text-muted);flex-shrink:0;">Livraison</span>
          <span style="font-weight:600;color:var(--text);text-align:right;">${escHtml(cmd.adresse_livraison)}</span>
        </div>` : ""}
        <div style="display:flex;justify-content:space-between;padding:9px 0;">
          <span style="color:var(--text-muted);">Montant total</span>
          <span style="font-weight:800;color:var(--text);font-size:15px;">${formatCFA(cmd.montantTotal)}</span>
        </div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.03em;">Produits (${cmd.lignes.length})</div>
      <div>${lignesHtml}</div>
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ─── Certifications boutique & Boosts produit (module premium) ──────────────
let _boostsAdmin = [];
let _boostTypeFiltre = "toutes"; // "toutes" | "boutique" | "produit"
let _boostStatutFiltre = "toutes"; // "toutes" | "en_attente" | "actif" | "expire" | "refuse"

const BOOST_STATUT_LABELS = {
  en_attente: "En attente",
  actif:      "Actif",
  expire:     "Expiré",
  refuse:     "Refusé"
};
const BOOST_STATUT_BADGE = {
  en_attente: "badge-pending",
  actif:      "badge-active",
  expire:     "badge-blocked",
  refuse:     "badge-danger"
};
// Durée en jours pour chaque formule (miroir de PLANS_PREMIUM / PLANS_BOOST côté vendeur)
const BOOST_FORMULE_JOURS = {
  "3_jours":  3,
  "7_jours":  7,
  "30_jours": 30
};
const BOOST_FORMULE_LABELS = {
  "3_jours":  "3 jours",
  "7_jours":  "7 jours",
  "30_jours": "30 jours"
};
const BOOST_TYPE_LABELS = {
  boutique: "Certification boutique",
  produit:  "Boost produit"
};

async function loadBoostsAdmin() {
  const tbody = document.getElementById("boostsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">Chargement…</td></tr>`;

  try {
    const rows = await API.get(
      AURA_CONFIG.endpoints.boosts_admin +
      "?select=id,vendeur_id,produit_id,type,formule,statut,montant,debut_at,fin_at,created_at,nom_boutique,nom_responsable,telephone_vendeur,premium_expire_at,nom_produit,produit_image_url,boost_expire_at,proof_url,transaction_id,produits_ids&order=created_at.desc"
    );
    _boostsAdmin = rows || [];
    renderBoostsFilterDropdown();
    filtrerBoosts();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--danger);">Erreur : ${escHtml(err.message)}</td></tr>`;
  }
}

function renderBoostsFilterDropdown() {
  const dropdown = document.getElementById("boostsFilterDropdown");
  if (!dropdown) return;

  const compteType = t => t === "toutes" ? _boostsAdmin.length : _boostsAdmin.filter(b => b.type === t).length;
  const typesHtml = ["toutes", "boutique", "produit"].map(t => {
    const label = t === "toutes" ? "Tous les types" : BOOST_TYPE_LABELS[t];
    return `<div class="prod-filter-item${_boostTypeFiltre === t ? " selected" : ""}" onclick="selectBoostTypeFiltre('${t}')">${label} (${compteType(t)})</div>`;
  }).join("");

  const compteStatut = s => s === "toutes" ? _boostsAdmin.length : _boostsAdmin.filter(b => b.statut === s).length;
  const statutsHtml = ["toutes", "en_attente", "actif", "expire", "refuse"].map(s => {
    const label = s === "toutes" ? "Tous les statuts" : BOOST_STATUT_LABELS[s];
    return `<div class="prod-filter-item${_boostStatutFiltre === s ? " selected" : ""}" onclick="selectBoostStatutFiltre('${s}')">${label} (${compteStatut(s)})</div>`;
  }).join("");

  dropdown.innerHTML = `
    <div class="prod-filter-section-label">Type</div>
    ${typesHtml}
    <div class="prod-filter-divider"></div>
    <div class="prod-filter-section-label">Statut</div>
    ${statutsHtml}
  `;

  const dot = document.getElementById("boostsFilterDot");
  if (dot) dot.style.display = (_boostTypeFiltre !== "toutes" || _boostStatutFiltre !== "toutes") ? "block" : "none";

  const enAttenteTotal = _boostsAdmin.filter(b => b.statut === "en_attente").length;
  const sideEl = document.getElementById("badge-boosts");
  if (sideEl) {
    sideEl.textContent = enAttenteTotal;
    sideEl.style.display = enAttenteTotal > 0 ? "" : "none";
  }
}

function toggleBoostsFilterDropdown() {
  const dropdown = document.getElementById("boostsFilterDropdown");
  const btn = document.getElementById("boostsFilterBtn");
  if (!dropdown) return;
  const willOpen = !dropdown.classList.contains("open");
  dropdown.classList.toggle("open", willOpen);
  btn.classList.toggle("active", willOpen);
  if (willOpen) {
    setTimeout(() => document.addEventListener("click", closeBoostsFilterDropdownOnClickOutside), 0);
  }
}

function closeBoostsFilterDropdownOnClickOutside(e) {
  const wrap = document.querySelector("#view-boutiques .prod-filter-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("boostsFilterDropdown")?.classList.remove("open");
    document.getElementById("boostsFilterBtn")?.classList.remove("active");
    document.removeEventListener("click", closeBoostsFilterDropdownOnClickOutside);
  }
}

function selectBoostTypeFiltre(type) {
  _boostTypeFiltre = type;
  document.getElementById("boostsFilterDropdown")?.classList.remove("open");
  document.getElementById("boostsFilterBtn")?.classList.remove("active");
  renderBoostsFilterDropdown();
  filtrerBoosts();
}

function selectBoostStatutFiltre(statut) {
  _boostStatutFiltre = statut;
  document.getElementById("boostsFilterDropdown")?.classList.remove("open");
  document.getElementById("boostsFilterBtn")?.classList.remove("active");
  renderBoostsFilterDropdown();
  filtrerBoosts();
}

function filtrerBoosts() {
  const q = (document.getElementById("boostsSearchInput")?.value || "").toLowerCase().trim();
  const filtered = _boostsAdmin.filter(b => {
    const matchType = _boostTypeFiltre === "toutes" || b.type === _boostTypeFiltre;
    const matchStatut = _boostStatutFiltre === "toutes" || b.statut === _boostStatutFiltre;
    const formuleLabel = (BOOST_FORMULE_LABELS[b.formule] || b.formule || "").toLowerCase();
    const matchRecherche = !q
      || (b.nom_boutique || "").toLowerCase().includes(q)
      || (b.nom_produit || "").toLowerCase().includes(q)
      || formuleLabel.includes(q);
    return matchType && matchStatut && matchRecherche;
  });
  renderBoosts(filtered);
}

function renderBoosts(rows) {
  const tbody = document.getElementById("boostsBody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">Aucune demande.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(b => {
    const typeTag = `<div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:${b.type === "boutique" ? "#8B5CF6" : "#F59E0B"};margin-bottom:2px;">${b.type === "boutique" ? "Certification" : "Boost produit"}</div>`;
    const idsMultiRow = Array.isArray(b.produits_ids) ? b.produits_ids.filter(Boolean) : [];
    const nomCible = idsMultiRow.length > 0 ? `${idsMultiRow.length} publications` : (b.nom_produit || "Produit");
    const cible = typeTag + (b.type === "boutique" ? (b.nom_boutique || "—") : `${escHtml(nomCible)}<div style="font-size:10px;color:var(--text-muted);font-weight:400;">${escHtml(b.nom_boutique || "")}</div>`);
    const demandeeLe = b.created_at ? new Date(b.created_at).toLocaleDateString("fr-CI") : "—";
    const finLe = b.fin_at ? new Date(b.fin_at).toLocaleDateString("fr-CI") : "—";
    const badgeClass = BOOST_STATUT_BADGE[b.statut] || "badge-pending";
    const badgeLabel = BOOST_STATUT_LABELS[b.statut] || b.statut;
    const formuleLabel = BOOST_FORMULE_LABELS[b.formule] || b.formule;

    const actions = b.statut === "en_attente"
      ? `<div class="cl-actions">
          <button title="Voir" class="cl-action-btn" onclick="voirBoostDetail('${b.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button title="Valider" class="cl-action-btn" onclick="ouvrirValidationBoost('${b.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
          <button title="Refuser" class="cl-action-btn" onclick="refuserBoost('${b.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>`
      : `<div class="cl-actions">
          <button title="Voir" class="cl-action-btn" onclick="voirBoostDetail('${b.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>`;

    return `<tr data-id="${b.id}" style="border-bottom:1px solid var(--border,#2a2a3e);">
      <td style="padding:6px 10px;font-size:12px;font-weight:700;">${cible}</td>
      <td style="padding:6px;font-size:12px;">${escHtml(formuleLabel)}</td>
      <td style="padding:6px;font-size:12px;color:var(--text-muted);">${demandeeLe}</td>
      <td style="padding:6px;font-size:12px;color:var(--text-muted);">${finLe}</td>
      <td style="padding:6px;"><span class="status-badge ${badgeClass}">${escHtml(badgeLabel)}</span></td>
      <td style="padding:6px;">${actions}</td>
    </tr>`;
  }).join("");
}

// ─── Boosts : aperçu détaillé (preuve de paiement + transaction) avant décision ───
async function voirBoostDetail(id) {
  const b = _boostsAdmin.find(x => x.id === id);
  if (!b) return;

  const existing = document.getElementById("modal-voir-boost");
  if (existing) existing.remove();

  const idsMulti = Array.isArray(b.produits_ids) ? b.produits_ids.filter(Boolean) : [];
  const cibleNom = b.type === "boutique" ? (b.nom_boutique || "—")
    : (idsMulti.length > 0 ? `${idsMulti.length} publications sponsorisées` : (b.nom_produit || "Produit"));
  const cibleSous = b.type === "boutique" ? (b.nom_responsable || "") : (b.nom_boutique || "");
  const typeLabel = BOOST_TYPE_LABELS[b.type] || b.type;
  const formuleLabel = BOOST_FORMULE_LABELS[b.formule] || b.formule || "—";
  const demandeeLe = b.created_at ? new Date(b.created_at).toLocaleDateString("fr-CI") : "—";
  const montantLabel = b.montant ? formatCFA(Number(b.montant)) : "—";

  // Si la demande porte sur plusieurs publications (packs trio/quintet), on va
  // chercher leurs infos (nom, prix, photo) pour les lister dans le modal.
  let produitsMulti = [];
  if (idsMulti.length > 0) {
    try {
      produitsMulti = await API.get(
        `${AURA_CONFIG.endpoints.produits}?id=in.(${idsMulti.join(",")})&select=id,nom,prix,image_url`
      );
    } catch (_) { produitsMulti = []; }
  }

  const publicationsHtml = idsMulti.length > 0 ? `
    <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted);margin-bottom:8px;">Publications à booster (${idsMulti.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
      ${idsMulti.map(pid => {
        const p = produitsMulti.find(x => x.id === pid);
        const img = p?.image_url
          ? `<img src="${escHtml(p.image_url)}" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
          : `<div style="width:38px;height:38px;border-radius:8px;background:rgba(255,255,255,0.05);flex-shrink:0;"></div>`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:10px;">
          ${img}
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p?.nom || "Produit introuvable")}</div>
            ${p?.prix ? `<div style="font-size:11.5px;color:var(--text-muted);">${formatCFA(Number(p.prix))}</div>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>` : "";

  const preuveHtml = b.proof_url ? `
    <div class="vp-carousel" data-photos='${escHtml(JSON.stringify([b.proof_url]))}' style="position:relative;margin-bottom:14px;">
      <img src="${escHtml(b.proof_url)}" alt="" data-idx="0" onclick="ouvrirPhotoPleinEcran(this)" style="width:100%;height:260px;object-fit:cover;border-radius:10px;cursor:zoom-in;">
      <span style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;">Preuve de paiement</span>
    </div>` : `
    <div style="width:100%;height:180px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;margin-bottom:14px;">Aucune preuve fournie</div>`;

  const modal = document.createElement("div");
  modal.id = "modal-voir-boost";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;padding:0;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:16px 16px 0 0;padding:20px 20px 32px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 -8px 32px rgba(0,0,0,.5);">
      <div style="width:36px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 16px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">${b.type === "boutique" ? "Certification" : "Boost produit"}</span>
        <button onclick="this.closest('#modal-voir-boost').remove()" style="background:none;border:1px solid var(--border);color:var(--text-muted);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      ${preuveHtml}
      <div style="font-weight:700;font-size:16px;margin-bottom:2px;color:var(--text);">${escHtml(cibleNom)}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">${escHtml(cibleSous)}</div>
      ${publicationsHtml}
      <div style="display:flex;flex-direction:column;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Type</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(typeLabel)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Formule</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(formuleLabel)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Montant</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(montantLabel)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Transaction</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(b.transaction_id || "—")}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;">
          <span style="color:var(--text-muted);">Demandé le</span>
          <span style="font-weight:600;color:var(--text);">${demandeeLe}</span>
        </div>
      </div>
      ${b.statut === "en_attente" ? `<div style="display:flex;gap:10px;margin-top:20px;">
        <button onclick="this.closest('#modal-voir-boost').remove();ouvrirValidationBoost('${b.id}')"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:#10B981;font-weight:600;font-size:13.5px;cursor:pointer;">Valider</button>
        <button onclick="this.closest('#modal-voir-boost').remove();refuserBoost('${b.id}')"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:#E0276F;font-weight:600;font-size:13.5px;cursor:pointer;">Refuser</button>
      </div>` : `<div style="margin-top:20px;padding:11px;border-radius:9px;border:1px solid var(--border);text-align:center;font-weight:600;font-size:13.5px;color:${BOOST_STATUT_BADGE[b.statut] === "badge-active" ? "#10B981" : "#E0276F"};">● ${escHtml(BOOST_STATUT_LABELS[b.statut] || b.statut)}</div>`}
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// Demande la durée via le prompt universel, puis valide après confirmation
async function ouvrirValidationBoost(id) {
  const b = _boostsAdmin.find(x => x.id === id);
  if (!b) return;
  const joursDefaut = BOOST_FORMULE_JOURS[b.formule] || 7;
  const cibleLabel = b.type === "boutique" ? (b.nom_boutique || "cette boutique") : (b.nom_produit || "ce produit");
  const titre = b.type === "boutique" ? "Valider la certification" : "Valider le boost";

  const saisie = await appPrompt(`Durée en jours pour « ${cibleLabel} » :`, {
    title: titre, okLabel: "Continuer", placeholder: String(joursDefaut)
  });
  if (saisie === null) return; // annulé

  const jours = Math.max(1, parseInt(saisie, 10) || joursDefaut);

  const ok = await appConfirm(
    `Confirmer l'activation pour ${jours} jour${jours > 1 ? "s" : ""} ? La ${b.type === "boutique" ? "boutique sera certifiée" : "publication sera sponsorisée"} jusqu'à cette date.`,
    { title: titre, okLabel: "Valider" }
  );
  if (!ok) return;

  await validerBoost(id, jours);
}

async function validerBoost(id, jours) {
  const b = _boostsAdmin.find(x => x.id === id);
  if (!b) return;

  const debut = new Date();
  const fin = new Date();
  fin.setDate(fin.getDate() + jours);

  try {
    // 1. Marquer la demande comme active avec ses dates (table brute — la vue jointe n'est pas updatable)
    await API.patch(AURA_CONFIG.endpoints.boosts + "?id=eq." + id, {
      statut: "actif",
      debut_at: debut.toISOString(),
      fin_at: fin.toISOString()
    });

    // 2. Répercuter l'effet sur la boutique (certification) ou le produit (boost)
    if (b.type === "boutique") {
      await API.patch(AURA_CONFIG.endpoints.users_vendeurs + "?id=eq." + b.vendeur_id, {
        premium_expire_at: fin.toISOString()
      });
    } else if (b.type === "produit" && b.produit_id) {
      await API.patch(AURA_CONFIG.endpoints.produits + "?id=eq." + b.produit_id, {
        boost_expire_at: fin.toISOString()
      });
    }

    showToast("Demande validée avec succès.", "success");
    await loadBoostsAdmin();
  } catch (err) {
    showToast(err.message || "Erreur lors de la validation", "error");
  }
}

async function refuserBoost(id) {
  const b = _boostsAdmin.find(x => x.id === id);
  const cibleLabel = b?.type === "boutique" ? (b.nom_boutique || "cette demande") : (b?.nom_produit || "cette demande");

  const ok = await appConfirm(`Refuser la demande pour « ${cibleLabel} » ?`, {
    title: "Refuser la demande", okLabel: "Refuser", danger: true
  });
  if (!ok) return;

  try {
    await API.patch(AURA_CONFIG.endpoints.boosts + "?id=eq." + id, { statut: "refuse" });
    showToast("Demande refusée.", "info");
    await loadBoostsAdmin();
  } catch (err) {
    showToast(err.message || "Erreur lors du refus", "error");
  }
}

function voirProduitCatalogue(id) {
  const row = document.querySelector(`#produitsCatalogueBody tr[data-id="${id}"]`);
  if (!row) return;

  const nom      = row.dataset.nom || "—";
  const prix     = row.dataset.prix || "0";
  const boutique = row.dataset.boutique || "—";
  const desc     = row.dataset.desc || "";
  const cat      = row.dataset.cat || "—";
  const stock    = row.dataset.stock || "0";
  const date     = row.dataset.date ? new Date(row.dataset.date).toLocaleDateString("fr-CI") : "—";
  const actif    = row.dataset.actif === "true";
  const vedette  = row.dataset.vedette === "true";
  let   photos   = [];
  try { photos = JSON.parse(row.dataset.photos || "[]"); } catch(e) {}
  let   details  = {};
  try { details = JSON.parse(row.dataset.details || "{}"); } catch(e) {}
  const detailsEntries = Object.entries(details).filter(([k, v]) => v !== "" && v != null);
  const detailsHtml = detailsEntries.map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
      <span style="color:var(--text-muted);">${escHtml(k)}</span>
      <span style="font-weight:600;color:var(--text);">${escHtml(String(v))}</span>
    </div>`
  ).join("");

  const existing = document.getElementById("modal-voir-produit");
  if (existing) existing.remove();

  let carouselHtml = "";
  if (photos.length > 0) {
    const slides = photos.map((src, i) =>
      `<div class="vp-slide" style="flex:0 0 100%;scroll-snap-align:start;">
        <img src="${escHtml(src)}" alt="" data-idx="${i}" onclick="ouvrirPhotoPleinEcran(this)" style="width:100%;height:200px;object-fit:cover;border-radius:10px;cursor:zoom-in;">
      </div>`
    ).join("");
    const arrows = photos.length > 1 ? `
      <button type="button" onclick="vpCarouselNav(this,-1)" aria-label="Photo précédente" style="position:absolute;left:6px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">‹</button>
      <button type="button" onclick="vpCarouselNav(this,1)" aria-label="Photo suivante" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">›</button>` : "";
    const dots = photos.length > 1 ? `<div class="vp-dots" style="display:flex;justify-content:center;gap:5px;margin-top:8px;">
      ${photos.map((_, i) => `<div data-dot="${i}" style="width:6px;height:6px;border-radius:50%;background:${i===0?"#FFFFFF":"rgba(255,255,255,0.2)"};"></div>`).join("")}
    </div>` : "";
    carouselHtml = `
      <div class="vp-carousel" data-photos='${escHtml(JSON.stringify(photos))}' style="position:relative;margin-bottom:${photos.length>1?'4px':'14px'};">
        <div class="vp-track" style="overflow-x:auto;display:flex;scroll-snap-type:x mandatory;scroll-behavior:smooth;border-radius:10px;">
          ${slides}
        </div>${arrows}
      </div>${dots}<div style="margin-bottom:14px;"></div>`;
  }

  const modal = document.createElement("div");
  modal.id = "modal-voir-produit";
  modal.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center;padding:0;";
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:16px 16px 0 0;padding:20px 20px 32px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 -8px 32px rgba(0,0,0,.5);">
      <div style="width:36px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 16px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:14px;letter-spacing:.02em;">Aperçu produit</span>
        <button onclick="this.closest('#modal-voir-produit').remove()" style="background:none;border:1px solid var(--border);color:var(--text-muted);font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      ${carouselHtml || `<div style="width:100%;height:180px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted);margin-bottom:14px;"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>`}
      <div style="font-weight:700;font-size:16px;margin-bottom:4px;color:var(--text);">${escHtml(nom)}</div>
      <div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:16px;">${formatCFA(Number(prix))}</div>
      <div style="display:flex;flex-direction:column;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Boutique</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(boutique)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Catégorie</span>
          <span style="font-weight:600;color:var(--text);">${escHtml(cat)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-muted);">Stock</span>
          <span style="font-weight:600;color:var(--text);">${stock} unités</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:9px 0;${detailsHtml || desc ? "border-bottom:1px solid var(--border);" : ""}">
          <span style="color:var(--text-muted);">Soumis le</span>
          <span style="font-weight:600;color:var(--text);">${date}</span>
        </div>
        ${detailsHtml}
        ${desc ? `<div style="padding:9px 0;">
          <div style="color:var(--text-muted);margin-bottom:5px;">Description</div>
          <div style="font-size:13px;line-height:1.6;color:var(--text);">${escHtml(desc)}</div>
        </div>` : ""}
      </div>
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button onclick="toggleVedetteProduit('${id}',document.querySelector('#produitsCatalogueBody tr[data-id=\\'${id}\\']'));this.closest('#modal-voir-produit').remove();"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:var(--text);font-weight:600;font-size:13.5px;cursor:pointer;">${vedette ? "Retirer" : "Recommander"}</button>
        <button onclick="toggleActifProduit('${id}',document.querySelector('#produitsCatalogueBody tr[data-id=\\'${id}\\']'));this.closest('#modal-voir-produit').remove();"
          style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparent;color:${actif ? "#F59E0B" : "#10B981"};font-weight:600;font-size:13.5px;cursor:pointer;">${actif ? "Masquer" : "Démasquer"}</button>
      </div>
    </div>`;
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}
/* ════════════════════════════════════════════════════════════
   GESTION DES ADMINISTRATEURS
════════════════════════════════════════════════════════════ */

let _gaSelectedIcones = new Set();
let _gaLastCode = "";

function renderGaIconesGrid() {
  const grid = document.getElementById("gaIconesGrid");
  if (!grid) return;
  grid.innerHTML = ADMIN_ICONES.map(ic => `
    <label class="ga-icone-item" id="ga-item-${ic.key}">
      <input type="checkbox" value="${ic.key}" onchange="toggleGaIcone('${ic.key}')">
      <svg viewBox="0 0 24 24">${ic.icon}</svg>
      <span>${ic.label}</span>
    </label>
  `).join("");
}

function toggleGaIcone(key) {
  const item = document.getElementById(`ga-item-${key}`);
  if (_gaSelectedIcones.has(key)) {
    _gaSelectedIcones.delete(key);
    item?.classList.remove("checked");
  } else {
    _gaSelectedIcones.add(key);
    item?.classList.add("checked");
  }
}

async function genererCodeAdmin() {
  if (_gaSelectedIcones.size === 0) {
    showToast("Sélectionne au moins un accès", "warning");
    return;
  }
  const libelle = document.getElementById("gaLibelleInput")?.value?.trim() || null;
  const currentUser = AURA_AUTH.getUser();

  try {
    const code = await API.post("/rest/rpc/generer_code_admin", {
      p_icones: Array.from(_gaSelectedIcones),
      p_libelle: libelle,
      p_created_by: currentUser?.id || null
    });

    _gaLastCode = code;
    document.getElementById("gaCodeResultValue").textContent = code;
    document.getElementById("gaCodeResultBox").style.display = "block";
    showToast("Code généré avec succès", "success");
    logActivite("creation", "code_admin", code, libelle ? `Code généré (${libelle})` : "Code d'inscription admin généré");

    _gaSelectedIcones.clear();
    document.querySelectorAll(".ga-icone-item").forEach(el => el.classList.remove("checked"));
    document.querySelectorAll("#gaIconesGrid input[type=checkbox]").forEach(cb => cb.checked = false);
    if (document.getElementById("gaLibelleInput")) document.getElementById("gaLibelleInput").value = "";
  } catch (e) {
    showToast(e.message || "Erreur lors de la génération du code", "error");
  }
}

function copierCodeAdmin() {
  if (!_gaLastCode) return;
  navigator.clipboard?.writeText(_gaLastCode)
    .then(() => showToast("Code copié", "success"))
    .catch(() => showToast("Impossible de copier", "error"));
}

function _gaPermTagsHtml(admin) {
  if (admin.role === "super_admin") {
    return `<span class="ga-perm-tag all">Accès total</span>`;
  }
  const icones = Array.isArray(admin.permissions?.icones) ? admin.permissions.icones : [];
  if (icones.length === 0) return `<span class="ga-perm-tag">Aucun accès</span>`;
  return icones.map(key => {
    const found = ADMIN_ICONES.find(i => i.key === key);
    return `<span class="ga-perm-tag">${found ? found.label : key}</span>`;
  }).join("");
}

function _gaAccessCountLabel(admin) {
  if (admin.role === "super_admin") return "Total";
  const icones = Array.isArray(admin.permissions?.icones) ? admin.permissions.icones : [];
  return `${icones.length} accès`;
}

function _renderAdminRow(admin) {
  const isSuper = admin.role === "super_admin";
  const statutBadge = admin.is_active
    ? `<span class="badge badge-active">Actif</span>`
    : `<span class="badge badge-blocked">Désactivé</span>`;

  const actions = isSuper
    ? `<span style="color:var(--text-muted);font-size:12.5px;">Protégé</span>`
    : `
      <div class="ga-actions-full">
        <button class="btn btn-outline btn-sm" onclick="ouvrirEditionPermissions('${admin.id}')">Modifier accès</button>
        <button class="btn btn-sm" style="background:${admin.is_active ? "var(--danger-light)" : "var(--success-light)"};color:${admin.is_active ? "var(--danger)" : "var(--success)"};"
          onclick="toggleActifAdmin('${admin.id}', ${!admin.is_active})">${admin.is_active ? "Désactiver" : "Activer"}</button>
      </div>
      <div class="ga-actions-compact">
        <button class="icon-btn" style="color:var(--text-secondary);" title="Modifier accès" onclick="ouvrirEditionPermissions('${admin.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="icon-btn" style="color:${admin.is_active ? "var(--danger)" : "var(--success)"};" title="${admin.is_active ? "Désactiver" : "Activer"}"
          onclick="toggleActifAdmin('${admin.id}', ${!admin.is_active})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
        </button>
      </div>`;

  return `
    <tr data-id="${admin.id}" class="ga-admin-row">
      <td data-label="Nom" style="font-weight:600;">
        <span class="ga-status-dot ${admin.is_active ? "on" : "off"}"></span><span class="ga-name-text">${escHtml(admin.nom || "—")}</span><span class="ga-access-count">${_gaAccessCountLabel(admin)}</span>
      </td>
      <td data-label="Email">${escHtml(admin.email || "—")}</td>
      <td data-label="Rôle">${isSuper ? "Super Admin" : "Admin"}</td>
      <td data-label="Statut">${statutBadge}</td>
      <td data-label="Actions">${actions}</td>
    </tr>
    <tr class="ga-admin-perms-row">
      <td colspan="5" data-label="Accès" style="padding-top:0;padding-bottom:14px;border-top:none;">
        <div class="ga-perm-tags">${_gaPermTagsHtml(admin)}</div>
      </td>
    </tr>`;
}

let _gaAdminsCache = [];

async function loadAdmins() {
  const body = document.getElementById("gaAdminsBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Chargement…</td></tr>`;
  try {
    const rows = await API.get(AURA_CONFIG.endpoints.admins);
    _gaAdminsCache = Array.isArray(rows) ? rows : [];
    if (_gaAdminsCache.length === 0) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Aucun administrateur</td></tr>`;
      return;
    }
    body.innerHTML = _gaAdminsCache.map(_renderAdminRow).join("");
  } catch (e) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--danger);">Erreur de chargement</td></tr>`;
  }
}

async function toggleActifAdmin(adminId, nextActive) {
  const confirmed = await appConfirm(
    nextActive ? "Réactiver l'accès de cet administrateur ?" : "Désactiver l'accès de cet administrateur ? Il ne pourra plus se connecter.",
    { title: nextActive ? "Réactivation" : "Désactivation", okLabel: nextActive ? "Activer" : "Désactiver", danger: !nextActive }
  );
  if (!confirmed) return;

  try {
    const ok = await API.post("/rest/rpc/toggle_actif_admin", { p_admin_id: adminId, p_is_active: nextActive });
    if (!ok) { showToast("Action impossible sur ce compte", "error"); return; }
    showToast(nextActive ? "Administrateur réactivé" : "Administrateur désactivé", "success");
    const target = _gaAdminsCache.find(a => a.id === adminId);
    logActivite(nextActive ? "activation" : "desactivation", "administrateur", adminId, `${target?.nom || target?.email || "Admin"} ${nextActive ? "réactivé" : "désactivé"}`);
    loadAdmins();
  } catch (e) {
    showToast(e.message || "Erreur", "error");
  }
}

function ouvrirEditionPermissions(adminId) {
  const admin = _gaAdminsCache.find(a => a.id === adminId);
  if (!admin) return;
  const currentIcones = new Set(Array.isArray(admin.permissions?.icones) ? admin.permissions.icones : []);

  const modal = document.createElement("div");
  modal.className = "confirm-overlay";
  modal.style.display = "flex";
  modal.id = "modal-edit-perms";
  modal.innerHTML = `
    <div class="confirm-box" style="text-align:left;">
      <div class="confirm-title" style="margin-bottom:14px;">Accès de ${escHtml(admin.nom || admin.email)}</div>
      <div class="ga-icones-grid" id="gaEditIconesGrid"></div>
      <div class="confirm-actions" style="margin-top:18px;">
        <button class="confirm-btn confirm-btn-cancel" id="gaEditCancelBtn">Annuler</button>
        <button class="confirm-btn confirm-btn-ok" id="gaEditSaveBtn">Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const grid = document.getElementById("gaEditIconesGrid");
  grid.innerHTML = ADMIN_ICONES.map(ic => `
    <label class="ga-icone-item${currentIcones.has(ic.key) ? " checked" : ""}" id="ga-edit-item-${ic.key}">
      <input type="checkbox" value="${ic.key}" ${currentIcones.has(ic.key) ? "checked" : ""}
        onchange="this.closest('.ga-icone-item').classList.toggle('checked', this.checked)">
      <svg viewBox="0 0 24 24">${ic.icon}</svg>
      <span>${ic.label}</span>
    </label>
  `).join("");

  document.getElementById("gaEditCancelBtn").onclick = () => modal.remove();
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  document.getElementById("gaEditSaveBtn").onclick = async () => {
    const selected = Array.from(grid.querySelectorAll("input[type=checkbox]:checked")).map(cb => cb.value);
    try {
      const ok = await API.post("/rest/rpc/modifier_permissions_admin", { p_admin_id: adminId, p_icones: selected });
      if (!ok) { showToast("Action impossible sur ce compte", "error"); return; }
      showToast("Accès mis à jour", "success");
      logActivite("modification", "administrateur", adminId, `Accès de ${admin.nom || admin.email} modifiés (${selected.length} accès)`);
      modal.remove();
      loadAdmins();
    } catch (e) {
      showToast(e.message || "Erreur", "error");
    }
  };
}

// ─── Journal d'activité ────────────────────────────────────────────────────
const LOGS_PAGE_SIZE = 30;
let _logsOffset = 0;
let _logsActionFiltre = "";
let _logsSearch = "";
let _logsCache = [];
let _logsHasMore = true;
let _logsLoading = false;

const LOGS_ACTION_META = {
  connexion:     { label: "Connexion",     badge: "badge-active"  },
  deconnexion:   { label: "Déconnexion",   badge: "badge-neutral" },
  creation:      { label: "Création",      badge: "badge-transit" },
  modification:  { label: "Modification",  badge: "badge-pending" },
  suppression:   { label: "Suppression",   badge: "badge-blocked" },
  activation:    { label: "Activation",    badge: "badge-active"  },
  desactivation: { label: "Désactivation", badge: "badge-blocked" }
};

function _logsFormatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const datePart = sameDay
    ? "Aujourd'hui"
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  const timePart = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

function _renderLogRow(log) {
  const meta = LOGS_ACTION_META[log.action] || { label: log.action, badge: "badge-neutral" };
  return `
    <tr>
      <td style="white-space:nowrap;color:var(--text-secondary);">${_logsFormatDate(log.created_at)}</td>
      <td style="font-weight:600;">${escHtml(log.admin_nom || log.admin_email || "—")}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td style="color:var(--text-secondary);text-transform:capitalize;">${escHtml(log.cible || "—")}</td>
      <td style="color:var(--text-secondary);">${escHtml(log.details || "—")}</td>
    </tr>`;
}

function _logsMatchesSearch(log, q) {
  if (!q) return true;
  const hay = `${log.admin_nom || ""} ${log.admin_email || ""} ${log.cible || ""} ${log.details || ""}`.toLowerCase();
  return hay.includes(q);
}

function _renderLogsTable() {
  const body = document.getElementById("logsBody");
  if (!body) return;
  const q = _logsSearch.trim().toLowerCase();
  const filtered = _logsCache.filter(l => _logsMatchesSearch(l, q));
  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Aucune activité trouvée</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(_renderLogRow).join("");
}

async function loadLogs(reset) {
  if (_logsLoading) return;
  if (reset) { _logsOffset = 0; _logsCache = []; _logsHasMore = true; }
  if (!_logsHasMore) return;

  _logsLoading = true;
  const body = document.getElementById("logsBody");
  const moreBtn = document.getElementById("logsLoadMoreBtn");
  if (reset && body) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Chargement…</td></tr>`;
  }

  try {
    let query = `?order=created_at.desc&limit=${LOGS_PAGE_SIZE}&offset=${_logsOffset}`;
    if (_logsActionFiltre) query += `&action=eq.${_logsActionFiltre}`;
    const rows = await API.get(AURA_CONFIG.endpoints.journal_activite + query);
    const list = Array.isArray(rows) ? rows : [];
    _logsCache = _logsCache.concat(list);
    _logsOffset += list.length;
    _logsHasMore = list.length === LOGS_PAGE_SIZE;
    _renderLogsTable();
    if (moreBtn) moreBtn.style.display = _logsHasMore ? "inline-block" : "none";
  } catch (e) {
    if (body) body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--danger);">Erreur de chargement</td></tr>`;
  } finally {
    _logsLoading = false;
  }
}



function filtrerLogs() {
  _logsSearch = document.getElementById("logsSearchInput")?.value || "";
  _renderLogsTable();
}
