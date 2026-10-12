# Atelier Kessler — Musterwebsite

Eine Musterwebsite für eine Uhrmacherei in Peine. Der Betrieb ist frei erfunden: Name,
Personen, Anschrift, Telefonnummer, Preise, Kundenstimme, Kammer- und Verzeichnisnummern
gibt es nicht. Die Seite gehört zu keinem Kundenauftrag und bietet nichts an.

Statisches HTML, CSS und JavaScript. Kein Framework, kein Build-Schritt, keine externe
Ressource — Schriften, Bilder, Three.js, Lenis und das 3D-Modell liegen im Ordner.

## Das Besondere

Auf der Startseite steht die **Kessler K-1**, eine Handaufzugsuhr, die vollständig als
3D-Modell gebaut ist: 39-mm-Stahlgehäuse mit polierten Fasen, gewölbtes Saphirglas,
gekörntes Zifferblatt mit kleiner Sekunde, gebläute Lanzettzeiger, Lederband mit Naht und
ein Glashütter Werk mit Dreiviertelplatine, Goldchatons, Ankerhemmung und Schraubenunruh.

Beim Scrollen erzählt die Seite eine Revision in fünf Kapiteln:

1. **Öffnen** — der Boden schraubt sich ab, das Werk liegt frei
2. **Reinigen** — die Uhr zerlegt sich in ihre Ebenen
3. **Prüfen** — Räder, Ankerrad und Anker liegen beschriftet nebeneinander
4. **Ölen** — ein Öler setzt einen Tropfen auf den Lagerstein
5. **Regulieren** — Nahaufnahme der Unruh, auf der Zeitwaage glättet sich die Gangkurve

Das Werk läuft mit 28 800 Halbschwingungen pro Stunde, die Spirale atmet mit, die Zeiger
zeigen die Ortszeit von Peine. Ziehen im Startbild dreht die Uhr.

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `scripts/modell-bauen.py` | baut das Modell in Blender (über `pip install bpy`) und exportiert `uhr-roh.glb` |
| `assets/modelle/uhr.glb` | komprimiertes Modell (gltfpack, Meshopt) |
| `assets/js/uhr/texturen.js` | erzeugt Streifenschliff, Perlage, Gravur, Zifferblattdruck und Leder im Browser |
| `assets/js/uhr/materialien.js` | Materialien: Anisotropie, gebläuter Stahl, Saphir, Rubin |
| `assets/js/uhr/studio.js` | Lichtzelt für Metall und Schattenlicht |
| `assets/js/uhr/werk.js` | Gangwerk: Unruh, Anker, Räder, Spirale, Zeiger |
| `assets/js/uhr/zerlegen.js` | Explosionsansicht, Boden, Ablage |
| `assets/js/uhr/regie.js` | Kamerafahrt über die Kapitel |
| `assets/js/uhr/seite.js` | Lader, Scroll, Beschriftungen, Öler, Leistungswächter |
| `assets/js/uhr/zeitwaage.js` | Anzeige der Zeitwaage |

## Geräte

Die Qualität richtet sich nach dem Gerät: Desktop mit voller Auflösung, Lichtbrechung im
Glas und Tiefenschärfe, Telefone mit kleineren Texturen und ohne Lichtbrechung. Fällt die
Bildrate, senkt ein Wächter Schritt für Schritt Tiefenschärfe, Auflösung, Glühen und
Schatten. Ohne WebGL 2 steht ein gerendertes Standbild, die Kapitel stehen dann als Liste.
Bei reduzierter Bewegung entfallen Intro, weiches Scrollen und Schwanken.

## Ansehen

Doppelklick auf `Start Website.bat`, oder:

```bash
python scripts/dev-server.py 8093
```

Dann `http://localhost:8093` öffnen.

## Modell neu bauen

```bash
pip install bpy
python scripts/modell-bauen.py
npx gltfpack -i assets/modelle/uhr-roh.glb -o assets/modelle/uhr.glb -cc -kn -km -kv -vtf
```

## Prüfen

```bash
python scripts/pruefen.py
```

## Bilder

Die Fotos stammen von Unsplash und zeigen nicht diesen Betrieb. Urheber und Lizenz stehen
im Impressum der Seite.

## Suchmaschinen

Die Seite steht auf `noindex`, `robots.txt` verbietet das Einlesen. Ein erfundener Betrieb
soll nicht in Suchergebnissen auftauchen.

## Lizenzen

- Schriften Geist und Geist Mono: SIL Open Font License 1.1
- Three.js: MIT-Lizenz, `assets/js/vendor/LICENSE-three.txt`
- Lenis: MIT-Lizenz, `assets/js/vendor/LICENSE-lenis.txt`
