// Explosionsansicht: jedes Teil faehrt entlang der Uhrachse auf seine Ebene,
// in der Reihenfolge, in der der Uhrmacher es abnimmt.
//   weg   = Millimeter entlang der Achse (+ = Zifferblattseite)
//   ab    = Einsatz (0..1) im Gesamtfortschritt
//   dreh  = zusaetzliche Drehung um die Achse beim Abheben (Umdrehungen)
//   seit  = seitlicher Versatz in mm (Uhr-x, Uhr-y)
// Dazu zwei eigene Bewegungen:
//   boden  = Boden abschrauben und zur Seite legen (0..1)
//   ablage = Raeder liegen nebeneinander wie auf der Werkbank (0..1)

const TAU = Math.PI * 2;

export const EBENEN = {
  Gehaeuse: { weg: 0, ab: 0 },
  Band_oben: { weg: 0, ab: 0.0, seit: [0, 34], band: 1 },
  Band_unten: { weg: 0, ab: 0.0, seit: [0, -34], band: 1 },
  Glas: { weg: 30, ab: 0.06 },
  Luenette: { weg: 24, ab: 0.1, dreh: 0.08 },
  Minutenzeiger: { weg: 19, ab: 0.15 },
  Stundenzeiger: { weg: 16.5, ab: 0.17 },
  Sekundenzeiger: { weg: 14.5, ab: 0.19 },
  Indizes: { weg: 11, ab: 0.22 },
  Zifferblatt: { weg: 8, ab: 0.22 },
  Krone: { weg: 0, ab: 0.25, seit: [9, 0] },
  Unruhkloben: { weg: -31, ab: 0.28, seit: [-1.5, -1.5] },
  Unruh: { weg: -26, ab: 0.32 },
  Spirale: { weg: -26.4, ab: 0.32 },
  Ankerkloben: { weg: -24, ab: 0.35 },
  Kronrad: { weg: -22, ab: 0.37, dreh: 0.4 },
  Sperrrad: { weg: -22.6, ab: 0.37, dreh: -0.2 },
  Dreiviertelplatine: { weg: -18.5, ab: 0.42 },
  Anker: { weg: -14.5, ab: 0.47 },
  Ankerrad: { weg: -13, ab: 0.48, dreh: 0.3 },
  Federhaus: { weg: -12.5, ab: 0.5, dreh: -0.1 },
  Rad_dritt: { weg: -11.4, ab: 0.52, dreh: 0.25 },
  Rad_viert: { weg: -10.4, ab: 0.52, dreh: -0.25 },
  Rad_mitte: { weg: -9.4, ab: 0.54, dreh: 0.2 },
  Platine: { weg: -6.5, ab: 0.58 },
};

// Ablage: Drehpunkt der Teile in Uhr-Koordinaten (x, y, z), Ebene vor dem Werk
const ABLAGE_Z = -47;
export const ABLAGE_X = -48;
export const ABLAGE = {
  Federhaus: [ABLAGE_X - 13.5, 5.5],
  Rad_mitte: [ABLAGE_X - 1.5, 6.5],
  Rad_dritt: [ABLAGE_X + 9.5, 6.0],
  Rad_viert: [ABLAGE_X - 9.5, -6.5],
  Ankerrad: [ABLAGE_X + 0.5, -6.0],
  Anker: [ABLAGE_X + 7.0, -7.2],
};

const glatt = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function zerlegerBauen(teile) {
  const liste = Object.entries(EBENEN)
    .filter(([n]) => teile[n])
    .map(([n, e]) => ({ n, e, o: teile[n], p: teile[n].userData.basis.p.clone(), w0: teile[n].rotation.y }));
  const boden = teile.Boden ? { o: teile.Boden, p: teile.Boden.userData.basis.p.clone(), w0: teile.Boden.rotation.y } : null;

  return {
    setzen(fort, { bandWeg = 0, bodenWeg = 0, ablage = 0 } = {}) {
      const lauf = 0.36;
      for (const t of liste) {
        const k = glatt(t.e.ab, t.e.ab + lauf, fort);
        const seit = t.e.seit || [0, 0];
        const kb = t.e.band ? Math.max(k, bandWeg) : k;
        // Modellraum: Achse = +Y, Uhr-y = -Z
        let x = t.p.x + seit[0] * kb;
        let y = t.p.y + t.e.weg * k;
        let z = t.p.z - seit[1] * kb;
        let dreh = (t.e.dreh || 0) * TAU * k;
        const ab = ABLAGE[t.n];
        // waehrend der Ablage tritt der Rest des Werks nach hinten zurueck
        if (!ab && ablage > 0 && !t.e.band) y += glatt(0, 0.7, ablage) * 34;
        if (ab && ablage > 0) {
          // jedes Rad etwas versetzt, mit einer halben Drehung im Flug
          const i = Object.keys(ABLAGE).indexOf(t.n);
          const a = glatt(i * 0.06, 0.64 + i * 0.06, ablage);
          const hub = Math.sin(a * Math.PI) * 6;
          x += (ab[0] - x) * a;
          y += (ABLAGE_Z - y) * a - hub;
          z += (-ab[1] - z) * a;
          dreh += a * Math.PI * (i % 2 ? 1 : -1) * 0.5;
        }
        t.o.position.set(x, y, z);
        t.o.userData.zusatzDreh = dreh;
        t.o.userData.fort = kb;
        t.o.rotation.y = t.w0 + dreh;
      }
      if (boden) {
        // abschrauben (1,6 Umdrehungen), abheben, zur Seite legen
        const schraub = glatt(0, 0.38, bodenWeg);
        const heben = glatt(0.3, 0.62, bodenWeg);
        const weg = glatt(0.55, 1, bodenWeg);
        const d = -1.6 * TAU * schraub;
        boden.o.userData.zusatzDreh = d;
        boden.o.rotation.y = boden.w0 + d;
        boden.o.position.set(boden.p.x - weg * 64, boden.p.y - schraub * 0.6 - heben * 6 + weg * 4, boden.p.z + weg * 8);
        boden.o.visible = bodenWeg < 0.999;
      }
    },
  };
}
