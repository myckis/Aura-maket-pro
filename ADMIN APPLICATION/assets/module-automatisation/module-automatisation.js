/**
 * AURA MARKET — Module Automatisation (Admin)
 * Fichier : assets/module-automatisation/module-automatisation.js
 * Dépend de : ../js/config.js (AURA_CONFIG, AURA_AUTH, API)
 *
 * Pilote :
 *  - 4 automatisations "natives" toujours connectées au noyau (modération
 *    produits, vérification KYC, analyse signalements, publication TikTok)
 *  - 18 modules "externes" (les autres modules du dashboard) que l'admin
 *    peut connecter/déconnecter du noyau à la volée. Une fois connecté, un
 *    module externe devient un nœud du réseau EN TOUT POINT IDENTIQUE aux
 *    automatisations natives (mêmes contrôles, mêmes stats, même journal).
 *
 * Routes admin exposées par le Worker, réutilisées pour tous les modules
 * — natifs ET externes connectés, via leur "cle" :
 *   GET  /proxy/admin/automatisations/liste
 *   POST /proxy/admin/automatisations/toggle
 *   POST /proxy/admin/automatisations/executer
 *   GET  /proxy/admin/automatisations/logs
 *   POST /proxy/admin/automatisations/annuler
 *   POST /proxy/admin/automatisations/connecter    (modules externes uniquement)
 *   POST /proxy/admin/automatisations/deconnecter   (modules externes uniquement)
 *
 * Toutes ces routes sont protégées par X-Admin-Token côté Worker ;
 * l'API helper (config.js) est supposé injecter ce header automatiquement
 * sur les appels /proxy/admin/*, comme pour les autres modules admin.
 *
 * ── État de connexion des modules externes ──────────────────────────
 * Le backend (Worker + contrainte automatisations_config_cle_check côté
 * Supabase) connaît les 18 clés externes en plus des 4 natives : la
 * connexion crée réellement une ligne en base via /automatisations/connecter
 * (upsert idempotent), la déconnexion la supprime via /automatisations/
 * deconnecter. Toggle/exécuter/logs/annuler fonctionnent alors pour un
 * module externe exactement comme pour un natif.
 * Un stockage local (localStorage, clé MAUT_LS_CONNECTES) reste en place
 * comme simple filet de secours hors-ligne : si l'appel API échoue
 * (panne réseau/Worker/Supabase), le module apparaît quand même connecté
 * pour cet appareil, avec un badge "non synchronisé côté serveur".
 * Voir MAUT_STORAGE_MODE et connecterModuleExterne() / deconnecterModuleExterne().
 *
 * Vue "Automation Network" : noyau AURA central + tous les modules
 * actuellement connectés (natifs + externes) en nœuds. Clic sur un nœud →
 * panneau latéral de configuration. Journal des décisions dans un onglet
 * séparé, avec filtre dynamique incluant les modules externes connectés.
 */
"use strict";

/* ── Métadonnées d'affichage des 4 sous-modules ─────────────────────
   (labels/icônes/descriptions ne viennent pas de la base ; seules
   actif / validation_auto / seuil_confiance sont pilotées par la config) */
const MAUT_SOUS_MODULES = [
  {
    cle: "moderation_produits",
    libelle: "Modération produits",
    description: "Analyse les fiches en attente dans produits_validation et peut auto-valider ou auto-rejeter selon la confiance. Seul cas où l'auto-décision s'applique pleinement.",
    icon: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`,
    natif: true
  },
  {
    cle: "verification_kyc",
    libelle: "Vérification KYC",
    description: "Vérifie uniquement la cohérence déclarative des dossiers (documents présents, champs non vides). Ne valide jamais un dossier incomplet, même si l'IA répond « valide ».",
    icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>`,
    natif: true
  },
  {
    cle: "analyse_signalements",
    libelle: "Analyse signalements",
    description: "Peut faire passer un signalement en gravité urgente automatiquement, mais ne le clôture jamais — la décision finale reste humaine.",
    icon: `<path d="M12 9v4"/><path d="M12 17h.01"/><path d="m10.3 3.6-8 14A2 2 0 0 0 4 20.6h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/>`,
    natif: true
  },
  {
    cle: "publication_tiktok",
    libelle: "Publication TikTok",
    description: "File d'attente prête, mais aucune clé API TikTok n'est configurée pour l'instant : les publications restent en attente de validation TikTok.",
    icon: `<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>`,
    natif: true
  }
];

const MAUT_HUB_ICON = `<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>`;

/* ── Tous les modules du dashboard (repris de ADMIN_ICONES / sidebar.js) ──
   "link" = page HTML dédiée existante ; sans "link" = vue interne au
   dashboard (pas de page séparée dans ce module). */
