#!/usr/bin/env python3
"""Comprobaciones del proyecto antes de compilar.

    python3 tools/check.py

Verifica, sin dependencias externas:
  · que el proyecto Android tiene lo que AIDE espera,
  · que el manifest y las clases Java coinciden,
  · que el XML está bien formado,
  · que todo lo que carga index.html existe y ningún script sobra,
  · que los recursos R.* usados en Java existen,
  · que los puentes Java ↔ JS (compartir y reproducción) casan,
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
        "res/values/colors.xml",
        "res/values/styles.xml",
        "res/drawable/ic_stat_aurora.xml",
        "res/mipmap-mdpi/ic_launcher.png",
        "res/mipmap-xxxhdpi/ic_launcher.png",
        "assets/www/index.html",
        "src/com/nelsondev2/aurora/MainActivity.java",
        "src/com/nelsondev2/aurora/AuroraWebClient.java",
        "src/com/nelsondev2/aurora/AuroraBridge.java",
        "src/com/nelsondev2/aurora/AuroraMediaBridge.java",
        "src/com/nelsondev2/aurora/NativePlayer.java",
        "src/com/nelsondev2/aurora/NativePlayerBridge.java",
        "src/com/nelsondev2/aurora/NativeAudioStore.java",
        "src/com/nelsondev2/aurora/PlaybackService.java",
        "src/com/nelsondev2/aurora/WebApp.java",
        "src/com/nelsondev2/aurora/ShareProvider.java",
        "src/com/nelsondev2/aurora/Mime.java",
    ]
    missing = [rel for rel in required if not os.path.isfile(os.path.join(ROOT, rel))]
    for rel in missing:
        fail("falta %s" % rel)
    if not missing:
        ok.append("estructura del proyecto Android completa")

    manifest = read(os.path.join(ROOT, "AndroidManifest.xml"))
    for name in re.findall(r'android:name="\.([A-Za-z0-9_]+)"', manifest):
        if not os.path.isfile(os.path.join(SRC, name + ".java")):
            fail("el manifest declara .%s y no existe %s.java" % (name, name))
    for pkg in re.findall(r'package="([^"]+)"', manifest):
        if not os.path.isdir(os.path.join(ROOT, "src", *pkg.split("."))):
            fail("el package del manifest (%s) no casa con src/" % pkg)
    ok.append("manifest y clases Java coinciden")

    # Servicio en primer plano: sin permisos no arranca en Android 9+.
    if "foregroundServiceType" in manifest:
        for perm in ("FOREGROUND_SERVICE", "WAKE_LOCK"):
            if perm not in manifest:
                fail("el servicio en primer plano necesita el permiso %s" % perm)


# ----------------------------------------------------------------------- xml
def check_xml():
    paths = [os.path.join(ROOT, "AndroidManifest.xml")]
    paths += glob.glob(os.path.join(ROOT, "res", "**", "*.xml"), recursive=True)
    for path in paths:
        try:
            ET.parse(path)
        except Exception as exc:
            fail("%s no es XML válido: %s" % (os.path.relpath(path, ROOT), exc))
    ok.append("%d archivos XML bien formados" % len(paths))


# -------------------------------------------------------------------- assets
def check_assets():
    html = read(os.path.join(WWW, "index.html"))

    scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
    links = re.findall(r'<link[^>]+href="([^"]+)"', html)
    local = [r for r in scripts + links if not re.match(r"^(?:[a-z]+:|//|#)", r)]
    for ref in sorted(set(local)):
        if not os.path.isfile(os.path.join(WWW, ref)):
            fail("index.html referencia «%s» y no existe" % ref)

    loaded = {os.path.basename(r) for r in local if r.startswith("js/")}
    published = {n for n in os.listdir(os.path.join(WWW, "js")) if n.endswith(".js")}
    for missing in sorted(loaded - published):
        fail("index.html carga js/%s y no está" % missing)
    for orphan in sorted(published - loaded):
        fail("assets/www/js/%s no lo carga index.html" % orphan)

    order = [os.path.basename(r) for r in scripts if r.startswith("js/")]
    if "platform.js" in order and "state.js" in order:
        if order.index("platform.js") < order.index("state.js"):
            fail("platform.js debe cargarse después de state.js")
    if "platform.js" in order and "main.js" in order:
        if order.index("platform.js") > order.index("main.js"):
            fail("platform.js debe cargarse antes de main.js")

    if "webxdc.js" in html:
        fail("index.html sigue cargando webxdc.js")

    ok.append("%d recursos de index.html verificados" % len(set(local)))


# ---------------------------------------------------------------- recursos
def check_java_resources():
    """R.string / R.drawable / R.mipmap / R.color usados en Java deben existir."""
    strings_xml = read(os.path.join(ROOT, "res", "values", "strings.xml"))
    strings = set(re.findall(r'<string name="([^"]+)"', strings_xml))
    colors_xml = read(os.path.join(ROOT, "res", "values", "colors.xml"))
    colors = set(re.findall(r'<color name="([^"]+)"', colors_xml))

    drawables = set()
    folders = glob.glob(os.path.join(ROOT, "res", "drawable*"))
    folders += glob.glob(os.path.join(ROOT, "res", "mipmap*"))
    for folder in folders:
        for name in os.listdir(folder):
            drawables.add(os.path.splitext(name)[0])

    # Solo R.* propios: «android.R.drawable.x» lo pone el sistema.
    for path in glob.glob(os.path.join(SRC, "*.java")):
        code = read(path)
        base = os.path.basename(path)
        for name in set(re.findall(r"(?<![\w.])R\.string\.(\w+)", code)):
            if name not in strings:
                fail("%s usa R.string.%s y no está en strings.xml" % (base, name))
        for name in set(re.findall(r"(?<![\w.])R\.(?:drawable|mipmap)\.(\w+)", code)):
            if name not in drawables:
                fail("%s usa R.drawable.%s y no existe el recurso" % (base, name))
        for name in set(re.findall(r"(?<![\w.])R\.color\.(\w+)", code)):
            if name not in colors:
                fail("%s usa R.color.%s y no está en colors.xml" % (base, name))

    ok.append("%d textos, %d colores y %d iconos de Android existen"
              % (len(strings), len(colors), len(drawables)))


# -------------------------------------------------------------------- puente
def check_bridge():
    """Los métodos @JavascriptInterface y los que llama platform.js deben casar."""
    # Módulos que hablan con los puentes: platform.js (compartir, media),
    # native-audio.js (motor nativo) e init.js (limpieza de la caché).
    js = "".join(read(os.path.join(WWW, "js", name))
                 for name in ("platform.js", "native-audio.js", "init.js"))
    pairs = [
        ("AuroraAndroid", "B", "AuroraBridge.java"),
        ("AuroraMedia", "M", "AuroraMediaBridge.java"),
        ("AuroraNativePlayer", "N", "NativePlayerBridge.java"),
    ]
    main = read(os.path.join(SRC, "MainActivity.java"))

    for window_name, var, java_file in pairs:
        java = read(os.path.join(SRC, java_file))
        exported = set(re.findall(
            r"@JavascriptInterface\s+public\s+[\w<>\[\]]+\s+(\w+)\s*\(", java))
        used = set(re.findall(r"\b" + var + r"\.(\w+)\s*\(", js))
        for name in sorted(used - exported):
            fail("platform.js llama a %s.%s y Java no lo expone" % (window_name, name))
        for name in sorted(exported - used):
            if name not in js:
                fail("%s expone %s y platform.js no lo usa" % (java_file, name))
        if exported and not (used - exported):
            ok.append("puente %s: %s" % (window_name, ", ".join(sorted(exported))))
        if '"%s"' % window_name not in main:
            fail("MainActivity no inyecta window.%s" % window_name)

    # Los comandos del sistema (notificación, auriculares) los atiende la web.
    if "AuroraMediaCommand" not in js:
        fail("platform.js no define window.AuroraMediaCommand")
    if "mediaCommand" not in read(os.path.join(SRC, "WebApp.java")):
        fail("WebApp.java no envía comandos a la web")


# ---------------------------------------------------------------------- i18n
def check_i18n():
    data = read(os.path.join(WWW, "js", "data.js"))
    block = data[data.index("const I18N = {"):]
    keys = set(re.findall(r"^  ([a-zA-Z0-9_]+):\s*\{", block, re.M))

    used = set()
    for name in os.listdir(os.path.join(WWW, "js")):
        if not name.endswith(".js"):
            continue
        code = read(os.path.join(WWW, "js", name))
        used.update(re.findall(r"\.t\('([a-zA-Z0-9_]+)'\)", code))
        used.update(re.findall(r'this\.t\("([a-zA-Z0-9_]+)"\)', code))
    html = read(os.path.join(WWW, "index.html"))
    used.update(re.findall(r'data-i18n(?:-aria)?="([a-zA-Z0-9_]+)"', html))
    # «key» es el parámetro de t(key) citado en un comentario: no es una clave.
    used.discard("key")

    for key in sorted(used - keys):
        fail("clave de traducción «%s» usada y no definida en data.js" % key)

    unused = sorted(keys - used)
    if unused:
        warn("%d claves de traducción sin usar (no rompen nada): %s"
             % (len(unused), ", ".join(unused[:8]) + ("…" if len(unused) > 8 else "")))
    ok.append("%d claves de traducción en uso, todas definidas" % len(used))


# --------------------------------------------------------------- webxdc-off
LEGACY = re.compile(r"webxdc|delta\s*chat|deltachat|\.xdc\b", re.I)


def check_no_webxdc():
    targets = []
    for base, _dirs, files in os.walk(WWW):
        targets += [os.path.join(base, f) for f in files]
    targets.append(os.path.join(ROOT, "AndroidManifest.xml"))
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


def main():
    check_android_project()
    check_xml()
    check_assets()
    check_java_resources()
    check_bridge()
    check_i18n()
    check_no_webxdc()

    for line in ok:
        print("  ok    " + line)
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
