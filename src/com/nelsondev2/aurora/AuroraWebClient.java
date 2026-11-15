package com.nelsondev2.aurora;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Sirve la app desde assets/ sobre un origen https de mentira.
 *
 * Por qué no basta con file:///android_asset/www/index.html: en Chromium
 * un file:// es un origen opaco. IndexedDB —donde vive toda la música— o
 * no está disponible o se pierde al cerrar, y navigator.storage.persist()
 * no hace nada. Sirviendo desde https://aurora.localhost el WebView ve un
 * origen seguro normal: IndexedDB, localStorage y persistencia funcionan
 * como en cualquier web.
 *
 * Cada petición de ese host se responde desde assets/www. La única
 * petición web externa permitida es la búsqueda explícita de letras en
 * https://lrclib.net/api/search; el resto no se usa como dependencia.
 */
class AuroraWebClient extends WebViewClient {

    /** Host ficticio; nunca se resuelve por DNS porque lo interceptamos. */
    static final String HOST = "aurora.localhost";
    static final String ORIGIN = "https://" + HOST;
    private static final String ASSET_ROOT = "www/";

    private final Context appContext;

    AuroraWebClient(Context context) {
        this.appContext = context.getApplicationContext();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        // Pasar solo la API de búsqueda LRC a la red. Los demás hosts siguen
        // bloqueados para conservar el modelo offline-first del WebView.
        if (url != null && "https".equalsIgnoreCase(url.getScheme())
                && "lrclib.net".equalsIgnoreCase(url.getHost())
                && "/api/search".equals(url.getPath())) {
            return null;
        }
        return serve(url);
    }

    /** Enlaces externos (p. ej. «Código fuente»): al navegador del sistema. */
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        if (url == null) return true;
        if (url.startsWith(ORIGIN)) return false;
        openExternal(url);
        return true;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return shouldOverrideUrlLoading(view, request.getUrl().toString());
    }

    private void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            appContext.startActivity(i);
        } catch (Exception ignored) {
            // Sin navegador instalado: el enlace simplemente no hace nada.
        }
    }

    private WebResourceResponse serve(Uri url) {
        if (url == null || !HOST.equals(url.getHost())) return notFound();

        String path = url.getPath();
        if (path == null || path.length() == 0 || "/".equals(path)) path = "/index.html";
        String rel = path.startsWith("/") ? path.substring(1) : path;
        // Sin salir de assets/www: la ruta viene de la URL, así que se
        // rechaza cualquier intento de subir directorios.
        if (rel.indexOf("..") >= 0 || rel.indexOf('\\') >= 0) return notFound();

        InputStream in;
        try {
            in = appContext.getAssets().open(ASSET_ROOT + rel);
        } catch (IOException e) {
            return notFound();
        }
        String mime = Mime.of(rel);
        return new WebResourceResponse(
                mime,
                Mime.isText(mime) ? "utf-8" : null,
                200,
                "OK",
                headers(),
                in);
    }

    private static Map<String, String> headers() {
        Map<String, String> h = new HashMap<String, String>();
        // Los assets cambian con cada versión de la app y se leen del APK:
        // no hay nada que cachear y una caché vieja solo trae pantallas en
        // blanco tras actualizar.
        h.put("Cache-Control", "no-cache, no-store, must-revalidate");
        h.put("Pragma", "no-cache");
        h.put("Access-Control-Allow-Origin", ORIGIN);
        return h;
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse(
                "text/plain",
                "utf-8",
                404,
                "Not Found",
                headers(),
                new ByteArrayInputStream("404".getBytes()));
    }
}
