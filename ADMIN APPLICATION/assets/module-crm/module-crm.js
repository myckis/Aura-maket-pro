"use strict";

/* ═══════════════════════════════════════════════
   AURA MARKET — Module CRM & Prospection (Admin)
   module-crm.js
═══════════════════════════════════════════════ */

if (!AURA_AUTH.requireAuth()) {
  // requireAuth redirige déjà vers index.html si non connecté
}

const MCRM = {
  nombreChoisi: 10,
  ongletActif: "resultats",
  derniersResultats: []
};

/* ─── Sélecteur de nombre de résultats ─── */
document.querySelectorAll(".mcrm-nombre-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mcrm-nombre-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    MCRM.nombreChoisi = parseInt(btn.dataset.nombre, 10);
  });
});

/* ─── Onglets Résultats / Historique ─── */
document.querySelectorAll(".mcrm-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mcrm-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    MCRM.ongletActif = tab.dataset.tab;
    if (MCRM.ongletActif === "historique") {
      chargerHistorique();
    } else {
      afficherProspects(MCRM.derniersResultats, { showStats: true });
    }
  });
});

/* ─── Soumission du formulaire de recherche ─── */
document.getElementById("mcrm-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const motCle = document.getElementById("mcrm-motcle").value.trim();
  const ville = document.getElementById("mcrm-ville").value.trim();
  if (!motCle) return;

  const submitBtn = document.getElementById("mcrm-submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Recherche en cours…";

  document.querySelectorAll(".mcrm-tab").forEach(t => t.classList.remove("active"));
  document.querySelector('.mcrm-tab[data-tab="resultats"]').classList.add("active");
  MCRM.ongletActif = "resultats";

  const list = document.getElementById("mcrm-list");
  list.innerHTML = `<div class="mcrm-empty">Recherche de boutiques en cours, ça peut prendre quelques secondes…</div>`;
  document.getElementById("mcrm-stats").style.display = "none";

  try {
    const data = await API.post("/ai/crm/prospection", {
      motCle,
      ville,
      nombre: MCRM.nombreChoisi
    });

    MCRM.derniersResultats = data.prospects || [];
    afficherProspects(MCRM.derniersResultats, { showStats: true });

    if (MCRM.derniersResultats.length === 0) {
      showToast("Aucune boutique trouvée pour cette recherche", "warning");
    } else {
      showToast(`${data.avecTelephone} numéro(s) trouvé(s) sur ${data.total} boutique(s)`, "success");
    }
  } catch (err) {
    list.innerHTML = `<div class="mcrm-empty">Erreur : ${escapeHtml(err.message || "impossible de lancer la recherche")}</div>`;
    showToast(err.message || "Erreur lors de la recherche", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg> Lancer la recherche`;
  }
});

/* ─── Sauvegarde manuelle des derniers résultats (clic explicite) ─── */
document.getElementById("mcrm-save-btn").addEventListener("click", async () => {
  const motCle = document.getElementById("mcrm-motcle").value.trim();
  const ville = document.getElementById("mcrm-ville").value.trim();

  if (!MCRM.derniersResultats || MCRM.derniersResultats.length === 0) {
    showToast("Aucun résultat à sauvegarder", "warning");
    return;
  }

  const saveBtn = document.getElementById("mcrm-save-btn");
  saveBtn.disabled = true;
  const labelOriginal = saveBtn.innerHTML;
  saveBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg> Sauvegarde…`;

  try {
    const data = await API.post("/ai/crm/sauvegarder", {
      motCle,
      ville,
      prospects: MCRM.derniersResultats
    });
    showToast(`${data.sauvegardes} prospect(s) sauvegardé(s)`, "success");
  } catch (err) {
    showToast(err.message || "Erreur lors de la sauvegarde", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = labelOriginal;
  }
});

/* ─── Charge l'historique complet depuis Supabase ─── */
async function chargerHistorique() {
  const list = document.getElementById("mcrm-list");
  list.innerHTML = `<div class="mcrm-empty">Chargement…</div>`;
  document.getElementById("mcrm-stats").style.display = "none";

  try {
    const rows = await API.get(
      AURA_CONFIG.endpoints.crm_prospects + "?select=*&order=created_at.desc&limit=100"
    );
    const prospects = (rows || []).map(mapRowVersProspect);
    afficherProspects(prospects, { showStats: false, isHistorique: true });
  } catch (err) {
    list.innerHTML = `<div class="mcrm-empty">Erreur de chargement de l'historique</div>`;
  }
}

/* Convertit une ligne Supabase (snake_case) vers le format utilisé côté front */
function mapRowVersProspect(row) {
  return {
    id: row.id,
    nomBoutique: row.nom_boutique,
    plateforme: row.plateforme,
    lienPage: row.lien_page,
    extraitSource: row.extrait_source,
    telephone: row.telephone,
    telephoneValide: row.telephone_valide,
    messageWhatsapp: row.message_whatsapp,
    lienWhatsapp: row.lien_whatsapp,
    statut: row.statut
  };
}

/* ─── Rendu de la liste de prospects ─── */
function afficherProspects(prospects, { showStats, isHistorique } = {}) {
  const list = document.getElementById("mcrm-list");
  const statsBox = document.getElementById("mcrm-stats");

  if (!prospects || prospects.length === 0) {
    statsBox.style.display = "none";
    document.getElementById("mcrm-save-btn").style.display = "none";
    list.innerHTML = `<div class="mcrm-empty">${isHistorique ? "Aucun prospect enregistré pour l'instant." : "Lance une recherche pour voir apparaître des prospects ici."}</div>`;
    return;
  }

  const saveBtn = document.getElementById("mcrm-save-btn");

  if (showStats) {
    const avecTel = prospects.filter(p => p.telephoneValide).length;
    document.getElementById("mcrm-stat-total").textContent = prospects.length;
    document.getElementById("mcrm-stat-tel").textContent = avecTel;
    document.getElementById("mcrm-stat-sans").textContent = prospects.length - avecTel;
    statsBox.style.display = "flex";
    saveBtn.style.display = isHistorique ? "none" : "flex";
  } else {
    statsBox.style.display = "none";
    saveBtn.style.display = "none";
  }

  const iconesPlateforme = {
    instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`,
    facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z"/></svg>`,
    tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82c-.9-.79-1.47-1.93-1.47-3.2h-3.08v13.4a2.6 2.6 0 1 1-2.6-2.6c.28 0 .55.04.8.12V10.4a5.65 5.65 0 0 0-.8-.06A5.66 5.66 0 1 0 15.11 16V9.35a6.63 6.63 0 0 0 3.87 1.24V7.51a3.9 3.9 0 0 1-2.38-1.69Z"/></svg>`,
    snapchat: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-3.3 0-5.3 2.4-5.3 5.6 0 .9.05 1.7.1 2.3-.5.3-1.3.5-1.9.5-.4 0-.6.5-.3.9.4.6 1.2 1.1 1.9 1.4-.1.4-.3.8-.7 1.2-.9.9-2.2 1.1-2.2 1.6 0 .6 1.4.8 2.4 1 .1.3.2.7.4 1 .3.4 1.6.2 2.7.6.9.3 1.4 1.4 2.9 1.4s2-.1 2.9-1.4c1.1-.4 2.4-.2 2.7-.6.2-.3.3-.7.4-1 1-.2 2.4-.4 2.4-1 0-.5-1.3-.7-2.2-1.6-.4-.4-.6-.8-.7-1.2.7-.3 1.5-.8 1.9-1.4.3-.4.1-.9-.3-.9-.6 0-1.4-.2-1.9-.5.05-.6.1-1.4.1-2.3C17.3 4.4 15.3 2 12 2Z"/></svg>`,
    autre: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
  };
  const iconeTelephone = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>`;
  const iconeAlerte = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>`;

  list.innerHTML = prospects.map((p, index) => {
    const badgeClass = `mcrm-platform-${p.plateforme || "autre"}`;
    const icone = iconesPlateforme[p.plateforme] || iconesPlateforme.autre;

    const blocTel = p.telephoneValide
      ? `<div class="mcrm-prospect-tel">${iconeTelephone}+${formatTelAffichage(p.telephone)}</div>`
      : `<span class="mcrm-tag-warning">${iconeAlerte}Numéro non détecté — vérifier la bio manuellement</span>`;

    const tagStatut = (isHistorique && p.statut && p.statut !== "nouveau")
      ? `<span class="mcrm-tag-statut">${escapeHtml(libelleStatut(p.statut))}</span>`
      : "";

    const actions = p.telephoneValide
      ? `
        <a class="mcrm-action-btn mcrm-action-whatsapp" href="${p.lienWhatsapp}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="mcrm-action-btn mcrm-action-visit" href="${p.lienPage}" target="_blank" rel="noopener">Voir la page</a>
        ${isHistorique ? `
        <select class="mcrm-action-select" data-id="${p.id}" onchange="MCRM_changerStatut(this)">
          <option value="">Statut…</option>
          <option value="contacte">Contacté</option>
          <option value="interesse">Intéressé</option>
          <option value="refuse">Refusé</option>
          <option value="client">Devenu client</option>
        </select>` : ""}
      `
      : `<a class="mcrm-action-btn mcrm-action-visit" href="${p.lienPage}" target="_blank" rel="noopener">Voir la page</a>`;

    return `
      <div class="mcrm-prospect${p.telephoneValide ? "" : " sans-tel"}">
        <div class="mcrm-platform-badge ${badgeClass}">${icone}</div>
        <div class="mcrm-prospect-body">
          <div class="mcrm-prospect-nom">${escapeHtml(p.nomBoutique)}</div>
          <a class="mcrm-prospect-lien" href="${p.lienPage}" target="_blank" rel="noopener">${escapeHtml(p.lienPage)}</a>
          ${p.extraitSource ? `<div class="mcrm-prospect-extrait">${escapeHtml(p.extraitSource)}</div>` : ""}
          ${blocTel}${tagStatut}
        </div>
        <div class="mcrm-prospect-actions">${actions}</div>
      </div>
    `;
  }).join("");
}

/* Change le statut d'un prospect (historique uniquement) */
async function MCRM_changerStatut(selectEl) {
  const id = selectEl.dataset.id;
  const nouveauStatut = selectEl.value;
  if (!id || !nouveauStatut) return;

  try {
    await API.patch(`${AURA_CONFIG.endpoints.crm_prospects}?id=eq.${id}`, {
      statut: nouveauStatut,
      contacte_at: nouveauStatut === "contacte" ? new Date().toISOString() : undefined
    });
    showToast("Statut mis à jour", "success");
  } catch (err) {
    showToast("Erreur lors de la mise à jour du statut", "error");
  }
}
window.MCRM_changerStatut = MCRM_changerStatut;

/* ─── Utilitaires ─── */
function libelleStatut(statut) {
  const map = {
    nouveau: "Nouveau",
    contacte: "Contacté",
    interesse: "Intéressé",
    refuse: "Refusé",
    client: "Devenu client"
  };
  return map[statut] || statut;
}

function formatTelAffichage(tel) {
  // tel est stocké sans "+" au format 225XXXXXXXXXX
  if (!tel) return "";
  const indicatif = tel.slice(0, 3);
  const reste = tel.slice(3);
  const groupes = reste.match(/.{1,2}/g) || [];
  return `${indicatif} ${groupes.join(" ")}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
