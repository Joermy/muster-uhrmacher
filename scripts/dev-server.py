#!/usr/bin/env python3
import http.server
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class KeinCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WURZEL, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), KeinCacheHandler)
    print(f"Portfolio ohne Caching auf http://localhost:{port} — Strg+C zum Beenden")
    server.serve_forever()
