#!/usr/bin/env bash
#
#  build-apk.sh — compila Aurora sin Gradle, solo con las herramientas del SDK.
#
#  El proyecto es de AIDE: no hay build.gradle ni wrapper. Este script hace
#  a mano lo mismo que haría AIDE, para poder compilar en CI (o en un
#  portátil) sin añadir Gradle al repositorio:
#
#    aapt2 compile → aapt2 link → javac → d8 → zipalign → apksigner
#
#  Uso:
#    tools/build-apk.sh                       # APK de depuración, minSdk 21
#    tools/build-apk.sh --min-sdk 26          # variante para Android 8+
#    tools/build-apk.sh --out /tmp/aurora.apk --version-code 140
#    tools/build-apk.sh --unsigned            # sin firmar (para revisar)
#
#  Requisitos: ANDROID_HOME (o ANDROID_SDK_ROOT) con build-tools y una
#  plataforma, más un JDK (javac, keytool). El workflow de GitHub Actions
#  ya los tiene; en local, instala el SDK de Android.
#
#  Nota sobre arquitecturas: la app no lleva una sola línea de código
#  nativo (ni .so ni NDK), así que una única APK vale para arm64-v8a,
#  armeabi-v7a, x86 y x86_64. El script lo comprueba al final y avisa si
#  algún día aparece una librería.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_SDK=21
TARGET_SDK=33
VERSION_CODE=""
OUT=""
KEYSTORE=""
UNSIGNED=0
WORK="$ROOT/build/apk"

die() { echo "error: $*" >&2; exit 1; }
say() { echo "» $*"; }

usage() {
  cat <<'TXT'
Compila Aurora sin Gradle, solo con las herramientas del SDK.

Uso:
  tools/build-apk.sh                       APK de depuración, minSdk 21
  tools/build-apk.sh --min-sdk 26          variante para Android 8+
  tools/build-apk.sh --target-sdk 34       plataforma de compilación
  tools/build-apk.sh --version-code 141    versionCode del manifiesto
  tools/build-apk.sh --out /tmp/a.apk      ruta de salida
  tools/build-apk.sh --keystore mia.ks     firma con otro almacén
  tools/build-apk.sh --unsigned            sin firmar (solo revisar)
  tools/build-apk.sh --work /tmp/build     carpeta de trabajo
  tools/build-apk.sh --help

Variables: ANDROID_HOME (o ANDROID_SDK_ROOT) y un JDK en el PATH.
TXT
}

while [ $# -gt 0 ]; do
  case "$1" in
    --min-sdk)      MIN_SDK="${2:?falta el valor}"; shift 2 ;;
    --target-sdk)   TARGET_SDK="${2:?falta el valor}"; shift 2 ;;
    --version-code) VERSION_CODE="${2:?falta el valor}"; shift 2 ;;
    --out)          OUT="${2:?falta el valor}"; shift 2 ;;
    --keystore)     KEYSTORE="${2:?falta el valor}"; shift 2 ;;
    --work)         WORK="${2:?falta el valor}"; shift 2 ;;
    --unsigned)     UNSIGNED=1; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              die "opción desconocida: $1 (usa --help)" ;;
  esac
done

OUT="${OUT:-$ROOT/build/aurora-minSdk$MIN_SDK.apk}"
OUT_DIR="$(dirname "$OUT")"
mkdir -p "$OUT_DIR" "$WORK" || die "no puedo crear $OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
OUT="$OUT_DIR/$(basename "$OUT")"

# --------------------------------------------------------------- SDK y JDK
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME" ]; then
  for candidate in \
    "$HOME/Android/Sdk" \
    "$HOME/Library/Android/sdk" \
    /usr/local/lib/android/sdk \
    /opt/android-sdk
  do
    if [ -d "$candidate" ]; then ANDROID_HOME="$candidate"; break; fi
  done
fi
[ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ] \
  || die "no encuentro el SDK de Android (define ANDROID_HOME)"

# compgen expande el glob dentro de la función (ls no: recibe la ruta
# literal entre comillas y falla en silencio, que es peor).
newest() { compgen -G "$1" | sort -V | tail -1; }

# Las betas y las RC del SDK no valen para publicar: compilan contra una
# plataforma que aún cambia (y los runners de CI traen alguna). Se
# descartan por nombre; si solo quedan preestrenos, se usa el que haya.
stable() {
  compgen -G "$1" | { grep -Ev -- '-(beta|alpha|rc|preview|dev)' || true; } | sort -V | tail -1
}

