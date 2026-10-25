# Aurora Music Player · Android

Reproductor de música **offline-first** para Android: una app web
completa (HTML, CSS y JavaScript propios) dentro de un WebView, sin
servidor, sin cuenta y sin publicidad. Carga archivos locales
(MP3, M4A, FLAC, WAV, OGG, Opus), lee ID3 y letras LRC.

**Versión:** 1.3.0 · licencia MIT · minSdk 21 · sin dependencias

> **Nota:** Aurora es un proyecto **generado con inteligencia
> artificial**. Todo su código —y las traducciones de la
> interfaz— lo ha escrito un asistente de IA, con la dirección,
> las decisiones y las pruebas finales de una persona. Si algo
> suena raro en tu idioma o se comporta de forma extraña, no es
> un misterio: repórtalo en los *issues* y se corrige.

## Qué hace

- **Tu música, sin nube**: importa MP3, M4A, FLAC, WAV, OGG y Opus
  desde el dispositivo, con metadatos, portadas y duración real. Todo
  queda guardado en el almacenamiento local de la app; sin red, sin
  cuenta y sin servidor.
- **La música que ya tienes, sin copiarla**: «Buscar música en el móvil»
  lee la biblioteca del teléfono por MediaStore y guarda solo la ficha
  (título, artista, álbum, carátula) y el `content://` del archivo
  original. Nada se duplica: la canción suena desde donde ya estaba, y
  si la borras de Aurora el archivo sigue en el teléfono (vuelve a
  aparecer en el siguiente escaneo).
- **Letras sincronizadas**: archivos `.lrc` o letras incrustadas, con
  desplazamiento automático y pantalla de letras a lo grande.
- **Listas para todo**: crea y edita listas, marca **Favoritos** y
  deja que la app mantenga sola «Mi Música» (lo añadido fuera de
  listas). Todas las listas —Favoritos incluida— **se ordenan solas
  por tus estrellas**: las mejores arriba, las sin nota al final, y
  la cola suena en ese mismo orden.
- **Estrellas de 1 a 5** en el menú de cada canción, en el reproductor
  y en las filas, para valorar sin salir de donde estás. En Inicio,
  el escaparate «Más valoradas» enseña tus mejores notas.
- **Reproducción seria**: cola, aleatorio de verdad, repetir, bucle
  A-B, «Reproducir desde…» con su contexto, reproducción continua
  (gapless/crossfade), ecualizador, visualizador y temporizador de
  apagado.
- **Sigue sonando fuera de la app**: reproducción en segundo plano con
  notificación y carátula, controles en la pantalla de bloqueo y en los
  auriculares, y foco de audio (si entra una llamada, Aurora se pausa
  sola).
- **Motor de audio del sistema**: el sonido lo pone Android
  (MediaPlayer), así que la música aguanta aunque el WebView desaparezca
  y el paso de una pista a la siguiente no tiene hueco. Se puede cambiar
  al motor de la app (Web Audio) desde Ajustes, que es el que trae
  ecualizador, visualizador y fundidos.
- **Estadísticas**: más reproducidas, artistas favoritos y tiempo de
  escucha (una reproducción solo cuenta cuando la canción suena
  entera).
- **Comparte lo que quieras**: canciones, listas (`.m3u8`) y letras
  salen por el selector «Compartir» de Android, listos para cualquier
  app (mensajería, correo, unidades de nube…).
- **Ordena y explora a tu manera**: cada lista se puede ordenar por
  título, artista, álbum o duración (además del orden por estrellas),
  y Biblioteca explora tu colección por Álbumes, Artistas y Géneros.
  La cola se puede guardar como lista y hay buscador de duplicados.
- **14 idiomas** (es, en, pt, zh, ja, fr, it, ru, de, uk, pl, tr, id,
  zh-TW), temas y colores de acento.

## Compilar el APK con AIDE

El repositorio **es** el proyecto de AIDE: no hay Gradle, ni
repositorios que descargar, ni dependencias externas (nada de
AndroidX). Se compila offline con el propio compilador de AIDE.

1. Copia esta carpeta al almacenamiento del teléfono (o clónala con
   git desde AIDE).
2. En AIDE: **Abrir proyecto → carpeta del proyecto**. AIDE reconoce
   `AndroidManifest.xml` y propone sus SDK instalados.
3. Pulsa **Run**: compila el APK y lo instala.

