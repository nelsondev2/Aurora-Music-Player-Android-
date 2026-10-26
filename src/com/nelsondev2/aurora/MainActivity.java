package com.nelsondev2.aurora;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import java.util.LinkedHashSet;

/**
 * La única pantalla de Aurora: un WebView a pantalla completa que carga
 * la app de assets/www sobre https://aurora.localhost (ver
 * AuroraWebClient para el porqué del origen falso).
 *
 * Responsabilidades nativas, y nada más:
 *   · contenedor y ajustes del WebView,
 *   · selector de archivos (importar música, letras, portadas),
 *   · botón atrás (que no mate la música sin querer),
 *   · puente para compartir archivos (AuroraBridge).
 */
public class MainActivity extends Activity {

    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_NOTIFICATIONS = 1002;
    /** android.permission.POST_NOTIFICATIONS (API 33), como literal para
     *  poder compilar también contra SDK anteriores. */
    private static final String PERMISSION_POST_NOTIFICATIONS =
            "android.permission.POST_NOTIFICATIONS";
    private static final int BG_COLOR = 0xFF050509; // el --bg-0 de la app

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileCallback;
    private DeviceLibraryBridge deviceLibraryBridge;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        paintSystemBars();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG_COLOR);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        configureWebView(webView);
        WebApp.attach(webView);
        // Sin restaurar estado de Android a propósito: la app ya recupera
        // su propia sesión (biblioteca, cola, ajustes) desde IndexedDB y
        // localStorage, y así una recreación no deja un WebView a medias.
        webView.loadUrl(AuroraWebClient.ORIGIN + "/index.html");
    }

    private void paintSystemBars() {
        if (Build.VERSION.SDK_INT >= 21) {
            Window w = getWindow();
            w.setStatusBarColor(BG_COLOR);
            w.setNavigationBarColor(BG_COLOR);
        }
    }

    private void configureWebView(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        // DOM storage + database: localStorage e IndexedDB de la biblioteca.
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // Los recursos se sirven desde assets, no desde file:// ni desde
        // content://: no hace falta abrir esos accesos.
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        // Sin esto, el primer play exige un gesto y la reproducción
        // automática de la cola se queda muda.
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        w.setBackgroundColor(BG_COLOR);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setVerticalScrollBarEnabled(false);
        w.setHorizontalScrollBarEnabled(false);
        if (Build.VERSION.SDK_INT >= 19) WebView.setWebContentsDebuggingEnabled(true);

        w.setWebViewClient(new AuroraWebClient(this));
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                return openFileChooser(callback, params);
            }
        });
        w.addJavascriptInterface(new AuroraBridge(this), "AuroraAndroid");
        w.addJavascriptInterface(new AuroraMediaBridge(this), "AuroraMedia");
        w.addJavascriptInterface(new NativePlayerBridge(this), "AuroraNativePlayer");
        deviceLibraryBridge = new DeviceLibraryBridge(this);
        w.addJavascriptInterface(deviceLibraryBridge, "AuroraDevice");
    }

    /**
     * Permiso de lectura de audio para escanear la música del móvil.
     * La respuesta se manda a la web (window.AuroraDeviceAccess).
     */
    void requestAudioPermission() {
        try {
            if (DeviceLibraryBridge.hasPermission(this)) {
                WebApp.evalJs("window.AuroraDeviceAccess && window.AuroraDeviceAccess(true)");
                return;
            }
            requestPermissions(new String[]{DeviceLibraryBridge.audioPermission()},
                    DeviceLibraryBridge.REQ_AUDIO_PERMISSION);
        } catch (Exception e) {
            WebApp.evalJs("window.AuroraDeviceAccess && window.AuroraDeviceAccess(false)");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == DeviceLibraryBridge.REQ_AUDIO_PERMISSION) {
            boolean granted = results != null && results.length > 0 && results[0] == 0;
            WebApp.evalJs("window.AuroraDeviceAccess && window.AuroraDeviceAccess("
                    + (granted ? "true" : "false") + ")");
        }
    }

    /**
     * Android 13+ exige permiso explícito para mostrar la notificación de
     * reproducción. Sin él la música sigue sonando y el servicio funciona:
     * lo único que se pierde son los controles en la cortina. Se pide una
     * sola vez, en la primera reproducción.
     */
    void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            if (checkSelfPermission(PERMISSION_POST_NOTIFICATIONS) == 0) return;
            requestPermissions(new String[]{PERMISSION_POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        } catch (Exception ignored) {
            // Un dispositivo sin ese permiso declarado no debe romper nada.
        }
    }

    /**
     * Selector de archivos del sistema para los <input type="file"> de la
     * web. ACTION_GET_CONTENT / OPEN_DOCUMENT no piden ningún permiso de
     * almacenamiento: el usuario concede el archivo concreto.
     */
    private boolean openFileChooser(ValueCallback<Uri[]> callback,
                                    WebChromeClient.FileChooserParams params) {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        pendingFileCallback = callback;

        Intent original = null;
        try {
            if (params != null) original = params.createIntent();
        } catch (Exception ignored) {
        }
        Intent intent;
        // ACTION_OPEN_DOCUMENT can retain the grant to the selected original
        // file. Keep folder-selection mode on the WebView's original flow.
        int mode = -1;
        try { if (params != null) mode = params.getMode(); } catch (Exception ignored) {}
        if (Build.VERSION.SDK_INT >= 19 && mode != 3) {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            String type = original == null ? null : original.getType();
            intent.setType(type == null || type.length() == 0 ? "*/*" : type);
            boolean allowMultiple = mode == 1;
            if (original != null) {
                String[] mimeTypes = original.getStringArrayExtra(Intent.EXTRA_MIME_TYPES);
                if (mimeTypes != null && mimeTypes.length > 0) {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
                }
                if (original.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)) allowMultiple = true;
                String title = original.getStringExtra(Intent.EXTRA_TITLE);
                if (title != null) intent.putExtra(Intent.EXTRA_TITLE, title);
            }
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        } else {
            intent = original == null ? new Intent(Intent.ACTION_GET_CONTENT) : original;
            if (intent.getType() == null) intent.setType("*/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            if (Build.VERSION.SDK_INT >= 18) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        try {
            startActivityForResult(intent, REQ_FILE_CHOOSER);
            return true;
        } catch (Exception e) {
            pendingFileCallback = null;
            return false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (pendingFileCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                // Android file providers commonly return multi-selection in
                // Intent.getClipData(), while getData() contains only one URI
                // (or is null). Do not rely on parseResult() implementations
                // that only inspect getData(), or the remaining songs vanish.
                LinkedHashSet<Uri> selected = new LinkedHashSet<>();
                ClipData clip = data.getClipData();
                if (clip != null) {
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        Uri uri = clip.getItemAt(i).getUri();
                        if (uri != null) selected.add(uri);
                    }
                }
                if (selected.isEmpty() && data.getData() != null) {
                    selected.add(data.getData());
                }
                if (selected.isEmpty()) {
                    Uri[] parsed = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                    if (parsed != null) {
                        for (Uri uri : parsed) {
                            if (uri != null) selected.add(uri);
                        }
                    }
                }
                if (!selected.isEmpty()) {
                    result = selected.toArray(new Uri[selected.size()]);
                    if (deviceLibraryBridge != null) deviceLibraryBridge.beginPickedBatch();
                    int grantFlags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION
                            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    for (Uri uri : result) {
                        boolean persistedReadGrant = false;
                        if (Build.VERSION.SDK_INT >= 19 && grantFlags != 0 &&
                                (grantFlags & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0 &&
                                (data.getFlags() & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0) {
                            try {
                                getContentResolver().takePersistableUriPermission(uri, grantFlags);
                                persistedReadGrant = true;
                            } catch (Exception ignored) { /* provider may not support persistent grants */ }
                        }
                        if (deviceLibraryBridge != null) {
                            deviceLibraryBridge.rememberPickedUri(uri, persistedReadGrant);
                        }
                    }
                }
            }
            pendingFileCallback.onReceiveValue(result);
            pendingFileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /**
     * Atrás lo decide la web (assets/www/js/platform.js): cerrar la hoja
     * abierta, salir de Letras o salir de la app. Si suena música al
     * salir, la web la pausa antes de terminar la actividad; Home sigue
     * permitiendo reproducción normal en segundo plano.
     */
    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(typeof window.AuroraAndroidBack === 'function')"
                        + " ? window.AuroraAndroidBack() : 'exit'",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        String answer = value == null ? "" : value.replace("\"", "").trim();
                        if ("handled".equals(answer)) return;
                        finish();
                    }
                });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        // Si el reproductor nativo está sonando, la música NO depende del
        // WebView: se deja el servicio (y su notificación) en pie.
        if (NativePlayerBridge.isCurrentlyPlaying()) {
            WebApp.detach();
            if (webView != null) {
                webView.removeJavascriptInterface("AuroraAndroid");
            webView.removeJavascriptInterface("AuroraMedia");
            webView.removeJavascriptInterface("AuroraNativePlayer");
            webView.removeJavascriptInterface("AuroraDevice");
                webView.removeJavascriptInterface("AuroraMedia");
                webView.removeJavascriptInterface("AuroraNativePlayer");
                webView.removeJavascriptInterface("AuroraDevice");
                webView.loadUrl("about:blank");
                webView.destroy();
                webView = null;
            }
            super.onDestroy();
            return;
        }
        PlaybackService.shutdown(this);
        NativePlayerBridge.releaseAll();
        WebApp.detach();
        if (webView != null) {
            webView.removeJavascriptInterface("AuroraAndroid");
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
