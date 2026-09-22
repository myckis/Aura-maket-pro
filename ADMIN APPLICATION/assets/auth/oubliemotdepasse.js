"use strict";

/* ─── Erreurs formulaire ──────────────────────────────────── */
function setErr(id, show, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) el.textContent = msg;
  el.classList.toggle("show", show);
}

/* ─── Loader bouton ───────────────────────────────────────── */
function setLoad(btnId, loadId, icoId, txtId, on) {
  document.getElementById(btnId).disabled = on;
  document.getElementById(loadId).style.display = on ? "inline-block" : "none";
  document.getElementById(icoId).style.display   = on ? "none" : "inline-block";
  document.getElementById(txtId).style.opacity    = on ? "0.5" : "1";
}

let _resetEmail = null;

/* ─── DEMANDE DE RÉINITIALISATION ─────────────────────────── */
async function handleRequestReset() {
  const email = document.getElementById("reset-email").value.trim();
  setErr("err-reset-email", false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailValid) {
    setErr("err-reset-email", true, "Veuillez entrer une adresse email valide");
    return;
  }

  setLoad("btn-reset", "load-reset", "btn-reset-ico", "btn-reset-txt", true);

  try {
    await AURA_AUTH.requestPasswordReset({ email });
    _resetEmail = email;

    document.getElementById("sent-email-target").textContent = email;
    document.getElementById("screen-request").style.display = "none";
    document.getElementById("screen-sent").style.display     = "flex";
    showToast("Lien envoyé avec succès !", "success");

  } catch (err) {
    /* Par sécurité on ne révèle jamais si l'email existe ou non.
       On affiche toujours un message générique de succès à l'utilisateur,
       sauf en cas d'erreur réseau/serveur réelle. */
    if ((err.message || "").toLowerCase().includes("erreur de connexion")) {
      showToast(err.message, "error");
    } else {
      _resetEmail = email;
      document.getElementById("sent-email-target").textContent = email;
      document.getElementById("screen-request").style.display = "none";
      document.getElementById("screen-sent").style.display     = "flex";
      showToast("Lien envoyé avec succès !", "success");
    }
  } finally {
    setLoad("btn-reset", "load-reset", "btn-reset-ico", "btn-reset-txt", false);
  }
}

/* ─── RENVOYER LE LIEN ─────────────────────────────────────── */
let _resendCooldown = false;
async function handleResendReset() {
  if (_resendCooldown || !_resetEmail) return;
  _resendCooldown = true;

  const btn = document.getElementById("btn-resend-reset");
  const originalText = btn.textContent;

  try {
    await AURA_AUTH.requestPasswordReset({ email: _resetEmail });
    showToast("Nouveau lien envoyé !", "success");
  } catch (err) {
    showToast(err.message || "Erreur lors de l'envoi", "error");
  }

  let seconds = 30;
  btn.textContent = `Renvoyer dans ${seconds}s`;
  const interval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(interval);
      btn.textContent = originalText;
      _resendCooldown = false;
    } else {
      btn.textContent = `Renvoyer dans ${seconds}s`;
    }
  }, 1000);
}

/* ─── INIT ─────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("reset-email");
  emailInput.addEventListener("keydown", e => { if (e.key === "Enter") handleRequestReset(); });
  emailInput.focus();
});
