package com.nelsondev2.aurora;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * La música que ya está en el móvil, sin copiarla (window.AuroraDevice).
 *
 * Hasta ahora importar quería decir leer el archivo y guardarlo dentro de
 * la app, así que la misma canción acababa dos veces en el dispositivo.
 * Con MediaStore la biblioteca puede apuntar al archivo original: se
 * guarda su content:// y su ficha, y el audio se lee de donde ya está.
 *
 * La consulta va por páginas (scan) porque una biblioteca grande no cabe
 * en una sola cadena de JavaScript.
 */
class DeviceLibraryBridge {

    private static final String TAG = "AuroraDevice";

    /** Código de petición del permiso de audio (MainActivity lo usa). */
    static final int REQ_AUDIO_PERMISSION = 2001;

    private final MainActivity activity;

    DeviceLibraryBridge(MainActivity activity) {
        this.activity = activity;
    }

    private Context context() {
        return activity;
    }

    /**
     * Empieza el lote de selección de archivos de una importación. Las URI se
     * asocian por nombre y tamaño al File que entrega el WebView; si la clave
     * no es única, JS no recibe ninguna URI para evitar escribir otra canción.
     */
    synchronized void beginPickedBatch() {
        context().getSharedPreferences("picked_audio_sources", Context.MODE_PRIVATE)
                .edit().clear().apply();
    }

