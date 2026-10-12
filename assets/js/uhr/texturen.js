// Prozedurale Oberflaechen der K-1. Alles entsteht beim Laden im Browser,
// nichts davon liegt als Bilddatei im Repository.
//
// Werkteile und Zifferblatt haben eine Draufsicht-Projektion als UV: die
// Textur deckt 34 mm (Werk) bzw. 33,1 mm (Blatt) ab, Bildzeile 0 liegt bei +Y.
// Richtungen fuer Anisotropie und Normalen werden im UV-Rahmen kodiert:
// Tangente = +X, Bitangente = -Y (glTF-Konvention fuer v).

const TAU = Math.PI * 2;

export function zufall(saat = 1) {
  let s = saat >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function leinwand(g) {
  const c = document.createElement("canvas");
  c.width = c.height = g;
  return c;
}

const pause = () => new Promise((r) => (window.requestAnimationFrame ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

// Weiches Rauschen (Value-Noise mit mehreren Oktaven) in ein Float32Array
function wertRauschen(g, zell, oktaven, saat) {
  const z = zufall(saat);
  const aus = new Float32Array(g * g);
  let amp = 1;
  let summe = 0;
  for (let o = 0; o < oktaven; o++) {
    const n = Math.max(2, Math.round(g / zell));
    const gitter = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i < gitter.length; i++) gitter[i] = z();
    for (let x = 0; x <= n; x++) gitter[n * (n + 1) + x] = gitter[x];
    for (let y = 0; y <= n; y++) gitter[y * (n + 1) + n] = gitter[y * (n + 1)];
    const f = n / g;
    for (let y = 0; y < g; y++) {
      const gy = y * f;
      const y0 = Math.floor(gy);
      const ty = gy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < g; x++) {
        const gx = x * f;
        const x0 = Math.floor(gx);
        const tx = gx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const i = y0 * (n + 1) + x0;
        const a = gitter[i] + (gitter[i + 1] - gitter[i]) * sx;
        const b = gitter[i + n + 1] + (gitter[i + n + 2] - gitter[i + n + 1]) * sx;
        aus[y * g + x] += (a + (b - a) * sy) * amp;
      }
    }
    summe += amp;
    amp *= 0.5;
    zell /= 2;
  }
  for (let i = 0; i < aus.length; i++) aus[i] /= summe;
  return aus;
}

// Hoehenfeld -> Normalenkarte (RGB) im UV-Rahmen
function normalenAusHoehe(hoehe, g, staerke, kachel = false) {
  const daten = new Uint8ClampedArray(g * g * 4);
  const at = (x, y) => {
    if (kachel) {
      x = (x + g) % g;
      y = (y + g) % g;
    } else {
      x = Math.min(Math.max(x, 0), g - 1);
      y = Math.min(Math.max(y, 0), g - 1);
    }
    return hoehe[y * g + x];
  };
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * staerke;
      const dz = (at(x, y + 1) - at(x, y - 1)) * staerke; // nach unten im Bild = -Y in der Welt
      let nx = -dx;
      let ny = -dz; // Bitangente zeigt nach -Y, Bildzeile waechst nach -Y
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * g + x) * 4;
      daten[i] = (nx * 0.5 + 0.5) * 255;
      daten[i + 1] = (ny * 0.5 + 0.5) * 255;
      daten[i + 2] = (nz * 0.5 + 0.5) * 255;
      daten[i + 3] = 255;
    }
  }
  return daten;
}

function bildAus(daten, g) {
  const c = leinwand(g);
  c.getContext("2d").putImageData(new ImageData(daten, g, g), 0, 0);
  return c;
}

