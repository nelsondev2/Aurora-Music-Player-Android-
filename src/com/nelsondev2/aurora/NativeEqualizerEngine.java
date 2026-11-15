package com.nelsondev2.aurora;

import android.content.Context;
import android.media.audiofx.Equalizer;
import android.util.Log;

/** Ecualizador Android conectado a la sesión de audio compartida. */
final class NativeEqualizerEngine {
    private static final String TAG = "AuroraEqualizer";
    private static Equalizer effect;
    private static int sessionId = -1;
    private static boolean enabled;
    private static short[] levels;

    private NativeEqualizerEngine() { }

    static synchronized void attach(Context context, int id) {
        if (id <= 0 || (effect != null && sessionId == id)) return;
        release();
        try {
            effect = new Equalizer(0, id);
            sessionId = id;
            if (levels == null || levels.length != effect.getNumberOfBands()) {
                short[] range = effect.getBandLevelRange();
                levels = new short[effect.getNumberOfBands()];
                for (short band = 0; band < effect.getNumberOfBands(); band++) {
                    levels[band] = clamp((short) 0, range);
                }
            }
            for (short band = 0; band < levels.length; band++) effect.setBandLevel(band, levels[band]);
            effect.setEnabled(enabled);
        } catch (Exception e) {
            Log.w(TAG, "no se pudo activar el ecualizador", e);
            release();
        }
    }

    static synchronized void configure(boolean on, short[] values) {
        enabled = on;
        if (values != null) levels = values.clone();
        if (effect == null) return;
        try {
            if (values != null && values.length == effect.getNumberOfBands()) {
                short[] range = effect.getBandLevelRange();
                for (short band = 0; band < values.length; band++) {
                    levels[band] = clamp(values[band], range);
                    effect.setBandLevel(band, levels[band]);
                }
            }
            effect.setEnabled(enabled);
        } catch (Exception e) {
            Log.w(TAG, "no se pudo aplicar el ecualizador", e);
        }
    }

    static synchronized short[] levels() {
        if (effect != null) {
            try {
                short count = effect.getNumberOfBands();
                short[] current = new short[count];
                for (short band = 0; band < count; band++) current[band] = effect.getBandLevel(band);
                levels = current;
            } catch (Exception ignored) { }
        }
        return levels == null ? new short[0] : levels.clone();
    }

    static synchronized int numberOfBands() {
        try { return effect == null ? (levels == null ? 5 : levels.length) : effect.getNumberOfBands(); }
        catch (Exception e) { return 5; }
    }

    static synchronized int centerFrequency(int band) {
        try { return effect == null ? 0 : effect.getCenterFreq((short) band) / 1000; }
        catch (Exception e) { return 0; }
    }

    static synchronized short[] range() {
        try { return effect == null ? new short[]{-1500, 1500} : effect.getBandLevelRange(); }
        catch (Exception e) { return new short[]{-1500, 1500}; }
    }

    static synchronized boolean isEnabled() { return enabled; }

    static synchronized void release() {
        if (effect != null) {
            try { effect.release(); } catch (Exception ignored) { }
        }
        effect = null;
        sessionId = -1;
    }

    private static short clamp(short value, short[] range) {
        if (range == null || range.length < 2) return value;
        return (short) Math.max(range[0], Math.min(range[1], value));
    }
}