const MAUT_TOUS_MODULES = [
  { categorie: "Gestion", cle: "dashboard", libelle: "Vue d'ensemble", icon: `<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>`, connectable: false },
  { categorie: "Gestion", cle: "utilisateurs", libelle: "Utilisateurs", icon: `<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="18" cy="9" r="2.4"/><path d="M15.5 13.5a4.6 4.6 0 0 1 6 4.3"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Gestion", cle: "vendeurs", libelle: "Vendeurs", icon: `<path d="M4 10h16l-1-5H5z"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Gestion", cle: "gestion_admins", libelle: "Gestion des administrateurs", icon: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M19 3l1.5 1.5L23 2"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },

  { categorie: "Modération", cle: "kyc", libelle: "Vérifications KYC", icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Modération", cle: "validation", libelle: "Validation produits", icon: `<path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Modération", cle: "signalements", libelle: "Signalements", icon: `<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },

  { categorie: "Commerce", cle: "produits", libelle: "Produits", icon: `<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Commerce", cle: "commandes", libelle: "Commandes", icon: `<path d="M6 3h12l2 4v14H4V7z"/><path d="M6 7h12"/><path d="M9 11h6"/>`, description: "Surveille les commandes en_attente non confirmées par le vendeur : signale à l'admin après 48h, et peut annuler automatiquement après 7 jours si la validation automatique est activée. Ne touche jamais aux commandes déjà confirmées ou en livraison.", connectable: true },
  { categorie: "Commerce", cle: "boutiques", libelle: "Certifications & Boosts", icon: `<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },

  { categorie: "Marketing & Contenu", cle: "bannieres", libelle: "Bannière publicitaire", icon: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".01"/>`, link: "../module-bannieres/module-bannieres.html", description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Marketing & Contenu", cle: "diffusion", libelle: "Diffusion", icon: `<path d="M4 11v2a1 1 0 0 0 1 1h2l4 4V6L7 10H5a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M19 5a9 9 0 0 1 0 14"/>`, link: "../module-diffusion/module-diffusion.html", description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Marketing & Contenu", cle: "crm", libelle: "CRM & Prospection", icon: `<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="m17 8 2 2 4-4"/>`, link: "../module-crm/module-crm.html", description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Marketing & Contenu", cle: "marketing", libelle: "Marketing & Publicité", icon: `<path d="m3 11 18-5-5 18-4-8-9-5z"/>`, link: "../module-marketing/module-marketing.html", description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Marketing & Contenu", cle: "contenus", libelle: "Contenus", icon: `<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="19" cy="17" r="3"/>`, link: "../module-contenus/module-contenus.html", description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },

  { categorie: "Automatisation & IA", cle: "automatisation", libelle: "Automatisation", icon: `<path d="M12 8V4H8"/><rect x="4" y="12" width="16" height="8" rx="2"/><path d="M2 16h2M20 16h2M9 16v2M15 16v2"/><circle cx="12" cy="8" r="4"/>`, link: "../module-automatisation/module-automatisation.html", estPageCourante: true, connectable: false },
  { categorie: "Automatisation & IA", cle: "assistant_ia", libelle: "Assistant IA", icon: `<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/>`, link: "../module-agent-ia/module-agent-ia.html", description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },

  { categorie: "Système", cle: "logs", libelle: "Journal d'activité", icon: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>`, description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Système", cle: "parametres", libelle: "Paramètres plateforme", icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`, link: "../module-personnalisation/module-personnalisation.html", description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true },
  { categorie: "Système", cle: "compte", libelle: "Mon compte", icon: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`, link: "../mon-compte/moncompte.html", description: "Module externe connecté au noyau AURA. Logique métier à configurer.", connectable: true }
];

/* ── Config par défaut appliquée à tout nouveau module connecté ────── */
const MAUT_CONFIG_DEFAUT = { actif: false, validation_auto: false, seuil_confiance: 0.85 };

/* ── État de connexion des modules externes ─────────────────────────
   MAUT_STORAGE_MODE bascule automatiquement sur "local" dès que le
   backend rejette une cle inconnue sur /toggle (voir connecterModuleExterne).
   Tant qu'il vaut "api", on retente l'API à chaque connexion. */
const MAUT_LS_CONNECTES = "aura_maut_modules_connectes";
let MAUT_STORAGE_MODE = "api"; // "api" | "local"

function lireModulesConnectesLocal() {
  try {
    const raw = localStorage.getItem(MAUT_LS_CONNECTES);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function ecrireModulesConnectesLocal(cles) {
  try {
    localStorage.setItem(MAUT_LS_CONNECTES, JSON.stringify(cles));
  } catch (e) { /* stockage indisponible : tant pis, session non persistée */ }
}

function estConnecteLocal(cle) {
  return lireModulesConnectesLocal().includes(cle);
}

function ajouterConnecteLocal(cle) {
  const cles = lireModulesConnectesLocal();
  if (!cles.includes(cle)) { cles.push(cle); ecrireModulesConnectesLocal(cles); }
}

function retirerConnecteLocal(cle) {
  ecrireModulesConnectesLocal(lireModulesConnectesLocal().filter(c => c !== cle));
}

/* ── Liste vivante des modules externes actuellement connectés ──────
   Le noyau ne doit rien savoir "en dur" du nombre de modules : il itère
   simplement sur cette liste, recalculée depuis _mautConfig (si le
   backend gère déjà la cle) + le stockage local (fallback). */
function getModulesExternesConnectes() {
  const externes = MAUT_TOUS_MODULES.filter(m => m.connectable);
  return externes.filter(m => {
    const enConfig = _mautConfig.some(c => c.cle === m.cle);
    return enConfig || estConnecteLocal(m.cle);
  });
}

function estModuleConnecte(cle) {
  return _mautConfig.some(c => c.cle === cle) || estConnecteLocal(cle);
}

/* ── Liste combinée : les 4 automatisations natives + tous les modules
   externes actuellement connectés. Utilisée par le noyau (stats hub) et
   le journal (filtre par module), qui ne doivent compter/lister QUE ce
   qui est réellement rattaché. */
function getModulesActifsDuNoyau() {
  return [...MAUT_SOUS_MODULES, ...getModulesExternesConnectes()];
}

/* ── Liste complète affichée dans la vue Réseau : natifs + TOUS les
   modules externes, connectés ou non. Un module non connecté apparaît
   comme un nœud "Non connecté" ; cliquer dessus le connecte au noyau
   au lieu d'ouvrir le panneau de configuration. */
function getTousLesNoeudsReseau() {
  return [...MAUT_SOUS_MODULES, ...MAUT_TOUS_MODULES.filter(m => m.connectable)];
}

/* ── Connexion / déconnexion d'un module externe au noyau ───────────
   Le Worker connaît désormais TOUTES les cles externes (voir
   /admin/automatisations/connecter et /deconnecter côté Worker + la
   contrainte automatisations_config_cle_check élargie côté Supabase) :
   la connexion crée réellement une ligne en base, elle n'est plus un
   simple artifice localStorage. Le stockage local ne sert plus que de
   filet de secours si l'appareil est hors-ligne ou en cas de panne
   ponctuelle du Worker/Supabase — un badge "non synchronisé" avertit
   alors que l'état n'est pas encore persistant côté serveur. */
async function connecterModuleExterne(cle) {
  try {
    const res = await API.post("/admin/automatisations/connecter", { cle });
    const ligne = res?.automatisation || { cle, ...MAUT_CONFIG_DEFAUT };
    if (!_mautConfig.some(c => c.cle === cle)) _mautConfig.push(ligne);
    ajouterConnecteLocal(cle); // aussi en local pour survivre à un redémarrage même si l'API est ok
    MAUT_STORAGE_MODE = "api";
    return { ok: true, mode: "api" };
  } catch (err) {
    console.warn("[connecterModuleExterne] Échec API, fallback localStorage :", err?.message);
    MAUT_STORAGE_MODE = "local";
    ajouterConnecteLocal(cle);
    return { ok: true, mode: "local" };
  }
}

async function deconnecterModuleExterne(cle) {
  try {
    await API.post("/admin/automatisations/deconnecter", { cle });
  } catch (err) {
    console.warn("[deconnecterModuleExterne] Échec API, déconnexion locale uniquement :", err?.message);
  }
  retirerConnecteLocal(cle);
  _mautConfig = _mautConfig.filter(c => c.cle !== cle);
  return { ok: true };
}

const MAUT_DECISION_LABELS = {
  valide: "Validé",
  rejete: "Rejeté",
  signale_urgent: "Signalé urgent",
  laisse_en_attente: "Laissé en attente",
  erreur: "Erreur"
};

const MAUT_DECISION_ICONS = {
  valide: `<path d="M20 6 9 17l-5-5"/>`,
  rejete: `<path d="M18 6 6 18M6 6l12 12"/>`,
  signale_urgent: `<path d="M12 9v4"/><path d="M12 17h.01"/><path d="m10.3 3.6-8 14A2 2 0 0 0 4 20.6h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/>`,
  laisse_en_attente: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>`,
  erreur: `<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>`
};

let _mautConfig = [];        // dernière config connue (4 lignes automatisations_config)
let _mautLogsCle = "";       // filtre courant de la vue Logs ("" = toutes)
// Le Worker ne supporte pas d'offset sur /logs (seulement cle + limit),
// donc "Charger plus" augmente simplement la limite demandée et
// recharge depuis le début (le tri created_at.desc reste stable).
const MAUT_LOGS_PAGE = 30;
let _mautLogsLimit = MAUT_LOGS_PAGE;
let _mautPendingRun = null;      // cle en attente de confirmation "Lancer maintenant"
let _mautPendingValAuto = null;  // {cle, value} en attente de confirmation validation_auto
let _mautPendingAnnuler = null;  // log en attente de confirmation d'annulation
let _mautPanelCle = null;        // cle du sous-module actuellement ouvert dans le panneau
let _mautRunningCle = null;      // cle dont l'exécution est visuellement "en cours" (pulse)
let _mautLogsAll = [];           // dernier lot de logs chargé (pour stats par module)

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initLogsFilterButtons();
  initModals();
  initPanel();
  initNetworkSearch();
  chargerConfig();
  chargerLogs(true);
});

/* ══════════════════ RECHERCHE (filtre les nœuds du réseau) ══════════════════ */

let _mautRechercheReseau = "";

function initNetworkSearch() {
  const input = document.getElementById("maut-modules-search");
  const clearBtn = document.getElementById("maut-modules-search-clear");

  input.addEventListener("input", () => {
    _mautRechercheReseau = input.value.trim().toLowerCase();
    clearBtn.style.display = _mautRechercheReseau ? "flex" : "none";
    renderNetwork();
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    _mautRechercheReseau = "";
    clearBtn.style.display = "none";
    renderNetwork();
    input.focus();
  });
}

/* ══════════════════ ONGLETS (Réseau / Journal) ══════════════════ */

function initTabs() {
  document.querySelectorAll(".maut-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".maut-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("maut-view-reseau").style.display = tab === "reseau" ? "" : "none";
      document.getElementById("maut-view-journal").style.display = tab === "journal" ? "" : "none";
    });
  });
}

function ouvrirJournal(cleFiltre) {
  document.querySelectorAll(".maut-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === "journal"));
  document.getElementById("maut-view-reseau").style.display = "none";
  document.getElementById("maut-view-journal").style.display = "";
  if (cleFiltre !== undefined) {
    document.querySelectorAll(".maut-filter-btn").forEach(b => b.classList.toggle("active", b.dataset.cle === cleFiltre));
    _mautLogsCle = cleFiltre;
    chargerLogs(true);
  }
}

/* ══════════════════ CHARGEMENT CONFIG + RENDU RÉSEAU ══════════════════ */

async function chargerConfig() {
  try {
    const res = await API.get("/admin/automatisations/liste");
    _mautConfig = Array.isArray(res?.automatisations) ? res.automatisations : [];
    renderNetwork();
    renderHubState();
    renderLogsFilterBar();
    if (_mautPanelCle) renderPanelContent(_mautPanelCle);
  } catch (err) {
    console.error("[DIAGNOSTIC chargerConfig] Erreur complète :", err);
    console.error("[DIAGNOSTIC chargerConfig] Type :", err?.name, "| Message :", err?.message, "| Stack :", err?.stack);
    const loading = document.getElementById("maut-network-loading");
    if (loading) loading.textContent = "ERREUR DEBUG : " + (err?.name || "?") + " — " + (err?.message || "message vide");
    showToast("Erreur : " + (err?.message || "inconnue"), true);
  }
}

function renderNetwork() {
  const container = document.getElementById("maut-network");

  // Le noyau/hub compte uniquement ce qui est réellement connecté ; la
  // vue réseau, elle, affiche TOUS les modules (connectés ou non) pour
  // que l'état de chacun soit visible et qu'on puisse s'y connecter
  // directement depuis un nœud.
  let modulesNoyau = getTousLesNoeudsReseau();
  if (_mautRechercheReseau) {
    modulesNoyau = modulesNoyau.filter(m =>
      m.libelle.toLowerCase().includes(_mautRechercheReseau) ||
      (m.categorie || "").toLowerCase().includes(_mautRechercheReseau)
    );
  }

  const emptySearch = document.getElementById("maut-network-empty-search");
  if (!modulesNoyau.length) {
    container.innerHTML = "";
    if (emptySearch) emptySearch.style.display = "block";
    return;
  }
  if (emptySearch) emptySearch.style.display = "none";

  // Un seul rendu de chaque nœud dans le DOM (pas de duplication) :
  // - la colonne gauche contient toujours TOUS les modules (mobile-first)
  // - à partir de 700px, le CSS masque la moitié dans la colonne gauche
  //   et les révèle à droite via une deuxième copie légère.
  //   Pour éviter les doublons d'ID/listeners, on garde une seule liste
  //   "left" en mobile et on la scinde réellement en 2 dès 700px via JS
  //   (le rendu est peu coûteux et évite toute duplication du DOM).
  const milieu = Math.ceil(modulesNoyau.length / 2);
  const gauche = modulesNoyau.slice(0, milieu);
  const droite = modulesNoyau.slice(milieu);
  const surMobile = window.matchMedia("(max-width: 699.98px)").matches;

  container.innerHTML = `
    <svg class="maut-connections" id="maut-connections"></svg>
    <div class="maut-nodes" data-side="left">${(surMobile ? modulesNoyau : gauche).map(renderNodeHtml).join("")}</div>
    <div class="maut-hub-col">
      <div class="maut-hub" id="maut-hub">
        <svg class="maut-hub-icon" viewBox="0 0 24 24">${MAUT_HUB_ICON}</svg>
        <div class="maut-hub-label">Aura<br>Automation Hub</div>
        <div class="maut-hub-stats">
          <div class="maut-hub-stat"><span class="maut-hub-stat-value" id="maut-hub-stat-actifs">—</span><span class="maut-hub-stat-label">Actifs</span></div>
          <div class="maut-hub-stat"><span class="maut-hub-stat-value" id="maut-hub-stat-attente">—</span><span class="maut-hub-stat-label">En attente</span></div>
        </div>
      </div>
    </div>
    <div class="maut-nodes" data-side="right">${(surMobile ? [] : droite).map(renderNodeHtml).join("")}</div>
  `;

  // Clic sur un nœud : s'il n'est pas encore connecté, on le connecte
  // directement (rien à configurer tant qu'il n'est pas rattaché) ;
  // sinon, on ouvre le panneau de configuration comme d'habitude.
  container.querySelectorAll(".maut-node").forEach(node => {
    node.addEventListener("click", async () => {
      const cle = node.dataset.cle;
      const meta = getMetaModule(cle);
      if (meta && meta.connectable && !estModuleConnecte(cle)) {
        node.style.pointerEvents = "none";
        try {
          const res = await connecterModuleExterne(cle);
          showToast(
            res.mode === "local"
              ? `« ${meta.libelle} » connecté (état non synchronisé côté serveur)`
              : `« ${meta.libelle} » connecté au noyau AURA`
          );
          renderNetwork();
          renderHubState();
          renderLogsFilterBar();
        } catch (err) {
          showToast("Échec de l'opération de connexion", true);
          node.style.pointerEvents = "";
        }
        return;
      }
      ouvrirPanel(cle);
    });
  });

  container.querySelectorAll(".maut-nodes").forEach(col => {
    col.addEventListener("scroll", () => requestAnimationFrame(dessinerConnexions), { passive: true });
  });

  requestAnimationFrame(dessinerConnexions);
}

/* ── Dessin des fils SVG reliant chaque nœud au noyau ──────────────
   Recalculé à chaque rendu, au resize et au scroll de la liste des
   nœuds (le noyau reste sticky, donc sa position change moins souvent
   que celle des nœuds qui défilent). Purement visuel : ne pilote rien. */
function dessinerConnexions() {
  const container = document.getElementById("maut-network");
  const svg = document.getElementById("maut-connections");
  const hub = document.getElementById("maut-hub");
  if (!container || !svg || !hub) return;

  const cRect = container.getBoundingClientRect();
  svg.setAttribute("width", cRect.width);
  svg.setAttribute("height", cRect.height);
  svg.setAttribute("viewBox", `0 0 ${cRect.width} ${cRect.height}`);

  const hubRect = hub.getBoundingClientRect();
  const hubX = hubRect.left - cRect.left + hubRect.width / 2;
  const hubY = hubRect.top - cRect.top + hubRect.height / 2;
  const hubHalfW = hubRect.width / 2;

  let paths = "";
  container.querySelectorAll(".maut-node").forEach(node => {
    const nodesCol = node.closest(".maut-nodes");
    const nRect = node.getBoundingClientRect();
    const colRect = nodesCol?.getBoundingClientRect();
    // Nœud masqué par le scroll interne de sa colonne (au-dessus ou en
    // dessous de la zone visible) : on ne trace pas son fil pour éviter
    // qu'il ne déborde visuellement hors de la liste.
    if (colRect && (nRect.bottom <= colRect.top || nRect.top >= colRect.bottom)) return;
    const side = node.closest(".maut-nodes")?.dataset.side || "left";
    const nodeX = side === "left" ? (nRect.right - cRect.left) : (nRect.left - cRect.left);
    const nodeY = nRect.top - cRect.top + nRect.height / 2;

    // Point d'ancrage sur le cercle du hub, côté du nœud
    const hubEdgeX = side === "left" ? hubX - hubHalfW : hubX + hubHalfW;

    const midX = (nodeX + hubEdgeX) / 2;
    const d = `M ${nodeX} ${nodeY} C ${midX} ${nodeY}, ${midX} ${hubY}, ${hubEdgeX} ${hubY}`;

    const cle = node.dataset.cle;
    const cfg = _mautConfig.find(c => c.cle === cle);
    const enAlerte = estEnAlerte(cle);
    const classe = enAlerte ? "is-alert" : (cfg?.actif ? "is-active" : "");
    const running = cle === _mautRunningCle ? "is-running" : "";

    paths += `<path class="maut-connection-line ${classe}" d="${d}"></path>`;
    if (running) {
      paths += `<circle class="maut-connection-pulse ${running}" r="3.5" style="offset-path:path('${d}')"></circle>`;
    }
  });

  svg.innerHTML = paths;
}

let _mautEtaitMobile = window.matchMedia("(max-width: 699.98px)").matches;
window.addEventListener("resize", () => {
  const estMobile = window.matchMedia("(max-width: 699.98px)").matches;
  if (estMobile !== _mautEtaitMobile) {
    _mautEtaitMobile = estMobile;
    renderNetwork(); // la répartition des nœuds entre colonnes change
  } else {
    requestAnimationFrame(dessinerConnexions);
  }
});

/* Seul cas d'alerte natif connu à ce jour : publication_tiktok (pas de
   clé API configurée). Les modules externes n'ont pas de logique métier
   propre encore définie, donc aucune alerte automatique pour eux. */
function estEnAlerte(cle) {
  return cle === "publication_tiktok";
}

function renderNodeHtml(meta) {
  const estNatif = !!meta.natif;
  const connecte = estNatif || estModuleConnecte(meta.cle);

  if (!connecte) {
    return `
      <button type="button" class="maut-node is-not-connected" data-cle="${meta.cle}">
        <div class="maut-node-icon"><svg viewBox="0 0 24 24">${meta.icon}</svg></div>
        <div class="maut-node-info">
          <div class="maut-node-title">${meta.libelle}</div>
          <div class="maut-node-status">Non connecté</div>
        </div>
        <span class="maut-node-connect-hint">Connecter</span>
      </button>
    `;
  }

  const cfg = _mautConfig.find(c => c.cle === meta.cle) || { cle: meta.cle, actif: false, validation_auto: false, seuil_confiance: 0.85 };
  const enAlerte = estEnAlerte(meta.cle);
  const nonSync = !estNatif && MAUT_STORAGE_MODE === "local" && !_mautConfig.some(c => c.cle === meta.cle);
  const etatClasses = [
    cfg.actif ? "is-active" : "is-inactive",
    enAlerte ? "is-alert" : ""
  ].filter(Boolean).join(" ");
  const statutLabel = enAlerte ? "En attente" : (cfg.actif ? "Actif" : "Inactif");

  return `
    <button type="button" class="maut-node ${etatClasses}" data-cle="${meta.cle}">
      <div class="maut-node-icon"><svg viewBox="0 0 24 24">${meta.icon}</svg></div>
      <div class="maut-node-info">
        <div class="maut-node-title">${meta.libelle}${nonSync ? ` <span class="maut-node-nosync" title="État non synchronisé côté serveur">•</span>` : ""}</div>
        <div class="maut-node-status"><span class="maut-dot"></span>${statutLabel}</div>
      </div>
      <svg class="maut-node-chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `;
}

function renderHubState() {
  const modulesNoyau = getModulesActifsDuNoyau();
  const clesNoyau = new Set(modulesNoyau.map(m => m.cle));
  const nbActifs = _mautConfig.filter(c => clesNoyau.has(c.cle) && c.actif).length;
  const attenteStats = calcStatsGlobales();

  const actifsEl = document.getElementById("maut-hub-stat-actifs");
  const attenteEl = document.getElementById("maut-hub-stat-attente");
  if (actifsEl) actifsEl.textContent = `${nbActifs}/${modulesNoyau.length}`;
  if (attenteEl) attenteEl.textContent = String(attenteStats.enAttente);

  requestAnimationFrame(dessinerConnexions);

  const topbarState = document.getElementById("maut-topbar-state");
  const topbarLabel = document.getElementById("maut-topbar-state-label");
  if (!topbarState || !topbarLabel) return;

  topbarState.classList.remove("ok", "alert", "off");
  if (nbActifs === 0) {
    topbarState.classList.add("off");
    topbarLabel.textContent = "Inactif";
  } else if (attenteStats.erreurs > 0) {
    topbarState.classList.add("alert");
    topbarLabel.textContent = "Attention requise";
  } else {
    topbarState.classList.add("ok");
    topbarLabel.textContent = "Opérationnel";
  }
}

function calcStatsGlobales() {
  // Dérivé du dernier lot de logs chargé (pas d'appel réseau supplémentaire).
  const aujourdHui = new Date().toDateString();
  let executionsAuj = 0, enAttente = 0, erreurs = 0;
  _mautLogsAll.forEach(log => {
    if (log.created_at && new Date(log.created_at).toDateString() === aujourdHui) executionsAuj++;
    if (log.decision === "laisse_en_attente") enAttente++;
    if (log.decision === "erreur") erreurs++;
  });
  return { executionsAuj, enAttente, erreurs };
}

/* ══════════════════ PANNEAU LATÉRAL ══════════════════ */

function initPanel() {
  document.getElementById("maut-panel-close").addEventListener("click", fermerPanel);
  document.getElementById("maut-panel-overlay").addEventListener("click", (e) => {
    if (e.target.id === "maut-panel-overlay") fermerPanel();
  });

  document.getElementById("maut-panel-toggle-actif").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const cle = _mautPanelCle;
    const nouveauActif = !btn.classList.contains("on");
    btn.classList.toggle("on", nouveauActif);
    envoyerToggle(cle, { actif: nouveauActif }, btn, "on", () => {
      renderNetwork();
      renderHubState();
    });
  });

  document.getElementById("maut-panel-toggle-valauto").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const cle = _mautPanelCle;
    const meta = getMetaModule(cle);
    const activer = !btn.classList.contains("on");
    if (activer) {
      _mautPendingValAuto = { cle, btn };
      document.getElementById("maut-valauto-text").textContent =
        `À partir du seuil de confiance choisi, « ${meta.libelle} » appliquera lui-même ses décisions sans passer par un admin. Toute décision reste annulable dans le journal.`;
      document.getElementById("maut-valauto-overlay").classList.add("show");
    } else {
      btn.classList.remove("on");
      envoyerToggle(cle, { validation_auto: false }, btn, "on");
    }
  });

  const slider = document.getElementById("maut-panel-seuil");
  const valueLabel = document.getElementById("maut-panel-seuil-value");
  slider.addEventListener("input", () => {
    valueLabel.textContent = `${slider.value}%`;
  });
  slider.addEventListener("change", () => {
    envoyerToggle(_mautPanelCle, { seuil_confiance: Number(slider.value) / 100 });
  });

  document.getElementById("maut-panel-run").addEventListener("click", () => {
    const cle = _mautPanelCle;
    const meta = getMetaModule(cle);
    _mautPendingRun = cle;
    document.getElementById("maut-run-text").textContent =
      `Lancer immédiatement le traitement « ${meta.libelle} » pour les éléments en attente (hors cron) ?`;
    document.getElementById("maut-run-overlay").classList.add("show");
  });

  document.getElementById("maut-panel-journal-link").addEventListener("click", () => {
    const cle = _mautPanelCle;
    fermerPanel();
    ouvrirJournal(cle);
  });

  const deconnectBtn = document.getElementById("maut-panel-deconnect");
  if (deconnectBtn) {
    deconnectBtn.addEventListener("click", async () => {
      const cle = _mautPanelCle;
      const meta = getMetaModule(cle);
      if (!cle || !meta) return;
      deconnectBtn.disabled = true;
      deconnectBtn.textContent = "Déconnexion…";
      try {
        await deconnecterModuleExterne(cle);
        showToast(`« ${meta.libelle} » déconnecté du noyau`);
        fermerPanel();
        renderNetwork();
        renderHubState();
        renderLogsFilterBar(); // regénère les filtres du journal (module retiré)
      } catch (err) {
        showToast("Échec de la déconnexion", true);
      } finally {
        deconnectBtn.disabled = false;
        deconnectBtn.textContent = "Déconnecter ce module du noyau";
      }
    });
  }
}

