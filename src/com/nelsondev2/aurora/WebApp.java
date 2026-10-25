package com.nelsondev2.aurora;

import android.webkit.WebView;

import java.lang.ref.WeakReference;

/**
 * Acceso al WebView desde fuera de la Activity.
 *
 * El servicio de reproducción (y con él la notificación y los botones de
 * los auriculares) vive fuera de la pantalla, pero la app —y por tanto el
 * estado real de la música— sigue dentro del WebView. Este puente permite
 * mandar comandos a la web sin guardar una Activity en un campo estático:
 * solo hay una referencia débil, que se vacía cuando la pantalla muere.
 */
final class WebApp {

    private static WeakReference<WebView> ref;

    private WebApp() {
    }

    static void attach(WebView webView) {
        ref = new WeakReference<WebView>(webView);
    }

    static void detach() {
        ref = null;
    }

    /** Ejecuta JavaScript en el hilo del WebView; si ya no hay, no hace nada. */
    static void evalJs(final String js) {
        WeakReference<WebView> holder = ref;
        final WebView webView = holder == null ? null : holder.get();
        if (webView == null) return;
        webView.post(new Runnable() {
            @Override
            public void run() {
                try {
                    webView.evaluateJavascript(js, null);
                } catch (Exception ignored) {
                    // El WebView ya está destruido: no hay a quién avisar.
                }
            }
        });
    }

    /**
     * Comando de reproducción para la web. La web responde en
     * assets/www/js/platform.js (window.AuroraMediaCommand).
     */
    static void mediaCommand(String command) {
        evalJs("(function(){try{if(window.AuroraMediaCommand)"
                + "return window.AuroraMediaCommand('" + command + "');}catch(e){}return null;})()");
    }
}
