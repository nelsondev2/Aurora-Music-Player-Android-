package com.nelsondev2.aurora;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parser LRC Java: timestamps múltiples, offset global, texto simple y traducciones. */
final class NativeLyrics {
    static final class Line {
        final long timeMs;
        final String text;
        final String translation;
        Line(long timeMs, String text, String translation) {
            this.timeMs = timeMs;
            this.text = text;
            this.translation = translation;
        }
        boolean timed() { return timeMs >= 0; }
    }

    private static final Pattern OFFSET = Pattern.compile("\\[offset:\\s*(-?\\d+)\\s*\\]", Pattern.CASE_INSENSITIVE);
    private static final Pattern STAMP = Pattern.compile("\\[(?:(\\d+):)?(\\d{1,2}):(\\d{1,2}(?:[.,]\\d+)?)\\]");
    private static final Pattern META = Pattern.compile("^\\[(ar|ti|al|by|offset|length|re|ve|id):", Pattern.CASE_INSENSITIVE);
    private static final Pattern KARAOKE = Pattern.compile("<\\d{1,2}:\\d{2}(?:\\.\\d{1,3})?>");

    private NativeLyrics() { }

    static ArrayList<Line> parse(JSONObject track) {
        ArrayList<Line> result = new ArrayList<Line>();
        if (track == null) return result;
        Object value = track.opt("lrc");
        ArrayList<String> source = new ArrayList<String>();
        if (value instanceof JSONArray) {
            JSONArray lines = (JSONArray) value;
            for (int i = 0; i < lines.length(); i++) source.add(lines.optString(i, ""));
        } else if (value != null && value != JSONObject.NULL) {
            String text = String.valueOf(value).replace("\r\n", "\n").replace('\r', '\n');
            String[] lines = text.split("\n");
            Collections.addAll(source, lines);
        }
        long offsetMs = 0;
        for (String line : source) {
            Matcher matcher = OFFSET.matcher(line);
            if (matcher.find()) {
                try { offsetMs = Long.parseLong(matcher.group(1)); } catch (Exception ignored) { }
            }
        }
        for (String raw : source) {
            String line = raw == null ? "" : raw.trim();
            if (line.length() == 0 || META.matcher(line).find()) continue;
            Matcher matcher = STAMP.matcher(line);
            ArrayList<Long> stamps = new ArrayList<Long>();
            int end = 0;
            while (matcher.find()) {
                long hours = matcher.group(1) == null ? 0 : parseLong(matcher.group(1));
                long minutes = parseLong(matcher.group(2));
                double seconds = parseDouble(matcher.group(3).replace(',', '.'));
                stamps.add(Math.max(0, Math.round((hours * 3600 + minutes * 60 + seconds) * 1000) + offsetMs));
                end = matcher.end();
            }
            String lyric = stripKaraoke(stamps.isEmpty() ? line : line.substring(end).trim());
            if (lyric.length() == 0) continue;
            if (stamps.isEmpty()) result.add(new Line(-1, lyric, ""));
            else for (Long stamp : stamps) result.add(new Line(stamp, lyric, ""));
        }
        Collections.sort(result, new Comparator<Line>() {
            @Override public int compare(Line a, Line b) {
                if (!a.timed() && !b.timed()) return 0;
                if (!a.timed()) return 1;
                if (!b.timed()) return -1;
                return a.timeMs < b.timeMs ? -1 : (a.timeMs == b.timeMs ? 0 : 1);
            }
        });
        ArrayList<Line> merged = new ArrayList<Line>();
        for (Line line : result) {
            if (line.timed() && !merged.isEmpty()) {
                Line previous = merged.get(merged.size() - 1);
                if (previous.timed() && previous.timeMs == line.timeMs && previous.translation.length() == 0) {
                    merged.set(merged.size() - 1, new Line(previous.timeMs, previous.text, line.text));
                    continue;
                }
            }
            merged.add(line);
        }
        return merged;
    }

    static int currentIndex(ArrayList<Line> lines, long positionMs) {
        int current = -1;
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            if (!line.timed()) continue;
            if (line.timeMs > positionMs) break;
            current = i;
        }
        return current;
    }

    private static String stripKaraoke(String text) { return KARAOKE.matcher(text).replaceAll(""); }
    private static long parseLong(String value) { try { return Long.parseLong(value); } catch (Exception e) { return 0; } }
    private static double parseDouble(String value) { try { return Double.parseDouble(value); } catch (Exception e) { return 0; } }
}
