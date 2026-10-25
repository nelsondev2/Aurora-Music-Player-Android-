package com.nelsondev2.aurora;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Caché de audio en archivos reales, para el reproductor nativo.
 *
 * MediaPlayer no puede leer IndexedDB (ahí vive la biblioteca, dentro del
 * WebView), así que la web le manda la pista por trozos y aquí se guarda
 * como archivo en el almacenamiento privado de la app. Es una caché de
 * reproducción, no una segunda biblioteca: se limita por tamaño y se
 * vacía sola, y la copia buena sigue siendo la de IndexedDB.
 *
 * Ventaja de paso: el audio pasa a estar en disco, no en la cuota
 * «web» del WebView.
 */
final class NativeAudioStore {

    private static final String TAG = "AuroraNativeStore";

    /** Tope de la caché. Con 1 GB caben varias horas de FLAC. */
    private static final long MAX_BYTES = 1024L * 1024L * 1024L;

    private final Context appContext;
    private FileOutputStream out;
    private File pending;

    NativeAudioStore(Context context) {
        this.appContext = context.getApplicationContext();
    }

    static File dir(Context context) {
        File d = new File(context.getApplicationContext().getFilesDir(), "audio");
        if (!d.exists()) {
            //noinspection ResultOfMethodCallIgnored
            d.mkdirs();
        }
        return d;
    }

    private File dir() {
        return dir(appContext);
    }

    /** Empieza a recibir los trozos de una pista. */
    boolean begin(String trackId, String ext) {
        closeQuietly();
        if (trackId == null || trackId.length() == 0) return false;
        try {
            String cleanExt = safeExt(ext);
            // Se escribe a un archivo temporal y solo se renombra al
            // terminar: una pista a medias nunca se confunde con una buena.
            pending = new File(dir(), safeId(trackId) + "." + cleanExt + ".part");
            if (pending.exists() && !pending.delete()) return false;
            out = new FileOutputStream(pending);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "begin: " + e);
            out = null;
            pending = null;
            return false;
        }
    }

    /** Añade un trozo (base64 estándar). */
    boolean append(String base64) {
        if (out == null || base64 == null) return false;
        try {
            out.write(android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
            return true;
        } catch (Exception e) {
            Log.w(TAG, "append: " + e);
            closeQuietly();
            return false;
        }
    }

    /** Cierra la pista y la deja lista para reproducir. */
    boolean finish(String trackId, String ext) {
        if (out == null || pending == null) return false;
        try {
            out.flush();
            out.close();
            out = null;
            if (pending.length() == 0) {
                //noinspection ResultOfMethodCallIgnored
                pending.delete();
                pending = null;
                return false;
            }
            File target = new File(dir(), safeId(trackId) + "." + safeExt(ext));
            if (target.exists() && !target.delete()) return false;
            boolean moved = pending.renameTo(target);
            pending = null;
            if (moved) prune(target.getName());
            return moved;
        } catch (Exception e) {
            Log.w(TAG, "finish: " + e);
            closeQuietly();
            return false;
        }
    }

    /** ¿Está ya la pista en la caché? */
    boolean has(String trackId) {
        return fileFor(trackId) != null;
    }

    /** Ruta de la pista cacheada, o null. */
    String pathFor(String trackId) {
        File file = fileFor(trackId);
        return file == null ? null : file.getAbsolutePath();
    }

    void remove(String trackId) {
        File file = fileFor(trackId);
        if (file != null) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }

    private File fileFor(String trackId) {
        if (trackId == null || trackId.length() == 0) return null;
        String prefix = safeId(trackId) + ".";
        File[] files = dir().listFiles();
        if (files == null) return null;
        for (File f : files) {
            if (f.getName().startsWith(prefix) && !f.getName().endsWith(".part")) return f;
        }
        return null;
    }

    /**
     * Mantiene la caché por debajo del tope borrando lo más antiguo.
     * `keep` es el archivo recién escrito, que no se toca pase lo que pase.
     */
    private void prune(String keep) {
        File[] files = dir().listFiles();
        if (files == null) return;
        long total = 0;
        for (File f : files) total += f.length();
        if (total <= MAX_BYTES) return;

        java.util.Arrays.sort(files, new java.util.Comparator<File>() {
            @Override
            public int compare(File a, File b) {
                return Long.compare(a.lastModified(), b.lastModified());
            }
        });
        for (File f : files) {
            if (total <= MAX_BYTES) break;
            if (f.getName().equals(keep) || f.getName().endsWith(".part")) continue;
            long size = f.length();
            if (f.delete()) total -= size;
        }
    }

    private void closeQuietly() {
        if (out != null) {
            try {
                out.close();
            } catch (Exception ignored) {
            }
            out = null;
        }
        if (pending != null) {
            //noinspection ResultOfMethodCallIgnored
            pending.delete();
            pending = null;
        }
    }

    /** Ids de pista seguros como nombre de archivo. */
    private static String safeId(String id) {
        StringBuilder sb = new StringBuilder(id.length());
        for (int i = 0; i < id.length(); i++) {
            char c = id.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9') || c == '-' || c == '_';
            sb.append(ok ? c : '_');
        }
        String clean = sb.toString();
        return clean.length() > 80 ? clean.substring(0, 80) : clean;
    }

    private static String safeExt(String ext) {
        if (ext == null) return "audio";
        String e = ext.trim().toLowerCase(java.util.Locale.US).replaceAll("[^a-z0-9]", "");
        if (e.length() == 0 || e.length() > 5) return "audio";
        return e;
    }
}
