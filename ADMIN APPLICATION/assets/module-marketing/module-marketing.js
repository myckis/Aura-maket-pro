/**
 * AURA MARKET — Module Marketing & Publicité (Admin)
 * Fichier : assets/module-marketing/module-marketing.js
 * Dépend de : ../js/config.js (AURA_CONFIG, AURA_AUTH, API)
 *
 * Wizard en 5 étapes :
 *   1. Application cible (pro = vendeurs / ci = clients / les_deux)
 *   2. Plateformes de diffusion (tiktok, facebook, whatsapp, linkedin — multi)
 *   3. Contenu (avantages vendeur ou boutiques à l'honneur / catégories + nb images / couleur)
 *   4. Message (prompt libre + ton)
 *   5. Format (texte / image / les deux) + mode image (canvas pro / IA)
 *
 * Génère un texte DISTINCT par plateforme sélectionnée (codes propres à chaque réseau).
 * Génère un visuel :
 *   - mode "canvas" : montage professionnel via Canvas à partir de VRAIES photos produits
 *     + logo de l'app concernée + couleur choisie (par défaut, recommandé)
 *   - mode "ia"     : génération via Pollinations.ai avec prompt enrichi
 *
 * Endpoints Worker attendus (à créer côté Cloudflare Worker) :
 *   POST {WORKER_URL}/ai/marketing/texte   { prompt, ton, cible, plateforme }
 * En attendant, le module gère un fallback si la route n'existe pas.
 */
"use strict";

const MMKT_BUCKET = "visuels-marketing";
const MMKT_TOTAL_STEPS = 5;

const MMKT_APP_LOGOS = {
  pro: "../img/Logovendeur.png",
  ci: "../img/Logouniversel.png",
  les_deux: "../img/Logovendeur.png"
};

const MMKT_APP_LABELS = {
  pro: "Aura Market Pro",
  ci: "Aura Market CI",
  les_deux: "Aura Market"
};

const MMKT_PLATFORM_LABELS = {
  tiktok: "TikTok",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn"
};

/* Contraintes d'écriture par réseau, utilisées pour générer un texte distinct et adapté */
const MMKT_PLATFORM_STYLE = {
  tiktok: "Texte TRÈS court et percutant (max 2-3 phrases courtes), style oral et énergique, emojis avec parcimonie, 3-5 hashtags tendance à la fin, aucune formule corporate.",
  facebook: "Texte de 3-5 phrases, chaleureux et engageant, peut inclure un emoji ou deux, appel à l'action clair, 2-3 hashtags à la fin.",
  whatsapp: "Texte très court (1-3 phrases), direct, format \"statut\" à lire en 3 secondes, pas de hashtags, éventuellement 1 emoji.",
  linkedin: "Texte professionnel de 3-6 phrases, ton sobre et factuel, orienté opportunité/business/chiffres, aucun emoji ou un seul maximum, pas de hashtags excessifs (2 max, professionnels)."
};

let _mmktStep = 1;
let _mmktApp = null; // pro | ci | les_deux
let _mmktPlatforms = []; // ['tiktok', 'facebook', ...]
let _mmktVendeurMode = "motivation"; // motivation | recrutement | boutiques
let _mmktSuggestionsAJour = false;
let _mmktSuggestionsCache = [];
let _mmktBoutiquesSelection = []; // [{id, nom_boutique, logo_url}]
let _mmktCategoriesSelection = []; // ['Smartphones', ...]
let _mmktNbImages = 4;
let _mmktCouleur = "#F0B429";
let _mmktTon = "dynamique";
let _mmktType = "les_deux"; // les_deux | texte | image
let _mmktModeImage = "canvas"; // canvas | ia
let _mmktTemplateMode = "aleatoire"; // aleatoire | manuel
let _mmktTemplateChoisi = "grille"; // clé du template choisi manuellement

let _mmktBoutiquesCache = [];
let _mmktCategoriesCache = []; // [{categorie, count}]
let _mmktItems = [];

let _mmktDernierResultat = null; // { textes: {plateforme: texte}, imageDataUrl, produitsUtilises, appCible }
let _mmktActiveResultTab = null;
let _mmktImageUrlStockee = null; // URL publique (Storage ou Pollinations) du dernier visuel généré

document.addEventListener("DOMContentLoaded", () => {
  if (typeof AURA_AUTH !== "undefined") AURA_AUTH.requireAuth?.();

  initStepper();
  initAppCards();
  initPlatformCards();
  initVendeurModeButtons();
  initNbImgButtons();
  initColorPicker();
  initTonChips();
  initTypeButtons();
  initModeImageButtons();
  initTemplateSelector();
  initBoutiqueSearch();

  chargerBoutiques();
  chargerCategories();

  document.getElementById("mmkt-form").addEventListener("submit", onGenerer);
  document.getElementById("mmkt-next-btn").addEventListener("click", onNextStep);
  document.getElementById("mmkt-prev-btn").addEventListener("click", onPrevStep);
  document.getElementById("mmkt-suggestions-refresh").addEventListener("click", () => chargerSuggestions(true));

  document.getElementById("mmkt-copy-texte-btn").addEventListener("click", copierTexte);
  document.getElementById("mmkt-download-img-btn").addEventListener("click", telechargerImage);
  document.getElementById("mmkt-share-whatsapp").addEventListener("click", () => partager("whatsapp"));
  document.getElementById("mmkt-share-facebook").addEventListener("click", () => partager("facebook"));
  document.getElementById("mmkt-share-tiktok").addEventListener("click", () => partager("tiktok"));
  document.getElementById("mmkt-share-linkedin").addEventListener("click", () => partager("linkedin"));

  chargerHistorique();
});

/* ══════════════════════════════════════════════
   STEPPER / NAVIGATION
══════════════════════════════════════════════ */
function initStepper() {
  renderStepper();
}

function renderStepper() {
  document.querySelectorAll(".mmkt-step").forEach(el => {
    const n = parseInt(el.dataset.step, 10);
    el.classList.toggle("active", n === _mmktStep);
    el.classList.toggle("done", n < _mmktStep);
  });
}

function goToStep(step) {
  _mmktStep = step;
  document.querySelectorAll(".mmkt-panel").forEach(p => {
    p.classList.toggle("active", parseInt(p.dataset.panel, 10) === step);
  });
  renderStepper();

  document.getElementById("mmkt-prev-btn").style.display = step === 1 ? "none" : "flex";
  document.getElementById("mmkt-next-btn").style.display = step === MMKT_TOTAL_STEPS ? "none" : "flex";
  document.getElementById("mmkt-submit-btn").style.display = step === MMKT_TOTAL_STEPS ? "flex" : "none";

  if (step === 3) refreshStep3Visibility();
  if (step === 4) chargerSuggestions();
  if (step === 5) refreshStep5Visibility();

  document.querySelector(".mmkt-col-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function onNextStep() {
  const err = validateStep(_mmktStep);
  if (err) { showMmktToast(err, "error"); return; }
  if (_mmktStep < MMKT_TOTAL_STEPS) goToStep(_mmktStep + 1);
}

function onPrevStep() {
  if (_mmktStep > 1) goToStep(_mmktStep - 1);
}

function validateStep(step) {
  if (step === 1 && !_mmktApp) return "Choisis une application.";
  if (step === 2 && _mmktPlatforms.length === 0) return "Sélectionne au moins un réseau.";
  if (step === 3) {
    if (_mmktApp === "vendeur" || _mmktApp === "pro") {
      if (_mmktVendeurMode === "boutiques" && _mmktBoutiquesSelection.length === 0) {
        return "Choisis au moins une boutique à mettre en avant.";
      }
    }
    if (_mmktApp === "ci" && _mmktCategoriesSelection.length === 0) {
      return "Choisis au moins une catégorie.";
    }
  }
  return null;
}

/* ══════════════════════════════════════════════
   ÉTAPE 1 — Application
══════════════════════════════════════════════ */
function initAppCards() {
  document.querySelectorAll(".mmkt-app-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".mmkt-app-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      _mmktApp = card.dataset.app;
      refreshStep5Visibility();
    });
  });
}

/* ══════════════════════════════════════════════
   ÉTAPE 2 — Plateformes
══════════════════════════════════════════════ */
function initPlatformCards() {
  document.querySelectorAll(".mmkt-platform-card").forEach(card => {
    card.addEventListener("click", () => {
      card.classList.toggle("active");
      const p = card.dataset.platform;
      if (card.classList.contains("active")) {
        if (!_mmktPlatforms.includes(p)) _mmktPlatforms.push(p);
      } else {
        _mmktPlatforms = _mmktPlatforms.filter(x => x !== p);
      }
    });
  });

  document.getElementById("mmkt-select-all-platforms").addEventListener("click", () => {
    const allActive = _mmktPlatforms.length === 4;
    document.querySelectorAll(".mmkt-platform-card").forEach(card => {
      card.classList.toggle("active", !allActive);
    });
    _mmktPlatforms = allActive ? [] : ["tiktok", "facebook", "whatsapp", "linkedin"];
  });
}

/* ══════════════════════════════════════════════
   ÉTAPE 3 — Contenu
══════════════════════════════════════════════ */
function refreshStep3Visibility() {
  const vendeurWrap = document.getElementById("mmkt-contenu-vendeur");
  const clientWrap = document.getElementById("mmkt-contenu-client");
  const comboWrap = document.getElementById("mmkt-contenu-combo");

  vendeurWrap.style.display = _mmktApp === "pro" ? "block" : "none";
  clientWrap.style.display = _mmktApp === "ci" ? "block" : "none";
  comboWrap.style.display = _mmktApp === "les_deux" ? "block" : "none";
}

function initVendeurModeButtons() {
  document.querySelectorAll("[data-vendeur-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-vendeur-mode]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mmktVendeurMode = btn.dataset.vendeurMode;
      document.getElementById("mmkt-boutiques-picker-wrap").style.display = _mmktVendeurMode === "boutiques" ? "block" : "none";
      _mmktSuggestionsAJour = false; // objectif changé : les suggestions affichées ne sont plus à jour
    });
  });
}

async function chargerBoutiques() {
  try {
    const rows = await API.get(`${AURA_CONFIG.endpoints.vendeurs}?select=id,nom_boutique,logo_url,statut&order=nom_boutique.asc&limit=500`);
    _mmktBoutiquesCache = (Array.isArray(rows) ? rows : []).filter(v => v.statut === "approuve");
    renderBoutiqueList(_mmktBoutiquesCache);
  } catch (err) {
    document.getElementById("mmkt-boutique-list").innerHTML = `<div class="mmkt-empty-inline">Erreur de chargement des boutiques.</div>`;
  }
}

function renderBoutiqueList(list) {
  const wrap = document.getElementById("mmkt-boutique-list");
  if (list.length === 0) {
    wrap.innerHTML = `<div class="mmkt-empty-inline">Aucune boutique trouvée.</div>`;
    return;
  }
  wrap.innerHTML = list.map(b => {
    const isActive = _mmktBoutiquesSelection.some(s => s.id === b.id);
    const initiale = (b.nom_boutique || "?").charAt(0).toUpperCase();
    const avatar = b.logo_url
      ? `<img src="${escMmkt(b.logo_url)}" alt="">`
      : initiale;
    return `
      <div class="mmkt-boutique-row ${isActive ? "active" : ""}" data-id="${b.id}" onclick="mmktToggleBoutique('${b.id}')">
        <div class="mmkt-boutique-avatar">${avatar}</div>
        <div class="mmkt-boutique-name">${escMmkt(b.nom_boutique || "Boutique sans nom")}</div>
        <div class="mmkt-boutique-check"></div>
      </div>`;
  }).join("");
}

function mmktToggleBoutique(id) {
  const boutique = _mmktBoutiquesCache.find(b => String(b.id) === String(id));
  if (!boutique) return;
  const idx = _mmktBoutiquesSelection.findIndex(s => s.id === boutique.id);
  if (idx >= 0) {
    _mmktBoutiquesSelection.splice(idx, 1);
  } else {
    _mmktBoutiquesSelection.push(boutique);
  }
  renderBoutiqueList(_mmktBoutiquesCache);
}

function initBoutiqueSearch() {
  document.getElementById("mmkt-boutique-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = q
      ? _mmktBoutiquesCache.filter(b => (b.nom_boutique || "").toLowerCase().includes(q))
      : _mmktBoutiquesCache;
    renderBoutiqueList(filtered);
  });
}

async function chargerCategories() {
  const grid = document.getElementById("mmkt-category-grid");
  try {
    const rows = await API.get(`${AURA_CONFIG.endpoints.produits}?select=categorie&actif=eq.true`);
    const counts = {};
    (Array.isArray(rows) ? rows : []).forEach(r => {
      if (!r.categorie) return;
      counts[r.categorie] = (counts[r.categorie] || 0) + 1;
    });
    _mmktCategoriesCache = Object.entries(counts)
      .map(([categorie, count]) => ({ categorie, count }))
      .sort((a, b) => b.count - a.count);

    if (_mmktCategoriesCache.length === 0) {
      grid.innerHTML = `<div class="mmkt-empty-inline">Aucune catégorie disponible.</div>`;
      return;
    }

    grid.innerHTML = _mmktCategoriesCache.map(c => `
      <button type="button" class="mmkt-category-card" data-cat="${escMmkt(c.categorie)}" onclick="mmktToggleCategorie('${escMmkt(c.categorie).replace(/'/g, "\\'")}')">
        <span>${escMmkt(c.categorie)}</span>
        <span class="mmkt-cat-count">${c.count}</span>
      </button>`).join("");
  } catch (err) {
    grid.innerHTML = `<div class="mmkt-empty-inline">Erreur de chargement des catégories.</div>`;
  }
}

function mmktToggleCategorie(cat) {
  const btn = document.querySelector(`.mmkt-category-card[data-cat="${cssEscMmkt(cat)}"]`);
  const idx = _mmktCategoriesSelection.indexOf(cat);
  if (idx >= 0) {
    _mmktCategoriesSelection.splice(idx, 1);
    btn?.classList.remove("active");
  } else {
    _mmktCategoriesSelection.push(cat);
    btn?.classList.add("active");
  }
}

function cssEscMmkt(str) {
  return String(str).replace(/"/g, '\\"');
}

function initNbImgButtons() {
  ["mmkt-nbimg-row", "mmkt-nbimg-row-combo"].forEach(rowId => {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.querySelectorAll(".mmkt-nbimg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        row.querySelectorAll(".mmkt-nbimg-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _mmktNbImages = parseInt(btn.dataset.nb, 10);
      });
    });
  });
}

function initColorPicker() {
  document.querySelectorAll(".mmkt-color-swatch[data-color]").forEach(sw => {
    sw.addEventListener("click", () => {
      document.querySelectorAll(".mmkt-color-swatch").forEach(s => s.classList.remove("active"));
      sw.classList.add("active");
      _mmktCouleur = sw.dataset.color;
    });
  });
  const customInput = document.getElementById("mmkt-color-custom-input");
  customInput.addEventListener("input", (e) => {
    document.querySelectorAll(".mmkt-color-swatch").forEach(s => s.classList.remove("active"));
    e.target.closest(".mmkt-color-swatch").classList.add("active");
    _mmktCouleur = e.target.value;
  });
}

/* ══════════════════════════════════════════════
   ÉTAPE 4 — Ton
══════════════════════════════════════════════ */
function initTonChips() {
  document.querySelectorAll("#mmkt-ton-chips .mmkt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#mmkt-ton-chips .mmkt-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      _mmktTon = chip.dataset.ton;
      if (_mmktStep === 4) chargerSuggestions(true);
    });
  });
}

/* ══════════════════════════════════════════════
   ÉTAPE 5 — Format
══════════════════════════════════════════════ */
function initTypeButtons() {
  document.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('[data-type]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mmktType = btn.dataset.type;
      refreshStep5Visibility();
    });
  });
}

function initModeImageButtons() {
  document.querySelectorAll('[data-mode-image]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('[data-mode-image]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mmktModeImage = btn.dataset.modeImage;
      refreshStep5Visibility();
    });
  });
}

