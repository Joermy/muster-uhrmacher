// Anzeige einer Zeitwaage: jeder Schlag ist ein Punkt. Geht die Uhr vor,
// steigt die Spur; ein Abfallfehler trennt Tick und Tack in zwei Linien.
// `einstellen` (0..1) fuehrt von einer verstellten Uhr zur regulierten.

const SCHLAEGE = 8;

export function zeitwaageBauen(wurzel) {
  if (!wurzel) return null;
  const canvas = wurzel.querySelector("canvas");
  const felder = {
    gang: wurzel.querySelector("[data-wert='gang']"),
    amplitude: wurzel.querySelector("[data-wert='amplitude']"),
    abfall: wurzel.querySelector("[data-wert='abfall']"),
  };
  const k = canvas.getContext("2d");
  let breite = 0;
  let hoehe = 0;
  let dichte = 1;
  const punkte = [];
  let letzterSchlag = -1;
  let spur = 0;
  let anzeige = { gang: 0, amp: 0, abfall: 0 };

  function groesse() {
    const r = canvas.getBoundingClientRect();
    dichte = Math.min(window.devicePixelRatio || 1, 2);
    breite = Math.max(1, Math.round(r.width * dichte));
    hoehe = Math.max(1, Math.round(r.height * dichte));
    canvas.width = breite;
    canvas.height = hoehe;
  }
  groesse();
  window.addEventListener("resize", groesse, { passive: true });

  const lerp = (a, b, t) => a + (b - a) * t;

  return {
    werte(einstellen) {
      const e = Math.min(Math.max(einstellen, 0), 1);
      const s = e * e * (3 - 2 * e);
      return { gang: lerp(23.6, 0.8, s), amp: lerp(226, 296, s), abfall: lerp(0.9, 0.1, s) };
    },
    zeichnen(zeit, einstellen, sichtbar) {
      if (!sichtbar) return;
      const r = canvas.getBoundingClientRect();
      if (Math.abs(r.width * dichte - breite) > 2 || Math.abs(r.height * dichte - hoehe) > 2) groesse();
      const w = this.werte(einstellen);
      anzeige = w;
      const schlag = Math.floor(zeit * SCHLAEGE);
      if (letzterSchlag < 0) letzterSchlag = schlag - 1;
      const neu = Math.min(schlag - letzterSchlag, 40);
      for (let i = 0; i < neu; i++) {
        const n = letzterSchlag + 1 + i;
        // Gangabweichung je Schlag in Pixel: Spur steigt mit dem Gang
        spur += (w.gang / 86400) * (1 / SCHLAEGE) * 9000;
        const tack = n % 2 === 1 ? 1 : -1;
        const rausch = (Math.sin(n * 12.9898) * 43758.5453) % 1;
        punkte.push({ y: spur + tack * w.abfall * 9 + rausch * (1 - einstellen) * 3, n });
        if (punkte.length > 900) punkte.shift();
      }
      letzterSchlag = schlag;

      k.clearRect(0, 0, breite, hoehe);
      // Raster
      k.strokeStyle = "rgba(255,255,255,0.07)";
      k.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = (hoehe / 6) * i;
        k.beginPath();
        k.moveTo(0, y);
        k.lineTo(breite, y);
        k.stroke();
      }
      k.strokeStyle = "rgba(91,155,255,0.25)";
      k.beginPath();
      k.moveTo(0, hoehe / 2);
      k.lineTo(breite, hoehe / 2);
      k.stroke();
      // Punkte: neueste rechts, Spur umlaufend wie auf dem Messgeraet
      const schritt = breite / 300;
      const anzahl = Math.min(punkte.length, 300);
      for (let i = 0; i < anzahl; i++) {
        const p = punkte[punkte.length - 1 - i];
        const x = breite - i * schritt;
        let y = hoehe / 2 - ((p.y * dichte) % hoehe);
        while (y < 0) y += hoehe;
        while (y > hoehe) y -= hoehe;
        const alpha = 1 - i / anzahl;
        k.fillStyle = p.n % 2 ? `rgba(138,184,255,${alpha})` : `rgba(245,245,247,${alpha * 0.9})`;
        k.fillRect(x - dichte, y - dichte, 2 * dichte, 2 * dichte);
      }
      const z = (v, n = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(n).replace(".", ",");
      if (felder.gang) felder.gang.textContent = `${z(anzeige.gang)} s/d`;
      if (felder.amplitude) felder.amplitude.textContent = `${Math.round(anzeige.amp)}°`;
      if (felder.abfall) felder.abfall.textContent = `${anzeige.abfall.toFixed(1).replace(".", ",")} ms`;
    },
  };
}
