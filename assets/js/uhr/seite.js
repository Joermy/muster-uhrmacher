import * as THREE from "../vendor/three.module.min.js";
import Lenis from "../vendor/lenis.min.js";
import { uhrStarten } from "./haupt.js";
import { regieBauen, fenster } from "./regie.js";
import { zeitwaageBauen } from "./zeitwaage.js";

const wurzel = document.documentElement;
const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const feinZeiger = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const url = new URLSearchParams(location.search);
const klemm = (x, a = 0, b = 1) => Math.min(Math.max(x, a), b);

const canvas = document.querySelector(".buehne__canvas");
const lader = document.querySelector(".lader");
const laderZahl = document.querySelector(".lader__zahl");
const revision = document.querySelector(".revision");
const kapitel = Array.from(document.querySelectorAll(".kapitel__eintrag"));
const hinweise = Array.from(document.querySelectorAll(".beschriftung"));
const fortschrittLeiste = document.querySelector(".revision__leiste");
const zeitlupe = document.querySelector(".zeitlupe");
const schluss = document.querySelector(".revision__schluss");
const titel = document.querySelector(".revision__kopf");
const held = document.querySelector(".held");

// ------------------------------------------------------------ Lader

let anzeige = 0;
let ziel = 0;
function laden(f) {
  ziel = Math.max(ziel, f);
}
let laderLaeuft = !!lader;
(function zaehlen() {
  if (!laderLaeuft) return;
  anzeige += (ziel - anzeige) * 0.12;
  if (lader) lader.style.setProperty("--fortschritt", anzeige.toFixed(4));
  if (laderZahl) laderZahl.textContent = String(Math.round(anzeige * 100)).padStart(3, "0");
  requestAnimationFrame(zaehlen);
})();

function laderSchliessen() {
  if (!lader) return;
  laden(1);
  setTimeout(() => {
    laderLaeuft = false;
    if (laderZahl) laderZahl.textContent = "100";
    lader.style.setProperty("--fortschritt", "1");
    lader.setAttribute("data-fertig", "");
    wurzel.classList.add("ist-geladen");
    setTimeout(() => lader.remove(), 1400);
  }, reduziert ? 0 : 380);
}

// Sicherheitsnetz: nach 9 s den Lader schliessen und das Standbild zeigen,
// die 3D-Uhr laedt im Hintergrund weiter und loest es ab.
const notbremse = setTimeout(() => {
  wurzel.classList.add("uhr-still");
  laderSchliessen();
}, 9000);
const pruefModus = url.has("pruefen");
let auftrag = 0;
let erledigt = 0;

// ------------------------------------------------------------ Scroll

let lenis = null;
if (!reduziert) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true, anchors: { offset: -40 }, autoRaf: false });
  wurzel.classList.add("lenis-an");
}

function fortschritt() {
  const y = window.scrollY;
  const vh = window.innerHeight || 1;
  if (!revision) return -1 + klemm(y / vh);
  const oben = revision.offsetTop;
  const strecke = Math.max(revision.offsetHeight - vh, 1);
  if (y < oben) return -1 + klemm(y / Math.max(oben, 1));
  return klemm((y - oben) / strecke);
}

// ------------------------------------------------------------ Overlays

function overlays(p) {
  wurzel.style.setProperty("--p", p.toFixed(4));
  if (titel) {
    const t = fenster(p, -0.12, 0.09, 0.05);
    titel.style.opacity = t.toFixed(3);
    titel.style.transform = `translate3d(0, ${((1 - t) * (p < 0 ? 30 : -30)).toFixed(1)}px, 0)`;
  }
  kapitel.forEach((k) => {
    const a = Number(k.dataset.ab);
    const b = Number(k.dataset.bis);
    const t = fenster(p, a, b, 0.03);
    k.style.setProperty("--sicht", t.toFixed(3));
    k.style.visibility = t > 0.002 ? "visible" : "hidden";
    k.classList.toggle("ist-aktiv", t > 0.5);
  });
  if (schluss) {
    const t = fenster(p, 0.95, 1.2, 0.03);
    schluss.style.setProperty("--sicht", t.toFixed(3));
  }
  if (fortschrittLeiste) {
    const t = klemm((p - 0.08) / 0.88);
    fortschrittLeiste.style.setProperty("--lauf", t.toFixed(4));
    fortschrittLeiste.style.opacity = fenster(p, 0.06, 0.97, 0.03).toFixed(3);
  }
}

