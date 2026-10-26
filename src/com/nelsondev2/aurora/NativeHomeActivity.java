package com.nelsondev2.aurora;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;

/** Primera interfaz nativa de Aurora: biblioteca, listas y reproducción. */
public class NativeHomeActivity extends Activity {

    private static final int REQ_AUDIO = 2201;
    private static final int REQ_BACKUP = 2202;
    private static final int REQ_FILES = 2203;
    private static final int REQ_NOTIFICATIONS = 2204;
    private static final String POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS";
    private static final int BG = Color.rgb(9, 10, 16);
    private static final int SURFACE = Color.rgb(24, 25, 35);
    private static final int TEXT = Color.rgb(245, 245, 250);
    private static final int MUTED = Color.rgb(165, 168, 181);
    private static final int ACCENT = Color.rgb(156, 108, 255);

    private NativeLibraryDatabase database;
    private NativePlayerBridge player;
    private final ArrayList<JSONObject> allTracks = new ArrayList<JSONObject>();
    private final ArrayList<JSONObject> visibleTracks = new ArrayList<JSONObject>();
    private final ArrayList<JSONObject> playlists = new ArrayList<JSONObject>();
    private final ArrayList<JSONObject> playQueue = new ArrayList<JSONObject>();
    private ListView listView;
    private TrackAdapter adapter;
    private EditText search;
    private TextView titleLine;
    private TextView artistLine;
    private TextView elapsedLine;
    private TextView durationLine;
    private Button playButton;
    private SeekBar seekBar;
    private String screen = "library";
    private JSONObject currentTrack;
    private int queueIndex = -1;
    private boolean userSeeking;
    private boolean ticking;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (!ticking) return;
            updatePlayerControls();
            listView.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        database = new NativeLibraryDatabase(this);
        player = new NativePlayerBridge(this);
        buildInterface();
        loadStoredData();
        requestAudioPermission();
        askNotificationPermission();
    }

    private void buildInterface() {
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(16), dp(12), dp(16), dp(8));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setOrientation(LinearLayout.HORIZONTAL);
        TextView brand = text("AURORA", 21, TEXT, true);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(48), 1));
        addHeaderButton(header, "Escanear", new View.OnClickListener() {
            @Override public void onClick(View v) { requestAudioPermission(); }
        });
        addHeaderButton(header, "Importar respaldo", new View.OnClickListener() {
            @Override public void onClick(View v) { chooseBackup(); }
        });
        root.addView(header);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        addTab(tabs, "Música", "library");
        addTab(tabs, "Listas", "playlists");
        addTab(tabs, "+ Lista", "new-playlist");
        addTab(tabs, "+ Audio", "import");
        root.addView(tabs, new LinearLayout.LayoutParams(-1, dp(46)));

        search = new EditText(this);
        search.setSingleLine(true);
        search.setTextColor(TEXT);
        search.setHintTextColor(MUTED);
        search.setHint("Buscar canciones");
        search.setPadding(dp(14), 0, dp(14), 0);
        search.setBackgroundColor(SURFACE);
        root.addView(search, new LinearLayout.LayoutParams(-1, dp(46)));
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { filterTracks(s.toString()); }
            @Override public void afterTextChanged(Editable s) { }
        });

        listView = new ListView(this);
        listView.setDividerHeight(dp(1));
        listView.setDivider(getDrawableColor(0x33ffffff));
        adapter = new TrackAdapter();
        listView.setAdapter(adapter);
        listView.setOnItemClickListener((parent, view, position, id) -> {
            if ("playlists".equals(screen)) openPlaylist(visibleTracks.get(position));
            else playTrack(visibleTracks.get(position));
        });
        listView.setOnItemLongClickListener((parent, view, position, id) -> {
            if ("library".equals(screen)) offerAddToPlaylist(visibleTracks.get(position));
            return true;
        });
        root.addView(listView, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout playerPanel = new LinearLayout(this);
        playerPanel.setOrientation(LinearLayout.VERTICAL);
        playerPanel.setPadding(dp(12), dp(9), dp(12), dp(6));
        playerPanel.setBackgroundColor(SURFACE);
        titleLine = text("Elige una canción", 16, TEXT, true);
        artistLine = text("Tu música se queda en el dispositivo", 13, MUTED, false);
        playerPanel.addView(titleLine);
        playerPanel.addView(artistLine);

        LinearLayout seekRow = new LinearLayout(this);
        seekRow.setGravity(Gravity.CENTER_VERTICAL);
        elapsedLine = text("0:00", 11, MUTED, false);
        durationLine = text("0:00", 11, MUTED, false);
        seekBar = new SeekBar(this);
        seekBar.setMax(1000);
        seekBar.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        seekBar.setThumbTintList(android.content.res.ColorStateList.valueOf(TEXT));
        seekRow.addView(elapsedLine);
        seekRow.addView(seekBar, new LinearLayout.LayoutParams(0, dp(34), 1));
        seekRow.addView(durationLine);
        playerPanel.addView(seekRow);
        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) { }
            @Override public void onStartTrackingTouch(SeekBar bar) { userSeeking = true; }
            @Override public void onStopTrackingTouch(SeekBar bar) {
                userSeeking = false;
                if (currentTrack != null) player.seekTo(bar.getProgress() * player.duration() / 1000.0);
            }
        });

        LinearLayout controls = new LinearLayout(this);
        controls.setGravity(Gravity.CENTER);
        addControl(controls, "Anterior", new View.OnClickListener() {
            @Override public void onClick(View v) { playRelative(-1); }
        });
        playButton = button("Reproducir");
        controls.addView(playButton, new LinearLayout.LayoutParams(0, dp(42), 1));
        playButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { togglePlayback(); }
        });
        addControl(controls, "Siguiente", new View.OnClickListener() {
            @Override public void onClick(View v) { playRelative(1); }
        });
        playerPanel.addView(controls);
        root.addView(playerPanel, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }

    private void loadStoredData() {
        allTracks.clear();
        allTracks.addAll(database.tracks());
        playlists.clear();
        playlists.addAll(database.playlists());
        filterTracks(search == null ? "" : search.getText().toString());
    }

    void requestAudioPermission() {
        if (Build.VERSION.SDK_INT < 23 || hasAudioPermission()) {
            scanDeviceLibrary();
            return;
        }
        try {
            requestPermissions(new String[]{DeviceLibraryBridge.audioPermission()}, REQ_AUDIO);
        } catch (Exception e) {
            Toast.makeText(this, "No se pudo solicitar acceso a la música", Toast.LENGTH_LONG).show();
        }
    }

    private boolean hasAudioPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        try { return checkSelfPermission(DeviceLibraryBridge.audioPermission()) == PackageManager.PERMISSION_GRANTED; }
        catch (Exception e) { return false; }
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            if (checkSelfPermission(POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
            }
        } catch (Exception ignored) { }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == REQ_AUDIO && results != null && results.length > 0
                && results[0] == PackageManager.PERMISSION_GRANTED) scanDeviceLibrary();
    }

    private void scanDeviceLibrary() {
        if (!hasAudioPermission()) return;
        new Thread(new Runnable() {
            @Override public void run() {
                Cursor cursor = null;
                int added = 0;
                try {
                    HashMap<String, JSONObject> byUri = new HashMap<String, JSONObject>();
                    for (JSONObject stored : database.tracks()) {
                        String storedUri = stored.optString("deviceUri", stored.optString("uri", ""));
                        if (storedUri.startsWith("content://")) byUri.put(storedUri, stored);
                    }
                    String[] columns = {MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE,
                            MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM,
                            MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.DISPLAY_NAME,
                            MediaStore.Audio.Media.MIME_TYPE, MediaStore.Audio.Media.ALBUM_ID,
                            MediaStore.Audio.Media.TRACK, MediaStore.Audio.Media.YEAR};
                    cursor = getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                            columns, MediaStore.Audio.Media.IS_MUSIC + "!=0", null,
                            MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC");
                    if (cursor != null) {
                        while (cursor.moveToNext()) {
                            long mediaId = cursor.getLong(0);
                            String uri = ContentUris.withAppendedId(
                                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, mediaId).toString();
                            JSONObject existing = byUri.get(uri);
                            JSONObject track = existing == null ? new JSONObject()
                                    : new JSONObject(existing.toString());
                            track.put("id", existing == null ? "media-" + mediaId
                                    : existing.optString("id", "media-" + mediaId));
                            track.put("deviceId", String.valueOf(mediaId));
                            track.put("title", safeColumn(cursor, 1, "(sin título)"));
                            track.put("artist", safeColumn(cursor, 2, "Artista desconocido"));
                            track.put("album", safeColumn(cursor, 3, ""));
                            track.put("duration", Math.max(0, cursor.getLong(4)));
                            track.put("fileName", safeColumn(cursor, 5, ""));
                            track.put("mime", safeColumn(cursor, 6, "audio/*"));
                            track.put("albumId", cursor.getLong(7));
                            track.put("track", cursor.getInt(8));
                            track.put("year", cursor.getInt(9));
                            track.put("deviceUri", uri);
                            track.put("uri", uri);
                            track.put("_device", true);
                            database.saveTrack(track);
                            byUri.put(uri, track);
                            added++;
                        }
                    }
                } catch (Exception e) {
                    android.util.Log.e("AuroraNative", "falló el escaneo", e);
                } finally {
                    if (cursor != null) cursor.close();
                }
                final int count = added;
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        loadStoredData();
                        Toast.makeText(NativeHomeActivity.this, count + " pistas encontradas", Toast.LENGTH_SHORT).show();
                    }
                });
            }
        }, "aurora-library-scan").start();
    }

    private static String safeColumn(Cursor cursor, int column, String fallback) {
        String value = cursor.getString(column);
        return value == null || value.trim().length() == 0 ? fallback : value;
    }

    private void chooseBackup() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/zip", "application/x-zip-compressed", "application/octet-stream"});
        try { startActivityForResult(intent, REQ_BACKUP); }
        catch (Exception e) { Toast.makeText(this, "No se pudo abrir el selector de respaldos", Toast.LENGTH_LONG).show(); }
    }

    private void chooseAudioFiles() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { startActivityForResult(intent, REQ_FILES); }
        catch (Exception e) { Toast.makeText(this, "No se pudo abrir el selector de audio", Toast.LENGTH_LONG).show(); }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null) return;
        if (requestCode == REQ_BACKUP && data.getData() != null) {
            final Uri uri = data.getData();
            new Thread(new Runnable() {
                @Override public void run() {
                    try {
                        NativeBackupImporter.Result result = NativeBackupImporter.restore(NativeHomeActivity.this, uri);
                        runOnUiThread(new Runnable() {
                            @Override public void run() {
                                loadStoredData();
                                Toast.makeText(NativeHomeActivity.this,
                                        "Restauradas " + result.tracks + " pistas y " + result.playlists + " listas",
                                        Toast.LENGTH_LONG).show();
                            }
                        });
                    } catch (final Exception e) {
                        android.util.Log.e("AuroraNative", "falló la restauración", e);
                        runOnUiThread(new Runnable() {
                            @Override public void run() {
                                Toast.makeText(NativeHomeActivity.this,
                                        "No se pudo restaurar el respaldo: " + e.getMessage(), Toast.LENGTH_LONG).show();
                            }
                        });
                    }
                }
            }, "aurora-backup-import").start();
            return;
        }
        if (requestCode == REQ_FILES) {
            ArrayList<Uri> selected = new ArrayList<Uri>();
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    if (uri != null) selected.add(uri);
                }
            } else if (data.getData() != null) selected.add(data.getData());
            for (Uri uri : selected) {
                try { getContentResolver().takePersistableUriPermission(uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
                addAudioFile(uri);
            }
        }
    }

    private void addAudioFile(final Uri uri) {
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    android.media.MediaMetadataRetriever retriever = new android.media.MediaMetadataRetriever();
                    retriever.setDataSource(NativeHomeActivity.this, uri);
                    JSONObject track = new JSONObject();
                    String id = "file-" + UUID.randomUUID().toString();
                    track.put("id", id);
                    track.put("title", metadata(retriever, android.media.MediaMetadataRetriever.METADATA_KEY_TITLE, "Audio"));
                    track.put("artist", metadata(retriever, android.media.MediaMetadataRetriever.METADATA_KEY_ARTIST, "Artista desconocido"));
                    track.put("album", metadata(retriever, android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM, ""));
                    track.put("duration", parseLong(retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)));
                    track.put("uri", uri.toString());
                    track.put("deviceUri", uri.toString());
                    track.put("fileName", displayName(uri));
                    track.put("mime", getContentResolver().getType(uri));
                    database.saveTrack(track);
                    retriever.release();
                } catch (Exception e) {
                    android.util.Log.w("AuroraNative", "no se pudo importar " + uri, e);
                }
                runOnUiThread(new Runnable() {
                    @Override public void run() { loadStoredData(); }
                });
            }
        }, "aurora-add-audio").start();
    }

    private String displayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(uri, new String[]{"_display_name"}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) { }
        finally { if (cursor != null) cursor.close(); }
        return "audio";
    }

    private static String metadata(android.media.MediaMetadataRetriever retriever, int key, String fallback) {
        String value = retriever.extractMetadata(key);
        return value == null ? fallback : value;
    }

    private static long parseLong(String value) {
        try { return Long.parseLong(value); } catch (Exception e) { return 0; }
    }

    private void filterTracks(String query) {
        visibleTracks.clear();
        if ("playlists".equals(screen)) {
            visibleTracks.addAll(playlists);
        } else if ("playlist-detail".equals(screen)) {
            visibleTracks.addAll(playQueue);
        } else {
            String q = query == null ? "" : query.trim().toLowerCase(java.util.Locale.getDefault());
            for (JSONObject track : allTracks) {
                String haystack = track.optString("title", "") + " "
                        + track.optString("artist", "") + " " + track.optString("album", "");
                if (q.length() == 0 || haystack.toLowerCase(java.util.Locale.getDefault()).contains(q)) {
                    visibleTracks.add(track);
                }
            }
        }
        if (adapter != null) adapter.notifyDataSetChanged();
    }

    private void addTab(LinearLayout tabs, String label, final String destination) {
        Button tab = button(label);
        tabs.addView(tab, new LinearLayout.LayoutParams(0, dp(42), 1));
        tab.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if ("import".equals(destination)) { chooseAudioFiles(); return; }
                if ("new-playlist".equals(destination)) { createPlaylist(); return; }
                screen = destination;
                if ("library".equals(screen)) search.setVisibility(View.VISIBLE);
                else search.setVisibility(View.GONE);
                filterTracks(search.getText().toString());
            }
        });
    }

    private void addHeaderButton(LinearLayout parent, String label, View.OnClickListener listener) {
        Button b = button(label);
        b.setTextSize(11);
        parent.addView(b, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)));
        b.setOnClickListener(listener);
    }

    private void addControl(LinearLayout parent, String label, View.OnClickListener listener) {
        Button b = button(label);
        parent.addView(b, new LinearLayout.LayoutParams(0, dp(42), 1));
        b.setOnClickListener(listener);
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(TEXT);
        b.setAllCaps(false);
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(SURFACE));
        return b;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(size);
        t.setTextColor(color);
        if (bold) t.setTypeface(null, android.graphics.Typeface.BOLD);
        return t;
    }

    private android.graphics.drawable.Drawable getDrawableColor(int color) {
        android.graphics.drawable.ColorDrawable drawable = new android.graphics.drawable.ColorDrawable(color);
        return drawable;
    }

    private int dp(float value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }

    private void playTrack(JSONObject track) {
        if (track == null) return;
        currentTrack = track;
        int found = indexOfId(playQueue, track.optString("id", ""));
        if (found < 0) {
            playQueue.clear();
            playQueue.addAll(allTracks);
            found = indexOfId(playQueue, track.optString("id", ""));
        }
        queueIndex = Math.max(0, found);
        syncNativeQueue();
        PlaybackService.ensureRunning(this);
        String id = track.optString("id", "");
        boolean started;
        String localUri = track.optString("localAudioUri", "");
        if (localUri.length() > 0) started = player.playUri(id, localUri, 0);
        else if (new NativeAudioStore(this).has(id)) started = player.play(id, 0);
        else {
            String uri = track.optString("deviceUri", track.optString("uri", ""));
            started = uri.startsWith("content://") && player.playUri(id, uri, 0);
        }
        if (!started) {
            Toast.makeText(this, "No se pudo abrir el audio. Revisa el permiso del archivo.", Toast.LENGTH_LONG).show();
            PlaybackService.update(track.optString("title", ""), track.optString("artist", ""),
                    track.optString("album", ""), false, track.optLong("duration", 0), 0);
            updatePlayerControls();
            return;
        }
        PlaybackService.update(track.optString("title", ""), track.optString("artist", ""),
                track.optString("album", ""), true, track.optLong("duration", 0), 0);
        updatePlayerControls();
    }

    private void syncNativeQueue() {
        JSONArray tracks = new JSONArray();
        for (JSONObject item : playQueue) {
            JSONObject row = new JSONObject();
            try {
                row.put("id", item.optString("id", ""));
                row.put("title", item.optString("title", ""));
                row.put("artist", item.optString("artist", ""));
                row.put("album", item.optString("album", ""));
                row.put("duration", item.optLong("duration", 0));
                row.put("uri", item.optString("localAudioUri",
                        item.optString("deviceUri", item.optString("uri", ""))));
                tracks.put(row);
            } catch (Exception ignored) { }
        }
        JSONObject queue = new JSONObject();
        try { queue.put("repeat", "off"); queue.put("tracks", tracks); } catch (Exception ignored) { }
        player.queueSet(queue.toString(), queueIndex);
    }

    private void togglePlayback() {
        if (currentTrack == null) {
            if (!allTracks.isEmpty()) playTrack(allTracks.get(0));
            return;
        }
        if (player.isPlaying()) {
            player.pause();
            PlaybackService.update(currentTrack.optString("title", ""), currentTrack.optString("artist", ""),
                    currentTrack.optString("album", ""), false, player.duration(), player.position());
        } else {
            if (currentTrack.optString("localAudioUri", "").length() > 0
                    || new NativeAudioStore(this).has(currentTrack.optString("id", ""))) {
                player.resume();
            } else {
                String uri = currentTrack.optString("deviceUri", currentTrack.optString("uri", ""));
                player.playUri(currentTrack.optString("id", ""), uri, player.position());
            }
            PlaybackService.ensureRunning(this);
            PlaybackService.update(currentTrack.optString("title", ""), currentTrack.optString("artist", ""),
                    currentTrack.optString("album", ""), true, player.duration(), player.position());
        }
        updatePlayerControls();
    }

    private void playRelative(int direction) {
        if (playQueue.isEmpty()) {
            if (allTracks.isEmpty()) return;
            playQueue.addAll(allTracks);
            queueIndex = 0;
        }
        int next = queueIndex + direction;
        if (next < 0 || next >= playQueue.size()) return;
        queueIndex = next;
        playTrack(playQueue.get(queueIndex));
    }

    private void syncCurrentTrack() {
        try {
            String id = new JSONObject(player.snapshot()).optString("trackId", "");
            if (id.length() == 0 || (currentTrack != null && id.equals(currentTrack.optString("id")))) return;
            int queued = indexOfId(playQueue, id);
            int index = queued >= 0 ? queued : indexOfId(allTracks, id);
            if (index >= 0) {
                currentTrack = queued >= 0 ? playQueue.get(queued) : allTracks.get(index);
                if (queued >= 0) queueIndex = queued;
            }
        } catch (Exception ignored) {}
    }

    private void updatePlayerControls() {
        syncCurrentTrack();
        if (currentTrack != null) {
            titleLine.setText(currentTrack.optString("title", "(sin título)"));
            artistLine.setText(currentTrack.optString("artist", "Artista desconocido")
                    + (currentTrack.optString("album", "").length() > 0
                    ? " · " + currentTrack.optString("album", "") : ""));
            boolean playing = player.isPlaying();
            playButton.setText(playing ? "Pausar" : "Reproducir");
            long duration = Math.max(0L, Math.round(player.duration()));
            long position = Math.max(0L, Math.round(player.position()));
            if (!userSeeking) seekBar.setProgress(duration > 0 ? (int) Math.min(1000, position * 1000 / duration) : 0);
            elapsedLine.setText(time(position));
            durationLine.setText(time(duration));
        } else {
            playButton.setText("Reproducir");
        }
    }

    private static String time(long millis) {
        long seconds = Math.max(0, millis / 1000);
        return (seconds / 60) + ":" + (seconds % 60 < 10 ? "0" : "") + (seconds % 60);
    }

    private int indexOfId(List<JSONObject> tracks, String id) {
        for (int i = 0; i < tracks.size(); i++) if (id.equals(tracks.get(i).optString("id"))) return i;
        return -1;
    }

    private void createPlaylist() {
        createPlaylist(null);
    }

    private void createPlaylist(final JSONObject firstTrack) {
        final EditText input = new EditText(this);
        input.setHint("Nombre de la lista");
        new AlertDialog.Builder(this).setTitle("Nueva lista").setView(input)
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Crear", (dialog, which) -> {
                    String name = input.getText().toString().trim();
                    if (name.length() == 0) return;
                    try {
                        JSONObject playlist = new JSONObject();
                        playlist.put("id", "pl-" + UUID.randomUUID().toString());
                        playlist.put("name", name);
                        JSONArray initialTracks = new JSONArray();
                        if (firstTrack != null) initialTracks.put(firstTrack.optString("id", ""));
                        playlist.put("trackIds", initialTracks);
                        playlist.put("createdAt", System.currentTimeMillis());
                        database.savePlaylist(playlist);
                        loadStoredData();
                        screen = "playlists";
                        filterTracks("");
                    } catch (Exception ignored) { }
                }).show();
    }

    private void openPlaylist(JSONObject playlist) {
        if (playlist == null) return;
        if ("playlist-detail".equals(screen)) {
            screen = "playlists";
            filterTracks("");
            return;
        }
        JSONArray ids = playlist.optJSONArray("trackIds");
        playQueue.clear();
        if (ids != null) {
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i, "");
                int index = indexOfId(allTracks, id);
                if (index >= 0) playQueue.add(allTracks.get(index));
            }
        }
        screen = "playlist-detail";
        filterTracks("");
        if (playQueue.isEmpty()) Toast.makeText(this, "La lista todavía está vacía", Toast.LENGTH_SHORT).show();
    }

    private void offerAddToPlaylist(final JSONObject track) {
        if (playlists.isEmpty()) { createPlaylist(track); return; }
        String[] names = new String[playlists.size()];
        for (int i = 0; i < playlists.size(); i++) names[i] = playlists.get(i).optString("name", "Lista");
        new AlertDialog.Builder(this).setTitle("Añadir a una lista").setItems(names, (dialog, which) -> {
            JSONObject playlist = playlists.get(which);
            JSONArray ids = playlist.optJSONArray("trackIds");
            if (ids == null) ids = new JSONArray();
            boolean exists = false;
            for (int i = 0; i < ids.length(); i++) if (track.optString("id").equals(ids.optString(i))) exists = true;
            if (!exists) ids.put(track.optString("id"));
            try { playlist.put("trackIds", ids); database.savePlaylist(playlist); loadStoredData(); }
            catch (Exception ignored) { }
            Toast.makeText(this, exists ? "La pista ya está en la lista" : "Añadida a " + playlist.optString("name"), Toast.LENGTH_SHORT).show();
        }).show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        ticking = true;
        listView.post(ticker);
    }

    @Override
    protected void onPause() {
        ticking = false;
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if ("playlist-detail".equals(screen)) {
            screen = "playlists";
            filterTracks("");
        } else if (!"library".equals(screen)) {
            screen = "library";
            search.setVisibility(View.VISIBLE);
            filterTracks("");
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (database != null) database.close();
        super.onDestroy();
    }

    private final class TrackAdapter extends BaseAdapter {
        @Override public int getCount() { return visibleTracks.size(); }
        @Override public Object getItem(int position) { return visibleTracks.get(position); }
        @Override public long getItemId(int position) { return position; }
        @Override public View getView(int position, View convertView, ViewGroup parent) {
            LinearLayout row = convertView instanceof LinearLayout ? (LinearLayout) convertView : new LinearLayout(NativeHomeActivity.this);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setPadding(dp(12), dp(9), dp(8), dp(9));
            row.removeAllViews();
            JSONObject item = visibleTracks.get(position);
            String title;
            String subtitle;
            if ("playlists".equals(screen)) {
                title = item.optString("name", "Lista");
                JSONArray ids = item.optJSONArray("trackIds");
                subtitle = (ids == null ? 0 : ids.length()) + " pistas · toca para abrir";
            } else {
                title = item.optString("title", "(sin título)");
                subtitle = item.optString("artist", "Artista desconocido");
                if (item.optString("album", "").length() > 0) subtitle += " · " + item.optString("album");
            }
            row.addView(text(title, 15, TEXT, true));
            row.addView(text(subtitle, 12, MUTED, false));
            return row;
        }
    }
}
