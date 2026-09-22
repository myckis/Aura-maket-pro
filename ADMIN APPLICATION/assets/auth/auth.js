"use strict";

/* ─── Si déjà connecté, on saute direct au dashboard ───────── */
if (AURA_AUTH.isLoggedIn()) {
  window.location.href = "dashboard.html";
}

/* ─── Bascule Connexion / Inscription ──────────────────────── */
function switchAuthTab(tab) {
  const login = tab === "login";
  document.getElementById("tab-login").classList.toggle("active", login);
  document.getElementById("tab-register").classList.toggle("active", !login);
  document.getElementById("form-login").style.display    = login ? "flex" : "none";
  document.getElementById("form-register").style.display = login ? "none" : "flex";
}

/* ─── Afficher / masquer mot de passe ──────────────────────── */
function togglePw(id, btn) {
  const input = document.getElementById(id);
  const isPw = input.type === "password";
  input.type = isPw ? "text" : "password";
  btn.classList.toggle("active", isPw);
}

/* ─── Etat de chargement bouton ─────────────────────────────── */
function setLoad(btnId, loadId, icoId, txtId, loading) {
  document.getElementById(btnId).disabled = loading;
  document.getElementById(loadId).style.display = loading ? "inline-block" : "none";
  document.getElementById(icoId).style.display   = loading ? "none" : "inline-block";
  document.getElementById(txtId).style.opacity    = loading ? "0.5" : "1";
}

function clearErrs(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.classList.remove("show"); }
  });
}

function setErr(id, show, message = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("show", show);
}

/* ─── Validation numéro format ivoirien strict ─────────────── */
function isValidIvorianPhone(raw) {
  const digits = raw.replace(/[\s.\-]/g, "");
  return /^(01|05|07|25|27)\d{8}$/.test(digits);
}

/* ─── Menu "Besoin d'aide ?" ────────────────────────────────── */
function toggleHelpMenu() {
  document.getElementById("help-menu").classList.toggle("show");
}
document.addEventListener("click", (e) => {
  const help = document.querySelector(".au-help");
  if (help && !help.contains(e.target)) {
    document.getElementById("help-menu")?.classList.remove("show");
  }
});

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
    bar.classList.toggle("filled", i <= level);
  }

  const label = document.getElementById("strength-label");
  label.textContent = labels[level];
  label.style.color = level ? colors[level] : "";
}

/* ─── CONNEXION ─────────────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  clearErrs("err-login-identifier", "err-login-password");

  const identifier = document.getElementById("login-identifier").value.trim();
  const password    = document.getElementById("login-password").value;

  let ok = true;
  if (!identifier) { setErr("err-login-identifier", true, "Champ requis"); ok = false; }
  if (!password)    { setErr("err-login-password", true, "Champ requis"); ok = false; }
  if (!ok) return;

  setLoad("btn-login", "load-login", "btn-login-ico", "btn-login-txt", true);

  try {
    await AURA_AUTH.login({ identifier, password });
    showToast("Connexion réussie !", "success");
    setTimeout(() => window.location.href = "dashboard.html", 500);
  } catch (err) {
    setErr("err-login-password", true, err.message);
    showToast(err.message, "error");
  } finally {
    setLoad("btn-login", "load-login", "btn-login-ico", "btn-login-txt", false);
  }
}

/* ─── INSCRIPTION ────────────────────────────────────────────── */
async function handleRegister(e) {
  e.preventDefault();
  clearErrs(
    "err-reg-nom", "err-reg-telephone", "err-reg-email",
    "err-reg-code", "err-reg-password", "err-reg-confirm"
  );

  const nom        = document.getElementById("reg-nom").value.trim();
  const telephone  = document.getElementById("reg-telephone").value.trim();
  const email      = document.getElementById("reg-email").value.trim();
  const codeAdmin  = document.getElementById("reg-code").value.trim().toUpperCase();
  const password   = document.getElementById("reg-password").value;
  const confirm    = document.getElementById("reg-confirm").value;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  let ok = true;
  if (!nom)                          { setErr("err-reg-nom", true, "Champ requis"); ok = false; }
  if (!isValidIvorianPhone(telephone)) { setErr("err-reg-telephone", true, "Numéro ivoirien invalide (ex : 07XXXXXXXX)"); ok = false; }
  if (!emailValid)                    { setErr("err-reg-email", true, "Email invalide"); ok = false; }
  if (!codeAdmin)                     { setErr("err-reg-code", true, "Champ requis"); ok = false; }
  if (password.length < 8)            { setErr("err-reg-password", true, "Minimum 8 caractères"); ok = false; }
  if (password !== confirm)           { setErr("err-reg-confirm", true, "Les mots de passe ne correspondent pas"); ok = false; }
  if (!ok) return;

  setLoad("btn-register", "load-register", "btn-register-ico", "btn-register-txt", true);

  try {
    await AURA_AUTH.register({ nom, telephone, email, password, codeAdmin });
    showToast("Compte administrateur créé !", "success");
    setTimeout(() => window.location.href = "dashboard.html", 600);
  } catch (err) {
    if (err.message.toLowerCase().includes("code")) {
      setErr("err-reg-code", true, err.message);
    } else if (err.message.toLowerCase().includes("email")) {
      setErr("err-reg-email", true, err.message);
    }
    showToast(err.message, "error");
  } finally {
    setLoad("btn-register", "load-register", "btn-register-ico", "btn-register-txt", false);
  }
}
