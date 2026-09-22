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

      if (path.startsWith("/proxy/admin")) {
        const authError = checkAdminAuth(request, env);
        if (authError) return authError;
        return await proxyToSupabase(request, env, "rest", true);
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

      if (path === "/health") {
        return jsonResponse({ status: "ok", timestamp: Date.now() });
      }

      return jsonResponse({ error: "Route inconnue" }, 404);
    } catch (err) {
      console.error("Worker error:", err);
      return jsonResponse({ error: "Erreur interne du serveur" }, 500);
    }
  }
};

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
    return jsonResponse({ error: "Configuration manquante sur le serveur" }, 500);
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

/* Mode "Publicité" / "Histoire narrée" (inchangé) : l'IA écrit un
   scénario promotionnel pour Aura Market à partir d'un prompt court. */
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

/* Mode "Histoire réaliste" : jamais de mention ou de promotion d'Aura
   Market. Deux cas :
   - texteComplet fourni : l'IA respecte le texte de l'admin tel quel et le
     répartit en séquences courtes (elle ne réécrit pas l'histoire, elle la
     découpe et l'illustre) ;
   - sinon, un prompt court à développer en récit neutre.
   Dans les deux cas, chaque scène doit rester courte (bonne rétention
   vidéo) et porter une description visuelle concrète et cohérente pour que
   l'image générée corresponde exactement à l'action de la scène. */
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

/* Génération de voix off via ElevenLabs, avec bascule automatique sur
   jusqu'à 10 comptes (secrets ELEVENLABS_API_KEY / _2 / _3 ... / _10,
   avec leur ELEVENLABS_VOICE_ID / _2 / _3 ... / _10 respectif). */
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
   Recherche des vendeurs potentiels (Instagram/Facebook/TikTok) via
   l'API Serper.dev (Google Search en JSON), extrait les numéros de
   téléphone détectables dans les snippets indexés, génère un message
   d'accroche par prospect via Groq, construit le lien wa.me.
   IMPORTANT : cette fonction ne sauvegarde RIEN en base — elle renvoie
   uniquement les résultats. La sauvegarde en base ne se fait que via
   la route /proxy/ai/crm/sauvegarder, sur action explicite de l'admin
   (clic sur "Sauvegarder"). Voir handleCrmSauvegarder plus bas.
   Secrets requis : SERPER_API_KEY, GROQ_API_KEY (déjà présent).
   ══════════════════════════════════════════════════════════════════════ */

// Fenêtre de fraîcheur des résultats Serper (paramètre "tbs" de Google) :
// "qdr:d" = dernières 24h, "qdr:w" = dernière semaine, "qdr:m" = dernier mois.
// Modifiable ici sans toucher au reste de la fonction.
const CRM_FENETRE_RECENCE = "qdr:w";

// Lien officiel et message groupe WhatsApp vendeurs, ajoutés en fin de
// chaque message d'accroche généré par l'IA (voir genererMessageAccroche).
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

  // On interroge Serper séparément par plateforme pour garantir un mix de résultats
  // plutôt qu'une seule plateforme qui monopolise les places.
  // Instagram retiré (faible communauté active constatée) ; Facebook et
  // TikTok sont prioritaires (poids 2), Snapchat en complément (poids 1).
  const plateformes = [
    { site: "facebook.com", nom: "facebook", poids: 2 },
    { site: "tiktok.com", nom: "tiktok", poids: 2 },
    { site: "snapchat.com", nom: "snapchat", poids: 1 }
  ];
  const poidsTotal = plateformes.reduce((s, p) => s + p.poids, 0);

  let brutResultats = [];
  for (const p of plateformes) {
    const parPlateforme = Math.ceil((nombreDemande * p.poids) / poidsTotal) + 2; // marge pour filtrage doublons
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

  // Déduplication par lien
  const vus = new Set();
  brutResultats = brutResultats.filter(r => {
    if (!r.lien || vus.has(r.lien)) return false;
    vus.add(r.lien);
    return true;
  }).slice(0, nombreDemande);

  if (brutResultats.length === 0) {
    return jsonResponseCors({ prospects: [], total: 0, avecTelephone: 0 }, 200, request);
  }

  // Extraction téléphone (le meilleur numéro valide trouvé dans tout le texte)
  // + nettoyage nom de boutique
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

  // Génération du message WhatsApp par IA, uniquement pour les prospects avec téléphone valide
  const avecTelephone = candidats.filter(c => c.telephoneValide);
  const messages = await Promise.all(
    avecTelephone.map(c => genererMessageAccroche(c, motCle, ville, env))
  );
  avecTelephone.forEach((c, i) => {
    c.messageWhatsapp = messages[i];
    c.lienWhatsapp = `https://wa.me/${c.telephone}?text=${encodeURIComponent(messages[i])}`;
  });

  const tousLesProspects = candidats; // avec et sans téléphone, pour affichage complet

  return jsonResponseCors({
    prospects: tousLesProspects,
    total: tousLesProspects.length,
    avecTelephone: avecTelephone.length
  }, 200, request);
}

