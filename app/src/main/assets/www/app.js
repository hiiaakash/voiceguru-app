/* Voice Guru - main app. Offline voice coach: levels -> exercises -> record & analyze. */
(function () {
  "use strict";
  const APP = { name: "Voice Guru", version: "2.1", dev: "Aakash Sharma", email: "cse211901204@gmail.com" };
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const LANGS = { hinglish: "Hinglish", english: "English" };
  const C = window.VG_CONTENT, AUD = window.VG_AUDIO;
  const SKETCH = (k) => (k && window.VG_SKETCH ? `<div class="skbox">${window.VG_SKETCH.render(k)}</div>` : "");
  const cssVar = (n) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888"; } catch (e) { return "#888"; } };

  /* ---------- storage (phone only) ---------- */
  const KEY = "vg_state_v1";
  const def = () => ({ v: 1, lang: "hinglish", theme: "auto", tts: true, xp: 0,
    streak: { last: "", n: 0 }, prog: {}, best: {}, sa: 0, sing: {}, tutorRate: 0.95, hist: {}, histName: {}, voiceName: "", voiceAuto: true, singStyle: "human", classDays: {}, coins: 0, gp: {}, owned: ["bird"], char: "🐦" });
  let S = def();
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(def(), JSON.parse(raw)); } catch (e) { }
  if (S.lang !== "english" && S.lang !== "hinglish") S.lang = "hinglish"; // only two languages now
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
  const T = (k) => { const d = window.VG_I18N[S.lang] || window.VG_I18N.hinglish; return d[k] != null ? d[k] : (window.VG_I18N.english[k] || k); };
  const L = (o) => (o && typeof o === "object" ? (o[S.lang === "hindi" ? "hi" : S.lang === "english" ? "en" : "hi"] || o.hi || o.en || "") : (o || ""));
  // content uses hi/en; hinglish falls back to hi text (which is written mixed)
  const LC = (o) => { if (!o || typeof o !== "object") return o || ""; if (S.lang === "english") return o.en || o.hi || ""; return o.hi || o.en || ""; };

  /* IndexedDB for recordings (WAV blobs) */
  const DB = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => { let rq; try { rq = indexedDB.open("voiceguru", 1); } catch (e) { rej(e); return; }
        rq.onupgradeneeded = () => rq.result.createObjectStore("recs", { keyPath: "id" });
        rq.onsuccess = () => { this.db = rq.result; res(this.db); }; rq.onerror = () => rej(rq.error); }); },
    async all() { try { const db = await this.open(); return await new Promise((res) => { const r = db.transaction("recs").objectStore("recs").getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); } catch (e) { return []; } },
    async put(v) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction("recs", "readwrite"); tx.objectStore("recs").put(v); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
    async del(k) { const db = await this.open(); return new Promise((res) => { const tx = db.transaction("recs", "readwrite"); tx.objectStore("recs").delete(k); tx.oncomplete = res; tx.onerror = res; }); },
  };
  let RECS = [];

  /* ---------- progress / levels ---------- */
  const levelById = (id) => C.LEVELS.find((l) => l.id === id);
  const passed = (id) => !!(S.prog[id] && S.prog[id].passed);
  const unlocked = (i) => i === 0 || passed(C.LEVELS[i - 1].id);
  function levelsCleared() { return C.LEVELS.filter((l) => passed(l.id)).length; }
  function touchStreak() { const t = today(); if (S.streak.last === t) return;
    const y = new Date(Date.now() - 864e5); const ys = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    S.streak.n = S.streak.last === ys ? S.streak.n + 1 : 1; S.streak.last = t; }
  function addXP(n) { if (!n) return; S.xp += n; touchStreak(); save(); toast("+" + n + " XP"); }

  /* ---------- UI helpers ---------- */
  const UI = { scr: "home", stack: [], a: null, modal: null, keep: 0 };
  function toast(m) { const t = $("toast"); if (!t) return; t.textContent = m; t.className = "toast show"; clearTimeout(UI.tt); UI.tt = setTimeout(() => { t.className = "toast"; }, 2000); }
  function applySet() { const r = document.documentElement; if (S.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", S.theme); r.lang = S.lang === "hindi" ? "hi" : "en"; }
  function go(scr, args) { if (!UI.inClass) UI.classQ = null; if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopMic(); stopSpeak(); if (UI.scr !== scr || args !== undefined) UI.stack.push({ scr: UI.scr, a: UI.a }); UI.scr = scr; if (args !== undefined) UI.a = args; UI.modal = null; render(); }
  function back() { if (UI.modal) { UI.modal = null; UI.keep = 1; render(); return "ok"; } UI.classQ = null; if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopMic(); stopSpeak();
    const p = UI.stack.pop(); if (!p) { if (UI.scr === "home") return "exit"; UI.scr = "home"; render(); return "ok"; } UI.scr = p.scr; UI.a = p.a; render(); return "ok"; }
  window.__androidBack = back;
  function goHome() { UI.classQ = null; stopMic(); stopSpeak(); UI.stack = []; UI.scr = "home"; UI.modal = null; render(); }
  function ask(msg, okLabel, fn) { UI.cb = fn; UI.modal = { msg: msg, ok: okLabel }; UI.keep = 1; render(); }

  /* ---------- Voice tutor (speaks + sings) ---------- */
  const TUT = window.VG_TUTOR;
  const MUS = () => window.VG_MUSIC;
  const DEFAULT_SA = 130.81; // C3 - changed by "Find your Sa"
  const FLOW = { sid: 0, rec: false, stopReq: false };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const alive = (sid) => sid === FLOW.sid;
  function speak(text, rate) { return runSteps([{ say: text, rate: rate }], FLOW.sid); }
  // stops tutor speech, tones, any running lesson and breathing timer
  function stopSpeak() { FLOW.sid++; FLOW.rec = false; FLOW.stopReq = false; FLOW.paused = false; TUT.stopAll(); clearInterval(UI.bt); clearInterval(UI.cueT); }
  /* global audio bar: Pause / Resume / Stop whenever the tutor talks or something plays */
  function abarUpdate() {
    const el = $("abar"); if (!el) return;
    const busy = TUT.isBusy() || (window.VG_MUSIC && VG_MUSIC.taalBusy()), inGame = UI.scr === "gameview" && UI.game && UI.game.stage === "play";
    const show = !FLOW.rec && !inGame && (FLOW.paused || busy); // games have their own ⏸ button
    el.style.display = show ? "flex" : "none"; if (!show) return;
    const t = $("abtxt"), b = $("abpause");
    if (t) t.textContent = FLOW.paused ? "⏸ " + T("paused") : (TUT.isSpeaking() ? "🗣️ " + T("tutorTalking") : "🎵 " + T("playing"));
    if (b) b.textContent = FLOW.paused ? "▶ " + T("resume") : "⏸ " + T("pause");
  }

  /* ---------- microphone capture ---------- */
  const MIC = { ctx: null, stream: null, src: null, proc: null, analyser: null, chunks: [], rate: 16000, on: false, raf: 0, onLive: null };
  /* Native Android mic (AudioRecord via AndroidApp bridge) - first choice inside the app. */
  function pcm16FromB64(b64) {
    const bin = atob(b64), n = bin.length >> 1, f = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; f[i] = v / 32768; }
    return f;
  }
  window.__nativeMic = (b64) => {
    if (!MIC.on || !MIC.native) return;
    const f = pcm16FromB64(b64), L = MIC.last, n = f.length;
    MIC.chunks.push(f);
    if (n >= L.length) L.set(f.subarray(n - L.length)); else { L.copyWithin(0, n); L.set(f, L.length - n); }
    if (!MIC.gotAudio) { for (let i = 0; i < n; i++) if (Math.abs(f[i]) > 0.002) { MIC.gotAudio = true; break; } }
  };
  async function nativeMicStart() {
    const NA = window.AndroidApp;
    if (!NA || !NA.micStart) return { rate: 0, err: "" };
    let r = "";
    try { r = String(NA.micStart()); } catch (e) { return { rate: 0, err: "bridge" }; }
    if (r === "perm") {
      const ok = await new Promise((res) => { window.__micPerm = res; setTimeout(() => res(false), 60000); });
      window.__micPerm = null;
      if (!ok) return { rate: 0, err: "denied" };
      try { r = String(NA.micStart()); } catch (e) { return { rate: 0, err: "bridge" }; }
    }
    if (r.indexOf("ok:") === 0) return { rate: parseInt(r.slice(3), 10) || 44100, err: "" };
    // hardware busy for a moment (e.g. just released) - one more try
    await new Promise((res) => setTimeout(res, 700));
    try { r = String(NA.micStart()); } catch (e) { }
    if (r.indexOf("ok:") === 0) return { rate: parseInt(r.slice(3), 10) || 44100, err: "" };
    return { rate: 0, err: r || "err" };
  }
  window.__nativeMicLost = () => { MIC.lost = true; }; // app went to background; next tap stops cleanly
  async function startMic(onLive) {
    if (MIC.on) return true;
    const nat = await nativeMicStart();
    if (nat.rate) {
      Object.assign(MIC, { chunks: [], rate: nat.rate, gotAudio: false, last: new Float32Array(2048), native: true, on: true, onLive: onLive });
      if (onLive) liveLoop();
      return true;
    }
    if (nat.err === "denied") { toast(T("micDenied")); return false; }
    // defensive: release any stray mic track from a previous failed start (a cause of NotReadableError)
    try { if (MIC.stream) MIC.stream.getTracks().forEach((t) => t.stop()); } catch (e) { }
    MIC.stream = null;
    const gum = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices))
      || (navigator.getUserMedia && ((c) => new Promise((res, rej) => navigator.getUserMedia(c, res, rej))))
      || (navigator.webkitGetUserMedia && ((c) => new Promise((res, rej) => navigator.webkitGetUserMedia(c, res, rej))));
    if (!gum) { toast(T("micNoApi")); return false; }
    let stream;
    const tryGet = async () => {
      try { return await gum({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } }); }
      catch (e1) { try { return await gum({ audio: true }); } catch (e2) { throw e2; } }
    };
    try { stream = await tryGet(); }
    catch (e) {
      const nm = e && e.name ? e.name : "err";
      const busy = (nm === "NotReadableError" || nm === "TrackStartError" || nm === "AbortError");
      // busy hardware needs longer to release; permission-just-granted needs only a moment
      try { await new Promise((r) => setTimeout(r, busy ? 1200 : 500)); stream = await tryGet(); }
      catch (e2) {
        toast((busy ? T("micBusy") : T("micDenied")) + " (" + nm + (nat.err ? ", " + nat.err : "") + ")");
        return false;
      }
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { toast(T("micNoApi")); try { stream.getTracks().forEach((t) => t.stop()); } catch (x) { } return false; }
    const ctx = new Ctx();
    try { if (ctx.state === "suspended" && ctx.resume) await ctx.resume(); } catch (e) { }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
    const proc = (ctx.createScriptProcessor || ctx.createJavaScriptNode).call(ctx, 4096, 1, 1);
    const sink = ctx.createGain(); sink.gain.value = 0; // silent sink so we don't hear our own mic, but onaudioprocess still fires
    MIC.chunks = []; MIC.rate = ctx.sampleRate; MIC.gotAudio = false;
    proc.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0); MIC.chunks.push(new Float32Array(d)); if (!MIC.gotAudio) { for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.002) { MIC.gotAudio = true; break; } } };
    src.connect(analyser); analyser.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
    Object.assign(MIC, { ctx: ctx, stream: stream, src: src, proc: proc, analyser: analyser, sink: sink, on: true, onLive: onLive });
    if (onLive) liveLoop();
    return true;
  }
  function liveLoop() {
    if (!MIC.on) return;
    let buf;
    if (MIC.native) buf = MIC.last;
    else { buf = new Float32Array(MIC.analyser.fftSize); (MIC.analyser.getFloatTimeDomainData || MIC.analyser.getFloatFrequencyData).call(MIC.analyser, buf); }
    const r = AUD.rms(buf);
    const p = AUD.detectPitch(buf, MIC.rate, { rmsGate: 0.01 });
    if (MIC.onLive) MIC.onLive({ rms: r, hz: p.hz });
    MIC.raf = requestAnimationFrame(liveLoop);
  }
  function stopMic() {
    if (MIC.raf) cancelAnimationFrame(MIC.raf); MIC.raf = 0;
    if (MIC.native || MIC.on) { try { if (window.AndroidApp && AndroidApp.micStop) AndroidApp.micStop(); } catch (e) { } }
    MIC.native = false;
    try { if (MIC.proc) { MIC.proc.disconnect(); MIC.proc.onaudioprocess = null; } } catch (e) { }
    try { if (MIC.sink) MIC.sink.disconnect(); } catch (e) { }
    try { if (MIC.src) MIC.src.disconnect(); } catch (e) { }
    try { if (MIC.stream) MIC.stream.getTracks().forEach((t) => t.stop()); } catch (e) { }
    try { if (MIC.ctx) MIC.ctx.close(); } catch (e) { }
    const out = finishBuffer();
    Object.assign(MIC, { ctx: null, stream: null, src: null, proc: null, analyser: null, on: false, onLive: null });
    return out;
  }
  function finishBuffer() {
    if (!MIC.chunks.length) return null;
    const n = MIC.chunks.reduce((a, c) => a + c.length, 0);
    const out = new Float32Array(n); let k = 0;
    for (const c of MIC.chunks) { out.set(c, k); k += c.length; }
    MIC.chunks = [];
    return { samples: out, sampleRate: MIC.rate };
  }
  function encodeWav(samples, rate) {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true); ws(36, "data"); dv.setUint32(40, n * 2, true);
    let o = 44; for (let i = 0; i < n; i++) { let s = Math.max(-1, Math.min(1, samples[i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Blob([buf], { type: "audio/wav" });
  }

  /* ---------- target check ---------- */
  function checkTarget(m, t) {
    if (!t) return { pass: true, rows: [] };
    const rows = []; let pass = true;
    const add = (label, ok, got, need) => { rows.push({ label, ok, got, need }); if (!ok) pass = false; };
    if (t.sustainSec != null) add(T("sustain"), m.sustainSec >= t.sustainSec, m.sustainSec + " " + T("secs"), "≥ " + t.sustainSec);
    if (t.tremorMax != null) add("Steady", m.tremor <= t.tremorMax, m.tremor, "≤ " + t.tremorMax);
    if (t.semitoneRangeMin != null) add(T("range"), m.semitoneRange >= t.semitoneRangeMin, m.semitoneRange + " st", "≥ " + t.semitoneRangeMin);
    if (t.volSteadyMin != null) add(T("steady"), m.volSteady >= t.volSteadyMin, m.volSteady, "≥ " + t.volSteadyMin);
    if (t.speakingRatioMin != null) add("Pace", m.speakingRatio >= t.speakingRatioMin, m.speakingRatio, "≥ " + t.speakingRatioMin);
    if (t.speakingRatioMax != null) add("Pace", m.speakingRatio <= t.speakingRatioMax, m.speakingRatio, "≤ " + t.speakingRatioMax);
    if (t.pausesMin != null) add(T("pauses"), m.pauses >= t.pausesMin, m.pauses, "≥ " + t.pausesMin);
    if (t.pausesMax != null) add(T("pauses"), m.pauses <= t.pausesMax, m.pauses, "≤ " + t.pausesMax);
    if (t.done) add(T("done"), true, "✓", "");
    return { pass, rows };
  }

  /* ---------- screens ---------- */
  const SCR = {};
  function topbar(title, home) {
    return `<div class="top"><button class="ib" onclick="VG.back()" aria-label="back">←</button><b>${esc(title)}</b>` +
      (home ? `<button class="ib" onclick="VG.home()" aria-label="home">⌂</button>` : `<span style="width:40px"></span>`) + `</div>`;
  }

  function meterHtml() {
    return `<div class="meters"><div class="meter"><div class="ml">${T("pitch")}</div><div class="bar"><i id="pbar" style="width:0%"></i></div><div class="mv" id="pval">—</div></div>
      <div class="meter"><div class="ml">${T("volume")}</div><div class="bar vol"><i id="vbar" style="width:0%"></i></div><div class="mv" id="vval">—</div></div></div>`;
  }
  const LV_IC = ["🫁", "🗣️", "⏱️", "🎵", "🔊", "🌐"];
  SCR.home = () => {
    let i = 0; while (i < C.LEVELS.length - 1 && passed(C.LEVELS[i].id)) i++;
    const lv = C.LEVELS[i], done = levelsCleared();
    const tile = (scr, ic, label) => `<button class="tile" onclick="VG.go('${scr}')"><span class="ic">${ic}</span>${label}</button>`;
    return `<div style="display:flex;align-items:center;justify-content:space-between"><h1>🎙️ ${APP.name}</h1><span class="chip">🔥 ${S.streak.n || 0}</span></div>
      <div class="card hero"><div class="mut">${T("focusToday")}</div>
        <div class="focus" style="margin-top:10px"><div class="num">${LV_IC[i] || "🎙️"}</div><div><div class="big2">${T("level")} ${lv.n}: ${esc(LC(lv.title))}</div><div class="mut small">${esc(LC(lv.goal))}</div></div></div>
        <button class="full" style="background:#fff;color:var(--acc);border:0;font-weight:800;margin-bottom:0" onclick="VG.openLevel(${i})">▶ ${done ? T("continue") : T("start")}</button>
        <div class="wave">〜</div></div>
      <button class="card lvl classcard" onclick="VG.startClass()"><span class="ic">🧑‍🏫</span><span class="b"><b>${T("classT")}</b>${S.classDays && S.classDays[today()] ? ` <span class="chip ok">✓ ${T("classDoneToday")}</span>` : ""}<div class="mut small">${T("classD")}</div></span></button>
      ${singCardHtml()}
      <div class="recwrap"><button class="recbig" onclick="VG.go('record')">🎤</button><div class="reclabel">${T("quickRec")}</div></div>
      <div class="grid g3">
        ${tile("levels", "📚", T("levels"))}
        ${tile("games", "🎮", T("games"))}
        ${tile("scenarios", "💬", T("scenarios"))}
        ${tile("ask", "🤔", T("ask"))}
        ${tile("tutor", "🧑‍🏫", T("tutor"))}
        ${tile("diet", "🥤", T("dietCare"))}
        ${tile("riyaz", "🪕", T("riyazT"))}
        ${tile("song", "🎤", T("songT"))}
        ${tile("gyaan", "📖", T("gyaanT"))}
      </div>`;
  };

  SCR.more = () => {
    const tile = (scr, ic, label) => `<button class="tile" onclick="VG.go('${scr}')"><span class="ic">${ic}</span>${label}</button>`;
    return topbar(T("navMore"), true) + `<div class="grid g2">
      ${tile("scenarios", "💬", T("scenarios"))}
      ${tile("games", "🎮", T("games"))}
      ${tile("ask", "🤔", T("ask"))}
      ${tile("tutor", "🧑‍🏫", T("tutor"))}
      ${tile("diet", "🥤", T("dietCare"))}
      ${tile("riyaz", "🪕", T("riyazT"))}
      ${tile("song", "🎤", T("songT"))}
      ${tile("gyaan", "📖", T("gyaanT"))}
      ${tile("backup", "💾", T("backup"))}
      ${tile("settings", "⚙️", T("settings"))}
      ${tile("about", "ℹ️", T("about"))}
      ${tile("help", "❓", T("help"))}
    </div>`;
  };

  function singCardHtml() {
    const done = C.SING.filter((l) => S.sing[l.id]).length;
    return `<button class="card lvl singcard" onclick="VG.go('sing')"><span class="ic">🎵</span><span class="b"><b>${T("singT")}</b> <span class="chip">${done}/${C.SING.length}</span><div class="mut small">${T("singD")}</div></span></button>`;
  }
  SCR.levels = () => topbar(T("levels"), true) + singCardHtml() + C.LEVELS.map((lv, i) => {
    const open = unlocked(i), done = passed(lv.id);
    return `<button class="card lvl ${done ? "done" : open ? "" : "lock"}" onclick="${open ? `VG.openLevel(${i})` : `VG.toast('${T("locked")}')`}">
      <span class="ic">${done ? "⭐" : open ? (lv.n) : "🔒"}</span><span class="b"><b>${T("level")} ${lv.n}: ${esc(LC(lv.title))}</b><div class="mut small">${esc(LC(lv.goal))}</div></span></button>`;
  }).join("");

  SCR.level = () => {
    const lv = C.LEVELS[UI.a.i];
    return topbar(T("level") + " " + lv.n + ": " + LC(lv.title), true) +
      `<div class="card"><b>🎯 ${T("goal")}:</b> ${esc(LC(lv.goal))}</div>` +
      lv.ex.map((ex, j) => `<button class="card lvl" onclick="VG.openEx(${UI.a.i},${j})"><span class="ic">${ex.test ? "✅" : exIcon(ex.type)}</span><span class="b"><b>${esc(LC(ex.title))}</b>${ex.test ? `<span class="chip">${T("voiceTest")}</span>` : ""}<div class="mut small">${esc(LC(ex.say))}</div></span></button>`).join("");
  };
  const exIcon = (t) => ({ breathing: "🫁", sustain: "🎵", pitch: "🎶", articulate: "🗣️", pace: "⏱️", shadow: "🔁", confidence: "💪" }[t] || "🎙️");

  /* tutor panel shared by every guided lesson */
  function tutorBoxHtml() {
    return `<div class="card tutorbox"><div class="tbhead"><span id="tutoric" class="tbic">🧑‍🏫</span><b style="flex:1">${T("tutorName")}</b>${UI.classQ ? `<span class="chip">🧑‍🏫 ${T("classT")} ${UI.classI || 1}/${UI.classN || 1}</span>` : ""}</div><span id="tbtag" class="chip tbtag" style="display:none"></span><div id="tutortext" class="tbtext">${T("tutorReady")}</div></div>` + modeTabsHtml();
  }
  function lessonCtlHtml(noDemo) {
    return `<div id="cue" class="cue"></div>` + meterHtml() +
      `<div class="recwrap"><button class="recbig" id="recbtn" onclick="VG.recBtn()">🎤</button><div class="reclabel" id="reclabel">${T("tapRecord")}</div></div>
       <div class="row"><button onclick="VG.lessonStart(false)">🔁 ${T("againTutor")}</button>${noDemo ? "" : `<button onclick="VG.lessonDemo()">🔊 ${T("demoAgain")}</button>`}</div>
       <div id="result"></div>`;
  }
  // exercise runner
  SCR.ex = () => {
    const lv = C.LEVELS[UI.a.i], ex = lv.ex[UI.a.j];
    let body = `<div class="card"><b>${esc(LC(ex.title))}</b>${ex.test ? `<span class="chip">${T("voiceTest")}</span>` : ""}<p>${esc(LC(ex.say))}</p>${ex.tip ? `<p class="mut small">💡 ${T("tip")}: ${esc(LC(ex.tip))}</p>` : ""}</div>`;
    body += tutorBoxHtml();
    if (ex.sketch) body += SKETCH(ex.sketch);
    if (ex.read) body += `<div class="card read"><div class="mut small">${T("readThis")}</div><div class="rtext">${esc(ex.read)}</div></div>`;
    if (ex.type === "breathing") {
      body += `<div class="breathe" id="breathe"><div class="bcircle" id="bcircle">—</div><div class="mut" id="btext"></div></div>
        <button class="pri full" onclick="VG.lessonStart(true)">▶ ${T("startEx")}</button>`;
    } else body += lessonCtlHtml() + `<p class="mut small center">${T("micHint")}</p>`;
    return topbar(LC(ex.title), true) + body;
  };

  const recText = () => (UI.recMode === "own" ? (UI.customText || "").trim() : C.PRACTICE[(UI.pIdx || 0) % C.PRACTICE.length]);
  SCR.record = () => {
    const mode = UI.recMode === "own" ? "own" : "app";
    const tabs = `<div class="seg">${[["app", T("appText")], ["own", T("ownText")]].map(([v, l]) => `<button class="${mode === v ? "on" : ""}" onclick="VG.setRecMode('${v}')">${l}</button>`).join("")}</div>`;
    const box = mode === "app"
      ? `<div class="card read"><div class="mut small">${T("readThis")}</div><div class="rtext" id="rtext">${esc(recText())}</div>
          <div class="row"><button onclick="VG.newText()">➡ ${T("newText")}</button><button onclick="VG.hearText()">🔊 ${T("hearTutor")}</button></div></div>`
      : `<div class="card"><b>${T("customText")}</b><textarea class="inp" id="ctext" rows="4" placeholder="${esc(T("customPh"))}" oninput="VG.setCustom(this.value)">${esc(UI.customText || "")}</textarea>
          <button class="full" onclick="VG.hearText()">🔊 ${T("hearTutor")}</button></div>`;
    return topbar(T("record"), true) + tabs + box + tutorBoxHtml() + lessonCtlHtml(true) + `<p class="mut small center">${T("micHint")}</p>`;
  };

  /* Sur Sikho - singing class */
  const singOpen = (k) => { const l = C.SING[k]; if (!l) return false; if (!l.req) return true; return !!S.sing[l.req] && (l.req === "calib" || !!S.sing.calib || !!S.sa); };
  const tanChip = () => `<button class="chip tanchip ${MUS().droneOn() ? "ok" : ""}" onclick="VG.tanToggle()">🪕 ${T("tanpura")}: ${MUS().droneOn() ? T("on") : T("off")}</button>`;
  function lessonSub(l) {
    if (l.kind === "rhythm") return "🥁 " + LC(MUS().TAALS[l.taal].name) + " · " + l.bpm + " BPM";
    if (l.kind === "ladder") { const r = (S.ladder && S.ladder[l.id]) || 0; return "🪜 " + T("rung") + " " + (r > 0 ? "+" : "") + r; }
    if (l.kind === "rangeTest") return S.range ? T("myRange") + ": " + S.range.loName + " – " + S.range.hiName : "";
    return l.notes ? l.notes.map(TUT.sargName).join(" · ") : "";
  }
  SCR.sing = () => {
    const sa = S.sa || DEFAULT_SA, sn = TUT.snapHz(sa).name;
    const tile = (scr, ic, label) => `<button class="tile" onclick="VG.go('${scr}')"><span class="ic">${ic}</span>${label}</button>`;
    return topbar(T("singT"), true) +
      `<div class="card hero"><div class="big2">🎵 ${T("singT")}</div><div class="mut small">${T("singD")}</div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span>${T("mySa")}: <b>${S.sa ? sn + " · " + Math.round(sa) + " Hz" : "—"}</b></span>
        <button class="ib" style="background:rgba(255,255,255,.25);color:#fff;border:0" onclick="VG.playSa()" aria-label="Sa">🔊</button>
        ${S.range ? `<span>${T("myRange")}: <b>${S.range.loName} – ${S.range.hiName}</b></span>` : ""}</div></div>
       <div class="grid g3">${tile("riyaz", "🪕", T("riyazT"))}${tile("song", "🎤", T("songT"))}${tile("gyaan", "📖", T("gyaanT"))}</div>` +
      C.SECS.map((sec) => { const ls = []; C.SING.forEach((l, k) => { if (l.sec === sec.id) ls.push({ l, k }); });
        const done = ls.filter((x) => S.sing[x.l.id]).length;
        return `<h3 class="sech">${sec.ic} ${esc(LC(sec.title))} <span class="chip">${done}/${ls.length}</span></h3><div class="mut small" style="margin-bottom:6px">${esc(LC(sec.d))}</div>` +
          ls.map(({ l, k }) => { const open = singOpen(k), dn = !!S.sing[l.id], h = histOf("s_" + l.id), best = h.length ? Math.max.apply(null, h.map((x) => x.s)) : null;
            return `<button class="card lvl ${dn ? "done" : open ? "" : "lock"}" onclick="${open ? `VG.openSing(${k})` : `VG.toast('${T("locked")}')`}"><span class="ic">${dn ? "⭐" : open ? "▶" : "🔒"}</span><span class="b"><b>${esc(LC(l.title))}</b>${best != null ? ` <span class="chip">${best}</span>` : ""}<div class="mut small">${esc(lessonSub(l))}</div></span></button>`; }).join("");
      }).join("");
  };
  SCR.singl = () => {
    const l = C.SING[UI.a.k], p = singPlan(l), sec = C.SECS.find((x) => x.id === l.sec);
    const notes = p.notes && p.kind !== "rhythm" ? `<div class="notes">${p.notes.map((x) => `<span class="nchip">${TUT.sargName(x)}</span>`).join("")}</div>` : "";
    return topbar(LC(l.title), true) +
      `<div class="card"><div class="mut small">${sec ? sec.ic + " " + esc(LC(sec.title)) : ""}</div><b>${esc(LC(l.title))}</b><p>${esc(LC(l.say))}</p>${notes}<div class="mut small">${esc(lessonSub(l))}</div><div style="margin-top:8px">${tanChip()}</div></div>` +
      tutorBoxHtml() + lessonCtlHtml(l.kind === "calib" || l.kind === "rangeTest");
  };

  /* ---------- Riyaz: tanpura + live tuner + taal player ---------- */
  SCR.riyaz = () => {
    const sa = saHz(), mins = Math.round((S.riyaz && S.riyaz[today()]) || 0), taal = S.taal || "keherwa", bpm = S.bpm || 80;
    return topbar(T("riyazT"), true) +
      `<div class="card"><div class="row" style="align-items:center"><b style="flex:1">🪕 ${T("tanpura")}</b>${tanChip()}</div>
        <div class="row" style="align-items:center;margin-top:8px"><span class="mut small">${T("volume")}</span><input type="range" min="0.1" max="1" step="0.05" value="${S.tanVol || 0.5}" oninput="VG.setTanVol(this.value)" style="flex:1"></div>
        <div class="row" style="margin-top:8px;align-items:center"><span style="flex:2">${T("mySa")}: <b>${TUT.snapHz(sa).name}</b> · ${Math.round(sa)} Hz</span><button onclick="VG.saShift(-1)">−1</button><button onclick="VG.saShift(1)">+1</button></div></div>
      <div class="card tuner"><div class="mut small">${T("tunerT")}</div><div class="tnote" id="tnote">—</div><div class="tsub" id="tsub">&nbsp;</div>
        <div class="tbar"><b></b><i id="tneedle"></i></div><div class="mut small center" id="thint">${S.earphone ? T("tunerHint") : T("earHint")}</div>
        <button class="pri full" id="tunerbtn" onclick="VG.tunerToggle()">${UI.tunerOn ? "⏹ " + T("stopRec") : "🎤 " + T("tunerStart")}</button>
        <div class="mut small center">${T("riyazToday")}: <b id="rmins">${mins}</b> min</div></div>
      <div class="card"><b>🥁 ${T("taalT")}</b>
        <select class="inp" onchange="VG.setTaal(this.value)">${Object.keys(MUS().TAALS).map((k) => `<option value="${k}" ${k === taal ? "selected" : ""}>${esc(LC(MUS().TAALS[k].name))}</option>`).join("")}</select>
        <div class="row" style="align-items:center"><span class="mut small">BPM <b id="bpmv">${bpm}</b></span><input type="range" min="40" max="160" step="2" value="${bpm}" oninput="VG.setBpm(this.value)" style="flex:1"></div>
        <div id="rbeats">${beatDots(taal, null)}</div>
        <button class="full" id="taalbtn" onclick="VG.taalToggle()">${UI.taalOn ? "⏹" : "▶"} ${T("taalPlay")}</button></div>
      <div class="card"><b>📅 ${T("riyazPlanT")}</b><p class="small">${esc(LC(C.THEORY[8].body))}</p><button class="full" onclick="VG.gyaanSay(8)">🔊 ${T("hearTutor")}</button></div>`;
  };
  function tunerLive(live) {
    const n = $("tnote"), sub = $("tsub"), nd = $("tneedle"); if (!n) return;
    if (UI.gateCal) { UI.gateCal.push(live.rms); if (UI.gateCal.length > 40) { UI.gate = Math.max(0.012, TUT.median(UI.gateCal) * 2.5); UI.gateCal = null; const h = $("thint"); if (h) h.textContent = T("tunerHint"); } else { n.textContent = "…"; return; } }
    if (!(live.hz > 0) || live.rms < UI.gate) { n.textContent = "—"; n.className = "tnote"; if (sub) sub.innerHTML = "&nbsp;"; if (nd) nd.style.left = "50%"; return; }
    const se = semisOf(live.hz), k = Math.round(se), c = Math.round((se - k) * 100), wn = window.VG_GAMES && VG_GAMES.noteOf(live.hz);
    n.textContent = TUT.sargName(k); n.className = "tnote " + (Math.abs(c) <= 20 ? "ok" : "off");
    if (sub) sub.textContent = (wn ? wn.name + " · " : "") + Math.round(live.hz) + " Hz · " + (c > 0 ? "+" : "") + c + " cents";
    if (nd) nd.style.left = Math.max(2, Math.min(98, 50 + c)) + "%";
  }
  function tunerStop() {
    if (!UI.tunerOn) return; UI.tunerOn = false; stopMic();
    const mins = (performance.now() - (UI.tunerT0 || performance.now())) / 60000; if (!S.riyaz) S.riyaz = {}; S.riyaz[today()] = (S.riyaz[today()] || 0) + mins; save();
    const b = $("tunerbtn"); if (b) b.textContent = "🎤 " + T("tunerStart"); const r = $("rmins"); if (r) r.textContent = Math.round(S.riyaz[today()]);
  }
  function taalStop() { UI.taalOn = false; clearTimeout(UI.taalT); clearInterval(UI.beatT); MUS().stopTaal(); UI.taalNext = 0; const b = $("taalbtn"); if (b) b.textContent = "▶ " + T("taalPlay"); }
  function taalLoop() {
    if (!UI.taalOn) return; const M = MUS(), taal = S.taal || "keherwa";
    const info = M.playTheka(taal, S.bpm || 80, 2, { at: UI.taalNext && UI.taalNext > M.now() ? UI.taalNext : 0, sa: saHz(), mode: "tabla" }); if (!info) return;
    UI.taalNext = info.end; beatViz(info, M.TAALS[taal].beats, null);
    UI.taalT = setTimeout(taalLoop, Math.max(200, (info.end - M.now() - 0.5) * 1000));
  }

  /* ---------- Mera gaana: free singing check, or compare with a reference ---------- */
  SCR.song = () => {
    const mode = UI.songMode === "ref" ? "ref" : "free";
    const tabs = `<div class="seg">${[["free", T("songFree")], ["ref", T("songRef")]].map(([v, l]) => `<button class="${mode === v ? "on" : ""}" onclick="VG.setSongMode('${v}')">${l}</button>`).join("")}</div>`;
    const refs = RECS.filter((r) => r.ref);
    const box = mode === "free" ? `<div class="card"><p>${T("songFreeD")}</p><p class="mut small">${T("songCopy")}</p></div>`
      : `<div class="card"><p>${T("songRefD")}</p>
          <label class="btn full" style="display:block;text-align:center">📂 ${T("refPick")}<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg" style="display:none" onchange="VG.refPick(this)"></label>
          ${refs.map((r) => `<button class="vrow ${UI.ref && UI.ref.id === r.id ? "on" : ""}" onclick="VG.useRef(${r.id})"><span>🎧 ${esc(r.label)}</span><span class="chip">${Math.round(r.dur || 0)}s</span></button>`).join("")}
          <div class="row"><button onclick="VG.refPlay()">▶ ${T("refListenBtn")}</button></div><p class="mut small">${T("songCopy")}</p></div>`;
    return topbar(T("songT"), true) + tabs + box + tutorBoxHtml() + meterHtml() +
      `<div class="recwrap"><button class="recbig" id="recbtn" onclick="VG.songRec()">🎤</button><div class="reclabel" id="reclabel">${T("tapRecord")}</div></div><div id="result"></div>`;
  };
  async function songRun() {
    stopSpeak(); const sid = FLOW.sid, res = $("result"); if (res) res.innerHTML = "";
    const ref = UI.songMode === "ref" ? UI.ref : null;
    if (UI.songMode === "ref" && !ref) { toast(T("refNone")); bubble(T("refNone"), "📂"); return; }
    FLOW.phase = "intro"; FLOW.phaseSid = sid;
    const st = ref ? [{ say: T("refListen") }, { refClip: [0, Math.min(ref.dur, 20)] }, { say: T("nowYouSing") }] : [{ say: T("songSay") }];
    if (!await runSteps(st, sid)) return;
    const clip = await guidedRecord(sid, { kind: "song", maxSec: ref ? Math.min(90, ref.dur + 4) : 90 }); FLOW.phase = "fb";
    if (!clip) return;
    bubble(T("analyzing"), "⏳"); await sleep(30);
    const m = AUD.analyzeClip(clip.samples, clip.sampleRate); UI.curClip = UI.mainClip = { clip, track: m.track }; UI.lastClip = { clip, m, label: T("songT") };
    const key = ref ? "song_ref" : "song", L = { key, src: { title: { en: "My song", hi: "Mera gaana" } } }, prev = histOf(key).slice();
    let fb, card = "";
    if (ref) { const cs = TUT.compareSong(ref.track, m.track); fb = TUT.feedbackSong(cs, S.lang);
      if (cs) card = metricRow(T("matchT"), cs.match + "%") + (cs.key ? metricRow(T("keyT"), (cs.key > 0 ? "+" : "") + cs.key + " semitone") : "") + cs.sections.map((x) => metricRow(TUT.mmss(x.t0) + "–" + TUT.mmss(x.t1), (x.cents > 0 ? "+" : "") + x.cents + " cents")).join(""); }
    else { const ss = TUT.songStats(m.track); fb = TUT.feedbackSongFree(ss, m, S.lang);
      if (ss) card = metricRow(T("inTune"), ss.stability + "%") + metricRow(T("rangeSung"), ss.low + " – " + ss.high) + metricRow(T("phraseAvg"), ss.avgPhrase + " " + T("secs")) + metricRow(T("phraseLong"), ss.longest + " " + T("secs")); }
    if (res) { res.innerHTML = `<div class="card"><h3 style="margin-top:0">📊 ${T("results")}</h3>${card}<canvas id="intonation" class="intona" width="320" height="90"></canvas>
      <div class="row"><button id="playlast">▶ ${T("playBack")}</button><button onclick="VG.saveLastRec()">💾 ${T("saveRec")}</button></div></div>`;
      const pl = $("playlast"); if (pl) pl.onclick = () => playClip(clip); drawIntonation($("intonation"), m.track); }
    addHist(L, fb.score, "p"); showFeedback(fb, prev);
    if (!await runSteps([{ say: fb.summary }, { say: TUT.improveText(prev, fb.score, S.lang) }], sid)) return;
    for (let i = 0; i < fb.items.length; i++) { markItem(i); if (!await runSteps(fb.items[i].steps, sid)) return; }
    markItem(-1); if (alive(sid)) { bubble((fb.pass ? "🏆 " : "💪 ") + fb.summary, "🧑‍🏫"); FLOW.phase = ""; }
  }
  /* decode any audio file the phone can play -> mono samples (max 60 s) */
  async function decodeAudioFile(file) {
    const buf = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); });
    let samples, sr;
    try { const w = AUD.decodeWav(buf); if (w && w.samples && w.samples.length) { samples = w.samples; sr = w.sampleRate; } } catch (e) { }
    if (!samples) { const ctx = TUT.ac(); const ab = await new Promise((res, rej) => { try { const pr = ctx.decodeAudioData(buf.slice(0), res, rej); if (pr && pr.then) pr.then(res, rej); } catch (e) { rej(e); } });
      sr = ab.sampleRate; const n = ab.length, out = new Float32Array(n); for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / ab.numberOfChannels; } samples = out; }
    if (samples.length > sr * 60) samples = samples.slice(0, sr * 60);
    return { samples, sr };
  }
  async function setRef(id, name, samples, sr) {
    const m = AUD.analyzeClip(samples, sr);
    UI.ref = { id, name, samples, sr, track: m.track, dur: samples.length / sr };
  }

  /* ---------- Sangeet Gyaan ---------- */
  SCR.gyaan = () => topbar(T("gyaanT"), true) + `<p class="mut">${T("gyaanD")}</p>` +
    C.THEORY.map((t, i) => `<div class="card"><div class="row" style="align-items:center"><h3 style="margin:0;flex:1">${t.ic} ${esc(LC(t.title))}</h3><button class="ib" style="flex:none" onclick="VG.gyaanSay(${i})" aria-label="listen">🔊</button>${t.demo ? `<button class="ib" style="flex:none" onclick="VG.gyaanDemo(${i})" aria-label="demo">▶</button>` : ""}</div><p>${esc(LC(t.body))}</p></div>`).join("");

  /* ---------- Diet & voice care ---------- */
  const careDay = () => { if (!S.care) S.care = {}; return S.care[today()] || (S.care[today()] = { water: 0 }); };
  SCR.diet = () => {
    const tab = UI.dietTab || "routine", D = C.DIET2;
    const tabs = [["routine", "📅", T("dRoutine")], ["recipes", "🍯", T("dRecipes")], ["perf", "🎤", T("dPerf")], ["avoid", "⚠️", T("avoid")], ["sick", "🤒", T("dSick")], ["check", "✅", T("dCheck")]];
    const sp = (i) => `<button class="ib" style="flex:none" onclick="VG.sayDiet2('${tab}',${i})" aria-label="listen">🔊</button>`;
    let body = "";
    if (tab === "routine") body = D.routine.map((r, i) => `<div class="card"><div class="row" style="align-items:center"><b style="flex:1">🕐 ${esc(LC(r.t))}</b>${sp(i)}</div><p>${esc(LC(r.d))}</p></div>`).join("");
    else if (tab === "recipes") body = D.recipes.map((r, i) => `<div class="card recipe"><div class="row" style="align-items:center"><h3 style="margin:0;flex:1">${r.ic} ${esc(LC(r.name))}</h3>${sp(i)}</div>
        <div class="rrow"><b>🧺 ${T("rNeed")}</b><p>${esc(LC(r.need))}</p></div><div class="rrow"><b>👩‍🍳 ${T("rMake")}</b><p>${esc(LC(r.make))}</p></div>
        <div class="rrow"><b>⏰ ${T("rWhen")}</b><p>${esc(LC(r.when))}</p></div><div class="rrow"><b>💡 ${T("rWhy")}</b><p>${esc(LC(r.why))}</p></div>
        <div class="rrow warn"><b>⚠️ ${T("rCare")}</b><p>${esc(LC(r.care))}</p></div></div>`).join("");
    else if (tab === "perf") body = `<div class="card"><div class="row" style="align-items:center"><h3 style="margin:0;flex:1">⏳ ${T("dBefore")}</h3>${sp(0)}</div><ul>${D.before.map((x) => `<li>${esc(LC(x))}</li>`).join("")}</ul></div>
        <div class="card"><div class="row" style="align-items:center"><h3 style="margin:0;flex:1">✅ ${T("dAfter")}</h3>${sp(1)}</div><ul>${D.after.map((x) => `<li>${esc(LC(x))}</li>`).join("")}</ul></div>`;
    else if (tab === "avoid") body = `<div class="card"><div class="row" style="align-items:center"><b style="flex:1;color:var(--bad)">⚠️ ${T("avoid")}</b>${sp(0)}</div>${D.avoid.map((a) => `<div class="drow"><b>${esc(LC(a.f))}</b><span class="mut small">${esc(LC(a.w))}</span></div>`).join("")}</div>`;
    else if (tab === "sick") body = `<div class="card"><div class="row" style="align-items:center"><h3 style="margin:0;flex:1">🤒 ${T("dSickCare")}</h3>${sp(0)}</div><ul>${D.sick.map((x) => `<li>${esc(LC(x))}</li>`).join("")}</ul></div>
        <div class="card doctor"><div class="row" style="align-items:center"><h3 style="margin:0;flex:1">🩺 ${T("dDoctor")}</h3>${sp(1)}</div><ul>${D.doctor.map((x) => `<li>${esc(LC(x))}</li>`).join("")}</ul><p class="small mut">${T("dNotMedical")}</p></div>`;
    else { const c = careDay(), w = c.water || 0;
      body = `<div class="card"><b>💧 ${T("dWater")}</b><div class="row" style="align-items:center;margin-top:8px"><button onclick="VG.water(-1)">−</button><div class="big center" style="flex:2">${w} / 10</div><button onclick="VG.water(1)">+</button></div>
        <div class="bar vol"><i style="width:${Math.min(100, w * 10)}%"></i></div></div>
        <div class="card">${C.CARE.map((it) => `<button class="vrow ${c[it.id] ? "on" : ""}" onclick="VG.careToggle('${it.id}')"><span>${it.ic} ${esc(LC(it.t))}</span><span>${c[it.id] ? "✅" : "⬜"}</span></button>`).join("")}</div>
        <p class="mut small center">${T("dCheckNote")}</p>`; }
    return topbar(T("dietCare"), true) + `<div class="dtabs">${tabs.map(([v, ic, l]) => `<button class="${tab === v ? "on" : ""}" onclick="VG.setDietTab('${v}')">${ic} ${l}</button>`).join("")}</div>` + body;
  };
  function dietText(tab, i) {
    const D = C.DIET2;
    if (tab === "routine") { const r = D.routine[i]; return LC(r.t) + ". " + LC(r.d); }
    if (tab === "recipes") { const r = D.recipes[i]; return [LC(r.name), T("rNeed") + ": " + LC(r.need), T("rMake") + ": " + LC(r.make), T("rWhen") + ": " + LC(r.when), T("rWhy") + ": " + LC(r.why), T("rCare") + ": " + LC(r.care)].join(". "); }
    if (tab === "perf") return (i === 0 ? T("dBefore") + ". " + D.before.map(LC).join(". ") : T("dAfter") + ". " + D.after.map(LC).join(". "));
    if (tab === "avoid") return T("avoid") + ". " + D.avoid.map((a) => LC(a.f) + ": " + LC(a.w)).join(". ");
    if (tab === "sick") return i === 0 ? T("dSickCare") + ". " + D.sick.map(LC).join(". ") : T("dDoctor") + ". " + D.doctor.map(LC).join(". ") + ". " + T("dNotMedical");
    return "";
  }

    SCR.scenarios = () => topbar(T("scenarios"), true) + C.SCENARIOS.map((s, i) =>
    `<button class="card lvl" onclick="VG.openScenario(${i})"><span class="ic">💬</span><span class="b"><b>${esc(LC(s.title))}</b><div class="mut small">${esc(LC(s.say))}</div></span></button>`).join("");

  SCR.ask = () => {
    const a = UI.askState || { q: "", res: null };
    let res = "";
    if (a.res) res = a.res.length ? a.res.map((r, i) => `<div class="card${i === 0 ? " best" : ""}"><div class="row" style="align-items:center"><b style="flex:1">${i === 0 ? "⭐ " : ""}${esc(LC(r.q))}</b><button class="ib" style="flex:none" onclick="VG.sayAsk(${i})" aria-label="listen">🔊</button></div><p>${esc(LC(r.a))}</p></div>`).join("") : `<div class="card"><p>🤔 ${T("askNone")}</p></div>`;
    return topbar(T("ask"), true) + `<textarea class="inp" id="askq" rows="3" placeholder="${esc(T("askPh"))}">${esc(a.q)}</textarea>
      <button class="pri full" onclick="VG.askGo()">💬 ${T("askBtn")}</button><div id="askres">${res}</div>`;
  };

  SCR.tutor = () => topbar(T("tutor"), true) + `<p class="mut">${T("tutorT")}</p>` + singCardHtml() +
    C.TUTOR.map((t, i) => `<div class="card"><div class="row" style="align-items:center"><h3 style="margin:0;flex:1">${esc(LC(t.title))}</h3><button class="ib" style="flex:none" onclick="VG.sayTutor(${i})" aria-label="listen">🔊</button></div><p>${esc(LC(t.body))}</p>${t.sketch ? SKETCH(t.sketch) : ""}</div>`).join("");

  function improveHtml() {
    const keys = Object.keys(S.hist || {}).filter((k) => S.hist[k] && S.hist[k].length);
    if (!keys.length) return `<p class="mut">${T("noHist")}</p>`;
    keys.sort((a, b) => (S.hist[b].length - S.hist[a].length));
    return `<div class="card">` + keys.slice(0, 12).map((k) => { const h = S.hist[k], f = h[0].s, l = h[h.length - 1].s, b = Math.max.apply(null, h.map((x) => x.s)), d = l - f;
      return `<div class="mrow"><span>${esc((S.histName && S.histName[k]) || k)}<br><small class="mut">${T("tries")}: ${h.length} · ${T("bestScore")}: ${b}</small></span><b>${f} → ${l} ${d > 0 ? "▲" + d : d < 0 ? "▼" + (-d) : ""}</b></div>`; }).join("") + `</div>`;
  }
  SCR.progress = () => {
    const done = levelsCleared();
    const bestSus = S.best.sustainSec || 0;
    const stat = (ic, v, l) => `<div class="card center stat"><div class="big">${ic} ${v}</div><div class="mut small">${l}</div></div>`;
    const recRows = RECS.slice().sort((a, b) => b.id - a.id).slice(0, 20).map((r) =>
      `<div class="card row" style="align-items:center"><span><b>${esc(r.label || "Rec")}</b><br><span class="mut small">${esc(r.date)} · ${r.m ? r.m.pitchMean + "Hz · " + (r.m.sustainSec || 0) + "s" : ""}</span></span>
       <button style="flex:none" onclick="VG.playRec(${r.id})" aria-label="play">▶</button><button style="flex:none" onclick="VG.delRec(${r.id})" aria-label="del">🗑</button></div>`).join("");
    return topbar(T("progress"), true) +
      `<div class="grid g2">${stat("🔥", S.streak.n || 0, T("streakT"))}${stat("⭐", done, T("levelsDone"))}${stat("🎵", bestSus + "s", T("bestSustain"))}${stat("🎤", RECS.length, T("recsCount"))}</div>
      <button class="full" onclick="VG.reportPdf()">📄 ${T("reportPdf")}</button>
      <h3>📈 ${T("improveT")}</h3>${improveHtml()}
      <h3>🎤 ${T("savedRecs")}</h3>${recRows || `<p class="mut">${T("noRecs")}</p>`}`;
  };

  const ctrlLabel = (c) => ({ pitch: T("ctrlPitch"), volume: T("ctrlVolume"), lane: T("ctrlLane") }[c] || "");
  SCR.backup = () => topbar(T("backup"), true) +
    `<div class="card"><p class="mut">${T("pgNote")}</p>
      <button class="full" onclick="VG.backupNow()">⬇ ${T("download")}</button>
      <label class="btn full" style="display:block">⬆ ${T("restore")}<input type="file" accept=".json,application/json" style="display:none" onchange="VG.restore(this)"></label>
      <button class="full" onclick="VG.reset()">🗑 ${T("reset")}</button></div>`;

  SCR.settings = () => {
    const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${S[k] === v ? "on" : ""}" onclick="VG.setOpt('${k}',${JSON.stringify(v).replace(/"/g, "'")})">${l}</button>`).join("")}</div>`;
    return topbar(T("settings"), true) +
      `<div class="card"><b>🌐 ${T("language")}</b>${seg("lang", Object.entries(LANGS))}</div>
       <div class="card"><b>🎨 ${T("theme")}</b>${seg("theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]])}</div>
       ${voiceCardHtml()}
       <div class="card"><b>🎵 ${T("singStyle")}</b>${seg("singStyle", [["human", T("singHuman")], ["harmonium", T("singHarm")], ["tone", T("singTone")]])}</div>
       <div class="card"><b>🎧 ${T("earT")}</b>${seg("earphone", [[false, T("earSpeaker")], [true, T("earPhone")]])}<p class="mut small">${T("earD")}</p></div>
       <div class="card"><b>🥁 ${T("syncT")}</b>: ${S.latency ? Math.round(S.latency.v * 1000) + " ms" : "—"}<p class="mut small">${T("syncD")}</p><button class="full" onclick="VG.syncTest()">🥁 ${T("syncBtn")}</button></div>
       <div class="card"><b>🧑‍🏫 ${T("tutorSpeed")}</b>${seg("tutorRate", [[0.8, T("slow")], [0.95, T("normal")], [1.1, T("fast")]])}</div>
       <div class="card"><b>🎵 ${T("mySa")}</b>: ${S.sa ? TUT.snapHz(S.sa).name + " · " + Math.round(S.sa) + " Hz" : "—"}
         <div class="row" style="margin-top:8px"><button onclick="VG.saShift(-1)">− 1</button><button onclick="VG.playSa()">🔊</button><button onclick="VG.saShift(1)">+ 1</button></div>
         <button class="full" onclick="VG.openSing(0)">🎯 ${T("findSa")}</button></div>
       <button class="full" onclick="VG.go('about')">ℹ️ ${T("about")}</button>`;
  };

  function voiceCardHtml() {
    const list = TUT.offlineVoices(S.lang).slice(0, 8), cur = S.voiceName;
    const row = (v) => `<button class="vrow ${!S.voiceAuto && cur === v.name ? "on" : ""}" onclick="VG.pickVoice('${esc(v.name).replace(/'/g, "")}')"><span>🔊 ${esc(v.lang)} <small class="mut">${esc(v.name)}</small></span><span class="chip">${v.q >= 500 ? "★★★" : v.q >= 400 ? "★★" : "★"}</span></button>`;
    return `<div class="card"><b>🗣️ ${T("voiceT")}</b>
      <button class="vrow ${S.voiceAuto ? "on" : ""}" onclick="VG.pickVoice('')"><span>✨ ${T("voiceAutoL")}${S.voiceAuto && cur ? ` <small class="mut">${esc(cur)}</small>` : ""}</span></button>
      ${list.length ? list.map(row).join("") : `<p class="mut small">${T("voiceNone")}</p>`}
      <button class="full" onclick="VG.getVoices()">📥 ${T("voiceGet")}</button><p class="mut small">${T("voiceGetHint")}</p></div>`;
  }
  SCR.about = () => topbar(T("about"), true) +
    `<div class="card center"><div style="font-size:3rem">🎙️</div><h2>${APP.name}</h2><p class="mut">Version ${APP.version} · Offline</p><p>${T("aboutText")}</p></div>
     <div class="card"><b>👨‍💻 ${T("madeBy")}</b><p style="font-size:1.15rem"><b>${APP.dev}</b></p></div>
     <div class="card"><b>✉️ ${T("contact")}</b><p><a href="mailto:${APP.email}?subject=Voice%20Guru">${APP.email}</a></p></div>
     <p class="mut small">${T("pgNote")}</p>`;

  SCR.help = () => topbar(T("help"), true) + `<div class="card"><ol>
    <li>🧑‍🏫 ${T("helpTutor")}</li>
    <li>🎵 ${T("singT")}: ${T("singD")}</li>
    <li>${T("record")}: ${T("helpRec")}</li>
    <li>🪕 ${T("riyazT")} · 🎤 ${T("songT")} · 📖 ${T("gyaanT")} · 🥤 ${T("dietCare")}</li>
    <li>${T("levels")}: har level me ek voice test hai; pass karo to agla khulta hai.</li>
    <li>${T("games")}, ${T("scenarios")}, ${T("ask")}, ${T("tutor")}, ${T("diet")} — sab offline.</li>
    <li>${T("backup")}: progress ki file bana/wapas la sakte ho.</li>
    <li>🎤 Mic ki permission ek baar deni hogi.</li></ol></div>`;

  function modalHtml() {
    const m = UI.modal; if (!m) return "";
    let body;
    if (m.sheet) body = m.sheet;
    else body = `<p>${esc(m.msg)}</p><div class="row"><button onclick="VG.closeModal()">✕</button><button class="pri" onclick="VG.okModal()">${esc(m.ok)}</button></div>`;
    return `<div class="ov" onclick="if(event.target===this)VG.closeModal()"><div class="sheet">${body}</div></div>`;
  }

  function navHtml() {
    const map = { home: "home", levels: "levels", level: "levels", ex: "levels", sing: "levels", singl: "levels", riyaz: "levels", song: "levels", gyaan: "levels", record: "record", progress: "progress" };
    const cur = map[UI.scr] || (["more", "scenarios", "games", "glevels", "gameview", "shop", "ask", "tutor", "diet", "backup", "settings", "about", "help"].includes(UI.scr) ? "more" : "");
    const item = (scr, ic, lab, cls) => `<button class="${cls || ""} ${cur === scr ? "on" : ""}" onclick="VG.nav('${scr}')"><span class="ic">${ic}</span>${lab}</button>`;
    return `<div class="bnav">${item("home", "🏠", T("navHome"))}${item("levels", "📚", T("navPractice"))}${item("record", "🎤", T("navRec"), "rec")}${item("progress", "📊", T("navProgress"))}${item("more", "☰", T("navMore"))}</div>`;
  }
  const MUSIC_SCR = ["singl", "sing", "riyaz"], AWAKE_SCR = ["ex", "singl", "riyaz", "song", "record", "gameview"];
  function render() {
    const app = $("app"); if (!app) return;
    // leaving music screens: stop tanpura, taal and tuner; keep the screen awake while practising
    if (UI.lastScr !== UI.scr) {
      if (UI.lastScr === "riyaz") { tunerStop(); taalStop(); }
      if (UI.lastScr === "gameview" && window.VG_MUSIC) VG_MUSIC.stopTaal();
      if (!MUSIC_SCR.includes(UI.scr) && MUS() && MUS().droneOn()) MUS().droneStop();
      if (MUSIC_SCR.includes(UI.scr) && S.tanpura && MUS() && !MUS().droneOn()) MUS().droneStart(saHz(), S.tanVol || 0.5);
      const aw = AWAKE_SCR.includes(UI.scr); if (aw !== UI.awake) { UI.awake = aw; try { if (window.AndroidApp && AndroidApp.keepAwake) AndroidApp.keepAwake(aw); } catch (e) { } }
      UI.lastScr = UI.scr;
    }
    const f = SCR[UI.scr] || SCR.home;
    app.innerHTML = f() + navHtml() + modalHtml();
    if (!UI.keep) window.scrollTo(0, 0); UI.keep = 0;
  }

  /* ---------- actions ---------- */
  const VG = {
    go, home: goHome, back, toast,
    nav(scr) { UI.classQ = null; if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopMic(); stopSpeak(); UI.stack = scr === "home" ? [] : [{ scr: "home", a: null }]; UI.scr = scr; UI.a = null; UI.modal = null; render(); },
    closeModal() { UI.modal = null; UI.keep = 1; render(); },
    okModal() { const f = UI.cb; UI.cb = null; UI.modal = null; UI.keep = 1; if (f) f(); render(); },
    openLevel(i) { go("level", { i }); const lv = C.LEVELS[i]; const sid = FLOW.sid; setTimeout(() => { if (alive(sid)) speak(LC(lv.title) + ". " + LC(lv.goal)); }, 250); },
    openEx(i, j) { UI.exState = {}; UI.goodRuns = 0; UI.mode = histOf("e_" + i + "_" + j).length ? "practice" : "learn"; go("ex", { i, j }); autoLesson(); },
    openScenario(i) { const s = C.SCENARIOS[i]; UI.exState = {}; UI.goodRuns = 0; UI.mode = histOf("sc_" + i).length ? "practice" : "learn"; scenarioAsEx(s); go("ex", { scenario: i, i: -1, j: -1 }); autoLesson(); },
    openSing(k) { if (!singOpen(k) && k !== 0) { toast(T("locked")); return; } UI.goodRuns = 0; UI.mode = histOf("s_" + C.SING[k].id).length ? "practice" : "learn"; go("singl", { k }); autoLesson(); },
    setCustom(v) { UI.customText = v; },
    speakRef() { const ex = curEx(); if (ex && ex.read) { stopSpeak(); speak(ex.read, 0.85); } },
    setOpt(k, v) { S[k] = v; save(); applySet(); if (k === "tutorRate") { TUT.setRate(v); stopSpeak(); speak(T("tutorReady")); } if (k === "singStyle") { TUT.setStyle(v); stopSpeak(); TUT.playSeq(TUT.demoSeq({ kind: "scale", notes: [0, 4, 7], dur: 0.9 }, saHz())); } if (k === "lang" && S.voiceAuto) applyVoice(); UI.keep = 1; render(); },

    breatheStart(sec) { breatheRun(sec, FLOW.sid); },

    /* guided tutor lessons */
    lessonStart(full) { lessonRun({ full: !!full }); },
    abPause() {
      if (FLOW.paused) { FLOW.paused = false; if (UI.taalWasOn && UI.scr === "riyaz") { UI.taalWasOn = false; VG.taalToggle(); } abarUpdate(); return; }
      FLOW.paused = true; FLOW.cut = true; TUT.stopAll(); if (UI.taalOn) { taalStop(); UI.taalWasOn = true; } if (window.VG_MUSIC) VG_MUSIC.stopTaal(); abarUpdate();
    },
    abStop() { stopSpeak(); if (window.VG_MUSIC) VG_MUSIC.stopTaal(); if (UI.taalOn) taalStop(); abarUpdate(); },
    setMode(m) { stopSpeak(); UI.mode = m; markTabs(); lessonRun({ full: m === "learn" }); },
    startClass() { stopSpeak(); UI.classQ = buildClass(); UI.classN = UI.classQ.length; UI.classI = 0; const sid = FLOW.sid;
      runSteps([{ say: T("classIntro") }], sid).then((ok) => { if (ok && UI.classQ) classNext(); }); },
    pickVoice(name) { S.voiceName = name || ""; S.voiceAuto = !name; save(); if (name) TUT.setVoice(name); else applyVoice(); stopSpeak(); speak(T("voiceSample")); UI.keep = 1; render(); },
    getVoices() { try { if (window.AndroidApp && AndroidApp.openTtsSettings) { AndroidApp.openTtsSettings(); return; } } catch (e) { } toast(T("voiceGetHint")); },
    lessonDemo() { stopSpeak(); const sid = FLOW.sid, L = curLesson(); if (!L) return;
      const st = L.plan.kind === "breath" ? [{ say: LC(L.src.say) }] : demoSteps(L, saHz());
      if (!st.length) st.push({ say: T("nowYouSpeak") });
      runSteps(st, sid).then(() => { if (alive(sid)) bubble(T("tutorReady"), "🧑‍🏫"); }); },
    recBtn() {
      if (FLOW.rec) { FLOW.stopReq = true; return; }            // stop recording now
      lessonRun({ skipDemo: FLOW.phase === "intro" && FLOW.phaseSid === FLOW.sid }); // tap during demo = skip to your turn
    },
    replayItem(i) { const it = UI.fb && UI.fb.items[i]; if (!it) return; stopSpeak(); const sid = FLOW.sid; UI.curClip = UI.mainClip; markItem(i); runSteps(it.steps, sid).then(() => markItem(-1)); },
    setRecMode(v) { stopSpeak(); UI.recMode = v; UI.keep = 1; render(); },
    newText() { stopSpeak(); UI.pIdx = ((UI.pIdx || 0) + 1) % C.PRACTICE.length; UI.keep = 1; render(); },
    hearText() { stopSpeak(); const c = $("ctext"); if (c) UI.customText = c.value; const t = recText(); if (!t) { toast(T("customPh")); return; } const sid = FLOW.sid; runSteps([{ say: t, rate: 0.9 }], sid); },
    playSa() { stopSpeak(); TUT.playSeq([{ hz: saHz(), dur: 2 }]); },
    retune() { const M = MUS(); if (M && M.droneOn()) M.droneStart(saHz(), S.tanVol || 0.5); },
    saShift(d) { S.sa = Math.round(TUT.snapHz(saHz() * Math.pow(2, d / 12)).hz * 100) / 100; save(); UI.keep = 1; render(); VG.retune(); VG.playSa(); },
    sayAsk(i) { const a = UI.askState && UI.askState.res && UI.askState.res[i]; if (!a) return; stopSpeak(); speak(LC(a.a)); },
    sayTutor(i) { const t = C.TUTOR[i]; if (!t) return; stopSpeak(); speak(LC(t.title) + ". " + LC(t.body)); },
    /* tanpura / riyaz */
    tanToggle() { const M = MUS(); if (!M) return; if (M.droneOn()) { M.droneStop(); S.tanpura = false; } else { M.droneStart(saHz(), S.tanVol || 0.5); S.tanpura = true; } save();
      document.querySelectorAll(".tanchip").forEach((b) => { b.classList.toggle("ok", M.droneOn()); b.textContent = "🪕 " + T("tanpura") + ": " + (M.droneOn() ? T("on") : T("off")); }); },
    setTanVol(v) { S.tanVol = +v; MUS().setDroneVol(+v); save(); },
    async tunerToggle() {
      if (UI.tunerOn) { tunerStop(); return; }
      stopSpeak(); UI.gateCal = []; UI.gate = 0.015; const h = $("thint"); if (h) h.textContent = T("tunerQuiet");
      const ok = await startMic(tunerLive); if (!ok) return;
      UI.tunerOn = true; UI.tunerT0 = performance.now(); const b = $("tunerbtn"); if (b) b.textContent = "⏹ " + T("stopRec"); },
    setTaal(v) { S.taal = v; save(); const rb = $("rbeats"); if (rb) rb.innerHTML = beatDots(v, null); if (UI.taalOn) { taalStop(); UI.taalOn = true; taalLoop(); const b = $("taalbtn"); if (b) b.textContent = "⏹ " + T("taalPlay"); } },
    setBpm(v) { S.bpm = +v; save(); const e = $("bpmv"); if (e) e.textContent = v; clearTimeout(UI.bpmT); if (UI.taalOn) UI.bpmT = setTimeout(() => { taalStop(); UI.taalOn = true; taalLoop(); const b = $("taalbtn"); if (b) b.textContent = "⏹ " + T("taalPlay"); }, 300); },
    taalToggle() { if (UI.taalOn) { taalStop(); return; } UI.taalOn = true; UI.taalNext = 0; taalLoop(); const b = $("taalbtn"); if (b) b.textContent = "⏹ " + T("taalPlay"); },
    syncTest() { stopSpeak(); const sid = FLOW.sid; S.latency = null; save(); calibrateLatency(sid).then((l) => { if (l != null) { toast(T("syncT") + ": " + Math.round(l * 1000) + " ms"); UI.keep = 1; render(); } }); },
    /* my song */
    setSongMode(v) { stopSpeak(); UI.songMode = v; UI.keep = 1; render(); },
    songRec() { if (FLOW.rec) { FLOW.stopReq = true; return; } songRun(); },
    async refPick(inp) {
      const f = inp.files && inp.files[0]; inp.value = ""; if (!f) return;
      toast(T("analyzing"));
      try { const d = await decodeAudioFile(f); const id = Date.now(), name = (f.name || "ref").replace(/\.[^.]+$/, "").slice(0, 40);
        await setRef(id, name, d.samples, d.sr);
        const rec = { id, date: today(), label: name, ref: true, dur: d.samples.length / d.sr, blob: encodeWav(d.samples, d.sr) };
        try { await DB.put(rec); RECS.push(rec); } catch (e) { }
        UI.keep = 1; render(); toast("✓ " + name);
      } catch (e) { toast(T("refBad")); } },
    async useRef(id) { const r = RECS.find((x) => x.id === id); if (!r) return;
      try { const buf = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsArrayBuffer(r.blob); });
        const w = AUD.decodeWav(buf); await setRef(id, r.label, w.samples, w.sampleRate); UI.keep = 1; render(); } catch (e) { toast(T("refBad")); } },
    refPlay() { if (!UI.ref) { toast(T("refNone")); return; } stopSpeak(); runSteps([{ refClip: [0, Math.min(UI.ref.dur, 20)] }], FLOW.sid); },
    /* gyaan */
    gyaanSay(i) { const t = C.THEORY[i]; if (!t) return; stopSpeak(); speak(LC(t.title) + ". " + LC(t.body)); },
    gyaanDemo(i) { const t = C.THEORY[i]; if (!t || !t.demo) return; stopSpeak(); const sid = FLOW.sid, sa = saHz(), M = MUS();
      if (t.demo === "sa") runSteps([{ say: "Sa" }, { seq: [{ hz: sa, dur: 2 }], label: "Sa" }], sid);
      else if (t.demo === "saptak") runSteps([{ say: T("mandra") }, { seq: [{ hz: sa / 2, dur: 1.4 }], label: "Sa," }, { say: T("madhya") }, { seq: [{ hz: sa, dur: 1.4 }], label: "Sa" }, { say: T("taar") }, { seq: [{ hz: sa * 2, dur: 1.4 }], label: "Sa'" }], sid);
      else if (t.demo === "komal") runSteps([{ say: "Re" }, { seq: [{ hz: TUT.semiHz(sa, 2), dur: 1.2 }], label: "Re" }, { say: "Komal Re" }, { seq: [{ hz: TUT.semiHz(sa, 1), dur: 1.2 }], label: "Re(k)" }, { say: "Ma" }, { seq: [{ hz: TUT.semiHz(sa, 5), dur: 1.2 }], label: "Ma" }, { say: "Teevra Ma" }, { seq: [{ hz: TUT.semiHz(sa, 6), dur: 1.2 }], label: "Ma(t)" }], sid);
      else if (t.demo === "tanpura") { M.droneStart(sa, S.tanVol || 0.5); setTimeout(() => { if (alive(sid) && UI.scr === "gyaan") M.droneStop(); }, 9000); }
      else if (t.demo === "keherwa") { const info = M.playTheka("keherwa", 80, 2, { sa, mode: "tabla" }); if (info) bubble("🥁 Keherwa", "🥁"); } },
    /* diet & care */
    setDietTab(v) { stopSpeak(); UI.dietTab = v; UI.keep = 1; render(); },
    sayDiet2(tab, i) { stopSpeak(); speak(dietText(tab, i)); },
    water(d) { const c = careDay(); c.water = Math.max(0, Math.min(15, (c.water || 0) + d)); save(); UI.keep = 1; render(); },
    careToggle(id) { const c = careDay(); c[id] = !c[id]; save(); UI.keep = 1; render(); },
    sayDiet() { stopSpeak(); const g = C.DIET.filter((d) => d.good).map((d) => LC(d.food) + ": " + LC(d.note)).join(". "), b = C.DIET.filter((d) => !d.good).map((d) => LC(d.food) + ": " + LC(d.note)).join(". ");
      speak(T("good") + ". " + g + ". " + T("avoid") + ". " + b); },

    async toggleRec(isFree) {
      const btn = $("recbtn"), lab = $("reclabel");
      if (!MIC.on) {
        const ok = await startMic((live) => {
          const pb = $("pbar"), pv = $("pval"), vb = $("vbar"), vv = $("vval");
          if (vb) vb.style.width = Math.min(100, live.rms * 400) + "%";
          if (vv) vv.textContent = live.rms > 0.01 ? Math.round(live.rms * 400) + "%" : "—";
          if (pb) pb.style.width = live.hz > 0 ? Math.min(100, (live.hz - 70) / (400 - 70) * 100) + "%" : "0%";
          if (pv) pv.textContent = live.hz > 0 ? Math.round(live.hz) + " Hz" : "—";
        });
        if (!ok) return;
        UI.recFree = !!isFree;
        if (btn) { btn.textContent = "⏹"; btn.classList.add("rec"); }
        if (lab) lab.textContent = T("recording");
      } else {
        const got = MIC.gotAudio;
        const clip = stopMic();
        if (btn) { btn.textContent = "🎤"; btn.classList.remove("rec"); }
        if (lab) lab.textContent = T("tapRecord");
        if (!clip || clip.samples.length < clip.sampleRate * 0.4 || !got) { toast(T("noAudio")); return; }
        analyzeAndShow(clip, isFree);
      }
    },

    async askGo() { stopSpeak(); const q = ($("askq") || {}).value || ""; UI.askState = { q, res: searchAsk(q) }; UI.keep = 1; render();
      const r = UI.askState.res; speak(r.length ? LC(r[0].a) : T("askNone")); },
    gamePitch() { startPitchGame(); }, gameTT() { startTTGame(); },
    gameMic() { pitchGameMic(); }, ttRec() { ttRecFn(); },
    openVG(id) { stopSpeak(); const def = VG_GAMES.byId(id); if (!def) return; UI.game = null; go("glevels", { id }); const sid = FLOW.sid;
      setTimeout(() => { if (alive(sid) && UI.scr === "glevels") runSteps([{ say: LC(def.name) + ". " + LC(def.story) }], sid); }, 250); },
    gameHow(id) { const def = VG_GAMES.byId(id); if (!def) return; stopSpeak(); const sid = FLOW.sid; S.gseen = S.gseen || {}; S.gseen[id] = 1; save(); runSteps(gameHowSteps(def), sid).then((o) => { if (o) bubble("▶ " + T("gameStart"), "🎮"); }); },
    playLevel(id, L) { stopSpeak(); if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopMic(); const gp = GP(id); if (L > gp.open) { toast(T("lvLocked")); return; }
      const def = VG_GAMES.byId(id); UI.game = { kind: "vg", id, L, stage: "intro" }; UI.vgG = null;
      if (UI.scr !== "gameview") { UI.stack.push({ scr: UI.scr, a: UI.a }); UI.scr = "gameview"; } render();
      const sid = FLOW.sid, P = VG_GAMES.M[def.mech].params(L, def.v), first = !(S.gseen && S.gseen[id]);
      if (first) { S.gseen = S.gseen || {}; S.gseen[id] = 1; save(); }
      const steps = (first ? gameHowSteps(def) : []).concat([{ say: T("level") + " " + L + ". " + T("goalT") + ": " + P.goal + " " + goalUnit(def) + ". " + T("tapStart") }]);
      runSteps(steps, sid); },
    vgBegin() { if (!UI.game || UI.game.stage === "play") return; stopSpeak(); UI.game.stage = "play"; render(); setTimeout(() => vgStartLoop(false), 40); },
    vgRetry() { if (!UI.game) return; VG.playLevel(UI.game.id, UI.game.L); setTimeout(() => VG.vgBegin(), 60); },
    vgSecond() { const g = UI.game, G = UI.vgG; if (!g || !G || (S.coins || 0) < 20) return; S.coins -= 20; save(); g.usedSecond = true; G.lives = 1; G.over = false; G.inv = 1.5; stopSpeak(); g.stage = "play"; render(); setTimeout(() => vgStartLoop(true), 40); },
    vgPause() { const G = UI.vgG; if (!G || !UI.game || UI.game.stage !== "play") return; G.paused = !G.paused; const b = $("vgpause"); if (b) b.textContent = G.paused ? "▶" : "⏸";
      if (G.sched && window.VG_MUSIC) { VG_MUSIC.stopTaal(); if (!G.paused && G.started) schedClicks(G); } },
    shopTap(id) { const it = VG_GAMES.SHOP.find((x) => x.id === id); if (!it) return; S.owned = S.owned || ["bird"];
      if (!S.owned.includes(id)) { if ((S.coins || 0) < it.price) { toast(T("needCoins").replace("{n}", it.price - (S.coins || 0))); return; } S.coins -= it.price; S.owned.push(id); toast("🎉 " + it.e); }
      S.char = it.e; save(); UI.keep = 1; render(); },
    gameExit() { if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopSpeak(); stopMic(); const id = UI.game && UI.game.id; UI.game = null; UI.vgG = null; UI.keep = 0; if (window.VG_MUSIC) VG_MUSIC.stopTaal();
      if (id) { const top = UI.stack[UI.stack.length - 1]; if (top && top.scr === "glevels") UI.stack.pop(); UI.scr = "glevels"; UI.a = { id }; render(); } else go("games"); },

    async playRec(id) { const r = RECS.find((x) => x.id === id); if (!r) return; try { const u = URL.createObjectURL(r.blob); const a = new Audio(u); a.play(); a.onended = () => URL.revokeObjectURL(u); } catch (e) { toast("..."); } },
    delRec(id) { ask(T("confirmReset"), T("reset"), async () => { await DB.del(id); RECS = RECS.filter((x) => x.id !== id); render(); }); },
    saveLastRec() { if (!UI.lastClip) return; saveRecording(UI.lastClip.clip, UI.lastClip.m, UI.lastClip.label); toast(T("saveRec") + " ✓"); },

    backupNow() { const data = JSON.stringify({ format: "voiceguru-backup", version: 1, date: today(), state: S }, null, 1); saveFile("voiceguru-backup-" + today() + ".json", data, "application/json"); toast(T("backedUp")); },
    restore(inp) { const f = inp.files && inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(rd.result); if (d.format !== "voiceguru-backup" || !d.state) throw 0; S = Object.assign(def(), d.state); save(); applySet(); toast(T("restored")); render(); } catch (e) { toast(T("badFile")); } }; rd.readAsText(f); inp.value = ""; },
    reset() { ask(T("confirmReset"), T("reset"), () => { const keep = { lang: S.lang, theme: S.theme, tts: S.tts }; S = Object.assign(def(), keep); save(); toast(T("resetDone")); goHome(); }); },
    reportPdf() { reportPdf(); },
  };
  window.VG = VG;

  function curEx() { if (!UI.a) return null; if (UI.a.scenario != null && UI.a.i === -1) return UI._scn; if (UI.a.i == null || UI.a.i < 0) return null; const lv = C.LEVELS[UI.a.i]; return lv && lv.ex[UI.a.j]; }
  function scenarioAsEx(s) { UI._scn = { type: "confidence", title: s.title, say: s.say, read: s.read }; }

  // override SCR.ex to support scenario
  const _ex = SCR.ex;
  SCR.ex = () => { if (UI.a && UI.a.scenario != null && UI.a.i === -1) { const ex = UI._scn; return topbar(LC(ex.title), true) +
    `<div class="card"><b>${esc(LC(ex.title))}</b><p>${esc(LC(ex.say))}</p></div>` + tutorBoxHtml() +
    `<div class="card read"><div class="mut small">${T("readThis")}</div><div class="rtext">${esc(ex.read)}</div></div>` + lessonCtlHtml(); }
    return _ex(); };

  /* ---------- analyze + show ---------- */
  function analyzeAndShow(clip, isFree, mPre) {
    const m = mPre || AUD.analyzeClip(clip.samples, clip.sampleRate);
    const out = { m, tested: false, pass: false };
    UI.lastClip = { clip, m, label: curEx() ? LC(curEx().title) : "Free" };
    // update best
    if (m.sustainSec > (S.best.sustainSec || 0)) S.best.sustainSec = m.sustainSec;
    save();
    const el = $("result"); if (!el) return out;
    let html = `<div class="card"><h3 style="margin-top:0">📊 ${T("results")}</h3>`;
    html += metricRow(T("pitch"), m.pitchMean > 0 ? m.pitchMean + " " + T("hz") : "—");
    html += metricRow(T("range"), m.semitoneRange + " " + T("semitones") + (m.monotone ? ` ⚠️` : ""));
    html += metricRow(T("sustain"), m.sustainSec + " " + T("secs"));
    html += metricRow(T("steady"), Math.round(m.volSteady * 100) + "%");
    html += metricRow(T("pauses"), m.pauses);
    if (m.monotone) html += `<p class="warn">${T("monotoneWarn")}</p>`;
    html += `<canvas id="intonation" class="intona" width="320" height="90"></canvas>`;
    html += `<div class="row"><button onclick="VG.saveLastRec()">💾 ${T("saveRec")}</button><button onclick="VG.playRec('last')" id="playlast">▶ ${T("playBack")}</button></div>`;
    // voice test
    const ex = curEx();
    if (ex && ex.test && !isFree) {
      const r = checkTarget(m, ex.target); out.tested = true; out.pass = r.pass;
      html += `<div class="test ${r.pass ? "ok" : "bad"}">${r.rows.map((x) => `<div>${x.ok ? "✅" : "❌"} ${esc(x.label)}: ${esc(String(x.got))} (${esc(String(x.need))})</div>`).join("")}</div>`;
      if (r.pass) {
        html += `<div class="res ok">🏆 ${T("passed")}</div>`;
        const lv = C.LEVELS[UI.a.i];
        if (!passed(lv.id)) { S.prog[lv.id] = { passed: true, date: today(), best: m }; addXP(50); save(); }
      } else html += `<div class="res bad">💪 ${T("failed")}</div>`;
    } else addXP(10);
    html += `</div>`;
    el.innerHTML = html;
    // playback for 'last'
    const pl = $("playlast"); if (pl) pl.onclick = () => playClip(clip);
    drawIntonation($("intonation"), m.track);
    return out;
  }
  function playClip(clip) { stopSpeak(); try { const u = URL.createObjectURL(encodeWav(clip.samples, clip.sampleRate)); const a = new Audio(u); a.play(); a.onended = () => URL.revokeObjectURL(u); } catch (e) { } }

  /* ---------- guided lessons: tutor explains -> sings/reads demo -> you -> analysis -> spoken mistakes with demos ---------- */
  function planForEx(ex) {
    if (!ex) return { kind: "speak", rate: 0.9 };
    if (ex.kind) return ex; // Sur Sikho lesson
    if (ex.type === "breathing") return { kind: "breath" };
    if (ex.type === "sustain") return { kind: "hold", notes: [0], holdMin: (ex.target && ex.target.sustainSec) || 6, tremorMax: ex.target && ex.target.tremorMax };
    if (ex.type === "pitch" && !ex.read) return { kind: "glide", notes: [0, 7, 0], dur: 1.8, rangeMin: 5 };
    return { kind: "speak", rate: ex.type === "pace" ? 0.75 : ex.type === "shadow" ? 0.8 : ex.type === "articulate" ? 0.85 : 0.92 };
  }
  function lessonKey() {
    if (UI.scr === "singl" && UI.a && C.SING[UI.a.k]) return "s_" + C.SING[UI.a.k].id;
    if (UI.scr === "ex" && UI.a) return UI.a.scenario != null && UI.a.i === -1 ? "sc_" + UI.a.scenario : "e_" + UI.a.i + "_" + UI.a.j;
    if (UI.scr === "record") return "rec";
    return "";
  }
  function curLesson() {
    let L = null;
    if (UI.scr === "singl" && UI.a) { const l = C.SING[UI.a.k]; if (l) L = { src: l, plan: singPlan(l), sing: true, hasTest: l.kind !== "calib" && l.kind !== "rangeTest" }; }
    else if (UI.scr === "record") { const c = $("ctext"); if (c) UI.customText = c.value; L = { src: { read: recText(), title: { en: "Free", hi: "Free" } }, plan: { kind: "speak", rate: 0.9 }, free: true, rec: true }; }
    else if (UI.scr === "ex") { const ex = curEx(); if (ex) { const free = !!(UI.a && UI.a.scenario != null && UI.a.i === -1); L = { src: ex, plan: planForEx(ex), free, hasTest: !!ex.test && !free }; } }
    if (!L) return null;
    L.key = lessonKey();
    const k = L.plan.kind;
    L.modes = L.rec || k === "breath" || k === "calib" || k === "rangeTest" ? [] : (L.hasTest ? ["learn", "practice", "test"] : ["learn", "practice"]);
    return L;
  }
  const saHz = () => S.sa || DEFAULT_SA;
  const semisOf = (hz) => 12 * Math.log2(hz / saHz());
  /* lesson -> plan with live values (ladder rung, siren within your range, beat length) */
  function singPlan(l) {
    const p = Object.assign({}, l);
    if (l.kind === "ladder") { const r = (S.ladder && S.ladder[l.id]) || 0; p.notes = l.base.map((n) => n + r); p.kind = "scale"; p.ladder = true; p.rung = r; }
    if (l.siren && S.range && S.range.lo && S.range.hi) { const lo = Math.ceil(semisOf(S.range.lo)) + 1, hi = Math.floor(semisOf(S.range.hi)) - 1; if (hi - lo >= 6) { p.notes = [lo, hi, lo]; p.rangeMin = Math.max(5, Math.round((hi - lo) * 0.7)); } }
    if (l.kind === "rhythm") p.beatSec = 60 / l.bpm / (l.sub || 1);
    return p;
  }
  const histOf = (key) => (key && S.hist && S.hist[key]) || [];
  function autoLesson() { const sid = FLOW.sid, scr = UI.scr; setTimeout(() => { if (alive(sid) && UI.scr === scr) lessonRun({ full: true }); }, 300); }
  function bubble(text, icon) { const b = $("tutortext"); if (b) b.textContent = text; const i = $("tutoric"); if (i) i.textContent = icon || "🧑‍🏫"; }
  function tag(text) { const t = $("tbtag"); if (t) { t.textContent = text || ""; t.style.display = text ? "" : "none"; } }
  function seqLabel(s) { return s.label === "you" || s.label === "flat" ? T("yourNote") : ["demo", "steady", "wave"].includes(s.label) ? T("rightWay") : (s.label || ""); }
  async function runSteps(list, sid) {
    for (const s of list) {
      if (!s) continue;
      for (;;) {
        while (FLOW.paused && alive(sid)) await sleep(150);
        if (!alive(sid)) return false;
        FLOW.cut = false;
        if (!(await doStep(s, sid))) return false;
        if (FLOW.cut && FLOW.paused) continue; // stopped by Pause -> play this step again after Resume
        break;
      }
    }
    return alive(sid);
  }
  async function doStep(s, sid) {
      if (s.say) { bubble(s.say, "🗣️"); await TUT.say(s.say, { rate: s.rate }); }
      else if (s.seq) { bubble("🎵 " + seqLabel(s), "🎵"); await TUT.playSeq(s.seq, { vowel: s.vowel }); await sleep(150); }
      else if (s.rhythmDemo) { if (UI.curPlan) await rhythmDemo(UI.curPlan, sid); }
      else if (s.refClip) { const r = UI.ref; if (r) { const a = Math.max(0, Math.floor(s.refClip[0] * r.sr)), b = Math.min(r.samples.length, Math.floor(Math.min(s.refClip[1], s.refClip[0] + 20) * r.sr));
          bubble("🎧 " + T("refT"), "🎧"); await TUT.playSamples(r.samples.subarray(a, b), r.sr); await sleep(150); } }
      else if (s.track) { bubble("🎵 " + T("yourNote"), "🎵"); await TUT.playTrack(s.track, 5); await sleep(150); }
      else if (s.clip) { // the user's REAL recorded voice
        const c = UI.curClip;
        if (c && c.clip && s.clip[1] > s.clip[0]) { const sr = c.clip.sampleRate, a = Math.max(0, Math.floor(s.clip[0] * sr)), b = Math.min(c.clip.samples.length, Math.floor(Math.min(s.clip[1], s.clip[0] + 3) * sr));
          bubble("🎧 " + T("yourVoice"), "🎧"); await TUT.playSamples(c.clip.samples.subarray(a, b), sr); await sleep(150); }
        else if (s.fallback) await doStep(s.fallback, sid);
      } else if (s.clipFix) { // the user's own voice moved to the correct note
        const c = UI.curClip;
        if (c && c.clip) { const r = TUT.pitchShiftClip(c.clip, c.track, s.clipFix[0], Math.min(s.clipFix[1], s.clipFix[0] + 2.5), s.clipFix[2]);
          if (r) { bubble("✨ " + T("yourVoiceFixed"), "✨"); await TUT.playSamples(r.samples, r.sr); await sleep(150); } }
      } else if (s.wait) await sleep(s.wait);
      return true;
  }
  function meterUpdate(live) {
    const pb = $("pbar"), pv = $("pval"), vb = $("vbar"), vv = $("vval");
    if (vb) vb.style.width = Math.min(100, live.rms * 400) + "%";
    if (vv) vv.textContent = live.rms > 0.01 ? Math.round(live.rms * 400) + "%" : "—";
    if (pb) pb.style.width = live.hz > 0 ? Math.min(100, (live.hz - 70) / (400 - 70) * 100) + "%" : "0%";
    if (pv) { if (live.hz > 0) { const n = window.VG_GAMES && VG_GAMES.noteOf(live.hz); pv.textContent = Math.round(live.hz) + " Hz" + (n ? " · " + n.name : ""); } else pv.textContent = "—"; }
  }
  function setRecBtn(on) { const b = $("recbtn"), l = $("reclabel"); if (b) { b.textContent = on ? "⏹" : "🎤"; b.classList.toggle("rec", on); } if (l) l.textContent = on ? T("recStopHint") : T("tapRecord"); }
  function showCue(plan) { const el = $("cue"); if (!el) return;
    if (plan.kind === "rhythm") { el.innerHTML = beatDots(plan.taal, plan); return; }
    if (!plan.notes || (plan.kind !== "scale" && plan.kind !== "note")) { el.innerHTML = ""; return; }
    el.innerHTML = plan.notes.map((s, i) => `<span class="nchip${plan.durs && plan.durs[i] >= 2 ? " long" : ""}" id="cue${i}">${TUT.sargName(s)}</span>`).join(""); }
  function startCue(plan) { if (!plan.notes || (plan.kind !== "scale" && plan.kind !== "note")) return; const NT = TUT.noteTimes(plan), t0 = performance.now(); clearInterval(UI.cueT);
    UI.cueT = setInterval(() => { const t = (performance.now() - t0) / 1000; let i = NT.findIndex((w) => t >= w[0] && t < w[1]); if (t >= NT[NT.length - 1][1]) i = -1;
      plan.notes.forEach((_, k) => { const c = $("cue" + k); if (c) c.classList.toggle("on", k === i); }); if (t >= NT[NT.length - 1][1]) clearInterval(UI.cueT); }, 50); }
  /* beat dots for a taal: sam = X, khali = 0, note name (if any) under each matra */
  function beatDots(taalId, plan) {
    const tl = MUS().TAALS[taalId || "keherwa"]; if (!tl) return "";
    const sub = (plan && plan.sub) || 1, notes = plan && plan.notes;
    let h = `<div class="beats">`;
    for (let b = 0; b < tl.beats; b++) {
      const mark = b === 0 ? "X" : tl.khali.includes(b) ? "0" : tl.taali.includes(b) ? String(tl.taali.indexOf(b) + 1) : "";
      const nm = notes && notes.length > 1 ? (sub > 1 ? [0, 1].map((k) => TUT.sargName(notes[(b * sub + k) % notes.length])).join(" ") : TUT.sargName(notes[b % notes.length])) : (notes ? TUT.sargName(notes[0]) : "");
      h += `<span class="bt${b === 0 ? " sam" : ""}${tl.khali.includes(b) ? " khali" : ""}" id="bt${b}"><small>${mark || "&nbsp;"}</small><b>${b + 1}</b><i>${esc(tl.bols[b])}</i>${nm ? `<em>${nm}</em>` : ""}</span>`;
    }
    return h + `</div>`;
  }
  /* light up the current matra; info from VG_MUSIC.playTheka */
  function beatViz(info, beats, fromCycle) {
    clearInterval(UI.beatT);
    UI.beatT = setInterval(() => { const t = MUS().now() - info.start, i = Math.floor(t / info.beatSec);
      for (let b = 0; b < beats; b++) { const e = $("bt" + b); if (e) e.classList.toggle("on", i >= 0 && i < info.n && i % beats === b); }
      const r = $("cue"); if (r) r.classList.toggle("yourturn", fromCycle != null && i >= fromCycle * beats && i < info.n);
      if (i >= info.n) { clearInterval(UI.beatT); for (let b = 0; b < beats; b++) { const e = $("bt" + b); if (e) e.classList.remove("on"); } if (r) r.classList.remove("yourturn"); } }, 40); }
  function recOpts(plan) {
    if (plan.kind === "speak") return { maxSec: 45, autoStop: true, prompt: T("yourTurnSpeak") };
    if (plan.kind === "hold" || plan.kind === "tone" || plan.kind === "dyn") return { maxSec: (plan.holdMin || 6) + 6, autoStop: true, prompt: T("yourTurnSing") };
    if (plan.kind === "song") return { maxSec: plan.maxSec || 90, autoStop: true, silence: 4500, prompt: T("yourTurnSing") };
    if (plan.kind === "calib") return { maxSec: 4.5, prompt: T("yourTurnSing") };
    if (plan.kind === "glide") return { maxSec: (plan.notes.length - 1) * (plan.dur || 1.8) + 2, prompt: T("yourTurnSing") };
    return { maxSec: plan.notes.length * (plan.dur || 1.2) + 1.2, prompt: T("yourTurnSing"), cue: true };
  }
  async function guidedRecord(sid, plan) {
    const o = recOpts(plan);
    bubble(o.prompt, "🎤"); await TUT.beep(); await sleep(100);
    if (!alive(sid)) return null;
    FLOW.stopReq = false;
    let lastVoice = 0, voicedMs = 0;
    const ok = await startMic((live) => { meterUpdate(live); const now = performance.now(); if (live.rms > 0.02) { if (lastVoice && now - lastVoice < 250) voicedMs += now - lastVoice; lastVoice = now; } });
    if (!ok) { bubble(T("micDenied"), "⚠️"); return null; }
    if (!alive(sid)) { stopMic(); return null; }
    const ducked = MUS() && MUS().droneOn() && !S.earphone; if (ducked) MUS().duck(true); // tanpura softer while the mic listens
    FLOW.rec = true; FLOW.phase = "rec"; setRecBtn(true); const t0 = performance.now();
    if (o.cue) startCue(plan);
    while (alive(sid) && !FLOW.stopReq) {
      await sleep(100);
      if ((performance.now() - t0) / 1000 >= o.maxSec) break;
      if (o.autoStop && voicedMs > 1200 && lastVoice && performance.now() - lastVoice > (o.silence || 2200)) break;
    }
    clearInterval(UI.cueT); FLOW.rec = false; setRecBtn(false); if (ducked) MUS().duck(false);
    const got = MIC.gotAudio, clip = stopMic();
    if (!alive(sid)) return null;
    if (!clip || !got || clip.samples.length < clip.sampleRate * 0.4) { bubble(T("noAudio"), "⚠️"); await TUT.say(T("noAudioSay")); return null; }
    return clip;
  }
  function demoSteps(L, sa) {
    const p = L.plan, st = [];
    if (p.kind === "speak") { if (L.src.read) st.push({ say: T("listenFirst") }, { say: L.src.read, rate: p.rate }); }
    else if (p.kind === "hold" || p.kind === "glide") st.push({ say: T("listenFirst") }, { seq: TUT.demoSeq(p, sa), label: "demo" });
    else if (p.kind === "tone") st.push({ say: T("listenFirst") }, { seq: [{ hz: TUT.semiHz(sa, (p.notes || [0])[0]), dur: Math.min(4, p.holdMin || 4) }], vowel: p.vowel, label: "demo" });
    else if (p.kind === "dyn") { const hz = TUT.semiHz(sa, (p.notes || [0])[0]); st.push({ say: T("listenFirst") }, { seq: [{ hz, dur: 2.6, vol: 0.2, volTo: 1, noVib: true }, { hz, dur: 2.6, vol: 1, volTo: 0.2, gap: 0 }], label: "demo" }); }
    else if (p.kind === "rhythm") st.push({ say: T("listenTaal") }, { rhythmDemo: true });
    else if (p.kind === "note" || p.kind === "scale") {
      const names = p.notes.map(TUT.sargName);
      st.push({ say: T("listenFirst") + " " + names.join(", ") + "." }, { seq: TUT.demoSeq(p, sa), label: names.join(" ") });
    }
    return st;
  }
  const nowYouText = (p, L) => (p.kind === "speak" ? (L.src.read ? T("nowYouRead") : T("nowYouSpeak")) : T("nowYouSing"));
  function techFor(L) { const p = L.plan, k = p.kind === "speak" ? (TUT.TECH[L.src.type] ? L.src.type : "speak") : p.ladder ? "ladder" : p.kind; return TUT.pick(TUT.TECH[k], S.lang); }
  function evaluate(p, m, src, sa, focus, ctx) {
    const lang = S.lang; ctx = ctx || {};
    if (p.kind === "tone") { const q = ctx.clip ? TUT.toneQuality(ctx.clip.samples, ctx.clip.sampleRate, m.track) : null;
      if (q) { const v = m.track.filter((x) => x.hz > 0); q.seg = v.length ? [v[0].t, Math.min(v[v.length - 1].t, v[0].t + 3)] : [0, 3]; }
      return { fb: TUT.feedbackTone(m, q, p, sa, lang), q }; }
    if (p.kind === "dyn") { const r = TUT.analyzeDyn(m.track, p, sa); return { fb: TUT.feedbackDyn(r, p, sa, lang), dyn: r }; }
    if (p.kind === "rhythm") { const r = TUT.analyzeRhythm(m.track, ctx.beats || [], p, sa, ctx.latency || 0); return { fb: TUT.feedbackRhythm(r, p, sa, lang), rhythm: r }; }
    if (p.kind === "note" || p.kind === "scale") { const r = TUT.analyzeNotes(m.track, p, sa); return { fb: TUT.feedbackNotes(r, p, sa, m, lang), notesRes: r }; }
    if (p.kind === "glide") return { fb: TUT.feedbackGlide(TUT.analyzeGlide(m.track, p, sa), p, sa, m.track, lang) };
    if (p.kind === "hold") return { fb: TUT.feedbackHold(m, p, sa, lang) };
    return { fb: TUT.feedbackSpeech(m, src, lang, focus) };
  }
  function addHist(L, score, mode) {
    if (!L.key) return;
    if (!S.hist) S.hist = {}; if (!S.histName) S.histName = {};
    const h = S.hist[L.key] || (S.hist[L.key] = []);
    h.push({ d: today(), s: score, m: mode[0] }); if (h.length > 40) h.splice(0, h.length - 40);
    S.histName[L.key] = LC(L.src.title); save();
    const sl = $("scoreline"); if (sl) sl.outerHTML = bestLine(L);
  }
  /* Teacher flow: Learn (explain + how + demo) -> Practice (attempt + mistakes + drills) -> Test (scored, unlocks) */
  async function lessonRun(opts) {
    opts = opts || {};
    stopSpeak(); const sid = FLOW.sid, L = curLesson(); if (!L) return;
    const res = $("result"); if (res) res.innerHTML = "";
    const p = L.plan, sa = saHz();
    FLOW.phase = "intro"; FLOW.phaseSid = sid; tag("");
    if (p.kind === "breath") return breathLesson(L, sid);
    UI.curPlan = p; showCue(p);
    if (p.kind === "rangeTest") { const r0 = await rangeFlow(L, sid, opts); if (r0 && alive(sid)) await classAfter(sid); return; }
    let mode = L.modes.length ? (UI.mode || "practice") : "practice";
    if (mode === "learn") {
      if (!opts.skipDemo) {
        const st = [{ say: T("learnIntro") }];
        if (L.src.learn) st.push({ say: LC(L.src.learn) });
        if (L.src.say) st.push({ say: LC(L.src.say) });
        const tech = techFor(L); if (tech) st.push({ say: tech });
        st.push(...demoSteps(L, sa), { say: T("learnDone") });
        if (!await runSteps(st, sid)) return;
      }
      UI.mode = "practice"; markTabs(); mode = "practice"; opts.skipDemo = true;
    }
    const r = await attempt(L, mode, sid, opts);
    if (r && alive(sid)) await classAfter(sid);
  }
  async function attempt(L, mode, sid, opts) {
    const p = L.plan, sa = saHz(), test = mode === "test";
    const st = [];
    if (!opts.skipDemo) {
      if (test) st.push({ say: p.kind === "speak" ? T("testIntroSpeak") : T("testIntroSing") });
      else if (opts.full && L.src.say) st.push({ say: LC(L.src.say) });
      if (!(test && p.kind === "speak")) st.push(...demoSteps(L, sa));
    }
    if (p.kind !== "calib" || !opts.full) st.push({ say: nowYouText(p, L) });
    tag(test ? "📝 " + T("mTest") : "");
    if (!await runSteps(st, sid)) return null;
    let rh = null, clip;
    if (p.kind === "rhythm") { rh = await guidedRhythm(sid, p); clip = rh && rh.clip; } else clip = await guidedRecord(sid, p);
    FLOW.phase = "fb";
    if (!clip) return null;
    bubble(T("analyzing"), "⏳"); await sleep(30);
    if (p.kind === "calib") { await calibDone(clip, sid); return alive(sid) ? true : null; }
    const m = AUD.analyzeClip(clip.samples, clip.sampleRate);
    const ev = evaluate(p, m, L.src, sa, null, { clip, beats: rh && rh.beats, latency: rh && rh.latency }), fb = ev.fb;
    UI.curClip = UI.mainClip = { clip, track: m.track };
    const prev = histOf(L.key).slice();
    let pass = fb.pass;
    if (L.sing) { showSingResult(clip, m, ev, fb, test); if (test && pass) { markSing(L.src.id); if (p.ladder) ladderUp(L); } }
    else { const r = analyzeAndShow(clip, L.free || !test, m); if (r.tested) pass = r.pass; }
    addHist(L, fb.score, mode);
    showFeedback(fb, prev);
    const lang = S.lang;
    if (!await runSteps([{ say: fb.summary }, { say: TUT.improveText(prev, fb.score, lang) }], sid)) return null;
    if (test) {
      if (pass) { await runSteps([{ say: T("testPass") }], sid); if (alive(sid)) { bubble("🏆 " + T("testPass"), "🧑‍🏫"); FLOW.phase = ""; } UI.goodRuns = 0; return alive(sid) ? true : null; }
      const st2 = [{ say: T("testFail") }]; fb.items.filter((i) => !i.info).slice(0, 2).forEach((i) => st2.push({ say: i.text }));
      st2.push({ say: T("testFailNext") });
      if (!await runSteps(st2, sid)) return null;
      UI.mode = "practice"; markTabs();
      if (!await runDrills(L, fb, sid)) return null;
      if (alive(sid)) { bubble("💪 " + T("drillDone"), "🧑‍🏫"); FLOW.phase = ""; }
      return true;
    }
    for (let i = 0; i < fb.items.length; i++) { markItem(i); if (!await runSteps(fb.items[i].steps, sid)) return null; }
    markItem(-1);
    if (!await runDrills(L, fb, sid)) return null;
    if (L.hasTest && (pass || fb.score >= 80)) {
      UI.goodRuns = (UI.goodRuns || 0) + 1;
      if (UI.goodRuns >= 2 || fb.score >= 90) {
        if (!await runSteps([{ say: T("readyTest") }], sid)) return null;
        UI.mode = "test"; markTabs(); UI.goodRuns = 0;
        return attempt(L, "test", sid, {});
      }
      await runSteps([{ say: T("oneMoreGood") }], sid);
    } else {
      if (L.hasTest) UI.goodRuns = 0;
      await runSteps([{ say: pass ? T("passSay") : T("tryAgainSay") }], sid);
    }
    if (alive(sid)) { bubble((pass ? "🏆 " + T("passSay") : "💪 " + T("tryAgainSay")), "🧑‍🏫"); FLOW.phase = ""; }
    return alive(sid) ? true : null;
  }
  /* targeted practice of the mistakes (max 2 drills x 3 tries) */
  async function runDrills(L, fb, sid) {
    const items = fb.items.filter((i) => i.drill).slice(0, 2);
    if (!items.length) return alive(sid);
    if (!await runSteps([{ say: T("drillIntro") }], sid)) return false;
    const sa = saHz();
    for (const it of items) {
      const d = it.drill, DL = { src: { read: d.read || L.src.read, type: L.src.type }, plan: d };
      let good = false;
      for (let k = 0; k < 3 && !good; k++) {
        showCue(d); tag("🎯 " + T("drillT") + (d.name ? ": " + d.name : "") + " (" + (k + 1) + "/3)");
        const st = [{ say: k === 0 ? d.intro : T("drillAgain") }].concat(demoSteps(DL, sa), [{ say: nowYouText(d, DL) }]);
        if (!await runSteps(st, sid)) return false;
        const clip = await guidedRecord(sid, d); if (!alive(sid)) return false; if (!clip) continue;
        const m = AUD.analyzeClip(clip.samples, clip.sampleRate);
        UI.curClip = { clip, track: m.track };
        const ev = evaluate(d, m, DL.src, sa, d.focus);
        if (ev.fb.pass) { good = true; if (!await runSteps([{ say: T("drillGood") }], sid)) return false; }
        else { const f = ev.fb.items.find((x) => !x.info); if (!await runSteps(f ? f.steps : [{ say: ev.fb.summary }], sid)) return false; }
      }
      if (!good && !await runSteps([{ say: T("drillLater") }], sid)) return false;
    }
    tag(""); showCue(L.plan); UI.curClip = UI.mainClip;
    return runSteps([{ say: T("drillDone") }], sid);
  }
  function showFeedback(fb, prev) {
    UI.fb = fb; const el = $("result"); if (!el) return;
    const last = prev && prev.length ? prev[prev.length - 1].s : null, d0 = last == null ? "" : (fb.score - last >= 0 ? " ▲ +" : " ▼ ") + (fb.score - last);
    const d = document.createElement("div"); d.className = "card tutorfb";
    d.innerHTML = `<div class="row" style="align-items:center"><h3 style="margin:0;flex:1">🧑‍🏫 ${T("tutorAdvice")}</h3><span class="scorebig">${fb.score}<small>/100</small></span></div>` +
      (d0 ? `<div class="mut small" style="text-align:right">${T("lastScore")}: ${last}${d0}</div>` : "") + `<p><b>${esc(fb.summary)}</b></p>` +
      fb.items.map((it, i) => `<div class="mist" id="mist${i}"><span>${it.info ? "ℹ️" : "❌"} ${esc(it.text)}</span><button class="ib" onclick="VG.replayItem(${i})" aria-label="listen">🔊</button></div>`).join("");
    el.insertBefore(d, el.firstChild);
  }
  function markItem(i) { document.querySelectorAll(".mist").forEach((x, k) => x.classList.toggle("on", k === i)); }
  function markSing(id) { if (!S.sing[id]) { S.sing[id] = today(); addXP(20); } save(); }
  function showSingResult(clip, m, ev, fb, test) {
    UI.lastClip = { clip, m, label: "Sur" };
    const el = $("result"); if (!el) return;
    const notesRes = ev && ev.notesRes;
    let html = `<div class="card"><h3 style="margin-top:0">📊 ${T("results")}</h3>`;
    if (ev && ev.rhythm) { const r = ev.rhythm;
      html += metricRow(T("onBeat"), r.hitRate + "%") + metricRow(T("timing"), (r.meanOff > 0 ? "+" : "") + r.meanOff + " ms (" + (Math.abs(r.meanOff) <= 120 ? "✅" : r.meanOff > 0 ? T("late") : T("early")) + ")") + metricRow(T("evenness"), "± " + r.sd + " ms");
      if (r.hits.some((h) => h.name)) html += metricRow(T("notesOk"), r.notesOk + "%");
      html += `<div class="beats small">${r.hits.map((h) => `<span class="bt ${h.miss ? "miss" : Math.abs(h.off) <= 120 && h.noteOk !== false ? "good" : "off"}"><b>${h.i + 1}</b><i>${h.miss ? "—" : (h.off > 0 ? "+" : "") + h.off}</i></span>`).join("")}</div>`; }
    else if (ev && ev.q) { html += metricRow(T("clarity"), ev.q.hnr + " dB " + (ev.q.hnr >= 9 ? "✅" : "⚠️")) + metricRow(T("ring"), ev.q.ring + " dB " + (ev.q.ring > -30 ? "✅" : "ℹ️")) + metricRow(T("sustain"), m.sustainSec + " " + T("secs")); }
    else if (ev && ev.dyn) { const d = ev.dyn; if (!d.missing) html += metricRow(T("dynGrow"), d.grow ? "✅" : "❌") + metricRow(T("dynFade"), d.fade ? "✅" : "❌") + metricRow(T("dynSteady"), (d.drift > 0 ? "+" : "") + d.drift + " cents " + (d.steady ? "✅" : "❌")); }
    else if (notesRes) html += notesRes.notes.map((n) => `<div class="mrow"><span>${esc(n.name)}</span><b>${n.missing ? "— " + T("noteMissing") : (n.ok && n.steady ? "✅ " : "❌ ") + (n.cents > 0 ? "+" : "") + n.cents + " cents"}</b></div>`).join("");
    else html += metricRow(T("range"), m.semitoneRange + " " + T("semitones")) + metricRow(T("sustain"), m.sustainSec + " " + T("secs"));
    html += `<canvas id="intonation" class="intona" width="320" height="90"></canvas>
      <div class="row"><button id="playlast">▶ ${T("playBack")}</button><button onclick="VG.saveLastRec()">💾 ${T("saveRec")}</button></div>`;
    if (test) html += `<div class="res ${fb.pass ? "ok" : "bad"}">${fb.pass ? "🏆 " + T("singPass") : "💪 " + T("failed")}</div>`;
    el.innerHTML = html + `</div>`;
    const pl = $("playlast"); if (pl) pl.onclick = () => playClip(clip);
    drawIntonation($("intonation"), m.track);
  }
  async function calibDone(clip, sid) {
    const m = AUD.analyzeClip(clip.samples, clip.sampleRate);
    const fr = (m.track || []).filter((p) => p.hz > 0);
    if (fr.length < 8) { await runSteps([{ say: T("calibFail") }], sid); if (alive(sid)) bubble(T("calibFail"), "💪"); return; }
    const hz = Math.max(80, Math.min(350, TUT.median(fr.map((p) => p.hz))));
    const sn = TUT.snapHz(hz); S.sa = Math.round(sn.hz * 100) / 100; markSing("calib"); save(); VG.retune();
    const el = $("result"); if (el) el.innerHTML = `<div class="card center"><div class="mut">${T("mySa")}</div><div class="big">${sn.name}</div><div class="mut">${Math.round(S.sa)} Hz</div><div class="res ok">🏆 ${T("singPass")}</div></div>`;
    await runSteps([{ say: T("saFound") }, { seq: [{ hz: S.sa, dur: 2 }], label: "Sa" }, { say: T("saNext") }], sid);
    if (alive(sid)) { bubble("🏆 " + T("saNext"), "🧑‍🏫"); FLOW.phase = ""; }
  }
  async function breathLesson(L, sid) {
    if (!await runSteps([{ say: LC(L.src.say) }, { say: T("breathStart") }], sid)) return;
    FLOW.phase = "";
    breatheRun(UI.classShort ? 24 : (L.src.seconds || 40), sid);
  }
  /* ---- mode tabs + score line ---- */
  function modeTabsHtml() {
    const L = curLesson(); if (!L || !L.modes.length) return "";
    const m = UI.mode || "practice", lab = { learn: "📘 " + T("mLearn"), practice: "🔁 " + T("mPractice"), test: "📝 " + T("mTest") };
    return `<div class="seg mtabs">${L.modes.map((k) => `<button class="${m === k ? "on" : ""}" data-m="${k}" onclick="VG.setMode('${k}')">${lab[k]}</button>`).join("")}</div>` + bestLine(L);
  }
  function bestLine(L) { const h = histOf(L.key); if (!h.length) return `<div id="scoreline"></div>`;
    const best = Math.max.apply(null, h.map((x) => x.s)), last = h[h.length - 1].s;
    return `<div class="mut small center" id="scoreline">${T("lastScore")}: <b>${last}</b> · ${T("bestScore")}: <b>${best}</b> · ${T("tries")}: ${h.length}</div>`; }
  function markTabs() { document.querySelectorAll(".mtabs button").forEach((b) => b.classList.toggle("on", b.dataset.m === (UI.mode || "practice"))); }
  /* ---- Aaj ki class: warm-up -> next singing lesson -> weakest item -> speaking ---- */
  function keyToItem(key) {
    let m;
    if ((m = /^s_(.+)$/.exec(key))) { const k = C.SING.findIndex((l) => l.id === m[1]); return k >= 0 ? { t: "sing", k } : null; }
    if ((m = /^e_(\d+)_(\d+)$/.exec(key))) return { t: "ex", i: +m[1], j: +m[2] };
    if ((m = /^sc_(\d+)$/.exec(key))) return { t: "sc", i: +m[1] };
    return null;
  }
  const itemKey = (it) => (it.t === "sing" ? "s_" + C.SING[it.k].id : it.t === "sc" ? "sc_" + it.i : "e_" + it.i + "_" + it.j);
  function buildClass() {
    const q = [{ t: "ex", i: 0, j: 0, short: true }];
    const nextIn = (secs) => C.SING.findIndex((l, i) => secs.includes(l.sec) && singOpen(i) && !S.sing[l.id]);
    if (S.sing.sa) { const h = C.SING.findIndex((l) => l.id === "q_hum"); if (h >= 0) q.push({ t: "sing", k: h }); }
    let k = nextIn(["neenv", "swar"]); if (k < 0) k = nextIn(["dhun", "tone", "range"]); if (k >= 0) q.push({ t: "sing", k });
    const al = nextIn(["alankar"]); if (al >= 0) q.push({ t: "sing", k: al });
    const tl = nextIn(["taal"]); if (tl >= 0) q.push({ t: "sing", k: tl });
    let weak = null;
    Object.keys(S.hist || {}).forEach((key) => { const h = S.hist[key]; if (!h || !h.length || key === "rec" || key.indexOf("song") === 0) return; const last = h[h.length - 1].s; if (last < 80 && (!weak || last < weak.s)) weak = { key, s: last }; });
    if (weak) { const it = keyToItem(weak.key); if (it) q.push(it); }
    let li = 0; while (li < C.LEVELS.length - 1 && passed(C.LEVELS[li].id)) li++;
    const lv = C.LEVELS[li]; let j = lv.ex.findIndex((e) => e.type !== "breathing"); if (j < 0) j = 0;
    q.push({ t: "ex", i: li, j });
    const seen = {}; return q.filter((it) => { const kk = itemKey(it) + (it.short ? "s" : ""); if (seen[kk]) return false; seen[kk] = 1; return true; }).slice(0, 7);
  }
  async function classNext() {
    const q = UI.classQ; if (!q) return;
    if (!q.length) {
      UI.classQ = null; if (!S.classDays) S.classDays = {}; S.classDays[today()] = 1; addXP(30); save();
      const sid = FLOW.sid; await runSteps([{ say: T("classDone") }], sid); if (alive(sid)) bubble("🏆 " + T("classDone"), "🧑‍🏫"); return;
    }
    const it = q.shift(); UI.classI = (UI.classI || 0) + 1; UI.classShort = !!it.short; UI.goodRuns = 0;
    UI.mode = histOf(itemKey(it)).length ? "practice" : "learn";
    UI.inClass = true;
    if (it.t === "ex") { UI.exState = {}; go("ex", { i: it.i, j: it.j }); }
    else if (it.t === "sing") go("singl", { k: it.k });
    else { scenarioAsEx(C.SCENARIOS[it.i]); go("ex", { scenario: it.i, i: -1, j: -1 }); }
    UI.inClass = false;
    autoLesson();
  }
  async function classAfter(sid) {
    if (!UI.classQ || !alive(sid)) return;
    if (!await runSteps([{ say: T("classNextSay") }], sid)) return;
    classNext();
  }
  /* ---------- taal: demo, latency sync, guided recording ---------- */
  async function rhythmDemo(p, sid) {
    const M = MUS(), ctx = TUT.ac(); if (!M || !ctx) return;
    const tl = M.TAALS[p.taal], sub = p.sub || 1, sa = saHz(), at = ctx.currentTime + 0.35;
    const info = M.playTheka(p.taal, p.bpm, 1, { at, sa, mode: "tabla" }); if (!info) return;
    const bs = info.beatSec / sub, n = tl.beats * sub, seq = [];
    for (let i = 0; i < n; i++) seq.push({ hz: TUT.semiHz(sa, p.notes[i % p.notes.length]), dur: bs * 0.5, gap: bs * 0.5, noVib: true });
    bubble("🥁 " + LC(tl.name), "🥁"); showCue(p); beatViz(info, tl.beats, null);
    await Promise.all([TUT.playSeq(seq, { at }), sleep((info.end - ctx.currentTime) * 1000 + 250)]);
    clearInterval(UI.beatT);
  }
  /* measures speaker->mic delay once (phone speaker only), so "early/late" is judged fairly */
  async function calibrateLatency(sid) {
    const M = MUS(), ctx = TUT.ac(); if (!M || !ctx) return 0;
    bubble(T("syncSay"), "🥁"); await TUT.say(T("syncSay")); if (!alive(sid)) return null;
    const ok = await startMic(null); if (!ok) return null;
    const micT0 = performance.now(); await sleep(200);
    const at = ctx.currentTime + 0.3, perfAt = performance.now() + 300, times = [];
    for (let i = 0; i < 6; i++) { M.click(at + i * 0.5, true); times.push((perfAt - micT0) / 1000 + i * 0.5); }
    await sleep(3600); const clip = stopMic(); if (!alive(sid) || !clip) return null;
    const tr = AUD.analyzeClip(clip.samples, clip.sampleRate).track, med = TUT.median(tr.map((p) => p.rms)), thr = Math.max(0.01, med * 5);
    const d = []; times.forEach((t) => { const f = tr.find((p) => p.t >= t - 0.04 && p.t <= t + 0.5 && p.rms > thr); if (f) d.push(f.t + 0.02 - t); });
    let lat = d.length >= 4 ? Math.max(0, Math.min(0.4, TUT.median(d))) : Math.min(0.25, ctx.outputLatency || ctx.baseLatency || 0);
    S.latency = { v: Math.round(lat * 1000) / 1000, n: d.length, date: today() }; save();
    return lat;
  }
  async function guidedRhythm(sid, p) {
    const M = MUS(), ctx = TUT.ac(); if (!M || !ctx) return null;
    if (!S.latency && !S.earphone) { const l = await calibrateLatency(sid); if (l == null || !alive(sid)) return null; }
    const tl = M.TAALS[p.taal], sub = p.sub || 1, beat = 60 / p.bpm, cycles = 1 + (p.cycles || 1);
    bubble(T("countIn"), "🥁"); await TUT.say(T("countIn")); if (!alive(sid)) return null;
    FLOW.stopReq = false;
    const ducked = M.droneOn() && !S.earphone; if (ducked) M.duck(true);
    const ok = await startMic(meterUpdate); if (!ok) { if (ducked) M.duck(false); bubble(T("micDenied"), "⚠️"); return null; }
    const micT0 = performance.now(); FLOW.rec = true; FLOW.phase = "rec"; setRecBtn(true);
    await sleep(120);
    const info = M.playTheka(p.taal, p.bpm, cycles, { at: ctx.currentTime + 0.35, sa: saHz(), mode: S.earphone ? "tabla" : "countin" });
    const userStart = (info.perfStart - micT0) / 1000 + tl.beats * beat, n = (p.cycles || 1) * tl.beats * sub, beats = [];
    for (let i = 0; i < n; i++) beats.push(userStart + i * beat / sub);
    FLOW.rhythm = { t0: userStart, beat: beat / sub, n };
    showCue(p); beatViz(info, tl.beats, 1);
    const endAt = performance.now() + (info.end - ctx.currentTime) * 1000 + 600;
    while (alive(sid) && !FLOW.stopReq && performance.now() < endAt) await sleep(80);
    M.stopTaal(); clearInterval(UI.beatT); FLOW.rec = false; setRecBtn(false); if (ducked) M.duck(false);
    const got = MIC.gotAudio, clip = stopMic();
    if (!alive(sid)) return null;
    if (!clip || !got) { bubble(T("noAudio"), "⚠️"); await TUT.say(T("noAudioSay")); return null; }
    const lat = S.earphone ? Math.min(0.25, ctx.outputLatency || ctx.baseLatency || 0) : ((S.latency && S.latency.v) || 0);
    return { clip, beats, latency: lat };
  }
  /* ---------- range test: lowest then highest comfortable note ---------- */
  async function rangeFlow(L, sid, opts) {
    const st = []; if (opts.full) st.push({ say: T("learnIntro") }, { say: LC(L.src.learn) }, { say: LC(L.src.say) });
    st.push({ say: T("rangeLowSay") });
    if (!await runSteps(st, sid)) return null;
    const lowClip = await guidedRecord(sid, { kind: "hold", holdMin: 3 }); if (!lowClip) return null;
    if (!await runSteps([{ say: T("rangeHighSay") }], sid)) return null;
    const highClip = await guidedRecord(sid, { kind: "hold", holdMin: 3 }); if (!highClip) return null;
    FLOW.phase = "fb";
    const r = TUT.rangeFrom(AUD.analyzeClip(lowClip.samples, lowClip.sampleRate).track, AUD.analyzeClip(highClip.samples, highClip.sampleRate).track);
    if (!r) { await runSteps([{ say: T("rangeFail") }], sid); if (alive(sid)) { bubble(T("rangeFail"), "💪"); FLOW.phase = ""; } return null; }
    const prev = S.range; S.range = Object.assign({ date: today() }, r); if (!S.rangeHist) S.rangeHist = []; S.rangeHist.push({ d: today(), s: r.semis }); markSing(L.src.id); save();
    const prevH = histOf(L.key).slice(); addHist(L, Math.min(100, Math.round(r.semis / 24 * 100)), "t");
    const el = $("result"); if (el) el.innerHTML = `<div class="card center"><div class="mut">${T("myRange")}</div><div class="big">${r.loName} – ${r.hiName}</div>
      <div class="mut">${r.semis} semitone · ${esc(TUT.pick({ en: "~" + r.type, hi: "~" + r.type }, S.lang))}</div>
      <div class="rangebar"><i style="left:${Math.max(0, Math.min(100, (12 * Math.log2(r.lo / 65.41)) / 48 * 100))}%;width:${Math.max(4, r.semis / 48 * 100)}%"></i></div>
      <div class="mut small">C2 ……… C6</div><div class="res ok">🏆 ${T("singPass")}</div></div>`;
    await runSteps([{ say: TUT.rangeText(r, prev, S.lang) }, { say: T("rangeHear") }, { seq: [{ hz: r.lo, dur: 1.2 }, { hz: r.hi, dur: 1.2 }], label: r.loName + " – " + r.hiName }], sid);
    if (alive(sid)) { bubble("🏆 " + r.loName + " – " + r.hiName, "🧑‍🏫"); FLOW.phase = ""; }
    return true;
  }
  /* ---------- ladder: after a passed test the pattern moves half a step (within your range) ---------- */
  function ladderUp(L) {
    const l = L.src; if (!S.ladder) S.ladder = {};
    const r = S.ladder[l.id] || 0, nr = r + l.dir, top = Math.max.apply(null, l.base) + nr, bot = Math.min.apply(null, l.base) + nr;
    const hiLim = S.range && S.range.hi ? Math.floor(semisOf(S.range.hi)) : 14, loLim = S.range && S.range.lo ? Math.ceil(semisOf(S.range.lo)) : -7;
    if ((l.dir > 0 && top > hiLim + 1) || (l.dir < 0 && bot < loLim - 1)) { toast(T("ladderTop")); return; }
    S.ladder[l.id] = nr; save(); toast(T("ladderNext") + " (" + (nr > 0 ? "+" : "") + nr + ")");
  }
  function metricRow(l, v) { return `<div class="mrow"><span>${esc(l)}</span><b>${esc(String(v))}</b></div>`; }

  function drawIntonation(cv, track) {
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const pts = track.filter((p) => p.hz > 0);
    if (pts.length < 2) { ctx.fillStyle = cssVar("--mut"); ctx.fillText("—", W / 2, H / 2); return; }
    const hz = pts.map((p) => p.hz), lo = Math.min.apply(null, hz) * 0.95, hi = Math.max.apply(null, hz) * 1.05;
    const t0 = track[0].t, t1 = track[track.length - 1].t || 1;
    const x = (t) => (t - t0) / (t1 - t0) * (W - 8) + 4;
    const y = (f) => H - 8 - (f - lo) / (hi - lo + 1e-6) * (H - 16);
    ctx.strokeStyle = cssVar("--acc"); ctx.lineWidth = 2.5; ctx.beginPath();
    let started = false;
    track.forEach((p) => { if (p.hz > 0) { const X = x(p.t), Y = y(p.hz); if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y); } else started = false; });
    ctx.stroke();
  }

  async function saveRecording(clip, m, label) {
    const blob = encodeWav(clip.samples, clip.sampleRate);
    const rec = { id: Date.now(), date: today(), label, m, blob };
    try { await DB.put(rec); RECS.push(rec); } catch (e) { toast("Storage error"); }
  }

  /* ---------- breathing ---------- */
  function breatheRun(sec, sid) {
    const circle = $("bcircle"), txt = $("btext"); if (!circle) return;
    let t = 0; const phases = [["in", 4, T("bIn")], ["hold", 2, T("bHold")], ["out", 6, T("bOut")]];
    clearInterval(UI.bt);
    const tick = () => {
      if (sid != null && !alive(sid)) { clearInterval(UI.bt); return; }
      if (FLOW.paused) return;
      let acc = 0, cur = null, into = 0;
      const cyc = t % 12;
      for (const p of phases) { if (cyc < acc + p[1]) { cur = p; into = cyc - acc; break; } acc += p[1]; }
      if (cur) { circle.textContent = cur[1] - into; circle.className = "bcircle " + cur[0]; if (txt) txt.textContent = cur[2];
        if (into === 0) { bubble(cur[2], "🫁"); TUT.say(cur[2]); } }   // tutor calls each phase aloud
      t++;
      if (t > sec) { clearInterval(UI.bt); circle.textContent = "✓"; circle.className = "bcircle"; if (txt) txt.textContent = T("done"); bubble(T("breathDone"), "🧑‍🏫"); addXP(10); if (sid != null) runSteps([{ say: T("breathDone") }], sid).then((ok) => { if (ok) classAfter(sid); }); else TUT.say(T("breathDone")); }
    };
    tick(); UI.bt = setInterval(tick, 1000);
  }

  /* ---------- Ask search ---------- */
  function searchAsk(q) {
    q = (q || "").toLowerCase(); if (!q.trim()) return [];
    const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 1);
    return C.ASK.map((r) => {
      const hay = (LC(r.q) + " " + r.tags + " " + LC(r.a)).toLowerCase();
      let score = 0; words.forEach((w) => { if (hay.includes(w)) score += 2; (r.tags.split(" ")).forEach((tag) => { if (tag && (tag.includes(w) || w.includes(tag))) score += 1; }); });
      return { r, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map((x) => x.r);
  }

  /* ---------- games (robust: UI.game drives SCR.gameview) ---------- */
  SCR.gameview = () => {
    const g = UI.game; if (!g) { UI.scr = "games"; return SCR.games(); }
    if (g.kind === "vg") return vgView(g);
    if (g.kind === "pitch") {
      const tn = window.VG_GAMES && VG_GAMES.noteOf(g.target);
      return topbar(T("gamePitch"), true) + `<div class="card center"><div class="mut">${T("sayTarget")}</div><div class="big" id="gtarget">${tn ? tn.name + " · " : ""}${Math.round(g.target)} Hz</div>
        <canvas id="gcanvas" width="300" height="130" class="intona"></canvas>
        <div class="big" id="gscore">★ ${g.score}</div><div class="mut" id="gmsg"></div>
        <button class="pri full" id="gbtn" onclick="VG.gameMic()">🎤 ${g.on ? T("stopRec") : T("gameStart")}</button>
        <button class="full" onclick="VG.gameExit()">← ${T("games")}</button></div>`;
    }
    const cur = g.list[g.i];
    return topbar(T("gameTT"), true) + `<div class="card center"><div class="mut">${g.i + 1}/${g.list.length}</div><div class="rtext" style="font-size:1.4rem">${esc(cur)}</div>
      <div class="recwrap"><button class="recbig" id="recbtn" onclick="VG.ttRec()">🎤</button><div class="reclabel" id="ttmsg">${T("tapRecord")}</div></div>
      <div class="big" id="gscore">★ ${g.score}</div>
      <button class="full" onclick="VG.gameExit()">← ${T("games")}</button></div>`;
  };
  function startPitchGame() {
    UI.game = { kind: "pitch", score: 0, target: 0, held: 0, round: 0, on: false };
    nextPitchTarget(true);
    UI.stack.push({ scr: "games", a: null }); UI.scr = "gameview"; render();
  }
  const PG_SEMIS = [0, 4, 7, 2, 5, 9, 12, 7];
  function nextPitchTarget(silent, gg) { const g = gg || UI.game; if (!g) return; g.target = saHz() * Math.pow(2, PG_SEMIS[g.round % PG_SEMIS.length] / 12); g.held = 0;
    if (!silent) { const el = $("gtarget"), tn = window.VG_GAMES && VG_GAMES.noteOf(g.target); if (el) el.textContent = (tn ? tn.name + " · " : "") + Math.round(g.target) + " Hz"; } }
  // call-and-response: tutor plays the note -> beep -> you sing it -> tutor says result -> next note
  async function pitchGameMic() {
    const g = UI.game; if (!g) return;
    const btn = () => $("gbtn"), msgEl = () => $("gmsg");
    if (g.on) { g.on = false; stopSpeak(); stopMic(); if (btn()) btn().textContent = "🎤 " + T("gameStart"); return; }
    stopSpeak(); const sid = FLOW.sid; g.on = true; if (btn()) btn().textContent = "⏹ " + T("stopRec");
    while (alive(sid) && UI.game === g && g.on) {
      while (FLOW.paused && alive(sid)) await sleep(150);
      const tn = window.VG_GAMES && VG_GAMES.noteOf(g.target);
      if (msgEl()) msgEl().textContent = "🎵 " + T("listenNote");
      await TUT.say(T("listenNote")); if (!alive(sid)) break;
      await TUT.playSeq([{ hz: g.target, dur: 1.8 }]); if (!alive(sid)) break;
      await TUT.beep(); if (!alive(sid)) break;
      if (msgEl()) msgEl().textContent = "🎤 " + T("yourTurnSing");
      g.hit = false; g.held = 0;
      const ok = await startMic((live) => {
        const cv = $("gcanvas"); if (cv) drawPitchGame(cv, g.target, live.hz);
        const msg = msgEl(); if (g.hit) return;
        const c = live.hz > 0 ? TUT.foldCents(TUT.cents(live.hz, g.target)).c : null;
        if (c != null && Math.abs(c) < 40) { g.held++; if (msg) msg.textContent = "✅ " + T("hold") + " " + Math.min(100, Math.round(g.held / 22 * 100)) + "%"; if (g.held > 22) g.hit = true; }
        else if (c != null) { g.held = Math.max(0, g.held - 1); if (msg) msg.textContent = c > 0 ? "↓ " + T("tooHigh") : "↑ " + T("tooLow"); }
      });
      if (!ok) break;
      const t0 = performance.now();
      while (alive(sid) && !g.hit && performance.now() - t0 < 12000) await sleep(100);
      stopMic(); if (!alive(sid)) break;
      if (g.hit) { g.score++; const sc = $("gscore"); if (sc) sc.textContent = "★ " + g.score; addXP(3); if (msgEl()) msgEl().textContent = "🏆 " + T("greatHold"); await TUT.say(T("greatHold")); if (!alive(sid) || UI.game !== g) break; g.round++; nextPitchTarget(false, g); }
      else { if (msgEl()) msgEl().textContent = "💪 " + T("pitchMiss"); await TUT.say(T("pitchMiss")); }
    }
    if (UI.game === g) { g.on = false; if (btn()) btn().textContent = "🎤 " + T("gameStart"); }
  }
  function drawPitchGame(cv, target, hz) {
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
    const lo = saHz() * 0.75, hi = saHz() * 2.3; const y = (f) => H - (f - lo) / (hi - lo) * H;
    ctx.strokeStyle = cssVar("--ok"); ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(0, y(target)); ctx.lineTo(W, y(target)); ctx.stroke(); ctx.setLineDash([]);
    if (hz > 0) { const near = Math.abs(TUT.foldCents(TUT.cents(hz, target)).c) < 40; ctx.fillStyle = near ? cssVar("--ok") : cssVar("--acc"); ctx.beginPath(); ctx.arc(W / 2, Math.max(12, Math.min(H - 12, y(hz))), 12, 0, 7); ctx.fill(); }
  }
  function startTTGame() {
    const tts = ["She sells sea shells", "Red lorry yellow lorry", "Kachcha papad pakka papad", "Peter Piper picked peppers", "Pake ped par paka papita"];
    UI.game = { kind: "tt", i: 0, score: 0, list: tts };
    UI.stack.push({ scr: "games", a: null }); UI.scr = "gameview"; render();
  }
  async function ttRecFn() {
    const g = UI.game; if (!g) return;
    if (MIC.on) {
      const got = MIC.gotAudio; const clip = stopMic();
      const btn = $("recbtn"), msg = $("ttmsg"); if (btn) btn.classList.remove("rec");
      if (!clip || !got) { if (msg) msg.textContent = T("noAudio"); return; }
      const m = AUD.analyzeClip(clip.samples, clip.sampleRate);
      const ok = m.spokenSec > 0.8 && m.speakingRatio > 0.4;
      if (ok) { g.score++; if (msg) msg.textContent = "✅ " + T("greatHold"); TUT.say(T("greatHold")); } else { if (msg) msg.textContent = "💪 " + T("retry"); TUT.say(T("ttMiss")); }
      addXP(5); g.i++;
      if (g.i >= g.list.length) { setTimeout(() => { const sc = g.score; UI.game = null; ask(T("score") + ": ★" + sc, "OK", () => VG.go("games")); }, 700); }
      else setTimeout(() => render(), 900);
      return;
    }
    // tutor says the twister first, then beep, then you
    stopSpeak(); const sid = FLOW.sid; const m0 = $("ttmsg");
    if (m0) m0.textContent = "🗣️ " + T("listenFirst");
    await TUT.say(T("listenFirst")); if (!alive(sid)) return;
    await TUT.say(g.list[g.i], { rate: 0.85 }); if (!alive(sid)) return;
    await TUT.beep(); if (!alive(sid)) return;
    const ok = await startMic(null); if (!ok) return;
    const b = $("recbtn"); if (b) b.classList.add("rec"); const msg = $("ttmsg"); if (msg) msg.textContent = T("recording");
  }

  /* ---------- voice games: 35 games x 10 levels, coins, stars, shop ---------- */
  const GP = (id) => { if (!S.gp) S.gp = {}; return S.gp[id] || (S.gp[id] = { open: 1, stars: {} }); };
  const gStars = (id) => Object.values(GP(id).stars).reduce((a, b) => a + b, 0);
  const gDone = (id) => Object.keys(GP(id).stars).filter((k) => GP(id).stars[k] > 0).length;
  const coinsHtml = () => `<span class="chip coin">🪙 ${S.coins || 0}</span>`;
  /* the player's own comfortable pitch range -> 0..1 control (semitones vs Sa) */
  function ctrlRange() {
    let lo = -4, hi = 9;
    if (S.range && S.range.lo && S.range.hi) { const a = Math.ceil(semisOf(S.range.lo)) + 1, b = Math.floor(semisOf(S.range.hi)) - 2; if (b - a >= 8) { lo = a; hi = b; } }
    return { lo, hi, hzLo: TUT.semiHz(saHz(), lo + 1), hzHi: TUT.semiHz(saHz(), hi - 1) };
  }
  function gameHowSteps(def) { const r = ctrlRange(); return VG_GAMES.howTo(def, S.lang, r.hzLo, r.hzHi, saHz()); }
  SCR.games = () => {
    const VGG = window.VG_GAMES, tot = VGG.list.length;
    const card = (g) => { const d = gDone(g.id), st = gStars(g.id);
      return `<button class="gcard" onclick="VG.openVG('${g.id}')"><span class="gic">${g.icon}</span><b>${esc(LC(g.name))}</b><small>${d}/10 · ★${st}</small><i style="width:${d * 10}%"></i></button>`; };
    return topbar(T("games"), true) +
      `<div class="row" style="align-items:center;margin-bottom:6px"><span style="flex:1" class="mut small">${tot} ${T("voiceGames")}</span>${coinsHtml()}<button style="flex:none" onclick="VG.go('shop')">🛍️ ${T("shopT")}</button></div>` +
      VGG.CATS.map((c) => `<h3 class="sech">${c.ic} ${esc(LC(c.name))}</h3><div class="ggrid">${VGG.list.filter((g) => c.mechs.includes(g.mech)).map(card).join("")}</div>`).join("") +
      `<h3 class="sech">🎯 ${T("practiceGames")}</h3>
       <button class="card lvl" onclick="VG.gamePitch()"><span class="ic">🎯</span><span class="b"><b>${T("gamePitch")}</b><div class="mut small">${T("gamePitchD")}</div></span></button>
       <button class="card lvl" onclick="VG.gameTT()"><span class="ic">⚡</span><span class="b"><b>${T("gameTT")}</b><div class="mut small">${T("gameTTD")}</div></span></button>`;
  };
  SCR.glevels = () => {
    const def = VG_GAMES.byId(UI.a && UI.a.id); if (!def) return SCR.games();
    const gp = GP(def.id);
    let lv = ""; for (let L = 1; L <= 10; L++) { const open = L <= gp.open, st = gp.stars[L] || 0;
      lv += `<button class="lvbtn ${open ? "" : "lock"} ${st ? "done" : ""}" onclick="${open ? `VG.playLevel('${def.id}',${L})` : `VG.toast('${T("lvLocked")}')`}"><b>${open ? L : "🔒"}</b><small>${st ? "★".repeat(st) + "☆".repeat(3 - st) : open ? "☆☆☆" : ""}</small></button>`; }
    return topbar(LC(def.name), true) +
      `<div class="card center"><div style="font-size:3.2rem">${def.icon}</div><h2 style="margin:4px 0">${esc(LC(def.name))}</h2><p class="mut">${esc(LC(def.story))}</p>
        <div class="row"><button onclick="VG.gameHow('${def.id}')">🔊 ${T("howToPlay")}</button>${coinsHtml()}</div></div>` + tutorBoxHtml() +
      `<div class="lvgrid">${lv}</div><button class="pri full big" onclick="VG.playLevel('${def.id}',${Math.min(10, gp.open)})">▶ ${T("level")} ${Math.min(10, gp.open)}</button>`;
  };
  SCR.shop = () => topbar(T("shopT"), true) + `<div class="row" style="align-items:center"><p class="mut" style="flex:1">${T("shopD")}</p>${coinsHtml()}</div><div class="ggrid">` +
    VG_GAMES.SHOP.map((it) => { const own = (S.owned || ["bird"]).includes(it.id), sel = (S.char || "🐦") === it.e;
      return `<button class="gcard ${sel ? "sel" : ""}" onclick="VG.shopTap('${it.id}')"><span class="gic">${it.e}</span><b>${sel ? "✓ " + T("selected") : own ? T("use") : "🪙 " + it.price}</b></button>`; }).join("") + `</div>`;
  function vgView(g) {
    const def = VG_GAMES.byId(g.id); if (!def) { UI.game = null; return SCR.games(); }
    const P = VG_GAMES.M[def.mech].params(g.L, def.v);
    if (g.stage === "intro") return topbar(LC(def.name) + " · " + T("level") + " " + g.L, true) +
      `<div class="card center"><div style="font-size:3rem">${def.icon}</div><h2 style="margin:4px 0">${T("level")} ${g.L}</h2><p><b>🎯 ${T("goalT")}: ${P.goal} ${esc(goalUnit(def))}</b></p><p class="mut small">❤️❤️❤️ · ${T("lvHint")}</p></div>` +
      tutorBoxHtml() + `<button class="pri full big" onclick="VG.vgBegin()">▶ ${T("gameStart")}</button><div class="row"><button onclick="VG.gameHow('${def.id}')">🔊 ${T("howToPlay")}</button><button onclick="VG.gameExit()">← ${T("levelsT")}</button></div>`;
    if (g.stage === "over") {
      const won = g.won, st = g.stars || 0;
      return topbar(LC(def.name) + " · " + T("level") + " " + g.L, true) +
        `<div class="card center"><div style="font-size:3rem">${won ? "🏆" : "💪"}</div><h2>${won ? T("lvWin") : T("lvLose")}</h2>
          ${won ? `<div class="bigstars">${"★".repeat(st)}${"☆".repeat(3 - st)}</div><div class="big">+${g.coins} 🪙</div>` : `<p>${esc(VG_GAMES.tip(def, S.lang))}</p>`}
          <div class="mut">${T("score")}: ${g.score}/${P.goal} · 🪙 ${S.coins || 0}</div></div>` + tutorBoxHtml() +
        (won ? (g.L < 10 ? `<button class="pri full big" onclick="VG.playLevel('${def.id}',${g.L + 1})">▶ ${T("level")} ${g.L + 1}</button>` : `<div class="res ok">🎉 ${T("allLevels")}</div>`) +
               `<div class="row"><button onclick="VG.vgRetry()">↺ ${T("playAgain")}</button><button onclick="VG.gameExit()">☰ ${T("levelsT")}</button></div>`
             : `<button class="pri full big" onclick="VG.vgRetry()">↺ ${T("playAgain")}</button><div class="row">${g.canSecond ? `<button onclick="VG.vgSecond()">❤️ ${T("secondChance")} (20🪙)</button>` : ""}<button onclick="VG.gameExit()">☰ ${T("levelsT")}</button></div>`);
    }
    return `<div class="top"><button class="ib" onclick="VG.gameExit()" aria-label="exit">✕</button><b>${esc(LC(def.name))} · ${g.L}</b><button class="ib" id="vgpause" onclick="VG.vgPause()" aria-label="pause">⏸</button></div>
      <div class="vgwrap"><canvas id="vgcanvas" width="320" height="430" class="vgcanvas"></canvas></div>` + meterHtml();
  }
  const goalUnit = (def) => ({ fly: T("guPass"), lanes: T("guPass"), runner: T("guJump"), catcher: def.v === "dodge" ? T("guDodge") : T("guCatch"), fill: T("guFill"), steady: T("guSec"), climber: T("guMeter"),
    bullseye: T("guNote"), trace: T("guSec"), react: T("guReact"), simon: T("guTune"), rhythm: T("guBeat"), shooter: T("guHit") })[def.mech] || "";
  /* main loop: countdown (measures room noise) -> play -> win/lose */
  async function vgStartLoop(resume) {
    const g = UI.game; if (!g || g.stage !== "play") return;
    const def = VG_GAMES.byId(g.id), cv = $("vgcanvas"); if (!def || !cv) return;
    const ctx = cv.getContext("2d"), R = ctrlRange();
    let G = resume && UI.vgG ? UI.vgG : VG_GAMES.newGame(def, g.L, { W: cv.width, H: cv.height, char: S.char || "🐦", lab: VG_GAMES.LABELS[S.lang === "english" ? "english" : "hinglish"] });
    UI.vgG = G; G.paused = false; if (resume) schedClicks(G);
    // only one game loop may run (a double tap on Start used to start two)
    if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } const loopId = (UI.vgLoopId = (UI.vgLoopId || 0) + 1);
    const st = { count: resume ? 0 : 3, noise: [], vThr: UI.vThr || 0.015, prevV: false, quiet: 1, muteUntil: 0, rmsLive: 0, hzLive: -1 };
    const ok = await startMic((live) => { st.rmsLive = live.rms; st.hzLive = live.hz; UI.vgLive = live; meterUpdate(live); });
    if (!ok) { VG.gameExit(); return; }
    let last = performance.now(), cd = st.count;
    const playTones = (notes) => { const seq = notes.map((n) => ({ hz: TUT.semiHz(saHz(), n), dur: notes.length > 1 ? 0.65 : 1.1, gap: 0.12 })); const dur = seq.reduce((a, s) => a + s.dur + s.gap, 0);
      st.muteUntil = performance.now() + dur * 1000 + 400; TUT.playSeq(seq); };
    const loop = (now) => {
      if (!UI.game || UI.game !== g || g.stage !== "play" || loopId !== UI.vgLoopId) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (G.paused) { VG_GAMES.M[def.mech].draw(G, ctx, {}); ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, G.W, G.H); ctx.font = "bold 30px sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText("⏸ " + T("paused"), G.W / 2, G.H / 2); UI.vgRaf = requestAnimationFrame(loop); return; }
      if (cd > 0) { // countdown: also measures the room's noise so noise doesn't play the game
        st.noise.push(st.rmsLive); cd -= dt;
        VG_GAMES.M[def.mech].draw(G, ctx, {}); ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, 0, G.W, G.H);
        ctx.font = "bold 72px sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(Math.ceil(cd)), G.W / 2, G.H / 2);
        ctx.font = "14px sans-serif"; ctx.fillText(T("quietCount"), G.W / 2, G.H / 2 + 60);
        if (cd <= 0) { const n = TUT.median(st.noise.length ? st.noise : [0.005]); st.vThr = UI.vThr = Math.max(0.014, n * 2.8); G.started = true; schedClicks(G); }
        UI.vgRaf = requestAnimationFrame(loop); return;
      }
      if (G.wantTone) { const w = G.wantTone; G.wantTone = null; playTones(w); }
      const muted = performance.now() < st.muteUntil, rms = st.rmsLive, hz = st.hzLive;
      const voice = !muted && rms > st.vThr, semis = voice && hz > 0 ? semisOf(hz) : null;
      const pn = semis == null ? null : Math.max(0, Math.min(1, (semis - R.lo) / (R.hi - R.lo)));
      const onset = voice && !st.prevV && st.quiet > 0.12;
      st.quiet = voice ? 0 : st.quiet + dt; st.prevV = voice;
      const inp = { pn, semis, voice, onset, loud: rms > st.vThr * 3, lev: voice ? Math.max(0, Math.min(1, (rms - st.vThr) / 0.11)) : 0 };
      if (muted && G.tt != null) G.tt = 0; // note games: the clock starts after the tutor's note
      VG_GAMES.step(def, G, inp, dt);
      VG_GAMES.M[def.mech].draw(G, ctx, {}); vgHud(G, ctx);
      if (G.over) { vgEnd(def, G); return; }
      UI.vgRaf = requestAnimationFrame(loop);
    };
    UI.vgRaf = requestAnimationFrame(loop);
  }
  function schedClicks(G) { if (!G.sched || !window.VG_MUSIC) return; const ac = TUT.ac(); if (!ac) return; G.sched.forEach((c) => { if (c.t > G.t + 0.02) VG_MUSIC.click(ac.currentTime + 0.05 + (c.t - G.t), c.accent); }); }
  function vgHud(G, ctx) {
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, G.W, 14); ctx.fillStyle = "#4ade80"; ctx.fillRect(0, 0, G.W * Math.min(1, G.score / G.goal), 14);
    ctx.font = "bold 11px sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(G.score + " / " + G.goal, 6, 7);
    ctx.textAlign = "right"; ctx.fillText("❤️".repeat(Math.max(0, G.lives)) + "🤍".repeat(Math.max(0, 3 - G.lives)), G.W - 4, 7);
  }
  function vgEnd(def, G) {
    if (UI.vgRaf) cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; stopMic(); if (window.VG_MUSIC) VG_MUSIC.stopTaal();
    const g = UI.game; if (!g) return;
    const gp = GP(def.id), st = VG_GAMES.stars(G); g.won = G.won; g.score = G.score; g.stars = st; g.coins = 0;
    if (G.won) { const prev = gp.stars[g.L] || 0; g.coins = VG_GAMES.coinsFor(g.L, st) - (prev ? VG_GAMES.coinsFor(g.L, prev) : 0); if (g.coins < 0) g.coins = 0;
      if (prev) g.coins = Math.max(g.coins, 2); // replaying still earns a little
      S.coins = (S.coins || 0) + g.coins; gp.stars[g.L] = Math.max(prev, st); gp.open = Math.max(gp.open, Math.min(10, g.L + 1)); addXP(3 + g.L); }
    g.canSecond = !G.won && !g.usedSecond && (S.coins || 0) >= 20 && G.score > 0;
    save(); g.stage = "over"; render();
    const sid = FLOW.sid;
    runSteps([{ say: G.won ? T("lvWinSay").replace("{c}", g.coins).replace("{s}", st) : T("lvLoseSay") + " " + VG_GAMES.tip(def, S.lang) }], sid);
  }

  /* ---------- file save / print ---------- */
  function saveFile(name, data, mime) {
    if (window.AndroidApp && AndroidApp.saveFile) { try { AndroidApp.saveFile(name, data, mime || "text/plain"); return; } catch (e) { } }
    try { const u = URL.createObjectURL(new Blob([data], { type: mime || "text/plain" })); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); } catch (e) { }
  }
  function reportPdf() {
    const done = levelsCleared();
    const rows = C.LEVELS.map((l) => `<tr><td>${l.n}. ${esc(LC(l.title))}</td><td>${passed(l.id) ? "✅ " + (S.prog[l.id].date || "") : "—"}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Voice Guru Progress</title>
      <style>body{font:14px/1.6 system-ui;max-width:700px;margin:0 auto;padding:20px;color:#000}h1{color:#5b4bdb}table{border-collapse:collapse;width:100%}td{border:1px solid #000;padding:6px}</style></head><body>
      <h1>🎙️ Voice Guru — Progress</h1><p>${esc(APP.dev)} · ${today()}</p>
      <p><b>Levels cleared:</b> ${done}/${C.LEVELS.length} &nbsp; <b>Streak:</b> ${S.streak.n || 0} &nbsp; <b>Best sustain:</b> ${S.best.sustainSec || 0}s &nbsp; <b>XP:</b> ${S.xp}</p>
      <table><tr><th>Level</th><th>Status</th></tr>${rows}</table>
      <p style="color:#666;margin-top:20px">Made with ${APP.name} · ${APP.dev}</p></body></html>`;
    if (window.AndroidApp && AndroidApp.printHtml) { try { AndroidApp.printHtml(html, "VoiceGuru-Progress"); return; } catch (e) { } }
    const f = document.createElement("iframe"); f.style.cssText = "position:fixed;width:0;height:0;border:0"; document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } setTimeout(() => f.remove(), 1500); }, 400);
  }

  /* expose for tests */
  window.VG_TEST = { get S() { return S; }, set S(v) { S = v; }, UI, FLOW, curLesson, planForEx, buildClass, applyVoice, analyzeAndShow, searchAsk, checkTarget, encodeWav, passed, levelsCleared, RECS: () => RECS, render, go };

  /* best offline phone voice: user's pick, else auto-best (Indian English first) */
  function applyVoice() {
    if (S.voiceName && !S.voiceAuto) { TUT.setVoice(S.voiceName); return true; }
    const b = TUT.bestVoice(S.lang); if (!b) return false;
    TUT.setVoice(b.name); if (S.voiceName !== b.name) { S.voiceName = b.name; S.voiceAuto = true; save(); }
    return true;
  }
  /* ---------- boot ---------- */
  async function boot() {
    applySet();
    if (!S.sing || typeof S.sing !== "object") S.sing = {};
    TUT.setRate(S.tutorRate || 0.95); TUT.setStyle(S.singStyle);
    setInterval(abarUpdate, 200);
    let vt = 0; const vi = setInterval(() => { if (applyVoice() || ++vt > 15) clearInterval(vi); }, 800);
    RECS = await DB.all();
    try { history.replaceState({}, ""); history.pushState({}, ""); } catch (e) { }
    window.addEventListener("popstate", () => { if (back() !== "exit") { try { history.pushState({}, ""); } catch (e) { } } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && UI.modal) back(); });
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
