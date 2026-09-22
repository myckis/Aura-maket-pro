/**
 * AURA MARKET — Module Contenus (Storytelling IA) (Admin)
 * Fichier : assets/module-contenus/module-contenus.js
 * Dépend de : ../js/config.js (AURA_CONFIG, AURA_AUTH, API)
 *
 * Wizard en 3 étapes :
 *   1. Personnages (sélection multiple, dans l'ordre de sélection = ordre du récit)
 *   2. L'histoire (prompt libre + ambiance + nombre de scènes : auto ou fixé)
 *   3. Scénario généré par l'IA (relecture, édition ou suppression de scènes)
 *      -> puis génération du storyboard : une image par scène.
 *
 * Génération d'image par scène :
 *   - mode "canvas" : montage via Canvas avec le(s) personnage(s) de la scène,
 *     détourés, mis en situation sur un fond travaillé (même bibliothèque de
 *     helpers de dessin que module-marketing.js : étincelles, glow, badges).
 *   - mode "ia"     : génération via Pollinations.ai avec un prompt par scène,
 *     décrivant les personnages + l'action + l'ambiance choisie.
 *
 * Endpoint Worker attendu (à créer côté Cloudflare Worker, avec fallback local
 * si la route n'existe pas encore) :
 *   POST {WORKER_URL}/ai/contenus/scenario   { personnages, prompt, ton, nbScenes }
 *   -> { titre, scenes: [{ texte, personnages: [id,...] }, ...] }
 */
"use strict";

const MCNT_BUCKET = "visuels-marketing";
const MCNT_VIDEO_BUCKET = "videos-marketing";
const MCNT_TOTAL_STEPS = 4;
const MCNT_SCENE_MIN_DUREE = 2.6; // secondes mini par scène même si l'audio échoue
const MCNT_VIDEO_DUREE_MAX = 40; // secondes — durée totale maximale de la vidéo générée

/* ══════════════════════════════════════════════
   FORMAT VIDÉO — MP4 (H.264) prioritaire
   TikTok, Instagram, Snapchat et les galeries iOS/Android REFUSENT le WebM
   ("échec du décodage"). On enregistre donc en MP4/H.264 dès que le
   navigateur le permet (Chrome Android récent, Safari iOS), et on retombe
   sur le WebM uniquement si le MP4 est indisponible. L'extension du fichier
   téléchargé/partagé suit toujours le format réellement produit. */
function choisirFormatVideoMcnt() {
  const candidats = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm"
  ];
  for (const m of candidats) {
    try {
      if (MediaRecorder.isTypeSupported(m)) {
        const conteneur = m.startsWith("video/mp4") ? "video/mp4" : "video/webm";
        return { mimeType: m, conteneur, extension: conteneur === "video/mp4" ? "mp4" : "webm" };
      }
    } catch { /* isTypeSupported peut lever sur certains anciens navigateurs */ }
  }
  return { mimeType: "", conteneur: "video/webm", extension: "webm" };
}

/* Extension de fichier ("mp4"/"webm") déduite du type MIME réel d'un blob. */
function extensionVideoMcnt(blob) {
  return (blob && blob.type && blob.type.includes("mp4")) ? "mp4" : "webm";
}

/* ══════════════════════════════════════════════
   REMUX MP4 FRAGMENTÉ → MP4 PROGRESSIF
   Chrome/Android produisent, via MediaRecorder en video/mp4, un fichier
   FRAGMENTÉ (fMP4/CMAF : boîte mvex + suites de moof/mdat), pas un MP4
   "progressif" classique (moov unique en tête + mdat contigu). Ce format
   est fait pour le streaming (DASH/HLS) : la durée globale N'EST PAS
   fiable pour un lecteur qui ne rassemble pas tous les fragments avant de
   l'afficher. WhatsApp/Facebook/LinkedIn tolèrent le fMP4 (ils scannent
   tout le fichier). TikTok, comme beaucoup d'apps d'import mobile, ne le
   supporte pas correctement et affiche une durée quasi nulle ou tronque
   l'import ("moins de 1s").
   La seule correction fiable est de RECONSTRUIRE le conteneur : extraire
   tous les samples de tous les fragments (moof/traf/trun) et regénérer un
   moov classique (stts/stsz/stsc/stco) suivi d'un mdat unique, SANS
   ré-encoder l'audio/vidéo (juste réorganiser le conteneur — rapide et
   sans perte). Un blob déjà progressif (WebM, ou MP4 non fragmenté) est
   laissé tel quel après un simple ajustement de durée si besoin. */
async function finaliserBlobVideoMcnt(blob) {
  try {
    const estMp4 = (blob.type || "").includes("mp4");
    if (!estMp4) {
      // WebM : ré-écrit juste l'élément Duration EBML si trouvable, sinon
      // laisse le blob tel quel (MP4 est de toute façon toujours prioritaire
      // — voir choisirFormatVideoMcnt — le WebM n'arrive qu'en dernier recours).
      const dureeSec = await mesurerDureeBlobVideoMcnt(blob);
      if (!dureeSec || !isFinite(dureeSec) || dureeSec <= 0) return blob;
      const buffer = await blob.arrayBuffer();
      const patched = patcherDureeWebmMcnt(buffer, dureeSec);
      return patched ? new Blob([patched], { type: blob.type }) : blob;
    }

    const buffer = await blob.arrayBuffer();
    if (!estMp4Fragmente(buffer)) return blob; // déjà progressif, rien à faire

    const remuxed = remuxerMp4FragmenteMcnt(buffer);
    return remuxed ? new Blob([remuxed], { type: blob.type }) : blob;
  } catch (err) {
    console.warn("Remux vidéo ignoré (fallback blob brut) :", err.message);
    return blob;
  }
}

/* Détecte si un buffer MP4 est fragmenté (présence d'une boîte mvex dans
   moov, ou de boîtes moof au niveau racine) : dans ce cas la durée globale
   dans mvhd n'est pas fiable pour les lecteurs stricts type TikTok. */
function estMp4Fragmente(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  while (pos + 8 <= buffer.byteLength) {
    const taille = view.getUint32(pos);
    if (taille < 8) break;
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    if (type === "moof") return true;
    pos += taille;
  }
  return false;
}

/* Mesure la durée réelle d'un blob vidéo via un élément <video> caché
   (source de vérité fiable : le décodeur du navigateur lit les frames
   réellement présentes, indépendamment de l'en-tête déclaré). Utilisée
   uniquement pour le chemin WebM (fallback rare). */
function mesurerDureeBlobVideoMcnt(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;

    const nettoyer = () => URL.revokeObjectURL(url);

    v.onloadedmetadata = () => {
      if (v.duration === Infinity || isNaN(v.duration)) {
        v.currentTime = 1e10;
        v.ontimeupdate = () => {
          v.ontimeupdate = null;
          nettoyer();
          resolve(v.duration && isFinite(v.duration) ? v.duration : 0);
        };
        setTimeout(() => { nettoyer(); resolve(0); }, 4000);
      } else {
        nettoyer();
        resolve(v.duration);
      }
    };
    v.onerror = () => { nettoyer(); reject(new Error("Lecture métadonnées vidéo impossible")); };
  });
}

/* Ré-écrit l'élément EBML "Duration" (float64, id 0x4489) dans Segment >
   Info si présent (fallback WebM uniquement). */
function patcherDureeWebmMcnt(buffer, dureeSec) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (let i = 0; i < bytes.length - 10; i++) {
    if (bytes[i] === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88) {
      view.setFloat64(i + 3, dureeSec * 1000);
      return buffer;
    }
  }
  return null;
}

/* ── Remuxer fMP4 → MP4 progressif (aucune dépendance externe) ──
   Parcourt tous les moof/traf/trun pour extraire, par piste (audio/vidéo),
   la liste ordonnée des samples (taille, durée, position dans le fichier
   source). Reconstruit ensuite un moov classique (stts/stsc/stsz/stco) et
   un mdat unique contenant tous les samples recopiés tels quels (aucun
   ré-encodage, donc rapide et sans perte de qualité). */
function remuxerMp4FragmenteMcnt(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const lireBoxes = (debut, fin) => {
    const boites = [];
    let pos = debut;
    while (pos + 8 <= fin) {
      let taille = view.getUint32(pos);
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      let tailleEntete = 8;
      if (taille === 1) {
        const hi = view.getUint32(pos + 8), lo = view.getUint32(pos + 12);
        taille = hi * 4294967296 + lo;
        tailleEntete = 16;
      }
      if (taille === 0) taille = fin - pos;
      if (taille < 8) break;
      boites.push({ type, debut: pos, taille, tailleEntete, corpsDebut: pos + tailleEntete, corpsFin: pos + taille });
      pos += taille;
    }
    return boites;
  };

  const racine = lireBoxes(0, buffer.byteLength);
  const ftyp = racine.find(b => b.type === "ftyp");
  const moov = racine.find(b => b.type === "moov");
  if (!ftyp || !moov) return null;

  const moovEnfants = lireBoxes(moov.corpsDebut, moov.corpsFin);
  const mvhd = moovEnfants.find(b => b.type === "mvhd");
  const mvhdVersion = bytes[mvhd.corpsDebut];
  const movieTimescale = mvhdVersion === 1
    ? view.getUint32(mvhd.corpsDebut + 1 + 3 + 8 + 8)
    : view.getUint32(mvhd.corpsDebut + 1 + 3 + 4 + 4);

  const traks = moovEnfants.filter(b => b.type === "trak");
  const pistes = traks.map(trak => {
    const trakEnfants = lireBoxes(trak.corpsDebut, trak.corpsFin);
    const tkhd = trakEnfants.find(b => b.type === "tkhd");
    const trackId = view.getUint32(tkhd.corpsDebut + 1 + 3 + 8 + 8); // tkhd toujours en version 1 ici (Chrome)
    const mdia = trakEnfants.find(b => b.type === "mdia");
    const mdiaEnfants = lireBoxes(mdia.corpsDebut, mdia.corpsFin);
    const mdhd = mdiaEnfants.find(b => b.type === "mdhd");
    const mdhdVersion = bytes[mdhd.corpsDebut];
    const timescale = mdhdVersion === 1
      ? view.getUint32(mdhd.corpsDebut + 1 + 3 + 8 + 8)
      : view.getUint32(mdhd.corpsDebut + 1 + 3 + 4 + 4);
    const hdlr = mdiaEnfants.find(b => b.type === "hdlr");
    const handlerType = String.fromCharCode(
      bytes[hdlr.corpsDebut + 8], bytes[hdlr.corpsDebut + 9], bytes[hdlr.corpsDebut + 10], bytes[hdlr.corpsDebut + 11]
    );
    const minf = mdiaEnfants.find(b => b.type === "minf");
    const minfEnfants = lireBoxes(minf.corpsDebut, minf.corpsFin);
    const stbl = minfEnfants.find(b => b.type === "stbl");
    const stblEnfants = lireBoxes(stbl.corpsDebut, stbl.corpsFin);
    const stsd = stblEnfants.find(b => b.type === "stsd");
    const stsdBytes = bytes.slice(stsd.debut, stsd.corpsFin);
    const mhdBox = minfEnfants.find(b => b.type === "vmhd" || b.type === "smhd");
    const mhdBytes = bytes.slice(mhdBox.debut, mhdBox.corpsFin);

    return { trackId, timescale, handlerType, stsdBytes, mhdBytes, samples: [] };
  });

  const pisteParId = {};
  pistes.forEach(p => { pisteParId[p.trackId] = p; });
  if (!pistes.length) return null;

  // Parcourt tous les moof/traf/trun au niveau racine pour extraire les
  // samples de chaque piste, avec leur position réelle dans le fichier
  // source (data-offset relatif au moof ou base-data-offset explicite).
  let pos = 0;
  while (pos < buffer.byteLength) {
    let taille = view.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    if (taille === 0) taille = buffer.byteLength - pos;
    if (taille < 8) break;

    if (type === "moof") {
      const moofDebut = pos;
      const trafs = lireBoxes(pos + 8, pos + taille).filter(b => b.type === "traf");
      trafs.forEach(traf => {
        const trafEnfants = lireBoxes(traf.corpsDebut, traf.corpsFin);
        const tfhd = trafEnfants.find(b => b.type === "tfhd");
        const tfhdFlags = (bytes[tfhd.corpsDebut + 1] << 16) | (bytes[tfhd.corpsDebut + 2] << 8) | bytes[tfhd.corpsDebut + 3];
        const trackId = view.getUint32(tfhd.corpsDebut + 4);
        let p = tfhd.corpsDebut + 8;
        let baseDataOffset = moofDebut; // défaut Chrome : "default-base-is-moof"
        if (tfhdFlags & 0x1) {
          const hi = view.getUint32(p), lo = view.getUint32(p + 4);
          baseDataOffset = hi * 4294967296 + lo;
          p += 8;
        }
        let defaultSampleDuration = 0;
        if (tfhdFlags & 0x8) { defaultSampleDuration = view.getUint32(p); p += 4; }
        let defaultSampleSize = 0;
        if (tfhdFlags & 0x10) { defaultSampleSize = view.getUint32(p); p += 4; }

        const trun = trafEnfants.find(b => b.type === "trun");
        if (!trun) return;
        const runFlags = (bytes[trun.corpsDebut + 1] << 16) | (bytes[trun.corpsDebut + 2] << 8) | bytes[trun.corpsDebut + 3];
        const sampleCount = view.getUint32(trun.corpsDebut + 4);
        let rp = trun.corpsDebut + 8;
        let dataOffset = baseDataOffset;
        if (runFlags & 0x1) { dataOffset = baseDataOffset + view.getInt32(rp); rp += 4; }
        if (runFlags & 0x4) { rp += 4; } // first-sample-flags, ignoré

        const piste = pisteParId[trackId];
        if (!piste) return;
        let offsetCourant = dataOffset;
        for (let i = 0; i < sampleCount; i++) {
          let duree = defaultSampleDuration, taille2 = defaultSampleSize;
          if (runFlags & 0x100) { duree = view.getUint32(rp); rp += 4; }
          if (runFlags & 0x200) { taille2 = view.getUint32(rp); rp += 4; }
          if (runFlags & 0x400) { rp += 4; } // sample-flags, ignoré
          if (runFlags & 0x800) { rp += 4; } // composition-time-offset, ignoré (pas de B-frames avec ce recorder)
          piste.samples.push({ offset: offsetCourant, taille: taille2, duree });
          offsetCourant += taille2;
        }
      });
    }
    pos += taille;
  }

  if (pistes.every(p => !p.samples.length)) return null; // rien à remuxer, structure inattendue

  // ── Reconstruction du conteneur ──
  const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; };
  const u16 = n => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return b; };
  const concat = (...arrs) => {
    const total = arrs.reduce((a, x) => a + x.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    arrs.forEach(x => { out.set(x, o); o += x.length; });
    return out;
  };
  const boite = (type, ...payloads) => {
    const payload = concat(...payloads);
    const taille = 8 + payload.length;
    const entete = new Uint8Array(8);
    new DataView(entete.buffer).setUint32(0, taille);
    entete.set([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)], 4);
    return concat(entete, payload);
  };
  const enteteFullBox = (version, flags) => new Uint8Array([version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]);

  const construireStts = (samples) => {
    const entries = [];
    for (const s of samples) {
      if (entries.length && entries[entries.length - 1].delta === s.duree) entries[entries.length - 1].count++;
      else entries.push({ count: 1, delta: s.duree });
    }
    const corps = [enteteFullBox(0, 0), u32(entries.length)];
    entries.forEach(e => { corps.push(u32(e.count), u32(e.delta)); });
    return boite("stts", ...corps);
  };
  const construireStsz = (samples) => {
    const corps = [enteteFullBox(0, 0), u32(0), u32(samples.length)];
    samples.forEach(s => corps.push(u32(s.taille)));
    return boite("stsz", ...corps);
  };
  const construireStsc = (nbSamples) => boite("stsc", enteteFullBox(0, 0), u32(1), u32(1), u32(nbSamples), u32(1));
  const construireStco = (offset) => boite("stco", enteteFullBox(0, 0), u32(1), u32(offset));
  const construireMdhd = (timescale, dureeTicks) =>
    boite("mdhd", enteteFullBox(0, 0), u32(0), u32(0), u32(timescale), u32(dureeTicks), u16(0x55c4), u16(0));
  const construireHdlr = (handlerType) => {
    const nom = new TextEncoder().encode((handlerType === "vide" ? "VideoHandler" : "SoundHandler") + "\0");
    const typeBytes = new TextEncoder().encode(handlerType);
    return boite("hdlr", enteteFullBox(0, 0), u32(0), typeBytes, new Uint8Array(12), nom);
  };
  const construireDinf = () => {
    const url = boite("url ", enteteFullBox(0, 1));
    return boite("dinf", boite("dref", enteteFullBox(0, 0), u32(1), url));
  };
  const construireStbl = (piste) =>
    boite("stbl", piste.stsdBytes, construireStts(piste.samples), construireStsc(piste.samples.length), construireStsz(piste.samples), construireStco(piste._offsetChunk));
  const construireMinf = (piste) => boite("minf", piste.mhdBytes, construireDinf(), construireStbl(piste));
  const construireMdia = (piste) => {
    const dureeTicks = piste.samples.reduce((a, s) => a + s.duree, 0);
    return boite("mdia", construireMdhd(piste.timescale, dureeTicks), construireHdlr(piste.handlerType), construireMinf(piste));
  };
  const matriceUnite = new Uint8Array([0,1,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0x40,0,0,0]);
  const construireTkhd = (trackId, dureeMovieTicks, estVideo, largeur, hauteur) =>
    boite("tkhd", enteteFullBox(0, 0x7), u32(0), u32(0), u32(trackId), u32(0), u32(dureeMovieTicks),
      new Uint8Array(8), u16(0), u16(0), u16(estVideo ? 0 : 0x0100), u16(0), matriceUnite,
      u32(estVideo ? (largeur << 16) : 0), u32(estVideo ? (hauteur << 16) : 0));
  const construireTrak = (piste, movieTimescale, dureeTotaleSec, largeur, hauteur) => {
    const estVideo = piste.handlerType === "vide";
    const dureeMovieTicks = Math.round(dureeTotaleSec * movieTimescale);
    return boite("trak", construireTkhd(piste.trackId, dureeMovieTicks, estVideo, largeur, hauteur), construireMdia(piste));
  };
  const construireMvhd = (movieTimescale, dureeTotaleSec, prochainTrackId) =>
    boite("mvhd", enteteFullBox(0, 0), u32(0), u32(0), u32(movieTimescale), u32(Math.round(dureeTotaleSec * movieTimescale)),
      u32(0x00010000), u16(0x0100), u16(0), new Uint8Array(8), matriceUnite, new Uint8Array(24), u32(prochainTrackId));

  const dureesSec = pistes.map(p => p.samples.reduce((a, s) => a + s.duree, 0) / p.timescale);
  const dureeTotaleSec = Math.max(...dureesSec);

  // Dimensions vidéo lues directement dans la box avc1 imbriquée dans stsd
  // (offset fixe standard : entête stsd(8) + fullbox(4) + entry_count(4) +
  // entête avc1(8) + reserved(6)+ref_idx(2) + pre_defined(2)+reserved(2)+
  // pre_defined(12) = 48, puis width(2) et height(2)).
  const pisteVideo = pistes.find(p => p.handlerType === "vide");
  let largeur = 1280, hauteur = 720;
  if (pisteVideo) {
    const v = new DataView(pisteVideo.stsdBytes.buffer, pisteVideo.stsdBytes.byteOffset, pisteVideo.stsdBytes.byteLength);
    largeur = v.getUint16(48);
    hauteur = v.getUint16(50);
  }

  const prochainTrackId = Math.max(...pistes.map(p => p.trackId)) + 1;

  // 1ère passe : construit les trak avec des offsets de chunk provisoires
  // (0) juste pour connaître la taille exacte du moov final.
  pistes.forEach(p => { p._offsetChunk = 0; });
  const moovProvisoire = boite("moov",
    construireMvhd(movieTimescale, dureeTotaleSec, prochainTrackId),
    ...pistes.map(p => construireTrak(p, movieTimescale, dureeTotaleSec, largeur, hauteur)));

  // 2e passe : maintenant que la taille de ftyp+moov+entête mdat est
  // connue, calcule les VRAIS offsets absolus de chaque piste dans le
  // mdat final et reconstruit le moov définitif avec les bons stco.
  const tailleEnTete = ftyp.taille + moovProvisoire.length + 8;
  let offsetCourant = tailleEnTete;
  const mdatParties = [];
  pistes.forEach(piste => {
    piste._offsetChunk = offsetCourant;
    piste.samples.forEach(s => {
      mdatParties.push(bytes.subarray(s.offset, s.offset + s.taille));
      offsetCourant += s.taille;
    });
  });
  const mdatCorps = concat(...mdatParties);
  const mdatBoite = boite("mdat", mdatCorps);

  const moovFinal = boite("moov",
    construireMvhd(movieTimescale, dureeTotaleSec, prochainTrackId),
    ...pistes.map(p => construireTrak(p, movieTimescale, dureeTotaleSec, largeur, hauteur)));

  const ftypBytes = bytes.slice(ftyp.debut, ftyp.corpsFin);
  return concat(ftypBytes, moovFinal, mdatBoite).buffer;
}

/* Image de référence de l'interface réelle d'Aura Market (capture d'écran
   du catalogue client), envoyée à l'IA comme référence visuelle — au même
   titre que les personnages — dès qu'une scène du storyboard doit montrer
   l'application, pour que le rendu reste fidèle au vrai design plutôt
   qu'une interface générique inventée. */
const MCNT_APP_REFERENCE_SRC = "reference-app-interface.jpg";
const MCNT_APP_KEYWORDS = [
  "application", "app", "aura market", "site", "plateforme", "catalogue",
  "commande sur", "achète sur", "achete sur", "commander sur", "boutique en ligne",
  "écran", "ecran", "téléphone", "telephone", "smartphone", "interface"
];

function scenNecessiteAppMcnt(texte) {
  const t = (texte || "").toLowerCase();
  return MCNT_APP_KEYWORDS.some(kw => t.includes(kw));
}

/* Outro de marque ajouté automatiquement à la fin de chaque vidéo générée :
   logo Aura Market + lien du site, avec une petite animation d'entrée. */
const MCNT_OUTRO_DUREE_MS = 4000;
const MCNT_OUTRO_LOGO_SRC = "../img/Logouniversel.png";
const MCNT_OUTRO_LIEN = "auramarketci.com";

/* ══════════════════════════════════════════════
   BIBLIOTHÈQUE DE PERSONNAGES (générés par IA)
   Chargée dynamiquement depuis Supabase (table contenus_personnages),
   partagée entre tous les admins. Chaque personnage est créé via un
   portrait de référence généré par IA (Cloudflare Workers AI / FLUX),
   dans un style visuel choisi à la création (voir MCNT_STYLES).
   Structure de chaque entrée, une fois chargée : { id, nom, description,
   style_visuel, src } — "src" est un alias local de "image_url" pour
   rester compatible avec le reste du fichier (chargerImageMcnt, etc.).
══════════════════════════════════════════════ */
let MCNT_PERSONNAGES = [];

/* Styles visuels proposés à la création d'un personnage. Le "prompt"
   de chaque style est injecté dans la génération du portrait ET dans
   celle de chaque scène du storyboard, pour rester cohérent du début
   à la fin d'une histoire. */
const MCNT_STYLES = [
  {
    id: "2d_flat",
    nom: "2D Flat Design",
    description: "professional 2D flat design illustration, clean vector art style, bold flat colors, minimal shading, thin uniform outlines, modern corporate illustration style"
  },
  {
    id: "3d_cartoon",
    nom: "3D Cartoon",
    description: "3D cartoon Pixar-style illustration, soft rounded shapes, warm rendered lighting, professional advertising quality"
  },
  {
    id: "realiste",
    nom: "Réaliste",
    description: "photorealistic illustration, natural lighting, realistic proportions and textures, high quality advertising photography style"
  },
  {
    id: "semi_realiste",
    nom: "Semi-réaliste",
    description: "semi-realistic digital painting style, detailed shading with a slightly stylized touch, professional illustration quality"
  }
];

function mcntStyleById(id) {
  return MCNT_STYLES.find(s => s.id === id) || MCNT_STYLES[0];
}

/* Genre / tranche d'âge du personnage : injecté dans le prompt pour éviter
   que l'IA se trompe sur le sexe ou l'âge (ex : un prénom masculin généré
   avec une apparence féminine, faute d'indication explicite). */
const MCNT_GENRES = [
  { id: "homme",   nom: "Homme adulte", description: "an adult man" },
  { id: "femme",   nom: "Femme adulte", description: "an adult woman" },
  { id: "garcon",  nom: "Garçon",       description: "a young boy child" },
  { id: "fille",   nom: "Fille",        description: "a young girl child" },
  { id: "bebe",    nom: "Bébé",         description: "a baby" }
];

function mcntGenreById(id) {
  return MCNT_GENRES.find(g => g.id === id) || null;
}

const MCNT_TON_LABELS = {
  humoristique: "humoristique et léger, avec une petite chute amusante",
  inspirant: "inspirant et motivant, façon success story",
  dramatique: "façon avant/après : une galère initiale résolue grâce à Aura Market",
  dynamique: "dynamique et rythmé, phrases courtes et percutantes",
  mara: "cinématique et poétique, façon récit inspirant profond : un arc émotionnel qui part du doute pour aller vers la réussite, ton solennel et intimiste"
};

let _mcntStep = 1;
let _mcntPersonnagesSelection = []; // [id, id, ...] dans l'ordre de sélection
let _mcntTon = "humoristique";
let _mcntNbScenes = "auto"; // "auto" | 2 | 3 | 4 | 6
let _mcntScenario = null; // { titre, scenes: [{ id, texte, personnages: [id,...] }] }
let _mcntItems = [];
let _mcntDernierResultat = null; // { titre, scenes: [{ texte, imageUrl }] }
let _mcntVideoScenes = null; // [{ texte, imageUrl, audioUrl, dureeSec }] une fois voix générées
let _mcntVideoBlobUrl = null; // URL locale (blob) de la dernière vidéo générée
let _mcntVideoBlob = null; // Blob brut de la dernière vidéo générée (nécessaire pour le partage natif avec fichier joint)
let _mcntVideoGenerating = false;
let _mcntCaptionGenerating = false;
let _mcntDerniereLegende = null; // { texte, hashtags: [...] }

/* ── État — création d'un nouveau personnage IA (étape 1) ── */
let _mcntNouveauPersoStyle = null; // id du style choisi, null tant qu'aucun perso n'existe dans l'histoire en cours
let _mcntNouveauPersoGenerating = false;
let _mcntNouveauPersoApercu = null; // data URL du dernier portrait généré, en attente de sauvegarde
let _mcntNouveauPersoSource = "description"; // "description" | "photo"
let _mcntNouveauPersoPhotoDataUrl = null; // data URL de la photo source uploadée (mode "photo")
let _mcntNouveauPersoGenre = null; // id du genre/tranche d'âge choisi (MCNT_GENRES)

/* ══════════════════════════════════════════════
   ÉTAT — MODE PUB 2D (motion design)
══════════════════════════════════════════════ */
let _mcntMode = "histoire"; // "histoire" | "pub2d" | "realiste"
let _mcntRealisteSource = "prompt"; // "prompt" | "colle" — uniquement pertinent en mode "realiste"
let _mcntPubCible = "client"; // "client" | "vendeur" | "plateforme" — cible du spot (étape 1 Publicité Vidéo)
let _mcntPub2dTemplate = "choc-or"; // id de look (voir MCNT_PUB_TEMPLATES)
let _mcntPub2dSourceType = "produit"; // "produit" | "libre"
let _mcntPub2dProduits = []; // sélection multiple : [{ id, nom, prix, image_url, boutique }]
let _mcntPub2dProduitSelectionne = null; // = _mcntPub2dProduits[0] (produit principal, pour le rendu)
let _mcntPub2dTon = "dynamique";
let _mcntPub2dPromptLibre = "";
let _mcntPub2dRecherche = null; // debounce timer
let _mcntPub2dTextes = null; // { accroche, sousTexte, cta, ... } généré par l'IA ou fallback
let _mcntPub2dDernierResultat = null; // texte final utilisé pour le rendu

/* ── Template D : montage dynamique (upload de clips + musique) ── */
let _mcntPub2dClips = []; // [{ file, url, duree }] dans l'ordre de montage
let _mcntPub2dMusique = "energique"; // "energique" | "fun" | "urbain" | "perso"
let _mcntPub2dMusiquePersoFile = null;

document.addEventListener("DOMContentLoaded", () => {
  if (typeof AURA_AUTH !== "undefined") AURA_AUTH.requireAuth?.();

  initStepper();
  chargerPersonnages();
  initPersoSourceSwitch();
  initTonChips();
  initMusiqueHistoireChips();
  initNbScenesButtons();
  initSceneAddButton();
  initModeSwitch();
  initRealisteSourceSwitch();
  initPubCibleCards();
  initPub2dTemplateCards();
  initPub2dSourceToggle();
  initPub2dTonChips();
  initPub2dProduitSearch();
  initPub2dClips();
  initPub2dMusique();

  document.getElementById("mcnt-form").addEventListener("submit", onGenererStoryboard);
  document.getElementById("mcnt-next-btn").addEventListener("click", onNextStep);
  document.getElementById("mcnt-prev-btn").addEventListener("click", onPrevStep);
  document.getElementById("mcnt-download-all-btn").addEventListener("click", telechargerToutesLesImages);
  document.getElementById("mcnt-video-generate-btn").addEventListener("click", onGenererVideo);
  document.getElementById("mcnt-video-download-btn").addEventListener("click", telechargerVideo);

  document.getElementById("mcnt-caption-regen-btn").addEventListener("click", () => genererLegendeIA(true));
  document.getElementById("mcnt-caption-copy-btn").addEventListener("click", copierLegendeEtHashtags);
  document.getElementById("mcnt-share-native-btn").addEventListener("click", partagerVideoNative);
  document.querySelectorAll(".mcnt-share-chip").forEach(chip => {
    chip.addEventListener("click", () => partagerVersReseau(chip.dataset.network));
  });

  chargerHistorique();
});

/* ══════════════════════════════════════════════
   STEPPER / NAVIGATION
══════════════════════════════════════════════ */
function initStepper() {
  renderStepper();
}

function renderStepper() {
  document.querySelectorAll(".mcnt-step").forEach(el => {
    const n = parseInt(el.dataset.step, 10);
    el.classList.toggle("active", n === _mcntStep);
    el.classList.toggle("done", n < _mcntStep);
  });
}

