const AURA_CONFIG = {
  WORKER_URL: "https://connexteur.auramarketpro.workers.dev/proxy",
  APP_NAME: "Aura Market",
  APP_ROLE: "admin",
  LOCALE: "fr-CI",
  CURRENCY: "FCFA",
  RESET_PASSWORD_REDIRECT: "https://auramarketpro.com/admin/assets/auth/nouveau-mot-de-passe.html",
  endpoints: {
    produits: "/rest/produits",
    produits_validation: "/rest/v_admin_produits_validation",
    vendeurs: "/rest/v_admin_vendeurs",
    boutiques: "/rest/boutiques",
    commandes: "/rest/commandes",
    commandes_admin: "/rest/v_admin_commandes",
    boosts_admin: "/rest/v_admin_boosts",
    boosts: "/rest/boosts",
    users_vendeurs: "/rest/users_vendeurs",
    favoris: "/rest/favoris",
    panier: "/rest/panier",
    abonnements: "/rest/abonnements",
    avis: "/rest/avis",
    utilisateurs: "/rest/v_admin_clients",
    kyc: "/rest/kyc_vendeurs",
    kyc_admin: "/rest/v_admin_kyc",
    signalements_admin: "/rest/v_admin_signalements",
    personnalisation: "/rest/personnalisation_admin",
    bannieres: "/rest/bannieres",
    diffusions: "/rest/diffusions",
    crm_prospects: "/rest/crm_prospects",
    contenus_marketing: "/rest/contenus_marketing",
    pronostics_matchs: "/rest/pronostics_matchs",
    pronostics_ia_reponses: "/rest/pronostics_ia_reponses",
    pronostics_synthese: "/rest/pronostics_synthese",
    contenus_histoires: "/rest/contenus_histoires",
    contenus_personnages: "/rest/contenus_personnages",
    admins: "/rest/v_admin_liste_administrateurs",
    codes_admin: "/rest/codes_admin",
    journal_activite: "/rest/journal_activite",
    agent_actions: "/rest/agent_actions",
    rpc_agent_lister_paniers_abandonnes: "/rest/rpc/agent_lister_paniers_abandonnes",
    rpc_agent_lister_vendeurs_inactifs: "/rest/rpc/agent_lister_vendeurs_inactifs",
    rpc_agent_lister_tous_clients: "/rest/rpc/agent_lister_tous_clients",
    rpc_agent_lister_tous_vendeurs: "/rest/rpc/agent_lister_tous_vendeurs",
    rpc_agent_generer_bilan: "/rest/rpc/agent_generer_bilan",
    rpc_agent_creer_action: "/rest/rpc/agent_creer_action",
    rpc_agent_confirmer_action: "/rest/rpc/agent_confirmer_action",
    rpc_agent_annuler_action: "/rest/rpc/agent_annuler_action"
  }
};

