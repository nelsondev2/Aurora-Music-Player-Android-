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

## Cómo está montada

```
AndroidManifest.xml              proyecto de AIDE (sin Gradle)
src/com/nelsondev2/aurora/
    MainActivity.java            WebView, selector de archivos, botón atrás
    AuroraWebClient.java         sirve assets/www desde https://aurora.localhost
    AuroraBridge.java            puente JS ↔ Android (compartir por trozos)
    PlaybackService.java         segundo plano: MediaSession, notificación, foco
    AuroraMediaBridge.java       puente JS ↔ Android del estado de reproducción
    WebApp.java                  comandos del sistema hacia el WebView
    ShareProvider.java           content:// de solo lectura para compartir
    Mime.java                    tipos MIME por extensión
assets/www/                      la app (HTML + CSS + JS, sin build)
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

## Limitaciones conocidas

Dichas en voz alta, para que nadie se lleve una sorpresa:

- **El reproductor no es nativo.** El servicio en primer plano mantiene
  el proceso vivo en segundo plano, pero el audio lo sigue poniendo el
  WebView: si Android mata el proceso por memoria o cierras la tarea
  desde «recientes», la reproducción se corta. Un reproductor nativo
  (MediaPlayer/ExoPlayer con la cola en Java) sería el paso siguiente.
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
| `assets/www/js/platform.js` | Puente con Android (compartir, botón atrás) |
| `assets/www/js/` | Módulos de la app (audio, UI, listas, letras, ajustes…) |
| `assets/www/fonts/`, `assets/www/icon.png` | Fuente Outfit (OFL) e icono |
| `src/` | Código Java de la app Android |
| `res/` | Recursos de Android (iconos, tema, textos) |
| `tools/serve.py`, `tools/check.py` | Desarrollo en local y verificación |
| `README.md`, `LICENSE`, `CHANGELOG.md` | Documentación, licencia e historial |
