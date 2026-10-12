// Gangwerk der K-1: 28 800 A/h, also 8 Halbschwingungen pro Sekunde (4 Hz).
// Das Ankerrad hat 15 Zaehne und springt bei jedem Schlag um eine halbe Teilung.
// Alle Raeder des Gehwerks rucken im selben Takt, die kleine Sekunde springt
// achtmal pro Sekunde.

const TAU = Math.PI * 2;
const SCHLAEGE = 8;

const glatt = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Ortszeit Peine, unabhaengig von der Zeitzone des Besuchers
const format = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
let versatzMs = null;
function berlinSekunden() {
  const jetzt = Date.now();
  if (versatzMs === null || Math.random() < 0.002) {
    const t = format.formatToParts(new Date(jetzt));
    const w = (n) => Number(t.find((x) => x.type === n).value);
    const sek = w("hour") * 3600 + w("minute") * 60 + w("second");
    const lokal = Math.floor(jetzt / 1000) % 86400;
    versatzMs = ((sek - lokal) % 86400) * 1000;
  }
  return (((jetzt + versatzMs) / 1000) % 86400 + 86400) % 86400;
}

export function werkBauen(teile) {
  const g = (n) => teile[n];
  const spirale = g("Spirale");
  let spiralNetz = null;
  if (spirale) spirale.traverse((k) => k.isMesh && (spiralNetz = k));
  const basisWinkel = {};
  for (const n of ["Stundenzeiger", "Minutenzeiger", "Sekundenzeiger", "Rad_mitte", "Rad_dritt", "Rad_viert", "Federhaus", "Ankerrad", "Anker", "Unruh", "Spirale", "Sperrrad", "Kronrad", "Krone"]) {
    if (g(n)) basisWinkel[n] = g(n).rotation.y;
  }
  const drehe = (n, w) => {
    const o = g(n);
    if (o) o.rotation.y = basisWinkel[n] + w + (o.userData.zusatzDreh || 0);
  };
  const dreheKrone = (w) => {
    const o = g("Krone");
    if (o) o.rotation.x = w;
  };

  let werkZeit = 0;
  let amplitude = 4.97; // 285 Grad
  let aufzug = 0;

  // r0/r1 der Spirale aus der Geometrie
  let r0 = 0.85;
  let r1 = 3.05;

  function spiraleBiegen(theta) {
    if (!spiralNetz) return;
    const geo = spiralNetz.geometry;
    const b = geo.userData.basis;
    const bn = geo.userData.basisNormal;
    const p = geo.attributes.position.array;
    const nn = geo.attributes.normal.array;
    for (let i = 0; i < b.length; i += 3) {
      const x = b[i];
      const z = b[i + 2];
      const r = Math.hypot(x, z);
      const s = Math.min(Math.max((r - r0) / (r1 - r0), 0), 1);
      // inneres Ende sitzt an der Rolle und dreht voll mit, aeusseres am Spiralklotz fest
      const w = -theta * (1 - s) * (1 - s * 0.15);
      const c = Math.cos(w);
      const sn = Math.sin(w);
      p[i] = x * c - z * sn;
      p[i + 1] = b[i + 1];
      p[i + 2] = x * sn + z * c;
      nn[i] = bn[i] * c - bn[i + 2] * sn;
      nn[i + 1] = bn[i + 1];
      nn[i + 2] = bn[i] * sn + bn[i + 2] * c;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }

  return {
    set amplitude(a) {
      amplitude = a;
    },
    get amplitude() {
      return amplitude;
    },
    aufziehen(dw) {
      aufzug += dw;
    },
    // dt: Sekunden; zeitlupe: 1 = Echtzeit
    schritt(dt, zeitlupe = 1, laeuft = true) {
      if (laeuft) werkZeit += dt * zeitlupe;
      const t = werkZeit;
      const schlag = Math.floor(t * SCHLAEGE);
      const f = t * SCHLAEGE - schlag;
      const ruck = schlag + glatt(0, 0.16, f);

      // Unruh: Sinusschwingung, Nulldurchgang bei jedem Schlag
      const theta = amplitude * Math.sin(Math.PI * t * SCHLAEGE);
      drehe("Unruh", theta);
      spiraleBiegen(theta);

      // Anker kippt bei jedem Schlag zwischen den Begrenzungsstiften
      const seite = schlag % 2 === 0 ? 1 : -1;
      const kipp = 0.105 * (seite * (2 * glatt(0, 0.12, f) - 1));
      drehe("Anker", kipp);

      // Gehwerk (Zifferblattansicht: Mittelrad im Uhrzeigersinn)
      const ar = ruck * (TAU / 30);
      drehe("Ankerrad", ar);
      drehe("Rad_viert", -ruck * (TAU / 480));
      drehe("Rad_dritt", ruck * (TAU / 480) / 7.5);
      drehe("Rad_mitte", -ruck * (TAU / 480) / 60);
      drehe("Federhaus", ruck * (TAU / 480) / 60 / 6);

      // Aufzug
      drehe("Sperrrad", -aufzug * 0.18);
      drehe("Kronrad", aufzug * 0.42);
      dreheKrone(aufzug);

      // Zeiger nach Ortszeit
      const sek = berlinSekunden();
      const s8 = Math.floor(sek * SCHLAEGE) / SCHLAEGE + glatt(0, 0.16, (sek * SCHLAEGE) % 1) / SCHLAEGE;
      drehe("Sekundenzeiger", -((s8 % 60) / 60) * TAU);
      drehe("Minutenzeiger", -((sek / 60) % 60 / 60) * TAU);
      drehe("Stundenzeiger", -((sek / 3600) % 12 / 12) * TAU);
      return { theta, schlag };
    },
    get zeit() {
      return werkZeit;
    },
  };
}
