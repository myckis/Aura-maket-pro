"use strict";
/* ═══════════════════════════════════════════════
   AURA MARKET — Module Assistant IA (Admin)
   module-agent-ia.js

   Flux : l'admin tape une instruction → appel Worker (/ai/agent/comprendre)
   qui fait le function calling Groq et retourne une intention structurée →
   le module exécute les RPC de LECTURE correspondantes (jamais d'écriture
   directe) → construit un aperçu personnalisé → attend confirmation
   explicite de l'admin → seulement alors, agent_confirmer_action() envoie
   réellement (notif in-app + push Firebase via push_queue existant).
═══════════════════════════════════════════════ */

let _agiaEnCours = false;
let _agiaActionCourante = null; // { actionId, destinataires, type }

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("agia-form").addEventListener("submit", onAgiaSubmit);
  document.getElementById("agia-input").addEventListener("input", autoResizeAgiaInput);
  document.getElementById("agia-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAgiaSubmit(e); }
  });
  document.querySelectorAll(".agia-quick-btn").forEach(btn => {
    btn.addEventListener("click", () => onAgiaQuickAction(btn.dataset.quick));
  });
  document.getElementById("agia-apercu-cancel").addEventListener("click", onAgiaAnnulerApercu);
  document.getElementById("agia-apercu-confirm").addEventListener("click", onAgiaConfirmerApercu);
  document.getElementById("agia-history-refresh").addEventListener("click", chargerHistoriqueAgent);

  chargerHistoriqueAgent();
});

function autoResizeAgiaInput(e) {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px";
}

/* ══════════════════════════════════════════════
   ENVOI D'UNE INSTRUCTION EN TEXTE LIBRE
══════════════════════════════════════════════ */
async function onAgiaSubmit(e) {
  e.preventDefault();
  if (_agiaEnCours) return;

  const input = document.getElementById("agia-input");
  const texte = input.value.trim();
  if (!texte) return;

  ajouterMessage("user", escAgia(texte));
  input.value = "";
  input.style.height = "auto";

  await traiterInstruction(texte);
}

/* ══════════════════════════════════════════════
   ACTIONS RAPIDES — raccourcis vers des instructions pré-formulées
══════════════════════════════════════════════ */
async function onAgiaQuickAction(quick) {
  if (_agiaEnCours) return;
  const phrases = {
    bilan: "Fais-moi un bilan des 7 derniers jours.",
    paniers: "Relance tous les clients avec un panier abandonné depuis plus de 24h, avec leur prénom.",
    vendeurs: "Relance les vendeurs inactifs depuis plus de 7 jours, avec le nom de leur boutique."
  };
  const texte = phrases[quick];
  if (!texte) return;
  ajouterMessage("user", escAgia(texte));
  await traiterInstruction(texte);
}

/* ══════════════════════════════════════════════
   CŒUR : comprendre l'instruction, exécuter les lectures, préparer l'aperçu
══════════════════════════════════════════════ */
async function traiterInstruction(texte) {
  _agiaEnCours = true;
  toggleAgiaEnvoiUI(true);
  const loadingId = ajouterMessageLoading();

  try {
    const intention = await API.post("/ai/agent/comprendre", { instruction: texte });

    retirerMessageLoading(loadingId);

    if (!intention || intention.fonction === "non_comprise") {
      ajouterMessage("bot", escAgia(intention?.reponse_libre || "Je n'ai pas bien compris cette instruction. Peux-tu la reformuler, par exemple : « relance les vendeurs inactifs depuis 5 jours » ?"));
      return;
    }

    if (intention.fonction === "generer_bilan") {
      await executerBilan(intention.parametres || {});
      return;
    }

    if (intention.fonction === "lister_paniers_abandonnes") {
      await executerRelance("paniers", { ...(intention.parametres || {}), _instructionOriginale: texte }, intention.programmee_pour || null);
      return;
    }

    if (intention.fonction === "lister_vendeurs_inactifs") {
      await executerRelance("vendeurs", { ...(intention.parametres || {}), _instructionOriginale: texte }, intention.programmee_pour || null);
      return;
    }

    if (intention.fonction === "diffuser_message_libre") {
      await executerDiffusionLibre(intention.parametres || {}, intention.programmee_pour || null, texte);
      return;
    }

    if (intention.fonction === "annoncer_a_tous_personnalise") {
      await executerAnnoncePersonnalisee(intention.parametres || {}, intention.programmee_pour || null, texte);
      return;
    }

    ajouterMessage("bot", "Cette action n'est pas encore prise en charge par l'assistant.");
  } catch (err) {
    retirerMessageLoading(loadingId);
    ajouterMessage("bot", `Erreur : ${escAgia(err.message)}`, true);
  } finally {
    _agiaEnCours = false;
    toggleAgiaEnvoiUI(false);
  }
}

