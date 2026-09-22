const RATE_LIMIT_REQUESTS = 100;
const RATE_LIMIT_WINDOW = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Sites vitrines publics ──────────────────────────────────────────
    // Toute requête GET/HEAD qui n'est PAS une route API (/proxy…, /health)
    // est traitée comme la visite d'un site vendeur : on sert le HTML
    // pré-généré, stocké dans sites_vendeurs.html_cache au déploiement.
    // => aucun code de rendu ici ; le design vit uniquement dans site-render.js.
    const estRouteApi = path.startsWith("/proxy") || path === "/health";
    if (!estRouteApi && (request.method === "GET" || request.method === "HEAD")) {
      return servirSitePublic(request, env, url);
    }
    // ────────────────────────────────────────────────────────────────────

    if (request.method === "OPTIONS") {
      return corsPreflightResponse(request, env);
    }

    const corsError = checkOrigin(request, env);
    if (corsError) return corsError;

    const rateLimitError = await checkRateLimit(request, env, ctx);
    if (rateLimitError) return rateLimitError;

    try {
      if (path.startsWith("/proxy/rest")) {
        return await proxyToSupabase(request, env, "rest", false);
      }

      if (path.startsWith("/proxy/storage")) {
        return await proxyToSupabase(request, env, "storage", false);
      }

      if (path.startsWith("/proxy/auth")) {
        return await proxyToSupabase(request, env, "auth", false);
      }

      if (path.startsWith("/proxy/realtime")) {
        return await proxyToSupabase(request, env, "realtime", false);
      }

      if (path === "/proxy/ai/marketing/texte") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleMarketingTexte(request, env);
      }

      if (path === "/proxy/ai/marketing/image") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleMarketingImage(request, env);
      }

      if (path === "/proxy/ai/marketing/nettoyer-visuels") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleNettoyerVisuels(request, env);
      }

      if (path === "/proxy/ai/agent/comprendre") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleAgentComprendre(request, env);
      }

      if (path === "/proxy/ai/contenus/scenario") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleContenusScenario(request, env);
      }

      if (path === "/proxy/ai/contenus/image") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleContenusImage(request, env);
      }

      if (path === "/proxy/ai/contenus/image-scene") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleContenusImageScene(request, env);
      }

      if (path === "/proxy/ai/contenus/voix") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleContenusVoix(request, env);
      }

      if (path === "/proxy/ai/contenus/pub2d") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleContenusPub2d(request, env);
      }

      if (path === "/proxy/ai/crm/prospection") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleCrmProspection(request, env);
      }

      if (path === "/proxy/ai/crm/sauvegarder") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleCrmSauvegarder(request, env);
      }

      if (path === "/proxy/push/envoyer") {
        const authError = checkAdminAuth(request, env);
        if (authError) return authError;
        return await handlePushEnvoyer(request, env);
      }

      /* ══════════════════════════════════════════════════════════════
         MODULE PRONOSTICS — routes ajoutées
         (DOIVENT rester avant le bloc générique /proxy/admin ci-dessous
         pour la route /proxy/admin/pronostics/rechercher-matchs)
         ══════════════════════════════════════════════════════════════ */

      if (path === "/proxy/ai/pronostics/analyser") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handlePronosticsAnalyser(request, env);
      }

      if (path === "/proxy/admin/pronostics/rechercher-matchs") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handlePronosticsRechercherMatchs(request, env);
      }

      if (path === "/proxy/admin/pronostics/generer-du-jour") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handlePronosticsGenererDuJour(request, env);
      }

      /* ══════════════════════════════════════════════════════════════
         MODULE AUTOMATISATION — routes ajoutées
         ══════════════════════════════════════════════════════════════ */

      if (path === "/proxy/admin/automatisations/liste") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleAutomatisationsListe(request, env);
      }

      if (path === "/proxy/admin/automatisations/toggle") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleAutomatisationsToggle(request, env);
      }

      if (path === "/proxy/admin/automatisations/executer") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleAutomatisationsExecuterManuel(request, env);
      }

      if (path === "/proxy/admin/automatisations/logs") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleAutomatisationsLogs(request, env);
      }

      if (path === "/proxy/admin/automatisations/annuler") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleAutomatisationAnnuler(request, env);
      }

      if (path === "/proxy/admin/automatisations/connecter") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleAutomatisationsConnecter(request, env);
      }

      if (path === "/proxy/admin/automatisations/deconnecter") {
        const authError = await checkSupabaseUserAuth(request, env);
        if (authError) return authError;
        return await handleAutomatisationsDeconnecter(request, env);
      }

      /*
       * Route générique admin : DOIT rester après toutes les routes
       * /proxy/admin/... personnalisées ci-dessus, sinon elle les
       * intercepte prématurément (path.startsWith capture tout préfixe).
       */
      if (path.startsWith("/proxy/admin")) {
        const authError = checkAdminAuth(request, env);
        if (authError) return authError;
        return await proxyToSupabase(request, env, "rest", true);
      }

      if (path === "/health") {
        return jsonResponseCors({ status: "ok", timestamp: Date.now() }, 200, request);
      }

      return jsonResponseCors({ error: "Route inconnue" }, 404, request);
    } catch (err) {
      console.error("Worker error:", err);
      return jsonResponseCors({ error: "Erreur interne du serveur", detail: String(err?.message || err) }, 500, request);
    }
  },

  // ══════════════════════════════════════════════════════════════════════
  // CRON TRIGGER — déclenché automatiquement par Cloudflare selon le
  // planning défini dans wrangler.toml (voir bloc [triggers] à ajouter,
  // ex. crons = ["0 7 * * 1", "0,30 * * * *", "0 6 * * *"] : lundi 7h UTC
  // pour le CRM, toutes les 30 min pour le module Automatisation, tous
  // les jours à 6h UTC (~7h à Abidjan) pour générer les matchs du jour
  // et leurs pronostics avant l'ouverture de l'app (module Pronostics).
  // Cloudflare appelle scheduled() pour CHAQUE cron défini ; event.cron
  // permet de distinguer lequel a déclenché l'appel.
  // ══════════════════════════════════════════════════════════════════════
  async scheduled(event, env, ctx) {
    ctx.waitUntil(executerCronCrmHebdo(env));
    ctx.waitUntil(executerAutomatisationsCron(env)); // <-- module Automatisation
    ctx.waitUntil(executerGenerationPronosticsDuJour(env).catch(err => console.error("[pronostics cron] Erreur :", err))); // <-- module Pronostics, matchs+analyses prêts à l'ouverture
  }
};

/* Mots-clés de prospection lancés automatiquement chaque semaine.
   Modifiable ici sans toucher au reste du code. */
const CRM_CRON_MOTS_CLES = [
  { motCle: "boutique chaussures", ville: "" },
  { motCle: "vêtements", ville: "" },
  { motCle: "cosmétiques", ville: "" }
];
const CRM_CRON_NOMBRE_PAR_MOTCLE = 15;

async function executerCronCrmHebdo(env) {
  if (!env.SERPER_API_KEY || !env.GROQ_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    console.error("[cron CRM] Secrets manquants, exécution annulée.");
    return;
  }

  let totalNouveaux = 0;
  let totalAvecTelephone = 0;

  for (const { motCle, ville } of CRM_CRON_MOTS_CLES) {
    try {
      const resultat = await effectuerProspectionEtSauvegarde(motCle, ville, CRM_CRON_NOMBRE_PAR_MOTCLE, env);
      totalNouveaux += resultat.total;
      totalAvecTelephone += resultat.avecTelephone;
    } catch (err) {
      console.error(`[cron CRM] Erreur pour "${motCle}" :`, err);
    }
  }

  if (totalNouveaux > 0) {
    await envoyerPushAuxAdmins(
      env,
      "Nouveaux prospects CRM 🎯",
      `${totalNouveaux} nouvelle(s) boutique(s) trouvée(s) cette semaine, dont ${totalAvecTelephone} avec numéro.`
    );
  } else {
    console.log("[cron CRM] Aucun nouveau prospect cette semaine (tous déjà connus ou aucun résultat).");
  }
}

/* Factorise la logique de recherche + sauvegarde automatique, réutilisée
   par le Cron Trigger. Contrairement à la route /proxy/ai/crm/prospection
   (qui laisse l'admin choisir quoi sauvegarder), ici on sauvegarde
   directement TOUS les prospects avec téléphone valide trouvés — c'est le
   comportement attendu pour une automatisation en arrière-plan. */
async function effectuerProspectionEtSauvegarde(motCle, ville, nombreDemande, env) {
  const reponse = await handleCrmProspectionInterne(motCle, ville, nombreDemande, env);
  const prospectsAvecTelephone = reponse.prospects.filter(p => p.telephoneValide);

  if (prospectsAvecTelephone.length > 0) {
    await sauvegarderProspectsInterne(prospectsAvecTelephone, motCle, ville, env);
  }

  return { total: reponse.prospects.length, avecTelephone: prospectsAvecTelephone.length };
}

/* Envoie un push à tous les tokens FCM enregistrés pour l'app "admin"
   (table push_tokens, déjà utilisée par assets/js/push-notifications.js).
   Nécessite un secret FIREBASE_SERVER_KEY (clé serveur FCM legacy) ou, si
   tu es passé sur FCM HTTP v1, adapte l'appel avec un token OAuth2 —
   dans ce cas remplace le bloc fetch ci-dessous en conséquence. */
async function envoyerPushAuxAdmins(env, titre, corps) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;
  if (!env.FIREBASE_SERVER_KEY) {
    console.error("[push] FIREBASE_SERVER_KEY non configurée, envoi annulé.");
    return;
  }

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/push_tokens?app=eq.admin&select=token`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          Accept: "application/json"
        }
      }
    );
    if (!res.ok) return;
    const rows = await res.json().catch(() => []);
    const tokens = (rows || []).map(r => r.token).filter(Boolean);
    if (tokens.length === 0) return;

    await Promise.all(tokens.map(token =>
      fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `key=${env.FIREBASE_SERVER_KEY}`
        },
        body: JSON.stringify({
          to: token,
          notification: { title: titre, body: corps }
        })
      }).catch(err => console.error("[push] Échec envoi token :", err))
    ));
  } catch (err) {
    console.error("[push] Erreur envoyerPushAuxAdmins :", err);
  }
}

/* Route manuelle pour tester l'envoi push sans attendre le cron
   (protégée par X-Admin-Token comme les autres routes /proxy/admin). */
async function handlePushEnvoyer(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.titre || !body?.corps) {
    return jsonResponseCors({ error: "titre et corps requis" }, 400, request);
  }
  await envoyerPushAuxAdmins(env, body.titre, body.corps);
  return jsonResponseCors({ envoye: true }, 200, request);
}

/* ══════════════════════════════════════════════════════════════════════
   SITES VITRINES PUBLICS
   Sert le HTML pré-généré (sites_vendeurs.html_cache) via la clé service.
   Résolution du vendeur :
     1) Sous-domaine  ->  {slug}.auramarketpro.com   (après DNS wildcard)
     2) Chemin        ->  https://<worker>.workers.dev/{slug}  (immédiat)
   Variable optionnelle : ROOT_DOMAIN (défaut "auramarketpro.com").
   Utilise les secrets déjà présents : SUPABASE_URL, SUPABASE_SERVICE_KEY.
   ══════════════════════════════════════════════════════════════════════ */
async function servirSitePublic(request, env, url) {
  try {
    const slug = resoudreSlug(url, env.ROOT_DOMAIN || "auramarketpro.com");
    if (!slug) return pageHtml(pageAccueil(), 200);

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return pageHtml(pageErreur("Configuration serveur manquante."), 500);
    }

    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/sites_vendeurs` +
        `?sous_domaine=eq.${encodeURIComponent(slug)}&statut=eq.en_ligne&select=html_cache&limit=1`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          Accept: "application/json"
        }
      }
    );
    if (!res.ok) return pageHtml(pageErreur("Service momentanément indisponible."), 502);

    const rows = await res.json().catch(() => []);
    const site = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!site || !site.html_cache) return pageHtml(page404(slug), 404);

    return new Response(site.html_cache, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60"
      }
    });
  } catch (err) {
    return pageHtml(pageErreur(String((err && err.message) || err)), 500);
  }
}

function resoudreSlug(url, rootDomain) {
  const host = url.hostname.toLowerCase();
  const root = String(rootDomain || "").toLowerCase();

  // 1) Sous-domaine : slug.auramarketpro.com
  if (root && host.endsWith("." + root)) {
    const label = host.slice(0, host.length - root.length - 1);
    if (label && label !== "www") return nettoyerSlug(label);
  }
  // 2) Chemin : /{slug}
  const seg = url.pathname.split("/").filter(Boolean)[0];
  return seg ? nettoyerSlug(seg) : "";
}

function nettoyerSlug(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 63);
}