// Richtung (dx, dy in Weltkoordinaten) + Staerke -> Anisotropie-Texel
function aniso(daten, i, dx, dy, staerke) {
  const l = Math.hypot(dx, dy) || 1;
  daten[i] = (dx / l * 0.5 + 0.5) * 255;
  daten[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
  daten[i + 2] = staerke * 255;
  daten[i + 3] = 255;
}

// ------------------------------------------------------------ Zifferblatt

export async function zifferblatt(g, schrift) {
  const MM = 33.1;
  const px = g / MM;
  const X = (x) => (x + MM / 2) * px;
  const Y = (y) => (MM / 2 - y) * px;
  const HS = { x: 0, y: -8.15, r: 4.75 };

  // Farbe: versilberte Koernung
  const farbe = leinwand(g);
  const f = farbe.getContext("2d");
  f.fillStyle = "#d9d6cf";
  f.fillRect(0, 0, g, g);

  const korn = wertRauschen(g, g / 300, 3, 7);
  const fein = wertRauschen(g, 2.2, 1, 11);
  await pause();

  // Druckfarbe als eigene Maske, damit Rauheit/Metall darauf reagieren
  const druck = leinwand(g);
  const d = druck.getContext("2d");
  d.fillStyle = "#fff";
  d.strokeStyle = "#fff";
  d.lineCap = "butt";

  // Minuterie (Eisenbahn)
  const rA = 15.1;
  const rB = 15.82;
  d.lineWidth = 0.06 * px;
  for (const r of [rA, rB]) {
    d.beginPath();
    d.arc(X(0), Y(0), r * px, 0, TAU);
    d.stroke();
  }
  for (let m = 0; m < 60; m++) {
    const a = Math.PI / 2 - (m / 60) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    d.lineWidth = (m % 5 === 0 ? 0.16 : 0.07) * px;
    d.beginPath();
    d.moveTo(X(c * rA), Y(s * rA));
    d.lineTo(X(c * rB), Y(s * rB));
    d.stroke();
  }
  // Fuenf-Minuten-Punkte innerhalb der Minuterie
  for (let m = 0; m < 60; m += 5) {
    if (m === 30) continue;
    const a = Math.PI / 2 - (m / 60) * TAU;
    d.beginPath();
    d.arc(X(Math.cos(a) * 14.75), Y(Math.sin(a) * 14.75), 0.13 * px, 0, TAU);
    d.fill();
  }

  const text = (t, x, y, hoehe, gewicht = 600, sperr = 0.18, winkel = 0) => {
    d.save();
    d.translate(X(x), Y(y));
    d.rotate(winkel);
    d.font = `${gewicht} ${hoehe * px}px ${schrift}`;
    d.textAlign = "center";
    d.textBaseline = "middle";
    if ("letterSpacing" in d) d.letterSpacing = `${sperr * hoehe * px}px`;
    d.fillText(t, 0, 0);
    d.restore();
  };
  text("KESSLER", 0, 8.6, 1.32, 650, 0.32);
  text("PEINE", 0, 6.95, 0.6, 500, 0.6);
  text("HANDAUFZUG", 0, -14.0, 0.48, 500, 0.5);

  // kleine Sekunde: Teilung und Ziffern
  const r1 = 4.22;
  const r2 = 4.6;
  for (let s = 0; s < 60; s++) {
    const a = Math.PI / 2 - (s / 60) * TAU;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const ri = s % 5 === 0 ? 3.82 : r1;
    d.lineWidth = (s % 5 === 0 ? 0.11 : 0.05) * px;
    d.beginPath();
    d.moveTo(X(HS.x + c * ri), Y(HS.y + sn * ri));
    d.lineTo(X(HS.x + c * r2), Y(HS.y + sn * r2));
    d.stroke();
  }
  for (let s = 10; s <= 60; s += 10) {
    const a = Math.PI / 2 - (s / 60) * TAU;
    text(String(s), HS.x + Math.cos(a) * 3.12, HS.y + Math.sin(a) * 3.12, 0.58, 600, 0.02);
  }
  await pause();

  const dd = d.getImageData(0, 0, g, g).data;

  // Farbe zusammensetzen + Hoehenfeld + Rauheit/Metall
  const fdaten = f.getImageData(0, 0, g, g);
  const fd = fdaten.data;
  const hoehe = new Float32Array(g * g);
  const rm = new Uint8ClampedArray(g * g * 4);
  const hsx = X(HS.x);
  const hsy = Y(HS.y);
  const hsr = HS.r * px;
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const i = y * g + x;
      const tinte = dd[i * 4 + 3] / 255;
      const dxs = x - hsx;
      const dys = y - hsy;
      const rs = Math.hypot(dxs, dys);
      const imHS = rs < hsr;
      let ton;
      let h;
      let rau;
      let met;
      if (imHS) {
        // Azurage: feine konzentrische Rillen
        const rille = Math.sin((rs / px) * TAU * 6.5);
        ton = 205 + rille * 4 + (fein[i] - 0.5) * 6;
        h = rille * 0.35;
        rau = 0.26;
        met = 0.92;
      } else {
        const k = korn[i] - 0.5;
        const fk = fein[i] - 0.5;
        ton = 214 + k * 18 + fk * 16;
        h = k * 0.9 + fk * 0.7;
        rau = 0.42 + fk * 0.14;
        met = 0.88;
      }
      const r = ton * (1 - tinte) + 22 * tinte;
      const gg = ton * 0.995 * (1 - tinte) + 22 * tinte;
      const b = ton * 0.965 * (1 - tinte) + 26 * tinte;
      fd[i * 4] = r;
      fd[i * 4 + 1] = gg;
      fd[i * 4 + 2] = b;
      hoehe[i] = h * (1 - tinte) + 1.6 * tinte;
      rm[i * 4] = 255;
      rm[i * 4 + 1] = (rau * (1 - tinte) + 0.3 * tinte) * 255;
      rm[i * 4 + 2] = (met * (1 - tinte)) * 255;
      rm[i * 4 + 3] = 255;
    }
  }
  f.putImageData(fdaten, 0, 0);
  await pause();

  // Anisotropie der kleinen Sekunde: Unschaerfe radial (Rillen konzentrisch)
  const an = new Uint8ClampedArray(g * g * 4);
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const i = (y * g + x) * 4;
      const wx = x - hsx;
      const wy = -(y - hsy);
      const imHS = Math.hypot(wx, wy) < hsr;
      aniso(an, i, wx, wy, imHS ? 0.85 : 0);
    }
  }

  return {
    farbe,
    normal: bildAus(normalenAusHoehe(hoehe, g, 0.9 * (g / 2048)), g),
    rauMetall: bildAus(rm, g),
    aniso: bildAus(an, g),
  };
}

