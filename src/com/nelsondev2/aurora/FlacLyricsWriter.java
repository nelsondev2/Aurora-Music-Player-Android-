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
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** FLAC Vorbis-comment reader/writer. Rewrites metadata only, never audio frames. */
final class FlacLyricsWriter {
    private static final int MAX_BLOCK = 0xFFFFFF;
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final Pattern TIMESTAMP = Pattern.compile("\\[(\\d{1,3}):(\\d{2})(?:[.:](\\d{1,3}))?\\]");

    private FlacLyricsWriter() {}

    static String read(Context context, Uri uri) throws IOException {
        InputStream in = context.getContentResolver().openInputStream(uri);
        if (in == null) throw new IOException("read_failed");
        try {
            byte[] marker = new byte[4];
            if (readFully(in, marker, 0, 4) != 4 || marker[0] != 'f' || marker[1] != 'L'
                    || marker[2] != 'a' || marker[3] != 'C') return null;
            String lyrics = null;
            boolean last;
            do {
                int header = in.read();
                if (header < 0) throw new IOException("flac_invalid");
                last = (header & 0x80) != 0;
                int type = header & 0x7f;
                byte[] sizeBytes = new byte[3];
                if (readFully(in, sizeBytes, 0, 3) != 3) throw new IOException("flac_invalid");
                int size = readBe24(sizeBytes, 0);
                if (size < 0 || size > MAX_BLOCK) throw new IOException("flac_invalid");
                if (type == 4) {
                    byte[] block = new byte[size];
                    if (readFully(in, block, 0, size) != size) throw new IOException("flac_invalid");
                    String found = findLyrics(block);
                    if (found != null) lyrics = found;
                } else {
                    skipFully(in, size);
                }
            } while (!last);
            return lyrics;
        } finally {
            try { in.close(); } catch (Exception ignored) {}
        }
    }

