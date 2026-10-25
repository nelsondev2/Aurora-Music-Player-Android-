package com.nelsondev2.aurora;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Puente JS ↔ Android (window.AuroraAndroid).
 *
 * Cuando la web quiere «compartir» algo (una canción, una letra, una
 * lista) no puede entregar un Blob directamente, y codificar un FLAC
 * entero en una sola cadena reventaría la memoria. Por eso el archivo
 * viaja por trozos:
 *
 *   beginFile(nombre, mime) → appendChunk(base64) × N → endFile()
 *   → share(nombre, mime)   (abre el selector del sistema)
 *
 * El lado JS está en assets/www/js/platform.js. Si algún método devuelve
 * false, allí se avisa con el toast de error en vez de fingir que se
 * compartió.
 */
class AuroraBridge {

    private static final String TAG = "AuroraBridge";

    private final Activity activity;
    private FileOutputStream out;
    private String pendingName;

    AuroraBridge(Activity activity) {
        this.activity = activity;
    }

    /** Abre (o reinicia) el archivo temporal donde llegarán los trozos. */
    @JavascriptInterface
    public boolean beginFile(String name, String mime) {
        closeQuietly();
        try {
            File file = new File(ShareProvider.shareDir(activity), safeName(name));
            if (file.exists() && !file.delete()) return false;
            out = new FileOutputStream(file);
            pendingName = file.getName();
            return true;
        } catch (Exception e) {
            Log.w(TAG, "beginFile: " + e);
            out = null;
            pendingName = null;
            return false;
        }
    }

    /** Añade un trozo (base64 estándar, sin cabecera data:). */
    @JavascriptInterface
    public boolean appendChunk(String base64) {
        if (out == null || base64 == null) return false;
        try {
            out.write(Base64.decode(base64, Base64.DEFAULT));
            return true;
        } catch (Exception e) {
            Log.w(TAG, "appendChunk: " + e);
            closeQuietly();
            return false;
        }
    }

    /** Cierra el archivo; a partir de aquí ya se puede compartir. */
    @JavascriptInterface
    public boolean endFile() {
        if (out == null) return false;
        try {
            out.flush();
            out.close();
            out = null;
            return true;
        } catch (Exception e) {
            Log.w(TAG, "endFile: " + e);
            out = null;
            return false;
        }
    }

    /** Abre el selector «Compartir» de Android con el último archivo. */
    @JavascriptInterface
    public boolean share(final String name, final String mime) {
        if (pendingName == null) return false;
        final File file = new File(ShareProvider.shareDir(activity), pendingName);
        if (!file.exists() || file.length() == 0) return false;

        final String type = (mime == null || mime.length() == 0)
                ? Mime.of(pendingName) : mime;
        final String title = (name == null || name.length() == 0) ? pendingName : name;

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(type);
                    send.putExtra(Intent.EXTRA_STREAM, ShareProvider.uriFor(pendingName));
                    send.putExtra(Intent.EXTRA_SUBJECT, title);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    activity.startActivity(Intent.createChooser(send, title));
                } catch (Exception e) {
                    Log.w(TAG, "share: " + e);
                }
            }
        });
        return true;
    }

    /**
     * Comparte un archivo que YA existe (un content:// de MediaStore) sin
     * copiarlo: se concede lectura temporal a la app que lo reciba.
     */
    @JavascriptInterface
    public boolean shareUri(final String uri, final String name, final String mime) {
        if (uri == null || uri.length() == 0) return false;
        final String type = (mime == null || mime.length() == 0) ? "audio/*" : mime;
        final String title = (name == null || name.length() == 0) ? "Aurora" : name;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(type);
                    send.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
                    send.putExtra(Intent.EXTRA_SUBJECT, title);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    activity.startActivity(Intent.createChooser(send, title));
                } catch (Exception e) {
                    Log.w(TAG, "shareUri: " + e);
                }
            }
        });
        return true;
    }

    /** Nombres seguros: sin rutas ni caracteres de control. */
    private static String safeName(String name) {
        String base = (name == null || name.trim().length() == 0) ? "aurora" : name.trim();
        StringBuilder sb = new StringBuilder(base.length());
        for (int i = 0; i < base.length(); i++) {
            char c = base.charAt(i);
            boolean ok = c >= ' ' && c != '/' && c != '\\' && c != ':' && c != '*'
                    && c != '?' && c != '"' && c != '<' && c != '>' && c != '|';
            sb.append(ok ? c : '_');
        }
        String clean = sb.toString();
        if (clean.length() > 120) {
            // Conserva la extensión al recortar nombres kilométricos.
            int dot = clean.lastIndexOf('.');
            String ext = (dot > 0 && clean.length() - dot <= 12) ? clean.substring(dot) : "";
            clean = clean.substring(0, 120 - ext.length()) + ext;
        }
        return clean.length() == 0 ? "aurora" : clean;
    }

    private void closeQuietly() {
        if (out != null) {
            try {
                out.close();
            } catch (Exception ignored) {
            }
            out = null;
        }
    }
}
