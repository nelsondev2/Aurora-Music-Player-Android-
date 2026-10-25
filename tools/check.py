#!/usr/bin/env python3
"""Comprobaciones del proyecto antes de compilar.

    python3 tools/check.py

Verifica, sin dependencias externas:
  · que el proyecto Android tiene lo que AIDE espera,
  · que todo lo que carga index.html existe,
  · que ningún script quedó huérfano ni sin cargar,
  · que las claves de traducción usadas existen en data.js,
  · que no ha vuelto a colarse nada de la etapa WebXDC/Delta Chat.

Sale con código 0 si todo está bien y 1 si algo falla.
"""

import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, "assets", "www")
SRC = os.path.join(ROOT, "src", "com", "nelsondev2", "aurora")

errors = []
warnings = []
ok = []


def fail(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


# ---------------------------------------------------------------- estructura
def check_android_project():
    required = [
        "AndroidManifest.xml",
        "res/values/strings.xml",
        "res/mipmap-mdpi/ic_launcher.png",
        "res/mipmap-xxxhdpi/ic_launcher.png",
        "assets/www/index.html",
        "src/com/nelsondev2/aurora/MainActivity.java",
        "src/com/nelsondev2/aurora/AuroraWebClient.java",
        "src/com/nelsondev2/aurora/AuroraBridge.java",
        "src/com/nelsondev2/aurora/ShareProvider.java",
        "src/com/nelsondev2/aurora/Mime.java",
    ]
    for rel in required:
        if not os.path.isfile(os.path.join(ROOT, rel)):
            fail("falta %s" % rel)
    if not errors:
        ok.append("estructura del proyecto Android completa")

    # Las clases declaradas en el manifest deben existir.
    manifest = read(os.path.join(ROOT, "AndroidManifest.xml"))
    for name in re.findall(r'android:name="\.([A-Za-z0-9_]+)"', manifest):
        path = os.path.join(SRC, name + ".java")
        if not os.path.isfile(path):
            fail("el manifest declara .%s y no existe %s.java" % (name, name))
    for pkg in re.findall(r'package="([^"]+)"', manifest):
        if not os.path.isdir(os.path.join(ROOT, "src", *pkg.split("."))):
            fail("el package del manifest (%s) no casa con src/" % pkg)
    ok.append("manifest y clases Java coinciden")


# ------------------------------------------------------------------- assets
def check_assets():
    index_path = os.path.join(WWW, "index.html")
    html = read(index_path)

    scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
    links = re.findall(r'<link[^>]+href="([^"]+)"', html)
    local = [r for r in scripts + links if not re.match(r"^(?:[a-z]+:|//|#)", r)]
    for ref in sorted(local):
        if not os.path.isfile(os.path.join(WWW, ref)):
            fail("index.html referencia «%s» y no existe" % ref)

    # Todo módulo de js/ debe estar cargado y todo lo cargado debe existir.
    loaded = {os.path.basename(r) for r in local if r.startswith("js/")}
    published = {n for n in os.listdir(os.path.join(WWW, "js")) if n.endswith(".js")}
    for missing in sorted(loaded - published):
        fail("index.html carga js/%s y no está" % missing)
    for orphan in sorted(published - loaded):
        fail("assets/www/js/%s no lo carga index.html" % orphan)

    # platform.js define el puente que usa el resto: debe ir tras state.js
    order = [os.path.basename(r) for r in scripts if r.startswith("js/")]
    if "platform.js" in order and "state.js" in order:
        if order.index("platform.js") < order.index("state.js"):
            fail("platform.js debe cargarse después de state.js")
        if "main.js" in order and order.index("platform.js") > order.index("main.js"):
            fail("platform.js debe cargarse antes de main.js")

    if "webxdc.js" in html:
        fail("index.html sigue cargando webxdc.js")

    ok.append("%d recursos de index.html verificados" % len(local))


# ---------------------------------------------------------------------- i18n
def check_i18n():
    data = read(os.path.join(WWW, "js", "data.js"))
    start = data.index("const I18N = {")
    block = data[start:]
    keys = set(re.findall(r"^  ([a-zA-Z0-9_]+):\s*\{", block, re.M))

    used = set()
    for name in os.listdir(os.path.join(WWW, "js")):
        if not name.endswith(".js"):
            continue
        code = read(os.path.join(WWW, "js", name))
        used.update(re.findall(r"\.t\('([a-zA-Z0-9_]+)'\)", code))
        used.update(re.findall(r'this\.t\("([a-zA-Z0-9_]+)"\)', code))
    # «key» es el parámetro de t(key) citado en un comentario: no es una clave.
    used.discard("key")

    html = read(os.path.join(WWW, "index.html"))
    used.update(re.findall(r'data-i18n(?:-aria)?="([a-zA-Z0-9_]+)"', html))

    for key in sorted(used - keys):
        fail("clave de traducción «%s» usada y no definida en data.js" % key)

    unused = sorted(keys - used)
    if unused:
        warn("%d claves de traducción sin usar (no rompen nada): %s"
             % (len(unused), ", ".join(unused[:8]) + ("…" if len(unused) > 8 else "")))

    ok.append("%d claves de traducción en uso, todas definidas" % len(used))


# -------------------------------------------------------------------- puente
def check_bridge():
    """Los métodos @JavascriptInterface y los que llama platform.js deben casar."""
    java = read(os.path.join(SRC, "AuroraBridge.java"))
    exported = set(re.findall(
        r"@JavascriptInterface\s+public\s+[\w<>\[\]]+\s+(\w+)\s*\(", java))
    js = read(os.path.join(WWW, "js", "platform.js"))
    used = set(re.findall(r"\bB\.(\w+)\s*\(", js))

    for name in sorted(used - exported):
        fail("platform.js llama a AuroraAndroid.%s y Java no lo expone" % name)
    for name in sorted(exported - used):
        if name not in js:
            fail("AuroraBridge expone %s y platform.js no lo usa" % name)
    if exported and used and not (used - exported):
        ok.append("puente Java ↔ JS: %s" % ", ".join(sorted(exported)))


# --------------------------------------------------------------- webxdc-off
LEGACY = re.compile(r"webxdc|delta\s*chat|deltachat|\.xdc\b", re.I)


def check_no_webxdc():
    targets = []
    for base, _dirs, files in os.walk(WWW):
        targets += [os.path.join(base, f) for f in files]
    targets += [os.path.join(ROOT, "AndroidManifest.xml")]
    for base, _dirs, files in os.walk(SRC):
        targets += [os.path.join(base, f) for f in files if f.endswith(".java")]
    # El CHANGELOG queda fuera a propósito: su entrada 1.3.0 explica
    # precisamente qué se retiró, así que nombra WebXDC y Delta Chat.
    targets += [os.path.join(ROOT, f) for f in ("README.md", ".gitignore")]

    bad = []
    for path in targets:
        if not os.path.isfile(path) or path.endswith((".png", ".woff2", ".ico")):
            continue
        for num, line in enumerate(read(path).splitlines(), 1):
            if LEGACY.search(line):
                bad.append("%s:%d" % (os.path.relpath(path, ROOT), num))
    if bad:
        fail("quedan referencias a WebXDC/Delta Chat:\n    " + "\n    ".join(bad))
    else:
        ok.append("sin rastro de WebXDC/Delta Chat")


# ----------------------------------------------------------------------- xml
def check_xml():
    """XML bien formado: aapt se atraganta con un comentario mal escrito."""
    paths = [os.path.join(ROOT, "AndroidManifest.xml")]
    paths += glob.glob(os.path.join(ROOT, "res", "**", "*.xml"), recursive=True)
    for path in paths:
        try:
            ET.parse(path)
        except Exception as exc:  # ParseError
            fail("%s no es XML válido: %s" % (os.path.relpath(path, ROOT), exc))
    if paths:
        ok.append("%d archivos XML bien formados" % len(paths))


def main():
    check_android_project()
    check_xml()
    check_assets()
    check_bridge()
    check_i18n()
    check_no_webxdc()

    for line in ok:
        print("  ok   " + line)
    for line in warnings:
        print("  aviso " + line)
    if errors:
        print()
        for line in errors:
            print("  FALLA " + line)
        print("\n%d problema(s)." % len(errors))
        return 1
    print("\nTodo correcto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
