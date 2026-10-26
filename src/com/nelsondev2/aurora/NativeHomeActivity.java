package com.nelsondev2.aurora;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.BitmapFactory;
import android.media.audiofx.Visualizer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.provider.MediaStore;
import android.text.Editable;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextWatcher;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.util.Base64;
import android.view.Gravity;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Primera interfaz nativa de Aurora: biblioteca, listas y reproducción. */
public class NativeHomeActivity extends Activity {

    private static final int REQ_AUDIO = 2201;
    private static final int REQ_BACKUP = 2202;
    private static final int REQ_FILES = 2203;
    private static final int REQ_NOTIFICATIONS = 2204;
    private static final int REQ_LYRICS = 2205;
    private static final int REQ_RECORD_AUDIO = 2206;
    private static final int REQ_EXPORT_BACKUP = 2207;
    private static final String POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS";
    private int BG = Color.rgb(9, 10, 16);
    private int SURFACE = Color.rgb(24, 25, 35);
    private int TEXT = Color.rgb(245, 245, 250);
    private int MUTED = Color.rgb(165, 168, 181);
    private int ACCENT = Color.rgb(156, 108, 255);

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
    private ImageView coverImage;
    private String displayedCoverId = "";
    private TextView elapsedLine;
    private TextView durationLine;
    private Button playButton;
    private SeekBar seekBar;
    private String screen = "library";
    private String screenBeforeLyrics = "library";
    private JSONObject currentTrack;
    private int queueIndex = -1;
    private boolean userSeeking;
    private boolean ticking;
    private boolean shuffleEnabled;
    private String repeatMode = "off";
    private float playbackRate = 1f;
    private long loopStartMs = -1;
    private long loopEndMs = -1;
    private long lyricsLoopStartMs = -1;
    private long lyricsLoopEndMs = -1;
    private long lyricsOffsetMs;
    private int lyricsFontSize = 23;
    private int lastLyricsIndex = -2;
    private int originalSystemUiVisibility;
    private String themeName = "dark";
    private String languageCode = "es";
    private final Set<String> favorites = new HashSet<String>();
    private ArrayList<JSONObject> originalQueue;
    private String currentPlaylistId;
    private String currentScreen = "library";
    private JSONObject savedSession;
    private LinearLayout rootView;
    private Button shuffleButton;
    private Button repeatButton;
    private Button abButton;
    private Button favoriteButton;
    private Button lyricsButton;
    private NativeVisualizerView visualizerView;
    private Visualizer visualizer;
    private boolean visualizerEnabled;
    private ScrollView lyricsScroll;
    private LinearLayout lyricsTools;
    private TextView lyricsText;
    private ArrayList<NativeLyrics.Line> currentLyrics = new ArrayList<NativeLyrics.Line>();
    private Handler uiHandler = new Handler();
    private final Runnable lyricTicker = new Runnable() {
        @Override public void run() {
            if (lyricsScroll != null && lyricsScroll.getVisibility() == View.VISIBLE) {
                updateLyricsHighlight();
                uiHandler.postDelayed(this, 250);
            }
        }
    };

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (!ticking) return;
            updatePlayerControls();
            enforceAbRepeat();
            enforceLyricsLoop();
            if (visualizerEnabled && visualizer == null && player.isPlaying()) startVisualizer();
            listView.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        database = new NativeLibraryDatabase(this);
        player = new NativePlayerBridge(this);
        NativeText.load(this);
        loadPreferences();
        applyThemeColors();
        buildInterface();
        loadStoredData();
        requestAudioPermission();
        askNotificationPermission();
    }

    private void loadPreferences() {
        String storedLanguage = database.setting("language", null);
        if (storedLanguage == null) storedLanguage = database.setting("local:aurora_lang", "es");
        languageCode = storedLanguage == null ? "es" : storedLanguage;
        boolean knownLanguage = false;
        org.json.JSONArray languageList = NativeText.languages(this);
        for (int i = 0; i < languageList.length(); i++) {
            JSONObject item = languageList.optJSONObject(i);
            if (item != null && languageCode.equals(item.optString("code"))) knownLanguage = true;
        }
        if (!knownLanguage) languageCode = "es";
        NativeText.setLanguage(languageCode);
        themeName = database.setting("theme", database.setting("local:aurora_theme", "dark"));
        if (!"light".equals(themeName) && !"amoled".equals(themeName)) themeName = "dark";
        String accentName = database.setting("accent", "aurora");
        if ("ocean".equals(accentName)) ACCENT = Color.rgb(76, 198, 230);
        else if ("moss".equals(accentName)) ACCENT = Color.rgb(130, 196, 116);
        else if ("amber".equals(accentName)) ACCENT = Color.rgb(245, 181, 66);
        else if ("cherry".equals(accentName)) ACCENT = Color.rgb(239, 93, 127);
        else if ("fuchsia".equals(accentName)) ACCENT = Color.rgb(235, 74, 190);
        Object saved = database.settingValue("favorites", null);
        if (saved instanceof JSONArray) {
            JSONArray array = (JSONArray) saved;
            for (int i = 0; i < array.length(); i++) favorites.add(array.optString(i));
        }
        shuffleEnabled = "true".equals(database.setting("native.shuffle", "false"));
        repeatMode = database.setting("native.repeat", "off");
        if (!"all".equals(repeatMode) && !"one".equals(repeatMode)) repeatMode = "off";
        try { playbackRate = Math.max(0.5f, Math.min(2f, Float.parseFloat(database.setting("native.playback.rate", "1")))); }
        catch (Exception ignored) { playbackRate = 1f; }
        visualizerEnabled = "true".equals(database.setting("native.visualizer", "false"));
        try { lyricsFontSize = Math.max(12, Math.min(32, Integer.parseInt(database.setting("native.lyrics.font", "23")))); }
        catch (Exception ignored) { lyricsFontSize = 23; }
        originalSystemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
        boolean eqOn = "true".equals(database.setting("native.eq.enabled", "false"));
        Object levelValue = database.settingValue("native.eq.levels", null);
        short[] levels = null;
        if (levelValue instanceof JSONArray) {
            JSONArray array = (JSONArray) levelValue;
            levels = new short[array.length()];
            for (int i = 0; i < array.length(); i++) levels[i] = (short) array.optInt(i, 0);
        }
        NativeEqualizerEngine.configure(eqOn, levels);
        Object session = database.settingValue("local:aurora_session_v1", null);
        if (session instanceof JSONObject) savedSession = (JSONObject) session;
    }

    private void applyThemeColors() {
        if ("light".equals(themeName)) {
            BG = Color.rgb(246, 245, 250);
            SURFACE = Color.WHITE;
            TEXT = Color.rgb(28, 28, 38);
            MUTED = Color.rgb(100, 101, 113);
        } else if ("amoled".equals(themeName)) {
            BG = Color.BLACK;
            SURFACE = Color.rgb(10, 10, 12);
            TEXT = Color.rgb(245, 245, 250);
            MUTED = Color.rgb(155, 157, 170);
        } else {
            BG = Color.rgb(9, 10, 16);
            SURFACE = Color.rgb(24, 25, 35);
            TEXT = Color.rgb(245, 245, 250);
            MUTED = Color.rgb(165, 168, 181);
        }
    }

    private String tr(String key) { return NativeText.text(this, key); }

    private void showMoreMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, tr("nav_favorites"));
        menu.getMenu().add(0, 2, 1, tr("rated_title"));
        menu.getMenu().add(0, 3, 2, tr("stats_title"));
        menu.getMenu().add(0, 4, 3, tr("lyrics"));
        menu.getMenu().add(0, 5, 4, tr("options_title"));
        menu.getMenu().add(0, 6, 5, tr("backup_import"));
        menu.getMenu().add(0, 7, 6, tr("queue"));
        menu.setOnMenuItemClickListener(new PopupMenu.OnMenuItemClickListener() {
            @Override public boolean onMenuItemClick(MenuItem item) {
                switch (item.getItemId()) {
                    case 1: showTrackScreen("favorites"); return true;
                    case 2: showTrackScreen("rated"); return true;
                    case 3: showStatistics(); return true;
                    case 4: showLyrics(); return true;
                    case 5: showSettings(); return true;
                    case 6: chooseBackup(); return true;
                    case 7: showQueue(); return true;
                    default: return false;
                }
            }
        });
        menu.show();
    }

    private void showQueue() {
        if (playQueue.isEmpty()) {
            Toast.makeText(this, tr("no_tracks_loaded"), Toast.LENGTH_SHORT).show();
            return;
        }
        final ArrayList<String> labels = new ArrayList<String>();
        for (int i = 0; i < playQueue.size(); i++) {
            JSONObject track = playQueue.get(i);
            labels.add((i == queueIndex ? "▶  " : "") + track.optString("title", "Audio")
                    + " · " + track.optString("artist", tr("unknown_artist")));
        }
        final ListView queueList = new ListView(this);
        final AlertDialog[] dialogRef = new AlertDialog[1];
        queueList.setAdapter(new android.widget.ArrayAdapter<String>(this,
                android.R.layout.simple_list_item_1, labels));
        queueList.setOnItemClickListener(new android.widget.AdapterView.OnItemClickListener() {
            @Override public void onItemClick(android.widget.AdapterView<?> parent, View view, int position, long id) {
                if (position >= 0 && position < playQueue.size()) {
                    JSONObject chosen = playQueue.get(position);
                    if (dialogRef[0] != null) dialogRef[0].dismiss();
                    playTrack(chosen);
                }
            }
        });
        queueList.setOnItemLongClickListener(new android.widget.AdapterView.OnItemLongClickListener() {
            @Override public boolean onItemLongClick(android.widget.AdapterView<?> parent, View view, int position, long id) {
                if (position == queueIndex) {
                    Toast.makeText(NativeHomeActivity.this, tr("queue_current_cannot_remove"), Toast.LENGTH_SHORT).show();
                    return true;
                }
                if (position >= 0 && position < playQueue.size()) {
                    String removedId = playQueue.get(position).optString("id", "");
                    playQueue.remove(position);
                    if (position < queueIndex) queueIndex--;
                    if (originalQueue != null) {
                        for (int i = originalQueue.size() - 1; i >= 0; i--) {
                            if (originalQueue.get(i).optString("id").equals(removedId)) originalQueue.remove(i);
                        }
                    }
                    syncNativeQueue();
                    Toast.makeText(NativeHomeActivity.this, tr("queue_item_removed"), Toast.LENGTH_SHORT).show();
                    if (dialogRef[0] != null) dialogRef[0].dismiss();
                    showQueue();
                }
                return true;
            }
        });
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.addView(queueList, new LinearLayout.LayoutParams(-1, dp(300)));
        LinearLayout actions = new LinearLayout(this);
        Button save = button(tr("save_playlist"));
        Button clear = button(tr("clear_btn"));
        actions.addView(save, new LinearLayout.LayoutParams(0, dp(44), 1));
        actions.addView(clear, new LinearLayout.LayoutParams(0, dp(44), 1));
        container.addView(actions);
        final AlertDialog dialog = new AlertDialog.Builder(this).setTitle(tr("queue_title"))
                .setView(container).setNegativeButton(tr("close_btn"), null).create();
        dialogRef[0] = dialog;
        save.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { dialog.dismiss(); saveQueueAsPlaylist(); }
        });
        clear.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { dialog.dismiss(); clearQueue(); }
        });
        dialog.show();
    }

    private void clearQueue() {
        if (playQueue.isEmpty()) return;
        JSONObject playing = currentTrack;
        playQueue.clear();
        if (playing != null) {
            playQueue.add(playing);
            queueIndex = 0;
        } else queueIndex = -1;
        originalQueue = null;
        syncNativeQueue();
        Toast.makeText(this, tr("queue_cleared"), Toast.LENGTH_SHORT).show();
    }

    private void saveQueueAsPlaylist() {
        if (playQueue.isEmpty()) return;
        final EditText input = new EditText(this);
        input.setHint(tr("new_playlist"));
        new AlertDialog.Builder(this).setTitle(tr("save_playlist")).setView(input)
                .setNegativeButton(tr("close_btn"), null)
                .setPositiveButton(tr("save_playlist"), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        String name = input.getText().toString().trim();
                        if (name.length() == 0) return;
                        try {
                            JSONObject playlist = new JSONObject();
                            playlist.put("id", "pl-" + UUID.randomUUID().toString());
                            playlist.put("name", name);
                            JSONArray ids = new JSONArray();
                            for (JSONObject track : playQueue) ids.put(track.optString("id", ""));
                            playlist.put("trackIds", ids);
                            playlist.put("sort", "queue");
                            playlist.put("createdAt", System.currentTimeMillis());
                            database.savePlaylist(playlist);
                            loadStoredData();
                            Toast.makeText(NativeHomeActivity.this, tr("queue_saved_playlist"), Toast.LENGTH_SHORT).show();
                        } catch (Exception ignored) { }
                    }
                }).show();
    }

    private void showTrackScreen(String destination) {
        screen = destination;
        search.setVisibility(View.VISIBLE);
        lyricsScroll.setVisibility(View.GONE);
        listView.setVisibility(View.VISIBLE);
        filterTracks(search.getText().toString());
    }

    private void showSettings() {
        final String[] items = {tr("themes_title"), tr("accent_section"), tr("language_title"),
                tr("sleep"), tr("playback_rate"), tr("equalizer"), tr("visualizer"),
                tr("import_lyrics_btn"), tr("backup_export"), tr("stats_title")};
        new AlertDialog.Builder(this).setTitle(tr("options_title")).setItems(items,
                new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        switch (which) {
                            case 0: chooseTheme(); break;
                            case 1: chooseAccent(); break;
                            case 2: chooseLanguage(); break;
                            case 3: showSleepTimer(); break;
                            case 4: choosePlaybackRate(); break;
                            case 5: showEqualizer(); break;
                            case 6: toggleVisualizer(); break;
                            case 7: chooseLyricsFile(); break;
                            case 8: chooseBackupDestination(); break;
                            case 9: showStatistics(); break;
                        }
                    }
                }).show();
    }

    private void chooseTheme() {
        final String[] names = {tr("theme_dark"), tr("theme_light"), tr("theme_amoled")};
        new AlertDialog.Builder(this).setTitle(tr("theme_section")).setItems(names,
                new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        themeName = which == 1 ? "light" : (which == 2 ? "amoled" : "dark");
                        database.saveSetting("theme", themeName);
                        recreate();
                    }
                }).show();
    }

    private void chooseAccent() {
        final String[] labels = {tr("accent_aurora"), tr("accent_ocean"), tr("accent_moss"),
                tr("accent_amber"), tr("accent_cherry"), tr("accent_fuchsia")};
        final String[] values = {"aurora", "ocean", "moss", "amber", "cherry", "fuchsia"};
        new AlertDialog.Builder(this).setTitle(tr("accent_section")).setItems(labels,
                new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        database.saveSetting("accent", values[which]);
                        recreate();
                    }
                }).show();
    }

    private void chooseLanguage() {
        final JSONArray available = NativeText.languages(this);
        final String[] labels = new String[available.length()];
        final String[] codes = new String[available.length()];
        int selected = 0;
        for (int i = 0; i < available.length(); i++) {
            JSONObject language = available.optJSONObject(i);
            if (language == null) continue;
            labels[i] = language.optString("name", language.optString("code"));
            codes[i] = language.optString("code", "es");
            if (languageCode.equals(codes[i])) selected = i;
        }
        new AlertDialog.Builder(this).setTitle(tr("language_title")).setSingleChoiceItems(labels, selected,
                new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        languageCode = codes[which];
                        NativeText.setLanguage(languageCode);
                        database.saveSetting("language", languageCode);
                        database.saveSetting("local:aurora_lang", languageCode);
                        dialog.dismiss();
                        recreate();
                    }
                }).setNegativeButton(tr("close_btn"), null).show();
    }

    private void showSleepTimer() {
        final String[] options = {"15 min", "30 min", "45 min", "60 min", tr("sleep_end_of_track"), tr("cancel_timer")};
        new AlertDialog.Builder(this).setTitle(tr("sleep")).setMessage(tr("sleep_hint"))
                .setItems(options, new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        boolean ok;
                        if (which == 4) ok = PlaybackService.sleepAtTrackEnd();
                        else if (which == 5) { PlaybackService.cancelSleepTimer(); ok = true; }
                        else ok = PlaybackService.startSleepTimer((which + 1) * 15);
                        if (!ok) Toast.makeText(NativeHomeActivity.this,
                                "Inicia una canción antes de activar el temporizador", Toast.LENGTH_LONG).show();
                        else Toast.makeText(NativeHomeActivity.this,
                                which == 5 ? tr("cancel_timer") : options[which], Toast.LENGTH_SHORT).show();
                    }
                }).show();
    }

    private void choosePlaybackRate() {
        final float[] rates = {0.75f, 0.9f, 1f, 1.1f, 1.25f, 1.5f, 2f};
        final String[] labels = {"0.75×", "0.90×", "1.00×", "1.10×", "1.25×", "1.50×", "2.00×"};
        int selected = 2;
        for (int i = 0; i < rates.length; i++) if (Math.abs(playbackRate - rates[i]) < 0.01f) selected = i;
        new AlertDialog.Builder(this).setTitle(tr("playback_rate"))
                .setSingleChoiceItems(labels, selected, new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        playbackRate = rates[which];
                        database.saveSetting("native.playback.rate", String.valueOf(playbackRate));
                        player.setRate(playbackRate);
                        dialog.dismiss();
                    }
                }).setNegativeButton(tr("close_btn"), null).show();
    }

    private void showEqualizer() {
        if (currentTrack == null || !player.isPlaying()) {
            Toast.makeText(this, "Reproduce una pista para activar el ecualizador", Toast.LENGTH_LONG).show();
            return;
        }
        int session = NativePlayerBridge.audioSessionId(this);
        NativeEqualizerEngine.attach(this, session);
        final String[] presets = {tr("eq_normal"), tr("eq_bass"), tr("eq_vocal"), tr("eq_treble"), tr("eq_live"), tr("close_btn")};
        new AlertDialog.Builder(this).setTitle(tr("equalizer")).setItems(presets,
                new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        if (which == 5) return;
                        applyEqualizerPreset(which);
                    }
                }).show();
    }

    private void applyEqualizerPreset(int preset) {
        int bands = NativeEqualizerEngine.numberOfBands();
        short[] range = NativeEqualizerEngine.range();
        short[] levels = new short[bands];
        for (int i = 0; i < bands; i++) {
            int hz = NativeEqualizerEngine.centerFrequency(i);
            int db = 0;
            if (preset == 1) db = hz < 250 ? 700 : (hz < 500 ? 350 : 0);
            else if (preset == 2) db = hz >= 500 && hz <= 3000 ? 350 : 0;
            else if (preset == 3) db = hz >= 4000 ? 600 : 0;
            else if (preset == 4) db = hz < 150 ? 300 : (hz > 7000 ? 250 : 100);
            if (preset == 0) db = 0;
            levels[i] = (short) Math.max(range[0], Math.min(range[1], db));
        }
        boolean enabled = preset != 5;
        NativeEqualizerEngine.configure(enabled, levels);
        JSONArray array = new JSONArray();
        for (short level : levels) array.put(level);
        database.saveSetting("native.eq.enabled", String.valueOf(enabled));
        database.saveSetting("native.eq.levels", array);
        Toast.makeText(this, tr("equalizer") + ": " + (enabled ? "✓" : tr("close_btn")), Toast.LENGTH_SHORT).show();
    }

    private void toggleVisualizer() {
        if (visualizerEnabled) {
            visualizerEnabled = false;
            database.saveSetting("native.visualizer", "false");
            stopVisualizer();
        } else if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission("android.permission.RECORD_AUDIO") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.RECORD_AUDIO"}, REQ_RECORD_AUDIO);
        } else {
            visualizerEnabled = true;
            database.saveSetting("native.visualizer", "true");
            startVisualizer();
        }
    }

    private void startVisualizer() {
        stopVisualizer();
        if (!visualizerEnabled || !player.isPlaying()) return;
        try {
            int session = NativePlayerBridge.audioSessionId(this);
            int[] range = Visualizer.getCaptureSizeRange();
            visualizer = new Visualizer(session);
            visualizer.setCaptureSize(range[1]);
            visualizer.setDataCaptureListener(new Visualizer.OnDataCaptureListener() {
                @Override public void onWaveFormDataCapture(Visualizer v, byte[] data, int rate) {
                    if (visualizerView != null) visualizerView.setWaveform(data);
                }
                @Override public void onFftDataCapture(Visualizer v, byte[] data, int rate) { }
            }, Visualizer.getMaxCaptureRate() / 2, true, false);
            visualizer.setEnabled(true);
            visualizerView.setVisibility(View.VISIBLE);
        } catch (Exception e) {
            visualizerEnabled = false;
            database.saveSetting("native.visualizer", "false");
            stopVisualizer();
            Toast.makeText(this, "El dispositivo no permite el visualizador", Toast.LENGTH_LONG).show();
        }
    }

    private void stopVisualizer() {
        if (visualizer != null) {
            try { visualizer.setEnabled(false); visualizer.release(); } catch (Exception ignored) { }
            visualizer = null;
        }
        if (visualizerView != null) {
            visualizerView.setWaveform(null);
            visualizerView.setVisibility(View.GONE);
        }
    }

    private void showStatistics() {
        Object value = database.settingValue("stats", null);
        JSONObject stats = value instanceof JSONObject ? (JSONObject) value : new JSONObject();
        JSONObject plays = stats.optJSONObject("plays");
        ArrayList<JSONObject> ranked = new ArrayList<JSONObject>(allTracks);
        Collections.sort(ranked, new Comparator<JSONObject>() {
            @Override public int compare(JSONObject a, JSONObject b) {
                return Integer.compare(playsCount(stats.optJSONObject("plays"), b.optString("id")),
                        playsCount(stats.optJSONObject("plays"), a.optString("id")));
            }
        });
        int totalPlays = 0;
        if (plays != null) {
            java.util.Iterator<String> keys = plays.keys();
            while (keys.hasNext()) totalPlays += plays.optInt(keys.next(), 0);
        }
        StringBuilder summary = new StringBuilder();
        summary.append(tr("stats_plays")).append(": ").append(totalPlays).append('\n');
        summary.append(tr("stats_listening_time")).append(": ").append(time(stats.optLong("totalSeconds", 0) * 1000)).append('\n');
        summary.append(tr("all_tracks_section")).append(": ").append(allTracks.size()).append("\n\n");
        summary.append(tr("stats_top_tracks")).append('\n');
        for (int i = 0; i < Math.min(5, ranked.size()); i++) {
            JSONObject track = ranked.get(i);
            int count = playsCount(plays, track.optString("id"));
            if (count <= 0) break;
            summary.append(i + 1).append(". ").append(track.optString("title", "Audio"))
                    .append(" — ").append(count).append('\n');
        }
        new AlertDialog.Builder(this).setTitle(tr("stats_title")).setMessage(summary.toString())
                .setPositiveButton(tr("close_btn"), null)
                .setNeutralButton(tr("reset_stats_btn"), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        database.saveSetting("stats", new JSONObject());
                        Toast.makeText(NativeHomeActivity.this, tr("toast_restored"), Toast.LENGTH_SHORT).show();
                    }
                }).show();
    }

    private int playsCount(JSONObject plays, String id) { return plays == null ? 0 : plays.optInt(id, 0); }

    private void showLyrics() {
        if (currentTrack == null) {
            Toast.makeText(this, tr("load_track_to_start"), Toast.LENGTH_SHORT).show();
            return;
        }
        currentLyrics = NativeLyrics.parse(currentTrack);
        lastLyricsIndex = -2;
        lyricsOffsetMs = Math.round(currentTrack.optDouble("lrcOffset", 0) * 1000);
        lyricsLoopStartMs = -1;
        lyricsLoopEndMs = -1;
        updateLyricsTools();
        if (currentLyrics.isEmpty()) {
            new AlertDialog.Builder(this).setTitle(tr("lyrics_title"))
                    .setMessage(tr("lrc_empty_hint"))
                    .setPositiveButton(tr("import_lyrics_btn"), new android.content.DialogInterface.OnClickListener() {
                        @Override public void onClick(android.content.DialogInterface dialog, int which) { chooseLyricsFile(); }
                    }).setNegativeButton(tr("close_btn"), null).show();
            return;
        }
        screenBeforeLyrics = screen;
        screen = "lyrics";
        search.setVisibility(View.GONE);
        listView.setVisibility(View.GONE);
        lyricsScroll.setVisibility(View.VISIBLE);
        updateLyricsHighlight();
        uiHandler.removeCallbacks(lyricTicker);
        uiHandler.post(lyricTicker);
    }

    private void updateLyricsHighlight() {
        if (currentLyrics.isEmpty() || lyricsText == null) return;
        int current = NativeLyrics.currentIndex(currentLyrics,
                Math.max(0, Math.round(player.position()) - lyricsOffsetMs));
        if (current == lastLyricsIndex) return;
        lastLyricsIndex = current;
        StringBuilder text = new StringBuilder();
        int[] starts = new int[currentLyrics.size()];
        int[] ends = new int[currentLyrics.size()];
        for (int i = 0; i < currentLyrics.size(); i++) {
            NativeLyrics.Line line = currentLyrics.get(i);
            starts[i] = text.length();
            text.append(line.text);
            if (line.translation.length() > 0) text.append('\n').append(line.translation);
            ends[i] = text.length();
            if (i < currentLyrics.size() - 1) text.append("\n\n");
        }
        SpannableString rendered = new SpannableString(text.toString());
        if (current >= 0 && current < starts.length) {
            rendered.setSpan(new ForegroundColorSpan(ACCENT), starts[current], ends[current], Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            rendered.setSpan(new StyleSpan(Typeface.BOLD), starts[current], ends[current], Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        lyricsText.setText(rendered);
        lyricsText.setTextSize(lyricsFontSize);
        if (current >= 0 && current < starts.length) {
            android.text.Layout layout = lyricsText.getLayout();
            if (layout != null) lyricsScroll.smoothScrollTo(0, Math.max(0, layout.getLineTop(layout.getLineForOffset(starts[current])) - dp(90)));
        }
    }

    private void addLyricsTool(LinearLayout row, String label, View.OnClickListener listener) {
        Button tool = button(label);
        tool.setTextSize(11);
        row.addView(tool, new LinearLayout.LayoutParams(0, dp(38), 1));
        tool.setOnClickListener(listener);
    }

    private void updateLyricsTools() {
        if (lyricsText != null) lyricsText.setTextSize(lyricsFontSize);
    }

    private void setLyricsFontSize(int size) {
        lyricsFontSize = Math.max(12, Math.min(32, size));
        database.saveSetting("native.lyrics.font", String.valueOf(lyricsFontSize));
        updateLyricsTools();
        updateLyricsHighlight();
    }

    private void adjustLyricsOffset(long deltaMs) {
        if (currentTrack == null) return;
        lyricsOffsetMs = Math.max(-30000, Math.min(30000, lyricsOffsetMs + deltaMs));
        try {
            currentTrack.put("lrcOffset", lyricsOffsetMs / 1000.0);
            database.saveTrack(currentTrack);
        } catch (Exception ignored) { }
        updateLyricsHighlight();
        Toast.makeText(this, "Desfase: " + (lyricsOffsetMs > 0 ? "+" : "")
                + String.format(java.util.Locale.US, "%.1f s", lyricsOffsetMs / 1000.0), Toast.LENGTH_SHORT).show();
    }

    private void cycleLyricsLoop() {
        if (currentTrack == null || !player.isPlaying()) return;
        long logicalPosition = Math.max(0, Math.round(player.position()) - lyricsOffsetMs);
        if (lyricsLoopStartMs < 0 || lyricsLoopEndMs >= 0) {
            lyricsLoopStartMs = logicalPosition;
            lyricsLoopEndMs = -1;
            Toast.makeText(this, "Punto A de letra guardado", Toast.LENGTH_SHORT).show();
        } else if (logicalPosition > lyricsLoopStartMs + 500) {
            lyricsLoopEndMs = logicalPosition;
            Toast.makeText(this, "Bucle de letra A-B activo", Toast.LENGTH_SHORT).show();
        }
    }

    private void enforceLyricsLoop() {
        if (lyricsLoopStartMs >= 0 && lyricsLoopEndMs > lyricsLoopStartMs && player.isPlaying()) {
            long end = Math.max(0, lyricsLoopEndMs + lyricsOffsetMs);
            if (player.position() >= end - 80) player.seekTo(Math.max(0, lyricsLoopStartMs + lyricsOffsetMs));
        }
    }

    private void editLyrics() {
        if (currentTrack == null) return;
        final EditText editor = new EditText(this);
        editor.setGravity(Gravity.TOP | Gravity.START);
        editor.setMinLines(8);
        editor.setMaxLines(16);
        editor.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        editor.setText(currentTrack.optString("lrc", ""));
        new AlertDialog.Builder(this).setTitle(tr("lrc_edit")).setView(editor)
                .setNegativeButton(tr("close_btn"), null)
                .setPositiveButton(tr("save_playlist"), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        try {
                            currentTrack.put("lrc", editor.getText().toString());
                            database.saveTrack(currentTrack);
                            currentLyrics = NativeLyrics.parse(currentTrack);
                            lastLyricsIndex = -2;
                            updateLyricsHighlight();
                        } catch (Exception e) {
                            Toast.makeText(NativeHomeActivity.this, tr("toast_lyrics_save_error"), Toast.LENGTH_LONG).show();
                        }
                    }
                }).show();
    }

    private void shareLyrics() {
        if (currentTrack == null) return;
        String lyrics = currentTrack.optString("lrc", "");
        if (lyrics.length() == 0) {
            Toast.makeText(this, tr("lrc_empty_hint"), Toast.LENGTH_SHORT).show();
            return;
        }
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT, currentTrack.optString("title", "") + " — "
                + currentTrack.optString("artist", "") + "\n\n" + lyrics);
        startActivity(Intent.createChooser(share, tr("lrc_share")));
    }

    private void toggleLyricsFullscreen() {
        int flags = getWindow().getDecorView().getSystemUiVisibility();
        if ((flags & View.SYSTEM_UI_FLAG_FULLSCREEN) != 0) {
            getWindow().getDecorView().setSystemUiVisibility(originalSystemUiVisibility);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    private void chooseLyricsFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/*");
        try { startActivityForResult(intent, REQ_LYRICS); }
        catch (Exception e) { Toast.makeText(this, "No se pudo abrir el selector de letras", Toast.LENGTH_LONG).show(); }
    }

    private void restoreSession() {
        if (savedSession == null) return;
        boolean alreadyPlaying = NativePlayerBridge.isCurrentlyPlaying();
        String id = savedSession.optString("currentTrackId", "");
        if (alreadyPlaying) {
            try {
                String activeId = new JSONObject(player.snapshot()).optString("trackId", "");
                if (activeId.length() > 0) id = activeId;
            } catch (Exception ignored) { }
        }
        int trackIndex = indexOfId(allTracks, id);
        if (trackIndex < 0) return;
        currentTrack = allTracks.get(trackIndex);
        playQueue.clear();
        JSONArray ids = savedSession.optJSONArray("queue");
        if (ids != null) {
            for (int i = 0; i < ids.length(); i++) {
                int index = indexOfId(allTracks, ids.optString(i, ""));
                if (index >= 0) playQueue.add(allTracks.get(index));
            }
        }
        if (playQueue.isEmpty()) playQueue.addAll(allTracks);
        queueIndex = indexOfId(playQueue, id);
        if (queueIndex < 0) { playQueue.add(0, allTracks.get(trackIndex)); queueIndex = 0; }
        shuffleEnabled = savedSession.optBoolean("shuffle", shuffleEnabled);
        repeatMode = savedSession.optString("repeat", repeatMode);
        originalQueue = null;
        JSONArray originalIds = savedSession.optJSONArray("originalQueue");
        if (shuffleEnabled && originalIds != null) {
            originalQueue = new ArrayList<JSONObject>();
            for (int i = 0; i < originalIds.length(); i++) {
                int originalIndex = indexOfId(allTracks, originalIds.optString(i, ""));
                if (originalIndex >= 0) originalQueue.add(allTracks.get(originalIndex));
            }
        }
        JSONObject context = savedSession.optJSONObject("playContext");
        if (context != null && "playlist".equals(context.optString("type"))) {
            currentPlaylistId = context.optString("id", null);
            if (currentPlaylistId != null) screen = "playlist-detail";
        } else if (context != null && "favorites".equals(context.optString("type"))) {
            screen = "favorites";
        }
        currentTrack = playQueue.get(queueIndex);
        syncNativeQueue();
        PlaybackService.trackStarted(id);
        long position = Math.max(0, Math.round(savedSession.optDouble("currentTime", 0) * 1000));
        String local = currentTrack.optString("localAudioUri", "");
        String uri = local.length() > 0 ? local
                : currentTrack.optString("deviceUri", currentTrack.optString("uri", ""));
        if (!alreadyPlaying) {
            if (uri.startsWith("content://") || uri.startsWith("file://")) player.loadUri(id, uri, position);
            else if (new NativeAudioStore(this).has(id)) player.load(id, position);
            player.setRate(playbackRate);
        }
        updatePlayerControls();
        search.setVisibility("playlist-detail".equals(screen) ? View.GONE : View.VISIBLE);
        filterTracks("");
    }

    private void buildInterface() {
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        LinearLayout root = new LinearLayout(this);
        rootView = root;
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(16), dp(12), dp(16), dp(8));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setOrientation(LinearLayout.HORIZONTAL);
        TextView brand = text(NativeText.text(this, "app_title").toUpperCase(java.util.Locale.getDefault()), 21, TEXT, true);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(48), 1));
        addHeaderButton(header, NativeText.text(this, "menu_load_music"), new View.OnClickListener() {
            @Override public void onClick(View v) { requestAudioPermission(); }
        });
        addHeaderButton(header, NativeText.text(this, "more_options"), new View.OnClickListener() {
            @Override public void onClick(View v) { showMoreMenu(v); }
        });
        root.addView(header);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        addTab(tabs, NativeText.text(this, "nav_library"), "library");
        addTab(tabs, NativeText.text(this, "your_playlists"), "playlists");
        addTab(tabs, "+ " + NativeText.text(this, "new_playlist"), "new-playlist");
        addTab(tabs, "+ " + NativeText.text(this, "load_music"), "import");
        root.addView(tabs, new LinearLayout.LayoutParams(-1, dp(46)));
        visualizerView = new NativeVisualizerView(this);
        visualizerView.setColor(ACCENT);
        visualizerView.setVisibility(View.GONE);
        root.addView(visualizerView, new LinearLayout.LayoutParams(-1, dp(36)));

        search = new EditText(this);
        search.setSingleLine(true);
        search.setTextColor(TEXT);
        search.setHintTextColor(MUTED);
        search.setHint(NativeText.text(this, "search_placeholder"));
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
        listView.setOnItemClickListener(new android.widget.AdapterView.OnItemClickListener() {
            @Override public void onItemClick(android.widget.AdapterView<?> parent, View view,
                                              int position, long id) {
                if ("playlists".equals(screen)) openPlaylist(visibleTracks.get(position));
                else {
                    if (!"playlist-detail".equals(screen)) prepareQueueForScreen();
                    playTrack(visibleTracks.get(position));
                }
            }
        });
        listView.setOnItemLongClickListener(new android.widget.AdapterView.OnItemLongClickListener() {
            @Override public boolean onItemLongClick(android.widget.AdapterView<?> parent, View view,
                                                     int position, long id) {
                JSONObject item = visibleTracks.get(position);
                if ("playlists".equals(screen)) showPlaylistOptions(item);
                else if ("playlist-detail".equals(screen)) removeFromCurrentPlaylist(item);
                else showTrackOptions(item);
                return true;
            }
        });
        root.addView(listView, new LinearLayout.LayoutParams(-1, 0, 1));
        lyricsScroll = new ScrollView(this);
        LinearLayout lyricsContent = new LinearLayout(this);
        lyricsContent.setOrientation(LinearLayout.VERTICAL);
        lyricsTools = new LinearLayout(this);
        lyricsTools.setOrientation(LinearLayout.VERTICAL);
        LinearLayout lyricRowOne = new LinearLayout(this);
        addLyricsTool(lyricRowOne, "A−", new View.OnClickListener() {
            @Override public void onClick(View v) { setLyricsFontSize(lyricsFontSize - 2); }
        });
        addLyricsTool(lyricRowOne, "A+", new View.OnClickListener() {
            @Override public void onClick(View v) { setLyricsFontSize(lyricsFontSize + 2); }
        });
        addLyricsTool(lyricRowOne, "−0.5s", new View.OnClickListener() {
            @Override public void onClick(View v) { adjustLyricsOffset(-500); }
        });
        addLyricsTool(lyricRowOne, "+0.5s", new View.OnClickListener() {
            @Override public void onClick(View v) { adjustLyricsOffset(500); }
        });
        addLyricsTool(lyricRowOne, "A-B", new View.OnClickListener() {
            @Override public void onClick(View v) { cycleLyricsLoop(); }
        });
        lyricsTools.addView(lyricRowOne);
        LinearLayout lyricRowTwo = new LinearLayout(this);
        addLyricsTool(lyricRowTwo, tr("lrc_edit"), new View.OnClickListener() {
            @Override public void onClick(View v) { editLyrics(); }
        });
        addLyricsTool(lyricRowTwo, tr("lrc_share"), new View.OnClickListener() {
            @Override public void onClick(View v) { shareLyrics(); }
        });
        addLyricsTool(lyricRowTwo, tr("lrc_fullscreen"), new View.OnClickListener() {
            @Override public void onClick(View v) { toggleLyricsFullscreen(); }
        });
        lyricsTools.addView(lyricRowTwo);
        lyricsContent.addView(lyricsTools, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
        lyricsText = text(NativeText.text(this, "load_track_to_start"), lyricsFontSize, TEXT, true);
        lyricsText.setGravity(Gravity.CENTER);
        lyricsText.setPadding(dp(20), dp(24), dp(20), dp(24));
        lyricsContent.addView(lyricsText, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
        lyricsScroll.addView(lyricsContent, new ScrollView.LayoutParams(-1, -2));
        lyricsScroll.setVisibility(View.GONE);
        root.addView(lyricsScroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout playerPanel = new LinearLayout(this);
        playerPanel.setOrientation(LinearLayout.VERTICAL);
        playerPanel.setPadding(dp(12), dp(9), dp(12), dp(6));
        playerPanel.setBackgroundColor(SURFACE);
        LinearLayout nowPlaying = new LinearLayout(this);
        nowPlaying.setGravity(Gravity.CENTER_VERTICAL);
        coverImage = new ImageView(this);
        coverImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        coverImage.setBackgroundColor(BG);
        nowPlaying.addView(coverImage, new LinearLayout.LayoutParams(dp(52), dp(52)));
        LinearLayout currentInfo = new LinearLayout(this);
        currentInfo.setOrientation(LinearLayout.VERTICAL);
        currentInfo.setPadding(dp(12), 0, 0, 0);
        titleLine = text(NativeText.text(this, "load_track_to_start"), 16, TEXT, true);
        artistLine = text(NativeText.text(this, "your_library"), 13, MUTED, false);
        currentInfo.addView(titleLine);
        currentInfo.addView(artistLine);
        nowPlaying.addView(currentInfo, new LinearLayout.LayoutParams(0, -2, 1));
        playerPanel.addView(nowPlaying);

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
        addControl(controls, NativeText.text(this, "previous"), new View.OnClickListener() {
            @Override public void onClick(View v) { playRelative(-1); }
        });
        playButton = button(NativeText.text(this, "play"));
        controls.addView(playButton, new LinearLayout.LayoutParams(0, dp(42), 1));
        playButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { togglePlayback(); }
        });
        addControl(controls, NativeText.text(this, "next"), new View.OnClickListener() {
            @Override public void onClick(View v) { playRelative(1); }
        });
        playerPanel.addView(controls);
        LinearLayout extras = new LinearLayout(this);
        extras.setGravity(Gravity.CENTER);
        lyricsButton = button(NativeText.text(this, "lyrics"));
        favoriteButton = button(NativeText.text(this, "favorite"));
        shuffleButton = button(NativeText.text(this, "shuffle"));
        repeatButton = button(NativeText.text(this, "repeat"));
        abButton = button("A-B");
        Button[] extraButtons = {lyricsButton, favoriteButton, shuffleButton, repeatButton, abButton};
        for (Button extra : extraButtons) extras.addView(extra, new LinearLayout.LayoutParams(0, dp(36), 1));
        lyricsButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showLyrics(); }
        });
        favoriteButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { toggleCurrentFavorite(); }
        });
        shuffleButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { toggleShuffle(); }
        });
        repeatButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { cycleRepeat(); }
        });
        abButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { cycleAbRepeat(); }
        });
        playerPanel.addView(extras);
        root.addView(playerPanel, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }

    private void loadStoredData() {
        allTracks.clear();
        allTracks.addAll(database.tracks());
        playlists.clear();
        playlists.addAll(database.playlists());
        filterTracks(search == null ? "" : search.getText().toString());
        if (currentTrack == null && savedSession != null) restoreSession();
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
        else if (code == REQ_RECORD_AUDIO && results != null && results.length > 0
                && results[0] == PackageManager.PERMISSION_GRANTED) {
            visualizerEnabled = true;
            database.saveSetting("native.visualizer", "true");
            startVisualizer();
        }
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

    private void chooseBackupDestination() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        intent.putExtra(Intent.EXTRA_TITLE, "aurora-backup.zip");
        try { startActivityForResult(intent, REQ_EXPORT_BACKUP); }
        catch (Exception e) { Toast.makeText(this, "No se pudo abrir el selector para guardar", Toast.LENGTH_LONG).show(); }
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
        if (requestCode == REQ_EXPORT_BACKUP && data.getData() != null) {
            final Uri destination = data.getData();
            new Thread(new Runnable() {
                @Override public void run() {
                    try {
                        final NativeBackupExporter.Result result = NativeBackupExporter.export(NativeHomeActivity.this, destination);
                        runOnUiThread(new Runnable() {
                            @Override public void run() {
                                Toast.makeText(NativeHomeActivity.this,
                                        "Respaldo guardado: " + result.tracks + " pistas, " + result.audioFiles + " audios",
                                        Toast.LENGTH_LONG).show();
                            }
                        });
                    } catch (final Exception e) {
                        android.util.Log.e("AuroraNative", "falló la exportación", e);
                        runOnUiThread(new Runnable() {
                            @Override public void run() {
                                Toast.makeText(NativeHomeActivity.this,
                                        "No se pudo crear el respaldo: " + e.getMessage(), Toast.LENGTH_LONG).show();
                            }
                        });
                    }
                }
            }, "aurora-backup-export").start();
            return;
        }
        if (requestCode == REQ_LYRICS && data.getData() != null && currentTrack != null) {
            try {
                java.io.InputStream input = getContentResolver().openInputStream(data.getData());
                if (input == null) throw new IllegalStateException("No se pudo abrir la letra");
                java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) >= 0) {
                    if (count > 0) output.write(buffer, 0, count);
                    if (output.size() > 1024 * 1024) throw new IllegalArgumentException("La letra supera 1 MB");
                }
                input.close();
                currentTrack.put("lrc", new String(output.toByteArray(), "UTF-8"));
                database.saveTrack(currentTrack);
                loadStoredData();
                currentLyrics = NativeLyrics.parse(currentTrack);
                showLyrics();
            } catch (Exception e) {
                Toast.makeText(this, "No se pudo importar la letra", Toast.LENGTH_LONG).show();
            }
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
                if ("favorites".equals(screen) && !favorites.contains(track.optString("id"))) continue;
                if ("rated".equals(screen) && rating(track) <= 0) continue;
                String haystack = track.optString("title", "") + " "
                        + track.optString("artist", "") + " " + track.optString("album", "");
                if (q.length() == 0 || haystack.toLowerCase(java.util.Locale.getDefault()).contains(q)) {
                    visibleTracks.add(track);
                }
            }
            if ("favorites".equals(screen) || "rated".equals(screen)) sortTracks(visibleTracks, "stars");
        }
        if (adapter != null) adapter.notifyDataSetChanged();
    }

    private int rating(JSONObject track) {
        return Math.max(0, Math.min(5, track == null ? 0 : track.optInt("rating", 0)));
    }

    private void sortTracks(List<JSONObject> tracks, final String mode) {
        Collections.sort(tracks, new Comparator<JSONObject>() {
            @Override public int compare(JSONObject a, JSONObject b) {
                if ("queue".equals(mode)) return 0;
                if ("stars".equals(mode)) {
                    return rating(b) - rating(a);
                } else if ("artist".equals(mode)) {
                    int byArtist = a.optString("artist", "").compareToIgnoreCase(b.optString("artist", ""));
                    if (byArtist != 0) return byArtist;
                } else if ("album".equals(mode)) {
                    int byAlbum = a.optString("album", "").compareToIgnoreCase(b.optString("album", ""));
                    if (byAlbum != 0) return byAlbum;
                } else if ("duration".equals(mode)) {
                    long byDuration = a.optLong("duration", 0) - b.optLong("duration", 0);
                    if (byDuration != 0) return byDuration < 0 ? -1 : 1;
                }
                return a.optString("title", "").compareToIgnoreCase(b.optString("title", ""));
            }
        });
    }

    private void addTab(LinearLayout tabs, String label, final String destination) {
        Button tab = button(label);
        tabs.addView(tab, new LinearLayout.LayoutParams(0, dp(42), 1));
        tab.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if ("import".equals(destination)) { chooseAudioFiles(); return; }
                if ("new-playlist".equals(destination)) { createPlaylist(); return; }
                screen = destination;
                lyricsScroll.setVisibility(View.GONE);
                listView.setVisibility(View.VISIBLE);
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

    private void prepareQueueForScreen() {
        ArrayList<JSONObject> source = new ArrayList<JSONObject>();
        if ("favorites".equals(screen)) {
            for (JSONObject item : allTracks) if (favorites.contains(item.optString("id"))) source.add(item);
            sortTracks(source, "stars");
        } else if ("rated".equals(screen)) {
            for (JSONObject item : allTracks) if (rating(item) > 0) source.add(item);
            sortTracks(source, "stars");
        } else {
            source.addAll(allTracks);
        }
        originalQueue = new ArrayList<JSONObject>(source);
        playQueue.clear();
        playQueue.addAll(source);
        queueIndex = -1;
        if (shuffleEnabled) shuffleQueue(0);
    }

    private void playTrack(JSONObject track) {
        if (track == null) return;
        if (currentTrack == null || !currentTrack.optString("id").equals(track.optString("id"))) {
            loopStartMs = -1;
            loopEndMs = -1;
            lyricsLoopStartMs = -1;
            lyricsLoopEndMs = -1;
            if (abButton != null) { abButton.setText("A-B"); abButton.setTextColor(TEXT); }
        }
        currentTrack = track;
        if ("lyrics".equals(screen)) {
            currentLyrics = NativeLyrics.parse(track);
            lastLyricsIndex = -2;
            lyricsOffsetMs = Math.round(track.optDouble("lrcOffset", 0) * 1000);
            if (currentLyrics.isEmpty()) lyricsText.setText(tr("lrc_empty_hint"));
            else updateLyricsHighlight();
        }
        int found = indexOfId(playQueue, track.optString("id", ""));
        if (found < 0) {
            playQueue.clear();
            playQueue.addAll(allTracks);
            originalQueue = new ArrayList<JSONObject>(playQueue);
            found = indexOfId(playQueue, track.optString("id", ""));
            if (shuffleEnabled) shuffleQueue(found);
        }
        queueIndex = Math.max(0, indexOfId(playQueue, track.optString("id", "")));
        syncNativeQueue();
        PlaybackService.ensureRunning(this);
        String id = track.optString("id", "");
        PlaybackService.trackStarted(id);
        boolean started;
        String localUri = track.optString("localAudioUri", "");
        if (localUri.length() > 0) started = player.playUri(id, localUri, 0);
        else if (new NativeAudioStore(this).has(id)) started = player.play(id, 0);
        else {
            String uri = track.optString("deviceUri", track.optString("uri", ""));
            started = uri.startsWith("content://") && player.playUri(id, uri, 0);
        }
        if (started) player.setRate(playbackRate);
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
        JSONObject context = new JSONObject();
        try {
            queue.put("repeat", repeatMode);
            queue.put("shuffle", shuffleEnabled);
            queue.put("tracks", tracks);
            JSONArray originals = new JSONArray();
            if (originalQueue != null) for (JSONObject original : originalQueue) originals.put(original.optString("id", ""));
            queue.put("originalQueue", originals);
            if ("playlist-detail".equals(screen) && currentPlaylistId != null) {
                context.put("type", "playlist");
                context.put("id", currentPlaylistId);
            } else if ("favorites".equals(screen)) context.put("type", "favorites");
            else context.put("type", "all");
            queue.put("context", context);
        } catch (Exception ignored) { }
        player.queueSet(queue.toString(), queueIndex);
        if (player.isPlaying()) {
            player.clearNext();
            if (!"one".equals(repeatMode)) {
                int nextIndex = queueIndex + 1;
                if (nextIndex >= playQueue.size() && "all".equals(repeatMode)) nextIndex = 0;
                if (nextIndex >= 0 && nextIndex < playQueue.size() && nextIndex != queueIndex) {
                    JSONObject next = playQueue.get(nextIndex);
                    String uri = next.optString("localAudioUri",
                            next.optString("deviceUri", next.optString("uri", "")));
                    if (uri.startsWith("content://") || uri.startsWith("file://")) {
                        player.prepareNextUri(next.optString("id", ""), uri);
                    } else {
                        player.prepareNext(next.optString("id", ""));
                    }
                }
            }
        }
    }

    private void togglePlayback() {
        if (currentTrack == null) {
            if (!allTracks.isEmpty()) playTrack(allTracks.get(0));
            return;
        }
        if (player.isPlaying()) {
            player.pause();
            PlaybackService.update(currentTrack.optString("title", ""), currentTrack.optString("artist", ""),
                    currentTrack.optString("album", ""), false,
                    Math.round(player.duration()), Math.round(player.position()));
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
                    currentTrack.optString("album", ""), true,
                    Math.round(player.duration()), Math.round(player.position()));
        }
        updatePlayerControls();
    }

    private void shuffleQueue(int currentIndex) {
        if (playQueue.size() < 2) return;
        int keep = Math.max(0, Math.min(currentIndex, playQueue.size() - 1));
        Collections.shuffle(playQueue.subList(keep + 1, playQueue.size()));
    }

    private void toggleShuffle() {
        if (playQueue.isEmpty()) {
            playQueue.addAll(allTracks);
            originalQueue = new ArrayList<JSONObject>(playQueue);
            queueIndex = indexOfId(playQueue, currentTrack == null ? "" : currentTrack.optString("id"));
        }
        shuffleEnabled = !shuffleEnabled;
        if (shuffleEnabled) {
            originalQueue = new ArrayList<JSONObject>(playQueue);
            int currentIndex = indexOfId(playQueue, currentTrack == null ? "" : currentTrack.optString("id"));
            shuffleQueue(currentIndex < 0 ? 0 : currentIndex);
        } else if (originalQueue != null) {
            String currentId = currentTrack == null ? "" : currentTrack.optString("id");
            playQueue.clear();
            playQueue.addAll(originalQueue);
            queueIndex = indexOfId(playQueue, currentId);
            originalQueue = null;
        }
        database.saveSetting("native.shuffle", String.valueOf(shuffleEnabled));
        syncNativeQueue();
        updateModeButtons();
    }

    private void cycleRepeat() {
        repeatMode = "off".equals(repeatMode) ? "all" : ("all".equals(repeatMode) ? "one" : "off");
        database.saveSetting("native.repeat", repeatMode);
        syncNativeQueue();
        updateModeButtons();
    }

    private void cycleAbRepeat() {
        if (currentTrack == null || !player.isPlaying()) return;
        long position = Math.round(player.position());
        if (loopStartMs < 0 || loopEndMs >= 0) {
            loopStartMs = position;
            loopEndMs = -1;
            abButton.setText("A ·");
            abButton.setTextColor(ACCENT);
            Toast.makeText(this, "Punto A guardado", Toast.LENGTH_SHORT).show();
        } else if (position > loopStartMs + 500) {
            loopEndMs = position;
            abButton.setText("A-B");
            abButton.setTextColor(ACCENT);
            Toast.makeText(this, "Bucle A-B activo", Toast.LENGTH_SHORT).show();
        }
    }

    private void enforceAbRepeat() {
        if (loopStartMs >= 0 && loopEndMs > loopStartMs && player.isPlaying()
                && player.position() >= loopEndMs - 80) player.seekTo(loopStartMs);
    }

    private void updateModeButtons() {
        if (shuffleButton != null) {
            shuffleButton.setText((shuffleEnabled ? "✓ " : "") + tr("shuffle"));
            shuffleButton.setTextColor(shuffleEnabled ? ACCENT : TEXT);
        }
        if (repeatButton != null) {
            String mode = "all".equals(repeatMode) ? " ∞" : ("one".equals(repeatMode) ? " 1" : "");
            repeatButton.setText(tr("repeat") + mode);
            repeatButton.setTextColor("off".equals(repeatMode) ? TEXT : ACCENT);
        }
    }

    private void toggleCurrentFavorite() {
        if (currentTrack == null) return;
        toggleFavorite(currentTrack);
    }

    private void toggleFavorite(JSONObject track) {
        String id = track.optString("id", "");
        if (id.length() == 0) return;
        if (favorites.contains(id)) favorites.remove(id); else favorites.add(id);
        JSONArray saved = new JSONArray();
        for (String favorite : favorites) saved.put(favorite);
        database.saveSetting("favorites", saved);
        filterTracks(search == null ? "" : search.getText().toString());
        updateFavoriteButton();
        Toast.makeText(this, favorites.contains(id) ? tr("toast_added_fav") : tr("toast_removed_fav"),
                Toast.LENGTH_SHORT).show();
    }

    private void updateFavoriteButton() {
        if (favoriteButton == null) return;
        boolean liked = currentTrack != null && favorites.contains(currentTrack.optString("id"));
        favoriteButton.setText((liked ? "♥ " : "♡ ") + tr("favorite"));
        favoriteButton.setTextColor(liked ? ACCENT : TEXT);
    }

    private void setRating(JSONObject track, int value) {
        if (track == null) return;
        try {
            track.put("rating", value);
            database.saveTrack(track);
        } catch (Exception ignored) { }
        loadStoredData();
        Toast.makeText(this, tr("rating_label") + ": " + (value == 0 ? "—" : stars(value)), Toast.LENGTH_SHORT).show();
    }

    private String stars(int count) {
        StringBuilder value = new StringBuilder();
        for (int i = 0; i < count; i++) value.append('★');
        return value.toString();
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
                if ("lyrics".equals(screen)) {
                    currentLyrics = NativeLyrics.parse(currentTrack);
                    updateLyricsHighlight();
                }
            }
        } catch (Exception ignored) {}
    }

    private void updatePlayerControls() {
        syncCurrentTrack();
        if (currentTrack != null) {
            showCover(currentTrack);
            titleLine.setText(currentTrack.optString("title", "(sin título)"));
            artistLine.setText(currentTrack.optString("artist", "Artista desconocido")
                    + (currentTrack.optString("album", "").length() > 0
                    ? " · " + currentTrack.optString("album", "") : ""));
            boolean playing = player.isPlaying();
            playButton.setText(playing ? tr("pause") : tr("play"));
            updateModeButtons();
            updateFavoriteButton();
            if (lyricsButton != null) lyricsButton.setEnabled(currentTrack.opt("lrc") != null);
            long duration = Math.max(0L, Math.round(player.duration()));
            long position = Math.max(0L, Math.round(player.position()));
            if (!userSeeking) seekBar.setProgress(duration > 0 ? (int) Math.min(1000, position * 1000 / duration) : 0);
            elapsedLine.setText(time(position));
            durationLine.setText(time(duration));
        } else {
            playButton.setText(tr("play"));
        }
    }

    private void showCover(JSONObject track) {
        if (coverImage == null || track == null) return;
        String id = track.optString("id", "");
        if (id.equals(displayedCoverId)) return;
        displayedCoverId = id;
        String data = track.optString("coverThumbLg", track.optString("coverThumb", track.optString("cover", "")));
        try {
            int comma = data.indexOf(',');
            if (comma >= 0) data = data.substring(comma + 1);
            if (data.length() > 0 && data.length() < 3 * 1024 * 1024) {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                android.graphics.Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap != null) { coverImage.setImageBitmap(bitmap); return; }
            }
        } catch (Exception ignored) { }
        long albumId = track.optLong("albumId", -1);
        if (albumId >= 0) {
            try {
                coverImage.setImageURI(Uri.parse("content://media/external/audio/albumart/" + albumId));
                return;
            } catch (Exception ignored) { }
        }
        coverImage.setImageDrawable(new android.graphics.drawable.ColorDrawable(SURFACE));
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
                .setPositiveButton("Crear", new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
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
                    }
                }).show();
    }

    private void showTrackOptions(final JSONObject track) {
        final String[] actions = {tr("play"), tr("rating_label"), tr("favorite"), tr("add_tracks_btn")};
        new AlertDialog.Builder(this).setTitle(track.optString("title", "Audio")).setItems(actions,
                new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        if (which == 0) playTrack(track);
                        else if (which == 1) showRatingDialog(track);
                        else if (which == 2) toggleFavorite(track);
                        else offerAddToPlaylist(track);
                    }
                }).show();
    }

    private void showRatingDialog(final JSONObject track) {
        final String[] choices = {"☆ 0", "★", "★★", "★★★", "★★★★", "★★★★★"};
        new AlertDialog.Builder(this).setTitle(tr("rating_label")).setSingleChoiceItems(choices,
                rating(track), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        setRating(track, which);
                        dialog.dismiss();
                    }
                }).setNegativeButton(tr("close_btn"), null).show();
    }

    private void showPlaylistOptions(final JSONObject playlist) {
        final String[] actions = {tr("rename_playlist_btn"), tr("add_tracks_btn"), tr("playlist_sort_title"),
                tr("export_playlist_btn"), tr("clear_btn"), tr("remove")};
        new AlertDialog.Builder(this).setTitle(playlist.optString("name", tr("new_playlist")))
                .setItems(actions, new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        if (which == 0) renamePlaylist(playlist);
                        else if (which == 1) addMultipleTracks(playlist);
                        else if (which == 2) choosePlaylistSort(playlist);
                        else if (which == 3) exportPlaylist(playlist);
                        else if (which == 4) clearPlaylist(playlist);
                        else if (which == 5) deletePlaylist(playlist);
                    }
                }).show();
    }

    private void renamePlaylist(final JSONObject playlist) {
        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setText(playlist.optString("name", ""));
        new AlertDialog.Builder(this).setTitle(tr("rename_playlist_btn")).setView(input)
                .setNegativeButton(tr("close_btn"), null)
                .setPositiveButton(tr("save_playlist"), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        String name = input.getText().toString().trim();
                        if (name.length() == 0) return;
                        try { playlist.put("name", name); database.savePlaylist(playlist); loadStoredData(); }
                        catch (Exception ignored) { }
                    }
                }).show();
    }

    private void addMultipleTracks(final JSONObject playlist) {
        final boolean[] selected = new boolean[allTracks.size()];
        JSONArray existing = playlist.optJSONArray("trackIds");
        if (existing != null) {
            for (int i = 0; i < allTracks.size(); i++) {
                String id = allTracks.get(i).optString("id", "");
                for (int j = 0; j < existing.length(); j++) if (id.equals(existing.optString(j))) selected[i] = true;
            }
        }
        final String[] labels = new String[allTracks.size()];
        for (int i = 0; i < allTracks.size(); i++) {
            JSONObject track = allTracks.get(i);
            labels[i] = track.optString("title", "Audio") + " · " + track.optString("artist", "");
        }
        new AlertDialog.Builder(this).setTitle(tr("add_tracks_btn"))
                .setMultiChoiceItems(labels, selected, new android.content.DialogInterface.OnMultiChoiceClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which, boolean checked) {
                        selected[which] = checked;
                    }
                }).setNegativeButton(tr("close_btn"), null)
                .setPositiveButton(tr("save_playlist"), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        JSONArray ids = new JSONArray();
                        for (int i = 0; i < selected.length; i++) if (selected[i]) ids.put(allTracks.get(i).optString("id"));
                        try { playlist.put("trackIds", ids); database.savePlaylist(playlist); loadStoredData(); }
                        catch (Exception ignored) { }
                    }
                }).show();
    }

    private void choosePlaylistSort(final JSONObject playlist) {
        final String[] labels = {tr("sort_stars"), tr("sort_title"), tr("sort_artist"), tr("sort_album"), tr("sort_duration")};
        final String[] modes = {"stars", "title", "artist", "album", "duration"};
        new AlertDialog.Builder(this).setTitle(tr("playlist_sort_title")).setItems(labels,
                new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        try {
                            playlist.put("sort", modes[which]);
                            database.savePlaylist(playlist);
                            boolean wasOpen = "playlist-detail".equals(screen)
                                    && playlist.optString("id").equals(currentPlaylistId);
                            loadStoredData();
                            if (wasOpen) {
                                screen = "playlists";
                                openPlaylist(playlist);
                            }
                        } catch (Exception ignored) { }
                    }
                }).show();
    }

    private void clearPlaylist(final JSONObject playlist) {
        new AlertDialog.Builder(this).setTitle(tr("clear_btn"))
                .setMessage(tr("confirm_clear_playlist"))
                .setNegativeButton(tr("close_btn"), null)
                .setPositiveButton(tr("clear_btn"), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        try { playlist.put("trackIds", new JSONArray()); database.savePlaylist(playlist); loadStoredData(); }
                        catch (Exception ignored) { }
                    }
                }).show();
    }

    private void deletePlaylist(final JSONObject playlist) {
        new AlertDialog.Builder(this).setTitle(tr("remove"))
                .setMessage(tr("confirm_delete_playlist"))
                .setNegativeButton(tr("close_btn"), null)
                .setPositiveButton(tr("remove"), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        database.deletePlaylist(playlist.optString("id"));
                        if (playlist.optString("id").equals(currentPlaylistId)) {
                            currentPlaylistId = null;
                            playQueue.clear();
                            screen = "playlists";
                        }
                        loadStoredData();
                    }
                }).show();
    }

    private void removeFromCurrentPlaylist(final JSONObject track) {
        final JSONObject playlist = findPlaylist(currentPlaylistId);
        if (playlist == null) return;
        new AlertDialog.Builder(this).setMessage(tr("remove_from_playlist"))
                .setNegativeButton(tr("close_btn"), null)
                .setPositiveButton(tr("remove"), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        JSONArray ids = playlist.optJSONArray("trackIds");
                        JSONArray remaining = new JSONArray();
                        if (ids != null) for (int i = 0; i < ids.length(); i++) {
                            String id = ids.optString(i);
                            if (!id.equals(track.optString("id"))) remaining.put(id);
                        }
                        try { playlist.put("trackIds", remaining); database.savePlaylist(playlist); }
                        catch (Exception ignored) { }
                        screen = "playlists";
                        openPlaylist(playlist);
                    }
                }).show();
    }

    private JSONObject findPlaylist(String id) {
        if (id == null) return null;
        for (JSONObject playlist : playlists) if (id.equals(playlist.optString("id"))) return playlist;
        return null;
    }

    private void exportPlaylist(JSONObject playlist) {
        JSONArray ids = playlist.optJSONArray("trackIds");
        ArrayList<JSONObject> tracks = new ArrayList<JSONObject>();
        if (ids != null) for (int i = 0; i < ids.length(); i++) {
            int index = indexOfId(allTracks, ids.optString(i, ""));
            if (index >= 0) tracks.add(allTracks.get(index));
        }
        sortTracks(tracks, playlist.optString("sort", "stars"));
        StringBuilder m3u = new StringBuilder("#EXTM3U\n");
        for (JSONObject track : tracks) {
            String uri = track.optString("localAudioUri", track.optString("deviceUri", track.optString("uri", "")));
            m3u.append("#EXTINF:").append(Math.max(0, track.optLong("duration", 0) / 1000)).append(',')
                    .append(track.optString("artist", "")).append(" - ")
                    .append(track.optString("title", "Audio")).append('\n')
                    .append(uri).append('\n');
        }
        String name = playlist.optString("name", "Aurora").replaceAll("[^A-Za-z0-9 _-]", "_");
        try {
            java.io.File file = new java.io.File(ShareProvider.shareDir(this), name + ".m3u8");
            java.io.FileOutputStream output = new java.io.FileOutputStream(file);
            output.write(m3u.toString().getBytes("UTF-8"));
            output.close();
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType("audio/x-mpegurl");
            share.putExtra(Intent.EXTRA_STREAM, ShareProvider.uriFor(file.getName()));
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(share, tr("export_playlist_btn")));
        } catch (Exception e) {
            Toast.makeText(this, tr("toast_playlist_export_error"), Toast.LENGTH_LONG).show();
        }
    }

    private void openPlaylist(JSONObject playlist) {
        if (playlist == null) return;
        currentPlaylistId = playlist.optString("id", "");
        JSONArray ids = playlist.optJSONArray("trackIds");
        ArrayList<JSONObject> ordered = new ArrayList<JSONObject>();
        if (ids != null) {
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i, "");
                int index = indexOfId(allTracks, id);
                if (index >= 0) ordered.add(allTracks.get(index));
            }
        }
        sortTracks(ordered, playlist.optString("sort", "stars"));
        playQueue.clear();
        playQueue.addAll(ordered);
        originalQueue = new ArrayList<JSONObject>(playQueue);
        queueIndex = currentTrack == null ? 0 : Math.max(0, indexOfId(playQueue, currentTrack.optString("id")));
        screen = "playlist-detail";
        search.setVisibility(View.GONE);
        lyricsScroll.setVisibility(View.GONE);
        listView.setVisibility(View.VISIBLE);
        filterTracks("");
        if (playQueue.isEmpty()) Toast.makeText(this, tr("no_tracks_loaded"), Toast.LENGTH_SHORT).show();
    }

    private void offerAddToPlaylist(final JSONObject track) {
        if (playlists.isEmpty()) { createPlaylist(track); return; }
        String[] names = new String[playlists.size()];
        for (int i = 0; i < playlists.size(); i++) names[i] = playlists.get(i).optString("name", "Lista");
        new AlertDialog.Builder(this).setTitle("Añadir a una lista").setItems(names,
                new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface dialog, int which) {
                        JSONObject playlist = playlists.get(which);
                        JSONArray ids = playlist.optJSONArray("trackIds");
                        if (ids == null) ids = new JSONArray();
                        boolean exists = false;
                        for (int i = 0; i < ids.length(); i++) {
                            if (track.optString("id").equals(ids.optString(i))) exists = true;
                        }
                        if (!exists) ids.put(track.optString("id"));
                        try {
                            playlist.put("trackIds", ids);
                            database.savePlaylist(playlist);
                            loadStoredData();
                        } catch (Exception ignored) { }
                        Toast.makeText(NativeHomeActivity.this,
                                exists ? "La pista ya está en la lista"
                                        : "Añadida a " + playlist.optString("name"),
                                Toast.LENGTH_SHORT).show();
                    }
                }).show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        ticking = true;
        listView.post(ticker);
        if (visualizerEnabled) startVisualizer();
    }

    @Override
    protected void onPause() {
        ticking = false;
        uiHandler.removeCallbacks(lyricTicker);
        stopVisualizer();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        int uiFlags = getWindow().getDecorView().getSystemUiVisibility();
        if ((uiFlags & View.SYSTEM_UI_FLAG_FULLSCREEN) != 0) {
            getWindow().getDecorView().setSystemUiVisibility(originalSystemUiVisibility);
            return;
        }
        if ("lyrics".equals(screen)) {
            screen = screenBeforeLyrics;
            lyricsScroll.setVisibility(View.GONE);
            listView.setVisibility(View.VISIBLE);
            search.setVisibility("playlist-detail".equals(screen) || "playlists".equals(screen) ? View.GONE : View.VISIBLE);
            filterTracks(search.getText().toString());
        } else if ("playlist-detail".equals(screen)) {
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
        uiHandler.removeCallbacks(lyricTicker);
        stopVisualizer();
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
                subtitle = item.optString("artist", tr("unknown_artist"));
                if (item.optString("album", "").length() > 0) subtitle += " · " + item.optString("album");
                if (rating(item) > 0) subtitle += "   " + stars(rating(item));
                if (favorites.contains(item.optString("id"))) subtitle += "   ♥";
            }
            row.addView(text(title, 15, TEXT, true));
            row.addView(text(subtitle, 12, MUTED, false));
            return row;
        }
    }
}