function pageHtml(html, status) {
  return new Response(html, {
    status: status || 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function pageShell(titre, corps) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titre}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0A0A0B;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}h1{font-size:22px;margin-bottom:10px}p{color:#9a9aa2;font-size:14px;max-width:420px;line-height:1.6}</style>
</head><body><div>${corps}</div></body></html>`;
}
function page404(slug) {
  return pageShell("Site introuvable", `<h1>Site introuvable</h1><p>Aucune boutique en ligne ne correspond à « ${slug} ». Le site n'existe pas ou n'a pas encore été mis en ligne.</p>`);
}
function pageAccueil() {
  return pageShell("Aura Market", `<h1>Aura Market</h1><p>Ajoutez le nom d'une boutique à l'adresse pour ouvrir son site.</p>`);
}
function pageErreur(msg) {
  return pageShell("Erreur", `<h1>Une erreur est survenue</h1><p>${msg}</p>`);
}

/* ══════════════════════════════════════════════════════════════════════
   ROUTES API EXISTANTES (inchangées)
   ══════════════════════════════════════════════════════════════════════ */
async function proxyToSupabase(request, env, type, useServiceKey) {
  const supabaseUrl = env.SUPABASE_URL;
  const apiKey = useServiceKey ? env.SUPABASE_SERVICE_KEY : env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !apiKey) {
    return jsonResponseCors({ error: "Configuration manquante sur le serveur" }, 500, request);
  }

  const url = new URL(request.url);

  let basePath;
  switch (type) {
    case "rest": basePath = "/rest/v1"; break;
    case "storage": basePath = "/storage/v1"; break;
    case "auth": basePath = "/auth/v1"; break;
    case "realtime": basePath = "/realtime/v1"; break;
    default: basePath = "/rest/v1";
  }

  const proxyPrefix = `/proxy/${type}`;
  const remainingPath = url.pathname.replace(proxyPrefix, "") || "/";
  const targetUrl = `${supabaseUrl}${basePath}${remainingPath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("apikey", apiKey);

  const hasUserToken = headers.get("Authorization")?.startsWith("Bearer ey");
  if (!hasUserToken) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  headers.delete("host");

  const supabaseResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
  });

  const responseHeaders = new Headers(supabaseResponse.headers);
  addCorsHeaders(responseHeaders, request);
  responseHeaders.delete("apikey");
  responseHeaders.delete("authorization");

  return new Response(supabaseResponse.body, {
    status: supabaseResponse.status,
    headers: responseHeaders,
  });
}

async function checkSupabaseUserAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponseCors({ error: "Non authentifié" }, 401, request);

  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return jsonResponseCors({ error: "Configuration manquante sur le serveur" }, 500, request);
  }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": anonKey }
  });
  if (!userRes.ok) return jsonResponseCors({ error: "Session invalide" }, 401, request);
  const user = await userRes.json().catch(() => null);
  if (!user?.id) return jsonResponseCors({ error: "Session invalide" }, 401, request);

  const adminRes = await fetch(
    `${supabaseUrl}/rest/v1/users_admin?id=eq.${user.id}&select=id,is_active`,
    { headers: { "Authorization": `Bearer ${token}`, "apikey": anonKey } }
  );
  if (!adminRes.ok) return jsonResponseCors({ error: "Vérification admin impossible" }, 401, request);
  const rows = await adminRes.json().catch(() => []);
  const admin = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!admin || admin.is_active === false) {
    return jsonResponseCors({ error: "Accès admin requis" }, 403, request);
  }

  return null;
}

async function handleMarketingTexte(request, env) {
  if (!env.GROQ_API_KEY) {
    return jsonResponseCors({ error: "GROQ_API_KEY non configurée sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  if (!body?.prompt) return jsonResponseCors({ error: "prompt requis" }, 400, request);

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "Tu es un expert en marketing digital pour l'Afrique de l'Ouest, spécialisé dans les posts réseaux sociaux percutants pour l'e-commerce (Facebook, TikTok, WhatsApp). Tu écris en français, avec un style adapté au marché ivoirien. Tu réponds uniquement avec le texte demandé, sans commentaire ni introduction ni guillemets."
        },
        { role: "user", content: body.prompt }
      ],
      temperature: 0.8,
      max_tokens: 300
    })
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    return jsonResponseCors({ error: "Erreur Groq", detail: errText }, 502, request);
  }

  const groqData = await groqRes.json();
  const texte = groqData?.choices?.[0]?.message?.content?.trim();
  if (!texte) return jsonResponseCors({ error: "Réponse vide de Groq" }, 502, request);

  return jsonResponseCors(texte, 200, request);
}

async function handleMarketingImage(request, env) {
  if (!env.AI) {
    return jsonResponseCors({ error: "Binding Workers AI (env.AI) non configuré sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  if (!body?.prompt) return jsonResponseCors({ error: "prompt requis" }, 400, request);

  try {
    const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt: body.prompt,
      width: 768,
      height: 1344,
      steps: 4
    });

    const base64 = typeof result === "string" ? result : result?.image;
    if (!base64) throw new Error("Réponse Workers AI vide");

    return jsonResponseCors({ dataUrl: `data:image/jpeg;base64,${base64}` }, 200, request);
  } catch (err) {
    console.error("Workers AI image (marketing) error:", err);
    return jsonResponseCors({ error: "Échec de la génération d'image", detail: String(err?.message || err) }, 502, request);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   NETTOYAGE DU STOCKAGE — bucket "visuels-marketing"
   ══════════════════════════════════════════════════════════════════════ */
const MMKT_BUCKET = "visuels-marketing";

async function handleNettoyerVisuels(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponseCors({ error: "Configuration Supabase manquante sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => ({}));
  const confirmer = !!body?.confirmer;

  try {
    const fichiers = await listerFichiersBucket(MMKT_BUCKET, env);
    const urlsUtilisees = await recupererImageUrlsUtilisees(env);

    const orphelins = fichiers.filter(f => {
      const urlPublique = `${env.SUPABASE_URL}/storage/v1/object/public/${MMKT_BUCKET}/${f.name}`;
      return !urlsUtilisees.has(urlPublique) && !urlsContientChemin(urlsUtilisees, f.name);
    });

    const totalOctetsOrphelins = orphelins.reduce((s, f) => s + (f.metadata?.size || 0), 0);
    const moOrphelins = Math.round((totalOctetsOrphelins / (1024 * 1024)) * 10) / 10;

    if (!confirmer) {
      return jsonResponseCors({
        total: fichiers.length,
        utilisees: fichiers.length - orphelins.length,
        orphelines: orphelins.length,
        mo_orphelins: moOrphelins
      }, 200, request);
    }

    let supprimes = 0;
    if (orphelins.length > 0) {
      supprimes = await supprimerFichiersBucket(MMKT_BUCKET, orphelins.map(f => f.name), env);
    }

    return jsonResponseCors({
      supprimes,
      utilisees: fichiers.length - supprimes,
      mo_orphelins: moOrphelins
    }, 200, request);
  } catch (err) {
    console.error("Erreur nettoyerVisuels :", err);
    return jsonResponseCors({ error: "Échec de l'analyse du stockage", detail: String(err?.message || err) }, 500, request);
  }
}

async function listerFichiersBucket(bucket, env) {
  const fichiers = [];
  let offset = 0;
  const limit = 1000;

  for (;;) {
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prefix: "", limit, offset, sortBy: { column: "name", order: "asc" } })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Échec listage bucket ${bucket} : ${errText}`);
    }
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach(r => { if (r.id) fichiers.push(r); });
    if (rows.length < limit) break;
    offset += limit;
  }

  return fichiers;
}

async function recupererImageUrlsUtilisees(env) {
  const urls = new Set();
  let offset = 0;
  const limit = 1000;

  for (;;) {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/contenus_marketing?select=image_url&image_url=not.is.null&limit=${limit}&offset=${offset}`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          Accept: "application/json"
        }
      }
    );
    if (!res.ok) break;
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach(r => { if (r.image_url) urls.add(r.image_url); });
    if (rows.length < limit) break;
    offset += limit;
  }

  return urls;
}

function urlsContientChemin(urlsUtilisees, nomFichier) {
  for (const u of urlsUtilisees) {
    if (u.endsWith("/" + nomFichier)) return true;
  }
  return false;
}

async function supprimerFichiersBucket(bucket, noms, env) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefixes: noms })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Échec suppression fichiers ${bucket} : ${errText}`);
  }
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data.length : noms.length;
}

async function handleContenusScenario(request, env) {
  if (!env.GROQ_API_KEY) {
    return jsonResponseCors({ error: "GROQ_API_KEY non configurée sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  const texteComplet = (body?.texteComplet || "").trim();
  const prompt = (body?.prompt || "").trim();
  if (!prompt && !texteComplet) return jsonResponseCors({ error: "prompt requis" }, 400, request);

  const personnages = Array.isArray(body.personnages) ? body.personnages : [];
  const ambiance = body.ambiance || "humoristique et léger";
  const nbScenesDemande = body.nbScenes;
  const sansPromotionAuraMarket = !!body.sansPromotionAuraMarket;

  const descPersonnages = personnages.length
    ? personnages.map(p => `- id "${p.id}" (${p.nom}) : ${p.description}`).join("\n")
    : "- aucun personnage précis fourni, invente une situation générique adaptée au récit.";

  const systemPrompt = sansPromotionAuraMarket
    ? construirePromptRealiste({ descPersonnages, ambiance, nbScenesDemande, texteComplet })
    : construirePromptPublicitaire({ descPersonnages, ambiance, nbScenesDemande });

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: texteComplet || prompt }
      ],
      temperature: 0.85,
      max_tokens: 1800,
      response_format: { type: "json_object" }
    })
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    return jsonResponseCors({ error: "Erreur Groq", detail: errText }, 502, request);
  }

  const groqData = await groqRes.json();
  const raw = groqData?.choices?.[0]?.message?.content?.trim();
  if (!raw) return jsonResponseCors({ error: "Réponse vide de Groq" }, 502, request);

  let scenario;
  try {
    scenario = JSON.parse(raw);
  } catch {
    return jsonResponseCors({ error: "Réponse IA non-JSON" }, 502, request);
  }

  if (!scenario?.scenes?.length) {
    return jsonResponseCors({ error: "Scénario invalide (aucune scène)" }, 502, request);
  }

  return jsonResponseCors(scenario, 200, request);
}

function construirePromptPublicitaire({ descPersonnages, ambiance, nbScenesDemande }) {
  const consigneNb = nbScenesDemande === "auto" || !nbScenesDemande
    ? "Choisis toi-même le nombre de scènes le plus pertinent, entre 3 et 5."
    : `L'histoire doit contenir exactement ${nbScenesDemande} scènes.`;

  return `Tu es scénariste publicitaire pour Aura Market CI, une marketplace e-commerce ivoirienne.
Tu écris de courtes histoires en français (style ivoirien accessible) destinées à devenir des vidéos courtes (type Story/Reel) pour promouvoir la plateforme.

Personnages disponibles pour cette histoire :
${descPersonnages}

${consigneNb}
Ambiance demandée : ${ambiance}.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, au format exact :
{
  "titre": "titre court de l'histoire",
  "scenes": [
    { "texte": "narration/voix off de la scène, 1-2 phrases", "visuel": "description concrète et précise de ce qu'on doit VOIR à l'image (lieu, action, posture, expression, objets visibles), en une phrase", "personnages": ["id1", "id2"] }
  ]
}
Chaque "personnages" doit être un sous-ensemble des ids fournis ci-dessus (utilise uniquement des ids existants). Le champ "texte" est écrit comme une phrase de narration/voix off. Le champ "visuel" est une description purement visuelle et concrète de la scène, différente du texte de narration, pensée pour guider un générateur d'images.`;
}

function construirePromptRealiste({ descPersonnages, ambiance, nbScenesDemande, texteComplet }) {
  const consigneNb = texteComplet
    ? "Découpe le texte en autant de courtes séquences que nécessaire pour bien raconter chaque moment/action distinct (ne force pas un nombre fixe) : chaque séquence doit correspondre à UN seul instant ou UNE seule action clairement identifiable, pour garder un bon rythme de lecture et permettre une image différente et cohérente par séquence."
    : (nbScenesDemande === "auto" || !nbScenesDemande
        ? "Choisis toi-même le nombre de séquences le plus pertinent, en donnant à chaque séquence un seul moment/action clair."
        : `Le récit doit contenir exactement ${nbScenesDemande} séquences, chacune centrée sur un seul moment/action clair.`);

  const consigneSource = texteComplet
    ? `L'admin a fourni le texte intégral de son histoire ci-dessous (dans le message utilisateur). Tu dois LE RESPECTER : ne change pas les événements, les mots-clés ni le sens, ne l'embellis pas, n'ajoute rien qui n'y figure pas. Ton seul travail est de le découper en séquences courtes et de rédiger, pour chaque séquence, une description visuelle fidèle à ce qui s'y passe. Le champ "texte" de chaque scène doit reprendre fidèlement (en la raccourcissant si besoin pour la lisibilité à l'écran) la portion de texte correspondante, sans changer le sens ni le style de l'auteur.`
    : `Développe un court récit neutre en français à partir du sujet fourni par l'admin.`;

  return `Tu es monteur/scénariste narratif indépendant. Tu prépares une histoire courte destinée à une vidéo (type Story/Reel), racontée avec des personnages et des images générées scène par scène.

RÈGLE ABSOLUE : cette histoire n'est PAS une publicité. Tu ne dois JAMAIS mentionner, suggérer ou faire la promotion d'Aura Market, d'une marketplace, d'une application, d'un téléchargement ou d'un service quelconque. Aucun call-to-action commercial. Le récit doit se suffire à lui-même, comme un contenu narratif indépendant.

Personnages disponibles pour cette histoire :
${descPersonnages}

${consigneSource}

${consigneNb}
Ambiance : ${ambiance}.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, au format exact :
{
  "titre": "titre court de l'histoire",
  "scenes": [
    { "texte": "narration/voix off courte de la séquence", "visuel": "description concrète et précise de ce qu'on doit VOIR à l'image pour CETTE séquence précise (lieu, action exacte, posture, expression, objets visibles) — doit correspondre exactement à l'action du texte de cette séquence, pas à une autre", "personnages": ["id1", "id2"] }
  ]
}
Chaque "personnages" doit être un sous-ensemble des ids fournis ci-dessus. Le champ "visuel" est essentiel : il doit décrire une action/scène différente et spécifique pour chaque séquence, en cohérence stricte avec son "texte", afin que l'enchaînement des images suive fidèlement et fluidement la progression de l'histoire.`;
}