/* ══════════════════════════════════════════════
   BILAN — lecture seule, aucune confirmation nécessaire
══════════════════════════════════════════════ */
async function executerBilan(parametres) {
  const depuisJours = parametres.depuis_jours || 7;
  const bilan = await API.post(AURA_CONFIG.endpoints.rpc_agent_generer_bilan, { p_depuis_jours: depuisJours });

  const lignes = [
    `<b>Bilan des ${depuisJours} derniers jours</b>`,
    `👥 ${bilan.nouveaux_clients} nouveau(x) client(s), ${bilan.nouveaux_vendeurs} nouveau(x) vendeur(s)`,
    `🛒 ${bilan.commandes_total} commande(s) — ${formatCFA(bilan.commandes_montant_total)} au total`,
    bilan.commandes_annulees > 0 ? `⚠️ ${bilan.commandes_annulees} commande(s) annulée(s)` : null,
    `🧺 ${bilan.paniers_abandonnes} panier(s) actuellement abandonné(s)`,
    bilan.signalements_nouveaux > 0 ? `🚩 ${bilan.signalements_nouveaux} nouveau(x) signalement(s)` : null,
    bilan.produits_en_attente > 0 ? `⏳ ${bilan.produits_en_attente} produit(s) en attente de validation` : null
  ].filter(Boolean).join("<br>");

  ajouterMessage("bot", lignes);
}

/* ══════════════════════════════════════════════
   RELANCE PERSONNALISÉE — paniers abandonnés / vendeurs inactifs
   Récupère les destinataires, construit un message personnalisé par
   personne, affiche l'aperçu, et attend confirmation avant tout envoi.
══════════════════════════════════════════════ */
async function executerRelance(type, parametres, programmeePour) {
  let rpcEndpoint;
  let rpcParam;

  if (type === "paniers") {
    rpcEndpoint = AURA_CONFIG.endpoints.rpc_agent_lister_paniers_abandonnes;
    rpcParam = { p_depuis_heures: parametres.depuis_heures || 24 };
  } else {
    rpcEndpoint = AURA_CONFIG.endpoints.rpc_agent_lister_vendeurs_inactifs;
    rpcParam = { p_depuis_jours: parametres.depuis_jours || 7 };
  }

  const destinatairesBruts = await API.post(rpcEndpoint, rpcParam);

  if (!Array.isArray(destinatairesBruts) || destinatairesBruts.length === 0) {
    ajouterMessage("bot", type === "paniers"
      ? "Aucun panier abandonné ne correspond à ce critère en ce moment."
      : "Aucun vendeur inactif ne correspond à ce critère en ce moment.");
    return;
  }

  const destinataires = destinatairesBruts.map(d => construireMessagePersonnalise(type, d));

  const apercuTitre = type === "paniers"
    ? "Relance paniers abandonnés"
    : "Relance vendeurs inactifs";

  ajouterMessage("bot", `J'ai trouvé <b>${destinataires.length}</b> ${type === "paniers" ? "client(s)" : "vendeur(s)"} concerné(s). Voici un aperçu avant envoi :`);

  // Crée l'action en base (statut en_attente, ou programmee si une heure est fournie) — aucun envoi ici.
  const actionId = await API.post(AURA_CONFIG.endpoints.rpc_agent_creer_action, {
    p_instruction: parametres._instructionOriginale || apercuTitre,
    p_type_action: "notification_personnalisee",
    p_parametres: { type, ...parametres },
    p_apercu: { destinataires },
    p_nb_destinataires: destinataires.length,
    p_programmee_pour: programmeePour
  });

  if (programmeePour) {
    ajouterMessage("bot", `✓ Relance programmée pour le ${new Date(programmeePour).toLocaleString("fr-FR")}. Elle partira automatiquement, aucune action supplémentaire nécessaire.`);
    chargerHistoriqueAgent();
    return;
  }

  _agiaActionCourante = { actionId, destinataires, type };
  afficherApercu(apercuTitre, destinataires);
}