function ouvrirPanel(cle) {
  _mautPanelCle = cle;
  renderPanelContent(cle);
  document.getElementById("maut-panel-overlay").classList.add("show");
}

function fermerPanel() {
  document.getElementById("maut-panel-overlay").classList.remove("show");
  _mautPanelCle = null;
}

function getMetaModule(cle) {
  return MAUT_SOUS_MODULES.find(m => m.cle === cle) || MAUT_TOUS_MODULES.find(m => m.cle === cle);
}

function renderPanelContent(cle) {
  const meta = getMetaModule(cle);
  const cfg = _mautConfig.find(c => c.cle === cle) || { cle, ...MAUT_CONFIG_DEFAUT };
  if (!meta) return;

  document.getElementById("maut-panel-icon").innerHTML = `<svg viewBox="0 0 24 24">${meta.icon}</svg>`;
  document.getElementById("maut-panel-title").textContent = meta.libelle;
  document.getElementById("maut-panel-desc").textContent = meta.description;

  // Bouton Déconnecter dans le panneau, uniquement pour les modules
  // externes (les 4 automatisations natives n'ont pas ce bouton).
  const deconnectRow = document.getElementById("maut-panel-deconnect-row");
  if (deconnectRow) deconnectRow.style.display = meta.natif ? "none" : "flex";

  document.getElementById("maut-panel-toggle-actif").classList.toggle("on", !!cfg.actif);
  document.getElementById("maut-panel-toggle-valauto").classList.toggle("on", !!cfg.validation_auto);

  const seuilPct = Math.round((cfg.seuil_confiance ?? 0.85) * 100);
  document.getElementById("maut-panel-seuil").value = seuilPct;
  document.getElementById("maut-panel-seuil-value").textContent = `${seuilPct}%`;

  const logsModule = _mautLogsAll.filter(l => l.automatisation_cle === cle);
  const aujourdHui = new Date().toDateString();
  const execAuj = logsModule.filter(l => l.created_at && new Date(l.created_at).toDateString() === aujourdHui).length;
  const enAttente = logsModule.filter(l => l.decision === "laisse_en_attente").length;
  document.getElementById("maut-panel-stat-exec").textContent = String(execAuj);
  document.getElementById("maut-panel-stat-attente").textContent = String(enAttente);

  const dernier = logsModule[0];
  document.getElementById("maut-panel-lastrun").textContent = dernier
    ? `Dernière exécution : ${formatDate(dernier.created_at)} — ${MAUT_DECISION_LABELS[dernier.decision] || dernier.decision}`
    : "Aucune exécution enregistrée pour l'instant.";
}

