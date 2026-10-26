# Aurora Music Player · Android

Reproductor de música **offline-first** para Android. La pantalla principal
ahora está implementada en Java nativo y reproduce con `MediaPlayer`; no
necesita conexión, cuenta ni servidor.

**Versión:** 1.5.0 · licencia MIT · minSdk 21 (Android 5.0+)

## Estado de la transición a Java

Esta es la primera etapa funcional de la nueva aplicación nativa. Ya están
portados la biblioteca local, el escaneo de MediaStore, la importación de
audio, listas básicas, reproducción en segundo plano y restauración del ZIP
de migración. La conversión continúa: letras sincronizadas, ecualizador,
visualizador reactivo, estadísticas, temas e importación avanzada de listas
todavía deben trasladarse antes de retirar el código anterior.

Para conservar los datos de una instalación previa, exporta el ZIP desde
**Ajustes → Mantenimiento → Exportar respaldo para migrar** antes de
instalar esta versión. En la interfaz nativa, toca **Importar respaldo**
y selecciona ese ZIP. La biblioteca de MediaStore se vuelve a escanear; los
audios importados y las listas se restauran desde el respaldo.

## Funciones nativas disponibles

- **Biblioteca local**: escanea canciones del teléfono y permite buscar por
'título, artista o álbum; el audio original de MediaStore no se copia.
- **Importación de archivos**: el selector del sistema acepta varias pistas
  en una selección y conserva acceso a esos archivos.
- **Reproducción**: controles nativos, cola y reproducción en segundo plano
  mediante `MediaPlayer`, notificación y sesión multimedia de Android.
- **Listas básicas**: crear listas, añadir pistas con pulsación larga y
  reproducir una lista.
- **Restauración manual**: importa biblioteca, listas, ajustes y audio desde
  el respaldo ZIP creado por la edición de transición.

## Compilar e instalar la APK

El proyecto produce **una sola APK universal**, con `minSdk 21`, instalable
en **Android 5.0 o superior** y válida para las arquitecturas Android
habituales. La pantalla principal y el reproductor de esta versión se
inician en Java nativo. CI compila y verifica esa misma APK, sin variantes
por versión de Android.

Para compilarla localmente se necesita un JDK y el SDK de Android con
`aapt2`, `d8`, `zipalign`, `apksigner` y una plataforma de compilación:

```bash
tools/build-apk.sh                      # build/aurora-android5-plus.apk
tools/build-apk.sh --out /tmp/aurora.apk
```

La versión del SDK usada para compilar puede ser posterior a Android 5:
`minSdk 21` es el requisito mínimo del dispositivo y `targetSdk` define el
comportamiento de permisos y servicios en versiones recientes.

Para instalarla desde CI: abre **Actions → Compilar APK → ejecución más
reciente → Artifacts**, descarga **`aurora-android5-plus`**, descomprime el
archivo e instala `aurora-android5-plus.apk`. Es el mismo artefacto para
Android 5.0 y para versiones posteriores.

### Respaldo para trasladar tus datos

Antes de actualizar, crea el ZIP desde **Ajustes → Mantenimiento →
Exportar respaldo para migrar** en la APK de transición anterior y guárdalo
fuera del teléfono o en una carpeta accesible. Esta versión lo restaura con
**Importar respaldo**. El ZIP incluye listas, ajustes, metadatos y audio
importado; las pistas de MediaStore conservan la referencia a su archivo
original. No borres el ZIP hasta comprobar que la restauración terminó.

### Herramienta de vista previa heredada

`assets/www` y `tools/serve.py` se conservan temporalmente para consultar
la interfaz anterior durante la migración. No son la pantalla de inicio de
la APK nativa.

```bash
python3 tools/serve.py          # http://localhost:8000
python3 tools/check.py          # comprobaciones antes de compilar
```

En el navegador lo único que cambia es lo que aporta Android:
«Compartir» descarga el archivo en vez de abrir el selector, y el
botón atrás es el del navegador.

## Arquitectura nativa actual

La actividad de inicio es `NativeHomeActivity.java`; la biblioteca, las
listas y los ajustes migrados se guardan en SQLite (`NativeLibraryDatabase`).
La música del teléfono se consulta desde MediaStore y se reproduce desde el
`content://` original. Los archivos elegidos por el selector del sistema
conservan su permiso de lectura.