function construireMessagePersonnalise(type, d) {
  if (type === "paniers") {
    const prenom = (d.nom || "").split(" ")[0] || "cher client";
    return {
      user_id: d.client_id,
      app: "client",
      nom_affiche: d.nom || "Client",
      titre: "Ton panier t'attend 🛒",
      corps: `${prenom}, tu as laissé ${d.nb_articles} article${d.nb_articles > 1 ? "s" : ""} dans ton panier. Finalise ta commande avant qu'ils ne partent !`,
      lien: "/panier"
    };
  }
  const prenom = (d.nom_responsable || "").split(" ")[0] || "cher vendeur";
  return {
    user_id: d.vendeur_id,
    app: "vendeur",
    nom_affiche: d.nom_responsable || d.nom_boutique || "Vendeur",
    titre: "On ne vous voit plus 👀",
    corps: `${prenom}, votre boutique "${d.nom_boutique}" n'a pas eu de nouveau produit récemment. Ajoutez-en un aujourd'hui pour rester visible auprès des clients !`,
    lien: "/produits/ajouter"
  };
}

/* ══════════════════════════════════════════════
   ANNONCE PERSONNALISÉE À TOUTE LA BASE — même message que diffuser_message_libre
   dans l'esprit, mais avec le prénom de chaque destinataire injecté, envoyé à
   TOUS les clients ou TOUS les vendeurs (pas seulement les inactifs). Réutilise
   le même workflow que executerRelance (aperçu → confirmation → push_queue).
══════════════════════════════════════════════ */
async function executerAnnoncePersonnalisee(parametres, programmeePour, instructionOriginale) {
  const { titre, corps_template, cible } = parametres;

  if (!titre || !corps_template || !cible) {
    ajouterMessage("bot", "Il me manque le titre, le contenu ou la cible du message. Peux-tu préciser exactement ce que je dois envoyer (avec {prenom} pour l'emplacement du nom), et à qui (clients ou vendeurs) ?");
    return;
  }

  const rpcEndpoint = cible === "vendeur"
    ? AURA_CONFIG.endpoints.rpc_agent_lister_tous_vendeurs
    : AURA_CONFIG.endpoints.rpc_agent_lister_tous_clients;

  const destinatairesBruts = await API.post(rpcEndpoint, {});

  if (!Array.isArray(destinatairesBruts) || destinatairesBruts.length === 0) {
    ajouterMessage("bot", cible === "vendeur" ? "Aucun vendeur actif trouvé." : "Aucun client actif trouvé.");
    return;
  }

  const destinataires = destinatairesBruts.map(d => {
    const nomComplet = cible === "vendeur" ? (d.nom_responsable || d.nom_boutique || "") : (d.nom || "");
    const prenom = nomComplet.split(" ")[0] || (cible === "vendeur" ? "cher vendeur" : "cher client");
    return {
      user_id: cible === "vendeur" ? d.vendeur_id : d.client_id,
      app: cible,
      nom_affiche: nomComplet || (cible === "vendeur" ? "Vendeur" : "Client"),
      titre,
      corps: corps_template.replace(/\{prenom\}/gi, prenom),
      lien: null
    };
  });

  ajouterMessage("bot", `J'ai trouvé <b>${destinataires.length}</b> ${cible === "vendeur" ? "vendeur(s)" : "client(s)"}. Voici un aperçu avant envoi :`);

  const actionId = await API.post(AURA_CONFIG.endpoints.rpc_agent_creer_action, {
    p_instruction: instructionOriginale || `Annonce personnalisée : ${titre}`,
    p_type_action: "notification_personnalisee",
    p_parametres: { titre, corps_template, cible },
    p_apercu: { destinataires },
    p_nb_destinataires: destinataires.length,
    p_programmee_pour: programmeePour
  });

  if (programmeePour) {
    ajouterMessage("bot", `✓ Annonce programmée pour le ${new Date(programmeePour).toLocaleString("fr-FR")}. Elle partira automatiquement, chacun avec son prénom.`);
    chargerHistoriqueAgent();
    return;
  }

  _agiaActionCourante = { actionId, destinataires, type: "relance" };
  afficherApercu(`Annonce personnalisée — ${cible === "vendeur" ? "vendeurs" : "clients"}`, destinataires);
}

/* ══════════════════════════════════════════════
   DIFFUSION LIBRE — même message pour tous les clients et/ou vendeurs
   Réutilise directement les RPC diffuser_notification / programmer_diffusion
   déjà utilisées par le module Diffusion classique (comportement identique :
   notification in-app uniquement, pas de push Firebase — cohérent avec
   l'existant).
══════════════════════════════════════════════ */
const AGIA_CIBLE_LABELS = { client: "tous les clients", vendeur: "tous les vendeurs", les_deux: "tous les clients et vendeurs" };