// ------------------------------------------------- Glashuetter Streifenschliff

export async function streifenschliff(g, saat = 3) {
  const MM = 34;
  const px = g / MM;
  const breite = 1.25; // mm
  const rWerkzeug = 1.6;
  const winkel = 0.0;
  const ax = Math.cos(winkel);
  const ay = Math.sin(winkel);
  const an = new Uint8ClampedArray(g * g * 4);
  const hoehe = new Float32Array(g * g);
  const rau = new Uint8ClampedArray(g * g * 4);
  const fein = wertRauschen(g, 1.6, 1, saat);
  const wolke = wertRauschen(g, g / 18, 3, saat + 4);
  for (let y = 0; y < g; y++) {
    const wy = MM / 2 - y / px;
    for (let x = 0; x < g; x++) {
      const wx = x / px - MM / 2;
      // Koordinate quer zum Streifen
      const quer = -wx * ay + wy * ax;
      const laengs = wx * ax + wy * ay;
      const band = Math.floor(quer / breite);
      let t = quer - (band + 0.5) * breite; // -b/2..b/2
      const s = Math.sqrt(Math.max(rWerkzeug * rWerkzeug - t * t, 0));
      // Unschaerferichtung = (p - Werkzeugmitte): a*s + b*t
      const bx = -ay;
      const by = ax;
      const dx = ax * s + bx * t;
      const dy = ay * s + by * t;
      const i = (y * g + x) * 4;
      const kante = Math.abs(t) / (breite / 2);
      aniso(an, i, dx, dy, 0.7 - kante * kante * 0.15);
      hoehe[y * g + x] = -(kante * kante) * 0.45 + (fein[y * g + x] - 0.5) * 0.12 + Math.sin(laengs * 3.1 + band) * 0.0;
      const r = 0.2 + (wolke[y * g + x] - 0.5) * 0.06 + kante * 0.04;
      rau[i] = 255;
      rau[i + 1] = r * 255;
      rau[i + 2] = 255;
      rau[i + 3] = 255;
    }
  }
  await pause();
  return {
    aniso: bildAus(an, g),
    normal: bildAus(normalenAusHoehe(hoehe, g, 0.55 * (g / 2048)), g),
    rauMetall: bildAus(rau, g),
  };
}

// --------------------------------------------------------------- Perlage