Requisitos: AIDE 3.x o superior con un SDK de compilación 26 o mayor
(el minSdk de la app es 21; la notificación de reproducción usa
`NotificationChannel`, que necesita API 26 para compilar). El resultado es `Aurora.apk`, sin permisos de
almacenamiento (los archivos se eligen con el selector del sistema,
que concede cada archivo concreto).

### Compilar sin AIDE (CI o portátil)

`tools/build-apk.sh` hace lo mismo que AIDE pero desde la línea de
comandos: `aapt2 → javac → d8 → zipalign → apksigner`, sin Gradle ni
dependencias que descargar.

```bash
tools/build-apk.sh                      # build/aurora-minSdk21.apk
tools/build-apk.sh --min-sdk 26         # variante para Android 8+
tools/build-apk.sh --out /tmp/a.apk --unsigned
```

Necesita `ANDROID_HOME` con build-tools y una plataforma, y un JDK.

**Sobre las arquitecturas:** la app no lleva código nativo (ni `.so`, ni
NDK, ni jniLibs), así que **una sola APK sirve para arm64-v8a,
armeabi-v7a, x86 y x86_64**: el WebView, el MediaPlayer y el resto los
pone el sistema. Por eso el workflow `.github/workflows/build-apk.yml`
compila por **tramos de Android**, que es lo que sí cambia de un móvil a
otro, y deja tres artefactos firmados listos para instalar:

| Artefacto | Sirve para |
|---|---|
| `aurora-minSdk21` | todo móvil con Android 5.0+ (cualquier ABI) |
| `aurora-minSdk26` | Android 8.0+ |
| `aurora-minSdk33` | Android 13+ |

Un segundo job (`Cobertura de la APK`) abre la APK universal y comprueba
lo que de verdad importa: que están el manifiesto, `resources.arsc`,
`classes.dex` y la app web; que no aparece ninguna librería nativa (si
algún día aparece, el job falla y avisa de que habría que repartir por
ABI); y qué densidades de pantalla lleva dentro.

Para probar en el móvil: pestaña **Actions → Compilar APK →** el run
más reciente **→ Artifacts**, descarga el zip del tramo que
corresponda a tu Android, descomprime e instala el `.apk`.

### Probar la parte web en el ordenador

La app entera vive en `assets/www` y funciona en cualquier navegador
moderno:

```bash
python3 tools/serve.py          # http://localhost:8000
python3 tools/check.py          # comprobaciones antes de compilar
```

En el navegador lo único que cambia es lo que aporta Android:
«Compartir» descarga el archivo en vez de abrir el selector, y el
botón atrás es el del navegador.

## La música del móvil, sin copiarla

La app no necesita que le pases los archivos: lee la biblioteca del
teléfono por MediaStore y se queda con la ficha.

- **`DeviceLibraryBridge.java`** (`window.AuroraDevice`) consulta
  MediaStore por páginas de 200 (`scan(offset, limit)`) para que una
  biblioteca de miles de canciones no acabe en una sola cadena de
  JavaScript, y devuelve carátulas en JPEG de 256 px (`albumArt`).
- **`js/device-library.js`** recorre las páginas, evita duplicados (por
  id de MediaStore y por nombre + tamaño: una canción importada antes
  copiándola no entra dos veces) y crea pistas con `deviceUri` en vez de
  un `Blob`.
- **Reproducción**: las pistas del móvil van al motor nativo con
  `playUri(trackId, uri, ms)` y el relevo se prepara con
  `prepareNextUri` — el archivo original se lee, nunca se copia a la
  caché de la app. Con el motor web se avisa una vez: `content://` solo
  suena con garantías en el motor del sistema.
- **Permiso**: `READ_MEDIA_AUDIO` desde Android 13, `READ_EXTERNAL_STORAGE`
  hasta Android 12. Se pide al pulsar «Buscar música en el móvil», nunca
  al arrancar; si se deniega, la app sigue funcionando como siempre.
- **Borrar** una pista del móvil olvida la ficha, no toca el archivo.
- **Compartir** una pista del móvil comparte el `content://` original
  (el receptor lee el archivo real, sin pasar por la memoria de Aurora).

## Cómo está montada