    synchronized void rememberPickedUri(Uri uri, boolean persistedReadGrant) {
        // Solo guardar URI que sobrevivirá al cierre de la app. Sin este
        // permiso la pista conserva su Blob y sigue reproduciéndose desde caché.
        if (uri == null || !persistedReadGrant) return;
        ContentResolver resolver = context().getContentResolver();
        Cursor cursor = null;
        try {
            cursor = resolver.query(uri,
                    new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE},
                    null, null, null);
            if (cursor == null || !cursor.moveToFirst()) return;
            String name = cursor.getString(0);
            long size = cursor.isNull(1) ? -1 : cursor.getLong(1);
            if (name == null || name.length() == 0 || size < 0) return;
            String key = sourceKey(name, size);
            SharedPreferences prefs = context().getSharedPreferences(
                    "picked_audio_sources", Context.MODE_PRIVATE);
            String encoded = prefs.getString(key, "[]");
            JSONArray values = new JSONArray(encoded);
            for (int i = 0; i < values.length(); i++) {
                if (uri.toString().equals(values.optString(i))) return;
            }
            values.put(uri.toString());
            prefs.edit().putString(key, values.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "No se pudo recordar la URI seleccionada: " + e);
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    @JavascriptInterface
    public synchronized String originalUriFor(String displayName, long size) {
        if (displayName == null || size < 0) return "";
        try {
            String encoded = context().getSharedPreferences(
                    "picked_audio_sources", Context.MODE_PRIVATE)
                    .getString(sourceKey(displayName, size), "[]");
            JSONArray values = new JSONArray(encoded);
            return values.length() == 1 ? values.getString(0) : "";
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public String readLyricsFromOriginal(String uri) {
        JSONObject out = new JSONObject();
        try {
            Uri source = Uri.parse(uri);
            String name = pickedDisplayName(source).toLowerCase(java.util.Locale.ROOT);
            String lyrics;
            if (name.endsWith(".mp3")) lyrics = Mp3LyricsWriter.read(context(), source);
            else if (name.endsWith(".flac")) lyrics = FlacLyricsWriter.read(context(), source);
            else throw new IllegalArgumentException("format_unsupported");
            out.put("ok", true);
            out.put("lyrics", lyrics == null ? JSONObject.NULL : lyrics);
        } catch (Exception e) {
            try {
                out.put("ok", false);
                out.put("code", e.getMessage() == null ? "read_failed" : e.getMessage());
            } catch (Exception ignored) {
            }
        }
        return out.toString();
    }

    @JavascriptInterface
    public String writeLyricsToOriginal(String uri, String lyrics) {
        JSONObject out = new JSONObject();
        try {
            Uri source = Uri.parse(uri);
            String name = pickedDisplayName(source).toLowerCase(java.util.Locale.ROOT);
            if (name.endsWith(".mp3")) Mp3LyricsWriter.write(context(), source, lyrics);
            else if (name.endsWith(".flac")) FlacLyricsWriter.write(context(), source, lyrics);
            else throw new IllegalArgumentException("format_unsupported");
            out.put("ok", true);
        } catch (Exception e) {
            String code = e.getMessage();
            if (code == null || code.length() == 0) code = "write_failed";
            try {
                out.put("ok", false);
                out.put("code", code);
            } catch (Exception ignored) {
            }
        }
        return out.toString();
    }

    private String pickedDisplayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = context().getContentResolver().query(uri,
                    new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null) return name;
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return uri == null ? "" : String.valueOf(uri.getLastPathSegment());
    }

    private static String sourceKey(String name, long size) {
        return "source:" + name.trim().toLowerCase(java.util.Locale.ROOT) + ":" + size;
    }

    /** Permiso de lectura de audio: READ_MEDIA_AUDIO desde Android 13. */
    static String audioPermission() {
        if (Build.VERSION.SDK_INT >= 33) return "android.permission.READ_MEDIA_AUDIO";
        return "android.permission.READ_EXTERNAL_STORAGE";
    }

    static boolean hasPermission(Context context) {
        try {
            return context.checkSelfPermission(audioPermission()) == 0;
        } catch (Exception e) {
            return false;
        }
    }

    // ------------------------------------------------------------ consulta

    /**
     * Estado actual, como JSON: {"granted":bool,"sdk":int,"total":int}.
     * `total` solo se calcula si hay permiso.
     */
    @JavascriptInterface
    public String status() {
        JSONObject out = new JSONObject();
        try {
            boolean granted = hasPermission(context());
            out.put("granted", granted);
            out.put("sdk", Build.VERSION.SDK_INT);
            out.put("total", granted ? count() : 0);
        } catch (Exception e) {
            Log.w(TAG, "status: " + e);
        }
        return out.toString();
    }

    /** Pide el permiso; la respuesta llega a window.AuroraDeviceAccess(). */
    @JavascriptInterface
    public void requestAccess() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.requestAudioPermission();
            }
        });
    }

    private int count() {
        try {
            Cursor cursor = context().getContentResolver().query(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    new String[]{MediaStore.Audio.Media._ID},
                    MediaStore.Audio.Media.IS_MUSIC + "!=0", null, null);
            if (cursor == null) return 0;
            try {
                return cursor.getCount();
            } finally {
                cursor.close();
            }
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Una página de pistas, como JSON:
     * {"total":int,"items":[{id,uri,title,artist,album,albumId,duration,
     *  size,fileName,mime,track,year,addedAt}]}
     */
    @JavascriptInterface
    public String scan(int offset, int limit) {
        JSONObject out = new JSONObject();
        if (!hasPermission(context())) {
            try {
                out.put("error", "permission");
            } catch (Exception ignored) {
            }
            return out.toString();
        }
        int start = Math.max(0, offset);
        int size = Math.max(1, Math.min(limit <= 0 ? 200 : limit, 500));

        Cursor cursor = null;
        try {
            String[] columns = {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.ALBUM_ID,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.SIZE,
                    MediaStore.Audio.Media.DISPLAY_NAME,
                    MediaStore.Audio.Media.MIME_TYPE,
                    MediaStore.Audio.Media.TRACK,
                    MediaStore.Audio.Media.YEAR,
                    MediaStore.Audio.Media.DATE_ADDED
            };
            cursor = context().getContentResolver().query(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    columns,
                    MediaStore.Audio.Media.IS_MUSIC + "!=0",
                    null,
                    MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC");

            JSONArray items = new JSONArray();
            if (cursor != null) {
                int total = cursor.getCount();
                out.put("total", total);
                // Avanzar hasta la página: evita cláusulas LIMIT/OFFSET, que
                // no están en todas las versiones de MediaStore.
                if (cursor.moveToPosition(start)) {
                    do {
                        JSONObject item = read(cursor);
                        if (item != null) items.put(item);
                    } while (items.length() < size && cursor.moveToNext());
                }
            }
            out.put("items", items);
        } catch (Exception e) {
            Log.w(TAG, "scan: " + e);
            try {
                out.put("error", String.valueOf(e.getMessage()));
            } catch (Exception ignored) {
            }
        } finally {
            if (cursor != null) cursor.close();
        }
        return out.toString();
    }

    private JSONObject read(Cursor cursor) {
        try {
            long id = cursor.getLong(0);
            String title = blankIfNull(cursor.getString(1));
            String artist = blankIfNull(cursor.getString(2));
            String album = blankIfNull(cursor.getString(3));
            long albumId = cursor.getLong(4);
            long duration = cursor.getLong(5);
            long size = cursor.getLong(6);
            String fileName = blankIfNull(cursor.getString(7));
            String mime = blankIfNull(cursor.getString(8));
            int track = cursor.getInt(9);
            int year = cursor.getInt(10);
            long addedAt = cursor.getLong(11) * 1000L; // DATE_ADDED va en segundos

            Uri uri = ContentUris.withAppendedId(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);

            JSONObject item = new JSONObject();
            item.put("id", String.valueOf(id));
            item.put("uri", uri.toString());
            item.put("title", title);
            item.put("artist", artist);
            item.put("album", album);
            item.put("albumId", albumId);
            item.put("duration", duration);
            item.put("size", size);
            item.put("fileName", fileName);
            item.put("mime", mime);
            item.put("track", track);
            item.put("year", year > 0 ? year : JSONObject.NULL);
            item.put("addedAt", addedAt > 0 ? addedAt : System.currentTimeMillis());
            return item;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Carátula del álbum como data URL JPEG (256 px), o cadena vacía.
     * Primero la del álbum; si el móvil no la tiene, la incrustada en el
     * propio archivo.
     */
    @JavascriptInterface
    public String albumArt(long albumId, long trackId) {
        try {
            if (albumId > 0) {
                Uri art = ContentUris.withAppendedId(
                        Uri.parse("content://media/external/audio/albumart"), albumId);
                Bitmap bitmap = open(art);
                if (bitmap != null) return toDataUrl(bitmap);
            }
            if (trackId > 0) {
                Uri trackUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, trackId);
                Bitmap embedded = embeddedPicture(trackUri);
                if (embedded != null) return toDataUrl(embedded);
            }
        } catch (Exception e) {
            Log.w(TAG, "albumArt: " + e);
        }
        return "";
    }

    private Bitmap open(Uri uri) {
        ContentResolver resolver = context().getContentResolver();
        InputStream in = null;
        try {
            in = resolver.openInputStream(uri);
            if (in == null) return null;
            return BitmapFactory.decodeStream(in);
        } catch (Exception e) {
            return null;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private Bitmap embeddedPicture(Uri trackUri) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(context(), trackUri);
            byte[] picture = retriever.getEmbeddedPicture();
            if (picture == null || picture.length == 0) return null;
            return BitmapFactory.decodeByteArray(picture, 0, picture.length);
        } catch (Exception e) {
            return null;
        } finally {
            try {
                retriever.release();
            } catch (Exception ignored) {
            }
        }
    }

    private static String toDataUrl(Bitmap bitmap) {
        if (bitmap == null) return "";
        try {
            // 256 px de lado mayor: de sobra para una fila o una miniatura,
            // y la notificación no necesita más.
            int side = Math.max(bitmap.getWidth(), bitmap.getHeight());
            Bitmap scaled = bitmap;
            if (side > 256) {
                float scale = 256f / side;
                scaled = Bitmap.createScaledBitmap(bitmap,
                        Math.max(1, Math.round(bitmap.getWidth() * scale)),
                        Math.max(1, Math.round(bitmap.getHeight() * scale)), true);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, 82, out);
            if (scaled != bitmap) scaled.recycle();
            bitmap.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    private static String blankIfNull(String value) {
        if (value == null || "<unknown>".equals(value)) return "";
        return value;
    }
}