// ------------------------------------------------------------ Start

async function start() {
  if (!canvas || !window.WebGLRenderingContext) throw new Error("kein WebGL");
  const u = await uhrStarten({ canvas, fortschritt: laden, schrift: "Geist" });
  const { b, kamera, szene, lage, teile, werk, zerleger, studio, renderer } = u;
  const regie = regieBauen({ kamera, lage, teile });
  regie.seitenverhaeltnis(kamera.aspect);
  const waage = zeitwaageBauen(document.querySelector(".zeitwaage"));

  // Oeler und Oeltropfen am Lagerstein
  const anker = regie.anker.Chaton;
  const oeler = new THREE.Group();
  const stahl = new THREE.MeshPhysicalMaterial({ color: 0xd8d9dd, metalness: 1, roughness: 0.1 });
  const nadel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.22, 6, 24, 1, false), stahl);
  nadel.position.y = -3;
  const griff = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 14, 32), new THREE.MeshPhysicalMaterial({ color: 0x1b1d22, metalness: 0.2, roughness: 0.35, clearcoat: 1 }));
  griff.position.y = -13;
  const arm = new THREE.Group();
  arm.add(nadel, griff);
  // schraeg von oben links, damit die Nadel im Bild als Linie erscheint
  arm.rotation.set(0.0, 0, -0.85);
  oeler.add(arm);
  const tropfen = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 32, 16),
    new THREE.MeshPhysicalMaterial({ color: 0xffe9b0, metalness: 0, roughness: 0.02, transmission: 0.9, thickness: 0.2, ior: 1.47, clearcoat: 1, specularIntensity: 1 })
  );
  tropfen.scale.set(1, 0.42, 1);
  if (anker) {
    anker.add(oeler);
    anker.add(tropfen);
    tropfen.position.y = -0.18;
  }

  // Ziehen dreht die Uhr, losgelassen federt sie zurueck
  const dreh = { x: 0, y: 0, vx: 0, vy: 0, zieht: false, sx: 0, sy: 0, maus: { x: 0, y: 0 } };
  if (held) {
    held.addEventListener("pointerdown", (e) => {
      if (e.target.closest("a, button")) return;
      dreh.zieht = true;
      dreh.sx = e.clientX;
      dreh.sy = e.clientY;
      dreh.x0 = dreh.x;
      dreh.y0 = dreh.y;
    });
    window.addEventListener("pointermove", (e) => {
      dreh.maus.x = e.clientX / window.innerWidth - 0.5;
      dreh.maus.y = e.clientY / window.innerHeight - 0.5;
      if (!dreh.zieht) return;
      const dx = (e.clientX - dreh.sx) / window.innerWidth;
      const dy = (e.clientY - dreh.sy) / window.innerHeight;
      dreh.y = dreh.y0 + dx * 4.2;
      dreh.x = dreh.x0 + (e.pointerType === "touch" ? 0 : dy * 1.6);
    });
    const los = () => (dreh.zieht = false);
    window.addEventListener("pointerup", los);
    window.addEventListener("pointercancel", los);
  }

  // Groesse
  const groesse = () => {
    if (b.groesse()) {
      regie.seitenverhaeltnis(kamera.aspect);
    }
  };
  window.addEventListener("resize", groesse, { passive: true });

  // Kontextverlust (Mobilgeraete bei Speicherknappheit)
  let verloren = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    verloren = true;
    wurzel.classList.add("uhr-still");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    verloren = false;
    wurzel.classList.remove("uhr-still");
    b.groesse(true);
    requestAnimationFrame(schleife);
  });

  // Leistungswaechter: faellt die Bildrate, wird stufenweise vereinfacht
  let messung = [];
  let wartezeit = 2.5;
  function waechter(dt) {
    if (url.has("fest")) return;
    wartezeit -= dt;
    if (wartezeit > 0) return;
    messung.push(dt);
    if (messung.length < 60) return;
    const mittel = messung.reduce((a, c) => a + c, 0) / messung.length;
    messung = [];
    if (mittel > 1 / 42) {
      if (b.schaerfe.enabled || u.dofErlaubt) {
        u.dofErlaubt = false;
        b.schaerfe.enabled = false;
      } else if (b.dichteSenken()) {
        /* weiter beobachten */
      } else if (b.bloom.enabled) {
        b.bloom.enabled = false;
      } else if (renderer.shadowMap.enabled) {
        renderer.shadowMap.enabled = false;
        szene.traverse((o) => o.material && (o.material.needsUpdate = true));
      }
      wartezeit = 1.5;
    }
  }
  u.dofErlaubt = u.stufe >= 3;

  // Intro
  let intro = reduziert ? 1 : 0;
  const introStart = performance.now() + 250;

  let letzte = performance.now();
  let laufzeit = 0;
  let sichtbar = true;

  function schleife(jetzt) {
    if (verloren) return;
    requestAnimationFrame(schleife);
    if (pruefModus) {
      if (auftrag === erledigt) return;
      regie.springen();
      intro = 1;
      letzte = jetzt - 50;
    }
    const dt = Math.min((jetzt - letzte) / 1000, 0.1);
    letzte = jetzt;
    if (lenis) lenis.raf(jetzt);
    laufzeit += dt;

    const p = fortschritt();
    overlays(p);
    if (revision) {
      const r = revision.getBoundingClientRect();
      sichtbar = r.bottom > -40;
      wurzel.classList.toggle("uhr-verdeckt", !sichtbar);
    }
    if (!sichtbar || document.hidden) return;
    waechter(dt);

    if (!reduziert && intro < 1) intro = klemm((jetzt - introStart) / 2400);
    const io = 1 - Math.pow(1 - intro, 3);

    // Zug zurueckfedern
    if (!dreh.zieht) {
      dreh.x += (0 - dreh.x) * (1 - Math.exp(-dt * 3));
      dreh.y += (0 - dreh.y) * (1 - Math.exp(-dt * 3));
    }
    const imHeld = klemm(-p);
    const sanft = reduziert ? 0 : 1;
    const zusatzDreh = {
      x: dreh.x + (feinZeiger ? dreh.maus.y * 0.12 * imHeld : 0) + sanft * Math.sin(laufzeit * 0.4) * 0.025 * imHeld,
      y: dreh.y + (feinZeiger ? dreh.maus.x * 0.22 * imHeld : 0) + sanft * Math.sin(laufzeit * 0.27) * 0.06 * imHeld - (1 - io) * 0.9,
    };
    const z = regie.schritt(p, reduziert ? 1 : dt, {
      dreh: zusatzDreh,
      vorZiel: (ist) => zerleger.setzen(ist.zer, { bandWeg: ist.band, bodenWeg: ist.boden, ablage: ist.abl }),
    });

    // Bildausschnitt verschieben (Uhr seitlich neben den Text)
    const W = b.breite;
    const H = b.hoehe;
    kamera.setViewOffset(W, H, -z.vx * W, -z.vy * H, W, H);
    if (io < 1) {
      kamera.position.sub(z.ziel).multiplyScalar(1 + (1 - io) * 0.35).add(z.ziel);
    }

    // Werk, Zerlegen, Licht
    for (const n of ["Band_oben", "Band_unten"]) {
      const t = teile[n];
      if (t) t.visible = z.band < 0.98;
    }
    werk.amplitude = THREE.MathUtils.degToRad(226 + (296 - 226) * klemm((p - 0.83) / 0.09));
    werk.schritt(dt, z.lupe, true);

    const glanz = reduziert ? 0 : z.glanz;
    szene.environmentRotation.y = -0.35 + glanz * Math.sin(laufzeit * 0.32) * 0.55 + p * 0.9 - (1 - io) * 1.6;
    renderer.toneMappingExposure = 0.15 + 0.85 * io;
    studio.sonne.position.set(-28, 70, 46);
    studio.sonne.target.position.copy(z.ziel);
    b.abschluss.uniforms.hofStaerke.value = 0.45 * io;
    const ziel2 = z.ziel.clone().project(kamera);
    b.abschluss.uniforms.hof.value.set(ziel2.x * 0.5 + 0.5, ziel2.y * 0.5 + 0.5);

    // Tiefenschaerfe in den Nahaufnahmen
    const dof = u.dofErlaubt ? z.dof : 0;
    b.schaerfe.enabled = dof > 0.02;
    if (b.schaerfe.enabled) {
      b.schaerfe.uniforms.focus.value = z.abstand;
      b.schaerfe.uniforms.aperture.value = 0.0005 * dof;
      b.schaerfe.uniforms.maxblur.value = 0.011 * dof;
    }

    // Oeler: senkt sich, setzt den Tropfen, hebt ab
    const oel = klemm((p - 0.665) / 0.11);
    const runter = Math.sin(klemm(oel / 0.7) * Math.PI);
    oeler.visible = oel > 0 && oel < 0.98 && z.zer < 0.05;
    oeler.position.set(-(1 - runter) * 4.5, -0.25 - (1 - runter) * 4.5, 0);
    const tr = klemm((oel - 0.32) / 0.2);
    tropfen.visible = tr > 0 && p < 0.95;
    tropfen.scale.set(tr, tr * 0.42, tr);

    // Beschriftungen an die Ankerpunkte
    const v = new THREE.Vector3();
    for (const h of hinweise) {
      const a = regie.anker[h.dataset.anker];
      const t = fenster(p, Number(h.dataset.ab), Number(h.dataset.bis), 0.025);
      if (!a || t <= 0.001) {
        h.style.opacity = "0";
        continue;
      }
      a.getWorldPosition(v).project(kamera);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      h.style.opacity = t.toFixed(3);
      h.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
    if (zeitlupe) zeitlupe.style.opacity = (z.lupe < 0.9 ? fenster(p, 0.47, 0.8, 0.03) : 0).toFixed(3);
    if (waage) waage.zeichnen(werk.zeit, klemm((p - 0.83) / 0.09), fenster(p, 0.8, 0.95, 0.03) > 0.01);

    b.zeichnen(laufzeit);
    if (pruefModus) erledigt = auftrag;
  }

  b.groesse(true);
  regie.seitenverhaeltnis(kamera.aspect);
  clearTimeout(notbremse);
  wurzel.classList.remove("uhr-still");
  wurzel.classList.add("uhr-laeuft");
  if (pruefModus) {
    window.__bild = (y) => {
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      window.scrollTo(0, y);
      auftrag++;
      return auftrag;
    };
    window.__fertig = () => erledigt === auftrag;
  }
  requestAnimationFrame((t) => {
    letzte = t;
    schleife(t);
    laderSchliessen();
  });
  window.__uhr = { u, regie };
}

start().catch((fehler) => {
  // Ohne WebGL bleibt das gerenderte Standbild stehen
  wurzel.classList.add("uhr-still");
  clearTimeout(notbremse);
  laderSchliessen();
  if (url.has("debug")) console.error(fehler);
  window.__fehler = String((fehler && fehler.stack) || fehler);
  // Overlays trotzdem am Scroll halten
  const lauf = () => {
    overlays(fortschritt());
    requestAnimationFrame(lauf);
  };
  if (lenis) {
    const r = (t) => {
      lenis.raf(t);
      requestAnimationFrame(r);
    };
    requestAnimationFrame(r);
  }
  requestAnimationFrame(lauf);
});
