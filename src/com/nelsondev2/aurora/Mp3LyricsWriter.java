package com.nelsondev2.aurora;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Writes lyrics into an existing MP3's ID3v2 tag without re-encoding audio.
 * The target is always the original content:// URI; temporary files are only
 * staging/rollback files in the app cache and are removed after the operation.
 */
final class Mp3LyricsWriter {
    private static final int MAX_TAG_BYTES = 64 * 1024 * 1024;
    private static final Charset UTF16LE = Charset.forName("UTF-16LE");
    private static final Pattern TIMESTAMP = Pattern.compile("\\[(\\d{1,3}):(\\d{2})(?:[.:](\\d{1,3}))?\\]");

    private Mp3LyricsWriter() {}

    static String read(Context context, Uri uri) throws IOException {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) return null;
        InputStream input = null;
        try {
            input = context.getContentResolver().openInputStream(uri);
            if (input == null) throw new IOException("read_failed");
            byte[] header = new byte[10];
            int got = readFully(input, header, 0, header.length);
            if (got < 10 || header[0] != 'I' || header[1] != 'D' || header[2] != '3') return null;
            int version = header[3] & 0xff;
            int flags = header[5] & 0xff;
            if ((version != 3 && version != 4) || (flags & (0x80 | 0x40)) != 0) return null;
            int size = syncSafe(header, 6);
            if (size < 0 || size > MAX_TAG_BYTES) throw new IOException("tag_unsupported");
            byte[] tag = new byte[size];
            if (readFully(input, tag, 0, size) != size) throw new IOException("tag_unsupported");
            return extractLyrics(tag, version);
        } finally {
            if (input != null) try { input.close(); } catch (Exception ignored) {}
        }
    }

    private static int readFully(InputStream input, byte[] bytes, int offset, int length) throws IOException {
        int total = 0;
        while (total < length) {
            int n = input.read(bytes, offset + total, length - total);
            if (n < 0) break;
            if (n == 0) {
                int one = input.read();
                if (one < 0) break;
                bytes[offset + total++] = (byte) one;
            } else {
                total += n;
            }
        }
        return total;
    }

    private static String extractLyrics(byte[] tag, int version) throws IOException {
        int offset = 0;
        String uslt = null;
        StringBuilder sylt = new StringBuilder();
        while (offset + 10 <= tag.length && tag[offset] != 0) {
            String id = new String(tag, offset, 4, Charset.forName("ISO-8859-1"));
            if (!id.matches("[A-Z0-9]{4}")) break;
            int size = version == 4 ? syncSafe(tag, offset + 4)
                    : ((tag[offset + 4] & 0xff) << 24) | ((tag[offset + 5] & 0xff) << 16)
                    | ((tag[offset + 6] & 0xff) << 8) | (tag[offset + 7] & 0xff);
            if (size < 0 || offset + 10L + size > tag.length) break;
            int start = offset + 10;
            if ("USLT".equals(id) && uslt == null) {
                uslt = decodeUslt(tag, start, size);
            } else if ("SYLT".equals(id)) {
                String synced = decodeSylt(tag, start, size);
                if (synced != null && synced.length() > 0) {
                    if (sylt.length() > 0) sylt.append('\n');
                    sylt.append(synced);
                }
            }
            offset = start + size;
        }
        return sylt.length() > 0 ? sylt.toString() : uslt;
    }

    private static String decodeUslt(byte[] data, int start, int length) {
        try {
            if (length < 4) return null;
            int encoding = data[start] & 0xff;
            int end = findTerminator(data, start + 4, start + length, encoding);
            int text = end + ((encoding == 1 || encoding == 2) ? 2 : 1);
            if (text > start + length) return null;
            int textEnd = findTerminator(data, text, start + length, encoding);
            return decode(data, text, textEnd - text, encoding).trim();
        } catch (Exception e) { return null; }
    }

    private static String decodeSylt(byte[] data, int start, int length) {
        try {
            if (length < 6) return null;
            int encoding = data[start] & 0xff;
            int pos = findTerminator(data, start + 6, start + length, encoding)
                    + ((encoding == 1 || encoding == 2) ? 2 : 1);
            StringBuilder out = new StringBuilder();
            while (pos < start + length - 4) {
                int textEnd = findTerminator(data, pos, start + length, encoding);
                if (textEnd <= pos) break;
                String text = decode(data, pos, textEnd - pos, encoding);
                pos = textEnd + ((encoding == 1 || encoding == 2) ? 2 : 1);
                if (pos + 4 > start + length) break;
                long millis = ((long) (data[pos] & 0xff) << 24)
                        | ((long) (data[pos + 1] & 0xff) << 16)
                        | ((long) (data[pos + 2] & 0xff) << 8) | (long) (data[pos + 3] & 0xff);
                pos += 4;
                long totalSeconds = millis / 1000;
                long minutes = totalSeconds / 60;
                long seconds = totalSeconds % 60;
                long centiseconds = (millis % 1000) / 10;
                if (out.length() > 0) out.append('\n');
                out.append('[').append(minutes < 10 ? "0" : "").append(minutes)
                        .append(':').append(seconds < 10 ? "0" : "").append(seconds)
                        .append('.').append(centiseconds < 10 ? "0" : "").append(centiseconds)
                        .append(']').append(text);
            }
            return out.length() == 0 ? null : out.toString();
        } catch (Exception e) { return null; }
    }

    private static int findTerminator(byte[] data, int start, int end, int encoding) {
        if (encoding == 1 || encoding == 2) {
            for (int i = start; i + 1 < end; i += 2) {
                if (data[i] == 0 && data[i + 1] == 0) return i;
            }
        } else {
            for (int i = start; i < end; i++) if (data[i] == 0) return i;
        }
        return end;
    }

    private static String decode(byte[] data, int offset, int length, int encoding) {
        int start = offset;
        int end = offset + length;
        Charset charset = encoding == 0 ? Charset.forName("ISO-8859-1")
                : (encoding == 3 ? Charset.forName("UTF-8")
                : (encoding == 2 ? Charset.forName("UTF-16BE") : UTF16LE));
        if (encoding == 1 && end - start >= 2 && data[start] == (byte) 0xfe && data[start + 1] == (byte) 0xff) {
            charset = Charset.forName("UTF-16BE");
            start += 2;
        } else if ((encoding == 1 || encoding == 2) && end - start >= 2
                && data[start] == (byte) 0xff && data[start + 1] == (byte) 0xfe) {
            start += 2;
        }
        return new String(data, start, Math.max(0, end - start), charset);
    }

    static String write(Context context, Uri uri, String lyrics) throws IOException {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) {
            throw new IOException("uri_unavailable");
        }
        String displayName = displayName(context.getContentResolver(), uri);
        if (displayName == null || !displayName.toLowerCase().endsWith(".mp3")) {
            throw new IOException("format_unsupported");
        }

        ContentResolver resolver = context.getContentResolver();
        // Probe for existing write permission without truncating the source.
        android.os.ParcelFileDescriptor probe = null;
        try {
            probe = resolver.openFileDescriptor(uri, "rw");
            if (probe == null) throw new IOException("write_denied");
        } catch (SecurityException e) {
            throw new IOException("write_denied");
        } catch (UnsupportedOperationException e) {
            throw new IOException("write_denied");
        } finally {
            if (probe != null) try { probe.close(); } catch (Exception ignored) {}
        }

        File original = File.createTempFile("aurora-mp3-original-", ".tmp", context.getCacheDir());
        File rewritten = File.createTempFile("aurora-mp3-tagged-", ".tmp", context.getCacheDir());
        try {
            copy(resolver.openInputStream(uri), new FileOutputStream(original));
            rewriteTag(original, rewritten, lyrics == null ? "" : lyrics);
            try {
                OutputStream out = resolver.openOutputStream(uri, "wt");
                if (out == null) throw new IOException("write_denied");
                copy(new FileInputStream(rewritten), out);
                try { resolver.notifyChange(uri, null); } catch (Exception ignored) {}
            } catch (Exception writeError) {
                // Restore the untouched original bytes if the provider failed
                // part-way through replacing the target.
                try {
                    OutputStream restore = resolver.openOutputStream(uri, "wt");
                    if (restore != null) copy(new FileInputStream(original), restore);
                } catch (Exception ignored) {
                    throw new IOException("write_failed_restore_failed");
                }
                if (writeError instanceof IOException && "write_denied".equals(writeError.getMessage())) {
                    throw new IOException("write_denied");
                }
                throw new IOException("write_failed_restored");
            }
            return "ok";
        } finally {
            if (original.exists()) original.delete();
            if (rewritten.exists()) rewritten.delete();
        }
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        Cursor cursor = null;
        try {
            cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return uri.getLastPathSegment();
    }

    private static void rewriteTag(File source, File target, String lyrics) throws IOException {
        RandomAccessFile input = new RandomAccessFile(source, "r");
        FileOutputStream output = new FileOutputStream(target);
        try {
            long length = input.length();
            if (length < 4) throw new IOException("format_unsupported");
            byte[] header = new byte[10];
            int version = 3;
            long oldTagEnd = 0;
            List<byte[]> frames = new ArrayList<>();
            if (length >= 10) {
                input.seek(0);
                input.readFully(header);
                if (header[0] == 'I' && header[1] == 'D' && header[2] == '3') {
                    version = header[3] & 0xff;
                    int flags = header[5] & 0xff;
                    if ((version != 3 && version != 4) || (flags & (0x80 | 0x40 | 0x20)) != 0) {
                        throw new IOException("tag_unsupported");
                    }
                    int tagSize = syncSafe(header, 6);
                    if (tagSize < 0 || tagSize > MAX_TAG_BYTES || 10L + tagSize > length) {
                        throw new IOException("tag_unsupported");
                    }
                    oldTagEnd = 10L + tagSize;
                    byte[] tag = new byte[tagSize];
                    input.seek(10);
                    input.readFully(tag);
                    parseFrames(tag, version, frames);
                } else {
                    input.seek(0);
                }
            }

            if (length - oldTagEnd < 2) throw new IOException("format_unsupported");
            input.seek(oldTagEnd);
            int mpeg0 = input.read();
            int mpeg1 = input.read();
            if (mpeg0 < 0 || mpeg1 < 0 || mpeg0 != 0xff || (mpeg1 & 0xe0) != 0xe0) {
                throw new IOException("format_unsupported");
            }

            if (lyrics.trim().length() > 0) {
                byte[] uslt = makeUslt(plainLyrics(lyrics));
                frames.add(makeFrame("USLT", uslt, version));
                byte[] sylt = makeSylt(lyrics);
                if (sylt != null) frames.add(makeFrame("SYLT", sylt, version));
            }

            ByteArrayOutputStream tagOut = new ByteArrayOutputStream();
            for (byte[] frame : frames) tagOut.write(frame);
            // Leave a small padding area so later edits often fit without
            // moving the audio payload in providers that support random access.
            for (int i = 0; i < 1024; i++) tagOut.write(0);
            byte[] body = tagOut.toByteArray();
            if (body.length > MAX_TAG_BYTES) throw new IOException("lyrics_too_large");

            output.write(new byte[]{'I', 'D', '3', (byte) version, 0, 0});
            output.write(toSyncSafe(body.length));
            output.write(body);
            input.seek(oldTagEnd);
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = input.read(buffer)) != -1) output.write(buffer, 0, n);
            output.flush();
            output.getFD().sync();
        } finally {
            try { input.close(); } catch (Exception ignored) {}
            try { output.close(); } catch (Exception ignored) {}
        }
    }

    private static void parseFrames(byte[] tag, int version, List<byte[]> frames) throws IOException {
        int offset = 0;
        while (offset + 10 <= tag.length) {
            if (tag[offset] == 0) break; // padding
            String id = new String(tag, offset, 4, Charset.forName("ISO-8859-1"));
            if (!id.matches("[A-Z0-9]{4}")) throw new IOException("tag_unsupported");
            int size;
            if (version == 4) {
                size = syncSafe(tag, offset + 4);
            } else {
                size = ((tag[offset + 4] & 0xff) << 24)
                        | ((tag[offset + 5] & 0xff) << 16)
                        | ((tag[offset + 6] & 0xff) << 8)
                        | (tag[offset + 7] & 0xff);
            }
            if (size < 0 || offset + 10L + size > tag.length) throw new IOException("tag_unsupported");
            int total = size + 10;
            if (!"USLT".equals(id) && !"SYLT".equals(id)) {
                byte[] frame = new byte[total];
                System.arraycopy(tag, offset, frame, 0, total);
                frames.add(frame);
            }
            offset += total;
        }
    }

    private static byte[] makeUslt(String text) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(1); // UTF-16 with BOM
        body.write(new byte[]{'e', 'n', 'g'});
        body.write(0xff);
        body.write(0xfe);
        body.write(0);
        body.write(0); // empty descriptor terminator
        body.write(0xff);
        body.write(0xfe);
        body.write(text.getBytes(UTF16LE));
        return body.toByteArray();
    }

    /** ID3 SYLT, milliseconds timestamp format, lyrics content type. */
    private static byte[] makeSylt(String lrc) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(1);
        body.write(new byte[]{'e', 'n', 'g', 1, 1});
        body.write(0xff);
        body.write(0xfe);
        body.write(0);
        body.write(0); // empty descriptor
        int count = 0;
        String[] lines = lrc.split("\\r?\\n");
        for (String line : lines) {
            Matcher matcher = TIMESTAMP.matcher(line);
            List<Long> times = new ArrayList<>();
            int lastEnd = -1;
            while (matcher.find()) {
                long minutes = parseLong(matcher.group(1));
                long seconds = parseLong(matcher.group(2));
                String fraction = matcher.group(3);
                long millis = 0;
                if (fraction != null) {
                    if (fraction.length() == 1) millis = parseLong(fraction) * 100;
                    else if (fraction.length() == 2) millis = parseLong(fraction) * 10;
                    else millis = parseLong(fraction.substring(0, 3));
                }
                times.add((minutes * 60 + seconds) * 1000 + millis);
                lastEnd = matcher.end();
            }
            if (times.isEmpty() || lastEnd < 0) continue;
            String lyric = line.substring(lastEnd).trim();
            if (lyric.length() == 0) continue;
            byte[] encoded = lyric.replace("\u0000", "").getBytes(UTF16LE);
            for (Long time : times) {
                body.write(0xff);
                body.write(0xfe);
                body.write(encoded);
                body.write(0);
                body.write(0); // UTF-16 NUL terminator
                writeInt(body, time.longValue());
                count++;
            }
        }
        return count == 0 ? null : body.toByteArray();
    }

    private static String plainLyrics(String lrc) {
        StringBuilder out = new StringBuilder();
        String[] lines = lrc.split("\\r?\\n");
        for (String line : lines) {
            Matcher matcher = TIMESTAMP.matcher(line);
            String plain = matcher.replaceAll("").trim();
            if (plain.matches("^\\[[A-Za-z]{1,3}:.*\\]$")) continue; // LRC metadata
            if (out.length() > 0) out.append('\n');
            out.append(plain);
        }
        return out.toString();
    }

    private static byte[] makeFrame(String id, byte[] payload, int version) throws IOException {
        ByteArrayOutputStream frame = new ByteArrayOutputStream(payload.length + 10);
        frame.write(id.getBytes(Charset.forName("US-ASCII")));
        frame.write(version == 4 ? toSyncSafe(payload.length) : toBigEndian(payload.length));
        frame.write(0);
        frame.write(0);
        frame.write(payload);
        return frame.toByteArray();
    }

    private static int syncSafe(byte[] bytes, int offset) {
        if (offset + 4 > bytes.length) return -1;
        for (int i = 0; i < 4; i++) if ((bytes[offset + i] & 0x80) != 0) return -1;
        return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14)
                | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
    }

    private static byte[] toSyncSafe(int value) {
        return new byte[]{(byte) ((value >> 21) & 0x7f), (byte) ((value >> 14) & 0x7f),
                (byte) ((value >> 7) & 0x7f), (byte) (value & 0x7f)};
    }

    private static byte[] toBigEndian(int value) {
        return new byte[]{(byte) (value >>> 24), (byte) (value >>> 16), (byte) (value >>> 8), (byte) value};
    }

    private static void writeInt(OutputStream out, long value) throws IOException {
        out.write((byte) (value >>> 24));
        out.write((byte) (value >>> 16));
        out.write((byte) (value >>> 8));
        out.write((byte) value);
    }

    private static long parseLong(String value) {
        try { return Long.parseLong(value); } catch (Exception e) { return 0; }
    }

    private static void copy(InputStream input, OutputStream output) throws IOException {
        if (input == null || output == null) {
            if (input != null) try { input.close(); } catch (Exception ignored) {}
            if (output != null) try { output.close(); } catch (Exception ignored) {}
            throw new IOException("read_failed");
        }
        try {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = input.read(buffer)) != -1) output.write(buffer, 0, n);
            output.flush();
        } finally {
            try { input.close(); } catch (Exception ignored) {}
            try { output.close(); } catch (Exception ignored) {}
        }
    }
}
