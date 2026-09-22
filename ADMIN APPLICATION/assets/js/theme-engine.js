"use strict";

/* ============================================================
   AURA THEME ENGINE — Application admin
   Applique de façon globale, instantanée et sans rechargement
   les réglages de personnalisation (couleur, police, rayons)
   sur TOUTES les pages du dashboard admin.

   Chargé en tout premier dans le <head> de chaque page.
   Ne dépend d'aucun autre script pour l'application anti-flash
   (fonctionne même si config.js / auth.js ne sont pas encore chargés).

   Portage du theme-engine.js vendeur : même moteur, mais sans
   condition de pack Premium (l'admin y a toujours accès) et avec
   des clés localStorage et un vendeur_id → admin_id dédiés pour ne
   jamais entrer en collision avec le thème vendeur.
   ============================================================ */

const AURA_THEME = (() => {

  const STORAGE_KEY = "aura_admin_theme_v1";
  const LOCAL_ONLY_STORAGE_KEY = "aura_admin_theme_local_v1";

  /* Ces champs sont gérés uniquement en local (localStorage), jamais envoyés
     ni lus depuis Supabase. Ils sont fusionnés avec le thème serveur au moment
     de l'application, mais totalement indépendants de la synchro base de données. */
  const LOCAL_ONLY_FIELDS = ["couleur_secondaire", "taille_police", "epaisseur_bordure", "densite", "style_visuel", "intensite_verre"];

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

  /* Variantes du thème sombre. Chaque préréglage couvre tous les alias
     de fond utilisés dans les différents modules (--bg, --surface,
     --white, --bg-card, --border, --text-secondary, --text-muted).
     Volontairement limité à des tons sombres testés pour le contraste :
     le texte de l'app reste blanc partout, donc pas de thème clair. */
  const BG_PRESETS = {
    anthracite: {
      label: "Anthracite", swatchA: "#0F0F0F", swatchB: "#181818",
      vars: { bg: "#0F0F0F", surface: "#181818", white: "#181818", "bg-card": "#181818",
              border: "#303030", "text-secondary": "#AAAAAA", "text-muted": "#717171",
              "bg-overlay": "rgba(0,0,0,.7)" }
    },
    oled: {
      label: "Noir OLED", swatchA: "#000000", swatchB: "#121212",
      vars: { bg: "#000000", surface: "#121212", white: "#121212", "bg-card": "#121212",
              border: "#262626", "text-secondary": "#A8A8A8", "text-muted": "#6B6B6B",
              "bg-overlay": "rgba(0,0,0,.75)" }
    },
    gris_nuit: {
      label: "Gris nuit", swatchA: "#16181D", swatchB: "#1E2128",
      vars: { bg: "#16181D", surface: "#1E2128", white: "#1E2128", "bg-card": "#1E2128",
              border: "#33363F", "text-secondary": "#AFB3BD", "text-muted": "#757A87",
              "bg-overlay": "rgba(10,11,14,.7)" }
    },
    bleu_nuit: {
      label: "Bleu nuit", swatchA: "#0A0E1A", swatchB: "#131B2E",
      vars: { bg: "#0A0E1A", surface: "#131B2E", white: "#131B2E", "bg-card": "#131B2E",
              border: "#263252", "text-secondary": "#A9B4CC", "text-muted": "#6D7797",
              "bg-overlay": "rgba(5,7,14,.7)" }
    }
  };

  const FONT_STACKS = {
    "Inter":            "'Inter', system-ui, sans-serif",
    "Poppins":          "'Poppins', system-ui, sans-serif",
    "Manrope":          "'Manrope', system-ui, sans-serif",
    "Sora":             "'Sora', system-ui, sans-serif",
    "Space Grotesk":    "'Space Grotesk', system-ui, sans-serif",
    "Roboto":           "'Roboto', system-ui, sans-serif",
    "Nunito":           "'Nunito', system-ui, sans-serif",
    "Work Sans":        "'Work Sans', system-ui, sans-serif",
    "DM Sans":          "'DM Sans', system-ui, sans-serif",
    "Outfit":           "'Outfit', system-ui, sans-serif",
    "Plus Jakarta Sans":"'Plus Jakarta Sans', system-ui, sans-serif",
    "Lexend":           "'Lexend', system-ui, sans-serif",
    "Urbanist":         "'Urbanist', system-ui, sans-serif",
    "Montserrat":       "'Montserrat', system-ui, sans-serif",
    "Playfair Display": "'Playfair Display', serif",
    "Merriweather":     "'Merriweather', serif",
    "JetBrains Mono":   "'JetBrains Mono', monospace"
  };

  const GOOGLE_FONT_URL =
    "https://fonts.googleapis.com/css2?" +
    "family=Inter:wght@400;500;600;700;800" +
    "&family=Poppins:wght@400;600;700;800" +
    "&family=Manrope:wght@400;600;700;800" +
    "&family=Sora:wght@400;600;700;800" +
    "&family=Space+Grotesk:wght@400;600;700;800" +
    "&family=Roboto:wght@400;500;700;800" +
    "&family=Nunito:wght@400;600;700;800" +
    "&family=Work+Sans:wght@400;500;600;700;800" +
    "&family=DM+Sans:wght@400;500;700;800" +
    "&family=Outfit:wght@400;500;600;700;800" +
    "&family=Plus+Jakarta+Sans:wght@400;500;600;700;800" +
    "&family=Lexend:wght@400;500;600;700;800" +
    "&family=Urbanist:wght@400;500;600;700;800" +
    "&family=Montserrat:wght@400;500;600;700;800" +
    "&family=Playfair+Display:wght@400;600;700;800" +
    "&family=Merriweather:wght@400;700;900" +
    "&family=JetBrains+Mono:wght@400;500;700&display=swap";

  /* Chaque style couvre tous les alias de rayon utilisés dans les
     différents modules (--radius, --radius-sm, --radius-md, --radius-lg, --radius-xs) */
  const RADIUS_PRESETS = {
    carre:   { radius: "2px",  "radius-sm": "2px",  "radius-md": "2px",  "radius-lg": "2px",  "radius-xs": "2px"  },
    moyen:   { radius: "8px",  "radius-sm": "6px",  "radius-md": "12px", "radius-lg": "16px", "radius-xs": "4px"  },
    arrondi: { radius: "16px", "radius-sm": "12px", "radius-md": "20px", "radius-lg": "28px", "radius-xs": "10px" }
  };

  /* Échelle de taille de police globale, appliquée via un multiplicateur
     sur la taille racine (rem). Tous les textes du dashboard sont en em/rem
     donc l'échelle se propage automatiquement partout. */
  const FONT_SCALE_PRESETS = {
    petite:  "93.75%",
    normale: "100%",
    grande:  "108%"
  };

  /* Épaisseur des bordures utilisées dans tous les modules (--border-w) */
  const BORDER_WIDTH_PRESETS = {
    fine:    "1px",
    moyenne: "1.5px",
    epaisse: "2.5px"
  };

  /* Densité : contrôle les espacements verticaux/horizontaux génériques
     (--space-unit, utilisé comme base par les modules qui le référencent,
     et --density-scale pour les paddings existants en em) */
  const DENSITY_PRESETS = {
    compact:     { "space-unit": "6px",  "density-scale": "0.85" },
    confortable: { "space-unit": "8px",  "density-scale": "1" },
    spacieux:    { "space-unit": "11px", "density-scale": "1.15" }
  };

  /* Intensité de l'effet verre (glassmorphism). Contrôle le flou de fond
     et la transparence des cartes quand le style visuel "verre" est actif. */
  const GLASS_INTENSITY_PRESETS = {
    discret: { blur: "14px", cardAlpha: 0.55, borderAlpha: 0.18 },
    moyen:   { blur: "22px", cardAlpha: 0.42, borderAlpha: 0.24 },
    marque:  { blur: "32px", cardAlpha: 0.28, borderAlpha: 0.32 }
  };

  let _adminId = null;
  let _fontLinkInjected = false;

  /* ── Utilitaires couleur ── */
  function hexToRgb(hex) {
    let c = String(hex || "#FFFFFF").replace("#", "").trim();
    if (c.length === 3) c = c.split("").map(ch => ch + ch).join("");
    if (c.length !== 6) c = "FFFFFF";
    const num = parseInt(c, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  function toHex(n) { return clamp(n).toString(16).padStart(2, "0"); }

  // percent > 0 = éclaircit vers le blanc, percent < 0 = assombrit vers le noir
  function shade(hex, percent) {
    const { r, g, b } = hexToRgb(hex);
    const target = percent > 0 ? 255 : 0;
    const ratio = Math.abs(percent) / 100;
    const nr = r + (target - r) * ratio;
    const ng = g + (target - g) * ratio;
    const nb = b + (target - b) * ratio;
    return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
  }
  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function isLight(hex) {
    const { r, g, b } = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
  }

  /* Génère un jeu de variables de fond cohérent à partir d'une seule couleur
     de base choisie par l'utilisateur (toujours assombrie pour rester lisible
     avec du texte blanc, même si la couleur choisie est claire/vive). */
  function buildCustomBg(hex) {
    const base = shade(hex, -78); // on ramène toute couleur vers un ton très sombre
    const surface = shade(base, 10);
    return {
      label: "Personnalisé", swatchA: base, swatchB: surface,
      vars: {
        bg: base, surface: surface, white: surface, "bg-card": surface,
        border: shade(surface, 25),
        "text-secondary": "#B7B7B7",
        "text-muted": "#818181",
        "bg-overlay": "rgba(0,0,0,.72)"
      }
    };
  }

  /* ── Application des variables CSS sur toute la page ── */
  function applyVars(theme) {
    const t = { ...DEFAULTS, ...(theme || {}) };
    const root = document.documentElement.style;
    const primary = t.couleur_primaire || DEFAULTS.couleur_primaire;
    const secondary = t.couleur_secondaire || DEFAULTS.couleur_secondaire;
    const radiusSet = RADIUS_PRESETS[t.rayon_bordure] || RADIUS_PRESETS.moyen;
    const bgSet = String(t.couleur_fond || "").startsWith("#")
      ? buildCustomBg(t.couleur_fond)
      : (BG_PRESETS[t.couleur_fond] || BG_PRESETS.anthracite);
    const styleVisuel = t.style_visuel === "verre" ? "verre" : "opaque";
    const glassSet = GLASS_INTENSITY_PRESETS[t.intensite_verre] || GLASS_INTENSITY_PRESETS.moyen;
    const fontStack = FONT_STACKS[t.police] || FONT_STACKS.Inter;
    const fontScale = FONT_SCALE_PRESETS[t.taille_police] || FONT_SCALE_PRESETS.normale;
    const borderW = BORDER_WIDTH_PRESETS[t.epaisseur_bordure] || BORDER_WIDTH_PRESETS.fine;
    const densitySet = DENSITY_PRESETS[t.densite] || DENSITY_PRESETS.confortable;

    root.setProperty("--primary", primary);
    root.setProperty("--primary-dark", shade(primary, -20));
    root.setProperty("--primary-light", rgba(primary, 0.12));
    root.setProperty("--primary-soft", rgba(primary, 0.25));
    root.setProperty("--primary-contrast", isLight(primary) ? "#0F0F0F" : "#FFFFFF");

    root.setProperty("--secondary", secondary);
    root.setProperty("--secondary-dark", shade(secondary, -20));
    root.setProperty("--secondary-light", rgba(secondary, 0.12));
    root.setProperty("--secondary-soft", rgba(secondary, 0.25));
    root.setProperty("--secondary-contrast", isLight(secondary) ? "#0F0F0F" : "#FFFFFF");

    Object.keys(radiusSet).forEach(key => root.setProperty(`--${key}`, radiusSet[key]));
    Object.keys(bgSet.vars).forEach(key => root.setProperty(`--${key}`, bgSet.vars[key]));
    Object.keys(densitySet).forEach(key => root.setProperty(`--${key}`, densitySet[key]));

    root.setProperty("--font", fontStack);
    root.setProperty("--border-w", borderW);
    if (document.documentElement) document.documentElement.style.fontSize = fontScale;
    if (document.body) document.body.style.fontFamily = fontStack;

    applyGlassMode(styleVisuel, glassSet, bgSet);

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.setAttribute("content", bgSet.vars.bg);

    injectFont();
  }

  /* ── Mode "Verre" (glassmorphism façon iOS) ──
     Rend les cartes translucides + flou d'arrière-plan, et pose un
     dégradé animé en fond de page visible à travers les cartes.
     Retire proprement l'effet dès que le style repasse en "opaque"
     (les variables --bg-card/--white/--border sont déjà réécrites en
     amont par applyVars avec leurs valeurs opaques normales). */
  let _glassStyleInjected = false;
  function applyGlassMode(styleVisuel, glassSet, bgSet) {
    const root = document.documentElement;
    const isGlass = styleVisuel === "verre";
    root.classList.toggle("aura-glass", isGlass);
    if (!isGlass) return;

    const cardBase = bgSet.vars["bg-card"] || bgSet.vars.surface || "#181818";
    const borderBase = bgSet.vars.border || "#303030";

    root.style.setProperty("--bg-card", rgba(cardBase, glassSet.cardAlpha));
    root.style.setProperty("--white", rgba(cardBase, glassSet.cardAlpha));
    root.style.setProperty("--border", rgba(shade(borderBase, 45), glassSet.borderAlpha));
    root.style.setProperty("--glass-blur", glassSet.blur);
    root.style.setProperty("--glass-highlight", "rgba(255,255,255,.10)");

    injectGlassStyle();
  }

  function injectGlassStyle() {
    if (_glassStyleInjected || document.getElementById("aura-glass-style")) { _glassStyleInjected = true; return; }
    const style = document.createElement("style");
    style.id = "aura-glass-style";
    style.textContent = `
      html.aura-glass body{ position:relative; }
      html.aura-glass body::before{
        content:""; position:fixed; inset:-10%; z-index:-1;
        background:
          radial-gradient(circle at 15% 20%, var(--primary) 0%, transparent 45%),
          radial-gradient(circle at 85% 15%, var(--secondary) 0%, transparent 45%),
          radial-gradient(circle at 30% 85%, var(--secondary) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, var(--primary) 0%, transparent 50%),
          var(--bg);
        background-blend-mode: screen;
        filter: saturate(1.3) blur(60px);
        opacity:.55;
        animation: auraGlassDrift 22s ease-in-out infinite alternate;
      }
      @keyframes auraGlassDrift{
        0%{ transform: translate3d(0,0,0) scale(1); }
        50%{ transform: translate3d(-2%,2%,0) scale(1.08); }
        100%{ transform: translate3d(2%,-3%,0) scale(1.04); }
      }
      html.aura-glass [class*="-card"],
      html.aura-glass [class*="-topbar"],
      html.aura-glass [class*="-modal"],
      html.aura-glass [class*="-sheet"],
      html.aura-glass [class*="-panel"],
      html.aura-glass [class*="-preview"]{
        backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
        -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
        border-color: var(--border) !important;
        box-shadow: inset 0 1px 0 var(--glass-highlight), 0 8px 32px rgba(0,0,0,.35);
      }
    `;
    document.head.appendChild(style);
    _glassStyleInjected = true;
  }

  function injectFont() {
    if (_fontLinkInjected || document.getElementById("aura-theme-fonts")) { _fontLinkInjected = true; return; }
    const link = document.createElement("link");
    link.id = "aura-theme-fonts";
    link.rel = "stylesheet";
    link.href = GOOGLE_FONT_URL;
    document.head.appendChild(link);
    _fontLinkInjected = true;
  }

  /* ── Cache local anti-flash ── */
  function readCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function writeCache(theme) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)); } catch (_) {}
  }
  function clearCache() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  /* ── Stockage 100% local des champs qui ne touchent jamais Supabase ── */
  function readLocalOnly() {
    try {
      const raw = localStorage.getItem(LOCAL_ONLY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }
  function writeLocalOnly(partial) {
    try {
      const current = readLocalOnly();
      localStorage.setItem(LOCAL_ONLY_STORAGE_KEY, JSON.stringify({ ...current, ...partial }));
    } catch (_) {}
  }
  function clearLocalOnly() {
    try { localStorage.removeItem(LOCAL_ONLY_STORAGE_KEY); } catch (_) {}
  }

  /* ── Synchronisation serveur (Supabase, source de vérité) ── */
  async function fetchRemote(adminId) {
    if (!adminId || typeof API === "undefined" || typeof AURA_CONFIG === "undefined") return null;
    try {
      const rows = await API.get(
        `${AURA_CONFIG.endpoints.personnalisation}?admin_id=eq.${adminId}&select=couleur_primaire,couleur_fond,police,rayon_bordure`
      );
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    } catch (_) { return null; }
  }

  /* ── API publique ── */

  // Étape 1 : application immédiate depuis le cache local (zéro flash visuel).
  // Doit être appelée en tout premier, en synchrone, dès que le script se charge.
  function bootstrap() {
    applyVars({ ...(readCache() || DEFAULTS), ...readLocalOnly() });
  }

  // Étape 2 : une fois l'utilisateur authentifié, on resynchronise avec le serveur.
  async function init() {
    try {
      if (typeof AURA_AUTH !== "undefined" && AURA_AUTH.getUser) {
        const user = AURA_AUTH.getUser();
        _adminId = user?.id || null;
      }
    } catch (_) { _adminId = null; }

    if (!_adminId) return;

    const remote = await fetchRemote(_adminId);
    if (remote) {
      applyVars({ ...remote, ...readLocalOnly() });
      writeCache(remote);
    }
  }

  // Aperçu en direct (utilisé pendant que l'utilisateur ajuste les curseurs,
  // avant d'enregistrer). N'écrit pas dans le cache définitif.
  function preview(partialTheme) {
    const current = { ...(readCache() || DEFAULTS), ...readLocalOnly() };
    applyVars({ ...current, ...partialTheme });
  }

  // Enregistrement définitif : propage instantanément sur la page courante
  // et met en cache pour que toutes les autres pages en profitent immédiatement.
  // Sépare automatiquement les champs "serveur" (Supabase) des champs "local uniquement".
  function commit(theme) {
    const serverPart = {};
    const localPart = {};
    Object.keys(theme || {}).forEach(key => {
      if (LOCAL_ONLY_FIELDS.includes(key)) localPart[key] = theme[key];
      else serverPart[key] = theme[key];
    });
    writeCache({ ...(readCache() || DEFAULTS), ...serverPart });
    writeLocalOnly(localPart);
    applyVars({ ...(readCache() || DEFAULTS), ...readLocalOnly() });
  }

  // Réinitialisation instantanée (locale). L'utilisateur doit encore cliquer
  // sur "Enregistrer" pour la propager définitivement côté serveur.
  function reset() {
    clearCache();
    clearLocalOnly();
    applyVars(DEFAULTS);
    return { ...DEFAULTS };
  }

  function getDefaults() { return { ...DEFAULTS }; }
  function getCurrent() { return { ...(readCache() || DEFAULTS), ...readLocalOnly() }; }
  function getBgPresets() {
    return Object.keys(BG_PRESETS).map(key => ({ key, ...BG_PRESETS[key] }));
  }
  function getFontStacks() { return { ...FONT_STACKS }; }
  function getFontScalePresets() { return { ...FONT_SCALE_PRESETS }; }
  function getBorderWidthPresets() { return { ...BORDER_WIDTH_PRESETS }; }
  function getDensityPresets() { return { ...DENSITY_PRESETS }; }
  function getGlassIntensityPresets() { return { ...GLASS_INTENSITY_PRESETS }; }

  return {
    bootstrap, init, preview, commit, reset, getDefaults, getCurrent, getBgPresets,
    getFontStacks, getFontScalePresets, getBorderWidthPresets, getDensityPresets,
    getGlassIntensityPresets
  };
})();

// Application immédiate anti-flash (aucune attente du DOM nécessaire)
AURA_THEME.bootstrap();

// Synchronisation avec le serveur dès que le DOM (et l'auth) sont prêts
document.addEventListener("DOMContentLoaded", () => { AURA_THEME.init(); });
