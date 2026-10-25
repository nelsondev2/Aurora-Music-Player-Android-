#!/usr/bin/env python3
# =====================================================================
#  build-xdc.py — Empaqueta Aurora Music Player como WebXDC (.xdc)
# =====================================================================
#  Un .xdc es un ZIP (Deflate) con index.html en la RAÍZ. Opcionalmente
#  lleva manifest.toml (nombre y URL del código) e icon.png (cuadrado,
#  128–512 px). El cliente de mensajería inyecta la API window.webxdc;
#  la app no necesita red y funciona sin conexión.
#
#  Uso:
#      python3 build-xdc.py              # genera aurora-music-player.xdc
#      python3 build-xdc.py --check      # valida el .xdc ya generado
#      python3 build-xdc.py --check otro.xdc
#
#  Solo usa la biblioteca estándar de Python 3.
# =====================================================================

import argparse
import hashlib
import os
import re
import struct
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(ROOT, "aurora-music-player.xdc")

# Todo lo que la app necesita en tiempo de ejecución. Lo que no esté
# aquí no viaja en el .xdc (README, docs, herramientas…).
APP_ENTRIES = [
    "index.html",      # obligatorio, en la raíz del ZIP
    "manifest.toml",   # nombre visible y código fuente
    "icon.png",        # icono del chat
    "LICENSE",
    "css",             # todas las hojas de estilo
    "js",              # todo el JS propio (sin webxdc.js: lo inyecta el cliente)
    "assets",          # JS vendorizado (js/jsmediatags.min.js) y demás
]

# Fecha fija en las entradas → builds reproducibles (mismo contenido,
# mismo hash). ZIP no admite fechas anteriores a 1980.
FIXED_DATE = (1980, 1, 1, 0, 0, 0)

MAX_SIZE_WARN = 2 * 1024 * 1024   # por encima de 2 MB conviene revisar
MIN_ICON, MAX_ICON = 128, 512


def fail(msg):
    print("ERROR: " + msg, file=sys.stderr)
    return False


def collect_files():
    """Devuelve [(ruta_absoluta, ruta_en_zip)] con separador '/'."""
    files = []
    for entry in APP_ENTRIES:
        abs_entry = os.path.join(ROOT, entry)
        if os.path.isfile(abs_entry):
            files.append((abs_entry, entry))
        elif os.path.isdir(abs_entry):
            for dirpath, dirnames, filenames in os.walk(abs_entry):
                # Nunca incluir carpetas ni archivos ocultos.
                dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
                for name in sorted(filenames):
                    if name.startswith("."):
                        continue
                    full = os.path.join(dirpath, name)
                    rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
                    files.append((full, rel))
        else:
            fail("falta «%s» en el proyecto" % entry)
            return []
    return sorted(files, key=lambda item: item[1])