async function handleContenusImage(request, env) {
  if (!env.AI) {
    return jsonResponseCors({ error: "Binding Workers AI (env.AI) non configuré sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  if (!body?.prompt) return jsonResponseCors({ error: "prompt requis" }, 400, request);

  const modeReference = body.mode === "reference";

  try {
    const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt: body.prompt,
      width: modeReference ? 512 : 768,
      height: modeReference ? 512 : 1344,
      steps: 4
    });

    const base64 = typeof result === "string" ? result : result?.image;
    if (!base64) throw new Error("Réponse Workers AI vide");

    return jsonResponseCors({ dataUrl: `data:image/jpeg;base64,${base64}` }, 200, request);
  } catch (err) {
    console.error("Workers AI image error:", err);
    return jsonResponseCors({ error: "Échec de la génération d'image", detail: String(err?.message || err) }, 502, request);
  }
}

async function handleContenusImageScene(request, env) {
  if (!env.AI) {
    return jsonResponseCors({ error: "Binding Workers AI (env.AI) non configuré sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  if (!body?.prompt) return jsonResponseCors({ error: "prompt requis" }, 400, request);

  const refImages = Array.isArray(body.refImages) ? body.refImages.slice(0, 4) : [];

  try {
    const form = new FormData();
    form.append("prompt", body.prompt);
    form.append("width", "768");
    form.append("height", "1344");

    refImages.forEach((dataUrl, i) => {
      const bytes = dataUrlToUint8Array(dataUrl);
      if (bytes) {
        form.append(`input_image_${i}`, new Blob([bytes], { type: "image/jpeg" }), `ref${i}.jpg`);
      }
    });

    const formResponse = new Response(form);
    const formStream = formResponse.body;
    const formContentType = formResponse.headers.get("content-type");

    const result = await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b", {
      multipart: {
        body: formStream,
        contentType: formContentType
      }
    });

    const base64 = typeof result === "string" ? result : result?.image;
    if (!base64) throw new Error("Réponse Workers AI vide");

    return jsonResponseCors({ dataUrl: `data:image/jpeg;base64,${base64}` }, 200, request);
  } catch (err) {
    console.error("Workers AI scene (flux-2-klein) error:", err);
    return jsonResponseCors({ error: "Échec de la génération de scène", detail: String(err?.message || err) }, 502, request);
  }
}

function dataUrlToUint8Array(dataUrl) {
  const match = /^data:.*;base64,(.*)$/.exec(dataUrl || "");
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function handleContenusVoix(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.texte) return jsonResponseCors({ error: "texte requis" }, 400, request);

  const comptes = [
    { cle: env.ELEVENLABS_API_KEY, voix: body.voiceId || env.ELEVENLABS_VOICE_ID },
    { cle: env.ELEVENLABS_API_KEY_2, voix: env.ELEVENLABS_VOICE_ID_2 },
    { cle: env.ELEVENLABS_API_KEY_3, voix: env.ELEVENLABS_VOICE_ID_3 },
    { cle: env.ELEVENLABS_API_KEY_4, voix: env.ELEVENLABS_VOICE_ID_4 },
    { cle: env.ELEVENLABS_API_KEY_5, voix: env.ELEVENLABS_VOICE_ID_5 },
    { cle: env.ELEVENLABS_API_KEY_6, voix: env.ELEVENLABS_VOICE_ID_6 },
    { cle: env.ELEVENLABS_API_KEY_7, voix: env.ELEVENLABS_VOICE_ID_7 },
    { cle: env.ELEVENLABS_API_KEY_8, voix: env.ELEVENLABS_VOICE_ID_8 },
    { cle: env.ELEVENLABS_API_KEY_9, voix: env.ELEVENLABS_VOICE_ID_9 },
    { cle: env.ELEVENLABS_API_KEY_10, voix: env.ELEVENLABS_VOICE_ID_10 }
  ].filter(c => c.cle && c.voix);

  if (comptes.length === 0) {
    return jsonResponseCors({ error: "Aucun compte ElevenLabs configuré sur le serveur" }, 500, request);
  }

  let derniereErreur = null;

  for (let i = 0; i < comptes.length; i++) {
    const { cle, voix } = comptes[i];
    try {
      const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voix}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": cle,
          "Accept": "audio/mpeg"
        },
        body: JSON.stringify({
          text: body.texte,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      });

      if (elRes.ok) {
        const arrayBuffer = await elRes.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        return jsonResponseCors({ dataUrl: `data:audio/mpeg;base64,${base64}`, compteUtilise: i + 1 }, 200, request);
      }

      const errText = await elRes.text().catch(() => "");
      derniereErreur = errText;
      console.error(`ElevenLabs compte ${i + 1} en échec (status ${elRes.status}) :`, errText);
    } catch (err) {
      derniereErreur = String(err?.message || err);
      console.error(`ElevenLabs compte ${i + 1} exception :`, err);
    }
  }

  return jsonResponseCors({
    error: `Échec de la génération de voix sur les ${comptes.length} compte(s) configuré(s)`,
    detail: derniereErreur
  }, 502, request);
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function handleContenusPub2d(request, env) {
  if (!env.GROQ_API_KEY) {
    return jsonResponseCors({ error: "GROQ_API_KEY non configurée sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  if (!body?.sujet) return jsonResponseCors({ error: "sujet requis" }, 400, request);

  const template = ["A", "B", "C", "D"].includes(body.template) ? body.template : "B";
  const ton = body.ton || "dynamique et rythmé";

  const consigneTemplate = {
    A: `Le format est un mockup de téléphone entouré de 3 courtes cartes "avantages" reliées à l'écran. En plus de l'accroche/cta, fournis EXACTEMENT 3 "features" : des avantages courts (6 mots maximum chacun), concrets et orientés bénéfice client.`,
    B: `Le format est une accroche plein écran suivie d'un visuel produit qui zoome, puis un sous-texte et un bouton CTA. Le champ "features" n'est pas utilisé ici, renvoie un tableau vide.`,
    C: `Le format simule un écran d'application mobile : une étape "recherche/chargement" (l'accroche sert d'intitulé d'action, le sous-texte de description de l'étape), puis un écran de confirmation. Le champ "features" n'est pas utilisé ici, renvoie un tableau vide.`,
    D: `Le format est un montage dynamique et punchy façon publicité "fast food" moderne (rouge/jaune/blanc, très saturé) : une accroche d'intro très courte plein écran, puis 2-3 courts textes affichés au fil de plans vidéo qui s'enchaînent vite (renforçant une émotion simple, ex. plaisir/gourmandise/satisfaction), puis un packshot final avec un slogan et un CTA/numéro de téléphone. En plus de l'accroche/sousTexte(slogan)/cta, fournis EXACTEMENT 2 à 3 "textesCorps" : de très courtes phrases percutantes (5 mots maximum chacune), à afficher une par plan vidéo, orientées émotion/plaisir plutôt qu'information. Le champ "features" n'est pas utilisé ici, renvoie un tableau vide.`
  }[template];

  const descProduit = body.produit
    ? `Produit concerné : "${body.produit.nom}"${body.produit.boutique?.nom_boutique ? ` (boutique : ${body.produit.boutique.nom_boutique})` : ""}${body.produit.prix ? `, prix : ${body.produit.prix} FCFA` : ""}.`
    : "Aucun produit précis : il s'agit d'une pub générique pour Aura Market (l'app/marketplace elle-même).";

  const systemPrompt = `Tu es rédacteur publicitaire pour Aura Market CI, une marketplace e-commerce ivoirienne.
Tu écris de très courts textes en français (style ivoirien accessible, percutant) pour une vidéo publicitaire courte (type Story/Reel) générée automatiquement.

${consigneTemplate}

${descProduit}
Ton demandé : ${ton}.
Sujet/brief : ${body.sujet}

Contraintes de longueur STRICTES (l'espace à l'écran est limité) :
- "accroche" : 8 mots maximum (template D : 2 mots maximum, très court pour un plein écran), percutant, sans point final.
- "sousTexte" : 14 mots maximum (sert de slogan final pour le template D).
- "cta" : 4 mots maximum (impératif, orienté action : "Commander maintenant", "Télécharger l'app"... ; pour le template D, peut aussi être un numéro de téléphone si mentionné dans le sujet/brief).
- "features" (uniquement si template A) : exactement 3 chaînes, 6 mots maximum chacune.
- "textesCorps" (uniquement si template D) : 2 à 3 chaînes, 5 mots maximum chacune, orientées émotion/plaisir.
- "scriptVoix" : le texte qui sera lu à voix haute par une voix off pendant la vidéo. C'est un VRAI petit script publicitaire fluide et naturel (2 à 3 phrases courtes, 25 mots maximum au total, environ 8-10 secondes de lecture) — PAS une simple répétition de l'accroche/cta affichés à l'écran. Il doit donner envie, comme une vraie voix off pub radio/TV, tout en restant cohérent avec l'accroche et le sujet. Pour le template D, ce champ est optionnel : renvoie une chaîne vide si la musique doit suffire (préférable pour ce style rythmé).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, au format exact :
{
  "accroche": "...",
  "sousTexte": "...",
  "cta": "...",
  "features": ["...", "...", "..."],
  "textesCorps": ["...", "..."],
  "scriptVoix": "..."
}`;

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: body.sujet }
      ],
      temperature: 0.8,
      max_tokens: 550,
      response_format: { type: "json_object" }
    })
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    return jsonResponseCors({ error: "Erreur Groq", detail: errText }, 502, request);
  }

  const groqData = await groqRes.json();
  const raw = groqData?.choices?.[0]?.message?.content?.trim();
  if (!raw) return jsonResponseCors({ error: "Réponse vide de Groq" }, 502, request);

  let textes;
  try {
    textes = JSON.parse(raw);
  } catch {
    return jsonResponseCors({ error: "Réponse IA non-JSON" }, 502, request);
  }

  if (!textes?.accroche) {
    return jsonResponseCors({ error: "Réponse invalide (accroche manquante)" }, 502, request);
  }

  return jsonResponseCors({
    accroche: textes.accroche,
    sousTexte: textes.sousTexte || "",
    cta: textes.cta || "Commander maintenant",
    features: Array.isArray(textes.features) ? textes.features.slice(0, 3) : [],
    textesCorps: Array.isArray(textes.textesCorps) ? textes.textesCorps.slice(0, 3) : [],
    scriptVoix: textes.scriptVoix || textes.accroche
  }, 200, request);
}

