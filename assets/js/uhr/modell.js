import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader, MeshoptDecoder } from "../vendor/three-zusatz.min.js";

// Schliffrichtung je Teil (fuer Teile ohne Normalenkarte): bestimmt die
// Tangente, entlang der die Spiegelung verwischt. Rillen liegen quer dazu.
//   umfang: Rillen radial (Sonnenschliff, Flanken)  -> Unschaerfe im Umfang
//   radial: Rillen konzentrisch (Kreisschliff)      -> Unschaerfe radial
const SCHLIFF = {
  Gehaeuse: "umfang",
  Sperrrad: "umfang",
  Kronrad: "umfang",
  Rad_mitte: "radial",
  Rad_dritt: "radial",
  Rad_viert: "radial",
  Federhaus: "radial",
};

export const TEILE = [
  "Glas", "Luenette", "Minutenzeiger", "Stundenzeiger", "Sekundenzeiger", "Indizes", "Zifferblatt",
  "Gehaeuse", "Krone", "Platine", "Rad_mitte", "Rad_dritt", "Rad_viert", "Federhaus", "Ankerrad", "Anker",
  "Dreiviertelplatine", "Sperrrad", "Kronrad", "Ankerkloben", "Unruh", "Spirale", "Unruhkloben", "Boden",
  "Band_oben", "Band_unten",
];

// Quantisierte Geometrie (gltfpack) in Gleitkomma zurueckwandeln und die
// Entquantisierungs-Transformation der Kindknoten in die Geometrie backen.
function entpacken(teil) {
  teil.updateMatrixWorld(true);
  const netze = [];
  teil.traverse((k) => {
    if (k.isMesh) netze.push(k);
  });
  for (const netz of netze) {
    const geo = netz.geometry;
    for (const name of Object.keys(geo.attributes)) {
      const a = geo.attributes[name];
      if (a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array) || a.normalized) {
        const neu = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) {
          for (let c = 0; c < a.itemSize; c++) neu[i * a.itemSize + c] = a.getComponent(i, c);
        }
        geo.setAttribute(name, new THREE.BufferAttribute(neu, a.itemSize));
      }
    }
    if (netz !== teil) {
      // Matrix relativ zum Teil
      const rel = new THREE.Matrix4().copy(teil.matrixWorld).invert().multiply(netz.matrixWorld);
      geo.applyMatrix4(rel);
      if (netz.parent !== teil) teil.add(netz);
      netz.position.set(0, 0, 0);
      netz.quaternion.identity();
      netz.scale.set(1, 1, 1);
      netz.updateMatrix();
    }
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }
  return netze;
}

function tangentenSetzen(geo, art, mitte) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const t = new Float32Array(pos.count * 4);
  const n = new THREE.Vector3();
  const r = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    // Modellraum: Uhrachse ist +Y (glTF), 12 Uhr liegt auf -Z
    const x = pos.getX(i) - mitte.x;
    const z = pos.getZ(i) - mitte.z;
    n.fromBufferAttribute(nor, i);
    if (art === "umfang") r.set(-z, 0, x);
    else r.set(x, 0, z);
    if (r.lengthSq() < 1e-8) r.set(1, 0, 0);
    tan.copy(r).addScaledVector(n, -n.dot(r));
    if (tan.lengthSq() < 1e-8) tan.set(1, 0, 0).addScaledVector(n, -n.x);
    tan.normalize();
    t[i * 4] = tan.x;
    t[i * 4 + 1] = tan.y;
    t[i * 4 + 2] = tan.z;
    t[i * 4 + 3] = 1;
  }
  geo.setAttribute("tangent", new THREE.BufferAttribute(t, 4));
}

export function modellHolen(url, fortschritt = () => {}) {
  const lader = new GLTFLoader();
  lader.setMeshoptDecoder(MeshoptDecoder);
  return lader.loadAsync(url, (e) => {
    if (e.total) fortschritt(e.loaded / e.total);
  });
}

export function modellEinrichten(gltf, M, { stufe }) {
  const wurzel = gltf.scene;
  const teile = {};
  for (const name of TEILE) {
    const obj = wurzel.getObjectByName(name);
    if (!obj) continue;
    teile[name] = obj;
    const netze = entpacken(obj);
    for (const netz of netze) {
      const ersetzen = (m) => {
        let nm = m && m.name;
        if (name === "Boden" && nm === "Stahl_gebuerstet") nm = "Boden_gebuerstet";
        // Lichtbrechung kostet einen zweiten Renderdurchgang, nur auf starken Geraeten
        if (nm === "Saphir" && stufe < 3) nm = "Saphir_einfach";
        return M[nm] || m;
      };
      netz.material = Array.isArray(netz.material) ? netz.material.map(ersetzen) : ersetzen(netz.material);
      if (SCHLIFF[name]) tangentenSetzen(netz.geometry, SCHLIFF[name], new THREE.Vector3());
      const glas = netz.material && (netz.material.name || "").startsWith("Saphir");
      netz.castShadow = !glas && !name.startsWith("Band");
      netz.receiveShadow = !glas;
      if (name === "Spirale") {
        netz.geometry.userData.basis = netz.geometry.attributes.position.array.slice();
        netz.geometry.userData.basisNormal = netz.geometry.attributes.normal.array.slice();
        netz.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
        netz.geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
        netz.frustumCulled = false;
      }
    }
    obj.userData.basis = { p: obj.position.clone(), q: obj.quaternion.clone() };
  }
  // Glas-Teile im Boden-Objekt (Bodenscheibe) sollen keine Schatten werfen
  return { wurzel, teile };
}