/* ── Toggle générique (actif / validation_auto / seuil_confiance) ── */
async function envoyerToggle(cle, patch, btnToRevert, classToRevert, onSuccess) {
  try {
    await API.post("/admin/automatisations/toggle", { cle, ...patch });
    showToast("Réglage mis à jour");
    // Met à jour le cache local pour rester cohérent sans recharger
    const cfg = _mautConfig.find(c => c.cle === cle);
    if (cfg) Object.assign(cfg, patch);
    if (typeof onSuccess === "function") onSuccess();
  } catch (err) {
    showToast("Échec de la mise à jour du réglage", true);
    if (btnToRevert && classToRevert) btnToRevert.classList.toggle(classToRevert);
    chargerConfig(); // resynchronise avec l'état réel
  }
}

/* ══════════════════ MODALES : Lancer / Valider auto / Annuler ══════════════════ */

function initModals() {
  document.getElementById("maut-run-cancel").addEventListener("click", () => {
    _mautPendingRun = null;
    document.getElementById("maut-run-overlay").classList.remove("show");
  });
  document.getElementById("maut-run-ok").addEventListener("click", onConfirmRun);

  document.getElementById("maut-valauto-cancel").addEventListener("click", () => {
    _mautPendingValAuto = null;
    document.getElementById("maut-valauto-overlay").classList.remove("show");
  });
  document.getElementById("maut-valauto-ok").addEventListener("click", onConfirmValAuto);

  document.getElementById("maut-annuler-cancel").addEventListener("click", () => {
    _mautPendingAnnuler = null;
    document.getElementById("maut-annuler-overlay").classList.remove("show");
  });
  document.getElementById("maut-annuler-ok").addEventListener("click", onConfirmAnnuler);
}