async function handleAgentComprendre(request, env) {
  if (!env.GROQ_API_KEY) {
    return jsonResponseCors({ error: "GROQ_API_KEY non configurée sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  if (!body?.instruction) return jsonResponseCors({ error: "instruction requise" }, 400, request);

  const maintenant = new Date().toISOString();

  const tools = [
    {
      type: "function",
      function: {
        name: "lister_paniers_abandonnes",
        description: "Relance les clients ayant un panier non finalisé depuis un certain temps.",
        parameters: {
          type: "object",
          properties: {
            depuis_heures: { type: "number", description: "Nombre d'heures d'inactivité du panier, défaut 24" },
            programmee_pour: { type: "string", description: "Date-heure ISO 8601 si l'envoi doit être différé/programmé, sinon ne pas inclure ce champ" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "lister_vendeurs_inactifs",
        description: "Relance les vendeurs approuvés n'ayant publié aucun nouveau produit récemment.",
        parameters: {
          type: "object",
          properties: {
            depuis_jours: { type: "number", description: "Nombre de jours d'inactivité, défaut 7" },
            programmee_pour: { type: "string", description: "Date-heure ISO 8601 si l'envoi doit être différé/programmé, sinon ne pas inclure ce champ" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "generer_bilan",
        description: "Génère un bilan chiffré de l'activité de la plateforme sur une période (clients, vendeurs, commandes, signalements...).",
        parameters: {
          type: "object",
          properties: {
            depuis_jours: { type: "number", description: "Nombre de jours du bilan, défaut 7" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "diffuser_message_libre",
        description: "Envoie un même message (annonce, promo, information générale) à tous les clients et/ou tous les vendeurs, SANS personnalisation par nom. Utiliser cette fonction quand l'admin veut un message identique pour tout le monde.",
        parameters: {
          type: "object",
          required: ["titre", "corps", "cible"],
          properties: {
            titre: { type: "string", description: "Titre court de la notification" },
            corps: { type: "string", description: "Corps du message à diffuser" },
            cible: { type: "string", enum: ["client", "vendeur", "les_deux"], description: "À qui envoyer : client, vendeur, ou les_deux" },
            programmee_pour: { type: "string", description: "Date-heure ISO 8601 si l'envoi doit être différé/programmé, sinon ne pas inclure ce champ" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "annoncer_a_tous_personnalise",
        description: "Envoie une annonce à TOUS les clients ou TOUS les vendeurs (pas seulement les inactifs), en insérant le prénom de chaque destinataire dans le message pour le personnaliser. Utiliser cette fonction quand l'admin veut que le message inclue le nom de chaque personne, ET que ce soit envoyé à toute la base (pas juste aux inactifs/paniers abandonnés).",
        parameters: {
          type: "object",
          required: ["titre", "corps_template", "cible"],
          properties: {
            titre: { type: "string", description: "Titre court de la notification, identique pour tout le monde" },
            corps_template: { type: "string", description: "Corps du message. Utiliser exactement le marqueur {prenom} à l'endroit où le prénom du destinataire doit être inséré." },
            cible: { type: "string", enum: ["client", "vendeur"], description: "À qui envoyer : client ou vendeur (un seul groupe à la fois pour cette fonction)" },
            programmee_pour: { type: "string", description: "Date-heure ISO 8601 si l'envoi doit être différé/programmé, sinon ne pas inclure ce champ" }
          }
        }
      }
    }
  ];

  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Tu es l'assistant d'administration d'Aura Market CI (marketplace ivoirienne).
Date et heure actuelles (UTC) : ${maintenant}. Fuseau de référence pour les demandes de l'admin : Africa/Abidjan (UTC+0, pas de changement d'heure).
Analyse l'instruction de l'admin et appelle la fonction appropriée avec les bons paramètres.
Si l'admin mentionne un moment précis dans le futur ("demain à 18h", "programme pour vendredi 9h"),
calcule la date-heure ISO 8601 en UTC correspondante et passe-la dans "programmee_pour". Sinon ne mets pas ce champ.
Distinction importante entre les fonctions de diffusion :
- diffuser_message_libre : message identique pour tout le monde, aucune personnalisation par nom.
- annoncer_a_tous_personnalise : message personnalisé avec le prénom de chacun, envoyé à TOUTE la base clients ou vendeurs (utiliser le marqueur {prenom} dans corps_template).
- lister_paniers_abandonnes / lister_vendeurs_inactifs : personnalisé par nom, mais seulement pour un sous-ensemble ciblé (paniers non finalisés, ou vendeurs inactifs depuis X jours) — pas toute la base.
Si l'admin demande une personnalisation par nom sans mentionner de critère d'inactivité/abandon, utiliser annoncer_a_tous_personnalise.
Pour toute fonction de diffusion/annonce : n'invente JAMAIS le titre ou le corps du message à la place de l'admin.
Si l'admin n'a pas donné le texte exact à envoyer, n'appelle PAS la fonction : réponds en texte pour lui demander le titre et le contenu du message.
Si l'instruction est ambiguë, générale, ou ne correspond à aucune fonction disponible, n'appelle aucune fonction et réponds normalement en texte pour demander une précision.`
        },
        { role: "user", content: body.instruction }
      ],
      tools,
      tool_choice: "auto",
      temperature: 0.2
    })
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    return jsonResponseCors({ error: "Erreur Groq", detail: errText }, 502, request);
  }

  const groqData = await groqRes.json();
  const message = groqData?.choices?.[0]?.message;
  const toolCall = message?.tool_calls?.[0];

  if (!toolCall) {
    return jsonResponseCors({
      fonction: "non_comprise",
      reponse_libre: message?.content?.trim()
        || "Je n'ai pas compris cette instruction. Essaie par exemple : « relance les vendeurs inactifs depuis 5 jours »."
    }, 200, request);
  }

  let parametres = {};
  try {
    parametres = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    parametres = {};
  }
  const { programmee_pour, ...reste } = parametres;

  return jsonResponseCors({
    fonction: toolCall.function.name,
    parametres: reste,
    programmee_pour: programmee_pour || null
  }, 200, request);
}

/* ══════════════════════════════════════════════════════════════════════
   CRM & PROSPECTION
   ══════════════════════════════════════════════════════════════════════ */

const CRM_FENETRE_RECENCE = "qdr:w";
const AURAMARKET_LIEN_CLIENT = "www.auramarketci.com";
const AURAMARKET_MENTION_GROUPE = "On a aussi un groupe WhatsApp de vendeurs pour s'entraider 👥";

async function handleCrmProspection(request, env) {
  if (!env.SERPER_API_KEY) {
    return jsonResponseCors({ error: "SERPER_API_KEY non configurée sur le serveur" }, 500, request);
  }
  if (!env.GROQ_API_KEY) {
    return jsonResponseCors({ error: "GROQ_API_KEY non configurée sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  const motCle = (body?.motCle || "").trim();
  const ville = (body?.ville || "").trim();
  const nombreDemande = Math.max(1, Math.min(parseInt(body?.nombre, 10) || 10, 20));

  if (!motCle) return jsonResponseCors({ error: "motCle requis" }, 400, request);

  const resultat = await handleCrmProspectionInterne(motCle, ville, nombreDemande, env);
  return jsonResponseCors(resultat, 200, request);
}

async function handleCrmProspectionInterne(motCle, ville, nombreDemande, env) {
  const plateformes = [
    { site: "facebook.com", nom: "facebook", poids: 2 },
    { site: "tiktok.com", nom: "tiktok", poids: 2 },
    { site: "snapchat.com", nom: "snapchat", poids: 1 }
  ];
  const poidsTotal = plateformes.reduce((s, p) => s + p.poids, 0);

  let brutResultats = [];
  for (const p of plateformes) {
    const parPlateforme = Math.ceil((nombreDemande * p.poids) / poidsTotal) + 2;
    const requete = ville
      ? `${motCle} ${ville} site:${p.site}`
      : `${motCle} site:${p.site}`;

    try {
      const serperRes = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": env.SERPER_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          q: requete,
          num: parPlateforme,
          gl: "ci",
          hl: "fr",
          tbs: CRM_FENETRE_RECENCE
        })
      });

      if (!serperRes.ok) {
        console.error(`Serper échec pour ${p.site} (status ${serperRes.status})`);
        continue;
      }

      const data = await serperRes.json().catch(() => null);
      const results = data?.organic || [];
      for (const r of results) {
        brutResultats.push({
          plateforme: p.nom,
          titre: r.title || "",
          lien: r.link || "",
          description: r.snippet || ""
        });
      }
    } catch (err) {
      console.error(`Erreur Serper pour ${p.site} :`, err);
    }
  }

  const vus = new Set();
  brutResultats = brutResultats.filter(r => {
    if (!r.lien || vus.has(r.lien)) return false;
    vus.add(r.lien);
    return true;
  }).slice(0, nombreDemande);

  if (brutResultats.length === 0) {
    return { prospects: [], total: 0, avecTelephone: 0, ignoresDoublons: 0 };
  }

  const candidats = brutResultats.map(r => {
    const telephone = extraireTelephonesIvoiriens(r.description + " " + r.titre)[0] || null;
    return {
      nomBoutique: nettoyerNomBoutique(r.titre, r.plateforme),
      plateforme: r.plateforme,
      lienPage: r.lien,
      extraitSource: r.description.slice(0, 300),
      telephone: telephone || null,
      telephoneValide: !!telephone
    };
  });

  const telephonesConnus = await recupererTelephonesConnus(env);
  candidats.forEach(c => {
    if (c.telephoneValide && telephonesConnus.has(c.telephone)) {
      c.dejaConnu = true;
    }
  });

  const avecTelephone = candidats.filter(c => c.telephoneValide && !c.dejaConnu);
  const messages = await Promise.all(
    avecTelephone.map(c => genererMessageAccroche(c, motCle, ville, env))
  );
  avecTelephone.forEach((c, i) => {
    c.messageWhatsapp = messages[i];
    c.lienWhatsapp = `https://wa.me/${c.telephone}?text=${encodeURIComponent(messages[i])}`;
  });

  const tousLesProspects = candidats.filter(c => !c.dejaConnu);

  return {
    prospects: tousLesProspects,
    total: tousLesProspects.length,
    avecTelephone: avecTelephone.length,
    ignoresDoublons: candidats.length - tousLesProspects.length
  };
}

async function recupererTelephonesConnus(env) {
  const telephones = new Set();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return telephones;

  try {
    let offset = 0;
    const taillePage = 1000;
    for (;;) {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/crm_prospects?select=telephone&telephone=not.is.null&limit=${taillePage}&offset=${offset}`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            Accept: "application/json"
          }
        }
      );
      if (!res.ok) break;
      const rows = await res.json().catch(() => []);
      if (!Array.isArray(rows) || rows.length === 0) break;
      rows.forEach(r => { if (r.telephone) telephones.add(r.telephone); });
      if (rows.length < taillePage) break;
      offset += taillePage;
    }
  } catch (err) {
    console.error("Erreur récupération téléphones connus CRM :", err);
  }

  return telephones;
}

async function handleCrmSauvegarder(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponseCors({ error: "Configuration Supabase manquante sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  const motCle = (body?.motCle || "").trim();
  const ville = (body?.ville || "").trim();
  const prospects = Array.isArray(body?.prospects) ? body.prospects : [];

  if (prospects.length === 0) {
    return jsonResponseCors({ error: "Aucun prospect à sauvegarder" }, 400, request);
  }

  try {
    const nombreSauvegardes = await sauvegarderProspectsInterne(prospects, motCle, ville, env);
    if (nombreSauvegardes === 0) {
      return jsonResponseCors({ error: "Aucun prospect valide à sauvegarder" }, 400, request);
    }
    return jsonResponseCors({ sauvegardes: nombreSauvegardes }, 200, request);
  } catch (err) {
    return jsonResponseCors({ error: "Erreur enregistrement crm_prospects", detail: String(err?.message || err) }, 500, request);
  }
}

async function sauvegarderProspectsInterne(prospects, motCle, ville, env) {
  const lignesAvecTel = [];
  const lignesSansTel = [];
  prospects
    .filter(p => p && p.lienPage)
    .forEach(p => {
      const ligne = {
        mot_cle: motCle || null,
        ville: ville || null,
        nom_boutique: p.nomBoutique || "Boutique sans nom",
        plateforme: p.plateforme || "autre",
        lien_page: p.lienPage,
        telephone: p.telephone || null,
        telephone_valide: !!p.telephoneValide,
        extrait_source: p.extraitSource || null,
        message_whatsapp: p.messageWhatsapp || null,
        lien_whatsapp: p.lienWhatsapp || null
      };
      if (p.telephone) lignesAvecTel.push(ligne);
      else lignesSansTel.push(ligne);
    });

  if (lignesAvecTel.length === 0 && lignesSansTel.length === 0) {
    return 0;
  }

  if (lignesAvecTel.length > 0) {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/crm_prospects?on_conflict=telephone`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(lignesAvecTel)
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Échec upsert crm_prospects (avec téléphone) : ${errText}`);
    }
  }

  if (lignesSansTel.length > 0) {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/crm_prospects?on_conflict=lien_page`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(lignesSansTel)
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Échec upsert crm_prospects (sans téléphone) : ${errText}`);
    }
  }

  return lignesAvecTel.length + lignesSansTel.length;
}

function extraireTelephonesIvoiriens(texte) {
  if (!texte) return [];

  const trouves = [];
  const vus = new Set();

  const ajouter = (e164, priorite) => {
    if (!vus.has(e164)) {
      vus.add(e164);
      trouves.push({ e164, priorite });
    }
  };

  const reIntl = /(?:\+|00)225[\s.\-–]?(\d(?:[\s.\-–]?\d){7,9})/g;
  let m;
  while ((m = reIntl.exec(texte)) !== null) {
    const chiffres = m[1].replace(/[\s.\-–]/g, "");
    if (chiffres.length === 10) {
      ajouter("225" + chiffres, 3);
    } else if (chiffres.length === 9) {
      ajouter("225" + "0" + chiffres, 3);
    } else if (chiffres.length === 8) {
      ajouter("225" + chiffres, 1);
    }
  }

  const reLocal = /\b(0[12357](?:[\s.\-–]?\d){8})\b/g;
  while ((m = reLocal.exec(texte)) !== null) {
    const chiffres = m[1].replace(/[\s.\-–]/g, "");
    if (chiffres.length === 10) {
      ajouter("225" + chiffres, 2);
    }
  }

  return trouves.sort((a, b) => b.priorite - a.priorite).map(t => t.e164);
}

function nettoyerNomBoutique(titre, plateforme) {
  let nom = titre || "Boutique sans nom";
  nom = nom.replace(/\s*[|•·-]\s*(Instagram|Facebook|TikTok).*$/i, "");
  nom = nom.replace(/\s*\(@[\w.]+\)\s*/g, " ");
  nom = nom.trim();
  return nom || "Boutique sans nom";
}

async function genererMessageAccroche(candidat, motCle, ville, env) {
  const piedDeMessage = `\n\n🔗 ${AURAMARKET_LIEN_CLIENT}\n${AURAMARKET_MENTION_GROUPE}`;
  const messageSecours = `Bonjour 👋, je suis de AuraMarket, une marketplace ivoirienne. J'ai vu votre boutique ${candidat.nomBoutique} et je pense que vous seriez un excellent vendeur chez nous. On peut en discuter ?${piedDeMessage}`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `Tu écris un premier message WhatsApp de prospection commerciale pour AuraMarket, une marketplace e-commerce ivoirienne qui invite des vendeurs à ouvrir une boutique en ligne chez elle. Le message doit être court (3-4 phrases maximum), chaleureux, en français avec un style ivoirien naturel, personnalisé avec le nom de la boutique, simple et direct — l'objectif est de rendre le "oui" évident et le "non" difficile, sans être agressif ni insistant. Termine par une question ouverte pour engager la conversation. Ne mentionne PAS de lien ni de groupe WhatsApp : ces éléments seront ajoutés automatiquement après ton texte. Réponds UNIQUEMENT avec le texte du message, sans guillemets, sans introduction.`
          },
          {
            role: "user",
            content: `Boutique : "${candidat.nomBoutique}" (trouvée sur ${candidat.plateforme}, secteur "${motCle}"${ville ? `, ville ${ville}` : ""}). Contexte trouvé en ligne : "${candidat.extraitSource.slice(0, 200)}".`
          }
        ],
        temperature: 0.75,
        max_tokens: 180
      })
    });

    if (!groqRes.ok) return messageSecours;
    const data = await groqRes.json();
    const texte = data?.choices?.[0]?.message?.content?.trim();
    return texte ? `${texte}${piedDeMessage}` : messageSecours;
  } catch (err) {
    console.error("Erreur génération message accroche CRM :", err);
    return messageSecours;
  }
}

async function checkRateLimit(request, env, ctx) {
  if (!env.RATE_LIMIT_KV) return null;

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `rl:${ip}:${Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW)}`;

  const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || "0");

  if (current >= RATE_LIMIT_REQUESTS) {
    return jsonResponseCors(
      { error: "Trop de requêtes. Réessaie dans quelques secondes." },
      429, request
    );
  }

  ctx.waitUntil(
    env.RATE_LIMIT_KV.put(key, String(current + 1), {
      expirationTtl: RATE_LIMIT_WINDOW * 2
    })
  );

  return null;
}

function checkAdminAuth(request, env) {
  const token = request.headers.get("X-Admin-Token");
  if (!env.ADMIN_SECRET || token !== env.ADMIN_SECRET) {
    return jsonResponseCors({ error: "Accès non autorisé" }, 403, request);
  }
  return null;
}

function checkOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());

  if (allowed.includes("*") || !origin) return null;
  if (allowed.includes(origin)) return null;

  return jsonResponseCors({ error: `Origine non autorisée: ${origin}` }, 403, request);
}

function corsPreflightResponse(request, env) {
  const origin = request.headers.get("Origin") || "*";
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
  const finalOrigin = allowed.includes("*")
    ? "*"
    : allowed.includes(origin)
      ? origin
      : "null";

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": finalOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token, Prefer, Range",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function addCorsHeaders(headers, request) {
  const origin = request.headers.get("Origin") || "*";
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Vary", "Origin");
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonResponseCors(data, status, request) {
  const headers = new Headers({ "Content-Type": "application/json" });
  addCorsHeaders(headers, request);
  return new Response(JSON.stringify(data), { status, headers });
}


/* ══════════════════════════════════════════════════════════════════════
   MODULE AUTOMATISATION — début
   ══════════════════════════════════════════════════════════════════════ */

/* Les 4 automatisations natives, toujours présentes en base et jamais
   déconnectables depuis le panneau (voir handleAutomatisationsDeconnecter). */
const AUTOMATISATIONS_CLES_NATIVES = ["moderation_produits", "verification_kyc", "analyse_signalements", "publication_tiktok"];

/* Les 18 modules externes du dashboard, connectables/déconnectables à la
   volée par l'admin. Doit rester synchronisé avec MAUT_TOUS_MODULES côté
   front (assets/module-automatisation/module-automatisation.js) ET avec la
   contrainte automatisations_config_cle_check côté Supabase. */
const AUTOMATISATIONS_CLES_EXTERNES = [
  "utilisateurs", "vendeurs", "gestion_admins",
  "kyc", "validation", "signalements",
  "produits", "commandes", "boutiques",
  "bannieres", "diffusion", "crm", "marketing", "contenus",
  "assistant_ia", "logs", "parametres", "compte"
];

const AUTOMATISATIONS_CLES_TOUTES = [...AUTOMATISATIONS_CLES_NATIVES, ...AUTOMATISATIONS_CLES_EXTERNES];

async function handleAutomatisationsListe(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponseCors({ error: "Configuration Supabase manquante" }, 500, request);
  }
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/automatisations_config?select=*&order=cle.asc`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: "application/json"
      }
    }
  );
  if (!res.ok) return jsonResponseCors({ error: "Échec lecture automatisations_config" }, 502, request);
  const rows = await res.json().catch(() => []);
  return jsonResponseCors({ automatisations: rows }, 200, request);
}

async function handleAutomatisationsToggle(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponseCors({ error: "Configuration Supabase manquante" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  const cle = body?.cle;
  if (!AUTOMATISATIONS_CLES_TOUTES.includes(cle)) {
    return jsonResponseCors({ error: "cle invalide", clesValides: AUTOMATISATIONS_CLES_TOUTES }, 400, request);
  }

  const patch = {};
  if (typeof body.actif === "boolean") patch.actif = body.actif;
  if (typeof body.validation_auto === "boolean") patch.validation_auto = body.validation_auto;
  if (typeof body.seuil_confiance === "number") {
    if (body.seuil_confiance < 0 || body.seuil_confiance > 1) {
      return jsonResponseCors({ error: "seuil_confiance doit être entre 0 et 1" }, 400, request);
    }
    patch.seuil_confiance = body.seuil_confiance;
  }
  if (Object.keys(patch).length === 0) {
    return jsonResponseCors({ error: "Aucun champ à mettre à jour" }, 400, request);
  }
  patch.updated_at = new Date().toISOString();

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/automatisations_config?cle=eq.${encodeURIComponent(cle)}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(patch)
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return jsonResponseCors({ error: "Échec mise à jour", detail: errText }, 502, request);
  }
  const rows = await res.json().catch(() => []);
  // PATCH sur une cle sans ligne existante retourne 200 avec un tableau vide
  // (comportement PostgREST normal) : on distingue explicitement ce cas
  // pour ne jamais laisser croire au front qu'un réglage a été appliqué
  // alors que le module n'est pas (ou plus) connecté au noyau.
  if (!rows?.[0]) {
    return jsonResponseCors({ error: "Module non connecté au noyau : connecte-le d'abord via /automatisations/connecter" }, 404, request);
  }
  return jsonResponseCors({ automatisation: rows[0] }, 200, request);
}

/* ── Connexion d'un module externe au noyau : crée (ou réactive) sa ligne
   de config en base. Upsert idempotent : si la ligne existe déjà (module
   déjà connecté), on renvoie simplement son état actuel sans l'écraser. */
async function handleAutomatisationsConnecter(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponseCors({ error: "Configuration Supabase manquante" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  const cle = body?.cle;
  if (!AUTOMATISATIONS_CLES_EXTERNES.includes(cle)) {
    return jsonResponseCors({ error: "cle invalide pour une connexion externe", clesValides: AUTOMATISATIONS_CLES_EXTERNES }, 400, request);
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/automatisations_config?on_conflict=cle`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation"
      },
      body: JSON.stringify({ cle, actif: false, validation_auto: false, seuil_confiance: 0.85 })
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return jsonResponseCors({ error: "Échec de la connexion du module", detail: errText }, 502, request);
  }
  let rows = await res.json().catch(() => []);
  // "resolution=ignore-duplicates" renvoie un tableau vide si la ligne
  // existait déjà (rien inséré) : on relit alors la ligne existante pour
  // que le front reçoive toujours l'état réel du module.
  if (!rows?.[0]) {
    const relecture = await fetch(
      `${env.SUPABASE_URL}/rest/v1/automatisations_config?cle=eq.${encodeURIComponent(cle)}&select=*&limit=1`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          Accept: "application/json"
        }
      }
    );
    rows = await relecture.json().catch(() => []);
  }
  return jsonResponseCors({ automatisation: rows?.[0] || null }, 200, request);
}

/* ── Déconnexion d'un module externe : supprime sa ligne de config.
   Les 4 automatisations natives ne peuvent jamais être déconnectées par
   cette route (le front ne propose d'ailleurs pas le bouton pour elles). */
async function handleAutomatisationsDeconnecter(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponseCors({ error: "Configuration Supabase manquante" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  const cle = body?.cle;
  if (!AUTOMATISATIONS_CLES_EXTERNES.includes(cle)) {
    return jsonResponseCors({ error: "cle invalide, ou automatisation native non déconnectable", clesValides: AUTOMATISATIONS_CLES_EXTERNES }, 400, request);
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/automatisations_config?cle=eq.${encodeURIComponent(cle)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Prefer: "return=minimal"
      }
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return jsonResponseCors({ error: "Échec de la déconnexion du module", detail: errText }, 502, request);
  }
  return jsonResponseCors({ deconnecte: true, cle }, 200, request);
}

async function recupererConfigAutomatisations(env) {
  const map = {};
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/automatisations_config?select=*`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          Accept: "application/json"
        }
      }
    );
    if (!res.ok) return map;
    const rows = await res.json().catch(() => []);
    (rows || []).forEach(r => { map[r.cle] = r; });
  } catch (err) {
    console.error("[automatisations] Erreur lecture config :", err);
  }
  return map;
}

async function handleAutomatisationsExecuterManuel(request, env) {
  const body = await request.json().catch(() => null);
  const cle = body?.cle;
  if (!AUTOMATISATIONS_CLES_TOUTES.includes(cle)) {
    return jsonResponseCors({ error: "cle invalide pour exécution manuelle", clesValides: AUTOMATISATIONS_CLES_TOUTES }, 400, request);
  }

  const config = await recupererConfigAutomatisations(env);
  const cfg = config[cle];
  if (!cfg) return jsonResponseCors({ error: "Module non connecté au noyau : connecte-le d'abord" }, 404, request);

  let resultat;
  try {
    if (cle === "moderation_produits") resultat = await traiterModerationProduits(cfg, env);
    else if (cle === "verification_kyc") resultat = await traiterVerificationKyc(cfg, env);
    else if (cle === "analyse_signalements") resultat = await traiterAnalyseSignalements(cfg, env);
    else if (cle === "publication_tiktok") resultat = await traiterPublicationTiktok(cfg, env);
    else resultat = await traiterModuleGenerique(cle, cfg, env);
  } catch (err) {
    console.error(`[automatisations] Erreur exécution manuelle ${cle} :`, err);
    return jsonResponseCors({ error: "Échec exécution", detail: String(err?.message || err) }, 500, request);
  }

  return jsonResponseCors({ cle, resultat }, 200, request);
}

/* ── Modules externes connectés au noyau mais sans logique de décision IA
   propre pour l'instant. Le module reste pleinement pilotable (actif,
   validation_auto, seuil, journal) : "Lancer maintenant" répond juste
   honnêtement qu'il n'y a rien à traiter tant que la logique métier n'est
   pas définie pour ce module, plutôt que d'échouer ou de fabriquer un
   faux résultat. */
async function traiterModuleGenerique(cle, cfg, env) {
  return {
    traites: 0,
    statut: "logique_non_configuree",
    info: "Module connecté au noyau AURA (activable, seuil configurable, journalisé), mais aucune logique de décision automatique n'est encore définie pour lui."
  };
}

async function handleAutomatisationsLogs(request, env) {
  const url = new URL(request.url);
  const cle = url.searchParams.get("cle");
  const limit = Math.min(parseInt(url.searchParams.get("limit"), 10) || 50, 200);

  let query = `${env.SUPABASE_URL}/rest/v1/automatisation_logs?select=*&order=created_at.desc&limit=${limit}`;
  if (cle) query += `&automatisation_cle=eq.${encodeURIComponent(cle)}`;

  const res = await fetch(query, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) return jsonResponseCors({ error: "Échec lecture logs" }, 502, request);
  const rows = await res.json().catch(() => []);
  return jsonResponseCors({ logs: rows }, 200, request);
}

async function handleAutomatisationAnnuler(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.log_id || !body?.admin_id) {
    return jsonResponseCors({ error: "log_id et admin_id requis" }, 400, request);
  }

  const logRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/automatisation_logs?id=eq.${body.log_id}&select=*&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: "application/json"
      }
    }
  );
  if (!logRes.ok) return jsonResponseCors({ error: "Log introuvable" }, 404, request);
  const logs = await logRes.json().catch(() => []);
  const log = logs?.[0];
  if (!log) return jsonResponseCors({ error: "Log introuvable" }, 404, request);

  const tablePatch = { statut: "en_attente" };
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/${log.cible_table}?id=eq.${log.cible_id}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(tablePatch)
    }
  ).catch(err => console.error("[automatisations] Erreur restauration cible :", err));

  await fetch(
    `${env.SUPABASE_URL}/rest/v1/automatisation_logs?id=eq.${body.log_id}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ annule_par_admin: body.admin_id, annule_le: new Date().toISOString() })
    }
  );

  return jsonResponseCors({ annule: true }, 200, request);
}

async function enregistrerLogAutomatisation(env, { cle, cibleTable, cibleId, decision, confiance, motif, rawReponseIa }) {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/automatisation_logs`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        automatisation_cle: cle,
        cible_table: cibleTable,
        cible_id: cibleId,
        decision,
        confiance: confiance ?? null,
        motif: motif || null,
        raw_reponse_ia: rawReponseIa || null
      })
    });
  } catch (err) {
    console.error("[automatisations] Erreur écriture log :", err);
  }
}

