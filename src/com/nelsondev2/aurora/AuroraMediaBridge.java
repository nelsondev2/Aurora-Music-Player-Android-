package com.nelsondev2.aurora;

import android.app.Activity;
import android.webkit.JavascriptInterface;

/**
 * Puente JS ↔ Android para la reproducción en segundo plano
 * (window.AuroraMedia).
 *
 * La web avisa aquí de lo que está sonando y este lado actualiza la
 * notificación, la MediaSession y el foco de audio. Los comandos viajan
 * al revés: PlaybackService llama a WebApp.mediaCommand() y la web
 * responde en window.AuroraMediaCommand (assets/www/js/platform.js).
 *
 * Todos los métodos son deliberadamente sin valor de retorno: son
 * avisos, no peticiones, y así el hilo de JavaScript nunca se bloquea.
 */
class AuroraMediaBridge {

    private final MainActivity activity;

    AuroraMediaBridge(MainActivity activity) {
        this.activity = activity;
    }

    /** Primera reproducción: permiso de notificaciones (Android 13+) y servicio. */
    @JavascriptInterface
    public void mediaStart() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.ensureNotificationPermission();
                PlaybackService.ensureRunning(activity);
            }
        });
    }

    /**
     * Estado de reproducción. Duraciones en milisegundos (la web las manda
     * como double; el puente no admite long).
     */
    @JavascriptInterface
    public void mediaUpdate(String title, String artist, String album,
                            boolean playing, double durationMs, double positionMs) {
        PlaybackService.update(title, artist, album, playing,
                Math.round(durationMs), Math.round(positionMs));
    }

    /** Carátula como data URL (data:image/jpeg;base64,…). */
    @JavascriptInterface
    public void mediaArtwork(String dataUrl) {
        PlaybackService.artwork(dataUrl);
    }

    @JavascriptInterface
    public void mediaClearArtwork() {
        PlaybackService.clearArtwork();
    }

    /** Se cerró la app: fuera notificación y servicio. */
    @JavascriptInterface
    public void mediaStop() {
        PlaybackService.shutdown(activity);
    }
}
