"use strict";

let _adminId = null;
let _perso = null;

let _couleurSelectionnee = "#FFFFFF";
let _couleur2Selectionnee = "#A855F7";
let _fondSelectionne = "anthracite";
let _fondCustomHex = "#0F0F0F";
let _policeSelectionnee = "Inter";
let _rayonSelectionne = "moyen";
let _tailleSelectionnee = "normale";
let _borderwSelectionnee = "fine";
let _densiteSelectionnee = "confortable";
let _styleVisuelSelectionne = "opaque";
let _intensiteVerreSelectionnee = "moyen";

const DEFAULTS = {
  couleur_primaire: "#FFFFFF",
  couleur_secondaire: "#A855F7",
  couleur_fond: "anthracite",
  police: "Inter",
  rayon_bordure: "moyen",
  taille_police: "normale",
  epaisseur_bordure: "fine",
  densite: "confortable",
  style_visuel: "opaque",
  intensite_verre: "moyen"
};

const FONDS_VALIDES = ["anthracite", "oled", "gris_nuit", "bleu_nuit"];
const TAILLES_VALIDES = ["petite", "normale", "grande"];
const BORDERW_VALIDES = ["fine", "moyenne", "epaisse"];
const DENSITE_VALIDES = ["compact", "confortable", "spacieux"];
const STYLE_VISUEL_VALIDES = ["opaque", "verre"];
const INTENSITE_VERRE_VALIDES = ["discret", "moyen", "marque"];

const RAYON_PX = { carre: "2px", moyen: "8px", arrondi: "16px" };
const BORDERW_PX = { fine: "1px", moyenne: "1.5px", epaisse: "2.5px" };
const TAILLE_PX = { petite: "12px", normale: "14px", grande: "16px" };

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof AURA_AUTH === "undefined" || !AURA_AUTH.requireAuth()) return;
  const user = AURA_AUTH.getUser();
  _adminId = user?.id || null;
  if (!_adminId) { window.location.href = "../../index.html"; return; }

  // Pas de blocage premium côté admin : le module est toujours accessible.
  document.getElementById("mperso-content").style.display = "block";

  await loadPerso();
  bindEvents();
});

