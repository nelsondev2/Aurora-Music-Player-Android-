package com.nelsondev2.aurora;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Servicio nativo de reproducción en segundo plano con MediaSession,
 * notificación, foco de audio y wake lock. La cola Java sigue activa aunque
 * NativeHomeActivity deje de estar visible.
 */
public class PlaybackService extends Service {

    private static final String TAG = "AuroraPlayback";
    private static final String CHANNEL_ID = "aurora_playback";
    private static final int NOTIFICATION_ID = 41;

    private static final String ACTION_TOGGLE = "com.nelsondev2.aurora.TOGGLE";
    private static final String ACTION_PLAY = "com.nelsondev2.aurora.PLAY";
    private static final String ACTION_PAUSE = "com.nelsondev2.aurora.PAUSE";
    private static final String ACTION_NEXT = "com.nelsondev2.aurora.NEXT";
    private static final String ACTION_PREV = "com.nelsondev2.aurora.PREV";

    /** PendingIntent.FLAG_IMMUTABLE (API 23) sin exigir ese SDK al compilar. */
    private static final int FLAG_IMMUTABLE = 0x04000000;

    /** Estado vigente. Es estático porque la actividad puede avisar antes
     *  de que el servicio termine de crearse (startForegroundService es async). */
    private static String sTitle = "";
    private static String sArtist = "";
    private static String sAlbum = "";
    private static boolean sPlaying;
    private static long sDurationMs;
    private static long sPositionMs;
    private static String sTrackId = "";
    private static Bitmap sArtwork;
    private static long sSleepDeadlineMs;
    private static boolean sSleepAtTrackEnd;

    private static PlaybackService live;

