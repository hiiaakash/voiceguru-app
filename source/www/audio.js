/* Voice Guru - offline audio analysis (pure DSP, no network, no model).
   Works on a Float32Array of mono samples. Testable in node or browser. */
(function (root) {
  "use strict";

  function rms(buf, start, end) {
    start = start || 0; end = end == null ? buf.length : end;
    let s = 0; for (let i = start; i < end; i++) s += buf[i] * buf[i];
    const n = Math.max(1, end - start);
    return Math.sqrt(s / n);
  }

  // Autocorrelation pitch detector (good enough for a single voice).
  // Returns {hz, clarity} or {hz:-1} when unvoiced/unclear.
  function detectPitch(buf, sampleRate, opt) {
    opt = opt || {};
    const minHz = opt.minHz || 70, maxHz = opt.maxHz || 450;
    const n = buf.length;
    // remove DC offset
    let mean = 0; for (let i = 0; i < n; i++) mean += buf[i]; mean /= n;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = buf[i] - mean;
    const r = rms(x);
    if (r < (opt.rmsGate || 0.008)) return { hz: -1, clarity: 0, rms: r };
    const maxLag = Math.min(n - 1, Math.floor(sampleRate / minHz));
    const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
    // normalized autocorrelation
    let best = -1, bestVal = 0, energy0 = 0;
    for (let i = 0; i < n; i++) energy0 += x[i] * x[i];
    if (energy0 === 0) return { hz: -1, clarity: 0, rms: r };
    let prev = 0, rising = false;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0, e = 0;
      for (let i = 0; i + lag < n; i++) { sum += x[i] * x[i + lag]; e += x[i + lag] * x[i + lag]; }
      const norm = sum / (Math.sqrt(energy0 * e) + 1e-9);
      // wait for the autocorr to dip then look for the first strong peak
      if (!rising && norm < prev) rising = true;
      if (rising && norm > bestVal) { bestVal = norm; best = lag; }
      prev = norm;
    }
    if (best < 0 || bestVal < (opt.clarityGate || 0.5)) return { hz: -1, clarity: bestVal, rms: r };
    // parabolic interpolation around best lag for sub-sample accuracy
    const y = (L) => {
      let sum = 0, e = 0;
      for (let i = 0; i + L < n; i++) { sum += x[i] * x[i + L]; e += x[i + L] * x[i + L]; }
      return sum / (Math.sqrt(energy0 * e) + 1e-9);
    };
    const y0 = y(best - 1), y1 = bestVal, y2 = y(best + 1);
    const denom = (y0 - 2 * y1 + y2);
    const shift = denom ? 0.5 * (y0 - y2) / denom : 0;
    const lag = best + Math.max(-1, Math.min(1, shift));
    const hz = sampleRate / lag;
    if (hz < minHz || hz > maxHz) return { hz: -1, clarity: bestVal, rms: r };
    return { hz: hz, clarity: bestVal, rms: r };
  }

  const hzToSemitone = (hz) => 69 + 12 * Math.log2(hz / 440);

  // Frame the clip and compute speaking/voice metrics.
  /* Box-filter + decimate to ~11 kHz: pitch (70-450 Hz) is kept, analysis becomes ~16x faster on phones. */
  function decimate(buf, sampleRate) {
    const f = Math.floor(sampleRate / 11025);
    if (f < 2) return { buf: buf, rate: sampleRate };
    const n = Math.floor(buf.length / f), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; const o = i * f; for (let k = 0; k < f; k++) s += buf[o + k]; out[i] = s / f; }
    return { buf: out, rate: sampleRate / f };
  }

  function analyzeClip(buf, sampleRate, opt) {
    opt = opt || {};
    if (!opt.noDecimate) { const d = decimate(buf, sampleRate); buf = d.buf; sampleRate = d.rate; }
    const frame = Math.round((opt.frameMs || 40) / 1000 * sampleRate);
    const hop = Math.round((opt.hopMs || 20) / 1000 * sampleRate);
    const frames = [];
    for (let start = 0; start + frame <= buf.length; start += hop) {
      const seg = buf.subarray(start, start + frame);
      const p = detectPitch(seg, sampleRate, opt);
      frames.push({ t: start / sampleRate, rms: rms(seg), hz: p.hz, clarity: p.clarity });
    }
    if (!frames.length) return { empty: true, durationSec: buf.length / sampleRate };
    const rmsVals = frames.map((f) => f.rms);
    const maxRms = Math.max.apply(null, rmsVals) || 1e-6;
    const speechGate = Math.max(opt.speechGate || 0.012, maxRms * 0.18);
    frames.forEach((f) => { f.speech = f.rms >= speechGate; });

    const voiced = frames.filter((f) => f.hz > 0 && f.speech);
    const pitches = voiced.map((f) => f.hz).sort((a, b) => a - b);
    const pct = (p) => pitches.length ? pitches[Math.min(pitches.length - 1, Math.floor(p * pitches.length))] : 0;
    const pMean = pitches.reduce((a, b) => a + b, 0) / (pitches.length || 1);
    const pLo = pct(0.1), pHi = pct(0.9);
    const semitoneRange = pLo > 0 && pHi > 0 ? hzToSemitone(pHi) - hzToSemitone(pLo) : 0;
    let pStd = 0; voiced.forEach((f) => { pStd += (f.hz - pMean) * (f.hz - pMean); });
    pStd = Math.sqrt(pStd / (voiced.length || 1));

    const speechFrames = frames.filter((f) => f.speech);
    const rMean = speechFrames.reduce((a, f) => a + f.rms, 0) / (speechFrames.length || 1);
    let rStd = 0; speechFrames.forEach((f) => { rStd += (f.rms - rMean) * (f.rms - rMean); });
    rStd = Math.sqrt(rStd / (speechFrames.length || 1));
    const volSteady = rMean > 0 ? Math.max(0, 1 - rStd / rMean) : 0; // 1 = very steady

    // pauses: runs of non-speech between first and last speech frame
    let first = frames.findIndex((f) => f.speech);
    let last = -1; for (let i = frames.length - 1; i >= 0; i--) if (frames[i].speech) { last = i; break; }
    const pauses = [];
    if (first >= 0) {
      let run = 0;
      for (let i = first; i <= last; i++) {
        if (!frames[i].speech) run++;
        else { if (run > 0) { const sec = run * hop / sampleRate; if (sec >= 0.25) pauses.push(sec); } run = 0; }
      }
    }
    const spokenSec = first >= 0 ? (last - first + 1) * hop / sampleRate : 0;
    const speakingRatio = spokenSec > 0 ? speechFrames.length * hop / sampleRate / spokenSec : 0;

    // longest continuous voiced run = sustain (for held-note exercises)
    let sustain = 0, cur = 0, sumTrem = 0, tremN = 0, lastHz = 0;
    voicedRunScan(frames, sampleRate, hop, (len, tremor) => {
      if (len > sustain) sustain = len; if (tremor != null) { sumTrem += tremor; tremN++; }
    });

    return {
      durationSec: buf.length / sampleRate,
      spokenSec: spokenSec,
      pitchMean: round(pMean), pitchLo: round(pLo), pitchHi: round(pHi),
      pitchStd: round(pStd), semitoneRange: round(semitoneRange, 1),
      monotone: semitoneRange > 0 && semitoneRange < 2.5,
      volMean: round(rMean, 4), volSteady: round(volSteady, 2),
      pauses: pauses.length, pauseSec: round(pauses.reduce((a, b) => a + b, 0), 2),
      speakingRatio: round(speakingRatio, 2),
      sustainSec: round(sustain, 2),
      tremor: tremN ? round(sumTrem / tremN, 2) : 0,
      voicedRatio: round(voiced.length / frames.length, 2),
      track: frames.map((f) => ({ t: round(f.t, 3), hz: f.hz > 0 ? round(f.hz, 1) : 0, rms: round(f.rms, 4) })),
    };
  }

  function voicedRunScan(frames, sampleRate, hop, cb) {
    let runHz = [];
    const flush = () => {
      if (runHz.length >= 3) {
        const len = runHz.length * hop / sampleRate;
        const m = runHz.reduce((a, b) => a + b, 0) / runHz.length;
        let sd = 0; runHz.forEach((h) => sd += (h - m) * (h - m)); sd = Math.sqrt(sd / runHz.length);
        cb(len, m > 0 ? sd / m : null);
      }
      runHz = [];
    };
    frames.forEach((f) => { if (f.hz > 0 && f.speech) runHz.push(f.hz); else flush(); });
    flush();
  }

  function round(x, d) { const m = Math.pow(10, d || 0); return Math.round(x * m) / m; }

  // Build Float32Array from a WAV ArrayBuffer (mono mix). For testing + file input.
  function decodeWav(arrayBuffer) {
    const dv = new DataView(arrayBuffer);
    if (dv.getUint32(0, false) !== 0x52494646) throw new Error("not WAV");
    let off = 12, fmt = null, dataOff = 0, dataLen = 0;
    while (off + 8 <= dv.byteLength) {
      const id = dv.getUint32(off, false), sz = dv.getUint32(off + 4, true);
      if (id === 0x666d7420) fmt = { ch: dv.getUint16(off + 10, true), rate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
      else if (id === 0x64617461) { dataOff = off + 8; dataLen = sz; }
      off += 8 + sz + (sz & 1);
    }
    if (!fmt || !dataOff) throw new Error("bad WAV");
    const n = Math.floor(dataLen / (fmt.bits / 8) / fmt.ch);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < fmt.ch; c++) {
        const p = dataOff + (i * fmt.ch + c) * (fmt.bits / 8);
        if (fmt.bits === 16) s += dv.getInt16(p, true) / 32768;
        else if (fmt.bits === 8) s += (dv.getUint8(p) - 128) / 128;
        else if (fmt.bits === 32) s += dv.getFloat32(p, true);
      }
      out[i] = s / fmt.ch;
    }
    return { samples: out, sampleRate: fmt.rate };
  }

  root.VG_AUDIO = { rms: rms, detectPitch: detectPitch, analyzeClip: analyzeClip, hzToSemitone: hzToSemitone, decodeWav: decodeWav, decimate: decimate };
})(typeof window !== "undefined" ? window : globalThis);
