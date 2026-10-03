#!/usr/bin/env python3

import os
import re
import sys
import urllib.parse

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IGNORIEREN = {".git", "node_modules", "scripts", ".github", "__pycache__"}

ZIEL_BYTES = 800 * 1024
GRENZE_BYTES = 1500 * 1024

IMG_TAG = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
ATTR = re.compile(r'\b([a-zA-Z-]+)\s*=\s*"([^"]*)"')
A_TAG = re.compile(r"<a\b[^>]*>", re.IGNORECASE)
HREF_SRC = re.compile(r'\b(?:href|src|imagesrcset|srcset)\s*=\s*"([^"]+)"', re.IGNORECASE)
CSS_URL = re.compile(r"url\(\s*['\"]?([^'\")]+)", re.IGNORECASE)
CSS_IMPORT = re.compile(r"@import\s+['\"]([^'\"]+)", re.IGNORECASE)
PLATZHALTER = re.compile(r"\[PLATZHALTER[^\]]*\]")

def rel(pfad):
    return os.path.relpath(pfad, WURZEL).replace("\\", "/")

def dateien(endung):
    for wurzel, ordner, namen in os.walk(WURZEL):
        ordner[:] = [o for o in ordner if o not in IGNORIEREN and not o.startswith(".")]
        for name in namen:
            if name.endswith(endung):
                yield os.path.join(wurzel, name)

def lesen(pfad):
    with open(pfad, encoding="utf-8") as f:
        return f.read()

def ist_extern(ziel):
    ziel = ziel.strip()
    return ziel.startswith(("http://", "https://", "//"))

def pruefe_externe_ressourcen():
    fehler, hinweise = [], []

    for pfad in dateien(".html"):
        inhalt = lesen(pfad)
        a_hrefs = set()
        for tag in A_TAG.findall(inhalt):
            for name, wert in ATTR.findall(tag):
                if name.lower() == "href":
                    a_hrefs.add(wert)

        for treffer in HREF_SRC.findall(inhalt):
            for teil in treffer.split(","):
                ziel = teil.strip().split(" ")[0]
                if not ist_extern(ziel):
                    continue
                if ziel in a_hrefs:
                    hinweise.append(f"{rel(pfad)}: Link nach aussen — {ziel}")
                else:
                    fehler.append(f"{rel(pfad)}: externe Ressource — {ziel}")

    for pfad in dateien(".css"):
        inhalt = lesen(pfad)
        for ziel in CSS_URL.findall(inhalt) + CSS_IMPORT.findall(inhalt):
            if ist_extern(ziel):
                fehler.append(f"{rel(pfad)}: externe Ressource — {ziel}")

    return fehler, hinweise

PFLICHT = [
    ("lang-Attribut", lambda s: re.search(r"<html[^>]+lang=", s, re.I)),
    ("viewport", lambda s: re.search(r'name="viewport"', s, re.I)),
    ("title", lambda s: re.search(r"<title>\s*\S", s, re.I)),
    ("description", lambda s: re.search(r'name="description"[^>]+content="\s*\S', s, re.I)),
    ("Content-Security-Policy", lambda s: "Content-Security-Policy" in s),
    ("Sprunglink", lambda s: 'class="sprunglink"' in s),
    ("Impressum-Link", lambda s: re.search(r'href="[^"]*impressum/', s, re.I)),
    ("Datenschutz-Link", lambda s: re.search(r'href="[^"]*datenschutz/', s, re.I)),
]

def pruefe_struktur():
    fehler = []
    seiten = 0
    for pfad in dateien(".html"):
        seiten += 1
        inhalt = lesen(pfad)
        for name, pruefung in PFLICHT:
            if not pruefung(inhalt):
                fehler.append(f"{rel(pfad)}: {name} fehlt")
    return seiten, fehler

def pruefe_bilder():
    fehler, warnungen = [], []
    gezaehlt = 0
    for pfad in dateien(".html"):
        inhalt = lesen(pfad)
        ordner = os.path.dirname(pfad)
        for tag in IMG_TAG.findall(inhalt):
            gezaehlt += 1
            werte = dict((n.lower(), w) for n, w in ATTR.findall(tag))
            if "alt" not in werte:
                fehler.append(f"{rel(pfad)}: <img> ohne alt")
            elif not werte["alt"].strip():
                warnungen.append(f"{rel(pfad)}: leerer alt-Text — {werte.get('src','?')}")
            if "width" not in werte or "height" not in werte:
                fehler.append(
                    f"{rel(pfad)}: <img> ohne width/height — {werte.get('src', '?')}"
                )
            quelle = werte.get("src", "")
            if quelle and not ist_extern(quelle) and not quelle.startswith("data:"):
                ziel = os.path.normpath(os.path.join(ordner, quelle.split("?")[0]))
                if not os.path.exists(ziel):
                    fehler.append(f"{rel(pfad)}: Bilddatei fehlt — {quelle}")
    return gezaehlt, fehler, warnungen

