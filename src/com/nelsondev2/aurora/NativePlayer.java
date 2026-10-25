package com.nelsondev2.aurora;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONObject;

/**
 * Reproductor nativo: MediaPlayer con relevo preparado (gapless real).
 *
 * Por qué existe: hasta ahora el audio lo ponía el WebView. Si Android
 * reclamaba el proceso o el WebView se destruía, la música se cortaba.
 * Aquí el audio sale del sistema, así que sobrevive a que la página
 * desaparezca; y como la siguiente pista se prepara por adelantado con
 * setNextMediaPlayer(), el paso de una a otra no tiene hueco.
 *
 * La web ve este motor como si fuera su <audio> (js/native-audio.js):
 * los eventos que emite imitan a los del elemento (loaded, time,
 * playing, ended, error, trackchanged).
 */
final class NativePlayer {

    private static final String TAG = "AuroraNativePlayer";
    /** Cada cuánto se avisa de la posición (ms). */
    private static final long TICK_MS = 250;

    private final Context appContext;
    private final NativeAudioStore store;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private MediaPlayer current;
    private MediaPlayer prepared;
    private String currentId;
    private String preparedId;
    /** Id que se asignará al preparar la siguiente (para el relevo por URI). */
    private String pendingPreparedId;
    private boolean wantPlay;
    private boolean released;
    private float volume = 1f;

    /** Quien quiera reaccionar al final de una pista sin relevo preparado. */
    interface OnEndedListener {
        void onEnded(String trackId);
    }

    private OnEndedListener endedListener;
    private OnEndedListener changedListener;

    /** El relevo ya sonó: la cola nativa mueve su cursor. */
    void setOnTrackChangedListener(OnEndedListener listener) {
        this.changedListener = listener;
    }

    /** Id que llevará la pista preparada en el relevo (la web lo sabe). */
    void setPendingPreparedId(String trackId) {
        this.pendingPreparedId = trackId;
    }

