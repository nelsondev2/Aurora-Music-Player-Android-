package com.nelsondev2.aurora;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Persistencia nativa de biblioteca, listas y preferencias de Aurora. */
final class NativeLibraryDatabase extends SQLiteOpenHelper {

    private static final String TAG = "AuroraLibraryDb";
    private static final String DB_NAME = "aurora-native.db";
    private static final int DB_VERSION = 1;

    NativeLibraryDatabase(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE tracks (id TEXT PRIMARY KEY NOT NULL, title TEXT, artist TEXT, "
                + "album TEXT, duration INTEGER NOT NULL DEFAULT 0, uri TEXT, metadata TEXT NOT NULL)");
        db.execSQL("CREATE INDEX tracks_title ON tracks(title COLLATE NOCASE)");
        db.execSQL("CREATE INDEX tracks_artist ON tracks(artist COLLATE NOCASE)");
        db.execSQL("CREATE TABLE playlists (id TEXT PRIMARY KEY NOT NULL, name TEXT, metadata TEXT NOT NULL)");
        db.execSQL("CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Las migraciones de esquema se añaden por versión sin borrar datos.
    }

    synchronized void saveTrack(JSONObject track) {
        if (track == null) return;
        String id = track.optString("id", "");
        if (id.length() == 0) return;
        ContentValues values = new ContentValues();
        values.put("id", id);
        values.put("title", track.optString("title", ""));
        values.put("artist", track.optString("artist", ""));
        values.put("album", track.optString("album", ""));
        values.put("duration", Math.max(0, track.optLong("duration", 0)));
        values.put("uri", track.optString("deviceUri", track.optString("uri", "")));
        values.put("metadata", track.toString());
        getWritableDatabase().insertWithOnConflict("tracks", null, values,
                SQLiteDatabase.CONFLICT_REPLACE);
    }

    synchronized List<JSONObject> tracks() {
        ArrayList<JSONObject> result = new ArrayList<JSONObject>();
        Cursor cursor = null;
        try {
            cursor = getReadableDatabase().query("tracks", new String[]{"metadata"}, null,
                    null, null, null, "title COLLATE NOCASE ASC");
            while (cursor.moveToNext()) {
                try { result.add(new JSONObject(cursor.getString(0))); }
                catch (Exception e) { Log.w(TAG, "ficha ilegible", e); }
            }
        } catch (Exception e) {
            Log.e(TAG, "no se pudo leer la biblioteca", e);
        } finally {
            if (cursor != null) cursor.close();
        }
        return result;
    }

    synchronized void savePlaylist(JSONObject playlist) {
        if (playlist == null) return;
        String id = playlist.optString("id", "");
        if (id.length() == 0) return;
        ContentValues values = new ContentValues();
        values.put("id", id);
        values.put("name", playlist.optString("name", ""));
        values.put("metadata", playlist.toString());
        getWritableDatabase().insertWithOnConflict("playlists", null, values,
                SQLiteDatabase.CONFLICT_REPLACE);
    }

    synchronized List<JSONObject> playlists() {
        ArrayList<JSONObject> result = new ArrayList<JSONObject>();
        Cursor cursor = null;
        try {
            cursor = getReadableDatabase().query("playlists", new String[]{"metadata"}, null,
                    null, null, null, "name COLLATE NOCASE ASC");
            while (cursor.moveToNext()) {
                try { result.add(new JSONObject(cursor.getString(0))); }
                catch (Exception e) { Log.w(TAG, "lista ilegible", e); }
            }
        } catch (Exception e) {
            Log.e(TAG, "no se pudieron leer las listas", e);
        } finally {
            if (cursor != null) cursor.close();
        }
        return result;
    }

    synchronized void saveSetting(String key, Object value) {
        if (key == null || key.length() == 0) return;
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value == null ? "null" : String.valueOf(value));
        getWritableDatabase().insertWithOnConflict("settings", null, values,
                SQLiteDatabase.CONFLICT_REPLACE);
    }

    synchronized String setting(String key, String fallback) {
        Cursor cursor = null;
        try {
            cursor = getReadableDatabase().query("settings", new String[]{"value"}, "key=?",
                    new String[]{key}, null, null, null);
            return cursor.moveToFirst() ? cursor.getString(0) : fallback;
        } catch (Exception e) {
            return fallback;
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    synchronized void importBackup(JSONObject manifest) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            JSONArray tracks = manifest.optJSONArray("tracks");
            if (tracks != null) {
                for (int i = 0; i < tracks.length(); i++) {
                    JSONObject track = tracks.optJSONObject(i);
                    if (track != null) saveTrackIn(db, track);
                }
            }
            JSONArray playlists = manifest.optJSONArray("playlists");
            if (playlists != null) {
                for (int i = 0; i < playlists.length(); i++) {
                    JSONObject playlist = playlists.optJSONObject(i);
                    if (playlist != null) savePlaylistIn(db, playlist);
                }
            }
            JSONObject settings = manifest.optJSONObject("settings");
            if (settings != null) {
                java.util.Iterator<String> keys = settings.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    saveSettingIn(db, key, settings.opt(key));
                }
            }
            JSONObject local = manifest.optJSONObject("localStorage");
            if (local != null) {
                java.util.Iterator<String> keys = local.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    saveSettingIn(db, "local:" + key, local.opt(key));
                }
            }
            db.setTransactionSuccessful();
        } catch (Exception e) {
            Log.e(TAG, "falló la importación de datos", e);
            throw new IllegalStateException("No se pudieron importar los datos", e);
        } finally {
            db.endTransaction();
        }
    }

    private void saveTrackIn(SQLiteDatabase db, JSONObject track) {
        String id = track.optString("id", "");
        if (id.length() == 0) return;
        String sourceUri = track.optString("deviceUri", track.optString("uri", ""));
        if (sourceUri.startsWith("content://")) {
            ArrayList<String> duplicateIds = new ArrayList<String>();
            Cursor duplicates = null;
            try {
                duplicates = db.query("tracks", new String[]{"id"}, "uri=? AND id<>?",
                        new String[]{sourceUri, id}, null, null, null);
                while (duplicates.moveToNext()) duplicateIds.add(duplicates.getString(0));
            } finally {
                if (duplicates != null) duplicates.close();
            }
            for (String duplicateId : duplicateIds) {
                db.delete("tracks", "id=?", new String[]{duplicateId});
            }
        }
        ContentValues values = new ContentValues();
        values.put("id", id);
        values.put("title", track.optString("title", ""));
        values.put("artist", track.optString("artist", ""));
        values.put("album", track.optString("album", ""));
        values.put("duration", Math.max(0, track.optLong("duration", 0)));
        values.put("uri", track.optString("deviceUri", track.optString("uri", "")));
        values.put("metadata", track.toString());
        db.insertWithOnConflict("tracks", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private void savePlaylistIn(SQLiteDatabase db, JSONObject playlist) {
        String id = playlist.optString("id", "");
        if (id.length() == 0) return;
        ContentValues values = new ContentValues();
        values.put("id", id);
        values.put("name", playlist.optString("name", ""));
        values.put("metadata", playlist.toString());
        db.insertWithOnConflict("playlists", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private void saveSettingIn(SQLiteDatabase db, String key, Object value) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value == null ? "null" : String.valueOf(value));
        db.insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }
}
