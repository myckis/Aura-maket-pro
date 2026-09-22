/**
 * AURA MARKET — Module Bannière publicitaire (Admin)
 * Fichier : assets/module-bannieres/module-bannieres.js
 * Dépend de : ../js/config.js (AURA_CONFIG, AURA_AUTH, API)
 */
"use strict";

const MBAN_BUCKET = "bannieres";
const MBAN_MAX_SIZE = 5 * 1024 * 1024; // 5 Mo

let _mbanFile = null;
let _mbanFileType = null; // "image" | "video"
let _mbanCible = "les_deux";
let _mbanItems = [];
let _mbanDragId = null;

document.addEventListener("DOMContentLoaded", () => {
  initUploadZone();
  initCibleButtons();
  document.getElementById("mban-form").addEventListener("submit", onSubmit);
  chargerBannieres();
});

/* ── Upload zone ─────────────────────────────────── */
function initUploadZone() {
  const zone   = document.getElementById("mban-upload-zone");
  const input  = document.getElementById("mban-file-input");
  const empty  = document.getElementById("mban-upload-empty");
  const preview = document.getElementById("mban-upload-preview");
  const imgEl  = document.getElementById("mban-preview-img");
  const vidEl  = document.getElementById("mban-preview-video");
  const removeBtn = document.getElementById("mban-preview-remove");

  zone.addEventListener("click", (e) => {
    if (e.target === removeBtn) return;
    input.click();
  });

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MBAN_MAX_SIZE) {
      showToast("Le fichier dépasse 5 Mo.", "error");
      input.value = "";
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      showToast("Format non supporté. Choisis une image ou une vidéo.", "error");
      input.value = "";
      return;
    }

    _mbanFile = file;
    _mbanFileType = isVideo ? "video" : "image";

    const url = URL.createObjectURL(file);
    empty.style.display = "none";
    preview.style.display = "block";

    if (isVideo) {
      vidEl.src = url;
      vidEl.style.display = "block";
      imgEl.style.display = "none";
    } else {
      imgEl.src = url;
      imgEl.style.display = "block";
      vidEl.style.display = "none";
    }
  });

  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    _mbanFile = null;
    _mbanFileType = null;
    input.value = "";
    empty.style.display = "flex";
    preview.style.display = "none";
    imgEl.src = "";
    vidEl.src = "";
  });
}

/* ── Sélecteur de cible ──────────────────────────── */
function initCibleButtons() {
  document.querySelectorAll(".mban-cible-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mban-cible-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mbanCible = btn.dataset.cible;
    });
  });
}

/* ── Upload vers Supabase Storage (via Worker) ──── */
async function uploadMedia(file, type) {
  const token = AURA_AUTH.getAccessToken();
  const ext = (file.name.split(".").pop() || (type === "video" ? "mp4" : "jpg")).toLowerCase();
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const res = await fetch(`${AURA_CONFIG.WORKER_URL}/storage/object/${MBAN_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || (type === "video" ? "video/mp4" : "image/jpeg"),
      Authorization: `Bearer ${token}`
    },
    body: file
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || "Échec de l'upload");
  }

  return `${AURA_CONFIG.WORKER_URL}/storage/object/public/${MBAN_BUCKET}/${path}`;
}

/* ── Soumission du formulaire ────────────────────── */
async function onSubmit(e) {
  e.preventDefault();

  if (!_mbanFile) {
    showToast("Ajoute une image ou une vidéo.", "error");
    return;
  }

  const btn = document.getElementById("mban-submit-btn");
  btn.disabled = true;
  btn.textContent = "Publication en cours…";

  try {
    const mediaUrl = await uploadMedia(_mbanFile, _mbanFileType);

    const user = AURA_AUTH.getUser();
    const adminId = user?.id || user?.sub || null;

    const titre = document.getElementById("mban-titre").value.trim();
    const lien  = document.getElementById("mban-lien").value.trim();
    const actif = document.getElementById("mban-actif").checked;
    const ordre = _mbanItems.length; // ajoutée en fin de liste

    await API.post(AURA_CONFIG.endpoints.bannieres, {
      titre: titre || null,
      media_url: mediaUrl,
      media_type: _mbanFileType,
      cible: _mbanCible,
      lien_url: lien || null,
      actif,
      ordre,
      created_by: adminId
    });

    showToast("Bannière publiée avec succès.", "success");
    resetForm();
    chargerBannieres();

  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Publier la bannière";
  }
}

function resetForm() {
  document.getElementById("mban-form").reset();
  document.getElementById("mban-actif").checked = true;
  document.getElementById("mban-file-input").value = "";
  document.getElementById("mban-upload-empty").style.display = "flex";
  document.getElementById("mban-upload-preview").style.display = "none";
  document.getElementById("mban-preview-img").src = "";
  document.getElementById("mban-preview-video").src = "";
  _mbanFile = null;
  _mbanFileType = null;
  _mbanCible = "les_deux";
  document.querySelectorAll(".mban-cible-btn").forEach(b => b.classList.remove("active"));
  document.querySelector('.mban-cible-btn[data-cible="les_deux"]').classList.add("active");
}

/* ── Chargement + rendu de la liste ──────────────── */
async function chargerBannieres() {
  const list = document.getElementById("mban-list");
  const empty = document.getElementById("mban-empty");

  try {
    const rows = await API.get(AURA_CONFIG.endpoints.bannieres + "?order=ordre.asc,created_at.desc");
    _mbanItems = Array.isArray(rows) ? rows : [];

    if (_mbanItems.length === 0) {
      list.innerHTML = `<div class="mban-empty" id="mban-empty">Aucune bannière pour l'instant.</div>`;
      return;
    }

    list.innerHTML = _mbanItems.map(renderItem).join("");
    bindItemEvents();

  } catch (err) {
    list.innerHTML = `<div class="mban-empty" id="mban-empty" style="border-color:var(--danger);color:var(--danger);">Erreur : ${escMban(err.message)}</div>`;
  }
}