export async function perlage(g, saat = 5) {
  const MM = 34;
  const px = g / MM;
  const r = 0.56;
  const abstand = 0.66;
  const z = zufall(saat);
  const n = Math.ceil(MM / abstand) + 2;
  // Mittelpunkte mit leichtem Versatz, Reihenfolge = Auftrag (spaetere liegen oben)
  const pkt = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      pkt.push({
        x: -MM / 2 - abstand + i * abstand + (j % 2) * abstand * 0.5 + (z() - 0.5) * 0.05,
        y: -MM / 2 - abstand + j * abstand + (z() - 0.5) * 0.05,
        o: j * n + i,
        w: z() * TAU,
      });
    }
  }
  const raster = new Map();
  const zelle = (x, y) => `${Math.floor(x / abstand)}:${Math.floor(y / abstand)}`;
  for (const p of pkt) {
    const k = zelle(p.x, p.y);
    if (!raster.has(k)) raster.set(k, []);
    raster.get(k).push(p);
  }
  const an = new Uint8ClampedArray(g * g * 4);
  const hoehe = new Float32Array(g * g);
  for (let y = 0; y < g; y++) {
    const wy = MM / 2 - y / px;
    for (let x = 0; x < g; x++) {
      const wx = x / px - MM / 2;
      const cx = Math.floor(wx / abstand);
      const cy = Math.floor(wy / abstand);
      let best = null;
      let bestD = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const liste = raster.get(`${cx + ox}:${cy + oy}`);
          if (!liste) continue;
          for (const p of liste) {
            const dd = Math.hypot(wx - p.x, wy - p.y);
            if (dd < r && (!best || p.o > best.o)) {
              best = p;
              bestD = dd;
            }
          }
        }
      }
      const i = (y * g + x) * 4;
      if (best) {
        aniso(an, i, wx - best.x, wy - best.y, 0.45);
        const u = bestD / r;
        hoehe[y * g + x] = Math.sin(u * TAU * 5 + best.w) * 0.06 + (u > 0.93 ? 0.4 : 0);
      } else {
        aniso(an, i, 1, 0, 0.2);
      }
    }
  }
  await pause();
  return { aniso: bildAus(an, g), normal: bildAus(normalenAusHoehe(hoehe, g, 0.5 * (g / 2048)), g) };
}

// --------------------------------------------------------------- Gravur

export async function gravur(g, saat = 9, bereich = null) {
  const MM = 34;
  const px = g / MM;
  const X = (x) => (x + MM / 2) * px;
  const Y = (y) => (MM / 2 - y) * px;
  const z = zufall(saat);
  const c = leinwand(g);
  const k = c.getContext("2d");
  k.fillStyle = "#000";
  k.fillRect(0, 0, g, g);
  k.strokeStyle = "#fff";
  k.fillStyle = "#fff";
  k.lineCap = "round";
  k.lineJoin = "round";

  // Ranken: logarithmische Spiralen mit Blaettern, Strichstaerke laeuft aus
  function ranke(x, y, w, laenge, dicke, tiefe) {
    let a = w;
    let px0 = x;
    let py0 = y;
    const kruemmung = (z() < 0.5 ? -1 : 1) * (0.08 + z() * 0.12);
    const schritte = Math.floor(laenge / 0.08);
    for (let i = 0; i < schritte; i++) {
      const u = i / schritte;
      a += kruemmung * (1 + u * 3.2);
      const nx = px0 + Math.cos(a) * 0.08;
      const ny = py0 + Math.sin(a) * 0.08;
      k.lineWidth = Math.max(dicke * (1 - u * 0.85), 0.03) * px;
      k.beginPath();
      k.moveTo(X(px0), Y(py0));
      k.lineTo(X(nx), Y(ny));
      k.stroke();
      if (tiefe > 0 && i > 4 && i % Math.floor(5 + z() * 6) === 0 && u < 0.7) {
        const seite = z() < 0.5 ? -1 : 1;
        blatt(nx, ny, a + seite * (0.9 + z() * 0.5), 0.35 + z() * 0.35);
        if (z() < 0.35) ranke(nx, ny, a + seite * 1.1, laenge * (0.35 + z() * 0.25), dicke * 0.7, tiefe - 1);
      }
      px0 = nx;
      py0 = ny;
    }
  }
  function blatt(x, y, w, l) {
    k.save();
    k.translate(X(x), Y(y));
    k.rotate(-w);
    k.beginPath();
    k.moveTo(0, 0);
    k.quadraticCurveTo(l * px * 0.5, -l * px * 0.32, l * px, 0);
    k.quadraticCurveTo(l * px * 0.5, l * px * 0.32, 0, 0);
    k.globalAlpha = 0.35;
    k.fill();
    k.globalAlpha = 1;
    k.lineWidth = 0.035 * px;
    k.stroke();
    k.beginPath();
    k.moveTo(l * px * 0.1, 0);
    k.lineTo(l * px * 0.85, 0);
    k.stroke();
    k.restore();
  }
  const b = bereich || { x0: -15, x1: -4, y0: -14, y1: -1 };
  const anzahl = 90;
  for (let i = 0; i < anzahl; i++) {
    ranke(b.x0 + z() * (b.x1 - b.x0), b.y0 + z() * (b.y1 - b.y0), z() * TAU, 1.6 + z() * 2.2, 0.13, 2);
  }
  // Randlinie (Fadenlinie) wird spaeter vom Kloben-Umriss begrenzt
  await pause();
  const daten = k.getImageData(0, 0, g, g).data;
  const hoehe = new Float32Array(g * g);
  const rm = new Uint8ClampedArray(g * g * 4);
  const korn = wertRauschen(g, 1.4, 1, saat + 2);
  for (let i = 0; i < g * g; i++) {
    const v = daten[i * 4] / 255;
    hoehe[i] = -v * 1.0 + (korn[i] - 0.5) * 0.05;
    rm[i * 4] = 255;
    rm[i * 4 + 1] = (0.3 + v * 0.3) * 255;
    rm[i * 4 + 2] = 255;
    rm[i * 4 + 3] = 255;
  }
  // leicht weichzeichnen ueber die Normalenberechnung (Hoehe ist schon kantig genug)
  return { normal: bildAus(normalenAusHoehe(hoehe, g, 1.4 * (g / 2048)), g), rauMetall: bildAus(rm, g), maske: c };
}

