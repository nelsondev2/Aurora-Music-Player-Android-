# Aurora Music Player · Android

Reproductor de música **offline-first** para Android, con interfaz y
reproducción Java nativas. La pantalla de inicio no se implementa en un
WebView.

**Versión:** 1.5.0 · licencia MIT · minSdk 21 (Android 5.0+)

## Migración nativa

La actividad de inicio es `NativeHomeActivity`. La biblioteca, listas,
preferencias y estado de reproducción se gestionan en Java/SQLite y el audio
se reproduce con `MediaPlayer` y un servicio Android. Se mantiene una sola
APK universal para Android 5.0+.

Para trasladar los datos, usa **Más → Exportar respaldo**, guarda el ZIP en
una ubicación accesible y después, en la instalación nativa, toca **Más →
Importar respaldo**. También puedes importar un respaldo creado por la
versión anterior. La exportación incluye metadatos, listas, ajustes y audio
al que la app aún tenga acceso; las pistas de MediaStore conservan su
referencia al archivo original. Conserva el ZIP hasta comprobar la
restauración.

## Funciones nativas

- **Biblioteca:** escaneo de MediaStore, búsqueda y selección múltiple de
  archivos mediante el selector del sistema.
- **Reproductor:** reproducción en segundo plano, controles multimedia,
  notificación, cola persistente, carátulas disponibles, velocidad ajustable
  y repetición de segmento A-B.
- **Organización:** listas de reproducción (renombrar, ordenar, limpiar,
  exportar y borrar), favoritos y calificación de cero a cinco estrellas.
  La cola permite saltar, quitar pistas pendientes, vaciar lo siguiente y
  guardarla como una lista.
- **Letras:** lectura y edición de LRC, importación/compartición, ajuste del
  desfase por pista, tamaño de texto, repetición de fragmentos y vista inmersiva.
- **Personalización:** temas, color de acento e idioma.
- **Audio:** ecualizador Android y visualizador animado.
- **Herramientas:** temporizador de apagado, estadísticas de reproducción,
  opciones de aleatorio/repetición de cola y exportación/importación manual
  de respaldos ZIP.

El acceso a las canciones originales depende de los permisos de Android y
la disponibilidad de sus URI. Los efectos de audio dependen de las funciones
que exponga el dispositivo.

## Compilar e instalar la APK

El proyecto produce **una sola APK universal**, con `minSdk 21`, instalable
en **Android 5.0 o superior** y válida para todas las arquitecturas, ya que
no incluye bibliotecas nativas. CI compila y verifica el artefacto.

Para compilar localmente se necesita JDK y SDK de Android con `aapt2`, `d8`,
`zipalign`, `apksigner` y una plataforma de compilación:

```bash
tools/build-apk.sh                      # build/aurora-android5-plus.apk
tools/build-apk.sh --out /tmp/aurora.apk
python3 tools/check.py                  # verificaciones estáticas del proyecto
```

La versión del SDK usada para compilar puede ser posterior a Android 5:
`minSdk 21` es el requisito mínimo del dispositivo y `targetSdk` define el
comportamiento de permisos y servicios en versiones recientes.

Para instalar la APK de CI: abre **Actions → Compilar APK → ejecución más
reciente → Artifacts**, descarga `aurora-android5-plus` y instala
`aurora-android5-plus.apk`.

## Arquitectura

- `NativeHomeActivity.java`: pantallas, biblioteca, listas y preferencias.
- `NativeLibraryDatabase.java`: pistas, listas y ajustes en SQLite.
- `NativeBackupImporter.java` y `NativeBackupExporter.java`: restauración y
  exportación del formato ZIP de migración.
- `NativePlayer.java` y `PlaybackService.java`: motor, reproducción en
  segundo plano, cola, sesión multimedia y notificación.
- `NativeLyrics.java`, `NativeEqualizerEngine.java` y
  `NativeVisualizerView.java`: letras, ecualizador y visualizador.
- `NativeText.java` y `assets/native_i18n.json`: textos localizados.
- `PlayQueue.java`: serialización de la cola y su estado de reproducción.

`assets/www` conserva recursos heredados para consulta y comprobaciones de
compatibilidad durante la transición del repositorio; no es la interfaz de
inicio de la APK, que se abre en Java nativo.

## Limitaciones y respaldos

- La exportación de audio requiere que Android todavía permita leer cada
  archivo. Si se revocó un permiso o se movió un archivo, vuelve a elegirlo
  antes de crear el respaldo.
- Las canciones de MediaStore no se duplican en el ZIP: se vuelve a consultar
  el almacenamiento local al importar y la referencia solo sirve mientras
  el archivo siga disponible.
- Los audios restaurados se guardan en el almacenamiento privado de Aurora;
  desinstalar la app los elimina. Conserva una copia del respaldo original.
- El escaneo de la biblioteca depende del permiso de audio concedido por el
  usuario y del contenido indexado por Android.

## Reportar un problema

Abre un [issue en GitHub](https://github.com/nelsondev2/Aurora-Music-Player-Android-/issues)
en español o inglés. Incluye modelo del dispositivo, versión de Android,
acción realizada y resultado esperado. No compartas archivos de música ni
respaldos privados en el reporte.
