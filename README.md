# Atelier Kessler — Musterwebsite

Eine Musterwebsite für eine Uhrmacherei in Peine. Der Betrieb ist frei erfunden: Name,
Personen, Anschrift, Telefonnummer, Preise, Kundenstimme, Kammer- und Verzeichnisnummern
gibt es nicht. Die Seite gehört zu keinem Kundenauftrag und bietet nichts an.

Statisches HTML, CSS und JavaScript. Kein Framework, kein Build-Schritt, keine externe
Ressource — Schriften, Bilder, Three.js und das 3D-Modell liegen im Ordner.

## Das Besondere

Die Uhr auf der Startseite ist ein eigenes 3D-Modell aus Blender (`assets/modelle/uhr.glb`,
19 benannte Einzelteile). Beim Scrollen zerlegt sie sich in eine Explosionsansicht und setzt
sich wieder zusammen; die Zeiger zeigen die echte Uhrzeit, Räder und Unruh laufen.

## Ansehen

Doppelklick auf `Start Website.bat`, oder:

```bash
python scripts/dev-server.py 8093
```

Dann `http://localhost:8093` öffnen.

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