// --------------------------------------------------------------- Leder

export async function leder(g, saat = 13) {
  // Kachel 22 x 22 mm; u quer, v laengs. Feines Kalbsnarbenbild aus
  // mehreren Rauschlagen, dazu wenige lange Falten.
  const fein = wertRauschen(g, g / 90, 2, saat + 1);
  const mittel = wertRauschen(g, g / 26, 2, saat + 2);
  const wolke = wertRauschen(g, g / 4, 2, saat + 3);
  const hoehe = new Float32Array(g * g);
  const farbe = new Uint8ClampedArray(g * g * 4);
  const rau = new Uint8ClampedArray(g * g * 4);
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const i = y * g + x;
      const f = fein[i];
      const m = mittel[i];
      // Poren: Taeler zwischen den Narbenhuegeln
      const narbe = Math.pow(Math.abs(f - 0.5) * 2, 0.6);
      const falte = Math.pow(1 - Math.abs(m - 0.5) * 2, 10) * 0.6;
      hoehe[i] = narbe * 0.55 - falte + (wolke[i] - 0.5) * 0.15;
      const t = 0.82 + narbe * 0.16 - falte * 0.25 + (wolke[i] - 0.5) * 0.22;
      farbe[i * 4] = 50 * t;
      farbe[i * 4 + 1] = 28 * t;
      farbe[i * 4 + 2] = 17 * t;
      farbe[i * 4 + 3] = 255;
      rau[i * 4] = 255;
      rau[i * 4 + 1] = (0.46 - narbe * 0.12 + falte * 0.2) * 255;
      rau[i * 4 + 2] = 0;
      rau[i * 4 + 3] = 255;
    }
  }
  // Kantenfarbe: aussen schmal, dunkel und etwas glaenzend
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const u = x / g;
      if (u > 0.035 && u < 0.965) continue;
      const i = y * g + x;
      farbe[i * 4] = 22;
      farbe[i * 4 + 1] = 12;
      farbe[i * 4 + 2] = 8;
      rau[i * 4 + 1] = 0.32 * 255;
      hoehe[i] = 0.2 + (fein[i] - 0.5) * 0.05;
    }
  }
  // Naht: zwei Stichreihen entlang v
  const stiche = 9;
  for (const u0 of [0.105, 0.895]) {
    for (let s = 0; s < stiche; s++) {
      const v0 = (s / stiche) * g;
      const lang = g / stiche * 0.62;
      for (let yy = 0; yy < lang; yy++) {
        const y = Math.floor(v0 + yy) % g;
        const q = yy / lang;
        const halb = g * 0.012 * Math.sin(q * Math.PI) ** 0.5;
        const xm = u0 * g + (q - 0.5) * g * 0.006;
        for (let xx = -halb; xx <= halb; xx++) {
          const x = Math.round(xm + xx);
          if (x < 0 || x >= g) continue;
          const i = y * g + x;
          const w = 1 - Math.abs(xx) / (halb + 1);
          hoehe[i] = 1.2 + w * 0.8 + Math.sin(q * 40) * 0.05;
          const t = 0.85 + w * 0.15;
          farbe[i * 4] = 196 * t;
          farbe[i * 4 + 1] = 182 * t;
          farbe[i * 4 + 2] = 156 * t;
          rau[i * 4 + 1] = 0.75 * 255;
        }
      }
    }
  }
  await pause();
  return {
    farbe: bildAus(farbe, g),
    normal: bildAus(normalenAusHoehe(hoehe, g, 1.1 * (g / 1024), true), g),
    rauMetall: bildAus(rau, g),
  };
}

