import * as THREE from "../vendor/three.module.min.js";

// Kamerafuehrung ueber die ganze Seite.
//   p = -1 .. 0  Startbild (Scroll durch den Kopfbereich)
//   p =  0 .. 1  Revision (lange Scroll-Strecke mit fuenf Kapiteln)
// Jede Station legt Lage der Uhr, Kamera und Zustand des Werks fest; dazwischen
// wird weich interpoliert, danach mit einer Feder gedaempft nachgefuehrt.

const TAU = Math.PI * 2;
const klemm = (x, a = 0, b = 1) => Math.min(Math.max(x, a), b);
const weich = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const fenster = (p, a, b, rampe = 0.035) =>
  klemm((p - a) / rampe) * (1 - klemm((p - (b - rampe)) / rampe));

// Blender-Koordinaten (mm) -> Modellraum (glTF, Y oben)
export const modellPunkt = (x, y, z) => new THREE.Vector3(x, z, -y);

export const ANKER = {
  // Name: [Teil, x, y, z] in Blender-Koordinaten
  Ankerrad: ["Ankerrad", -4.25, -10.4, -2.0],
  Anker: ["Anker", -6.85, -9.15, -2.0],
  Unruh: ["Unruh", -9.25, -6.0, -2.6],
  Unruhrand: ["Unruh", -9.25 + 3.0, -6.0 + 3.0, -2.5],
  Spirale: ["Spirale", -9.25 - 1.6, -6.0 - 1.4, -2.05],
  Chaton: ["Dreiviertelplatine", -5.1, -1.6, -3.1],
  Federhaus: ["Sperrrad", 0.6, 6.4, -3.1],
  Raeder: ["Rad_mitte", 0, 0, -1.5],
  Rad_dritt: ["Rad_dritt", -5.1 + 2.6, -1.6 - 2.4, -1.05],
  Platte: ["Dreiviertelplatine", 6.5, -4.5, -2.85],
  Kloben: ["Unruhkloben", -11.2, -8.4, -3.55],
  Zifferblatt: ["Zifferblatt", 0, 0, 1.0],
  Mitte: ["Gehaeuse", 0, 0, 0],
  Ablage: ["Gehaeuse", -48 - 1.5, 0, -47],
  AnkerAblage: ["Ankerrad", -4.25 + 2.6, -10.4 - 0.6, -2.0],
  Fh: ["Federhaus", 0.6 - 3.0, 6.4 + 3.6, -1.95],
  Minutenrad: ["Rad_mitte", 3.4, 3.4, -1.45],
  Sekundenrad: ["Rad_viert", 0 - 2.4, -8.15 - 2.4, -1.75],
  Kleinboden: ["Rad_dritt", -5.1 + 2.8, -1.6 + 2.6, -1.05],
};

function stationen(hoch) {
  // hoch: Hochformat (Telefon). vx/vy = Verschiebung des Bildmittelpunkts in Bildbreiten/-hoehen
  const s = (o) => Object.assign({ fov: 24, groesse: 46, vx: 0, vy: 0, rx: -0.28, ry: 0, rz: 0, az: 0, el: 0, zer: 0, band: 0, boden: 0, abl: 0, glanz: 0, dof: 0, lupe: 1, ziel: "Mitte" }, o);
  const v = hoch ? 0 : 1;
  const unten = hoch ? -0.13 : 0;
  const B = { band: 1, boden: 1 };
  return [
    s({ p: -1, rx: -0.42, ry: 0.42, rz: 0.1, groesse: hoch ? 62 : 66, vx: 0.2 * v, vy: hoch ? 0.25 : 0.02, glanz: 1 }),
    s({ p: -0.45, rx: -0.3, ry: 0.22, rz: 0.06, groesse: hoch ? 72 : 66, vx: 0.08 * v, vy: hoch ? 0.12 : 0.06, glanz: 0.6 }),
    s({ p: 0.0, rx: -0.12, ry: 0, rz: 0, groesse: hoch ? 78 : 78, vy: hoch ? 0.16 : 0.17 }),
    s({ p: 0.06, rx: -0.2, ry: Math.PI * 0.98, rz: 0.04, groesse: hoch ? 56 : 54, band: 1, vy: hoch ? 0.0 : 0.02 }),
    // 01 Oeffnen: Boden abschrauben, Werk liegt frei
    s({ p: 0.15, rx: -0.36, ry: Math.PI + 0.3, rz: -0.06, ...B, groesse: hoch ? 52 : 50, vx: 0.2 * v, vy: unten }),
    s({ p: 0.24, rx: -0.5, ry: Math.PI + 0.42, rz: -0.1, ...B, groesse: hoch ? 50 : 46, vx: 0.18 * v, vy: unten }),
    // 02 Reinigen: alles zerlegt, schraeg von der Seite
    s({ p: 0.34, rx: -1.12, ry: Math.PI + 0.62, rz: -0.22, zer: 1, ...B, groesse: hoch ? 96 : 86, vx: -0.17 * v, vy: unten, el: 0.05 }),
    s({ p: 0.43, rx: -1.0, ry: Math.PI + 0.95, rz: -0.18, zer: 1, ...B, groesse: hoch ? 94 : 84, vx: -0.17 * v, vy: unten }),
    // 03 Pruefen: die Raeder liegen nebeneinander auf der Ablage
    s({ p: 0.51, rx: -0.12, ry: Math.PI + 0.06, rz: 0, zer: 1, ...B, abl: 1, groesse: hoch ? 44 : 54, ziel: "Ablage", vx: 0.16 * v, vy: unten, dof: 0.6, lupe: 0.12 }),
    s({ p: 0.59, rx: -0.3, ry: Math.PI - 0.12, rz: 0.04, zer: 1, ...B, abl: 1, groesse: hoch ? 22 : 17, ziel: "AnkerAblage", vx: 0.17 * v, vy: unten, dof: 1, lupe: 0.12 }),
    // 04 Oelen: Werk wieder zusammen, Blick auf einen Lagerstein
    s({ p: 0.67, rx: -0.42, ry: Math.PI + 0.22, rz: -0.04, ...B, groesse: hoch ? 15 : 12, ziel: "Chaton", vx: -0.17 * v, vy: unten, dof: 1, lupe: 0.5 }),
    s({ p: 0.75, rx: -0.38, ry: Math.PI + 0.12, rz: -0.02, ...B, groesse: hoch ? 14 : 11, ziel: "Chaton", vx: -0.17 * v, vy: unten, dof: 1, lupe: 0.5 }),
    // 05 Regulieren: Unruh in Nahaufnahme
    s({ p: 0.83, rx: -0.4, ry: Math.PI - 0.2, rz: 0.04, ...B, groesse: hoch ? 20 : 16, ziel: "Unruh", vx: 0.17 * v, vy: unten, dof: 1 }),
    s({ p: 0.91, rx: -0.34, ry: Math.PI - 0.32, rz: 0.06, ...B, groesse: hoch ? 22 : 18, ziel: "Unruh", vx: 0.17 * v, vy: unten, dof: 1 }),
    // fertig: zusammenbauen und zurueck aufs Zifferblatt
    s({ p: 0.975, rx: -0.3, ry: TAU, rz: 0, groesse: hoch ? 74 : 76, vy: hoch ? 0.14 : 0.17 }),
    s({ p: 1.0, rx: -0.32, ry: TAU + 0.06, rz: 0, groesse: hoch ? 74 : 76, vy: hoch ? 0.14 : 0.17 }),
  ];
}