function refreshStep5Visibility() {
  document.getElementById("mmkt-mode-image-wrap").style.display = _mmktType === "texte" ? "none" : "block";
  document.getElementById("mmkt-template-wrap").style.display =
    (_mmktType === "texte" || _mmktModeImage !== "canvas") ? "none" : "block";

  // Le style "Corporate" (illustration business flat design) n'a de sens
  // que pour le recrutement vendeur : masqué pour les autres cibles, et on
  // retombe automatiquement sur "canvas" si l'admin change de cible après
  // l'avoir sélectionné.
  const corporateBtn = document.getElementById("mmkt-mode-corporate-btn");
  const corporateDisponible = _mmktApp === "pro";
  corporateBtn.style.display = corporateDisponible ? "flex" : "none";
  if (!corporateDisponible && _mmktModeImage === "corporate") {
    _mmktModeImage = "canvas";
    document.querySelectorAll('[data-mode-image]').forEach(b => b.classList.toggle("active", b.dataset.modeImage === "canvas"));
  }
}

/* ══════════════════════════════════════════════
   SÉLECTEUR DE TEMPLATE (montage Canvas)
══════════════════════════════════════════════ */
function initTemplateSelector() {
  document.querySelectorAll('[data-template-mode]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('[data-template-mode]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mmktTemplateMode = btn.dataset.templateMode;
      const grid = document.getElementById("mmkt-template-grid");
      grid.style.display = _mmktTemplateMode === "manuel" ? "grid" : "none";
      if (_mmktTemplateMode === "manuel" && !grid.dataset.rendered) {
        renderTemplateGrid();
        grid.dataset.rendered = "1";
      }
    });
  });
}

function renderTemplateGrid() {
  const grid = document.getElementById("mmkt-template-grid");
  grid.innerHTML = Object.entries(MMKT_TEMPLATES).map(([key, tpl]) => `
    <div class="mmkt-template-card${key === _mmktTemplateChoisi ? " active" : ""}" data-template-key="${key}">
      <div class="mmkt-template-swatch" style="background:${tpl.swatch};"></div>
      <div class="mmkt-template-label">${tpl.label}</div>
    </div>
  `).join("");

  grid.querySelectorAll(".mmkt-template-card").forEach(card => {
    card.addEventListener("click", () => {
      grid.querySelectorAll(".mmkt-template-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      _mmktTemplateChoisi = card.dataset.templateKey;
    });
  });
}

function choisirTemplateActif() {
  if (_mmktTemplateMode === "manuel") return _mmktTemplateChoisi;
  // Le template "duo" met en scène vendeur ET client : n'a de sens qu'en
  // mode aléatoire quand l'app ciblée est "les_deux".
  const keys = Object.keys(MMKT_TEMPLATES).filter(k => k !== "duo" || _mmktApp === "les_deux");
  return keys[Math.floor(Math.random() * keys.length)];
}

/* ══════════════════════════════════════════════
   GÉNÉRATION
══════════════════════════════════════════════ */
async function onGenerer(e) {
  e.preventDefault();

  const err = validateStep(3) || validateStep(2) || validateStep(1);
  if (err) { showMmktToast(err, "error"); return; }

  const btn = document.getElementById("mmkt-submit-btn");
  btn.disabled = true;
  const btnLabel = btn.innerHTML;
  btn.innerHTML = "Génération en cours…";

  const resultWrap = document.getElementById("mmkt-result-wrap");
  const imgWrap = document.getElementById("mmkt-result-img-wrap");
  const imgLoading = document.getElementById("mmkt-result-img-loading");
  const imgEl = document.getElementById("mmkt-result-img");
  const texteWrap = document.getElementById("mmkt-result-texte-wrap");
  const texteEl = document.getElementById("mmkt-result-texte");
  const copyBtn = document.getElementById("mmkt-copy-texte-btn");
  const dlBtn = document.getElementById("mmkt-download-img-btn");
  const shareRow = document.getElementById("mmkt-share-row");
  const tabsWrap = document.getElementById("mmkt-result-tabs");

  resultWrap.style.display = "block";
  copyBtn.style.display = "none";
  dlBtn.style.display = "none";
  shareRow.style.display = "none";
  texteWrap.style.display = "none";
  imgWrap.style.display = "none";
  tabsWrap.innerHTML = "";

  let textesParPlateforme = {};
  let imageDataUrl = null;
  let produitsUtilises = [];
  _mmktImageUrlStockee = null;

  try {
    const prompt = document.getElementById("mmkt-prompt").value.trim();
    const promptBase = construirePromptBase(prompt);

    // ── Textes (un par plateforme, distinct) ──
    if (_mmktType === "texte" || _mmktType === "les_deux") {
      for (const plateforme of _mmktPlatforms) {
        textesParPlateforme[plateforme] = await genererTexte(promptBase, _mmktTon, plateforme);
      }
      texteWrap.style.display = "block";
      copyBtn.style.display = "block";
      renderResultTabs(textesParPlateforme);
    }

    // ── Image ──
    if (_mmktType === "image" || _mmktType === "les_deux") {
      imgWrap.style.display = "block";
      imgLoading.style.display = "flex";
      imgEl.style.opacity = "0";

      let imageUrlStockee = null;

      if (_mmktModeImage === "canvas") {
        const res = await genererVisuelCanvas(promptBase);
        imageDataUrl = res.dataUrl;
        produitsUtilises = res.produits;
        try {
          imageUrlStockee = await uploaderVisuel(imageDataUrl, "jpg");
        } catch (err) {
          console.error("Upload du visuel impossible, on garde le rendu local :", err.message);
        }
      } else {
        imageDataUrl = _mmktModeImage === "corporate"
          ? await genererImageCorporate(promptBase, await accrocheParApp())
          : await genererImageIA(promptBase);
        try {
          imageUrlStockee = await uploaderVisuel(imageDataUrl, "jpg");
        } catch (err) {
          console.error("Upload du visuel impossible, on garde le rendu local :", err.message);
          imageUrlStockee = imageDataUrl;
        }
      }

      imgEl.src = imageDataUrl;
      imgEl.onload = () => {
        imgLoading.style.display = "none";
        imgEl.style.opacity = "1";
      };
      dlBtn.style.display = "block";
      _mmktImageUrlStockee = imageUrlStockee;
    }

    shareRow.style.display = "block";
    _mmktDernierResultat = { textes: textesParPlateforme, imageDataUrl, produitsUtilises, appCible: _mmktApp };

    await sauvegarderHistorique({
      cible_type: appCibleToCibleType(),
      cible_label: MMKT_APP_LABELS[_mmktApp],
      app_cible: _mmktApp,
      plateformes: _mmktPlatforms,
      prompt,
      ton: _mmktTon,
      texte_genere: textesParPlateforme[_mmktPlatforms[0]] || null,
      textes_par_plateforme: textesParPlateforme,
      categories: _mmktCategoriesSelection,
      boutiques_ids: _mmktBoutiquesSelection.map(b => b.id),
      produits_utilises: produitsUtilises,
      mode_image: _mmktModeImage,
      couleur_theme: _mmktCouleur,
      nb_images: _mmktNbImages,
      image_url: _mmktImageUrlStockee
    });

    chargerHistorique();
    showMmktToast("Contenu généré avec succès.", "success");

  } catch (err) {
    showMmktToast("Erreur : " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnLabel;
  }
}

function appCibleToCibleType() {
  if (_mmktApp === "pro") return _mmktVendeurMode === "boutiques" ? "vendeur" : "app";
  if (_mmktApp === "ci") return "categorie";
  return "app";
}

function construirePromptBase(prompt) {
  const suffix = prompt ? ` : ${prompt}` : "";
  if (_mmktApp === "pro") {
    if (_mmktVendeurMode === "boutiques") {
      const noms = _mmktBoutiquesSelection.map(b => b.nom_boutique).join(", ");
      return `Mets en avant sur Aura Market Pro (lien : auramarketpro.pages.dev) les boutiques suivantes : ${noms}${suffix}`;
    }
    if (_mmktVendeurMode === "motivation") {
      return `Message de motivation destiné aux vendeurs DÉJÀ inscrits sur Aura Market Pro (lien : auramarketpro.pages.dev) — pas un message de recrutement, ils sont déjà membres. L'objectif est de les encourager à rester actifs et engagés : féliciter leurs efforts, rappeler que la persévérance paie, encourager à publier régulièrement, à soigner leurs fiches produits, à répondre vite aux clients. Ton chaleureux mais professionnel, comme un vrai partenaire d'affaires qui soutient ses vendeurs, jamais condescendant${suffix}`;
    }
    return `Convaincre des vendeurs sérieux (commerçants, artisans, entrepreneurs) qui ne sont PAS ENCORE sur Aura Market Pro (application vendeurs, lien : auramarketpro.pages.dev) de rejoindre la plateforme. C'est un message de recrutement B2B, pas une publicité grand public : il doit inspirer confiance et crédibilité professionnelle. Mets en avant des arguments concrets et tangibles plutôt que des formules vagues — au choix selon le contexte : visibilité auprès d'une large clientèle déjà active sur la plateforme, outils de gestion de boutique simples et complets (stock, commandes, statistiques de vente), paiement sécurisé et rapide via mobile money, accompagnement et support dédié aux vendeurs, zéro compétence technique requise pour démarrer, opportunité de développer une activité en ligne sérieuse et pérenne. Le ton doit donner l'image d'une plateforme professionnelle et fiable, comme un vrai partenaire d'affaires — jamais familial, enfantin ou trop décontracté${suffix}`;
  }
  if (_mmktApp === "ci") {
    return `Promouvoir sur Aura Market CI (marketplace clients en Côte d'Ivoire, lien : auramarketci.com) les catégories : ${_mmktCategoriesSelection.join(", ")}${suffix}`;
  }
  return `Promouvoir Aura Market comme LA plateforme qui permet d'acheter ET de vendre au même endroit — mets l'accent sur cette double casquette (façon "Achat & Vente qui s'étend", pas une simple liste de fonctionnalités) : inviter à la fois des acheteurs (auramarketci.com) et des vendeurs (auramarketpro.pages.dev) à rejoindre l'écosystème Aura Market${suffix}`;
}

/* ══════════════════════════════════════════════
   ÉTAPE 4 — Suggestions d'accroches (IA)
══════════════════════════════════════════════ */

/* Demande à l'IA 3-4 courtes accroches distinctes adaptées au contexte
   actuel (app cible + objectif vendeur + ton), affichées comme des puces
   cliquables au-dessus du textarea. Cliquer une suggestion la copie dans
   le textarea (modifiable ensuite). force=true ignore le cache et
   regénère (utilisé par le bouton "D'autres idées" et au changement de
   ton) ; sinon, si le contexte n'a pas changé depuis le dernier calcul,
   on réaffiche simplement le cache sans re-solliciter l'IA. */
async function chargerSuggestions(force = false) {
  // Les suggestions n'ont de sens que pour Aura Market Pro (motivation /
  // recrutement) : pour les autres cibles, on masque simplement le bloc.
  const wrap = document.getElementById("mmkt-suggestions-wrap");
  const label = document.getElementById("mmkt-suggestions-label");
  if (_mmktApp !== "pro" || _mmktVendeurMode === "boutiques") {
    wrap.style.display = "none";
    label.style.display = "none";
    return;
  }

  wrap.style.display = "block";
  label.style.display = "block";

  if (!force && _mmktSuggestionsAJour && _mmktSuggestionsCache.length) {
    renderSuggestions(_mmktSuggestionsCache);
    return;
  }

  const loading = document.getElementById("mmkt-suggestions-loading");
  const list = document.getElementById("mmkt-suggestions-list");
  loading.style.display = "flex";
  list.innerHTML = "";

  try {
    const promptBase = construirePromptBase("");
    const contexteObjectif = _mmktVendeurMode === "motivation"
      ? "un message de MOTIVATION pour des vendeurs déjà inscrits"
      : "un message de RECRUTEMENT pour convaincre de nouveaux vendeurs de s'inscrire";

    const reponse = await API.post("/ai/marketing/texte", {
      prompt: `Propose exactement 4 accroches COURTES et distinctes (6 à 12 mots chacune, sans guillemets, sans numérotation) pour ${contexteObjectif} sur Aura Market Pro. Contexte détaillé : ${promptBase}. Chaque accroche doit être un angle différent (ex: crédibilité, opportunité concrète, simplicité, communauté) — pas 4 variantes de la même phrase. Réponds UNIQUEMENT avec les 4 accroches séparées par un saut de ligne, rien d'autre.`,
      ton: _mmktTon,
      plateforme: "facebook",
      cible: _mmktApp
    });

    const texte = typeof reponse === "string" ? reponse : (reponse?.texte || "");
    const suggestions = texte.split("\n").map(l => l.replace(/^[-•\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 4);

    if (suggestions.length === 0) throw new Error("Aucune suggestion générée");

    _mmktSuggestionsCache = suggestions;
    _mmktSuggestionsAJour = true;
    renderSuggestions(suggestions);
  } catch (err) {
    list.innerHTML = `<div class="mmkt-empty-inline">Suggestions indisponibles pour le moment. Écris directement ta description ci-dessous.</div>`;
  } finally {
    loading.style.display = "none";
  }
}

function renderSuggestions(suggestions) {
  const list = document.getElementById("mmkt-suggestions-list");
  list.innerHTML = suggestions.map((s, i) => `
    <button type="button" class="mmkt-suggestion-chip" data-suggestion-index="${i}">${escMmkt(s)}</button>
  `).join("");

  list.querySelectorAll(".mmkt-suggestion-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      list.querySelectorAll(".mmkt-suggestion-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      document.getElementById("mmkt-prompt").value = suggestions[parseInt(chip.dataset.suggestionIndex, 10)];
    });
  });
}

/* ── Génération de texte via Groq (proxy Worker), un texte par plateforme ── */
async function genererTexte(promptBase, ton, plateforme) {
  const tonInstructions = {
    dynamique: "dynamique et engageant, avec un appel à l'action clair",
    professionnel: "professionnel et rassurant, orienté confiance",
    fun: "fun, léger, avec une touche d'humour ivoirien si pertinent",
    urgent: "urgent, orienté promo/offre limitée, incite à agir maintenant"
  };
  const styleReseau = MMKT_PLATFORM_STYLE[plateforme] || "";

  const body = {
    prompt: `Rédige un texte publicitaire pour ${MMKT_PLATFORM_LABELS[plateforme]}. Contexte : ${promptBase}. Ton général : ${tonInstructions[ton] || tonInstructions.dynamique}. Contraintes spécifiques à ce réseau : ${styleReseau} Réponds uniquement avec le texte du post, sans introduction ni guillemets.`,
    ton,
    plateforme,
    cible: _mmktApp
  };

  try {
    return await API.post("/ai/marketing/texte", body);
  } catch (err) {
    throw new Error(`Génération de texte indisponible pour ${MMKT_PLATFORM_LABELS[plateforme]} (route IA texte non configurée côté serveur).`);
  }
}

/* ── Onglets de résultat par plateforme ── */
function renderResultTabs(textes) {
  const tabsWrap = document.getElementById("mmkt-result-tabs");
  const plateformes = Object.keys(textes);
  if (plateformes.length <= 1) {
    tabsWrap.innerHTML = "";
    _mmktActiveResultTab = plateformes[0] || null;
    afficherTexteTab(_mmktActiveResultTab);
    return;
  }
  tabsWrap.innerHTML = plateformes.map((p, i) => `
    <button type="button" class="mmkt-result-tab ${i === 0 ? "active" : ""}" data-tab="${p}" onclick="mmktSwitchResultTab('${p}')">${MMKT_PLATFORM_LABELS[p]}</button>
  `).join("");
  _mmktActiveResultTab = plateformes[0];
  afficherTexteTab(_mmktActiveResultTab);
}

function mmktSwitchResultTab(p) {
  document.querySelectorAll(".mmkt-result-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === p));
  _mmktActiveResultTab = p;
  afficherTexteTab(p);
}

function afficherTexteTab(p) {
  const texteEl = document.getElementById("mmkt-result-texte");
  if (!p || !_mmktDernierResultat) { texteEl.value = ""; return; }
  texteEl.value = (_mmktDernierResultat.textes && _mmktDernierResultat.textes[p]) || "";
}

/* ══════════════════════════════════════════════
   VISUEL — Montage Canvas pro (vraies photos produits)
══════════════════════════════════════════════ */
async function recupererProduitsPourVisuel() {
  let categories = _mmktApp === "ci" ? _mmktCategoriesSelection : [];
  let filtreCategorie = "";
  if (categories.length > 0) {
    filtreCategorie = `&categorie=in.(${categories.map(c => encodeURIComponent(`"${c}"`)).join(",")})`;
  }

  const query = `${AURA_CONFIG.endpoints.produits}?select=id,nom,prix,discount,image_url,images,categorie&actif=eq.true&statut=eq.valide${filtreCategorie}&limit=100`;
  let rows = [];
  try {
    rows = await API.get(query);
  } catch (err) {
    rows = [];
  }
  rows = Array.isArray(rows) ? rows.filter(r => r.image_url) : [];

  const nb = _mmktApp === "les_deux" ? (document.querySelector("#mmkt-nbimg-row-combo .active")?.dataset.nb ? parseInt(document.querySelector("#mmkt-nbimg-row-combo .active").dataset.nb, 10) : 4) : _mmktNbImages;

  // ── Scoring qualité au lieu du hasard pur ──
  // Une fiche complète (prix + remise + plusieurs images) fait une bien
  // meilleure affiche qu'un produit sans prix pris au hasard. On garde un
  // facteur aléatoire pour varier d'une génération à l'autre, mais pondéré.
  const scored = rows.map(r => {
    let score = 0;
    if (r.prix) score += 3;                                  // affichable avec badge prix
    if (Number(r.discount) > 0) score += 4;                  // les promos vendent
    if (Array.isArray(r.images) && r.images.length > 1) score += 2; // fiche soignée
    if (r.nom && r.nom.length >= 4) score += 1;
    score += Math.random() * 4;                              // variété entre générations
    return { r, score };
  }).sort((a, b) => b.score - a.score);

  // Variété de catégories : on évite 4 produits identiques de la même
  // catégorie quand le catalogue permet mieux.
  const selection = [];
  const parCategorie = {};
  for (const { r } of scored) {
    const cat = r.categorie || "_";
    if ((parCategorie[cat] || 0) >= Math.max(2, Math.ceil(nb / 2)) && selection.length < scored.length) continue;
    selection.push(r);
    parCategorie[cat] = (parCategorie[cat] || 0) + 1;
    if (selection.length === nb) break;
  }
  // Complément si le filtre catégorie a trop écarté
  if (selection.length < nb) {
    for (const { r } of scored) {
      if (!selection.includes(r)) selection.push(r);
      if (selection.length === nb) break;
    }
  }
  return selection;
}

function chargerImage(src, { anonymous = true } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image inaccessible : " + src));
    img.src = src;
  });
}

