import * as THREE from "../vendor/three.module.min.js";
import * as T from "./texturen.js";

// Physikalisch angelehnte Werte. Farben in sRGB, three rechnet linear um.
function textur(bild, { srgb = false, kachel = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(bild);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (kachel) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export async function materialienBauen({ stufe, renderer, schrift, fortschritt = () => {} }) {
  const g = stufe >= 3 ? 2048 : 1024;
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), stufe >= 3 ? 8 : 4);
  const opt = { aniso: maxAniso };

  const blatt = await T.zifferblatt(g, schrift);
  fortschritt(0.2);
  const streifen = await T.streifenschliff(g);
  fortschritt(0.35);
  const perl = await T.perlage(stufe >= 3 ? 2048 : 1024);
  fortschritt(0.5);
  const grav = await T.gravur(g, 9, { x0: -15.2, x1: -7.4, y0: -12.8, y1: -4.1 });
  fortschritt(0.6);
  const leder = await T.leder(stufe >= 3 ? 1024 : 512);
  fortschritt(0.7);
  const boden = await T.bodenGravur(g, schrift);
  const plSchrift = await T.platinenSchrift(g, schrift);
  fortschritt(0.8);

  const M = {};

  M.Stahl_poliert = new THREE.MeshPhysicalMaterial({ name: "Stahl_poliert", color: 0xcfd0d4, metalness: 1, roughness: 0.07 });
  M.Stahl_gebuerstet = new THREE.MeshPhysicalMaterial({
    name: "Stahl_gebuerstet", color: 0xc9cace, metalness: 1, roughness: 0.3, anisotropy: 0.82,
  });
  M.Stahl_dunkel = new THREE.MeshPhysicalMaterial({ name: "Stahl_dunkel", color: 0x6d6f74, metalness: 1, roughness: 0.25 });

  // Gebläuter Stahl: dunkles Blau, Anlauffarbe als Duennschicht
  M.Blaustahl = new THREE.MeshPhysicalMaterial({
    name: "Blaustahl", color: 0x1d40ad, metalness: 1, roughness: 0.09,
    iridescence: 0.6, iridescenceIOR: 1.9, iridescenceThicknessRange: [260, 330],
  });

  const blattFarbe = textur(blatt.farbe, { srgb: true, ...opt });
  const blattNormal = textur(blatt.normal, opt);
  const blattRM = textur(blatt.rauMetall, opt);
  M.Zifferblatt = new THREE.MeshPhysicalMaterial({
    name: "Zifferblatt", color: 0xffffff, map: blattFarbe, normalMap: blattNormal, normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 1, metalness: 1, roughnessMap: blattRM, metalnessMap: blattRM, clearcoat: 0.08, clearcoatRoughness: 0.5,
  });
  M.Hilfsblatt = new THREE.MeshPhysicalMaterial({
    name: "Hilfsblatt", color: 0xffffff, map: blattFarbe, normalMap: blattNormal, normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 1, metalness: 1, roughnessMap: blattRM, metalnessMap: blattRM,
    anisotropy: 1, anisotropyMap: textur(blatt.aniso, opt),
  });

  M.Index = new THREE.MeshPhysicalMaterial({ name: "Index", color: 0xe6e7ea, metalness: 1, roughness: 0.035 });

  M.Saphir = new THREE.MeshPhysicalMaterial({
    name: "Saphir", color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 1.2, ior: 1.77,
    specularIntensity: 0.4, iridescence: 0.55, iridescenceIOR: 1.38, iridescenceThicknessRange: [140, 260],
    envMapIntensity: 1.2,
  });
  M.Saphir_einfach = new THREE.MeshPhysicalMaterial({
    name: "Saphir_einfach", color: 0xffffff, metalness: 0, roughness: 0, transparent: true, opacity: 0.12,
    specularIntensity: 1, iridescence: 0.5, iridescenceIOR: 1.38, iridescenceThicknessRange: [140, 260], depthWrite: false,
  });

  M.Platine = new THREE.MeshPhysicalMaterial({
    name: "Platine", color: 0xd3d4d6, metalness: 1, roughness: 0.3, anisotropy: 1, anisotropyMap: textur(perl.aniso, opt),
    normalMap: textur(perl.normal, opt), normalScale: new THREE.Vector2(0.4, 0.4),
  });

  const plSchriftT = textur(plSchrift, { srgb: true, ...opt });
  M.Neusilber = new THREE.MeshPhysicalMaterial({
    name: "Neusilber", color: 0xdccfb2, metalness: 1, roughness: 1, roughnessMap: textur(streifen.rauMetall, opt),
    anisotropy: 1, anisotropyMap: textur(streifen.aniso, opt), normalMap: textur(streifen.normal, opt),
    normalScale: new THREE.Vector2(0.22, 0.22),
  });
  // Vergoldete Gravur: Goldfarbe ueber die Schriftmaske mischen
  M.Neusilber.onBeforeCompile = (s) => {
    s.uniforms.schriftKarte = { value: plSchriftT };
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D schriftKarte;")
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\n\tfloat schrift = texture2D( schriftKarte, vNormalMapUv ).r;\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.95, 0.66, 0.26 ), schrift );\n\troughnessFactor = mix( roughnessFactor, 0.45, schrift );"
      );
  };
  M.Neusilber.customProgramCacheKey = () => "neusilber-schrift";

  M.Kloben = new THREE.MeshPhysicalMaterial({
    name: "Kloben", color: 0xdccfb2, metalness: 1, roughness: 1, roughnessMap: textur(grav.rauMetall, opt),
    normalMap: textur(grav.normal, opt), normalScale: new THREE.Vector2(0.9, 0.9),
  });

  M.Gold = new THREE.MeshPhysicalMaterial({ name: "Gold", color: 0xf3c47a, metalness: 1, roughness: 0.1 });
  M.Rubin = new THREE.MeshPhysicalMaterial({
    name: "Rubin", color: 0xc8103c, metalness: 0, roughness: 0.04, ior: 1.76, specularIntensity: 1,
    clearcoat: 1, clearcoatRoughness: 0, sheen: 0.6, sheenColor: new THREE.Color(0xff4a7a), emissive: 0x50000f, emissiveIntensity: 1,
  });
  M.Rad = new THREE.MeshPhysicalMaterial({ name: "Rad", color: 0xeec687, metalness: 1, roughness: 0.2, anisotropy: 0.7 });
  M.Unruh = new THREE.MeshPhysicalMaterial({ name: "Unruh", color: 0xe2b27c, metalness: 1, roughness: 0.14 });
  M.Spirale = new THREE.MeshPhysicalMaterial({ name: "Spirale", color: 0x8d93a4, metalness: 1, roughness: 0.22 });

  const lFarbe = textur(leder.farbe, { srgb: true, kachel: true, ...opt });
  const lNormal = textur(leder.normal, { kachel: true, ...opt });
  const lRau = textur(leder.rauMetall, { kachel: true, ...opt });
  
  M.Leder = new THREE.MeshPhysicalMaterial({
    name: "Leder", color: 0xffffff, map: lFarbe, normalMap: lNormal, normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1, roughnessMap: lRau, metalness: 0, sheen: 0.2, sheenRoughness: 0.4, sheenColor: new THREE.Color(0x5a3a28), clearcoat: 0.15, clearcoatRoughness: 0.5,
  });

  M.Boden_gebuerstet = new THREE.MeshPhysicalMaterial({
    name: "Boden_gebuerstet", color: 0xc9cace, metalness: 1, roughness: 1, roughnessMap: textur(boden.rauMetall, opt),
    anisotropy: 1, anisotropyMap: textur(boden.aniso, opt), normalMap: textur(boden.normal, opt), normalScale: new THREE.Vector2(0.6, 0.6),
  });

  fortschritt(0.9);
  return M;
}
