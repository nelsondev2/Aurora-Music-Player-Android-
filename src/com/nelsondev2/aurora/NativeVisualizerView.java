package com.nelsondev2.aurora;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

/** Barra de waveform compacta para la pantalla nativa. */
final class NativeVisualizerView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private byte[] waveform = new byte[0];
    private int color = 0xff9c6cff;

    NativeVisualizerView(Context context) { super(context); }

    void setWaveform(byte[] data) {
        waveform = data == null ? new byte[0] : data.clone();
        invalidate();
    }

    void setColor(int value) { color = value; invalidate(); }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int count = 36;
        float width = getWidth();
        float height = getHeight();
        float gap = Math.max(2f, width / 180f);
        float barWidth = (width - gap * (count - 1)) / count;
        paint.setColor(color);
        for (int i = 0; i < count; i++) {
            float amplitude;
            if (waveform.length == 0) {
                amplitude = 0.12f;
            } else {
                int from = i * waveform.length / count;
                int to = Math.max(from + 1, (i + 1) * waveform.length / count);
                int peak = 0;
                for (int j = from; j < to && j < waveform.length; j++) {
                    peak = Math.max(peak, Math.abs((waveform[j] & 0xff) - 128));
                }
                amplitude = Math.max(0.08f, peak / 128f);
            }
            float barHeight = Math.max(3f, amplitude * height * 0.88f);
            float left = i * (barWidth + gap);
            float top = (height - barHeight) / 2f;
            canvas.drawRoundRect(new RectF(left, top, left + barWidth, top + barHeight),
                    barWidth / 2f, barWidth / 2f, paint);
        }
    }
}