async function traiterModerationProduits(cfg, env) {
  if (!env.GROQ_API_KEY) return { erreur: "GROQ_API_KEY non configurée" };

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/produits_validation?statut=eq.en_attente&select=*&order=soumis_le.asc&limit=20`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: "application/json"
      }
    }
  );
  if (!res.ok) return { erreur: "Échec lecture produits_validation" };
  const items = await res.json().catch(() => []);
  if (!items.length) return { traites: 0 };

  let compteurs = { valide: 0, rejete: 0, laisse_en_attente: 0, erreur: 0 };

  for (const item of items) {
    try {
      const analyse = await analyserContenuAvecGroq({
        env,
        systemPrompt: `Tu es modérateur de contenu pour AuraMarket CI, une marketplace e-commerce ivoirienne.
Analyse la fiche produit soumise par un vendeur et détermine si elle respecte les règles :
- Nom et description cohérents, pas de contenu offensant, trompeur, illégal (arme, drogue, contrefaçon explicitement annoncée, contenu à caractère sexuel).
- Prix plausible pour le produit décrit (pas de prix à 0 ou aberrant qui suggère une arnaque).
- Pas de coordonnées personnelles (numéro de téléphone, WhatsApp, email) insérées dans le nom ou la description pour contourner la plateforme.
Réponds UNIQUEMENT avec un JSON valide, sans texte autour :
{ "decision": "valide" | "rejete" | "incertain", "confiance": 0.0 à 1.0, "motif": "courte explication en français, utile pour le vendeur si rejeté" }`,
        userContent: `Produit : "${item.nom}"\nPrix : ${item.prix} FCFA\nImage : ${item.image_url || "aucune"}`
      });

      if (!analyse) {
        compteurs.erreur++;
        await enregistrerLogAutomatisation(env, { cle: "moderation_produits", cibleTable: "produits_validation", cibleId: item.id, decision: "erreur", motif: "Réponse IA invalide" });
        continue;
      }

      const decisionFinale = decisionAutoOuAttente(cfg, analyse);
      await appliquerDecisionProduit(item, decisionFinale, analyse, env);
      compteurs[decisionFinale.decisionLog]++;

      await enregistrerLogAutomatisation(env, {
        cle: "moderation_produits",
        cibleTable: "produits_validation",
        cibleId: item.id,
        decision: decisionFinale.decisionLog,
        confiance: analyse.confiance,
        motif: analyse.motif,
        rawReponseIa: analyse
      });
    } catch (err) {
      console.error("[moderation_produits] Erreur item", item.id, err);
      compteurs.erreur++;
    }
  }

  return { traites: items.length, ...compteurs };
}

async function appliquerDecisionProduit(item, decisionFinale, analyse, env) {
  if (decisionFinale.decisionLog === "laisse_en_attente") return;

  const nouveauStatut = decisionFinale.decisionLog === "valide" ? "valide" : "refuse";
  const maintenant = new Date().toISOString();

  await fetch(`${env.SUPABASE_URL}/rest/v1/produits_validation?id=eq.${item.id}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      statut: nouveauStatut,
      motif_refus: nouveauStatut === "refuse" ? analyse.motif : null,
      traite_le: maintenant
    })
  });

  if (item.produit_id) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/produits?id=eq.${item.produit_id}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        statut: nouveauStatut,
        actif: nouveauStatut === "valide",
        motif_refus: nouveauStatut === "refuse" ? analyse.motif : null
      })
    });
  }
}