/* Charge une image en tolérant l'échec CORS : si le mode anonyme échoue,
   retente sans crossOrigin (l'image s'affichera mais tainted le canvas —
   c'est un compromis mieux qu'un carré vide). Retourne { img, tainted }. */
async function chargerImageTolerant(src) {
  try {
    const img = await chargerImage(src, { anonymous: true });
    return { img, tainted: false };
  } catch {
    try {
      const img = await chargerImage(src, { anonymous: false });
      return { img, tainted: true };
    } catch {
      return { img: null, tainted: false };
    }
  }
}

/* Personnages 2D pour le template "Duo Achat & Vente" — plusieurs paires
   possibles, choisies aléatoirement à chaque génération pour varier le rendu.
   Chaque personnage est un PNG détouré (fond transparent). */
const MMKT_DUO_VENDEURS = [
  "../img/personnages/vendeur-laptop-1.png",
  "../img/personnages/vendeur-laptop-victoire-1.png"
];
const MMKT_DUO_CLIENTS = [
  "../img/personnages/client-papy-tel-1.png",
  "../img/personnages/client-enfant-pouces-1.png"
];

/* ══════════════════════════════════════════════
   BIBLIOTHÈQUE DE TEMPLATES DE MONTAGE
   Chaque template reçoit { ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }
   où produits[i]._img est déjà chargée (peut être null si l'image a échoué).
══════════════════════════════════════════════ */
const MMKT_TEMPLATES = {

  // 1. Grille classique + bandeau bas (le montage d'origine, corrigé)
  grille: {
    label: "Grille classique",
    swatch: "linear-gradient(135deg,#F0B429,#7a5a10)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      const padding = 48;
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, shadeColor(couleur, -35));
      grad.addColorStop(1, shadeColor(couleur, -70));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#FFFFFF";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * W, Math.random() * H, 80 + Math.random() * 160, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      dessinerLogoRond(ctx, logoImg, padding, padding, 96);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 40px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 116, padding + 48);

      const hauteurBandeEstimee = mesurerBandeAccroche(ctx, accroche, W - padding * 2).hauteurBande;
      const zoneTop = padding + 150;
      const zoneBottom = H - hauteurBandeEstimee - 30;
      const zoneHeight = zoneBottom - zoneTop;

      if (produits.length > 0) {
        const cols = produits.length === 1 ? 1 : produits.length <= 2 ? 2 : produits.length <= 4 ? 2 : 3;
        const rowsCount = Math.ceil(produits.length / cols);
        const gap = 26;
        const cellW = (W - padding * 2 - gap * (cols - 1)) / cols;
        const cellH = Math.min((zoneHeight - gap * (rowsCount - 1)) / rowsCount, cellW * 1.05);

        // Centrage vertical de la grille : plus de gros vide sous les
        // produits quand les cellules sont limitées par leur largeur.
        const grilleH = rowsCount * cellH + (rowsCount - 1) * gap;
        const offsetY = zoneTop + Math.max(0, (zoneHeight - grilleH) / 2);

        // Étincelles décoratives dans l'espace résiduel, façon affiche pub
        dessinerEtincellesDispersees(ctx, {
          xMin: padding, xMax: W - padding,
          yMin: zoneTop - 20, yMax: zoneBottom,
          count: 7, couleur: shadeColor(couleur, 45),
          exclude: { x1: padding - 10, x2: W - padding + 10, y1: offsetY - 10, y2: offsetY + grilleH + 10 }
        });

        produits.forEach((p, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          // Dernière rangée incomplète : centrée horizontalement
          const surDerniereRangee = row === rowsCount - 1;
          const nbSurRangee = surDerniereRangee ? produits.length - row * cols : cols;
          const rangeeW = nbSurRangee * cellW + (nbSurRangee - 1) * gap;
          const baseX = surDerniereRangee ? (W - rangeeW) / 2 : padding;
          const x = baseX + col * (cellW + gap);
          const y = offsetY + row * (cellH + gap);
          dessinerCarteProduit(ctx, p, couleur, x, y, cellW, cellH);
        });
      }

      dessinerBandeAccroche(ctx, { accroche, W, H, padding, couleur, site });
    }
  },

  // 2. Hero produit unique en grand, style "Prince M Gadgets"
  hero: {
    label: "Produit vedette",
    swatch: "linear-gradient(135deg,#1a3a6b,#0a1830)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = shadeColor(couleur, -78);
      ctx.fillRect(0, 0, W, H);

      // Bande diagonale décorative
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, H * 0.42);
      ctx.lineTo(W, H * 0.30);
      ctx.lineTo(W, H * 0.58);
      ctx.lineTo(0, H * 0.70);
      ctx.closePath();
      ctx.fillStyle = shadeColor(couleur, -20);
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.restore();

      const padding = 56;
      dessinerLogoRond(ctx, logoImg, padding, padding, 84);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 34px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 100, padding + 42);

      const hero = produits[0];
      const heroSize = Math.min(W - padding * 2, 620);
      const heroX = (W - heroSize) / 2;
      const heroY = 200;
      if (hero && hero._img) {
        ctx.save();
        roundRect(ctx, heroX, heroY, heroSize, heroSize, 28);
        ctx.clip();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(heroX, heroY, heroSize, heroSize);
        drawImageCover(ctx, hero._img, heroX, heroY, heroSize, heroSize);
        ctx.restore();
        if (hero.prix) dessinerBadgePrix(ctx, hero.prix, couleur, heroX + 20, heroY + heroSize - 60);
      }

      // Vignettes secondaires en bas du hero
      const autres = produits.slice(1, 4);
      if (autres.length > 0) {
        const vGap = 16;
        const vSize = (W - padding * 2 - vGap * (autres.length - 1)) / 3;
        const vY = heroY + heroSize + 24;
        autres.forEach((p, i) => {
          const x = padding + i * (vSize + vGap);
          ctx.save();
          roundRect(ctx, x, vY, vSize, vSize, 16);
          ctx.clip();
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(x, vY, vSize, vSize);
          if (p._img) drawImageCover(ctx, p._img, x, vY, vSize, vSize);
          ctx.restore();
        });
      }

      dessinerBandeAccroche(ctx, { accroche, W, H, padding, couleur, site, fond: "rgba(0,0,0,0.55)" });
    }
  },

  // 3. Liste "We Sell" à puces, style "Kings Hub / Albert Gadget Hub"
  liste: {
    label: "Liste avantages",
    swatch: "linear-gradient(135deg,#2a2a2a,#000)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#111214";
      ctx.fillRect(0, 0, W, H);

      const padding = 56;
      dessinerLogoRond(ctx, logoImg, padding, padding, 84);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 34px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 100, padding + 42);

      ctx.fillStyle = couleur;
      ctx.font = "900 54px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const titreLignes = wrapText(ctx, accroche, W - padding * 2, 3);
      let ty = 240;
      titreLignes.forEach(l => { ctx.fillText(l, padding, ty); ty += 62; });

      // Liste de catégories/points, à partir des noms produits (ou catégories si dispo)
      const points = produits.slice(0, 5).map(p => p.nom || "Produit").filter(Boolean);
      let ly = ty + 40;
      ctx.font = "700 30px Inter, sans-serif";
      points.forEach(pt => {
        ctx.fillStyle = couleur;
        ctx.beginPath();
        ctx.arc(padding + 10, ly - 10, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#EDEDED";
        ctx.fillText(pt.slice(0, 30), padding + 34, ly);
        ly += 48;
      });

      // Petites vignettes produits en bas à droite
      const vignettes = produits.slice(0, 3).filter(p => p._img);
      if (vignettes.length > 0) {
        const vSize = 140, vGap = 14;
        const totalW = vignettes.length * vSize + (vignettes.length - 1) * vGap;
        let vx = W - padding - totalW;
        const vy = H - 260;
        vignettes.forEach(p => {
          ctx.save();
          roundRect(ctx, vx, vy, vSize, vSize, 18);
          ctx.clip();
          ctx.fillStyle = "#FFF";
          ctx.fillRect(vx, vy, vSize, vSize);
          drawImageCover(ctx, p._img, vx, vy, vSize, vSize);
          ctx.restore();
          vx += vSize + vGap;
        });
      }

      ctx.font = "600 22px Inter, sans-serif";
      ctx.fillStyle = couleur;
      ctx.fillText(site, padding, H - 40);
    }
  },

  // 4. Split couleur diagonale, style "Kings Hub"
  splitColor: {
    label: "Split couleur",
    swatch: "linear-gradient(120deg,#F0B429 50%,#111 50%)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#0d0e10";
      ctx.fillRect(0, 0, W, H);

      // Bloc couleur en diagonale sur la partie haute
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(W, H * 0.38);
      ctx.lineTo(0, H * 0.5);
      ctx.closePath();
      ctx.fillStyle = couleur;
      ctx.fill();
      ctx.restore();

      const padding = 52;
      dessinerLogoRond(ctx, logoImg, padding, padding, 88);
      ctx.fillStyle = "#111";
      ctx.font = "800 36px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 104, padding + 44);

      // Grille produits sous le bandeau couleur
      const zoneTop = H * 0.42;
      const hauteurBandeEstimee = mesurerBandeAccroche(ctx, accroche, W - padding * 2).hauteurBande;
      const zoneBottom = H - hauteurBandeEstimee - 20;
      const zoneHeight = zoneBottom - zoneTop;

      if (produits.length > 0) {
        const cols = produits.length <= 2 ? produits.length : 3;
        const rowsCount = Math.ceil(produits.length / cols);
        const gap = 18;
        const cellW = (W - padding * 2 - gap * (cols - 1)) / cols;
        const cellH = Math.min((zoneHeight - gap * (rowsCount - 1)) / rowsCount, cellW);

        produits.slice(0, 6).forEach((p, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          const x = padding + col * (cellW + gap);
          const y = zoneTop + row * (cellH + gap);
          ctx.save();
          roundRect(ctx, x, y, cellW, cellH, 18);
          ctx.clip();
          ctx.fillStyle = "#FFF";
          ctx.fillRect(x, y, cellW, cellH);
          if (p._img) drawImageCover(ctx, p._img, x, y, cellW, cellH);
          ctx.restore();
          if (p.prix) dessinerBadgePrix(ctx, p.prix, couleur, x + 10, y + cellH - 48);
        });
      }

      dessinerBandeAccroche(ctx, { accroche, W, H, padding, couleur: "#FFFFFF", site, fond: "rgba(0,0,0,0.6)" });
    }
  },

  // 5. Bandeau "Hot Deals" coloré en bas, style "Prince M Gadgets"
  hotDeals: {
    label: "Bandeau promo",
    swatch: "linear-gradient(180deg,#0a1a3a,#1976d2)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, shadeColor(couleur, -60));
      grad.addColorStop(1, shadeColor(couleur, -20));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      const padding = 52;
      dessinerLogoRond(ctx, logoImg, padding, padding, 84);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 34px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 100, padding + 42);

      // Produits en arc léger (décalage vertical alterné) pour un rendu moins carré
      const zoneTop = 210;
      const zoneH = H - 420;
      const items = produits.slice(0, 4);
      if (items.length > 0) {
        const gap = 16;
        const cellW = (W - padding * 2 - gap * (items.length - 1)) / items.length;
        items.forEach((p, i) => {
          const decal = i % 2 === 0 ? 0 : 40;
          const x = padding + i * (cellW + gap);
          const y = zoneTop + decal;
          const cellH = zoneH - decal;
          ctx.save();
          roundRect(ctx, x, y, cellW, cellH, 18);
          ctx.clip();
          ctx.fillStyle = "#FFF";
          ctx.fillRect(x, y, cellW, cellH);
          if (p._img) drawImageCover(ctx, p._img, x, y, cellW, cellH);
          ctx.restore();
          if (p.prix) dessinerBadgePrix(ctx, p.prix, couleur, x + 8, y + cellH - 44);
        });
      }

      // Bandeau promo en bas, plus grand et coloré (pas juste transparent)
      const hauteurBandeEstimee = mesurerBandeAccroche(ctx, accroche, W - padding * 2, 40).hauteurBande + 20;
      ctx.fillStyle = couleur;
      ctx.fillRect(0, H - hauteurBandeEstimee, W, hauteurBandeEstimee);
      ctx.fillStyle = "#111";
      ctx.font = accroche.length > 40 ? "800 32px Inter, sans-serif" : "800 40px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const lignes = wrapText(ctx, accroche, W - padding * 2, 3);
      const ligneH = accroche.length > 40 ? 40 : 48;
      let ty = H - hauteurBandeEstimee + ligneH + 10;
      lignes.forEach(l => { ctx.fillText(l, padding, ty); ty += ligneH; });
      ctx.font = "700 20px Inter, sans-serif";
      ctx.fillText(site, padding, H - 24);
    }
  },

  // 6. Minimaliste noir & blanc, sobre
  minimal: {
    label: "Minimaliste",
    swatch: "linear-gradient(135deg,#fff,#ccc)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#FAFAFA";
      ctx.fillRect(0, 0, W, H);

      const padding = 60;
      dessinerLogoRond(ctx, logoImg, padding, padding, 80);
      ctx.fillStyle = "#111";
      ctx.font = "700 32px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 96, padding + 40);

      const hauteurBande = mesurerBandeAccroche(ctx, accroche, W - padding * 2, 38).hauteurBande;
      const zoneTop = 200;
      const zoneBottom = H - hauteurBande - 40;
      const zoneHeight = zoneBottom - zoneTop;

      if (produits.length > 0) {
        const cols = produits.length === 1 ? 1 : 2;
        const rowsCount = Math.ceil(produits.length / cols);
        const gap = 24;
        const cellW = (W - padding * 2 - gap * (cols - 1)) / cols;
        const cellH = Math.min((zoneHeight - gap * (rowsCount - 1)) / rowsCount, cellW);

        produits.slice(0, 4).forEach((p, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          const x = padding + col * (cellW + gap);
          const y = zoneTop + row * (cellH + gap);
          ctx.save();
          ctx.strokeStyle = "#DDD";
          ctx.lineWidth = 1;
          roundRect(ctx, x, y, cellW, cellH, 12);
          ctx.stroke();
          roundRect(ctx, x, y, cellW, cellH, 12);
          ctx.clip();
          ctx.fillStyle = "#FFF";
          ctx.fillRect(x, y, cellW, cellH);
          if (p._img) drawImageCover(ctx, p._img, x, y, cellW, cellH);
          ctx.restore();
          if (p.prix) {
            ctx.fillStyle = "#111";
            ctx.font = "700 22px Inter, sans-serif";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(formatPrixMmkt(p.prix), x + 14, y + cellH - 16);
          }
        });
      }

      ctx.fillStyle = "#111";
      ctx.font = `800 ${accroche.length > 40 ? 32 : 38}px Inter, sans-serif`;
      ctx.textBaseline = "alphabetic";
      const lignes = wrapText(ctx, accroche, W - padding * 2, 3);
      const ligneH = accroche.length > 40 ? 40 : 46;
      let ty = H - hauteurBande + ligneH;
      lignes.forEach(l => { ctx.fillText(l, padding, ty); ty += ligneH; });
      ctx.font = "600 20px Inter, sans-serif";
      ctx.fillStyle = couleur;
      ctx.fillText(site, padding, H - 24);
    }
  },

  // 7. Cercles décoratifs colorés, style "Adeiza"
  cercles: {
    label: "Cercles déco",
    swatch: "radial-gradient(circle,#7ee787,#0b3d0b)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = shadeColor(couleur, 10);
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(W * 0.15, H * 0.55, 120 + i * 60, Math.PI * 0.9, Math.PI * 1.6);
        ctx.stroke();
      }
      ctx.restore();

      const padding = 56;
      dessinerLogoRond(ctx, logoImg, padding, padding, 80);
      ctx.fillStyle = "#111";
      ctx.font = "800 30px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 96, padding + 40);

      ctx.fillStyle = "#111";
      ctx.font = "800 46px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const titreLignes = wrapText(ctx, accroche, W - padding * 2 - 80, 3);
      let ty = 260;
      titreLignes.forEach(l => { ctx.fillText(l, padding, ty); ty += 56; });

      // Produits en colonne à droite, façon vitrine verticale
      const items = produits.slice(0, 3).filter(p => p._img);
      const vSize = 200, vGap = 20;
      let vy = ty + 40;
      items.forEach(p => {
        const vx = W - padding - vSize;
        ctx.save();
        roundRect(ctx, vx, vy, vSize, vSize, 20);
        ctx.clip();
        ctx.fillStyle = "#F5F5F5";
        ctx.fillRect(vx, vy, vSize, vSize);
        drawImageCover(ctx, p._img, vx, vy, vSize, vSize);
        ctx.restore();
        if (p.prix) dessinerBadgePrix(ctx, p.prix, couleur, vx + 10, vy + vSize - 46);
        vy += vSize + vGap;
      });

      ctx.font = "700 24px Inter, sans-serif";
      ctx.fillStyle = couleur;
      ctx.fillText(site, padding, H - 40);
    }
  },

  // 8. Badge circulaire promo façon sticker, style "CHUWI Store"
  badgeSticker: {
    label: "Badge sticker",
    swatch: "conic-gradient(from 90deg,#F0B429,#7a1010,#F0B429)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, shadeColor(couleur, -20));
      grad.addColorStop(1, shadeColor(couleur, -55));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      const padding = 52;
      dessinerLogoRond(ctx, logoImg, padding, padding, 80);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 32px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 96, padding + 40);

      // Produit principal centré
      const hero = produits[0];
      const heroSize = 480;
      const heroX = (W - heroSize) / 2;
      const heroY = 190;
      if (hero && hero._img) {
        ctx.save();
        roundRect(ctx, heroX, heroY, heroSize, heroSize, 24);
        ctx.clip();
        ctx.fillStyle = "#FFF";
        ctx.fillRect(heroX, heroY, heroSize, heroSize);
        drawImageCover(ctx, hero._img, heroX, heroY, heroSize, heroSize);
        ctx.restore();
      }

      // Badge circulaire "promo" en haut à droite du produit
      if (hero && hero.prix) {
        const cx = heroX + heroSize - 30, cy = heroY + 30, r = 74;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "#D42020";
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "800 15px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PROMO", cx, cy - 18);
        ctx.font = "900 24px Inter, sans-serif";
        ctx.fillText(formatPrixMmkt(hero.prix), cx, cy + 8);
        ctx.textAlign = "left";
        ctx.restore();
      }

      // Vignettes des autres produits en bas
      const autres = produits.slice(1, 4).filter(p => p._img);
      if (autres.length > 0) {
        const vSize = 130, vGap = 16;
        const totalW = autres.length * vSize + (autres.length - 1) * vGap;
        let vx = (W - totalW) / 2;
        const vy = heroY + heroSize + 24;
        autres.forEach(p => {
          ctx.save();
          roundRect(ctx, vx, vy, vSize, vSize, 16);
          ctx.clip();
          ctx.fillStyle = "#FFF";
          ctx.fillRect(vx, vy, vSize, vSize);
          drawImageCover(ctx, p._img, vx, vy, vSize, vSize);
          ctx.restore();
          vx += vSize + vGap;
        });
      }

      dessinerBandeAccroche(ctx, { accroche, W, H, padding, couleur: "#FFFFFF", site, fond: "rgba(0,0,0,0.5)" });
    }
  },

  // 9. Fiche catalogue produit, style "HP EliteBook"
  catalogue: {
    label: "Carte catalogue",
    swatch: "linear-gradient(180deg,#e8e8ea,#c8c8cc)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#F1F2F4";
      ctx.fillRect(0, 0, W, H);

      const padding = 60;
      dessinerLogoRond(ctx, logoImg, padding, padding, 76);
      ctx.fillStyle = "#15161A";
      ctx.font = "700 30px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 92, padding + 38);

      const hero = produits[0];
      const heroSize = 560;
      const heroX = (W - heroSize) / 2;
      const heroY = 190;
      if (hero && hero._img) {
        ctx.save();
        roundRect(ctx, heroX, heroY, heroSize, heroSize, 20);
        ctx.clip();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(heroX, heroY, heroSize, heroSize);
        drawImageCover(ctx, hero._img, heroX, heroY, heroSize, heroSize);
        ctx.restore();
        ctx.strokeStyle = "#D8D8DC";
        ctx.lineWidth = 1.5;
        roundRect(ctx, heroX, heroY, heroSize, heroSize, 20);
        ctx.stroke();
      }

      // Bande fiche produit en dessous, façon specs
      const ficheY = heroY + heroSize + 30;
      const ficheH = H - ficheY - 40;
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, padding, ficheY, W - padding * 2, ficheH, 18);
      ctx.fill();
      ctx.strokeStyle = "#E2E2E6";
      ctx.lineWidth = 1;
      roundRect(ctx, padding, ficheY, W - padding * 2, ficheH, 18);
      ctx.stroke();

      ctx.fillStyle = "#111214";
      ctx.font = "800 32px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const titre = hero?.nom ? hero.nom.slice(0, 34) : accroche;
      ctx.fillText(titre, padding + 28, ficheY + 50);

      ctx.fillStyle = "#5A5C63";
      ctx.font = "500 24px Inter, sans-serif";
      const sousLignes = wrapText(ctx, accroche, W - padding * 2 - 56, 2);
      let sy = ficheY + 92;
      sousLignes.forEach(l => { ctx.fillText(l, padding + 28, sy); sy += 32; });

      if (hero && hero.prix) {
        ctx.fillStyle = couleur;
        ctx.font = "900 40px Inter, sans-serif";
        ctx.fillText(formatPrixMmkt(hero.prix), padding + 28, ficheY + ficheH - 30);
      }

      ctx.font = "600 20px Inter, sans-serif";
      ctx.fillStyle = "#9A9CA3";
      ctx.textAlign = "right";
      ctx.fillText(site, W - padding - 28, ficheY + ficheH - 30);
      ctx.textAlign = "left";
    }
  },

  // 10. Néon urbain, style Gen Z / TikTok
  neon: {
    label: "Néon urbain",
    swatch: "linear-gradient(135deg,#ff2ec4,#0ff,#111)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#0A0A0D";
      ctx.fillRect(0, 0, W, H);

      // Halos néon
      const neon1 = "#FF2ECF", neon2 = "#00E5FF";
      [{ x: W * 0.15, y: H * 0.2, c: neon1 }, { x: W * 0.85, y: H * 0.75, c: neon2 }].forEach(g => {
        const rad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 380);
        rad.addColorStop(0, g.c + "55");
        rad.addColorStop(1, g.c + "00");
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, W, H);
      });

      const padding = 54;
      dessinerLogoRond(ctx, logoImg, padding, padding, 84);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 34px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 100, padding + 42);

      // Titre néon avec double-strike glow simulé
      ctx.font = "900 52px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const titreLignes = wrapText(ctx, accroche, W - padding * 2, 3);
      let ty = 230;
      titreLignes.forEach(l => {
        ctx.fillStyle = neon2 + "66";
        ctx.fillText(l, padding + 2, ty + 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(l, padding, ty);
        ty += 60;
      });

      const zoneTop = ty + 20;
      const zoneBottom = H - 140;
      const items = produits.slice(0, 4);
      if (items.length > 0) {
        const gap = 18;
        const cols = items.length <= 2 ? items.length : 2;
        const rowsCount = Math.ceil(items.length / cols);
        const cellW = (W - padding * 2 - gap * (cols - 1)) / cols;
        const cellH = Math.min((zoneBottom - zoneTop - gap * (rowsCount - 1)) / rowsCount, cellW);
        items.forEach((p, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          const x = padding + col * (cellW + gap);
          const y = zoneTop + row * (cellH + gap);
          ctx.save();
          roundRect(ctx, x, y, cellW, cellH, 18);
          ctx.strokeStyle = i % 2 === 0 ? neon1 : neon2;
          ctx.lineWidth = 2;
          ctx.stroke();
          roundRect(ctx, x, y, cellW, cellH, 18);
          ctx.clip();
          ctx.fillStyle = "#151517";
          ctx.fillRect(x, y, cellW, cellH);
          if (p._img) drawImageCover(ctx, p._img, x, y, cellW, cellH);
          ctx.restore();
          if (p.prix) dessinerBadgePrix(ctx, p.prix, couleur, x + 10, y + cellH - 48);
        });
      }

      ctx.font = "700 22px Inter, sans-serif";
      ctx.fillStyle = neon2;
      ctx.fillText(site, padding, H - 40);
    }
  },

  // 11. Luxe sombre, noir + doré, typo serif
  luxe: {
    label: "Luxe sombre",
    swatch: "linear-gradient(135deg,#1a1a1a,#3a2f10,#c9a03d)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#0E0E10";
      ctx.fillRect(0, 0, W, H);

      const padding = 60;
      // Cadre fin doré
      ctx.strokeStyle = "rgba(201,160,61,0.5)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(24, 24, W - 48, H - 48);

      dessinerLogoRond(ctx, logoImg, padding, padding, 76);
      ctx.fillStyle = "#E8CE8A";
      ctx.font = "700 28px Georgia, serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 92, padding + 38);

      ctx.fillStyle = "#F4E7C6";
      ctx.font = "700 48px Georgia, serif";
      ctx.textBaseline = "alphabetic";
      const titreLignes = wrapText(ctx, accroche, W - padding * 2, 3);
      let ty = 230;
      titreLignes.forEach(l => { ctx.fillText(l, padding, ty); ty += 58; });

      // Filet doré sous le titre
      ctx.strokeStyle = "#C9A03D";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding, ty + 10);
      ctx.lineTo(padding + 140, ty + 10);
      ctx.stroke();

      const zoneTop = ty + 50;
      const zoneBottom = H - 130;
      const items = produits.slice(0, 3);
      if (items.length > 0) {
        const gap = 20;
        const cellW = (W - padding * 2 - gap * (items.length - 1)) / items.length;
        const cellH = Math.min(zoneBottom - zoneTop, cellW);
        items.forEach((p, i) => {
          const x = padding + i * (cellW + gap);
          const y = zoneTop;
          ctx.save();
          roundRect(ctx, x, y, cellW, cellH, 10);
          ctx.strokeStyle = "rgba(201,160,61,0.6)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          roundRect(ctx, x, y, cellW, cellH, 10);
          ctx.clip();
          ctx.fillStyle = "#1A1A1D";
          ctx.fillRect(x, y, cellW, cellH);
          if (p._img) drawImageCover(ctx, p._img, x, y, cellW, cellH);
          ctx.restore();
          if (p.prix) {
            ctx.fillStyle = "#F4E7C6";
            ctx.font = "700 20px Georgia, serif";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(formatPrixMmkt(p.prix), x + 12, y + cellH - 16);
          }
        });
      }

      ctx.font = "600 20px Georgia, serif";
      ctx.fillStyle = "#C9A03D";
      ctx.fillText(site, padding, H - 40);
    }
  },

  // 12. Polaroid mosaïque, cartes inclinées en éventail
  polaroid: {
    label: "Polaroid mosaïque",
    swatch: "linear-gradient(135deg,#fdf6e3,#e8ddb5)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#F4EFE4";
      ctx.fillRect(0, 0, W, H);

      const padding = 56;
      dessinerLogoRond(ctx, logoImg, padding, padding, 76);
      ctx.fillStyle = "#20201C";
      ctx.font = "800 32px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 92, padding + 38);

      const items = produits.slice(0, 3).filter(p => p._img);
      const centerX = W / 2, centerY = 560;
      const cardSize = 300;
      const angles = [-9, 0, 9];
      const offsetsX = [-180, 0, 180];
      items.forEach((p, i) => {
        ctx.save();
        ctx.translate(centerX + (offsetsX[i] || 0), centerY);
        ctx.rotate((angles[i] || 0) * Math.PI / 180);
        // Carte blanche façon polaroid
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 10;
        roundRect(ctx, -cardSize / 2, -cardSize / 2 - 20, cardSize, cardSize + 60, 6);
        ctx.fill();
        ctx.shadowColor = "transparent";
        // Photo produit
        ctx.save();
        roundRect(ctx, -cardSize / 2 + 14, -cardSize / 2 - 6, cardSize - 28, cardSize - 40, 4);
        ctx.clip();
        drawImageCover(ctx, p._img, -cardSize / 2 + 14, -cardSize / 2 - 6, cardSize - 28, cardSize - 40);
        ctx.restore();
        // Légende prix façon feutre
        if (p.prix) {
          ctx.fillStyle = "#20201C";
          ctx.font = "700 24px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(formatPrixMmkt(p.prix), 0, cardSize / 2 + 10);
          ctx.textAlign = "left";
        }
        ctx.restore();
      });

      const hauteurBande = mesurerBandeAccroche(ctx, accroche, W - padding * 2, 36).hauteurBande;
      ctx.fillStyle = "#20201C";
      ctx.fillRect(0, H - hauteurBande, W, hauteurBande);
      ctx.fillStyle = "#F4EFE4";
      ctx.font = "800 36px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const lignes = wrapText(ctx, accroche, W - padding * 2, 3);
      let ty = H - hauteurBande + 48;
      lignes.forEach(l => { ctx.fillText(l, padding, ty); ty += 44; });
      ctx.font = "600 20px Inter, sans-serif";
      ctx.fillStyle = couleur;
      ctx.fillText(site, padding, H - 26);
    }
  },

  // 13. Bandeau latéral plein, style "Deedon Gadget"
  bandeauLateral: {
    label: "Bandeau latéral",
    swatch: "linear-gradient(90deg,#F0B429 38%,#fff 38%)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, W, H);

      const bandeW = Math.round(W * 0.36);
      ctx.fillStyle = couleur;
      ctx.fillRect(0, 0, bandeW, H);

      const padding = 40;
      dessinerLogoRond(ctx, logoImg, padding, padding, 72);
      ctx.fillStyle = "#151515";
      ctx.font = "800 26px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const nomLignes = wrapText(ctx, appLabel, bandeW - padding * 2, 2);
      let ny = padding + 110;
      nomLignes.forEach(l => { ctx.fillText(l, padding, ny); ny += 32; });

      ctx.font = "900 40px Inter, sans-serif";
      const titreLignes = wrapText(ctx, accroche, bandeW - padding * 2, 5);
      let ty = ny + 50;
      titreLignes.forEach(l => { ctx.fillText(l, padding, ty); ty += 46; });

      ctx.font = "700 20px Inter, sans-serif";
      ctx.fillStyle = "#20201C";
      const siteLignes = wrapText(ctx, site, bandeW - padding * 2, 2);
      let sy2 = H - 40 - (siteLignes.length - 1) * 26;
      siteLignes.forEach(l => { ctx.fillText(l, padding, sy2); sy2 += 26; });

      // Produits à droite, en colonne
      const zoneX = bandeW + 30;
      const zoneW = W - zoneX - 30;
      const items = produits.slice(0, 3).filter(p => p._img);
      const gap = 20;
      const cellH = Math.min((H - 60 - gap * (items.length - 1)) / Math.max(items.length, 1), zoneW);
      items.forEach((p, i) => {
        const y = 30 + i * (cellH + gap);
        ctx.save();
        roundRect(ctx, zoneX, y, zoneW, cellH, 18);
        ctx.clip();
        ctx.fillStyle = "#F2F2F2";
        ctx.fillRect(zoneX, y, zoneW, cellH);
        drawImageCover(ctx, p._img, zoneX, y, zoneW, cellH);
        ctx.restore();
        if (p.prix) dessinerBadgePrix(ctx, p.prix, couleur, zoneX + 14, y + cellH - 50);
      });
    }
  },

  // 14. Grille compacte + prix barré, style "CHUWI Store" e-commerce agressif
  promoBarree: {
    label: "Promo agressive",
    swatch: "linear-gradient(135deg,#1565c0,#d32f2f)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, produits, site }) {
      ctx.fillStyle = "#EDEFF3";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = shadeColor(couleur, -30);
      ctx.fillRect(0, 0, W, 170);

      const padding = 48;
      dessinerLogoRond(ctx, logoImg, padding, 44, 72);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 32px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 88, 80);

      // Ruban "PROMO" en diagonale coin haut droit
      ctx.save();
      ctx.translate(W - 90, 90);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#D32F2F";
      ctx.fillRect(-120, -22, 240, 44);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 20px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PROMO", 0, 1);
      ctx.textAlign = "left";
      ctx.restore();

      const zoneTop = 200;
      const zoneBottom = H - 150;
      const items = produits.slice(0, 4);
      if (items.length > 0) {
        const cols = 2;
        const rowsCount = Math.ceil(items.length / cols);
        const gap = 16;
        const cellW = (W - padding * 2 - gap) / cols;
        const cellH = Math.min((zoneBottom - zoneTop - gap * (rowsCount - 1)) / rowsCount, cellW);
        items.forEach((p, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          const x = padding + col * (cellW + gap);
          const y = zoneTop + row * (cellH + gap);
          ctx.save();
          ctx.fillStyle = "#FFFFFF";
          roundRect(ctx, x, y, cellW, cellH, 14);
          ctx.fill();
          roundRect(ctx, x, y, cellW - 0, cellH * 0.72, 14);
          ctx.clip();
          ctx.fillStyle = "#F7F7F9";
          ctx.fillRect(x, y, cellW, cellH * 0.72);
          if (p._img) drawImageCover(ctx, p._img, x, y, cellW, cellH * 0.72);
          ctx.restore();

          if (p.prix) {
            const prixBarre = Math.round(p.prix * 1.25);
            ctx.font = "500 16px Inter, sans-serif";
            ctx.fillStyle = "#9A9CA3";
            ctx.textBaseline = "alphabetic";
            const texteBarre = formatPrixMmkt(prixBarre);
            ctx.fillText(texteBarre, x + 14, y + cellH - 34);
            const w = ctx.measureText(texteBarre).width;
            ctx.strokeStyle = "#9A9CA3";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + 14, y + cellH - 39);
            ctx.lineTo(x + 14 + w, y + cellH - 39);
            ctx.stroke();

            ctx.fillStyle = "#D32F2F";
            ctx.font = "800 24px Inter, sans-serif";
            ctx.fillText(formatPrixMmkt(p.prix), x + 14, y + cellH - 10);
          }
        });
      }

      const hauteurBande = mesurerBandeAccroche(ctx, accroche, W - padding * 2, 34).hauteurBande;
      ctx.fillStyle = shadeColor(couleur, -30);
      ctx.fillRect(0, H - hauteurBande, W, hauteurBande);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 34px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const lignes = wrapText(ctx, accroche, W - padding * 2, 3);
      let ty = H - hauteurBande + 46;
      lignes.forEach(l => { ctx.fillText(l, padding, ty); ty += 42; });
      ctx.font = "600 18px Inter, sans-serif";
      ctx.fillStyle = "#FFD54F";
      ctx.fillText(site, padding, H - 24);
    }
  },

  // 11. Duo Achat & Vente — deux personnages 2D (vendeur + client), façon
  // pub Yango "ACHAT & VENTE s'étend". Uniquement pertinent quand l'app
  // ciblée est "les_deux" (mais reste utilisable ailleurs si choisi manuellement).
  duo: {
    label: "Duo Achat & Vente",
    swatch: "linear-gradient(90deg,#E0276F 50%,#111 50%)",
    async draw({ ctx, W, H, couleur, logoImg, appLabel, accroche, site }) {
      // ── Fond profond : base sombre + deux glows radiaux colorés derrière
      // chaque personnage, plutôt qu'un simple dégradé linéaire plat.
      ctx.fillStyle = "#0A0A0C";
      ctx.fillRect(0, 0, W, H);

      const halfW = W / 2;
      const glowY = H * 0.58;

      const glow1 = ctx.createRadialGradient(halfW / 2, glowY, 0, halfW / 2, glowY, halfW * 0.85);
      glow1.addColorStop(0, "rgba(224,39,111,0.55)");
      glow1.addColorStop(1, "rgba(224,39,111,0)");
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, halfW, H);

      const glow2 = ctx.createRadialGradient(halfW + halfW / 2, glowY, 0, halfW + halfW / 2, glowY, halfW * 0.85);
      glow2.addColorStop(0, `${couleur}CC`);
      glow2.addColorStop(1, `${couleur}00`);
      ctx.fillStyle = glow2;
      ctx.fillRect(halfW, 0, halfW, H);

      // Vignette subtile pour recentrer l'attention et donner de la profondeur
      const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      const padding = 48;
      dessinerLogoRond(ctx, logoImg, padding, padding, 84);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 34px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(appLabel, padding + 100, padding + 42);

      // ── Titre avec effet néon : double passe d'ombre portée colorée pour
      // simuler un glow lumineux derrière le texte blanc.
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";

      ctx.save();
      ctx.shadowColor = couleur;
      ctx.shadowBlur = 38;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 68px Inter, sans-serif";
      ctx.fillText("ACHÈTE & VENDS", W / 2, 205);
      ctx.shadowBlur = 22;
      ctx.fillText("ACHÈTE & VENDS", W / 2, 205);
      ctx.restore();

      ctx.save();
      ctx.shadowColor = couleur;
      ctx.shadowBlur = 26;
      ctx.fillStyle = couleur;
      ctx.font = "900 46px Inter, sans-serif";
      ctx.fillText("SUR AURA MARKET", W / 2, 256);
      ctx.restore();

      ctx.textAlign = "left";

      // ── Étincelles décoratives dispersées autour du titre, en évitant la
      // zone du texte lui-même.
      dessinerEtincellesDispersees(ctx, {
        xMin: padding, xMax: W - padding, yMin: 90, yMax: 290,
        count: 10, couleur: "#FFFFFF",
        exclude: { x1: W * 0.22, x2: W * 0.78, y1: 140, y2: 270 },
        seed: 42
      });

      // Charge une paire aléatoire de personnages (vendeur à gauche, client à droite)
      const srcVendeur = MMKT_DUO_VENDEURS[Math.floor(Math.random() * MMKT_DUO_VENDEURS.length)];
      const srcClient = MMKT_DUO_CLIENTS[Math.floor(Math.random() * MMKT_DUO_CLIENTS.length)];
      const [vendeurImg, clientImg] = await Promise.all([
        chargerImage(srcVendeur, { anonymous: false }).catch(() => null),
        chargerImage(srcClient, { anonymous: false }).catch(() => null)
      ]);

      const zoneTop = 300;
      const zoneBottom = H - 260;
      const zoneH = zoneBottom - zoneTop;

      if (vendeurImg) {
        const ratio = vendeurImg.width / vendeurImg.height;
        let ph = zoneH, pw = ph * ratio;
        if (pw > halfW - 40) { pw = halfW - 40; ph = pw / ratio; }
        const px = (halfW - pw) / 2;
        const py = zoneBottom - ph;
        ctx.drawImage(vendeurImg, px, py, pw, ph);
      }
      if (clientImg) {
        const ratio = clientImg.width / clientImg.height;
        let ph = zoneH, pw = ph * ratio;
        if (pw > halfW - 40) { pw = halfW - 40; ph = pw / ratio; }
        const px = halfW + (halfW - pw) / 2;
        const py = zoneBottom - ph;
        ctx.drawImage(clientImg, px, py, pw, ph);
      }

      // Petites étincelles supplémentaires autour des personnages, pour du
      // mouvement sans surcharger la lecture.
      dessinerEtincellesDispersees(ctx, {
        xMin: padding, xMax: halfW - 20, yMin: zoneTop, yMax: zoneBottom - 40,
        count: 3, couleur: "#FFFFFF", seed: 7
      });
      dessinerEtincellesDispersees(ctx, {
        xMin: halfW + 20, xMax: W - padding, yMin: zoneTop, yMax: zoneBottom - 40,
        count: 3, couleur: "#FFFFFF", seed: 13
      });

      // Étiquettes VENDS / ACHÈTE sous chaque personnage, badges dégradés + rotation
      const etiquetteY = zoneBottom + 20;
      dessinerEtiquetteDuo(ctx, "VENDS", "#E0276F", halfW / 2, etiquetteY);
      dessinerEtiquetteDuo(ctx, "ACHÈTE", couleur, halfW + halfW / 2, etiquetteY);

      // Séparateur vertical léger entre les deux personnages
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(halfW, zoneTop);
      ctx.lineTo(halfW, etiquetteY + 30);
      ctx.stroke();

      // ── Bandeau du bas retravaillé : dégradé sombre avec séparation nette
      // (liseré coloré) et accent sur le mot-clé de l'accroche.
      const hauteurBande = mesurerBandeAccroche(ctx, accroche, W - padding * 2, 34).hauteurBande;
      const bandeY = H - hauteurBande;

      const gradBande = ctx.createLinearGradient(0, bandeY, 0, H);
      gradBande.addColorStop(0, "rgba(10,10,12,0.4)");
      gradBande.addColorStop(0.25, "rgba(10,10,12,0.92)");
      gradBande.addColorStop(1, "#0A0A0C");
      ctx.fillStyle = gradBande;
      ctx.fillRect(0, bandeY, W, hauteurBande);

      // Liseré d'accent en haut du bandeau
      const gradLiseré = ctx.createLinearGradient(0, 0, W, 0);
      gradLiseré.addColorStop(0, "#E0276F");
      gradLiseré.addColorStop(1, couleur);
      ctx.fillStyle = gradLiseré;
      ctx.fillRect(0, bandeY, W, 4);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 34px Inter, sans-serif";
      ctx.textBaseline = "alphabetic";
      const lignes = wrapText(ctx, accroche, W - padding * 2, 3);
      let ty = bandeY + 50;
      lignes.forEach(l => { ctx.fillText(l, padding, ty); ty += 42; });
      ctx.font = "600 18px Inter, sans-serif";
      ctx.fillStyle = "#FFD54F";
      ctx.fillText(site, padding, H - 24);
    }
  }
};


