/**
 * AURA MARKET — Module Diffusion (Admin)
 * Fichier : assets/module-diffusion/module-diffusion.js
 * Dépend de : ../js/config.js (AURA_CONFIG, AURA_AUTH, API)
 *
 * Envoie une notification (texte + image optionnelle) à tous les comptes
 * client et/ou vendeur via la RPC Supabase "diffuser_notification", qui
 * gère elle-même le fan-out vers la table notifications.
 */
"use strict";

const MDIF_BUCKET = "diffusions";
const MDIF_MAX_SIZE = 5 * 1024 * 1024; // 5 Mo

let _mdifFile = null;
let _mdifCible = "les_deux";
let _mdifMode = "maintenant";
let _mdifItems = [];
let _mdifPendingDeleteId = null;

document.addEventListener("DOMContentLoaded", () => {
  initUploadZone();
  initCibleButtons();
  initModeButtons();
  document.getElementById("mdif-form").addEventListener("submit", onFormSubmit);
  document.getElementById("mdif-confirm-cancel").addEventListener("click", closeConfirmModal);
  document.getElementById("mdif-confirm-ok").addEventListener("click", onConfirmSend);
  chargerDiffusions();
});

/* ── Sélecteur de mode (maintenant / programmer) ── */
function initModeButtons() {
  const zone = document.getElementById("mdif-schedule-zone");
  const submitBtn = document.getElementById("mdif-submit-btn");
  const dtInput = document.getElementById("mdif-schedule-datetime");

  // Empêche de choisir une date/heure passée
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 5);
  dtInput.min = now.toISOString().slice(0, 16);

  document.querySelectorAll(".mdif-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mdif-mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mdifMode = btn.dataset.mode;

      if (_mdifMode === "programmer") {
        zone.classList.add("show");
        submitBtn.textContent = "Programmer la diffusion";
        // Suggère +1h par défaut si aucune date n'est déjà choisie, pour éviter
        // qu'un admin ne programme par erreur à quelques minutes seulement
        // (ce qui donne l'impression trompeuse d'un envoi "instantané").
        if (!dtInput.value) {
          const suggestion = new Date();
          suggestion.setMinutes(suggestion.getMinutes() - suggestion.getTimezoneOffset() + 60);
          dtInput.value = suggestion.toISOString().slice(0, 16);
        }
      } else {
        zone.classList.remove("show");
        submitBtn.textContent = "Envoyer la diffusion";
      }
    });
  });
}

/* ── Upload zone (image uniquement) ─────────────── */
function initUploadZone() {
  const zone = document.getElementById("mdif-upload-zone");
  const input = document.getElementById("mdif-file-input");
  const empty = document.getElementById("mdif-upload-empty");
  const preview = document.getElementById("mdif-upload-preview");
  const imgEl = document.getElementById("mdif-preview-img");
  const removeBtn = document.getElementById("mdif-preview-remove");

  zone.addEventListener("click", (e) => {
    if (e.target === removeBtn) return;
    input.click();
  });

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MDIF_MAX_SIZE) {
      showToast("L'image dépasse 5 Mo.", "error");
      input.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Format non supporté. Choisis une image.", "error");
      input.value = "";
      return;
    }

    empty.style.display = "none";
    preview.style.display = "block";
    imgEl.style.opacity = "0.4";
    imgEl.src = URL.createObjectURL(file);

    try {
      const compressed = await compresserImage(file);
      _mdifFile = compressed;
      imgEl.src = URL.createObjectURL(compressed);
      imgEl.style.opacity = "1";
    } catch (err) {
      // En cas d'échec de compression, on garde le fichier original tel quel
      _mdifFile = file;
      imgEl.style.opacity = "1";
      console.error("Compression impossible, envoi du fichier original :", err.message);
    }
  });

  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    _mdifFile = null;
    input.value = "";
    empty.style.display = "flex";
    preview.style.display = "none";
    imgEl.src = "";
    delete imgEl.dataset.existingUrl;
  });
}

/* ── Compression d'image côté client (Canvas) ────
   Objectif : réduire au maximum le poids envoyé à Supabase tout en
   gardant une image nette pour la miniature de notification.
   - Redimensionne si la plus grande dimension dépasse 1280px
   - Réencode en JPEG avec réduction progressive de la qualité
     jusqu'à passer sous MDIF_TARGET_SIZE (ou qualité minimale atteinte)
──────────────────────────────────────────────── */
const MDIF_MAX_DIMENSION = 1280; // px, côté le plus long
const MDIF_TARGET_SIZE = 300 * 1024; // 300 Ko visé
const MDIF_MIN_QUALITY = 0.5;

function compresserImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MDIF_MAX_DIMENSION || height > MDIF_MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round(height * (MDIF_MAX_DIMENSION / width));
          width = MDIF_MAX_DIMENSION;
        } else {
          width = Math.round(width * (MDIF_MAX_DIMENSION / height));
          height = MDIF_MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      tryEncode(canvas, 0.8);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire l'image."));
    };

    img.src = url;

    function tryEncode(canvas, quality) {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Échec de l'encodage de l'image."));
          return;
        }
        if (blob.size <= MDIF_TARGET_SIZE || quality <= MDIF_MIN_QUALITY) {
          const nomFinal = (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg";
          resolve(new File([blob], nomFinal, { type: "image/jpeg" }));
          return;
        }
        tryEncode(canvas, Math.max(quality - 0.1, MDIF_MIN_QUALITY));
      }, "image/jpeg", quality);
    }
  });
}

/* ── Sélecteur de cible ──────────────────────────── */
function initCibleButtons() {
  document.querySelectorAll(".mdif-cible-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mdif-cible-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mdifCible = btn.dataset.cible;
    });
  });
}

/* ── Upload vers Supabase Storage (via Worker) ──── */
async function uploadImage(file) {
  const token = AURA_AUTH.getAccessToken();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const res = await fetch(`${AURA_CONFIG.WORKER_URL}/storage/object/${MDIF_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "image/jpeg",
      Authorization: `Bearer ${token}`
    },
    body: file
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || "Échec de l'upload");
  }

  return `${AURA_CONFIG.WORKER_URL}/storage/object/public/${MDIF_BUCKET}/${path}`;
}

/* ── Soumission du formulaire → ouvre la confirmation ── */
function onFormSubmit(e) {
  e.preventDefault();

  const titre = document.getElementById("mdif-titre").value.trim();
  if (!titre) {
    showToast("Le titre est obligatoire.", "error");
    return;
  }

  const cibleLabels = { client: "l'application client", vendeur: "l'application vendeur", les_deux: "les applications client et vendeur" };

  if (_mdifMode === "programmer") {
    const dtValue = document.getElementById("mdif-schedule-datetime").value;
    if (!dtValue) {
      showToast("Choisis une date et une heure d'envoi.", "error");
      return;
    }
    const dt = new Date(dtValue);
    if (dt <= new Date()) {
      showToast("La date choisie doit être dans le futur.", "error");
      return;
    }
    const dateFormatee = dt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
    document.getElementById("mdif-confirm-text").textContent =
      `Cette diffusion sera envoyée automatiquement le ${dateFormatee} à tous les comptes de ${cibleLabels[_mdifCible]}. Tu pourras l'annuler avant cette date depuis l'historique.`;
  } else {
    document.getElementById("mdif-confirm-text").textContent =
      `Cette diffusion sera envoyée immédiatement à tous les comptes de ${cibleLabels[_mdifCible]}. Cette action est irréversible.`;
  }

  openConfirmModal();
}

function openConfirmModal() {
  document.getElementById("mdif-confirm-overlay").classList.add("show");
}
function closeConfirmModal() {
  document.getElementById("mdif-confirm-overlay").classList.remove("show");
}

/* ── Envoi réel après confirmation ───────────────── */
async function onConfirmSend() {
  closeConfirmModal();

  const btn = document.getElementById("mdif-submit-btn");
  btn.disabled = true;
  btn.textContent = _mdifMode === "programmer" ? "Programmation en cours…" : "Envoi en cours…";

  try {
    let imageUrl = null;
    if (_mdifFile) {
      imageUrl = await uploadImage(_mdifFile);
    } else {
      const existingUrl = document.getElementById("mdif-preview-img").dataset.existingUrl;
      if (existingUrl) imageUrl = existingUrl;
    }

    const titre = document.getElementById("mdif-titre").value.trim();
    const corps = document.getElementById("mdif-corps").value.trim();
    const lien  = document.getElementById("mdif-lien").value.trim();

    if (_mdifMode === "programmer") {
      const dtValue = document.getElementById("mdif-schedule-datetime").value;
      const dtISO = new Date(dtValue).toISOString();

      await API.post("/rest/rpc/programmer_diffusion", {
        p_titre: titre,
        p_corps: corps || null,
        p_image_url: imageUrl,
        p_lien_url: lien || null,
        p_cible: _mdifCible,
        p_programmee_pour: dtISO
      });

      showToast("Diffusion programmée avec succès.", "success");
    } else {
      await API.post("/rest/rpc/diffuser_notification", {
        p_titre: titre,
        p_corps: corps || null,
        p_image_url: imageUrl,
        p_lien_url: lien || null,
        p_cible: _mdifCible
      });

      showToast("Diffusion envoyée avec succès.", "success");
    }

    resetForm();
    chargerDiffusions();

  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = _mdifMode === "programmer" ? "Programmer la diffusion" : "Envoyer la diffusion";
  }
}

function resetForm() {
  document.getElementById("mdif-form").reset();
  document.getElementById("mdif-file-input").value = "";
  document.getElementById("mdif-upload-empty").style.display = "flex";
  document.getElementById("mdif-upload-preview").style.display = "none";
  document.getElementById("mdif-preview-img").src = "";
  delete document.getElementById("mdif-preview-img").dataset.existingUrl;
  _mdifFile = null;
  _mdifCible = "les_deux";
  document.querySelectorAll(".mdif-cible-btn").forEach(b => b.classList.remove("active"));
  document.querySelector('.mdif-cible-btn[data-cible="les_deux"]').classList.add("active");

  _mdifMode = "maintenant";
  document.querySelectorAll(".mdif-mode-btn").forEach(b => b.classList.remove("active"));
  document.querySelector('.mdif-mode-btn[data-mode="maintenant"]').classList.add("active");
  document.getElementById("mdif-schedule-zone").classList.remove("show");
  document.getElementById("mdif-submit-btn").textContent = "Envoyer la diffusion";
}

/* ── Chargement + rendu de l'historique ──────────── */
async function chargerDiffusions() {
  const list = document.getElementById("mdif-list");

  try {
    const rows = await API.get(AURA_CONFIG.endpoints.diffusions + "?order=created_at.desc&limit=100");
    _mdifItems = Array.isArray(rows) ? rows : [];

    if (_mdifItems.length === 0) {
      list.innerHTML = `<div class="mdif-empty" id="mdif-empty">Aucune diffusion envoyée pour l'instant.</div>`;
      return;
    }

    list.innerHTML = _mdifItems.map(renderItem).join("");

  } catch (err) {
    list.innerHTML = `<div class="mdif-empty" id="mdif-empty" style="border-color:var(--danger);color:var(--danger);">Erreur : ${escMdif(err.message)}</div>`;
  }
}

