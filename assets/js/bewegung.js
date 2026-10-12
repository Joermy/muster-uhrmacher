(() => {
  "use strict";

  const wurzel = document.documentElement;
  const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const feinZeiger = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  wurzel.classList.add("js");

  const kopf = document.querySelector(".kopf");
  const kopfPruefen = () => kopf && kopf.classList.toggle("ist-gescrollt", window.scrollY > 10);
  kopfPruefen();
  window.addEventListener("scroll", kopfPruefen, { passive: true });

  // Teilung im Lader-Ring (60 Striche, jeder fuenfte laenger)
  const teilung = document.querySelector(".lader__teilung");
  if (teilung) {
    const ns = "http://www.w3.org/2000/svg";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const l = i % 5 === 0 ? 6 : 3;
      const linie = document.createElementNS(ns, "line");
      linie.setAttribute("x1", 60 + Math.cos(a) * 46);
      linie.setAttribute("y1", 60 + Math.sin(a) * 46);
      linie.setAttribute("x2", 60 + Math.cos(a) * (46 - l));
      linie.setAttribute("y2", 60 + Math.sin(a) * (46 - l));
      linie.style.setProperty("--i", i);
      teilung.appendChild(linie);
    }
  }

  // Ueberschrift in Zeichen zerlegen (fuer das Einblenden nach dem Laden)
  document.querySelectorAll("[data-zerlegen]").forEach((el) => {
    const text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    let n = 0;
    el.innerHTML = text
      .split(" ")
      .map((wort) => `<span class="wort" aria-hidden="true">${Array.from(wort).map((z) => `<span class="zeichen" style="--n:${n++}">${z}</span>`).join("")}</span>`)
      .join(" ");
  });

  // Zitat Wort fuer Wort beim Scrollen aufhellen
  const woerter = [];
  document.querySelectorAll("[data-woerter]").forEach((el) => {
    const text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    el.innerHTML = text.split(/\s+/).map((w) => `<span class="wort" aria-hidden="true">${w}</span>`).join(" ");
    woerter.push({ el, spannen: Array.from(el.querySelectorAll(".wort")) });
  });
  function woerterLesen() {
    const h = window.innerHeight || 1;
    woerter.forEach(({ el, spannen }) => {
      const k = el.getBoundingClientRect();
      const anteil = Math.min(Math.max((h * 0.85 - k.top) / (h * 0.55), 0), 1);
      spannen.forEach((w, i) => {
        const lokal = Math.min(Math.max(anteil * (spannen.length + 2) - i, 0), 1);
        w.style.opacity = (0.16 + lokal * 0.84).toFixed(3);
      });
    });
  }
  if (woerter.length && !reduziert) {
    woerterLesen();
    window.addEventListener("scroll", woerterLesen, { passive: true });
  }

  // Einblenden beim Scrollen
  const ziele = Array.from(document.querySelectorAll(".auf, .glanz, .bild"));
  const festschreiben = (el) => el.classList.add("ist-fertig");
  function zeigen(el) {
    if (el.classList.contains("ist-sichtbar")) return;
    el.classList.add("ist-sichtbar");
    setTimeout(() => festschreiben(el), 2000);
    el.querySelectorAll("[data-zaehlen]").forEach(zaehlen);
    if (el.matches("[data-zaehlen]")) zaehlen(el);
  }

  function zaehlen(el) {
    if (reduziert || el.dataset.gezaehlt) return;
    el.dataset.gezaehlt = "1";
    const ziel = Number(el.dataset.zaehlen);
    const rest = el.textContent.replace(/^[\d.,]+/, "");
    const start = performance.now();
    const lauf = (t) => {
      const a = Math.min((t - start) / 1100, 1);
      const w = 1 - Math.pow(1 - a, 4);
      el.textContent = Math.round(ziel * w) + rest;
      if (a < 1) requestAnimationFrame(lauf);
    };
    requestAnimationFrame(lauf);
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
    setTimeout(nachzuegler, 1200);
    window.addEventListener("load", () => setTimeout(nachzuegler, 300));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) setTimeout(nachzuegler, 150);
    });
  }

  // Bilder: sanftes Gegenlaufen beim Scrollen
  const bilder = Array.from(document.querySelectorAll(".galerie .bild img, .karte--bild img"));
  if (bilder.length && !reduziert) {
    const lauf = () => {
      const h = window.innerHeight || 1;
      bilder.forEach((img) => {
        const k = img.parentElement.getBoundingClientRect();
        if (k.bottom < -100 || k.top > h + 100) return;
        const m = (k.top + k.height / 2 - h / 2) / h;
        img.style.setProperty("--parallaxe", `${(m * -28).toFixed(1)}px`);
      });
    };
    lauf();
    window.addEventListener("scroll", lauf, { passive: true });
  }

  // Lichtfleck auf den Karten und magnetische Knoepfe
  if (feinZeiger) {
    document.querySelectorAll(".karte").forEach((karte) => {
      karte.addEventListener("pointermove", (ev) => {
        const k = karte.getBoundingClientRect();
        karte.style.setProperty("--kx", `${ev.clientX - k.left}px`);
        karte.style.setProperty("--ky", `${ev.clientY - k.top}px`);
      });
    });
    if (!reduziert) {
      document.querySelectorAll(".knopf--magnet").forEach((k) => {
        k.addEventListener("pointermove", (ev) => {
          const r = k.getBoundingClientRect();
          const x = (ev.clientX - r.left) / r.width - 0.5;
          const y = (ev.clientY - r.top) / r.height - 0.5;
          k.style.transform = `translate(${(x * 12).toFixed(1)}px, ${(y * 10).toFixed(1)}px)`;
        });
        k.addEventListener("pointerleave", () => (k.style.transform = ""));
      });
    }
  }

  // Ortszeit Peine
  const zeitfelder = document.querySelectorAll("[data-ortszeit]");
  if (zeitfelder.length) {
    const format = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Berlin" });
    const ticken = () => zeitfelder.forEach((f) => (f.textContent = format.format(new Date())));
    ticken();
    setInterval(ticken, 1000);
  }

  // Geoeffnet / geschlossen
  const zeiten = window.OEFFNUNGSZEITEN;
  const tage = window.WOCHENTAGE;
  if (zeiten && tage) {
    const teile = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
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
      el.textContent = offenBis ? `Jetzt geöffnet · bis ${offenBis} Uhr` : naechste ? `Geschlossen · öffnet ${naechste.tag} um ${naechste.von} Uhr` : "Geschlossen";
    });
    document.querySelectorAll("[data-tag]").forEach((zeile) => {
      if (Number(zeile.dataset.tag) === tagIndex) zeile.classList.add("ist-heute");
    });
  }

  // Unterseiten ohne Lader: Titel sofort zeigen
  if (!document.querySelector(".lader")) wurzel.classList.add("ist-geladen");
})();
