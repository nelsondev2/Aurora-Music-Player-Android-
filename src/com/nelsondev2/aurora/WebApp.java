package com.nelsondev2.aurora;

import android.webkit.WebView;

import org.json.JSONObject;

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
     * Evento del reproductor nativo hacia la web
     * (window.AuroraNativePlayerEvent en assets/www/js/native-audio.js).
     * Un JSON es, además, un literal válido de JavaScript.
     */
    static void emitNativeEvent(JSONObject event) {
        if (event == null) return;
        evalJs("if(window.AuroraNativePlayerEvent){try{window.AuroraNativePlayerEvent("
                + event.toString() + ");}catch(e){}}");
    }

    /** ¿Sigue habiendo una página a la que hablar? */
    static boolean attached() {
        WeakReference<WebView> holder = ref;
        return holder != null && holder.get() != null;
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
