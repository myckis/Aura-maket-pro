/**
 * AURA MARKET — Module Pronostics (Admin)
 * Fichier : assets/module-pronostics/module-pronostics.js
 * Dépend de : ../js/config.js (AURA_CONFIG, AURA_AUTH, API)
 *
 * Fonctionnement :
 *  1. L'admin crée un match (équipes, compétition, date, stats/contexte libre).
 *  2. Il lance l'analyse : le Worker interroge plusieurs IA en parallèle
 *     (POST /proxy/ai/pronostics/analyser) qui chacune donne un pronostic
 *     indépendant (résultat probable, score, confiance, analyse).
 *  3. Le Worker calcule un consensus pondéré et le renvoie avec le détail
 *     de chaque IA. Tout est aussi persisté côté Supabase (tables
 *     pronostics_matchs / pronostics_ia_reponses / pronostics_synthese)
 *     et relu directement via /rest/... pour les chargements suivants.
 */

"use strict";

let _mproMatches = [];
let _mproFiltreStatut = "";
let _mproMatchActifId = null;
let _mproMatchASupprimer = null;

document.addEventListener("DOMContentLoaded", () => {
  initFiltres();
  initModaleNouveauMatch();
  initPanel();
  initModaleSuppression();
  initGenererDuJour();
  chargerMatchs();
});

/* ══════════════════ CHARGEMENT & RENDU DE LA LISTE ══════════════════ */

async function chargerMatchs() {
  const loading = document.getElementById("mpro-loading");
  const empty = document.getElementById("mpro-empty");
  const list = document.getElementById("mpro-list");
  empty.style.display = "none";

  try {
    const query = _mproFiltreStatut
      ? `?select=*&statut=eq.${_mproFiltreStatut}&order=cree_le.desc&limit=100`
      : `?select=*&order=cree_le.desc&limit=100`;
    const data = await API.get(AURA_CONFIG.endpoints.pronostics_matchs + query);
    _mproMatches = Array.isArray(data) ? data : [];
    renderTopbarState();
    renderListe();
    renderCombineDuJour();
  } catch (err) {
    if (loading) loading.textContent = "Erreur de chargement : " + (err?.message || "inconnue");
    showToast("Erreur : " + (err?.message || "inconnue"), true);
  }
}

function renderTopbarState() {
  const label = document.getElementById("mpro-topbar-state-label");
  if (!label) return;
  const total = _mproMatches.length;
  const termines = _mproMatches.filter(m => m.statut === "termine").length;
  label.textContent = total === 0 ? "Aucun match" : `${termines}/${total} analysé(s)`;
}