function goToStep(step) {
  _mcntStep = step;
  document.querySelectorAll(".mcnt-panel").forEach(p => {
    p.classList.toggle("active", parseInt(p.dataset.panel, 10) === step);
  });
  renderStepper();

  document.getElementById("mcnt-prev-btn").style.display = step === 1 ? "none" : "flex";
  // À l'étape 3, le bouton "Suivant" est remplacé par "Générer le storyboard"
  // (submit du form) : le passage à l'étape 4 se fait après génération réussie.
  document.getElementById("mcnt-next-btn").style.display = (step === 3 || step === MCNT_TOTAL_STEPS) ? "none" : "flex";
  document.getElementById("mcnt-submit-btn").style.display = step === 3 ? "flex" : "none";

  document.querySelector(".mcnt-col-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function onNextStep() {
  const err = validateStep(_mcntStep);
  if (err) { showMcntToast(err, "error"); return; }

  // En quittant l'étape 2 (l'histoire / le style), on déclenche la
  // génération IA correspondante avant d'arriver sur l'étape 3.
  if (_mcntStep === 2) {
    goToStep(3);
    if (_mcntMode === "pub2d") {
      await genererTextesPub2d();
    } else {
      await genererScenario();
    }
    return;
  }

  if (_mcntStep < MCNT_TOTAL_STEPS) goToStep(_mcntStep + 1);
}

function onPrevStep() {
  if (_mcntStep > 1) goToStep(_mcntStep - 1);
}

function validateStep(step) {
  if (_mcntMode === "pub2d") {
    if (step === 1) return null; // rien à choisir ici en Pub 2D, juste un message d'information
    if (step === 2) {
      if (_mcntPub2dSourceType === "produit" && !_mcntPub2dProduits.length) return "Choisis au moins un produit ou passe en prompt libre.";
      if (_mcntPub2dSourceType === "libre" && !document.getElementById("mcnt-pub2d-prompt-libre").value.trim()) return "Décris ce que tu veux promouvoir.";
      return null;
    }
    if (step === 3 && !_mcntPub2dTextes) return "Génère d'abord les textes de la pub.";
    return null;
  }

  if (step === 1 && _mcntPersonnagesSelection.length === 0) return "Choisis au moins un personnage.";
  if (step === 2) {
    if (_mcntMode === "realiste" && _mcntRealisteSource === "colle") {
      if (!document.getElementById("mcnt-texte-colle").value.trim()) return "Colle le texte de ton histoire.";
    } else if (!document.getElementById("mcnt-prompt").value.trim()) {
      return "Décris la situation de ton histoire.";
    }
  }
  if (step === 3 && (!_mcntScenario || _mcntScenario.scenes.length === 0)) return "Le scénario doit contenir au moins une scène.";
  return null;
}

/* Après un storyboard généré avec succès, on avance manuellement vers
   l'étape 4 (le bouton "Suivant" n'existe plus à l'étape 3, remplacé par
   le bouton submit "Générer le storyboard"). */
function passerAEtapeVideo() {
  goToStep(4);
  renderVideoStatusInitial();
}

/* ══════════════════════════════════════════════
   ÉTAPE 1 — Personnages
══════════════════════════════════════════════ */
async function chargerPersonnages() {
  const grid = document.getElementById("mcnt-perso-grid");
  const endpoint = AURA_CONFIG.endpoints.contenus_personnages;

  if (!endpoint) {
    MCNT_PERSONNAGES = [];
    renderPersoGrid();
    return;
  }

  try {
    const rows = await API.get(endpoint + "?order=created_at.desc");
    MCNT_PERSONNAGES = (Array.isArray(rows) ? rows : []).map(r => ({
      id: r.id,
      nom: r.nom,
      description: r.description,
      style_visuel: r.style_visuel,
      src: r.image_url
    }));
  } catch (err) {
    console.error("Chargement des personnages impossible :", err.message);
    MCNT_PERSONNAGES = [];
    if (grid) grid.innerHTML = `<div class="mcnt-empty" style="border-color:var(--danger);color:var(--danger);">Erreur de chargement des personnages : ${escMcnt(err.message)}</div>`;
    return;
  }

  renderPersoGrid();
}

function renderPersoGrid() {
  const grid = document.getElementById("mcnt-perso-grid");
  if (!grid) return;

  // Un seul style visuel par histoire : dès qu'un personnage est sélectionné,
  // on masque/désactive les personnages des autres styles pour éviter un
  // storyboard visuellement incohérent (mélange 2D flat + 3D cartoon, etc.).
  const styleImpose = _mcntPersonnagesSelection.length
    ? MCNT_PERSONNAGES.find(p => p.id === _mcntPersonnagesSelection[0])?.style_visuel
    : null;

  const cartesPerso = MCNT_PERSONNAGES.map(p => {
    const verrouille = styleImpose && p.style_visuel !== styleImpose;
    return `
    <div class="mcnt-perso-card${verrouille ? " disabled" : ""}" data-perso-id="${p.id}" ${verrouille ? "title=\"Un seul style visuel par histoire\"" : ""}>
      <button type="button" class="mcnt-perso-delete" data-delete-perso-id="${p.id}" title="Supprimer ${escMcnt(p.nom)}" aria-label="Supprimer ${escMcnt(p.nom)}">&times;</button>
      <div class="mcnt-perso-thumb"><img src="${escMcnt(p.src)}" alt="${escMcnt(p.nom)}" loading="lazy"></div>
      <div class="mcnt-perso-name">${escMcnt(p.nom)}</div>
      <div class="mcnt-perso-style-tag">${escMcnt(mcntStyleById(p.style_visuel).nom)}</div>
    </div>`;
  }).join("");

  const carteNouveau = `
    <div class="mcnt-perso-card mcnt-perso-card-new${styleImpose ? " disabled" : ""}" id="mcnt-perso-card-new" ${styleImpose ? "title=\"Un seul style visuel par histoire — vide la sélection pour créer un personnage dans un autre style\"" : ""}>
      <div class="mcnt-perso-thumb mcnt-perso-thumb-new">
        <svg viewBox="0 0 24 24" width="32" height="32"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
      </div>
      <div class="mcnt-perso-name">Nouveau personnage</div>
    </div>`;

  grid.innerHTML = MCNT_PERSONNAGES.length
    ? cartesPerso + carteNouveau
    : carteNouveau + `<div class="mmkt-empty-inline" style="grid-column:1/-1;">Aucun personnage pour l'instant — crée le premier avec l'IA.</div>`;

  grid.querySelectorAll(".mcnt-perso-card:not(.mcnt-perso-card-new)").forEach(card => {
    card.addEventListener("click", () => {
      if (card.classList.contains("disabled")) {
        showMcntToast("Un seul style visuel par histoire. Vide la sélection pour changer de style.", "error");
        return;
      }
      mcntTogglePersonnage(card.dataset.persoId);
    });
  });

  grid.querySelectorAll(".mcnt-perso-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      supprimerPersonnage(btn.dataset.deletePersoId);
    });
  });

  const carteNew = document.getElementById("mcnt-perso-card-new");
  if (carteNew) {
    carteNew.addEventListener("click", () => {
      if (carteNew.classList.contains("disabled")) {
        showMcntToast("Un seul style visuel par histoire. Vide la sélection pour créer un personnage dans un autre style.", "error");
        return;
      }
      ouvrirFormNouveauPersonnage();
    });
  }

  updatePersoCountHint();
}

function mcntTogglePersonnage(id) {
  const idx = _mcntPersonnagesSelection.indexOf(id);
  if (idx >= 0) {
    _mcntPersonnagesSelection.splice(idx, 1);
  } else {
    if (_mcntPersonnagesSelection.length >= 4) {
      showMcntToast("4 personnages maximum par histoire.", "error");
      return;
    }
    _mcntPersonnagesSelection.push(id);
  }
  renderPersoGrid();
  renderPersoSelectionState();
}

// ─── Modal universel de confirmation ──────────────────────────────────────────
function appConfirm(message, { title = "Confirmation", okLabel = "OK", danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById("confirmOverlay");
    const titleEl = document.getElementById("confirmTitle");
    const msgEl = document.getElementById("confirmMsg");
    const okBtn = document.getElementById("confirmOkBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");
    if (!overlay) { resolve(window.confirm(message)); return; }

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = okLabel;
    okBtn.classList.toggle("confirm-btn-danger", danger);
    overlay.classList.add("open");

    const cleanup = (result) => {
      overlay.classList.remove("open");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlay = (e) => { if (e.target === overlay) cleanup(false); };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
  });
}

async function supprimerPersonnage(id) {
  const perso = MCNT_PERSONNAGES.find(p => p.id === id);
  const nom = perso?.nom || "ce personnage";

  const ok = await appConfirm(`Supprimer définitivement ${nom} ? Cette action est irréversible.`, {
    title: "Supprimer le personnage", okLabel: "Supprimer", danger: true
  });
  if (!ok) return;

  const endpoint = AURA_CONFIG.endpoints.contenus_personnages;

  try {
    await API.delete(endpoint + "?id=eq." + id);
  } catch (err) {
    console.error("Suppression du personnage impossible :", err.message);
    showMcntToast("Erreur lors de la suppression : " + err.message, "error");
    return;
  }

  MCNT_PERSONNAGES = MCNT_PERSONNAGES.filter(p => p.id !== id);
  const selIdx = _mcntPersonnagesSelection.indexOf(id);
  if (selIdx >= 0) _mcntPersonnagesSelection.splice(selIdx, 1);

  renderPersoGrid();
  renderPersoSelectionState();
  showMcntToast(`${nom} supprimé.`, "success");
}

function renderPersoSelectionState() {
  document.querySelectorAll(".mcnt-perso-card").forEach(card => {
    const id = card.dataset.persoId;
    const ordre = _mcntPersonnagesSelection.indexOf(id);
    card.classList.toggle("active", ordre >= 0);
    const existing = card.querySelector(".mcnt-perso-order");
    if (ordre >= 0) {
      if (existing) {
        existing.textContent = ordre + 1;
      } else {
        const badge = document.createElement("div");
        badge.className = "mcnt-perso-order";
        badge.textContent = ordre + 1;
        card.appendChild(badge);
      }
    } else if (existing) {
      existing.remove();
    }
  });
}

function updatePersoCountHint() {
  const hint = document.getElementById("mcnt-perso-count-hint");
  if (!hint) return;
  const n = _mcntPersonnagesSelection.length;
  hint.textContent = n === 0
    ? "Aucun personnage sélectionné."
    : `${n} personnage${n > 1 ? "s" : ""} sélectionné${n > 1 ? "s" : ""} — l'ordre ci-dessus donne l'ordre d'apparition.`;
}

/* ── Création d'un nouveau personnage par IA ── */
function ouvrirFormNouveauPersonnage() {
  _mcntNouveauPersoStyle = null;
  _mcntNouveauPersoApercu = null;
  _mcntNouveauPersoSource = "description";
  _mcntNouveauPersoPhotoDataUrl = null;
  _mcntNouveauPersoGenre = null;
  document.getElementById("mcnt-perso-form-nom").value = "";
  document.getElementById("mcnt-perso-form-desc").value = "";
  document.getElementById("mcnt-perso-form-nom-photo").value = "";
  document.getElementById("mcnt-perso-form-photo-input").value = "";
  renderPersoSourceSwitch();
  renderPersoStyleChips();
  renderPersoGenreChips();
  renderPersoApercu();
  document.getElementById("mcnt-perso-form-modal").classList.add("active");
}

function fermerFormNouveauPersonnage() {
  document.getElementById("mcnt-perso-form-modal").classList.remove("active");
}

function renderPersoSourceSwitch() {
  const panelDesc = document.getElementById("mcnt-perso-source-panel-description");
  const panelPhoto = document.getElementById("mcnt-perso-source-panel-photo");
  panelDesc.style.display = _mcntNouveauPersoSource === "description" ? "" : "none";
  panelPhoto.style.display = _mcntNouveauPersoSource === "photo" ? "" : "none";

  document.querySelectorAll(".mcnt-perso-source-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.source === _mcntNouveauPersoSource);
  });
}

function initPersoSourceSwitch() {
  document.querySelectorAll(".mcnt-perso-source-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _mcntNouveauPersoSource = btn.dataset.source;
      renderPersoSourceSwitch();
    });
  });

  const drop = document.getElementById("mcnt-perso-photo-drop");
  const input = document.getElementById("mcnt-perso-form-photo-input");
  drop.addEventListener("click", () => input.click());

  input.addEventListener("change", () => {
    const fichier = input.files?.[0];
    if (!fichier) return;
    const reader = new FileReader();
    reader.onload = () => {
      _mcntNouveauPersoPhotoDataUrl = reader.result;
      const img = document.getElementById("mcnt-perso-photo-drop-img");
      const empty = document.getElementById("mcnt-perso-photo-drop-empty");
      img.src = _mcntNouveauPersoPhotoDataUrl;
      img.style.display = "block";
      empty.style.display = "none";
    };
    reader.readAsDataURL(fichier);
  });
}

function renderPersoStyleChips() {
  const wrap = document.getElementById("mcnt-perso-form-styles");
  if (!wrap) return;
  wrap.innerHTML = MCNT_STYLES.map(s => `
    <button type="button" class="mcnt-chip${_mcntNouveauPersoStyle === s.id ? " active" : ""}" data-style-id="${s.id}">${escMcnt(s.nom)}</button>
  `).join("");
  wrap.querySelectorAll(".mcnt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      _mcntNouveauPersoStyle = chip.dataset.styleId;
      renderPersoStyleChips();
    });
  });
}

function renderPersoGenreChips() {
  const wraps = [
    document.getElementById("mcnt-perso-form-genres-description"),
    document.getElementById("mcnt-perso-form-genres-photo")
  ].filter(Boolean);

  wraps.forEach(wrap => {
    wrap.innerHTML = MCNT_GENRES.map(g => `
      <button type="button" class="mcnt-chip${_mcntNouveauPersoGenre === g.id ? " active" : ""}" data-genre-id="${g.id}">${escMcnt(g.nom)}</button>
    `).join("");
    wrap.querySelectorAll(".mcnt-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        _mcntNouveauPersoGenre = chip.dataset.genreId;
        renderPersoGenreChips();
      });
    });
  });
}

function renderPersoApercu() {
  const zone = document.getElementById("mcnt-perso-form-apercu");
  if (!zone) return;
  if (_mcntNouveauPersoGenerating) {
    zone.innerHTML = `<div class="mcnt-loading"><span class="mcnt-spinner"></span> Génération du portrait…</div>`;
  } else if (_mcntNouveauPersoApercu) {
    zone.innerHTML = `<img src="${_mcntNouveauPersoApercu}" alt="Aperçu du personnage">`;
  } else {
    zone.innerHTML = `<div class="mcnt-empty">L'aperçu du portrait apparaîtra ici.</div>`;
  }
}

async function genererApercuPersonnage() {
  if (_mcntNouveauPersoSource === "photo") return genererApercuPersonnageDepuisPhoto();
  return genererApercuPersonnageDepuisDescription();
}

async function genererApercuPersonnageDepuisDescription() {
  const nom = document.getElementById("mcnt-perso-form-nom").value.trim();
  const description = document.getElementById("mcnt-perso-form-desc").value.trim();

  if (!nom) return showMcntToast("Donne un nom au personnage.", "error");
  if (!_mcntNouveauPersoGenre) return showMcntToast("Choisis le genre du personnage.", "error");
  if (!description) return showMcntToast("Décris le personnage (apparence, tenue...).", "error");
  if (!_mcntNouveauPersoStyle) return showMcntToast("Choisis un style visuel.", "error");

  const style = mcntStyleById(_mcntNouveauPersoStyle);
  const genre = mcntGenreById(_mcntNouveauPersoGenre);
  const promptImage = `${style.description}, vertical portrait composition, square framing, single character centered, front-facing, neutral clean background, ${genre.description}, ${description}, high quality character reference sheet, no watermark, no text`;

  _mcntNouveauPersoGenerating = true;
  renderPersoApercu();

  try {
    const reponse = await API.post("/ai/contenus/image", { prompt: promptImage, mode: "reference" });
    const data = typeof reponse === "string" ? JSON.parse(reponse) : reponse;
    if (!data?.dataUrl) throw new Error("Le service de génération d'image n'a pas répondu.");
    _mcntNouveauPersoApercu = data.dataUrl;
  } catch (err) {
    showMcntToast("Erreur génération : " + err.message, "error");
  } finally {
    _mcntNouveauPersoGenerating = false;
    renderPersoApercu();
  }
}

async function genererApercuPersonnageDepuisPhoto() {
  const nom = document.getElementById("mcnt-perso-form-nom-photo").value.trim();

  if (!nom) return showMcntToast("Donne un nom au personnage.", "error");
  if (!_mcntNouveauPersoGenre) return showMcntToast("Choisis le genre du personnage.", "error");
  if (!_mcntNouveauPersoPhotoDataUrl) return showMcntToast("Choisis une photo de la personne.", "error");
  if (!_mcntNouveauPersoStyle) return showMcntToast("Choisis un style visuel.", "error");

  const style = mcntStyleById(_mcntNouveauPersoStyle);
  const genre = mcntGenreById(_mcntNouveauPersoGenre);
  const promptImage = `Using the person shown in the reference image, redraw them as ${genre.description}, ${style.description}, vertical portrait composition, square framing, single character centered, front-facing, neutral clean background, keep the same face shape, skin tone, hairstyle and outfit colors as the reference, high quality character reference sheet, no watermark, no text`;

  _mcntNouveauPersoGenerating = true;
  renderPersoApercu();

  try {
    const reponse = await API.post("/ai/contenus/image-scene", { prompt: promptImage, refImages: [_mcntNouveauPersoPhotoDataUrl] });
    const data = typeof reponse === "string" ? JSON.parse(reponse) : reponse;
    if (!data?.dataUrl) throw new Error("Le service de génération d'image n'a pas répondu.");
    _mcntNouveauPersoApercu = data.dataUrl;
  } catch (err) {
    showMcntToast("Erreur génération : " + err.message, "error");
  } finally {
    _mcntNouveauPersoGenerating = false;
    renderPersoApercu();
  }
}

async function sauvegarderNouveauPersonnage() {
  const estModePhoto = _mcntNouveauPersoSource === "photo";
  const nom = document.getElementById(estModePhoto ? "mcnt-perso-form-nom-photo" : "mcnt-perso-form-nom").value.trim();
  const descriptionSaisie = document.getElementById("mcnt-perso-form-desc").value.trim();
  const genre = mcntGenreById(_mcntNouveauPersoGenre);
  const genrePrefixe = genre ? `${genre.description}, ` : "";
  const description = estModePhoto
    ? (genrePrefixe + (descriptionSaisie || `personnage créé à partir d'une photo (${nom})`))
    : (genrePrefixe + descriptionSaisie);

  if (!nom) return showMcntToast("Donne un nom au personnage.", "error");
  if (!_mcntNouveauPersoGenre) return showMcntToast("Choisis le genre du personnage.", "error");
  if (!estModePhoto && !descriptionSaisie) return showMcntToast("Décris le personnage.", "error");
  if (!_mcntNouveauPersoStyle) return showMcntToast("Choisis un style visuel.", "error");
  if (!_mcntNouveauPersoApercu) return showMcntToast("Génère d'abord un aperçu du portrait.", "error");

  const btn = document.getElementById("mcnt-perso-form-save-btn");
  btn.disabled = true;

  try {
    const imageUrl = await uploaderVisuelMcnt(_mcntNouveauPersoApercu);
    const endpoint = AURA_CONFIG.endpoints.contenus_personnages;
    const created = await API.post(endpoint, {
      nom,
      description,
      style_visuel: _mcntNouveauPersoStyle,
      image_url: imageUrl
    }, { headers: { Prefer: "return=representation" } });

    const nouveauPerso = Array.isArray(created) ? created[0] : created;

    MCNT_PERSONNAGES.unshift({
      id: nouveauPerso.id,
      nom: nouveauPerso.nom,
      description: nouveauPerso.description,
      style_visuel: nouveauPerso.style_visuel,
      src: nouveauPerso.image_url
    });

    fermerFormNouveauPersonnage();
    renderPersoGrid();
    showMcntToast("Personnage créé avec succès.", "success");
  } catch (err) {
    showMcntToast("Erreur d'enregistrement : " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════
   ÉTAPE 2 — L'histoire
══════════════════════════════════════════════ */
function initTonChips() {
  document.querySelectorAll("#mcnt-ton-chips .mcnt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#mcnt-ton-chips .mcnt-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      _mcntTon = chip.dataset.ton;
    });
  });
}

/* Sélecteur de musique de fond du mode Histoire : "Auto" (par défaut) suit
   l'ambiance choisie ci-dessus ; les autres boutons forcent une musique
   précise indépendamment de l'ambiance narrative. Voir
   MCNT_MUSIQUES_HISTOIRE_URLS et getMcntMusiqueHistoireCourante(). */
function initMusiqueHistoireChips() {
  document.querySelectorAll("#mcnt-musique-histoire-chips .mcnt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#mcnt-musique-histoire-chips .mcnt-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      _mcntMusiqueHistoire = chip.dataset.musique;
    });
  });
}

function initNbScenesButtons() {
  document.querySelectorAll("#mcnt-nbscenes-row .mcnt-nbscenes-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mcnt-nbscenes-row .mcnt-nbscenes-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const nb = btn.dataset.nb;
      _mcntNbScenes = nb === "auto" ? "auto" : parseInt(nb, 10);
      document.querySelector(".mcnt-nbscenes-auto-tag").style.display = _mcntNbScenes === "auto" ? "inline-flex" : "none";
    });
  });
}

/* ══════════════════════════════════════════════
   MODE SWITCH — Histoire narrée / Pub 2D
   Change le mode courant et affiche/masque les sous-panels correspondants
   dans les étapes 1/2/3/4. Le switch lui-même vit en étape 1 (visible dès
   le départ, avant tout choix de personnage) : en mode Pub 2D, l'étape 1
   affiche juste un message d'information à la place de la grille de
   personnages, sans sauter d'étape — la navigation normale (Suivant/
   Précédent) reste identique dans les deux modes.
══════════════════════════════════════════════ */
function initModeSwitch() {
  document.querySelectorAll("#mcnt-mode-switch .mcnt-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => setMcntMode(btn.dataset.mode));
  });
}

function setMcntMode(mode) {
  if (_mcntMode === mode) return;
  _mcntMode = mode;

  document.querySelectorAll("#mcnt-mode-switch .mcnt-mode-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  const estPub2d = mode === "pub2d";
  const estRealiste = mode === "realiste";

  // "realiste" partage exactement les mêmes sous-panels 1/3/4 que "histoire"
  // (même grille de personnages, même liste de scènes, même écran vidéo) :
  // seule l'étape 2 varie, via le switch prompt/texte-collé ci-dessous.
  document.getElementById("mcnt-subpanel1-histoire").classList.toggle("active", !estPub2d);
  document.getElementById("mcnt-subpanel1-pub2d").classList.toggle("active", estPub2d);
  document.getElementById("mcnt-subpanel-histoire").classList.toggle("active", !estPub2d);
  document.getElementById("mcnt-subpanel-pub2d").classList.toggle("active", estPub2d);
  document.getElementById("mcnt-subpanel3-histoire").classList.toggle("active", !estPub2d);
  document.getElementById("mcnt-subpanel3-pub2d").classList.toggle("active", estPub2d);

  document.getElementById("mcnt-realiste-source-switch").style.display = estRealiste ? "flex" : "none";
  setMcntRealisteSource(estRealiste ? _mcntRealisteSource : "prompt");

  document.getElementById("mcnt-histoire-panel-title").textContent = estRealiste ? "Ton histoire réaliste" : "Quelle histoire veux-tu raconter ?";
  document.getElementById("mcnt-histoire-panel-desc").textContent = estRealiste
    ? "Aucune promotion d'Aura Market ici : uniquement ton récit, avec les personnages choisis."
    : "Décris la situation, l'IA écrit le scénario scène par scène pour chaque personnage choisi.";

  document.getElementById("mcnt-step1-label").textContent = estPub2d ? "Contenu" : "Personnages";
  document.querySelector('.mcnt-step[data-step="2"] .mcnt-step-label').textContent = estPub2d ? "Style" : "Histoire";
  document.querySelector('.mcnt-step[data-step="3"] .mcnt-step-label').textContent = estPub2d ? "Textes" : "Scénario";

  document.getElementById("mcnt-panel4-title").textContent = estPub2d ? "Vidéo finale" : "Voix et vidéo finale";
  document.getElementById("mcnt-panel4-desc").textContent = estPub2d
    ? "Génère automatiquement le spot vidéo prêt à publier."
    : "Génère la narration audio de chaque scène, puis compile automatiquement la vidéo finale (image + voix) prête à publier.";
  document.getElementById("mcnt-video-generate-btn-label").textContent = estPub2d ? "Générer la vidéo" : "Générer la vidéo";
  document.getElementById("mcnt-submit-btn-label").textContent = estPub2d ? "Valider les textes" : "Générer le storyboard";
}

/* Bascule entre "L'IA écrit l'histoire" (prompt court) et "Je colle mon texte"
   (texte complet fourni par l'admin), uniquement affiché en mode "realiste". */
function setMcntRealisteSource(source) {
  _mcntRealisteSource = source;
  document.querySelectorAll("#mcnt-realiste-source-switch .mcnt-cible-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.sourceHistoire === source);
  });
  document.getElementById("mcnt-histoire-bloc-prompt").style.display = source === "colle" ? "none" : "block";
  document.getElementById("mcnt-histoire-bloc-colle").style.display = source === "colle" ? "block" : "none";
}

function initRealisteSourceSwitch() {
  document.querySelectorAll("#mcnt-realiste-source-switch .mcnt-cible-btn").forEach(btn => {
    btn.addEventListener("click", () => setMcntRealisteSource(btn.dataset.sourceHistoire));
  });
}

/* ══════════════════════════════════════════════
   PUBLICITÉ VIDÉO — Cible du spot (étape 1)
   Chaque cible embarque un script publicitaire "prêt à tourner" rédigé
   comme par un copywriter (accroche, arguments, CTA, voix off complète).
   Ces presets servent à la fois de secours si la route IA du Worker est
   indisponible, ET d'exemple de référence envoyé à l'IA pour caler le ton
   et la structure attendue. Marché : Côte d'Ivoire, prix en FCFA.
══════════════════════════════════════════════ */
const MCNT_PUB_CIBLES = {
  client: {
    label: "Application Client",
    sujet: "l'application client Aura Market, pour acheter en ligne en toute confiance auprès de vendeurs vérifiés, avec une livraison rapide",
    accroche: "Achetez en toute confiance.",
    sousTexte: "Des milliers de produits, des vendeurs vérifiés, une livraison rapide.",
    cta: "Téléchargez Aura Market",
    features: [
      "Des milliers de produits en un seul endroit",
      "Des vendeurs vérifiés, zéro mauvaise surprise",
      "Livraison rapide, paiement sécurisé"
    ],
    textesCorps: [
      "Tout ce dont vous avez besoin",
      "Livré rapidement, près de chez vous",
      "Simple. Sûr. Moderne."
    ],
    scriptVoix: "Vous souhaitez acheter vos produits en toute confiance ? Découvrez Aura Market, la plateforme qui révolutionne votre façon d'acheter. Des milliers de produits, des vendeurs vérifiés, une livraison rapide et une expérience simple, sécurisée et moderne. N'attendez plus. Téléchargez Aura Market dès aujourd'hui."
  },
  vendeur: {
    label: "Application Vendeur",
    sujet: "l'application vendeur Aura Market, pour ouvrir sa boutique en ligne, toucher des milliers de clients et augmenter ses ventes",
    accroche: "Vendez plus, partout.",
    sousTexte: "Ouvrez votre boutique en ligne et touchez des milliers de clients.",
    cta: "Devenez vendeur",
    features: [
      "Votre boutique en ligne en quelques minutes",
      "Des milliers d'acheteurs à portée de main",
      "Suivi des ventes et paiements sécurisés"
    ],
    textesCorps: [
      "Votre boutique, ouverte 24h/24",
      "Des clients dans toute la ville",
      "Vos ventes qui décollent"
    ],
    scriptVoix: "Vous vendez des produits et vous voulez toucher plus de clients ? Passez à Aura Market. Ouvrez votre boutique en ligne en quelques minutes, présentez vos produits à des milliers d'acheteurs et gérez tout depuis votre téléphone. Plus de visibilité, plus de ventes, en toute sécurité. Rejoignez Aura Market et faites décoller votre commerce."
  },
  plateforme: {
    label: "Aura Market",
    sujet: "la plateforme Aura Market dans son ensemble, qui connecte acheteurs et vendeurs pour un commerce en ligne simple, sécurisé et moderne",
    accroche: "Le marché, réinventé.",
    sousTexte: "La plateforme qui connecte acheteurs et vendeurs, en toute simplicité.",
    cta: "Rejoignez Aura Market",
    features: [
      "Acheteurs et vendeurs réunis en un seul endroit",
      "Confiance, sécurité et transparence",
      "Une expérience simple et moderne"
    ],
    textesCorps: [
      "Acheter n'a jamais été aussi simple",
      "Vendre n'a jamais été aussi facile",
      "Bienvenue sur Aura Market"
    ],
    scriptVoix: "Et si acheter et vendre devenait enfin simple ? Aura Market, c'est la plateforme qui réunit acheteurs et vendeurs au même endroit. Des milliers de produits, des vendeurs vérifiés, une livraison rapide et des paiements sécurisés. Une nouvelle façon de faire ses achats, moderne et sans limites. Aura Market. Rejoignez le mouvement."
  }
};

function getMcntPubCiblePreset() {
  return MCNT_PUB_CIBLES[_mcntPubCible] || MCNT_PUB_CIBLES.plateforme;
}

function initPubCibleCards() {
  document.querySelectorAll("#mcnt-pub-cible-grid .mcnt-cible-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#mcnt-pub-cible-grid .mcnt-cible-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      _mcntPubCible = card.dataset.cible;

      // Pré-remplit le prompt libre avec le sujet de la cible choisie (sans
      // écraser un texte déjà saisi par l'admin) : la source par défaut d'un
      // spot d'app/plateforme est "libre", pas un produit précis.
      const promptEl = document.getElementById("mcnt-pub2d-prompt-libre");
      if (promptEl && !promptEl.value.trim()) {
        promptEl.value = getMcntPubCiblePreset().sujet;
        _mcntPub2dPromptLibre = promptEl.value;
      }
    });
  });
}

