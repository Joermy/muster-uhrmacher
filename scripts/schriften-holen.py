#!/usr/bin/env python3
import pathlib
import subprocess

WURZEL = pathlib.Path(__file__).resolve().parent.parent
ZIEL = WURZEL / "assets" / "fonts"

SCHRIFTEN = {
    "Geist-Variabel.woff2":
        "https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFU.woff2",
    "GeistMono-Variabel.woff2":
        "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmg.woff2",
}

LIZENZEN = {
    "OFL-Geist.txt":
        "https://raw.githubusercontent.com/google/fonts/main/ofl/"
        "geist/OFL.txt",
    "OFL-GeistMono.txt":
        "https://raw.githubusercontent.com/google/fonts/main/ofl/"
        "geistmono/OFL.txt",
}

def laden(url, ziel, mindestens):
    erg = subprocess.run(
        ["curl", "-sL", "--max-time", "60", "--retry", "2", url],
        capture_output=True)
    if erg.returncode != 0 or len(erg.stdout) < mindestens:
        raise RuntimeError(f"{url}: nur {len(erg.stdout)} Bytes")
    ziel.write_bytes(erg.stdout)
    return len(erg.stdout)

def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    gesamt = 0
    for name, url in SCHRIFTEN.items():
        groesse = laden(url, ZIEL / name, 4000)
        gesamt += groesse
        print(f"  {name:34s} {groesse / 1024:6.1f} KB")
    for name, url in LIZENZEN.items():
        laden(url, ZIEL / name, 1000)
        print(f"  {name:34s} Lizenztext")
    print(f"\n{gesamt / 1024:.1f} KB Schriften unter assets/fonts/")

if __name__ == "__main__":
    main()