async function loadPerso() {
  try {
    const rows = await API.get(`${AURA_CONFIG.endpoints.personnalisation}?admin_id=eq.${_adminId}&select=*`);
    _perso = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (_) { _perso = null; }

  if (!_perso) _perso = { ...DEFAULTS };

  _couleurSelectionnee = _perso.couleur_primaire || DEFAULTS.couleur_primaire;
  _fondSelectionne = FONDS_VALIDES.includes(_perso.couleur_fond) ? _perso.couleur_fond
    : (String(_perso.couleur_fond || "").startsWith("#") ? "custom" : DEFAULTS.couleur_fond);
  _fondCustomHex = String(_perso.couleur_fond || "").startsWith("#") ? _perso.couleur_fond : "#0F0F0F";
  _policeSelectionnee = _perso.police || DEFAULTS.police;
  _rayonSelectionne = _perso.rayon_bordure || DEFAULTS.rayon_bordure;

  // Champs 100% locaux : jamais lus depuis Supabase, uniquement depuis le cache local du navigateur.
  const local = (typeof AURA_THEME !== "undefined") ? AURA_THEME.getCurrent() : {};
  _couleur2Selectionnee = local.couleur_secondaire || DEFAULTS.couleur_secondaire;
  _tailleSelectionnee = TAILLES_VALIDES.includes(local.taille_police) ? local.taille_police : DEFAULTS.taille_police;
  _borderwSelectionnee = BORDERW_VALIDES.includes(local.epaisseur_bordure) ? local.epaisseur_bordure : DEFAULTS.epaisseur_bordure;
  _densiteSelectionnee = DENSITE_VALIDES.includes(local.densite) ? local.densite : DEFAULTS.densite;
  _styleVisuelSelectionne = STYLE_VISUEL_VALIDES.includes(local.style_visuel) ? local.style_visuel : DEFAULTS.style_visuel;
  _intensiteVerreSelectionnee = INTENSITE_VERRE_VALIDES.includes(local.intensite_verre) ? local.intensite_verre : DEFAULTS.intensite_verre;

  document.getElementById("mperso-color-custom-input").value = _couleurSelectionnee;
  document.getElementById("mperso-color2-custom-input").value = _couleur2Selectionnee;
  document.getElementById("mperso-bg-custom-input").value = _fondCustomHex;

  if (typeof AURA_THEME !== "undefined") AURA_THEME.commit({ ..._perso, ...local });

  refreshAll();
}

function refreshAll() {
  refreshColors();
  refreshColors2();
  refreshBg();
  refreshFonts();
  refreshRadius();
  refreshFontSize();
  refreshBorderWidth();
  refreshDensity();
  refreshStyleVisuel();
  refreshPreview();
}

function refreshColors() {
  document.querySelectorAll(".mperso-color-dot[data-color]").forEach(dot => {
    dot.classList.toggle("active", dot.dataset.color.toLowerCase() === _couleurSelectionnee.toLowerCase());
  });
  document.getElementById("mperso-color-custom-swatch").style.background = _couleurSelectionnee;
  document.getElementById("mperso-color-custom-hex").textContent = _couleurSelectionnee.toUpperCase();
}

function refreshColors2() {
  document.querySelectorAll(".mperso-color-dot[data-color2]").forEach(dot => {
    dot.classList.toggle("active", dot.dataset.color2.toLowerCase() === _couleur2Selectionnee.toLowerCase());
  });
  document.getElementById("mperso-color2-custom-swatch").style.background = _couleur2Selectionnee;
  document.getElementById("mperso-color2-custom-hex").textContent = _couleur2Selectionnee.toUpperCase();
}

function refreshFonts() {
  const select = document.getElementById("mperso-font-select");
  if (select) select.value = _policeSelectionnee;
  const preview = document.getElementById("mperso-font-preview");
  if (preview) {
    preview.style.fontFamily = `'${_policeSelectionnee}', sans-serif`;
    preview.textContent = _policeSelectionnee;
  }
}

function refreshBg() {
  document.querySelectorAll(".mperso-bg-card").forEach(card => {
    card.classList.toggle("active", card.dataset.bg === _fondSelectionne);
  });
  const wrap = document.querySelector('label[for="mperso-bg-custom-input"]');
  const swatch = document.getElementById("mperso-bg-custom-swatch");
  const hexLabel = document.getElementById("mperso-bg-custom-hex");
  if (wrap) wrap.classList.toggle("active", _fondSelectionne === "custom");
  if (swatch) swatch.style.background = _fondCustomHex;
  if (hexLabel) hexLabel.textContent = _fondSelectionne === "custom" ? _fondCustomHex.toUpperCase() : "Choisir ma propre couleur de fond";
}

function refreshRadius() {
  document.querySelectorAll(".mperso-radius-card[data-radius]").forEach(card => {
    card.classList.toggle("active", card.dataset.radius === _rayonSelectionne);
  });
}

function refreshFontSize() {
  document.querySelectorAll(".mperso-radius-card[data-fontsize]").forEach(card => {
    card.classList.toggle("active", card.dataset.fontsize === _tailleSelectionnee);
  });
}

function refreshBorderWidth() {
  document.querySelectorAll(".mperso-radius-card[data-borderw]").forEach(card => {
    card.classList.toggle("active", card.dataset.borderw === _borderwSelectionnee);
  });
}

function refreshDensity() {
  document.querySelectorAll(".mperso-radius-card[data-densite]").forEach(card => {
    card.classList.toggle("active", card.dataset.densite === _densiteSelectionnee);
  });
}

function refreshStyleVisuel() {
  document.querySelectorAll(".mperso-bg-card[data-style]").forEach(card => {
    card.classList.toggle("active", card.dataset.style === _styleVisuelSelectionne);
  });
  const estVerre = _styleVisuelSelectionne === "verre";
  document.getElementById("mperso-glass-intensity-title").style.display = estVerre ? "block" : "none";
  document.getElementById("mperso-glass-intensity-desc").style.display = estVerre ? "block" : "none";
  document.getElementById("mperso-glass-intensity-row").style.display = estVerre ? "flex" : "none";
  document.querySelectorAll(".mperso-radius-card[data-glass]").forEach(card => {
    card.classList.toggle("active", card.dataset.glass === _intensiteVerreSelectionnee);
  });
}

function refreshPreview() {
  const card = document.getElementById("mperso-preview-card");
  const btn = document.getElementById("mperso-preview-btn");
  const badge = document.getElementById("mperso-preview-badge");
  const title = document.getElementById("mperso-preview-title");
  const radiusPx = RAYON_PX[_rayonSelectionne] || RAYON_PX.moyen;
  const borderPx = BORDERW_PX[_borderwSelectionnee] || BORDERW_PX.fine;
  const baseFontPx = TAILLE_PX[_tailleSelectionnee] || TAILLE_PX.normale;

  card.style.fontFamily = `'${_policeSelectionnee}', sans-serif`;
  card.style.background = fondSwatch(_fondSelectionne);
  card.style.borderRadius = radiusPx;
  card.style.fontSize = baseFontPx;

  title.style.color = _couleurSelectionnee;

  btn.style.background = "transparent";
  btn.style.color = _couleurSelectionnee;
  btn.style.borderRadius = radiusPx;
  btn.style.border = `${borderPx} solid ${_couleurSelectionnee}`;

  badge.style.background = "transparent";
  badge.style.border = `${borderPx} solid ${_couleur2Selectionnee}`;
  badge.style.color = _couleur2Selectionnee;
  badge.style.borderRadius = radiusPx;

  if (typeof AURA_THEME !== "undefined") {
    AURA_THEME.preview({
      couleur_primaire: _couleurSelectionnee,
      couleur_secondaire: _couleur2Selectionnee,
      couleur_fond: _fondSelectionne === "custom" ? _fondCustomHex : _fondSelectionne,
      police: _policeSelectionnee,
      rayon_bordure: _rayonSelectionne,
      taille_police: _tailleSelectionnee,
      epaisseur_bordure: _borderwSelectionnee,
      densite: _densiteSelectionnee,
      style_visuel: _styleVisuelSelectionne,
      intensite_verre: _intensiteVerreSelectionnee
    });
  }
}

function fondSwatch(key) {
  if (key === "custom") return _fondCustomHex;
  if (typeof AURA_THEME === "undefined") return "rgba(255,255,255,.05)";
  const preset = AURA_THEME.getBgPresets().find(p => p.key === key);
  return preset ? preset.swatchB : "rgba(255,255,255,.05)";
}

function bindEvents() {
  document.querySelectorAll(".mperso-color-dot[data-color]").forEach(dot => {
    dot.addEventListener("click", () => {
      _couleurSelectionnee = dot.dataset.color;
      document.getElementById("mperso-color-custom-input").value = _couleurSelectionnee;
      refreshColors();
      refreshPreview();
    });
  });

  document.getElementById("mperso-color-custom-input").addEventListener("input", e => {
    _couleurSelectionnee = e.target.value;
    refreshColors();
    refreshPreview();
  });

  document.querySelectorAll(".mperso-color-dot[data-color2]").forEach(dot => {
    dot.addEventListener("click", () => {
      _couleur2Selectionnee = dot.dataset.color2;
      document.getElementById("mperso-color2-custom-input").value = _couleur2Selectionnee;
      refreshColors2();
      refreshPreview();
    });
  });

  document.getElementById("mperso-color2-custom-input").addEventListener("input", e => {
    _couleur2Selectionnee = e.target.value;
    refreshColors2();
    refreshPreview();
  });

  document.querySelectorAll(".mperso-bg-card").forEach(card => {
    card.addEventListener("click", () => {
      _fondSelectionne = card.dataset.bg;
      refreshBg();
      refreshPreview();
    });
  });

  document.getElementById("mperso-bg-custom-input").addEventListener("input", e => {
    _fondCustomHex = e.target.value;
    _fondSelectionne = "custom";
    refreshBg();
    refreshPreview();
  });

  document.getElementById("mperso-font-select").addEventListener("change", e => {
    _policeSelectionnee = e.target.value;
    refreshFonts();
    refreshPreview();
  });

  document.querySelectorAll(".mperso-radius-card[data-radius]").forEach(card => {
    card.addEventListener("click", () => {
      _rayonSelectionne = card.dataset.radius;
      refreshRadius();
      refreshPreview();
    });
  });

  document.querySelectorAll(".mperso-radius-card[data-fontsize]").forEach(card => {
    card.addEventListener("click", () => {
      _tailleSelectionnee = card.dataset.fontsize;
      refreshFontSize();
      refreshPreview();
    });
  });

  document.querySelectorAll(".mperso-radius-card[data-borderw]").forEach(card => {
    card.addEventListener("click", () => {
      _borderwSelectionnee = card.dataset.borderw;
      refreshBorderWidth();
      refreshPreview();
    });
  });

  document.querySelectorAll(".mperso-radius-card[data-densite]").forEach(card => {
    card.addEventListener("click", () => {
      _densiteSelectionnee = card.dataset.densite;
      refreshDensity();
      refreshPreview();
    });
  });

  document.querySelectorAll(".mperso-bg-card[data-style]").forEach(card => {
    card.addEventListener("click", () => {
      _styleVisuelSelectionne = card.dataset.style;
      refreshStyleVisuel();
      refreshPreview();
    });
  });

  document.querySelectorAll(".mperso-radius-card[data-glass]").forEach(card => {
    card.addEventListener("click", () => {
      _intensiteVerreSelectionnee = card.dataset.glass;
      refreshStyleVisuel();
      refreshPreview();
    });
  });

  document.getElementById("mperso-save-btn").addEventListener("click", enregistrer);
  document.getElementById("mperso-reset-btn").addEventListener("click", reinitialiser);
}

async function enregistrer() {
  const btn = document.getElementById("mperso-save-btn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Enregistrement…";

  // Seuls ces 4 champs existent dans la table Supabase : on n'envoie qu'eux.
  const payloadServeur = {
    admin_id: _adminId,
    couleur_primaire: _couleurSelectionnee,
    couleur_fond: _fondSelectionne === "custom" ? _fondCustomHex : _fondSelectionne,
    police: _policeSelectionnee,
    rayon_bordure: _rayonSelectionne
  };

  // Ces champs restent uniquement en local (jamais envoyés à Supabase).
  const payloadLocal = {
    couleur_secondaire: _couleur2Selectionnee,
    taille_police: _tailleSelectionnee,
    epaisseur_bordure: _borderwSelectionnee,
    densite: _densiteSelectionnee,
    style_visuel: _styleVisuelSelectionne,
    intensite_verre: _intensiteVerreSelectionnee
  };

  try {
    await API.post(`${AURA_CONFIG.endpoints.personnalisation}?on_conflict=admin_id`, payloadServeur, {
      headers: { Prefer: "resolution=merge-duplicates" }
    });

    if (typeof AURA_THEME !== "undefined") AURA_THEME.commit({ ...payloadServeur, ...payloadLocal });

    showToast("Personnalisation appliquée sur tout le dashboard.", "success");
  } catch (err) {
    showToast(err.message || "Erreur lors de l'enregistrement", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function reinitialiser() {
  _couleurSelectionnee = DEFAULTS.couleur_primaire;
  _couleur2Selectionnee = DEFAULTS.couleur_secondaire;
  _fondSelectionne = DEFAULTS.couleur_fond;
  _fondCustomHex = "#0F0F0F";
  _policeSelectionnee = DEFAULTS.police;
  _rayonSelectionne = DEFAULTS.rayon_bordure;
  _tailleSelectionnee = DEFAULTS.taille_police;
  _borderwSelectionnee = DEFAULTS.epaisseur_bordure;
  _densiteSelectionnee = DEFAULTS.densite;
  _styleVisuelSelectionne = DEFAULTS.style_visuel;
  _intensiteVerreSelectionnee = DEFAULTS.intensite_verre;

  document.getElementById("mperso-color-custom-input").value = _couleurSelectionnee;
  document.getElementById("mperso-color2-custom-input").value = _couleur2Selectionnee;
  document.getElementById("mperso-bg-custom-input").value = _fondCustomHex;

  if (typeof AURA_THEME !== "undefined") AURA_THEME.reset();

  refreshAll();
  showToast("Réglages réinitialisés. Cliquez sur Enregistrer pour confirmer.", "info");
}