function cibleLabel(c) {
  if (c === "client") return "Client";
  if (c === "vendeur") return "Vendeur";
  return "Client + Vendeur";
}

function renderItem(d) {
  const thumb = d.image_url
    ? `<img src="${escMdif(d.image_url)}" alt="">`
    : `<svg viewBox="0 0 24 24"><path d="M4 11v2a1 1 0 0 0 1 1h2l4 4V6L7 10H5a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/></svg>`;

  const estProgrammee = d.statut === "programmee";
  const estAnnulee = d.statut === "annulee";

  let badgeStatut = "";
  if (estProgrammee) {
    badgeStatut = `<span class="mdif-tag scheduled"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>Programmée pour le ${formatMdifDateComplete(d.programmee_pour)}</span>`;
  } else if (estAnnulee) {
    badgeStatut = `<span class="mdif-tag cancelled">Annulée</span>`;
  }

  const dupliquerBtn = (!estProgrammee && !estAnnulee)
    ? `<button class="mdif-item-cancel" onclick="reprogrammerDiffusion('${d.id}')" title="Dupliquer / reprogrammer">
         <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
       </button>`
    : "";

  const actionBtn = estProgrammee
    ? `<button class="mdif-item-cancel" onclick="demanderAnnulationDiffusion('${d.id}')" title="Annuler la programmation">
         <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
       </button>`
    : `<button class="mdif-item-delete" onclick="demanderSuppressionDiffusion('${d.id}')" title="Supprimer de l'historique">
         <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h10l1-13"/></svg>
       </button>`;

  return `
    <div class="mdif-item ${estProgrammee ? "is-scheduled" : ""}" data-id="${d.id}">
      <div class="mdif-item-thumb">${thumb}</div>
      <div class="mdif-item-info">
        <div class="mdif-item-titre">${escMdif(d.titre)}</div>
        ${d.corps ? `<div class="mdif-item-corps">${escMdif(d.corps)}</div>` : ""}
        <div class="mdif-item-meta">
          <span class="mdif-tag">${cibleLabel(d.cible)}</span>
          ${estProgrammee || estAnnulee ? "" : `<span class="mdif-tag count">${d.nb_destinataires} destinataire${d.nb_destinataires > 1 ? "s" : ""}</span>`}
          ${badgeStatut}
          <span class="mdif-tag">${formatMdifDate(d.created_at)}</span>
        </div>
      </div>
      <div class="mdif-item-actions">
        ${dupliquerBtn}
        ${actionBtn}
      </div>
    </div>`;
}