/* ══════════════════════════════════════════════
   PUBLICITÉ VIDÉO — Bibliothèque de styles (10 templates)
   Chaque "look" = un moteur de rendu de base (A/B/C/D) + une palette et des
   options de mouvement. La plupart des looks s'appuient sur le moteur
   cinématographique "B" (texte + produit), décliné en palettes distinctes —
   c'est ainsi que fonctionnent les vraies bibliothèques de templates : peu
   de moteurs, beaucoup d'habillages. Le champ `swatch` sert d'aperçu dans la
   carte de sélection. Les couleurs manquantes retombent sur les valeurs par
   défaut du moteur.
══════════════════════════════════════════════ */
const MCNT_PUB_TEMPLATES = [
  {
    id: "choc-or", base: "B", nom: "Texte choc — Or", desc: "Accroche plein écran + produit qui zoom",
    swatch: "linear-gradient(160deg,#F0B429,#7a5a0f)",
    style: {} // palette par défaut du moteur B (or sur fond sombre)
  },
  {
    id: "premium-sombre", base: "B", nom: "Premium sombre", desc: "Élégant, lent, argent sur noir profond",
    swatch: "linear-gradient(160deg,#E8E8EC,#3a3a40 70%,#0c0c0e)",
    style: {
      fond: ["#141416", "#0C0C0E", "#050506"], glow: "#8A8F98", accent: "#E8E8EC",
      texteDegrade: ["#FFFFFF", "#D8D8DE"], soustexte: "#9A9AA2",
      ctaDegrade: ["#FFFFFF", "#CFCFD6"], ctaTexte: "#111114", particules: "#8A8F98",
      vignette: 0.42, grain: 0.05, camAmpleur: 0.045, letterbox: true
    }
  },
  {
    id: "flash-promo", base: "B", nom: "Flash promo", desc: "Urgence, rouge/jaune saturé, rythme rapide",
    swatch: "linear-gradient(160deg,#FFD400,#C21620 70%,#2A0708)",
    style: {
      fond: ["#2A0708", "#7E0F12", "#C21620"], glow: "#FFD400", accent: "#FFD400",
      texteDegrade: ["#FFFFFF", "#FFE9A8"], soustexte: "#FFE0E0",
      ctaDegrade: ["#FFE24D", "#FFB800"], ctaTexte: "#3A0000", particules: "#FFD400",
      vignette: 0.3, grain: 0.03, camAmpleur: 0.085
    }
  },
  {
    id: "neon-urbain", base: "B", nom: "Néon urbain", desc: "Cyan/violet néon sur noir, glow électrique",
    swatch: "linear-gradient(160deg,#00E5FF,#7A5CFF 70%,#050510)",
    style: {
      fond: ["#0A0A1A", "#0D0B20", "#050510"], glow: "#00E5FF", accent: "#00E5FF",
      texteDegrade: ["#FFFFFF", "#B8FFF7"], soustexte: "#9AA6FF",
      ctaDegrade: ["#00E5FF", "#7A5CFF"], ctaTexte: "#04121A", particules: "#00E5FF",
      vignette: 0.4, grain: 0.05, camAmpleur: 0.06
    }
  },
  {
    id: "elegant-blanc", base: "B", nom: "Élégant blanc", desc: "Fond clair minimaliste, accent doré",
    swatch: "linear-gradient(160deg,#FFFFFF,#ECEAE5 70%,#C79A3E)",
    style: {
      fond: ["#FFFFFF", "#F4F4F2", "#ECEAE5"], glow: "#D9B25A", accent: "#C79A3E",
      texteDegrade: ["#1A1A1A", "#333333"], soustexte: "#666666",
      ctaDegrade: ["#1A1A1A", "#333333"], ctaTexte: "#FFFFFF", particules: "#C79A3E",
      logoColor: "#1A1A1A", vignette: 0.12, grain: 0.02, camAmpleur: 0.05, clair: true
    }
  },
  {
    id: "luxe-violet", base: "B", nom: "Luxe violet", desc: "Violet profond + or, cinématique letterbox",
    swatch: "linear-gradient(160deg,#E7C15A,#4a2c78 70%,#080512)",
    style: {
      fond: ["#1A0F2A", "#120A20", "#080512"], glow: "#C9A227", accent: "#E7C15A",
      texteDegrade: ["#FFFFFF", "#F0E2B8"], soustexte: "#C9B8E0",
      ctaDegrade: ["#F0D583", "#C9A227"], ctaTexte: "#1A0F2A", particules: "#E7C15A",
      vignette: 0.4, grain: 0.04, camAmpleur: 0.05, letterbox: true
    }
  },
  {
    id: "mockup-features", base: "A", nom: "Mockup + features", desc: "Téléphone animé et liste d'avantages",
    swatch: "linear-gradient(160deg,#20242b,#0f1114)",
    style: { accent: "#F0B429" }
  },
  {
    id: "ecran-app", base: "C", nom: "Écran d'app", desc: "Simulation d'interface qui charge (clair)",
    swatch: "linear-gradient(160deg,#e9e9ee 60%,#1447e6)",
    style: { accent: "#F0B429", clair: true }
  },
  {
    id: "ecran-app-sombre", base: "C", nom: "Écran d'app sombre", desc: "Simulation d'interface, mode sombre",
    swatch: "linear-gradient(160deg,#1a1c22 60%,#00E5FF)",
    style: { accent: "#00E5FF", clair: false }
  },
  {
    id: "montage-produits", base: "D", nom: "Montage produits", desc: "Enchaînement d'images produits + packshot final",
    swatch: "linear-gradient(160deg,#E11D2E,#F0B429 65%,#FFFFFF)",
    style: { accent: "#F0B429" }
  }
];

function mcntLookById(id) {
  return MCNT_PUB_TEMPLATES.find(l => l.id === id) || MCNT_PUB_TEMPLATES[0];
}
function mcntLookCourant() {
  return mcntLookById(_mcntPub2dTemplate);
}
function getMcntBaseTemplate() {
  return mcntLookCourant().base;
}
function getMcntStyleCourant() {
  return mcntLookCourant().style || {};
}

/* ══════════════════════════════════════════════
   PUBLICITÉ VIDÉO — Choix du style (10 templates générés dynamiquement)
══════════════════════════════════════════════ */
function initPub2dTemplateCards() {
  const grid = document.getElementById("mcnt-pub2d-template-grid");
  grid.innerHTML = MCNT_PUB_TEMPLATES.map(look => `
    <button type="button" class="mcnt-pub2d-template-card${look.id === _mcntPub2dTemplate ? " active" : ""}" data-template="${escMcnt(look.id)}">
      <span class="mcnt-pub2d-template-preview" style="background:${look.swatch};"></span>
      <span class="mcnt-pub2d-template-name">${escMcnt(look.nom)}</span>
      <span class="mcnt-pub2d-template-desc">${escMcnt(look.desc)}</span>
    </button>`).join("");

  grid.querySelectorAll(".mcnt-pub2d-template-card").forEach(card => {
    card.addEventListener("click", () => {
      grid.querySelectorAll(".mcnt-pub2d-template-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      _mcntPub2dTemplate = card.dataset.template;
      // Le montage produits accepte des vidéos EN OPTION : on montre le bloc
      // clips/musique pour ce look, mais il n'est plus obligatoire (rendu à
      // partir des images produits si aucune vidéo n'est fournie).
      document.getElementById("mcnt-pub2d-clips-bloc").style.display = getMcntBaseTemplate() === "D" ? "block" : "none";
    });
  });
}

/* ══════════════════════════════════════════════
   PUB 2D — Source du contenu (produit réel / prompt libre)
══════════════════════════════════════════════ */
function initPub2dSourceToggle() {
  document.querySelectorAll('.mcnt-subpanel#mcnt-subpanel-pub2d .mcnt-cible-row .mcnt-cible-btn').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('.mcnt-subpanel#mcnt-subpanel-pub2d .mcnt-cible-row .mcnt-cible-btn').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mcntPub2dSourceType = btn.dataset.source;
      document.getElementById("mcnt-pub2d-source-produit").style.display = _mcntPub2dSourceType === "produit" ? "block" : "none";
      document.getElementById("mcnt-pub2d-source-libre").style.display = _mcntPub2dSourceType === "libre" ? "block" : "none";
    });
  });

  document.getElementById("mcnt-pub2d-prompt-libre").addEventListener("input", e => {
    _mcntPub2dPromptLibre = e.target.value;
  });

  document.getElementById("mcnt-pub2d-ia-write-btn").addEventListener("click", onIaEcrireSpotPub2d);
}

/* Bouton "Laisser l'IA écrire le spot" : génère automatiquement un texte de
   spot à partir de la cible choisie et le place dans le champ prompt libre
   (l'admin peut ensuite l'éditer). S'appuie sur la route IA si dispo, sinon
   sur le script complet du preset de la cible — donc toujours un résultat. */
async function onIaEcrireSpotPub2d() {
  const btn = document.getElementById("mcnt-pub2d-ia-write-btn");
  const label = document.getElementById("mcnt-pub2d-ia-write-label");
  const textarea = document.getElementById("mcnt-pub2d-prompt-libre");
  const labelInitial = label.textContent;

  btn.disabled = true;
  label.textContent = "Rédaction…";

  let texte = "";
  try {
    const data = await appelerIATextesPub2d();
    texte = (data.scriptVoix || "").trim() || [data.accroche, data.sousTexte].filter(Boolean).join(" — ");
  } catch (err) {
    console.info("Écriture IA indisponible, preset utilisé :", err.message);
  }
  if (!texte) {
    const preset = getMcntPubCiblePreset();
    texte = preset.scriptVoix || preset.sujet;
  }

  textarea.value = texte.slice(0, 400);
  _mcntPub2dPromptLibre = textarea.value;
  btn.disabled = false;
  label.textContent = labelInitial;
  showMcntToast("Spot rédigé par l'IA — tu peux l'ajuster.", "success");
}

function initPub2dTonChips() {
  document.querySelectorAll("#mcnt-pub2d-ton-chips .mcnt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#mcnt-pub2d-ton-chips .mcnt-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      _mcntPub2dTon = chip.dataset.ton;
    });
  });
}

/* ══════════════════════════════════════════════
   PUB 2D — Template D : gestion des clips uploadés
   Chaque clip est lu localement (URL.createObjectURL, pas d'upload serveur
   à ce stade) pour afficher un aperçu et connaître sa durée réelle avant le
   montage. L'ordre du tableau _mcntPub2dClips DÉFINIT l'ordre de montage :
   les flèches haut/bas du composant réordonnent directement ce tableau.
══════════════════════════════════════════════ */
function initPub2dClips() {
  const input = document.getElementById("mcnt-pub2d-clips-input");
  input.addEventListener("change", async () => {
    const fichiers = Array.from(input.files || []);
    for (const file of fichiers) {
      await ajouterClipPub2d(file);
    }
    input.value = ""; // permet de réuploader le même fichier si besoin
  });
}

async function ajouterClipPub2d(file) {
  const url = URL.createObjectURL(file);
  const duree = await new Promise(resolve => {
    const videoTemp = document.createElement("video");
    videoTemp.preload = "metadata";
    videoTemp.src = url;
    videoTemp.onloadedmetadata = () => resolve(videoTemp.duration || 2);
    videoTemp.onerror = () => resolve(2); // durée de secours si le fichier est illisible
  });

  _mcntPub2dClips.push({ file, url, duree });
  renderPub2dClipsList();
}

function renderPub2dClipsList() {
  const wrap = document.getElementById("mcnt-pub2d-clips-list");
  if (_mcntPub2dClips.length === 0) {
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = _mcntPub2dClips.map((clip, i) => `
    <div class="mcnt-pub2d-clip-item" data-clip-index="${i}">
      <div class="mcnt-pub2d-clip-thumb"><video src="${clip.url}" muted playsinline></video></div>
      <div class="mcnt-pub2d-clip-info">
        <div class="mcnt-pub2d-clip-nom">${escMcnt(clip.file.name)}</div>
        <div class="mcnt-pub2d-clip-duree">${clip.duree.toFixed(1)}s</div>
      </div>
      <div class="mcnt-pub2d-clip-order">
        <button type="button" data-clip-up="${i}" ${i === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg></button>
        <button type="button" data-clip-down="${i}" ${i === _mcntPub2dClips.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
      </div>
      <button type="button" class="mcnt-pub2d-clip-remove" data-clip-remove="${i}" title="Retirer">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join("");

  wrap.querySelectorAll("[data-clip-up]").forEach(btn => {
    btn.addEventListener("click", () => deplacerClipPub2d(Number(btn.dataset.clipUp), -1));
  });
  wrap.querySelectorAll("[data-clip-down]").forEach(btn => {
    btn.addEventListener("click", () => deplacerClipPub2d(Number(btn.dataset.clipDown), 1));
  });
  wrap.querySelectorAll("[data-clip-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.clipRemove);
      URL.revokeObjectURL(_mcntPub2dClips[i].url);
      _mcntPub2dClips.splice(i, 1);
      renderPub2dClipsList();
    });
  });
}

function deplacerClipPub2d(index, direction) {
  const cible = index + direction;
  if (cible < 0 || cible >= _mcntPub2dClips.length) return;
  [_mcntPub2dClips[index], _mcntPub2dClips[cible]] = [_mcntPub2dClips[cible], _mcntPub2dClips[index]];
  renderPub2dClipsList();
}

/* ══════════════════════════════════════════════
   MODE HISTOIRE — Musique de fond automatique + SFX par scène
   Contrairement à Pub 2D (choix manuel obligatoire), ici la musique est
   choisie AUTOMATIQUEMENT selon l'ambiance (_mcntTon), avec une option de
   remplacement manuel par l'admin. Fichiers à déposer par l'admin dans
   assets/module-contenus/musiques/ et assets/module-contenus/sfx/ (mêmes
   noms que les clés ci-dessous) — le montage reste fonctionnel (silencieux
   sur cette piste) si un fichier est absent, il ne bloque jamais la vidéo.
══════════════════════════════════════════════ */

/* Une musique de fond par ambiance, jouée en boucle sur toute la durée de
   la vidéo (contrairement aux SFX qui sont ponctuels par scène). Volume
   modéré pour ne jamais couvrir la voix off. */
const MCNT_MUSIQUES_HISTOIRE_URLS = {
  humoristique: { src: "assets/module-contenus/musiques/histoire-humoristique.mp3", volume: 0.35 },
  inspirant: { src: "assets/module-contenus/musiques/histoire-inspirant.mp3", volume: 0.3 },
  dramatique: { src: "assets/module-contenus/musiques/histoire-dramatique.mp3", volume: 0.28 },
  dynamique: { src: "assets/module-contenus/musiques/histoire-dynamique.mp3", volume: 0.32 },
  mara: { src: "assets/module-contenus/musiques/histoire-mara.mp3", volume: 0.25 }
};

/* Sélection choisie par l'admin : "auto" (par défaut, dépend de _mcntTon)
   ou une clé de MCNT_MUSIQUES_HISTOIRE_URLS forcée manuellement. */
let _mcntMusiqueHistoire = "auto";

function getMcntMusiqueHistoireCourante() {
  const cle = _mcntMusiqueHistoire === "auto" ? _mcntTon : _mcntMusiqueHistoire;
  return MCNT_MUSIQUES_HISTOIRE_URLS[cle] || MCNT_MUSIQUES_HISTOIRE_URLS.inspirant;
}

/* Bibliothèque de petits effets sonores courts (impact, transition, succès…),
   détectés automatiquement à partir du contenu de chaque scène (texte +
   description visuelle). Chaque entrée : mots-clés à repérer (français) et
   le fichier son correspondant. Recherche insensible à la casse/accents,
   premier match trouvé = SFX retenu pour la scène (une seule couche de SFX
   par scène, pour ne pas surcharger le mix). */
const MCNT_SFX_REGLES = [
  {
    id: "victoire",
    src: "assets/module-contenus/sfx/victoire.mp3",
    volume: 0.55,
    motsCles: ["réussi", "reussi", "réussite", "reussite", "victoire", "succès", "succes", "gagné", "gagne", "triomphe"]
  },
  {
    id: "impact",
    src: "assets/module-contenus/sfx/impact.mp3",
    volume: 0.5,
    motsCles: ["choc", "tombe", "chute", "heurte", "cogne", "s'effondre", "seffondre", "coup"]
  },
  {
    id: "revelation",
    src: "assets/module-contenus/sfx/revelation.mp3",
    volume: 0.45,
    motsCles: ["soudain", "révèle", "revele", "découvre", "decouvre", "comprend", "réalise", "realise"]
  },
  {
    id: "transition_douce",
    src: "assets/module-contenus/sfx/transition-douce.mp3",
    volume: 0.35,
    motsCles: ["plus tard", "le lendemain", "quelques jours", "quelque temps", "peu après", "peu apres"]
  },
  {
    id: "notification",
    src: "assets/module-contenus/sfx/notification.mp3",
    volume: 0.45,
    motsCles: ["téléphone", "telephone", "notification", "message", "appel", "sonne", "écran", "ecran"]
  }
];

/* Retire les accents pour une recherche de mots-clés plus robuste. */
function normaliserTexteMcnt(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* Détecte le SFX approprié pour une scène à partir de son texte ET de sa
   description visuelle (les deux combinés couvrent plus de cas qu'un seul
   des deux). Retourne null si aucun mot-clé ne correspond — la scène reste
   alors sans SFX, ce qui est le cas normal pour la majorité des scènes
   neutres (un montage qui met un son sur chaque scène devient fatigant). */
function detecterSfxSceneMcnt(scene) {
  const texteComplet = normaliserTexteMcnt((scene.texte || "") + " " + (scene.visuel || ""));
  for (const regle of MCNT_SFX_REGLES) {
    if (regle.motsCles.some(mot => texteComplet.includes(normaliserTexteMcnt(mot)))) {
      return regle;
    }
  }
  return null;
}


const MCNT_MUSIQUES_URLS = {
  energique: "assets/module-contenus/musiques/energique.mp3",
  fun: "assets/module-contenus/musiques/fun.mp3",
  urbain: "assets/module-contenus/musiques/urbain.mp3"
};

/* Charge un fichier audio local en data URL, avec échec silencieux (retourne
   null) si le fichier est absent du serveur — c'est le comportement attendu
   tant que l'admin n'a pas déposé ses fichiers dans assets/module-contenus/
   musiques/ ou /sfx/ : le montage continue sans cette piste plutôt que de
   faire échouer toute la génération vidéo. */
async function chargerAudioLocalMcnt(url, volume = 1) {
  try {
    const reponse = await fetch(url);
    if (!reponse.ok) return null;
    const blob = await reponse.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { dataUrl, volume };
  } catch (err) {
    console.info(`Piste audio indisponible (${url}) :`, err.message);
    return null;
  }
}

/* Charge la musique de fond du mode Histoire (auto selon l'ambiance, ou
   forcée par l'admin) — voir MCNT_MUSIQUES_HISTOIRE_URLS. */
async function chargerMusiqueHistoireMcnt() {
  const musique = getMcntMusiqueHistoireCourante();
  return chargerAudioLocalMcnt(musique.src, musique.volume);
}

/* Charge le SFX détecté pour une scène donnée, ou null si aucune règle ne
   correspond au contenu de la scène (voir detecterSfxSceneMcnt). */
async function chargerSfxSceneMcnt(scene) {
  const regle = detecterSfxSceneMcnt(scene);
  if (!regle) return null;
  return chargerAudioLocalMcnt(regle.src, regle.volume);
}

function initPub2dMusique() {
  document.querySelectorAll("#mcnt-pub2d-musique-row .mcnt-pub2d-musique-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mcnt-pub2d-musique-row .mcnt-pub2d-musique-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _mcntPub2dMusique = btn.dataset.musique;

      const infoPerso = document.getElementById("mcnt-pub2d-musique-perso-info");
      if (_mcntPub2dMusique === "perso") {
        document.getElementById("mcnt-pub2d-musique-input").click();
      } else {
        infoPerso.style.display = "none";
      }
    });
  });

  document.getElementById("mcnt-pub2d-musique-input").addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    _mcntPub2dMusiquePersoFile = file;
    const infoPerso = document.getElementById("mcnt-pub2d-musique-perso-info");
    infoPerso.style.display = "block";
    infoPerso.textContent = `🎵 ${file.name}`;
  });
}

/* Recherche produit en direct sur la table `produits` via l'endpoint REST
   déjà exposé par le Worker (AURA_CONFIG.endpoints.produits), avec jointure
   sur la boutique (users_vendeurs) pour afficher nom + ville dans les
   résultats. Debounce de 350ms pour éviter une requête par frappe. */
function initPub2dProduitSearch() {
  const input = document.getElementById("mcnt-pub2d-produit-search");
  input.addEventListener("input", () => {
    clearTimeout(_mcntPub2dRecherche);
    const q = input.value.trim();
    if (q.length < 2) {
      document.getElementById("mcnt-pub2d-produit-results").innerHTML = "";
      return;
    }
    _mcntPub2dRecherche = setTimeout(() => rechercherProduitsMcnt(q), 350);
  });
}

async function rechercherProduitsMcnt(q) {
  const results = document.getElementById("mcnt-pub2d-produit-results");
  results.innerHTML = `<div class="mmkt-empty-inline">Recherche…</div>`;

  try {
    const endpoint = AURA_CONFIG.endpoints.produits;
    const filtre = `?nom=ilike.*${encodeURIComponent(q)}*&actif=eq.true&select=id,nom,prix,image_url,vendeur_id,users_vendeurs(nom_boutique,ville,logo_url)&limit=8`;
    const rows = await API.get(endpoint + filtre);
    const produits = Array.isArray(rows) ? rows : [];

    if (produits.length === 0) {
      results.innerHTML = `<div class="mmkt-empty-inline">Aucun produit trouvé.</div>`;
      return;
    }

    results.innerHTML = produits.map(p => {
      const boutique = p.users_vendeurs || {};
      return `
        <button type="button" class="mcnt-pub2d-produit-result-item" data-produit-id="${p.id}">
          <div class="mcnt-pub2d-produit-result-thumb">
            ${p.image_url ? `<img src="${escMcnt(p.image_url)}" alt="">` : ""}
          </div>
          <div class="mcnt-pub2d-produit-result-info">
            <div class="mcnt-pub2d-produit-result-nom">${escMcnt(p.nom || "Produit")}</div>
            <div class="mcnt-pub2d-produit-result-meta">${escMcnt(boutique.nom_boutique || "Boutique")} · ${formatMcntPrix(p.prix)}</div>
          </div>
        </button>`;
    }).join("");

    results.querySelectorAll(".mcnt-pub2d-produit-result-item").forEach(item => {
      item.addEventListener("click", () => {
        const produit = produits.find(p => p.id === item.dataset.produitId);
        if (produit) selectionnerProduitMcnt(produit);
      });
    });
  } catch (err) {
    results.innerHTML = `<div class="mmkt-empty-inline" style="color:var(--danger);">Erreur de recherche : ${escMcnt(err.message)}</div>`;
  }
}

function selectionnerProduitMcnt(produit) {
  const boutique = produit.users_vendeurs || {};
  // Évite les doublons si le même produit est sélectionné deux fois.
  if (_mcntPub2dProduits.some(p => p.id === produit.id)) {
    document.getElementById("mcnt-pub2d-produit-search").value = "";
    document.getElementById("mcnt-pub2d-produit-results").innerHTML = "";
    return;
  }

  _mcntPub2dProduits.push({
    id: produit.id,
    nom: produit.nom,
    prix: produit.prix,
    image_url: produit.image_url,
    boutique: { nom_boutique: boutique.nom_boutique, ville: boutique.ville }
  });
  _mcntPub2dProduitSelectionne = _mcntPub2dProduits[0]; // produit principal pour le rendu

  document.getElementById("mcnt-pub2d-produit-search").value = "";
  document.getElementById("mcnt-pub2d-produit-results").innerHTML = "";
  renderPub2dProduitsSelectionnes();
}

/* Affiche tous les produits sélectionnés sous forme de cartes empilées, avec
   un bouton de retrait par produit. Le premier produit sert de "principal"
   (image mise en avant dans le rendu vidéo) ; les suivants enrichissent le
   script et pourront défiler dans les templates montage/carrousel. */
function renderPub2dProduitsSelectionnes() {
  const selected = document.getElementById("mcnt-pub2d-produit-selected");
  if (!_mcntPub2dProduits.length) {
    selected.style.display = "none";
    selected.innerHTML = "";
    _mcntPub2dProduitSelectionne = null;
    return;
  }

  selected.style.display = "flex";
  selected.innerHTML = _mcntPub2dProduits.map((p, i) => `
    <div class="mcnt-pub2d-produit-selected-item">
      <div class="mcnt-pub2d-produit-selected-thumb">
        ${p.image_url ? `<img src="${escMcnt(p.image_url)}" alt="">` : ""}
      </div>
      <div class="mcnt-pub2d-produit-selected-info">
        <div class="mcnt-pub2d-produit-selected-nom">${escMcnt(p.nom || "Produit")}${i === 0 ? ' <span class="mcnt-pub2d-produit-principal">principal</span>' : ""}</div>
        <div class="mcnt-pub2d-produit-selected-meta">${escMcnt(p.boutique?.nom_boutique || "Boutique")} · ${formatMcntPrix(p.prix)}</div>
      </div>
      <button type="button" class="mcnt-pub2d-produit-selected-clear" data-produit-remove="${escMcnt(p.id)}" title="Retirer">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join("");

  selected.querySelectorAll("[data-produit-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      _mcntPub2dProduits = _mcntPub2dProduits.filter(p => String(p.id) !== String(btn.dataset.produitRemove));
      _mcntPub2dProduitSelectionne = _mcntPub2dProduits[0] || null;
      renderPub2dProduitsSelectionnes();
    });
  });
}

function formatMcntPrix(prix) {
  if (prix === null || prix === undefined) return "";
  const n = Number(prix);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("fr-FR") + " FCFA";
}

/* ══════════════════════════════════════════════
   PUB 2D — Génération des textes (IA + fallback) et édition (étape 3)
   Réutilise la même route Groq que le scénario narré (/ai/contenus/scenario
   n'est pas adaptée ici : on appelle une route dédiée /ai/contenus/pub2d qui
   retourne { accroche, sousTexte, cta } ; si la route n'existe pas encore
   côté Worker, un fallback local garde le module utilisable). Les champs
   varient légèrement selon le template choisi (A/B/C) mais la structure de
   données de base (accroche/sousTexte/cta) reste commune aux trois.
══════════════════════════════════════════════ */
function getMcntPub2dTonLabel() {
  const labels = {
    dynamique: "dynamique et rythmé, phrases courtes et percutantes",
    premium: "élégant et premium, vocabulaire soigné",
    urgence: "urgent, orienté promotion/offre limitée",
    rassurant: "rassurant et chaleureux, orienté confiance"
  };
  return labels[_mcntPub2dTon] || _mcntPub2dTon;
}

function getMcntPub2dSujetDescription() {
  if (_mcntPub2dSourceType === "produit" && _mcntPub2dProduits.length) {
    const parts = _mcntPub2dProduits.map(p => {
      const boutique = p.boutique?.nom_boutique ? ` de la boutique ${p.boutique.nom_boutique}` : "";
      return `"${p.nom}"${boutique} (${formatMcntPrix(p.prix)})`;
    });
    const liste = parts.length > 1
      ? parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1]
      : parts[0];
    return `${_mcntPub2dProduits.length > 1 ? "les produits" : "le produit"} ${liste}, disponibles sur Aura Market`;
  }
  return _mcntPub2dPromptLibre.trim() || getMcntPubCiblePreset().sujet;
}

async function genererTextesPub2d() {
  const loading = document.getElementById("mcnt-pub2d-texte-loading");
  const fields = document.getElementById("mcnt-pub2d-texte-fields");
  loading.style.display = "flex";
  fields.innerHTML = "";

  try {
    _mcntPub2dTextes = await appelerIATextesPub2d();
  } catch (err) {
    console.info("Textes Publicité Vidéo IA indisponibles, fallback local utilisé :", err.message);
    _mcntPub2dTextes = pub2dTextesFallback();
  } finally {
    // Garde-fou qualité : quoi qu'il arrive (IA faible ou fallback), on
    // garantit un vrai script de voix off complet, bien lu, plutôt que
    // quelques mots secs.
    _mcntPub2dTextes = renforcerScriptPub2d(_mcntPub2dTextes);
    loading.style.display = "none";
    renderPub2dTexteFields();
  }
}

async function appelerIATextesPub2d() {
  const preset = getMcntPubCiblePreset();
  const payload = {
    template: getMcntBaseTemplate(),
    look: _mcntPub2dTemplate,
    // Cible du spot : oriente l'IA (télécharger l'app client, recruter des
    // vendeurs, ou promouvoir la plateforme). Ignorée si l'admin cible un
    // produit précis (source = produit), qui prime alors sur la cible.
    cible: _mcntPubCible,
    cibleLabel: preset.label,
    sujet: getMcntPub2dSujetDescription(),
    ton: getMcntPub2dTonLabel(),
    produit: _mcntPub2dSourceType === "produit" ? _mcntPub2dProduitSelectionne : null,
    produits: _mcntPub2dSourceType === "produit" ? _mcntPub2dProduits : [],
    // Brief copywriter transmis à l'IA pour caler le niveau de qualité et la
    // structure attendue : accroche courte, arguments, CTA, et surtout un
    // script de voix off complet façon spot TV/radio.
    brief: "Rédige comme un copywriter publicitaire professionnel. Le script voix off (scriptVoix) doit être un vrai spot de 4 à 6 phrases : une question ou accroche qui capte l'attention, la présentation de l'offre, 2-3 bénéfices concrets, puis un appel à l'action final. Ton naturel, percutant, rassurant.",
    exemple: {
      accroche: preset.accroche,
      sousTexte: preset.sousTexte,
      cta: preset.cta,
      features: preset.features,
      textesCorps: preset.textesCorps,
      scriptVoix: preset.scriptVoix
    }
  };

  const reponse = await API.post("/ai/contenus/pub2d", payload);
  const data = typeof reponse === "string" ? JSON.parse(reponse) : reponse;
  if (!data?.accroche) throw new Error("Réponse IA invalide");

  return {
    accroche: data.accroche,
    sousTexte: data.sousTexte || "",
    cta: data.cta || "Commander maintenant",
    features: Array.isArray(data.features) && data.features.length
      ? data.features.slice(0, 3)
      : preset.features,
    textesCorps: Array.isArray(data.textesCorps) && data.textesCorps.length
      ? data.textesCorps.slice(0, 3)
      : preset.textesCorps,
    scriptVoix: data.scriptVoix || preset.scriptVoix
  };
}

/* Textes de secours si la route IA n'est pas encore configurée côté Worker :
   garde le module utilisable immédiatement, l'admin peut toujours éditer
   ensuite à l'étape 3. */
