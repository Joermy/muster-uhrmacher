@echo off
setlocal
cd /d "%~dp0"
title Atelier Kessler - lokaler Server

set PORT=8093

where python >nul 2>&1
if errorlevel 1 goto keinpython

start /b "" python scripts\browser-oeffnen.py %PORT%

echo.
echo   Atelier Kessler laeuft auf http://localhost:%PORT%/
echo   Zum Beenden: Strg+C oder dieses Fenster schliessen.
echo.

python scripts\dev-server.py %PORT%
if errorlevel 1 goto serverfehler
exit /b 0

:keinpython
echo.
echo   FEHLER: python nicht gefunden.
echo   Python installieren oder zum PATH hinzufuegen.
echo.
pause
exit /b 1

:serverfehler
echo.
echo   Server beendet. Laeuft eventuell schon einer auf Port %PORT%?
echo.
pause
exit /b 1