async function executerDiffusionLibre(parametres, programmeePour, instructionOriginale) {
  const { titre, corps, cible } = parametres;

  if (!titre || !corps || !cible) {
    ajouterMessage("bot", "Il me manque le titre, le contenu ou la cible du message. Peux-tu préciser exactement ce que je dois envoyer, et à qui (clients, vendeurs, ou les deux) ?");
    return;
  }

  if (programmeePour) {
    try {
      const diffusionId = await API.post("/rest/rpc/programmer_diffusion", {
        p_titre: titre, p_corps: corps, p_image_url: null, p_lien_url: null,
        p_cible: cible, p_programmee_pour: programmeePour
      });
      await API.post("/rest/rpc/agent_historiser_diffusion", {
        p_instruction: instructionOriginale, p_titre: titre, p_corps: corps,
        p_cible: cible, p_diffusion_id: diffusionId, p_programmee_pour: programmeePour
      }).catch(() => {});
      ajouterMessage("bot", `✓ Diffusion programmée pour le ${new Date(programmeePour).toLocaleString("fr-FR")}, vers ${AGIA_CIBLE_LABELS[cible] || cible}. Elle partira automatiquement.`);
      chargerHistoriqueAgent();
    } catch (err) {
      ajouterMessage("bot", `Erreur de programmation : ${escAgia(err.message)}`, true);
    }
    return;
  }

  ajouterMessage("bot", "Voici un aperçu avant envoi :");
  _agiaActionCourante = { type: "diffusion_libre", titre, corps, cible, instructionOriginale };
  afficherApercuDiffusionLibre(titre, corps, cible);
}

function afficherApercuDiffusionLibre(titre, corps, cible) {
  const wrap = document.getElementById("agia-apercu-wrap");
  const titleEl = document.getElementById("agia-apercu-title");
  const countEl = document.getElementById("agia-apercu-count");
  const samplesEl = document.getElementById("agia-apercu-samples");

  titleEl.textContent = "Diffusion";
  countEl.textContent = AGIA_CIBLE_LABELS[cible] || cible;
  samplesEl.innerHTML = `
    <div class="agia-apercu-sample">
      <b>${escAgia(titre)}</b><br>
      ${escAgia(corps)}
    </div>
  `;

  wrap.style.display = "block";
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });
}

/* ══════════════════════════════════════════════
   APERÇU / CONFIRMATION
══════════════════════════════════════════════ */
function afficherApercu(titre, destinataires) {
  const wrap = document.getElementById("agia-apercu-wrap");
  const titleEl = document.getElementById("agia-apercu-title");
  const countEl = document.getElementById("agia-apercu-count");
  const samplesEl = document.getElementById("agia-apercu-samples");

  titleEl.textContent = titre;
  countEl.textContent = `${destinataires.length} destinataire${destinataires.length > 1 ? "s" : ""}`;

  const echantillon = destinataires.slice(0, 3);
  samplesEl.innerHTML = echantillon.map(d => `
    <div class="agia-apercu-sample">
      <b>${escAgia(d.nom_affiche)}</b><br>
      ${escAgia(d.titre)} — ${escAgia(d.corps)}
    </div>
  `).join("") + (destinataires.length > 3 ? `<div class="agia-apercu-sample">+ ${destinataires.length - 3} autre(s) message(s) personnalisé(s)…</div>` : "");

  wrap.style.display = "block";
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });
}

function onAgiaAnnulerApercu() {
  document.getElementById("agia-apercu-wrap").style.display = "none";
  if (_agiaActionCourante?.actionId) {
    API.post(AURA_CONFIG.endpoints.rpc_agent_annuler_action, { p_action_id: _agiaActionCourante.actionId }).catch(() => {});
  }
  ajouterMessage("bot", "Annulé. Rien n'a été envoyé.");
  _agiaActionCourante = null;
}