function pub2dTextesFallback() {
  if (_mcntPub2dSourceType === "produit" && _mcntPub2dProduitSelectionne) {
    const p = _mcntPub2dProduitSelectionne;
    const nom = p.nom || "ce produit";
    const boutique = p.boutique?.nom_boutique || "notre boutique";
    return {
      accroche: p.nom || "Découvre ce produit",
      sousTexte: `Disponible dès maintenant chez ${boutique} — ${formatMcntPrix(p.prix)}`,
      cta: "Commander sur Aura Market",
      features: pub2dFeaturesFallback(),
      textesCorps: [`${nom}, rien que pour vous`, "Livraison rapide, paiement sécurisé", "Commandez en quelques secondes"],
      scriptVoix: `Découvre ${nom}, disponible dès maintenant chez ${boutique} sur Aura Market. Commande-le en quelques secondes, où que tu sois.`
    };
  }
  // Hors produit : on s'appuie sur le preset copywriter de la cible choisie
  // (Application Client / Vendeur / Aura Market), déjà rédigé façon spot.
  const preset = getMcntPubCiblePreset();
  return {
    accroche: preset.accroche,
    sousTexte: preset.sousTexte,
    cta: preset.cta,
    features: preset.features,
    textesCorps: preset.textesCorps,
    scriptVoix: preset.scriptVoix
  };
}

/* 3 avantages génériques, utilisés par le template A (mockup + features)
   tant que l'IA n'en propose pas de plus adaptés au sujet. */
function pub2dFeaturesFallback() {
  return [
    "Livraison rapide partout en ville",
    "Des milliers de produits à portée de main",
    "Paiement simple et sécurisé"
  ];
}

/* ── Garde-fou qualité du script voix off ─────────────────────────────────
   Problème constaté : l'IA renvoie parfois une voix off réduite à quelques
   mots ("Achetez facilement sur Aura Market"), ce qui donne une pub qui
   "dit des mots courts" au lieu de lire un vrai spot. Ce garde-fou détecte
   un script trop maigre et le remplace par un spot complet de plusieurs
   phrases (accroche → offre → bénéfices → appel à l'action), construit à
   partir du contexte réel (cible + produits sélectionnés). Comme la timeline
   vidéo s'étire automatiquement sur la durée de l'audio
   (calculerFacteurEtirementPub2d), un script plus long = une vidéo plus
   longue et mieux rythmée, sans coupure de la voix. */
function compterMotsPub2d(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function construireScriptVoixCompletPub2d(t) {
  const preset = getMcntPubCiblePreset();
  const produits = (_mcntPub2dSourceType === "produit") ? (_mcntPub2dProduits || []) : [];
  const cta = String(t.cta || preset.cta || "Téléchargez Aura Market").replace(/[.!…]+$/, "");

  // Bénéfices : ceux rédigés par l'IA s'ils existent, sinon ceux de la cible.
  const source = (Array.isArray(t.features) && t.features.filter(Boolean).length)
    ? t.features
    : preset.features;
  const benefices = source.filter(Boolean).slice(0, 3).map(b => String(b).replace(/[.!…]+$/, ""));

  if (produits.length) {
    const noms = produits.map(p => p.nom).filter(Boolean);
    const liste = noms.length > 1
      ? noms.slice(0, -1).join(", ") + " et " + noms[noms.length - 1]
      : (noms[0] || "ce produit");
    const phrases = [];
    phrases.push("Vous cherchez le bon produit au bon prix ?");
    phrases.push(`Découvrez ${liste}, disponible dès maintenant sur Aura Market.`);
    if (benefices.length) phrases.push(benefices.join(", ") + ".");
    phrases.push("Commandez en quelques secondes, où que vous soyez.");
    phrases.push(`${cta} sur Aura Market dès aujourd'hui.`);
    return phrases.join(" ");
  }

  // Cas app/plateforme : le preset de la cible est déjà un spot complet.
  return preset.scriptVoix;
}

function renforcerScriptPub2d(t) {
  if (!t) return t;
  const script = String(t.scriptVoix || "").trim();
  const nbPhrases = (script.match(/[.!?…]/g) || []).length;
  // Trop court ou moins de 2 phrases -> on reconstruit un vrai spot.
  if (compterMotsPub2d(script) < 22 || nbPhrases < 2) {
    t.scriptVoix = construireScriptVoixCompletPub2d(t);
  }
  return t;
}

function renderPub2dTexteFields() {
  const fields = document.getElementById("mcnt-pub2d-texte-fields");
  if (!_mcntPub2dTextes) {
    fields.innerHTML = `<div class="mcnt-empty">Aucun texte pour l'instant.</div>`;
    return;
  }

  if (getMcntBaseTemplate() === "D") {
    renderPub2dTexteFieldsTemplateD(fields);
    return;
  }

  const t = _mcntPub2dTextes;
  const estTemplateA = getMcntBaseTemplate() === "A";

  fields.innerHTML = `
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Accroche principale</div>
      <textarea class="mcnt-scene-textarea" rows="2" maxlength="80" id="mcnt-pub2d-field-accroche">${escMcnt(t.accroche)}</textarea>
    </div>
    ${estTemplateA ? `
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Avantages <span class="mcnt-pub2d-field-count">3 max</span></div>
      ${[0, 1, 2].map(i => `
        <textarea class="mcnt-scene-textarea" rows="1" maxlength="60" style="margin-bottom:6px;" id="mcnt-pub2d-field-feature-${i}">${escMcnt(t.features?.[i] || "")}</textarea>
      `).join("")}
    </div>` : `
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Sous-texte</div>
      <textarea class="mcnt-scene-textarea" rows="2" maxlength="120" id="mcnt-pub2d-field-soustexte">${escMcnt(t.sousTexte)}</textarea>
    </div>`}
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Bouton d'appel à l'action (CTA)</div>
      <textarea class="mcnt-scene-textarea" rows="1" maxlength="30" id="mcnt-pub2d-field-cta">${escMcnt(t.cta)}</textarea>
    </div>
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Script voix off <span class="mcnt-pub2d-field-count">lu pendant la vidéo</span></div>
      <textarea class="mcnt-scene-textarea" rows="3" maxlength="220" id="mcnt-pub2d-field-scriptvoix">${escMcnt(t.scriptVoix || "")}</textarea>
    </div>`;

  ["accroche", "soustexte", "cta", "scriptvoix"].forEach(key => {
    const el = document.getElementById(`mcnt-pub2d-field-${key}`);
    if (!el) return;
    el.addEventListener("input", () => {
      const map = { accroche: "accroche", soustexte: "sousTexte", cta: "cta", scriptvoix: "scriptVoix" };
      _mcntPub2dTextes[map[key]] = el.value;
    });
  });

  if (estTemplateA) {
    if (!Array.isArray(_mcntPub2dTextes.features)) _mcntPub2dTextes.features = ["", "", ""];
    [0, 1, 2].forEach(i => {
      const el = document.getElementById(`mcnt-pub2d-field-feature-${i}`);
      el.addEventListener("input", () => { _mcntPub2dTextes.features[i] = el.value; });
    });
  }
}

/* Champs spécifiques au template D (montage dynamique) : une accroche
   d'intro très courte, 2-3 textes "corps" affichés au fil du montage
   (synchronisés au rythme, un par clip uploadé dans l'idéal), un slogan de
   packshot final et un numéro de téléphone bien visible — structure
   différente des autres templates (pas de CTA classique ni de sous-texte
   unique), donc rendu séparément plutôt que de forcer les mêmes champs. */
function renderPub2dTexteFieldsTemplateD(fields) {
  const t = _mcntPub2dTextes;
  if (!Array.isArray(t.textesCorps) || t.textesCorps.length === 0) {
    t.textesCorps = ["Chaque bouchée te fait sourire", "Toujours frais, toujours bon"];
  }

  fields.innerHTML = `
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Accroche d'intro <span class="mcnt-pub2d-field-count">1-2 mots, plein écran</span></div>
      <textarea class="mcnt-scene-textarea" rows="1" maxlength="30" id="mcnt-pub2d-field-accroche">${escMcnt(t.accroche)}</textarea>
    </div>
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Textes au fil du montage <span class="mcnt-pub2d-field-count">2-3, un par plan</span></div>
      ${[0, 1, 2].map(i => `
        <textarea class="mcnt-scene-textarea" rows="1" maxlength="50" style="margin-bottom:6px;" id="mcnt-pub2d-field-corps-${i}">${escMcnt(t.textesCorps[i] || "")}</textarea>
      `).join("")}
    </div>
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Slogan final (packshot)</div>
      <textarea class="mcnt-scene-textarea" rows="1" maxlength="60" id="mcnt-pub2d-field-slogan">${escMcnt(t.sousTexte || "")}</textarea>
    </div>
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Numéro de téléphone / CTA final</div>
      <textarea class="mcnt-scene-textarea" rows="1" maxlength="30" id="mcnt-pub2d-field-cta">${escMcnt(t.cta)}</textarea>
    </div>
    <div class="mcnt-pub2d-field">
      <div class="mcnt-pub2d-field-label">Script voix off <span class="mcnt-pub2d-field-count">optionnel, laisser vide si musique seule</span></div>
      <textarea class="mcnt-scene-textarea" rows="2" maxlength="220" id="mcnt-pub2d-field-scriptvoix">${escMcnt(t.scriptVoix || "")}</textarea>
    </div>`;

  document.getElementById("mcnt-pub2d-field-accroche").addEventListener("input", e => { t.accroche = e.target.value; });
  document.getElementById("mcnt-pub2d-field-slogan").addEventListener("input", e => { t.sousTexte = e.target.value; });
  document.getElementById("mcnt-pub2d-field-cta").addEventListener("input", e => { t.cta = e.target.value; });
  document.getElementById("mcnt-pub2d-field-scriptvoix").addEventListener("input", e => { t.scriptVoix = e.target.value; });
  [0, 1, 2].forEach(i => {
    document.getElementById(`mcnt-pub2d-field-corps-${i}`).addEventListener("input", e => { t.textesCorps[i] = e.target.value; });
  });
}

/* ══════════════════════════════════════════════
   ÉTAPE 3 — Scénario (génération IA + édition)
══════════════════════════════════════════════ */
async function genererScenario() {
  const loading = document.getElementById("mcnt-scenario-loading");
  const list = document.getElementById("mcnt-scene-list");
  loading.style.display = "flex";
  list.innerHTML = "";

  try {
    _mcntScenario = await appelerIAScenario();
  } catch (err) {
    // Route IA pas encore configurée côté Worker, ou échec réseau : on
    // retombe silencieusement sur un scénario généré localement, sans
    // alarmer l'admin avec un toast — l'histoire reste utilisable et
    // modifiable normalement à l'étape suivante.
    console.info("Scénario IA indisponible, fallback local utilisé :", err.message);
    _mcntScenario = scenarioFallback();
  } finally {
    loading.style.display = "none";
    renderSceneList();
  }
}

async function appelerIAScenario() {
  const personnagesData = _mcntPersonnagesSelection.map(id => MCNT_PERSONNAGES.find(p => p.id === id)).filter(Boolean);
  const estRealiste = _mcntMode === "realiste";
  const colleTexte = estRealiste && _mcntRealisteSource === "colle"
    ? document.getElementById("mcnt-texte-colle").value.trim()
    : "";
  const prompt = colleTexte ? "" : document.getElementById("mcnt-prompt").value.trim();

  const payload = {
    personnages: personnagesData.map(p => ({ id: p.id, nom: p.nom, description: p.description })),
    prompt,
    // Texte intégral fourni par l'admin : le serveur doit uniquement le
    // répartir en scènes (respecter le texte, ne pas le réécrire ni
    // l'inventer), et jamais y glisser de promotion Aura Market.
    texteComplet: colleTexte,
    ambiance: MCNT_TON_LABELS[_mcntTon] || _mcntTon,
    nbScenes: _mcntNbScenes, // "auto" ou un nombre : le serveur décide si "auto"
    sansPromotionAuraMarket: estRealiste
  };

  const reponse = await API.post("/ai/contenus/scenario", payload);
  const scenario = typeof reponse === "string" ? JSON.parse(reponse) : reponse;

  if (!scenario?.scenes?.length) throw new Error("Réponse IA invalide");

  return {
    titre: scenario.titre || (estRealiste ? "Histoire" : "Histoire Aura Market"),
    scenes: scenario.scenes.map((s, i) => ({
      id: `scene-${Date.now()}-${i}`,
      texte: s.texte || s.description || "",
      // Description purement visuelle de la scène, distincte du texte de
      // narration : c'est elle qui pilote la génération d'image, pour que
      // l'image corresponde exactement à l'action de CETTE scène précise.
      visuel: s.visuel || "",
      personnages: Array.isArray(s.personnages) && s.personnages.length ? s.personnages : personnagesData.map(p => p.id)
    }))
  };
}

/* Scénario de secours si la route IA n'est pas encore configurée côté Worker :
   garantit que le module reste utilisable, jamais bloqué. Contrairement à un
   simple copier-coller du prompt sur chaque scène, on construit une vraie
   progression narrative (situation → problème → déclic → résultat → appel à
   l'action), en réutilisant le sujet donné par l'utilisateur seulement dans
   la première scène, comme point de départ du récit. */
function scenarioFallback() {
  const personnagesData = _mcntPersonnagesSelection.map(id => MCNT_PERSONNAGES.find(p => p.id === id)).filter(Boolean);
  const nb = _mcntNbScenes === "auto" ? 3 : _mcntNbScenes;

  if (_mcntMode === "realiste") return scenarioFallbackRealiste(personnagesData, nb);

  const prompt = document.getElementById("mcnt-prompt").value.trim() || "une situation du quotidien";
  const nomPrincipal = personnagesData[0]?.nom.replace(/\s*\(.*\)/, "") || "Le personnage";

  // Trame en 6 temps forts, dont on prend les nb premiers (ou on répète
  // intelligemment le dernier "temps" si nb > 6, plutôt que de boucler
  // depuis le début et re-répéter la situation de départ).
  const trame = [
    `${nomPrincipal} vit ${prompt}, sans savoir que tout va bientôt changer.`,
    `La situation se complique : il lui faut une solution, vite.`,
    `C'est là qu'Aura Market entre en scène.`,
    `En quelques instants, tout devient plus simple.`,
    `Le résultat est là : satisfaction totale.`,
    `Aura Market — rejoins l'aventure dès maintenant.`
  ];

  const scenes = [];
  for (let i = 0; i < nb; i++) {
    const texte = i < trame.length ? trame[i] : trame[trame.length - 1];
    // Répartit les personnages en couvrant toute la distribution au fil des
    // scènes plutôt que d'en isoler un seul par scène.
    const persosScene = personnagesData.length
      ? (nb <= personnagesData.length
          ? [personnagesData[i % personnagesData.length].id]
          : personnagesData.map(p => p.id))
      : [];
    scenes.push({
      id: `scene-${Date.now()}-${i}`,
      texte,
      personnages: persosScene
    });
  }
  return { titre: "Histoire Aura Market", scenes };
}

/* Fallback local dédié au mode "Histoire réaliste" : jamais de mention
   d'Aura Market (ni marque, ni CTA de téléchargement), contrairement au
   fallback du mode narré ci-dessus qui sert des pubs. Deux cas :
   - texte collé par l'admin → on le découpe en nb blocs, sans réécrire son
     contenu (on respecte ses mots, on ne fait qu'un découpage mécanique) ;
   - prompt court → on construit une trame narrative neutre. */
function scenarioFallbackRealiste(personnagesData, nb) {
  const texteColle = _mcntRealisteSource === "colle"
    ? document.getElementById("mcnt-texte-colle").value.trim()
    : "";

  const repartirPersonnages = (i) => personnagesData.length
    ? (nb <= personnagesData.length
        ? [personnagesData[i % personnagesData.length].id]
        : personnagesData.map(p => p.id))
    : [];

  if (texteColle) {
    // Découpage par paragraphes si possible, sinon par phrases, réparti sur
    // nb scènes en conservant l'ordre et les mots exacts du texte fourni.
    const unites = texteColle.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    const source = unites.length >= nb ? unites : texteColle.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const parScene = Math.max(1, Math.ceil(source.length / nb));
    const scenes = [];
    for (let i = 0; i < nb; i++) {
      const bloc = source.slice(i * parScene, (i + 1) * parScene).join(" ");
      if (!bloc && i > 0) break;
      scenes.push({
        id: `scene-${Date.now()}-${i}`,
        texte: bloc || texteColle,
        personnages: repartirPersonnages(i)
      });
    }
    return { titre: "Histoire", scenes };
  }

  const prompt = document.getElementById("mcnt-prompt").value.trim() || "une situation du quotidien";
  const nomPrincipal = personnagesData[0]?.nom.replace(/\s*\(.*\)/, "") || "Le personnage";
  const trame = [
    `${nomPrincipal} vit ${prompt}.`,
    `La situation évolue et pousse à agir.`,
    `Un tournant se dessine.`,
    `Les choses se précisent.`,
    `Le dénouement approche.`,
    `L'histoire se conclut.`
  ];

  const scenes = [];
  for (let i = 0; i < nb; i++) {
    const texte = i < trame.length ? trame[i] : trame[trame.length - 1];
    scenes.push({
      id: `scene-${Date.now()}-${i}`,
      texte,
      personnages: repartirPersonnages(i)
    });
  }
  return { titre: "Histoire", scenes };
}

function renderSceneList() {
  const list = document.getElementById("mcnt-scene-list");
  if (!_mcntScenario || _mcntScenario.scenes.length === 0) {
    list.innerHTML = `<div class="mcnt-empty">Aucune scène pour l'instant.</div>`;
    return;
  }

  list.innerHTML = _mcntScenario.scenes.map((scene, i) => `
    <div class="mcnt-scene-card" data-scene-id="${scene.id}">
      <div class="mcnt-scene-head">
        <div class="mcnt-scene-num">${i + 1}</div>
        <div class="mcnt-scene-perso-tags">
          ${scene.personnages.map(pid => {
            const p = MCNT_PERSONNAGES.find(x => x.id === pid);
            return p ? `<span class="mcnt-tag gold">${escMcnt(p.nom)}</span>` : "";
          }).join("")}
        </div>
        <button type="button" class="mcnt-scene-remove" onclick="mcntSupprimerScene('${scene.id}')" title="Supprimer la scène">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h10l1-13"/></svg>
        </button>
      </div>
      <textarea class="mcnt-scene-textarea" oninput="mcntEditerScene('${scene.id}', this.value)">${escMcnt(scene.texte)}</textarea>
    </div>`).join("");
}

function mcntEditerScene(id, texte) {
  const scene = _mcntScenario?.scenes.find(s => s.id === id);
  if (scene) scene.texte = texte;
}

function mcntSupprimerScene(id) {
  if (!_mcntScenario) return;
  _mcntScenario.scenes = _mcntScenario.scenes.filter(s => s.id !== id);
  renderSceneList();
}

function initSceneAddButton() {
  document.getElementById("mcnt-scene-add-btn").addEventListener("click", () => {
    if (!_mcntScenario) _mcntScenario = { titre: "Histoire Aura Market", scenes: [] };
    _mcntScenario.scenes.push({
      id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      texte: "",
      personnages: [..._mcntPersonnagesSelection]
    });
    renderSceneList();
  });
}

/* Petite pause, utilisée entre deux tentatives d'un appel IA. */
function attendreMcnt(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* Exécute `tache` (une fonction async sans argument) en retentant
   automatiquement en cas d'échec, avec un délai croissant entre chaque
   tentative (backoff). Les services IA externes (Workers AI, ElevenLabs)
   échouent parfois par simple surcharge momentanée : retenter trop vite
   retombe souvent sur le même mur, donc on espace les tentatives au lieu
   de les enchaîner immédiatement. `onTentative` (optionnel) est appelé
   avant chaque essai avec le numéro de tentative (1-indexed), pour
   permettre de mettre à jour un libellé de chargement à l'écran.
   Relance l'erreur de la DERNIÈRE tentative si toutes échouent. */
async function avecRetryMcnt(tache, { tentatives = 3, delaisMs = [0, 1500, 3500], onTentative } = {}) {
  let derniereErreur;
  for (let i = 0; i < tentatives; i++) {
    if (delaisMs[i]) await attendreMcnt(delaisMs[i]);
    if (onTentative) onTentative(i + 1);
    try {
      return await tache();
    } catch (err) {
      derniereErreur = err;
    }
  }
  throw derniereErreur;
}

/* ══════════════════════════════════════════════
   GÉNÉRATION DU STORYBOARD
══════════════════════════════════════════════ */
async function onGenererStoryboard(e) {
  e.preventDefault();
  const err = validateStep(3);
  if (err) { showMcntToast(err, "error"); return; }

  if (_mcntMode === "pub2d") {
    _mcntPub2dDernierResultat = { ..._mcntPub2dTextes, template: getMcntBaseTemplate(), look: _mcntPub2dTemplate, style: getMcntStyleCourant() };
    passerAEtapeVideo();
    return;
  }

  const submitBtn = document.getElementById("mcnt-submit-btn");
  submitBtn.disabled = true;

  const resultWrap = document.getElementById("mcnt-result-wrap");
  const storyboard = document.getElementById("mcnt-storyboard");
  resultWrap.style.display = "block";

  const scenes = _mcntScenario.scenes;
  storyboard.innerHTML = scenes.map((scene, i) => `
    <div class="mcnt-storyboard-item" data-scene-index="${i}">
      <div class="mcnt-storyboard-img-wrap">
        <span class="mcnt-storyboard-badge">Scène ${i + 1}</span>
        <img style="opacity:0;" alt="Scène ${i + 1}">
        <div class="mcnt-storyboard-loading">
          <div class="mcnt-spinner"></div>
          <span>Création de l'image…</span>
        </div>
      </div>
      <div class="mcnt-storyboard-caption">${escMcnt(scene.texte)}</div>
    </div>`).join("");

  resultWrap.scrollIntoView({ behavior: "smooth", block: "start" });

  const resultatScenes = [];

  // Génération séquentielle : plus lent qu'en parallèle mais évite de
  // saturer le Worker/Workers AI et garde un ordre d'affichage prévisible.
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const item = storyboard.querySelector(`[data-scene-index="${i}"]`);
    const img = item.querySelector("img");
    const loading = item.querySelector(".mcnt-storyboard-loading");
    const spanLoading = loading.querySelector("span");

    try {
      const imageUrl = await avecRetryMcnt(
        () => genererImageSceneIA(scene, i, scenes.length),
        { onTentative: (n) => { if (spanLoading) spanLoading.textContent = n === 1 ? "Création de l'image…" : `Nouvelle tentative (${n}/3)…`; } }
      );
      img.src = imageUrl;
      img.style.opacity = "1";
      loading.style.display = "none";
      resultatScenes.push({ texte: scene.texte, imageUrl });
    } catch (err) {
      afficherEchecImageScene(loading, i);
      resultatScenes.push({ texte: scene.texte, imageUrl: null });
    }
  }

  _mcntDernierResultat = { titre: _mcntScenario.titre, scenes: resultatScenes };
  _mcntVideoScenes = null; // nouveau storyboard = on invalide une éventuelle vidéo précédente
  submitBtn.disabled = false;

  await sauvegarderHistorique({
    titre: _mcntScenario.titre,
    personnages: _mcntPersonnagesSelection,
    scenes: resultatScenes,
    ambiance: _mcntTon
  });
  chargerHistorique();

  showMcntToast("Storyboard généré avec succès.", "success");
  passerAEtapeVideo();
}

/* ── Génération canvas : personnage(s) de la scène détourés sur un fond
   travaillé (glow + étincelles, même esprit que le template "duo"). ── */
async function genererImageSceneCanvas(scene, index) {
  const canvas = document.getElementById("mcnt-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const couleur = index % 2 === 0 ? "#F0B429" : "#E0276F";

  // Fond profond avec glow radial central, dans l'esprit du template duo.
  ctx.fillStyle = "#0A0A0C";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.75);
  glow.addColorStop(0, `${couleur}55`);
  glow.addColorStop(1, `${couleur}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const personnagesScene = scene.personnages.map(id => MCNT_PERSONNAGES.find(p => p.id === id)).filter(Boolean);
  const imgs = await Promise.all(personnagesScene.map(p => chargerImageMcnt(p.src).catch(() => null)));

  const zoneTop = 140;
  const zoneBottom = H - 320;
  const zoneH = zoneBottom - zoneTop;
  const n = Math.max(imgs.filter(Boolean).length, 1);
  const slotW = W / n;

  let slot = 0;
  imgs.forEach(img => {
    if (!img) return;
    const ratio = img.width / img.height;
    let ph = zoneH, pw = ph * ratio;
    if (pw > slotW - 40) { pw = slotW - 40; ph = pw / ratio; }
    const px = slot * slotW + (slotW - pw) / 2;
    const py = zoneBottom - ph;
    ctx.drawImage(img, px, py, pw, ph);
    slot++;
  });

  // Petites étincelles décoratives en haut de la scène
  dessinerEtincellesSceneMcnt(ctx, W, H, couleur);

  // Bandeau du bas avec le texte de la scène
  const padding = 48;
  ctx.font = "800 30px Inter, sans-serif";
  const lignes = wrapTextMcnt(ctx, scene.texte || "", W - padding * 2, 4);
  const ligneH = 38;
  const hauteurBande = lignes.length * ligneH + 60;
  const bandeY = H - hauteurBande;

  const gradBande = ctx.createLinearGradient(0, bandeY, 0, H);
  gradBande.addColorStop(0, "rgba(10,10,12,0.35)");
  gradBande.addColorStop(0.3, "rgba(10,10,12,0.92)");
  gradBande.addColorStop(1, "#0A0A0C");
  ctx.fillStyle = gradBande;
  ctx.fillRect(0, bandeY, W, hauteurBande);

  ctx.fillStyle = couleur;
  ctx.fillRect(0, bandeY, W, 4);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 26px Inter, sans-serif";
  ctx.textBaseline = "alphabetic";
  let ty = bandeY + 42;
  lignes.forEach(l => { ctx.fillText(l, padding, ty); ty += ligneH; });

  let dataUrl;
  try {
    dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    throw new Error("Montage impossible (image protégée)");
  }

  try {
    return await uploaderVisuelMcnt(dataUrl);
  } catch {
    // Si l'upload Storage échoue, on garde quand même le rendu localement.
    return dataUrl;
  }
}

/* Petites étincelles dispersées en haut de l'image, sans dépendance au
   fichier module-marketing.js (module autonome). */
function dessinerEtincellesSceneMcnt(ctx, W, H, couleur) {
  const rand = (() => { let s = 17; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
  for (let i = 0; i < 8; i++) {
    const x = 40 + rand() * (W - 80);
    const y = 30 + rand() * 90;
    const size = 8 + rand() * 18;
    const alpha = 0.3 + rand() * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#FFFFFF";
    const r = size / 2, rInner = r * 0.22;
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
}

function wrapTextMcnt(ctx, text, maxWidth, maxLines = 4) {
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

function chargerImageMcnt(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image inaccessible : " + src));
    img.src = src;
  });
}

async function uploaderVisuelMcnt(dataUrl) {
  const token = AURA_AUTH.getAccessToken();
  const blob = await (await fetch(dataUrl)).blob();
  const path = `histoire_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

  const res = await fetch(`${AURA_CONFIG.WORKER_URL}/storage/object/${MCNT_BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${token}` },
    body: blob
  });

  if (!res.ok) throw new Error("Échec de l'upload du visuel");
  return `${AURA_CONFIG.WORKER_URL}/storage/object/public/${MCNT_BUCKET}/${path}`;
}

/* ── Direction artistique cinématique (mode "Histoire réaliste" uniquement) ──
   Injecte dans le prompt image deux leviers empruntés au style "narration
   inspirante" (contraste d'échelle personnage/décor, palette qui évolue du
   froid vers le chaud) sans jamais écrire le contenu de la scène : seule la
   mise en scène visuelle est suggérée, le texte/visuel de chaque scène reste
   entièrement décidé par l'utilisateur ou l'IA du scénario.
   position 0..1 : place approximative de la scène dans l'histoire (index /
   nombre total de scènes), pour faire glisser la palette du froid (doute,
   début) vers le chaud (résolution, fin) au fil du récit. */
function directionArtistiqueCinematiqueMcnt(position = 0.5) {
  const palette = position < 0.5
    ? "cold blue-grey tones, overcast or dim lighting, subdued atmosphere"
    : "warm golden tones, sunlight or glowing light sources, uplifting atmosphere";
  return `cinematic scale contrast between the small human figure and an oversized environment (tall buildings, vast rooms or wide open space), ${palette}, dramatic depth, painterly digital illustration lighting`;
}

/* ── Génération IA avec cohérence de personnage (Cloudflare Workers AI,
   FLUX.2 klein via le Worker) : plutôt que de repartir de zéro à chaque
   scène (ce qui donnait un visage/une tenue différents à chaque image),
   on envoie en référence l'illustration statique déjà associée à chaque
   personnage (MCNT_PERSONNAGES[].src) — jusqu'à 4 images de référence,
   une par personnage présent dans la scène. FLUX.2 klein réutilise ces
   références pour garder une apparence cohérente sur toute l'histoire.
   Format vertical 9:16. Retourne une image uploadée dans Supabase Storage
   (avec repli sur la data URL brute si l'upload échoue). ── */
