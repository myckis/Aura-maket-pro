"use strict";

(function renderCompte() {
  const user = AURA_AUTH.getUser();
  const meta = user?.user_metadata || {};

  const nom       = meta.nom || "—";
  const telephone = meta.telephone || "—";
  const email     = user?.email || "—";
  const role      = meta.role ? meta.role.charAt(0).toUpperCase() + meta.role.slice(1) : "Admin";

  document.getElementById("mc-nom").textContent   = nom;
  document.getElementById("mc-email").textContent = email;
  document.getElementById("mc-role").textContent  = role;

  document.getElementById("info-nom").textContent       = nom;
  document.getElementById("info-telephone").textContent = telephone;
  document.getElementById("info-email").textContent     = email;
  document.getElementById("info-role").textContent       = role;

  const initial = nom !== "—" ? nom.trim().charAt(0).toUpperCase() : "?";
  document.getElementById("mc-avatar").textContent = initial;
})();

function openLogoutModal() {
  document.getElementById("modal-logout").classList.add("show");
}

function closeLogoutModal() {
  document.getElementById("modal-logout").classList.remove("show");
}

async function confirmLogout() {
  closeLogoutModal();
  await AURA_AUTH.logout();
  window.location.href = "../../index.html";
}

/* ─── CHANGER LE MOT DE PASSE ──────────────────────────────── */
function ouvrirModalMotDePasse() {
  const user = AURA_AUTH.getUser();
  const email = user?.email || "";
  document.getElementById("mc-password-text").textContent =
    email ? `Un lien de réinitialisation sera envoyé à ${email}.` : "Un lien de réinitialisation sera envoyé à votre adresse e-mail.";
  document.getElementById("modal-password").classList.add("show");
}

function closePasswordModal() {
  document.getElementById("modal-password").classList.remove("show");
}

async function confirmPasswordReset() {
  const user = AURA_AUTH.getUser();
  const email = user?.email;
  const btn = document.getElementById("mc-password-confirm");
  const cancelBtn = document.getElementById("mc-password-cancel");

  if (!email) {
    showToast("Impossible de récupérer votre adresse e-mail.", "error");
    return;
  }

  btn.disabled = true;
  cancelBtn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Envoi en cours…";

  try {
    await AURA_AUTH.requestPasswordReset({ email });
    closePasswordModal();
    showToast("Lien envoyé à " + email, "success");
  } catch (err) {
    showToast(err.message || "Erreur lors de l'envoi du lien", "error");
  } finally {
    btn.disabled = false;
    cancelBtn.disabled = false;
    btn.textContent = originalText;
  }
}
