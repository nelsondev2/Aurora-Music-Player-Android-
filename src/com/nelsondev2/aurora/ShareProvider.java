package com.nelsondev2.aurora;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * ContentProvider mínimo de solo lectura para compartir archivos.
 *
 * Android no deja mandar un File a otra app (a partir de la 7 un
 * file:// en un Intent lanza FileUriExposedException), así que los
 * archivos exportados desde la web —una canción, una letra .lrc, una
 * lista .m3u8— se dejan en la caché y se comparten como
 * content://com.nelsondev2.aurora.share/<nombre> con permiso temporal
 * de lectura.
 *
 * Se escribe a mano en vez de usar FileProvider para no arrastrar
 * AndroidX: en AIDE, sin Gradle ni repositorios, las dependencias
 * pesan más que estas 80 líneas.
 */
public class ShareProvider extends ContentProvider {

    public static final String AUTHORITY = "com.nelsondev2.aurora.share";

    /** Carpeta de intercambio (caché: el sistema la puede vaciar). */
    static File shareDir(Context context) {
        File dir = new File(context.getCacheDir(), "share");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    static Uri uriFor(String fileName) {
        return Uri.parse("content://" + AUTHORITY + "/" + Uri.encode(fileName));
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return Mime.of(uri.getLastPathSegment());
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.length() == 0 || name.indexOf("..") >= 0) {
            throw new FileNotFoundException("nombre no válido");
        }
        File file = new File(shareDir(getContext()), name);
        if (!file.exists()) throw new FileNotFoundException(name);
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    // El provider solo lee: el resto de la API no se usa.

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