def read_text(rel_path):
    with open(os.path.join(ROOT, rel_path), "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def parse_manifest(text):
    """Lector mínimo de manifest.toml (clave = "valor").

    No se usa tomllib para mantener compatibilidad con Python < 3.11.
    """
    data = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if value.startswith('"') and value.rstrip().endswith('"'):
            value = value[1:-1]
        data[key.strip()] = value
    return data


def png_size(path):
    """Ancho y alto de un PNG leyendo la cabecera IHDR."""
    with open(path, "rb") as fh:
        header = fh.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", header[16:24])


def local_refs(html):
    """Recursos locales referenciados por el HTML (src/href)."""
    refs = set()
    for match in re.finditer(r'(?:src|href)="([^"]+)"', html):
        url = match.group(1).strip()
        if not url or url.startswith("#"):
            continue
        if re.match(r"^(?:[a-z]+:|//)", url, re.I):
            continue
        refs.add(url.split("?")[0].split("#")[0].lstrip("./"))
    return refs


def css_refs(css):
    refs = set()
    for match in re.finditer(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", css):
        url = match.group(1).strip()
        if re.match(r"^(?:data:|[a-z]+:|//)", url, re.I):
            continue
        refs.add(url.split("?")[0].split("#")[0].lstrip("./"))
    return refs


def network_refs(html):
    """Cargas de red: scripts, estilos, imágenes o frames remotos."""
    bad = []
    pattern = r'<(?:script|link|img|iframe|source|audio|video)[^>]+(?:src|href)="([^"]+)"'
    for match in re.finditer(pattern, html, re.I):
        url = match.group(1).strip()
        if re.match(r"^(?:https?:)?//", url, re.I):
            bad.append(url)
    return bad


def validate_sources(files):
    """Comprueba el contenido ANTES de comprimir."""
    ok = True
    names = {rel for _, rel in files}

    if "index.html" not in names:
        ok = fail("index.html debe estar en la raíz del .xdc")
        return ok
    if "manifest.toml" not in names:
        ok = fail("falta manifest.toml (el cliente lo usa para el nombre)")
    else:
        manifest = parse_manifest(read_text("manifest.toml"))
        if not manifest.get("name"):
            ok = fail("manifest.toml no define «name»")

    if "icon.png" not in names and "icon.jpg" not in names:
        ok = fail("falta icon.png o icon.jpg (128–512 px, cuadrado)")
    elif "icon.png" in names:
        size = png_size(os.path.join(ROOT, "icon.png"))
        if not size:
            ok = fail("icon.png no es un PNG válido")
        else:
            width, height = size
            if width != height:
                ok = fail("icon.png no es cuadrado (%dx%d)" % (width, height))
            elif not (MIN_ICON <= width <= MAX_ICON):
                ok = fail("icon.png mide %d px; debe estar entre %d y %d"
                          % (width, MIN_ICON, MAX_ICON))

    html = read_text("index.html")
    css = read_text("css/styles.css") if "css/styles.css" in names else ""

    for ref in sorted(local_refs(html) | css_refs(css)):
        if ref == "webxdc.js":
            # Lo proporciona el mensajero al servir la app (spec webxdc:
            # no debe viajar en el .xdc, ver la regla siguiente).
            continue
        if ref.startswith("/"):
            ok = fail("ruta absoluta «%s»: en un .xdc los recursos son relativos" % ref)
        elif ref not in names:
            ok = fail("«%s» se referencia pero no está en el paquete" % ref)

    for url in network_refs(html):
        ok = fail("carga remota «%s»: un .xdc funciona sin red" % url)

    # Spec webxdc: «webxdc.js» lo proporciona el mensajero y NO debe
    # incluirse en el .xdc. Si viajara uno propio (p. ej. en js/), el
    # cliente no lo reemplazaría y todo envío al chat caería en él,
    # sin llegar nunca a ningún chat.
    for rel in sorted(names):
        if rel.rsplit("/", 1)[-1] == "webxdc.js":
            ok = fail("«%s» no debe viajar en el .xdc: la API webxdc la "
                      "inyecta el mensajero para la ruta «webxdc.js»" % rel)

    return ok


def build(out_path):
    files = collect_files()
    if not files:
        return False
    if not validate_sources(files):
        return False

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for full, rel in files:
            info = zipfile.ZipInfo(rel, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (os.stat(full).st_mode & 0o777) << 16
            with open(full, "rb") as fh:
                archive.writestr(info, fh.read())

    size = os.path.getsize(out_path)
    digest = hashlib.sha256(open(out_path, "rb").read()).hexdigest()
    print("OK  %s · %d archivos · %.1f KB"
          % (os.path.basename(out_path), len(files), size / 1024.0))
    print("    sha256: " + digest)
    if size > MAX_SIZE_WARN:
        print("AVISO: el .xdc supera %.1f MB; algunos clientes tardan en abrirlo"
              % (MAX_SIZE_WARN / 1024.0 / 1024.0))
    return check(out_path)


def check(path):
    """Valida un .xdc existente (estructura, compresión, manifest, icono)."""
    if not os.path.isfile(path):
        return fail("no existe «%s»" % path)

    ok = True
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()

        if "index.html" not in names:
            ok = fail("index.html no está en la raíz del .xdc")

        bad_names = [n for n in names if "\\" in n or n.startswith(("./", "/")) or ".." in n.split("/")]
        if bad_names:
            ok = fail("entradas con rutas inválidas: " + ", ".join(bad_names[:5]))

        bad_compression = [i.filename for i in archive.infolist()
                           if i.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)]
        if bad_compression:
            ok = fail("compresión no permitida (usa Deflate/Store): "
                      + ", ".join(bad_compression[:5]))

        if "manifest.toml" in names:
            manifest = parse_manifest(archive.read("manifest.toml").decode("utf-8", "replace"))
            if not manifest.get("name"):
                ok = fail("manifest.toml sin «name»")
            else:
                print("    nombre: %s" % manifest["name"])
                if manifest.get("source_code_url"):
                    print("    código: %s" % manifest["source_code_url"])
        else:
            print("AVISO: sin manifest.toml; el cliente usará el nombre del archivo")

        icon = "icon.png" if "icon.png" in names else ("icon.jpg" if "icon.jpg" in names else None)
        if icon:
            print("    icono: %s (%.1f KB)" % (icon, archive.getinfo(icon).file_size / 1024.0))
        else:
            print("AVISO: sin icon.png/icon.jpg; se usará el icono por defecto")

        print("    archivos: %d · comprimido: %.1f KB · sin comprimir: %.1f KB"
              % (len(names),
                 os.path.getsize(path) / 1024.0,
                 sum(i.file_size for i in archive.infolist()) / 1024.0))

    if ok:
        print("OK  el .xdc es válido para Delta Chat / webxdc")
    return ok


def main():
    parser = argparse.ArgumentParser(description="Empaqueta o valida el .xdc de Aurora")
    parser.add_argument("--check", nargs="?", const=DEFAULT_OUT, metavar="ARCHIVO",
                        help="valida un .xdc en lugar de generarlo")
    parser.add_argument("-o", "--output", default=DEFAULT_OUT, help="ruta del .xdc")
    args = parser.parse_args()

    if args.check:
        return 0 if check(args.check) else 1
    return 0 if build(args.output) else 1

if __name__ == "__main__":
    sys.exit(main())