    void setOnEndedListener(OnEndedListener listener) {
        this.endedListener = listener;
    }

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (released) return;
            if (isPlaying()) {
                emitTime();
                handler.postDelayed(this, TICK_MS);
            }
        }
    };

    NativePlayer(Context context) {
        this.appContext = context.getApplicationContext();
        this.store = new NativeAudioStore(context);
    }

    // ------------------------------------------------------------- comandos

    /** Empieza a recibir el audio de una pista (puente, por trozos). */
    boolean beginUpload(String trackId, String ext) {
        return store.begin(trackId, ext);
    }

    boolean appendUpload(String base64) {
        return store.append(base64);
    }

    boolean finishUpload(String trackId, String ext) {
        return store.finish(trackId, ext);
    }

    boolean hasTrack(String trackId) {
        return store.has(trackId);
    }

    /** Olvida una pista: fuera de la caché y de los reproductores. */
    void forget(String trackId) {
        if (trackId == null) return;
        if (trackId.equals(currentId)) stop();
        if (trackId.equals(preparedId)) releasePrepared();
        store.remove(trackId);
    }

    /** Carga y reproduce una pista cacheada. */
    boolean play(String trackId, long startMs) {
        if (released) return false;
        String path = store.pathFor(trackId);
        if (path == null) return false;
        return start(path, null, startMs, trackId);
    }

    /**
     * Reproduce un content:// de MediaStore: el archivo original del móvil,
     * sin copiarlo. `trackId` es el id de la app (solo para los eventos).
     */
    boolean playUri(String trackId, String uri, long startMs) {
        if (released || uri == null || uri.length() == 0) return false;
        return start(null, uri, startMs, trackId);
    }

    /** Prepara la siguiente por content:// (relevo gapless sin caché). */
    boolean prepareNextUri(String uri) {
        return prepare(null, uri);
    }

    private boolean start(String path, String uri, long startMs, String trackId) {
        wantPlay = true;
        releasePrepared();
        releaseCurrent();

        MediaPlayer player = newPlayer();
        if (player == null) return false;
        try {
            if (uri != null) player.setDataSource(appContext, Uri.parse(uri));
            else player.setDataSource(path);
        } catch (Exception e) {
            Log.w(TAG, "setDataSource: " + e);
            player.release();
            return false;
        }
        current = player;
        currentId = trackId;
        final long start = Math.max(0, startMs);
        player.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
            @Override
            public void onPrepared(MediaPlayer mp) {
                if (mp != current) return;
                if (start > 0) {
                    try { mp.seekTo((int) start); } catch (Exception ignored) {}
                }
                JSONObject event = new JSONObject();
                put(event, "event", "loaded");
                put(event, "duration", mp.getDuration());
                emit(event);
                if (wantPlay) startPlayer(mp);
            }
        });
        try {
            player.prepareAsync();
            return true;
        } catch (Exception e) {
            Log.w(TAG, "prepareAsync: " + e);
            releaseCurrent();
            return false;
        }
    }

    /**
     * Deja preparada la pista siguiente para que MediaPlayer haga el relevo
     * sin silencio entre medias. Si no está en la caché, se ignora: la web
     * la sube y vuelve a llamar.
     */
    boolean prepareNext(String trackId) {
        if (released || current == null || trackId == null) return false;
        if (trackId.equals(currentId)) return false;
        String path = store.pathFor(trackId);
        if (path == null) return false;
        return prepare(path, null);
    }

    private boolean prepare(String path, String uri) {
        if (released || current == null) return false;
        releasePrepared();
        MediaPlayer next = newPlayer();
        if (next == null) return false;
        try {
            if (uri != null) next.setDataSource(appContext, Uri.parse(uri));
            else next.setDataSource(path);
        } catch (Exception e) {
            next.release();
            return false;
        }
        prepared = next;
        preparedId = pendingPreparedId;
        pendingPreparedId = null;
        next.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
            @Override
            public void onPrepared(MediaPlayer mp) {
                if (mp != prepared || current == null) return;
                try {
                    current.setNextMediaPlayer(mp);
                } catch (Exception e) {
                    Log.w(TAG, "setNextMediaPlayer: " + e);
                }
            }
        });
        try {
            next.prepareAsync();
            return true;
        } catch (Exception e) {
            releasePrepared();
            return false;
        }
    }

    void clearNext() {
        releasePrepared();
        if (current != null) {
            try {
                current.setNextMediaPlayer(null);
            } catch (Exception ignored) {
            }
        }
    }

    void resume() {
        if (released) return;
        wantPlay = true;
        if (current != null && !isPlaying()) startPlayer(current);
    }

    void pause() {
        wantPlay = false;
        if (current == null) return;
        try {
            if (current.isPlaying()) current.pause();
            JSONObject event = new JSONObject();
            put(event, "event", "paused");
            put(event, "position", current.getCurrentPosition());
            emit(event);
        } catch (Exception e) {
            Log.w(TAG, "pause: " + e);
        }
        handler.removeCallbacks(ticker);
    }

    void seekTo(long ms) {
        if (current == null) return;
        try {
            current.seekTo((int) Math.max(0, ms));
        } catch (Exception e) {
            Log.w(TAG, "seekTo: " + e);
        }
    }

    void setVolume(float v) {
        volume = Math.max(0f, Math.min(1f, v));
        applyVolume();
    }

    /** Velocidad de reproducción; el tono se conserva si el sistema puede. */
    void setRate(float rate) {
        if (current == null) return;
        try {
            current.setPlaybackParams(current.getPlaybackParams().setSpeed(rate));
        } catch (Exception e) {
            Log.w(TAG, "setRate: " + e);
        }
    }

    void stop() {
        wantPlay = false;
        handler.removeCallbacks(ticker);
        clearNext();
        releaseCurrent();
    }

    void release() {
        released = true;
        stop();
        handler.removeCallbacksAndMessages(null);
    }

    boolean isPlaying() {
        try {
            return current != null && current.isPlaying();
        } catch (Exception e) {
            return false;
        }
    }

    long position() {
        try {
            return current == null ? 0 : current.getCurrentPosition();
        } catch (Exception e) {
            return 0;
        }
    }

    long duration() {
        try {
            return current == null ? 0 : current.getDuration();
        } catch (Exception e) {
            return 0;
        }
    }

    // -------------------------------------------------------------- interno

    private MediaPlayer newPlayer() {
        try {
            MediaPlayer player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            // La pantalla puede apagarse: el servicio ya sostiene un wake
            // lock parcial, y esto evita que el propio MediaPlayer duerma.
            player.setWakeMode(appContext, PowerManager.PARTIAL_WAKE_LOCK);
            player.setVolume(volume, volume);
            player.setOnCompletionListener(completionListener);
            player.setOnErrorListener(errorListener);
            return player;
        } catch (Exception e) {
            Log.w(TAG, "newPlayer: " + e);
            return null;
        }
    }

    private void startPlayer(MediaPlayer player) {
        try {
            player.start();
            applyVolume();
            JSONObject event = new JSONObject();
            put(event, "event", "playing");
            emit(event);
            handler.removeCallbacks(ticker);
            handler.postDelayed(ticker, TICK_MS);
        } catch (Exception e) {
            Log.w(TAG, "start: " + e);
        }
    }

    private void applyVolume() {
        if (current != null) {
            try {
                current.setVolume(volume, volume);
            } catch (Exception ignored) {
            }
        }
    }

    private final MediaPlayer.OnCompletionListener completionListener =
            new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    if (mp != current) return;
                    // ¿El relevo ya estaba preparado? Entonces MediaPlayer
                    // sigue sonando con la siguiente: solo hay que cambiar
                    // de dueño y avisar a la web de qué pista suena ahora.
                    if (prepared != null) {
                        MediaPlayer incoming = prepared;
                        String incomingId = preparedId;
                        prepared = null;
                        preparedId = null;
                        try {
                            mp.release();
                        } catch (Exception ignored) {
                        }
                        current = incoming;
                        currentId = incomingId;
                        incoming.setOnCompletionListener(completionListener);
                        incoming.setOnErrorListener(errorListener);
                        JSONObject event = new JSONObject();
                        put(event, "event", "trackchanged");
                        put(event, "trackId", incomingId == null ? "" : incomingId);
                        put(event, "duration", duration());
                        emit(event);
                        if (wantPlay) startPlayer(incoming);
                        if (changedListener != null) {
                            try {
                                changedListener.onTrackChanged(incomingId);
                            } catch (Exception e) {
                                Log.w(TAG, "onTrackChanged: " + e);
                            }
                        }
                        return;
                    }
                    handler.removeCallbacks(ticker);
                    JSONObject event = new JSONObject();
                    put(event, "event", "ended");
                    emit(event);
                    if (endedListener != null) {
                        try {
                            endedListener.onEnded(currentId);
                        } catch (Exception e) {
                            Log.w(TAG, "onEnded: " + e);
                        }
                    }
                }
            };

    private final MediaPlayer.OnErrorListener errorListener =
            new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer mp, int what, int extra) {
                    handler.removeCallbacks(ticker);
                    JSONObject event = new JSONObject();
                    put(event, "event", "error");
                    put(event, "message", "MediaPlayer " + what + "/" + extra);
                    emit(event);
                    // true = el error queda atendido y no dispara
                    // onCompletion (evita saltar dos pistas por un fallo).
                    return true;
                }
            };

    private void releaseCurrent() {
        if (current == null) return;
        try {
            current.release();
        } catch (Exception ignored) {
        }
        current = null;
        currentId = null;
    }

    private void releasePrepared() {
        if (prepared == null) return;
        try {
            prepared.release();
        } catch (Exception ignored) {
        }
        prepared = null;
        preparedId = null;
    }

    private void emitTime() {
        JSONObject event = new JSONObject();
        put(event, "event", "time");
        put(event, "position", position());
        put(event, "duration", duration());
        emit(event);
    }

    private void emit(JSONObject event) {
        WebApp.emitNativeEvent(event);
    }

    private static void put(JSONObject json, String key, Object value) {
        try {
            json.put(key, value);
        } catch (Exception ignored) {
        }
    }
}
