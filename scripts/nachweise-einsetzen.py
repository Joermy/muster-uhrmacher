#!/usr/bin/env python3

import html
import json
import pathlib

WURZEL = pathlib.Path(__file__).resolve().parent.parent
IMPRESSUM = WURZEL / "impressum" / "index.html"
NACHWEISE = WURZEL / "bilder" / "nachweise.json"

ANFANG = "<!-- NACHWEISE:ANFANG -->"
ENDE = "<!-- NACHWEISE:ENDE -->"

def bauen() -> str:
    daten = json.loads(NACHWEISE.read_text(encoding="utf-8"))
    lizenz = daten["lizenz"]
    bilder = daten["bilder"]

    nach_autor = {}
    for name, b in bilder.items():
        nach_autor.setdefault((b["autor"], b["profil"]), []).append(name)

    zeilen = [
        ANFANG,
        '            <dt><strong>Fotos</strong></dt>',
        '            <dd style="margin:0 0 var(--sp-4)">',
        f'              Alle Fotos stammen von {lizenz["quelle"]} und stehen unter der',
        f'              <a href="{lizenz["url"]}" rel="noopener">{lizenz["name"]}</a>.',
        f'              {lizenz["hinweis"]}',
        "            </dd>",
        '            <dt><strong>Urheber</strong></dt>',
        '            <dd style="margin:0 0 var(--sp-4)">',
        "              <ul>",
    ]

    for (autor, profil), namen in sorted(nach_autor.items()):
        anzahl = len(namen)
        stueck = "1 Bild" if anzahl == 1 else f"{anzahl} Bilder"
        zeilen.append(
            f'                <li><a href="{html.escape(profil, quote=True)}"'
            f' rel="noopener">{html.escape(autor)}</a>'
            f" — {stueck}</li>"
        )

    zeilen += [
        "              </ul>",
        "            </dd>",
        '            <dt><strong>Verarbeitung</strong></dt>',
        '            <dd style="margin:0">',
        "              Die Bilder wurden zugeschnitten, verkleinert und nach WebP",
        "              umgewandelt. Sie liegen auf diesem Server und werden nicht",
        "              von einer fremden Domain nachgeladen.",
        "            </dd>",
        f"            {ENDE}",
    ]
    return "\n".join(zeilen)

def main() -> None:
    text = IMPRESSUM.read_text(encoding="utf-8")
    if ANFANG not in text or ENDE not in text:
        raise SystemExit(
            f"Marken fehlen in {IMPRESSUM.name}. "
            f"Erwartet: {ANFANG} ... {ENDE}"
        )
    vorher, rest = text.split(ANFANG, 1)
    _, nachher = rest.split(ENDE, 1)
    IMPRESSUM.write_text(vorher + bauen() + nachher, encoding="utf-8")
    anzahl = len(json.loads(NACHWEISE.read_text(encoding="utf-8"))["bilder"])
    print(f"Bildnachweise fuer {anzahl} Bilder in impressum/index.html geschrieben")

if __name__ == "__main__":
    main()