async function onConfirmRun() {
  if (!_mautPendingRun) return;
  const cle = _mautPendingRun;
  const overlay = document.getElementById("maut-run-overlay");
  const okBtn = document.getElementById("maut-run-ok");
  okBtn.disabled = true;
  okBtn.textContent = "Lancement…";

  _mautRunningCle = cle;
  marquerNoeudEnCours(cle, true);

  try {
    const res = await API.post("/admin/automatisations/executer", { cle });
    const resultat = res?.resultat;
    if (resultat?.erreur) {
      showToast(resultat.erreur, true);
    } else {
      const traites = resultat?.traites ?? 0;
      showToast(traites > 0 ? `Traitement lancé — ${traites} élément(s) traité(s)` : "Aucun élément en attente à traiter");
    }
    chargerLogs(true);
    chargerConfig();
  } catch (err) {
    showToast("Échec du lancement du traitement", true);
  } finally {
    okBtn.disabled = false;
    okBtn.textContent = "Lancer";
    overlay.classList.remove("show");
    _mautPendingRun = null;
    marquerNoeudEnCours(cle, false);
    _mautRunningCle = null;
  }
}

function marquerNoeudEnCours(cle, enCours) {
  const node = document.querySelector(`.maut-node[data-cle="${cle}"]`);
  if (node) node.classList.toggle("is-running", enCours);
  requestAnimationFrame(dessinerConnexions);
}