/* ── Dupliquer / reprogrammer une diffusion déjà envoyée ── */
function reprogrammerDiffusion(id) {
  const d = _mdifItems.find(item => String(item.id) === String(id));
  if (!d) {
    showToast("Diffusion introuvable.", "error");
    return;
  }

  document.getElementById("mdif-titre").value = d.titre || "";
  document.getElementById("mdif-corps").value = d.corps || "";
  document.getElementById("mdif-lien").value = d.lien_url || "";

  if (d.image_url) {
    _mdifFile = null; // l'image existante sera référencée par son URL, pas ré-uploadée
    document.getElementById("mdif-upload-empty").style.display = "none";
    document.getElementById("mdif-upload-preview").style.display = "block";
    document.getElementById("mdif-preview-img").src = d.image_url;
    document.getElementById("mdif-preview-img").dataset.existingUrl = d.image_url;
  } else {
    document.getElementById("mdif-file-input").value = "";
    document.getElementById("mdif-upload-empty").style.display = "flex";
    document.getElementById("mdif-upload-preview").style.display = "none";
    document.getElementById("mdif-preview-img").src = "";
    delete document.getElementById("mdif-preview-img").dataset.existingUrl;
  }

  _mdifCible = d.cible || "les_deux";
  document.querySelectorAll(".mdif-cible-btn").forEach(b => b.classList.remove("active"));
  const cibleBtn = document.querySelector(`.mdif-cible-btn[data-cible="${_mdifCible}"]`);
  if (cibleBtn) cibleBtn.classList.add("active");

  _mdifMode = "programmer";
  document.querySelectorAll(".mdif-mode-btn").forEach(b => b.classList.remove("active"));
  document.querySelector('.mdif-mode-btn[data-mode="programmer"]').classList.add("active");
  document.getElementById("mdif-schedule-zone").classList.add("show");
  document.getElementById("mdif-submit-btn").textContent = "Programmer la diffusion";

  const dtInput = document.getElementById("mdif-schedule-datetime");
  const suggestion = new Date();
  suggestion.setMinutes(suggestion.getMinutes() - suggestion.getTimezoneOffset() + 60);
  dtInput.value = suggestion.toISOString().slice(0, 16);

  document.getElementById("mdif-form").scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("Diffusion dupliquée — choisis une nouvelle date d'envoi.", "success");
}

/* ── Annulation d'une diffusion programmée ───────── */
function demanderAnnulationDiffusion(id) {
  if (!confirm("Annuler cette diffusion programmée ? Elle ne sera jamais envoyée.")) return;
  annulerDiffusionProgrammee(id);
}

async function annulerDiffusionProgrammee(id) {
  try {
    await API.post("/rest/rpc/annuler_diffusion_programmee", { p_id: id });
    showToast("Diffusion programmée annulée.", "success");
    chargerDiffusions();
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

function formatMdifDateComplete(iso) {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

/* ── Suppression (historique uniquement, les notifs déjà reçues restent) ── */
function demanderSuppressionDiffusion(id) {
  _mdifPendingDeleteId = id;
  if (!confirm("Retirer cette diffusion de l'historique ? Les notifications déjà reçues par les utilisateurs ne seront pas affectées.")) {
    _mdifPendingDeleteId = null;
    return;
  }
  supprimerDiffusion(id);
}

async function supprimerDiffusion(id) {
  try {
    await API.delete(AURA_CONFIG.endpoints.diffusions + "?id=eq." + id);
    showToast("Diffusion retirée de l'historique.", "success");
    chargerDiffusions();
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

/* ── Utilitaires ──────────────────────────────────── */
function formatMdifDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffJ = Math.floor(diffH / 24);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffH < 24) return `il y a ${diffH} h`;
  if (diffJ < 7) return `il y a ${diffJ} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

let _mdifToastTimer = null;
function showToast(message, type = "info") {
  const toast = document.getElementById("mdif-toast");
  toast.textContent = message;
  toast.className = "mdif-toast show" + (type === "error" ? " error" : type === "success" ? " success" : "");
  clearTimeout(_mdifToastTimer);
  _mdifToastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function escMdif(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
