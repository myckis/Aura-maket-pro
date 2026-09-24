/**
 * AURA MARKET — Module Équipe IA (Admin)
 * Fichier : assets/module-equipe-ia/module-equipe-ia.js
 * Dépend de : ../js/config.js (AURA_CONFIG, AURA_AUTH, API)
 *
 * L'admin donne UN objectif au DG IA, qui le décompose en missions
 * confiées aux agents de l'équipe (ia_agents). Cet écran sert à :
 *  - donner l'ordre et voir le plan du DG,
 *  - suivre l'avancement des missions et le fil de discussion des agents,
 *  - autoriser ou refuser les missions qui attendent une décision humaine.
 *
 * Routes Worker utilisées :
 *   POST /admin/ia/objectifs   { libelle, admin_id }
 *   GET  /admin/ia/objectifs
 *   GET  /admin/ia/objectif?id=...
 *   GET  /admin/ia/agents
 *   POST /admin/ia/executer
 *   POST /admin/ia/valider     { tache_id, admin_id, refuser?, motif? }
 *
 * Tous les textes affichés viennent de la base ou d'un modèle de langage :
 * ils passent donc TOUS par escapeHtml avant insertion dans le DOM.
 */
"use strict";

const MEIA_STATUTS_OBJECTIF = {
  nouveau: "Nouveau",
  en_analyse: "Analyse du DG",
  en_cours: "En cours",
  attente_validation: "Ton autorisation",
  termine: "Terminé",
  echec: "Échec",
  suspendu: "Suspendu"
};

const MEIA_STATUTS_TACHE = {
  en_attente: "En attente",
  prete: "Prête",
  en_cours: "En cours",
  attente_validation: "Ton autorisation",
  terminee: "Terminée",
  bloquee: "Bloquée",
  echec: "Échec",
  annulee: "Annulée"
};

const MEIA_DEPARTEMENTS = {
  direction: "Direction",
  commercial: "Commercial",
  marketing: "Marketing & Contenu",
  operations: "Opérations"
};

const MEIA_STATUTS_ACTIFS = ["nouveau", "en_analyse", "en_cours"];
const MEIA_POLL_MS = 12000;

let _meiaVue = "objectifs";       // "objectifs" | "equipe" | "detail"
let _meiaObjectifs = [];
let _meiaObjectifId = null;
let _meiaDetail = null;           // { objectif, taches, messages, agents }
let _meiaPollTimer = null;
let _meiaPendingValidation = null; // { tacheId, titre }

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initOrdre();
  initDetailActions();
  initModal();
  document.getElementById("meia-back").addEventListener("click", onBack);
  chargerObjectifs();
});

/* ══════════════════ NAVIGATION ══════════════════ */

function initTabs() {
  document.querySelectorAll(".meia-tab").forEach(btn => {
    btn.addEventListener("click", () => afficherVue(btn.dataset.tab));
  });
}

