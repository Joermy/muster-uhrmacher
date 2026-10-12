import * as THREE from "../vendor/three.module.min.js";
import { buehneBauen, stufeErmitteln } from "./buehne.js";
import { studioBauen } from "./studio.js";
import { materialienBauen } from "./materialien.js";
import { modellHolen, modellEinrichten } from "./modell.js";
import { werkBauen } from "./werk.js";
import { zerlegerBauen } from "./zerlegen.js";

export async function uhrStarten({ canvas, fortschritt = () => {}, schrift = "Geist, sans-serif" }) {
  let stufe = stufeErmitteln();
  const b = buehneBauen(canvas, stufe);
  b.groesse(true);
  const { renderer, szene, kamera } = b;

  const studio = studioBauen(renderer);
  szene.environment = studio.env;
  szene.environmentIntensity = 1.0;
  szene.add(studio.sonne, studio.sonne.target, studio.kante);
  studio.sonne.shadow.mapSize.set(stufe >= 3 ? 2048 : 1024, stufe >= 3 ? 2048 : 1024);

  // Modell laden, waehrend die Oberflaechen entstehen
  let fModell = 0;
  let fMat = 0;
  const melden = () => fortschritt(fModell * 0.45 + fMat * 0.45);
  const modellUrl = new URL("../../modelle/uhr.glb", import.meta.url).href;
  const gltfVersprechen = modellHolen(modellUrl, (f) => {
    fModell = f;
    melden();
  });
  // Schrift fuer den Zifferblattdruck muss geladen sein (Modell laedt parallel)
  try {
    await Promise.all([document.fonts.load(`650 40px ${schrift}`), document.fonts.load(`500 40px ${schrift}`)]);
  } catch (e) {
    /* Systemschrift */
  }

  const M = await materialienBauen({ stufe, renderer, schrift, fortschritt: (f) => {
    fMat = f;
    melden();
  } });
  const gltf = await gltfVersprechen;
  fModell = 1;
  melden();
  const { wurzel, teile } = modellEinrichten(gltf, M, { stufe });

  // Rahmen: Uhrachse +Z, 12 Uhr +Y, 3 Uhr +X, Einheit Millimeter
  const lage = new THREE.Group();
  const uhr = new THREE.Group();
  uhr.rotation.x = Math.PI / 2;
  uhr.add(wurzel);
  lage.add(uhr);
  szene.add(lage);

  const werk = werkBauen(teile);
  const zerleger = zerlegerBauen(teile);

  // Shader vorab uebersetzen, damit der erste Scroll nicht ruckelt
  try {
    await renderer.compileAsync(szene, kamera);
  } catch (e) {
    renderer.compile(szene, kamera);
  }
  fortschritt(1);

  return { b, renderer, szene, kamera, studio, M, teile, lage, uhr, werk, zerleger, stufe };
}
