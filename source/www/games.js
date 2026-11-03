/* Voice Guru - 35 voice-controlled games, 10 levels each.
   13 mechanics (fly, lanes, runner, catcher, fill, steady, climber, bullseye, trace, react, simon, rhythm, shooter)
   x themes. Each level has a clear goal; difficulty rises gently level by level (never inside a level).
   The engine (app.js) passes input every frame:
     inp = { pn: 0..1|null (pitch position in the player's own range), semis (vs Sa), voice, loud, onset, lev: 0..1 volume }
   Mechanics: params(L) -> P ; init(G) ; update(G, inp, dt) ; draw(G, ctx, col) ; auto(G) -> ideal inp (tests/demo).
   G.score counts toward G.goal; G.lives (3); hurt(G) costs a life. Text is English (en) / Roman Hinglish (hi). */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : globalThis;

  /* ---------- shared helpers (kept API: noteOf, pitchNorm, centsOff) ---------- */
  function pitchNorm(hz, lo, hi) { if (!(hz > 0)) return null; return Math.max(0, Math.min(1, (hz - lo) / (hi - lo))); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const SARGAM = ["Sa", "re", "Re", "ga", "Ga", "Ma", "ma", "Pa", "dha", "Dha", "ni", "Ni"];
  function noteOf(hz) {
    if (!(hz > 0)) return null;
    const exact = 69 + 12 * Math.log2(hz / 440), midi = Math.round(exact), pc = ((midi % 12) + 12) % 12;
    return { midi, cents: Math.round((exact - midi) * 100), name: NOTES[pc] + (Math.floor(midi / 12) - 1), sargam: SARGAM[pc] };
  }
  function centsOff(hz, targetHz) { return 1200 * Math.log2(hz / targetHz); }
  const SNAME = ["Sa", "Re(k)", "Re", "Ga(k)", "Ga", "Ma", "Ma(t)", "Pa", "Dha(k)", "Dha", "Ni(k)", "Ni"];
  const sarg = (s) => { const k = ((s % 12) + 12) % 12, o = Math.floor(s / 12); return SNAME[k] + (o > 0 ? "'" : o < 0 ? "," : ""); };
  // difficulty 0..1 for level 1..10 (level 1 is extra gentle)
  const E = (L) => { const e = (clamp(L, 1, 10) - 1) / 9; return e * e * 0.35 + e * 0.65; };
  let RNG = Math.random;
  const rnd = (a, b) => a + RNG() * (b - a);
  const pick = (arr) => arr[Math.floor(RNG() * arr.length) % arr.length];
  function hurt(G) { if (G.inv > 0) return false; G.lives--; G.lost++; G.inv = 1.2; G.flash = 0.45; return true; }

  /* ---------- drawing helpers ---------- */
  function bg(G, ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, G.H); g.addColorStop(0, G.th.bg[0]); g.addColorStop(1, G.th.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
    if (G.flash > 0) { ctx.fillStyle = "rgba(255,60,60," + (G.flash * 0.6) + ")"; ctx.fillRect(0, 0, G.W, G.H); }
  }
  function emo(ctx, e, x, y, size, alpha) { ctx.save(); if (alpha != null) ctx.globalAlpha = alpha; ctx.font = (size || 28) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e, x, y); ctx.restore(); }
  function txt(ctx, s, x, y, size, color, bold) { ctx.font = (bold ? "bold " : "") + (size || 14) + "px sans-serif"; ctx.fillStyle = color || "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
  function pitchHint(G, ctx) { // little up/down guide on the right
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "11px sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText("↑ " + G.lab.hi, G.W - 6, 34); ctx.fillText("↓ " + G.lab.lo, G.W - 6, G.H - 14);
  }
  const playerE = (G) => (G.th.useChar && G.char ? G.char : G.th.player);

  /* =================== MECHANICS =================== */
  const M = {};

  /* 1. FLY: pitch = height; pass through gaps */
  M.fly = { ctrl: "pitch",
    params: (L) => { const e = E(L); return { speed: lerp(52, 118, e), gap: lerp(205, 118, e), space: lerp(250, 170, e), goal: Math.round(lerp(5, 14, e)) }; },
    init(G) { G.y = G.H / 2; G.obs = []; G.next = 120; G.px = 70; },
    update(G, inp, dt) {
      const P = G.P;
      if (inp.pn != null) { const ty = G.H - 50 - inp.pn * (G.H - 100); G.y += (ty - G.y) * Math.min(1, dt * 6); } else G.y = Math.min(G.H - 26, G.y + 38 * dt);
      G.next -= P.speed * dt;
      if (G.next <= 0) { const m = 48 + P.gap / 2; G.obs.push({ x: G.W + 30, c: rnd(m, G.H - m) }); G.next = P.space; }
      for (const o of G.obs) {
        o.x -= P.speed * dt;
        if (!o.hit && Math.abs(o.x - G.px) < 24 && Math.abs(G.y - o.c) > P.gap / 2 - 13) { o.hit = true; hurt(G); }
        if (!o.passed && o.x < G.px - 26) { o.passed = true; if (!o.hit) G.score++; }
      }
      G.obs = G.obs.filter((o) => o.x > -40);
    },
    draw(G, ctx) {
      bg(G, ctx); const P = G.P;
      for (const o of G.obs) {
        const top = o.c - P.gap / 2, bot = o.c + P.gap / 2;
        if (G.th.wall) { ctx.fillStyle = G.th.wall; ctx.fillRect(o.x - 18, 0, 36, top); ctx.fillRect(o.x - 18, bot, 36, G.H - bot);
          ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(o.x - 22, top - 12, 44, 12); ctx.fillRect(o.x - 22, bot, 44, 12); }
        else { for (let y = top - 16; y > -10; y -= 30) emo(ctx, G.th.obs, o.x, y, 26); for (let y = bot + 16; y < G.H + 10; y += 30) emo(ctx, G.th.obs, o.x, y, 26); }
      }
      emo(ctx, playerE(G), G.px, G.y, 34, G.inv > 0 && Math.floor(G.inv * 10) % 2 ? 0.35 : 1); pitchHint(G, ctx);
    },
    auto(G) { const o = G.obs.find((q) => q.x > G.px - 20); const c = o ? o.c : G.H / 2; return { pn: clamp((G.H - 50 - c) / (G.H - 100), 0, 1), voice: true }; },
  };

  /* 2. LANES: pitch picks one of 3 lanes (low / middle / high) */
  M.lanes = { ctrl: "pitch",
    params: (L) => { const e = E(L); return { speed: lerp(60, 135, e), every: lerp(2.5, 1.15, e), dbl: L >= 4 ? lerp(0.1, 0.45, e) : 0, goal: Math.round(lerp(6, 16, e)) }; },
    init(G) { G.lane = 1; G.lc = 0; G.obs = []; G.tm = 1.6; G.px = 62; },
    rowY: (G, i) => G.H * (0.80 - i * 0.30),
    update(G, inp, dt) {
      const P = G.P;
      if (inp.pn != null) { const t = inp.pn < 0.34 ? 0 : inp.pn > 0.66 ? 2 : 1; if (t !== G.lane) { G.lc += dt; if (G.lc > 0.12) { G.lane = t; G.lc = 0; } } else G.lc = 0; }
      G.tm -= dt;
      if (G.tm <= 0) { const a = RNG() < 0.5 ? G.lane : Math.floor(RNG() * 3), ls = [a]; if (RNG() < P.dbl) ls.push((a + 1 + Math.floor(RNG() * 2)) % 3); G.obs.push({ x: G.W + 24, ls }); G.tm = P.every; }
      for (const o of G.obs) {
        o.x -= P.speed * dt;
        if (!o.hit && Math.abs(o.x - G.px) < 22 && o.ls.includes(G.lane)) { o.hit = true; hurt(G); }
        if (!o.passed && o.x < G.px - 24) { o.passed = true; if (!o.hit) G.score++; }
      }
      G.obs = G.obs.filter((o) => o.x > -30);
    },
    draw(G, ctx) {
      bg(G, ctx);
      for (let i = 0; i < 3; i++) { const y = M.lanes.rowY(G, i); ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(0, y + 30); ctx.lineTo(G.W, y + 30); ctx.stroke(); ctx.setLineDash([]); }
      txt(ctx, G.lab.hi, 24, M.lanes.rowY(G, 2) - 30, 10, "rgba(255,255,255,.6)"); txt(ctx, G.lab.lo, 24, M.lanes.rowY(G, 0) - 30, 10, "rgba(255,255,255,.6)");
      for (const o of G.obs) o.ls.forEach((l) => emo(ctx, G.th.obs, o.x, M.lanes.rowY(G, l), 30));
      emo(ctx, playerE(G), G.px, M.lanes.rowY(G, G.lane), 34, G.inv > 0 && Math.floor(G.inv * 10) % 2 ? 0.35 : 1);
    },
    auto(G) { const o = G.obs.filter((q) => q.x > G.px - 20).sort((a, b) => a.x - b.x)[0]; let l = G.lane; if (o && o.ls.includes(l)) l = [0, 1, 2].find((k) => !o.ls.includes(k)); return { pn: [0.15, 0.5, 0.85][l], voice: true }; },
  };

  /* 3. RUNNER: a short loud "Hup!" jumps over obstacles */
  M.runner = { ctrl: "voice",
    params: (L) => { const e = E(L); return { speed: lerp(70, 145, e), every: lerp(2.9, 1.45, e), tall: L >= 6 ? 0.3 : 0, goal: Math.round(lerp(5, 15, e)) }; },
    init(G) { G.py = 0; G.vy = 0; G.obs = []; G.tm = 2; G.px = 64; G.ground = G.H - 70; },
    update(G, inp, dt) {
      const P = G.P;
      if (inp.onset && G.py <= 0) G.vy = 340;
      G.vy -= 700 * dt; G.py += G.vy * dt; if (G.py < 0) { G.py = 0; G.vy = 0; } // ~1 s in the air: a comfortable jump window
      G.tm -= dt; if (G.tm <= 0) { G.obs.push({ x: G.W + 20, h: RNG() < P.tall ? 44 : 30 }); G.tm = Math.max(1.3, P.every * rnd(0.95, 1.25)); } // always time to land and jump again
      for (const o of G.obs) {
        o.x -= P.speed * dt;
        if (!o.hit && Math.abs(o.x - G.px) < 14 && G.py < o.h - 6) { o.hit = true; hurt(G); }
        if (!o.passed && o.x < G.px - 16) { o.passed = true; if (!o.hit) G.score++; }
      }
      G.obs = G.obs.filter((o) => o.x > -30);
    },
    draw(G, ctx) {
      bg(G, ctx); ctx.fillStyle = G.th.ground || "rgba(0,0,0,.25)"; ctx.fillRect(0, G.ground + 18, G.W, G.H - G.ground);
      for (const o of G.obs) emo(ctx, G.th.obs, o.x, G.ground + 18 - o.h / 2 - 2, o.h > 35 ? 40 : 30);
      emo(ctx, playerE(G), G.px, G.ground - G.py, 36, G.inv > 0 && Math.floor(G.inv * 10) % 2 ? 0.35 : 1);
      txt(ctx, G.lab.jump, G.W / 2, 30, 12, "rgba(255,255,255,.7)");
    },
    auto(G) { const o = G.obs.filter((q) => q.x > G.px + 14).sort((a, b) => a.x - b.x)[0]; const dx = o ? o.x - G.px : 1e9; const go = o && G.py <= 0 && dx <= 14 + G.P.speed * 0.2; return { onset: !!go, voice: !!go, pn: null }; },
  };

  /* 4. CATCHER: pitch moves the basket left (low) / right (high); catch good, avoid bad (or dodge everything) */
  M.catcher = { ctrl: "pitch",
    params: (L, v) => { const e = E(L); return v === "dodge" ? { fall: lerp(55, 125, e), every: lerp(1.8, 1.0, e), bad: 1, goal: Math.round(lerp(8, 18, e)) }
      : { fall: lerp(58, 150, e), every: lerp(1.7, 0.75, e), bad: L >= 3 ? lerp(0.12, 0.35, e) : 0, goal: Math.round(lerp(6, 16, e)) }; },
    init(G) { G.x = G.W / 2; G.items = []; G.tm = 1; },
    update(G, inp, dt) {
      const P = G.P;
      if (inp.pn != null) { const tx = 30 + inp.pn * (G.W - 60); G.x += (tx - G.x) * Math.min(1, dt * 7); } else G.x = Math.max(30, G.x - 45 * dt); // silence: drifts to the left edge
      G.tm -= dt; if (G.tm <= 0) { const aim = G.v === "dodge" && RNG() < 0.5; G.items.push({ x: aim ? clamp(G.x + rnd(-15, 15), 30, G.W - 30) : rnd(30, G.W - 30), y: -20, bad: RNG() < P.bad, e: pick(G.th.items) }); G.tm = P.every; }
      for (const it of G.items) {
        it.y += P.fall * dt;
        if (!it.done && it.y > G.H - 70 && it.y < G.H - 40 && Math.abs(it.x - G.x) < (G.v === "dodge" ? 26 : 34)) { it.done = true; if (it.bad) hurt(G); else G.score++; }
        if (!it.done && it.y > G.H - 20) { it.done = true; if (G.v === "dodge") G.score++; else if (!it.bad) { G.miss = (G.miss || 0) + 1; if (G.miss >= 3) { hurt(G); G.miss = 0; } } }
      }
      G.items = G.items.filter((it) => !it.done && it.y < G.H + 20);
    },
    draw(G, ctx) {
      bg(G, ctx);
      for (const it of G.items) emo(ctx, it.bad ? G.th.bad : it.e, it.x, it.y, 28);
      emo(ctx, playerE(G), G.x, G.H - 55, 40, G.inv > 0 && Math.floor(G.inv * 10) % 2 ? 0.35 : 1);
      txt(ctx, "← " + G.lab.lo, 40, G.H - 14, 10, "rgba(255,255,255,.65)"); txt(ctx, G.lab.hi + " →", G.W - 40, G.H - 14, 10, "rgba(255,255,255,.65)");
    },
    auto(G) {
      const near = G.items.filter((it) => !it.done && it.y < G.H - 45).sort((a, b) => b.y - a.y);
      let tx = G.x;
      if (G.v === "dodge") { let best = G.x, bc = 1e9; for (let x = 30; x <= G.W - 30; x += 10) { let c = Math.abs(x - G.x) * 0.002; near.forEach((it) => { if (it.y > G.H - 300) c += Math.exp(-Math.pow((x - it.x) / 45, 2)) * (it.y / G.H); }); if (c < bc) { bc = c; best = x; } } tx = best; }
      else { const good = near.find((it) => !it.bad); if (good) tx = good.x; const bad = near.find((it) => it.bad && it.y > G.H - 140); if (bad && Math.abs(bad.x - tx) < 40) tx = bad.x > G.W / 2 ? bad.x - 80 : bad.x + 80; }
      return { pn: clamp((tx - 30) / (G.W - 60), 0, 1), voice: true };
    },
  };

  /* 5. FILL: voice volume fills (balloon / bubble / glass) up to the band; stop inside the band to win */
  M.fill = { ctrl: "volume",
    params: (L) => { const e = E(L); return { rate: lerp(0.30, 0.62, e), band: lerp(0.22, 0.10, e), goal: Math.round(lerp(3, 8, e)) }; },
    init(G) { M.fill.reset(G); },
    reset(G) { G.s = 0.1; G.lock = 0; G.tgt = rnd(0.45, 0.82); },
    update(G, inp, dt) {
      const P = G.P;
      if (inp.voice) { G.s += P.rate * dt * (0.4 + 0.6 * inp.lev); G.lock = 0; }
      if (G.s > G.tgt + P.band / 2 + 0.18) { hurt(G); M.fill.reset(G); return; } // over-filled: pop / overflow
      if (!inp.voice && Math.abs(G.s - G.tgt) <= P.band / 2) { G.lock += dt; if (G.lock > 0.7) { G.score++; M.fill.reset(G); } }
      else if (!inp.voice) G.lock = 0;
    },
    draw(G, ctx) {
      bg(G, ctx); const P = G.P, cx = G.W / 2, base = G.H - 70, top = 70, hgt = base - top;
      const yOf = (v) => base - v * hgt;
      ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(cx - 70, yOf(G.tgt + P.band / 2), 140, P.band * hgt);
      ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.setLineDash([6, 5]); ctx.strokeRect(cx - 70, yOf(G.tgt + P.band / 2), 140, P.band * hgt); ctx.setLineDash([]);
      if (G.v === "glass") { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(cx - 50, top, 100, hgt); ctx.fillStyle = "rgba(120,190,255,.85)"; const h = clamp(G.s, 0, 1.1) * hgt; ctx.fillRect(cx - 48, base - h, 96, h); ctx.lineWidth = 1; }
      else emo(ctx, G.th.player, cx, yOf(G.s * 0.5 + 0.02), 30 + G.s * 150);
      txt(ctx, G.lock > 0 ? "✓ " + Math.round(G.lock / 0.7 * 100) + "%" : G.lab.fill, cx, 34, 13, "#fff", true);
    },
    auto(G) { const v = G.s < G.tgt - 0.01; return { voice: v, lev: v ? 0.6 : 0, pn: null }; },
  };

  /* 6. STEADY: keep the volume inside the band (candle flame / car speed) */
  M.steady = { ctrl: "volume",
    params: (L) => { const e = E(L); return { width: lerp(0.42, 0.18, e), goal: Math.round(lerp(6, 15, e)), outMax: lerp(2.2, 1.2, e) }; },
    init(G) { G.f = 0; G.sc = 0; G.out = 0; G.center = 0.5; },
    update(G, inp, dt) {
      const P = G.P; G.f += ((inp.voice ? inp.lev : 0) - G.f) * Math.min(1, dt * 5);
      G.center = 0.5 + 0.15 * Math.sin(G.t * 0.25 * (1 + G.L * 0.05));
      const lo = G.center - P.width / 2, hi = G.center + P.width / 2;
      if (G.f >= lo && G.f <= hi) { G.sc += dt; G.out = 0; } else if (G.sc > 0.3 || G.t > 2) { G.out += dt; if (G.out > P.outMax) { hurt(G); G.out = 0; } }
      G.score = Math.floor(G.sc);
    },
    draw(G, ctx) {
      bg(G, ctx); const P = G.P, x0 = 40, w = G.W - 80, y = G.H - 90;
      const lo = G.center - P.width / 2;
      ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(x0, y, w, 22); ctx.fillStyle = "rgba(90,230,170,.6)"; ctx.fillRect(x0 + lo * w, y, P.width * w, 22);
      ctx.fillStyle = "#fff"; ctx.fillRect(x0 + clamp(G.f, 0, 1) * w - 3, y - 6, 6, 34);
      txt(ctx, G.lab.soft, x0, y + 38, 10, "rgba(255,255,255,.7)"); txt(ctx, G.lab.loud, x0 + w, y + 38, 10, "rgba(255,255,255,.7)");
      if (G.v === "candle") { emo(ctx, "🕯️", G.W / 2, 220, 70); const on = G.f > 0.05; if (on) emo(ctx, "🔥", G.W / 2, 220 - 50 - G.f * 30, 24 + G.f * 40); }
      else { emo(ctx, G.th.player, G.W / 2, 210, 60); txt(ctx, Math.round(G.f * 120) + " km/h", G.W / 2, 150, 20, "#fff", true); }
      txt(ctx, G.lab.steady, G.W / 2, 34, 13, "#fff", true);
    },
    auto(G) { return { voice: true, lev: G.center, pn: null }; },
  };

  /* 7. CLIMBER: keep a continuous sound to climb (rocket: needs a strong sound); silence slides back */
  M.climber = { ctrl: "voice",
    params: (L) => { const e = E(L); const goal = Math.round(lerp(15, 45, e)); return { climb: 3, slide: lerp(1.0, 3.0, e), goal, time: Math.round(goal / 3 * 1.8 + 10) }; },
    init(G) { G.h = 0; },
    update(G, inp, dt) {
      const P = G.P, go = G.v === "rocket" ? inp.voice && inp.lev > 0.35 : inp.voice;
      G.h = go ? G.h + P.climb * dt : Math.max(0, G.h - P.slide * dt);
      G.score = Math.floor(G.h);
      if (G.t > P.time && G.score < G.goal) G.lives = 0;
    },
    draw(G, ctx) {
      bg(G, ctx); const P = G.P, fr = clamp(G.h / P.goal, 0, 1);
      if (G.v === "rocket") { for (let i = 0; i < 8; i++) emo(ctx, "✨", (i * 53) % G.W, ((i * 97 + G.h * 18) % G.H), 12, 0.6); }
      else { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(G.W / 2 - 30, 40); ctx.lineTo(G.W / 2 - 30, G.H - 30); ctx.moveTo(G.W / 2 + 30, 40); ctx.lineTo(G.W / 2 + 30, G.H - 30); ctx.stroke();
        for (let y = (G.h * 20) % 30; y < G.H; y += 30) { ctx.beginPath(); ctx.moveTo(G.W / 2 - 30, y); ctx.lineTo(G.W / 2 + 30, y); ctx.stroke(); } ctx.lineWidth = 1; }
      emo(ctx, playerE(G), G.W / 2, G.H - 80 - fr * (G.H - 180), 40);
      emo(ctx, "🏁", G.W / 2, 40, 28);
      txt(ctx, Math.max(0, Math.ceil(P.time - G.t)) + " s", G.W - 34, 20, 13, "#fff", true);
      txt(ctx, G.v === "rocket" ? G.lab.strong : G.lab.keep, G.W / 2, G.H - 16, 12, "rgba(255,255,255,.75)");
    },
    auto() { return { voice: true, lev: 0.7, pn: null }; },
  };

  /* 8. BULLSEYE: hold the target note (the tutor plays it first) */
  const noteSet = (L, v) => { const s = L <= 2 ? [0, 4, 7] : L <= 4 ? [0, 2, 4, 5, 7] : L <= 7 ? [0, 2, 4, 5, 7, 9, 11, 12] : [0, 2, 4, 5, 7, 9, 11, 12, 1, 3, 6, 8, 10]; return v === "wide" ? s.concat([-5, -3, -1]) : s; };
  M.bullseye = { ctrl: "note",
    params: (L, v) => { const e = E(L); return { tol: lerp(60, 30, e), hold: lerp(0.8, 1.6, e), set: noteSet(L, v), goal: Math.round(lerp(4, 10, e)), limit: 12 }; },
    init(G) { G.k = -1; M.bullseye.next(G); },
    next(G) {
      const s = G.P.set;
      if (G.v === "seq") { G.k = (G.k + 1) % s.length; G.tgt = s.slice().sort((a, b) => a - b)[G.k]; }
      else { let n; do { n = pick(s); } while (s.length > 1 && n === G.tgt); G.tgt = n; }
      G.hold = 0; G.tt = 0; G.wantTone = [G.tgt];
    },
    update(G, inp, dt) {
      const P = G.P; G.tt += dt; G.cents = null;
      if (inp.voice && inp.semis != null) { let c = (inp.semis - G.tgt) * 100; while (c > 600) c -= 1200; while (c < -600) c += 1200; G.cents = c;
        if (Math.abs(c) <= P.tol) G.hold += dt; else G.hold = Math.max(0, G.hold - dt * 0.5); }
      if (G.hold >= P.hold) { G.score++; G.win1 = 0.6; M.bullseye.next(G); }
      else if (G.tt > P.limit) { hurt(G); M.bullseye.next(G); }
      if (G.win1 > 0) G.win1 -= dt;
    },
    draw(G, ctx) {
      bg(G, ctx); const P = G.P;
      txt(ctx, G.lab.sing, G.W / 2, 40, 13, "rgba(255,255,255,.8)");
      txt(ctx, sarg(G.tgt), G.W / 2, 100, 54, "#fff", true);
      const r = 70, cx = G.W / 2, cy = 245;
      for (let i = 3; i >= 1; i--) { ctx.fillStyle = ["#fff", "#ff6b4a", "#fff"][i - 1]; ctx.beginPath(); ctx.arc(cx, cy, r * i / 3, 0, 7); ctx.fill(); }
      ctx.strokeStyle = "rgba(0,200,120,.95)"; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, r + 12, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * clamp(G.hold / P.hold, 0, 1)); ctx.stroke(); ctx.lineWidth = 1;
      if (G.cents != null) { const off = clamp(G.cents / 300, -1, 1); emo(ctx, G.th.player, cx, cy - off * 90, 30); txt(ctx, Math.abs(G.cents) <= P.tol ? G.lab.hold : G.cents > 0 ? "↓ " + G.lab.lower : "↑ " + G.lab.higher, cx, cy + 115, 16, "#fff", true); }
      if (G.win1 > 0) emo(ctx, "🎯", cx, cy, 60);
      txt(ctx, Math.max(0, Math.ceil(P.limit - G.tt)) + " s", G.W - 30, 20, 12, "#fff");
    },
    auto(G) { return { voice: true, semis: G.tgt, pn: 0.5 }; },
  };

  /* 9. TRACE: follow the moving line / river / path with your pitch */
  M.trace = { ctrl: "pitch",
    params: (L) => { const e = E(L); return { amp: lerp(0.14, 0.36, e), freq: lerp(0.12, 0.38, e), band: lerp(0.20, 0.09, e), goal: Math.round(lerp(8, 20, e)), offMax: 2.2 }; },
    init(G) { G.sc = 0; G.off = 0; G.ph = rnd(0, 6); G.trail = []; },
    path(G, t) { const P = G.P; return clamp(0.5 + P.amp * Math.sin(2 * Math.PI * P.freq * t + G.ph) + 0.4 * P.amp * Math.sin(2 * Math.PI * P.freq * 2.3 * t + 1 + G.ph), 0.08, 0.92); },
    update(G, inp, dt) {
      const P = G.P, want = M.trace.path(G, G.t);
      if (inp.pn != null) { G.pn = G.pn == null ? inp.pn : G.pn + (inp.pn - G.pn) * Math.min(1, dt * 8); } else G.pn = null;
      if (G.pn != null && Math.abs(G.pn - want) <= P.band / 2) { G.sc += dt; G.off = 0; } else { G.off += dt; if (G.off > P.offMax) { hurt(G); G.off = 0; } }
      G.score = Math.floor(G.sc);
      G.trail.push(G.pn); if (G.trail.length > 60) G.trail.shift();
    },
    draw(G, ctx) {
      bg(G, ctx); const P = G.P, x0 = 80, pxs = 70, Y = (v) => G.H - 30 - v * (G.H - 60);
      if (G.v === "river") { ctx.fillStyle = "rgba(80,170,255,.55)"; ctx.beginPath(); for (let x = 0; x <= G.W; x += 6) ctx.lineTo(x, Y(M.trace.path(G, G.t + (x - x0) / pxs) + P.band / 2)); for (let x = G.W; x >= 0; x -= 6) ctx.lineTo(x, Y(M.trace.path(G, G.t + (x - x0) / pxs) - P.band / 2)); ctx.fill(); }
      else { ctx.strokeStyle = G.v === "snake" ? "rgba(140,255,140,.9)" : "rgba(255,255,255,.9)"; ctx.lineWidth = Math.max(4, P.band * (G.H - 60)); ctx.lineCap = "round"; ctx.globalAlpha = 0.35; ctx.beginPath();
        for (let x = 0; x <= G.W; x += 6) { const y = Y(M.trace.path(G, G.t + (x - x0) / pxs)); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
      ctx.strokeStyle = "rgba(255,230,120,.9)"; ctx.lineWidth = 3; ctx.beginPath(); let st = false;
      G.trail.forEach((v, i) => { const x = x0 - (G.trail.length - 1 - i) * 1.2; if (v == null) { st = false; return; } st ? ctx.lineTo(x, Y(v)) : ctx.moveTo(x, Y(v)); st = true; }); ctx.stroke(); ctx.lineWidth = 1;
      if (G.pn != null) emo(ctx, G.th.player, x0, Y(G.pn), 30); else emo(ctx, G.th.player, x0, Y(M.trace.path(G, G.t)), 30, 0.3);
      pitchHint(G, ctx);
    },
    auto(G) { return { pn: M.trace.path(G, G.t), voice: true }; },
  };

  /* 10. REACT: speak on green, stay silent on red */
  M.react = { ctrl: "voice",
    params: (L, v) => { const e = E(L); return { win: v === "quick" ? lerp(1.6, 0.6, e) : lerp(2.2, 0.9, e), red: v === "quick" ? 0 : (L >= 2 ? lerp(0.15, 0.45, e) : 0), gap: lerp(1.4, 0.7, e), goal: Math.round(lerp(6, 16, e)) }; },
    init(G) { G.st = "wait"; G.tm = 1.2; G.spot = 0; },
    update(G, inp, dt) {
      const P = G.P; G.tm -= dt;
      if (G.st === "wait") { if (G.tm <= 0) { G.st = RNG() < P.red ? "red" : "green"; G.tm = P.win; G.spot = Math.floor(RNG() * 6); G.heard = false; } return; }
      if (inp.voice) G.heard = true;
      if (G.st === "green" && G.heard) { G.score++; G.st = "wait"; G.tm = P.gap; G.ok = 0.5; }
      else if (G.st === "red" && G.heard) { hurt(G); G.st = "wait"; G.tm = P.gap; }
      else if (G.tm <= 0) { if (G.st === "green") hurt(G); else { G.score++; G.ok = 0.5; } G.st = "wait"; G.tm = P.gap; }
      if (G.ok > 0) G.ok -= dt;
    },
    draw(G, ctx) {
      bg(G, ctx);
      if (G.v === "mole") {
        for (let i = 0; i < 6; i++) { const x = 70 + (i % 3) * 90, y = 170 + Math.floor(i / 3) * 120; ctx.fillStyle = "rgba(60,30,10,.6)"; ctx.beginPath(); ctx.ellipse(x, y + 22, 34, 12, 0, 0, 7); ctx.fill();
          if (G.st !== "wait" && i === G.spot) emo(ctx, G.st === "green" ? "🐹" : "💣", x, y, 44); }
        txt(ctx, G.lab.mole, G.W / 2, 50, 13, "#fff", true);
      } else {
        const on = G.st !== "wait", c = G.st === "green" ? "#22c55e" : G.st === "red" ? "#ef4444" : "#475569";
        ctx.fillStyle = "#1f2937"; ctx.fillRect(G.W / 2 - 50, 80, 100, 200); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(G.W / 2, 180, 40, 0, 7); ctx.fill();
        txt(ctx, on ? (G.st === "green" ? G.lab.speak : G.lab.quiet) : "…", G.W / 2, 320, 22, "#fff", true);
        if (on) { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(G.W / 2 - 60, 345, 120 * clamp(G.tm / G.P.win, 0, 1), 6); }
      }
      if (G.ok > 0) emo(ctx, "✅", G.W / 2, 390, 30);
    },
    auto(G) { const v = G.st === "green"; return { voice: v, onset: v, lev: v ? 0.6 : 0, pn: null }; },
  };

  /* 11. SIMON: the tutor plays a short tune; sing it back note by note */
  M.simon = { ctrl: "note",
    params: (L, v) => { const e = E(L); return { len: 2 + Math.floor((L - 1) / 2) + (v === "echo" ? 1 : 0), set: noteSet(Math.max(1, L - 1), "") .filter((n) => n <= 12), tol: lerp(70, 45, e), goal: Math.round(lerp(3, 6, e)), per: 6 }; },
    init(G) { M.simon.newSeq(G); },
    newSeq(G) { const s = G.P.set, seq = []; for (let i = 0; i < G.P.len; i++) { let n; do { n = pick(s); } while (seq.length && n === seq[seq.length - 1] && s.length > 1); seq.push(n); } G.seq = seq; M.simon.replay(G); },
    replay(G) { G.i = 0; G.hold = 0; G.tt = 0; G.wantTone = G.seq.slice(); },
    update(G, inp, dt) {
      const P = G.P; G.tt += dt; G.cents = null;
      if (inp.voice && inp.semis != null) { let c = (inp.semis - G.seq[G.i]) * 100; while (c > 600) c -= 1200; while (c < -600) c += 1200; G.cents = c; if (Math.abs(c) <= P.tol) G.hold += dt; else G.hold = Math.max(0, G.hold - dt); }
      if (G.hold >= 0.35) { G.i++; G.hold = 0; G.tt = 0; if (G.i >= G.seq.length) { G.score++; G.win1 = 0.8; M.simon.newSeq(G); } }
      else if (G.tt > P.per) { hurt(G); M.simon.replay(G); }
      if (G.win1 > 0) G.win1 -= dt;
    },
    draw(G, ctx) {
      bg(G, ctx); txt(ctx, G.lab.echo, G.W / 2, 40, 13, "rgba(255,255,255,.85)", true);
      const n = G.seq.length, w = Math.min(64, (G.W - 30) / n);
      G.seq.forEach((s, k) => { const x = G.W / 2 + (k - (n - 1) / 2) * w; ctx.fillStyle = k < G.i ? "rgba(34,197,94,.9)" : k === G.i ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.3)";
        ctx.beginPath(); ctx.arc(x, 150, w * 0.38, 0, 7); ctx.fill(); txt(ctx, k <= G.i ? sarg(s) : "?", x, 150, 14, k === G.i ? "#111" : "#fff", true); });
      emo(ctx, G.th.player, G.W / 2, 260, 60);
      if (G.cents != null) txt(ctx, Math.abs(G.cents) <= G.P.tol ? "✓" : G.cents > 0 ? "↓ " + G.lab.lower : "↑ " + G.lab.higher, G.W / 2, 330, 18, "#fff", true);
      if (G.win1 > 0) emo(ctx, "🌟", G.W / 2, 200, 50);
    },
    auto(G) { return { voice: true, semis: G.seq[G.i], pn: 0.5 }; },
  };

  /* 12. RHYTHM: say "Ta" exactly when the note reaches the line */
  M.rhythm = { ctrl: "beat",
    params: (L) => { const e = E(L); return { bpm: Math.round(lerp(60, 96, e)), win: lerp(0.28, 0.13, e), off8: L >= 5 ? lerp(0.1, 0.35, e) : 0, goal: Math.round(lerp(8, 22, e)), missMax: 3 }; },
    init(G) {
      const P = G.P, beat = 60 / P.bpm; G.notes = []; G.miss = 0; G.combo = 0;
      for (let t = 2, k = 0; G.notes.length < P.goal + 8; t += beat, k++) { G.notes.push({ t }); if (RNG() < P.off8) G.notes.push({ t: t + beat / 2 }); }
      G.sched = G.notes.map((n) => ({ t: n.t, accent: false }));
    },
    update(G, inp, dt) {
      const P = G.P;
      if (inp.onset) { let best = null, bd = 1e9; G.notes.forEach((n) => { if (n.done) return; const d = Math.abs(n.t - G.t); if (d < bd) { bd = d; best = n; } });
        if (best && bd <= P.win) { best.done = "hit"; G.score++; G.combo++; G.flashOk = 0.25; } }
      G.notes.forEach((n) => { if (!n.done && G.t > n.t + P.win) { n.done = "miss"; G.combo = 0; G.miss++; if (G.miss >= P.missMax) { hurt(G); G.miss = 0; } } });
      if (G.flashOk > 0) G.flashOk -= dt;
    },
    draw(G, ctx) {
      bg(G, ctx); const lineY = G.H - 90, pps = 120;
      ctx.fillStyle = G.flashOk > 0 ? "rgba(34,197,94,.8)" : "rgba(255,255,255,.7)"; ctx.fillRect(30, lineY - 3, G.W - 60, 6);
      G.notes.forEach((n) => { if (n.done === "hit") return; const y = lineY - (n.t - G.t) * pps; if (y < -30 || y > G.H + 20) return; emo(ctx, n.done === "miss" ? "✖️" : G.th.obs, G.W / 2, y, 30, n.done ? 0.4 : 1); });
      emo(ctx, G.th.player, G.W / 2, lineY + 40, 34);
      txt(ctx, G.lab.ta + (G.combo > 2 ? "  🔥x" + G.combo : ""), G.W / 2, 30, 14, "#fff", true);
    },
    auto(G) { const n = G.notes.find((q) => !q.done && Math.abs(q.t - G.t) < 0.03); return { onset: !!n, voice: !!n, pn: null }; },
  };

  /* 13. SHOOTER: pitch aims up/down, a short loud "Pa!" fires */
  M.shooter = { ctrl: "pitch",
    params: (L) => { const e = E(L); return { speed: lerp(32, 78, e), every: lerp(3.0, 1.4, e), goal: Math.round(lerp(5, 14, e)), bob: L >= 4 ? lerp(10, 40, e) : 0 }; },
    init(G) { G.aim = 0.5; G.shots = []; G.foes = []; G.tm = 1.2; G.cool = 0; },
    update(G, inp, dt) {
      const P = G.P, Y = (v) => G.H - 50 - v * (G.H - 100);
      if (inp.pn != null) G.aim += (inp.pn - G.aim) * Math.min(1, dt * 7);
      G.cool -= dt; if (inp.onset && G.cool <= 0) { G.shots.push({ x: 60, y: Y(G.aim) }); G.cool = 0.35; }
      G.tm -= dt; if (G.tm <= 0) { G.foes.push({ x: G.W + 20, y0: rnd(60, G.H - 60), ph: rnd(0, 6) }); G.tm = P.every; }
      G.shots.forEach((s) => { s.x += 380 * dt; });
      G.foes.forEach((f) => { f.x -= P.speed * dt; f.y = clamp(f.y0 + P.bob * Math.sin(G.t * 1.6 + f.ph), 40, G.H - 40); });
      G.shots.forEach((s) => G.foes.forEach((f) => { if (!s.done && !f.done && Math.abs(s.x - f.x) < 22 && Math.abs(s.y - f.y) < 24) { s.done = f.done = true; G.score++; } }));
      G.foes.forEach((f) => { if (!f.done && f.x < 46) { f.done = true; hurt(G); } });
      G.shots = G.shots.filter((s) => !s.done && s.x < G.W + 20); G.foes = G.foes.filter((f) => !f.done);
    },
    draw(G, ctx) {
      bg(G, ctx); const Y = (v) => G.H - 50 - v * (G.H - 100);
      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(60, Y(G.aim)); ctx.lineTo(G.W, Y(G.aim)); ctx.stroke(); ctx.setLineDash([]);
      G.foes.forEach((f) => emo(ctx, G.th.obs, f.x, f.y, 32)); G.shots.forEach((s) => emo(ctx, G.th.shot || "•", s.x, s.y, 18));
      emo(ctx, G.th.player, 36, Y(G.aim), 34, G.inv > 0 && Math.floor(G.inv * 10) % 2 ? 0.35 : 1);
      txt(ctx, G.lab.fire, G.W / 2, 22, 12, "rgba(255,255,255,.75)"); pitchHint(G, ctx);
    },
    auto(G) {
      const Y = (v) => G.H - 50 - v * (G.H - 100), f = G.foes.slice().sort((a, b) => a.x - b.x)[0];
      if (!f) return { pn: G.aim, voice: false };
      const want = clamp((G.H - 50 - f.y) / (G.H - 100), 0, 1), lead = Math.abs(Y(G.aim) - f.y) < 14 && G.cool <= 0 && f.x < G.W - 10;
      return { pn: want, onset: lead, voice: true };
    },
  };

  /* =================== GAMES (35) =================== */
  const T = (en, hi) => ({ en, hi });
  const BG = { sky: ["#38bdf8", "#bae6fd"], night: ["#0f172a", "#312e81"], space: ["#020617", "#1e1b4b"], sea: ["#0e7490", "#164e63"], road: ["#475569", "#1e293b"],
    forest: ["#166534", "#14532d"], desert: ["#f59e0b", "#b45309"], sunset: ["#fb7185", "#f59e0b"], party: ["#a855f7", "#ec4899"], kitchen: ["#fde68a", "#f59e0b"], dark: ["#111827", "#374151"], grass: ["#65a30d", "#3f6212"] };
  const G_ = (id, mech, v, icon, name, story, th) => ({ id, mech, v, icon, name, story, th });
  const GAMES = [
    G_("flyer", "fly", "", "🐦", T("Sur Flight", "Sur Udaan"), T("Fly the bird through the pipes.", "Chidiya ko pipes ke beech se udaao."), { bg: BG.sky, player: "🐦", wall: "#16a34a", useChar: true }),
    G_("rocket", "fly", "", "🚀", T("Asteroid Escape", "Asteroid se bacho"), T("Steer the rocket between asteroid walls.", "Rocket ko asteroid ki deewaron ke beech se nikalo."), { bg: BG.space, player: "🚀", obs: "☄️", useChar: true }),
    G_("plane", "fly", "", "✈️", T("Cloud Plane", "Baadal Jahaaz"), T("Fly the plane through the gaps in the clouds.", "Jahaaz ko baadalon ke beech se nikalo."), { bg: BG.sky, player: "✈️", obs: "☁️" }),
    G_("sub", "fly", "", "🐠", T("Coral Dive", "Samundar ki Sair"), T("Swim the fish between the rocks.", "Machhli ko chattaanon ke beech se tairaao."), { bg: BG.sea, player: "🐠", obs: "🪨" }),
    G_("lanes", "lanes", "", "🚗", T("Sur Race", "Sur Race"), T("Change lanes with your voice to avoid roadblocks.", "Aawaaz se lane badlo aur rukawaton se bacho."), { bg: BG.road, player: "🚗", obs: "🚧" }),
    G_("train", "lanes", "", "🚂", T("Track Switch", "Patri Badlo"), T("Switch the train to a free track.", "Train ko khaali patri par le jao."), { bg: BG.desert, player: "🚂", obs: "🪨" }),
    G_("ufo", "lanes", "", "🛸", T("Space Lanes", "Antariksh Lanes"), T("Dodge meteors in three space lanes.", "Teen lanes mein ulkaon se bacho."), { bg: BG.space, player: "🛸", obs: "☄️" }),
    G_("jumper", "runner", "", "🏃", T("Temple Dash", "Mandir Daud"), T("Say 'Hup!' to jump over the fire.", "'Hup!' bolo aur aag ke upar se kudo."), { bg: BG.sunset, player: "🏃", obs: "🔥", useChar: true }),
    G_("dino", "runner", "", "🦖", T("Dino Jump", "Dino Chhalaang"), T("Make the dinosaur jump over cactus.", "Dino ko cactus ke upar kudaao."), { bg: BG.desert, player: "🦖", obs: "🌵" }),
    G_("horse", "runner", "", "🐎", T("Hurdle Horse", "Ghoda Daud"), T("Jump the horse over the logs.", "Ghode ko lakdiyon ke upar kudaao."), { bg: BG.grass, player: "🐎", obs: "🪵" }),
    G_("fruit", "catcher", "", "🧺", T("Fruit Basket", "Phal Pakdo"), T("Catch fruit, avoid bombs.", "Phal pakdo, bomb se bacho."), { bg: BG.grass, player: "🧺", items: ["🍎", "🍌", "🍇", "🍊", "🥭"], bad: "💣" }),
    G_("stars", "catcher", "", "⭐", T("Star Catcher", "Taare Pakdo"), T("Catch the falling stars, avoid comets.", "Girte taare pakdo, dhoomketu se bacho."), { bg: BG.night, player: "🌙", items: ["⭐", "🌟", "✨"], bad: "☄️" }),
    G_("rain", "catcher", "dodge", "☂️", T("Rain Dodge", "Baarish se Bacho"), T("Move away from every falling drop.", "Har girti boond se hat jao."), { bg: BG.dark, player: "🚶", items: ["💧"], bad: "💧", useChar: true }),
    G_("balloon", "fill", "", "🎈", T("Balloon Pump", "Gubbara Phulao"), T("Fill the balloon to the line - stop before it pops.", "Gubbare ko line tak phulao - phatne se pehle ruko."), { bg: BG.party, player: "🎈" }),
    G_("bubble", "fill", "", "🫧", T("Bubble Maker", "Bulbula Banao"), T("Blow the bubble to the right size.", "Bulbule ko sahi size tak phulao."), { bg: BG.sea, player: "🫧" }),
    G_("glass", "fill", "glass", "🥛", T("Fill the Glass", "Glass Bharo"), T("Pour with your voice, stop exactly at the line.", "Aawaaz se paani bharo, theek line par ruko."), { bg: BG.kitchen, player: "🥛" }),
    G_("candle", "steady", "candle", "🕯️", T("Candle Keeper", "Diya Jalaao"), T("Keep a gentle, steady sound so the flame stays in the green zone.", "Halki, ek-si aawaaz rakho taaki lau hare hisse mein rahe."), { bg: BG.dark, player: "🕯️" }),
    G_("cruise", "steady", "cruise", "🚙", T("Cruise Control", "Speed Control"), T("Keep the car's speed in the green zone with steady volume.", "Ek-si aawaaz se gaadi ki speed hare hisse mein rakho."), { bg: BG.road, player: "🚙" }),
    G_("climber", "climber", "", "🧗", T("Ladder Climb", "Seedhi Chadho"), T("Keep singing to climb, silence slides you down.", "Gaate raho to chadhoge, chup hote hi phisloge."), { bg: BG.forest, player: "🧗", useChar: true }),
    G_("liftoff", "climber", "rocket", "🚀", T("Rocket Lift-off", "Rocket Udaan"), T("A strong steady sound is the rocket's fuel.", "Mazboot, ek-si aawaaz rocket ka eendhan hai."), { bg: BG.space, player: "🚀" }),
    G_("tuner", "bullseye", "", "🎯", T("Note Target", "Sur Pakdo"), T("Hold the note the tutor plays to hit the target.", "Tutor ka bajaya sur pakadkar tikao, nishaana lagega."), { bg: BG.sunset, player: "🎯" }),
    G_("sargam", "bullseye", "seq", "🪜", T("Sargam Ladder", "Sargam Seedhi"), T("Hit the notes in order up the scale.", "Scale ke sur kram se lagao."), { bg: BG.party, player: "🎵" }),
    G_("hunter", "bullseye", "wide", "🏹", T("Note Hunter", "Sur Shikari"), T("Hunt notes across a wide range, low and high.", "Neeche-upar ki badi range mein sur dhundo."), { bg: BG.forest, player: "🏹" }),
    G_("rekha", "trace", "", "✏️", T("Pitch Painter", "Sur Rekha"), T("Follow the line with your pitch.", "Apne sur se line ke saath chalo."), { bg: BG.dark, player: "✏️" }),
    G_("river", "trace", "river", "⛵", T("River Boat", "Nadi ki Naav"), T("Keep the boat inside the winding river.", "Naav ko ghoomti nadi ke andar rakho."), { bg: BG.grass, player: "⛵" }),
    G_("snake", "trace", "snake", "🐍", T("Snake Path", "Saanp ka Raasta"), T("Guide the snake along the green path.", "Saanp ko hare raaste par chalao."), { bg: BG.desert, player: "🐍" }),
    G_("react", "react", "", "🚦", T("Traffic Light", "Traffic Batti"), T("Green: speak! Red: stay silent!", "Hara: bolo! Laal: chup raho!"), { bg: BG.road, player: "🚦" }),
    G_("mole", "react", "mole", "🐹", T("Whack-a-Mole", "Chooha Pakdo"), T("Shout when the mole pops up, stay silent for the bomb.", "Chooha nikle to bolo, bomb nikle to chup."), { bg: BG.grass, player: "🔨" }),
    G_("quick", "react", "quick", "⚡", T("Quick Voice", "Turant Bolo"), T("Speak as fast as you can when it turns green.", "Hara hote hi turant bolo."), { bg: BG.night, player: "⚡" }),
    G_("simon", "simon", "", "🧠", T("Sur Simon", "Sur Yaad Karo"), T("Listen to the tune, then sing it back.", "Dhun suno, phir wahi gaao."), { bg: BG.party, player: "🧠" }),
    G_("parrot", "simon", "echo", "🦜", T("Parrot Echo", "Tota Dohrao"), T("Repeat longer tunes like a parrot.", "Tote ki tarah lambi dhun dohrao."), { bg: BG.forest, player: "🦜" }),
    G_("drum", "rhythm", "", "🥁", T("Drum Beat", "Dhol ki Thaap"), T("Say 'Ta' when the drum reaches the line.", "Dhol line par aaye tab 'Ta' bolo."), { bg: BG.sunset, player: "🥁", obs: "🔴" }),
    G_("chug", "rhythm", "", "🚂", T("Chhuk Chhuk", "Chhuk-Chhuk Rail"), T("Say 'Chhuk' on every beat to drive the train.", "Har thaap par 'Chhuk' bolo, rail chalaao."), { bg: BG.grass, player: "🚂", obs: "🟡" }),
    G_("space", "shooter", "", "👾", T("Space Defender", "Antariksh Raksha"), T("Aim with pitch, say 'Pa!' to fire at aliens.", "Sur se nishaana lo, 'Pa!' bolkar aliens par chalao."), { bg: BG.space, player: "🚀", obs: "👾", shot: "💥" }),
    G_("archery", "shooter", "", "🏹", T("Archery", "Teerandaaz"), T("Aim with pitch, say 'Pa!' to shoot the targets.", "Sur se nishaana lo, 'Pa!' bolkar teer chalao."), { bg: BG.grass, player: "🏹", obs: "🎯", shot: "➶" }),
  ];
  GAMES.forEach((g) => { g.control = M[g.mech].ctrl; });
  const CATS = [
    { id: "pitch", ic: "🎵", name: T("Pitch games (high / low voice)", "Sur wale games (oonchi / neechi aawaaz)"), mechs: ["fly", "lanes", "catcher", "trace", "shooter"] },
    { id: "voice", ic: "🔊", name: T("Volume & breath games", "Aawaaz aur saans wale games"), mechs: ["runner", "fill", "steady", "climber"] },
    { id: "note", ic: "🎯", name: T("Note & memory games", "Sur pakdo aur yaad karo"), mechs: ["bullseye", "simon"] },
    { id: "reflex", ic: "⚡", name: T("Rhythm & reflex games", "Taal aur furti wale games"), mechs: ["rhythm", "react"] },
  ];

  /* ---------- how-to: spoken rules + sound demo for each mechanic ---------- */
  // steps use the tutor step format: {say} | {seq, label} ; hzLo/hzHi = bottom/top of the player's control range
  function howTo(g, lang, hzLo, hzHi, sa) {
    const E2 = lang === "english", P = (en, hi) => (E2 ? en : hi), up = { seq: [{ hz: hzHi, dur: 1.1, noVib: true }], label: "↑" }, dn = { seq: [{ hz: hzLo, dur: 1.1, noVib: true }], label: "↓" };
    const soft = { seq: [{ hz: sa, dur: 1, vol: 0.18, noVib: true }], label: "soft" }, loud = { seq: [{ hz: sa, dur: 1, vol: 1, noVib: true }], label: "loud" }, hup = { seq: [{ hz: sa * 1.2, dur: 0.25, vol: 1, noVib: true }], label: "Hup" };
    const st = [{ say: P(g.story.en, g.story.hi) }];
    switch (g.mech) {
      case "fly": st.push({ say: P("Sing a high 'Aaa' like this", "Aisa ooncha 'Aaa' bolo") }, up, { say: P("and you go up.", "to upar jaoge.") }, { say: P("A low 'Aaa' like this", "Aisa neecha 'Aaa'") }, dn, { say: P("takes you down. If you stay silent you slowly sink.", "to neeche aaoge. Chup rahoge to dheere-dheere neeche girega.") }); break;
      case "lanes": st.push({ say: P("Low voice like this is the bottom lane", "Aisi neechi aawaaz se neeche wali lane") }, dn, { say: P("a middle voice is the middle lane, and a high voice like this", "beech ki aawaaz se beech wali lane, aur aisi oonchi aawaaz se") }, up, { say: P("is the top lane.", "upar wali lane.") }); break;
      case "catcher": st.push({ say: P("A low voice like this moves left", "Aisi neechi aawaaz se baayein") }, dn, { say: P("and a high voice like this moves right.", "aur aisi oonchi aawaaz se daayein.") }, up); break;
      case "trace": st.push({ say: P("Make your voice go up and down with the line. High like this", "Line ke saath aawaaz upar-neeche karo. Aisa ooncha") }, up, { say: P("and low like this.", "aur aisa neecha.") }, dn, { say: P("Glide smoothly, no jumps.", "Smooth phislo, jhatke nahi.") }); break;
      case "shooter": st.push({ say: P("High voice aims up", "Oonchi aawaaz se nishaana upar") }, up, { say: P("low voice aims down.", "neechi aawaaz se neeche.") }, dn, { say: P("Then say a short loud 'Pa!' like this to fire.", "Phir aisa chhota zor ka 'Pa!' bolo to goli chalegi.") }, hup); break;
      case "runner": st.push({ say: P("Say a short loud 'Hup!' like this", "Aisa chhota, zor ka 'Hup!' bolo") }, hup, { say: P("to jump. Jump just before the obstacle.", "to kudoge. Rukawat se theek pehle kudo.") }); break;
      case "fill": st.push({ say: P("Make a sound to fill. Soft like this fills slowly", "Aawaaz karoge to bharega. Aisi halki aawaaz se dheere") }, soft, { say: P("strong like this fills fast.", "aisi zor ki aawaaz se tez.") }, loud, { say: P("Stop when it is inside the dotted zone and stay silent for a moment.", "Jab dotted hisse mein ho tab ruk jao aur ek pal chup raho.") }); break;
      case "steady": st.push({ say: P("Too soft like this", "Itna halka") }, soft, { say: P("or too loud like this", "ya itna zor") }, loud, { say: P("both are wrong. Keep a medium, steady sound inside the green zone.", "dono galat. Beech ki, ek-si aawaaz hare hisse mein rakho.") }); break;
      case "climber": st.push({ say: P(g.v === "rocket" ? "Keep a strong steady 'Aaa' like this" : "Keep a steady 'Aaa' like this", g.v === "rocket" ? "Aisa mazboot, lagaataar 'Aaa' rakho" : "Aisa lagaataar 'Aaa' rakho") }, { seq: [{ hz: sa, dur: 2, vol: g.v === "rocket" ? 1 : 0.6, noVib: true }], label: "Aaa" }, { say: P("to climb. Silence slides you down. Breathe quickly and continue.", "to upar chadhoge. Chup hote hi phisloge. Jaldi saans lekar phir shuru karo.") }); break;
      case "bullseye": st.push({ say: P("I will play a note like this.", "Main aisa ek sur bajaunga.") }, { seq: [{ hz: sa, dur: 1.2 }], label: "Sa" }, { say: P("Sing the same note and hold it until the green ring is full. The arrow tells you to go higher or lower.", "Wahi sur gaao aur hara gola poora hone tak tikao. Teer batayega ooncha karna hai ya neecha.") }); break;
      case "simon": st.push({ say: P("I will play a small tune like this.", "Main aisi chhoti dhun bajaunga.") }, { seq: [{ hz: sa, dur: 0.6 }, { hz: sa * Math.pow(2, 4 / 12), dur: 0.6 }, { hz: sa * Math.pow(2, 7 / 12), dur: 0.6 }], label: "Sa Ga Pa" }, { say: P("Then sing it back one note at a time.", "Phir ek-ek sur karke wahi gaao.") }); break;
      case "rhythm": st.push({ say: P("Say a short 'Ta' exactly when each circle touches the line, like this:", "Har gola line ko chhuye theek tab chhota 'Ta' bolo, aise:") }, { seq: [{ hz: sa * 1.2, dur: 0.18, gap: 0.62, noVib: true }, { hz: sa * 1.2, dur: 0.18, gap: 0.62, noVib: true }, { hz: sa * 1.2, dur: 0.18, noVib: true }], label: "Ta Ta Ta" }); break;
      case "react": st.push({ say: P(g.v === "mole" ? "When the mole appears, say 'Haa!' When a bomb appears, stay silent." : "When it is green, say 'Haa!' quickly. When it is red, stay completely silent.", g.v === "mole" ? "Chooha dikhe to 'Haa!' bolo. Bomb dikhe to chup raho." : "Hara ho to turant 'Haa!' bolo. Laal ho to bilkul chup raho.") }, hup); break;
    }
    st.push({ say: P("Each level is a little harder. Finish a level to earn coins.", "Har level thoda mushkil hai. Level poora karo, coins milenge.") });
    return st;
  }
  /* short tip after losing a level */
  function tip(g, lang) {
    const E2 = lang === "english", P = (en, hi) => (E2 ? en : hi);
    return ({ fly: P("Change your pitch earlier, before the wall comes.", "Deewar aane se pehle hi sur badlo."), lanes: P("Make clear high, middle and low sounds and hold them.", "Ooncha, beech ka aur neecha sur saaf alag-alag rakho."),
      catcher: P("Move slowly and steadily with your voice.", "Aawaaz se dheere aur ek-sa hilo."), trace: P("Glide smoothly, look a little ahead on the line.", "Smooth phislo, line par thoda aage dekho."),
      shooter: P("First aim, then fire with a short 'Pa!'.", "Pehle nishaana, phir chhota 'Pa!'."), runner: P("Jump a little earlier, with a short sharp 'Hup!'.", "Thoda pehle, chhota tez 'Hup!' bolo."),
      fill: P("Use soft sound near the line, and stop in time.", "Line ke paas halki aawaaz, aur samay par ruko."), steady: P("Keep one even breath, not too loud.", "Ek-si saans, bahut zor se nahi."),
      climber: P("Take a big breath and keep the sound going longer.", "Badi saans lo aur aawaaz lambi chalao."), bullseye: P("Listen again, hum softly, then slide onto the note.", "Phir suno, halka gungunao, phir sur par phislo."),
      simon: P("Hum the tune in your mind before singing.", "Gaane se pehle dhun man mein gungunao."), rhythm: P("Count the beats and say 'Ta' with the line, not after.", "Thaap gino aur line ke saath 'Ta' bolo, baad mein nahi."),
      react: P("Wait for the colour, then react fast.", "Rang ka intezaar karo, phir turant.") })[g.mech];
  }

  /* ---------- engine helpers (pure, testable) ---------- */
  function newGame(g, L, opt) {
    opt = opt || {}; const mech = M[g.mech], P = mech.params(L, g.v);
    const G = { W: opt.W || 320, H: opt.H || 430, L, P, v: g.v, th: g.th, char: opt.char, lab: opt.lab || LABELS.hinglish, goal: P.goal, score: 0, lives: 3, lost: 0, inv: 0, flash: 0, t: 0, over: false, won: false };
    mech.init(G); return G;
  }
  function step(g, G, inp, dt) {
    if (G.over) return G;
    G.t += dt; if (G.inv > 0) G.inv -= dt; if (G.flash > 0) G.flash -= dt;
    M[g.mech].update(G, inp, dt);
    if (G.score >= G.goal) { G.won = true; G.over = true; }
    else if (G.lives <= 0) { G.over = true; }
    return G;
  }
  const stars = (G) => (G.won ? (G.lost === 0 ? 3 : G.lost === 1 ? 2 : 1) : 0);
  const coinsFor = (L, st) => (st ? 5 + 3 * L + 5 * st : 0);
  const LABELS = {
    hinglish: { hi: "oonchi aawaaz", lo: "neechi aawaaz", jump: "'Hup!' bolo = kudo", fill: "Bharo... line par ruko", soft: "halka", loud: "zor", steady: "Hare hisse mein rakho", strong: "Zor se, lagaataar 'Aaa'", keep: "Lagaataar 'Aaa'", sing: "Ye sur gaao", hold: "✓ Tikao!", higher: "ooncha", lower: "neecha", echo: "Dhun dohrao", ta: "Line par 'Ta' bolo", fire: "'Pa!' = goli", mole: "Chooha = bolo · Bomb = chup", speak: "BOLO!", quiet: "CHUP!" },
    english: { hi: "high voice", lo: "low voice", jump: "say 'Hup!' = jump", fill: "Fill... stop at the line", soft: "soft", loud: "loud", steady: "Stay in the green", strong: "Strong, steady 'Aaa'", keep: "Keep 'Aaa' going", sing: "Sing this note", hold: "✓ Hold!", higher: "higher", lower: "lower", echo: "Repeat the tune", ta: "Say 'Ta' on the line", fire: "'Pa!' = fire", mole: "Mole = speak · Bomb = silent", speak: "SPEAK!", quiet: "SILENT!" },
  };
  const SHOP = [
    { id: "bird", e: "🐦", price: 0 }, { id: "butterfly", e: "🦋", price: 60 }, { id: "bee", e: "🐝", price: 90 }, { id: "parrot", e: "🦜", price: 120 },
    { id: "panda", e: "🐼", price: 160 }, { id: "dragon", e: "🐉", price: 220 }, { id: "unicorn", e: "🦄", price: 280 }, { id: "hero", e: "🦸", price: 350 }, { id: "tiger", e: "🐯", price: 420 }, { id: "peacock", e: "🦚", price: 500 },
  ];

  W.VG_GAMES = { list: GAMES, byId: (id) => GAMES.find((g) => g.id === id), CATS, M, LEVELS: 10, SHOP, LABELS,
    newGame, step, stars, coinsFor, howTo, tip, E, sarg, pitchNorm, noteOf, centsOff, setRng: (f) => { RNG = f || Math.random; } };
  if (typeof module !== "undefined") module.exports = W.VG_GAMES;
})();