`NativePlayer.java` y `PlaybackService.java` llevan la reproducción, la
cola, el foco de audio, la pausa al desconectar auriculares, la notificación
y la sesión multimedia. La cola nativa conoce las URI de las pistas para
poder continuar cuando la actividad no está visible.

`NativeBackupImporter.java` restaura el formato ZIP v1: lee `backup.json`,
guarda permanentemente los audios incluidos en el almacenamiento privado y
restaura listas y ajustes en SQLite. Los respaldos grandes se copian a un
archivo temporal durante la importación; se elimina al terminar.

### Archivos principales

```
AndroidManifest.xml                 minSdk 21; NativeHomeActivity es el inicio
src/com/nelsondev2/aurora/
    NativeHomeActivity.java         pantalla nativa: biblioteca, listas y controles
    NativeLibraryDatabase.java      pistas, listas y ajustes en SQLite
    NativeBackupImporter.java       importador del ZIP de migración
    NativePlayer.java               reproducción Android con MediaPlayer
    PlaybackService.java            segundo plano, MediaSession y notificación
    NativeAudioStore.java           caché de reproducción
    PlayQueue.java                  cola que atiende controles del sistema
    DeviceLibraryBridge.java        consulta MediaStore reutilizable
    ShareProvider.java              URI de solo lectura para compartir
assets/www/                         interfaz anterior retenida durante la transición
res/                                iconos, tema y textos de Android
tools/                              compilación y verificaciones
```

### Trabajo pendiente de portar

Esta es una primera versión nativa funcional, no la paridad final. Siguen
pendientes las letras sincronizadas, estrellas, estadísticas, temas e
idiomas, ecualizador, visualizador reactivo, temporizador, aleatorio y las
opciones avanzadas de las listas. Esos módulos se trasladarán antes de
retirar por completo los recursos de la interfaz anterior.

## Limitaciones actuales

- La migración todavía no tiene paridad con todas las funciones de la
  interfaz anterior; la lista de trabajo pendiente aparece arriba.
- La biblioteca de MediaStore requiere permiso de lectura. Si se deniega,
  la app conserva la música ya importada y permite volver a solicitarlo
  con **Escanear**.
- El ZIP de respaldo debe exportarse antes de actualizar desde la APK de
  transición anterior. Mantén una copia del archivo hasta verificar la
  restauración en este reproductor.
- Los audios restaurados se guardan en el almacenamiento privado de Aurora;
  desinstalar la app los elimina. Conserva el respaldo original.
- El espacio libre del dispositivo limita la cantidad de audio que puede
  importarse o restaurarse.

## Reportar un problema

Abre un [*issue* en GitHub](https://github.com/nelsondev2/Aurora-Music-Player-Android-/issues)
en español o inglés. Incluye el modelo del dispositivo, la versión de
Android, la acción realizada y el resultado esperado. No compartas archivos
de música ni respaldos privados en el reporte.

## Contenido

| Ruta | Qué es |
|---|---|
| `AndroidManifest.xml` | Lanzador nativo y compatibilidad Android 5.0+ |
| `src/com/nelsondev2/aurora/NativeHomeActivity.java` | Interfaz Java nativa |
| `src/com/nelsondev2/aurora/NativeLibraryDatabase.java` | Biblioteca y listas en SQLite |
| `src/com/nelsondev2/aurora/NativeBackupImporter.java` | Importación del respaldo ZIP |
| `src/com/nelsondev2/aurora/PlaybackService.java` | Reproducción en segundo plano |
| `src/com/nelsondev2/aurora/NativePlayer.java` | Motor MediaPlayer |
| `assets/www/` | Recursos de la interfaz anterior, retenidos durante la transición |
| `res/` | Recursos de Android (iconos, tema y textos) |
| `tools/check.py` | Comprobaciones del proyecto |
| `tools/build-apk.sh` | Compila una APK universal con SDK + JDK |
| `.github/workflows/` | Verificaciones y compilación en CI |
| `README.md`, `LICENSE`, `CHANGELOG.md` | Documentación, licencia e historial |
