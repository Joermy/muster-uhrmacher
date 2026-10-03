(async () => {
  const canvas = document.querySelector(".buehne__canvas");
  if (!canvas || !window.WebGLRenderingContext) return;

  const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const zerlegt = document.querySelector(".zerlegt");

  let THREE, GLTFLoader, RoomEnvironment;
  try {
    [THREE, { GLTFLoader }, { RoomEnvironment }] = await Promise.all([
      import("./vendor/three.module.min.js"),
      import("./vendor/GLTFLoader.min.js"),
      import("./vendor/RoomEnvironment.min.js"),
    ]);
  } catch (fehler) {
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (fehler) {
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const szene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  const raum = new RoomEnvironment();
  const streifen = [
    { farbe: 0xffffff, staerke: 6, pos: [0, 5, 2], groesse: [8, 0.6] },
    { farbe: 0x5b9bff, staerke: 4, pos: [-5, 0.5, 1], groesse: [0.5, 6] },
    { farbe: 0xffffff, staerke: 3, pos: [5, -0.5, 2], groesse: [0.6, 6] },
  ];
  streifen.forEach((s) => {
    const platte = new THREE.Mesh(
      new THREE.PlaneGeometry(s.groesse[0], s.groesse[1]),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(s.farbe).multiplyScalar(s.staerke), side: THREE.DoubleSide })
    );
    platte.position.set(...s.pos);
    platte.lookAt(0, 0, 0);
    raum.add(platte);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  szene.environment = pmrem.fromScene(raum, 0.03).texture;

  const MATERIAL = {
    Stahl: new THREE.MeshPhysicalMaterial({ color: 0xdedee3, metalness: 1, roughness: 0.14, clearcoat: 0.4, clearcoatRoughness: 0.1 }),
    Stahl_matt: new THREE.MeshPhysicalMaterial({ color: 0xbfc0c6, metalness: 1, roughness: 0.42 }),
    Blaustahl: new THREE.MeshPhysicalMaterial({ color: 0x3f74ff, metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.35, iridescenceIOR: 1.6 }),
    Ziffer: new THREE.MeshPhysicalMaterial({ color: 0x07080b, metalness: 0.3, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }),
    Messing: new THREE.MeshPhysicalMaterial({ color: 0xe0b468, metalness: 1, roughness: 0.26 }),
    Rubin: new THREE.MeshPhysicalMaterial({ color: 0xd0102e, metalness: 0, roughness: 0.05, clearcoat: 1, emissive: 0x3a0008 }),
    Glas: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1 }),
    Leuchtmasse: new THREE.MeshPhysicalMaterial({ color: 0xeef2f6, roughness: 0.4 }),
  };

  let modell;
  try {
    modell = (await new GLTFLoader().loadAsync(new URL("../modelle/uhr.glb", import.meta.url).href)).scene;
  } catch (fehler) {
    return;
  }

  const SPREIZUNG = {
    Boden: -1.35, Steine: -1.05, Bruecke: -0.9, Unruh: -0.76, Rad_klein: -0.64, Rad_mittel: -0.58,
    Rad_gross: -0.52, Federhaus: -0.46, Platine: -0.3, Gehaeuse: 0, Hoerner: 0, Krone: 0,
    Zifferblatt: 0.36, Indizes: 0.52, Stundenzeiger: 0.7, Minutenzeiger: 0.8, Sekundenzeiger: 0.9,
    Luenette: 1.08, Glas: 1.3,
  };

  const teile = [];
  modell.traverse((kind) => {
    if (!kind.isMesh) return;
    const name = kind.material && kind.material.name;
    if (MATERIAL[name]) kind.material = MATERIAL[name];
  });
  Object.keys(SPREIZUNG).forEach((name) => {
    const obj = modell.getObjectByName(name);
    if (obj) teile.push({ obj, basis: obj.position.y, weg: SPREIZUNG[name] });
  });

  const teil = (name) => modell.getObjectByName(name);
  const zeiger = { h: teil("Stundenzeiger"), m: teil("Minutenzeiger"), s: teil("Sekundenzeiger") };
  const raeder = [
    [teil("Federhaus"), 0.12],
    [teil("Rad_gross"), -0.35],
    [teil("Rad_mittel"), 0.8],
    [teil("Rad_klein"), -1.9],
  ].filter(([o]) => o);
  const unruh = teil("Unruh");

  const lage = new THREE.Group();
  const uhr = new THREE.Group();
  uhr.add(modell);
  uhr.rotation.x = Math.PI / 2;
  lage.add(uhr);
  szene.add(lage);

  function groesse() {
    const b = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, b < 760 ? 1.75 : 1.5));
    renderer.setSize(b, h, false);
    kamera.aspect = b / h;
    kamera.position.set(0, 0, kamera.aspect < 1 ? 7.5 / Math.max(kamera.aspect, 0.5) * 0.72 : 7.5);
    kamera.updateProjectionMatrix();
  }
  groesse();
  window.addEventListener("resize", groesse, { passive: true });

  const klemmen = (x, a = 0, b = 1) => Math.min(Math.max(x, a), b);
  const weich = (a, b, x) => {
    const t = klemmen((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  let held = 0;
  let kap = 0;
  let sichtbar = true;
  function lesen() {
    const h = Math.max(window.innerHeight, 1);
    held = klemmen(window.scrollY / h);
    if (zerlegt) {
      const k = zerlegt.getBoundingClientRect();
      kap = klemmen(-k.top / Math.max(k.height - h, 1));
      sichtbar = k.bottom > -h * 0.2;
    }
  }
  lesen();
  window.addEventListener("scroll", lesen, { passive: true });
  window.addEventListener("resize", lesen, { passive: true });

  let zx = 0;
  let zy = 0;
  window.addEventListener("pointermove", (ev) => {
    zx = ev.clientX / window.innerWidth - 0.5;
    zy = ev.clientY / window.innerHeight - 0.5;
  });

  const ist = { e: 0, kipp: 0.5, dreh: 0, x: 0, y: -1.8, s: 0.74, zx: 0, zy: 0 };

  function ziel(sek) {
    const hoch = kamera.aspect < 0.8;
    const auf = weich(0.04, 0.26, kap) * (1 - weich(0.78, 0.94, kap));
    const kapitelLauf = klemmen((kap - 0.16) / 0.84 * 5 - 0.5, 0, 4);
    const seite = Math.cos(Math.PI * kapitelLauf);
    const imKapitel = weich(0.02, 0.2, kap);
    return {
      e: auf,
      kipp: 0.5 + imKapitel * 0.55 - weich(0.82, 0.98, kap) * 0.6,
      dreh: (reduziert ? 0 : Math.sin(sek * 0.25) * 0.08) + imKapitel * (-0.45 + kap * 1.1),
      x: hoch ? 0 : imKapitel * seite * 1.4,
      y: (hoch ? 0.45 : -0.05) * imKapitel + (1 - imKapitel) * (-1.8 + weich(0, 1, held) * 1.6),
      s: 0.74 - imKapitel * (hoch ? 0.12 : 0.08),
    };
  }

  function uhrzeitStellen(jetzt) {
    const ms = jetzt.getMilliseconds();
    const sek = jetzt.getSeconds() + Math.floor(ms / 125) / 8;
    const min = jetzt.getMinutes() + sek / 60;
    const std = (jetzt.getHours() % 12) + min / 60;
    if (zeiger.s) zeiger.s.rotation.y = -(sek / 60) * Math.PI * 2;
    if (zeiger.m) zeiger.m.rotation.y = -(min / 60) * Math.PI * 2;
    if (zeiger.h) zeiger.h.rotation.y = -(std / 12) * Math.PI * 2;
  }

  function bild(sek, folgen) {
    const z = ziel(sek);
    for (const k of Object.keys(z)) ist[k] += (z[k] - ist[k]) * folgen;
    ist.zx += (zx - ist.zx) * 0.06;
    ist.zy += (zy - ist.zy) * 0.06;

    teile.forEach((t) => {
      t.obj.position.y = t.basis + t.weg * ist.e * 1.3;
    });

    if (!reduziert) {
      raeder.forEach(([o, v]) => (o.rotation.y = sek * v * (0.6 + ist.e)));
      if (unruh) unruh.rotation.y = Math.sin(sek * Math.PI * 2 * 2.5) * 1.3;
    }
    uhrzeitStellen(new Date());

    lage.position.set(ist.x, ist.y, 0);
    lage.scale.setScalar(ist.s);
    lage.rotation.set(-ist.kipp + ist.zy * 0.12, ist.dreh + ist.zx * 0.22, 0);
    uhr.rotation.x = Math.PI / 2;

    renderer.render(szene, kamera);
  }

  function bereit() {
    canvas.classList.add("ist-bereit");
    document.documentElement.classList.add("uhr-laeuft");
  }

  bild(0, 1);
  bereit();

  if (reduziert) {
    window.addEventListener("scroll", () => bild(0, 1), { passive: true });
    setInterval(() => bild(0, 1), 1000);
    return;
  }

  let verloren = false;
  canvas.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    verloren = true;
    document.documentElement.classList.remove("uhr-laeuft");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    verloren = false;
    groesse();
    bereit();
    requestAnimationFrame(schleife);
  });

  let vorher = 0;
  function schleife(zeit) {
    if (verloren) return;
    const dt = vorher ? Math.min((zeit - vorher) / 1000, 0.25) : 0.016;
    vorher = zeit;
    if (sichtbar && !document.hidden) {
      try {
        bild(zeit / 1000, 1 - Math.exp(-dt * 5));
      } catch (fehler) {
        return;
      }
    }
    requestAnimationFrame(schleife);
  }
  requestAnimationFrame(schleife);
})();