async function onConfirmValAuto() {
  if (!_mautPendingValAuto) return;
  const { cle, btn } = _mautPendingValAuto;
  const overlay = document.getElementById("maut-valauto-overlay");

  try {
    await API.post("/admin/automatisations/toggle", { cle, validation_auto: true });
    btn.classList.add("on");
    const cfg = _mautConfig.find(c => c.cle === cle);
    if (cfg) cfg.validation_auto = true;
    showToast("Validation automatique activée");
  } catch (err) {
    showToast("Échec de l'activation", true);
  } finally {
    overlay.classList.remove("show");
    _mautPendingValAuto = null;
  }
}

async function onConfirmAnnuler() {
  if (!_mautPendingAnnuler) return;
  const log = _mautPendingAnnuler;
  const overlay = document.getElementById("maut-annuler-overlay");
  const okBtn = document.getElementById("maut-annuler-ok");
  okBtn.disabled = true;
  okBtn.textContent = "Annulation…";

  try {
    const user = AURA_AUTH.getUser();
    const adminId = user?.id || user?.sub || null;
    if (!adminId) {
      showToast("Session admin introuvable, reconnecte-toi", true);
      return;
    }
    await API.post("/admin/automatisations/annuler", { log_id: log.id, admin_id: adminId });
    showToast("Décision annulée, élément remis en attente");
    chargerLogs(true);
  } catch (err) {
    showToast("Échec de l'annulation", true);
  } finally {
    okBtn.disabled = false;
    okBtn.textContent = "Annuler la décision";
    overlay.classList.remove("show");
    _mautPendingAnnuler = null;
  }
}