function renderListe() {
  const list = document.getElementById("mpro-list");
  const empty = document.getElementById("mpro-empty");
  const loading = document.getElementById("mpro-loading");
  if (loading) loading.remove();

  if (_mproMatches.length === 0) {
    list.innerHTML = "";
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";

  list.innerHTML = _mproMatches.map(m => renderCarteMatch(m)).join("");

  list.querySelectorAll("[data-match-id]").forEach(card => {
    card.addEventListener("click", () => ouvrirPanel(card.dataset.matchId));
  });
}

function renderCarteMatch(m) {
  const dateLabel = formatDateMatch(m.date_match);
  const statutLabel = {
    en_attente: "En attente",
    analyse: "En cours…",
    termine: "Terminé",
    erreur: "Erreur"
  }[m.statut] || m.statut;

  const sourceLabel = { api_football: "Source vérifiée", recherche_web: "Extraction IA — à vérifier" }[m.source];

  return `
    <div class="mpro-card" data-match-id="${m.id}">
      <div class="mpro-card-teams">
        <div class="mpro-card-matchup">${escHtml(m.equipe_domicile)} <span style="color:var(--text-muted);">vs</span> ${escHtml(m.equipe_exterieur)}</div>
        <div class="mpro-card-meta">
          ${m.competition ? `<span class="mpro-card-competition">${escHtml(m.competition)}</span><span class="mpro-card-dot-sep"></span>` : ""}
          <span class="mpro-card-date">${dateLabel}</span>
        </div>
        ${sourceLabel ? `<div class="mpro-source-tag ${m.source}">${sourceLabel}</div>` : ""}
      </div>
      <span class="mpro-badge-statut ${m.statut}">${statutLabel}</span>
    </div>
  `;
}

function formatDateMatch(iso) {
  if (!iso) return "Date non précisée";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-CI", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function escHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ══════════════════════════════════════════════════════════════════════
   GÉNÉRATION DES MATCHS DU JOUR (bouton) + analyse en boucle avec progression
   ══════════════════════════════════════════════════════════════════════ */

function initGenererDuJour() {
  document.getElementById("mpro-btn-generer").addEventListener("click", genererMatchsDuJour);
}

async function genererMatchsDuJour() {
  const btn = document.getElementById("mpro-btn-generer");
  const wrap = document.getElementById("mpro-progress-wrap");
  const fill = document.getElementById("mpro-progress-fill");
  const label = document.getElementById("mpro-progress-label");

  btn.disabled = true;
  btn.textContent = "Recherche des matchs…";
  wrap.style.display = "none";

  let rapport;
  try {
    rapport = await API.post("/admin/pronostics/generer-du-jour", {});
  } catch (err) {
    showToast("Erreur : " + (err?.message || "inconnue"), true);
    btn.disabled = false;
    resetBoutonGenerer();
    return;
  }

  if (rapport.erreur) {
    showToast(rapport.erreur, true);
    btn.disabled = false;
    resetBoutonGenerer();
    return;
  }

  const idsAAnalyser = Array.isArray(rapport.ids_a_analyser) ? rapport.ids_a_analyser : [];
  if (idsAAnalyser.length === 0) {
    showToast(rapport.crees > 0 ? `${rapport.crees} match(s) créé(s)` : "Aucun nouveau match trouvé pour aujourd'hui", "success");
    btn.disabled = false;
    resetBoutonGenerer();
    chargerMatchs();
    return;
  }

  wrap.style.display = "";
  let fait = 0;
  for (const matchId of idsAAnalyser) {
    label.textContent = `Analyse ${fait + 1}/${idsAAnalyser.length}…`;
    fill.style.width = `${Math.round((fait / idsAAnalyser.length) * 100)}%`;
    try {
      await API.post("/ai/pronostics/analyser", { match_id: matchId });
    } catch (err) {
      console.error("Échec analyse match", matchId, err);
    }
    fait++;
  }
  fill.style.width = "100%";
  label.textContent = `${fait}/${idsAAnalyser.length} analysé(s)`;

  showToast(`${rapport.crees} nouveau(x) match(s), ${fait} analysé(s)`, "success");
  setTimeout(() => { wrap.style.display = "none"; }, 1500);

  btn.disabled = false;
  resetBoutonGenerer();
  chargerMatchs();
}

function resetBoutonGenerer() {
  const btn = document.getElementById("mpro-btn-generer");
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Générer les matchs du jour`;
}

/* ══════════════════════════════════════════════════════════════════════
   COMBINÉ SUGGÉRÉ (calculé côté client à partir des matchs déjà chargés)
   ══════════════════════════════════════════════════════════════════════ */

async function renderCombineDuJour() {
  const card = document.getElementById("mpro-combine-card");
  const termines = _mproMatches.filter(m => m.statut === "termine");
  if (termines.length < 2) { card.style.display = "none"; return; }

  try {
    const ids = termines.map(m => m.id).join(",");
    const syntheses = await API.get(`${AURA_CONFIG.endpoints.pronostics_synthese}?select=*&match_id=in.(${ids})`);
    const parMatch = {};
    (syntheses || []).forEach(s => { parMatch[s.match_id] = s; });

    const combinables = termines
      .map(m => ({ match: m, synthese: parMatch[m.id] }))
      .filter(x => x.synthese && x.synthese.consensus_resultat && x.synthese.confiance_moyenne)
      .sort((a, b) => b.synthese.confiance_moyenne - a.synthese.confiance_moyenne)
      .slice(0, 3);

    if (combinables.length < 2) { card.style.display = "none"; return; }

    const probaCombinee = combinables.reduce((p, x) => p * x.synthese.confiance_moyenne, 1);
    const labelResultat = { domicile: "1", nul: "N", exterieur: "2" };

    card.innerHTML = `
      <div class="mpro-combine-title">Combiné suggéré</div>
      <div class="mpro-combine-hint">Les ${combinables.length} matchs analysés avec la plus forte confiance consensus. Probabilité estimée à partir des avis IA — ne remplace pas des cotes de bookmaker réelles.</div>
      <div class="mpro-combine-list">
        ${combinables.map(x => `
          <div class="mpro-combine-item">
            <span class="mpro-combine-item-teams">${escHtml(x.match.equipe_domicile)} - ${escHtml(x.match.equipe_exterieur)}</span>
            <span class="mpro-combine-item-pick">${labelResultat[x.synthese.consensus_resultat] || "—"} · ${Math.round(x.synthese.confiance_moyenne * 100)}%</span>
          </div>
        `).join("")}
      </div>
      <div class="mpro-combine-total">
        <span>Probabilité combinée estimée</span>
        <b>${Math.round(probaCombinee * 100)}%</b>
      </div>
    `;
    card.style.display = "";
  } catch {
    card.style.display = "none";
  }
}

/* ══════════════════ FILTRES DE STATUT ══════════════════ */

function initFiltres() {
  document.querySelectorAll(".mpro-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mpro-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mproFiltreStatut = btn.dataset.statut || "";
      chargerMatchs();
    });
  });
}

/* ══════════════════ MODALE : NOUVEAU MATCH ══════════════════ */

function initModaleNouveauMatch() {
  const overlay = document.getElementById("mpro-nouveau-overlay");

  document.getElementById("mpro-btn-nouveau").addEventListener("click", () => {
    ["mpro-f-domicile", "mpro-f-exterieur", "mpro-f-competition", "mpro-f-date", "mpro-f-stats"].forEach(id => {
      document.getElementById(id).value = "";
    });
    overlay.classList.add("show");
  });

  document.getElementById("mpro-nouveau-cancel").addEventListener("click", () => overlay.classList.remove("show"));
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("show"); });

  document.getElementById("mpro-nouveau-ok").addEventListener("click", creerMatch);
}

async function creerMatch() {
  const domicile = document.getElementById("mpro-f-domicile").value.trim();
  const exterieur = document.getElementById("mpro-f-exterieur").value.trim();
  const competition = document.getElementById("mpro-f-competition").value.trim();
  const dateVal = document.getElementById("mpro-f-date").value;
  const stats = document.getElementById("mpro-f-stats").value.trim();

  if (!domicile || !exterieur) {
    showToast("Renseigne au moins les deux équipes", true);
    return;
  }

  const btn = document.getElementById("mpro-nouveau-ok");
  btn.disabled = true;
  btn.textContent = "Création…";

  try {
    await API.post(AURA_CONFIG.endpoints.pronostics_matchs, {
      equipe_domicile: domicile,
      equipe_exterieur: exterieur,
      competition: competition || null,
      date_match: dateVal ? new Date(dateVal).toISOString() : null,
      stats_json: stats ? { notes: stats } : null
    });

    showToast("Match créé", "success");
    document.getElementById("mpro-nouveau-overlay").classList.remove("show");
    chargerMatchs();
  } catch (err) {
    showToast("Erreur : " + (err?.message || "inconnue"), true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Créer le match";
  }
}

/* ══════════════════ PANNEAU DÉTAIL D'UN MATCH ══════════════════ */

function initPanel() {
  document.getElementById("mpro-panel-close").addEventListener("click", fermerPanel);
  document.getElementById("mpro-panel-overlay").addEventListener("click", e => {
    if (e.target.id === "mpro-panel-overlay") fermerPanel();
  });
}

function fermerPanel() {
  document.getElementById("mpro-panel-overlay").classList.remove("show");
  _mproMatchActifId = null;
}

async function ouvrirPanel(matchId) {
  _mproMatchActifId = matchId;
  const overlay = document.getElementById("mpro-panel-overlay");
  const match = _mproMatches.find(m => String(m.id) === String(matchId));
  if (!match) return;

  document.getElementById("mpro-panel-title").textContent = `${match.equipe_domicile} vs ${match.equipe_exterieur}`;
  document.getElementById("mpro-panel-desc").textContent = [match.competition, formatDateMatch(match.date_match)].filter(Boolean).join(" — ");
  document.getElementById("mpro-panel-body").innerHTML = `<div class="mpro-empty">Chargement…</div>`;
  overlay.classList.add("show");

  await renderPanelBody(match);
}

async function renderPanelBody(match) {
  const body = document.getElementById("mpro-panel-body");

  let synthese = null;
  let reponses = [];
  try {
    const [syntheseData, reponsesData] = await Promise.all([
      API.get(`${AURA_CONFIG.endpoints.pronostics_synthese}?select=*&match_id=eq.${match.id}&limit=1`),
      API.get(`${AURA_CONFIG.endpoints.pronostics_ia_reponses}?select=*&match_id=eq.${match.id}&order=cree_le.asc`)
    ]);
    synthese = Array.isArray(syntheseData) && syntheseData[0] ? syntheseData[0] : null;
    reponses = Array.isArray(reponsesData) ? reponsesData : [];
  } catch (err) {
    body.innerHTML = `<div class="mpro-empty">Erreur de chargement : ${escHtml(err?.message || "inconnue")}</div>`;
    return;
  }

  const enCours = match.statut === "analyse";
  const dejaAnalyse = match.statut === "termine" || match.statut === "erreur";

  body.innerHTML = `
    <div class="mpro-panel-actions">
      <button type="button" class="mpro-btn mpro-btn-primary" id="mpro-btn-lancer" ${enCours ? "disabled" : ""}>
        ${enCours ? "Analyse en cours…" : dejaAnalyse ? "Relancer l'analyse" : "Lancer l'analyse"}
      </button>
    </div>

    ${synthese ? renderConsensusCard(synthese) : ""}

    ${reponses.length > 0 ? `
      <div class="mpro-section-title" style="margin-top:4px;">Avis de chaque IA</div>
      <div class="mpro-ia-list">
        ${reponses.map(renderCarteIA).join("")}
      </div>
    ` : (dejaAnalyse ? "" : `<div class="mpro-empty">Aucune analyse pour l'instant.</div>`)}

    <div class="mpro-danger-row">
      <button type="button" class="mpro-btn mpro-btn-danger mpro-btn-block" id="mpro-btn-supprimer">Supprimer ce match</button>
    </div>
  `;

  document.getElementById("mpro-btn-lancer").addEventListener("click", () => lancerAnalyse(match.id));
  document.getElementById("mpro-btn-supprimer").addEventListener("click", () => demanderSuppression(match.id));
}

function renderConsensusCard(s) {
  const labelResultat = { domicile: "Victoire domicile", nul: "Match nul", exterieur: "Victoire extérieur" }[s.consensus_resultat] || "Indéterminé";
  const confPct = s.confiance_moyenne != null ? Math.round(s.confiance_moyenne * 100) : null;
  return `
    <div class="mpro-consensus-card">
      <div class="mpro-consensus-label">Consensus des IA</div>
      <div class="mpro-consensus-result">${labelResultat}</div>
      ${s.score_consensus ? `<div class="mpro-consensus-score">${escHtml(s.score_consensus)}</div>` : ""}
      <div class="mpro-consensus-meta">
        <span><b>${s.nombre_ia_consultees ?? "—"}</b> IA consultée(s)</span>
        ${confPct != null ? `<span><b>${confPct}%</b> confiance moy.</span>` : ""}
      </div>
      ${confPct != null ? `<div class="mpro-confbar"><div class="mpro-confbar-fill" style="width:${confPct}%;"></div></div>` : ""}
    </div>
  `;
}

function renderCarteIA(r) {
  if (r.erreur) {
    return `
      <div class="mpro-ia-card erreur">
        <div class="mpro-ia-top">
          <span class="mpro-ia-provider">${escHtml(r.provider)}</span>
          <span class="mpro-ia-tag">Échec</span>
        </div>
        <div class="mpro-ia-erreur">${escHtml(r.erreur)}</div>
      </div>
    `;
  }
  const tagLabel = { domicile: "1 · Domicile", nul: "N · Nul", exterieur: "2 · Extérieur" }[r.resultat_probable] || "—";
  const confPct = r.confiance != null ? Math.round(r.confiance * 100) : null;
  return `
    <div class="mpro-ia-card">
      <div class="mpro-ia-top">
        <span class="mpro-ia-provider">${escHtml(r.provider)}</span>
        <span class="mpro-ia-tag ${r.resultat_probable || ""}">${tagLabel}</span>
      </div>
      ${r.score_probable ? `<div class="mpro-ia-score">Score probable : <b>${escHtml(r.score_probable)}</b></div>` : ""}
      ${r.analyse_texte ? `<div class="mpro-ia-analyse">${escHtml(r.analyse_texte)}</div>` : ""}
      ${confPct != null ? `<div class="mpro-ia-conf">Confiance : ${confPct}%</div>` : ""}
    </div>
  `;
}

async function lancerAnalyse(matchId) {
  const btn = document.getElementById("mpro-btn-lancer");
  if (btn) { btn.disabled = true; btn.textContent = "Analyse en cours…"; }

  try {
    await API.post("/ai/pronostics/analyser", { match_id: matchId });
    showToast("Analyse terminée", "success");
    await chargerMatchs();
    const match = _mproMatches.find(m => String(m.id) === String(matchId));
    if (match) await renderPanelBody(match);
  } catch (err) {
    showToast("Erreur : " + (err?.message || "inconnue"), true);
    if (btn) { btn.disabled = false; btn.textContent = "Relancer l'analyse"; }
  }
}

/* ══════════════════ SUPPRESSION D'UN MATCH ══════════════════ */

function initModaleSuppression() {
  const overlay = document.getElementById("mpro-suppr-overlay");
  document.getElementById("mpro-suppr-cancel").addEventListener("click", () => {
    overlay.classList.remove("show");
    _mproMatchASupprimer = null;
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("show"); });
  document.getElementById("mpro-suppr-ok").addEventListener("click", confirmerSuppression);
}

function demanderSuppression(matchId) {
  _mproMatchASupprimer = matchId;
  document.getElementById("mpro-suppr-overlay").classList.add("show");
}

async function confirmerSuppression() {
  if (!_mproMatchASupprimer) return;
  const btn = document.getElementById("mpro-suppr-ok");
  btn.disabled = true;
  btn.textContent = "Suppression…";

  try {
    await API.delete(`${AURA_CONFIG.endpoints.pronostics_matchs}?id=eq.${_mproMatchASupprimer}`);
    showToast("Match supprimé", "success");
    document.getElementById("mpro-suppr-overlay").classList.remove("show");
    fermerPanel();
    _mproMatchASupprimer = null;
    chargerMatchs();
  } catch (err) {
    showToast("Erreur : " + (err?.message || "inconnue"), true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Supprimer";
  }
}

/* ══════════════════ TOAST LOCAL ══════════════════ */

function showToast(message, isError) {
  const toast = document.getElementById("mpro-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = "mpro-toast show" + (isError === true || isError === "error" ? " error" : isError === "success" ? " success" : "");
  clearTimeout(window._mproToastTimeout);
  window._mproToastTimeout = setTimeout(() => toast.classList.remove("show"), 3200);
}
