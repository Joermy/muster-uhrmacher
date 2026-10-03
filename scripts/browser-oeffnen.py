#!/usr/bin/env python3

import socket
import sys
import time
import webbrowser

HOST = "127.0.0.1"

def port_antwortet(port: int, zeitgrenze: float = 0.4) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(zeitgrenze)
        return s.connect_ex((HOST, port)) == 0

def main() -> int:
    port = 8090
    frist = 15.0

    argumente = sys.argv[1:]
    if argumente and argumente[0].isdigit():
        port = int(argumente[0])
    if "--timeout" in argumente:
        frist = float(argumente[argumente.index("--timeout") + 1])

    ende = time.monotonic() + frist
    while time.monotonic() < ende:
        if port_antwortet(port):
            webbrowser.open(f"http://localhost:{port}/")
            return 0
        time.sleep(0.3)

    print(f"Server antwortet nicht auf Port {port} innerhalb von {frist:.0f} s.")
    return 1

if __name__ == "__main__":
    sys.exit(main())