async function genererVisuelCanvas(promptBase) {
  const canvas = document.getElementById("mmkt-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Données communes à tous les templates
  const logoSrc = MMKT_APP_LOGOS[_mmktApp] || MMKT_APP_LOGOS.ci;
  let logoImg = null;
  try {
    logoImg = await chargerImage(logoSrc, { anonymous: false });
  } catch {
    // Pas de logo trouvé : chaque template gère l'absence de logo.
  }

  const produits = await recupererProduitsPourVisuel();
  const produitsAvecPhoto = [];
  let canvasTainted = false;

  // On précharge chaque photo produit une seule fois (partagée entre templates)
  const produitsCharges = [];
  for (const p of produits) {
    const { img, tainted } = await chargerImageTolerant(p.image_url);
    if (img && tainted) canvasTainted = true;
    if (img) produitsAvecPhoto.push(p);
    produitsCharges.push({ ...p, _img: img });
  }

  const ctxData = {
    ctx, W, H,
    couleur: _mmktCouleur,
    logoImg,
    appLabel: MMKT_APP_LABELS[_mmktApp],
    accroche: await accrocheParApp(),
    produits: produitsCharges,
    site: siteParApp()
  };

  const templateKey = choisirTemplateActif();
  const template = MMKT_TEMPLATES[templateKey] || MMKT_TEMPLATES.grille;
  await template.draw(ctxData);

  // toDataURL échoue (SecurityError) si une image tainted le canvas malgré tout.
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  } catch (err) {
    throw new Error("Le montage n'a pas pu être finalisé (image produit protégée). Réessaie ou choisis le mode Génération IA.");
  }

  const produitsUtilises = produitsAvecPhoto.map(p => ({ id: p.id, nom: p.nom, image_url: p.image_url, prix: p.prix }));
  return { dataUrl, produits: produitsUtilises, template: templateKey };
}

