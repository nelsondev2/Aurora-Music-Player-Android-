package com.nelsondev2.aurora;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Copia mínima de la cola, del lado nativo.
 *
 * La cola de verdad vive en la web (aleatorio, repetir, «reproducir
 * desde…», listas que se reordenan solas). Java no necesita entenderla:
 * solo saber qué viene después cuando la página ya no está para decirlo.
 *
 * La web empuja una ventana (la actual y las siguientes) con sus datos
 * de carátula —título, artista, álbum, duración— y aquí se guarda con el
 * índice actual. Así «siguiente», «anterior» y el avance al terminar una
 * canción siguen funcionando con la app cerrada, y la notificación sigue
 * diciendo qué suena.
 */
final class PlayQueue {

    private static final String TAG = "AuroraPlayQueue";

    static final class Entry {
        String id = "";
        String title = "";
        String artist = "";
        String album = "";
        long durationMs;
    }

    private final List<Entry> entries = new ArrayList<Entry>();
    private int index = -1;
    private String repeat = "off";

    /** ¿Hay cola con algo que poner? */
    boolean isEmpty() {
        return entries.isEmpty();
    }

    Entry current() {
        if (index < 0 || index >= entries.size()) return null;
        return entries.get(index);
    }

    /** Pista que toca después, o null si no queda nada. */
    Entry next() {
        if (entries.isEmpty()) return null;
        int candidate = index + 1;
        if (candidate >= entries.size()) {
            if (!"all".equals(repeat)) return null;
            candidate = 0;
        }
        if (candidate == index) return null;
        return entries.get(candidate);
    }

    /** Pista anterior; solo da la vuelta a la cola si se repite todo. */
    Entry previous() {
        if (entries.isEmpty()) return null;
        int candidate = index - 1;
        if (candidate < 0) {
            if (!"all".equals(repeat)) return null;
            candidate = entries.size() - 1;
        }
        if (candidate == index || candidate < 0) return null;
        return entries.get(candidate);
    }

    /** Mueve el cursor a una pista concreta (p. ej. tras un relevo). */
    boolean moveTo(String trackId) {
        for (int i = 0; i < entries.size(); i++) {
            if (entries.get(i).id.equals(trackId)) {
                index = i;
                return true;
            }
        }
        return false;
    }

    /** Reemplaza la ventana completa. */
    void set(String json, int currentIndex) {
        entries.clear();
        index = currentIndex;
        if (json == null || json.length() == 0) return;
        try {
            JSONObject root = new JSONObject(json);
            String mode = root.optString("repeat", "off");
            if (mode.length() > 0) repeat = mode;
            JSONArray tracks = root.optJSONArray("tracks");
            if (tracks == null) return;
            for (int i = 0; i < tracks.length(); i++) {
                JSONObject raw = tracks.optJSONObject(i);
                if (raw == null) continue;
                Entry entry = new Entry();
                entry.id = raw.optString("id", "");
                entry.title = raw.optString("title", "");
                entry.artist = raw.optString("artist", "");
                entry.album = raw.optString("album", "");
                entry.durationMs = raw.optLong("duration", 0);
                if (entry.id.length() > 0) entries.add(entry);
            }
        } catch (Exception e) {
            Log.w(TAG, "cola ilegible: " + e);
            entries.clear();
        }
    }

    int size() {
        return entries.size();
    }
}
