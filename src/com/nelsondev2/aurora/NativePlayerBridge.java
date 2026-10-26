package com.nelsondev2.aurora;

import android.content.Context;
import android.util.Log;
import android.webkit.JavascriptInterface;

/**
 * Puente JS ↔ Android del reproductor nativo (window.AuroraNativePlayer).
 *
 * La web ve este motor como si fuera su propio <audio>: le manda la pista
 * por trozos (begin/chunk/finish) y comandos equivalentes (play, pause,
 * seek, volume). El estado vuelve por window.AuroraNativePlayerEvent(),
 * que coloca WebApp con un JSON por evento.
 *
 * Si algo falla, los métodos devuelven false y la web se queda con el
 * reproductor del WebView: el motor nativo es una mejora, no un requisito.
 */
class NativePlayerBridge {

    private static final String TAG = "AuroraNativeBridge";

    private static NativePlayer player;
    /** Cola mínima para cuando no hay página (la web la mantiene al día). */
    private static final PlayQueue queue = new PlayQueue();

    private final Context context;

    NativePlayerBridge(Context context) {
        this.context = context;
    }

    /** Instancia perezosa y única: el MediaPlayer no se crea hasta que hace falta. */
    static synchronized NativePlayer get(Context context) {
        if (player == null) player = new NativePlayer(context);
        return player;
    }

    static synchronized void releaseAll() {
        if (player != null) {
            try {
                player.release();
            } catch (Exception e) {
                Log.w(TAG, "release: " + e);
            }
            player = null;
        }
    }

    static PlayQueue queue() {
        return queue;
    }

    static int audioSessionId(Context context) {
        return get(context).audioSessionId();
    }

    /** Para el lado Java (MainActivity, servicio): ¿suena algo ahora? */
    static synchronized boolean isCurrentlyPlaying() {
        return player != null && player.isPlaying();
    }

    static synchronized void pauseIfPlaying() {
        if (player != null) player.pause();
    }

    /** Reanudar desde la notificación con la página cerrada. */
    static synchronized void resumePlayback() {
        if (player != null) player.resume();
    }

    private NativePlayer player() {
        return get(context);
    }

    // -------------------------------------------------- subida de la pista

    @JavascriptInterface
    public boolean audioBegin(String trackId, String ext) {
        try {
            return player().beginUpload(trackId, ext);
        } catch (Exception e) {
            Log.w(TAG, "audioBegin: " + e);
            return false;
        }
    }

    @JavascriptInterface
    public boolean audioChunk(String base64) {
        try {
            return player().appendUpload(base64);
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean audioFinish(String trackId, String ext) {
        try {
            return player().finishUpload(trackId, ext);
        } catch (Exception e) {
            Log.w(TAG, "audioFinish: " + e);
            return false;
        }
    }

    /**
     * Vacía la caché de audio del motor nativo. La web lo llama una sola
     * vez al estrenar el motor nuevo: las versiones anteriores podían
     * dejar archivos a medias que «existían» pero no sonaban.
     */
    @JavascriptInterface
    public int audioClear() {
        try {
            return player().clearCache();
        } catch (Exception e) {
            Log.w(TAG, "audioClear: " + e);
            return 0;
        }
    }

    @JavascriptInterface
    public boolean audioHas(String trackId) {
        try {
            return player().hasTrack(trackId);
        } catch (Exception e) {
            return false;
        }
    }

    /** Borrar una pista de la caché nativa (la biblioteca la borró). */
    @JavascriptInterface
    public boolean audioRemove(String trackId) {
        try {
            if (player != null) player.forget(trackId);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Ventana de la cola: la pista actual y las siguientes, con los datos
     * que la notificación necesita. La web la empuja cada vez que cambia.
     */
    @JavascriptInterface
    public boolean queueSet(String json, int currentIndex) {
        try {
            queue.set(json, currentIndex);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "queueSet: " + e);
            return false;
        }
    }

    // --------------------------------------------------------- reproducción

    /** Reproduce un content:// de MediaStore (pista sin copiar). */
    @JavascriptInterface
    public boolean playUri(String trackId, String uri, double startMs) {
        try {
            return player().playUri(trackId, uri, Math.round(startMs));
        } catch (Exception e) {
            Log.w(TAG, "playUri: " + e);
            return false;
        }
    }

    /** Deja preparada la siguiente por content://. */
    @JavascriptInterface
    public boolean prepareNextUri(String trackId, String uri) {
        try {
            NativePlayer player = player();
            player.setPendingPreparedId(trackId);
            return player.prepareNextUri(uri);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Carga una pista sin reproducirla (restaurar sesión, dejar lista la
     * siguiente). Sin esto la web solo podía pedir «play» y el altavoz
     * arrancaba aunque la interfaz dijera pausa.
     */
    @JavascriptInterface
    public boolean load(String trackId, double startMs) {
        try {
            return player().load(trackId, Math.round(startMs));
        } catch (Exception e) {
            Log.w(TAG, "load: " + e);
            return false;
        }
    }

    /** content:// del móvil cargado sin sonar. */
    @JavascriptInterface
    public boolean loadUri(String trackId, String uri, double startMs) {
        try {
            return player().loadUri(trackId, uri, Math.round(startMs));
        } catch (Exception e) {
            Log.w(TAG, "loadUri: " + e);
            return false;
        }
    }

    /** Estado real del reproductor (JSON) para reconciliar la interfaz. */
    @JavascriptInterface
    public String snapshot() {
        try {
            return player().snapshot();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public boolean play(String trackId, double startMs) {
        try {
            return player().play(trackId, Math.round(startMs));
        } catch (Exception e) {
            Log.w(TAG, "play: " + e);
            return false;
        }
    }

    @JavascriptInterface
    public boolean prepareNext(String trackId) {
        try {
            return player().prepareNext(trackId);
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void clearNext() {
        try {
            player().clearNext();
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void pause() {
        try {
            player().pause();
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void resume() {
        try {
            player().resume();
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void seekTo(double ms) {
        try {
            player().seekTo(Math.round(ms));
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setVolume(double v) {
        try {
            player().setVolume((float) v);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setRate(double rate) {
        try {
            player().setRate((float) rate);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void stop() {
        try {
            player().stop();
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public double position() {
        try {
            return player().position();
        } catch (Exception e) {
            return 0;
        }
    }

    @JavascriptInterface
    public double duration() {
        try {
            return player().duration();
        } catch (Exception e) {
            return 0;
        }
    }

    @JavascriptInterface
    public boolean isPlaying() {
        try {
            return player().isPlaying();
        } catch (Exception e) {
            return false;
        }
    }
}