async function traiterVerificationKyc(cfg, env) {
  if (!env.GROQ_API_KEY) return { erreur: "GROQ_API_KEY non configurée" };

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/kyc_vendeurs?statut=eq.en_attente&select=*,users_vendeurs(nom_responsable,nom_boutique)&order=submitted_at.asc&limit=20`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: "application/json"
      }
    }
  );
  if (!res.ok) return { erreur: "Échec lecture kyc_vendeurs" };
  const items = await res.json().catch(() => []);
  if (!items.length) return { traites: 0 };

  let compteurs = { valide: 0, rejete: 0, laisse_en_attente: 0, erreur: 0 };

  for (const item of items) {
    try {
      const documentsComplets = !!(item.selfie_url && item.cni_recto_url && (item.type_document !== "cni" || item.cni_verso_url));

      const analyse = await analyserContenuAvecGroq({
        env,
        systemPrompt: `Tu es un vérificateur KYC pour AuraMarket CI. Tu analyses UNIQUEMENT la cohérence déclarative d'un dossier KYC vendeur (pas le contenu visuel des images, que tu ne peux pas voir) :
- Le nombre et le type de documents fournis correspondent-ils à ce qui est attendu pour le type_document déclaré (CNI = recto+verso+selfie, passeport/récépissé/CMU = document+selfie) ?
- Le nom du responsable et de la boutique semblent-ils cohérents (pas de champs vides suspects, pas de valeurs de test comme "test" ou "aaaa") ?
Sois PRUDENT : en cas de doute, mets confiance basse et decision "incertain" pour laisser un humain vérifier visuellement les pièces.
Réponds UNIQUEMENT avec un JSON valide :
{ "decision": "valide" | "rejete" | "incertain", "confiance": 0.0 à 1.0, "motif": "explication courte" }`,
        userContent: `Type de document déclaré : ${item.type_document}\nDocuments complets fournis : ${documentsComplets ? "oui" : "non"}\nNom responsable : ${item.users_vendeurs?.nom_responsable || "inconnu"}\nNom boutique : ${item.users_vendeurs?.nom_boutique || "inconnu"}`
      });

      if (!analyse) {
        compteurs.erreur++;
        continue;
      }

      if (!documentsComplets && analyse.decision === "valide") {
        analyse.decision = "incertain";
        analyse.confiance = Math.min(analyse.confiance, 0.5);
        analyse.motif = "Documents incomplets — vérification humaine requise.";
      }

      const decisionFinale = decisionAutoOuAttente(cfg, analyse);
      await appliquerDecisionKyc(item, decisionFinale, analyse, env);
      compteurs[decisionFinale.decisionLog]++;

      await enregistrerLogAutomatisation(env, {
        cle: "verification_kyc",
        cibleTable: "kyc_vendeurs",
        cibleId: item.id,
        decision: decisionFinale.decisionLog,
        confiance: analyse.confiance,
        motif: analyse.motif,
        rawReponseIa: analyse
      });
    } catch (err) {
      console.error("[verification_kyc] Erreur item", item.id, err);
      compteurs.erreur++;
    }
  }

  return { traites: items.length, ...compteurs };
}

async function appliquerDecisionKyc(item, decisionFinale, analyse, env) {
  if (decisionFinale.decisionLog === "laisse_en_attente") return;

  const nouveauStatut = decisionFinale.decisionLog === "valide" ? "valide" : "rejete";
  await fetch(`${env.SUPABASE_URL}/rest/v1/kyc_vendeurs?id=eq.${item.id}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      statut: nouveauStatut,
      motif_rejet: nouveauStatut === "rejete" ? analyse.motif : null,
      reviewed_at: new Date().toISOString()
    })
  });
}

async function traiterAnalyseSignalements(cfg, env) {
  if (!env.GROQ_API_KEY) return { erreur: "GROQ_API_KEY non configurée" };

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/signalements?statut=eq.nouveau&select=*&order=created_at.asc&limit=20`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: "application/json"
      }
    }
  );
  if (!res.ok) return { erreur: "Échec lecture signalements" };
  const items = await res.json().catch(() => []);
  if (!items.length) return { traites: 0 };

  let compteurs = { signale_urgent: 0, laisse_en_attente: 0, erreur: 0 };

  for (const item of items) {
    try {
      const analyse = await analyserContenuAvecGroq({
        env,
        systemPrompt: `Tu es assistant de modération pour AuraMarket CI. Tu analyses un signalement client pour déterminer sa GRAVITÉ (jamais pour le clôturer toi-même) :
- "urgent" : arnaque probable, sécurité/santé, contenu illégal, vendeur potentiellement dangereux → doit remonter en haut de la pile admin.
- "a_revoir" : désaccord commercial classique, qualité produit, retard livraison → traitement normal.
Réponds UNIQUEMENT avec un JSON valide :
{ "decision": "urgent" | "a_revoir", "confiance": 0.0 à 1.0, "motif": "courte explication" }`,
        userContent: `Motif signalé : ${item.motif}\nDescription : ${item.description || "aucune"}`
      });

      if (!analyse) {
        compteurs.erreur++;
        continue;
      }

      const seuil = Number(cfg.seuil_confiance ?? 0.8);
      const doitPasserUrgent = cfg.actif && cfg.validation_auto && analyse.decision === "urgent" && analyse.confiance >= seuil;

      if (doitPasserUrgent && item.gravite !== "urgent") {
        await fetch(`${env.SUPABASE_URL}/rest/v1/signalements?id=eq.${item.id}`, {
          method: "PATCH",
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({ gravite: "urgent", statut: "en_cours" })
        });
        compteurs.signale_urgent++;
      } else {
        compteurs.laisse_en_attente++;
      }

      await enregistrerLogAutomatisation(env, {
        cle: "analyse_signalements",
        cibleTable: "signalements",
        cibleId: item.id,
        decision: doitPasserUrgent ? "signale_urgent" : "laisse_en_attente",
        confiance: analyse.confiance,
        motif: analyse.motif,
        rawReponseIa: analyse
      });
    } catch (err) {
      console.error("[analyse_signalements] Erreur item", item.id, err);
      compteurs.erreur++;
    }
  }

  return { traites: items.length, ...compteurs };
}

async function analyserContenuAvecGroq({ env, systemPrompt, userContent }) {
  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: "json_object" }
      })
    });

    if (!groqRes.ok) {
      console.error("[automatisations] Erreur Groq", await groqRes.text().catch(() => ""));
      return null;
    }

    const data = await groqRes.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.decision || typeof parsed.confiance !== "number") return null;

    parsed.confiance = Math.max(0, Math.min(1, parsed.confiance));
    return parsed;
  } catch (err) {
    console.error("[automatisations] Exception analyse Groq :", err);
    return null;
  }
}

function decisionAutoOuAttente(cfg, analyse) {
  if (!cfg.validation_auto) {
    return { decisionLog: "laisse_en_attente" };
  }
  if (analyse.decision === "incertain") {
    return { decisionLog: "laisse_en_attente" };
  }
  const seuil = Number(cfg.seuil_confiance ?? 0.85);
  if (analyse.confiance < seuil) {
    return { decisionLog: "laisse_en_attente" };
  }
  return { decisionLog: analyse.decision === "valide" ? "valide" : "rejete" };
}

async function traiterPublicationTiktok(cfg, env) {
  if (!env.TIKTOK_ACCESS_TOKEN) {
    return { statut: "en_attente_validation_tiktok", info: "Clés TikTok non configurées — module prêt mais inactif tant que l'app n'est pas validée par TikTok for Developers." };
  }

  // ── Une fois les clés obtenues, la logique ira ici : ──────────────────
  // 1) SELECT publications_tiktok WHERE statut = 'en_attente' (ou
  //    'programmee' avec programmee_pour <= now())
  // 2) Pour chaque item : upload vidéo/photo via TikTok Content Posting API
  // 3) PATCH publications_tiktok SET statut='publiee', tiktok_post_id=...,
  //    tiktok_permalink=..., publiee_at=now()
  // 4) En cas d'échec : PATCH statut='echec', derniere_erreur=...,
  //    tentatives = tentatives + 1
  // ────────────────────────────────────────────────────────────────────

  return { statut: "non_implemente" };
}

async function executerAutomatisationsCron(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.GROQ_API_KEY) {
    console.error("[automatisations cron] Secrets manquants, exécution annulée.");
    return;
  }

  const config = await recupererConfigAutomatisations(env);
  const rapport = {};

  if (config.moderation_produits?.actif) {
    rapport.moderation_produits = await traiterModerationProduits(config.moderation_produits, env).catch(err => ({ erreur: String(err) }));
  }
  if (config.verification_kyc?.actif) {
    rapport.verification_kyc = await traiterVerificationKyc(config.verification_kyc, env).catch(err => ({ erreur: String(err) }));
  }
  if (config.analyse_signalements?.actif) {
    rapport.analyse_signalements = await traiterAnalyseSignalements(config.analyse_signalements, env).catch(err => ({ erreur: String(err) }));
  }
  if (config.publication_tiktok?.actif) {
    rapport.publication_tiktok = await traiterPublicationTiktok(config.publication_tiktok, env).catch(err => ({ erreur: String(err) }));
  }

  const totalDecisions = Object.values(rapport).reduce((s, r) => s + (r?.valide || 0) + (r?.rejete || 0) + (r?.signale_urgent || 0), 0);
  console.log("[automatisations cron] Rapport :", JSON.stringify(rapport));

  if (totalDecisions > 0) {
    await envoyerPushAuxAdmins(
      env,
      "Automatisation ⚙️",
      `${totalDecisions} décision(s) automatique(s) prise(s). Consulte les logs pour vérifier.`
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════
   MODULE AUTOMATISATION — fin
   ══════════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════════
   MODULE PRONOSTICS — début

   Fonctionnement : l'admin sélectionne/crée un match, puis déclenche une
   analyse. Chaque provider IA reçoit le même prompt + les mêmes stats et
   répond indépendamment avec un pronostic (résultat, score, confiance).
   Toutes les réponses sont sauvegardées, puis un consensus est calculé
   par vote pondéré par la confiance de chaque IA.

   Multi-IA : chaque provider (Groq, OpenAI, Gemini, DeepSeek, Mistral,
   xAI, Claude) ne s'active QUE si sa clé est présente dans les secrets du
   Worker — voir construirePronosticsProviders(env) ci-dessous. Ajouter ou
   retirer une clé dans Cloudflare suffit à faire apparaître/disparaître
   ce provider du panel, sans toucher au code.
   ══════════════════════════════════════════════════════════════════════ */

/* Chaque provider ne s'active QUE si sa clé est présente dans les secrets
   du Worker (env.XXX_API_KEY). Ajouter une clé dans Cloudflare suffit à
   faire apparaître ce provider dans le panel — aucune autre modification
   de code n'est nécessaire. Retire une clé pour désactiver le provider.

   Modèles par défaut ci-dessous ; surchageables sans toucher au code via
   les secrets optionnels GROQ_MODELS / OPENAI_MODEL / GEMINI_MODEL /
   DEEPSEEK_MODEL / MISTRAL_MODEL / XAI_MODEL / WORKERS_AI_MODEL (les
   catalogues de modèles évoluent souvent et certains sont décommissionnés
   sans préavis — si un provider échoue avec une erreur "decommissioned"
   ou "model not found", corrige le modèle via son secret _MODEL sans
   avoir besoin de redéployer du code). */
function construirePronosticsProviders(env) {
  const providers = [];

  // ── Groq : plusieurs modèles distincts hébergés = plusieurs avis indépendants.
  //    Liste par défaut volontairement courte et conservatrice (modèles stables
  //    déjà utilisés ailleurs dans ce Worker) ; personnalisable via GROQ_MODELS
  //    (IDs séparés par des virgules) si tu veux en ajouter/retirer. ──
  if (env.GROQ_API_KEY) {
    const modelesGroq = (env.GROQ_MODELS || "llama-3.3-70b-versatile,llama-3.1-8b-instant")
      .split(",").map(s => s.trim()).filter(Boolean);
    modelesGroq.forEach(m => providers.push({
      id: "groq_" + slugifyModel(m), label: `${m} (Groq)`,
      run: (sp, uc) => genererPronosticGroq(m, sp, uc, env)
    }));
  }

  // ── Cloudflare Workers AI : déjà disponible via le binding env.AI (utilisé
  //    ailleurs dans ce Worker pour la génération d'images et la vision) —
  //    aucune clé séparée à configurer. Modèle personnalisable via
  //    WORKERS_AI_MODEL si celui par défaut est un jour retiré du catalogue. ──
  if (env.AI) {
    const model = env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
    providers.push({
      id: "workersai_" + slugifyModel(model), label: `Workers AI (${model})`,
      run: (sp, uc) => genererPronosticWorkersAI(model, sp, uc, env)
    });
  }

  // ── OpenAI ──
  if (env.OPENAI_API_KEY) {
    const model = env.OPENAI_MODEL || "gpt-4o-mini";
    providers.push({
      id: "openai_" + slugifyModel(model), label: `OpenAI (${model})`,
      run: (sp, uc) => genererPronosticChatCompatible("https://api.openai.com/v1/chat/completions", env.OPENAI_API_KEY, model, sp, uc)
    });
  }

  // ── Google Gemini ──
  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || "gemini-2.0-flash";
    providers.push({
      id: "gemini_" + slugifyModel(model), label: `Gemini (${model})`,
      run: (sp, uc) => genererPronosticGemini(model, sp, uc, env.GEMINI_API_KEY)
    });
  }

  // ── DeepSeek (API directe, distincte des modèles DeepSeek hébergés par Groq) ──
  if (env.DEEPSEEK_API_KEY) {
    const model = env.DEEPSEEK_MODEL || "deepseek-chat";
    providers.push({
      id: "deepseek_" + slugifyModel(model), label: `DeepSeek (${model})`,
      run: (sp, uc) => genererPronosticChatCompatible("https://api.deepseek.com/chat/completions", env.DEEPSEEK_API_KEY, model, sp, uc)
    });
  }

  // ── Mistral ──
  if (env.MISTRAL_API_KEY) {
    const model = env.MISTRAL_MODEL || "mistral-large-latest";
    providers.push({
      id: "mistral_" + slugifyModel(model), label: `Mistral (${model})`,
      run: (sp, uc) => genererPronosticChatCompatible("https://api.mistral.ai/v1/chat/completions", env.MISTRAL_API_KEY, model, sp, uc)
    });
  }

  // ── xAI Grok ──
  if (env.XAI_API_KEY) {
    const model = env.XAI_MODEL || "grok-2-latest";
    providers.push({
      id: "xai_" + slugifyModel(model), label: `Grok (${model})`,
      run: (sp, uc) => genererPronosticChatCompatible("https://api.x.ai/v1/chat/completions", env.XAI_API_KEY, model, sp, uc)
    });
  }

  // ── Anthropic Claude (optionnel, désactivé tant qu'ANTHROPIC_API_KEY n'est pas fourni) ──
  if (env.ANTHROPIC_API_KEY) {
    const model = env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
    providers.push({
      id: "anthropic_" + slugifyModel(model), label: `Claude (${model})`,
      run: (sp, uc) => genererPronosticAnthropic(model, sp, uc, env.ANTHROPIC_API_KEY)
    });
  }

  return providers;
}

function slugifyModel(model) {
  return String(model).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function handlePronosticsAnalyser(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponseCors({ error: "Configuration Supabase manquante sur le serveur" }, 500, request);
  }

  const body = await request.json().catch(() => null);
  const matchId = body?.match_id;
  if (!matchId) return jsonResponseCors({ error: "match_id requis" }, 400, request);

  const resultat = await analyserMatchInterne(matchId, env);
  if (resultat.error) return jsonResponseCors(resultat, resultat.statusCode || 500, request);

  return jsonResponseCors(resultat, 200, request);
}

/* ── Cœur de l'analyse d'UN match, réutilisé par :
   - la route HTTP /proxy/ai/pronostics/analyser (déclenchement manuel)
   - la génération quotidienne automatique (handlePronosticsGenererDuJour)
   Ne renvoie jamais d'exception : toute erreur est encapsulée dans le
   résultat ({ error, statusCode }) pour que l'appelant décide quoi faire. ── */
async function analyserMatchInterne(matchId, env) {
  const matchRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pronostics_matchs?id=eq.${matchId}&select=*&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: "application/json"
      }
    }
  );
  if (!matchRes.ok) return { error: "Échec lecture du match", statusCode: 502 };
  const matchRows = await matchRes.json().catch(() => []);
  const match = Array.isArray(matchRows) && matchRows[0] ? matchRows[0] : null;
  if (!match) return { error: "Match introuvable", statusCode: 404 };

  await patchPronosticsMatch(matchId, { statut: "analyse" }, env);

  const systemPrompt = construirePromptPronostic();
  const userContent = construireContenuMatch(match);

  const tousLesProviders = construirePronosticsProviders(env);

  if (tousLesProviders.length === 0) {
    await patchPronosticsMatch(matchId, { statut: "erreur" }, env);
    return {
      error: "Aucune clé IA configurée sur le serveur. Ajoute au moins une des clés suivantes dans les secrets du Worker : GROQ_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, MISTRAL_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY.",
      statusCode: 500
    };
  }

  const resultats = await Promise.all(tousLesProviders.map(async provider => {
    try {
      const r = await provider.run(systemPrompt, userContent);
      if (!r) throw new Error("Réponse vide");
      return {
        provider: provider.id,
        resultat_probable: r.resultat_probable,
        score_probable: r.score_probable || null,
        confiance: r.confiance,
        analyse_texte: r.analyse_texte || null,
        erreur: null
      };
    } catch (err) {
      console.error(`[pronostics] Provider ${provider.id} en échec :`, err);
      return {
        provider: provider.id,
        resultat_probable: null,
        score_probable: null,
        confiance: null,
        analyse_texte: null,
        erreur: String(err?.message || err)
      };
    }
  }));

  const lignesReponses = resultats.map(r => ({ match_id: matchId, ...r }));
  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/pronostics_ia_reponses`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(lignesReponses)
  });
  if (!insertRes.ok) {
    console.error("[pronostics] Erreur sauvegarde réponses IA :", await insertRes.text().catch(() => ""));
  }

  const valides = resultats.filter(r => r.resultat_probable && typeof r.confiance === "number");
  const synthese = calculerConsensusPronostic(valides);

  const syntheseRes = await fetch(`${env.SUPABASE_URL}/rest/v1/pronostics_synthese?on_conflict=match_id`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      match_id: matchId,
      consensus_resultat: synthese.consensus_resultat,
      score_consensus: synthese.score_consensus,
      confiance_moyenne: synthese.confiance_moyenne,
      nombre_ia_consultees: valides.length
    })
  });
  if (!syntheseRes.ok) {
    console.error("[pronostics] Erreur sauvegarde synthèse :", await syntheseRes.text().catch(() => ""));
  }

  await patchPronosticsMatch(matchId, { statut: valides.length > 0 ? "termine" : "erreur" }, env);

  return {
    match_id: matchId,
    reponses: resultats,
    synthese: { ...synthese, nombre_ia_consultees: valides.length, nombre_ia_interrogees: resultats.length }
  };
}

