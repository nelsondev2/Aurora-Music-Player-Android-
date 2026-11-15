package com.nelsondev2.aurora;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Restaura un respaldo ZIP exportado por Aurora en el almacenamiento nativo.
 *
 *  Restaurar REEMPLAZA la biblioteca actual (no se fusiona). Por seguridad
 *  se valida TODO antes de tocar nada: el índice, la ruta y el CRC de cada
 *  entrada de audio. Solo entonces se aparta el directorio library_audio,
 *  se escribe el nuevo audio y se sustituye la base de datos (dentro de una
 *  transacción). Si algo falla antes de terminar, se restaura lo anterior. */
final class NativeBackupImporter {

    private static final String TAG = "AuroraBackupImport";
    private static final long MAX_INDEX_BYTES = 64L * 1024L * 1024L;

    static final class Result {
        int tracks;
        int playlists;
        int audioFiles;
    }

    /** Trabajo de audio validado antes de tocar el almacenamiento. */
    private static final class AudioJob {
        final String path;
        final String trackId;
        final String extension;
        final ZipEntry entry;
        AudioJob(String path, String trackId, String extension, ZipEntry entry) {
            this.path = path;
            this.trackId = trackId;
            this.extension = extension;
            this.entry = entry;
        }
    }

    private NativeBackupImporter() {
    }

    static Result restore(Context context, Uri source) throws Exception {
        if (source == null) throw new IllegalArgumentException("No se eligió un archivo");
        Context app = context.getApplicationContext();
        File archive = new File(app.getCacheDir(), "aurora-import-temp.zip");
        if (archive.exists() && !archive.delete()) {
            throw new IllegalStateException("No se pudo preparar el archivo temporal");
        }

        try {
            copyArchive(app.getContentResolver(), source, archive);
            ZipFile zip = new ZipFile(archive);
            try {
                /* ---------- Fase 1: validar sin tocar nada ---------- */
                ZipEntry index = zip.getEntry("backup.json");
                if (index == null) throw new IllegalArgumentException("El ZIP no contiene backup.json");
                if (index.getSize() > MAX_INDEX_BYTES) {
                    throw new IllegalArgumentException("El índice del respaldo es demasiado grande");
                }
                JSONObject manifest;
                InputStream indexStream = zip.getInputStream(index);
                try {
                    manifest = new JSONObject(new String(readBounded(indexStream, MAX_INDEX_BYTES), "UTF-8"));
                } finally {
                    indexStream.close();
                }
                if (!"aurora-migration-backup".equals(manifest.optString("format"))) {
                    throw new IllegalArgumentException("El archivo no es un respaldo de Aurora");
                }
                if (manifest.optInt("formatVersion", 0) != 1) {
                    throw new IllegalArgumentException("Versión de respaldo no compatible");
                }

                Result result = new Result();
                JSONArray tracks = manifest.optJSONArray("tracks");
                ArrayList<AudioJob> jobs = new ArrayList<AudioJob>();
                ArrayList<JSONObject> trackRefs = new ArrayList<JSONObject>();
                if (tracks != null) {
                    for (int i = 0; i < tracks.length(); i++) {
                        JSONObject track = tracks.optJSONObject(i);
                        if (track == null) continue;
                        result.tracks++;
                        String id = track.optString("id", "");
                        String path = track.optString("backupAudio", "");
                        if (id.length() == 0 || path.length() == 0) continue;
                        if (!safeEntryPath(path)) {
                            throw new IllegalArgumentException("Ruta de audio inválida en el respaldo");
                        }
                        ZipEntry audio = zip.getEntry(path);
                        if (audio == null) {
                            throw new IllegalArgumentException("Falta un archivo de audio del respaldo");
                        }
                        // Verificación completa del CRC antes de borrar nada.
                        verifyEntryCrc(zip, audio);
                        String ext = extension(track.optString("fileName", path));
                        jobs.add(new AudioJob(path, id, ext, audio));
                        trackRefs.add(track);
                    }
                }

                /* ---------- Fase 2: sustituir audio y biblioteca ---------- */
                File audioDir = new File(app.getFilesDir(), "library_audio");
                File oldDir = new File(app.getFilesDir(), "library_audio.old");
                deleteRecursively(oldDir);
                boolean moved = false;
                if (audioDir.exists()) {
                    if (!audioDir.renameTo(oldDir)) {
                        throw new IllegalStateException("No se pudo apartar el audio actual");
                    }
                    moved = true;
                }
                boolean ok = false;
                try {
                    for (int i = 0; i < jobs.size(); i++) {
                        AudioJob job = jobs.get(i);
                        JSONObject track = trackRefs.get(i);
                        InputStream audioStream = zip.getInputStream(job.entry);
                        Uri restored;
                        try {
                            restored = savePermanentAudio(app, job.trackId, job.extension, audioStream);
                        } finally {
                            audioStream.close();
                        }
                        if (restored == null) {
                            throw new IllegalStateException("No se pudo restaurar el audio de "
                                    + track.optString("title", job.trackId));
                        }
                        track.put("localAudioUri", restored.toString());
                        result.audioFiles++;
                    }

                    JSONArray playlists = manifest.optJSONArray("playlists");
                    result.playlists = playlists == null ? 0 : playlists.length();
                    NativeLibraryDatabase database = new NativeLibraryDatabase(app);
                    try {
                        database.importBackup(manifest);
                    } finally {
                        database.close();
                    }
                    ok = true;
                } finally {
                    if (ok) {
                        deleteRecursively(oldDir);
                    } else {
                        // Algo falló: se descarta lo nuevo y se devuelve lo anterior.
                        deleteRecursively(audioDir);
                        if (moved && oldDir.exists() && !oldDir.renameTo(audioDir)) {
                            Log.e(TAG, "no se pudo devolver el audio anterior a library_audio");
                        }
                    }
                }
                Log.i(TAG, "respaldo restaurado: " + result.tracks + " pistas, "
                        + result.playlists + " listas y " + result.audioFiles + " audios");
                return result;
            } finally {
                zip.close();
            }
        } finally {
            if (archive.exists() && !archive.delete()) {
                Log.w(TAG, "no se pudo borrar el ZIP temporal");
            }
        }
    }

