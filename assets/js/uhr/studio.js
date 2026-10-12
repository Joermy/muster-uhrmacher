import * as THREE from "../vendor/three.module.min.js";

// Lichtzelt fuer Metall. Der sichtbare Hintergrund bleibt schwarz, die
// Umgebung, die sich in den Teilen spiegelt, ist ein heller Raum mit weichen
// Verlaeufen, grossen Leuchtflaechen und schwarzen Fahnen. So bekommen ebene
// Platten Licht und polierte Fasen klare Kanten.

function verlauf(kante = 0.35, buckel = 0.2) {
  const g = 256;
  const c = document.createElement("canvas");
  c.width = c.height = g;
  const k = c.getContext("2d");
  const bild = k.createImageData(g, g);
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const u = Math.abs(x / (g - 1) - 0.5) * 2;
      const v = Math.abs(y / (g - 1) - 0.5) * 2;
      const fu = 1 - THREE.MathUtils.smoothstep(u, 1 - kante, 1);
      const fv = 1 - THREE.MathUtils.smoothstep(v, 1 - kante, 1);
      const w = fu * fv * (1 - buckel + buckel * (1 - v * v));
      const i = (y * g + x) * 4;
      bild.data[i] = bild.data[i + 1] = bild.data[i + 2] = w * 255;
      bild.data[i + 3] = 255;
    }
  }
  k.putImageData(bild, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function studioBauen(renderer) {
  const raum = new THREE.Scene();

  const kuppel = new THREE.Mesh(
    new THREE.SphereGeometry(60, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: "varying vec3 vR; void main(){ vR = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `varying vec3 vR;
        void main(){
          float h = vR.y;
          vec3 decke = vec3(0.30, 0.31, 0.33);
          vec3 mitte = vec3(0.10, 0.105, 0.115);
          vec3 boden = vec3(0.012, 0.012, 0.014);
          vec3 c = h > 0.0 ? mix(mitte, decke, smoothstep(0.0, 0.9, h)) : mix(mitte, boden, smoothstep(0.0, -0.45, h));
          // kuehler Schimmer hinten, warmer vorn
          c *= mix(vec3(0.94, 0.97, 1.04), vec3(1.05, 1.0, 0.95), smoothstep(-1.0, 1.0, vR.z));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  raum.add(kuppel);

  const weich = verlauf(0.55, 0.3);
  const scharf = verlauf(0.12, 0.1);
  const flaeche = (b, h, farbe, staerke, pos, karte = weich) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(farbe).multiplyScalar(staerke), map: karte, side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(b, h), m);
    p.position.set(...pos);
    p.lookAt(0, 0, 0);
    raum.add(p);
    return p;
  };
  const fahne = (b, h, pos) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(b, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.014), side: THREE.DoubleSide }));
    p.position.set(...pos);
    p.lookAt(0, 0, 0);
    raum.add(p);
  };

  // grosse Softbox oben, leicht vorn
  flaeche(34, 16, 0xffffff, 2.3, [0, 22, 6]);
  // Frontlicht hinter der Kamera fuer ebene Platten
  flaeche(38, 22, 0xfff6ee, 1.1, [0, 4, 26]);
  // Streiflichter
  flaeche(2.6, 34, 0xffffff, 5.0, [-20, 2, 8], scharf);
  flaeche(2.0, 30, 0xfff1e2, 4.0, [19, -2, 10], scharf);
  // kuehles Gegenlicht
  flaeche(26, 5, 0xc4d8ff, 2.0, [0, 8, -22]);
  // warme Werkstattlampe seitlich hinten
  flaeche(8, 8, 0xffc98a, 2.2, [-16, 4, -14]);
  // schwarze Fahnen geben polierten Kanten Kontrast
  fahne(3, 40, [-15, 0, 21]);
  fahne(3, 40, [15, 0, 21]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(raum, 0.03).texture;
  pmrem.dispose();

  const sonne = new THREE.DirectionalLight(0xfff6ec, 1.6);
  sonne.position.set(-28, 70, 46);
  sonne.castShadow = true;
  sonne.shadow.camera.left = sonne.shadow.camera.bottom = -34;
  sonne.shadow.camera.right = sonne.shadow.camera.top = 34;
  sonne.shadow.camera.near = 20;
  sonne.shadow.camera.far = 170;
  sonne.shadow.bias = -0.0004;
  sonne.shadow.normalBias = 0.02;
  sonne.shadow.radius = 3;

  const kante = new THREE.DirectionalLight(0xbcd4ff, 0.5);
  kante.position.set(40, -10, -40);

  return { env, sonne, kante };
}