async function patchPronosticsMatch(matchId, patch, env) {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/pronostics_matchs?id=eq.${matchId}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(patch)
    });
  } catch (err) {
    console.error("[pronostics] Erreur mise à jour match :", err);
  }
}

function construirePromptPronostic() {
  return `Tu es un analyste sportif expert en football. Tu analyses un match à venir et tu donnes un pronostic chiffré, en te basant UNIQUEMENT sur les informations et statistiques fournies par l'utilisateur (forme récente, confrontations directes, contexte, blessures si mentionnées).
Si peu ou pas de statistiques sont fournies, base-toi sur ta connaissance générale des deux équipes, mais indique alors une confiance plus basse (0.3 à 0.5 maximum) pour refléter l'incertitude — ne jamais afficher une confiance élevée sans données concrètes pour la justifier.
Sois honnête et nuancé : un pronostic incertain avec une confiance basse est plus utile qu'une fausse certitude.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, au format exact :
{
  "resultat_probable": "domicile" | "nul" | "exterieur",
  "score_probable": "ex: 2-1",
  "confiance": 0.0 à 1.0,
  "analyse_texte": "2 à 3 phrases expliquant le raisonnement, en français"
}`;
}

function construireContenuMatch(match) {
  const stats = match.stats_json
    ? JSON.stringify(match.stats_json)
    : "aucune statistique fournie — base ton analyse sur ta connaissance générale des équipes et indique une confiance modérée à basse";
  return `Match : ${match.equipe_domicile} (domicile) vs ${match.equipe_exterieur} (extérieur)
Compétition : ${match.competition || "non précisée"}
Date : ${match.date_match || "non précisée"}
Statistiques disponibles : ${stats}`;
}

/* ── Parsing JSON tolérant : la consigne du prompt demande du JSON pur,
   mais certains providers ajoutent parfois des balises markdown ou du
   texte autour malgré response_format. On tente un parse direct, puis on
   retombe sur une extraction du premier bloc {...} trouvé. ── */
function parsePronosticJSON(raw) {
  let texte = String(raw || "").trim();
  texte = texte.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(texte);
  } catch {
    const debut = texte.indexOf("{");
    const fin = texte.lastIndexOf("}");
    if (debut === -1 || fin === -1 || fin <= debut) throw new Error("Réponse non-JSON");
    parsed = JSON.parse(texte.slice(debut, fin + 1));
  }

  if (!["domicile", "nul", "exterieur"].includes(parsed.resultat_probable)) {
    throw new Error("resultat_probable invalide : " + parsed.resultat_probable);
  }
  parsed.confiance = Math.max(0, Math.min(1, Number(parsed.confiance) || 0));
  return parsed;
}

async function genererPronosticGroq(model, systemPrompt, userContent, env) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq (${model}) : ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Réponse vide de Groq");
  return parsePronosticJSON(raw);
}

/* ── Cloudflare Workers AI : appelée via le binding env.AI, pas de fetch
   HTTP classique. Les modèles d'instruction Llama hébergés acceptent un
   format "messages" façon chat ; la réponse arrive dans result.response. ── */
async function genererPronosticWorkersAI(model, systemPrompt, userContent, env) {
  if (!env.AI) throw new Error("Binding Workers AI (env.AI) non configuré");

  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.4,
    max_tokens: 400
  });

  const raw = (typeof result === "string" ? result : result?.response)?.trim();
  if (!raw) throw new Error("Réponse vide de Workers AI");
  return parsePronosticJSON(raw);
}

/* ── Générique pour toute API "chat completions" compatible OpenAI :
   OpenAI, DeepSeek, Mistral et xAI Grok exposent toutes ce même format. ── */
async function genererPronosticChatCompatible(url, apiKey, model, systemPrompt, userContent) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${model} : ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Réponse vide");
  return parsePronosticJSON(raw);
}

/* ── Google Gemini : format d'API distinct (generateContent), pas de
   response_format json_object standard OpenAI — on force via
   generationConfig.responseMimeType + le parsing tolérant ci-dessus. ── */
async function genererPronosticGemini(model, systemPrompt, userContent, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.4, maxOutputTokens: 400, responseMimeType: "application/json" }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini (${model}) : ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) throw new Error("Réponse vide de Gemini (filtrée par les réglages de sécurité ?)");
  return parsePronosticJSON(raw);
}

/* ── Anthropic Claude : format Messages API, distinct du format OpenAI. ── */
async function genererPronosticAnthropic(model, systemPrompt, userContent, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: 0.4,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude (${model}) : ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data?.content?.find(b => b.type === "text")?.text?.trim();
  if (!raw) throw new Error("Réponse vide de Claude");
  return parsePronosticJSON(raw);
}

/* Vote pondéré par la confiance de chaque IA : le résultat qui cumule le
   plus de confiance l'emporte (pas un simple vote à la majorité), puis le
   score le plus fréquemment proposé parmi les IA d'accord avec ce résultat. */
function calculerConsensusPronostic(valides) {
  if (valides.length === 0) {
    return { consensus_resultat: null, score_consensus: null, confiance_moyenne: null };
  }

  const poidsParResultat = { domicile: 0, nul: 0, exterieur: 0 };
  valides.forEach(r => { poidsParResultat[r.resultat_probable] += r.confiance; });

  const consensus_resultat = Object.entries(poidsParResultat).sort((a, b) => b[1] - a[1])[0][0];

  const poidsParScore = {};
  valides
    .filter(r => r.resultat_probable === consensus_resultat && r.score_probable)
    .forEach(r => { poidsParScore[r.score_probable] = (poidsParScore[r.score_probable] || 0) + r.confiance; });
  const scoresTries = Object.entries(poidsParScore).sort((a, b) => b[1] - a[1]);
  const score_consensus = scoresTries.length > 0 ? scoresTries[0][0] : null;

  const confiance_moyenne = valides.reduce((s, r) => s + r.confiance, 0) / valides.length;

  return {
    consensus_resultat,
    score_consensus,
    confiance_moyenne: Math.round(confiance_moyenne * 100) / 100
  };
}