async function accrocheParApp() {
  const fallback = accrocheFallbackParApp();
  try {
    const contexteCible =
      _mmktApp === "pro" ? "Convaincre des vendeurs de rejoindre Aura Market Pro pour développer leur boutique en ligne." :
      _mmktApp === "ci" ? `Attirer des clients vers Aura Market CI pour acheter en ligne${_mmktCategoriesSelection.length ? " (catégories mises en avant : " + _mmktCategoriesSelection.slice(0, 3).join(", ") + ")" : ""}.` :
      "Mettre en avant le double usage d'Aura Market : une appli pour ACHETER (Aura Market CI) et une appli pour VENDRE (Aura Market Pro), façon les campagnes 'Achat & Vente s'étend' de Yango.";

    const texte = await API.post("/ai/marketing/accroche", {
      cible: _mmktApp,
      contexte: contexteCible,
      ton: _mmktTon
    });

    const accrocheIA = (typeof texte === "string" ? texte : texte?.texte || "").trim();
    // Sécurité : une accroche vide, trop longue, ou avec des guillemets parasites
    // n'est pas utilisable telle quelle sur un visuel — on retombe sur le fallback.
    if (!accrocheIA || accrocheIA.length > 90) return fallback;
    return accrocheIA.replace(/^["«]|["»]$/g, "");
  } catch {
    // Route IA non configurée côté serveur, ou échec réseau : le visuel reste
    // généré avec une accroche de qualité (liste fixe), jamais bloqué.
    return fallback;
  }
}

const MMKT_ACCROCHES_PRO_RECRUTEMENT = [
  "Ta boutique en ligne démarre ici",
  "Vends plus loin que ton quartier",
  "Des milliers de clients t'attendent",
  "Ton commerce mérite une vitrine en ligne",
  "Paiement mobile money, gestion simple, zéro tracas",
  "Rejoins les vendeurs qui gagnent avec Aura Market Pro"
];
const MMKT_ACCROCHES_PRO_MOTIVATION = [
  "Ta persévérance paie, continue !",
  "Chaque fiche soignée, c'est une vente de plus",
  "Publie, réponds vite, encaisse",
  "Les meilleurs vendeurs restent actifs",
  "Ton succès se construit chaque jour"
];
const MMKT_ACCROCHES_CI = [
  "Tes bonnes affaires sont ici",
  "Commande en 2 clics, livré chez toi",
  "Les meilleurs prix, direct des vendeurs",
  "Fais-toi plaisir sans te ruiner",
  "Tout ce qu'il te faut, au meilleur prix"
];

