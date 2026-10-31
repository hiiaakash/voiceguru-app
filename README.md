# Voice Guru (Android)

Offline voice coach. Record your voice, get an analysis of pitch, volume, pace, pauses and
how long you can hold a steady note, and follow a level-by-level exercise plan (breathing,
clarity/articulation, pace, pitch/expression, volume/steadiness, English-accent shadowing).
Each level has a **voice test** — your recorded metrics must reach the target to unlock the
next level. Includes live pitch/volume meters, an intonation graph, an offline **Ask Advisor**
(search over built-in voice knowledge), a **Voice Tutor** guidance section, a **Diet** section,
**speaking scenarios** (self-intro, phone call, IQ answer), **games** (catch-the-pitch,
tongue-twister speed), a **progress** dashboard with saved recordings, backup/restore, and a
progress-report PDF. Everything runs on the phone — no internet, no servers; recordings and
data stay only on the device.

Made by Aakash Sharma · cse211901204@gmail.com

## What is inside
- `app/src/main/assets/www/` — the whole app (HTML/JS/CSS).
  - `audio.js` — offline voice analysis (pitch via autocorrelation, RMS volume, voice-activity
    detection for pauses/pace, sustain and tremor). Pure DSP, no model, no network.
  - `content.js` — levels/exercises, tutor guidance, diet, accent lessons, scenarios,
    tongue-twisters and the Ask knowledge base.
  - `i18n.js` — UI text in Hinglish / Hindi / English.
  - `app.js` — screens, microphone capture, live meters, analysis display, games, progress,
    backup and PDF.
- `app/src/main/java/com/voiceguru/app/MainActivity.java` — WebView shell: serves the assets
  offline from a private https origin, grants microphone access to the WebView (getUserMedia),
  requests the `RECORD_AUDIO` runtime permission, file picker for restore, `saveFile`,
  `printHtml` (Save as PDF), and a text-to-speech bridge for reference audio.
- `.github/workflows/build-apk.yml` — builds the APK on GitHub Actions (no Python/Pyodide step).
- `source/` — a copy of the web source.

## Build the APK with GitHub Actions
1. Push this project to a GitHub repository.
2. (Optional, recommended) Add these 4 repository secrets so the APK is signed with a stable
   key (updates install over the old app and keep data): `KEY_ALIAS`, `KEYSTORE_PASSWORD`,
   `KEY_PASSWORD`, `KEYSTORE_BASE64`. Without them an unsigned debug APK is built.
3. Open **Actions → Build Voice Guru APK → Run workflow**.
4. Download `VoiceGuru-APK` from the run's Artifacts.

## Notes
- The microphone permission is asked once on first launch; voice analysis needs it.
- The launcher icon is a placeholder carried over from the app template and can be replaced.
- Offline analysis measures pitch/volume/pace/sustain — it does not score exact pronunciation
  or detect stammering; accent improves through teaching + shadowing (listen, repeat, compare).

## Tech
minSdk 24, targetSdk 35, AGP 8.7.3, Gradle 8.9, JDK 17.
