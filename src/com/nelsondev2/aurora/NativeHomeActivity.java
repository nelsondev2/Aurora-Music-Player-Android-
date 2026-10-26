package com.nelsondev2.aurora;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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
import android.widget.FrameLayout;
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
    private int BG = Color.rgb(5, 5, 9);
    private int SURFACE = Color.rgb(20, 20, 31);
    private int TEXT = Color.rgb(250, 249, 255);
    private int MUTED = Color.rgb(167, 165, 185);
    private int ACCENT = Color.rgb(157, 139, 255);

    private NativeLibraryDatabase database;
    private NativePlayerBridge player;
    private final ArrayList<JSONObject> allTracks = new ArrayList<JSONObject>();
    private final ArrayList<JSONObject> visibleTracks = new ArrayList<JSONObject>();
    private final ArrayList<JSONObject> playlists = new ArrayList<JSONObject>();
    private final ArrayList<JSONObject> playQueue = new ArrayList<JSONObject>();
    private final HashMap<String, Button> tabButtons = new HashMap<String, Button>();
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
    private Dialog fullPlayerDialog;
    private ImageView fullPlayerCover;
    private TextView fullPlayerTitle;
    private TextView fullPlayerArtist;
    private TextView fullPlayerElapsed;
    private TextView fullPlayerDuration;
    private SeekBar fullPlayerSeek;
    private Button fullPlayerPlay;
    private boolean fullPlayerSeeking;
    private String fullPlayerTrackId = "";
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
    private Typeface displayTypeface;
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
        try { displayTypeface = Typeface.createFromAsset(getAssets(), "www/fonts/outfit-latin-700.woff2"); }
        catch (Exception ignored) { displayTypeface = null; }
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
            TEXT = Color.rgb(28, 26, 42);
            MUTED = Color.rgb(105, 102, 124);
        } else if ("amoled".equals(themeName)) {
            BG = Color.BLACK;
            SURFACE = Color.rgb(10, 10, 14);
            TEXT = Color.rgb(250, 249, 255);
            MUTED = Color.rgb(159, 157, 178);
        } else {
            BG = Color.rgb(5, 5, 9);
            SURFACE = Color.rgb(20, 20, 31);
            TEXT = Color.rgb(250, 249, 255);
            MUTED = Color.rgb(167, 165, 185);
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
        updateNavigationTabs();
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
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{blend(BG, ACCENT, 0.10f), BG, Color.rgb(7, 7, 12)}));
        root.setPadding(dp(18), dp(12), dp(18), dp(10));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setOrientation(LinearLayout.HORIZONTAL);
        TextView logo = text("A", 18, Color.WHITE, true);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(accentGradient(dp(16)));
        logo.setElevation(dp(6));
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(42), dp(42));
        logoParams.rightMargin = dp(12);
        header.addView(logo, logoParams);
        LinearLayout wordmark = new LinearLayout(this);
        wordmark.setOrientation(LinearLayout.VERTICAL);
        wordmark.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = text(NativeText.text(this, "app_title"), 22, TEXT, true);
        if (displayTypeface != null) brand.setTypeface(displayTypeface);
        brand.setLetterSpacing(-0.025f);
        TextView brandSub = text("M U S I C   P L A Y E R", 8, MUTED, true);
        wordmark.addView(brand);
        wordmark.addView(brandSub);
        header.addView(wordmark, new LinearLayout.LayoutParams(0, dp(52), 1));
        addHeaderButton(header, "＋", tr("menu_load_music"), new View.OnClickListener() {

            @Override public void onClick(View v) { requestAudioPermission(); }
        });
        addHeaderButton(header, "⋮", tr("more_options"), new View.OnClickListener() {
            @Override public void onClick(View v) { showMoreMenu(v); }
        });
        root.addView(header);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setPadding(dp(4), dp(4), dp(4), dp(4));
        tabs.setBackground(roundedBackground(blend(SURFACE, Color.BLACK, 0.22f), dp(17), 0x18ffffff));
        addTab(tabs, NativeText.text(this, "nav_library"), "library");
        addTab(tabs, NativeText.text(this, "your_playlists"), "playlists");
        addTab(tabs, "+", "new-playlist");
        addTab(tabs, "⇧", "import");
        LinearLayout.LayoutParams tabsParams = new LinearLayout.LayoutParams(-1, dp(52));
        tabsParams.topMargin = dp(12);
        tabsParams.bottomMargin = dp(10);
        root.addView(tabs, tabsParams);
        visualizerView = new NativeVisualizerView(this);
        visualizerView.setColor(ACCENT);
        visualizerView.setVisibility(View.GONE);
        root.addView(visualizerView, new LinearLayout.LayoutParams(-1, dp(36)));

        search = new EditText(this);
        search.setSingleLine(true);
        search.setTextColor(TEXT);
        search.setHintTextColor(MUTED);
        search.setHint(NativeText.text(this, "search_placeholder"));
        search.setPadding(dp(4), 0, dp(12), 0);
        search.setBackgroundColor(Color.TRANSPARENT);
        search.setTextSize(14);
        search.setSingleLine(true);
        LinearLayout searchBox = new LinearLayout(this);
        searchBox.setGravity(Gravity.CENTER_VERTICAL);
        searchBox.setPadding(dp(14), 0, dp(6), 0);
        searchBox.setBackground(roundedBackground(blend(SURFACE, Color.WHITE, 0.025f), dp(17), 0x20ffffff));
        TextView searchIcon = text("⌕", 27, MUTED, false);
        searchBox.addView(searchIcon, new LinearLayout.LayoutParams(dp(30), -2));
        searchBox.addView(search, new LinearLayout.LayoutParams(0, -1, 1));
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, dp(50));
        searchParams.bottomMargin = dp(8);
        root.addView(searchBox, searchParams);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { filterTracks(s.toString()); }
            @Override public void afterTextChanged(Editable s) { }
        });

        listView = new ListView(this);
        listView.setDividerHeight(0);
        listView.setDivider(getDrawableColor(Color.TRANSPARENT));
        listView.setSelector(android.R.color.transparent);
        listView.setPadding(0, dp(2), 0, dp(6));
        listView.setClipToPadding(false);
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
        playerPanel.setPadding(dp(14), dp(12), dp(14), dp(10));
        playerPanel.setBackground(roundedBackground(blend(SURFACE, ACCENT, 0.035f), dp(22), 0x28ffffff));
        playerPanel.setElevation(dp(10));
        LinearLayout.LayoutParams panelParams = new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT);
        panelParams.topMargin = dp(8);
        root.addView(playerPanel, panelParams);
        LinearLayout nowPlaying = new LinearLayout(this);
        nowPlaying.setGravity(Gravity.CENTER_VERTICAL);
        coverImage = new ImageView(this);
        coverImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        coverImage.setBackground(roundedBackground(blend(ACCENT, BG, 0.68f), dp(14), 0x33ffffff));
        coverImage.setClipToOutline(true);
        coverImage.setElevation(dp(4));
        nowPlaying.addView(coverImage, new LinearLayout.LayoutParams(dp(58), dp(58)));
        LinearLayout currentInfo = new LinearLayout(this);
        currentInfo.setOrientation(LinearLayout.VERTICAL);
        currentInfo.setPadding(dp(12), 0, 0, 0);
        titleLine = text(NativeText.text(this, "load_track_to_start"), 16, TEXT, true);
        if (displayTypeface != null) titleLine.setTypeface(displayTypeface);
        artistLine = text(NativeText.text(this, "your_library"), 13, MUTED, false);
        currentInfo.addView(titleLine);
        currentInfo.addView(artistLine);
        nowPlaying.addView(currentInfo, new LinearLayout.LayoutParams(0, -2, 1));
        nowPlaying.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showFullPlayer(); }
        });
        coverImage.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showFullPlayer(); }
        });
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
        addControl(controls, "‹‹", tr("previous"), new View.OnClickListener() {
            @Override public void onClick(View v) { playRelative(-1); }
        });
        playButton = button("▶");
        playButton.setContentDescription(tr("play"));
        playButton.setTextSize(18);
        playButton.setTextColor(Color.WHITE);
        playButton.setBackground(accentGradient(dp(25)));
        playButton.setElevation(dp(7));
        controls.addView(playButton, new LinearLayout.LayoutParams(dp(54), dp(48)));
        playButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { togglePlayback(); }
        });
        addControl(controls, "››", tr("next"), new View.OnClickListener() {
            @Override public void onClick(View v) { playRelative(1); }
        });
        controls.setGravity(Gravity.CENTER);
        playerPanel.addView(controls);
        LinearLayout extras = new LinearLayout(this);
        extras.setGravity(Gravity.CENTER);
        lyricsButton = button("♫");
        lyricsButton.setContentDescription(tr("lyrics"));
        favoriteButton = button("♡");
        favoriteButton.setContentDescription(tr("favorite"));
        shuffleButton = button("⤨");
        shuffleButton.setContentDescription(tr("shuffle"));
        repeatButton = button("↻");
        repeatButton.setContentDescription(tr("repeat"));
        abButton = button("A-B");
        abButton.setContentDescription("AB repeat");
        Button[] extraButtons = {lyricsButton, favoriteButton, shuffleButton, repeatButton, abButton};
        for (Button extra : extraButtons) {
            extra.setTextSize(15);
            extra.setBackground(roundedBackground(blend(SURFACE, Color.WHITE, 0.04f), dp(13), 0x16ffffff));
            LinearLayout.LayoutParams extraParams = new LinearLayout.LayoutParams(0, dp(38), 1);
            extraParams.leftMargin = dp(3);
            extraParams.rightMargin = dp(3);
            extras.addView(extra, extraParams);
        }
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
        boolean action = "new-playlist".equals(destination) || "import".equals(destination);
        tab.setTextSize(action ? 21 : 11);
        tab.setContentDescription("new-playlist".equals(destination) ? tr("new_playlist")
                : ("import".equals(destination) ? tr("load_music") : label));
        tab.setBackground(roundedBackground("library".equals(destination)
                ? blend(ACCENT, Color.BLACK, 0.20f) : Color.TRANSPARENT, dp(13), 0));
        tab.setTextColor("library".equals(destination) ? Color.WHITE : MUTED);
        if ("library".equals(destination) || "playlists".equals(destination)) tabButtons.put(destination, tab);
        tabs.addView(tab, new LinearLayout.LayoutParams(0, -1, action ? 0.52f : 1f));
        tab.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if ("import".equals(destination)) { chooseAudioFiles(); return; }
                if ("new-playlist".equals(destination)) { createPlaylist(); return; }
                screen = destination;
                updateNavigationTabs();
                lyricsScroll.setVisibility(View.GONE);
                listView.setVisibility(View.VISIBLE);
                if ("library".equals(screen)) search.setVisibility(View.VISIBLE);
                else search.setVisibility(View.GONE);
                filterTracks(search.getText().toString());
            }
        });
    }

    private void updateNavigationTabs() {
        String selected = ("playlists".equals(screen) || "playlist-detail".equals(screen))
                ? "playlists" : "library";
        for (String destination : tabButtons.keySet()) {
            Button tab = tabButtons.get(destination);
            boolean active = destination.equals(selected);
            tab.setTextColor(active ? Color.WHITE : MUTED);
            tab.setBackground(roundedBackground(active ? blend(ACCENT, Color.BLACK, 0.20f)
                    : Color.TRANSPARENT, dp(13), 0));
        }
    }

    private void addHeaderButton(LinearLayout parent, String label, String description,
                                View.OnClickListener listener) {
        Button b = button(label);
        b.setTextSize(22);
        b.setContentDescription(description);
        b.setBackground(roundedBackground(blend(SURFACE, Color.WHITE, 0.035f), dp(16), 0x22ffffff));
        parent.addView(b, new LinearLayout.LayoutParams(dp(44), dp(44)));
        b.setOnClickListener(listener);
    }

    private void addControl(LinearLayout parent, String label, String description,
                            View.OnClickListener listener) {
        Button b = button(label);
        b.setTextSize(20);
        b.setContentDescription(description);
        b.setBackground(roundedBackground(blend(SURFACE, Color.WHITE, 0.04f), dp(18), 0x16ffffff));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1);
        params.leftMargin = dp(4);
        params.rightMargin = dp(4);
        parent.addView(b, params);
        b.setOnClickListener(listener);
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(12);
        b.setTextColor(TEXT);
        b.setAllCaps(false);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(dp(8), 0, dp(8), 0);
        b.setBackground(roundedBackground(blend(SURFACE, Color.WHITE, 0.035f), dp(14), 0x22ffffff));
        return b;
    }

    private GradientDrawable roundedBackground(int color, int radius, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        if (strokeColor != 0) drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private GradientDrawable accentGradient(int radius) {
        GradientDrawable drawable = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{blend(ACCENT, Color.WHITE, 0.10f), ACCENT, blend(ACCENT, Color.BLACK, 0.20f)});
        drawable.setCornerRadius(radius);
        return drawable;
    }

    private int blend(int base, int overlay, float amount) {
        float a = Math.max(0f, Math.min(1f, amount));
        int r = Math.round(Color.red(base) * (1f - a) + Color.red(overlay) * a);
        int g = Math.round(Color.green(base) * (1f - a) + Color.green(overlay) * a);
        int b = Math.round(Color.blue(base) * (1f - a) + Color.blue(overlay) * a);
        return Color.rgb(r, g, b);
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
            shuffleButton.setText(shuffleEnabled ? "⤨ ✓" : "⤨");
            shuffleButton.setTextColor(shuffleEnabled ? ACCENT : TEXT);
        }
        if (repeatButton != null) {
            String mode = "all".equals(repeatMode) ? "∞" : ("one".equals(repeatMode) ? "1" : "↻");
            repeatButton.setText(mode);
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
        favoriteButton.setText(liked ? "♥" : "♡");
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
            playButton.setText(playing ? "Ⅱ" : "▶");
            playButton.setContentDescription(playing ? tr("pause") : tr("play"));
            updateModeButtons();
            updateFavoriteButton();
            if (lyricsButton != null) lyricsButton.setEnabled(currentTrack.opt("lrc") != null);
            long duration = Math.max(0L, Math.round(player.duration()));
            long position = Math.max(0L, Math.round(player.position()));
            if (!userSeeking) seekBar.setProgress(duration > 0 ? (int) Math.min(1000, position * 1000 / duration) : 0);
            elapsedLine.setText(time(position));
            durationLine.setText(time(duration));
        } else {
            playButton.setText("▶");
            playButton.setContentDescription(tr("play"));
        }
        updateFullPlayerControls();
    }

    private void showFullPlayer() {
        if (currentTrack == null) return;
        final Dialog dialog = new Dialog(this);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER_HORIZONTAL);
        page.setPadding(dp(22), dp(18), dp(22), dp(18));
        page.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{blend(BG, ACCENT, 0.25f), BG, Color.rgb(5, 5, 9)}));

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        Button close = button("⌄");
        close.setTextSize(25);
        close.setBackground(roundedBackground(blend(SURFACE, Color.WHITE, 0.06f), dp(16), 0x22ffffff));
        close.setContentDescription(tr("close_btn"));
        top.addView(close, new LinearLayout.LayoutParams(dp(46), dp(44)));
        LinearLayout captionBox = new LinearLayout(this);
        captionBox.setOrientation(LinearLayout.VERTICAL);
        captionBox.setGravity(Gravity.CENTER);
        TextView caption = text("NOW PLAYING", 10, MUTED, true);
        caption.setLetterSpacing(0.18f);
        TextView context = text(tr("your_library"), 12, TEXT, true);
        captionBox.addView(caption);
        captionBox.addView(context);
        top.addView(captionBox, new LinearLayout.LayoutParams(0, -2, 1));
        Button queue = button("☷");
        queue.setTextSize(21);
        queue.setContentDescription(tr("queue"));
        queue.setBackground(roundedBackground(blend(SURFACE, Color.WHITE, 0.06f), dp(16), 0x22ffffff));
        top.addView(queue, new LinearLayout.LayoutParams(dp(46), dp(44)));
        page.addView(top, new LinearLayout.LayoutParams(-1, dp(48)));

        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int artSize = Math.max(dp(220), Math.min(dp(330), screenWidth - dp(68)));
        FrameLayout artFrame = new FrameLayout(this);
        artFrame.setBackground(accentGradient(dp(27)));
        artFrame.setClipToOutline(true);
        artFrame.setElevation(dp(22));
        fullPlayerCover = new ImageView(this);
        fullPlayerCover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        artFrame.addView(fullPlayerCover, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout.LayoutParams artParams = new LinearLayout.LayoutParams(artSize, artSize);
        artParams.topMargin = dp(20);
        artParams.bottomMargin = dp(22);
        page.addView(artFrame, artParams);

        fullPlayerTitle = text("", 24, TEXT, true);
        if (displayTypeface != null) fullPlayerTitle.setTypeface(displayTypeface);
        fullPlayerTitle.setGravity(Gravity.CENTER);
        fullPlayerTitle.setMaxLines(2);
        fullPlayerTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
        fullPlayerArtist = text("", 14, MUTED, false);
        fullPlayerArtist.setGravity(Gravity.CENTER);
        fullPlayerArtist.setPadding(0, dp(3), 0, 0);
        page.addView(fullPlayerTitle, new LinearLayout.LayoutParams(-1, -2));
        page.addView(fullPlayerArtist, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout starsRow = new LinearLayout(this);
        starsRow.setGravity(Gravity.CENTER);
        for (int i = 1; i <= 5; i++) {
            final int value = i;
            Button star = button(rating(currentTrack) >= i ? "★" : "☆");
            star.setTextSize(19);
            star.setTextColor(rating(currentTrack) >= i ? ACCENT : MUTED);
            star.setBackgroundColor(Color.TRANSPARENT);
            star.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { setRating(currentTrack, value); }
            });
            starsRow.addView(star, new LinearLayout.LayoutParams(dp(42), dp(38)));
        }
        LinearLayout.LayoutParams starsParams = new LinearLayout.LayoutParams(-2, dp(40));
        starsParams.topMargin = dp(5);
        page.addView(starsRow, starsParams);

        LinearLayout progress = new LinearLayout(this);
        progress.setOrientation(LinearLayout.VERTICAL);
        progress.setPadding(dp(2), dp(9), dp(2), 0);
        fullPlayerSeek = new SeekBar(this);
        fullPlayerSeek.setMax(1000);
        fullPlayerSeek.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        fullPlayerSeek.setThumbTintList(android.content.res.ColorStateList.valueOf(TEXT));
        progress.addView(fullPlayerSeek, new LinearLayout.LayoutParams(-1, dp(34)));
        LinearLayout times = new LinearLayout(this);
        times.setGravity(Gravity.CENTER_VERTICAL);
        fullPlayerElapsed = text("0:00", 11, MUTED, false);
        fullPlayerDuration = text("0:00", 11, MUTED, false);
        times.addView(fullPlayerElapsed, new LinearLayout.LayoutParams(0, -2, 1));
        times.addView(fullPlayerDuration);
        progress.addView(times);
        page.addView(progress, new LinearLayout.LayoutParams(-1, -2));
        fullPlayerSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int value, boolean fromUser) { }
            @Override public void onStartTrackingTouch(SeekBar bar) { fullPlayerSeeking = true; }
            @Override public void onStopTrackingTouch(SeekBar bar) {
                fullPlayerSeeking = false;
                if (currentTrack != null) player.seekTo(bar.getProgress() * player.duration() / 1000.0);
            }
        });

        LinearLayout controls = new LinearLayout(this);
        controls.setGravity(Gravity.CENTER);
        addFullPlayerControl(controls, "⤨", tr("shuffle"), new View.OnClickListener() {
            @Override public void onClick(View v) { toggleShuffle(); }
        }, 44);
        addFullPlayerControl(controls, "‹‹", tr("previous"), new View.OnClickListener() {
            @Override public void onClick(View v) { playRelative(-1); }
        }, 52);
        fullPlayerPlay = button("▶");
        fullPlayerPlay.setTextSize(20);
        fullPlayerPlay.setTextColor(Color.WHITE);
        fullPlayerPlay.setBackground(accentGradient(dp(31)));
        fullPlayerPlay.setElevation(dp(10));
        fullPlayerPlay.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { togglePlayback(); }
        });
        controls.addView(fullPlayerPlay, new LinearLayout.LayoutParams(dp(62), dp(62)));
        addFullPlayerControl(controls, "››", tr("next"), new View.OnClickListener() {
            @Override public void onClick(View v) { playRelative(1); }
        }, 52);
        addFullPlayerControl(controls, "↻", tr("repeat"), new View.OnClickListener() {
            @Override public void onClick(View v) { cycleRepeat(); }
        }, 44);
        LinearLayout.LayoutParams controlsParams = new LinearLayout.LayoutParams(-1, dp(68));
        controlsParams.topMargin = dp(12);
        page.addView(controls, controlsParams);

        LinearLayout secondary = new LinearLayout(this);
        secondary.setGravity(Gravity.CENTER);
        addFullPlayerAction(secondary, "♫", tr("lyrics"), new View.OnClickListener() {
            @Override public void onClick(View v) { dialog.dismiss(); showLyrics(); }
        });
        addFullPlayerAction(secondary, "♡", tr("favorite"), new View.OnClickListener() {
            @Override public void onClick(View v) { toggleCurrentFavorite(); }
        });
        addFullPlayerAction(secondary, "☷", tr("queue"), new View.OnClickListener() {
            @Override public void onClick(View v) { showQueue(); }
        });
        addFullPlayerAction(secondary, "⋯", tr("options_title"), new View.OnClickListener() {
            @Override public void onClick(View v) { showSettings(); }
        });
        LinearLayout.LayoutParams secondaryParams = new LinearLayout.LayoutParams(-1, dp(48));
        secondaryParams.topMargin = dp(6);
        page.addView(secondary, secondaryParams);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.TRANSPARENT);
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));
        dialog.setContentView(scroll);
        dialog.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
            @Override public void onDismiss(android.content.DialogInterface ignored) {
                fullPlayerDialog = null;
                fullPlayerCover = null;
                fullPlayerSeek = null;
                fullPlayerPlay = null;
                fullPlayerTitle = null;
                fullPlayerArtist = null;
            }
        });
        fullPlayerDialog = dialog;
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            dialog.getWindow().setStatusBarColor(BG);
            dialog.getWindow().setNavigationBarColor(BG);
        }
        close.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { dialog.dismiss(); }
        });
        queue.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showQueue(); }
        });
        fullPlayerTrackId = "";
        updateFullPlayerControls();
    }

    private void addFullPlayerControl(LinearLayout row, String glyph, String description,
                                     View.OnClickListener listener, int size) {
        Button control = button(glyph);
        control.setTextSize(19);
        control.setContentDescription(description);
        control.setBackgroundColor(Color.TRANSPARENT);
        control.setOnClickListener(listener);
        row.addView(control, new LinearLayout.LayoutParams(dp(size), dp(52)));
    }

    private void addFullPlayerAction(LinearLayout row, String glyph, String label,
                                    View.OnClickListener listener) {
        LinearLayout action = new LinearLayout(this);
        action.setOrientation(LinearLayout.VERTICAL);
        action.setGravity(Gravity.CENTER);
        TextView icon = text(glyph, 18, ACCENT, true);
        TextView caption = text(label, 9, MUTED, true);
        action.addView(icon);
        action.addView(caption);
        action.setOnClickListener(listener);
        row.addView(action, new LinearLayout.LayoutParams(0, -1, 1));
    }

    private void updateFullPlayerControls() {
        if (fullPlayerDialog == null || !fullPlayerDialog.isShowing()) return;
        if (currentTrack == null) return;
        String id = currentTrack.optString("id", "");
        if (!id.equals(fullPlayerTrackId)) {
            fullPlayerTrackId = id;
            fullPlayerTitle.setText(currentTrack.optString("title", "(sin título)"));
            fullPlayerArtist.setText(currentTrack.optString("artist", tr("unknown_artist"))
                    + (currentTrack.optString("album", "").length() > 0
                    ? " · " + currentTrack.optString("album", "") : ""));
            String data = currentTrack.optString("coverThumbLg", currentTrack.optString("coverThumb", ""));
            boolean loaded = false;
            try {
                int comma = data.indexOf(',');
                if (comma >= 0) data = data.substring(comma + 1);
                if (data.length() > 0 && data.length() < 3 * 1024 * 1024) {
                    byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                    android.graphics.Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bitmap != null) { fullPlayerCover.setImageBitmap(bitmap); loaded = true; }
                }
            } catch (Exception ignored) { }
            if (!loaded) fullPlayerCover.setImageDrawable(accentGradient(dp(27)));
        }
        long duration = Math.max(0L, Math.round(player.duration()));
        long position = Math.max(0L, Math.round(player.position()));
        if (!fullPlayerSeeking) fullPlayerSeek.setProgress(duration > 0
                ? (int) Math.min(1000, position * 1000 / duration) : 0);
        fullPlayerElapsed.setText(time(position));
        fullPlayerDuration.setText(time(duration));
        boolean playing = player.isPlaying();
        fullPlayerPlay.setText(playing ? "Ⅱ" : "▶");
        fullPlayerPlay.setContentDescription(playing ? tr("pause") : tr("play"));
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
        coverImage.setImageDrawable(accentGradient(dp(14)));
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
        updateNavigationTabs();
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
            LinearLayout row = convertView instanceof LinearLayout
                    ? (LinearLayout) convertView : new LinearLayout(NativeHomeActivity.this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(10), dp(8), dp(12), dp(8));
            row.removeAllViews();
            JSONObject item = visibleTracks.get(position);
            boolean playlistRow = "playlists".equals(screen);
            boolean isCurrent = !playlistRow && currentTrack != null
                    && currentTrack.optString("id").equals(item.optString("id"));
            row.setBackground(roundedBackground(isCurrent ? blend(SURFACE, ACCENT, 0.18f) : blend(SURFACE, Color.WHITE, 0.018f),
                    dp(17), isCurrent ? blend(ACCENT, Color.TRANSPARENT, 0.25f) : 0x15ffffff));
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, dp(72));
            rowParams.bottomMargin = dp(7);
            row.setLayoutParams(rowParams);

            FrameLayout cover = new FrameLayout(NativeHomeActivity.this);
            GradientDrawable coverShape = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                    new int[]{blend(ACCENT, Color.rgb(255, 125, 181), 0.18f), blend(ACCENT, Color.BLACK, 0.38f)});
            coverShape.setCornerRadius(dp(13));
            cover.setBackground(coverShape);
            cover.setClipToOutline(true);
            ImageView artwork = new ImageView(NativeHomeActivity.this);
            artwork.setScaleType(ImageView.ScaleType.CENTER_CROP);
            String coverData = playlistRow ? "" : item.optString("coverThumb", item.optString("coverThumbLg", ""));
            boolean loadedArtwork = false;
            if (coverData.length() > 0 && coverData.length() < 900000) {
                try {
                    int comma = coverData.indexOf(',');
                    if (comma >= 0) coverData = coverData.substring(comma + 1);
                    byte[] bytes = Base64.decode(coverData, Base64.DEFAULT);
                    android.graphics.Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bitmap != null) { artwork.setImageBitmap(bitmap); loadedArtwork = true; }
                } catch (Exception ignored) { }
            }
            cover.addView(artwork, new FrameLayout.LayoutParams(-1, -1));
            if (!loadedArtwork) {
                TextView glyph = text(playlistRow ? "♫" : "♪", 24, Color.WHITE, true);
                glyph.setGravity(Gravity.CENTER);
                cover.addView(glyph, new FrameLayout.LayoutParams(-1, -1));
            }
            LinearLayout.LayoutParams coverParams = new LinearLayout.LayoutParams(dp(54), dp(54));
            coverParams.rightMargin = dp(12);
            row.addView(cover, coverParams);

            LinearLayout info = new LinearLayout(NativeHomeActivity.this);
            info.setOrientation(LinearLayout.VERTICAL);
            info.setGravity(Gravity.CENTER_VERTICAL);
            info.setPadding(0, dp(1), 0, dp(1));
            String title;
            String subtitle;
            if (playlistRow) {
                title = item.optString("name", tr("your_playlists"));
                JSONArray ids = item.optJSONArray("trackIds");
                subtitle = (ids == null ? 0 : ids.length()) + "  ·  " + tr("queue_title");
            } else {
                title = item.optString("title", "(sin título)");
                subtitle = item.optString("artist", tr("unknown_artist"));
                if (item.optString("album", "").length() > 0) subtitle += "  ·  " + item.optString("album");
                if (rating(item) > 0) subtitle += "   " + stars(rating(item));
                if (favorites.contains(item.optString("id"))) subtitle += "   ♥";
            }
            TextView titleView = text(title, 14, isCurrent ? ACCENT : TEXT, true);
            if (displayTypeface != null) titleView.setTypeface(displayTypeface);
            titleView.setMaxLines(1);
            titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
            TextView subtitleView = text(subtitle, 11, MUTED, false);
            subtitleView.setMaxLines(1);
            subtitleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
            info.addView(titleView);
            info.addView(subtitleView);
            row.addView(info, new LinearLayout.LayoutParams(0, -1, 1));

            TextView more = text(playlistRow ? "›" : "⋮", playlistRow ? 26 : 19, MUTED, true);
            more.setGravity(Gravity.CENTER);
            row.addView(more, new LinearLayout.LayoutParams(dp(28), -1));
            return row;
        }
    }
}