    private static void verifyEntryCrc(ZipFile zip, ZipEntry entry) throws Exception {
        InputStream input = zip.getInputStream(entry);
        try {
            CRC32 crc = new CRC32();
            byte[] buffer = new byte[64 * 1024];
            int count;
            long total = 0L;
            while ((count = input.read(buffer)) >= 0) {
                if (count > 0) {
                    crc.update(buffer, 0, count);
                    total += count;
                }
            }
            long expected = entry.getSize();
            if (expected >= 0 && total != expected) {
                throw new IllegalArgumentException("El audio «" + entry.getName() + "» está dañado (tamaño no coincide)");
            }
            if (crc.getValue() != entry.getCrc()) {
                throw new IllegalArgumentException("El audio «" + entry.getName() + "» está dañado (CRC no coincide)");
            }
        } finally {
            input.close();
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursively(child);
            }
        }
        if (!file.delete()) {
            Log.w(TAG, "no se pudo borrar " + file.getPath());
        }
    }

    private static Uri savePermanentAudio(Context context, String id, String ext, InputStream input) {
        File directory = new File(context.getFilesDir(), "library_audio");
        if (!directory.exists() && !directory.mkdirs()) return null;
        String cleanId = id.replaceAll("[^A-Za-z0-9_-]", "_");
        if (cleanId.length() > 90) cleanId = cleanId.substring(0, 90);
        String cleanExt = ext == null ? "audio" : ext.replaceAll("[^A-Za-z0-9]", "");
        if (cleanExt.length() == 0 || cleanExt.length() > 8) cleanExt = "audio";
        File target = new File(directory, cleanId + "." + cleanExt);
        File partial = new File(directory, cleanId + "." + cleanExt + ".part");
        FileOutputStream output = null;
        try {
            if (partial.exists()) partial.delete();
            output = new FileOutputStream(partial);
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (count > 0) output.write(buffer, 0, count);
            }
            output.getFD().sync();
            output.close();
            output = null;
            if (target.exists() && !target.delete()) return null;
            if (!partial.renameTo(target)) return null;
            return Uri.fromFile(target);
        } catch (Exception e) {
            Log.w(TAG, "no se pudo guardar audio permanente", e);
            return null;
        } finally {
            if (output != null) try { output.close(); } catch (Exception ignored) {}
            if (partial.exists()) partial.delete();
        }
    }

    private static void copyArchive(ContentResolver resolver, Uri source, File target) throws Exception {
        InputStream input = resolver.openInputStream(source);
        if (input == null) throw new IllegalArgumentException("No se pudo abrir el respaldo");
        FileOutputStream output = null;
        try {
            output = new FileOutputStream(target);
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (count > 0) output.write(buffer, 0, count);
            }
            output.getFD().sync();
        } finally {
            try { input.close(); } catch (Exception ignored) {}
            if (output != null) try { output.close(); } catch (Exception ignored) {}
        }
    }

    private static byte[] readBounded(InputStream input, long max) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[16 * 1024];
        int count;
        long total = 0;
        while ((count = input.read(buffer)) >= 0) {
            if (count == 0) continue;
            total += count;
            if (total > max) throw new IllegalArgumentException("El índice del respaldo supera el límite permitido");
            bytes.write(buffer, 0, count);
        }
        return bytes.toByteArray();
    }

    private static boolean safeEntryPath(String path) {
        if (path.startsWith("/") || path.indexOf('\\') >= 0 || path.indexOf(':') >= 0) return false;
        String[] parts = path.split("/");
        for (String part : parts) {
            if (part.length() == 0 || ".".equals(part) || "..".equals(part)
                    || !part.matches("[A-Za-z0-9._-]+")) return false;
        }
        return path.startsWith("audio/");
    }

    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return "audio";
        String ext = name.substring(dot + 1).toLowerCase(java.util.Locale.US)
                .replaceAll("[^a-z0-9]", "");
        return ext.length() == 0 || ext.length() > 5 ? "audio" : ext;
    }
}