const ZAHLEN = ["fov", "groesse", "vx", "vy", "rx", "ry", "rz", "az", "el", "zer", "band", "boden", "abl", "glanz", "dof", "lupe"];

export function regieBauen({ kamera, lage, teile }) {
  // Ankerpunkte an die Teile haengen, damit Ziele und Beschriftungen mitwandern
  const anker = {};
  for (const [n, [teil, x, y, z]] of Object.entries(ANKER)) {
    const t = teile[teil];
    if (!t) continue;
    const o = new THREE.Object3D();
    o.position.copy(modellPunkt(x, y, z)).sub(t.userData.basis.p);
    t.add(o);
    anker[n] = o;
  }

  let liste = stationen(false);
  let hoch = false;
  const ist = {};
  const zielIst = new THREE.Vector3();
  let erstes = true;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function zielWelt(name, aus) {
    const a = anker[name] || anker.Mitte;
    return a.getWorldPosition(aus);
  }

  function interpolieren(p) {
    let i = 0;
    while (i < liste.length - 2 && p > liste[i + 1].p) i++;
    const a = liste[i];
    const b = liste[i + 1];
    const t = weich(klemm((p - a.p) / Math.max(b.p - a.p, 1e-6)));
    const z = { a, b, t };
    for (const k of ZAHLEN) z[k] = a[k] + (b[k] - a[k]) * t;
    return z;
  }

  return {
    anker,
    seitenverhaeltnis(asp) {
      const neu = asp < 0.82;
      if (neu !== hoch || erstes) {
        hoch = neu;
        liste = stationen(hoch);
      }
    },
    // p: Gesamtfortschritt, dt: Sekunden; gibt den aktuellen Sollzustand zurueck
    schritt(p, dt, zusatz = {}) {
      const z = interpolieren(p);
      const k = erstes ? 1 : 1 - Math.exp(-dt * 7.5);
      for (const n of ZAHLEN) ist[n] = erstes ? z[n] : ist[n] + (z[n] - ist[n]) * k;

      // Lage der Uhr (vor dem Ziel, damit die Anker stimmen)
      const dreh = zusatz.dreh || { x: 0, y: 0 };
      lage.rotation.set(ist.rx + dreh.x, ist.ry + dreh.y, ist.rz, "YXZ");
      // Teile zuerst bewegen, dann die Ankerpunkte lesen
      if (zusatz.vorZiel) zusatz.vorZiel(ist);
      lage.updateMatrixWorld(true);

      // Ziel: zwischen den Ankerpunkten der beiden Stationen
      zielWelt(z.a.ziel, tmpA);
      zielWelt(z.b.ziel, tmpB);
      tmpA.lerp(tmpB, z.t);
      if (erstes) zielIst.copy(tmpA);
      else zielIst.lerp(tmpA, 1 - Math.exp(-dt * 6));

      // Abstand so, dass `groesse` mm die kurze Bildseite fuellen
      const vfov = THREE.MathUtils.degToRad(ist.fov);
      const asp = kamera.aspect;
      const halb = Math.tan(vfov / 2) * Math.min(1, asp);
      const abstand = (ist.groesse / 2) / Math.max(halb, 1e-3);
      const el = ist.el;
      const az = ist.az;
      kamera.fov = ist.fov;
      kamera.position.set(
        zielIst.x + abstand * Math.sin(az) * Math.cos(el),
        zielIst.y + abstand * Math.sin(el),
        zielIst.z + abstand * Math.cos(az) * Math.cos(el)
      );
      kamera.lookAt(zielIst);
      kamera.updateProjectionMatrix();
      erstes = false;
      return { ...ist, abstand, ziel: zielIst };
    },
    springen() {
      erstes = true;
    },
  };
}
