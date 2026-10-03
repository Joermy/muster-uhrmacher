(() => {
  "use strict";

  const wurzel = document.documentElement;
  const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  wurzel.classList.add("js");

  const kopf = document.querySelector(".kopf");
  const kapitel = Array.from(document.querySelectorAll(".kapitel__eintrag"));

  function scrollen() {
    if (kopf) kopf.classList.toggle("ist-gescrollt", window.scrollY > 10);
    if (!kapitel.length) return;
    const h = window.innerHeight || 1;
    kapitel.forEach((eintrag) => {
      const k = eintrag.getBoundingClientRect();
      const mitte = k.top + k.height / 2;
      const abstand = Math.abs(mitte - h / 2) / (h * 0.55);
      const sicht = reduziert ? 1 : Math.max(0, Math.min(1, 1.25 - abstand));
      eintrag.style.setProperty("--sicht", sicht.toFixed(3));
    });
  }
  scrollen();
  window.addEventListener("scroll", scrollen, { passive: true });
  window.addEventListener("resize", scrollen, { passive: true });

  const ziele = Array.from(document.querySelectorAll(".auf, .glanz, .bild"));

  function festschreiben(el) {
    if (!el.classList.contains("ist-fertig")) el.classList.add("ist-fertig");
  }

  function zeigen(el) {
    if (el.classList.contains("ist-sichtbar")) return;
    el.classList.add("ist-sichtbar");
    setTimeout(() => festschreiben(el), 2000);
  }

  if (reduziert || !("IntersectionObserver" in window)) {
    ziele.forEach((el) => {
      el.classList.add("ist-sichtbar");
      festschreiben(el);
    });
  } else {
    const beobachter = new IntersectionObserver(
      (eintraege, obs) => {
        eintraege.forEach((e) => {
          if (!e.isIntersecting) return;
          obs.unobserve(e.target);
          zeigen(e.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
    );
    ziele.forEach((el) => beobachter.observe(el));

    const nachzuegler = () => {
      const h = window.innerHeight || 0;
      ziele.forEach((el) => {
        if (el.classList.contains("ist-sichtbar")) return;
        const k = el.getBoundingClientRect();
        if (k.top < h && k.bottom > 0) zeigen(el);
      });
    };

    const alleFestschreiben = () => {
      ziele.filter((el) => el.classList.contains("ist-sichtbar")).forEach(festschreiben);
    };

    setTimeout(nachzuegler, 1200);
    window.addEventListener("load", () => setTimeout(nachzuegler, 300));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      setTimeout(nachzuegler, 150);
      setTimeout(alleFestschreiben, 200);
    });
    window.addEventListener("focus", () => setTimeout(alleFestschreiben, 100));
  }

  document.querySelectorAll(".karte").forEach((karte) => {
    karte.addEventListener("pointermove", (ev) => {
      const k = karte.getBoundingClientRect();
      karte.style.setProperty("--kx", `${ev.clientX - k.left}px`);
      karte.style.setProperty("--ky", `${ev.clientY - k.top}px`);
    });
  });

  const zeitfelder = document.querySelectorAll("[data-ortszeit]");
  if (zeitfelder.length) {
    const format = new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Europe/Berlin",
    });
    const ticken = () => zeitfelder.forEach((f) => (f.textContent = format.format(new Date())));
    ticken();
    setInterval(ticken, 1000);
  }

  const zeiten = window.OEFFNUNGSZEITEN;
  const tage = window.WOCHENTAGE;
  if (zeiten && tage) {
    const teile = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const wert = (typ) => (teile.find((t) => t.type === typ) || {}).value;
    const tagIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wert("weekday"));
    const jetzt = Number(wert("hour")) * 60 + Number(wert("minute"));
    const minuten = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    let offenBis = null;
    (zeiten[tagIndex] || []).forEach(([von, bis]) => {
      if (jetzt >= minuten(von) && jetzt < minuten(bis)) offenBis = bis;
    });

    let naechste = null;
    if (!offenBis) {
      for (let i = 0; i < 8 && !naechste; i++) {
        const t = (tagIndex + i) % 7;
        for (const [von] of zeiten[t] || []) {
          if (i === 0 && minuten(von) <= jetzt) continue;
          naechste = { tag: i === 0 ? "heute" : i === 1 ? "morgen" : tage[t], von };
          break;
        }
      }
    }

    document.querySelectorAll("[data-status]").forEach((el) => {
      el.dataset.offen = offenBis ? "ja" : "nein";
      el.textContent = offenBis
        ? `Jetzt geöffnet · bis ${offenBis} Uhr`
        : naechste
        ? `Geschlossen · öffnet ${naechste.tag} um ${naechste.von} Uhr`
        : "Geschlossen";
    });

    document.querySelectorAll("[data-tag]").forEach((zeile) => {
      if (Number(zeile.dataset.tag) === tagIndex) zeile.classList.add("ist-heute");
    });
  }
})();