function afficherVue(vue) {
  _meiaVue = vue;
  arreterPolling();

  document.querySelectorAll(".meia-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === vue));
  document.getElementById("meia-tabs").style.display = vue === "detail" ? "none" : "flex";
  document.getElementById("meia-view-objectifs").style.display = vue === "objectifs" ? "" : "none";
  document.getElementById("meia-view-equipe").style.display = vue === "equipe" ? "" : "none";
  document.getElementById("meia-detail").style.display = vue === "detail" ? "" : "none";
  document.getElementById("meia-topbar-title").textContent = vue === "detail" ? "Objectif" : "Équipe IA";

  if (vue === "equipe") chargerEquipe();
  if (vue === "objectifs") chargerObjectifs();
}

function onBack() {
  if (_meiaVue === "detail") {
    _meiaObjectifId = null;
    _meiaDetail = null;
    afficherVue("objectifs");
    return;
  }
  window.location.href = "../../dashboard.html";
}

/* ══════════════════ DONNER UN ORDRE AU DG ══════════════════ */

function initOrdre() {
  document.getElementById("meia-ordre-btn").addEventListener("click", donnerOrdre);
  document.getElementById("meia-diagnostic-btn").addEventListener("click", lancerDiagnostic);
}

/* Vérifie Supabase, la table des agents et Groq, et affiche le résultat
   en clair : quand un objectif échoue, c'est presque toujours l'une de
   ces trois dépendances. */
async function lancerDiagnostic() {
  const btn = document.getElementById("meia-diagnostic-btn");
  const zone = document.getElementById("meia-diagnostic-etat");
  btn.disabled = true;
  btn.textContent = "Test en cours…";
  zone.style.display = "block";
  zone.textContent = "Vérification de Supabase, des agents et de Groq…";

  try {
    const r = await API.get("/admin/ia/diagnostic");
    const lignes = [
      `Supabase : ${r.supabase || "?"}`,
      `Agents : ${r.agents || "?"}`,
      `Modèles utilisables : ${r.modeles_utilisables || "?"}`,
      `Modèle choisi : ${r.modele_choisi || "aucun"}`,
      `Groq (le moteur des agents) : ${r.groq || "?"}`
    ];
    zone.textContent = lignes.join("\n");
    zone.style.whiteSpace = "pre-wrap";
  } catch (err) {
    zone.textContent = "Diagnostic impossible : " + (err?.message || "erreur inconnue");
  } finally {
    btn.disabled = false;
    btn.textContent = "Tester la connexion de l'équipe IA";
  }
}

async function donnerOrdre() {
  const input = document.getElementById("meia-ordre-input");
  const btn = document.getElementById("meia-ordre-btn");
  const etat = document.getElementById("meia-ordre-etat");
  const libelle = input.value.trim();

  if (libelle.length < 10) {
    showToast("Décris ton objectif en une phrase complète", true);
    input.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "Le DG analyse…";
  etat.style.display = "block";
  etat.textContent = "Le DG IA analyse ton objectif et répartit les missions dans l'équipe…";

  try {
    const res = await API.post("/admin/ia/objectifs", { libelle, admin_id: getAdminId() });
    const nbTaches = Array.isArray(res?.taches) ? res.taches.length : 0;
    etat.textContent = `${res?.analyse ? res.analyse + " " : ""}${nbTaches} mission(s) confiée(s) à l'équipe.`;
    input.value = "";
    showToast(`Objectif confié — ${nbTaches} mission(s) créée(s)`);
    await chargerObjectifs();
    if (res?.objectif_id) ouvrirDetail(res.objectif_id);
  } catch (err) {
    etat.textContent = "Échec : " + (err?.message || "erreur inconnue");
    showToast("Le DG n'a pas pu traiter l'objectif", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Confier au DG IA";
  }
}

/* ══════════════════ LISTE DES OBJECTIFS ══════════════════ */

async function chargerObjectifs() {
  const liste = document.getElementById("meia-objectifs-list");
  try {
    const res = await API.get("/admin/ia/objectifs");
    _meiaObjectifs = Array.isArray(res?.objectifs) ? res.objectifs : [];
    renderObjectifs();
    renderEtatTopbar();
  } catch (err) {
    liste.innerHTML = `<div class="meia-empty">Erreur de chargement : ${escapeHtml(err?.message || "inconnue")}</div>`;
  }
}

function renderObjectifs() {
  const liste = document.getElementById("meia-objectifs-list");

  if (!_meiaObjectifs.length) {
    liste.innerHTML = `<div class="meia-empty">Aucun objectif pour l'instant. Donne ton premier ordre au DG IA ci-dessus.</div>`;
    return;
  }

  liste.innerHTML = _meiaObjectifs.map(o => `
    <button type="button" class="meia-objectif-card" data-id="${escapeHtml(o.id)}">
      <div class="meia-objectif-top">
        <span class="meia-objectif-libelle">${escapeHtml(o.libelle)}</span>
        <span class="meia-badge ${escapeHtml(o.statut)}">${escapeHtml(MEIA_STATUTS_OBJECTIF[o.statut] || o.statut)}</span>
      </div>
      <div class="meia-objectif-bas">
        <span class="meia-objectif-date">${escapeHtml(formatDate(o.created_at))}</span>
      </div>
      ${o.statut === "echec" && o.rapport_final
        ? `<div class="meia-mission-erreur">${escapeHtml(o.rapport_final)}</div>`
        : ""}
    </button>
  `).join("");

  liste.querySelectorAll(".meia-objectif-card").forEach(card => {
    card.addEventListener("click", () => ouvrirDetail(card.dataset.id));
  });
}

function renderEtatTopbar() {
  const wrap = document.getElementById("meia-topbar-state");
  const label = document.getElementById("meia-topbar-state-label");
  wrap.classList.remove("ok", "work", "alert");

  const attente = _meiaObjectifs.some(o => o.statut === "attente_validation");
  const actifs = _meiaObjectifs.some(o => o.statut === "en_cours" || o.statut === "en_analyse");

  if (attente) {
    wrap.classList.add("alert");
    label.textContent = "Validation requise";
  } else if (actifs) {
    wrap.classList.add("work");
    label.textContent = "Équipe au travail";
  } else {
    wrap.classList.add("ok");
    label.textContent = "Équipe disponible";
  }
}

/* ══════════════════ DÉTAIL D'UN OBJECTIF ══════════════════ */

function initDetailActions() {
  document.getElementById("meia-avancer-btn").addEventListener("click", avancerMaintenant);
}

async function ouvrirDetail(id) {
  _meiaObjectifId = id;
  afficherVue("detail");
  document.getElementById("meia-missions").innerHTML = `<div class="meia-empty">Chargement des missions…</div>`;
  document.getElementById("meia-fil").innerHTML = "";
  await rafraichirDetail();
}

async function rafraichirDetail() {
  if (!_meiaObjectifId) return;
  try {
    _meiaDetail = await API.get(`/admin/ia/objectif?id=${encodeURIComponent(_meiaObjectifId)}`);
    renderDetail();
    planifierPolling();
  } catch (err) {
    document.getElementById("meia-missions").innerHTML =
      `<div class="meia-empty">Erreur : ${escapeHtml(err?.message || "inconnue")}</div>`;
  }
}

function renderDetail() {
  if (!_meiaDetail?.objectif) return;
  const { objectif, taches, messages, agents } = _meiaDetail;
  const agentsParCle = new Map((agents || []).map(a => [a.cle, a]));
  const tachesParId = new Map((taches || []).map(t => [t.id, t]));

  document.getElementById("meia-detail-libelle").textContent = objectif.libelle;
  document.getElementById("meia-detail-meta").innerHTML = `
    <span class="meia-badge ${escapeHtml(objectif.statut)}">${escapeHtml(MEIA_STATUTS_OBJECTIF[objectif.statut] || objectif.statut)}</span>
    <span class="meia-objectif-date">${escapeHtml(formatDate(objectif.created_at))}</span>
  `;

  const terminees = (taches || []).filter(t => t.statut === "terminee").length;
  const total = (taches || []).length;
  const pct = total ? Math.round((terminees / total) * 100) : 0;
  document.getElementById("meia-progress-bar").style.width = `${pct}%`;
  document.getElementById("meia-progress-label").textContent = `${terminees}/${total} mission(s) terminée(s)`;

  const rapportEl = document.getElementById("meia-rapport");
  if (objectif.rapport_final) {
    rapportEl.style.display = "block";
    rapportEl.textContent = objectif.rapport_final;
    rapportEl.classList.toggle("is-echec", objectif.statut === "echec");
  } else {
    rapportEl.style.display = "none";
  }

  document.getElementById("meia-avancer-btn").style.display =
    MEIA_STATUTS_ACTIFS.includes(objectif.statut) || objectif.statut === "attente_validation" ? "" : "none";

  renderMissions(taches || [], agentsParCle, tachesParId);
  renderFil(messages || [], agentsParCle);
}

function renderMissions(taches, agentsParCle, tachesParId) {
  const wrap = document.getElementById("meia-missions");
  if (!taches.length) {
    wrap.innerHTML = `<div class="meia-empty">Aucune mission sur cet objectif.</div>`;
    return;
  }

  wrap.innerHTML = taches.map(t => {
    const agent = agentsParCle.get(t.agent_cle);
    const nomAgent = agent?.libelle || t.agent_cle;
    const classe = t.statut === "en_cours" ? "is-active" : (t.statut === "attente_validation" ? "is-attente" : "");

    const dependances = (t.depend_de || [])
      .map(id => tachesParId.get(id))
      .filter(Boolean)
      .filter(d => d.statut !== "terminee");
    const attenteHtml = dependances.length
      ? `<div class="meia-mission-attente">Attend : ${dependances.map(d => escapeHtml(d.titre)).join(" · ")}</div>`
      : "";

    const resumeHtml = t.resume
      ? `<div class="meia-mission-resume">${escapeHtml(t.resume)}</div>`
      : "";

    const livrable = t.resultat?.livrable;
    const livrableHtml = livrable
      ? `<div class="meia-livrable">${escapeHtml(livrable)}</div>`
      : (t.resultat && !livrable ? renderResultatBrut(t.resultat) : "");

    const erreurHtml = t.erreur
      ? `<div class="meia-mission-erreur">${escapeHtml(t.erreur)}</div>`
      : "";

    const actionsHtml = t.statut === "attente_validation"
      ? `<div class="meia-mission-actions">
           <button type="button" class="meia-btn meia-btn-outline" data-valider="${escapeHtml(t.id)}" data-titre="${escapeHtml(t.titre)}">Décider</button>
         </div>`
      : "";

    return `
      <div class="meia-mission ${classe}">
        <div class="meia-mission-top">
          <span class="meia-mission-agent">${escapeHtml(nomAgent)}</span>
          <span class="meia-badge ${escapeHtml(t.statut)}">${escapeHtml(MEIA_STATUTS_TACHE[t.statut] || t.statut)}</span>
        </div>
        <div class="meia-mission-titre">${escapeHtml(t.titre)}</div>
        <div class="meia-mission-instruction">${escapeHtml(t.instruction)}</div>
        ${attenteHtml}
        ${resumeHtml}
        ${livrableHtml}
        ${erreurHtml}
        ${actionsHtml}
      </div>
    `;
  }).join("");

  wrap.querySelectorAll("[data-valider]").forEach(btn => {
    btn.addEventListener("click", () => ouvrirModalValidation(btn.dataset.valider, btn.dataset.titre));
  });
}

/* Résultat d'un agent "outil" (prospection, vendeur, client, opérations) :
   ce sont des compteurs, pas du texte — on les affiche en clair. */
function renderResultatBrut(resultat) {
  const lignes = Object.entries(resultat)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => `${k.replace(/_/g, " ")} : ${v}`);
  if (!lignes.length) return "";
  return `<div class="meia-livrable">${escapeHtml(lignes.join("\n"))}</div>`;
}

function renderFil(messages, agentsParCle) {
  const wrap = document.getElementById("meia-fil");
  if (!messages.length) {
    wrap.innerHTML = `<div class="meia-empty">Aucun échange pour l'instant.</div>`;
    return;
  }
  wrap.innerHTML = messages.map(m => {
    const agent = agentsParCle.get(m.de_agent);
    return `
      <div class="meia-fil-item">
        <div class="meia-fil-agent">${escapeHtml(agent?.libelle || m.de_agent)}</div>
        <div class="meia-fil-contenu">
          ${escapeHtml(m.contenu)}
          <div class="meia-fil-date">${escapeHtml(formatDate(m.created_at))}</div>
        </div>
      </div>
    `;
  }).join("");
}

async function avancerMaintenant() {
  const btn = document.getElementById("meia-avancer-btn");
  btn.disabled = true;
  btn.textContent = "L'équipe travaille…";
  try {
    const res = await API.post("/admin/ia/executer", {});
    showToast(res?.traitees ? `${res.traitees} mission(s) traitée(s)` : "Aucune mission prête à avancer");
    await rafraichirDetail();
    await chargerObjectifs();
  } catch (err) {
    showToast("Échec : " + (err?.message || "inconnue"), true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Faire avancer maintenant";
  }
}

/* ══════════════════ VALIDATION HUMAINE ══════════════════ */

function initModal() {
  document.getElementById("meia-valider-cancel").addEventListener("click", fermerModalValidation);
  document.getElementById("meia-valider-ok").addEventListener("click", () => envoyerValidation(false));
  document.getElementById("meia-valider-refuser").addEventListener("click", () => {
    const motif = document.getElementById("meia-valider-motif");
    if (motif.style.display === "none") {
      motif.style.display = "block";
      motif.focus();
      return;
    }
    envoyerValidation(true);
  });
}

function ouvrirModalValidation(tacheId, titre) {
  _meiaPendingValidation = { tacheId, titre };
  document.getElementById("meia-valider-text").textContent =
    `« ${titre} » est prête mais attend ta décision. Si tu autorises, la suite de la chaîne se débloque. Si tu refuses, les missions qui en dépendent seront bloquées.`;
  document.getElementById("meia-valider-motif").value = "";
  document.getElementById("meia-valider-motif").style.display = "none";
  document.getElementById("meia-valider-overlay").classList.add("show");
}

function fermerModalValidation() {
  _meiaPendingValidation = null;
  document.getElementById("meia-valider-overlay").classList.remove("show");
}

async function envoyerValidation(refuser) {
  if (!_meiaPendingValidation) return;
  const { tacheId } = _meiaPendingValidation;
  const okBtn = document.getElementById("meia-valider-ok");
  const refuseBtn = document.getElementById("meia-valider-refuser");
  okBtn.disabled = true;
  refuseBtn.disabled = true;

  try {
    await API.post("/admin/ia/valider", {
      tache_id: tacheId,
      admin_id: getAdminId(),
      refuser,
      motif: refuser ? document.getElementById("meia-valider-motif").value.trim() : undefined
    });
    showToast(refuser ? "Mission refusée" : "Mission autorisée — la suite est débloquée");
    fermerModalValidation();
    await rafraichirDetail();
    await chargerObjectifs();
  } catch (err) {
    showToast("Échec : " + (err?.message || "inconnue"), true);
  } finally {
    okBtn.disabled = false;
    refuseBtn.disabled = false;
  }
}

/* ══════════════════ ORGANIGRAMME ══════════════════ */

async function chargerEquipe() {
  const wrap = document.getElementById("meia-orga");
  try {
    const res = await API.get("/admin/ia/agents");
    const agents = Array.isArray(res?.agents) ? res.agents : [];
    const charge = res?.charge || {};

    const dg = agents.find(a => a.cle === "dg");
    const parDepartement = {};
    agents.filter(a => a.cle !== "dg").forEach(a => {
      (parDepartement[a.departement] = parDepartement[a.departement] || []).push(a);
    });

    const dgHtml = dg ? `
      <div class="meia-orga-dg">
        <div class="meia-agent-top">
          <span class="meia-agent-nom">${escapeHtml(dg.libelle)}</span>
          <span class="meia-badge en_cours">Direction</span>
        </div>
        <div class="meia-agent-mission">${escapeHtml(dg.mission)}</div>
      </div>
      <div class="meia-orga-trait"></div>
    ` : "";

    const deptHtml = Object.keys(MEIA_DEPARTEMENTS)
      .filter(d => d !== "direction" && parDepartement[d]?.length)
      .map(d => `
        <div class="meia-orga-dept">
          <div class="meia-orga-dept-titre">${escapeHtml(MEIA_DEPARTEMENTS[d])}</div>
          <div class="meia-orga-agents">
            ${parDepartement[d].map(a => renderAgentCard(a, charge[a.cle])).join("")}
          </div>
        </div>
      `).join("");

    wrap.innerHTML = dgHtml + deptHtml;
  } catch (err) {
    wrap.innerHTML = `<div class="meia-empty">Erreur de chargement : ${escapeHtml(err?.message || "inconnue")}</div>`;
  }
}

function renderAgentCard(agent, charge) {
  const c = charge || {};
  const enCours = (c.en_cours || 0) + (c.prete || 0) + (c.en_attente || 0);
  return `
    <div class="meia-agent-card">
      <div class="meia-agent-top">
        <span class="meia-agent-nom">${escapeHtml(agent.libelle)}</span>
        ${agent.requiert_validation ? `<span class="meia-agent-valid">Validation requise</span>` : ""}
      </div>
      <div class="meia-agent-mission">${escapeHtml(agent.mission)}</div>
      <div class="meia-agent-charge">
        <span class="meia-agent-stat">En cours : <b>${enCours}</b></span>
        <span class="meia-agent-stat">Terminées : <b>${c.terminee || 0}</b></span>
        ${c.attente_validation ? `<span class="meia-agent-stat">À valider : <b>${c.attente_validation}</b></span>` : ""}
        ${c.echec ? `<span class="meia-agent-stat">Échecs : <b>${c.echec}</b></span>` : ""}
      </div>
    </div>
  `;
}

/* ══════════════════ POLLING ══════════════════ */

function planifierPolling() {
  arreterPolling();
  const statut = _meiaDetail?.objectif?.statut;
  if (_meiaVue !== "detail" || !MEIA_STATUTS_ACTIFS.includes(statut)) return;
  _meiaPollTimer = setTimeout(() => rafraichirDetail(), MEIA_POLL_MS);
}

function arreterPolling() {
  if (_meiaPollTimer) {
    clearTimeout(_meiaPollTimer);
    _meiaPollTimer = null;
  }
}

/* ══════════════════ UTILITAIRES ══════════════════ */

function getAdminId() {
  const user = AURA_AUTH.getUser();
  return user?.id || user?.sub || null;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return iso;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str === null || str === undefined ? "" : String(str);
  return div.innerHTML;
}

let _meiaToastTimer = null;
function showToast(message, isError) {
  const toast = document.getElementById("meia-toast");
  toast.textContent = message;
  toast.classList.remove("error", "success");
  toast.classList.add(isError ? "error" : "success", "show");
  clearTimeout(_meiaToastTimer);
  _meiaToastTimer = setTimeout(() => toast.classList.remove("show"), 3400);
}
