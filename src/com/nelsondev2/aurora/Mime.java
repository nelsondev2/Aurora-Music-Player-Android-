package com.nelsondev2.aurora;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Tipo MIME por extensión.
 *
 * Se usa en dos sitios que no comparten nada más: el servidor de assets
 * (el WebView decide con el MIME si interpreta el recurso como HTML, CSS,
 * fuente o binario) y el proveedor de archivos para compartir.
 */
final class Mime {

    private static final Map<String, String> TYPES = new HashMap<String, String>();

    static {
        // Documento y estilos
        TYPES.put("html", "text/html");
        TYPES.put("htm", "text/html");
        TYPES.put("css", "text/css");
        TYPES.put("js", "application/javascript");
        TYPES.put("mjs", "application/javascript");
        TYPES.put("json", "application/json");
        TYPES.put("txt", "text/plain");
        TYPES.put("lrc", "text/plain");
        TYPES.put("m3u", "audio/x-mpegurl");
        TYPES.put("m3u8", "audio/x-mpegurl");
        TYPES.put("xml", "text/xml");
        TYPES.put("toml", "text/plain");
        // Imágenes
        TYPES.put("png", "image/png");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("jpeg", "image/jpeg");
        TYPES.put("gif", "image/gif");
        TYPES.put("webp", "image/webp");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("ico", "image/x-icon");
        // Fuentes
        TYPES.put("woff", "font/woff");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("ttf", "font/ttf");
        TYPES.put("otf", "font/otf");
        // Audio (por si algún día se sirve un archivo desde assets)
        TYPES.put("mp3", "audio/mpeg");
        TYPES.put("m4a", "audio/mp4");
        TYPES.put("aac", "audio/aac");
        TYPES.put("flac", "audio/flac");
        TYPES.put("ogg", "audio/ogg");
        TYPES.put("oga", "audio/ogg");
        TYPES.put("opus", "audio/opus");
        TYPES.put("wav", "audio/wav");
        TYPES.put("webm", "audio/webm");
    }

    private Mime() {
    }

    /** MIME de un nombre de archivo; application/octet-stream si no se sabe. */
    static String of(String fileName) {
        if (fileName != null) {
            int dot = fileName.lastIndexOf('.');
            if (dot >= 0 && dot < fileName.length() - 1) {
                String ext = fileName.substring(dot + 1).toLowerCase(Locale.US);
                String type = TYPES.get(ext);
                if (type != null) return type;
            }
        }
        return "application/octet-stream";
    }

    /** ¿Es texto? Solo esos llevan codificación declarada al WebView. */
    static boolean isText(String mime) {
        if (mime == null) return false;
        return mime.startsWith("text/")
                || mime.equals("application/javascript")
                || mime.equals("application/json")
                || mime.equals("image/svg+xml")
                || mime.equals("audio/x-mpegurl");
    }
}
