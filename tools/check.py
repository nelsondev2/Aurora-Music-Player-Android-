#!/usr/bin/env python3
"""Comprobaciones del proyecto antes de compilar.

    python3 tools/check.py

Verifica, sin dependencias externas:
  · que la estructura del proyecto Android está completa,
  · que el manifest y las clases Java coinciden,
  · que el XML está bien formado,
  · que todo lo que carga index.html existe y ningún script sobra,
  · que los recursos R.* usados en Java existen,
  · que ningún archivo declara dos métodos iguales ni usa una clase
    conocida sin importarla (lo que javac rechaza y aquí no se ve),
  · que los puentes Java ↔ JS (compartir y reproducción) casan,
  · que las claves de traducción usadas existen en data.js,

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
        "src/com/nelsondev2/aurora/PlayQueue.java",
        "src/com/nelsondev2/aurora/DeviceLibraryBridge.java",
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
    min_sdk = re.search(r'android:minSdkVersion="(\d+)"', manifest)
    if not min_sdk or min_sdk.group(1) != "21":
        fail("la APK debe mantener minSdk 21 (Android 5.0 o superior)")
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


# ------------------------------------------------------------- forma del Java
# Lo que javac caza y un análisis de sintaxis no: dos métodos con la misma
# firma en la misma clase, o usar una clase sin importarla. Las dos cosas
# rompieron la compilación real (isPlaying() duplicado y Uri sin import).
IMPORTANTES = {
    "Uri": "android.net.Uri",
    "Intent": "android.content.Intent",
    "Context": "android.content.Context",
    "Cursor": "android.database.Cursor",
    "Bitmap": "android.graphics.Bitmap",
    "BitmapFactory": "android.graphics.BitmapFactory",
    "JSONObject": "org.json.JSONObject",
    "JSONArray": "org.json.JSONArray",
    "Base64": "android.util.Base64",
    "Log": "android.util.Log",
    "Build": "android.os.Build",
    "Handler": "android.os.Handler",
    "Looper": "android.os.Looper",
    "MediaPlayer": "android.media.MediaPlayer",
    "MediaMetadataRetriever": "android.media.MediaMetadataRetriever",
    "MediaStore": "android.provider.MediaStore",
    "Notification": "android.app.Notification",
    "NotificationChannel": "android.app.NotificationChannel",
    "PendingIntent": "android.app.PendingIntent",
    "MediaSession": "android.media.session.MediaSession",
    "ContentUris": "android.content.ContentUris",
    "AudioManager": "android.media.AudioManager",
    "PowerManager": "android.os.PowerManager",
    "ComponentName": "android.content.ComponentName",
}


def check_java_shapes():
    """Dos cosas que javac rechaza y que aquí se pueden ver sin compilar."""
    fuentes = sorted(glob.glob(os.path.join(SRC, "*.java")))
    metodos = 0
    for path in fuentes:
        code = read(path)
        base = os.path.basename(path)
        lineas = code.splitlines()

        # Métodos declarados al primer nivel de la clase (4 espacios):
        # mismo nombre y mismos parámetros dos veces = no compila.
        vistos = {}
        for num, linea in enumerate(lineas, 1):
            # Exactamente 4 espacios: los métodos de las clases anónimas
            # van más adentro y no compiten con los de la clase.
            m = re.match(r"^ {4}(?! )(?:@\w+\s+)?(?:(?:public|private|protected|static|final|"
                         r"synchronized|native|abstract)\s+)*[\w<>\[\]., ?]+\s+"
                         r"(\w+)\s*\(([^)]*)\)\s*(?:throws [\w., ]+)?\{", linea)
            if not m:
                continue
            nombre = m.group(1)
            if nombre in ("if", "for", "while", "switch", "catch", "synchronized"):
                continue
            tipos = []
            for param in m.group(2).split(","):
                param = param.strip()
                if not param:
                    continue
                partes = param.replace("final ", "").split()
                tipos.append(partes[-1].split("[")[0] if partes else "")
            firma = nombre + "(" + ",".join(tipos) + ")"
            metodos += 1
            if firma in vistos:
                fail("%s declara %s dos veces (líneas %d y %d)"
                     % (base, firma, vistos[firma], num))
            else:
                vistos[firma] = num

        # Clases conocidas usadas sin importar (y que no son de este paquete).
        imports = set(re.findall(r"^import\s+([\w.]+);", code, re.M))
        propias = set(re.findall(r"\b(?:class|interface|enum)\s+(\w+)", code))
        for simbolo, completo in IMPORTANTES.items():
            if simbolo in propias or completo in imports:
                continue
            if re.search(r"(?<![\w.\"'])" + simbolo + r"\s*\.", code):
                fail("%s usa %s. pero no importa %s" % (base, simbolo, completo))

    ok.append("%d archivos Java sin métodos duplicados ni clases sin importar (%d métodos)"
              % (len(fuentes), metodos))


# -------------------------------------------------------------------- puente
def check_bridge():
    """Los métodos @JavascriptInterface y los que llama platform.js deben casar."""
    # Módulos que hablan con los puentes: platform.js (compartir, media),
    # native-audio.js (motor nativo) e init.js (limpieza de la caché).
    js = "".join(read(os.path.join(WWW, "js", name))
                 for name in ("platform.js", "native-audio.js", "init.js",
                              "device-library.js", "library.js"))
    pairs = [
        ("AuroraAndroid", "B", "AuroraBridge.java"),
        ("AuroraMedia", "M", "AuroraMediaBridge.java"),
        ("AuroraNativePlayer", "N", "NativePlayerBridge.java"),
        ("AuroraDevice", "D", "DeviceLibraryBridge.java"),
    ]
    main = read(os.path.join(SRC, "MainActivity.java"))

    for window_name, var, java_file in pairs:
        java = read(os.path.join(SRC, java_file))
        exported = set(re.findall(
            r"@JavascriptInterface\s+public\s+(?:synchronized\s+)?"
            r"[\w<>\[\]]+\s+(\w+)\s*\(", java))
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


# --------------------------------------------------------------------- ci
def check_ci():
    """El workflow de compilación y el script tienen que seguir casando."""
    script = os.path.join(ROOT, "tools", "build-apk.sh")
    workflow = os.path.join(ROOT, ".github", "workflows", "build-apk.yml")
    if not os.path.isfile(workflow):
        warn("no hay workflow de compilación (.github/workflows/build-apk.yml)")
        return
    if not os.access(script, os.X_OK):
        fail("tools/build-apk.sh no es ejecutable (chmod +x)")
    texto = read(workflow)
    compilador = read(script)
    if "tools/build-apk.sh" not in texto:
        fail("el workflow no llama a tools/build-apk.sh")
    if not re.search(r"(?m)^readonly MIN_SDK=21$", compilador):
        fail("el script debe compilar con minSdk 21")
    if "--min-sdk)" in compilador:
        fail("el script no debe generar variantes con mínimos distintos")
    if "--out dist/aurora-android5-plus.apk" not in texto:
        fail("el workflow no produce la APK universal Android 5+")
    if "matrix:" in texto or texto.count("uses: actions/upload-artifact@") != 1:
        fail("el workflow debe publicar una sola APK, sin matriz de versiones")
    ok.append("CI compila una única APK universal compatible con Android 5.0+")


def main():
    check_android_project()
    check_ci()
    check_xml()
    check_assets()
    check_java_resources()
    check_java_shapes()
    check_bridge()
    check_i18n()

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
