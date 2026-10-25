package com.nelsondev2.aurora;

import android.app.Activity;
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

    private final Activity activity;

    NativePlayerBridge(Activity activity) {
        this.activity = activity;
    }

    /** Instancia perezosa: el MediaPlayer no se crea hasta que hace falta. */
    static synchronized NativePlayer get(Activity activity) {
        if (player == null) player = new NativePlayer(activity);
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

    static synchronized boolean isPlaying() {
        return player != null && player.isPlaying();
    }

    static synchronized void pauseIfPlaying() {
        if (player != null) player.pause();
    }

    private NativePlayer player() {
        return get(activity);
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

    // --------------------------------------------------------- reproducción

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
