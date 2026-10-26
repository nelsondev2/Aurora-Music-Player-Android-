# Aurora Music Player · Android

Reproductor de música offline-first para Android. La interfaz original de
Aurora vuelve a abrirse desde `assets/www` dentro del WebView de
`MainActivity`; Java Android se encarga de la reproducción en segundo plano,
la biblioteca del dispositivo y las integraciones con el sistema.

**Versión:** 1.5.0 · licencia MIT · minSdk 21 (Android 5.0+)

## Interfaz y reproducción

El lanzador muestra de nuevo la interfaz completa de Aurora: portada y
reproductor, inicio, biblioteca, listas, letras y ajustes. La pantalla se
sirve desde los recursos locales de la APK; no necesita conexión ni servidor.

El audio usa el motor Android `MediaPlayer` y `PlaybackService`, por lo que
puede seguir sonando al salir de la interfaz. La notificación, la sesión
multimedia y la cola nativa se coordinan con el reproductor web.

## Funciones

- Interfaz Aurora en `assets/www`, con portada, controles, cola y navegación.
- Biblioteca local e importación de varias pistas; escaneo del dispositivo
  mediante MediaStore y selector de archivos Android.
- Listas, favoritos, estrellas y búsqueda.
- Letras sincronizadas LRC, ajustes de sincronización y herramientas de letra.
- Ecualizador, visualizador, temporizador, estadísticas, temas e idiomas.
- Reproducción en segundo plano, controles multimedia, cola y persistencia
  mediante componentes Java/Android.
- Exportación e importación manual de respaldos ZIP para preservar listas,
  ajustes, metadatos y audio accesible.

## Respaldo de datos

Antes de actualizar, usa **Más opciones → Exportar respaldo** y guarda el
ZIP en una ubicación segura. La app permite importar ese archivo después.
Las pistas de MediaStore conservan la referencia al archivo original; el ZIP
incluye los audios que Aurora todavía puede leer. Mantén una copia hasta
comprobar que la restauración terminó.

## APK Android 5.0+

El proyecto compila **una sola APK universal** con `minSdk 21`, válida para
Android 5.0+ y sin variantes por arquitectura.

Para compilar localmente se necesita JDK y SDK de Android con `aapt2`, `d8`,
`zipalign`, `apksigner` y una plataforma Android instalada:

```bash
tools/build-apk.sh                      # build/aurora-android5-plus.apk
python3 tools/check.py                  # comprobaciones estáticas
```

La APK de CI está en **Actions → Compilar APK → ejecución más reciente →
Artifacts**, con el nombre `aurora-android5-plus`.

## Arquitectura

- `MainActivity.java`: WebView local, selector de archivos y puentes Android.
- `assets/www/`: interfaz de Aurora, estilos y módulos JavaScript.
- `PlaybackService.java` y `NativePlayer.java`: reproducción en segundo
  plano, notificación, sesión multimedia y motor de audio Android.
- `NativePlayerBridge.java` y `WebApp.java`: coordinación entre la interfaz,
  el servicio y el motor de reproducción.
- `DeviceLibraryBridge.java`: consulta de MediaStore y permisos de audio.
- `NativeHomeActivity.java`: implementación nativa anterior; ya no es la
  actividad de inicio.
- `NativeBackupImporter.java` y `NativeBackupExporter.java`: respaldo manual.

`tools/serve.py` sirve la interfaz web para desarrollo en un navegador:

```bash
python3 tools/serve.py          # http://localhost:8000
python3 tools/check.py
```

## Problemas y seguridad

Abre un [issue en GitHub](https://github.com/nelsondev2/Aurora-Music-Player-Android-/issues)
en español o inglés. Incluye el modelo del dispositivo, versión de Android,
acción realizada y resultado esperado. No publiques respaldos ni archivos de
música privados.