```
AndroidManifest.xml              proyecto de AIDE (sin Gradle)
src/com/nelsondev2/aurora/
    MainActivity.java            WebView, selector de archivos, botón atrás
    AuroraWebClient.java         sirve assets/www desde https://aurora.localhost
    AuroraBridge.java            puente JS ↔ Android (compartir por trozos)
    PlaybackService.java         segundo plano: MediaSession, notificación, foco
    NativePlayer.java            MediaPlayer con relevo preparado (gapless)
    NativePlayerBridge.java      puente JS ↔ Android del motor nativo
    NativeAudioStore.java        caché de audio en archivos, para MediaPlayer
    PlayQueue.java               ventana de la cola para cuando no hay página
    AuroraMediaBridge.java       puente JS ↔ Android del estado de reproducción
    DeviceLibraryBridge.java     música del móvil por MediaStore (solo la ficha)
    WebApp.java                  comandos del sistema hacia el WebView
    ShareProvider.java           content:// de solo lectura para compartir
    Mime.java                    tipos MIME por extensión
assets/www/                      la app (HTML + CSS + JS, sin build)
    js/device-library.js         escaneo paginado del móvil y fichas sin copia
res/                             iconos, tema y textos de Android
tools/                           servidor local y comprobaciones
```

Tres decisiones que explican el resto:

- **La app no se carga con `file://`.** En Chromium un `file://` es un
  origen opaco, y ahí IndexedDB —donde vive toda la música— no es
  fiable o se pierde al cerrar. `AuroraWebClient` intercepta
  `https://aurora.localhost/…` y responde desde `assets/www`, así que
  el WebView ve un origen seguro normal: IndexedDB, `localStorage` y
  `navigator.storage.persist()` funcionan como en cualquier web.
  Nada sale a la red: lo que no existe en assets devuelve un 404 local.
- **Compartir sin AndroidX.** Android no deja enviar un `File` a otra
  app, y `FileProvider` obligaría a arrastrar AndroidX. `ShareProvider`
  son ochenta líneas de `ContentProvider` de solo lectura, y el
  archivo cruza el puente por trozos de 512 KB en base64 para no
  cargar un FLAC entero en memoria.
- **El botón atrás pregunta a la web.** `MainActivity` evalúa
  `window.AuroraAndroidBack()`, que cierra la hoja abierta, sale de
  Letras o responde «sigue sonando» para que la app se vaya al fondo
  sin cortar la música, en vez de matar la reproducción.

## Reproducción en segundo plano

El audio sigue viviendo en el WebView (la app es una sola página), pero
`PlaybackService` lo protege: es un servicio en primer plano que mantiene
el proceso vivo mientras suena, publica la notificación con carátula y
controles, expone la sesión a la pantalla de bloqueo y a los auriculares
(`MediaSession`), pide el foco de audio —si entra una llamada, la música
se pausa— y sostiene un wake lock parcial para que el sueño del
dispositivo no la corte.

El estado viaja en los dos sentidos:

- **Web → Android:** cada cambio de pista, play/pausa o salto llama a
  `window.AuroraMedia` (`AuroraMediaBridge`), que actualiza notificación y
  sesión. Se deduplica en `js/platform.js`, así que repetir llamadas no
  cuesta nada.
- **Android → Web:** los botones de la notificación, del bloqueo y de los
  auriculares ejecutan `window.AuroraMediaCommand('play' | 'pause' |
  'next' | 'prev')`, que llama a la app de siempre.

En pausa el servicio suelta el primer plano: nada suena, así que el
sistema puede reclamar el proceso y la notificación se puede descartar con
un gesto. En Android 13+ la primera reproducción pide permiso para
mostrar notificaciones; si se niega, la música suena igual, sin controles
en la cortina.

### La cola también, sin la app abierta

La cola de verdad vive en la web (aleatorio, repetir, listas que se
reordenan solas), pero Java guarda una **ventana** de ella —la pista
actual y las diez siguientes, con título, artista, álbum y duración— en
`PlayQueue.java`. La web la empuja cada vez que cambia, deduplicada, así
que no cuesta nada mantenerla al día.

Gracias a esa ventana, con la app cerrada siguen funcionando «siguiente»,
«anterior», el avance automático al terminar una canción y la
notificación con la carátula correcta (se guardan las últimas ocho
portadas vistas). Si la ventana se agota, la reproducción se detiene: es
preferible a que suene algo que no toca. Al volver a la app, la web manda
otra vez y todo recupera su sitio.

## Motor de audio: sistema o app

La app sabe reproducir de dos maneras y se elige en **Ajustes → Motor de
audio** (se aplica en la siguiente reproducción):

