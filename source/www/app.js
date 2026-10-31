/* Voice Guru - main app. Offline voice coach: levels -> exercises -> record & analyze. */
(function () {
  "use strict";
  const APP = { name: "Voice Guru", version: "1.4", dev: "Aakash Sharma", email: "cse211901204@gmail.com" };
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
    streak: { last: "", n: 0 }, prog: {}, best: {} });
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
  function go(scr, args) { if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopMic(); stopSpeak(); if (UI.scr !== scr || args !== undefined) UI.stack.push({ scr: UI.scr, a: UI.a }); UI.scr = scr; if (args !== undefined) UI.a = args; UI.modal = null; render(); }
  function back() { if (UI.modal) { UI.modal = null; UI.keep = 1; render(); return "ok"; } if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopMic(); stopSpeak();
    const p = UI.stack.pop(); if (!p) { if (UI.scr === "home") return "exit"; UI.scr = "home"; render(); return "ok"; } UI.scr = p.scr; UI.a = p.a; render(); return "ok"; }
  window.__androidBack = back;
  function goHome() { stopMic(); stopSpeak(); UI.stack = []; UI.scr = "home"; UI.modal = null; render(); }
  function ask(msg, okLabel, fn) { UI.cb = fn; UI.modal = { msg: msg, ok: okLabel }; UI.keep = 1; render(); }

  /* ---------- TTS reference ---------- */
  function speak(text) { stopSpeak();
    if (window.AndroidApp && AndroidApp.speak) { try { AndroidApp.speak(text); return true; } catch (e) { } }
    try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(text); u.rate = 0.9; u.lang = "en-US"; speechSynthesis.speak(u); return true; } } catch (e) { }
    return false; }
  function stopSpeak() { if (window.AndroidApp && AndroidApp.stopSpeak) { try { AndroidApp.stopSpeak(); } catch (e) { } } try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { } }

  /* ---------- microphone capture ---------- */
  const MIC = { ctx: null, stream: null, src: null, proc: null, analyser: null, chunks: [], rate: 16000, on: false, raf: 0, onLive: null };
  async function startMic(onLive) {
    if (MIC.on) return true;
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
      // permission may have just been granted — one retry after a short wait
      try { await new Promise((r) => setTimeout(r, 500)); stream = await tryGet(); }
      catch (e2) { toast(T("micDenied") + " (" + nm + ")"); return false; }
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
    const buf = new Float32Array(MIC.analyser.fftSize);
    (MIC.analyser.getFloatTimeDomainData || MIC.analyser.getFloatFrequencyData).call(MIC.analyser, buf);
    const r = AUD.rms(buf);
    const p = AUD.detectPitch(buf, MIC.rate, { rmsGate: 0.01 });
    if (MIC.onLive) MIC.onLive({ rms: r, hz: p.hz });
    MIC.raf = requestAnimationFrame(liveLoop);
  }
  function stopMic() {
    if (MIC.raf) cancelAnimationFrame(MIC.raf); MIC.raf = 0;
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
      <div class="recwrap"><button class="recbig" onclick="VG.go('record')">🎤</button><div class="reclabel">${T("quickRec")}</div></div>
      <div class="grid g3">
        ${tile("levels", "📚", T("levels"))}
        ${tile("games", "🎮", T("games"))}
        ${tile("scenarios", "💬", T("scenarios"))}
        ${tile("ask", "🤔", T("ask"))}
        ${tile("tutor", "🧑‍🏫", T("tutor"))}
        ${tile("diet", "🥤", T("diet"))}
      </div>`;
  };

  SCR.more = () => {
    const tile = (scr, ic, label) => `<button class="tile" onclick="VG.go('${scr}')"><span class="ic">${ic}</span>${label}</button>`;
    return topbar(T("navMore"), true) + `<div class="grid g2">
      ${tile("scenarios", "💬", T("scenarios"))}
      ${tile("games", "🎮", T("games"))}
      ${tile("ask", "🤔", T("ask"))}
      ${tile("tutor", "🧑‍🏫", T("tutor"))}
      ${tile("diet", "🥤", T("diet"))}
      ${tile("backup", "💾", T("backup"))}
      ${tile("settings", "⚙️", T("settings"))}
      ${tile("about", "ℹ️", T("about"))}
      ${tile("help", "❓", T("help"))}
    </div>`;
  };

  SCR.levels = () => topbar(T("levels"), true) + C.LEVELS.map((lv, i) => {
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

  // exercise runner
  SCR.ex = () => {
    const lv = C.LEVELS[UI.a.i], ex = lv.ex[UI.a.j];
    const st = UI.exState || {};
    let body = `<div class="card"><b>${esc(LC(ex.title))}</b><p>${esc(LC(ex.say))}</p>${ex.tip ? `<p class="mut small">💡 ${T("tip")}: ${esc(LC(ex.tip))}</p>` : ""}</div>`;
    if (ex.sketch) body += SKETCH(ex.sketch);
    if (ex.read) body += `<div class="card read"><div class="mut small">${T("readThis")}</div><div class="rtext">${esc(ex.read)}</div>${ex.type === "shadow" ? `<button class="full" onclick="VG.speakRef()">🔊 ${T("listen")}</button>` : ""}</div>`;
    if (ex.type === "breathing") {
      body += `<div class="breathe" id="breathe"><div class="bcircle" id="bcircle">—</div><div class="mut" id="btext"></div></div>
        <button class="pri full" onclick="VG.breatheStart(${ex.seconds})">▶ ${T("startEx")}</button>`;
    } else {
      body += meterHtml() +
        `<div class="recwrap"><button class="recbig" id="recbtn" onclick="VG.toggleRec()">🎤</button><div class="reclabel" id="reclabel">${T("tapRecord")}</div></div>
        <p class="mut small center">${T("micHint")}</p>
        <div id="result"></div>`;
    }
    return topbar(LC(ex.title), true) + body;
  };

  SCR.record = () => {
    const custom = UI.customText || "";
    return topbar(T("record"), true) +
      `<div class="card"><b>${T("customText")}</b><textarea class="inp" id="ctext" rows="4" placeholder="${esc(T("customPh"))}" oninput="VG.setCustom(this.value)">${esc(custom)}</textarea></div>
      ${custom ? `<div class="card read"><div class="rtext">${esc(custom)}</div></div>` : ""}
      ${meterHtml()}
      <div class="recwrap"><button class="recbig" id="recbtn" onclick="VG.toggleRec(true)">🎤</button><div class="reclabel" id="reclabel">${T("tapRecord")}</div></div>
      <p class="mut small center">${T("micHint")}</p><div id="result"></div>`;
  };

  SCR.scenarios = () => topbar(T("scenarios"), true) + C.SCENARIOS.map((s, i) =>
    `<button class="card lvl" onclick="VG.openScenario(${i})"><span class="ic">💬</span><span class="b"><b>${esc(LC(s.title))}</b><div class="mut small">${esc(LC(s.say))}</div></span></button>`).join("");

  SCR.ask = () => {
    const a = UI.askState || { q: "", res: null };
    let res = "";
    if (a.res) res = a.res.length ? a.res.map((r, i) => `<div class="card${i === 0 ? " best" : ""}">${i === 0 ? `<div class="mut small">⭐</div>` : ""}<b>${esc(LC(r.q))}</b><p>${esc(LC(r.a))}</p></div>`).join("") : `<div class="card"><p>🤔 ${T("askNone")}</p></div>`;
    return topbar(T("ask"), true) + `<textarea class="inp" id="askq" rows="3" placeholder="${esc(T("askPh"))}">${esc(a.q)}</textarea>
      <button class="pri full" onclick="VG.askGo()">💬 ${T("askBtn")}</button><div id="askres">${res}</div>`;
  };

  SCR.tutor = () => topbar(T("tutor"), true) + `<p class="mut">${T("tutorT")}</p>` +
    C.TUTOR.map((t) => `<div class="card"><h3 style="margin-top:0">${esc(LC(t.title))}</h3><p>${esc(LC(t.body))}</p>${t.sketch ? SKETCH(t.sketch) : ""}</div>`).join("");

  SCR.diet = () => topbar(T("diet"), true) + `<p class="mut">${T("dietT")}</p>` +
    `<div class="card"><b style="color:var(--ok)">✅ ${T("good")}</b>${C.DIET.filter((d) => d.good).map((d) => `<div class="drow"><b>${esc(LC(d.food))}</b><span class="mut small">${esc(LC(d.note))}</span></div>`).join("")}</div>
     <div class="card"><b style="color:var(--bad)">⚠️ ${T("avoid")}</b>${C.DIET.filter((d) => !d.good).map((d) => `<div class="drow"><b>${esc(LC(d.food))}</b><span class="mut small">${esc(LC(d.note))}</span></div>`).join("")}</div>`;

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
      <h3>🎤 ${T("savedRecs")}</h3>${recRows || `<p class="mut">${T("noRecs")}</p>`}`;
  };

  const ctrlLabel = (c) => ({ pitch: T("ctrlPitch"), volume: T("ctrlVolume"), lane: T("ctrlLane") }[c] || "");
  SCR.games = () => {
    const vg = (window.VG_GAMES ? VG_GAMES.list : []).map((g) => {
      const best = S.best["g_" + g.id] || 0;
      return `<button class="card lvl" onclick="VG.openVG('${g.id}')"><span class="ic">${g.icon}</span><span class="b"><b>${esc(LC(g.name))}</b>${best ? `<span class="chip">★ ${best}</span>` : ""}<div class="mut small">${esc(ctrlLabel(g.control))}</div></span></button>`;
    }).join("");
    return topbar(T("games"), true) +
      `<h3 style="margin-top:4px">${T("voiceGames")}</h3>${vg}
       <h3>🎯 ${T("practiceGames")}</h3>
       <button class="card lvl" onclick="VG.gamePitch()"><span class="ic">🎯</span><span class="b"><b>${T("gamePitch")}</b><div class="mut small">${T("gamePitchD")}</div></span></button>
       <button class="card lvl" onclick="VG.gameTT()"><span class="ic">⚡</span><span class="b"><b>${T("gameTT")}</b><div class="mut small">${T("gameTTD")}</div></span></button>`;
  };

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
       <div class="card"><b>🔊 ${T("voiceRef")}</b>${seg("tts", [[true, "On"], [false, "Off"]])}</div>
       <button class="full" onclick="VG.go('about')">ℹ️ ${T("about")}</button>`;
  };

  SCR.about = () => topbar(T("about"), true) +
    `<div class="card center"><div style="font-size:3rem">🎙️</div><h2>${APP.name}</h2><p class="mut">Version ${APP.version} · Offline</p><p>${T("aboutText")}</p></div>
     <div class="card"><b>👨‍💻 ${T("madeBy")}</b><p style="font-size:1.15rem"><b>${APP.dev}</b></p></div>
     <div class="card"><b>✉️ ${T("contact")}</b><p><a href="mailto:${APP.email}?subject=Voice%20Guru">${APP.email}</a></p></div>
     <p class="mut small">${T("pgNote")}</p>`;

  SCR.help = () => topbar(T("help"), true) + `<div class="card"><ol>
    <li>${T("record")}: 🎤 dabao, padho/bolo, phir dubara dabao — analysis dikhega.</li>
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
    const map = { home: "home", levels: "levels", level: "levels", ex: "levels", record: "record", progress: "progress" };
    const cur = map[UI.scr] || (["more", "scenarios", "games", "ask", "tutor", "diet", "backup", "settings", "about", "help"].includes(UI.scr) ? "more" : "");
    const item = (scr, ic, lab, cls) => `<button class="${cls || ""} ${cur === scr ? "on" : ""}" onclick="VG.nav('${scr}')"><span class="ic">${ic}</span>${lab}</button>`;
    return `<div class="bnav">${item("home", "🏠", T("navHome"))}${item("levels", "📚", T("navPractice"))}${item("record", "🎤", T("navRec"), "rec")}${item("progress", "📊", T("navProgress"))}${item("more", "☰", T("navMore"))}</div>`;
  }
  function render() {
    const app = $("app"); if (!app) return;
    const f = SCR[UI.scr] || SCR.home;
    app.innerHTML = f() + navHtml() + modalHtml();
    if (!UI.keep) window.scrollTo(0, 0); UI.keep = 0;
  }

  /* ---------- actions ---------- */
  const VG = {
    go, home: goHome, back, toast,
    nav(scr) { if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopMic(); stopSpeak(); UI.stack = scr === "home" ? [] : [{ scr: "home", a: null }]; UI.scr = scr; UI.a = null; UI.modal = null; render(); },
    closeModal() { UI.modal = null; UI.keep = 1; render(); },
    okModal() { const f = UI.cb; UI.cb = null; UI.modal = null; UI.keep = 1; if (f) f(); render(); },
    openLevel(i) { go("level", { i }); },
    openEx(i, j) { UI.exState = {}; go("ex", { i, j }); },
    openScenario(i) { const s = C.SCENARIOS[i]; UI.exState = {}; UI.a = { scenario: i }; go("ex", { scenario: i, i: -1, j: -1 }); scenarioAsEx(s); },
    setCustom(v) { UI.customText = v; },
    speakRef() { const ex = curEx(); if (ex && ex.read) { if (!S.tts) { toast("TTS off"); return; } speak(ex.read); } },
    setOpt(k, v) { S[k] = v; save(); applySet(); UI.keep = 1; render(); },

    breatheStart(sec) { breatheRun(sec); },

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

    async askGo() { const q = ($("askq") || {}).value || ""; UI.askState = { q, res: searchAsk(q) }; UI.keep = 1; render(); },
    gamePitch() { startPitchGame(); }, gameTT() { startTTGame(); },
    gameMic() { pitchGameMic(); }, ttRec() { ttRecFn(); },
    openVG(id) { UI.game = { kind: "vg", id, stage: "intro", score: 0 }; UI.stack.push({ scr: "games", a: null }); UI.scr = "gameview"; render(); },
    vgBegin() { if (!UI.game) return; UI.game.stage = "play"; render(); setTimeout(vgStartLoop, 40); },
    vgRetry() { if (!UI.game) return; UI.game.stage = "play"; render(); setTimeout(vgStartLoop, 40); },
    gameExit() { if (UI.vgRaf) { cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; } stopMic(); UI.game = null; UI.keep = 0; go("games"); },

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
    `<div class="card"><b>${esc(LC(ex.title))}</b><p>${esc(LC(ex.say))}</p></div>
     <div class="card read"><div class="mut small">${T("readThis")}</div><div class="rtext">${esc(ex.read)}</div><button class="full" onclick="VG.speakRef()">🔊 ${T("listen")}</button></div>
     ${meterHtml()}
     <div class="recwrap"><button class="recbig" id="recbtn" onclick="VG.toggleRec(true)">🎤</button><div class="reclabel" id="reclabel">${T("tapRecord")}</div></div><div id="result"></div>`; }
    return _ex(); };

  /* ---------- analyze + show ---------- */
  function analyzeAndShow(clip, isFree) {
    const m = AUD.analyzeClip(clip.samples, clip.sampleRate);
    UI.lastClip = { clip, m, label: curEx() ? LC(curEx().title) : "Free" };
    // update best
    if (m.sustainSec > (S.best.sustainSec || 0)) S.best.sustainSec = m.sustainSec;
    save();
    const el = $("result"); if (!el) return;
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
    if (ex && ex.test) {
      const r = checkTarget(m, ex.target);
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
    const pl = $("playlast"); if (pl) pl.onclick = () => { try { const u = URL.createObjectURL(encodeWav(clip.samples, clip.sampleRate)); const a = new Audio(u); a.play(); a.onended = () => URL.revokeObjectURL(u); } catch (e) { } };
    drawIntonation($("intonation"), m.track);
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
  function breatheRun(sec) {
    const circle = $("bcircle"), txt = $("btext"); if (!circle) return;
    let t = 0; const phases = [["in", 4, "Saans andar"], ["hold", 2, "Roko"], ["out", 6, "Dheere chhodo"]];
    clearInterval(UI.bt);
    UI.bt = setInterval(() => {
      let acc = 0, cur = null, into = 0;
      const cyc = t % 12;
      for (const p of phases) { if (cyc < acc + p[1]) { cur = p; into = cyc - acc; break; } acc += p[1]; }
      if (cur) { circle.textContent = cur[1] - into; circle.className = "bcircle " + cur[0]; if (txt) txt.textContent = cur[2]; }
      t++;
      if (t >= sec) { clearInterval(UI.bt); circle.textContent = "✓"; circle.className = "bcircle"; if (txt) txt.textContent = T("done"); addXP(10); }
    }, 1000);
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
  function nextPitchTarget(silent) { const g = UI.game; const notes = [140, 170, 200, 230, 180, 160]; g.target = notes[g.round % notes.length]; g.held = 0; if (!silent) { const el = $("gtarget"); if (el) el.textContent = Math.round(g.target) + " Hz"; } }
  async function pitchGameMic() {
    const g = UI.game; if (!g) return;
    if (MIC.on) { stopMic(); g.on = false; const b = $("gbtn"); if (b) b.textContent = "🎤 " + T("gameStart"); return; }
    const ok = await startMic((live) => {
      const cv = $("gcanvas"); if (cv) drawPitchGame(cv, g.target, live.hz);
      const msg = $("gmsg");
      if (live.hz > 0 && Math.abs(live.hz - g.target) < 12) { g.held++; if (msg) msg.textContent = "✅ " + T("greatHold") + " " + g.held; if (g.held > 22) { g.score++; const sc = $("gscore"); if (sc) sc.textContent = "★ " + g.score; if (msg) msg.textContent = T("greatHold"); g.round++; nextPitchTarget(); addXP(3); } }
      else if (live.hz > 0) { g.held = Math.max(0, g.held - 1); if (msg) msg.textContent = live.hz > g.target ? "↓ " + T("tooHigh") : "↑ " + T("tooLow"); }
      else { if (msg) msg.textContent = ""; }
    });
    if (!ok) return;
    g.on = true; const b = $("gbtn"); if (b) b.textContent = "⏹ " + T("stopRec");
  }
  function drawPitchGame(cv, target, hz) {
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
    const lo = 100, hi = 280; const y = (f) => H - (f - lo) / (hi - lo) * H;
    ctx.strokeStyle = cssVar("--ok"); ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(0, y(target)); ctx.lineTo(W, y(target)); ctx.stroke(); ctx.setLineDash([]);
    if (hz > 0) { const near = Math.abs(hz - target) < 12; ctx.fillStyle = near ? cssVar("--ok") : cssVar("--acc"); ctx.beginPath(); ctx.arc(W / 2, y(hz), 12, 0, 7); ctx.fill(); }
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
      if (ok) { g.score++; if (msg) msg.textContent = "✅ " + T("greatHold"); } else { if (msg) msg.textContent = "💪 " + T("retry"); }
      addXP(5); g.i++;
      if (g.i >= g.list.length) { setTimeout(() => { const sc = g.score; UI.game = null; ask(T("score") + ": ★" + sc, "OK", () => VG.go("games")); }, 700); }
      else setTimeout(() => render(), 900);
      return;
    }
    const ok = await startMic(null); if (!ok) return;
    const b = $("recbtn"); if (b) b.classList.add("rec"); const msg = $("ttmsg"); if (msg) msg.textContent = T("recording");
  }

  /* ---------- voice-controlled games engine ---------- */
  function vgView(g) {
    const def = window.VG_GAMES && VG_GAMES.byId(g.id); if (!def) { UI.game = null; return SCR.games(); }
    const best = S.best["g_" + g.id] || 0;
    if (g.stage === "intro") {
      return topbar(LC(def.name), true) +
        `<div class="card center"><div style="font-size:3rem">${def.icon}</div><h2 style="margin:4px 0">${esc(LC(def.name))}</h2>
          ${best ? `<span class="chip ok">${T("bestScore")}: ★ ${best}</span>` : ""}</div>
         <div class="card"><b>📋 ${T("howToPlay")}</b><p>${esc(LC(def.rules))}</p>
           <p class="mut small">🎮 ${T("control")}: ${esc(ctrlLabel(def.control))}</p>
           <p class="mut small">⚡ ${T("harderNote")}</p></div>
         <button class="pri full big" onclick="VG.vgBegin()">▶ ${T("gameStart")}</button>
         <button class="full" onclick="VG.gameExit()">← ${T("games")}</button>`;
    }
    if (g.stage === "over") {
      return topbar(LC(def.name), true) +
        `<div class="card center"><div style="font-size:3rem">🏁</div><h2>${T("gameOver")}</h2>
          <div class="big">★ ${g.score}</div><div class="mut">${T("bestScore")}: ★ ${Math.max(best, g.score)}</div>
          <div class="row" style="margin-top:12px"><button onclick="VG.gameExit()">← ${T("games")}</button><button class="pri" onclick="VG.vgRetry()">↺ ${T("playAgain")}</button></div></div>`;
    }
    // play
    return `<div class="top"><button class="ib" onclick="VG.gameExit()">✕</button><b>${esc(LC(def.name))}</b><span class="chip" id="vgscore">★ 0</span></div>
      <div class="vgwrap"><canvas id="vgcanvas" width="320" height="430" class="vgcanvas"></canvas></div>
      <div class="meters"><div class="meter"><div class="ml">${T("pitch")}</div><div class="bar"><i id="pbar" style="width:0%"></i></div><div class="mv" id="pval">—</div></div>
      <div class="meter"><div class="ml">${T("volume")}</div><div class="bar vol"><i id="vbar" style="width:0%"></i></div><div class="mv" id="vval">—</div></div></div>`;
  }
  async function vgStartLoop() {
    const g = UI.game; if (!g || g.stage !== "play") return;
    const def = VG_GAMES.byId(g.id); const cv = $("vgcanvas"); if (!def || !cv) return;
    const G = { W: cv.width, H: cv.height, score: 0, over: false }; def.init(G); UI.vgG = G;
    const col = { acc: cssVar("--acc"), pipe: cssVar("--acc2") || cssVar("--acc"), line: cssVar("--line"), ink: cssVar("--ink"), ok: cssVar("--ok"), bad: cssVar("--bad"), mut: cssVar("--mut"), warn: cssVar("--warn") };
    const ctx = cv.getContext("2d");
    UI.vgLive = { hz: -1, rms: 0 };
    const ok = await startMic((live) => { UI.vgLive = live;
      const pb = $("pbar"), pv = $("pval"), vb = $("vbar"), vv = $("vval");
      if (vb) vb.style.width = Math.min(100, live.rms * 400) + "%"; if (vv) vv.textContent = live.rms > 0.01 ? Math.round(live.rms * 400) + "%" : "—";
      if (pb) pb.style.width = live.hz > 0 ? Math.min(100, (live.hz - 70) / 330 * 100) + "%" : "0%"; if (pv) pv.textContent = live.hz > 0 ? Math.round(live.hz) + " Hz" : "—";
    });
    if (!ok) { VG.gameExit(); return; }
    let last = performance.now();
    const loop = (now) => {
      if (!UI.game || UI.game.stage !== "play") return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      def.update(G, UI.vgLive || { hz: -1, rms: 0 }, dt);
      def.draw(G, ctx, col);
      const sc = $("vgscore"); if (sc) sc.textContent = "★ " + G.score;
      if (G.over) { vgEnd(); return; }
      UI.vgRaf = requestAnimationFrame(loop);
    };
    UI.vgRaf = requestAnimationFrame(loop);
  }
  function vgEnd() {
    const g = UI.game, G = UI.vgG; if (UI.vgRaf) cancelAnimationFrame(UI.vgRaf); UI.vgRaf = 0; stopMic();
    if (g && G) { const key = "g_" + g.id; if (G.score > (S.best[key] || 0)) S.best[key] = G.score; g.score = G.score; g.stage = "over"; addXP(Math.min(40, G.score * 2)); save(); }
    render();
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
  window.VG_TEST = { get S() { return S; }, set S(v) { S = v; }, UI, analyzeAndShow, searchAsk, checkTarget, encodeWav, passed, levelsCleared, RECS: () => RECS, render, go };

  /* ---------- boot ---------- */
  async function boot() {
    applySet();
    RECS = await DB.all();
    try { history.replaceState({}, ""); history.pushState({}, ""); } catch (e) { }
    window.addEventListener("popstate", () => { if (back() !== "exit") { try { history.pushState({}, ""); } catch (e) { } } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && UI.modal) back(); });
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
