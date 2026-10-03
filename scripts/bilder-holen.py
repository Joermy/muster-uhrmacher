#!/usr/bin/env python3
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageStat

WURZEL = Path(__file__).resolve().parent.parent
BILDER = WURZEL / "bilder"
QUELLEN = BILDER / "quellen.json"

LADEBREITE = 2400
QUALITAET = 74
HELLIGKEIT_MIN = 74
AUFHELLUNG_MAX = 1.35

def verhaeltnis(text):
    a, b = text.split(":")
    return int(a) / int(b)

def lade(kid, breite=LADEBREITE):
    url = (f"https://images.unsplash.com/{kid}"
           f"?w={breite}&q=85&fm=jpg&fit=max&auto=format")
    erg = subprocess.run(
        ["curl", "-sL", "--max-time", "90", "--retry", "2", url],
        capture_output=True)
    if erg.returncode != 0 or len(erg.stdout) < 5000:
        raise RuntimeError(f"Download fehlgeschlagen ({len(erg.stdout)} Bytes)")
    return Image.open(io.BytesIO(erg.stdout)).convert("RGB")

def zuschneiden(bild, ziel):
    b, h = bild.size
    ist = b / h
    if abs(ist - ziel) < 0.001:
        return bild
    if ist > ziel:
        neu_b = int(round(h * ziel))
        links = (b - neu_b) // 2
        return bild.crop((links, 0, links + neu_b, h))
    neu_h = int(round(b / ziel))
    oben = (h - neu_h) // 3
    return bild.crop((0, oben, b, oben + neu_h))

def durchschnittsfarbe(bild):
    klein = bild.resize((1, 1), Image.LANCZOS)
    r, g, b = klein.getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"

def main():
    neu = "--neu" in sys.argv
    daten = json.loads(QUELLEN.read_text(encoding="utf-8"))
    BILDER.mkdir(exist_ok=True)

    nachweise = {"lizenz": daten["lizenz"], "bilder": {}}
    gesamt = 0

    for eintrag in daten["bilder"]:
        name = eintrag["datei"]
        ziel = verhaeltnis(eintrag["verhaeltnis"])
        breiten = sorted(eintrag["breiten"])
        fehlend = [b for b in breiten
                   if not (BILDER / f"{name}-{b}.webp").exists()]

        if fehlend or neu:
            try:
                original = lade(eintrag["kid"])
            except Exception as fehler:
                print(f"  FEHLER  {name}: {fehler}")
                continue
            zug = zuschneiden(original, ziel)
            mittel = ImageStat.Stat(zug.convert("L")).mean[0]
            if mittel < HELLIGKEIT_MIN:
                faktor = min(HELLIGKEIT_MIN / max(mittel, 1), AUFHELLUNG_MAX)
                zug = ImageEnhance.Brightness(zug).enhance(faktor)
                print(f"  {name}: Helligkeit {mittel:.0f} -> Faktor {faktor:.2f}")
            farbe = durchschnittsfarbe(zug)
            for b in breiten:
                h = int(round(b / ziel))
                aus = zug.resize((b, h), Image.LANCZOS)
                pfad = BILDER / f"{name}-{b}.webp"
                aus.save(pfad, "WEBP", quality=QUALITAET, method=6)
                print(f"  {pfad.name:34s} {b}x{h}  {pfad.stat().st_size // 1024} KB")
        else:
            probe = Image.open(BILDER / f"{name}-{breiten[0]}.webp").convert("RGB")
            farbe = durchschnittsfarbe(probe)
            print(f"  {name:34s} vorhanden")

        gesamt += sum((BILDER / f"{name}-{b}.webp").stat().st_size
                      for b in breiten
                      if (BILDER / f"{name}-{b}.webp").exists())

        gross = breiten[-1]
        hoehe = int(round(gross / ziel))
        nachweise["bilder"][name] = {
            "autor": eintrag["autor"],
            "profil": eintrag["profil"],
            "quelle": eintrag["quelle"],
            "alt": eintrag["alt"],
            "breiten": breiten,
            "breite": gross,
            "hoehe": hoehe,
            "verhaeltnis": eintrag["verhaeltnis"],
            "farbe": farbe,
        }

    (BILDER / "nachweise.json").write_text(
        json.dumps(nachweise, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(nachweise['bilder'])} Bilder, {gesamt / 1024 / 1024:.1f} MB auf der Platte")

    js = ("\n"
          "window.BILDER = "
          + json.dumps(nachweise["bilder"], ensure_ascii=False, indent=1)
          + ";\n")
    (WURZEL / "daten" / "bilder.js").write_text(js, encoding="utf-8")
    print("bilder/nachweise.json und daten/bilder.js geschrieben")

if __name__ == "__main__":
    main()