| | Motor del sistema (por defecto) | Motor de la app |
|---|---|---|
| Quién pone el sonido | `MediaPlayer` (Java) | `<audio>` + Web Audio (WebView) |
| Si el WebView muere | **la música sigue** | se corta |
| Relevo entre pistas | sin hueco (`setNextMediaPlayer`) | sin hueco o con fundido |
| Ecualizador / visualizador | no | **sí** |
| Fundidos (crossfade) | no | **sí** |
| Normalización de volumen | no | **sí** |

El motor nativo es el de por defecto porque es el que hace que la música
no dependa de la página. Para que `MediaPlayer` pueda leer las pistas, la
web le manda el audio por trozos la primera vez que suena cada canción y
queda en una caché de archivos (`filesDir/audio`, tope 1 GB, se vacía
sola por antigüedad; borrar una pista de la biblioteca borra también su
archivo). Esa caché es la contrapartida: la biblioteca sigue viviendo en
IndexedDB y el motor nativo guarda además una copia temporal de lo que
suena.

Si una pista falla tres veces seguidas en el motor nativo (un códec que
el sistema no reconoce), la app avisa y vuelve sola al motor del WebView.

Los dos motores se presentan a la app igual: `js/native-audio.js` expone
un objeto que se comporta como el `<audio>` (mismos eventos
`timeupdate`, `ended`, `error`…), así que la cola, las estadísticas, las
letras y la interfaz no saben —ni necesitan saber— cuál está sonando.

## Limitaciones conocidas

Dichas en voz alta, para que nadie se lleve una sorpresa:

- **Sin página, la cola es una copia congelada.** Java reproduce las
  siguientes diez pistas tal como estaban al cerrar la app; si se acaban,
  la música se detiene. Reordenar, cambiar de lista o activar aleatorio
  necesita la app abierta.
- **El motor del sistema no tiene ecualizador ni visualizador.** Son
  Web Audio; para tenerlos hay que elegir el motor de la app en Ajustes.
- **La caché del motor nativo ocupa disco aparte.** Duplica el audio que
  está sonando (hasta 1 GB, con poda automática), además de la copia de
  la biblioteca en IndexedDB.
- **El espacio manda el dispositivo.** La biblioteca vive en el
  almacenamiento web del WebView; una biblioteca enorme puede chocar
  con la cuota del sistema.
- **Sin selector de carpetas en Android** (la plataforma no lo
  ofrece): se eligen archivos sueltos o varios a la vez.
- **Los archivos importados no se copian**: se guardan dentro de la
  app, así que borrar los datos de Aurora (o desinstalarla) borra su
  biblioteca. Los archivos originales de tu dispositivo no se tocan.
- Las traducciones las mantiene el proyecto: si tu idioma suena raro,
  un aviso en los *issues* se agradece.

## Reportar un problema

En los [*issues* de GitHub](https://github.com/nelsondev2/Aurora-Music-Player-Android-/issues)
(en español o inglés). Ayuda mucho incluir:

- la versión de Aurora (Ajustes → Acerca de),
- tu dispositivo, la versión de Android y el WebView instalado,
- los pasos para reproducir el fallo, y qué esperabas que pasara.

## Contenido

| Ruta | Qué es |
|---|---|
| `assets/www/index.html` | Markup de la app (vistas, hojas, sprite de iconos) |
| `assets/www/css/styles.css` | Estilos, temas y acentos |
| `assets/www/js/data.js` | Traducciones (14 idiomas) y utilidades de datos |
| `assets/www/js/storage.js` | Persistencia en IndexedDB |
| `assets/www/js/uploader.js` | Lectura de archivos, ID3 y LRC |
| `assets/www/js/platform.js` | Puente con Android (compartir, botón atrás, notificación) |
| `assets/www/js/native-audio.js` | Motor nativo con la cara de un `<audio>` |
| `assets/www/js/` | Módulos de la app (audio, UI, listas, letras, ajustes…) |
| `assets/www/fonts/`, `assets/www/icon.png` | Fuente Outfit (OFL) e icono |
| `src/` | Código Java de la app Android |
| `res/` | Recursos de Android (iconos, tema, textos) |
| `tools/serve.py`, `tools/check.py` | Desarrollo en local y verificación |
| `tools/build-apk.sh` | Compila el APK sin Gradle (SDK + JDK) |
| `.github/workflows/` | Comprobaciones y compilación del APK en CI |
| `README.md`, `LICENSE`, `CHANGELOG.md` | Documentación, licencia e historial |
