package com.nelsondev2.aurora;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;

/**
 * Reproducción en segundo plano: servicio en primer plano + MediaSession.
 *
 * El audio sigue sonando dentro del WebView (la app es una sola página);
 * lo que aporta este servicio es lo que antes era imposible:
 *
 *   · que Android no mate el proceso al salir de la app,
 *   · notificación con carátula y controles, pantalla de bloqueo y
 *     botones de auriculares/Bluetooth (todo pasa por MediaSession),
 *   · foco de audio: si entra una llamada o suena otra app, Aurora se
 *     pausa sola,
 *   · un wake lock parcial mientras suena, para que el sueño del
 *     dispositivo no corte la reproducción.
 *
 * Los comandos (play, pause, next, prev) viajan a la web con
 * WebApp.mediaCommand(); el estado viaja al revés con
 * AuroraMediaBridge.mediaUpdate().
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

    /** Estado vigente. Es estático porque la web puede avisar antes de que
     *  el servicio termine de crearse (startForegroundService es async). */
    private static String sTitle = "";
    private static String sArtist = "";
    private static String sAlbum = "";
    private static boolean sPlaying;
    private static long sDurationMs;
    private static long sPositionMs;
    private static Bitmap sArtwork;

    private static PlaybackService live;

    private MediaSession session;
    private AudioManager audioManager;
    private PowerManager.WakeLock wakeLock;
    private boolean focused;

    // ------------------------------------------------------------ estático
    // API para AuroraMediaBridge: no necesita el servicio levantado.

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

    /** dataUrl «data:image/...;base64,XYZ» del álbum, ya recortada en la web. */
    static void artwork(String dataUrl) {
        Bitmap bitmap = decodeArtwork(dataUrl);
        if (bitmap == null) return;
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
        createChannel();
        createSession();
        // Hay que entrar en primer plano en los primeros segundos de vida
        // del servicio o Android lo mata.
        startForeground(NOTIFICATION_ID, buildNotification());
        applyState();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_TOGGLE.equals(action)) WebApp.mediaCommand(sPlaying ? "pause" : "play");
            else if (ACTION_PLAY.equals(action)) WebApp.mediaCommand("play");
            else if (ACTION_PAUSE.equals(action)) WebApp.mediaCommand("pause");
            else if (ACTION_NEXT.equals(action)) WebApp.mediaCommand("next");
            else if (ACTION_PREV.equals(action)) WebApp.mediaCommand("prev");
        }
        return START_NOT_STICKY; // sin WebView no hay nada que reanudar
    }

    @Override
    public void onDestroy() {
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
        // Cerrar la app desde «recientes» con la música en pausa: el
        // WebView se va con la tarea, así que el servicio no tiene a quién
        // mandar comandos.
        if (!sPlaying) stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    // -------------------------------------------------------------- sesión

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_playback),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.notification_channel_playback_desc));
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
                WebApp.mediaCommand("play");
            }

            @Override
            public void onPause() {
                WebApp.mediaCommand("pause");
            }

            @Override
            public void onSkipToNext() {
                WebApp.mediaCommand("next");
            }

            @Override
            public void onSkipToPrevious() {
                WebApp.mediaCommand("prev");
            }

            @Override
            public void onStop() {
                WebApp.mediaCommand("pause");
            }
        });
        session.setActive(true);
    }

    /** Refresca sesión, notificación, foco y wake lock con el estado actual. */
    private void applyState() {
        updateSessionMetadata();
        updatePlaybackState();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            try {
                nm.notify(NOTIFICATION_ID, buildNotification());
            } catch (Exception e) {
                Log.w(TAG, "notificación: " + e);
            }
        }
        if (sPlaying) {
            acquireWakeLock();
            requestFocus();
            // Sigue en primer plano: Android no debería matar la música.
            startForeground(NOTIFICATION_ID, buildNotification());
        } else {
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
        String title = sTitle.length() == 0 ? getString(R.string.app_name) : sTitle;

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
                        getString(R.string.action_prev), actionIntent(ACTION_PREV, 1))
                .addAction(sPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        getString(sPlaying ? R.string.action_pause : R.string.action_play),
                        actionIntent(ACTION_TOGGLE, 2))
                .addAction(android.R.drawable.ic_media_next,
                        getString(R.string.action_next), actionIntent(ACTION_NEXT, 3));

        if (sArtwork != null) builder.setLargeIcon(sArtwork);

        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (session != null) style.setMediaSession(session.getSessionToken());
        builder.setStyle(style);

        return builder.build();
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(this, MainActivity.class);
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
