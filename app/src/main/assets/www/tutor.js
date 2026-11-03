/* Voice Guru - Voice Tutor engine (offline).
   - say(): tutor speaks with the best offline phone voice (Android TTS bridge / Web Speech).
   - playSeq()/playTrack(): tutor "sings" with a human-like 'Aaa' (glottal source + vowel formants,
     breath noise, delayed vibrato) at exact pitch.
   - playSamples()/pitchShift(): plays the user's REAL recording, and the user's own voice moved
     to the correct note (TD-PSOLA, keeps timbre and length) - "your voice, correct note".
   - analyzeX() and feedbackX(): turn a recording into teacher feedback: score, mistakes, demos, drills.
   Text is English (en) or Roman Hinglish (hi) only. */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : globalThis;

  /* ---------------- music helpers ---------------- */
  const SARG = ["Sa", "Re(k)", "Re", "Ga(k)", "Ga", "Ma", "Ma(t)", "Pa", "Dha(k)", "Dha", "Ni(k)", "Ni"];
  const semiHz = (sa, s) => sa * Math.pow(2, s / 12);
  /* sargam name; upper octave marked ' (Sa'), lower octave marked , (Ni,) */
  const sargName = (s) => { const k = ((s % 12) + 12) % 12, o = Math.floor(s / 12); return SARG[k] + (o > 0 ? "'".repeat(o) : o < 0 ? ",".repeat(-o) : ""); };
  const cents = (hz, target) => 1200 * Math.log2(hz / target);
  function foldCents(c) { let f = c, oct = 0; while (f > 600) { f -= 1200; oct++; } while (f < -600) { f += 1200; oct--; } return { c: f, oct: oct }; }
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const std = (a) => { if (a.length < 2) return 0; const mu = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - mu) * (y - mu), 0) / a.length); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function snapHz(hz) { const midi = Math.round(69 + 12 * Math.log2(hz / 440)); return { hz: 440 * Math.pow(2, (midi - 69) / 12), name: NOTES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1), midi: midi }; }

  /* ---------------- speech (tutor voice) ---------------- */
  const V = { rate: 0.95, lang: "en-IN", pending: null, token: 0, voiceName: "" };
  W.__ttsDone = function () { const p = V.pending; V.pending = null; if (p) p(); };
  function estMs(text, rate) { const words = String(text).split(/\s+/).length; return Math.max(900, words * 430 / (rate || 1)) + 400; }
  function webVoice() { try { if (!V.voiceName || !W.speechSynthesis) return null; return W.speechSynthesis.getVoices().find((v) => v.name === V.voiceName) || null; } catch (e) { return null; } }
  function say(text, opt) {
    opt = opt || {};
    text = String(text || "").trim();
    if (!text) return Promise.resolve();
    if (V.pending) { const p = V.pending; V.pending = null; p(); }
    const my = ++V.token, rate = (opt.rate || 1) * V.rate, t0 = Date.now(), est = estMs(text, rate);
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (done) return; done = true; clearTimeout(guard); const left = 350 - (Date.now() - t0); setTimeout(resolve, Math.max(0, left)); };
      const guard = setTimeout(fin, est * 1.8 + 1500); // never hang a lesson
      if (W.AndroidApp && W.AndroidApp.speak) {
        V.pending = () => { if (my === V.token || true) fin(); };
        try { W.AndroidApp.speak(text, opt.lang || V.lang, rate); return; } catch (e) { V.pending = null; }
      }
      try {
        if (W.speechSynthesis && W.SpeechSynthesisUtterance) {
          const u = new W.SpeechSynthesisUtterance(text); u.rate = rate; u.lang = opt.lang || V.lang;
          const vv = webVoice(); if (vv) u.voice = vv;
          u.onend = fin; u.onerror = fin; W.speechSynthesis.cancel(); W.speechSynthesis.speak(u); return;
        }
      } catch (e) { }
      setTimeout(fin, Math.min(est, 2500));
    });
  }
  function stopSpeech() {
    V.token++;
    try { if (W.AndroidApp && W.AndroidApp.stopSpeak) W.AndroidApp.stopSpeak(); } catch (e) { }
    try { if (W.speechSynthesis) W.speechSynthesis.cancel(); } catch (e) { }
    if (V.pending) { const p = V.pending; V.pending = null; p(); }
  }

  /* --- offline voice list + ranking (best natural, offline, Indian English first) --- */
  function voiceList() {
    let list = [];
    try { if (W.AndroidApp && W.AndroidApp.voices) list = JSON.parse(W.AndroidApp.voices() || "[]") || []; } catch (e) { list = []; }
    if (!list.length) {
      try { if (W.speechSynthesis) list = W.speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang, q: v.localService ? 400 : 300, lat: 300, net: !v.localService, inst: true })); } catch (e) { }
    }
    return list.filter((v) => v && v.name);
  }
  function rankVoice(v, uiLang) {
    const l = String(v.lang || "").toLowerCase().replace("_", "-");
    let s = 0;
    if (l.startsWith("en-in")) s += 100; else if (l.startsWith("hi")) s += uiLang === "english" ? 40 : 70;
    else if (l.startsWith("en-gb")) s += 60; else if (l.startsWith("en-us")) s += 55; else if (l.startsWith("en")) s += 50; else return -1;
    if (!v.net && v.inst !== false) s += 60; else s -= 80;     // offline + installed matters most
    s += (v.q || 300) / 10;                                     // quality 500 = very high
    if (/local|offline/i.test(v.name)) s += 5;
    if (/network|-net/i.test(v.name)) s -= 30;
    return s;
  }
  function offlineVoices(uiLang) {
    return voiceList().map((v) => Object.assign({ score: rankVoice(v, uiLang) }, v)).filter((v) => v.score > 0 && !v.net && v.inst !== false)
      .sort((a, b) => b.score - a.score);
  }
  function bestVoice(uiLang) { const l = offlineVoices(uiLang); return l.length ? l[0] : null; }
  function setVoice(name) {
    V.voiceName = name || "";
    try { if (W.AndroidApp && W.AndroidApp.setVoice) W.AndroidApp.setVoice(V.voiceName); } catch (e) { }
    const l = voiceList().find((v) => v.name === name); if (l && l.lang) V.lang = l.lang;
  }

  /* ---------------- audio output: human-like singing voice ---------------- */
  let AC = null, PW = null, NOISE = null; const live = [];
  const OPT = { style: "human" }; // "human" (formant vowel) | "harmonium" | "tone" (plain)
  const VOWELS = { a: [[730, 1.0, 7], [1090, 0.55, 8], [2440, 0.28, 10], [3400, 0.12, 12]], i: [[300, 1.0, 7], [2300, 0.45, 10], [3000, 0.3, 12], [3600, 0.12, 12]],
    u: [[320, 1.0, 7], [800, 0.5, 8], [2300, 0.12, 10], [3200, 0.06, 12]], o: [[500, 1.0, 7], [850, 0.6, 8], [2500, 0.15, 10], [3300, 0.06, 12]],
    m: [[260, 1.0, 5], [1000, 0.12, 6], [2200, 0.05, 8], [3300, 0.02, 10]] };
  function ac() {
    if (!AC) { const C = W.AudioContext || W.webkitAudioContext; if (!C) return null; try { AC = new C(); } catch (e) { return null; } }
    try { if (AC.state === "suspended" && AC.resume) AC.resume(); } catch (e) { }
    return AC;
  }
  function glottalWave(ctx) {
    if (PW) return PW;
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = 1 / Math.pow(k, 1.35); // glottal-like source, ~ -8 dB/octave
    PW = ctx.createPeriodicWave(re, im); return PW;
  }
  function noiseBuf(ctx) {
    if (NOISE) return NOISE;
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    NOISE = b; return b;
  }
  function makeVoice(ctx, hzRef, vowel) {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    const osc = ctx.createOscillator(); const nodes = [osc];
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.4; const lfoG = ctx.createGain(); lfoG.gain.value = 0;
    lfo.connect(lfoG); lfoG.connect(osc.detune); nodes.push(lfo);
    if (OPT.style === "tone") {
      osc.type = "sine"; const lp = ctx.createGain(); lp.gain.value = 0.9; osc.connect(lp); lp.connect(out);
      return { osc, out, lfoG, nodes };
    }
    if (OPT.style === "harmonium") { // two detuned reeds -> classic harmonium beating
      osc.type = "sawtooth"; const o2 = ctx.createOscillator(); o2.type = "square"; o2.detune.value = 6; lfoG.connect(o2.detune);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; lp.Q.value = 0.7;
      const g1 = ctx.createGain(); g1.gain.value = 0.32; const g2 = ctx.createGain(); g2.gain.value = 0.22;
      osc.connect(g1); o2.connect(g2); g1.connect(lp); g2.connect(lp); lp.connect(out); nodes.push(o2);
      return { osc, out, lfoG, nodes, extra: [o2.frequency] };
    }
    try { osc.setPeriodicWave(glottalWave(ctx)); } catch (e) { osc.type = "sawtooth"; }
    const k = hzRef > 200 ? 1.15 : 1; // female/child range: slightly higher formants
    // vowel formants (default 'a' as in "Aaa": F1 730, F2 1090, F3 2440, F4 3400)
    const F = (VOWELS[vowel] || VOWELS.a).map(([f, g, q]) => [f * k, g, q]);
    const mix = ctx.createGain(); mix.gain.value = 1.6; mix.connect(out);
    for (const [f, g, q] of F) { const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q; const gg = ctx.createGain(); gg.gain.value = g; osc.connect(bp); bp.connect(gg); gg.connect(mix); }
    const body = ctx.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 450; const bg = ctx.createGain(); bg.gain.value = 0.25; osc.connect(body); body.connect(bg); bg.connect(mix);
    try { // soft breath
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(ctx); ns.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1800 * k; nf.Q.value = 0.8;
      const ng = ctx.createGain(); ng.gain.value = 0.03; ns.connect(nf); nf.connect(ng); ng.connect(mix); nodes.push(ns);
    } catch (e) { }
    return { osc, out, lfoG, nodes };
  }
  function track(rec) { live.push(rec); }
  function untrack(rec) { const i = live.indexOf(rec); if (i >= 0) live.splice(i, 1); }
  function runVoice(hzRef, build, opt) {
    opt = opt || {};
    const ctx = ac(); if (!ctx) return Promise.resolve();
    let v; try { v = makeVoice(ctx, hzRef, opt.vowel); } catch (e) { return Promise.resolve(); }
    const t0 = Math.max(ctx.currentTime + 0.06, opt.at || 0); const end = build(v, t0, ctx);
    return new Promise((resolve) => {
      const rec = {};
      rec.finish = () => { if (rec.done) return; rec.done = true; clearTimeout(rec.timer); try { v.nodes.forEach((n) => n.stop()); } catch (e) { } try { v.out.disconnect(); } catch (e) { } untrack(rec); resolve(); };
      track(rec);
      v.nodes.forEach((n) => { try { n.start(t0); n.stop(end + 0.15); } catch (e) { } });
      rec.timer = setTimeout(rec.finish, Math.max(0, (end - ctx.currentTime) * 1000) + 220);
    });
  }
  /* seq: [{hz, dur, to?, vol?, volTo?, gap?}] ; hz<=0 = rest */
  function playSeq(seq, opt) {
    if (!seq || !seq.length) return Promise.resolve();
    const ref = (seq.find((s) => s.hz > 0) || { hz: 150 }).hz;
    return runVoice(ref, (v, t0) => {
      let t = t0; const Fq = { setValueAtTime: (a, b) => { v.osc.frequency.setValueAtTime(a, b); (v.extra || []).forEach((p) => p.setValueAtTime(a, b)); },
        exponentialRampToValueAtTime: (a, b) => { v.osc.frequency.exponentialRampToValueAtTime(a, b); (v.extra || []).forEach((p) => p.exponentialRampToValueAtTime(a, b)); } };
      const G = v.out.gain, D = v.lfoG.gain;
      G.setValueAtTime(0, t0); D.setValueAtTime(0, t0);
      for (const it of seq) {
        const dur = Math.max(0.12, it.dur || 1);
        if (!(it.hz > 0)) { G.setValueAtTime(0, t); t += dur; continue; }
        const vol = 0.3 * (it.vol == null ? 1 : it.vol), volTo = it.volTo == null ? null : 0.3 * it.volTo;
        Fq.setValueAtTime(it.hz, t); if (it.to > 0) Fq.exponentialRampToValueAtTime(it.to, t + dur);
        G.setValueAtTime(0, t); G.linearRampToValueAtTime(vol, t + 0.07);
        if (volTo != null) G.linearRampToValueAtTime(Math.max(0.0001, volTo), t + dur - 0.06); else G.setValueAtTime(vol, t + dur - 0.08);
        G.linearRampToValueAtTime(0, t + dur);
        // natural delayed vibrato on held notes (none on glides / very short notes)
        D.setValueAtTime(0, t); if (!it.to && !it.noVib && dur > 0.7) { D.setValueAtTime(0, t + 0.35); D.linearRampToValueAtTime(22, t + Math.min(dur - 0.05, 0.75)); D.setValueAtTime(22, t + dur - 0.05); D.linearRampToValueAtTime(0, t + dur); }
        t += dur + (it.gap == null ? 0.07 : it.gap);
      }
      return t;
    }, opt);
  }
  /* hum the user's pitch line ("you sang like this") - used when no recording is available */
  function playTrack(trk, maxSec) {
    const pts = (trk || []).filter((p) => p && p.t != null);
    if (!pts.some((p) => p.hz > 0)) return Promise.resolve();
    const first = pts.find((p) => p.hz > 0).t, lim = maxSec || 5;
    const slice = pts.filter((p) => p.t >= first && p.t <= first + lim);
    return runVoice(slice.find((p) => p.hz > 0).hz, (v, t0) => {
      const Fq = v.osc.frequency, G = v.out.gain; (v.extra || []).forEach((p) => p.setValueAtTime(slice.find((q) => q.hz > 0).hz, t0));
      G.setValueAtTime(0, t0); Fq.setValueAtTime(slice.find((p) => p.hz > 0).hz, t0);
      for (const p of slice) { const t = t0 + (p.t - first); if (p.hz > 0) { Fq.linearRampToValueAtTime(p.hz, t); G.linearRampToValueAtTime(0.3, t); } else G.linearRampToValueAtTime(0, t); }
      const end = t0 + (slice[slice.length - 1].t - first) + 0.05; G.linearRampToValueAtTime(0, end); return end;
    });
  }
  /* play raw samples (user's own voice), peak-normalised */
  function playSamples(samples, sr) {
    const ctx = ac(); if (!ctx || !samples || samples.length < 64) return Promise.resolve();
    return new Promise((resolve) => {
      const rec = {};
      try {
        let pk = 0; for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > pk) pk = a; }
        const gain = pk > 0 ? Math.min(6, 0.8 / pk) : 1;
        const buf = ctx.createBuffer(1, samples.length, sr), d = buf.getChannelData(0);
        for (let i = 0; i < samples.length; i++) d[i] = samples[i] * gain;
        const fade = Math.min(400, samples.length >> 3); for (let i = 0; i < fade; i++) { d[i] *= i / fade; d[d.length - 1 - i] *= i / fade; }
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
        rec.finish = () => { if (rec.done) return; rec.done = true; clearTimeout(rec.timer); try { src.stop(); } catch (e) { } try { src.disconnect(); } catch (e) { } untrack(rec); resolve(); };
        track(rec); src.onended = rec.finish; src.start();
        rec.timer = setTimeout(rec.finish, samples.length / sr * 1000 + 400);
      } catch (e) { resolve(); }
    });
  }
  /* TD-PSOLA: move the voiced part of x to targetHz, keeping voice character and duration.
     hzAt(i) -> source pitch at sample i (0 = unvoiced). */
  function psola(x, sr, hzAt, targetHz) {
    const N = x.length, y = new Float32Array(N), ws = new Float32Array(N), marks = [];
    let last = -1;
    for (let i = 0; i < N;) {
      const f = hzAt(i); if (!(f > 0)) { last = -1; i += 128; continue; }
      const P = sr / f; let lo, hi;
      if (last < 0) { lo = i; hi = Math.min(N - 1, Math.round(i + P)); } else { lo = Math.round(last + 0.8 * P); hi = Math.min(N - 1, Math.round(last + 1.2 * P)); }
      if (lo >= N - 1) break;
      let best = lo, bv = -Infinity; for (let k = lo; k <= hi; k++) if (x[k] > bv) { bv = x[k]; best = k; }
      marks.push({ i: best, P: P }); last = best; i = best + 1;
    }
    if (!marks.length) return y;
    let tOut = marks[0].i, j = 0;
    while (tOut < N) {
      while (j < marks.length - 1 && Math.abs(marks[j + 1].i - tOut) <= Math.abs(marks[j].i - tOut)) j++;
      const mk = marks[j];
      if (Math.abs(mk.i - tOut) > 2 * mk.P) { // gap (unvoiced) - jump to next voiced mark
        const nx = marks.find((m) => m.i > tOut); if (!nx) break; tOut = nx.i; continue;
      }
      const tg = typeof targetHz === "function" ? targetHz(mk.i, sr / mk.P) : targetHz;
      const Pout = sr / (tg > 0 ? tg : sr / mk.P), H = Math.max(2, Math.round(mk.P));
      for (let k = -H; k <= H; k++) {
        const s = mk.i + k, d = Math.round(tOut) + k; if (s < 0 || s >= N || d < 0 || d >= N) continue;
        const w = 0.5 * (1 + Math.cos(Math.PI * k / H)); y[d] += x[s] * w; ws[d] += w;
      }
      tOut += Pout;
    }
    for (let i = 0; i < N; i++) if (ws[i] > 0.15) y[i] /= Math.max(ws[i], 0.5); else y[i] *= ws[i] / 0.5;
    return y;
  }
  /* cut [t0,t1] from a clip and return {samples, hzAt} using the analysis track */
  function sliceClip(clip, trk, t0, t1) {
    const sr = clip.sampleRate, a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(clip.samples.length, Math.floor(t1 * sr));
    const seg = clip.samples.subarray(a, Math.max(a, b));
    const fr = (trk || []).filter((p) => p.t >= t0 - 0.05 && p.t <= t1 + 0.05);
    const hzAt = (i) => { const t = t0 + i / sr; let best = null, bd = 1e9; for (const p of fr) { const d = Math.abs(p.t - t); if (d < bd) { bd = d; best = p; } } return best && bd < 0.08 ? best.hz : 0; };
    return { samples: seg, sr: sr, hzAt: hzAt };
  }
  function pitchShiftClip(clip, trk, t0, t1, targetHz) {
    const s = sliceClip(clip, trk, t0, t1); if (s.samples.length < 256) return null;
    const tg = targetHz && typeof targetHz === "object" && targetHz.ratio ? (i, src) => src * targetHz.ratio : targetHz;
    return { samples: psola(s.samples, s.sr, s.hzAt, tg), sr: s.sr };
  }
  function beep() {
    const ctx = ac(); if (!ctx) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + 0.02;
        o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.11);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.02); g.gain.setValueAtTime(0.25, t + 0.2); g.gain.linearRampToValueAtTime(0, t + 0.24);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.26);
      } catch (e) { }
      setTimeout(resolve, 380);
    });
  }
  function stopTones() { live.slice().forEach((r) => r.finish && r.finish()); }
  function stopAll() { stopSpeech(); stopTones(); }

  /* ---------------- teacher phrases ---------------- */
  const P = {
    up: { en: "To go higher: make the voice a little lighter, think of the sound moving up into your head, keep the throat relaxed and push gently with breath from the belly.",
          hi: "Sur upar le jaane ke liye: aawaaz thodi halki karo, socho ki aawaaz sar ki taraf ja rahi hai, gala dheela rakho aur pet se saans ka halka dhakka do." },
    down: { en: "To come lower: relax the jaw, feel the sound in your chest and don't push.",
            hi: "Sur neeche laane ke liye: jabda dheela chhodo, aawaaz ko seene mein mehsoos karo, zor mat lagao." },
    steady: { en: "To keep it steady: take a full breath and let the air out slowly and evenly, gently pulling the belly in.",
              hi: "Sur ek-sa rakhne ke liye: poori saans lo aur hawa dheere-dheere, ek jaisi chhodo, pet ko halka andar karte jao." },
    longer: { en: "To hold longer: fill your breath fully before you start and spend the air slowly.",
              hi: "Zyada der tikane ke liye: shuru se pehle poori saans bharo aur hawa bachakar kharch karo." },
    louder: { en: "Sing a little louder and keep the phone close.", hi: "Thoda zor se gaao aur phone paas rakho." },
    smooth: { en: "Slide smoothly, like a slide in a park, not like steps.", hi: "Smooth phislo, jaise phisal-patti, seedhi ki tarah nahi." },
    listen: { en: "Listen.", hi: "Suno." },
    youSang: { en: "This is how you sang.", hi: "Aapne aise gaaya." },
    yourVoiceRight: { en: "And this is your own voice on the correct note.", hi: "Aur ye aapki hi aawaaz, sahi sur par." },
    correct: { en: "Now my note. Match this.", hi: "Ab mera sur. Isse milao." },
    youSpoke: { en: "This is how you spoke.", hi: "Aap aise bole." },
    shouldBe: { en: "It should go like this.", hi: "Aise hona chahiye." },
  };
  /* how-to teaching for each kind of lesson (spoken in "Learn") */
  const TECH = {
    note: { en: "How to catch a note: listen carefully, hum it once in your mind, then start a soft 'Aaa' and bring your voice onto the line using the meter. If you are below, lighten the voice and think up; if above, relax and think down.",
            hi: "Sur pakadne ka tareeka: dhyaan se suno, man mein ek baar gunguna lo, phir halka 'Aaa' shuru karo aur meter dekhkar aawaaz ko line par le aao. Neeche ho to aawaaz halki karke upar socho; upar ho to dheela chhodkar neeche socho." },
    scale: { en: "For a scale, move one step at a time. Land each note cleanly, hold it for a moment, then step to the next. Follow the highlighted note on the screen.",
             hi: "Scale mein ek-ek kadam chalo. Har sur par saaf utro, ek pal ruko, phir agle par jao. Screen par chamakte sur ke saath chalo." },
    glide: { en: "For a slide, keep one long breath and move the voice smoothly like a siren - no jumps.", hi: "Slide ke liye ek lambi saans rakho aur aawaaz ko siren ki tarah smooth le jao - koi jhatka nahi." },
    hold: { en: "For a long note: deep belly breath, open mouth, and let the air out slowly and evenly.", hi: "Lambe sur ke liye: pet se gehri saans, muh khula, aur hawa dheere aur ek jaisi chhodo." },
    speak: { en: "For clear speech: sit straight, breathe from the belly, open your mouth, speak a little slowly and finish every word. Pause at full stops.",
             hi: "Saaf bolne ke liye: seedhe baitho, pet se saans lo, muh kholo, thoda dheere bolo aur har shabd poora karo. Full stop par ruko." },
    pace: { en: "Pace: slow down, pause at every full stop and breathe there. Pauses make you sound confident.", hi: "Raftaar: dheere bolo, har full stop par ruko aur wahi saans lo. Pause se aap confident lagte ho." },
    pitch: { en: "Expression: let your voice rise on questions and surprise, and fall when you finish a statement.", hi: "Bhaav: sawal aur hairani par aawaaz upar, baat khatam karte waqt neeche." },
    confidence: { en: "Confidence: keep the volume strong and even until the very last word.", hi: "Confidence: aawaaz mazboot aur ek-si rakho, aakhri shabd tak." },
    shadow: { en: "Shadowing: listen to me, then copy the same rhythm, stress and sounds.", hi: "Shadowing: mujhe suno, phir wahi lay, zor aur sounds copy karo." },
    articulate: { en: "Clarity: move the lips and tongue fully, every consonant crisp. Slow is clear.", hi: "Saafi: honth aur jeebh poori chalao, har akshar kurkura. Dheere matlab saaf." },
    rhythm: { en: "For rhythm: listen to one full round first and count the beats in your mind. Breathe just before the beat and start each note exactly on it - short and separate.",
              hi: "Laya ke liye: pehle ek poora chakkar suno aur man mein matra gino. Beat se theek pehle saans lo aur har sur theek beat par shuru karo - chhota aur alag." },
    tone: { en: "For a beautiful tone: relaxed throat, open mouth, and feel the sound buzzing in the front of your face. Use only as much air as the tone needs.",
            hi: "Sundar aawaaz ke liye: dheela gala, khula muh, aur aawaaz ko chehre ke saamne jhanjhanaate mehsoos karo. Utni hi hawa jitni sur ko chahiye." },
    dyn: { en: "For soft-loud-soft: more breath pressure makes it louder, but keep the throat the same so the note does not move.",
           hi: "Halka-zor-halka ke liye: saans ka dabaav badhao to aawaaz badhegi, par gala waisa hi rakho taaki sur na hile." },
    ladder: { en: "For the ladder: keep the same easy feeling as the pattern moves. If it ever hurts or feels tight, stop - that is your limit for today.",
              hi: "Seedhi ke liye: pattern upar-neeche jaaye tab bhi wahi aasaan ehsaas rakho. Kabhi dard ya khichav ho to ruk jao - aaj ki seema wahi hai." },
  };
  const pick = (o, lang) => (o ? (lang === "english" ? o.en : o.hi) : "");
  function amountText(c, lang) {
    const a = Math.abs(c), dirEn = c > 0 ? "too high" : "too low", dirHi = c > 0 ? "upar" : "neeche";
    if (a < 100) return lang === "english" ? "a little " + dirEn : "thoda sa " + dirHi;
    const n = Math.round(a / 100);
    return lang === "english" ? "about " + n + " semitone" + (n > 1 ? "s" : "") + " " + dirEn : "lagbhag " + n + " semitone " + dirHi;
  }
  /* steps to let the user hear: their real voice -> their voice corrected -> tutor note */
  function compareSteps(lang, seg, userHz, correctHz, tutorHz, dur) {
    const st = [{ say: pick(P.youSang, lang) }, { clip: seg, fallback: { seq: [{ hz: userHz, dur: dur }], label: "you" } }];
    if (correctHz > 0) st.push({ say: pick(P.yourVoiceRight, lang) }, { clipFix: [seg[0], seg[1], correctHz], label: "fix" });
    st.push({ say: pick(P.correct, lang) }, { seq: [{ hz: tutorHz, dur: dur }], label: "demo" });
    return st;
  }

  /* ---------------- analysis: sung notes ---------------- */
  function windowStats(trk, a, b, target) {
    const fr = trk.filter((p) => p.hz > 0 && p.t >= a && p.t <= b);
    if (fr.length < 3) return null;
    const cs = fr.map((p) => foldCents(cents(p.hz, target)).c);
    const hzs = fr.map((p) => p.hz);
    return { hz: median(hzs), cents: Math.round(median(cs)), wobble: Math.round(std(cs)), n: fr.length, oct: foldCents(cents(median(hzs), target)).oct, seg: [fr[0].t, fr[fr.length - 1].t + 0.03] };
  }
  /* start/end time of each note (supports plan.durs for melodies) */
  function noteTimes(plan) { const d = plan.dur || 1.2, st = []; let t = 0; plan.notes.forEach((_, i) => { const di = plan.durs ? plan.durs[i] * d : d; st.push([t, t + di]); t += di; }); return st; }
  function analyzeNotes(trk, plan, sa) {
    trk = trk || []; const N = plan.notes.length, d = plan.dur || 1.2, NT = noteTimes(plan), total = NT[NT.length - 1][1];
    const targets = plan.notes.map((s) => semiHz(sa, s));
    const voiced = trk.filter((p) => p.hz > 0);
    const evalWin = (wins) => wins.map((w, i) => {
      const len = w[1] - w[0], st = windowStats(trk, w[0] + len * 0.25, w[1] - len * 0.1, targets[i]);
      return Object.assign({ semi: plan.notes[i], name: sargName(plan.notes[i]), target: targets[i], win: [w[0], w[1]] }, st || { missing: true });
    });
    const lag = 0.2, A = evalWin(NT.map((w) => [w[0] + lag, w[1] + lag]));
    let B = null;
    if (voiced.length > 4) { const t0 = voiced[0].t, t1 = voiced[voiced.length - 1].t, k = (t1 - t0) / total; if (k * total / N > 0.15) B = evalWin(NT.map((w) => [t0 + w[0] * k, t0 + w[1] * k])); }
    const err = (arr) => arr.reduce((x, n) => x + (n.missing ? 1000 : Math.abs(n.cents)), 0);
    const notes = B && err(B) < err(A) ? B : A;
    const tol = plan.tol || 50, wob = plan.wobbleMax || 45;
    notes.forEach((n) => { n.ok = !n.missing && Math.abs(n.cents) <= tol; n.steady = !n.missing && n.wobble <= wob; });
    const voicedSec = voiced.length ? voiced[voiced.length - 1].t - voiced[0].t : 0;
    return { notes, pass: notes.every((n) => n.ok && n.steady) && (!plan.holdMin || voicedSec >= plan.holdMin), voicedSec: Math.round(voicedSec * 10) / 10 };
  }
  function scoreNotes(res, plan) {
    const per = res.notes.map((n) => { if (n.missing) return 0; let s = clamp(100 - Math.max(0, Math.abs(n.cents) - 15) * 1.1, 10, 100); if (!n.steady) s *= 0.75; return s; });
    let s = per.reduce((a, b) => a + b, 0) / Math.max(1, per.length);
    if (plan.holdMin && res.voicedSec < plan.holdMin) s *= clamp(res.voicedSec / plan.holdMin, 0.3, 1);
    return Math.round(s);
  }
  function analyzeGlide(trk, plan, sa) {
    const fr = (trk || []).filter((p) => p.hz > 0);
    if (fr.length < 5) return { missing: true, pass: false, need: plan.rangeMin || 5, range: 0, jumps: 0, upDown: false };
    const cs = fr.map((p) => cents(p.hz, sa));
    let lo = Infinity, hi = -Infinity, hiIdx = 0;
    cs.forEach((c, i) => { if (c < lo) lo = c; if (c > hi) { hi = c; hiIdx = i; } });
    const range = Math.round((hi - lo) / 10) / 10;
    let jumps = 0; for (let i = 1; i < cs.length; i++) if (Math.abs(cs[i] - cs[i - 1]) > 220 && fr[i].t - fr[i - 1].t < 0.08) jumps++;
    const peakPos = hiIdx / (cs.length - 1), upDown = peakPos > 0.2 && peakPos < 0.85, need = plan.rangeMin || 5;
    return { range, jumps, upDown, pass: range >= need && jumps <= 3 && (plan.noShape || upDown), need, seg: [fr[0].t, Math.min(fr[fr.length - 1].t, fr[0].t + 5)] };
  }

  /* ---------------- feedback builders ----------------
     returns {pass, score, summary, items:[{text, steps, drill?, info?}]}
     step: {say, rate?} | {seq, label} | {track} | {clip:[t0,t1]} | {clipFix:[t0,t1,hz]} | {wait} */
  function feedbackNotes(res, plan, sa, m, lang) {
    const E = lang === "english", out = { pass: res.pass, items: [], summary: "", score: scoreNotes(res, plan) };
    if (m && m.volMean != null && m.volMean < 0.012) out.items.push({ text: pick(P.louder, lang), steps: [{ say: pick(P.louder, lang) }] });
    const bad = res.notes.filter((n) => !n.ok || !n.steady);
    const good = res.notes.filter((n) => n.ok && n.steady).map((n) => n.name);
    const octNote = res.notes.find((n) => !n.missing && n.oct);
    if (octNote) {
      const t = E ? "You sang an octave " + (octNote.oct < 0 ? "lower" : "higher") + ". That is fine - the note is the same." : "Aapne ek octave " + (octNote.oct < 0 ? "neeche" : "upar") + " gaaya. Ye theek hai - sur wahi hai.";
      out.items.push({ text: t, steps: [{ say: t }], info: true });
    }
    for (const n of bad.slice(0, 3)) {
      const dur = Math.max(1.2, Math.min(2.2, plan.dur || 1.2));
      const drill = { kind: "note", notes: [n.semi], dur: 2.5, holdMin: 1.5, tol: 40, wobbleMax: 40, name: n.name,
        intro: E ? "Let's practise only " + n.name + "." : "Sirf " + n.name + " ka abhyaas karte hain." };
      if (n.missing) {
        const t = E ? n.name + ": I could not hear your voice on this note." : n.name + ": is sur par aawaaz nahi mili.";
        out.items.push({ text: t, drill, steps: [{ say: t }, { say: pick(P.listen, lang) }, { seq: [{ hz: n.target, dur }], label: n.name }] });
        continue;
      }
      const corr = n.target * Math.pow(2, n.oct || 0); // correct note in the user's own octave
      if (!n.ok) {
        const t = (E ? n.name + " was " : n.name + " ") + amountText(n.cents, lang) + (E ? "." : " tha.");
        const how = pick(n.cents < 0 ? P.up : P.down, lang);
        out.items.push({ text: t + " " + how, user: n.hz, target: n.target, drill,
          steps: [{ say: t }].concat(compareSteps(lang, n.seg, n.hz, corr, n.target, dur), [{ say: how }]) });
      } else {
        const t = E ? n.name + " was the right note but it was shaking." : n.name + " sahi sur tha par hil raha tha.";
        out.items.push({ text: t + " " + pick(P.steady, lang), drill: Object.assign({}, drill, { wobbleMax: 35 }),
          steps: [{ say: t }, { say: pick(P.youSang, lang) }, { clip: n.seg, fallback: { seq: [{ hz: n.hz, dur }], label: "you" } },
            { say: pick(P.correct, lang) }, { seq: [{ hz: n.target, dur: 1.8, noVib: true }], label: n.name }, { say: pick(P.steady, lang) }] });
      }
    }
    if (plan.holdMin && res.voicedSec < plan.holdMin) {
      const t = E ? "You held it for " + res.voicedSec + " seconds. Try for " + plan.holdMin + "." : "Aapne " + res.voicedSec + " second tikaya. " + plan.holdMin + " second tak le jao.";
      out.items.push({ text: t + " " + pick(P.longer, lang), steps: [{ say: t }, { say: pick(P.longer, lang) }] });
    }
    if (res.pass) out.summary = E ? "Excellent! Every note was correct and steady." : "Bahut badhiya! Har sur sahi aur steady tha.";
    else if (good.length) out.summary = E ? "Correct: " + good.join(", ") + ". Let's fix the rest." : "Sahi the: " + good.join(", ") + ". Baaki ko theek karte hain.";
    else out.summary = E ? "Let's fix it together." : "Chalo saath mein theek karte hain.";
    return out;
  }
  function feedbackGlide(res, plan, sa, trk, lang) {
    const E = lang === "english", out = { pass: res.pass, items: [], summary: "" };
    const demo = demoSeq(plan, sa);
    out.score = res.missing ? 0 : Math.round(clamp(Math.min(1, res.range / res.need) * 100 - Math.max(0, res.jumps - 3) * 5 - (plan.noShape || res.upDown ? 0 : 15), 0, 100));
    const drill = Object.assign({}, plan, { dur: (plan.dur || 1.8) + 0.4, intro: E ? "Let's practise the slide slowly." : "Slide ka dheere-dheere abhyaas karte hain." });
    if (res.missing) { const t = E ? "I could not hear a slide. Sing 'Aaa' and move it up and down." : "Slide sunai nahi di. 'Aaa' gaakar upar-neeche le jao."; out.items.push({ text: t, drill, steps: [{ say: t }, { seq: demo, label: "demo" }] }); out.summary = t; return out; }
    if (res.range < res.need) {
      const t = E ? "Your slide covered " + res.range + " semitones. Go wider - about " + res.need + "." : "Aapki slide " + res.range + " semitone ki thi. Aur khula karo - lagbhag " + res.need + ".";
      out.items.push({ text: t + " " + pick(P.up, lang), drill, steps: [{ say: t }, { say: pick(P.youSang, lang) }, { clip: res.seg, fallback: { track: trk } }, { say: pick(P.correct, lang) }, { seq: demo, label: "demo" }, { say: pick(P.up, lang) }] });
    }
    if (res.jumps > 3) { const t = pick(P.smooth, lang); out.items.push({ text: t, drill, steps: [{ say: t }, { say: pick(P.youSang, lang) }, { clip: res.seg, fallback: { track: trk } }, { say: pick(P.correct, lang) }, { seq: demo, label: "demo" }] }); }
    if (!plan.noShape && !res.upDown) { const t = E ? "Go up first, then come back down." : "Pehle upar jao, phir wapas neeche aao."; out.items.push({ text: t, drill, steps: [{ say: t }, { seq: demo, label: "demo" }] }); }
    out.summary = res.pass ? (E ? "Beautiful slide - wide and smooth!" : "Sundar slide - khuli aur smooth!") : (E ? "Good try. Let's improve it." : "Achhi koshish. Ise behtar karte hain.");
    return out;
  }
  function feedbackHold(m, plan, sa, lang) {
    const E = lang === "english", out = { items: [], summary: "" };
    const fr = (m.track || []).filter((p) => p.hz > 0);
    const med = fr.length ? median(fr.map((p) => p.hz)) : sa;
    const wob = fr.length > 3 ? std(fr.slice(Math.floor(fr.length * 0.15)).map((p) => cents(p.hz, med))) : 0;
    const need = plan.holdMin || 6, seg = fr.length ? [fr[0].t, Math.min(fr[fr.length - 1].t, fr[0].t + 4)] : [0, 0];
    const drill = Object.assign({}, plan, { intro: E ? "Let's practise a long, steady 'Aaa'." : "Lambe, steady 'Aaa' ka abhyaas karte hain." });
    if (!fr.length) { const t = E ? "I could not hear a steady note. Sing 'Aaa' after the beep." : "Steady sur sunai nahi diya. Beep ke baad 'Aaa' gaao."; out.items.push({ text: t, drill, steps: [{ say: t }] }); }
    if (m.volMean != null && m.volMean < 0.012) out.items.push({ text: pick(P.louder, lang), steps: [{ say: pick(P.louder, lang) }] });
    const shaky = fr.length && (wob > 45 || (m.tremor || 0) > (plan.tremorMax || 0.08));
    if (shaky) {
      const t = E ? "Your 'Aaa' was shaking." : "Aapka 'Aaa' kaanp raha tha.";
      out.items.push({ text: t + " " + pick(P.steady, lang), drill, steps: [{ say: t }, { say: pick(P.youSang, lang) }, { clip: seg, fallback: { track: m.track } }, { say: pick(P.correct, lang) }, { seq: [{ hz: med, dur: 2.2, noVib: true }], label: "steady" }, { say: pick(P.steady, lang) }] });
    }
    const sus = m.sustainSec || 0;
    if (fr.length && sus < need) {
      const t = E ? "You held it " + sus + " seconds. Aim for " + need + "." : "Aapne " + sus + " second tikaya. " + need + " second ka lakshya rakho.";
      out.items.push({ text: t + " " + pick(P.longer, lang), drill, steps: [{ say: t }, { say: pick(P.longer, lang) }] });
    }
    out.score = fr.length ? Math.round(clamp(Math.min(1, sus / need) * 60 + (shaky ? Math.max(0, 40 - (wob - 45)) * 0.5 : 40) - (m.volMean < 0.012 ? 10 : 0), 0, 100)) : 0;
    out.pass = !out.items.length;
    out.summary = out.pass ? (E ? "Very good! Long and steady." : "Bahut achha! Lamba aur steady.") : (E ? "Let's make it better." : "Ise aur behtar karte hain.");
    return out;
  }
  const sentences = (t) => String(t || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  const words = (t) => String(t || "").split(/\s+/).filter(Boolean).length;
  /* speech: pace, pauses, fading volume, flat tone, shaky voice, loudness.
     focus (drills only): "pace" | "fade" | "tone" -> judge just that skill */
  function feedbackSpeech(m, ex, lang, focus) {
    const E = lang === "english", out = { items: [], summary: "" };
    const fr = (m.track || []).filter((p) => p.rms > 0.01);
    const read = ex && ex.read ? String(ex.read) : "", sens = sentences(read);
    if (!m.spokenSec || m.spokenSec < 0.8) { const t = E ? "I heard very little. Read the full text clearly." : "Bahut kam aawaaz aayi. Poora text saaf padho."; out.items.push({ text: t, steps: [{ say: t }] }); out.pass = false; out.score = 0; out.summary = t; return out; }
    const wps = read ? words(read) / Math.max(0.5, m.spokenSec) : 0;
    const want = (k) => !focus || focus === k;
    if (!focus && m.volMean != null && m.volMean < 0.012) out.items.push({ text: pick(P.louder, lang), steps: [{ say: E ? "Speak a little louder and keep the phone close." : "Thoda zor se bolo aur phone paas rakho." }] });
    const fast = focus === "pace" ? wps > 2.7 : ((m.speakingRatio > 0.9 && (m.pauses || 0) < 1 && sens.length > 1) || wps > 3.3);
    if (want("pace") && fast) {
      const t = E ? "You spoke fast without pauses. Slow down and pause for a second at each full stop." : "Aap tez bole aur ruke nahi. Dheere bolo aur har full stop par ek second ruko.";
      const st = [{ say: t }]; if (sens[0]) { st.push({ say: E ? "Listen, like this." : "Suno, aise." }, { say: sens.slice(0, 2).join(" "), rate: 0.72 }); }
      out.items.push({ text: t, steps: st, drill: sens[0] ? { kind: "speak", focus: "pace", read: sens.slice(0, 2).join(" "), rate: 0.72, intro: E ? "Let's practise slow, paused reading." : "Dheere, ruk-ruk kar padhne ka abhyaas karte hain." } : null });
    } else if (!focus && m.speakingRatio < 0.35 && (m.pauses || 0) > 4) {
      const t = E ? "There were too many long gaps. Join the words smoothly." : "Beech mein bahut lambe gap the. Shabdon ko jodkar bolo.";
      out.items.push({ text: t, steps: [{ say: t }] });
    }
    if (want("fade") && fr.length > 10) {
      const k = Math.floor(fr.length * 0.5), first = fr.slice(0, k).reduce((a, p) => a + p.rms, 0) / k, lastN = Math.max(1, Math.floor(fr.length * 0.25));
      const last = fr.slice(-lastN).reduce((a, p) => a + p.rms, 0) / lastN;
      if (last < first * 0.55) {
        const t = E ? "Your voice faded at the end. Stay strong till the last word." : "Ant mein aawaaz gir gayi. Aakhri shabd tak mazboot raho.";
        const tEnd = fr[fr.length - 1].t, seg = [Math.max(0, tEnd - 2.5), tEnd + 0.1], hz = m.pitchMean > 0 ? m.pitchMean : 140;
        out.items.push({ text: t, steps: [{ say: t }, { say: pick(P.youSpoke, lang) }, { clip: seg, fallback: { seq: [{ hz, dur: 2.2, vol: 1, volTo: 0.12 }] } }, { say: pick(P.shouldBe, lang) }, { say: sens.length ? sens[sens.length - 1] : (E ? "Strong till the end." : "Ant tak mazboot."), rate: 0.85 }],
          drill: sens.length ? { kind: "speak", focus: "fade", read: sens[sens.length - 1], rate: 0.85, intro: E ? "Let's practise finishing strong." : "Mazbooti se khatam karne ka abhyaas karte hain." } : null });
      }
    }
    if (want("tone") && m.semitoneRange != null && m.semitoneRange < (focus ? 3 : 2.5) && m.pitchMean > 0) {
      const t = E ? "Your tone was flat, on one note. Let it rise and fall: up for questions, down to finish." : "Aawaaz ek hi sur par sapaat rahi. Utaar-chadhaav lao: sawal par upar, baat khatam karte waqt neeche.";
      const hz = m.pitchMean, tv = fr.length ? fr[0].t : 0;
      out.items.push({ text: t, steps: [{ say: t }, { say: pick(P.youSpoke, lang) }, { clip: [tv, tv + 3], fallback: { seq: [{ hz, dur: 2 }] } }, { say: pick(P.shouldBe, lang) },
        { seq: [{ hz, dur: 0.7, to: hz * 1.19 }, { hz: hz * 1.19, dur: 0.5, to: hz * 1.06, gap: 0 }, { hz: hz * 1.06, dur: 0.8, to: hz * 0.89, gap: 0 }], label: "wave" }],
        drill: { kind: "speak", focus: "tone", read: E ? "Are you ready? Yes, I am ready!" : "Kya aap taiyaar ho? Haan, main taiyaar hoon!", rate: 0.85, intro: E ? "Let's practise a question and an answer with feeling." : "Bhaav ke saath sawal aur jawab ka abhyaas karte hain." } });
    }
    if (!focus && (m.tremor || 0) > 0.12) { const t = E ? "Your voice was a bit shaky. Breathe deep and speak slowly." : "Aawaaz thodi kaanp rahi thi. Gehri saans lekar dheere bolo."; out.items.push({ text: t, steps: [{ say: t }] }); }
    out.pass = !out.items.filter((i) => !i.info).length;
    out.score = Math.round(clamp(100 - 18 * out.items.length, 15, 100));
    out.summary = out.pass ? (E ? "Very good! Clear, steady and well paced." : "Bahut badhiya! Saaf, steady aur sahi raftaar.") : (E ? "Good effort. Here is what to improve." : "Achhi koshish. Ye cheezein sudhaarni hain.");
    return out;
  }
  function demoSeq(plan, sa) {
    const d = plan.dur || 1.2;
    if (plan.kind === "glide") { const n = plan.notes; const s = []; for (let i = 0; i < n.length - 1; i++) s.push({ hz: semiHz(sa, n[i]), to: semiHz(sa, n[i + 1]), dur: d, gap: 0 }); return s; }
    if (plan.kind === "hold") return [{ hz: semiHz(sa, plan.notes ? plan.notes[0] : 0), dur: Math.min(5, plan.holdMin || 4) }];
    return plan.notes.map((s, i) => { const di = plan.durs ? plan.durs[i] * d : d; return { hz: semiHz(sa, s), dur: di * 0.9, gap: di * 0.1 }; });
  }
  /* improvement sentence: compares this score with the last and the first one */
  function improveText(hist, score, lang) {
    const E = lang === "english";
    if (!hist || !hist.length) return E ? "Your score is " + score + " out of 100. This is your starting point." : "Aapka score 100 mein se " + score + " hai. Ye aapki shuruaat hai.";
    const prev = hist[hist.length - 1].s, first = hist[0].s, d = score - prev;
    let t = E ? "Score " + score + ". " : "Score " + score + ". ";
    if (d > 0) t += E ? "Last time " + prev + ", now " + score + " - " + d + " points better!" : "Pichhli baar " + prev + " tha, ab " + score + " - " + d + " ka sudhaar!";
    else if (d === 0) t += E ? "Same as last time. One more focused try." : "Pichhli baar jaisa hi. Ek baar aur dhyaan se.";
    else t += E ? "A little lower than last time (" + prev + "). No problem, stay calm and try again." : "Pichhli baar (" + prev + ") se thoda kam. Koi baat nahi, aaram se phir karo.";
    if (hist.length >= 2 && score - first >= 10) t += E ? " Since your first try you improved by " + (score - first) + "." : " Pehli koshish se ab tak " + (score - first) + " ka sudhaar hua.";
    return t;
  }

  /* ================= singer tools ================= */
  const pct = (arr, p) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };
  const mmss = (t) => { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
  const NOTE_HI = { en: "note", hi: "sur" };
  function midiName(hz) { return snapHz(hz).name; }

  /* ---- FFT (radix-2, in place) ---- */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  /* ---- tone quality: HNR (clean vs breathy) + "ring" (2-4 kHz singer's formant energy) ---- */
  function toneQuality(samples, sr, trk) {
    const fr = (trk || []).filter((p) => p.hz > 0);
    if (fr.length < 5) return null;
    const top = pct(fr.map((p) => p.rms), 0.3), use = fr.filter((p) => p.rms >= top);
    const N = 2048, hnrs = [], rings = [];
    const step = Math.max(1, Math.floor(use.length / 25));
    for (let u = 0; u < use.length; u += step) {
      const p = use[u], c = Math.floor((p.t + 0.02) * sr), a = c - N / 2; if (a < 0 || a + N > samples.length) continue;
      // HNR from normalised autocorrelation at the pitch period
      const P = sr / p.hz; let best = 0;
      for (let L = Math.floor(P) - 2; L <= Math.ceil(P) + 2; L++) {
        let xy = 0, xx = 0, yy = 0; const M = N - L;
        for (let i = 0; i < M; i++) { const x = samples[a + i], y = samples[a + i + L]; xy += x * y; xx += x * x; yy += y * y; }
        const r = xy / Math.sqrt(xx * yy + 1e-12); if (r > best) best = r;
      }
      const r = Math.min(0.9999, Math.max(0.0001, best)); hnrs.push(10 * Math.log10(r / (1 - r)));
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = samples[a + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      fft(re, im);
      let lo = 0, hi = 0; for (let k = 1; k < N / 2; k++) { const f = k * sr / N, e = re[k] * re[k] + im[k] * im[k]; if (f >= 80 && f < 1500) lo += e; else if (f >= 2000 && f < 4000) hi += e; }
      rings.push(10 * Math.log10((hi + 1e-12) / (lo + 1e-12)));
    }
    if (!hnrs.length) return null;
    return { hnr: Math.round(median(hnrs) * 10) / 10, ring: Math.round(median(rings) * 10) / 10, n: hnrs.length };
  }
  function feedbackTone(m, q, plan, sa, lang) {
    const E = lang === "english";
    const out = feedbackHold(m, Object.assign({}, plan, { holdMin: plan.holdMin || 4 }), sa, lang);
    out.quality = q;
    if (q) {
      if (q.hnr < 9) {
        const t = E ? "There was too much air in the voice (breathy). Use less air and more tone." : "Aawaaz mein hawa zyada thi (breathy). Hawa kam, sur zyada.";
        const how = E ? "Start with a soft 'Mmm' with lips gently closed, feel the buzz, then open slowly to 'Aaa' keeping the same buzz." : "Pehle honth halke band karke 'Mmm' gungunao, jhanjhanahat mehsoos karo, phir wahi jhanjhanahat rakhte hue dheere 'Aaa' kholo.";
        out.items.push({ text: t + " " + how, drill: { kind: "tone", vowel: "m", notes: plan.notes || [0], holdMin: 4, intro: E ? "Let's practise a clean hum." : "Saaf humming ka abhyaas karte hain." },
          steps: [{ say: t }, { say: pick(P.youSang, lang) }, { clip: q.seg || [0, 3] }, { say: pick(P.correct, lang) }, { seq: [{ hz: semiHz(sa, (plan.notes || [0])[0]), dur: 2.5 }], vowel: plan.vowel || "a", label: "demo" }, { say: how }] });
      }
      if (q.ring < -30) {
        const t = E ? "The tone sounded a little dull, held back inside." : "Aawaaz thodi dabi hui, andar ruki si lagi.";
        const how = E ? "Bring it forward: hum 'Ng' and feel vibration on the nose and lips, then keep that place while singing 'Aaa'. Smile slightly." : "Aawaaz aage laao: 'Ng' gungunao aur naak-honth par kampan mehsoos karo, phir 'Aaa' gaate waqt wahi jagah rakho. Halki muskaan rakho.";
        out.items.push({ text: t + " " + how, info: true, steps: [{ say: t }, { say: how }] });
      }
    }
    out.pass = out.pass !== false && !out.items.filter((i) => !i.info).length;
    const qs = q ? clamp((q.hnr - 5) / 15, 0, 1) * 30 + (q.ring > -30 ? 10 : 0) : 20;
    out.score = Math.round(clamp(out.score * 0.6 + qs, 0, 100));
    if (out.pass) out.summary = E ? "Lovely, clear tone!" : "Bahut sundar, saaf aawaaz!";
    return out;
  }

  /* ---- messa di voce: soft -> loud -> soft on one steady note ---- */
  function analyzeDyn(trk, plan, sa) {
    const fr = (trk || []).filter((p) => p.hz > 0);
    if (fr.length < 15) return { missing: true, pass: false };
    const k = 7, sm = fr.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(fr.length - 1, i + k); j++) { s += fr[j].rms; n++; } return s / n; });
    let pk = 0, pi = 0; sm.forEach((v, i) => { if (v > pk) { pk = v; pi = i; } });
    const pos = pi / (sm.length - 1), startR = sm[Math.min(sm.length - 1, 3)] / pk, endR = sm[Math.max(0, sm.length - 4)] / pk;
    const med = median(fr.map((p) => p.hz)), cs = fr.map((p) => cents(p.hz, med));
    const loudC = median(cs.filter((_, i) => sm[i] > pk * 0.8)), softC = median(cs.filter((_, i) => sm[i] < pk * 0.5).concat([0]));
    const drift = Math.round(loudC - softC), dur = fr[fr.length - 1].t - fr[0].t;
    const grow = startR < 0.6, fade = endR < 0.6, mid = pos > 0.25 && pos < 0.8, steady = Math.abs(drift) <= 50;
    return { grow, fade, mid, steady, drift, dur: Math.round(dur * 10) / 10, pass: grow && fade && mid && steady && dur >= (plan.holdMin || 5) * 0.8, seg: [fr[0].t, Math.min(fr[fr.length - 1].t, fr[0].t + 3)] };
  }
  function feedbackDyn(res, plan, sa, lang) {
    const E = lang === "english", out = { pass: res.pass, items: [] }, hz = semiHz(sa, (plan.notes || [0])[0]);
    const demo = { seq: [{ hz, dur: 2.6, vol: 0.2, volTo: 1, noVib: true }, { hz, dur: 2.6, vol: 1, volTo: 0.2, gap: 0 }], label: "demo" };
    if (res.missing) { const t = E ? "I could not hear a held note." : "Tika hua sur sunai nahi diya."; out.items.push({ text: t, steps: [{ say: t }, demo] }); out.score = 0; out.summary = t; return out; }
    if (!res.grow) { const t = E ? "Start softer - almost a whisper of tone - then grow." : "Aur dheere se shuru karo - bahut halka sur - phir badhao."; out.items.push({ text: t, steps: [{ say: t }, demo] }); }
    if (!res.fade) { const t = E ? "At the end, come back down to soft without stopping the note." : "Ant mein sur tode bina wapas halka karo."; out.items.push({ text: t, steps: [{ say: t }, demo] }); }
    if (!res.mid) { const t = E ? "Keep the loudest point in the middle." : "Sabse zor beech mein rakho."; out.items.push({ text: t, steps: [{ say: t }] }); }
    if (!res.steady) { const t = E ? "The note moved " + (res.drift > 0 ? "up" : "down") + " when you got louder. Keep the pitch fixed, only the volume changes." : "Zor badhane par sur " + (res.drift > 0 ? "upar" : "neeche") + " chala gaya. Sur wahi rakho, sirf aawaaz badlo.";
      out.items.push({ text: t, steps: [{ say: t }, { say: pick(P.youSang, lang) }, { clip: res.seg }, demo] }); }
    out.score = Math.round(clamp(100 - 22 * out.items.length, 10, 100));
    out.summary = res.pass ? (E ? "Beautiful control - soft, loud, soft!" : "Bahut achha control - halka, zor, halka!") : (E ? "Good start. Let's shape it better." : "Achhi shuruaat. Ise aur sundar banate hain.");
    return out;
  }

  /* ---- range: lowest + highest comfortable note ---- */
  function rangeFrom(trkLow, trkHigh) {
    const lo = (trkLow || []).filter((p) => p.hz > 0).map((p) => p.hz), hi = (trkHigh || []).filter((p) => p.hz > 0).map((p) => p.hz);
    if (lo.length < 8 || hi.length < 8) return null;
    const l = pct(lo, 0.2), h = pct(hi, 0.8); if (!(h > l)) return null;
    const semis = Math.round(12 * Math.log2(h / l)), centre = 69 + 12 * Math.log2(Math.sqrt(l * h) / 440);
    const type = centre < 52 ? "bass" : centre < 55 ? "baritone" : centre < 59 ? "tenor" : centre < 64 ? "alto" : centre < 67 ? "mezzo" : "soprano";
    return { lo: Math.round(l * 10) / 10, hi: Math.round(h * 10) / 10, semis, loName: midiName(l), hiName: midiName(h), type };
  }
  const VTYPE = { bass: { en: "bass (deep male)", hi: "bass (gehri mardana)" }, baritone: { en: "baritone (medium male)", hi: "baritone (beech ki mardana)" }, tenor: { en: "tenor (high male)", hi: "tenor (oonchi mardana)" },
    alto: { en: "alto (low female)", hi: "alto (neechi zanana)" }, mezzo: { en: "mezzo (medium female)", hi: "mezzo (beech ki zanana)" }, soprano: { en: "soprano (high female)", hi: "soprano (oonchi zanana)" } };
  function rangeText(r, prev, lang) {
    const E = lang === "english", oct = Math.floor(r.semis / 12), rest = r.semis % 12;
    let t = E ? "Your comfortable range is from " + r.loName + " to " + r.hiName + ", that is " + r.semis + " semitones" + (oct ? " (" + oct + " octave" + (oct > 1 ? "s" : "") + (rest ? " and " + rest : "") + ")" : "") + ". Your voice type is roughly " + VTYPE[r.type].en + "."
      : "Aapki aaram wali range " + r.loName + " se " + r.hiName + " tak hai, yaani " + r.semis + " semitone" + (oct ? " (" + oct + " octave" + (rest ? " aur " + rest : "") + ")" : "") + ". Aapki aawaaz andaazan " + VTYPE[r.type].hi + " hai.";
    if (prev && prev.semis != null) { const d = r.semis - prev.semis; if (d > 0) t += E ? " That is " + d + " more than last time!" : " Ye pichhli baar se " + d + " zyada hai!"; }
    t += E ? " Never force the top or bottom notes - range grows slowly with daily practice." : " Upar-neeche ke sur par kabhi zor mat lagao - range roz ke abhyaas se dheere badhti hai.";
    return t;
  }

  /* ---- rhythm: onsets vs beats ---- */
  function onsets(trk) {
    const fr = trk || []; if (fr.length < 3) return [];
    const thr = Math.max(0.01, pct(fr.map((p) => p.rms), 0.9) * 0.3), out = [];
    let quiet = 3, ref = 0, cnt = 0;
    for (let i = 0; i < fr.length; i++) {
      const on = fr[i].rms >= thr && fr[i].hz > 0;
      if (on && quiet >= 2) { out.push(fr[i].t); ref = fr[i].hz; cnt = 0; }
      else if (on && ref > 0) { // a new note without a gap (pitch jump held for 2 frames)
        if (Math.abs(cents(fr[i].hz, ref)) > 80) { cnt++; if (cnt >= 2) { out.push(fr[i - 1].t); ref = fr[i].hz; cnt = 0; } } else { cnt = 0; ref = ref * 0.8 + fr[i].hz * 0.2; }
      }
      quiet = on ? 0 : quiet + 1;
    }
    return out.filter((t, i) => i === 0 || t - out[i - 1] > 0.12);
  }
  /* plan: {beatSec, notes?} ; beats = times (s, from clip start) where a note should begin */
  function analyzeRhythm(trk, beats, plan, sa, latency) {
    const ons = onsets(trk), lat = latency || 0, iv = plan.beatSec || 0.75, used = {};
    const hits = beats.map((b, i) => {
      let best = -1, bd = 1e9; ons.forEach((o, k) => { if (used[k]) return; const d = Math.abs(o - lat - b); if (d < bd && d <= iv * 0.45) { bd = d; best = k; } });
      if (best < 0) return { i, b, miss: true };
      used[best] = 1; const o = ons[best], h = { i, b, o, off: Math.round((o - lat - b) * 1000) };
      if (plan.notes) { const sem = plan.notes[i % plan.notes.length], tgt = semiHz(sa, sem), st = windowStats(trk, o + 0.04, o + Math.min(0.35, iv * 0.8), tgt);
        h.semi = sem; h.name = sargName(sem); if (st) { h.cents = st.cents; h.noteOk = Math.abs(st.cents) <= 60; } else h.noteOk = false; }
      return h;
    });
    const got = hits.filter((h) => !h.miss), offs = got.map((h) => h.off);
    const meanOff = offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : 0, sd = Math.round(std(offs));
    const hitRate = got.length / Math.max(1, beats.length), notesOk = plan.notes ? got.filter((h) => h.noteOk).length / Math.max(1, got.length) : 1;
    const span = beats.length ? [beats[0] - iv * 0.5, beats[beats.length - 1] + iv * 0.6] : [0, 0];
    const extras = ons.filter((o, k) => !used[k] && o >= span[0] && o <= span[1]).length;
    const pass = hitRate >= 0.85 && Math.abs(meanOff) <= 120 && sd <= 90 && notesOk >= 0.8;
    const score = Math.round(clamp(hitRate * 50 + clamp(1 - Math.abs(meanOff) / 300, 0, 1) * 20 + clamp(1 - sd / 200, 0, 1) * 15 + notesOk * 15 - extras * 2, 0, 100));
    return { hits, meanOff, sd, hitRate: Math.round(hitRate * 100), notesOk: Math.round(notesOk * 100), extras, pass, score };
  }
  function feedbackRhythm(res, plan, sa, lang) {
    const E = lang === "english", out = { pass: res.pass, items: [], score: res.score };
    const demo = { rhythmDemo: true };
    const missed = res.hits.filter((h) => h.miss).map((h) => h.i + 1);
    if (missed.length) { const t = E ? "You missed beat " + missed.slice(0, 6).join(", ") + "." : "Beat " + missed.slice(0, 6).join(", ") + " chhoot gaye."; out.items.push({ text: t, steps: [{ say: t }, { say: E ? "Listen to the taal again and sing on every beat." : "Taal phir suno aur har beat par gaao." }, demo] }); }
    if (Math.abs(res.meanOff) > 120) {
      const early = res.meanOff < 0, t = E ? "You were " + (early ? "early" : "late") + " by about " + Math.abs(res.meanOff) + " milliseconds." : "Aap lagbhag " + Math.abs(res.meanOff) + " millisecond " + (early ? "jaldi" : "der se") + " gaa rahe the.";
      const how = early ? (E ? "Wait for the beat - let the tabla stroke come, then sing with it." : "Beat ka intezaar karo - tabla ki thaap aane do, usi ke saath gaao.") : (E ? "Get ready a little earlier: breathe before the beat so the note starts exactly on it." : "Thoda pehle taiyaar raho: beat se pehle saans lo taaki sur theek beat par shuru ho.");
      out.items.push({ text: t + " " + how, steps: [{ say: t }, { say: how }, demo] });
    }
    if (res.sd > 90) { const t = E ? "Your timing was uneven - sometimes early, sometimes late. Count the beats in your mind: 1, 2, 3, 4." : "Timing ek-si nahi thi - kabhi jaldi, kabhi der. Man mein ginti karo: 1, 2, 3, 4."; out.items.push({ text: t, steps: [{ say: t }, demo] }); }
    const wrong = res.hits.filter((h) => !h.miss && h.noteOk === false && h.cents != null).slice(0, 2);
    wrong.forEach((h) => { const t = (E ? "On beat " + (h.i + 1) + ", " + h.name + " was " : "Beat " + (h.i + 1) + " par " + h.name + " ") + amountText(h.cents, lang) + (E ? "." : " tha.");
      out.items.push({ text: t, steps: [{ say: t }, { say: pick(P.correct, lang) }, { seq: [{ hz: semiHz(sa, h.semi), dur: 1.2 }], label: h.name }] }); });
    if (res.extras > 2) { const t = E ? "There were extra sounds between beats. Sing only on the beats." : "Beats ke beech extra aawaaz thi. Sirf beat par gaao."; out.items.push({ text: t, steps: [{ say: t }] }); }
    out.summary = res.pass ? (E ? "Great rhythm! You were right on the taal." : "Shaandaar laya! Aap bilkul taal par the.") : (E ? "Good effort. Let's tighten the rhythm." : "Achhi koshish. Laya ko aur pakka karte hain.");
    out.items.forEach((it) => { if (!it.drill && !it.info) it.drill = null; });
    return out;
  }

  /* ---- song: stability + phrases (free), and comparison with a reference (DTW) ---- */
  function contour(trk, fps) {
    const step = 1 / (fps || 10), out = []; if (!trk || !trk.length) return out;
    const end = trk[trk.length - 1].t;
    for (let t = trk[0].t, i = 0; t < end; t += step) {
      const b = []; let n = 0; while (i < trk.length && trk[i].t < t + step) { n++; if (trk[i].hz > 0) b.push(trk[i].hz); i++; }
      if (n && b.length >= n * 0.5) out.push({ t: t, st: 69 + 12 * Math.log2(median(b) / 440) });
    }
    return out;
  }
  function songStats(trk) {
    const v = (trk || []).filter((p) => p.hz > 0); if (v.length < 20) return null;
    const st = v.map((p) => 69 + 12 * Math.log2(p.hz / 440));
    // "in tune %": note centres within +-30 cents of a note (singer's own tuning).
    // Pitch is averaged over ~0.16 s so healthy vibrato (5-7 Hz) is ignored but slow wobble is caught;
    // moments right around a note change are skipped.
    const n = st.length, cont = (i) => i > 0 && v[i].t - v[i - 1].t <= 0.05, skip = new Uint8Array(n);
    for (let i = 1; i < n; i++) if (cont(i) && Math.abs(st[i] - st[i - 1]) > 0.5) for (let k = Math.max(0, i - 4); k <= Math.min(n - 1, i + 4); k++) skip[k] = 1;
    const sm = st.map((_, i) => { let s0 = 0, c = 0; for (let k = i - 4; k <= i + 4; k++) { if (k < 0 || k >= n) continue; if (k !== i && Math.abs(v[k].t - v[i].t) > 0.1) continue; s0 += st[k]; c++; } return s0 / c; });
    // note segments: split at real note changes / gaps; centre = slow median inside the same note
    const seg = new Int32Array(n); let sid = 0;
    for (let i = 1; i < n; i++) { if (!cont(i) || Math.abs(st[i] - st[i - 1]) > 0.5) sid++; seg[i] = sid; }
    let stable = 0, inNotes = 0;
    for (let i = 0; i < n; i++) {
      if (skip[i]) continue;
      const w = []; for (let k = Math.max(0, i - 17); k <= Math.min(n - 1, i + 17); k++) if (seg[k] === seg[i] && !skip[k]) w.push(sm[k]);
      if (w.length < 8) continue;
      inNotes++; if (Math.abs(sm[i] - median(w)) <= 0.3) stable++;
    }
    // phrases = voiced runs separated by >= 0.35 s gaps
    const ph = []; let s0 = v[0].t, lastT = v[0].t;
    for (let i = 1; i < v.length; i++) { if (v[i].t - lastT >= 0.35) { ph.push(lastT - s0); s0 = v[i].t; } lastT = v[i].t; }
    ph.push(lastT - s0);
    const phr = ph.filter((x) => x >= 0.3);
    return { stability: inNotes ? Math.round(stable / inNotes * 100) : 0, phrases: phr.length, avgPhrase: Math.round((phr.reduce((a, b) => a + b, 0) / Math.max(1, phr.length)) * 10) / 10,
      longest: Math.round(Math.max.apply(null, phr.concat([0])) * 10) / 10, low: midiName(pct(v.map((p) => p.hz), 0.05)), high: midiName(pct(v.map((p) => p.hz), 0.95)) };
  }
  function feedbackSongFree(ss, m, lang) {
    const E = lang === "english", out = { items: [], summary: "" };
    if (!ss) { const t = E ? "I could not hear enough singing. Sing at least 10 seconds." : "Kaafi gaana sunai nahi diya. Kam se kam 10 second gaao."; out.items.push({ text: t, steps: [{ say: t }] }); out.score = 0; out.summary = t; out.pass = false; return out; }
    if (ss.stability < 60) { const t = E ? "Your held notes were moving (" + ss.stability + "% steady). On long notes, keep the pitch still with steady breath." : "Lambe suron par sur hil raha tha (" + ss.stability + "% steady). Lambe sur par saans ek-si rakhkar sur ko tikao.";
      out.items.push({ text: t, steps: [{ say: t }, { say: pick(P.steady, lang) }] }); }
    if (ss.avgPhrase < 1.8 && ss.phrases > 3) { const t = E ? "Your phrases were short (" + ss.avgPhrase + " s on average) - you broke lines to breathe. Take a full breath before each line." : "Aapke phrase chhote the (ausat " + ss.avgPhrase + " second) - saans ke liye line toot rahi thi. Har line se pehle poori saans bharo.";
      out.items.push({ text: t, steps: [{ say: t }, { say: pick(P.longer, lang) }] }); }
    if (m && m.volSteady < 0.45) { const t = E ? "The volume jumped a lot. Keep a more even volume and let the song's feeling shape it gently." : "Aawaaz kabhi bahut tez, kabhi bahut dheemi thi. Volume zyada ek-sa rakho, bhaav ke saath halka badlo."; out.items.push({ text: t, steps: [{ say: t }] }); }
    out.score = Math.round(clamp(ss.stability * 0.6 + Math.min(1, ss.avgPhrase / 3) * 25 + (m ? m.volSteady * 15 : 10), 0, 100));
    out.pass = !out.items.length;
    out.summary = (E ? "You sang from " + ss.low + " to " + ss.high + ". Notes were " + ss.stability + "% steady, longest phrase " + ss.longest + " seconds." : "Aapne " + ss.low + " se " + ss.high + " tak gaaya. Sur " + ss.stability + "% steady the, sabse lamba phrase " + ss.longest + " second.");
    return out;
  }
  function dtw(a, b, band) {
    const n = a.length, m = b.length, W = Math.max(band || 0, Math.abs(n - m) + 5), INF = 1e18;
    let prev = new Float64Array(m + 1).fill(INF), cur = new Float64Array(m + 1).fill(INF); prev[0] = 0;
    const from = []; // back-pointers per row (sparse within band)
    for (let i = 1; i <= n; i++) {
      cur.fill(INF); const jc = Math.round(i * m / n), j0 = Math.max(1, jc - W), j1 = Math.min(m, jc + W), row = new Uint8Array(j1 - j0 + 1);
      for (let j = j0; j <= j1; j++) {
        const c = Math.abs(a[i - 1] - b[j - 1]), pen = 0.4; let best = prev[j - 1], bp = 0; // pen: discourage stretching time
        if (prev[j] + pen < best) { best = prev[j] + pen; bp = 1; } if (cur[j - 1] + pen < best) { best = cur[j - 1] + pen; bp = 2; }
        cur[j] = c + best; row[j - j0] = bp;
      }
      from.push({ j0, row }); const t = prev; prev = cur; cur = t;
    }
    const path = []; let i = n, j = m;
    while (i > 0 && j > 0) { path.push([i - 1, j - 1]); const r = from[i - 1], bp = j - r.j0 >= 0 && j - r.j0 < r.row.length ? r.row[j - r.j0] : 0; if (bp === 0) { i--; j--; } else if (bp === 1) i--; else j--; }
    return path.reverse();
  }
  function compareSong(refTrk, userTrk) {
    const a = contour(refTrk), b = contour(userTrk); if (a.length < 10 || b.length < 10) return null;
    // key: try the likely transpositions and keep the one where the tune matches best
    const base = Math.round(median(b.map((x) => x.st)) - median(a.map((x) => x.st))), as = a.map((x) => x.st), band = Math.round(Math.max(a.length, b.length) * 0.2);
    const cands = [...new Set([0, base, base - 1, base + 1, base - 2, base + 2, 12, -12, base + 12, base - 12])];
    let bestRes = null;
    cands.forEach((k) => { const bs = b.map((x) => x.st - k), path = dtw(as, bs, band), diffs = path.map(([i, j]) => ({ i, j, d: bs[j] - as[i] }));
      const mt = diffs.filter((x) => Math.abs(x.d) <= 0.5).length / diffs.length;
      if (!bestRes || mt > bestRes.mt + 0.02 || (Math.abs(mt - bestRes.mt) <= 0.02 && Math.abs(k) < Math.abs(bestRes.key))) bestRes = { mt, key: k, diffs }; });
    const key = bestRes.key, diffs = bestRes.diffs;
    const match = Math.round(bestRes.mt * 100);
    const secs = []; let cur = null;
    diffs.forEach((x) => { const sg = x.d > 0.5 ? 1 : x.d < -0.5 ? -1 : 0;
      if (sg && cur && cur.sg === sg && a[x.i].t - cur.t1 < 0.25) { cur.t1 = a[x.i].t; cur.u1 = b[x.j].t; cur.ds.push(x.d); }
      else { if (cur) secs.push(cur); cur = sg ? { sg, t0: a[x.i].t, t1: a[x.i].t, u0: b[x.j].t, u1: b[x.j].t, ds: [x.d] } : null; } });
    if (cur) secs.push(cur);
    const sections = secs.filter((s) => s.t1 - s.t0 >= 0.4).map((s) => ({ dir: s.sg, t0: s.t0, t1: s.t1 + 0.1, u0: s.u0, u1: s.u1 + 0.1, cents: Math.round(median(s.ds) * 100), len: s.t1 - s.t0 }))
      .sort((x, y) => y.len - x.len).slice(0, 3).sort((x, y) => x.t0 - y.t0);
    return { match, key, sections, n: diffs.length };
  }
  function feedbackSong(res, lang) {
    const E = lang === "english", out = { items: [], score: res ? res.match : 0 };
    if (!res) { const t = E ? "Not enough singing to compare. Sing the same part as the reference." : "Tulna ke liye kaafi gaana nahi mila. Reference wala hissa hi gaao."; out.items.push({ text: t, steps: [{ say: t }] }); out.summary = t; out.pass = false; return out; }
    if (res.key) { const t = E ? "You sang in a different key (" + Math.abs(res.key) + " semitones " + (res.key > 0 ? "higher" : "lower") + "). That's fine - I compared the tune." : "Aapne alag scale mein gaaya (" + Math.abs(res.key) + " semitone " + (res.key > 0 ? "upar" : "neeche") + "). Theek hai - maine dhun ki tulna ki."; out.items.push({ text: t, info: true, steps: [{ say: t }] }); }
    res.sections.forEach((s) => {
      const t = (E ? "From " + mmss(s.t0) + " to " + mmss(s.t1) + " you were " : mmss(s.t0) + " se " + mmss(s.t1) + " tak aap ") + amountText(s.cents, lang) + (E ? "." : " the.");
      out.items.push({ text: t, steps: [{ say: t }, { say: E ? "The reference:" : "Reference:" }, { refClip: [s.t0, s.t1] }, { say: pick(P.youSang, lang) }, { clip: [s.u0, s.u1] },
        { say: pick(P.yourVoiceRight, lang) }, { clipFix: [s.u0, s.u1, { ratio: Math.pow(2, -s.cents / 1200) }] }] });
    });
    out.pass = res.match >= 75;
    out.summary = E ? "Your tune matched the reference " + res.match + "%." : "Aapki dhun reference se " + res.match + "% mili.";
    return out;
  }

  W.VG_TUTOR = {
    isSpeaking: () => !!V.pending || !!(W.speechSynthesis && W.speechSynthesis.speaking), isBusy: () => !!V.pending || live.length > 0 || !!(W.speechSynthesis && W.speechSynthesis.speaking),
    say, stopSpeech, playSeq, playTrack, playSamples, beep, stopTones, stopAll, setRate: (r) => { V.rate = r || 0.95; },
    setStyle: (s) => { OPT.style = s === "tone" ? "tone" : "human"; }, setVoice, voiceList, offlineVoices, bestVoice, rankVoice,
    semiHz, sargName, cents, foldCents, snapHz, median, psola, sliceClip, pitchShiftClip,
    analyzeNotes, analyzeGlide, feedbackNotes, feedbackGlide, feedbackHold, feedbackSpeech, demoSeq, improveText, scoreNotes, P, TECH, pick,
    noteTimes, fft, toneQuality, feedbackTone, analyzeDyn, feedbackDyn, rangeFrom, rangeText, onsets, analyzeRhythm, feedbackRhythm,
    contour, songStats, feedbackSongFree, dtw, compareSong, feedbackSong, mmss, ac: () => ac(), track, untrack,
  };
  if (typeof module !== "undefined") module.exports = W.VG_TUTOR;
})();