def pruefe_links():
    fehler = []
    gezaehlt = 0
    for pfad in dateien(".html"):
        inhalt = lesen(pfad)
        ordner = os.path.dirname(pfad)
        for treffer in HREF_SRC.findall(inhalt):
            for teil in treffer.split(","):
                ziel = teil.strip().split(" ")[0]
                if not ziel or ist_extern(ziel):
                    continue
                if ziel.startswith(("#", "mailto:", "tel:", "data:")):
                    continue
                gezaehlt += 1
                pfad_teil = urllib.parse.urlparse(ziel).path
                if not pfad_teil:
                    continue
                aufgeloest = os.path.normpath(os.path.join(ordner, pfad_teil))
                if not os.path.exists(aufgeloest):
                    fehler.append(f"{rel(pfad)}: toter Link — {ziel}")
    return gezaehlt, fehler

def erster_aufruf():
    start = os.path.join(WURZEL, "index.html")
    if not os.path.exists(start):
        return None, []
    inhalt = lesen(start)
    posten = []
    gesamt = len(inhalt.encode("utf-8"))
    posten.append(("index.html", gesamt))

    for treffer in re.findall(r'<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"', inhalt):
        if ist_extern(treffer) or treffer.startswith("data:"):
            continue
        ziel = os.path.normpath(os.path.join(WURZEL, treffer.split("?")[0]))
        if os.path.exists(ziel) and ziel.endswith((".css", ".js")):
            groesse = os.path.getsize(ziel)
            gesamt += groesse
            posten.append((treffer, groesse))

    schriften = os.path.join(WURZEL, "assets", "fonts")
    if os.path.isdir(schriften):
        for name in os.listdir(schriften):
            if name.endswith(".woff2"):
                groesse = os.path.getsize(os.path.join(schriften, name))
                gesamt += groesse
                posten.append((f"assets/fonts/{name}", groesse))

    for tag in IMG_TAG.findall(inhalt):
        werte = dict((n.lower(), w) for n, w in ATTR.findall(tag))
        if werte.get("loading") == "lazy":
            continue
        quelle = werte.get("src", "")
        if not quelle or ist_extern(quelle):
            continue
        ziel = os.path.normpath(os.path.join(WURZEL, quelle.split("?")[0]))
        if os.path.exists(ziel):
            groesse = os.path.getsize(ziel)
            gesamt += groesse
            posten.append((quelle, groesse))

    posten.sort(key=lambda p: -p[1])
    return gesamt, posten

def zaehle_platzhalter():
    treffer = {}
    for endung in (".html", ".js", ".md"):
        for pfad in dateien(endung):
            anzahl = len(PLATZHALTER.findall(lesen(pfad)))
            if anzahl:
                treffer[rel(pfad)] = anzahl
    return treffer

def block(titel):
    print(f"\n{titel}")
    print("-" * len(titel))

def haupt():
    print("Vollpruefung —", os.path.basename(WURZEL))
    hart = 0

    block("1. Externe Ressourcen")
    fehler, hinweise = pruefe_externe_ressourcen()
    if fehler:
        hart += len(fehler)
        for f in fehler:
            print("  FEHLER ", f)
    else:
        print("  Keine. Beim Aufruf wird nichts von fremden Servern geladen.")
    for h in sorted(set(hinweise)):
        print("  Hinweis", h)

    block("2. Pflichtteile je Seite")
    seiten, fehler = pruefe_struktur()
    if fehler:
        hart += len(fehler)
        for f in fehler:
            print("  FEHLER ", f)
    else:
        print(f"  {seiten} Seiten, alle Pflichtteile vorhanden.")

    block("3. Bilder")
    anzahl, fehler, warnungen = pruefe_bilder()
    if fehler:
        hart += len(fehler)
        for f in fehler:
            print("  FEHLER ", f)
    else:
        print(f"  {anzahl} <img>-Tags, alle mit alt, width, height und Datei.")
    for w in warnungen:
        print("  Warnung", w)

    block("4. Interne Links")
    anzahl, fehler = pruefe_links()
    if fehler:
        hart += len(fehler)
        for f in fehler:
            print("  FEHLER ", f)
    else:
        print(f"  {anzahl} interne Verweise, alle loesen auf.")

    block("5. Gewicht des ersten Aufrufs")
    gesamt, posten = erster_aufruf()
    if gesamt is None:
        print("  index.html nicht gefunden.")
    else:
        kb = gesamt / 1024
        stand = (
            "OK (unter Ziel)"
            if gesamt < ZIEL_BYTES
            else "knapp" if gesamt < GRENZE_BYTES else "ZU SCHWER"
        )
        if gesamt >= GRENZE_BYTES:
            hart += 1
        print(f"  {kb:.1f} KB   Ziel < {ZIEL_BYTES // 1024} KB, "
              f"Grenze < {GRENZE_BYTES // 1024} KB   {stand}")
        for name, groesse in posten[:6]:
            print(f"    {groesse / 1024:8.1f} KB  {name}")

    block("6. Verbliebene Platzhalter")
    treffer = zaehle_platzhalter()
    if treffer:
        summe = sum(treffer.values())
        print(f"  {summe} Platzhalter in {len(treffer)} Dateien.")
        print("  Das ist kein Fehler: sie markieren, was der Betrieb liefern muss.")
        for name, anzahl in sorted(treffer.items(), key=lambda p: -p[1]):
            print(f"    {anzahl:3d}  {name}")
    else:
        print("  Keine.")

    print()
    if hart:
        print(f"Ergebnis: {hart} Fehler.")
        return 1
    print("Ergebnis: OK")
    return 0

if __name__ == "__main__":
    sys.exit(haupt())
