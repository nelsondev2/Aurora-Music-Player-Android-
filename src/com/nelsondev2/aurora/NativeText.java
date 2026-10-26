package com.nelsondev2.aurora;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Traducciones para la interfaz Java a partir del catálogo común del proyecto. */
final class NativeText {
    private static JSONObject root;
    private static JSONArray languages;
    private static String language = "es";

    private NativeText() { }

    static synchronized void load(Context context) {
        if (root != null) return;
        InputStream input = null;
        try {
            input = context.getAssets().open("native_i18n.json");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) >= 0) if (count > 0) output.write(buffer, 0, count);
            root = new JSONObject(new String(output.toByteArray(), "UTF-8"));
            languages = root.optJSONArray("languages");
        } catch (Exception e) {
            root = new JSONObject();
            languages = new JSONArray();
        } finally {
            if (input != null) try { input.close(); } catch (Exception ignored) { }
        }
    }

    static synchronized void setLanguage(String code) {
        if (code != null && code.length() > 0) language = code;
    }

    static synchronized String language() { return language; }

    static synchronized String text(Context context, String key) {
        load(context);
        JSONObject all = root.optJSONObject("translations");
        JSONObject selected = all == null ? null : all.optJSONObject(language);
        JSONObject english = all == null ? null : all.optJSONObject("en");
        JSONObject spanish = all == null ? null : all.optJSONObject("es");
        if (selected != null && selected.has(key)) return selected.optString(key, key);
        if (english != null && english.has(key)) return english.optString(key, key);
        if (spanish != null && spanish.has(key)) return spanish.optString(key, key);
        return key;
    }

    static synchronized JSONArray languages(Context context) {
        load(context);
        return languages == null ? new JSONArray() : languages;
    }
}