function accrocheFallbackParApp() {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  if (_mmktApp === "pro") {
    if (_mmktVendeurMode === "motivation") return pick(MMKT_ACCROCHES_PRO_MOTIVATION);
    if (_mmktVendeurMode === "boutiques" && _mmktBoutiquesSelection.length) {
      const noms = _mmktBoutiquesSelection.slice(0, 2).map(b => b.nom_boutique).join(" & ");
      return `Découvre ${noms} sur Aura Market`;
    }
    return pick(MMKT_ACCROCHES_PRO_RECRUTEMENT);
  }
  if (_mmktApp === "ci") {
    const cats = _mmktCategoriesSelection.slice(0, 2).join(" & ");
    return cats ? `${cats} : les meilleures offres sont ici` : pick(MMKT_ACCROCHES_CI);
  }
  // "Les deux" : message qui pousse vraiment le double usage Achat & Vente,
  // façon Yango ("ACHAT & VENTE s'étend") plutôt qu'une phrase plate.
  return MMKT_ACCROCHES_LES_DEUX[Math.floor(Math.random() * MMKT_ACCROCHES_LES_DEUX.length)];
}

/* Variantes d'accroche pour l'option "Les deux" — punchy, orientées double usage */
const MMKT_ACCROCHES_LES_DEUX = [
  "Aura Market : achète ET vends, tout en un",
  "Achète. Vends. Gagne. Aura Market s'étend.",
  "Une seule appli pour acheter et vendre",
  "Aura Market, le réflexe achat & vente",
  "Deviens acheteur ET vendeur sur Aura Market"
];

/**
 * Retourne le lien à afficher sur le visuel selon l'application ciblée.
 * pro -> plateforme vendeurs, ci -> plateforme clients, les_deux -> les deux liens.
 */
function siteParApp() {
  if (_mmktApp === "pro") return "auramarketpro.pages.dev";
  if (_mmktApp === "ci") return "auramarketci.com";
  return "auramarketci.com · auramarketpro.pages.dev";
}

/** Lien de partage utilisé pour Facebook/LinkedIn (nécessite une seule URL) */
function lienPartageParApp() {
  if (_mmktApp === "pro") return "https://auramarketpro.pages.dev";
  return "https://auramarketci.com";
}

/* ══════════════════════════════════════════════
   HELPERS DE DESSIN (partagés par tous les templates)
══════════════════════════════════════════════ */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawImageCover(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx, sy, sw, sh;
  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * Découpe un texte en lignes qui tiennent dans maxWidth, sans limite de lignes
 * imposée ici — c'est à l'appelant de dimensionner sa zone en fonction du
 * nombre de lignes réellement retourné (voir chaque template).
 */
function wrapText(ctx, text, maxWidth, maxLines = 3) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line !== "") {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00FF) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000FF) + Math.round(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

function dessinerBadgePrix(ctx, prix, couleur, x, y) {
  const label = formatPrixMmkt(prix);
  ctx.save();
  ctx.font = "800 22px Inter, sans-serif";
  const textW = ctx.measureText(label).width;
  const badgeW = textW + 30;
  const badgeH = 40;

  // Pastille sombre : lisible sur photo blanche COMME sur photo sombre,
  // quel que soit le fond du produit (fix du prix invisible).
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "rgba(17,17,17,0.92)";
  roundRect(ctx, x, y, badgeW, badgeH, badgeH / 2);
  ctx.fill();

  ctx.shadowColor = "transparent";
  // Liseré à la couleur de marque pour rattacher le badge au thème
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, badgeW - 2, badgeH - 2, (badgeH - 2) / 2);
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 15, y + badgeH / 2 + 1);
  ctx.restore();
  return { w: badgeW, h: badgeH };
}

/**
 * Carte produit e-commerce professionnelle : fond blanc arrondi + ombre
 * portée, photo dessinée en "contain" avec marge intérieure (le produit
 * n'est JAMAIS coupé, contrairement au cover brut), badge -X% si remise,
 * badge prix contrasté. Utilisée par les templates de montage pour un
 * rendu type "vraie fiche produit" au lieu d'une photo écrasée.
 */
function dessinerCarteProduit(ctx, p, couleur, x, y, w, h) {
  ctx.save();

  // Carte blanche avec ombre douce
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Photo en "contain" avec marge : produit entier, jamais tronqué
  const pad = Math.max(12, w * 0.06);
  const zx = x + pad, zy = y + pad, zw = w - pad * 2, zh = h - pad * 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, 22);
  ctx.clip();
  if (p._img) {
    const ratio = Math.min(zw / p._img.width, zh / p._img.height);
    const dw = p._img.width * ratio, dh = p._img.height * ratio;
    ctx.drawImage(p._img, zx + (zw - dw) / 2, zy + (zh - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "#F2F2F2";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#9A9A9A";
    ctx.font = "600 15px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.nom ? p.nom.slice(0, 22) : "Produit", x + w / 2, y + h / 2);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // Badge remise en haut à droite si discount
  const remise = Number(p.discount) || 0;
  if (remise > 0) {
    ctx.font = "800 19px Inter, sans-serif";
    const lbl = `-${Math.round(remise)}%`;
    const bw = ctx.measureText(lbl).width + 22;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#E0276F";
    roundRect(ctx, x + w - bw - 10, y + 10, bw, 32, 16);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(lbl, x + w - bw + 1, y + 26);
  }

  if (p.prix) dessinerBadgePrix(ctx, p.prix, couleur, x + 12, y + h - 52);
  ctx.restore();
}

/**
 * Dessine une étincelle / paillette à 4 branches (croix concave), façon
 * éléments décoratifs des visuels pub type Yango. Réutilisable par tout
 * template qui veut ajouter de la vie autour d'un titre ou d'un badge.
 * size = envergure totale de l'étincelle, alpha = opacité (0-1).
 */
function dessinerEtincelle(ctx, cx, cy, size, couleur = "#FFFFFF", alpha = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = couleur;
  const r = size / 2;
  const rInner = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(rInner, -rInner, r, 0);
  ctx.quadraticCurveTo(rInner, rInner, 0, r);
  ctx.quadraticCurveTo(-rInner, rInner, -r, 0);
  ctx.quadraticCurveTo(-rInner, -rInner, 0, -r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Disperse un semis d'étincelles de tailles/opacités variées dans une zone
 * rectangulaire, en évitant une zone d'exclusion centrale (pour ne pas
 * passer par-dessus le texte ou les personnages).
 */
function dessinerEtincellesDispersees(ctx, { xMin, xMax, yMin, yMax, count = 8, couleur = "#FFFFFF", exclude = null, seed = 0 }) {
  let s = seed || Math.floor(Math.random() * 100000);
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  for (let i = 0; i < count; i++) {
    let x, y, tries = 0;
    do {
      x = xMin + rand() * (xMax - xMin);
      y = yMin + rand() * (yMax - yMin);
      tries++;
    } while (exclude && x > exclude.x1 && x < exclude.x2 && y > exclude.y1 && y < exclude.y2 && tries < 12);

    const size = 10 + rand() * 22;
    const alpha = 0.35 + rand() * 0.55;
    dessinerEtincelle(ctx, x, y, size, couleur, alpha);
  }
}

function dessinerEtiquetteDuo(ctx, label, couleur, centerX, y) {
  ctx.font = "800 26px Inter, sans-serif";
  const textW = ctx.measureText(label).width;
  const padX = 26;
  const badgeW = textW + padX * 2;
  const badgeH = 48;
  const angle = (centerX % 2 === 0 ? -1 : 1) * 0.035; // légère bascule alternée, effet "posé"

  ctx.save();
  ctx.translate(centerX, y + badgeH / 2);
  ctx.rotate(angle);

  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  const grad = ctx.createLinearGradient(-badgeW / 2, -badgeH / 2, badgeW / 2, badgeH / 2);
  grad.addColorStop(0, shadeColor(couleur, 14));
  grad.addColorStop(1, shadeColor(couleur, -18));
  ctx.fillStyle = grad;
  roundRect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, -badgeW / 2 + 1, -badgeH / 2 + 1, badgeW - 2, badgeH - 2, (badgeH - 2) / 2);
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 26px Inter, sans-serif";
  ctx.fillText(label, 0, 2);

  ctx.restore();
  ctx.textAlign = "left";
}

function dessinerLogoRond(ctx, logoImg, x, y, size) {
  if (!logoImg) return;
  ctx.save();
  roundRect(ctx, x, y, size, size, size * 0.22);
  ctx.clip();
  ctx.drawImage(logoImg, x, y, size, size);
  ctx.restore();
}

/**
 * Calcule dynamiquement la hauteur nécessaire pour une bande de texte (accroche + site),
 * pour ne JAMAIS couper ou chevaucher le texte — c'est le fix du bug d'accroche cachée.
 */
function mesurerBandeAccroche(ctx, accroche, maxWidth, tailleFont = 42) {
  ctx.font = `800 ${tailleFont}px Inter, sans-serif`;
  const lignes = wrapText(ctx, accroche, maxWidth, 3);
  const ligneH = Math.round(tailleFont * 1.2);
  const hauteurTexte = lignes.length * ligneH;
  const hauteurBande = hauteurTexte + 118; // marge haute + place pour la ligne CTA + site en bas
  return { lignes, ligneH, hauteurBande };
}

function dessinerBandeAccroche(ctx, { accroche, W, H, padding, couleur, site, fond = "rgba(0,0,0,0.55)" }) {
  const maxWidth = W - padding * 2;
  const tailleFont = accroche.length > 40 ? 34 : 42;
  const { lignes, ligneH, hauteurBande } = mesurerBandeAccroche(ctx, accroche, maxWidth, tailleFont);

  // Dégradé au lieu d'un aplat : transition douce avec le contenu au-dessus
  const grad = ctx.createLinearGradient(0, H - hauteurBande - 30, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.25, fond);
  grad.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - hauteurBande - 30, W, hauteurBande + 30);

  // Trait accent couleur de marque au-dessus de l'accroche
  ctx.fillStyle = couleur;
  ctx.fillRect(padding, H - hauteurBande + 4, 72, 5);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `900 ${tailleFont}px Inter, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  const texteStartY = H - hauteurBande + ligneH + 18;
  lignes.forEach((ligne, i) => ctx.fillText(ligne, padding, texteStartY + i * ligneH));
  ctx.shadowColor = "transparent";

  // Ligne du bas : CTA en pastille + site
  const cta = ctaParApp();
  ctx.font = "800 21px Inter, sans-serif";
  const ctaW = ctx.measureText(cta).width + 40;
  const ctaH = 42;
  const ctaY = H - ctaH - 16;
  ctx.fillStyle = couleur;
  roundRect(ctx, padding, ctaY, ctaW, ctaH, ctaH / 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.fillText(cta, padding + 20, ctaY + ctaH / 2 + 1);

  ctx.font = "700 21px Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(site, padding + ctaW + 22, ctaY + ctaH / 2 + 1);

  return hauteurBande;
}

function formatPrixMmkt(prix) {
  return Math.round(prix).toLocaleString("fr-FR") + " F";
}

/* ── Upload du visuel généré vers Supabase Storage (via Worker) ── */
async function uploaderVisuel(dataUrl, ext) {
  const token = AURA_AUTH.getAccessToken();
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const res = await fetch(`${AURA_CONFIG.WORKER_URL}/storage/object/${MMKT_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      Authorization: `Bearer ${token}`
    },
    body: blob
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || "Échec de l'upload du visuel");
  }

  return `${AURA_CONFIG.WORKER_URL}/storage/object/public/${MMKT_BUCKET}/${path}`;
}

/* ══════════════════════════════════════════════
   VISUEL — Génération IA (Pollinations.ai)
══════════════════════════════════════════════ */
/* ── Génération IA générique (Cloudflare Workers AI, via le Worker) ──
   Comme pour le mode Corporate : FLUX Schnell rend très mal le texte
   dans une image générée (lettres déformées, illisibles). On interdit
   donc explicitement tout texte dans le prompt — l'accroche reste un
   texte séparé (affiché à côté de l'image dans le résultat), jamais
   incrustée par l'IA elle-même. */
/* Ambiance visuelle IA différenciée selon l'application ciblée :
   chaque app a sa propre idéologie de promotion, l'image doit la refléter.
   - Pro  : crédibilité B2B → entrepreneur africain pro, boutique, sérieux
   - CI   : désir d'achat → lifestyle shopping vibrant, smartphone, colis
   - Duo  : écosystème → scène de marché moderne, échange acheteur/vendeur */
function ambianceIAParApp() {
  if (_mmktApp === "pro") {
    return "confident African entrepreneur or shop owner in a modern boutique, laptop or smartphone in hand, professional trustworthy B2B mood, warm premium lighting";
  }
  if (_mmktApp === "ci") {
    return "joyful African young adults shopping online with a smartphone, colorful delivery packages and shopping bags, vibrant lifestyle energy, bright appealing colors";
  }
  return "modern African marketplace scene, one person selling from a phone and one person receiving a package, dynamic buy-and-sell energy, warm vibrant mood";
}

async function genererImageIA(promptBase) {
  // FLUX hallucine des lettres illisibles dès qu'on lui laisse écrire.
  // Règle absolue : le fond est généré SANS AUCUN texte, puis l'accroche,
  // le logo et le site sont incrustés proprement via Canvas — le rendu brut
  // de l'IA n'est plus jamais montré tel quel.
  const promptImage = `Professional advertising background for a social media post, ${ambianceIAParApp()}, context: ${promptBase}, cinematic high quality photography style, elegant color palette based on ${_mmktCouleur}, generous clean empty space in the lower third of the image for a text overlay, no watermark. IMPORTANT: this image must contain ZERO text, ZERO letters, ZERO words, ZERO numbers, ZERO typography, ZERO signage, ZERO labels, ZERO logos anywhere — purely a wordless photographic scene`;

  const reponse = await API.post("/ai/marketing/image", { prompt: promptImage });
  const data = typeof reponse === "string" ? JSON.parse(reponse) : reponse;
  if (!data?.dataUrl) throw new Error("Le service de génération d'image n'a pas répondu. Réessaie.");

  const accroche = await accrocheParApp();
  return await incrusterAccrocheSurFond(data.dataUrl, accroche);
}

/* ── Génération IA "Corporate" (Cloudflare Workers AI, via le Worker) ──
   Style flat design business/corporate — illustrations vectorielles avec
   des personnages professionnels simplifiés (poignées de main, graphiques
   de croissance, documents), à l'opposé du style "cartoon 3D" du module
   Contenus. Pensé spécifiquement pour le recrutement/motivation de
   vendeurs sur Aura Market Pro : crédibilité et sérieux avant tout.
   IMPORTANT : le modèle FLUX Schnell rend très mal le texte à l'intérieur
   d'une image générée (lettres déformées, illisibles). On génère donc le
   fond SANS aucun texte, puis on incruste l'accroche par-dessus via
   Canvas — même technique que le montage "photos" existant — pour un
   rendu final toujours net et lisible. */
async function genererImageCorporate(promptBase, accroche) {
  const promptImage = `Modern flat design vector illustration, NO TEXT, corporate business style, professional B2B marketing background image, ${promptBase}, simplified human characters in business attire (handshake, growth chart, teamwork, or office meeting composition — choose what fits best), clean geometric shapes, soft rounded edges, sober elegant color palette based on ${_mmktCouleur} combined with white and neutral tones, generous empty space at the top and bottom of the image, trustworthy and credible mood, no photorealism. IMPORTANT: this image must contain ZERO text, ZERO letters, ZERO words, ZERO numbers, ZERO typography, ZERO signage, ZERO labels anywhere — purely a wordless illustration, no watermark, high quality vector art style similar to modern SaaS landing page illustrations`;

  // Réutilise la route déjà existante du module Contenus (flux-2-klein-4b),
  // plutôt que de dupliquer la logique multipart côté Worker : aucune
  // image de référence n'est nécessaire ici (refImages omis), la route
  // fonctionne très bien pour une génération de fond standalone.
  const reponse = await API.post("/ai/contenus/image-scene", { prompt: promptImage });
  const data = typeof reponse === "string" ? JSON.parse(reponse) : reponse;
  if (!data?.dataUrl) throw new Error("Le service de génération d'image n'a pas répondu. Réessaie.");

  return await incrusterAccrocheSurFond(data.dataUrl, accroche);
}

/* Dessine l'image de fond (générée par IA, sans texte) sur un canvas
   1080x1080, puis incruste l'accroche dans un bandeau dégradé en bas —
   même logique visuelle que le montage "photos" (mesurerBandeAccroche +
   wrapText), pour garder une cohérence entre tous les styles de l'app. */