/* ══════════════════ LOGS ══════════════════ */

/* Libellés courts pour les boutons de filtre (les descriptions longues
   servent au panneau, pas ici). Fallback : premier mot du libellé complet. */
const MAUT_FILTRE_LIBELLES = {
  moderation_produits: "Produits",
  verification_kyc: "KYC",
  analyse_signalements: "Signalements",
  publication_tiktok: "TikTok"
};

function renderLogsFilterBar() {
  const bar = document.getElementById("maut-logs-filter");
  if (!bar) return;
  const modulesNoyau = getModulesActifsDuNoyau();

  bar.innerHTML = [
    `<button type="button" class="maut-filter-btn${_mautLogsCle === "" ? " active" : ""}" data-cle="">Toutes</button>`,
    ...modulesNoyau.map(m => {
      const label = MAUT_FILTRE_LIBELLES[m.cle] || m.libelle;
      return `<button type="button" class="maut-filter-btn${_mautLogsCle === m.cle ? " active" : ""}" data-cle="${m.cle}">${label}</button>`;
    })
  ].join("");

  bar.querySelectorAll(".maut-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      bar.querySelectorAll(".maut-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mautLogsCle = btn.dataset.cle;
      chargerLogs(true);
    });
  });
}

let _mautLoadMoreListenerAttache = false;
function initLogsFilterButtons() {
  renderLogsFilterBar();

  if (!_mautLoadMoreListenerAttache) {
    document.getElementById("maut-logs-loadmore").addEventListener("click", () => {
      _mautLogsLimit += MAUT_LOGS_PAGE;
      chargerLogs(false);
    });
    _mautLoadMoreListenerAttache = true;
  }
}

