#!/usr/bin/env python3
"""Erzeugt sitemap.xml aus den tatsaechlich vorhandenen Seiten."""

import argparse
import datetime
import pathlib
import sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent

DOMAIN_DATEI = WURZEL / "daten" / "domain.txt"

def domain_lesen() -> str:
    if not DOMAIN_DATEI.exists():
        return ""
    return DOMAIN_DATEI.read_text(encoding="utf-8").strip().rstrip("/")

DOMAIN = domain_lesen()

AUSGESCHLOSSEN = set()

AUSGESCHLOSSENE_ORDNER = ("demo/",)

GEWICHT = {
    "index.html": "1.0",
    "leistungen/index.html": "0.9",
    "projekte/index.html": "0.9",
    "kontakt/index.html": "0.8",
    "ueber-uns/index.html": "0.7",
}
STANDARD_GEWICHT = "0.7"

def seiten_sammeln() -> list[str]:
    gefunden = []
    for pfad in sorted(WURZEL.rglob("*.html")):
        if ".bak" in pfad.name:
            continue
        rel = pfad.relative_to(WURZEL).as_posix()
        if rel in AUSGESCHLOSSEN:
            continue
        if any(rel.startswith(o) for o in AUSGESCHLOSSENE_ORDNER):
            continue
        gefunden.append(rel)

    def schluessel(rel: str):
        return (float(GEWICHT.get(rel, STANDARD_GEWICHT)) * -1, rel)

    return sorted(gefunden, key=schluessel)

def sitemap_bauen(seiten: list[str], datum: str) -> str:
    zeilen = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for rel in seiten:
        gewicht = GEWICHT.get(rel, STANDARD_GEWICHT)
        zeilen.append(
            f"  <url><loc>{DOMAIN}/{rel}</loc>"
            f"<lastmod>{datum}</lastmod>"
            f"<priority>{gewicht}</priority></url>"
        )
    zeilen.append("</urlset>")
    return "\n".join(zeilen) + "\n"

def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument("--pruefen", action="store_true",
                          help="nur melden, ob die Datei aktuell ist")
    argumente = zerleger.parse_args()

    seiten = seiten_sammeln()
    ziel = WURZEL / "sitemap.xml"

    if argumente.pruefen:
        vorhanden = set()
        if ziel.exists():
            for zeile in ziel.read_text(encoding="utf-8").splitlines():
                if "<loc>" in zeile:
                    adresse = zeile.split("<loc>")[1].split("</loc>")[0]
                    vorhanden.add(adresse.split("/", 3)[-1])

        fehlt = [s for s in seiten if s not in vorhanden]
        zuviel = [s for s in sorted(vorhanden) if s not in seiten]

        for s in fehlt:
            print(f"fehlt in sitemap.xml: {s}")
        for s in zuviel:
            print(f"steht zu Unrecht in sitemap.xml: {s}")

        if fehlt or zuviel:
            print(f"\n{len(fehlt)} fehlend, {len(zuviel)} ueberfluessig")
            return 1

        print(f"sitemap.xml ist aktuell: {len(seiten)} Seiten")
        return 0

    if not DOMAIN:
        print("Keine Domain hinterlegt. Trag sie in daten/domain.txt ein,")
        print("zum Beispiel: https://beispiel.de")
        print("Ohne Domain laesst sich keine gueltige sitemap.xml schreiben,")
        print("weil <loc> eine vollstaendige Adresse verlangt.")
        return 1

    datum = datetime.date.today().isoformat()
    ziel.write_text(sitemap_bauen(seiten, datum), encoding="utf-8")
    print(f"sitemap.xml geschrieben: {len(seiten)} Seiten, Stand {datum}")
    for rel in seiten:
        print(f"  {rel}")
    if DOMAIN.endswith(".example"):
        print("\nHINWEIS: DOMAIN in diesem Skript steht noch auf einem Platzhalter.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
