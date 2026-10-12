import * as THREE from "../vendor/three.module.min.js";
import { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, BokehPass } from "../vendor/three-zusatz.min.js";

// Abschlussbild: Vignette, ein Hauch Lichthof um die Uhr und feines Korn.
const Abschluss = {
  uniforms: {
    tDiffuse: { value: null },
    zeit: { value: 0 },
    hof: { value: new THREE.Vector2(0.5, 0.5) },
    hofStaerke: { value: 0.0 },
    seiten: { value: 1 },
    korn: { value: 0.035 },
    vignette: { value: 0.55 },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float zeit; uniform vec2 hof; uniform float hofStaerke; uniform float seiten; uniform float korn; uniform float vignette;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - hof) * vec2(seiten, 1.0);
      float r = length(d);
      float dunkel = 1.0 - smoothstep(0.02, 0.25, dot(c.rgb, vec3(0.299, 0.587, 0.114)));
      c.rgb += vec3(0.02, 0.06, 0.2) * hofStaerke * exp(-r * r * 3.5) * dunkel;
      vec2 v = (vUv - 0.5) * vec2(seiten, 1.0);
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 1.25, length(v) * 1.1);
      float n = hash(vUv * 1000.0 + fract(zeit) * 100.0) - 0.5;
      c.rgb += n * korn * (0.35 + 0.65 * (1.0 - dot(c.rgb, vec3(0.333))));
      gl_FragColor = vec4(c.rgb, 1.0);
    }`,
};

export function stufeErmitteln() {
  const url = new URLSearchParams(location.search);
  if (url.has("stufe")) return Number(url.get("stufe"));
  const fein = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const kern = navigator.hardwareConcurrency || 4;
  const speicher = navigator.deviceMemory || 4;
  const klein = Math.min(screen.width, screen.height) < 600;
  // Telefone und Tablets: mittlere Stufe, der Leistungswaechter regelt bei Bedarf herunter
  if (!fein || klein) return speicher <= 2 || kern <= 2 ? 1 : 2;
  return kern >= 6 ? 3 : 2;
}

export function buehneBauen(canvas, stufe) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
  });
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.transmissionResolutionScale = stufe >= 3 ? 1 : 0.6;

  const szene = new THREE.Scene();
  szene.background = new THREE.Color(0x000000);
  const kamera = new THREE.PerspectiveCamera(24, 1, 5, 2000);

  const ziel = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: stufe >= 2 ? 4 : 2 });
  const composer = new EffectComposer(renderer, ziel);
  const grund = new RenderPass(szene, kamera);
  composer.addPass(grund);
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.22, 0.35, 2.4);
  bloom.enabled = stufe >= 2;
  composer.addPass(bloom);
  const schaerfe = new BokehPass(szene, kamera, { focus: 140, aperture: 0.0, maxblur: 0.008 });
  schaerfe.enabled = false;
  composer.addPass(schaerfe);
  composer.addPass(new OutputPass());
  const abschluss = new ShaderPass(Abschluss);
  composer.addPass(abschluss);

  let breite = 0;
  let hoehe = 0;
  let dichte = 1;
  let dichteGrenze = stufe >= 3 ? 2 : stufe === 2 ? 1.75 : 1.25;

  // Hoehe: auf Mobilgeraeten die grosse Viewport-Hoehe nehmen, damit die
  // Adressleiste beim Scrollen das Bild nicht staucht.
  const sonde = document.createElement("div");
  sonde.style.cssText = "position:fixed;left:0;top:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none";
  document.body.appendChild(sonde);

  function groesse(erzwingen = false) {
    const b = Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.round(sonde.offsetHeight || window.innerHeight));
    if (!erzwingen && b === breite && Math.abs(h - hoehe) < 2) return false;
    breite = b;
    hoehe = h;
    dichte = Math.min(window.devicePixelRatio || 1, dichteGrenze);
    renderer.setPixelRatio(dichte);
    renderer.setSize(b, h, false);
    composer.setPixelRatio(dichte);
    composer.setSize(b, h);
    bloom.resolution.set(b * dichte * 0.5, h * dichte * 0.5);
    kamera.aspect = b / h;
    kamera.updateProjectionMatrix();
    abschluss.uniforms.seiten.value = b / h;
    return true;
  }

  return {
    renderer,
    szene,
    kamera,
    composer,
    bloom,
    schaerfe,
    abschluss,
    groesse,
    get breite() {
      return breite;
    },
    get hoehe() {
      return hoehe;
    },
    dichteSenken() {
      if (dichteGrenze <= 1) return false;
      dichteGrenze = Math.max(1, dichteGrenze - 0.25);
      groesse(true);
      return true;
    },
    zeichnen(sek) {
      abschluss.uniforms.zeit.value = sek;
      composer.render();
    },
  };
}
