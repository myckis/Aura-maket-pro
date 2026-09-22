/**
 * AURA MARKET — Logo "Aa" 3D (topbar mobile)
 * Fichier : assets/js/logo3d.js
 * Monogramme "Aa" extrudé en relief, rendu via Three.js (CDN).
 * Dégradé violet (A) → orange (a), repris de l'identité Aura Market.
 * Statique au repos (éclairage 3D fixe), rotation douce au survol/toucher.
 * Se dégrade silencieusement (fond CSS dégradé déjà présent en fallback)
 * si Three.js ou WebGL ne sont pas disponibles.
 */

"use strict";

(function initLogo3D() {
  const canvas = document.getElementById("logo3d");
  if (!canvas || typeof THREE === "undefined") return;

  const host = canvas.closest(".brand-logo-3d") || canvas.parentElement;

  let renderer, scene, camera, letterGroup;
  let frameId = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let active = false;
  let rotY = 0, rotX = 0;
  let targetRotY = 0, targetRotX = 0;

  function buildAShape() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.50, -0.62);
    shape.lineTo(-0.16, 0.62);
    shape.lineTo(0.16, 0.62);
    shape.lineTo(0.50, -0.62);
    shape.lineTo(0.27, -0.62);
    shape.lineTo(0.165, -0.30);
    shape.lineTo(-0.165, -0.30);
    shape.lineTo(-0.27, -0.62);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-0.105, -0.06);
    hole.lineTo(0, 0.34);
    hole.lineTo(0.105, -0.06);
    hole.closePath();
    shape.holes.push(hole);

    return shape;
  }

  function buildLowerAShape() {
    const shape = new THREE.Shape();
    shape.moveTo(0.62, 0);
    shape.bezierCurveTo(0.62, 0.50, 0.30, 0.78, -0.10, 0.78);
    shape.bezierCurveTo(-0.45, 0.78, -0.68, 0.56, -0.68, 0.22);
    shape.bezierCurveTo(-0.68, -0.14, -0.40, -0.34, -0.02, -0.34);
    shape.bezierCurveTo(0.18, -0.34, 0.36, -0.26, 0.46, -0.14);
    shape.lineTo(0.46, -0.32);
    shape.lineTo(0.66, -0.32);
    shape.lineTo(0.66, 0.74);
    shape.lineTo(0.46, 0.74);
    shape.lineTo(0.46, 0.50);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(0.46, 0.14);
    hole.bezierCurveTo(0.36, -0.02, 0.18, -0.14, -0.04, -0.14);
    hole.bezierCurveTo(-0.30, -0.14, -0.46, 0.02, -0.46, 0.24);
    hole.bezierCurveTo(-0.46, 0.44, -0.28, 0.58, -0.04, 0.58);
    hole.bezierCurveTo(0.22, 0.58, 0.46, 0.42, 0.46, 0.16);
    hole.closePath();
    shape.holes.push(hole);

    return shape;
  }

  function makeLetterMesh(shape, offsetX, offsetY, scaleAmt, colorHex) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.04,
      bevelSegments: 3,
      curveSegments: 8,
    });
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.35,
      metalness: 0.18,
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 0.12,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(scaleAmt);
    mesh.position.set(offsetX, offsetY, 0);
    return mesh;
  }

  function setup() {
    const w = canvas.clientWidth || 32;
    const h = canvas.clientHeight || 32;

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(1.4, 1.8, 2.4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffd9a0, 0.8);
    rimLight.position.set(-1.6, -1.2, 1.6);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    letterGroup = new THREE.Group();
    const bigA = makeLetterMesh(buildAShape(), -0.44, 0, 0.85, 0x7c3aed);
    const smallA = makeLetterMesh(buildLowerAShape(), 0.40, -0.62, 0.56, 0xf2780c);
    letterGroup.add(bigA, smallA);
    letterGroup.scale.setScalar(1.05);
    scene.add(letterGroup);

    animate();
    window.addEventListener("resize", onResize);
    bindInteraction();
  }

  function onResize() {
    const w = canvas.clientWidth || 32;
    const h = canvas.clientHeight || 32;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function bindInteraction() {
    if (!host) return;
    const onEnter = () => { active = true; targetRotY = 0.55; targetRotX = -0.12; };
    const onLeave = () => { active = false; targetRotY = 0; targetRotX = 0; };
    host.addEventListener("mouseenter", onEnter);
    host.addEventListener("mouseleave", onLeave);
    host.addEventListener("touchstart", onEnter, { passive: true });
    host.addEventListener("touchend", onLeave);
    host.addEventListener("touchcancel", onLeave);
  }

  function animate() {
    frameId = requestAnimationFrame(animate);
    if (!reduceMotion) {
      rotY += (targetRotY - rotY) * 0.12;
      rotX += (targetRotX - rotX) * 0.12;
      letterGroup.rotation.y = rotY;
      letterGroup.rotation.x = rotX;
    } else {
      letterGroup.rotation.y = active ? targetRotY : 0;
    }
    renderer.render(scene, camera);
  }

  function checkVisibilityAndInit() {
    const wrap = document.getElementById("logo3dWrap");
    if (!wrap) return;
    const isVisible = getComputedStyle(wrap).display !== "none";
    if (isVisible && !renderer) {
      setup();
    } else if (!isVisible && frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
      renderer = null;
    } else if (isVisible && renderer) {
      onResize();
    }
  }

  window.addEventListener("resize", checkVisibilityAndInit);
  checkVisibilityAndInit();
})();