async function genererImageSceneIA(scene, indexScene = 0, totalScenes = 1) {
  const personnagesScene = scene.personnages.map(id => MCNT_PERSONNAGES.find(p => p.id === id)).filter(Boolean);
  const descPersonnages = personnagesScene.map(p => p.description).join(", avec ") || "un personnage";
  const ambiance = MCNT_TON_LABELS[_mcntTon] || _mcntTon;
  const estRealiste = _mcntMode === "realiste";

  // Description purement visuelle de LA scène en cours (fournie par l'IA du
  // scénario, ou repli sur le texte de narration si absente — ex. fallback
  // local) : c'est elle qui pilote l'image, jamais le texte de narration
  // complet, pour que chaque image corresponde bien à l'action précise de
  // sa propre scène et non à un mélange de plusieurs moments.
  const descriptionScene = (scene.visuel || scene.texte || "").trim();

  // Le style visuel est celui du personnage (un seul style autorisé par
  // histoire, imposé dès la sélection à l'étape 1) — fallback sur "3D
  // cartoon" seulement si aucun personnage n'a de style_visuel connu
  // (ancienne donnée ou scène sans personnage).
  const styleId = personnagesScene[0]?.style_visuel;
  const stylePrompt = styleId ? mcntStyleById(styleId).description : mcntStyleById("3d_cartoon").description;

  const refImages = (await Promise.all(
    personnagesScene.map(p => imageVersDataUrlMcnt(p.src).catch(() => null))
  )).filter(Boolean);

  // Si la scène évoque l'application (achat, catalogue, écran de
  // téléphone...), on ajoute la vraie capture d'écran d'Aura Market comme
  // référence supplémentaire, pour que l'interface dessinée par l'IA reste
  // fidèle au vrai design plutôt qu'une app générique inventée.
  // Ne s'applique jamais en mode "Histoire réaliste" : ce mode ne fait
  // aucune promotion d'Aura Market, donc aucune app ne doit apparaître.
  const utiliseApp = !estRealiste && scenNecessiteAppMcnt(descriptionScene);
  if (utiliseApp) {
    const refApp = await imageVersDataUrlMcnt(MCNT_APP_REFERENCE_SRC).catch(() => null);
    if (refApp) refImages.push(refApp);
  }

  const consigneApp = utiliseApp
    ? " The scene must show a smartphone screen displaying the Aura Market e-commerce app — use the last reference image as the exact visual reference for the app's interface (same layout, same dark theme, same product cards, same colors), redrawn in the chosen illustration style, staying faithful to the real interface."
    : "";

  // "professional advertising quality" n'a pas de sens pour un récit qui
  // n'est pas une pub : on garde juste une exigence de qualité neutre.
  const qualitePrompt = estRealiste ? "high quality, cinematic" : "professional advertising quality";

  // Direction artistique cinématique (contraste d'échelle + palette qui
  // évolue du froid vers le chaud) : activée par le ton "Mara" spécifiquement
  // (quel que soit le mode histoire/réaliste), pour ne pas altérer le rendu
  // des autres ambiances ni celui des pubs.
  const position = totalScenes > 1 ? indexScene / (totalScenes - 1) : 0.5;
  const directionArtistique = _mcntTon === "mara" ? `, ${directionArtistiqueCinematiqueMcnt(position)}` : "";

  const promptImage = refImages.length
    ? `Using the same character(s) shown in the reference image(s), ${stylePrompt}, vertical portrait composition, keep the exact same face, hairstyle, glasses and outfit as in the reference — only change the pose and setting to match: ${descPersonnages}, scene: ${descriptionScene}, mood: ${ambiance}${directionArtistique}, clean modern background, ${qualitePrompt}, no watermark, no text.${consigneApp}`
    : `${stylePrompt}, vertical portrait composition, ${descPersonnages}, scene: ${descriptionScene}, mood: ${ambiance}${directionArtistique}, clean modern background, ${qualitePrompt}, no watermark, no text.${consigneApp}`;

  const route = refImages.length ? "/ai/contenus/image-scene" : "/ai/contenus/image";
  const payload = refImages.length ? { prompt: promptImage, refImages } : { prompt: promptImage };

  const reponse = await API.post(route, payload);
  const data = typeof reponse === "string" ? JSON.parse(reponse) : reponse;
  if (!data?.dataUrl) throw new Error("Le service de génération d'image n'a pas répondu.");

  try {
    return await uploaderVisuelMcnt(data.dataUrl);
  } catch {
    // Si l'upload Storage échoue, on garde quand même le rendu localement.
    return data.dataUrl;
  }
}

/* Affiche le message d'échec + un vrai bouton "Réessayer" à la place du
   spinner, dans la zone de chargement d'une scène du storyboard. */
function afficherEchecImageScene(loading, index) {
  loading.innerHTML = `
    <span style="color:var(--danger);">Échec de cette image</span>
    <button type="button" class="mcnt-storyboard-retry-btn" data-retry-index="${index}">
      <svg viewBox="0 0 24 24"><path d="M21 2v6h-6M3 22v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0 0 20.49 15"/></svg>
      Réessayer
    </button>`;
  loading.querySelector(".mcnt-storyboard-retry-btn").addEventListener("click", () => retryImageScene(index));
}

/* Relance la génération d'image pour UNE seule scène du storyboard, sans
   toucher aux autres. Fonctionne à 100% quel que soit le nombre d'échecs
   précédents : chaque clic relance un appel IA neuf, et met à jour à la
   fois l'affichage et _mcntDernierResultat (essentiel : sinon la vidéo
   finale génèrerait une erreur "Image manquante" même après un retry
   visuellement réussi, car assemblerVideoMcnt lit imageUrl depuis cet état). */
async function retryImageScene(index) {
  const scene = _mcntScenario?.scenes?.[index];
  if (!scene) return;

  const item = document.querySelector(`.mcnt-storyboard-item[data-scene-index="${index}"]`);
  if (!item) return;
  const img = item.querySelector("img");
  const loading = item.querySelector(".mcnt-storyboard-loading");
  const retryBtn = loading.querySelector(".mcnt-storyboard-retry-btn");

  if (retryBtn) {
    retryBtn.disabled = true;
    retryBtn.classList.add("spinning");
  }
  loading.style.display = "flex";
  img.style.opacity = "0";
  loading.innerHTML = `<div class="mcnt-spinner"></div><span>Nouvelle tentative…</span>`;
  const spanLoading = loading.querySelector("span");

  try {
    const imageUrl = await avecRetryMcnt(
      () => genererImageSceneIA(scene, index, _mcntScenario?.scenes?.length || 1),
      { onTentative: (n) => { if (spanLoading) spanLoading.textContent = n === 1 ? "Nouvelle tentative…" : `Nouvelle tentative (${n}/3)…`; } }
    );
    img.src = imageUrl;
    img.style.opacity = "1";
    loading.style.display = "none";

    // Met à jour l'image dans le résultat déjà sauvegardé, pour que la
    // vidéo finale (étape suivante) utilise bien la nouvelle image.
    if (_mcntDernierResultat?.scenes?.[index]) {
      _mcntDernierResultat.scenes[index].imageUrl = imageUrl;
    }
    showMcntToast(`Image de la scène ${index + 1} régénérée.`, "success");
  } catch (err) {
    afficherEchecImageScene(loading, index);
    showMcntToast("Nouvel échec : " + err.message, "error");
  }
}

/* Charge l'image statique d'un personnage (fichier local de l'app) et la
   convertit en data URL base64 redimensionnée à 512x512 max, format
   attendu par les input_image_* de FLUX.2 klein. */
async function imageVersDataUrlMcnt(src) {
  const img = await chargerImageMcnt(src);
  const taille = 512;
  const canvas = document.createElement("canvas");
  canvas.width = taille;
  canvas.height = taille;
  const ctx = canvas.getContext("2d");

  // Cadrage "contain" centré sur fond neutre, pour ne pas déformer le
  // personnage source tout en respectant la limite 512x512 du modèle.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, taille, taille);
  const ratio = Math.min(taille / img.width, taille / img.height);
  const dw = img.width * ratio, dh = img.height * ratio;
  const dx = (taille - dw) / 2, dy = (taille - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);

  return canvas.toDataURL("image/jpeg", 0.9);
}

async function telechargerToutesLesImages() {
  if (!_mcntDernierResultat?.scenes?.length) return;
  for (let i = 0; i < _mcntDernierResultat.scenes.length; i++) {
    const scene = _mcntDernierResultat.scenes[i];
    if (!scene.imageUrl) continue;
    try {
      const a = document.createElement("a");
      a.href = scene.imageUrl;
      a.download = `aura-market-histoire-scene-${i + 1}.jpg`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Petit délai entre chaque téléchargement pour éviter que le navigateur
      // bloque les popups/téléchargements multiples déclenchés trop vite.
      await new Promise(r => setTimeout(r, 350));
    } catch { /* on continue avec les images suivantes */ }
  }
}

/* ══════════════════════════════════════════════
   ÉTAPE 4 — Voix (ElevenLabs) + montage vidéo (Canvas/MediaRecorder)
══════════════════════════════════════════════ */

function renderVideoStatusInitial() {
  const wrap = document.getElementById("mcnt-video-status");

  if (_mcntMode === "pub2d") {
    const t = _mcntPub2dDernierResultat;
    if (!t) {
      wrap.innerHTML = `<div class="mcnt-empty">Valide d'abord les textes (étape précédente), puis reviens ici pour créer la vidéo.</div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="mcnt-video-scene-row">
        <div class="mcnt-video-scene-num">${t.template}</div>
        <div class="mcnt-video-scene-label">${escMcnt(t.accroche || "")}</div>
        <div class="mcnt-video-scene-state ok">Prêt</div>
      </div>`;
    return;
  }

  const scenes = _mcntDernierResultat?.scenes || [];

  if (scenes.length === 0) {
    wrap.innerHTML = `<div class="mcnt-empty">Génère d'abord le storyboard (étape précédente), puis reviens ici pour créer la vidéo.</div>`;
    return;
  }

  wrap.innerHTML = scenes.map((s, i) => `
    <div class="mcnt-video-scene-row" data-video-scene-index="${i}">
      <div class="mcnt-video-scene-num">${i + 1}</div>
      <div class="mcnt-video-scene-label">${escMcnt(s.texte || "")}</div>
      <div class="mcnt-video-scene-state pending" data-video-scene-state>En attente</div>
    </div>`).join("");
}

function majEtatSceneVideo(index, etat, label) {
  const row = document.querySelector(`[data-video-scene-index="${index}"] [data-video-scene-state]`);
  if (!row) return;
  row.className = `mcnt-video-scene-state ${etat}`;

  // En cas d'échec, on affiche un vrai bouton "Réessayer" au lieu d'un
  // simple texte statique, pour permettre de relancer la voix de CETTE
  // scène uniquement, sans regénérer toute la vidéo.
  if (etat === "err") {
    row.innerHTML = `
      <button type="button" class="mcnt-voix-retry-btn" data-voix-retry-index="${index}">
        <svg viewBox="0 0 24 24"><path d="M21 2v6h-6M3 22v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0 0 20.49 15"/></svg>
        ${escMcnt(label)}
      </button>`;
    row.querySelector(".mcnt-voix-retry-btn").addEventListener("click", () => retryVoixScene(index));
  } else {
    row.textContent = label;
  }
}

/* Relance la génération de voix pour UNE seule scène de la vidéo en
   préparation, sans regénérer toute la vidéo. Met à jour à la fois
   l'affichage et _mcntVideoScenes (essentiel : sinon un clic sur
   "Générer la vidéo" après un retry réussi utiliserait quand même
   l'ancien état "sans voix", car onGenererVideo lit ses scènes depuis
   _mcntDernierResultat, pas depuis _mcntVideoScenes). Si la vidéo n'a
   pas encore été générée du tout, on retente juste et on avertit
   l'admin que le bouton "Générer la vidéo" reprendra ce résultat. */
async function retryVoixScene(index) {
  const scene = _mcntDernierResultat?.scenes?.[index];
  if (!scene) return;

  const row = document.querySelector(`[data-video-scene-index="${index}"] [data-video-scene-state]`);
  const retryBtn = row?.querySelector(".mcnt-voix-retry-btn");
  if (retryBtn) {
    retryBtn.disabled = true;
    retryBtn.classList.add("spinning");
  }

  try {
    const audioUrl = await avecRetryMcnt(
      () => genererVoixScene(scene.texte || ""),
      { onTentative: (n) => { if (retryBtn) retryBtn.lastChild.textContent = n === 1 ? " Nouvelle tentative…" : ` Tentative ${n}/3…`; } }
    );
    const audioEl = await chargerAudioMcnt(audioUrl);
    const dureeSec = Math.max(audioEl.duration || 0, MCNT_SCENE_MIN_DUREE);

    // Répercute le résultat dans _mcntVideoScenes si une vidéo a déjà été
    // assemblée une première fois avec cette scène en échec, pour qu'un
    // futur ré-assemblage utilise bien la voix retrouvée.
    if (_mcntVideoScenes?.[index]) {
      _mcntVideoScenes[index] = { ..._mcntVideoScenes[index], audioUrl, dureeSec, playbackRate: _mcntVideoScenes[index].playbackRate || 1 };
    }

    majEtatSceneVideo(index, "ok", "Prête");
    showMcntToast(`Voix de la scène ${index + 1} régénérée. Relance "Générer la vidéo" pour l'inclure.`, "success");
  } catch (err) {
    majEtatSceneVideo(index, "err", "Sans voix");
    showMcntToast("Nouvel échec voix : " + err.message, "error");
  }
}

function majProgressionVideo(pourcent, label) {
  const wrap = document.getElementById("mcnt-video-progress");
  const fill = document.getElementById("mcnt-video-progress-fill");
  const lbl = document.getElementById("mcnt-video-progress-label");
  wrap.style.display = "block";
  fill.style.width = `${Math.min(100, Math.max(0, pourcent))}%`;
  lbl.textContent = label;
}

/* Appel au Worker : texte de scène -> audio ElevenLabs encodé en data URL. */
async function genererVoixScene(texte) {
  const reponse = await API.post("/ai/contenus/voix", { texte });
  const data = typeof reponse === "string" ? JSON.parse(reponse) : reponse;
  if (!data?.dataUrl) throw new Error("Voix indisponible");
  return data.dataUrl;
}

/* Charge un <audio> depuis une data URL et attend d'en connaître la durée
   réelle, nécessaire pour synchroniser le temps d'affichage de chaque image
   dans le montage vidéo final. */
function chargerAudioMcnt(dataUrl) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.onloadedmetadata = () => resolve(audio);
    audio.onerror = () => reject(new Error("Audio inaccessible"));
    audio.src = dataUrl;
  });
}

async function onGenererVideo() {
  if (_mcntVideoGenerating) return;

  if (_mcntMode === "pub2d") {
    await onGenererVideoPub2d();
    return;
  }

  const scenes = _mcntDernierResultat?.scenes || [];
  if (scenes.length === 0) {
    showMcntToast("Génère d'abord le storyboard.", "error");
    return;
  }

  _mcntVideoGenerating = true;
  const genBtn = document.getElementById("mcnt-video-generate-btn");
  const dlBtn = document.getElementById("mcnt-video-download-btn");
  genBtn.disabled = true;
  dlBtn.style.display = "none";
  document.getElementById("mcnt-video-preview").style.display = "none";

  // Débloque l'audio pendant le clic utilisateur, AVANT les await réseau
  // (voix/images) qui suivent : Chrome mobile n'autorise play() sans geste
  // utilisateur "frais" que si l'AudioContext a déjà été resumé pendant ce
  // geste. Ce même contexte débloqué est réutilisé dans assemblerVideoMcnt.
  const audioCtxMontage = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtxMontage.resume().catch(() => {});

  try {
    /* 1) Génération de la voix off pour chaque scène, séquentiellement. */
    majProgressionVideo(0, "Génération des voix…");
    const scenesAvecVoix = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      majEtatSceneVideo(i, "pending", "Voix…");
      try {
        if (!scene.imageUrl) throw new Error("Image manquante pour cette scène");
        const audioUrl = await avecRetryMcnt(
          () => genererVoixScene(scene.texte || ""),
          { onTentative: (n) => majEtatSceneVideo(i, "pending", n === 1 ? "Voix…" : `Voix (${n}/3)…`) }
        );
        const audioEl = await chargerAudioMcnt(audioUrl);
        const dureeSec = Math.max(audioEl.duration || 0, MCNT_SCENE_MIN_DUREE);
        console.log(`🎤 [Scène ${i}] voix OK — durée: ${dureeSec}s — audioUrl length: ${audioUrl?.length}`);
        scenesAvecVoix.push({ ...scene, audioUrl, dureeSec });
        majEtatSceneVideo(i, "ok", "Prête");
      } catch (err) {
        // Scène sans voix : on garde une durée fixe pour ne pas bloquer
        // toute la vidéo à cause d'une seule scène en échec.
        console.log(`❌ [Scène ${i}] PAS de voix — erreur: ${err.message}`);
        scenesAvecVoix.push({ ...scene, audioUrl: null, dureeSec: MCNT_SCENE_MIN_DUREE });
        majEtatSceneVideo(i, "err", "Sans voix");
      }
      majProgressionVideo(((i + 1) / scenes.length) * 45, `Voix ${i + 1}/${scenes.length}…`);
    }

    console.log(`📋 Récap scènes: ${scenesAvecVoix.map((s, i) => `#${i}:${s.audioUrl ? "AVEC voix" : "SANS voix"}`).join(" | ")}`);

    // Plafond de durée totale : au-delà de MCNT_VIDEO_DUREE_MAX, on accélère
    // uniformément la lecture de chaque scène (audio + rythme visuel) plutôt
    // que de couper des scènes — garde un montage cohérent, plus dynamique,
    // et capte mieux l'attention (rythme plus soutenu façon réseaux sociaux).
    const dureeAvantPlafond = scenesAvecVoix.reduce((acc, s) => acc + s.dureeSec, 0);
    const facteurPlafond = dureeAvantPlafond > MCNT_VIDEO_DUREE_MAX
      ? dureeAvantPlafond / MCNT_VIDEO_DUREE_MAX
      : 1;
    if (facteurPlafond > 1) {
      console.log(`⏱️ Durée totale ${dureeAvantPlafond.toFixed(1)}s > ${MCNT_VIDEO_DUREE_MAX}s — accélération x${facteurPlafond.toFixed(2)}`);
      scenesAvecVoix.forEach(s => {
        s.playbackRate = facteurPlafond;
        s.dureeSec = s.dureeSec / facteurPlafond;
      });
    } else {
      scenesAvecVoix.forEach(s => { s.playbackRate = 1; });
    }

    _mcntVideoScenes = scenesAvecVoix;

    /* 2) Montage : Canvas (image + effet Ken Burns léger) + piste(s) audio,
       capturés en direct via MediaRecorder. */
    majProgressionVideo(48, "Préparation du montage…");
    let blob = await assemblerVideoMcnt(scenesAvecVoix, (pourcent, label) => {
      majProgressionVideo(48 + pourcent * 0.52, label);
    }, audioCtxMontage);

    // Corrige la durée déclarée dans l'en-tête du fichier (bug "vidéo
    // coupée à 1s sur TikTok" — voir finaliserBlobVideoMcnt) avant tout
    // aperçu/téléchargement/partage.
    majProgressionVideo(99, "Finalisation…");
    blob = await finaliserBlobVideoMcnt(blob);

    if (_mcntVideoBlobUrl) URL.revokeObjectURL(_mcntVideoBlobUrl);
    _mcntVideoBlobUrl = URL.createObjectURL(blob);
    _mcntVideoBlob = blob;

    const preview = document.getElementById("mcnt-video-preview");
    preview.src = _mcntVideoBlobUrl;
    preview.style.display = "block";
    dlBtn.style.display = "flex";

    majProgressionVideo(100, "Vidéo prête.");
    showMcntToast("Vidéo générée avec succès.", "success");

    // Affiche le bloc légende + partage et lance la génération de la
    // légende IA en arrière-plan, sans bloquer l'aperçu de la vidéo.
    afficherBlocCaptionEtPartage();
    genererLegendeIA();

    // Upload en arrière-plan vers Supabase Storage, sans bloquer l'aperçu
    // ni le téléchargement local qui fonctionnent déjà avec le blob.
    uploaderVideoMcnt(blob).catch(err => console.info("Upload vidéo différé/impossible :", err.message));
  } catch (err) {
    showMcntToast("Erreur vidéo : " + err.message, "error");
  } finally {
    _mcntVideoGenerating = false;
    genBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════
   PUB 2D — Moteur de rendu vidéo (Canvas + MediaRecorder)
   Rendu à venir : un template par style (B: texte choc + zoom produit,
   A: mockup téléphone + features, C: écran d'app qui charge). Même pipeline
   d'export que le mode narré (canvas.captureStream + MediaRecorder, upload
   silencieux vers MCNT_VIDEO_BUCKET).
══════════════════════════════════════════════ */
async function onGenererVideoPub2d() {
  if (!_mcntPub2dDernierResultat) {
    showMcntToast("Valide d'abord les textes.", "error");
    return;
  }

  _mcntVideoGenerating = true;
  const genBtn = document.getElementById("mcnt-video-generate-btn");
  const dlBtn = document.getElementById("mcnt-video-download-btn");
  genBtn.disabled = true;
  dlBtn.style.display = "none";
  document.getElementById("mcnt-video-preview").style.display = "none";

  try {
    majProgressionVideo(2, "Génération de la voix off…");

    // La voix off est optionnelle : si ElevenLabs échoue (quota, réseau...),
    // on continue en vidéo muette plutôt que de bloquer tout le rendu — la
    // dégradation gracieuse prime sur l'exigence de voix.
    let audioInfo = null;
    const scriptVoix = (_mcntPub2dDernierResultat.scriptVoix || "").trim();
    if (scriptVoix) {
      try {
        const dataUrl = await genererVoixScene(scriptVoix);
        const audioEl = await chargerAudioMcnt(dataUrl);
        audioInfo = { dataUrl, dureeSec: audioEl.duration || 0 };
      } catch (err) {
        console.info("Voix off Pub 2D indisponible, rendu en vidéo muette :", err.message);
        showMcntToast("Voix off indisponible, vidéo générée sans son.", "info");
      }
    }

    majProgressionVideo(5, "Préparation du rendu…");

    let blob;
    const style = _mcntPub2dDernierResultat.style || {};
    if (_mcntPub2dDernierResultat.template === "B") {
      blob = await rendrePub2dTemplateB(_mcntPub2dDernierResultat, audioInfo, (pourcent, label) => {
        majProgressionVideo(5 + pourcent * 0.95, label);
      }, style);
    } else if (_mcntPub2dDernierResultat.template === "A") {
      blob = await rendrePub2dTemplateA(_mcntPub2dDernierResultat, audioInfo, (pourcent, label) => {
        majProgressionVideo(5 + pourcent * 0.95, label);
      }, style);
    } else if (_mcntPub2dDernierResultat.template === "C") {
      blob = await rendrePub2dTemplateC(_mcntPub2dDernierResultat, audioInfo, (pourcent, label) => {
        majProgressionVideo(5 + pourcent * 0.95, label);
      }, style);
    } else if (_mcntPub2dDernierResultat.template === "D") {
      blob = await rendrePub2dTemplateD(_mcntPub2dDernierResultat, audioInfo, (pourcent, label) => {
        majProgressionVideo(5 + pourcent * 0.95, label);
      }, style);
    } else {
      throw new Error(`Le template "${_mcntPub2dDernierResultat.template}" arrive bientôt.`);
    }

    // Corrige la durée déclarée dans l'en-tête du fichier (bug "vidéo
    // coupée à 1s sur TikTok" — voir finaliserBlobVideoMcnt) avant tout
    // aperçu/téléchargement/partage.
    majProgressionVideo(99, "Finalisation…");
    blob = await finaliserBlobVideoMcnt(blob);

    if (_mcntVideoBlobUrl) URL.revokeObjectURL(_mcntVideoBlobUrl);
    _mcntVideoBlobUrl = URL.createObjectURL(blob);
    _mcntVideoBlob = blob;

    const preview = document.getElementById("mcnt-video-preview");
    preview.src = _mcntVideoBlobUrl;
    preview.style.display = "block";
    dlBtn.style.display = "flex";

    majProgressionVideo(100, "Vidéo prête.");
    showMcntToast("Vidéo générée avec succès.", "success");

    afficherBlocCaptionEtPartage();
    genererLegendeIA();

    uploaderVideoMcnt(blob).catch(err => console.info("Upload vidéo différé/impossible :", err.message));
  } catch (err) {
    showMcntToast("Erreur vidéo : " + err.message, "error");
  } finally {
    _mcntVideoGenerating = false;
    genBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════
   PUB 2D — Utilitaires communs de rendu (partagés par A/B/C)
══════════════════════════════════════════════ */

/* Démarre un MediaRecorder sur le flux vidéo du canvas, mixé avec l'audio
   de la voix off si fourni (même principe que assemblerVideoMcnt pour le
   mode narré : AudioContext + MediaStreamDestination + piste vidéo
   capturée). Si audioInfo est null (voix indisponible) et qu'aucune piste
   supplémentaire n'est ajoutée ensuite, le flux ne contient que la vidéo —
   pas de piste audio muette inutile.
   Retourne { recorder, enregistrementTermine, audioCtx, demarrerAudio,
   mixerPisteSupplementaire } où :
   - demarrerAudio() doit être appelée au moment précis où la voix off doit
     commencer (généralement au tout début du rendu) ;
   - mixerPisteSupplementaire(dataUrl, volume) crée et connecte une piste
     audio additionnelle (ex. musique de fond pour le template D) au même
     bus de mixage que la voix, et retourne l'élément <audio> correspondant
     pour que l'appelant contrôle play()/pause() lui-même (la musique tourne
     souvent en boucle ou sur toute la durée, contrairement à la voix qui
     se lance une seule fois). N'est utilisable QUE si un AudioContext a pu
     être créé (voix fournie OU au moins un appel prévu) — voir note dans
     rendrePub2dTemplateD qui force la création du contexte même sans voix
     dès qu'une musique est disponible. */
function demarrerEnregistrementPub2d(canvas, audioInfo, FPS, forcerAudioCtx = false) {
  const canvasStream = canvas.captureStream(FPS);
  let audioCtx = null;
  let destination = null;
  let mixedStream = canvasStream;
  let demarrerAudio = () => {};

  const besoinAudioCtx = !!audioInfo?.dataUrl || forcerAudioCtx;

  if (besoinAudioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    destination = audioCtx.createMediaStreamDestination();
    mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);
    audioCtx._elementsPub2d = [];

    if (audioInfo?.dataUrl) {
      const audioEl = new Audio(audioInfo.dataUrl);
      const sourceNode = audioCtx.createMediaElementSource(audioEl);
      sourceNode.connect(destination);
      demarrerAudio = () => audioEl.play().catch(() => {});
      audioCtx._elementsPub2d.push(audioEl);
    }
  }

  const fmt = choisirFormatVideoMcnt();
  const recorder = fmt.mimeType
    ? new MediaRecorder(mixedStream, { mimeType: fmt.mimeType, videoBitsPerSecond: 1_800_000 })
    : new MediaRecorder(mixedStream, { videoBitsPerSecond: 1_800_000 });

  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  const enregistrementTermine = new Promise(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: fmt.conteneur }));
  });

  const mixerPisteSupplementaire = (dataUrl, volume = 1) => {
    if (!audioCtx || !destination) return null;
    const audioEl = new Audio(dataUrl);
    audioEl.loop = true;
    const sourceNode = audioCtx.createMediaElementSource(audioEl);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;
    sourceNode.connect(gainNode).connect(destination);
    audioCtx._elementsPub2d.push(audioEl);
    return audioEl;
  };

  return { recorder, enregistrementTermine, audioCtx, demarrerAudio, mixerPisteSupplementaire };
}

/* Arrête proprement le recorder et libère l'audio/AudioContext associés. */
async function finaliserEnregistrementPub2d(recorder, audioCtx) {
  recorder.stop();
  await new Promise(r => setTimeout(r, 200));
  if (audioCtx) {
    (audioCtx._elementsPub2d || []).forEach(audioEl => {
      audioEl.pause(); audioEl.src = ""; audioEl.load();
    });
    await audioCtx.close().catch(() => {});
  }
}

/* Calcule la durée totale finale d'un template à partir de sa durée de base
   (timeline pensée sans voix) et de la durée réelle de l'audio généré.
   Si l'audio est plus long que la timeline de base, on étire uniformément
   chaque phase (facteur commun) pour que la voix ait le temps de se
   terminer sans que la vidéo ne se coupe abruptement ; si l'audio est plus
   court ou absent, la timeline de base est gardée telle quelle (jamais
   raccourcie, pour ne pas bâcler les animations). Une marge de 500ms est
   ajoutée après la fin de l'audio pour laisser respirer le dernier plan. */
function calculerFacteurEtirementPub2d(dureeBaseMs, audioInfo) {
  if (!audioInfo?.dureeSec) return 1;
  const dureeAudioMs = audioInfo.dureeSec * 1000 + 500;
  return dureeAudioMs > dureeBaseMs ? dureeAudioMs / dureeBaseMs : 1;
}

/* ── Template D : "Montage dynamique" ────────────────────────────────────
   Contrairement à A/B/C (dessin Canvas pur), ce template lit et dessine de
   VRAIS clips vidéo uploadés par l'admin, frame par frame, sur le canvas de
   rendu — d'où un pipeline sensiblement différent (lecture <video> réelle,
   pas juste des formes/texte animés).

   Timeline :
     Intro (0 → 900ms)      : accroche plein écran, zoom-in rapide sur fond
                               rouge/jaune saturé façon "fast food".
     Corps (900ms → Xms)    : chaque clip uploadé joue à son tour (recadré
                               en cover 9:16 si besoin), avec le texte
                               correspondant incrusté en bas, typographie
                               grasse blanche sur bandeau semi-opaque.
     Packshot (Xms → fin)   : plan fixe sur le produit (image réelle si
                               sélectionné, sinon fond dégradé seul) +
                               slogan + numéro de téléphone/CTA, sur fond
                               blanc/rouge net (rupture volontaire de rythme
                               avec le reste, pour signaler "fin de pub").

   La durée de chaque clip dans le montage est celle du clip réel, plafonnée
   à 2.2s pour garder un rythme "punchy" même si l'admin uploade un plan
   plus long — un montage rapide reste le principe central de ce style. */
const MCNT_PUB2D_D_INTRO = 900;
const MCNT_PUB2D_D_DUREE_CLIP_MAX = 2200;
const MCNT_PUB2D_D_PACKSHOT = 3200;