/* ════════════════════════════════════════════════════════════
   AURA_AUTH — Centre d'authentification admin (Supabase Auth via Worker)
════════════════════════════════════════════════════════════ */
const AURA_AUTH = {
  SESSION_KEY: "aura_admin_session",
  USER_KEY: "aura_admin_user",

  getSession() {
    try { return JSON.parse(localStorage.getItem(this.SESSION_KEY)); }
    catch { return null; }
  },
  setSession(session) {
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
  },
  clearSession() {
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem("aura_admin_role");
    localStorage.removeItem("aura_admin_permissions");
    this._adminRole = "admin";
    this._adminPermissions = {};
  },
  getUser() {
    try { return JSON.parse(localStorage.getItem(this.USER_KEY)); }
    catch { return null; }
  },
  setUser(user) {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },
  getRole() {
    return this._adminRole || "admin";
  },
  getPermissions() {
    return this._adminPermissions || {};
  },
  setAdminRoleData(role, permissions) {
    this._adminRole = role || "admin";
    this._adminPermissions = permissions || {};
    localStorage.setItem("aura_admin_role", this._adminRole);
    localStorage.setItem("aura_admin_permissions", JSON.stringify(this._adminPermissions));
  },
  _loadAdminRoleData() {
    this._adminRole = localStorage.getItem("aura_admin_role") || "admin";
    try { this._adminPermissions = JSON.parse(localStorage.getItem("aura_admin_permissions")) || {}; }
    catch { this._adminPermissions = {}; }
  },
  getAccessToken() {
    const s = this.getSession();
    return s?.access_token || null;
  },
  /* ─── Journalisation d'activité (best-effort, ne bloque jamais l'action métier) ─── */
  async _logActivite(action, cible, cibleId, details) {
    try {
      await API.post("/rest/rpc/journaliser_action", {
        p_action: action, p_cible: cible, p_cible_id: cibleId != null ? String(cibleId) : null, p_details: details || null
      });
    } catch { /* le suivi ne doit jamais faire échouer l'action */ }
  },
  isTokenExpired() {
    const s = this.getSession();
    if (!s?.expires_at) return false;
    return Date.now() / 1000 >= s.expires_at - 30;
  },
  async refreshSession() {
    const s = this.getSession();
    if (!s?.refresh_token) {
      this.clearSession();
      return null;
    }
    try {
      const res = await fetch(AURA_CONFIG.WORKER_URL + "/auth/token?grant_type=refresh_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (!res.ok) { this.clearSession(); return null; }
      const data = await res.json();
      this.setSession(data);
      this.setUser(data.user);
      return data.access_token;
    } catch {
      return null;
    }
  },
  async getValidAccessToken() {
    if (this.isTokenExpired()) return await this.refreshSession();
    return this.getAccessToken();
  },
  isLoggedIn() {
    return !!this.getAccessToken();
  },
  init() {
    this._loadAdminRoleData();
  },

  /* ─── GARDE D'ACCÈS — à appeler en tout début de dashboard.html ─── */
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = "index.html";
      return false;
    }
    return true;
  },

  /* ─── Vérifie et consomme le code admin (à usage unique) ──── */
  async _consumeAdminCode(code) {
    const res = await fetch(`${AURA_CONFIG.WORKER_URL}/rest/rpc/consume_admin_code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code })
    });
    if (!res.ok) return false;
    return await res.json();
  },

  /* ─── INSCRIPTION (Supabase Auth /auth/v1/signup) ──────── */
  async register({ nom, telephone, email, password, codeAdmin }) {
    const codePermissions = await this._consumeAdminCode(codeAdmin);
    if (codePermissions === false || codePermissions === null) {
      throw new Error("Code admin invalide ou déjà utilisé");
    }

    const res = await fetch(AURA_CONFIG.WORKER_URL + "/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        data: { nom, telephone, role: "admin" }
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this._mapAuthError(data));
    }

    const hasRole = await this._checkRole(data.user.id, "admin");
    if (!hasRole) {
      throw new Error("Erreur lors de la création du compte admin");
    }

    // Applique les permissions rattachées au code utilisé (icônes accordées à ce nouvel admin)
    try {
      await fetch(`${AURA_CONFIG.WORKER_URL}/rest/users_admin?id=eq.${data.user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${data.access_token}`
        },
        body: JSON.stringify({ permissions: codePermissions || {} })
      });
    } catch { /* si l'application des permissions échoue, l'admin reste sans accès jusqu'à mise à jour manuelle */ }

    this.setSession(data);
    this.setUser(data.user);
    await this._syncAdminRoleData(data.user.id, data.access_token);
    return data;
  },

  /* ─── CONNEXION (Supabase Auth /auth/v1/token?grant_type=password) ─── */
  async login({ identifier, password }) {
    const isEmail = identifier.includes("@");
    let email = identifier;

    if (!isEmail) {
      email = await this._resolveEmailFromPhone(identifier);
      if (!email) throw new Error("Aucun compte trouvé avec ce numéro");
    }

    const res = await fetch(AURA_CONFIG.WORKER_URL + "/auth/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this._mapAuthError(data));
    }

    const hasRole = await this._checkRole(data.user.id, "admin");
    if (!hasRole) {
      await fetch(AURA_CONFIG.WORKER_URL + "/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${data.access_token}` }
      }).catch(() => {});
      throw new Error("Ce compte n'est pas un compte administrateur.");
    }

    try {
      await this._syncAdminRoleData(data.user.id, data.access_token);
    } catch (e) {
      // compte désactivé : on annule la session et on relaie l'erreur
      await fetch(AURA_CONFIG.WORKER_URL + "/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${data.access_token}` }
      }).catch(() => {});
      throw e;
    }

    this.setSession(data);
    this.setUser(data.user);
    this._logActivite("connexion", "session", null, "Connexion à l'espace admin");
    return data;
  },

  /* ─── Vérifie que l'utilisateur existe bien dans la table du rôle attendu ─── */
  async _checkRole(userId, role) {
    try {
      const res = await fetch(`${AURA_CONFIG.WORKER_URL}/rest/rpc/check_user_role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_user_id: userId, p_expected_role: role })
      });
      if (!res.ok) return false;
      return await res.json();
    } catch {
      return false;
    }
  },

  /* ─── Récupère role + permissions réels depuis users_admin et les stocke localement ─── */
  async _syncAdminRoleData(userId, accessToken) {
    try {
      const res = await fetch(
        `${AURA_CONFIG.WORKER_URL}/rest/users_admin?id=eq.${userId}&select=role,permissions,is_active`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );
      const rows = await res.json().catch(() => []);
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (row && row.is_active === false) {
        throw new Error("Ce compte administrateur a été désactivé.");
      }
      this.setAdminRoleData(row?.role || "admin", row?.permissions || {});
    } catch (e) {
      if (e instanceof Error && e.message.includes("désactivé")) throw e;
      this.setAdminRoleData("admin", {});
    }
  },

  /* ─── Résolution téléphone → email (via vue publique admin) ──── */
  async _resolveEmailFromPhone(telephone) {
    try {
      const res = await fetch(
        `${AURA_CONFIG.WORKER_URL}/rest/v_admin_login_lookup?telephone=eq.${encodeURIComponent(telephone)}&select=email`
      );
      const rows = await res.json().catch(() => []);
      return Array.isArray(rows) && rows[0] ? rows[0].email : null;
    } catch {
      return null;
    }
  },

  /* ─── DÉCONNEXION ───────────────────────────────────────── */
  async logout() {
    await this._logActivite("deconnexion", "session", null, "Déconnexion de l'espace admin");
    const token = this.getAccessToken();
    if (token) {
      try {
        await fetch(AURA_CONFIG.WORKER_URL + "/auth/logout", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
      } catch { /* on nettoie quand même la session locale */ }
    }
    this.clearSession();
  },

  /* ─── DEMANDE DE RÉINITIALISATION DE MOT DE PASSE ──────── */
  async requestPasswordReset({ email }) {
    const res = await fetch(AURA_CONFIG.WORKER_URL + "/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        options: { redirectTo: AURA_CONFIG.RESET_PASSWORD_REDIRECT }
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(this._mapAuthError(data));
    }
    return data;
  },

  /* ─── Traduction des erreurs Supabase en français ──────── */
  _mapAuthError(data) {
    const msg = data.error_description || data.error || data.msg || data.message || "";
    const m = msg.toLowerCase();

    if (m.includes("already registered") || m.includes("already exists")) {
      return "Un compte existe déjà avec cet email";
    }
    if (m.includes("invalid login credentials")) {
      return "Email/numéro ou mot de passe incorrect";
    }
    if (m.includes("password") && m.includes("least")) {
      return "Le mot de passe doit contenir au moins 8 caractères";
    }
    if (m.includes("invalid") && m.includes("email")) {
      return "Adresse email invalide";
    }
    if (!msg) return "Erreur de connexion au serveur";
    return msg;
  }
};

const API = {
  async request(endpoint, options = {}, _retried = false) {
    const token = await AURA_AUTH.getValidAccessToken();

    const res = await fetch(AURA_CONFIG.WORKER_URL + endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });

    if (res.status === 401 && !_retried) {
      const newToken = await AURA_AUTH.refreshSession();
      if (newToken) return API.request(endpoint, options, true);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Erreur HTTP ${res.status}`);
    }

    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  get: (ep, opts) => API.request(ep, { method: "GET", ...opts }),
  post: (ep, body, opts) => API.request(ep, { method: "POST", body: JSON.stringify(body), ...opts }),
  patch: (ep, body, opts) => API.request(ep, { method: "PATCH", body: JSON.stringify(body), ...opts }),
  delete: (ep, opts) => API.request(ep, { method: "DELETE", ...opts })
};

AURA_AUTH.init();

function formatCFA(amount) {
  return new Intl.NumberFormat("fr-CI").format(amount) + " F";
}

function showToast(message, type = "info") {
  const existing = document.getElementById("aura-toast");
  if (existing) existing.remove();

  const colors = {
    success: "#10B981",
    error: "#E0276F",
    info: "#3B82F6",
    warning: "#F59E0B"
  };

  const toast = document.createElement("div");
  toast.id = "aura-toast";

  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: colors[type] || colors.info,
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    zIndex: "9999"
  });

  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