    /** Carátulas vistas, por pista: al avanzar sin página hay que tener algo
     *  que enseñar en la notificación. Ocho es de sobra y no pesa. */
    private static final Map<String, Bitmap> artworkCache =
            new LinkedHashMap<String, Bitmap>(8, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Bitmap> eldest) {
                    return size() > 8;
                }
            };

    private MediaSession session;
    private AudioManager audioManager;
    private PowerManager.WakeLock wakeLock;
    private BroadcastReceiver noisyReceiver;
    private boolean focused;
    private boolean progressScheduled;
    private long lastProgressPosition = -1;
    private long pendingListenedMs;
    private long lastSessionSavedAt;
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private final Runnable sleepDeadline = new Runnable() {
        @Override public void run() { beginSleepFade(); }
    };
    private final Runnable sleepFadeStep = new Runnable() {
        int step;
        float initialVolume;
        @Override public void run() {
            NativePlayer player = NativePlayerBridge.get(PlaybackService.this);
            if (step == 0) initialVolume = player.volume();
            step++;
            player.setVolume(initialVolume * Math.max(0f, 1f - step / 20f));
            if (step < 20) progressHandler.postDelayed(this, 500);
            else {
                player.pause();
                player.setVolume(initialVolume);
                sPlaying = false;
                sSleepDeadlineMs = 0;
                sSleepAtTrackEnd = false;
                applyState();
            }
        }
    };
    private final Runnable progressTicker = new Runnable() {
        @Override public void run() {
            if (live != PlaybackService.this || !sPlaying) {
                progressScheduled = false;
                return;
            }
            NativePlayer player = NativePlayerBridge.get(PlaybackService.this);
            sPositionMs = player.position();
            sDurationMs = player.duration();
            recordListeningProgress(sPositionMs);
            updatePlaybackState();
            long now = System.currentTimeMillis();
            if (now - lastSessionSavedAt >= 5000) {
                persistNativeSession();
                lastSessionSavedAt = now;
            }
            progressHandler.postDelayed(this, 1000);
        }
    };

    // ------------------------------------------------------------ estático
    // API nativa: no necesita que el servicio ya esté levantado.

    static void ensureRunning(Context context) {
        Intent intent = new Intent(context, PlaybackService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (Exception e) {
            Log.w(TAG, "no se pudo arrancar el servicio: " + e);
        }
    }

    static void update(String title, String artist, String album,
                       boolean playing, long durationMs, long positionMs) {
        sTitle = title == null ? "" : title;
        sArtist = artist == null ? "" : artist;
        sAlbum = album == null ? "" : album;
        sPlaying = playing;
        sDurationMs = Math.max(0, durationMs);
        sPositionMs = Math.max(0, positionMs);
        PlaybackService service = live;
        if (service != null) service.applyState();
    }

    static void trackStarted(String trackId) {
        sTrackId = trackId == null ? "" : trackId;
        sPositionMs = 0;
        PlaybackService service = live;
        if (service != null) service.lastProgressPosition = -1;
    }

    static boolean startSleepTimer(int minutes) {
        PlaybackService service = live;
        if (service == null || minutes <= 0) return false;
        sSleepAtTrackEnd = false;
        sSleepDeadlineMs = System.currentTimeMillis() + Math.min(24 * 60, minutes) * 60_000L;
        service.progressHandler.removeCallbacks(service.sleepDeadline);
        service.progressHandler.removeCallbacks(service.sleepFadeStep);
        service.sleepFadeStep.step = 0;
        service.progressHandler.postDelayed(service.sleepDeadline,
                Math.max(0, sSleepDeadlineMs - System.currentTimeMillis()));
        return true;
    }

    static boolean sleepAtTrackEnd() {
        if (live == null) return false;
        live.progressHandler.removeCallbacks(live.sleepDeadline);
        live.progressHandler.removeCallbacks(live.sleepFadeStep);
        live.sleepFadeStep.step = 0;
        sSleepDeadlineMs = 0;
        sSleepAtTrackEnd = true;
        NativePlayerBridge.get(live).clearNext();
        return true;
    }

    static void cancelSleepTimer() {
        sSleepDeadlineMs = 0;
        sSleepAtTrackEnd = false;
        PlaybackService service = live;
        if (service == null) return;
        service.progressHandler.removeCallbacks(service.sleepDeadline);
        service.progressHandler.removeCallbacks(service.sleepFadeStep);
        if (service.sleepFadeStep.step > 0) {
            NativePlayerBridge.get(service).setVolume(service.sleepFadeStep.initialVolume);
        }
        service.sleepFadeStep.step = 0;
    }

    private void beginSleepFade() {
        if (!sPlaying) {
            sSleepDeadlineMs = 0;
            sSleepAtTrackEnd = false;
            return;
        }
        sleepFadeStep.step = 0;
        progressHandler.removeCallbacks(sleepFadeStep);
        progressHandler.post(sleepFadeStep);
    }

    private void recordListeningProgress(long position) {
        if (lastProgressPosition >= 0) {
            long delta = position - lastProgressPosition;
            if (delta > 0 && delta <= 2500) pendingListenedMs += delta;
            if (pendingListenedMs >= 10_000) persistListeningTime();
        }
        lastProgressPosition = position;
    }

    private void persistListeningTime() {
        long seconds = pendingListenedMs / 1000;
        pendingListenedMs %= 1000;
        if (seconds <= 0) return;
        NativeLibraryDatabase db = new NativeLibraryDatabase(this);
        try {
            JSONObject stats = readStats(db);
            stats.put("totalSeconds", Math.max(0, stats.optLong("totalSeconds", 0)) + seconds);
            db.saveSetting("stats", stats);
        } catch (Exception e) { Log.w(TAG, "no se pudo guardar el tiempo escuchado", e); }
        finally { db.close(); }
    }

    private void recordCompletedTrack(String trackId) {
        if (trackId == null || trackId.length() == 0) return;
        NativeLibraryDatabase db = new NativeLibraryDatabase(this);
        try {
            JSONObject stats = readStats(db);
            JSONObject plays = stats.optJSONObject("plays");
            if (plays == null) plays = new JSONObject();
            plays.put(trackId, plays.optInt(trackId, 0) + 1);
            stats.put("plays", plays);
            db.saveSetting("stats", stats);
        } catch (Exception e) { Log.w(TAG, "no se pudo guardar la reproducción", e); }
        finally { db.close(); }
        persistListeningTime();
    }

    private void persistNativeSession() {
        if (sTrackId == null || sTrackId.length() == 0) return;
        PlayQueue queue = NativePlayerBridge.queue();
        JSONObject session = new JSONObject();
        try {
            session.put("currentTrackId", sTrackId);
            session.put("currentTrackTitle", sTitle);
            session.put("currentTrackArtist", sArtist);
            session.put("currentTrackAlbum", sAlbum);
            session.put("currentTrackDuration", sDurationMs / 1000.0);
            session.put("currentTime", sPositionMs / 1000.0);
            session.put("queue", queue.trackIds());
            session.put("queueIdx", queue.currentIndex());
            session.put("shuffle", queue.shuffleEnabled());
            session.put("repeat", queue.repeatMode());
            session.put("originalQueue", queue.originalQueueIds());
            JSONObject context = new JSONObject(queue.contextJson());
            session.put("playContext", context);
            session.put("ts", System.currentTimeMillis());
            NativeLibraryDatabase db = new NativeLibraryDatabase(this);
            try { db.saveSetting("local:aurora_session_v1", session); }
            finally { db.close(); }
        } catch (Exception e) { Log.w(TAG, "no se pudo guardar la sesión", e); }
    }

    private static JSONObject readStats(NativeLibraryDatabase db) {
        Object value = db.settingValue("stats", null);
        return value instanceof JSONObject ? (JSONObject) value : new JSONObject();
    }

    /** dataUrl «data:image/...;base64,XYZ» del álbum, ya recortada en la web. */
    static void artwork(String trackId, String dataUrl) {
        Bitmap bitmap = decodeArtwork(dataUrl);
        if (bitmap == null) return;
        if (trackId != null && trackId.length() > 0) {
            synchronized (artworkCache) {
                artworkCache.put(trackId, bitmap);
            }
        }
        sArtwork = bitmap;
        PlaybackService service = live;
        if (service != null) service.applyState();
    }

    static void clearArtwork() {
        sArtwork = null;
        PlaybackService service = live;
        if (service != null) service.applyState();
    }

    static void shutdown(Context context) {
        try {
            context.stopService(new Intent(context, PlaybackService.class));
        } catch (Exception ignored) {
        }
    }

    private static Bitmap decodeArtwork(String dataUrl) {
        if (dataUrl == null) return null;
        try {
            int comma = dataUrl.indexOf(',');
            String payload = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
            byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > 4 * 1024 * 1024) return null;
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) return null;
            // La notificación no necesita más de 512 px; una carátula de
            // 3000 px en el binder de MediaSession solo gasta memoria.
            int side = Math.max(bitmap.getWidth(), bitmap.getHeight());
            if (side > 512) {
                float scale = 512f / side;
                Bitmap small = Bitmap.createScaledBitmap(bitmap,
                        Math.max(1, Math.round(bitmap.getWidth() * scale)),
                        Math.max(1, Math.round(bitmap.getHeight() * scale)), true);
                if (small != bitmap) bitmap.recycle();
                bitmap = small;
            }
            return bitmap;
        } catch (Exception e) {
            Log.w(TAG, "carátula ilegible: " + e);
            return null;
        }
    }

    // ----------------------------------------------------------- ciclo vida

    /** Pausa al desconectar auriculares para evitar que el audio salga por el altavoz. */
    private void registerNoisyReceiver() {
        noisyReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent != null
                        && AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())
                        && sPlaying) {
                    command("pause");
                }
            }
        };
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                // API 33 exige declarar si el receptor dinámico es exportado.
                registerReceiver(noisyReceiver, filter, 4 /* RECEIVER_NOT_EXPORTED */);
            } else {
                registerReceiver(noisyReceiver, filter);
            }
        } catch (Exception e) {
            Log.w(TAG, "no se pudo registrar la pausa al retirar auriculares: " + e);
            noisyReceiver = null;
        }
    }

    private void unregisterNoisyReceiver() {
        if (noisyReceiver == null) return;
        try {
            unregisterReceiver(noisyReceiver);
        } catch (Exception ignored) {
        }
        noisyReceiver = null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        live = this;
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aurora:playback");
            wakeLock.setReferenceCounted(false);
        }
        NativeText.load(this);
        NativeLibraryDatabase preferenceDb = new NativeLibraryDatabase(this);
        try {
            NativeText.setLanguage(preferenceDb.setting("language",
                    preferenceDb.setting("local:aurora_lang", "es")));
        } finally { preferenceDb.close(); }
        createChannel();
        createSession();
        registerNoisyReceiver();
        // Con la página cerrada, el final de una canción lo resuelve la
        // copia de la cola que mantiene Java.
        NativePlayer player = NativePlayerBridge.get(this);
        player.setOnEndedListener(new NativePlayer.OnEndedListener() {
            @Override
            public void onEnded(String trackId) {
                onTrackEnded();
            }
        });
        player.setOnTrackChangedListener(new NativePlayer.OnTrackChangedListener() {
            @Override
            public void onTrackChanged(String trackId) {
                onNativeTrackChanged(trackId);
            }
        });
        // Hay que entrar en primer plano en los primeros segundos de vida
        // del servicio o Android lo mata.
        startForeground(NOTIFICATION_ID, buildNotification());
        applyState();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_TOGGLE.equals(action)) {
                command(sPlaying ? "pause" : "play");
            } else if (ACTION_PLAY.equals(action)) {
                command("play");
            } else if (ACTION_PAUSE.equals(action)) {
                command("pause");
            } else if (ACTION_NEXT.equals(action)) {
                command("next");
            } else if (ACTION_PREV.equals(action)) {
                command("prev");
            }
        }
        return START_NOT_STICKY; // sin WebView no hay nada que reanudar
    }

    @Override
    public void onDestroy() {
        persistListeningTime();
        persistNativeSession();
        progressHandler.removeCallbacks(progressTicker);
        progressScheduled = false;
        unregisterNoisyReceiver();
        NativePlayerBridge.releaseAll();
        NativeEqualizerEngine.release();
        releaseFocus();
        releaseWakeLock();
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        if (live == this) live = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // En pausa, no hace falta mantener vivo el servicio al quitar la
        // actividad de la pantalla de recientes.
        if (!sPlaying) stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    /**
     * Un comando del sistema (notificación, bloqueo, auriculares).
     *
     * Se conserva la ruta de comandos web durante la transición. En la
     * interfaz nativa los comandos llegan a la cola Java y se ejecutan aquí.
     */
    private void command(String name) {
        if (WebApp.attached()) {
            WebApp.mediaCommand(name);
            return;
        }
        if ("play".equals(name)) {
            NativePlayerBridge.resumePlayback();
            sPlaying = true;
            applyState();
        } else if ("pause".equals(name)) {
            NativePlayerBridge.pauseIfPlaying();
            sPlaying = false;
            applyState();
        } else if ("next".equals(name)) {
            stepQueue(true);
        } else if ("prev".equals(name)) {
            stepQueue(false);
        }
    }

    // --------------------------------------------------------- cola nativa

    /** Fin de pista sin página: ¿queda algo en la cola? Pues suena. */
    private void onTrackEnded() {
        if (WebApp.attached()) return; // la web ya se encarga (y avisará)
        recordCompletedTrack(sTrackId);
        if (sSleepAtTrackEnd) {
            sSleepAtTrackEnd = false;
            sPlaying = false;
            NativePlayerBridge.pauseIfPlaying();
            applyState();
            return;
        }
        PlayQueue queue = NativePlayerBridge.queue();
        if ("one".equals(queue.repeatMode()) && queue.current() != null) {
            playEntry(queue.current());
        } else {
            PlayQueue.Entry next = queue.next();
            if (next != null) playEntry(next);
            else {
                sPlaying = false;
                sPositionMs = sDurationMs;
                applyState();
            }
        }
    }

    /** Relevo gapless: la cola mueve su cursor y la notificación se entera. */
    private void onNativeTrackChanged(String trackId) {
        if (trackId != null && !trackId.equals(sTrackId)) {
            recordCompletedTrack(sTrackId);
            sTrackId = trackId;
            if (sSleepAtTrackEnd) {
                sSleepAtTrackEnd = false;
                sPlaying = false;
                NativePlayerBridge.pauseIfPlaying();
                applyState();
                return;
            }
        }
        PlayQueue queue = NativePlayerBridge.queue();
        if (trackId != null) queue.moveTo(trackId);
        if (WebApp.attached()) return; // la web actualizará todo al volver
        PlayQueue.Entry entry = queue.current();
        if (entry == null) return;
        sTitle = entry.title;
        sArtist = entry.artist;
        sAlbum = entry.album;
        sDurationMs = entry.durationMs;
        sPositionMs = 0;
        keepOrReplaceArtwork(entry.id);
        applyState();
    }

    /** Siguiente o anterior pedidos desde el sistema con la página cerrada. */
    private void stepQueue(boolean forward) {
        PlayQueue queue = NativePlayerBridge.queue();
        PlayQueue.Entry entry = forward ? queue.next() : queue.previous();
        if (entry == null) return;
        playEntry(entry);
    }

    /** Reproduce una entrada de la cola nativa y deja lista la siguiente. */
    private void playEntry(PlayQueue.Entry entry) {
        if (entry == null) return;
        PlayQueue queue = NativePlayerBridge.queue();
        queue.moveTo(entry.id);

        sTitle = entry.title;
        sArtist = entry.artist;
        sAlbum = entry.album;
        sTrackId = entry.id;
        sDurationMs = entry.durationMs;
        sPositionMs = 0;
        lastProgressPosition = -1;
        sPlaying = true;
        keepOrReplaceArtwork(entry.id);
        applyState();

        NativePlayer player = NativePlayerBridge.get(this);
        if (entry.uri != null && (entry.uri.startsWith("content://")
                || entry.uri.startsWith("file://"))) {
            player.playUri(entry.id, entry.uri, 0);
        } else {
            player.play(entry.id, 0);
        }

        // La pista siguiente se prepara por URI o desde la caché local.
        PlayQueue.Entry following = queue.next();
        if (!sSleepAtTrackEnd && !"one".equals(queue.repeatMode())
                && following != null && following.uri != null
                && (following.uri.startsWith("content://") || following.uri.startsWith("file://"))) {
            player.setPendingPreparedId(following.id);
            player.prepareNextUri(following.uri);
        } else if (!sSleepAtTrackEnd && !"one".equals(queue.repeatMode())
                && following != null && player.hasTrack(following.id)) {
            player.prepareNext(following.id);
        }
    }

    private void keepOrReplaceArtwork(String trackId) {
        Bitmap cached = null;
        if (trackId != null) {
            synchronized (artworkCache) {
                cached = artworkCache.get(trackId);
            }
        }
        sArtwork = cached;
    }

    // -------------------------------------------------------------- sesión

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                NativeText.text(this, "notification_channel_playback"),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(NativeText.text(this, "notification_channel_playback_desc"));
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
    }

    private void createSession() {
        session = new MediaSession(this, "Aurora");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                command("play");
            }

            @Override
            public void onPause() {
                command("pause");
            }

            @Override
            public void onSkipToNext() {
                command("next");
            }

            @Override
            public void onSkipToPrevious() {
                command("prev");
            }

            @Override
            public void onStop() {
                command("pause");
            }
        });
        session.setActive(true);
    }

    /** Refresca sesión, notificación, foco y wake lock con el estado actual. */
    private void applyState() {
        updateSessionMetadata();
        updatePlaybackState();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        //  Una sola notificación por actualización: antes se construía dos
        // veces (notify + startForeground) y cada construcción infla la
        // carátula otra vez en el hilo principal.
        Notification notification = buildNotification();
        if (nm != null) {
            try {
                nm.notify(NOTIFICATION_ID, notification);
            } catch (Exception e) {
                Log.w(TAG, "notificación: " + e);
            }
        }
        if (sPlaying) {
            acquireWakeLock();
            requestFocus();
            // Sigue en primer plano: Android no debería matar la música.
            startForeground(NOTIFICATION_ID, notification);
            if (!progressScheduled) {
                progressScheduled = true;
                progressHandler.postDelayed(progressTicker, 1000);
            }
        } else {
            progressHandler.removeCallbacks(progressTicker);
            progressScheduled = false;
            releaseWakeLock();
            releaseFocus();
            // En pausa se suelta el primer plano: nothing suena, así que el
            // sistema puede reclamar el proceso y la notificación se puede
            // descartar con un gesto (se queda visible, no «pegada»).
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_DETACH);
            else stopForeground(false);
        }
    }

    private void updateSessionMetadata() {
        if (session == null) return;
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, sTitle.length() == 0 ? "Aurora" : sTitle)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, sArtist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, sAlbum)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, sDurationMs);
        if (sArtwork != null) {
            meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, sArtwork);
        }
        session.setMetadata(meta.build());
    }

    private void updatePlaybackState() {
        if (session == null) return;
        long actions = PlaybackState.ACTION_PLAY
                | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT
                | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                | PlaybackState.ACTION_STOP;
        PlaybackState.Builder state = new PlaybackState.Builder()
                .setActions(actions)
                .setState(sPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        sPositionMs, sPlaying ? 1f : 0f);
        session.setPlaybackState(state.build());
    }

    // --------------------------------------------------------- notificación

    private Notification buildNotification() {
        String title = sTitle.length() == 0 ? NativeText.text(this, "app_title") : sTitle;

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= 26) builder = new Notification.Builder(this, CHANNEL_ID);
        else builder = new Notification.Builder(this);

        builder.setSmallIcon(R.drawable.ic_stat_aurora)
                .setContentTitle(title)
                .setContentText(sArtist)
                .setContentIntent(openAppIntent())
                .setOngoing(sPlaying)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_previous,
                        NativeText.text(this, "action_prev"), actionIntent(ACTION_PREV, 1))
                .addAction(sPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        NativeText.text(this, sPlaying ? "action_pause" : "action_play"),
                        actionIntent(ACTION_TOGGLE, 2))
                .addAction(android.R.drawable.ic_media_next,
                        NativeText.text(this, "action_next"), actionIntent(ACTION_NEXT, 3));

        if (sArtwork != null) builder.setLargeIcon(sArtwork);

        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (session != null) style.setMediaSession(session.getSessionToken());
        builder.setStyle(style);

        return builder.build();
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(this, NativeHomeActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE);
    }

    private PendingIntent actionIntent(String action, int code) {
        Intent intent = new Intent(this, PlaybackService.class).setAction(action);
        return PendingIntent.getService(this, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE);
    }

    // -------------------------------------------------- foco de audio / CPU

    private void requestFocus() {
        if (focused || audioManager == null) return;
        try {
            int result = audioManager.requestAudioFocus(focusListener,
                    AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            focused = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } catch (Exception e) {
            Log.w(TAG, "foco de audio: " + e);
        }
    }

    private void releaseFocus() {
        if (!focused || audioManager == null) return;
        try {
            audioManager.abandonAudioFocus(focusListener);
        } catch (Exception ignored) {
        }
        focused = false;
    }

    /** Otra app manda (llamada, vídeo, asistente): Aurora se pausa. */
    private final AudioManager.OnAudioFocusChangeListener focusListener =
            new AudioManager.OnAudioFocusChangeListener() {
                @Override
                public void onAudioFocusChange(int change) {
                    if (change == AudioManager.AUDIOFOCUS_LOSS
                            || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                        focused = false;
                        // Se pausa por las dos vías: el reproductor nativo
                        // (que sigue vivo aunque el WebView no) y la web,
                        // que es quien actualiza la interfaz.
                        NativePlayerBridge.pauseIfPlaying();
                        WebApp.mediaCommand("pause");
                    } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
                        focused = true;
                    }
                }
            };

    private void acquireWakeLock() {
        if (wakeLock == null || wakeLock.isHeld()) return;
        try {
            // Sin límite de tiempo: lo suelta la pausa, no un temporizador.
            wakeLock.acquire();
        } catch (Exception e) {
            Log.w(TAG, "wake lock: " + e);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock == null || !wakeLock.isHeld()) return;
        try {
            wakeLock.release();
        } catch (Exception ignored) {
        }
    }
}