async function incrusterAccrocheSurFond(dataUrlFond, accroche) {
  const canvas = document.getElementById("mmkt-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const padding = 60;

  const img = await chargerImage(dataUrlFond, { anonymous: false });

  ctx.clearRect(0, 0, W, H);
  const ratio = Math.max(W / img.width, H / img.height);
  const dw = img.width * ratio, dh = img.height * ratio;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

  // FLUX Schnell n'a pas de "negative prompt" fiable : malgré la consigne
  // "no text" dans le prompt, il peut quand même halluciner des lettres
  // n'importe où dans l'image (constaté en haut de certains rendus). On
  // recouvre donc systématiquement le tiers supérieur avec un voile de la
  // couleur de marque, façon bandeau de titre — ça élimine le risque tout
  // en donnant un vrai espace propre pour un futur logo/label si besoin.
  const hauteurVoileHaut = H * 0.16;
  const gradHaut = ctx.createLinearGradient(0, 0, 0, hauteurVoileHaut);
  gradHaut.addColorStop(0, hexToRgba(_mmktCouleur, 0.92));
  gradHaut.addColorStop(1, hexToRgba(_mmktCouleur, 0));
  ctx.fillStyle = gradHaut;
  ctx.fillRect(0, 0, W, hauteurVoileHaut);

  // Logo de l'application ciblée dans le bandeau haut
  try {
    const logoImg = await chargerImage(MMKT_APP_LOGOS[_mmktApp] || MMKT_APP_LOGOS.ci, { anonymous: false });
    dessinerLogoRond(ctx, logoImg, padding, 28, 84);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 32px Inter, sans-serif";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.fillText(MMKT_APP_LABELS[_mmktApp] || "Aura Market", padding + 102, 70);
    ctx.shadowColor = "transparent";
  } catch { /* pas de logo : le voile haut reste propre */ }

  const texteAccroche = (accroche || "").trim();
  if (texteAccroche) {
    const tailleFont = texteAccroche.length > 45 ? 36 : 44;
    ctx.font = `900 ${tailleFont}px Inter, sans-serif`;
    const lignes = wrapText(ctx, texteAccroche, W - padding * 2, 3);
    const ligneH = Math.round(tailleFont * 1.22);
    const hauteurBande = lignes.length * ligneH + 150; // accroche + CTA + site

    const bandeY = H - hauteurBande;
    const gradBande = ctx.createLinearGradient(0, bandeY, 0, H);
    gradBande.addColorStop(0, "rgba(255,255,255,0)");
    gradBande.addColorStop(0.28, "rgba(255,255,255,0.97)");
    gradBande.addColorStop(1, "#FFFFFF");
    ctx.fillStyle = gradBande;
    ctx.fillRect(0, bandeY, W, hauteurBande);

    const gradLisere = ctx.createLinearGradient(0, 0, W, 0);
    gradLisere.addColorStop(0, _mmktCouleur);
    gradLisere.addColorStop(1, "#111111");
    ctx.fillStyle = gradLisere;
    ctx.fillRect(0, bandeY, W, 5);

    ctx.fillStyle = "#111111";
    ctx.font = `900 ${tailleFont}px Inter, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    let ty = bandeY + ligneH + 22;
    lignes.forEach(l => { ctx.fillText(l, padding, ty); ty += ligneH; });

    // Bouton CTA façon vraie affiche pub, différent selon l'application
    const cta = ctaParApp();
    ctx.font = "800 24px Inter, sans-serif";
    const ctaW = ctx.measureText(cta).width + 56;
    const ctaH = 56;
    const ctaY = H - ctaH - 40;
    ctx.shadowColor = hexToRgba(_mmktCouleur, 0.45);
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    const gradCta = ctx.createLinearGradient(padding, ctaY, padding + ctaW, ctaY + ctaH);
    gradCta.addColorStop(0, shadeColor(_mmktCouleur, 10));
    gradCta.addColorStop(1, shadeColor(_mmktCouleur, -18));
    ctx.fillStyle = gradCta;
    roundRect(ctx, padding, ctaY, ctaW, ctaH, ctaH / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(cta, padding + 28, ctaY + ctaH / 2 + 1);

    // Site correct selon l'app (fix : ce n'est plus toujours le lien Pro)
    ctx.font = "700 20px Inter, sans-serif";
    ctx.fillStyle = "#555555";
    ctx.fillText(siteParApp(), padding + ctaW + 26, ctaY + ctaH / 2 + 1);
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

/** Appel à l'action affiché sur le visuel, selon l'idéologie de chaque app. */
function ctaParApp() {
  if (_mmktApp === "pro") {
    return _mmktVendeurMode === "motivation" ? "Continue, ça paie →" : "Deviens vendeur →";
  }
  if (_mmktApp === "ci") return "Achète maintenant →";
  return "Achète & vends ici →";
}

function hexToRgba(hex, alpha) {
  const clean = (hex || "#E0276F").replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 224;
  const g = parseInt(clean.substring(2, 4), 16) || 39;
  const b = parseInt(clean.substring(4, 6), 16) || 111;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ══════════════════════════════════════════════
   Copier / Télécharger / Partager
══════════════════════════════════════════════ */
function copierTexte() {
  const texte = document.getElementById("mmkt-result-texte").value;
  navigator.clipboard.writeText(texte)
    .then(() => showMmktToast("Texte copié.", "success"))
    .catch(() => showMmktToast("Impossible de copier.", "error"));
}

async function telechargerImage() {
  if (!_mmktDernierResultat?.imageDataUrl) return;
  try {
    const a = document.createElement("a");
    a.href = _mmktDernierResultat.imageDataUrl;
    a.download = `aura-market-pub-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    showMmktToast("Échec du téléchargement, ouvre l'image et enregistre-la manuellement.", "error");
  }
}

async function partager(reseau) {
  if (!_mmktDernierResultat) return;
  const texteBrut = _mmktDernierResultat.textes?.[reseau] || Object.values(_mmktDernierResultat.textes || {})[0] || "";
  const texte = encodeURIComponent(texteBrut);

  if (reseau === "tiktok") {
    showMmktToast("TikTok ne permet pas le partage direct. Télécharge l'image et poste-la depuis l'app.", "info");
    return;
  }

  // ── 1) Priorité : Web Share API native (texte + image ensemble, vers l'app choisie) ──
  const partageNatifOk = await tenterPartageNatif(reseau, texteBrut);
  if (partageNatifOk) return;

  // ── 2) Fallback : liens web classiques (texte seul pour FB/LinkedIn, limitation propre à ces réseaux) ──
  if (reseau === "whatsapp") {
    window.open(`https://wa.me/?text=${texte}`, "_blank");
    return;
  }
  if (reseau === "facebook") {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(lienPartageParApp())}&quote=${texte}`, "_blank");
    showMmktToast("Facebook n'affiche pas d'image/texte personnalisés via ce lien. Télécharge l'image et colle le texte manuellement pour un résultat parfait.", "info");
    return;
  }
  if (reseau === "linkedin") {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(lienPartageParApp())}&summary=${texte}`, "_blank");
    showMmktToast("LinkedIn n'affiche pas d'image/texte personnalisés via ce lien. Télécharge l'image et colle le texte manuellement pour un résultat parfait.", "info");
    return;
  }
}

/**
 * Partage natif via navigator.share (texte + image ensemble).
 * Fonctionne sur mobile (Android/iOS) quand l'app cible (WhatsApp, Facebook, LinkedIn)
 * est installée : ouvre le sélecteur système, l'utilisateur choisit l'app, et reçoit
 * l'image ET le texte en une seule fois — contrairement aux liens web des réseaux
 * qui ignorent le texte/l'image passés en paramètre.
 * Retourne true si le partage a été déclenché (ou annulé par l'utilisateur), false
 * si l'API n'est pas disponible et qu'il faut basculer sur le fallback.
 */
async function tenterPartageNatif(reseau, texteBrut) {
  if (!navigator.share) return false;

  try {
    const file = await recupererFichierImagePartage();

    if (file && navigator.canShare && !navigator.canShare({ files: [file] })) {
      // Le navigateur ne sait pas partager de fichiers : on retente en texte seul,
      // sinon on laisse le fallback par lien classique gérer WhatsApp/FB/LinkedIn.
      if (!navigator.canShare || navigator.canShare({ text: texteBrut })) {
        await navigator.share({ text: texteBrut });
        return true;
      }
      return false;
    }

    const shareData = file ? { text: texteBrut, files: [file] } : { text: texteBrut };
    await navigator.share(shareData);
    return true;
  } catch (err) {
    // AbortError = l'utilisateur a annulé le sélecteur : on considère que c'est géré,
    // pas la peine de retomber sur le fallback dans ce cas.
    if (err && err.name === "AbortError") return true;
    console.warn(`Partage natif indisponible pour ${reseau}, fallback lien classique :`, err);
    return false;
  }
}

/** Récupère l'image du dernier résultat sous forme de File, prête pour navigator.share. */
async function recupererFichierImagePartage() {
  const source = _mmktDernierResultat?.imageDataUrl || _mmktImageUrlStockee;
  if (!source) return null;
  try {
    const blob = await (await fetch(source)).blob();
    const ext = blob.type.includes("png") ? "png" : "jpg";
    return new File([blob], `aura-market-pub-${Date.now()}.${ext}`, { type: blob.type || "image/jpeg" });
  } catch (err) {
    console.warn("Impossible de récupérer l'image pour le partage natif :", err);
    return null;
  }
}

/* ══════════════════════════════════════════════
   Historique (Supabase)
══════════════════════════════════════════════ */
async function sauvegarderHistorique(payload) {
  try {
    await API.post(AURA_CONFIG.endpoints.contenus_marketing, payload);
  } catch (err) {
    console.error("Sauvegarde historique impossible :", err.message);
  }
}

async function chargerHistorique() {
  const list = document.getElementById("mmkt-list");

  if (!AURA_CONFIG.endpoints.contenus_marketing) {
    list.innerHTML = `<div class="mmkt-empty">Historique indisponible (table contenus_marketing non configurée).</div>`;
    return;
  }

  try {
    const rows = await API.get(AURA_CONFIG.endpoints.contenus_marketing + "?order=created_at.desc&limit=50");
    _mmktItems = Array.isArray(rows) ? rows : [];

    if (_mmktItems.length === 0) {
      list.innerHTML = `<div class="mmkt-empty" id="mmkt-empty">Aucun contenu généré pour l'instant.</div>`;
      return;
    }

    list.innerHTML = _mmktItems.map(renderMmktItem).join("");
  } catch (err) {
    list.innerHTML = `<div class="mmkt-empty" style="border-color:var(--danger);color:var(--danger);">Erreur : ${escMmkt(err.message)}</div>`;
  }
}

function renderMmktItem(item) {
  const premierTexte = item.textes_par_plateforme && Object.values(item.textes_par_plateforme)[0]
    ? Object.values(item.textes_par_plateforme)[0]
    : (item.texte_genere || item.prompt || "");

  const thumb = (item.produits_utilises && item.produits_utilises[0]?.image_url)
    ? `<img src="${escMmkt(item.produits_utilises[0].image_url)}" alt="">`
    : `<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M4 15l4-4 4 4 4-6 4 6"/></svg>`;

  const plateformesTags = (item.plateformes || []).map(p => `<span class="mmkt-tag">${MMKT_PLATFORM_LABELS[p] || p}</span>`).join("");

  return `
    <div class="mmkt-item" data-id="${item.id}" onclick="rejouerMmktItem('${item.id}')">
      <div class="mmkt-item-thumb">${thumb}</div>
      <div class="mmkt-item-info">
        <div class="mmkt-item-titre">${escMmkt(item.cible_label || MMKT_APP_LABELS[item.app_cible] || "Application")}</div>
        <div class="mmkt-item-corps">${escMmkt(premierTexte)}</div>
        <div class="mmkt-item-meta">
          <span class="mmkt-tag gold">${escMmkt(MMKT_APP_LABELS[item.app_cible] || "")}</span>
          ${plateformesTags}
          <span class="mmkt-tag">${formatMmktDate(item.created_at)}</span>
        </div>
      </div>
      <div class="mmkt-item-actions">
        <button class="mmkt-item-delete" onclick="event.stopPropagation(); supprimerMmktItem('${item.id}')" title="Supprimer">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h10l1-13"/></svg>
        </button>
      </div>
    </div>`;
}

async function supprimerMmktItem(id) {
  if (!confirm("Supprimer ce contenu de l'historique ?")) return;
  try {
    await API.delete(AURA_CONFIG.endpoints.contenus_marketing + "?id=eq." + id);
    showMmktToast("Contenu supprimé.", "success");
    chargerHistorique();
  } catch (err) {
    showMmktToast("Erreur : " + err.message, "error");
  }
}

