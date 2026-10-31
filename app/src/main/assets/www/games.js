/* Voice Guru - voice-controlled games. Each game is driven by live {hz, rms, voiced}.
   update(G, live, dt) advances physics and returns; draw(G, ctx) renders. Pure-ish on G so
   the physics is testable in node. Difficulty ramps with time/score. */
(function () {
  "use strict";

  // map a pitch (Hz) to 0..1 over [lo..hi]; 0 = low, 1 = high
  function pitchNorm(hz, lo, hi) { if (!(hz > 0)) return null; return Math.max(0, Math.min(1, (hz - lo) / (hi - lo))); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // note (sur) detection: Hz -> note name (Western + sargam), octave, cents off
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const SARGAM = ["Sa", "re", "Re", "ga", "Ga", "Ma", "ma", "Pa", "dha", "Dha", "ni", "Ni"];
  function noteOf(hz) {
    if (!(hz > 0)) return null;
    const exact = 69 + 12 * Math.log2(hz / 440);
    const midi = Math.round(exact);
    const cents = Math.round((exact - midi) * 100);
    const pc = ((midi % 12) + 12) % 12;
    return { midi, cents, name: NOTES[pc] + (Math.floor(midi / 12) - 1), sargam: SARGAM[pc] };
  }
  function centsOff(hz, targetHz) { return 1200 * Math.log2(hz / targetHz); }

  /* ---------- 1. Pitch Flyer: voice pitch controls height, fly through gaps ---------- */
  const flyer = {
    id: "flyer", icon: "🎈", control: "pitch",
    name: { en: "Pitch Flyer", hi: "Sur Udaan" },
    rules: { hi: "Awaaz jitni oonchi (high pitch) utna upar, jitni neechi utna neeche. Gaps ke beech se nikalo. Chup raho to neeche gir jaoge. Pitch control sudharta hai.",
             en: "Higher pitch = up, lower pitch = down. Fly through the gaps. Silence makes you fall. Trains pitch control." },
    init(G) { G.y = G.H * 0.5; G.vy = 0; G.pipes = []; G.spawn = 0; G.gap = G.H * 0.42; G.speed = G.W * 0.28; G.px = G.W * 0.28; return G; },
    update(G, live, dt) {
      const n = pitchNorm(live && live.hz, 120, 260);
      const targetY = n == null ? null : G.H - 20 - n * (G.H - 40);
      if (targetY != null) G.y += (targetY - G.y) * Math.min(1, dt * 8);
      else G.y += G.H * 0.5 * dt; // fall when silent
      G.y = clamp(G.y, 12, G.H - 12);
      G.speed += dt * 4; if (G.gap > G.H * 0.26) G.gap -= dt * 3;
      G.spawn -= dt;
      if (G.spawn <= 0) { const cy = 40 + Math.random() * (G.H - 80); G.pipes.push({ x: G.W + 20, cy, passed: false }); G.spawn = 1.5 - Math.min(0.7, G.score * 0.03); }
      for (const p of G.pipes) {
        p.x -= G.speed * dt;
        if (!p.passed && p.x < G.px) { p.passed = true; G.score++; }
        if (Math.abs(p.x - G.px) < 18 && Math.abs(G.y - p.cy) > G.gap / 2) G.over = true;
      }
      G.pipes = G.pipes.filter((p) => p.x > -30);
      if (G.y <= 12 || G.y >= G.H - 12) { /* edges allowed but risky */ }
    },
    draw(G, ctx, col) {
      ctx.clearRect(0, 0, G.W, G.H);
      ctx.fillStyle = col.pipe;
      for (const p of G.pipes) { ctx.fillRect(p.x - 10, 0, 20, p.cy - G.gap / 2); ctx.fillRect(p.x - 10, p.cy + G.gap / 2, 20, G.H - (p.cy + G.gap / 2)); }
      ctx.fillStyle = col.acc; ctx.beginPath(); ctx.arc(G.px, G.y, 12, 0, 7); ctx.fill();
    },
  };

  /* ---------- 2. Volume Jumper: loud voice = jump over obstacles ---------- */
  const jumper = {
    id: "jumper", icon: "🏃", control: "volume",
    name: { en: "Volume Jumper", hi: "Chhalaang" },
    rules: { hi: "Zor se bolo/awaaz karo to runner chhalaang maarta hai — obstacle ke upar se nikaalo. Jitni zor, utni oonchi chhalaang. Volume aur projection sudharta hai.",
             en: "Speak/make a loud sound to jump over obstacles. Louder = higher jump. Trains volume and projection." },
    init(G) { G.gy = G.H - 30; G.y = G.gy; G.vy = 0; G.obs = []; G.spawn = 0; G.speed = G.W * 0.35; G.px = G.W * 0.24; G.cool = 0; return G; },
    update(G, live, dt) {
      const rms = (live && live.rms) || 0;
      G.cool -= dt;
      if (rms > 0.06 && G.y >= G.gy - 1 && G.cool <= 0) { G.vy = -Math.min(G.H * 1.1, G.H * 0.7 + rms * 900); G.cool = 0.25; }
      G.vy += G.H * 2.2 * dt; G.y += G.vy * dt; if (G.y > G.gy) { G.y = G.gy; G.vy = 0; }
      G.speed += dt * 5; G.spawn -= dt;
      if (G.spawn <= 0) { G.obs.push({ x: G.W + 20, passed: false, h: 20 + Math.random() * 18 }); G.spawn = 1.3 - Math.min(0.6, G.score * 0.03); }
      for (const o of G.obs) { o.x -= G.speed * dt; if (!o.passed && o.x < G.px) { o.passed = true; G.score++; } if (Math.abs(o.x - G.px) < 16 && G.y > G.gy - o.h) G.over = true; }
      G.obs = G.obs.filter((o) => o.x > -30);
    },
    draw(G, ctx, col) {
      ctx.clearRect(0, 0, G.W, G.H);
      ctx.strokeStyle = col.line; ctx.beginPath(); ctx.moveTo(0, G.gy + 12); ctx.lineTo(G.W, G.gy + 12); ctx.stroke();
      ctx.fillStyle = col.pipe; for (const o of G.obs) ctx.fillRect(o.x - 8, G.gy + 12 - o.h, 16, o.h);
      ctx.fillStyle = col.acc; ctx.beginPath(); ctx.arc(G.px, G.y, 12, 0, 7); ctx.fill();
    },
  };

  /* ---------- 3. Lane Dodger: low/mid/high pitch = left/center/right lane ---------- */
  const lanes = {
    id: "lanes", icon: "🛣️", control: "lane",
    name: { en: "Lane Dodger", hi: "3 Lane" },
    rules: { hi: "Neechi awaaz = left lane, beech ki = center, oonchi = right lane. Aa rahe blocks se bacho. Alag-alag sur pakadna sikhata hai (Temple Run jaisa, par awaaz se).",
             en: "Low pitch = left lane, mid = center, high = right lane. Dodge the blocks. Trains hitting distinct pitch levels (like Temple Run, with your voice)." },
    init(G) { G.lane = 1; G.blocks = []; G.spawn = 0; G.speed = G.H * 0.4; G.laneX = [G.W * 0.25, G.W * 0.5, G.W * 0.75]; G.py = G.H - 40; return G; },
    update(G, live, dt) {
      const n = pitchNorm(live && live.hz, 120, 260);
      if (n != null) G.lane = n < 0.34 ? 0 : n < 0.67 ? 1 : 2;
      G.speed += dt * 8; G.spawn -= dt;
      if (G.spawn <= 0) { G.blocks.push({ lane: Math.floor(Math.random() * 3), y: -20, passed: false }); G.spawn = 0.9 - Math.min(0.5, G.score * 0.02); }
      for (const b of G.blocks) { b.y += G.speed * dt; if (!b.passed && b.y > G.py + 20) { b.passed = true; G.score++; } if (b.lane === G.lane && Math.abs(b.y - G.py) < 18) G.over = true; }
      G.blocks = G.blocks.filter((b) => b.y < G.H + 30);
    },
    draw(G, ctx, col) {
      ctx.clearRect(0, 0, G.W, G.H);
      ctx.strokeStyle = col.line; for (const x of [G.W / 3, G.W * 2 / 3]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, G.H); ctx.stroke(); }
      ctx.fillStyle = col.pipe; for (const b of G.blocks) ctx.fillRect(G.laneX[b.lane] - 16, b.y - 14, 32, 28);
      ctx.fillStyle = col.acc; ctx.beginPath(); ctx.arc(G.laneX[G.lane], G.py, 13, 0, 7); ctx.fill();
    },
  };

  /* ---------- 4. Sur Tuner: sing the shown note; tells correct / too high / too low ---------- */
  const tuner = {
    id: "tuner", icon: "🎯", control: "pitch",
    name: { en: "Note Tuner (Sur)", hi: "Sur Tuner" },
    rules: { hi: "Diya hua sur (note) gao/bolo aur steady tikao. App batayega: Sahi sur! ya thoda ooncha ↑ / thoda neecha ↓ — aur sahi note kaunsa hai. Galat sur par bhi chalega par 'galat' dikhega. 45 second me jitne sahi utna score.",
             en: "Sing the shown note and hold it steady. The app tells you: correct, or a bit high/low, and which note is right. Wrong notes show as wrong. 45 seconds; score the correct ones." },
    init(G) { G.targets = [131, 147, 165, 196, 220, 247, 262]; G.ti = 0; G.target = G.targets[0]; G.hold = 0; G.time = 45; G.state = "quiet"; G.curHz = 0; G.cents = 0; return G; },
    update(G, live, dt) {
      G.time -= dt; if (G.time <= 0) { G.over = true; return; }
      const hz = live && live.hz; G.curHz = hz > 0 ? hz : 0;
      if (hz > 0) {
        const c = centsOff(hz, G.target); G.cents = c;
        if (Math.abs(c) < 45) { G.state = "ok"; G.hold += dt; if (G.hold > 1.0) { G.score++; G.ti = (G.ti + 1) % G.targets.length; G.target = G.targets[G.ti]; G.hold = 0; } }
        else { G.state = c > 0 ? "sharp" : "flat"; G.hold = Math.max(0, G.hold - dt * 0.6); }
      } else { G.state = "quiet"; G.hold = Math.max(0, G.hold - dt); }
    },
    draw(G, ctx, col) {
      ctx.clearRect(0, 0, G.W, G.H); ctx.textAlign = "center";
      const tn = noteOf(G.target);
      ctx.fillStyle = col.mut; ctx.font = "14px sans-serif"; ctx.fillText("Gao yeh sur:", G.W / 2, 34);
      ctx.fillStyle = col.ink; ctx.font = "bold 40px sans-serif"; ctx.fillText(tn.name + " (" + tn.sargam + ")", G.W / 2, 78);
      ctx.font = "13px sans-serif"; ctx.fillStyle = col.mut; ctx.fillText(Math.round(G.target) + " Hz", G.W / 2, 100);
      // tuning bar
      const by = 150, bw = G.W - 60, bx = 30;
      ctx.strokeStyle = col.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.stroke();
      ctx.strokeStyle = col.ok; ctx.beginPath(); ctx.moveTo(bx + bw / 2, by - 16); ctx.lineTo(bx + bw / 2, by + 16); ctx.stroke();
      if (G.curHz > 0) { const off = clamp(G.cents / 100, -1, 1); const nx = bx + bw / 2 + off * (bw / 2); ctx.fillStyle = G.state === "ok" ? col.ok : col.acc; ctx.beginPath(); ctx.arc(nx, by, 10, 0, 7); ctx.fill(); }
      // message
      ctx.font = "bold 22px sans-serif";
      let msg = "— chup —", mc = col.mut;
      if (G.state === "ok") { msg = "Sahi sur! ✅"; mc = col.ok; }
      else if (G.state === "sharp") { msg = "Thoda ooncha ↓ (" + tn.name + ")"; mc = col.bad; }
      else if (G.state === "flat") { msg = "Thoda neecha ↑ (" + tn.name + ")"; mc = col.bad; }
      ctx.fillStyle = mc; ctx.fillText(msg, G.W / 2, 220);
      if (G.curHz > 0) { const yn = noteOf(G.curHz); ctx.fillStyle = col.mut; ctx.font = "13px sans-serif"; ctx.fillText("Aapka sur: " + yn.name + " (" + yn.sargam + ")", G.W / 2, 246); }
      ctx.fillStyle = col.mut; ctx.font = "13px sans-serif"; ctx.fillText("Time: " + Math.ceil(G.time) + "s", G.W / 2, G.H - 14);
      ctx.textAlign = "start";
    },
  };

  /* ---------- 5. Zor ya Dheere: loud/soft reaction (brain + volume) ---------- */
  const react = {
    id: "react", icon: "🔊", control: "volume",
    name: { en: "Loud or Soft", hi: "Zor ya Dheere" },
    rules: { hi: "Screen par 'ZOR!' aaye to zor se bolo, 'DHEERE!' aaye to halki/dheere awaaz karo — jaldi! Sahi par score, galat ya der par ek jaan jaati hai. Reaction aur volume control.",
             en: "When 'LOUD!' shows, be loud; when 'SOFT!' shows, be soft — quickly! Correct scores, wrong/late loses a life. Trains reaction and volume control." },
    init(G) { G.prompt = null; G.next = 1.0; G.ptime = 0; G.lives = 3; G.msg = ""; G.win = 1.5; return G; },
    update(G, live, dt) {
      const rms = (live && live.rms) || 0;
      if (!G.prompt) { G.next -= dt; if (G.next <= 0) { G.prompt = Math.random() < 0.5 ? "loud" : "soft"; G.ptime = G.win; } }
      else {
        G.ptime -= dt;
        const loud = rms > 0.09, soft = rms > 0.004 && rms < 0.04;
        if ((G.prompt === "loud" && loud) || (G.prompt === "soft" && soft)) { G.score++; G.msg = "✅"; G.prompt = null; G.next = 0.7; G.win = Math.max(0.8, G.win - 0.03); }
        else if (G.ptime <= 0) { G.lives--; G.msg = "❌"; G.prompt = null; G.next = 0.8; if (G.lives <= 0) G.over = true; }
      }
    },
    draw(G, ctx, col) {
      ctx.clearRect(0, 0, G.W, G.H); ctx.textAlign = "center";
      ctx.fillStyle = col.mut; ctx.font = "14px sans-serif"; ctx.fillText("❤️".repeat(Math.max(0, G.lives)) + "   ★ " + G.score, G.W / 2, 30);
      if (G.prompt) { ctx.fillStyle = G.prompt === "loud" ? col.acc : col.ok; ctx.font = "bold 46px sans-serif"; ctx.fillText(G.prompt === "loud" ? "ZOR!" : "DHEERE!", G.W / 2, G.H / 2); }
      else { ctx.fillStyle = col.mut; ctx.font = "26px sans-serif"; ctx.fillText(G.msg || "...", G.W / 2, G.H / 2); }
      ctx.textAlign = "start";
    },
  };

  /* ---------- 6. Rekha: follow the scrolling pitch line (pitch-path, trains glides) ---------- */
  const rekha = {
    id: "rekha", icon: "〰️", control: "pitch",
    name: { en: "Pitch Path", hi: "Rekha (sur rekha)" },
    rules: { hi: "Ek lehraati rekha dayein se aati hai. Apni awaaz ka sur upar-neeche karke dot ko rekha par rakho. Rekha par raho to health badhti hai, hato to ghatti hai. Pitch glide (sur ko smooth upar-neeche) sudharta hai.",
             en: "A wavy line scrolls in. Move your pitch up/down to keep the dot on the line. On the line = health up, off = down. Trains smooth pitch glides." },
    init(G) { G.px = G.W * 0.3; G.y = G.H / 2; G.health = 100; G.phase = 0; G.speed = G.W * 0.18; G.scored = 0; return G; },
    targetY(G, x) { return G.H / 2 + Math.sin((x / G.W) * 6 + G.phase) * (G.H * 0.3); },
    update(G, live, dt) {
      G.phase += dt * 1.1; G.speed += dt * 3;
      const n = pitchNorm(live && live.hz, 120, 260);
      if (n != null) { const ty = G.H - 14 - n * (G.H - 28); G.y += (ty - G.y) * Math.min(1, dt * 9); }
      else G.y += G.H * 0.3 * dt;
      G.y = clamp(G.y, 8, G.H - 8);
      const line = this.targetY(G, G.px);
      const near = Math.abs(G.y - line) < G.H * 0.1;
      if (near) { G.health = Math.min(100, G.health + 24 * dt); G.scored += dt; G.score = Math.floor(G.scored * 10); }
      else G.health -= 26 * dt;
      if (G.health <= 0) G.over = true;
    },
    draw(G, ctx, col) {
      ctx.clearRect(0, 0, G.W, G.H);
      ctx.strokeStyle = col.pipe; ctx.lineWidth = 4; ctx.beginPath();
      for (let x = 0; x <= G.W; x += 6) { const y = this.targetY(G, x); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      const near = Math.abs(G.y - this.targetY(G, G.px)) < G.H * 0.1;
      ctx.fillStyle = near ? col.ok : col.acc; ctx.beginPath(); ctx.arc(G.px, G.y, 11, 0, 7); ctx.fill();
      // health bar
      ctx.fillStyle = col.line; ctx.fillRect(10, 10, G.W - 20, 8);
      ctx.fillStyle = col.ok; ctx.fillRect(10, 10, (G.W - 20) * G.health / 100, 8);
    },
  };

  /* ---------- 7. Saans Climber: hold a steady voiced note to climb (sustain/breath) ---------- */
  const climber = {
    id: "climber", icon: "🧗", control: "pitch",
    name: { en: "Breath Climber", hi: "Saans Climber" },
    rules: { hi: "Steady awaaz (koi bhi sur, 'aaa') tikao to climber upar chadhta hai. Awaaz ruke ya kaanpe to neeche aata hai. Har 'floor' par score. Saans aur sur tikana (sustain) sudharta hai. 45 second.",
             en: "Hold a steady voiced sound ('aaa') to climb. Stop or waver and you slide down. Score each floor. Trains breath and sustain. 45 seconds." },
    init(G) { G.y = G.H - 20; G.floor = 0; G.time = 45; G.last = -1; return G; },
    update(G, live, dt) {
      G.time -= dt; if (G.time <= 0) { G.over = true; return; }
      const voiced = live && live.hz > 0 && live.rms > 0.02;
      if (voiced) G.y -= G.H * 0.28 * dt; else G.y += G.H * 0.33 * dt;
      // climbed past top -> next floor, reset to bottom
      if (G.y < 14) { G.floor++; G.score = G.floor; G.y = G.H - 20; }
      G.y = clamp(G.y, 14, G.H - 14);
    },
    draw(G, ctx, col) {
      ctx.clearRect(0, 0, G.W, G.H); ctx.textAlign = "center";
      ctx.strokeStyle = col.line; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { const y = G.H * i / 6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(G.W, y); ctx.stroke(); }
      ctx.fillStyle = col.acc; ctx.beginPath(); ctx.arc(G.W / 2, G.y, 13, 0, 7); ctx.fill();
      ctx.fillStyle = col.mut; ctx.font = "13px sans-serif"; ctx.fillText("Floor " + G.floor + " · " + Math.ceil(G.time) + "s", G.W / 2, 20);
      ctx.textAlign = "start";
    },
  };

  const ALL = [tuner, flyer, lanes, jumper, rekha, climber, react];
  window.VG_GAMES = { list: ALL, byId: (id) => ALL.find((g) => g.id === id), pitchNorm: pitchNorm, noteOf: noteOf, centsOff: centsOff };
})();