async function rendrePub2dTemplateD(textes, audioInfo, onProgress, style = {}) {
  const canvas = document.getElementById("mcnt-pub2d-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const FPS = 24;

  // Le montage accepte des vidéos EN OPTION. Sans vidéo, il se construit à
  // partir des images des produits sélectionnés (zoom Ken Burns + textes au
  // rythme), et à défaut de produits, à partir de cartes de texte animées.
  const clipsMode = _mcntPub2dClips.length >= 1;

  onProgress(2, clipsMode ? "Chargement des vidéos…" : "Préparation du montage…");
  let clipsElements = [], dureesClips = [];
  if (clipsMode) {
    clipsElements = await Promise.all(_mcntPub2dClips.map(clip => chargerClipVideoMcnt(clip.url)));
    dureesClips = clipsElements.map(v => Math.min(v.duration * 1000 || 1500, MCNT_PUB2D_D_DUREE_CLIP_MAX));
  }

  onProgress(6, "Chargement des images…");
  const produitsImgs = (await Promise.all((_mcntPub2dProduits || []).map(p =>
    p.image_url ? chargerImageMcnt(p.image_url).catch(() => null) : null))).filter(Boolean);
  const produitImg = produitsImgs[0] || null;

  const musiqueInfo = await chargerMusiquePub2dD().catch(err => {
    console.info("Musique de fond indisponible :", err.message);
    return null;
  });

  const couleurRouge = style.accentSecondaire || "#E11D2E";
  const couleurJaune = style.accent || "#F0B429";
  const textesCorps = (Array.isArray(textes.textesCorps) ? textes.textesCorps : []).filter(x => x && x.trim());

  // Construction de la timeline : intro, puis un segment par clip OU par image
  // produit, puis packshot.
  const segments = [];
  let curseur = MCNT_PUB2D_D_INTRO;
  if (clipsMode) {
    clipsElements.forEach((videoEl, i) => {
      const duree = dureesClips[i];
      segments.push({ type: "clip", debut: curseur, fin: curseur + duree, videoEl, texte: textesCorps[i % Math.max(textesCorps.length, 1)] || "" });
      curseur += duree;
    });
  } else {
    // Au moins 3 plans pour un vrai sentiment de montage, même avec 1 produit.
    const nbSeg = Math.max(produitsImgs.length, textesCorps.length, 3);
    for (let i = 0; i < nbSeg; i++) {
      const duree = MCNT_PUB2D_D_DUREE_CLIP_MAX;
      segments.push({
        type: "image",
        debut: curseur, fin: curseur + duree,
        img: produitsImgs.length ? produitsImgs[i % produitsImgs.length] : null,
        texte: textesCorps.length ? textesCorps[i % textesCorps.length] : (textes.accroche || "")
      });
      curseur += duree;
    }
  }
  const dureeCorps = curseur - MCNT_PUB2D_D_INTRO;
  const dureeBaseTotale = MCNT_PUB2D_D_INTRO + dureeCorps + MCNT_PUB2D_D_PACKSHOT;
  const packshotDebut = curseur;

  const facteur = calculerFacteurEtirementPub2d(dureeBaseTotale, audioInfo);
  const dureeReelle = dureeBaseTotale * facteur;

  const { recorder, enregistrementTermine, audioCtx, demarrerAudio, mixerPisteSupplementaire } =
    demarrerEnregistrementPub2d(canvas, audioInfo, FPS, /* forcerAudioCtx */ true);

  let musiqueEl = null;
  if (musiqueInfo && mixerPisteSupplementaire) {
    musiqueEl = mixerPisteSupplementaire(musiqueInfo.dataUrl, musiqueInfo.volume);
  }

  recorder.start();
  demarrerAudio();
  if (musiqueEl) musiqueEl.play().catch(() => {});

  onProgress(10, "Montage en cours…");

  await new Promise(resolve => {
    const debut = performance.now();
    let segmentActifIndex = -1;

    function frame(now) {
      const tReel = now - debut;
      const t = tReel / facteur;

      if (t < MCNT_PUB2D_D_INTRO) {
        dessinerIntroPub2dD(ctx, W, H, t, textes.accroche || "", couleurRouge, couleurJaune);
      } else if (t < packshotDebut) {
        const segIndex = segments.findIndex(s => t >= s.debut && t < s.fin);
        if (segIndex !== -1) {
          const seg = segments[segIndex];
          if (seg.type === "clip") {
            if (segIndex !== segmentActifIndex) {
              segmentActifIndex = segIndex;
              seg.videoEl.currentTime = 0;
              seg.videoEl.play().catch(() => {});
            }
            dessinerSegmentClipPub2dD(ctx, W, H, t, seg, couleurRouge);
          } else {
            dessinerSegmentImagePub2dD(ctx, W, H, t, seg, couleurRouge, couleurJaune);
          }
        }
      } else {
        dessinerPackshotPub2dD(ctx, W, H, t, packshotDebut, textes, produitImg, couleurRouge, couleurJaune);
      }

      const pourcent = Math.min(100, (tReel / dureeReelle) * 100);
      onProgress(10 + pourcent * 0.85, "Montage en cours…");

      if (tReel < dureeReelle) {
        requestAnimationFrame(frame);
      } else {
        clipsElements.forEach(v => v.pause());
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });

  if (musiqueEl) { musiqueEl.pause(); musiqueEl.src = ""; musiqueEl.load(); }
  await finaliserEnregistrementPub2d(recorder, audioCtx);

  return enregistrementTermine;
}

/* Segment "image" du montage (mode sans vidéo) : une image produit en cover
   9:16 avec un zoom Ken Burns lent, un texte incrusté en bas, et la barre de
   progression Story — même langage visuel que les segments clip. Si aucune
   image n'est disponible, on affiche une carte de texte sur fond dégradé
   saturé (rouge→jaune) pour garder le rythme. */
function dessinerSegmentImagePub2dD(ctx, W, H, t, segment, couleurRouge, couleurJaune) {
  const { img, texte, debut, fin } = segment;
  const prog = clampMcnt((t - debut) / (fin - debut || 1), 0, 1);

  if (img) {
    // Cover 9:16 + zoom Ken Burns (1.0 → 1.12) et léger panoramique.
    const zoom = 1 + prog * 0.12;
    const ratioCanvas = W / H;
    const ratioImg = img.width / img.height;
    let dw, dh;
    if (ratioImg > ratioCanvas) { dh = H * zoom; dw = dh * ratioImg; }
    else { dw = W * zoom; dh = dw / ratioImg; }
    const dx = (W - dw) / 2 + Math.sin(prog * Math.PI) * 14;
    const dy = (H - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    // Carte de texte plein cadre, fond dégradé saturé.
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, couleurRouge);
    grad.addColorStop(1, couleurJaune);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Assombrissement du tiers bas pour la lisibilité du texte.
  const degradeBas = ctx.createLinearGradient(0, H * 0.6, 0, H);
  degradeBas.addColorStop(0, "rgba(0,0,0,0)");
  degradeBas.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = degradeBas;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);

  if (texte) {
    const localT = clampMcnt((t - debut) / 300, 0, 1);
    const scale = 0.85 + easeOutBackMcnt(localT) * 0.15;
    const alpha = clampMcnt((t - debut) / 200, 0, 1) * clampMcnt((fin - t) / 200, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, img ? H * 0.84 : H * 0.5);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.font = "900 40px Inter, sans-serif";
    const lignes = wrapTextMcnt(ctx, texte, W - 100, 3);
    let ty = -((lignes.length - 1) * 46) / 2;
    lignes.forEach(l => {
      dessinerTexteAvecEspacementMcnt(ctx, l, 0, ty, 0.5, {
        ombre: true, ombreCouleur: "rgba(0,0,0,0.6)", ombreBlur: 14, ombreY: 3,
        degrade: ["#FFFFFF", "#FFF7E0"]
      });
      ty += 46;
    });
    ctx.restore();
  }

  // Barre de progression Story en haut.
  ctx.save();
  const barreW = Math.min(60, (W - 32) / 3);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  dessinerRectArrondiMcnt(ctx, W / 2 - barreW / 2, 20, barreW, 4, 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  dessinerRectArrondiMcnt(ctx, W / 2 - barreW / 2, 20, barreW * prog, 4, 2);
  ctx.fill();
  ctx.restore();
}

/* Charge un clip vidéo local (blob URL) et attend qu'il soit prêt à être
   dessiné (readyState suffisant pour drawImage sans frame noire). muted
   est nécessaire pour permettre l'autoplay programmatique sans geste
   utilisateur préalable sur certains navigateurs mobiles. */
function chargerClipVideoMcnt(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.oncanplaythrough = () => resolve(video);
    video.onerror = () => reject(new Error("Vidéo illisible : " + url));
  });
}

/* Charge la musique de fond choisie : soit une des 3 pistes pré-intégrées
   (MCNT_MUSIQUES_URLS), soit le fichier personnel uploadé par l'admin.
   Retourne { dataUrl, volume } ou null si aucune musique n'est disponible
   (fichier pré-intégré manquant sur le serveur, par exemple) — le montage
   reste possible sans musique plutôt que d'échouer entièrement. */
async function chargerMusiquePub2dD() {
  if (_mcntPub2dMusique === "perso") {
    if (!_mcntPub2dMusiquePersoFile) return null;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(_mcntPub2dMusiquePersoFile);
    });
    return { dataUrl, volume: 0.8 };
  }

  const url = MCNT_MUSIQUES_URLS[_mcntPub2dMusique];
  if (!url) return null;
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error("Piste musicale introuvable : " + url);
  const blob = await reponse.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  // Volume réduit par défaut : la musique reste en fond, ne doit jamais
  // couvrir une éventuelle voix off.
  return { dataUrl, volume: 0.45 };
}

/* Intro : accroche courte plein écran avec zoom-in rapide et flash de
   couleur, sur fond dégradé rouge/jaune saturé façon fast-food. */
function dessinerIntroPub2dD(ctx, W, H, t, accroche, couleurRouge, couleurJaune) {
  const localT = clampMcnt(t / MCNT_PUB2D_D_INTRO, 0, 1);
  const fond = ctx.createLinearGradient(0, 0, 0, H);
  fond.addColorStop(0, couleurRouge);
  fond.addColorStop(1, "#8C0F1C");
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, W, H);

  // Flash blanc bref au tout début, façon "impact" de montage rapide.
  const flashAlpha = clampMcnt(1 - t / 150, 0, 1) * 0.5;
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  const scale = 1.25 - easeOutBackMcnt(localT) * 0.25;
  const alpha = clampMcnt(t / 200, 0, 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.font = "900 62px Inter, sans-serif";
  dessinerTexteAvecEspacementMcnt(ctx, (accroche || "").toUpperCase(), 0, 0, 2, {
    ombre: true, ombreCouleur: "rgba(0,0,0,0.4)", ombreBlur: 16, ombreY: 6,
    degrade: ["#FFFFFF", couleurJaune]
  });
  ctx.restore();
}

/* Dessine la frame courante d'un segment "clip" : le clip vidéo réel en
   cover 9:16 (recadré au centre s'il n'est pas déjà au bon ratio), un léger
   assombrissement bas d'écran pour la lisibilité du texte, et le texte du
   segment en typographie grasse blanche sur bandeau semi-opaque. */
function dessinerSegmentClipPub2dD(ctx, W, H, t, segment, couleurRouge) {
  const { videoEl, texte, debut, fin } = segment;

  if (videoEl.readyState >= 2) {
    const ratioCanvas = W / H;
    const ratioVideo = videoEl.videoWidth / videoEl.videoHeight;
    let sx, sy, sw, sh;
    if (ratioVideo > ratioCanvas) {
      // Vidéo plus large que le cadre cible : on rogne les côtés.
      sh = videoEl.videoHeight;
      sw = sh * ratioCanvas;
      sx = (videoEl.videoWidth - sw) / 2;
      sy = 0;
    } else {
      // Vidéo plus étroite (ou déjà 9:16) : on rogne haut/bas si besoin.
      sw = videoEl.videoWidth;
      sh = sw / ratioCanvas;
      sx = 0;
      sy = (videoEl.videoHeight - sh) / 2;
    }
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, W, H);
  } else {
    // Frame pas encore décodée (rare, clip qui vient de démarrer) : fond de
    // secours plutôt qu'un cadre noir brut.
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, W, H);
  }

  // Léger assombrissement du tiers bas, pour la lisibilité du texte incrusté.
  const dégradéBas = ctx.createLinearGradient(0, H * 0.65, 0, H);
  dégradéBas.addColorStop(0, "rgba(0,0,0,0)");
  dégradéBas.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = dégradéBas;
  ctx.fillRect(0, H * 0.65, W, H * 0.35);

  if (texte) {
    // Le texte "pop" brièvement à l'entrée du segment, puis reste stable —
    // effet de synchro avec le montage plutôt qu'un texte figé du début à la fin.
    const localT = clampMcnt((t - debut) / 300, 0, 1);
    const scale = 0.85 + easeOutBackMcnt(localT) * 0.15;
    const alpha = clampMcnt((t - debut) / 200, 0, 1) * clampMcnt((fin - t) / 200, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H * 0.86);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.font = "900 34px Inter, sans-serif";
    const lignes = wrapTextMcnt(ctx, texte, W - 100, 2);
    let ty = -((lignes.length - 1) * 40) / 2;
    lignes.forEach(l => {
      dessinerTexteAvecEspacementMcnt(ctx, l, 0, ty, 0.5, {
        ombre: true, ombreCouleur: "rgba(0,0,0,0.6)", ombreBlur: 12, ombreY: 3,
        degrade: ["#FFFFFF", "#FFF7E0"]
      });
      ty += 40;
    });
    ctx.restore();
  }

  // Petit indicateur de progression façon Story, en haut de l'écran — donne
  // un vrai sentiment de montage rythmé plutôt qu'un simple plan qui tourne.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = couleurRouge;
  const barreW = Math.min(60, (W - 32) / 3);
  const progresSegment = clampMcnt((t - debut) / (fin - debut || 1), 0, 1);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  dessinerRectArrondiMcnt(ctx, W / 2 - barreW / 2, 20, barreW, 4, 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  dessinerRectArrondiMcnt(ctx, W / 2 - barreW / 2, 20, barreW * progresSegment, 4, 2);
  ctx.fill();
  ctx.restore();
}

/* Packshot final : plan fixe sur le produit, slogan et CTA/téléphone, sur
   fond blanc/rouge net — rupture volontaire de rythme avec le montage
   rapide qui précède, pour signaler clairement "fin de pub / action". */
