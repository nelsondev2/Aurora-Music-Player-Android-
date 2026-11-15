#!/usr/bin/env python3
"""Sirve la app web para probarla en el navegador.

    python3 tools/serve.py            # http://localhost:8000
    python3 tools/serve.py --port 9000

Es solo para desarrollo: en el móvil la app corre dentro del APK, donde
MainActivity sirve assets/www al WebView desde https://aurora.localhost.

En el navegador todo funciona igual salvo lo que aporta el sistema
Android: «Compartir» descarga el archivo y el botón atrás es el del
navegador.
"""

import argparse
import functools
import http.server
import os
import socketserver

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "www")


class Handler(http.server.SimpleHTTPRequestHandler):
    """Sin caché: editas el CSS, recargas y lo ves."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[serve] " + fmt % args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description="Sirve Aurora Music Player en local")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="0.0.0.0",
                        help="0.0.0.0 por defecto, para que la vista previa sea accesible")
    args = parser.parse_args()

    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        raise SystemExit("No encuentro assets/www/index.html")

    handler = functools.partial(Handler, directory=ROOT)
    with Server((args.host, args.port), handler) as httpd:
        print(f"Aurora en http://localhost:{args.port}  (sirviendo {ROOT})")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nAdiós.")


if __name__ == "__main__":
    main()