/* ══════════════════════════════════════════════════════════════════════
   Sauvegarde manuelle d'un ou plusieurs prospects dans crm_prospects.
   Appelée UNIQUEMENT quand l'admin clique explicitement sur
   "Sauvegarder" côté front — jamais automatiquement après une recherche.
   Upsert par lien_page pour éviter les doublons entre sauvegardes.
   ══════════════════════════════════════════════════════════════════════ */
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

  const lignes = prospects
    .filter(p => p && p.lienPage)
    .map(p => ({
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
    }));

  if (lignes.length === 0) {
    return jsonResponseCors({ error: "Aucun prospect valide à sauvegarder" }, 400, request);
  }

  try {
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
        body: JSON.stringify(lignes)
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return jsonResponseCors({ error: "Échec de l'enregistrement en base", detail: errText }, 502, request);
    }
  } catch (err) {
    return jsonResponseCors({ error: "Erreur enregistrement crm_prospects", detail: String(err?.message || err) }, 500, request);
  }

  return jsonResponseCors({ sauvegardes: lignes.length }, 200, request);
}

/* Extrait TOUS les numéros de téléphone ivoiriens plausibles d'un texte
   libre, et renvoie un tableau dédupliqué au format E.164 sans "+"
   (attendu par wa.me), trié du plus fiable au moins fiable.

   Un texte de bio/description peut contenir plusieurs numéros (contact
   principal, ligne secondaire, Wave/Orange Money...) séparés par des
   tirets, points, espaces, ou juxtaposés ("/07 99 250 701"). On isole
   donc chaque groupe de 8 à 10 chiffres consécutifs (séparateurs
   autorisés entre les chiffres), puis on valide chaque candidat
   indépendamment plutôt que de s'arrêter au premier match global.

   Depuis le passage au plan de numérotation à 10 chiffres (2021), les
   préfixes mobiles/fixes ivoiriens valides sont à DEUX chiffres :
   01 (Moov), 05 (MTN), 07 (Orange), 02/03 (fixes). Le "0" fait partie
   intégrante du numéro national significatif (NSN) : en E.164, le
   numéro complet est +225 suivi des 10 chiffres, 0 INCLUS (ex.
   +2250777111111), contrairement à la règle E.164 classique qui
   retire le 0 de tronc national. */
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

  // 1) Formats internationaux explicites : +225 / 00225 suivis de 9 ou 10
  //    chiffres (priorité la plus haute : l'indicatif pays est sans
  //    ambiguïté). Si seulement 9 chiffres suivent (le "0" du préfixe a été
  //    omis par l'auteur du texte après le +225 explicite), on le
  //    réinjecte pour respecter le NSN à 10 chiffres.
  const reIntl = /(?:\+|00)225[\s.\-–]?(\d(?:[\s.\-–]?\d){7,9})/g;
  let m;
  while ((m = reIntl.exec(texte)) !== null) {
    const chiffres = m[1].replace(/[\s.\-–]/g, "");
    if (chiffres.length === 10) {
      ajouter("225" + chiffres, 3);
    } else if (chiffres.length === 9) {
      // "0" omis après le +225 explicite (ex: "+225 777111111")
      ajouter("225" + "0" + chiffres, 3);
    } else if (chiffres.length === 8) {
      // ancien format à 8 chiffres (avant 2021) : conservé tel quel.
      ajouter("225" + chiffres, 1);
    }
  }

  // 2) Numéros locaux à 10 chiffres commençant par un indicatif mobile/fixe
  //    ivoirien valide à DEUX chiffres (01, 02, 03, 05, 07), séparateurs
  //    variés autorisés entre CHAQUE chiffre restant, pour capter des
  //    écritures comme "01-71-98-14-83" ou "07 99 250 701".
  const reLocal = /\b(0[12357](?:[\s.\-–]?\d){8})\b/g;
  while ((m = reLocal.exec(texte)) !== null) {
    const chiffres = m[1].replace(/[\s.\-–]/g, "");
    if (chiffres.length === 10) {
      // Le "0" fait partie du NSN depuis 2021 : on le CONSERVE (pas de slice).
      ajouter("225" + chiffres, 2);
    }
  }

  // Tri par priorité décroissante (format international d'abord), en
  // conservant l'ordre d'apparition dans le texte pour les ex-aequo.
  return trouves.sort((a, b) => b.priorite - a.priorite).map(t => t.e164);
}

/* Nettoie le titre brut renvoyé par Serper pour en faire un nom de
   boutique lisible (retire le nom de la plateforme, les séparateurs
   type "| Instagram", "on TikTok", etc.). */
function nettoyerNomBoutique(titre, plateforme) {
  let nom = titre || "Boutique sans nom";
  nom = nom.replace(/\s*[|•·-]\s*(Instagram|Facebook|TikTok).*$/i, "");
  nom = nom.replace(/\s*\(@[\w.]+\)\s*/g, " ");
  nom = nom.trim();
  return nom || "Boutique sans nom";
}

/* Génère un message d'accroche WhatsApp court et personnalisé via Groq,
   adapté au style ivoirien, pour un prospect donné. En cas d'échec de
   l'IA, renvoie un message de secours générique pour ne jamais bloquer
   l'affichage des résultats.

   Dans les deux cas (IA ou secours), le message se termine toujours par :
   - le lien officiel AuraMarket (www.auramarketci.com)
   - une mention rassurante du groupe WhatsApp des vendeurs
   Ce pied de message est ajouté ICI, une seule fois, plutôt que dans le
   prompt système, pour garantir sa présence même si l'IA l'oublie. */
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
    return jsonResponse(
      { error: "Trop de requêtes. Réessaie dans quelques secondes." },
      429
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
    return jsonResponse({ error: "Accès non autorisé" }, 403);
  }
  return null;
}

function checkOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());

  if (allowed.includes("*") || !origin) return null;
  if (allowed.includes(origin)) return null;

  return jsonResponse({ error: `Origine non autorisée: ${origin}` }, 403);
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