    static String write(Context context, Uri uri, String lyrics) throws IOException {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) throw new IOException("uri_unavailable");
        String name = displayName(context.getContentResolver(), uri);
        if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".flac")) {
            throw new IOException("format_unsupported");
        }
        ContentResolver resolver = context.getContentResolver();
        android.os.ParcelFileDescriptor probe = null;
        try {
            probe = resolver.openFileDescriptor(uri, "rw");
            if (probe == null) throw new IOException("write_denied");
        } catch (SecurityException | UnsupportedOperationException e) {
            throw new IOException("write_denied");
        } finally {
            if (probe != null) try { probe.close(); } catch (Exception ignored) {}
        }

        File original = File.createTempFile("aurora-flac-original-", ".tmp", context.getCacheDir());
        File rewritten = File.createTempFile("aurora-flac-tagged-", ".tmp", context.getCacheDir());
        try {
            copy(resolver.openInputStream(uri), new FileOutputStream(original));
            rewrite(original, rewritten, lyrics == null ? "" : lyrics);
            try {
                OutputStream output = resolver.openOutputStream(uri, "wt");
                if (output == null) throw new IOException("write_denied");
                copy(new FileInputStream(rewritten), output);
                try { resolver.notifyChange(uri, null); } catch (Exception ignored) {}
            } catch (Exception writeError) {
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

    private static void rewrite(File source, File target, String lyrics) throws IOException {
        RandomAccessFile in = new RandomAccessFile(source, "r");
        FileOutputStream out = new FileOutputStream(target);
        try {
            if (in.length() < 42) throw new IOException("format_unsupported");
            byte[] marker = new byte[4];
            in.readFully(marker);
            if (marker[0] != 'f' || marker[1] != 'L' || marker[2] != 'a' || marker[3] != 'C') {
                throw new IOException("format_unsupported");
            }
            List<Block> blocks = new ArrayList<>();
            boolean last;
            int commentsIndex = -1;
            byte[] commentData = null;
            int index = 0;
            do {
                int header = in.read();
                if (header < 0) throw new IOException("flac_invalid");
                last = (header & 0x80) != 0;
                int type = header & 0x7f;
                byte[] sizeBytes = new byte[3];
                in.readFully(sizeBytes);
                int size = readBe24(sizeBytes, 0);
                if (size < 0 || size > MAX_BLOCK || in.getFilePointer() + size > in.length()) {
                    throw new IOException("flac_invalid");
                }
                byte[] data = new byte[size];
                in.readFully(data);
                if (index == 0 && (type != 0 || size != 34)) throw new IOException("flac_invalid");
                if (type == 4) {
                    if (commentsIndex < 0) {
                        commentsIndex = blocks.size();
                        commentData = data;
                        blocks.add(new Block(type, data));
                    } else {
                        commentData = mergeCommentData(commentData, data);
                    }
                } else {
                    blocks.add(new Block(type, data));
                }
                index++;
            } while (!last);

            if (commentsIndex >= 0) {
                blocks.set(commentsIndex, new Block(4, replaceLyrics(commentData, lyrics)));
            } else {
                byte[] comment = makeCommentBlock(new byte[0], lyrics);
                if (blocks.isEmpty() || blocks.get(0).type != 0) throw new IOException("flac_invalid");
                blocks.add(1, new Block(4, comment));
            }
            if (blocks.isEmpty() || blocks.get(0).type != 0) throw new IOException("flac_invalid");

            out.write(new byte[]{'f', 'L', 'a', 'C'});
            for (int i = 0; i < blocks.size(); i++) {
                Block block = blocks.get(i);
                if (block.data.length > MAX_BLOCK) throw new IOException("lyrics_too_large");
                out.write((byte) ((i == blocks.size() - 1 ? 0x80 : 0) | (block.type & 0x7f)));
                writeBe24(out, block.data.length);
                out.write(block.data);
            }
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            out.flush();
            out.getFD().sync();
        } finally {
            try { in.close(); } catch (Exception ignored) {}
            try { out.close(); } catch (Exception ignored) {}
        }
    }

    private static byte[] mergeCommentData(byte[] first, byte[] extra) throws IOException {
        CommentParts a = parseComments(first);
        CommentParts b = parseComments(extra);
        List<byte[]> all = new ArrayList<>(a.comments);
        appendNonLyrics(all, b.comments);
        return buildComments(a.vendor, all);
    }

    private static void appendNonLyrics(List<byte[]> kept, List<byte[]> comments) {
        for (byte[] comment : comments) {
            String key = commentKey(comment);
            if (!"LYRICS".equalsIgnoreCase(key) && !"SYNCEDLYRICS".equalsIgnoreCase(key)) kept.add(comment);
        }
    }

    private static void appendLyrics(List<byte[]> kept, String lyrics) throws IOException {
        if (lyrics != null && lyrics.trim().length() > 0) {
            kept.add(comment("LYRICS", plainLyrics(lyrics)));
            kept.add(comment("SYNCEDLYRICS", lyrics.trim()));
        }
    }

    private static byte[] replaceLyrics(byte[] original, String lyrics) throws IOException {
        CommentParts parts = parseComments(original);
        List<byte[]> kept = new ArrayList<>();
        for (byte[] comment : parts.comments) {
            String key = commentKey(comment);
            if (!"LYRICS".equalsIgnoreCase(key) && !"SYNCEDLYRICS".equalsIgnoreCase(key)) kept.add(comment);
        }
        appendLyrics(kept, lyrics);
        return buildComments(parts.vendor, kept);
    }

    private static String findLyrics(byte[] block) {
        try {
            CommentParts parts = parseComments(block);
            String plain = null;
            for (byte[] comment : parts.comments) {
                int eq = indexOf(comment, (byte) '=');
                if (eq <= 0) continue;
                String key = new String(comment, 0, eq, UTF8).toUpperCase(Locale.ROOT);
                String value = new String(comment, eq + 1, comment.length - eq - 1, UTF8);
                if ("SYNCEDLYRICS".equals(key)) return value;
                if ("LYRICS".equals(key)) plain = value;
            }
            return plain;
        } catch (Exception e) { return null; }
    }

    private static CommentParts parseComments(byte[] data) throws IOException {
        if (data.length < 8) throw new IOException("flac_invalid");
        int vendorLength = readLe32(data, 0);
        if (vendorLength < 0 || 4L + vendorLength + 4 > data.length) throw new IOException("flac_invalid");
        byte[] vendor = new byte[vendorLength];
        System.arraycopy(data, 4, vendor, 0, vendorLength);
        int pos = 4 + vendorLength;
        int count = readLe32(data, pos);
        pos += 4;
        if (count < 0 || count > 100000) throw new IOException("flac_invalid");
        List<byte[]> comments = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            if (pos + 4 > data.length) throw new IOException("flac_invalid");
            int length = readLe32(data, pos);
            pos += 4;
            if (length < 0 || pos + (long) length > data.length) throw new IOException("flac_invalid");
            byte[] comment = new byte[length];
            System.arraycopy(data, pos, comment, 0, length);
            comments.add(comment);
            pos += length;
        }
        return new CommentParts(vendor, comments);
    }

    private static byte[] buildComments(byte[] vendor, List<byte[]> comments) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeLe32(out, vendor.length);
        out.write(vendor);
        writeLe32(out, comments.size());
        for (byte[] comment : comments) {
            writeLe32(out, comment.length);
            out.write(comment);
        }
        if (out.size() > MAX_BLOCK) throw new IOException("lyrics_too_large");
        return out.toByteArray();
    }

    private static byte[] makeCommentBlock(byte[] vendor, String lyrics) throws IOException {
        if (vendor.length == 0) vendor = "Aurora Music Player".getBytes(UTF8);
        List<byte[]> comments = new ArrayList<>();
        if (lyrics != null && lyrics.trim().length() > 0) {
            comments.add(comment("LYRICS", plainLyrics(lyrics)));
            comments.add(comment("SYNCEDLYRICS", lyrics.trim()));
        }
        return buildComments(vendor, comments);
    }

    private static byte[] comment(String key, String value) throws IOException {
        String clean = (value == null ? "" : value).replace("\u0000", "");
        return (key + "=" + clean).getBytes(UTF8);
    }

    private static String commentKey(byte[] comment) {
        int eq = indexOf(comment, (byte) '=');
        return eq <= 0 ? "" : new String(comment, 0, eq, UTF8);
    }

    private static int indexOf(byte[] data, byte value) {
        for (int i = 0; i < data.length; i++) if (data[i] == value) return i;
        return -1;
    }

    private static String plainLyrics(String lrc) {
        StringBuilder out = new StringBuilder();
        for (String line : lrc.split("\\r?\\n")) {
            Matcher matcher = TIMESTAMP.matcher(line);
            String plain = matcher.replaceAll("").trim();
            if (plain.matches("^\\[[A-Za-z]{1,3}:.*\\]$")) continue;
            if (out.length() > 0) out.append('\n');
            out.append(plain);
        }
        return out.toString();
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

    private static int readFully(InputStream in, byte[] data, int offset, int length) throws IOException {
        int total = 0;
        while (total < length) {
            int n = in.read(data, offset + total, length - total);
            if (n < 0) break;
            if (n == 0) {
                int one = in.read();
                if (one < 0) break;
                data[offset + total++] = (byte) one;
            } else total += n;
        }
        return total;
    }

    private static void skipFully(InputStream in, int amount) throws IOException {
        int left = amount;
        byte[] discard = new byte[8192];
        while (left > 0) {
            int n = in.read(discard, 0, Math.min(discard.length, left));
            if (n < 0) throw new IOException("flac_invalid");
            if (n == 0) { if (in.read() < 0) throw new IOException("flac_invalid"); left--; }
            else left -= n;
        }
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

    private static int readBe24(byte[] bytes, int offset) {
        return ((bytes[offset] & 0xff) << 16) | ((bytes[offset + 1] & 0xff) << 8) | (bytes[offset + 2] & 0xff);
    }

    private static void writeBe24(OutputStream out, int value) throws IOException {
        out.write((value >>> 16) & 0xff);
        out.write((value >>> 8) & 0xff);
        out.write(value & 0xff);
    }

    private static int readLe32(byte[] bytes, int offset) {
        long value = ((long) bytes[offset] & 0xff) | (((long) bytes[offset + 1] & 0xff) << 8)
                | (((long) bytes[offset + 2] & 0xff) << 16) | (((long) bytes[offset + 3] & 0xff) << 24);
        return value > Integer.MAX_VALUE ? -1 : (int) value;
    }

    private static void writeLe32(OutputStream out, int value) throws IOException {
        out.write(value & 0xff);
        out.write((value >>> 8) & 0xff);
        out.write((value >>> 16) & 0xff);
        out.write((value >>> 24) & 0xff);
    }

    private static final class Block {
        final int type;
        final byte[] data;
        Block(int type, byte[] data) { this.type = type; this.data = data; }
    }

    private static final class CommentParts {
        final byte[] vendor;
        final List<byte[]> comments;
        CommentParts(byte[] vendor, List<byte[]> comments) { this.vendor = vendor; this.comments = comments; }
    }
}