async function chargerLogs(reset) {
  const listEl = document.getElementById("maut-logs-list");
  const loadMoreBtn = document.getElementById("maut-logs-loadmore");

  if (reset) {
    _mautLogsLimit = MAUT_LOGS_PAGE;
    listEl.innerHTML = `<div class="maut-empty" id="maut-logs-loading">Chargement…</div>`;
  }

  try {
    const params = new URLSearchParams();
    if (_mautLogsCle) params.set("cle", _mautLogsCle);
    params.set("limit", String(_mautLogsLimit));

    const res = await API.get(`/admin/automatisations/logs?${params.toString()}`);
    const logs = Array.isArray(res?.logs) ? res.logs : [];

    // Le lot "Toutes" (sans filtre) sert de source pour les stats du noyau
    // et du panneau ; si l'utilisateur filtre par module, on ne remplace
    // pas ce cache global.
    if (!_mautLogsCle) {
      _mautLogsAll = logs;
      renderHubState();
      if (_mautPanelCle) renderPanelContent(_mautPanelCle);
    }

    listEl.innerHTML = "";

    if (logs.length === 0) {
      listEl.innerHTML = `<div class="maut-empty">Aucune décision enregistrée pour ce filtre.</div>`;
      loadMoreBtn.style.display = "none";
      return;
    }

    logs.forEach(log => listEl.appendChild(buildLogItem(log)));

    // Si on a reçu autant de lignes que la limite demandée, il y en a
    // probablement d'autres au-delà : on propose de charger plus.
    loadMoreBtn.style.display = logs.length >= _mautLogsLimit ? "block" : "none";
  } catch (err) {
    console.error("[DIAGNOSTIC chargerLogs] Erreur complète :", err);
    console.error("[DIAGNOSTIC chargerLogs] Type :", err?.name, "| Message :", err?.message, "| Stack :", err?.stack);
    listEl.innerHTML = `<div class="maut-empty">ERREUR DEBUG : ${err?.name || "?"} — ${err?.message || "message vide"}</div>`;
    showToast("Erreur journal : " + (err?.message || "inconnue"), true);
  }
}

function buildLogItem(log) {
  const el = document.createElement("div");
  el.className = "maut-log-item";

  const decision = log.decision || "erreur";
  const meta = getMetaModule(log.automatisation_cle);
  const libelle = meta ? meta.libelle : log.automatisation_cle;
  const decisionLabel = MAUT_DECISION_LABELS[decision] || decision;
  const decisionIcon = MAUT_DECISION_ICONS[decision] || MAUT_DECISION_ICONS.erreur;
  const confPct = log.confiance !== null && log.confiance !== undefined
    ? `${Math.round(log.confiance * 100)}% confiance`
    : null;
  const dateStr = log.created_at ? formatDate(log.created_at) : "";
  const estAnnule = !!log.annule_par_admin;
  const peutAnnuler = (decision === "valide" || decision === "rejete" || decision === "signale_urgent") && !estAnnule;

  el.innerHTML = `
    <div class="maut-log-badge ${decision}"><svg viewBox="0 0 24 24">${decisionIcon}</svg></div>
    <div class="maut-log-info">
      <div class="maut-log-top">
        <span class="maut-log-cle">${libelle}</span>
        <span class="maut-log-decision ${decision}">${decisionLabel}</span>
        ${estAnnule ? `<span class="maut-log-cancelled">Annulée</span>` : ""}
      </div>
      ${log.motif ? `<div class="maut-log-motif">${escapeHtml(log.motif)}</div>` : ""}
      <div class="maut-log-meta">
        ${confPct ? `<span class="maut-log-conf">${confPct}</span>` : ""}
        <span class="maut-log-date">${dateStr}</span>
      </div>
    </div>
    ${peutAnnuler ? `<button type="button" class="maut-log-annuler" aria-label="Annuler la décision"><svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 1 0-2.6-6.4L3 13"/></svg></button>` : ""}
  `;

  const annulerBtn = el.querySelector(".maut-log-annuler");
  if (annulerBtn) {
    annulerBtn.addEventListener("click", () => {
      _mautPendingAnnuler = log;
      document.getElementById("maut-annuler-text").textContent =
        `Remettre cet élément (${libelle}) en statut « en attente » et annuler la décision « ${decisionLabel} » ? Un admin devra la retraiter manuellement.`;
      document.getElementById("maut-annuler-overlay").classList.add("show");
    });
  }

  return el;
}

/* ══════════════════ UTILITAIRES ══════════════════ */

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return iso;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let _mautToastTimer = null;
function showToast(message, isError) {
  const toast = document.getElementById("maut-toast");
  toast.textContent = message;
  toast.classList.remove("error", "success");
  toast.classList.add(isError ? "error" : "success");
  toast.classList.add("show");
  clearTimeout(_mautToastTimer);
  _mautToastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}