/* ══════════════════════════════════════════════════════════════════════
   GÉNÉRATION QUOTIDIENNE AUTOMATIQUE — "les matchs du jour, déjà prêts"

   Déclenchée soit :
   - par le Cron Trigger (scheduled(), voir en tête de fichier) — les
     matchs et leurs pronostics sont donc déjà là à l'ouverture de l'app ;
   - manuellement via POST /proxy/admin/pronostics/generer-du-jour
     (bouton "Générer les matchs du jour" côté admin).

   Sourcing des matchs, par ordre de préférence :
   1) API_FOOTBALL_KEY configurée → fixtures structurées et fiables
      (source = "api_football").
   2) Sinon SERPER_API_KEY configurée (déjà utilisée par le module CRM) →
      recherche web + extraction par IA (source = "recherche_web").
      Moins fiable qu'une API sportive dédiée : les matchs sont marqués
      comme tels côté frontend pour inciter à vérifier. Consigne stricte
      donnée à l'IA de ne JAMAIS inventer un match incertain.
   3) Sinon : erreur explicite invitant à configurer l'une des deux clés.
   ══════════════════════════════════════════════════════════════════════ */

const PRONOSTICS_MAX_PAR_JOUR = 10;

/* Requêtes de recherche par défaut si PRONOSTICS_LIGUES_RECHERCHE n'est
   pas défini côté secrets (liste séparée par des virgules) : des requêtes
   génériques plutôt qu'une liste de championnats précis, pour proposer
   des matchs quelle que soit la période de l'année et le pays. Pour
   restreindre à des compétitions précises, définis PRONOSTICS_LIGUES_RECHERCHE. */
const PRONOSTICS_LIGUES_RECHERCHE_DEFAUT = "football,football Côte d'Ivoire,football Afrique";

/* Route HTTP (bouton admin) : ne fait QUE sourcer + créer les matchs du
   jour — rapide, pas d'appel IA — pour éviter tout risque de timeout sur
   une requête synchrone. Le frontend lance ensuite l'analyse de chaque
   match un par un (réutilise POST /proxy/ai/pronostics/analyser), avec
   une barre de progression. Le cron quotidien, lui, fait tout le pipeline
   d'un coup en tâche de fond (voir executerGenerationPronosticsDuJour). */
async function handlePronosticsGenererDuJour(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResponseCors({ error: "Configuration Supabase manquante sur le serveur" }, 500, request);
  }

  try {
    const rapport = await sourcerEtCreerMatchsDuJour(env);
    return jsonResponseCors(rapport, 200, request);
  } catch (err) {
    console.error("[pronostics] Erreur génération du jour :", err);
    return jsonResponseCors({ error: "Échec de la génération", detail: String(err?.message || err) }, 500, request);
  }
}

/* Sourcing + création uniquement (rapide). Renvoie aussi la liste des
   match_id "en_attente" du jour (nouveaux + anciens non traités) pour que
   l'appelant sache lesquels analyser ensuite. */
async function sourcerEtCreerMatchsDuJour(env) {
  const dateStr = new Date().toISOString().slice(0, 10);

  const dejaAujourdhui = await listerMatchsDuJour(dateStr, env);
  const placesRestantes = PRONOSTICS_MAX_PAR_JOUR - dejaAujourdhui.length;

  let candidats = [];
  let source = null;

  if (placesRestantes > 0) {
    if (env.API_FOOTBALL_KEY) {
      source = "api_football";
      candidats = await sourcerMatchsApiFootball(dateStr, env);
    } else if (env.SERPER_API_KEY) {
      source = "recherche_web";
      candidats = await sourcerMatchsSerperIA(dateStr, env);
    } else {
      return {
        crees: 0, deja_presents: dejaAujourdhui.length, ids_a_analyser: dejaAujourdhui.filter(m => m.statut === "en_attente").map(m => m.id),
        erreur: "Aucune source de matchs configurée. Ajoute API_FOOTBALL_KEY (recommandé, données fiables) ou SERPER_API_KEY (déjà utilisée par le CRM, extraction par IA moins fiable) dans les secrets du Worker."
      };
    }

    candidats = dedupeContreExistants(candidats, dejaAujourdhui).slice(0, placesRestantes);
  }

  const idsCreesM = [];
  for (const c of candidats) {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/pronostics_matchs`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          equipe_domicile: c.equipe_domicile,
          equipe_exterieur: c.equipe_exterieur,
          competition: c.competition || null,
          date_match: c.date_match || null,
          source: c.source || source || "manuel",
          id_externe: c.id_externe ? String(c.id_externe) : null
        })
      });
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.id) idsCreesM.push(rows[0].id);
      } else {
        console.error("[pronostics] Échec création match du jour :", await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("[pronostics] Exception création match du jour :", err);
    }
  }

  const idsAAnalyser = [...dejaAujourdhui.filter(m => m.statut === "en_attente").map(m => m.id), ...idsCreesM]
    .slice(0, PRONOSTICS_MAX_PAR_JOUR);

  return {
    crees: idsCreesM.length,
    deja_presents: dejaAujourdhui.length,
    source_utilisee: source,
    ids_a_analyser: idsAAnalyser
  };
}

/* Pipeline complet (sourcing + création + analyse de chaque match), utilisé
   UNIQUEMENT par le cron quotidien via ctx.waitUntil — s'exécute en tâche
   de fond, donc pas soumis à la contrainte de délai d'une requête HTTP. */
async function executerGenerationPronosticsDuJour(env) {
  const { ids_a_analyser: aAnalyser, ...resteDuRapport } = await sourcerEtCreerMatchsDuJour(env);
  if (resteDuRapport.erreur) return resteDuRapport;

  let analyses = 0;
  for (const matchId of aAnalyser || []) {
    const r = await analyserMatchInterne(matchId, env).catch(err => ({ error: String(err?.message || err) }));
    if (!r.error) analyses++;
  }

  return { ...resteDuRapport, analyses };
}

async function listerMatchsDuJour(dateStr, env) {
  const debut = `${dateStr}T00:00:00.000Z`;
  const fin = `${dateStr}T23:59:59.999Z`;
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pronostics_matchs?select=id,statut,equipe_domicile,equipe_exterieur,date_match&date_match=gte.${debut}&date_match=lte.${fin}&limit=100`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Accept: "application/json"
      }
    }
  );
  if (!res.ok) return [];
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function normaliserNomEquipe(nom) {
  return String(nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function dedupeContreExistants(candidats, existants) {
  const clesExistantes = new Set(existants.map(m => normaliserNomEquipe(m.equipe_domicile) + "|" + normaliserNomEquipe(m.equipe_exterieur)));
  const vus = new Set();
  return candidats.filter(c => {
    if (!c.equipe_domicile || !c.equipe_exterieur) return false;
    const cle = normaliserNomEquipe(c.equipe_domicile) + "|" + normaliserNomEquipe(c.equipe_exterieur);
    if (clesExistantes.has(cle) || vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

/* ── Source 1 (recommandée) : API-Football, données structurées ──
   Par défaut : AUCUN filtre de ligue — on récupère tous les matchs du
   jour, toutes compétitions et tous pays confondus (utile notamment en
   période creuse pour les grands championnats européens, ex. trêve
   estivale). Pour restreindre à une liste précise de compétitions,
   configure le secret optionnel API_FOOTBALL_LEAGUES (IDs séparés par
   des virgules, à retrouver via /leagues?search=... sur api-football.com). ── */
async function sourcerMatchsApiFootball(dateStr, env) {
  const liguesConfig = (env.API_FOOTBALL_LEAGUES || "").split(",").map(s => s.trim()).filter(Boolean);
  const saison = new Date(dateStr).getFullYear();
  const tous = [];

  const mapperFixtures = data => (data?.response || []).map(f => ({
    id_externe: f.fixture?.id,
    competition: f.league?.name || "",
    equipe_domicile: f.teams?.home?.name || "",
    equipe_exterieur: f.teams?.away?.name || "",
    date_match: f.fixture?.date || null,
    source: "api_football"
  }));

  if (liguesConfig.length === 0) {
    // Pas de filtre : tous les matchs du jour, toutes compétitions confondues.
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?date=${dateStr}`,
        { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } }
      );
      if (!res.ok) {
        console.error("[pronostics] API-Football échec (tous matchs) :", await res.text().catch(() => ""));
        return [];
      }
      const data = await res.json().catch(() => null);
      tous.push(...mapperFixtures(data));
    } catch (err) {
      console.error("[pronostics] Exception API-Football (tous matchs) :", err);
    }
    return tous;
  }

  for (const ligueId of liguesConfig) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?date=${dateStr}&league=${encodeURIComponent(ligueId)}&season=${saison}`,
        { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } }
      );
      if (!res.ok) { console.error(`[pronostics] API-Football échec ligue ${ligueId} :`, await res.text().catch(() => "")); continue; }
      const data = await res.json().catch(() => null);
      tous.push(...mapperFixtures(data));
    } catch (err) {
      console.error(`[pronostics] Exception API-Football ligue ${ligueId} :`, err);
    }
  }

  return tous;
}

/* ── Source 2 (repli) : recherche web via Serper + extraction par une IA.
   Moins fiable qu'une API sportive dédiée : on demande explicitement à
   l'IA de ne jamais halluciner un match incertain, et le match créé est
   marqué source="recherche_web" pour rester distinguable côté admin. ── */
async function sourcerMatchsSerperIA(dateStr, env) {
  if (!env.GROQ_API_KEY) return []; // l'extraction utilise Groq (rapide et déjà requis pour le reste du module)

  const requetes = (env.PRONOSTICS_LIGUES_RECHERCHE || PRONOSTICS_LIGUES_RECHERCHE_DEFAUT).split(",").map(s => s.trim()).filter(Boolean);
  const extraitsBruts = [];

  for (const ligue of requetes) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": env.SERPER_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `programme matchs ${ligue} aujourd'hui`, gl: "ci", hl: "fr", num: 8 })
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const morceaux = (data?.organic || []).map(r => `[${ligue}] ${r.title} — ${r.snippet || ""}`).join("\n");
      if (morceaux) extraitsBruts.push(morceaux);
    } catch (err) {
      console.error(`[pronostics] Erreur Serper pour "${ligue}" :`, err);
    }
  }

  if (extraitsBruts.length === 0) return [];

  const systemPrompt = `Tu extrais une liste de matchs de football du jour (${dateStr}) à partir d'extraits de résultats de recherche web, potentiellement bruités ou incomplets.
RÈGLE ABSOLUE : n'invente JAMAIS un match. Si un extrait est ambigu, incomplet, ou si tu n'es pas raisonnablement confiant que le match a bien lieu le ${dateStr}, IGNORE-le plutôt que de le deviner. Il vaut mieux renvoyer une liste courte et fiable qu'une liste longue et fausse.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après :
{
  "matchs": [
    { "equipe_domicile": "...", "equipe_exterieur": "...", "competition": "...", "heure_estimee": "HH:MM ou null si inconnue" }
  ]
}`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: extraitsBruts.join("\n\n") }],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" }
      })
    });
    if (!groqRes.ok) return [];
    const data = await groqRes.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const liste = Array.isArray(parsed?.matchs) ? parsed.matchs : [];

    return liste
      .filter(m => m?.equipe_domicile && m?.equipe_exterieur)
      .map(m => ({
        equipe_domicile: m.equipe_domicile,
        equipe_exterieur: m.equipe_exterieur,
        competition: m.competition || "",
        date_match: m.heure_estimee ? `${dateStr}T${m.heure_estimee}:00.000Z` : `${dateStr}T00:00:00.000Z`,
        source: "recherche_web"
      }));
  } catch (err) {
    console.error("[pronostics] Erreur extraction IA (Serper) :", err);
    return [];
  }
}

/* ── Recherche de matchs via API-Football (optionnelle) ──────────────
   Nécessite le secret API_FOOTBALL_KEY (dashboard.api-football.com).
   Tant qu'il n'est pas configuré, l'admin peut toujours créer un match
   manuellement via POST /proxy/rest/pronostics_matchs (RLS admin déjà en place). */
async function handlePronosticsRechercherMatchs(request, env) {
  if (!env.API_FOOTBALL_KEY) {
    return jsonResponseCors({
      error: "API_FOOTBALL_KEY non configurée sur le serveur. Ajoute ce secret pour activer la recherche automatique de matchs, ou crée un match manuellement."
    }, 500, request);
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const ligue = url.searchParams.get("ligue"); // id de ligue API-Football, optionnel

  let apiUrl = `https://v3.football.api-sports.io/fixtures?date=${date}`;
  if (ligue) apiUrl += `&league=${encodeURIComponent(ligue)}&season=${new Date(date).getFullYear()}`;

  try {
    const res = await fetch(apiUrl, { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return jsonResponseCors({ error: "Échec API-Football", detail: errText }, 502, request);
    }
    const data = await res.json();
    const matchs = (data.response || []).map(f => ({
      id_externe: f.fixture?.id,
      competition: f.league?.name || "",
      equipe_domicile: f.teams?.home?.name || "",
      equipe_exterieur: f.teams?.away?.name || "",
      date_match: f.fixture?.date || null
    }));
    return jsonResponseCors({ matchs }, 200, request);
  } catch (err) {
    return jsonResponseCors({ error: "Erreur recherche de matchs", detail: String(err?.message || err) }, 500, request);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   MODULE PRONOSTICS — fin
   ══════════════════════════════════════════════════════════════════════ */
