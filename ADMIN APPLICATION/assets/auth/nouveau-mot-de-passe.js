"use strict";

/* ─── Afficher / masquer mot de passe ──────────────────────── */
function togglePw(id, btn) {
  const input = document.getElementById(id);
  const isPw = input.type === "password";
  input.type = isPw ? "text" : "password";
  btn.classList.toggle("active", isPw);
}

/* ─── Indicateur de force du mot de passe ───────────────────── */
function computePasswordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return 1;
  if (score <= 3) return 2;
  return 3;
}

function updatePasswordStrength(pw) {
  const level = computePasswordStrength(pw);
  const labels = { 0: "Minimum 8 caractères", 1: "Faible", 2: "Moyen", 3: "Fort" };
  const colors = { 1: "#E0276F", 2: "#F59E0B", 3: "#10B981" };

  for (let i = 1; i <= 3; i++) {
    const bar = document.getElementById(`strength-bar-${i}`);
    bar.style.background = i <= level ? colors[level] : "";
  }

  const label = document.getElementById("strength-label");
  label.textContent = labels[level];
  label.style.color = level ? colors[level] : "";
}

/* ─── Erreurs formulaire ───────────────────────────────────── */
function setErr(id, show, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) el.textContent = msg;
  el.classList.toggle("show", show);
}

/* ─── Loader bouton ────────────────────────────────────────── */
function setLoad(btnId, loadId, icoId, txtId, on) {
  document.getElementById(btnId).disabled = on;
  document.getElementById(loadId).style.display = on ? "inline-block" : "none";
  document.getElementById(icoId).style.display   = on ? "none" : "inline-block";
  document.getElementById(txtId).style.opacity    = on ? "0.5" : "1";
}

function showScreen(id) {
  ["screen-checking", "screen-form", "screen-success", "screen-invalid"].forEach(s => {
    document.getElementById(s).style.display = (s === id) ? "flex" : "none";
  });
}

/* Session temporaire de récupération (jamais stockée dans AURA_AUTH,
   pour ne pas connecter l'utilisateur / écraser une session existante). */
let _recoveryAccessToken = null;

/* ─── Extraction du token depuis l'URL envoyée par Supabase ───
   Supabase place le résultat soit dans le fragment (#access_token=...&type=recovery),
   soit, avec certains flux PKCE, dans le paramètre ?code=... à échanger. */
function extractRecoveryToken() {
  const hash = window.location.hash ? window.location.hash.substring(1) : "";
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);

  const type = hashParams.get("type") || queryParams.get("type");
  const accessToken = hashParams.get("access_token");
  const errorCode = hashParams.get("error") || queryParams.get("error");

  if (errorCode) return { error: hashParams.get("error_description") || errorCode };

  if (accessToken && type === "recovery") {
    return { accessToken };
  }

  return { accessToken: null };
}

/* ─── INIT — Vérifie le lien au chargement ─────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  showScreen("screen-checking");

  const result = extractRecoveryToken();

  if (result.error || !result.accessToken) {
    showScreen("screen-invalid");
    return;
  }

  _recoveryAccessToken = result.accessToken;

  /* Nettoie l'URL pour ne pas laisser le token visible/partageable */
  history.replaceState(null, "", window.location.pathname);

  showScreen("screen-form");

  const pwInput = document.getElementById("new-password");
  pwInput.focus();
  document.getElementById("new-password-confirm").addEventListener("keydown", e => {
    if (e.key === "Enter") handleUpdatePassword();
  });
});

/* ─── MISE À JOUR DU MOT DE PASSE ──────────────────────────── */
async function handleUpdatePassword() {
  const password = document.getElementById("new-password").value;
  const confirm  = document.getElementById("new-password-confirm").value;

  setErr("err-new-pw", false);
  setErr("err-new-confirm", false);

  let ok = true;
  if (password.length < 8)  { setErr("err-new-pw", true, "Minimum 8 caractères"); ok = false; }
  if (password !== confirm) { setErr("err-new-confirm", true, "Les mots de passe ne correspondent pas"); ok = false; }
  if (!ok) return;

  if (!_recoveryAccessToken) {
    showToast("Session de réinitialisation expirée. Redemandez un lien.", "error");
    showScreen("screen-invalid");
    return;
  }

  setLoad("btn-update-pw", "load-update-pw", "btn-update-pw-ico", "btn-update-pw-txt", true);

  try {
    await AURA_AUTH.updatePassword({ password, accessToken: _recoveryAccessToken });
    showToast("Mot de passe mis à jour !", "success");
    showScreen("screen-success");
  } catch (err) {
    showToast(err.message || "Erreur lors de la mise à jour", "error");
    if ((err.message || "").toLowerCase().includes("expiré") || (err.message || "").toLowerCase().includes("invalid")) {
      showScreen("screen-invalid");
    }
  } finally {
    setLoad("btn-update-pw", "load-update-pw", "btn-update-pw-ico", "btn-update-pw-txt", false);
  }
}