async function onAgiaConfirmerApercu() {
  if (!_agiaActionCourante) return;
  const confirmBtn = document.getElementById("agia-apercu-confirm");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Envoi en cours…";

  try {
    if (_agiaActionCourante.type === "diffusion_libre") {
      const { titre, corps, cible, instructionOriginale } = _agiaActionCourante;
      const diffusionId = await API.post("/rest/rpc/diffuser_notification", {
        p_titre: titre, p_corps: corps, p_image_url: null, p_lien_url: null, p_cible: cible
      });

      await API.post("/rest/rpc/agent_historiser_diffusion", {
        p_instruction: instructionOriginale || `Diffusion : ${titre}`,
        p_titre: titre, p_corps: corps, p_cible: cible, p_diffusion_id: diffusionId
      }).catch(() => {}); // best-effort, ne bloque pas l'envoi si l'historisation échoue

      document.getElementById("agia-apercu-wrap").style.display = "none";
      ajouterMessage("bot", `✓ Diffusion envoyée vers ${AGIA_CIBLE_LABELS[cible] || cible}.`);
      _agiaActionCourante = null;
      chargerHistoriqueAgent();
      return;
    }

    const destinatairesPayload = _agiaActionCourante.destinataires.map(d => ({
      user_id: d.user_id, app: d.app, titre: d.titre, corps: d.corps, lien: d.lien, image_url: null
    }));

    await API.post(AURA_CONFIG.endpoints.rpc_agent_confirmer_action, {
      p_action_id: _agiaActionCourante.actionId,
      p_destinataires: destinatairesPayload
    });

    document.getElementById("agia-apercu-wrap").style.display = "none";
    ajouterMessage("bot", `✓ Envoyé à ${destinatairesPayload.length} personne(s). Chacune a reçu son message personnalisé.`);
    _agiaActionCourante = null;
    chargerHistoriqueAgent();
  } catch (err) {
    ajouterMessage("bot", `Erreur lors de l'envoi : ${escAgia(err.message)}`, true);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "✓ Confirmer et envoyer";
  }
}

/* ══════════════════════════════════════════════
   HISTORIQUE DES ACTIONS
══════════════════════════════════════════════ */
async function chargerHistoriqueAgent() {
  const list = document.getElementById("agia-history-list");
  list.innerHTML = `<div class="agia-empty">Chargement…</div>`;

  try {
    const rows = await API.get(AURA_CONFIG.endpoints.agent_actions + "?select=*&order=created_at.desc&limit=20");

    if (!Array.isArray(rows) || rows.length === 0) {
      list.innerHTML = `<div class="agia-empty">Aucune action pour l'instant.</div>`;
      return;
    }

    const statusLabels = {
      executee: "Envoyé", en_attente: "En attente", programmee: "Programmé",
      annulee: "Annulé", erreur: "Erreur"
    };

    list.innerHTML = rows.map(r => `
      <div class="agia-history-item">
        <div class="agia-history-item-top">
          <span class="agia-history-instruction">${escAgia(r.instruction)}</span>
          <span class="agia-history-status ${r.statut}">${statusLabels[r.statut] || r.statut}</span>
        </div>
        <span class="agia-history-meta">
          ${r.nb_destinataires ?? 0} destinataire(s) · ${new Date(r.created_at).toLocaleString("fr-FR")}
          ${r.programmee_pour ? ` · prévu le ${new Date(r.programmee_pour).toLocaleString("fr-FR")}` : ""}
        </span>
      </div>
    `).join("");
  } catch (err) {
    list.innerHTML = `<div class="agia-empty">Erreur de chargement : ${escAgia(err.message)}</div>`;
  }
}

/* ══════════════════════════════════════════════
   UTILITAIRES UI
══════════════════════════════════════════════ */
function ajouterMessage(role, htmlContenu, isError = false) {
  const chat = document.getElementById("agia-chat");
  const div = document.createElement("div");
  div.className = `agia-msg agia-msg-${role === "user" ? "user" : "bot"}`;
  div.innerHTML = `<div class="agia-msg-bubble${isError ? " agia-error" : ""}">${htmlContenu}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function ajouterMessageLoading() {
  const chat = document.getElementById("agia-chat");
  const div = document.createElement("div");
  div.className = "agia-msg agia-msg-bot";
  div.innerHTML = `<div class="agia-msg-bubble"><div class="agia-msg-loading"><span></span><span></span><span></span></div></div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function retirerMessageLoading(el) {
  if (el && el.parentNode) el.remove();
}

function toggleAgiaEnvoiUI(enCours) {
  document.getElementById("agia-send-btn").disabled = enCours;
  document.getElementById("agia-input").disabled = enCours;
  document.querySelectorAll(".agia-quick-btn").forEach(b => b.disabled = enCours);
}

function escAgia(str) {
  if (str == null) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
