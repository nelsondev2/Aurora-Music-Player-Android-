package com.nelsondev2.aurora;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Locale;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Crea un respaldo portátil compatible con el importador ZIP v1. */
final class NativeBackupExporter {
    private static final String TAG = "AuroraBackupExport";

    static final class Result {
        int tracks;
        int playlists;
        int audioFiles;
    }

    private static final class AudioJob {
        final String path;
        final Uri uri;
        final File file;
        final String trackId;
        AudioJob(String path, Uri uri, File file, String trackId) {
            this.path = path;
            this.uri = uri;
            this.file = file;
            this.trackId = trackId;
        }
    }

    private NativeBackupExporter() { }

    static Result export(Context context, Uri destination) throws Exception {
        if (destination == null) throw new IllegalArgumentException("No se eligió dónde guardar el respaldo");
        Context app = context.getApplicationContext();
        NativeLibraryDatabase db = new NativeLibraryDatabase(app);
        try {
            JSONArray tracks = new JSONArray();
            JSONArray playlists = new JSONArray();
            JSONObject localStorage = new JSONObject();
            JSONObject settings = db.settingsSnapshot();
            java.util.Iterator<String> keys = settings.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (key.startsWith("local:")) localStorage.put(key.substring("local:".length()), settings.opt(key));
            }
            ArrayList<AudioJob> jobs = new ArrayList<AudioJob>();
            NativeAudioStore cache = new NativeAudioStore(app);
            int index = 0;
            for (JSONObject source : db.tracks()) {
                JSONObject track = new JSONObject(source.toString());
                String id = track.optString("id", "");
                String localUri = track.optString("localAudioUri", "");
                String sourceUri = track.optString("deviceUri", track.optString("uri", ""));
                boolean mediaStore = track.optBoolean("_device", false)
                        || sourceUri.startsWith("content://media/");
                track.remove("backupAudio");
                if (mediaStore) {
                    track.put("backupAudio", JSONObject.NULL);
                } else {
                    AudioJob job = sourceFor(cache, id, track, localUri, sourceUri, ++index);
                    if (job != null) {
                        // Abrir antes de escribir el índice evita producir un ZIP que
                        // anuncia un audio que el proveedor ya no permite leer.
                        InputStream test = open(app.getContentResolver(), job);
                        test.close();
                        track.put("backupAudio", job.path);
                        track.remove("localAudioUri");
                        track.remove("deviceUri");
                        track.remove("uri");
                        jobs.add(job);
                    } else {
                        track.put("backupAudio", JSONObject.NULL);
                    }
                }
                tracks.put(track);
            }
            for (JSONObject playlist : db.playlists()) playlists.put(new JSONObject(playlist.toString()));

            JSONObject manifest = new JSONObject();
            manifest.put("format", "aurora-migration-backup");
            manifest.put("formatVersion", 1);
            manifest.put("createdAt", String.valueOf(System.currentTimeMillis()));
            manifest.put("appVersion", "1.5.0");
            manifest.put("tracks", tracks);
            manifest.put("playlists", playlists);
            manifest.put("settings", settings);
            manifest.put("localStorage", localStorage);
            JSONArray audioEntries = new JSONArray();
            for (int i = 0; i < jobs.size(); i++) {
                JSONObject item = new JSONObject();
                item.put("path", jobs.get(i).path);
                item.put("trackId", jobs.get(i).trackId);
                audioEntries.put(item);
            }
            manifest.put("audioEntries", audioEntries);

            OutputStream destinationStream = app.getContentResolver().openOutputStream(destination, "w");
            if (destinationStream == null) throw new IllegalStateException("No se pudo crear el archivo de respaldo");
            ZipOutputStream zip = new ZipOutputStream(destinationStream);
            zip.setLevel(Deflater.BEST_SPEED);
            try {
                writeEntry(zip, "backup.json", manifest.toString().getBytes("UTF-8"));
                byte[] buffer = new byte[64 * 1024];
                for (AudioJob job : jobs) {
                    zip.putNextEntry(new ZipEntry(job.path));
                    InputStream input = open(app.getContentResolver(), job);
                    try {
                        int count;
                        while ((count = input.read(buffer)) >= 0) if (count > 0) zip.write(buffer, 0, count);
                    } finally { input.close(); }
                    zip.closeEntry();
                }
            } finally { zip.close(); }

            Result result = new Result();
            result.tracks = tracks.length();
            result.playlists = playlists.length();
            result.audioFiles = jobs.size();
            Log.i(TAG, "respaldo creado: " + result.tracks + " pistas, "
                    + result.playlists + " listas y " + result.audioFiles + " audios");
            return result;
        } finally { db.close(); }
    }

    private static AudioJob sourceFor(NativeAudioStore cache, String id, JSONObject track,
                                      String localUri, String sourceUri, int index) {
        File file = null;
        Uri uri = null;
        if (localUri.startsWith("file://")) file = new File(Uri.parse(localUri).getPath());
        else if (localUri.startsWith("content://")) uri = Uri.parse(localUri);
        else if (sourceUri.startsWith("content://")) uri = Uri.parse(sourceUri);
        else if (sourceUri.startsWith("file://")) file = new File(Uri.parse(sourceUri).getPath());
        else if (cache.has(id)) {
            String path = cache.pathFor(id);
            if (path != null) file = new File(path);
        }
        if (uri == null && (file == null || !file.exists())) return null;
        String extension = extension(track.optString("fileName", "audio"));
        String entry = String.format(Locale.US, "audio/%06d.%s", index, extension);
        return new AudioJob(entry, uri, file, id);
    }

    private static InputStream open(ContentResolver resolver, AudioJob job) throws Exception {
        InputStream input = job.file != null ? new FileInputStream(job.file) : resolver.openInputStream(job.uri);
        if (input == null) throw new IllegalStateException("No se pudo leer el audio de " + job.path);
        return input;
    }

    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot < 0 ? "audio" : name.substring(dot + 1).toLowerCase(Locale.US);
        ext = ext.replaceAll("[^a-z0-9]", "");
        return ext.length() == 0 || ext.length() > 8 ? "audio" : ext;
    }

    private static void writeEntry(ZipOutputStream zip, String name, byte[] bytes) throws Exception {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(bytes);
        zip.closeEntry();
    }
}
