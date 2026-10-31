/* Voice Guru - offline instruments, all synthesised (no audio files):
   - Tanpura drone (Pa, Sa, Sa, low Sa) tuned to the singer's own Sa, with jawari shimmer.
   - Tabla theka for Keherwa, Dadra, Rupak, Teentaal (bols: Dha, Dhin, Na, Tin, Ta, Ti, Ge, Ke).
   - Metronome click (above the voice pitch range, so it does not disturb pitch detection). */
(function () {
  "use strict";
  const W = window;
  const TUT = () => W.VG_TUTOR;

  const TAALS = {
    keherwa: { beats: 8, bols: ["Dha", "Ge", "Na", "Ti", "Na", "Ke", "Dhi", "Na"], vibhag: [4, 4], taali: [0], khali: [4], name: { en: "Keherwa (8 beats)", hi: "Keherwa (8 matra)" } },
    dadra: { beats: 6, bols: ["Dha", "Dhi", "Na", "Dha", "Ti", "Na"], vibhag: [3, 3], taali: [0], khali: [3], name: { en: "Dadra (6 beats)", hi: "Dadra (6 matra)" } },
    rupak: { beats: 7, bols: ["Tin", "Tin", "Na", "Dhi", "Na", "Dhi", "Na"], vibhag: [3, 2, 2], taali: [3, 5], khali: [0], name: { en: "Rupak (7 beats)", hi: "Rupak (7 matra)" } },
    teentaal: { beats: 16, bols: ["Dha", "Dhin", "Dhin", "Dha", "Dha", "Dhin", "Dhin", "Dha", "Dha", "Tin", "Tin", "Ta", "Ta", "Dhin", "Dhin", "Dha"], vibhag: [4, 4, 4, 4], taali: [0, 4, 12], khali: [8], name: { en: "Teentaal (16 beats)", hi: "Teentaal (16 matra)" } },
  };

  let ctx = null, master = null, NB = null;
  function C() {
    const c = TUT() && TUT().ac(); if (!c) return null;
    if (c !== ctx) { ctx = c; master = c.createGain(); master.gain.value = 0.9; master.connect(c.destination); NB = null; }
    return c;
  }
  function noise() {
    if (NB) return NB; const c = ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; NB = b; return b;
  }
  /* ---------------- tabla ---------------- */
  const taalNodes = new Set();
  function keep(n, t0, t1) { taalNodes.add(n); n.onended = () => taalNodes.delete(n); try { n.start(t0); n.stop(t1); } catch (e) { taalNodes.delete(n); } }
  function env(t, peak, dec) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dec); return g; }
  function dayan(out, t, f0, dec, vel, bright) {
    const g = env(t, 0.45 * vel, dec); g.connect(out);
    [[1, 1], [2, 0.55], [3, 0.32], [4.1, 0.16 * (bright || 1)]].forEach(([r, a]) => { const o = ctx.createOscillator(); o.frequency.value = f0 * r; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(g); keep(o, t, t + dec + 0.05); });
    const n = ctx.createBufferSource(); n.buffer = noise(); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 1;
    const ng = env(t, 0.22 * vel, 0.02); n.connect(bp); bp.connect(ng); ng.connect(out); keep(n, t, t + 0.04);
  }
  function bayan(out, t, vel) {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(104, t + 0.09); o.frequency.exponentialRampToValueAtTime(96, t + 0.4);
    const g = env(t, 0.7 * vel, 0.5); o.connect(g); g.connect(out); keep(o, t, t + 0.55);
    const n = ctx.createBufferSource(); n.buffer = noise(); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    const ng = env(t, 0.35 * vel, 0.04); n.connect(lp); lp.connect(ng); ng.connect(out); keep(n, t, t + 0.06);
  }
  function hit(out, t, f, q, peak, dec) { const n = ctx.createBufferSource(); n.buffer = noise(); const bp = ctx.createBiquadFilter(); bp.type = f > 1000 ? "bandpass" : "lowpass"; bp.frequency.value = f; bp.Q.value = q;
    const g = env(t, peak, dec); n.connect(bp); bp.connect(g); g.connect(out); keep(n, t, t + dec + 0.02); }
  function bol(name, t, f0, vel, out) {
    vel = vel || 1; out = out || master;
    switch (name) {
      case "Dha": bayan(out, t, vel); dayan(out, t, f0, 0.35, vel); break;
      case "Dhin": case "Dhi": bayan(out, t, vel * 0.9); dayan(out, t, f0, 0.75, vel * 0.8, 0.8); break;
      case "Na": dayan(out, t, f0, 0.3, vel, 1.2); break;
      case "Ta": dayan(out, t, f0, 0.22, vel, 1.4); break;
      case "Tin": dayan(out, t, f0, 0.6, vel * 0.6, 0.7); break;
      case "Ge": case "Ghe": bayan(out, t, vel); break;
      case "Ti": case "Te": hit(out, t, 3500, 2.5, 0.25 * vel, 0.03); break;
      case "Ka": case "Ke": hit(out, t, 700, 0.7, 0.35 * vel, 0.05); break;
      default: dayan(out, t, f0, 0.3, vel);
    }
  }
  function click(t, accent, out) { const o = ctx.createOscillator(); o.frequency.value = accent ? 2400 : 1700; const g = env(t, accent ? 0.35 : 0.22, 0.03); o.connect(g); g.connect(out || master); keep(o, t, t + 0.05); }
  /* schedule a theka. opt: {at (AudioContext time), sa, mode: "tabla"|"click"|"countin", vol}
     returns timing info (beat i plays at start + i*beatSec) */
  function playTheka(taalId, bpm, cycles, opt) {
    opt = opt || {}; const c = C(); const tl = TAALS[taalId]; if (!c || !tl) return null;
    const beat = 60 / bpm, start = Math.max(c.currentTime + 0.08, opt.at || 0), n = tl.beats * cycles;
    const sa = opt.sa || 130.81, f0 = sa < 200 ? sa * 2 : sa;
    const out = c.createGain(); out.gain.value = opt.vol == null ? 0.9 : opt.vol; out.connect(master);
    for (let i = 0; i < n; i++) {
      const t = start + i * beat, b = i % tl.beats, sam = b === 0, cyc = Math.floor(i / tl.beats);
      const tabla = opt.mode === "tabla" || (opt.mode === "countin" && cyc === 0) || !opt.mode;
      if (tabla) bol(tl.bols[b], t, f0, sam ? 1 : (tl.khali.includes(b) ? 0.75 : 0.85), out); else click(t, sam, out);
    }
    return { start, beatSec: beat, n, beats: tl.beats, end: start + n * beat, perfStart: performance.now() + (start - c.currentTime) * 1000 };
  }
  function stopTaal() { taalNodes.forEach((n) => { try { n.stop(); } catch (e) { } }); taalNodes.clear(); }

  /* ---------------- tanpura ---------------- */
  const DR = { on: false, timer: 0, next: 0, idx: 0, vol: 0.5, sa: 130.81, gain: null, ducked: false, nodes: new Set() };
  let TW = null;
  function tanWave() {
    if (TW) return TW; const n = 40, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (k % 2 ? 1 : 0.8) / Math.pow(k, 0.85); TW = ctx.createPeriodicWave(re, im); return TW;
  }
  function pluck(t, hz, dur) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + dur); g.connect(DR.gain);
    const mk = (det, amp) => { const o = ctx.createOscillator(); o.setPeriodicWave(tanWave()); o.frequency.value = hz; o.detune.value = det; const a = ctx.createGain(); a.gain.value = amp; o.connect(a); DR.nodes.add(o); o.onended = () => DR.nodes.delete(o); o.start(t); o.stop(t + dur + 0.1); return a; };
    const s1 = mk(0, 0.6), s2 = mk(2.5, 0.35);
    const dry = ctx.createBiquadFilter(); dry.type = "lowpass"; dry.frequency.value = 2200; dry.Q.value = 0.5;
    const jaw = ctx.createBiquadFilter(); jaw.type = "bandpass"; jaw.Q.value = 2.2; jaw.frequency.setValueAtTime(2600, t); jaw.frequency.exponentialRampToValueAtTime(800, t + dur * 0.9);
    const jg = ctx.createGain(); jg.gain.value = 0.55;
    [s1, s2].forEach((s) => { s.connect(dry); s.connect(jaw); }); dry.connect(g); jaw.connect(jg); jg.connect(g);
  }
  const PAT = [[-5, 1.15], [0, 1.15], [0, 1.15], [-12, 1.5]]; // Pa (low), Sa, Sa, Sa (low)
  function sched() { if (!DR.on || !ctx) return; while (DR.next < ctx.currentTime + 1.2) { const p = PAT[DR.idx % PAT.length]; pluck(DR.next, DR.sa * Math.pow(2, p[0] / 12), 5); DR.next += p[1]; DR.idx++; } }
  function level() { return DR.ducked ? DR.vol * 0.12 : DR.vol * 0.55; }
  function droneStart(sa, vol) {
    const c = C(); if (!c) return false;
    droneStop(true);
    DR.on = true; DR.sa = sa || DR.sa; if (vol != null) DR.vol = vol; DR.ducked = false;
    DR.gain = c.createGain(); DR.gain.gain.setValueAtTime(0, c.currentTime); DR.gain.gain.linearRampToValueAtTime(level(), c.currentTime + 1); DR.gain.connect(master);
    DR.next = c.currentTime + 0.1; DR.idx = 0; sched(); DR.timer = setInterval(sched, 150);
    return true;
  }
  function droneStop(now) {
    clearInterval(DR.timer); DR.timer = 0; const g = DR.gain, nodes = Array.from(DR.nodes); DR.on = false; DR.gain = null;
    if (g && ctx) { try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + (now ? 0.05 : 0.5)); } catch (e) { } }
    setTimeout(() => { nodes.forEach((o) => { try { o.stop(); } catch (e) { } }); DR.nodes.clear(); try { g && g.disconnect(); } catch (e) { } }, now ? 80 : 600);
  }
  function setDroneVol(v) { DR.vol = v; if (DR.gain && ctx) DR.gain.gain.linearRampToValueAtTime(level(), ctx.currentTime + 0.2); }
  function duck(on) { DR.ducked = !!on; if (DR.gain && ctx) { DR.gain.gain.cancelScheduledValues(ctx.currentTime); DR.gain.gain.setValueAtTime(DR.gain.gain.value, ctx.currentTime); DR.gain.gain.linearRampToValueAtTime(level(), ctx.currentTime + 0.25); } }
  function setSa(sa) { DR.sa = sa; }

  W.VG_MUSIC = { TAALS, playTheka, stopTaal, click: (t, a) => { if (C()) click(t, a); }, bol: (n, t, f0) => { if (C()) bol(n, t, f0); },
    droneStart, droneStop, droneOn: () => DR.on, setDroneVol, duck, setSa, now: () => (C() ? ctx.currentTime : 0) };
})();