BUILD_TOOLS="$(stable "$ANDROID_HOME/build-tools/*")"
[ -n "$BUILD_TOOLS" ] || BUILD_TOOLS="$(newest "$ANDROID_HOME/build-tools/*")"
[ -n "$BUILD_TOOLS" ] || die "no hay build-tools en $ANDROID_HOME"

# Se compila contra la plataforma del targetSdk si está instalada (es la
# que se ha probado con el manifiesto); si no, la estable más nueva.
if [ -f "$ANDROID_HOME/platforms/android-$TARGET_SDK/android.jar" ]; then
  PLATFORM="$ANDROID_HOME/platforms/android-$TARGET_SDK"
else
  PLATFORM="$(stable "$ANDROID_HOME/platforms/android-*")"
  [ -n "$PLATFORM" ] || PLATFORM="$(newest "$ANDROID_HOME/platforms/android-*")"
fi
[ -n "$PLATFORM" ] || die "no hay ninguna plataforma en $ANDROID_HOME/platforms"

AAPT2="$BUILD_TOOLS/aapt2"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"
D8="$BUILD_TOOLS/d8"
for tool in "$AAPT2" "$ZIPALIGN" "$APKSIGNER" "$D8"; do
  [ -x "$tool" ] || die "falta $tool"
done
for tool in javac keytool zip unzip; do
  command -v "$tool" >/dev/null 2>&1 || die "falta $tool en el PATH"
done
[ -f "$PLATFORM/android.jar" ] || die "no encuentro $PLATFORM/android.jar"

say "SDK:         $(basename "$PLATFORM")"
say "build-tools: $(basename "$BUILD_TOOLS")"
say "minSdk:      $MIN_SDK · targetSdk: $TARGET_SDK"

# ------------------------------------------------------------------ aapt2
say "compilando recursos"
rm -rf "$WORK/res.zip" "$WORK/gen" "$WORK/classes" "$WORK/dex" "$WORK/base.apk"
"$AAPT2" compile --dir "$ROOT/res" -o "$WORK/res.zip"

LINK_ARGS=(
  -o "$WORK/base.apk"
  -I "$PLATFORM/android.jar"
  --manifest "$ROOT/AndroidManifest.xml"
  -R "$WORK/res.zip"
  -A "$ROOT/assets"
  --java "$WORK/gen"
  --min-sdk-version "$MIN_SDK"
  --target-sdk-version "$TARGET_SDK"
  --auto-add-overlay
)
[ -n "$VERSION_CODE" ] && LINK_ARGS+=(--version-code "$VERSION_CODE")

say "enlazando recursos y manifiesto"
"$AAPT2" link "${LINK_ARGS[@]}"

# ------------------------------------------------------------------- javac
say "compilando Java"
find "$ROOT/src" "$WORK/gen" -name '*.java' > "$WORK/sources.txt"
mkdir -p "$WORK/classes"
if ! javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
      -bootclasspath "$PLATFORM/android.jar" \
      -d "$WORK/classes" \
      @"$WORK/sources.txt" > "$WORK/javac.log" 2>&1; then
  grep -v "^Note:" "$WORK/javac.log" >&2 || true
  die "javac falló (el log completo está en $WORK/javac.log)"
fi
grep -v "^Note:" "$WORK/javac.log" || true
[ -f "$WORK/classes/com/nelsondev2/aurora/MainActivity.class" ] \
  || die "javac no generó las clases esperadas"

# ---------------------------------------------------------------------- d8
say "convirtiendo a DEX"
find "$WORK/classes" -name '*.class' > "$WORK/classes.txt"
mkdir -p "$WORK/dex"
# Las clases se pasan por stdin (xargs) para no chocar con el límite de
# longitud de la línea de comandos en proyectos grandes.
tr '\n' '\0' < "$WORK/classes.txt" \
  | xargs -0 "$D8" --release --min-api "$MIN_SDK" --lib "$PLATFORM/android.jar" \
          --output "$WORK/dex"

say "empaquetando el DEX en la APK"
( cd "$WORK/dex" && zip -q -X "$WORK/base.apk" classes.dex )

# -------------------------------------------------------- alinear y firmar
say "alineando"
"$ZIPALIGN" -f -p 4 "$WORK/base.apk" "$WORK/aligned.apk"

if [ "$UNSIGNED" -eq 1 ]; then
  cp "$WORK/aligned.apk" "$OUT"
else
  if [ -z "$KEYSTORE" ]; then
    KEYSTORE="$WORK/debug.keystore"
    if [ ! -f "$KEYSTORE" ]; then
      say "generando keystore de depuración"
      keytool -genkeypair -keystore "$KEYSTORE" \
        -storepass android -keypass android \
        -alias aurora -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Aurora Debug, O=Aurora, C=ES" >/dev/null 2>&1 \
        || die "keytool falló"
    fi
  fi
  say "firmando"
  "$APKSIGNER" sign \
    --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
    --ks-key-alias aurora --min-sdk-version "$MIN_SDK" \
    --out "$OUT" "$WORK/aligned.apk"
  "$APKSIGNER" verify --min-sdk-version "$MIN_SDK" "$OUT" >/dev/null \
    || die "la firma no verifica"
fi

# ------------------------------------------------------------- comprobación
say "comprobando la APK"
if unzip -l "$OUT" | grep -qE '[[:space:]]lib/'; then
  echo "AVISO: la APK lleva librerías nativas; habría que repartir por ABI." >&2
else
  say "sin código nativo: la misma APK vale para arm64-v8a, armeabi-v7a, x86 y x86_64"
fi
"$AAPT2" dump badging "$OUT" 2>/dev/null \
  | grep -E "^(package|sdkVersion|targetSdkVersion|application-label|launchable-activity|native-code|supports-screens)" \
  | sed 's/^/    /' || true

SIZE="$(du -h "$OUT" | cut -f1)"
say "listo: $OUT ($SIZE)"