function dessinerPackshotPub2dD(ctx, W, H, t, packshotDebut, textes, produitImg, couleurRouge, couleurJaune) {
  const localT = clampMcnt((t - packshotDebut) / 500, 0, 1);
  const entree = easeOutCubicMcnt(localT);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  const bandeHaut = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  bandeHaut.addColorStop(0, couleurRouge);
  bandeHaut.addColorStop(1, "#FFFFFF");
  ctx.fillStyle = bandeHaut;
  ctx.fillRect(0, 0, W, H * 0.4);

  const cy = H * 0.42 + (1 - entree) * 30;
  if (produitImg) {
    const zoneW = W * 0.72, zoneH = H * 0.34;
    const ratio = Math.min(zoneW / produitImg.width, zoneH / produitImg.height);
    const dw = produitImg.width * ratio, dh = produitImg.height * ratio;

    ctx.save();
    ctx.globalAlpha = entree;
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 16;
    ctx.drawImage(produitImg, W / 2 - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  }

  // Slogan, typographie grasse rouge/noire.
  if (textes.sousTexte) {
    ctx.save();
    ctx.globalAlpha = entree;
    ctx.textAlign = "center";
    ctx.font = "900 36px Inter, sans-serif";
    const lignes = wrapTextMcnt(ctx, textes.sousTexte, W - 80, 2);
    let sy = H * 0.68;
    lignes.forEach(l => {
      dessinerTexteAvecEspacementMcnt(ctx, l, W / 2, sy, 0.5, { degrade: ["#111318", "#111318"] });
      sy += 44;
    });
    ctx.restore();
  }

  // CTA / numéro de téléphone, très visible sur bandeau plein rouge.
  if (textes.cta) {
    const barY = H * 0.84;
    const barH = 76;
    ctx.save();
    ctx.globalAlpha = entree;
    ctx.fillStyle = couleurRouge;
    ctx.fillRect(0, barY, W, barH);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 32px Inter, sans-serif";
    ctx.fillText(textes.cta, W / 2, barY + barH / 2 + 1);
    ctx.restore();
  }
}

/* ── Template C : "Écran d'app" ──────────────────────────────────────────
   Simulation d'interface plein cadre (pas de coque téléphone visible ici,
   contrairement au template A : l'écran occupe tout le canvas, comme la
   vidéo de référence "Requesting Driver"). Timeline en 4 états UI qui
   s'enchaînent, chacun une carte centrale sur fond clair neutre :
     État 1 (0 → 1.6s)   : "Recherche…" avec un spinner qui tourne — reprend
                            l'accroche comme intitulé de la recherche.
     État 2 (1.6 → 3.4s) : barre de progression qui se remplit, sous-texte
                            affiché comme description de l'étape.
     État 3 (3.4 → 4.6s) : transition — la carte "loading" s'efface, une
                            carte "succès" (coche verte) entre en scale-in.
     État 4 (4.6 → 6.8s) : la carte succès affiche le produit (si présent)
                            en mini-aperçu + CTA en bas, façon confirmation
                            de commande.
   Fond clair (contraste volontaire avec B et A, façon vraie appli mobile),
   cartes blanches avec ombre douce. Durée totale ~6.8s. Même pipeline
   d'export (canvas.captureStream + MediaRecorder, sans piste audio). */
const MCNT_PUB2D_C_ETAT1 = 1600;
const MCNT_PUB2D_C_ETAT2 = 1800;
const MCNT_PUB2D_C_TRANSITION = 1200;
const MCNT_PUB2D_C_ETAT4 = 2200;
const MCNT_PUB2D_C_DUREE_TOTALE = MCNT_PUB2D_C_ETAT1 + MCNT_PUB2D_C_ETAT2 + MCNT_PUB2D_C_TRANSITION + MCNT_PUB2D_C_ETAT4;

async function rendrePub2dTemplateC(textes, audioInfo, onProgress, style = {}) {
  const canvas = document.getElementById("mcnt-pub2d-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const FPS = 24;

  onProgress(2, "Chargement du produit…");
  const produitImg = (_mcntPub2dSourceType === "produit" && _mcntPub2dProduitSelectionne?.image_url)
    ? await chargerImageMcnt(_mcntPub2dProduitSelectionne.image_url).catch(() => null)
    : null;

  const couleurAccent = style.accent || "#F0B429";
  const clair = style.clair !== false; // par défaut interface claire
  const facteur = calculerFacteurEtirementPub2d(MCNT_PUB2D_C_DUREE_TOTALE, audioInfo);
  const dureeReelle = MCNT_PUB2D_C_DUREE_TOTALE * facteur;

  const { recorder, enregistrementTermine, audioCtx, demarrerAudio } = demarrerEnregistrementPub2d(canvas, audioInfo, FPS);

  recorder.start();
  demarrerAudio();
  onProgress(6, "Rendu en cours…");

  await new Promise(resolve => {
    const debut = performance.now();

    function frame(now) {
      const tReel = now - debut;
      const t = tReel / facteur; // ralentit l'animation logique si la voix est plus longue que la timeline de base
      dessinerFramePub2dTemplateC(ctx, W, H, t, textes, produitImg, couleurAccent, clair);

      const pourcent = Math.min(100, (tReel / dureeReelle) * 100);
      onProgress(6 + pourcent * 0.9, "Rendu en cours…");

      if (tReel < dureeReelle) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });

  await finaliserEnregistrementPub2d(recorder, audioCtx);

  return enregistrementTermine;
}

function dessinerFramePub2dTemplateC(ctx, W, H, t, textes, produitImg, couleurAccent, clair = true) {
  // Fond : clair (interface mobile réelle) ou sombre (mode nuit), selon le look.
  const fond = ctx.createLinearGradient(0, 0, 0, H);
  if (clair) {
    fond.addColorStop(0, "#F6F6F8");
    fond.addColorStop(1, "#E5E5EB");
  } else {
    fond.addColorStop(0, "#1A1C22");
    fond.addColorStop(1, "#0C0D11");
  }
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, W, H);

  // Halo doré très discret derrière la carte, pour éviter un fond
  // totalement plat tout en gardant le ton "interface propre".
  const haloFond = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.9);
  haloFond.addColorStop(0, `${couleurAccent}12`);
  haloFond.addColorStop(1, `${couleurAccent}00`);
  ctx.fillStyle = haloFond;
  ctx.fillRect(0, 0, W, H);

  const e1Fin = MCNT_PUB2D_C_ETAT1;
  const e2Fin = e1Fin + MCNT_PUB2D_C_ETAT2;
  const transFin = e2Fin + MCNT_PUB2D_C_TRANSITION;

  const cardW = W * 0.82;
  const cardX = (W - cardW) / 2;
  const flotte = Math.sin(t / 1400) * 4; // très léger flottement continu de la carte
  const cardCy = H * 0.46 + flotte;

  if (t < e2Fin) {
    // ── États 1 & 2 : carte "recherche / chargement". ──
    const cardH = 210;
    const cardY = cardCy - cardH / 2;
    const entree = easeOutBackMcnt(clampMcnt(t / 450, 0, 1));
    const alphaEntree = clampMcnt(t / 350, 0, 1);
    // Fondu de sortie juste avant la transition, pour éviter une coupure nette.
    const alphaSortie = t > e2Fin - 300 ? clampMcnt((e2Fin - t) / 300, 0, 1) : 1;

    ctx.save();
    ctx.globalAlpha = alphaEntree * alphaSortie;
    ctx.translate(W / 2, cardCy);
    ctx.scale(0.92 + entree * 0.08, 0.92 + entree * 0.08);
    ctx.translate(-W / 2, -cardCy);

    dessinerCarteAppMcnt(ctx, cardX, cardY, cardW, cardH);

    // Titre = accroche (courte), sous forme d'intitulé d'action.
    ctx.fillStyle = "#111318";
    ctx.textAlign = "center";
    ctx.font = "800 25px Inter, sans-serif";
    ctx.fillText(tronquerTexteMcnt(ctx, textes.accroche || "Recherche…", cardW - 60), W / 2, cardY + 58);

    // Sous-texte descriptif.
    ctx.fillStyle = "#8A8D96";
    ctx.font = "500 15px Inter, sans-serif";
    ctx.fillText(tronquerTexteMcnt(ctx, textes.sousTexte || "Un instant, on s'occupe de tout…", cardW - 60), W / 2, cardY + 88);

    if (t < e1Fin) {
      // État 1 : spinner qui tourne, piste de fond + arc coloré avec léger dégradé.
      const angle = (t / 1000) * Math.PI * 2.4;
      ctx.save();
      ctx.translate(W / 2, cardY + 140);
      ctx.strokeStyle = "#E3E3E8";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(angle);
      ctx.strokeStyle = couleurAccent;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 1.1);
      ctx.stroke();
      ctx.restore();
    } else {
      // État 2 : barre de progression qui se remplit, avec petit reflet.
      const localT = clampMcnt((t - e1Fin) / MCNT_PUB2D_C_ETAT2, 0, 1);
      const barW = cardW - 60, barH = 8, barX = W / 2 - barW / 2, barY = cardY + 132;
      ctx.fillStyle = "#E3E3E8";
      dessinerRectArrondiMcnt(ctx, barX, barY, barW, barH, barH / 2);
      ctx.fill();
      const largeurRemplie = barW * easeOutCubicMcnt(localT);
      const barDegrade = ctx.createLinearGradient(barX, 0, barX + largeurRemplie, 0);
      barDegrade.addColorStop(0, couleurAccent);
      barDegrade.addColorStop(1, "#FFD873");
      ctx.fillStyle = barDegrade;
      dessinerRectArrondiMcnt(ctx, barX, barY, largeurRemplie, barH, barH / 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (t < transFin) {
    // ── Transition : la carte loading s'efface, la carte succès entre en scale-in. ──
    const localT = clampMcnt((t - e2Fin) / MCNT_PUB2D_C_TRANSITION, 0, 1);
    dessinerCarteSuccesPub2dC(ctx, W, H, cardX, cardCy, cardW, localT, textes, produitImg, couleurAccent, false);
  } else {
    // ── État 4 : carte succès stable + CTA. ──
    dessinerCarteSuccesPub2dC(ctx, W, H, cardX, cardCy, cardW, 1, textes, produitImg, couleurAccent, true);

    if (textes.cta) {
      const localT = (t - transFin) / 1000;
      const entree = clampMcnt((t - transFin) / 400, 0, 1);
      const pulse = 1 + Math.sin(localT * 3.2) * 0.025;

      ctx.save();
      ctx.globalAlpha = entree;
      ctx.font = "800 22px Inter, sans-serif";
      const texteW = ctx.measureText(textes.cta).width;
      const boutonW = (texteW + 60) * pulse;
      const boutonH = 50 * pulse;
      const bx = W / 2 - boutonW / 2;
      const by = H * 0.86 - boutonH / 2;

      const boutonDegrade = ctx.createLinearGradient(bx, by, bx, by + boutonH);
      boutonDegrade.addColorStop(0, "#26272C");
      boutonDegrade.addColorStop(1, "#111318");
      ctx.fillStyle = boutonDegrade;
      dessinerRectArrondiMcnt(ctx, bx, by, boutonW, boutonH, boutonH / 2);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(textes.cta, W / 2, by + boutonH / 2 + 1);
      ctx.restore();
    }
  }

  dessinerVignetteMcnt(ctx, W, H, 0.16);

  // Mention Aura Market discrète, présente sur tout le rendu.
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#111318";
  ctx.font = "700 14px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("AURA MARKET", W / 2, H - 40);
  ctx.restore();
}

/* Carte blanche arrondie avec ombre douce, base commune aux différents
   états du template C (façon composant "card" d'interface mobile réelle). */
function dessinerCarteAppMcnt(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = "rgba(20,20,30,0.18)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#FFFFFF";
  dessinerRectArrondiMcnt(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.restore();
}

/* Carte de confirmation/succès : coche verte en scale-in, puis titre +
   mini-aperçu produit une fois la transition terminée (avecProduit=true).
   localT contrôle l'entrée (0 = carte loading encore visible, 1 = pleinement
   affichée) ; une fois stable, la fonction est rappelée avec localT=1 et
   avecProduit=true pour afficher le contenu complet. */
function dessinerCarteSuccesPub2dC(ctx, W, H, cardX, cardCy, cardW, localT, textes, produitImg, couleurAccent, avecProduit) {
  const cardH = avecProduit && produitImg ? 320 : 230;
  const cardY = cardCy - cardH / 2;
  const scale = 0.85 + easeOutBackMcnt(localT) * 0.15;
  const alpha = clampMcnt(localT * 1.3, 0, 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, cardCy);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -cardCy);

  dessinerCarteAppMcnt(ctx, cardX, cardY, cardW, cardH);

  // Coche verte dans un cercle, avec un léger effet "pop" au moment de l'apparition.
  const popCoche = 1 + Math.max(0, 1 - localT * 3) * 0.25 * (localT < 0.4 ? 1 : 0);
  const successGreen = "#10B981";
  ctx.save();
  ctx.translate(W / 2, cardY + 54);
  ctx.scale(popCoche, popCoche);
  ctx.fillStyle = successGreen + "22";
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = successGreen;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(-3, 10);
  ctx.lineTo(15, -14);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#111318";
  ctx.textAlign = "center";
  ctx.font = "800 22px Inter, sans-serif";
  ctx.fillText(tronquerTexteMcnt(ctx, textes.accroche || "C'est confirmé !", cardW - 50), W / 2, cardY + 108);

  if (avecProduit && produitImg) {
    const zoneW = cardW - 70, zoneH = cardH - 170;
    const ratio = Math.min(zoneW / produitImg.width, zoneH / produitImg.height);
    const dw = produitImg.width * ratio, dh = produitImg.height * ratio;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(produitImg, W / 2 - dw / 2, cardY + 128, dw, dh);
    ctx.restore();
  } else if (textes.sousTexte) {
    ctx.fillStyle = "#8A8D96";
    ctx.font = "500 15px Inter, sans-serif";
    ctx.fillText(tronquerTexteMcnt(ctx, textes.sousTexte, cardW - 60), W / 2, cardY + 140);
  }

  ctx.restore();
}

/* Tronque un texte à une seule ligne avec "…" si besoin, pour les libellés
   compacts des cartes du template C (contrairement à wrapTextMcnt qui gère
   plusieurs lignes). */
function tronquerTexteMcnt(ctx, texte, maxWidth) {
  if (ctx.measureText(texte).width <= maxWidth) return texte;
  let tronque = texte;
  while (tronque.length > 1 && ctx.measureText(tronque + "…").width > maxWidth) {
    tronque = tronque.slice(0, -1);
  }
  return tronque + "…";
}

/* ── Template A : "Mockup + features" ───────────────────────────────────
   Timeline en 3 phases, un mockup de téléphone dessiné entièrement en
   Canvas (pas d'image externe requise, contrairement à la vidéo de
   référence qui utilisait des avatars stock) :
     Phase 1 (0 → 1.2s)   : le téléphone entre en slide-up + fondu, écran
                             encore vide (juste le logo Aura Market dessus).
     Phase 2 (1.2 → 1.8s) : le produit (ou une carte "app" générique sans
                             produit) apparaît à l'écran du téléphone.
     Phase 3 (1.8 → 5.4s) : les 3 features apparaissent une à une à gauche
                             du téléphone, chacune reliée par une ligne
                             pointillée animée jusqu'à l'écran — hommage
                             direct à la structure de la vidéo de référence
                             (avatars → lignes → écran) mais avec du texte
                             au lieu d'avatars figés.
     Phase 4 (5.4 → 7.0s) : CTA qui pulse sous le téléphone.
   Durée totale : ~7s. Même pipeline d'export (canvas.captureStream +
   MediaRecorder, sans piste audio) que le template B. */
const MCNT_PUB2D_A_PHASE1 = 1200;
const MCNT_PUB2D_A_PHASE2 = 600;
const MCNT_PUB2D_A_PHASE3 = 3600;
const MCNT_PUB2D_A_PHASE4 = 1600;
const MCNT_PUB2D_A_DUREE_TOTALE = MCNT_PUB2D_A_PHASE1 + MCNT_PUB2D_A_PHASE2 + MCNT_PUB2D_A_PHASE3 + MCNT_PUB2D_A_PHASE4;

async function rendrePub2dTemplateA(textes, audioInfo, onProgress, style = {}) {
  const canvas = document.getElementById("mcnt-pub2d-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const FPS = 24;

  onProgress(2, "Chargement du produit…");
  const produitImg = (_mcntPub2dSourceType === "produit" && _mcntPub2dProduitSelectionne?.image_url)
    ? await chargerImageMcnt(_mcntPub2dProduitSelectionne.image_url).catch(() => null)
    : null;

  const couleurAccent = style.accent || "#F0B429";
  const features = (Array.isArray(textes.features) ? textes.features : pub2dFeaturesFallback()).filter(f => f && f.trim());
  const facteur = calculerFacteurEtirementPub2d(MCNT_PUB2D_A_DUREE_TOTALE, audioInfo);
  const dureeReelle = MCNT_PUB2D_A_DUREE_TOTALE * facteur;

  const { recorder, enregistrementTermine, audioCtx, demarrerAudio } = demarrerEnregistrementPub2d(canvas, audioInfo, FPS);

  recorder.start();
  demarrerAudio();
  onProgress(6, "Rendu en cours…");

  await new Promise(resolve => {
    const debut = performance.now();

    function frame(now) {
      const tReel = now - debut;
      const t = tReel / facteur;
      dessinerFramePub2dTemplateA(ctx, W, H, t, textes, produitImg, features, couleurAccent);

      const pourcent = Math.min(100, (tReel / dureeReelle) * 100);
      onProgress(6 + pourcent * 0.9, "Rendu en cours…");

      if (tReel < dureeReelle) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });

  await finaliserEnregistrementPub2d(recorder, audioCtx);

  return enregistrementTermine;
}

function dessinerFramePub2dTemplateA(ctx, W, H, t, textes, produitImg, features, couleurAccent) {
  // Fond sombre uni, plus neutre que le template B pour laisser le mockup
  // et les cartes de features se détacher nettement.
  const fond = ctx.createLinearGradient(0, 0, 0, H);
  fond.addColorStop(0, "#131418");
  fond.addColorStop(1, "#0B0C0F");
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.9);
  glow.addColorStop(0, `${couleurAccent}24`);
  glow.addColorStop(1, `${couleurAccent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  dessinerParticulesMcnt(ctx, W, H, t, couleurAccent, 10);

  const p1 = MCNT_PUB2D_A_PHASE1;
  const p2Debut = p1, p2Fin = p1 + MCNT_PUB2D_A_PHASE2;
  const p3Debut = p2Fin, p3Fin = p3Debut + MCNT_PUB2D_A_PHASE3;
  const p4Debut = p3Fin;

  // ── Accroche en haut, toujours visible dès le départ, avec ombre douce
  // et léger dégradé pour un rendu moins plat qu'un simple fillText blanc. ──
  const accrocheAlpha = clampMcnt(t / 500, 0, 1);
  const accrocheY0 = 108 + (1 - easeOutCubicMcnt(clampMcnt(t / 500, 0, 1))) * 14;
  ctx.save();
  ctx.globalAlpha = accrocheAlpha;
  ctx.textAlign = "center";
  ctx.font = "800 33px Inter, sans-serif";
  const lignesAccroche = wrapTextMcnt(ctx, textes.accroche || "", W - 90, 2);
  let ay = accrocheY0;
  lignesAccroche.forEach(l => {
    dessinerTexteAvecEspacementMcnt(ctx, l, W / 2, ay, 0.6, {
      ombre: true, ombreCouleur: "rgba(0,0,0,0.45)", ombreBlur: 14, ombreY: 4,
      degrade: ["#FFFFFF", "#EFE9DC"]
    });
    ay += 42;
  });
  ctx.restore();

  // ── Mockup téléphone : entre en slide-up + fondu (phase 1), reste fixe ensuite. ──
  const phoneW = W * 0.42, phoneH = phoneW * 2.05;
  const phoneCx = W * 0.68, phoneCyBase = H * 0.52;
  const entreeT = clampMcnt(t / p1, 0, 1);
  const entreeEase = easeOutCubicMcnt(entreeT);
  const phoneCy = phoneCyBase + (1 - entreeEase) * 90;
  const phoneAlpha = clampMcnt(t / 600, 0, 1);

  ctx.save();
  ctx.globalAlpha = phoneAlpha;
  dessinerMockupTelephoneMcnt(ctx, phoneCx, phoneCy, phoneW, phoneH, produitImg, t, p2Debut, p2Fin, couleurAccent);
  ctx.restore();

  // ── Features : apparaissent une à une, reliées au téléphone par une
  // ligne pointillée qui se dessine progressivement (façon vidéo de réf.). ──
  const dureeParFeature = MCNT_PUB2D_A_PHASE3 / Math.max(features.length, 1);
  features.forEach((texte, i) => {
    const debutFeature = p3Debut + i * dureeParFeature;
    if (t < debutFeature) return;

    const localT = clampMcnt((t - debutFeature) / 500, 0, 1);
    const entreeEaseFeature = easeOutBackMcnt(localT);
    const alpha = clampMcnt(localT * 1.3, 0, 1);
    const slideX = (1 - entreeEaseFeature) * -50;

    const cardX = 46;
    const cardY = H * 0.34 + i * 118;
    const cardW = W * 0.42;
    const cardH = 74;

    // Ligne pointillée reliant la carte au téléphone, tracée progressivement.
    const ligneAlpha = clampMcnt((t - debutFeature - 150) / 400, 0, 1);
    if (ligneAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = ligneAlpha * 0.7;
      ctx.strokeStyle = couleurAccent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -((t / 1000) * 24) % 12; // légère "fourmi" animée le long du pointillé
      ctx.beginPath();
      ctx.moveTo(cardX + cardW, cardY + cardH / 2);
      ctx.lineTo(phoneCx - phoneW / 2 - 6, phoneCyBase - phoneH / 2 + 40 + i * 26);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(slideX, 0);

    // Carte de la feature, avec ombre portée pour la détacher du fond.
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#1C1D22";
    dessinerRectArrondiMcnt(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1.5;
    dessinerRectArrondiMcnt(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.stroke();

    // Puce ronde dorée + coche.
    ctx.fillStyle = couleurAccent;
    ctx.beginPath();
    ctx.arc(cardX + 26, cardY + cardH / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1200";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cardX + 20, cardY + cardH / 2);
    ctx.lineTo(cardX + 24.5, cardY + cardH / 2 + 4.5);
    ctx.lineTo(cardX + 32.5, cardY + cardH / 2 - 5.5);
    ctx.stroke();

    // Texte de la feature.
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.font = "700 16px Inter, sans-serif";
    const lignesFeature = wrapTextMcnt(ctx, texte, cardW - 62, 2);
    const ligneHFeature = 20;
    let fy = cardY + cardH / 2 - ((lignesFeature.length - 1) * ligneHFeature) / 2 + 5;
    lignesFeature.forEach(l => { ctx.fillText(l, cardX + 50, fy); fy += ligneHFeature; });

    ctx.restore();
  });

  // ── CTA en phase 4, sous le mockup, avec halo lumineux. ──
  if (textes.cta && t >= p4Debut) {
    const localT = (t - p4Debut) / 1000;
    const entree = clampMcnt((t - p4Debut) / 400, 0, 1);
    const pulse = 1 + Math.sin(localT * 3.2) * 0.03;

    ctx.save();
    ctx.globalAlpha = entree;
    ctx.font = "800 23px Inter, sans-serif";
    const texteW = ctx.measureText(textes.cta).width;
    const padX = 30;
    const boutonW = (texteW + padX * 2) * pulse;
    const boutonH = 50 * pulse;
    const bx = W / 2 - boutonW / 2;
    const by = H * 0.90 - boutonH / 2;

    const haloBtn = ctx.createRadialGradient(W / 2, by + boutonH / 2, 0, W / 2, by + boutonH / 2, boutonW * 0.85);
    haloBtn.addColorStop(0, `${couleurAccent}38`);
    haloBtn.addColorStop(1, `${couleurAccent}00`);
    ctx.fillStyle = haloBtn;
    ctx.fillRect(bx - boutonW * 0.4, by - boutonH * 0.6, boutonW * 1.8, boutonH * 2.2);

    const boutonDegrade = ctx.createLinearGradient(bx, by, bx, by + boutonH);
    boutonDegrade.addColorStop(0, "#FFD873");
    boutonDegrade.addColorStop(1, couleurAccent);
    ctx.fillStyle = boutonDegrade;
    dessinerRectArrondiMcnt(ctx, bx, by, boutonW, boutonH, boutonH / 2);
    ctx.fill();

    ctx.fillStyle = "#1a1200";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(textes.cta, W / 2, by + boutonH / 2 + 1);
    ctx.restore();
  }

  dessinerVignetteMcnt(ctx, W, H, 0.3);
}

/* Dessine un mockup de téléphone stylisé (coque + écran) entièrement en
   Canvas — aucune image externe nécessaire. L'écran affiche soit le produit
   (contain, phase >= p2), soit une carte "app" générique tant que rien
   n'est encore apparu. Un reflet diagonal glisse lentement sur l'écran pour
   suggérer une surface vitrée plutôt qu'un aplat plat. */
function dessinerMockupTelephoneMcnt(ctx, cx, cy, W, H, produitImg, t, p2Debut, p2Fin, couleurAccent) {
  const x = cx - W / 2, y = cy - H / 2;
  const radius = 34;

  // Ombre portée du téléphone.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#0D0D0F";
  dessinerRectArrondiMcnt(ctx, x, y, W, H, radius);
  ctx.fill();
  ctx.restore();

  // Coque en léger dégradé métallique (au lieu d'un gris plat), pour un
  // rendu moins "maquette wireframe" et plus proche d'un vrai mockup produit.
  const coqueDegrade = ctx.createLinearGradient(x, y, x + W, y + H);
  coqueDegrade.addColorStop(0, "#1E1F24");
  coqueDegrade.addColorStop(0.5, "#17181C");
  coqueDegrade.addColorStop(1, "#101114");
  ctx.fillStyle = coqueDegrade;
  dessinerRectArrondiMcnt(ctx, x, y, W, H, radius);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  dessinerRectArrondiMcnt(ctx, x, y, W, H, radius);
  ctx.stroke();

  // Écran (léger retrait par rapport à la coque).
  const pad = 10;
  const screenX = x + pad, screenY = y + pad + 14;
  const screenW = W - pad * 2, screenH = H - pad * 2 - 28;
  ctx.save();
  ctx.fillStyle = "#0B0C0E";
  dessinerRectArrondiMcnt(ctx, screenX, screenY, screenW, screenH, radius - 14);
  ctx.fill();
  ctx.clip();

  // Contenu de l'écran : le produit une fois apparu, sinon un repère app neutre.
  const produitAlpha = clampMcnt((t - p2Debut) / (p2Fin - p2Debut || 1), 0, 1);
  if (produitImg && produitAlpha > 0) {
    ctx.globalAlpha = produitAlpha;
    const ratio = Math.min((screenW * 0.8) / produitImg.width, (screenH * 0.55) / produitImg.height);
    const dw = produitImg.width * ratio, dh = produitImg.height * ratio;
    ctx.fillStyle = "#16171B";
    ctx.fillRect(screenX, screenY, screenW, screenH);
    ctx.drawImage(produitImg, screenX + (screenW - dw) / 2, screenY + screenH * 0.18, dw, dh);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "#16171B";
    ctx.fillRect(screenX, screenY, screenW, screenH);
  }

  // Petite barre de statut + logo Aura Market en haut de l'écran, toujours visible.
  ctx.fillStyle = couleurAccent;
  ctx.globalAlpha = 0.9;
  ctx.font = "800 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("AURA MARKET", screenX + screenW / 2, screenY + 24);
  ctx.globalAlpha = 1;

  // Reflet diagonal type verre, qui glisse lentement de gauche à droite en
  // boucle — suggère une surface vitrée plutôt qu'un écran mat plat.
  const cycleReflet = ((t / 2600) % 1);
  const refletX = screenX - screenW * 0.4 + cycleReflet * screenW * 1.8;
  const reflet = ctx.createLinearGradient(refletX - 60, 0, refletX + 60, 0);
  reflet.addColorStop(0, "rgba(255,255,255,0)");
  reflet.addColorStop(0.5, "rgba(255,255,255,0.08)");
  reflet.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = reflet;
  ctx.fillRect(screenX, screenY, screenW, screenH);

  ctx.restore();

  // Encoche haut d'écran (petit détail mockup).
  ctx.fillStyle = "#0D0D0F";
  dessinerRectArrondiMcnt(ctx, cx - 26, y + 4, 52, 8, 4);
  ctx.fill();
}

/* ── Template B : "Texte choc" ──────────────────────────────────────────
   Timeline en 3 phases sur fond dégradé doré/noir Aura Market :
     Phase 1 (0 → 1.6s)  : accroche qui entre en fondu + léger slide-up,
                            fond avec glow radial animé.
     Phase 2 (1.6 → 4.4s): le produit (si présent) entre en zoom-in avec un
                            léger rebond (overshoot), sous-texte qui suit ;
                            sans produit, l'accroche reste au centre et le
                            sous-texte apparaît sous elle.
     Phase 3 (4.4 → 6.5s): bouton CTA qui pulse doucement, logo Aura Market
                            discret en bas.
   Durée totale : ~6.5s, 720x1280 @ 24fps, même pipeline d'export (canvas
   .captureStream + MediaRecorder) que le mode narré, mais sans piste audio
   (pas de voix off pour ce template) — un seul MediaStream vidéo suffit. */
const MCNT_PUB2D_B_PHASE1 = 1600;
const MCNT_PUB2D_B_PHASE2 = 2800;
const MCNT_PUB2D_B_PHASE3 = 2100;
const MCNT_PUB2D_B_DUREE_TOTALE = MCNT_PUB2D_B_PHASE1 + MCNT_PUB2D_B_PHASE2 + MCNT_PUB2D_B_PHASE3;

async function rendrePub2dTemplateB(textes, audioInfo, onProgress, style = {}) {
  const canvas = document.getElementById("mcnt-pub2d-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const FPS = 24;

  onProgress(2, "Chargement du produit…");
  const produitImg = (_mcntPub2dSourceType === "produit" && _mcntPub2dProduitSelectionne?.image_url)
    ? await chargerImageMcnt(_mcntPub2dProduitSelectionne.image_url).catch(() => null)
    : null;

  const facteur = calculerFacteurEtirementPub2d(MCNT_PUB2D_B_DUREE_TOTALE, audioInfo);
  const dureeReelle = MCNT_PUB2D_B_DUREE_TOTALE * facteur;

  const { recorder, enregistrementTermine, audioCtx, demarrerAudio } = demarrerEnregistrementPub2d(canvas, audioInfo, FPS);

  recorder.start();
  demarrerAudio();
  onProgress(6, "Rendu en cours…");

  await new Promise(resolve => {
    const debut = performance.now();

    function frame(now) {
      const tReel = now - debut;
      const t = tReel / facteur;
      dessinerFramePub2dTemplateB(ctx, W, H, t, textes, produitImg, style);

      const pourcent = Math.min(100, (tReel / dureeReelle) * 100);
      onProgress(6 + pourcent * 0.9, "Rendu en cours…");

      if (tReel < dureeReelle) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });

  await finaliserEnregistrementPub2d(recorder, audioCtx);

  return enregistrementTermine;
}

/* Résout une palette complète du moteur B à partir d'un style partiel : toute
   couleur absente retombe sur la palette "or sur fond sombre" d'origine. */
function resoudreStylePub2dB(style = {}) {
  return {
    fond: style.fond || ["#17140F", "#100E0C", "#08070A"],
    glow: style.glow || style.accent || "#F0B429",
    accent: style.accent || "#F0B429",
    texteDegrade: style.texteDegrade || ["#FFFFFF", "#F1E7D2"],
    soustexte: style.soustexte || "#C9C9CE",
    ctaDegrade: style.ctaDegrade || ["#FFD873", "#F0B429"],
    ctaTexte: style.ctaTexte || "#1a1200",
    particules: style.particules || style.accent || "#F0B429",
    logoColor: style.logoColor || "#FFFFFF",
    vignette: style.vignette ?? 0.35,
    grain: style.grain ?? 0.04,
    camAmpleur: style.camAmpleur ?? 0.06,
    letterbox: !!style.letterbox,
    clair: !!style.clair
  };
}

/* Dessine une frame complète du template B au temps t (ms). Toutes les
   valeurs d'easing sont calculées ici plutôt que pré-stockées : le coût est
   négligeable (quelques opérations arithmétiques par frame) et ça évite
   d'avoir à gérer un état d'animation séparé. */
function dessinerFramePub2dTemplateB(ctx, W, H, t, textes, produitImg, style) {
  const S = resoudreStylePub2dB(style);
  // Fond : dégradé profond + glow radial qui dérive lentement, façon
  // habillage premium plutôt qu'un aplat de couleur figé.
  const fond = ctx.createLinearGradient(0, 0, 0, H);
  fond.addColorStop(0, S.fond[0]);
  fond.addColorStop(0.55, S.fond[1]);
  fond.addColorStop(1, S.fond[2]);
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, W, H);

  const glowT = t / 1000;
  const glowX = W / 2 + Math.sin(glowT * 0.4) * 60;
  const glowY = H * 0.4 + Math.cos(glowT * 0.3) * 40;
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, W * 0.85);
  glow.addColorStop(0, `${S.glow}33`);
  glow.addColorStop(1, `${S.glow}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Particules discrètes qui dérivent lentement vers le haut, pour donner de
  // la profondeur au fond sans distraire du texte.
  dessinerParticulesMcnt(ctx, W, H, t, S.particules, 14);

  // ── Caméra cinématographique : le fond (dégradé + glow + particules) reste
  // stable en fond de plan, tandis que le contenu (titre, produit, CTA) subit
  // un push-in lent + dérive — effet de parallaxe premium. ──
  ctx.save();
  appliquerCameraCinematiqueMcnt(ctx, W, H, t, t / MCNT_PUB2D_B_DUREE_TOTALE, S.camAmpleur);

  const p1 = MCNT_PUB2D_B_PHASE1;
  const p2Debut = p1, p2Fin = p1 + MCNT_PUB2D_B_PHASE2;
  const p3Debut = p2Fin;

  // ── Accroche : fondu + slide-up en phase 1, puis se stabilise en haut
  // pour laisser la place au produit en phase 2/3. ──
  const accrocheEntreeT = clampMcnt(t / p1, 0, 1);
  const accrocheYCible = produitImg || textes.sousTexte ? H * 0.20 : H * 0.42;
  const accrocheYDepart = H * 0.5 + 40;
  const accrocheY = t < p1
    ? accrocheYDepart + (H * 0.36 - accrocheYDepart) * easeOutCubicMcnt(accrocheEntreeT)
    : accrocheYCible + (H * 0.36 - accrocheYCible) * (1 - clampMcnt((t - p1) / 400, 0, 1));
  const accrocheAlpha = clampMcnt(t / 500, 0, 1);

  ctx.font = "800 50px Inter, sans-serif";
  const lignesAccroche = wrapTextMcnt(ctx, textes.accroche || "", W - 90, 3);
  const ligneHAccroche = 58;
  const ayAccroche = accrocheY - ((lignesAccroche.length - 1) * ligneHAccroche) / 2;

  // Révélation cinétique mot par mot (fondu + slide-up + scale décalés).
  dessinerTexteCinetiqueMcnt(ctx, lignesAccroche, W / 2, ayAccroche, ligneHAccroche, t, {
    decalageMot: 90, dureeMot: 480,
    degrade: S.texteDegrade,
    ombre: true, ombreCouleur: "rgba(0,0,0,0.5)", ombreBlur: 18
  });

  // Soulignement animé sous la dernière ligne (signature visuelle),
  // qui se trace une fois les mots posés.
  ctx.save();
  ctx.font = "800 50px Inter, sans-serif";
  const derniereLigneW = ctx.measureText(lignesAccroche[lignesAccroche.length - 1] || "").width;
  const nbMots = (textes.accroche || "").split(" ").filter(Boolean).length;
  const traitAvancement = easeOutCubicMcnt(clampMcnt((t - nbMots * 90) / 500, 0, 1));
  const traitW = Math.min(160, derniereLigneW * 0.55) * traitAvancement;
  const ayTrait = ayAccroche + (lignesAccroche.length - 1) * ligneHAccroche + 22;
  ctx.globalAlpha = accrocheAlpha;
  ctx.fillStyle = S.accent;
  dessinerRectArrondiMcnt(ctx, W / 2 - traitW / 2, ayTrait, traitW, 4, 2);
  ctx.fill();
  ctx.restore();

  // ── Produit : zoom-in avec léger rebond (overshoot), halo lumineux
  // derrière, à partir de la phase 2. Reste affiché jusqu'à la fin. ──
  if (produitImg && t >= p2Debut - 200) {
    const localT = clampMcnt((t - (p2Debut - 200)) / 700, 0, 1);
    const scale = easeOutBackMcnt(localT);
    const alpha = clampMcnt(localT * 1.4, 0, 1);
    const flotte = Math.sin(t / 900) * 6; // très léger flottement continu, façon photo produit "posée"

    const zoneW = W * 0.62, zoneH = H * 0.34;
    const ratio = Math.min(zoneW / produitImg.width, zoneH / produitImg.height);
    const dw = produitImg.width * ratio * scale;
    const dh = produitImg.height * ratio * scale;
    const cx = W / 2, cy = H * 0.5 + flotte;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Halo lumineux doré derrière le produit (au lieu d'un fond neutre) :
    // ancre visuellement le produit comme élément central de la scène.
    const haloR = Math.max(dw, dh) * 0.75;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
    halo.addColorStop(0, `${S.accent}2A`);
    halo.addColorStop(1, `${S.accent}00`);
    ctx.fillStyle = halo;
    ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);

    // Ombre douce sous le produit pour un rendu "posé" plutôt que collé au fond.
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.drawImage(produitImg, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  }

  // ── Sous-texte : apparaît juste après le produit, sous celui-ci. ──
  if (textes.sousTexte && t >= p2Debut + 300) {
    const localT = clampMcnt((t - (p2Debut + 300)) / 500, 0, 1);
    ctx.save();
    ctx.globalAlpha = easeOutCubicMcnt(localT);
    ctx.fillStyle = S.soustexte;
    ctx.textAlign = "center";
    ctx.font = "600 25px Inter, sans-serif";
    const lignesSousTexte = wrapTextMcnt(ctx, textes.sousTexte, W - 110, 2);
    let sy = H * 0.735 + (1 - easeOutCubicMcnt(localT)) * 14;
    lignesSousTexte.forEach(l => { ctx.fillText(l, W / 2, sy); sy += 34; });
    ctx.restore();
  }

  // ── CTA : bouton qui pulse doucement en phase 3, avec halo et petite flèche. ──
  if (textes.cta && t >= p3Debut) {
    const localT = (t - p3Debut) / 1000;
    const entree = clampMcnt((t - p3Debut) / 400, 0, 1);
    const entreeEase = easeOutBackMcnt(entree);
    const pulse = 1 + Math.sin(localT * 3.2) * 0.035;

    ctx.save();
    ctx.globalAlpha = entree;
    ctx.font = "800 25px Inter, sans-serif";
    const texteW = ctx.measureText(textes.cta).width;
    const padX = 36;
    const boutonW = (texteW + padX * 2 + 26) * pulse * (0.9 + entreeEase * 0.1);
    const boutonH = 56 * pulse;
    const bx = W / 2 - boutonW / 2;
    const by = H * 0.845 - boutonH / 2;

    // Halo lumineux derrière le bouton pour le faire ressortir du fond.
    const haloBtn = ctx.createRadialGradient(W / 2, by + boutonH / 2, 0, W / 2, by + boutonH / 2, boutonW * 0.9);
    haloBtn.addColorStop(0, `${S.accent}40`);
    haloBtn.addColorStop(1, `${S.accent}00`);
    ctx.fillStyle = haloBtn;
    ctx.fillRect(bx - boutonW * 0.4, by - boutonH * 0.6, boutonW * 1.8, boutonH * 2.2);

    const boutonDegrade = ctx.createLinearGradient(bx, by, bx, by + boutonH);
    boutonDegrade.addColorStop(0, S.ctaDegrade[0]);
    boutonDegrade.addColorStop(1, S.ctaDegrade[1]);
    ctx.fillStyle = boutonDegrade;
    dessinerRectArrondiMcnt(ctx, bx, by, boutonW, boutonH, boutonH / 2);
    ctx.fill();

    ctx.fillStyle = S.ctaTexte;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(textes.cta, W / 2 - 10, by + boutonH / 2 + 1);

    // Petite flèche après le texte, façon bouton d'action premium.
    ctx.beginPath();
    const fx = W / 2 + texteW / 2 + 4, fy = by + boutonH / 2;
    ctx.moveTo(fx, fy - 6);
    ctx.lineTo(fx + 8, fy);
    ctx.lineTo(fx, fy + 6);
    ctx.strokeStyle = S.ctaTexte;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  // Fin de la caméra : l'habillage (balayages, vignette, grain, logo) est
  // dessiné en espace écran, non affecté par le mouvement de caméra.
  ctx.restore();

  // ── Balayages de lumière sur les moments forts : entrée du produit, puis
  // apparition du CTA (glint façon reflet sur une surface premium). ──
  if (produitImg) {
    dessinerBalayageLumiereMcnt(ctx, W, H, (t - (p2Debut - 100)) / 650, 0.14);
  }
  dessinerBalayageLumiereMcnt(ctx, W, H, (t - p3Debut) / 600, 0.18);

  // ── Bandes cinéma (letterbox) optionnelles selon le style. ──
  if (S.letterbox) {
    const barreH = H * 0.055;
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, barreH);
    ctx.fillRect(0, H - barreH, W, barreH);
    ctx.restore();
  }

  // ── Vignette de profondeur : assombrit légèrement les bords, recentre
  // l'attention sur le milieu de l'écran (effet cinéma discret). ──
  dessinerVignetteMcnt(ctx, W, H, S.vignette);

  // ── Grain film subtil par-dessus tout : casse l'aspect "numérique plat". ──
  dessinerGrainMcnt(ctx, W, H, t, S.grain);

  // ── Logo/mention Aura Market, discret en bas, tout du long. ──
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = S.logoColor;
  ctx.font = "700 14px Inter, sans-serif";
  ctx.textAlign = "center";
  dessinerTexteAvecEspacementMcnt(ctx, "AURA MARKET", W / 2, H - 36, 3);
  ctx.restore();
}

function clampMcnt(v, min, max) { return Math.min(max, Math.max(min, v)); }
function easeOutCubicMcnt(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutBackMcnt(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function dessinerRectArrondiMcnt(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Dessine un texte avec un léger espacement entre lettres (letter-spacing),
   non supporté nativement par Canvas 2D avant très récemment : on découpe
   caractère par caractère et on avance manuellement. Supporte un dégradé
   vertical de couleur et une ombre portée pour un rendu plus soigné qu'un
   simple fillText plat. Le texte doit déjà être centré via ctx.textAlign
   avant l'appel ; cx correspond alors au centre du bloc de texte. */
function dessinerTexteAvecEspacementMcnt(ctx, texte, cx, cy, espacementPx, options = {}) {
  const largeurs = [...texte].map(c => ctx.measureText(c).width);
  const largeurTotale = largeurs.reduce((a, b) => a + b, 0) + espacementPx * Math.max(0, texte.length - 1);

  ctx.save();
  if (options.ombre) {
    ctx.shadowColor = options.ombreCouleur || "rgba(0,0,0,0.4)";
    ctx.shadowBlur = options.ombreBlur || 10;
    ctx.shadowOffsetY = options.ombreY || 4;
  }

  if (options.degrade) {
    const grad = ctx.createLinearGradient(cx - largeurTotale / 2, cy - 20, cx - largeurTotale / 2, cy + 12);
    options.degrade.forEach((couleur, i) => grad.addColorStop(i / (options.degrade.length - 1 || 1), couleur));
    ctx.fillStyle = grad;
  }

  const alignOriginal = ctx.textAlign;
  ctx.textAlign = "left";
  let x = cx - largeurTotale / 2;
  [...texte].forEach((car, i) => {
    ctx.fillText(car, x, cy);
    x += largeurs[i] + espacementPx;
  });
  ctx.textAlign = alignOriginal;
  ctx.restore();
}

/* Petites particules dorées qui dérivent lentement vers le haut en boucle,
   pour donner une sensation de profondeur/mouvement ambiant au fond sans
   distraire des éléments principaux. Positions déterministes (basées sur
   l'index) plutôt qu'aléatoires à chaque frame, pour un mouvement stable
   et reproductible d'une frame à l'autre. */
function dessinerParticulesMcnt(ctx, W, H, t, couleur, nombre) {
  ctx.save();
  for (let i = 0; i < nombre; i++) {
    const graine = i * 137.5; // angle d'or : répartition visuellement homogène
    const baseX = (Math.sin(graine) * 0.5 + 0.5) * W;
    const vitesse = 18 + (i % 5) * 6; // px/s, variée selon la particule
    const decalage = (i * 900) % 6000;
    const cycle = ((t + decalage) / 1000 * vitesse) % (H + 100);
    const y = H - cycle;
    const x = baseX + Math.sin((t + decalage) / 1400) * 22;
    const taille = 1.4 + (i % 3) * 0.8;
    const alpha = 0.5 * (1 - Math.abs((y / H) - 0.5) * 0.6);

    ctx.globalAlpha = clampMcnt(alpha, 0, 0.55);
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.arc(x, y, taille, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* Vignette de profondeur : assombrit progressivement les bords du cadre,
   effet cinéma discret qui recentre l'attention sur le milieu de l'écran.
   intensite entre 0 (aucun effet) et 1 (vignette marquée). */
function dessinerVignetteMcnt(ctx, W, H, intensite) {
  ctx.save();
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${intensite})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ══════════════════════════════════════════════
   PRIMITIVES CINÉMATOGRAPHIQUES (partagées)
   Briques réutilisables qui élèvent le rendu Canvas vers un look "spot pro" :
   mouvement de caméra, balayage de lumière, grain film, et typographie
   cinétique (révélation mot par mot). Volontairement légères pour rester
   fluides sur mobile.
══════════════════════════════════════════════ */
function easeInOutCubicMcnt(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* Applique un léger mouvement de caméra (push-in lent + dérive) au contexte.
   À appeler après ctx.save() ; l'appelant fait ctx.restore() ensuite. Donne
   la sensation d'un plan filmé plutôt que d'un aplat figé.
   avancement 0..1 sur la durée du plan. */
function appliquerCameraCinematiqueMcnt(ctx, W, H, t, avancement, ampleur = 0.055) {
  const scale = (1 + ampleur) - ampleur * easeInOutCubicMcnt(clampMcnt(avancement, 0, 1));
  const driftX = Math.sin(t / 2600) * (W * 0.014);
  const driftY = Math.cos(t / 3100) * (H * 0.010);
  ctx.translate(W / 2 + driftX, H / 2 + driftY);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -H / 2);
}

/* Bande de lumière diagonale qui traverse le cadre. progres 0..1 : position
   de la bande de gauche à droite. Utilise le mode "lighter" pour un effet de
   reflet lumineux (glint) sur les moments forts (produit, CTA). */
function dessinerBalayageLumiereMcnt(ctx, W, H, progres, opacite = 0.16) {
  if (progres <= 0 || progres >= 1) return;
  const largeurBande = W * 0.45;
  const x = -largeurBande + progres * (W + largeurBande * 2);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, 0);
  ctx.rotate(-0.35);
  const grad = ctx.createLinearGradient(0, 0, largeurBande, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, `rgba(255,255,255,${opacite})`);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, -H, largeurBande, H * 3);
  ctx.restore();
}

/* Grain film subtil : texture organique qui casse l'aspect "numérique plat"
   du Canvas. Positions déterministes dérivées du temps (pas de Math.random,
   pour un scintillement stable et reproductible). intensite ~0.03-0.06. */
function dessinerGrainMcnt(ctx, W, H, t, intensite = 0.045) {
  ctx.save();
  ctx.globalAlpha = intensite;
  const n = 130;
  for (let i = 0; i < n; i++) {
    const s = i * 97.13 + t * 0.017;
    const x = (Math.sin(s) * 0.5 + 0.5) * W;
    const y = (Math.cos(s * 1.73) * 0.5 + 0.5) * H;
    const g = Math.sin(s * 3.1) > 0 ? 255 : 0;
    ctx.fillStyle = g ? "#FFFFFF" : "#000000";
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.restore();
}

/* Typographie cinétique : révèle un bloc de texte mot par mot (fondu + slide
   up + léger scale), avec un décalage entre chaque mot. C'est le principal
   levier qui fait passer les titres d'un simple fillText à une animation de
   motion designer.
   - lignes : tableau de chaînes déjà découpées (via wrapTextMcnt)
   - cx, cyBase : centre horizontal, y de la première ligne
   - ligneH : hauteur de ligne
   - avancementMs : temps écoulé depuis le début de l'animation du bloc
   - options : { decalageMot, dureeMot, degrade, ombre, ombreBlur } */
function dessinerTexteCinetiqueMcnt(ctx, lignes, cx, cyBase, ligneH, avancementMs, options = {}) {
  const decalageMot = options.decalageMot ?? 95;
  const dureeMot = options.dureeMot ?? 460;
  let indexGlobal = 0;

  lignes.forEach((ligne, li) => {
    const mots = ligne.split(" ").filter(Boolean);
    const espace = ctx.measureText(" ").width;
    const largeurs = mots.map(m => ctx.measureText(m).width);
    const largeurLigne = largeurs.reduce((a, b) => a + b, 0) + espace * Math.max(0, mots.length - 1);
    let x = cx - largeurLigne / 2;
    const y = cyBase + li * ligneH;

    mots.forEach((mot, mi) => {
      const centreMot = x + largeurs[mi] / 2;
      const local = clampMcnt((avancementMs - indexGlobal * decalageMot) / dureeMot, 0, 1);
      const e = easeOutCubicMcnt(local);
      const dy = (1 - e) * 24;
      const sc = 0.82 + e * 0.18;

      if (local > 0) {
        ctx.save();
        ctx.globalAlpha = e;
        ctx.translate(centreMot, y + dy);
        ctx.scale(sc, sc);
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        if (options.ombre) {
          ctx.shadowColor = options.ombreCouleur || "rgba(0,0,0,0.5)";
          ctx.shadowBlur = options.ombreBlur || 18;
          ctx.shadowOffsetY = 6;
        }
        if (options.degrade) {
          const grad = ctx.createLinearGradient(0, -ligneH * 0.5, 0, ligneH * 0.3);
          options.degrade.forEach((c, i) => grad.addColorStop(i / (options.degrade.length - 1 || 1), c));
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = "#FFFFFF";
        }
        ctx.fillText(mot, 0, 0);
        ctx.restore();
      }
      x += largeurs[mi] + espace;
      indexGlobal++;
    });
  });
}

/* Assemble la vidéo finale : dessine chaque scène sur le canvas avec un
   effet de zoom lent (Ken Burns), joue la piste audio correspondante en
   parallèle, et capture le tout via MediaRecorder (canvas.captureStream +
   piste audio du contexte Web Audio, fusionnées dans un seul flux).
   Version allégée (720x1280, 24fps, bitrate réduit) pour rester stable sur
   navigateur mobile : les images natives (souvent lourdes) sont redimen-
   sionnées une seule fois en amont, et chaque élément audio est
   explicitement libéré après sa scène pour éviter toute accumulation
   mémoire sur des storyboards à plusieurs scènes. */
async function assemblerVideoMcnt(scenesAvecVoix, onProgress, audioCtxExistant = null) {
  const canvas = document.getElementById("mcnt-video-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const FPS = 24;

  // Préchargement + downscale : chaque image est redessinée une fois à la
  // taille finale du canvas dans un canvas hors-écran, puis on ne garde que
  // ce bitmap léger. Évite de garder en mémoire des images sources en
  // pleine résolution (souvent 1024px+) pendant toute la durée du montage.
  const images = await Promise.all(
    scenesAvecVoix.map(s => s.imageUrl ? redimensionnerImageMcnt(s.imageUrl, W, H).catch(() => null) : null)
  );

  // Réutilise l'AudioContext débloqué pendant le clic (onGenererVideo) si
  // fourni, plutôt que d'en recréer un nouveau ici — un contexte créé après
  // les await réseau ne serait plus considéré comme lié au geste utilisateur.
  const audioCtx = audioCtxExistant || new (window.AudioContext || window.webkitAudioContext)();
  const destination = audioCtx.createMediaStreamDestination();

  // ── Musique de fond automatique (mode Histoire) : chargée une seule fois,
  // décodée en AudioBuffer et jouée EN BOUCLE sur toute la durée du montage,
  // via un GainNode dédié pour garder son volume indépendant de la voix off
  // et des SFX. Absence de fichier (pas encore déposé par l'admin) = musique
  // silencieuse, le montage continue normalement. ──
  onProgress(0, "Chargement de la musique de fond…");
  const musiqueInfo = await chargerMusiqueHistoireMcnt();
  let musiqueSourceNode = null;
  let musiqueGainNode = null;
  if (musiqueInfo) {
    try {
      const reponseMusique = await fetch(musiqueInfo.dataUrl);
      const bufferMusique = await reponseMusique.arrayBuffer();
      const audioBufferMusique = await audioCtx.decodeAudioData(bufferMusique);
      musiqueGainNode = audioCtx.createGain();
      musiqueGainNode.gain.value = musiqueInfo.volume;
      musiqueGainNode.connect(destination);
      musiqueSourceNode = audioCtx.createBufferSource();
      musiqueSourceNode.buffer = audioBufferMusique;
      musiqueSourceNode.loop = true;
      musiqueSourceNode.connect(musiqueGainNode);
      // Démarrée juste avant recorder.start() ci-dessous, pour rester
      // synchronisée avec le tout début de l'enregistrement.
    } catch (err) {
      console.info("Musique de fond illisible, montage sans musique :", err.message);
      musiqueSourceNode = null;
    }
  }

  const canvasStream = canvas.captureStream(FPS);
  const mixedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks()
  ]);

  const fmt = choisirFormatVideoMcnt();
  const recorder = fmt.mimeType
    ? new MediaRecorder(mixedStream, { mimeType: fmt.mimeType, videoBitsPerSecond: 1_800_000 })
    : new MediaRecorder(mixedStream, { videoBitsPerSecond: 1_800_000 });

  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const enregistrementTermine = new Promise(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: fmt.conteneur }));
  });

  recorder.start();
  if (musiqueSourceNode) {
    try { musiqueSourceNode.start(); } catch (err) { console.info("Démarrage musique impossible :", err.message); }
  }

  const dureeTotale = scenesAvecVoix.reduce((acc, s) => acc + s.dureeSec, 0);
  let tempsEcoule = 0;

  for (let i = 0; i < scenesAvecVoix.length; i++) {
    const scene = scenesAvecVoix[i];
    const img = images[i];
    const dureeMs = scene.dureeSec * 1000;
    console.log(`▶️ [Montage scène ${i}] début — audioUrl présent: ${!!scene.audioUrl} — dureeMs: ${dureeMs}`);

    // Lance la lecture audio de la scène (si disponible) en parallèle du
    // rendu visuel, routée vers le flux capturé par MediaRecorder.
    // Décodage en AudioBuffer + lecture via AudioBufferSourceNode plutôt
    // que <audio>.play() : sur Chrome Android, un <audio> créé après le
    // geste utilisateur initial (donc après les await réseau de génération
    // des voix) se voit refuser play() par la politique d'autoplay, même
    // si l'AudioContext lui-même reste "running". Un AudioBufferSourceNode
    // n'est pas un HTMLMediaElement : il n'est jamais soumis à cette
    // politique, seul l'état de l'AudioContext compte (déjà débloqué au clic).
    let sourceNode = null;
    let audioDureeReelle = 0;
    if (scene.audioUrl) {
      try {
        const reponse = await fetch(scene.audioUrl);
        const arrayBuffer = await reponse.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioDureeReelle = audioBuffer.duration;
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.playbackRate.value = scene.playbackRate || 1;
        sourceNode.connect(destination);
        sourceNode.start();
        console.log(`✅ [Montage scène ${i}] AudioBufferSourceNode démarré — durée buffer: ${audioDureeReelle}`);
      } catch (e) {
        console.log(`❌ [Montage scène ${i}] décodage/lecture échoué: ${e.message}`);
        sourceNode = null;
      }
    }

    // ── SFX de scène (impact, révélation, victoire…) : détecté auto à
    // partir du contenu de la scène, joué une seule fois au début de la
    // scène, en parallèle de la voix off — sur son propre GainNode pour ne
    // pas interférer avec le volume de la musique ou de la voix. Absence
    // de mot-clé correspondant ou de fichier déposé = pas de SFX pour
    // cette scène, ce qui est normal (toutes les scènes n'en ont pas). ──
    let sfxSourceNode = null;
    const sfxInfo = await chargerSfxSceneMcnt(scene);
    if (sfxInfo) {
      try {
        const reponseSfx = await fetch(sfxInfo.dataUrl);
        const bufferSfx = await reponseSfx.arrayBuffer();
        const audioBufferSfx = await audioCtx.decodeAudioData(bufferSfx);
        const sfxGainNode = audioCtx.createGain();
        sfxGainNode.gain.value = sfxInfo.volume;
        sfxGainNode.connect(destination);
        sfxSourceNode = audioCtx.createBufferSource();
        sfxSourceNode.buffer = audioBufferSfx;
        sfxSourceNode.connect(sfxGainNode);
        sfxSourceNode.start();
      } catch (err) {
        console.info(`SFX indisponible pour la scène ${i} :`, err.message);
        sfxSourceNode = null;
      }
    }

    await animerSceneKenBurns(ctx, img, scene, W, H, dureeMs);
    console.log(`🎬 [Montage scène ${i}] Ken Burns terminé — durée audio bufferisée: ${audioDureeReelle}`);

    // Libération explicite : sans ça, chaque scène laisse un noeud audio
    // vivant en mémoire jusqu'à la fin du montage, ce qui fait déborder la
    // mémoire allouée à l'onglet sur mobile bien avant la fin d'une vidéo
    // à 4-5 scènes.
    if (sourceNode) {
      try { sourceNode.stop(); } catch (_) {}
      sourceNode.disconnect();
    }
    if (sfxSourceNode) {
      try { sfxSourceNode.stop(); } catch (_) {}
      sfxSourceNode.disconnect();
    }
    images[i] = null; // le bitmap de cette scène n'est plus utile après son passage

    tempsEcoule += scene.dureeSec;
    onProgress((tempsEcoule / dureeTotale) * 100, `Montage ${i + 1}/${scenesAvecVoix.length}…`);

    // Laisse le navigateur souffler un instant entre deux scènes (GC,
    // libération des buffers audio) avant d'attaquer la suivante.
    await new Promise(r => setTimeout(r, 60));
  }

  // Outro de marque : logo Aura Market + lien du site, ajouté
  // automatiquement à la fin de chaque vidéo générée.
  onProgress(97, "Outro de marque…");
  const logoOutro = await chargerImageMcnt(MCNT_OUTRO_LOGO_SRC).catch(() => null);
  await animerOutroMcnt(ctx, logoOutro, W, H, MCNT_OUTRO_DUREE_MS);

  if (musiqueSourceNode) {
    try { musiqueSourceNode.stop(); } catch (_) {}
    musiqueSourceNode.disconnect();
  }

  recorder.stop();
  await new Promise(r => setTimeout(r, 200)); // laisse le temps au dernier chunk d'arriver
  audioCtx.close().catch(() => {});

  return enregistrementTermine;
}

/* Charge une image et la redessine une seule fois à la taille finale du
   canvas dans un canvas hors-écran (cover, comme animerSceneKenBurns) :
   le bitmap conservé en mémoire fait alors la taille de sortie (720x1280)
   plutôt que la résolution native de l'image générée, ce qui réduit
   fortement l'empreinte mémoire du montage complet. */
async function redimensionnerImageMcnt(url, W, H) {
  const img = await chargerImageMcnt(url);
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const octx = off.getContext("2d");

  const ratio = Math.max(W / img.width, H / img.height);
  const dw = img.width * ratio, dh = img.height * ratio;
  const dx = (W - dw) / 2, dy = (H - dh) / 2;
  octx.drawImage(img, dx, dy, dw, dh);

  const bitmap = new Image();
  bitmap.src = off.toDataURL("image/jpeg", 0.85);
  await new Promise(resolve => { bitmap.onload = resolve; bitmap.onerror = resolve; });
  return bitmap;
}

/* Anime l'outro de marque en fin de vidéo pendant dureeMs : fondu d'entrée
   + léger scale du logo qui se stabilise (easing "ease-out"), puis le lien
   du site apparaît juste en dessous avec un léger slide-up décalé dans le
   temps (effet "stagger") — animation courte et punchy, adaptée au format
   des outros de réseaux sociaux (TikTok / Reels / Stories). */
function animerOutroMcnt(ctx, logoImg, W, H, dureeMs) {
  return new Promise(resolve => {
    const debut = performance.now();
    const easeOutCubic = x => 1 - Math.pow(1 - x, 3);

    // Timing interne de l'outro (proportions de dureeMs) :
    // 0 → 45% : entrée du logo (fondu + scale) puis stabilisation
    // 30% → 70% : entrée du lien (fondu + slide-up), décalée après le logo
    // reste : tenue stable à l'écran
    function frame(now) {
      const t = Math.min(1, (now - debut) / dureeMs);

      ctx.fillStyle = "#0A0A0C";
      ctx.fillRect(0, 0, W, H);

      // Logo : fondu 0→45%, scale 0.82→1.0 avec easing.
      const tLogo = Math.min(1, t / 0.45);
      const easeLogo = easeOutCubic(tLogo);
      const opaciteLogo = tLogo;
      const scaleLogo = 0.82 + 0.18 * easeLogo;

      if (logoImg) {
        const tailleBase = Math.min(W, H) * 0.32;
        const ratioLogo = logoImg.width / logoImg.height;
        const lh = tailleBase, lw = tailleBase * ratioLogo;
        const lx = (W - lw * scaleLogo) / 2;
        const ly = H * 0.42 - (lh * scaleLogo) / 2;

        ctx.save();
        ctx.globalAlpha = opaciteLogo;
        ctx.drawImage(logoImg, lx, ly, lw * scaleLogo, lh * scaleLogo);
        ctx.restore();
      }

      // Lien : fondu + slide-up, démarre à 30% et se termine à 70%.
      const tLien = Math.max(0, Math.min(1, (t - 0.30) / 0.40));
      const easeLien = easeOutCubic(tLien);
      const opaciteLien = tLien;
      const decalageLien = (1 - easeLien) * 18; // glisse depuis 18px plus bas

      if (opaciteLien > 0) {
        ctx.save();
        ctx.globalAlpha = opaciteLien;
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "700 30px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(MCNT_OUTRO_LIEN, W / 2, H * 0.62 + decalageLien);
        ctx.restore();
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/* Anime une scène pendant dureeMs : léger zoom avant continu (Ken Burns)
   sur l'image (déjà redimensionnée à la taille du canvas), sous-titres
   façon réseaux sociaux (TikTok) : le texte de la scène est découpé en
   petits groupes de mots qui s'enchaînent au centre de l'écran en rythme
   avec la durée de la scène, plutôt qu'une phrase entière figée en bas —
   plus dynamique et plus facile à lire d'un coup d'œil. */
function animerSceneKenBurns(ctx, img, scene, W, H, dureeMs) {
  return new Promise(resolve => {
    const debut = performance.now();
    const zoomDepart = 1.0, zoomFin = 1.06;
    const groupes = decouperSousTitreTiktokMcnt(scene.texte || "");

    function frame(now) {
      const t = Math.min(1, (now - debut) / dureeMs);
      const zoom = zoomDepart + (zoomFin - zoomDepart) * t;

      ctx.fillStyle = "#0A0A0C";
      ctx.fillRect(0, 0, W, H);

      if (img) {
        // L'image est déjà à la taille du canvas (cover) : seul le zoom
        // Ken Burns reste à calculer ici, plus de redimensionnement.
        const dw = W * zoom, dh = H * zoom;
        const dx = (W - dw) / 2, dy = (H - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      }

      const indexGroupe = Math.min(groupes.length - 1, Math.floor(t * groupes.length));
      dessinerSousTitreTiktokMcnt(ctx, groupes[indexGroupe], W, H);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/* Découpe le texte d'une scène en petits groupes de 2 à 4 mots, chacun
   avec un "mot clé" mis en évidence (le mot le plus long du groupe, hors
   ponctuation) — heuristique simple qui fonctionne bien pour un rendu
   karaoké sans dépendre d'une analyse linguistique complète. */
function decouperSousTitreTiktokMcnt(texte) {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return [{ mots: [], indexCle: -1 }];

  const TAILLE_GROUPE = 3;
  const groupes = [];
  for (let i = 0; i < mots.length; i += TAILLE_GROUPE) {
    const sousGroupe = mots.slice(i, i + TAILLE_GROUPE);
    let indexCle = 0;
    sousGroupe.forEach((m, idx) => {
      const propre = m.replace(/[.,!?;:"']/g, "");
      const proprePrecedent = sousGroupe[indexCle].replace(/[.,!?;:"']/g, "");
      if (propre.length > proprePrecedent.length) indexCle = idx;
    });
    groupes.push({ mots: sousGroupe, indexCle });
  }
  return groupes;
}

/* Dessine un groupe de mots façon TikTok : gros texte bold centré à
   l'écran, contour noir épais pour rester lisible sur n'importe quel
   fond, le mot clé du groupe en accent doré. */
function dessinerSousTitreTiktokMcnt(ctx, groupe, W, H) {
  if (!groupe || !groupe.mots.length) return;

  const taillePolice = 44;
  const espacement = 10;
  ctx.font = `800 ${taillePolice}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  // Largeur totale de la ligne pour centrer le bloc de mots.
  const largeurs = groupe.mots.map(m => ctx.measureText(m).width);
  const largeurTotale = largeurs.reduce((a, b) => a + b, 0) + espacement * (groupe.mots.length - 1);

  const cy = H * 0.52;
  let cx = W / 2 - largeurTotale / 2;

  groupe.mots.forEach((mot, idx) => {
    const largeurMot = largeurs[idx];
    const x = cx + largeurMot / 2;
    const estCle = idx === groupe.indexCle;

    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(mot, x, cy);

    ctx.fillStyle = estCle ? "#F5B301" : "#FFFFFF";
    ctx.fillText(mot, x, cy);

    cx += largeurMot + espacement;
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function telechargerVideo() {
  if (!_mcntVideoBlobUrl) return;
  const a = document.createElement("a");
  a.href = _mcntVideoBlobUrl;
  a.download = `aura-market-${Date.now()}.${extensionVideoMcnt(_mcntVideoBlob)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ══════════════════════════════════════════════
   LÉGENDE IA + HASHTAGS (pour publication réseaux sociaux)
══════════════════════════════════════════════ */

function afficherBlocCaptionEtPartage() {
  document.getElementById("mcnt-caption-block").style.display = "block";
  document.getElementById("mcnt-share-block").style.display = "block";
}

/* Construit le contexte envoyé à l'IA à partir : (1) le texte des scènes du
   storyboard généré (ou le script de la pub 2D), et (2) le prompt/sujet
   initial + le ton choisi par l'admin — les deux combinés donnent à l'IA
   à la fois la trame narrative complète et l'intention d'origine. */
async function genererLegendeIA(estRegeneration = false) {
  if (_mcntCaptionGenerating) return;
  _mcntCaptionGenerating = true;

  const loading = document.getElementById("mcnt-caption-loading");
  const textarea = document.getElementById("mcnt-caption-textarea");
  const regenBtn = document.getElementById("mcnt-caption-regen-btn");
  loading.style.display = "flex";
  regenBtn.disabled = true;
  regenBtn.classList.add("spinning");
  if (!estRegeneration) textarea.value = "";

  try {
    _mcntDerniereLegende = await appelerIALegende();
  } catch (err) {
    console.info("Légende IA indisponible, fallback local utilisé :", err.message);
    _mcntDerniereLegende = legendeFallback();
  } finally {
    loading.style.display = "none";
    regenBtn.disabled = false;
    regenBtn.classList.remove("spinning");
    renderLegende();
    _mcntCaptionGenerating = false;
  }
}

async function appelerIALegende() {
  const promptInitial = document.getElementById("mcnt-prompt")?.value.trim() || "";
  const ambiance = MCNT_TON_LABELS[_mcntTon] || _mcntTon;

  // Texte des scènes du storyboard (mode "histoire") OU script de la pub
  // 2D (mode "pub2d") — sert de matière narrative principale pour l'IA.
  const textesScenes = _mcntMode === "pub2d"
    ? [_mcntPub2dDernierResultat?.scriptVoix, _mcntPub2dDernierResultat?.accroche, _mcntPub2dDernierResultat?.cta].filter(Boolean)
    : (_mcntDernierResultat?.scenes || []).map(s => s.texte).filter(Boolean);

  const payload = {
    promptInitial,
    ambiance,
    scenes: textesScenes,
    plateforme: "multi" // Instagram/TikTok/Facebook/LinkedIn — l'IA adapte un texte générique efficace partout
  };

  const reponse = await API.post("/ai/contenus/legende", payload);
  const legende = typeof reponse === "string" ? JSON.parse(reponse) : reponse;

  if (!legende?.texte) throw new Error("Réponse IA invalide");

  return {
    texte: legende.texte,
    hashtags: Array.isArray(legende.hashtags) && legende.hashtags.length
      ? legende.hashtags.slice(0, 4)
      : hashtagsFallback()
  };
}

/* Légende de secours si la route IA n'est pas encore configurée côté
   Worker : construit un texte accrocheur à partir du prompt/sujet et du
   ton choisis par l'admin, avec 4 hashtags pertinents pour Aura Market
   et le marché ivoirien/africain — garantit que l'admin a toujours une
   légende utilisable, jamais un champ vide. */
function legendeFallback() {
  const prompt = document.getElementById("mcnt-prompt")?.value.trim() || "nos offres du moment";
  const accrochesParTon = {
    humoristique: `😂 On a mis en scène ${prompt} pour Aura Market… et le résultat est trop réel !`,
    emotionnel: `❤️ Une histoire qui parle à tout le monde : ${prompt}, vécu par Aura Market.`,
    dynamique: `🔥 ${prompt} — Aura Market accélère, et toi ?`,
    informatif: `ℹ️ Ce que tu dois savoir sur ${prompt} avec Aura Market.`
  };
  const texte = (accrochesParTon[_mcntTon] || `✨ ${prompt} — découvre Aura Market.`) +
    "\n\nDisponible dès maintenant sur Aura Market. Commande en quelques clics et fais-toi livrer partout en Côte d'Ivoire 🇨🇮";

  return { texte, hashtags: hashtagsFallback() };
}

function hashtagsFallback() {
  return ["#AuraMarket", "#CotedIvoire", "#Abidjan", "#ShoppingEnLigne"];
}

function renderLegende() {
  const textarea = document.getElementById("mcnt-caption-textarea");
  const hashtagsWrap = document.getElementById("mcnt-caption-hashtags");
  if (!_mcntDerniereLegende) return;

  textarea.value = _mcntDerniereLegende.texte;
  hashtagsWrap.innerHTML = _mcntDerniereLegende.hashtags
    .map(h => `<span class="mcnt-tag">${escMcnt(h.startsWith("#") ? h : "#" + h)}</span>`)
    .join("");
}

function texteLegendeComplet() {
  const texte = document.getElementById("mcnt-caption-textarea").value.trim();
  const hashtags = (_mcntDerniereLegende?.hashtags || hashtagsFallback())
    .map(h => (h.startsWith("#") ? h : "#" + h))
    .join(" ");
  return `${texte}\n\n${hashtags}`;
}

async function copierLegendeEtHashtags() {
  try {
    await navigator.clipboard.writeText(texteLegendeComplet());
    showMcntToast("Légende et hashtags copiés.", "success");
  } catch (err) {
    showMcntToast("Impossible de copier automatiquement, sélectionne le texte manuellement.", "error");
  }
}

/* ══════════════════════════════════════════════
   PARTAGE DIRECT SUR LES RÉSEAUX SOCIAUX
══════════════════════════════════════════════ */

/* Partage natif (Web Share API, niveau 2 avec fichiers) : ouvre le
   sélecteur d'apps du téléphone avec la vidéo ET la légende déjà joints.
   C'est la méthode la plus fiable sur mobile — chaque plateforme (WhatsApp,
   Facebook, TikTok, LinkedIn...) apparaît dans ce sélecteur si l'app est
   installée, sans dépendre d'un lien web spécifique à chaque réseau. */
async function partagerVideoNative() {
  if (!_mcntVideoBlob) {
    showMcntToast("Génère d'abord la vidéo.", "error");
    return;
  }

  const texte = texteLegendeComplet();
  const ext = extensionVideoMcnt(_mcntVideoBlob);
  const fichier = new File([_mcntVideoBlob], `aura-market-${Date.now()}.${ext}`, { type: _mcntVideoBlob.type || "video/mp4" });

  try {
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier], text: texte, title: "Aura Market" });
      return;
    }
    // Fallback : partage sans fichier (texte + titre seulement) si le
    // navigateur ne supporte pas le partage de fichiers.
    if (navigator.share) {
      await navigator.share({ text: texte, title: "Aura Market" });
      showMcntToast("Vidéo non jointe automatiquement : télécharge-la puis attache-la dans l'app.", "info");
      return;
    }
    throw new Error("not-supported");
  } catch (err) {
    if (err?.name === "AbortError") return; // L'admin a annulé le partage, rien à signaler
    showMcntToast("Partage direct indisponible sur ce navigateur : télécharge la vidéo puis partage-la manuellement.", "error");
  }
}

/* Partage "par réseau" : chaque plateforme a ses propres restrictions pour
   joindre un fichier vidéo via une simple URL, donc on fait au mieux pour
   chacune plutôt que de prétendre à un comportement uniforme :
   - WhatsApp / LinkedIn : ouvrent leur flux de partage avec le texte
     pré-rempli (l'admin joint la vidéo manuellement depuis sa galerie,
     après l'avoir téléchargée).
   - Facebook / TikTok : n'acceptent pas de vidéo via lien externe dans
     leur composeur mobile ; on déclenche donc le partage natif (qui inclut
     déjà ces apps si installées) plutôt qu'un lien qui échouerait. */
function partagerVersReseau(reseau) {
  const texte = texteLegendeComplet();

  if (reseau === "whatsapp") {
    if (!_mcntVideoBlob) { showMcntToast("Génère d'abord la vidéo.", "error"); return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank");
    showMcntToast("WhatsApp ouvert avec ta légende. Joins la vidéo depuis ta galerie (télécharge-la si ce n'est pas déjà fait).", "info");
    return;
  }

  if (reseau === "linkedin") {
    if (!_mcntVideoBlob) { showMcntToast("Génère d'abord la vidéo.", "error"); return; }
    window.open("https://www.linkedin.com/feed/?shareActive=true", "_blank");
    showMcntToast("LinkedIn ouvert. Colle ta légende (copiée) et joins la vidéo depuis ta galerie.", "info");
    copierLegendeEtHashtags();
    return;
  }

  if (reseau === "facebook" || reseau === "tiktok") {
    showMcntToast(`${reseau === "facebook" ? "Facebook" : "TikTok"} n'accepte pas la vidéo automatiquement via ce bouton : le sélecteur de partage va s'ouvrir, choisis l'app si elle apparaît.`, "info");
    partagerVideoNative();
    return;
  }
}

async function uploaderVideoMcnt(blob) {
  const token = AURA_AUTH.getAccessToken();
  const ext = extensionVideoMcnt(blob);
  const contentType = blob.type || (ext === "mp4" ? "video/mp4" : "video/webm");
  const path = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const res = await fetch(`${AURA_CONFIG.WORKER_URL}/storage/object/${MCNT_VIDEO_BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType, Authorization: `Bearer ${token}` },
    body: blob
  });

  if (!res.ok) throw new Error("Échec de l'upload de la vidéo");
  return `${AURA_CONFIG.WORKER_URL}/storage/object/public/${MCNT_VIDEO_BUCKET}/${path}`;
}

/* ══════════════════════════════════════════════
   Historique (Supabase)
══════════════════════════════════════════════ */
async function sauvegarderHistorique(payload) {
  try {
    await API.post(AURA_CONFIG.endpoints.contenus_histoires || AURA_CONFIG.endpoints.contenus_marketing, payload);
  } catch (err) {
    console.error("Sauvegarde historique impossible :", err.message);
  }
}

async function chargerHistorique() {
  const list = document.getElementById("mcnt-list");
  const endpoint = AURA_CONFIG.endpoints.contenus_histoires || AURA_CONFIG.endpoints.contenus_marketing;

  if (!endpoint) {
    list.innerHTML = `<div class="mcnt-empty">Historique indisponible.</div>`;
    return;
  }

  try {
    const rows = await API.get(endpoint + "?order=created_at.desc&limit=50");
    _mcntItems = Array.isArray(rows) ? rows : [];

    if (_mcntItems.length === 0) {
      list.innerHTML = `<div class="mcnt-empty" id="mcnt-empty">Aucune histoire générée pour l'instant.</div>`;
      return;
    }

    list.innerHTML = _mcntItems.map(renderMcntItem).join("");
  } catch (err) {
    list.innerHTML = `<div class="mcnt-empty" style="border-color:var(--danger);color:var(--danger);">Erreur : ${escMcnt(err.message)}</div>`;
  }
}

function renderMcntItem(item) {
  const premiereScene = Array.isArray(item.scenes) && item.scenes[0] ? item.scenes[0] : null;
  const thumb = premiereScene?.imageUrl
    ? `<img src="${escMcnt(premiereScene.imageUrl)}" alt="">`
    : `<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M4 15l4-4 4 4 4-6 4 6"/></svg>`;

  const nbScenes = Array.isArray(item.scenes) ? item.scenes.length : 0;
  const persoTags = (item.personnages || []).map(pid => {
    const p = MCNT_PERSONNAGES.find(x => x.id === pid);
    return p ? `<span class="mcnt-tag">${escMcnt(p.nom)}</span>` : "";
  }).join("");

  return `
    <div class="mcnt-item" data-id="${item.id}">
      <div class="mcnt-item-thumb">${thumb}</div>
      <div class="mcnt-item-info">
        <div class="mcnt-item-titre">${escMcnt(item.titre || "Histoire Aura Market")}</div>
        <div class="mcnt-item-corps">${escMcnt(premiereScene?.texte || "")}</div>
        <div class="mcnt-item-meta">
          <span class="mcnt-tag gold">${nbScenes} scène${nbScenes > 1 ? "s" : ""}</span>
          ${persoTags}
          <span class="mcnt-tag">${formatMcntDate(item.created_at)}</span>
        </div>
      </div>
      <div class="mcnt-item-actions">
        <button class="mcnt-item-delete" onclick="event.stopPropagation(); supprimerMcntItem('${item.id}')" title="Supprimer">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h10l1-13"/></svg>
        </button>
      </div>
    </div>`;
}

async function supprimerMcntItem(id) {
  if (!confirm("Supprimer cette histoire de l'historique ?")) return;
  try {
    const endpoint = AURA_CONFIG.endpoints.contenus_histoires || AURA_CONFIG.endpoints.contenus_marketing;
    await API.delete(endpoint + "?id=eq." + id);
    showMcntToast("Histoire supprimée.", "success");
    chargerHistorique();
  } catch (err) {
    showMcntToast("Erreur : " + err.message, "error");
  }
}

/* ══════════════════════════════════════════════
   Utilitaires
══════════════════════════════════════════════ */
function formatMcntDate(iso) {
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

let _mcntToastTimer = null;
function showMcntToast(message, type = "info") {
  const toast = document.getElementById("mcnt-toast");
  toast.textContent = message;
  toast.className = "mcnt-toast show" + (type === "error" ? " error" : type === "success" ? " success" : "");
  clearTimeout(_mcntToastTimer);
  _mcntToastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function escMcnt(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