// --------------------------------------------- Schrift auf Boden und Platine

export async function bodenGravur(g, schrift) {
  // Bodenring, Planarprojektion ueber 40 mm, Ansicht von unten (Spiegelung beachten)
  const MM = 40;
  const px = g / MM;
  const c = leinwand(g);
  const k = c.getContext("2d");
  k.fillStyle = "#000";
  k.fillRect(0, 0, g, g);
  k.fillStyle = "#fff";
  k.textAlign = "center";
  k.textBaseline = "middle";
  const ring = (text, r, hoehe, start) => {
    k.font = `600 ${hoehe * px}px ${schrift}`;
    const zeichen = Array.from(text);
    const schritt = (hoehe * 0.92) / r;
    let a = start;
    for (const z of zeichen) {
      // von unten gesehen laeuft der Text im Uhrzeigersinn, daher gespiegelt
      k.save();
      k.translate(g / 2 + Math.cos(a) * r * px, g / 2 - Math.sin(a) * r * px);
      k.rotate(-a + Math.PI / 2);
      k.scale(-1, 1);
      k.fillText(z, 0, 0);
      k.restore();
      a += schritt;
    }
  };
  ring("ATELIER KESSLER · PEINE · KALIBER K-1 · NR. 007 / 100 · ", 15.6, 0.95, Math.PI / 2 - 1.5);
  await pause();
  const d = k.getImageData(0, 0, g, g).data;
  const hoehe = new Float32Array(g * g);
  const rm = new Uint8ClampedArray(g * g * 4);
  const an = new Uint8ClampedArray(g * g * 4);
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const i = y * g + x;
      const v = d[i * 4] / 255;
      hoehe[i] = -v;
      rm[i * 4] = 255;
      rm[i * 4 + 1] = (0.3 + v * 0.3) * 255;
      rm[i * 4 + 2] = 255;
      rm[i * 4 + 3] = 255;
      // Kreisschliff: Rillen konzentrisch, Unschaerfe radial
      aniso(an, i * 4, x - g / 2, -(y - g / 2), 0.85 * (1 - v));
    }
  }
  return { normal: bildAus(normalenAusHoehe(hoehe, g, 1.2 * (g / 2048)), g), rauMetall: bildAus(rm, g), aniso: bildAus(an, g) };
}

export async function platinenSchrift(g, schrift) {
  // vergoldete Gravur auf der Dreiviertelplatine (Ansicht von hinten = gespiegelt)
  const MM = 34;
  const px = g / MM;
  const c = leinwand(g);
  const k = c.getContext("2d");
  k.fillStyle = "#000";
  k.fillRect(0, 0, g, g);
  k.fillStyle = "#fff";
  k.textAlign = "center";
  k.textBaseline = "middle";
  const zeile = (t, x, y, h, w = 0) => {
    k.save();
    k.translate((x + MM / 2) * px, (MM / 2 - y) * px);
    k.scale(-1, 1);
    k.rotate(w);
    k.font = `600 ${h * px}px ${schrift}`;
    if ("letterSpacing" in k) k.letterSpacing = `${0.22 * h * px}px`;
    k.fillText(t, 0, 0);
    k.restore();
  };
  zeile("KESSLER", 8.2, -4.6, 1.0, -0.42);
  zeile("PEINE", 8.9, -6.2, 0.62, -0.42);
  zeile("SIEBZEHN STEINE", 3.4, 11.9, 0.5, 0.0);
  zeile("K-1", 8.6, 1.4, 0.8, 0.0);
  await pause();
  return c;
}
