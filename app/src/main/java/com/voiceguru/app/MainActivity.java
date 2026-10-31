package com.voiceguru.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Voice Guru - Android shell.
 * The tutor (HTML/JS + offline Python via Pyodide) lives in assets/www and is served from a
 * private https origin so that ES modules, web workers and WebAssembly work offline.
 * Progress is stored in the WebView's localStorage / IndexedDB on the phone only.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.voiceguru.local";
    private static final String ORIGIN = "https://" + HOST + "/";
    private static final int REQ_FILE = 41;
    private static final int REQ_SAVE = 42;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSaveData;
    private WebView printView;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private volatile String chosenVoice = null;

    // Native microphone (Android AudioRecord) - works even where WebView getUserMedia fails.
    private static final int REQ_MIC = 8;
    private final Object micLock = new Object();
    private AudioRecord rec;
    private Thread recThread;
    private volatile boolean recOn = false;

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("wasm", "application/wasm");
        MIME.put("zip", "application/zip");
        MIME.put("png", "image/png");
        MIME.put("svg", "image/svg+xml");
        MIME.put("txt", "text/plain");
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#13111C"));
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applySystemBarInsets(root);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7);
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new AppBridge(), "AndroidApp");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!HOST.equals(u.getHost())) {
                    return null;
                }
                return serveAsset(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) {
                    return false;
                }
                openOutside(uri);
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    for (String res : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                            return;
                        }
                    }
                    request.deny();
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Choose file"), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        tts = new TextToSpeech(this, status -> ttsReady = status == TextToSpeech.SUCCESS);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) { }

            @Override
            public void onDone(String id) {
                if (id != null && id.endsWith("#last")) {
                    jsCall("window.__ttsDone&&window.__ttsDone()");
                }
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onError(String id) {
                if (id != null && id.endsWith("#last")) {
                    jsCall("window.__ttsDone&&window.__ttsDone()");
                }
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        }
        if (webView.getUrl() == null) {
            webView.loadUrl(ORIGIN + "index.html");
        }
    }

    /** Starts the phone microphone. Returns "ok:RATE", "perm" (permission asked) or "err:REASON". */
    private String startNativeMic() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC));
            return "perm";
        }
        synchronized (micLock) {
            stopNativeMicLocked();
            int[] sources = {MediaRecorder.AudioSource.MIC, MediaRecorder.AudioSource.VOICE_RECOGNITION,
                    MediaRecorder.AudioSource.DEFAULT, MediaRecorder.AudioSource.CAMCORDER};
            int[] rates = {44100, 48000, 16000, 22050, 8000};
            String last = "init";
            for (int src : sources) {
                for (int rate : rates) {
                    int min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                    if (min <= 0) {
                        continue;
                    }
                    AudioRecord r = null;
                    try {
                        r = new AudioRecord(src, rate, AudioFormat.CHANNEL_IN_MONO,
                                AudioFormat.ENCODING_PCM_16BIT, Math.max(min, 8192) * 2);
                        if (r.getState() != AudioRecord.STATE_INITIALIZED) {
                            r.release();
                            last = "notinit";
                            continue;
                        }
                        r.startRecording();
                        if (r.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                            r.release();
                            last = "busy";
                            continue;
                        }
                        rec = r;
                        recOn = true;
                        startReader(r);
                        return "ok:" + rate;
                    } catch (Exception e) {
                        last = e.getClass().getSimpleName();
                        if (r != null) {
                            try {
                                r.release();
                            } catch (Exception ignored) {
                                // already released
                            }
                        }
                    }
                }
            }
            return "err:" + last;
        }
    }

    /** Reads mic audio on a background thread and hands 16-bit PCM chunks (base64) to the page. */
    private void startReader(final AudioRecord r) {
        recThread = new Thread(() -> {
            short[] buf = new short[2048];
            byte[] bytes = new byte[4096];
            while (recOn) {
                int n;
                try {
                    n = r.read(buf, 0, buf.length);
                } catch (Exception e) {
                    break;
                }
                if (n < 0) {
                    break;
                }
                if (n == 0) {
                    continue;
                }
                for (int i = 0; i < n; i++) {
                    bytes[2 * i] = (byte) (buf[i] & 0xff);
                    bytes[2 * i + 1] = (byte) ((buf[i] >> 8) & 0xff);
                }
                String b64 = Base64.encodeToString(bytes, 0, n * 2, Base64.NO_WRAP);
                jsCall("window.__nativeMic&&window.__nativeMic('" + b64 + "')");
            }
        }, "vg-mic");
        recThread.start();
    }

    private void stopNativeMic() {
        synchronized (micLock) {
            stopNativeMicLocked();
        }
    }

    private void stopNativeMicLocked() {
        recOn = false;
        if (recThread != null) {
            try {
                recThread.join(300);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            recThread = null;
        }
        if (rec != null) {
            try {
                rec.stop();
            } catch (Exception ignored) {
                // not recording
            }
            try {
                rec.release();
            } catch (Exception ignored) {
                // already released
            }
            rec = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_MIC) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            jsCall("window.__micPerm&&window.__micPerm(" + ok + ")");
        }
    }

    /** Serves files from assets/www with correct MIME types (needed for .mjs and .wasm). */
    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) {
            path = "/index.html";
        }
        if (path.contains("..")) {
            return notFound();
        }
        String file = "www" + path;
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = getAssets().open(file);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            boolean text = mime.startsWith("text/") || mime.equals("application/json");
            return new WebResourceResponse(mime, text ? "utf-8" : null, 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(),
                new java.io.ByteArrayInputStream(new byte[0]));
    }

    private void openOutside(Uri uri) {
        try {
            String scheme = uri.getScheme();
            Intent i = "mailto".equals(scheme) ? new Intent(Intent.ACTION_SENDTO, uri) : new Intent(Intent.ACTION_VIEW, uri);
            startActivity(i);
        } catch (Exception ignored) {
            // no app can open this link
        }
    }

    private void jsCall(final String js) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript(js, null);
            }
        });
    }

    /** Keeps the app clear of the status bar, navigation bar and keyboard (edge-to-edge on Android 15+). */
    private void applySystemBarInsets(final View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left;
            int top;
            int right;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                left = bars.left;
                top = bars.top;
                right = bars.right;
                bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
        } else if (requestCode == REQ_SAVE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSaveData != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    if (os != null) {
                        os.write(pendingSaveData.getBytes(StandardCharsets.UTF_8));
                    }
                    jsCall("window.CG&&CG.copy&&0;(function(){var t=document.getElementById('toast');if(t){t.textContent='\\u2705 Saved';t.className='toast show';setTimeout(function(){t.className='toast'},2000)}})()");
                } catch (IOException ignored) {
                    // could not write file
                }
            }
            pendingSaveData = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    /** Hardware back: let the app go back a screen; close only from the home screen. */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return window.__androidBack?window.__androidBack():'exit'}catch(e){return 'exit'}})()",
                value -> {
                    if (value == null || value.contains("exit")) {
                        finish();
                    }
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (recOn) {
            stopNativeMic();
            jsCall("window.__nativeMicLost&&window.__nativeMicLost()");
        }
        if (tts != null) {
            tts.stop();
        }
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        stopNativeMic();
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /** Prints an HTML page through Android's print service (the user can choose "Save as PDF"). */
    private void printHtmlPage(final String html, final String title) {
        printView = new WebView(this);
        printView.getSettings().setJavaScriptEnabled(false);
        printView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm != null) {
                    String job = title == null || title.isEmpty() ? "Voice Guru" : title;
                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(job);
                    pm.print(job, adapter, new PrintAttributes.Builder().build());
                }
            }
        });
        printView.loadDataWithBaseURL(ORIGIN, html, "text/html", "utf-8", null);
    }

    /** Splits long text into pieces the TTS engine accepts. */
    private static List<String> chunks(String text, int max) {
        List<String> out = new ArrayList<>();
        String[] parts = text.split("(?<=[.!?।])\\s+");
        StringBuilder cur = new StringBuilder();
        for (String p : parts) {
            if (cur.length() + p.length() + 1 > max && cur.length() > 0) {
                out.add(cur.toString());
                cur.setLength(0);
            }
            while (p.length() > max) {
                out.add(p.substring(0, max));
                p = p.substring(max);
            }
            if (cur.length() > 0) {
                cur.append(' ');
            }
            cur.append(p);
        }
        if (cur.length() > 0) {
            out.add(cur.toString());
        }
        return out;
    }

    private Voice findVoice(String name) {
        try {
            Set<Voice> vs = tts == null ? null : tts.getVoices();
            if (vs == null) {
                return null;
            }
            for (Voice v : vs) {
                if (v != null && name.equals(v.getName())) {
                    return v;
                }
            }
        } catch (Exception ignored) {
            // engine not ready
        }
        return null;
    }

    private static String jsonEsc(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder b = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') {
                b.append('\\').append(c);
            } else if (c >= 32) {
                b.append(c);
            }
        }
        return b.toString();
    }

    /** Functions the tutor page can call. */
    private class AppBridge {
        /** All TTS voices as JSON: name, lang, q (quality), lat, net (needs internet), inst (installed). */
        @JavascriptInterface
        public String voices() {
            if (tts == null || !ttsReady) {
                return "[]";
            }
            try {
                Set<Voice> vs = tts.getVoices();
                if (vs == null) {
                    return "[]";
                }
                StringBuilder sb = new StringBuilder("[");
                boolean first = true;
                for (Voice v : vs) {
                    if (v == null || v.getLocale() == null) {
                        continue;
                    }
                    Set<String> f = v.getFeatures();
                    boolean notInst = f != null && f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
                    if (!first) {
                        sb.append(',');
                    }
                    first = false;
                    sb.append("{\"name\":\"").append(jsonEsc(v.getName()))
                            .append("\",\"lang\":\"").append(jsonEsc(v.getLocale().toLanguageTag()))
                            .append("\",\"q\":").append(v.getQuality())
                            .append(",\"lat\":").append(v.getLatency())
                            .append(",\"net\":").append(v.isNetworkConnectionRequired())
                            .append(",\"inst\":").append(!notInst).append('}');
                }
                return sb.append(']').toString();
            } catch (Exception e) {
                return "[]";
            }
        }

        /** Keeps the screen on during practice (lessons, riyaz, songs), off otherwise. */
        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(() -> {
                if (on) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void setVoice(String name) {
            chosenVoice = (name == null || name.isEmpty()) ? null : name;
        }

        /** Opens the phone's Text-to-speech settings (to download better offline voices). */
        @JavascriptInterface
        public void openTtsSettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent("com.android.settings.TTS_SETTINGS"));
                } catch (Exception e) {
                    try {
                        startActivity(new Intent("android.settings.SETTINGS"));
                    } catch (Exception ignored) {
                        // no settings screen
                    }
                }
            });
        }

        @JavascriptInterface
        public String micStart() {
            return startNativeMic();
        }

        @JavascriptInterface
        public void micStop() {
            stopNativeMic();
        }

        @JavascriptInterface
        public void speak(final String text, final String lang, final double rate) {
            speakTry(text, lang, rate, 0);
        }

        /** Waits (up to ~4 s) for the TTS engine to finish starting, so the tutor's first words are not lost. */
        private void speakTry(final String text, final String lang, final double rate, final int tries) {
            runOnUiThread(() -> {
                if (tts != null && !ttsReady && tries < 10 && text != null && !text.trim().isEmpty()) {
                    webView.postDelayed(() -> speakTry(text, lang, rate, tries + 1), 400);
                    return;
                }
                if (tts == null || !ttsReady || text == null || text.trim().isEmpty()) {
                    jsCall("window.__ttsDone&&window.__ttsDone()");
                    return;
                }
                boolean voiceSet = false;
                if (chosenVoice != null) {
                    Voice v = findVoice(chosenVoice);
                    if (v != null) {
                        try {
                            voiceSet = tts.setVoice(v) == TextToSpeech.SUCCESS;
                        } catch (Exception ignored) {
                            voiceSet = false;
                        }
                    }
                }
                if (!voiceSet) {
                    Locale loc = Locale.forLanguageTag(lang == null ? "en-IN" : lang);
                    int r = tts.setLanguage(loc);
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setLanguage(Locale.ENGLISH);
                    }
                }
                tts.setSpeechRate((float) Math.max(0.5, Math.min(2.0, rate)));
                tts.stop();
                List<String> parts = chunks(text, Math.max(200, TextToSpeech.getMaxSpeechInputLength() - 50));
                for (int i = 0; i < parts.size(); i++) {
                    String id = "cg" + i + (i == parts.size() - 1 ? "#last" : "");
                    tts.speak(parts.get(i), i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, id);
                }
            });
        }

        @JavascriptInterface
        public void printHtml(final String html, final String title) {
            runOnUiThread(() -> printHtmlPage(html, title));
        }

        @JavascriptInterface
        public void stopSpeak() {
            runOnUiThread(() -> {
                if (tts != null) {
                    tts.stop();
                }
            });
        }

        @JavascriptInterface
        public void copyText(final String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("Voice Guru", text));
                }
            });
        }

        @JavascriptInterface
        public void shareText(final String title, final String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_SUBJECT, title);
                send.putExtra(Intent.EXTRA_TEXT, text);
                try {
                    startActivity(Intent.createChooser(send, title));
                } catch (Exception ignored) {
                    // nothing to share with
                }
            });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String data, final String mime) {
            runOnUiThread(() -> {
                pendingSaveData = data;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (ActivityNotFoundException e) {
                    pendingSaveData = null;
                    shareText(name, data);
                }
            });
        }
    }
}