function cibleLabel(c) {
  if (c === "client") return "Client";
  if (c === "vendeur") return "Vendeur";
  return "Client + Vendeur";
}

function renderItem(b) {
  const thumb = b.media_type === "video"
    ? `<video src="${escMban(b.media_url)}" muted></video><span class="mban-video-badge">VIDÉO</span>`
    : `<img src="${escMban(b.media_url)}" alt="">`;

  return `
    <div class="mban-item" draggable="true" data-id="${b.id}">
      <div class="mban-item-handle">
        <svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>
      </div>
      <div class="mban-item-thumb">${thumb}</div>
      <div class="mban-item-info">
        <div class="mban-item-titre">${escMban(b.titre) || "Sans titre"}</div>
        <div class="mban-item-meta">
          <span class="mban-tag">${cibleLabel(b.cible)}</span>
          <span class="mban-tag ${b.actif ? "actif" : "inactif"}">${b.actif ? "Active" : "Inactive"}</span>
        </div>
      </div>
      <div class="mban-item-actions">
        <label class="mban-switch mban-item-toggle">
          <input type="checkbox" ${b.actif ? "checked" : ""} onchange="toggleActif('${b.id}', this.checked)">
          <span class="mban-switch-track"></span>
        </label>
        <button class="mban-item-delete" onclick="supprimerBanniere('${b.id}')" title="Supprimer">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h10l1-13"/></svg>
        </button>
      </div>
    </div>`;
}

/* ── Toggle actif/inactif ────────────────────────── */
async function toggleActif(id, actif) {
  try {
    await API.patch(AURA_CONFIG.endpoints.bannieres + "?id=eq." + id, { actif });
    const item = _mbanItems.find(b => b.id === id);
    if (item) item.actif = actif;
    const tag = document.querySelector(`.mban-item[data-id="${id}"] .mban-tag.actif, .mban-item[data-id="${id}"] .mban-tag.inactif`);
    if (tag) {
      tag.classList.toggle("actif", actif);
      tag.classList.toggle("inactif", !actif);
      tag.textContent = actif ? "Active" : "Inactive";
    }
    showToast(actif ? "Bannière activée." : "Bannière désactivée.", "success");
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
    chargerBannieres();
  }
}

/* ── Suppression ──────────────────────────────────── */
async function supprimerBanniere(id) {
  if (!confirm("Supprimer définitivement cette bannière ?")) return;
  try {
    await API.delete(AURA_CONFIG.endpoints.bannieres + "?id=eq." + id);
    showToast("Bannière supprimée.", "success");
    chargerBannieres();
  } catch (err) {
    showToast("Erreur : " + err.message, "error");
  }
}

/* ── Réordonnancement par glisser-déposer ────────── */
function bindItemEvents() {
  const items = document.querySelectorAll(".mban-item");

  items.forEach(item => {
    item.addEventListener("dragstart", () => {
      _mbanDragId = item.dataset.id;
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      document.querySelectorAll(".mban-item").forEach(i => i.classList.remove("drag-over"));
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (item.dataset.id !== _mbanDragId) item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
      const targetId = item.dataset.id;
      if (targetId === _mbanDragId) return;
      reorder(_mbanDragId, targetId);
    });
  });
}

async function reorder(draggedId, targetId) {
  const fromIndex = _mbanItems.findIndex(b => b.id === draggedId);
  const toIndex   = _mbanItems.findIndex(b => b.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [moved] = _mbanItems.splice(fromIndex, 1);
  _mbanItems.splice(toIndex, 0, moved);

  // Re-render immédiat pour un retour visuel instantané
  const list = document.getElementById("mban-list");
  list.innerHTML = _mbanItems.map(renderItem).join("");
  bindItemEvents();

  // Persistance des nouveaux ordres
  try {
    await Promise.all(
      _mbanItems.map((b, i) =>
        API.patch(AURA_CONFIG.endpoints.bannieres + "?id=eq." + b.id, { ordre: i })
      )
    );
  } catch (err) {
    showToast("Erreur lors de la réorganisation : " + err.message, "error");
    chargerBannieres();
  }
}

/* ── Toast ────────────────────────────────────────── */
let _mbanToastTimer = null;
function showToast(message, type = "info") {
  const toast = document.getElementById("mban-toast");
  toast.textContent = message;
  toast.className = "mban-toast show" + (type === "error" ? " error" : type === "success" ? " success" : "");
  clearTimeout(_mbanToastTimer);
  _mbanToastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function escMban(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