/* ══════════════════════════════════════════════
   Utilitaires
══════════════════════════════════════════════ */
function formatMmktDate(iso) {
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

let _mmktToastTimer = null;
function showMmktToast(message, type = "info") {
  const toast = document.getElementById("mmkt-toast");
  toast.textContent = message;
  toast.className = "mmkt-toast show" + (type === "error" ? " error" : type === "success" ? " success" : "");
  clearTimeout(_mmktToastTimer);
  _mmktToastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

/* ══════════════════════════════════════════════
   NETTOYAGE DU STOCKAGE (bucket visuels-marketing)
   Analyse puis suppression des visuels inutilisés,
   via l'endpoint Worker /ai/marketing/nettoyer-visuels.
══════════════════════════════════════════════ */
let _mmktStorageOrphelines = 0;

async function analyserStockage() {
  const btn = document.getElementById("mmkt-storage-scan-btn");
  const clean = document.getElementById("mmkt-storage-clean-btn");
  const info = document.getElementById("mmkt-storage-info");
  if (!btn) return;

  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Analyse…";
  try {
    const r = await API.post("/ai/marketing/nettoyer-visuels", { confirmer: false });
    _mmktStorageOrphelines = r.orphelines || 0;
    info.textContent =
      `${r.total} visuels · ${r.utilisees} utilisés · ${r.orphelines} inutilisés (${r.mo_orphelins} Mo récupérables).`;
    if (r.orphelines > 0) {
      clean.style.display = "inline-flex";
      clean.textContent = `Supprimer ${r.orphelines} inutilisées`;
    } else {
      clean.style.display = "none";
      showMmktToast("Rien à nettoyer, tout est utilisé 👍", "success");
    }
  } catch (e) {
    showMmktToast(e.message || "Analyse impossible", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

async function nettoyerStockage() {
  if (!_mmktStorageOrphelines) return;
  const ok = window.confirm(
    `Supprimer définitivement ${_mmktStorageOrphelines} visuel(s) inutilisé(s) ?\n\nLes visuels encore rattachés à un contenu seront conservés. Cette action est irréversible.`
  );
  if (!ok) return;

  const btn = document.getElementById("mmkt-storage-clean-btn");
  const info = document.getElementById("mmkt-storage-info");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Suppression…";
  try {
    const r = await API.post("/ai/marketing/nettoyer-visuels", { confirmer: true });
    showMmktToast(`${r.supprimes} visuel(s) supprimé(s) · ${r.utilisees} conservé(s)`, "success");
    info.textContent = `${r.utilisees} visuels conservés. Stockage nettoyé (${r.mo_orphelins} Mo libérés).`;
    btn.style.display = "none";
    _mmktStorageOrphelines = 0;
  } catch (e) {
    showMmktToast(e.message || "Suppression impossible", "error");
    btn.disabled = false;
    btn.textContent = label;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("mmkt-storage-scan-btn")?.addEventListener("click", analyserStockage);
  document.getElementById("mmkt-storage-clean-btn")?.addEventListener("click", nettoyerStockage);
});

function escMmkt(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/* ── Rejouer un contenu de l'historique dans le panneau résultat ── */
function rejouerMmktItem(id) {
  const item = _mmktItems.find(i => String(i.id) === String(id));
  if (!item) return;

  const resultWrap = document.getElementById("mmkt-result-wrap");
  const texteWrap = document.getElementById("mmkt-result-texte-wrap");
  const texteEl = document.getElementById("mmkt-result-texte");
  const imgWrap = document.getElementById("mmkt-result-img-wrap");
  const imgEl = document.getElementById("mmkt-result-img");
  const copyBtn = document.getElementById("mmkt-copy-texte-btn");
  const dlBtn = document.getElementById("mmkt-download-img-btn");
  const shareRow = document.getElementById("mmkt-share-row");
  const imgLoading = document.getElementById("mmkt-result-img-loading");
  const tabsWrap = document.getElementById("mmkt-result-tabs");

  resultWrap.style.display = "block";

  const textes = item.textes_par_plateforme && Object.keys(item.textes_par_plateforme).length > 0
    ? item.textes_par_plateforme
    : (item.texte_genere ? { defaut: item.texte_genere } : {});

  if (Object.keys(textes).length > 0) {
    texteWrap.style.display = "block";
    copyBtn.style.display = "block";
    renderResultTabs(textes);
  } else {
    texteWrap.style.display = "none";
    copyBtn.style.display = "none";
    tabsWrap.innerHTML = "";
  }

  if (item.image_url) {
    imgWrap.style.display = "block";
    imgLoading.style.display = "none";
    imgEl.style.opacity = "1";
    imgEl.src = item.image_url;
    dlBtn.style.display = "block";
  } else {
    imgWrap.style.display = "none";
    dlBtn.style.display = "none";
  }

  shareRow.style.display = "block";
  _mmktDernierResultat = { textes, imageDataUrl: item.image_url, produitsUtilises: item.produits_utilises || [], appCible: item.app_cible };
  _mmktImageUrlStockee = item.image_url;

  document.getElementById("mmkt-result-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
}

/*
 * NOTE — Persistance des visuels :
 * Les visuels générés en mode "canvas" sont uploadés vers le bucket Supabase
 * Storage "visuels-marketing" (public) via le Worker, avec le même pattern que
 * module-bannieres.js. Les visuels générés en mode "ia" (Pollinations) gardent
 * directement leur URL externe, déjà stable. L'historique stocke donc toujours
 * une URL exploitable dans image_url.
 */

/* ══════════════════════════════════════════════════════════════
   AGENT MARKETING — génération automatique des suggestions du jour
   ══════════════════════════════════════════════════════════════
   Objectif : 2 contenus prêts par jour, sans que l'admin remplisse
   le wizard. L'agent analyse l'historique récent (contenus_marketing)
   pour varier boutiques/catégories, choisit une cible, génère texte +
   image via les mêmes fonctions que le wizard manuel, et affiche le
   résultat dans un panneau "à valider" — rien n'est jamais partagé
   automatiquement, l'admin garde toujours la main sur le clic final.
══════════════════════════════════════════════════════════════ */
const MMKT_AGENT_OBJECTIF_JOUR = 2;
const MMKT_AGENT_HISTORIQUE_JOURS = 7; // fenêtre pour éviter de répéter boutique/catégorie
let _mmktAgentSuggestions = []; // [{ id: 'agent-0', textes, imageDataUrl, imageUrlStockee, appCible, plateformes, categories, boutiquesIds, produitsUtilises, statut }]

async function initAgentMarketing() {
  const body = document.getElementById("mmkt-agent-body");
  const progress = document.getElementById("mmkt-agent-progress");
  if (!body) return;

  try {
    // Sécurité anti-course : le listener principal charge boutiques/catégories
    // en parallèle, on s'assure ici qu'elles sont bien disponibles avant de choisir.
    if (_mmktBoutiquesCache.length === 0) await chargerBoutiques();
    if (_mmktCategoriesCache.length === 0) await chargerCategories();

    const dejaGeneresAuj = await mmktAgentCompterAujourdhui();
    const aGenerer = Math.max(0, MMKT_AGENT_OBJECTIF_JOUR - dejaGeneresAuj);

    progress.textContent = `${dejaGeneresAuj}/${MMKT_AGENT_OBJECTIF_JOUR} aujourd'hui`;
    progress.classList.toggle("done", aGenerer === 0);

    if (aGenerer === 0) {
      body.innerHTML = `<div class="mmkt-agent-empty">Objectif du jour atteint. L'agent proposera de nouvelles suggestions demain.</div>`;
      return;
    }

    body.innerHTML = `<div class="mmkt-agent-loading">L'agent prépare ${aGenerer} suggestion${aGenerer > 1 ? "s" : ""}…</div>`;

    const historiqueRecent = await mmktAgentChargerHistoriqueRecent();
    _mmktAgentSuggestions = [];

    for (let i = 0; i < aGenerer; i++) {
      const suggestion = await mmktAgentGenererSuggestion(historiqueRecent, _mmktAgentSuggestions);
      _mmktAgentSuggestions.push(suggestion);
      mmktAgentRender(); // affichage progressif, une carte à la fois
    }
  } catch (err) {
    body.innerHTML = `<div class="mmkt-agent-empty" style="color:var(--danger);">Erreur agent : ${escMmkt(err.message)}</div>`;
  }
}

/** Compte les contenus déjà générés aujourd'hui (toutes origines confondues) via contenus_marketing. */
async function mmktAgentCompterAujourdhui() {
  if (!AURA_CONFIG.endpoints.contenus_marketing) return 0;
  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);
  try {
    const rows = await API.get(
      AURA_CONFIG.endpoints.contenus_marketing +
      `?select=id&created_at=gte.${debutJour.toISOString()}&limit=50`
    );
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

/** Charge les boutiques/catégories déjà mises en avant récemment, pour éviter les répétitions. */
async function mmktAgentChargerHistoriqueRecent() {
  if (!AURA_CONFIG.endpoints.contenus_marketing) return { boutiquesIds: [], categories: [] };
  const depuis = new Date(Date.now() - MMKT_AGENT_HISTORIQUE_JOURS * 24 * 60 * 60 * 1000);
  try {
    const rows = await API.get(
      AURA_CONFIG.endpoints.contenus_marketing +
      `?select=boutiques_ids,categories&created_at=gte.${depuis.toISOString()}&order=created_at.desc&limit=50`
    );
    const list = Array.isArray(rows) ? rows : [];
    return {
      boutiquesIds: list.flatMap(r => r.boutiques_ids || []),
      categories: list.flatMap(r => r.categories || [])
    };
  } catch {
    return { boutiquesIds: [], categories: [] };
  }
}

/**
 * Choisit intelligemment une cible (boutique ou catégorie) pas encore mise en
 * avant récemment, alterne CI/Pro entre les suggestions du jour pour varier,
 * puis génère texte + image en réutilisant exactement les fonctions du wizard.
 */
async function mmktAgentGenererSuggestion(historiqueRecent, dejaGenereesAuj) {
  // Sauvegarde de l'état du formulaire manuel pour ne pas le perturber
  const etatSauvegarde = {
    app: _mmktApp, platforms: [..._mmktPlatforms], vendeurMode: _mmktVendeurMode,
    boutiquesSelection: [..._mmktBoutiquesSelection], categoriesSelection: [..._mmktCategoriesSelection],
    couleur: _mmktCouleur, ton: _mmktTon, templateMode: _mmktTemplateMode
  };

  try {
    // Alterne CI (catégories, clients) / Pro (boutiques, vendeurs) selon la parité du jour
    const preferCi = dejaGenereesAuj.filter(s => s.appCible === "ci").length <= dejaGenereesAuj.filter(s => s.appCible === "pro").length;

    if (_mmktCategoriesCache.length === 0) await chargerCategories();
    if (_mmktBoutiquesCache.length === 0) await chargerBoutiques();

    const boutiqueDejaVue = new Set([...historiqueRecent.boutiquesIds, ...dejaGenereesAuj.flatMap(s => s.boutiquesIds || [])]);
    const categorieDejaVue = new Set([...historiqueRecent.categories, ...dejaGenereesAuj.flatMap(s => s.categories || [])]);

    const boutiquesDispo = _mmktBoutiquesCache.filter(b => !boutiqueDejaVue.has(b.id));
    const categoriesDispo = _mmktCategoriesCache.filter(c => !categorieDejaVue.has(c.categorie));

    const utiliserPro = preferCi ? false : boutiquesDispo.length > 0;
    const appCible = utiliserPro || categoriesDispo.length === 0 ? "pro" : "ci";

    _mmktApp = appCible;
    _mmktPlatforms = ["whatsapp", "facebook", "linkedin"];
    _mmktCouleur = "#F0B429";
    _mmktTon = "dynamique";
    _mmktTemplateMode = "aleatoire";

    let categoriesChoisies = [];
    let boutiquesChoisies = [];

    if (appCible === "ci") {
      const pool = categoriesDispo.length > 0 ? categoriesDispo : _mmktCategoriesCache;
      categoriesChoisies = pool.slice(0, 1).map(c => c.categorie);
      _mmktCategoriesSelection = categoriesChoisies;
      _mmktVendeurMode = "recrutement";
      _mmktBoutiquesSelection = [];
    } else {
      const pool = boutiquesDispo.length > 0 ? boutiquesDispo : _mmktBoutiquesCache;
      boutiquesChoisies = pool.slice(0, Math.min(2, pool.length));
      _mmktBoutiquesSelection = boutiquesChoisies;
      _mmktVendeurMode = boutiquesChoisies.length > 0 ? "boutiques" : "recrutement";
      _mmktCategoriesSelection = [];
    }

    const promptBase = construirePromptBase("");
    const textesParPlateforme = {};
    for (const plateforme of _mmktPlatforms) {
      textesParPlateforme[plateforme] = await genererTexte(promptBase, _mmktTon, plateforme);
    }

    const { dataUrl, produits } = await genererVisuelCanvas(promptBase);
    let imageUrlStockee = null;
    try {
      imageUrlStockee = await uploaderVisuel(dataUrl, "jpg");
    } catch (err) {
      console.warn("Upload visuel agent impossible, image gardée en local :", err.message);
    }

    return {
      id: "agent-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      textes: textesParPlateforme,
      imageDataUrl: dataUrl,
      imageUrlStockee,
      appCible,
      plateformes: _mmktPlatforms,
      categories: categoriesChoisies,
      boutiquesIds: boutiquesChoisies.map(b => b.id),
      produitsUtilises: produits,
      statut: "pending" // pending | ready(sauvegardé) | published(marqué manuellement)
    };
  } finally {
    // Restauration de l'état du wizard manuel
    _mmktApp = etatSauvegarde.app;
    _mmktPlatforms = etatSauvegarde.platforms;
    _mmktVendeurMode = etatSauvegarde.vendeurMode;
    _mmktBoutiquesSelection = etatSauvegarde.boutiquesSelection;
    _mmktCategoriesSelection = etatSauvegarde.categoriesSelection;
    _mmktCouleur = etatSauvegarde.couleur;
    _mmktTon = etatSauvegarde.ton;
    _mmktTemplateMode = etatSauvegarde.templateMode;
  }
}

function mmktAgentRender() {
  const body = document.getElementById("mmkt-agent-body");
  if (!body) return;

  if (_mmktAgentSuggestions.length === 0) {
    body.innerHTML = `<div class="mmkt-agent-loading">L'agent prépare vos suggestions…</div>`;
    return;
  }

  body.innerHTML = _mmktAgentSuggestions.map((s, idx) => {
    const premierTexte = Object.values(s.textes || {})[0] || "";
    const label = s.appCible === "pro"
      ? (s.boutiquesIds.length ? "Boutiques mises en avant" : "Recrutement vendeurs")
      : `Catégorie : ${s.categories[0] || "—"}`;
    const statusLabel = s.statut === "published" ? "Partagé" : s.statut === "ready" ? "Enregistré" : "À valider";
    const statusClass = s.statut === "published" ? "published" : s.statut === "ready" ? "ready" : "pending";

    return `
      <div class="mmkt-agent-card" data-agent-id="${s.id}">
        <div class="mmkt-agent-card-head">
          <span class="mmkt-agent-card-label">${escMmkt(label)} · ${MMKT_APP_LABELS[s.appCible]}</span>
          <span class="mmkt-agent-card-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="mmkt-agent-card-preview">
          <img class="mmkt-agent-card-img" src="${s.imageDataUrl}" alt="">
          <div class="mmkt-agent-card-text">${escMmkt(premierTexte)}</div>
        </div>
        <div class="mmkt-agent-card-actions">
          <button type="button" class="mmkt-btn mmkt-btn-outline" onclick="mmktAgentOuvrirDansResultat(${idx})">Voir / modifier</button>
          <button type="button" class="mmkt-btn mmkt-btn-outline" onclick="mmktAgentValider(${idx})">✓ Valider</button>
        </div>
        <div class="mmkt-agent-share-row">
          <button type="button" class="mmkt-agent-share-btn" title="WhatsApp" onclick="mmktAgentPartager(${idx},'whatsapp')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </button>
          <button type="button" class="mmkt-agent-share-btn" title="Facebook" onclick="mmktAgentPartager(${idx},'facebook')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </button>
          <button type="button" class="mmkt-agent-share-btn" title="LinkedIn" onclick="mmktAgentPartager(${idx},'linkedin')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
          </button>
        </div>
      </div>`;
  }).join("");
}

/** Ouvre une suggestion de l'agent dans le panneau de résultat classique (voir/modifier/télécharger). */
function mmktAgentOuvrirDansResultat(idx) {
  const s = _mmktAgentSuggestions[idx];
  if (!s) return;

  const resultWrap = document.getElementById("mmkt-result-wrap");
  const texteWrap = document.getElementById("mmkt-result-texte-wrap");
  const imgWrap = document.getElementById("mmkt-result-img-wrap");
  const imgEl = document.getElementById("mmkt-result-img");
  const imgLoading = document.getElementById("mmkt-result-img-loading");
  const copyBtn = document.getElementById("mmkt-copy-texte-btn");
  const dlBtn = document.getElementById("mmkt-download-img-btn");
  const shareRow = document.getElementById("mmkt-share-row");

  resultWrap.style.display = "block";
  texteWrap.style.display = "block";
  copyBtn.style.display = "block";
  renderResultTabs(s.textes);

  imgWrap.style.display = "block";
  imgLoading.style.display = "none";
  imgEl.style.opacity = "1";
  imgEl.src = s.imageDataUrl;
  dlBtn.style.display = "block";
  shareRow.style.display = "block";

  _mmktDernierResultat = { textes: s.textes, imageDataUrl: s.imageDataUrl, produitsUtilises: s.produitsUtilises, appCible: s.appCible };
  _mmktImageUrlStockee = s.imageUrlStockee;

  resultWrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Enregistre la suggestion dans l'historique Supabase (contenus_marketing) sans la republier. */
async function mmktAgentValider(idx) {
  const s = _mmktAgentSuggestions[idx];
  if (!s || s.statut !== "pending") return;

  try {
    await sauvegarderHistorique({
      cible_type: s.appCible === "pro" ? (s.boutiquesIds.length ? "vendeur" : "app") : "categorie",
      cible_label: MMKT_APP_LABELS[s.appCible],
      app_cible: s.appCible,
      plateformes: s.plateformes,
      prompt: "",
      ton: "dynamique",
      texte_genere: Object.values(s.textes)[0] || null,
      textes_par_plateforme: s.textes,
      categories: s.categories,
      boutiques_ids: s.boutiquesIds,
      produits_utilises: s.produitsUtilises,
      mode_image: "canvas",
      couleur_theme: "#F0B429",
      nb_images: s.produitsUtilises?.length || 0,
      image_url: s.imageUrlStockee
    });
    s.statut = "ready";
    mmktAgentRender();
    chargerHistorique();
    showMmktToast("Suggestion enregistrée dans l'historique.", "success");
  } catch (err) {
    showMmktToast("Erreur d'enregistrement : " + err.message, "error");
  }
}

/** Partage direct d'une suggestion (même logique que le bouton partager du wizard : natif puis fallback). */
async function mmktAgentPartager(idx, reseau) {
  const s = _mmktAgentSuggestions[idx];
  if (!s) return;

  // Réutilise tenterPartageNatif/lienPartageParApp en pointant temporairement sur cette suggestion
  const sauveApp = _mmktApp;
  const sauveDernierResultat = _mmktDernierResultat;
  const sauveImageUrlStockee = _mmktImageUrlStockee;

  _mmktApp = s.appCible;
  _mmktDernierResultat = { textes: s.textes, imageDataUrl: s.imageDataUrl };
  _mmktImageUrlStockee = s.imageUrlStockee;

  try {
    await partager(reseau);
    if (s.statut === "pending") {
      await mmktAgentValider(idx);
    }
    s.statut = "published";
    mmktAgentRender();
  } finally {
    _mmktApp = sauveApp;
    _mmktDernierResultat = sauveDernierResultat;
    _mmktImageUrlStockee = sauveImageUrlStockee;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Lancé après le reste de l'init du module (voir listener principal en haut du fichier)
  initAgentMarketing();
});
