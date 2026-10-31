/* Voice Guru - simple hand-drawn style SVG diagrams for exercise steps.
   All strokes use currentColor so they adapt to light/dark theme. Lightweight, offline. */
(function () {
  "use strict";
  const wrap = (inner, vb) => `<svg class="vgsk" viewBox="${vb || "0 0 200 150"}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
  const S = {
    // belly breathing: seated figure, hand on belly, arrow = belly expands
    belly() {
      return wrap(`
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="70" cy="34" r="16"/>
        <path d="M70 50 q-22 6 -24 44 q-1 16 4 30"/>
        <path d="M70 50 q22 6 24 44 q1 16 -4 30"/>
        <ellipse cx="78" cy="96" rx="20" ry="16" stroke-dasharray="2 6"/>
        <path d="M46 96 q6 -4 14 0"/>
      </g>
      <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M120 96 h40 M152 88 l10 8 l-10 8"/>
      </g>
      <text x="120" y="40" font-size="13" fill="currentColor">In 4</text>
      <text x="120" y="60" font-size="13" fill="currentColor">Hold 2</text>
      <text x="120" y="130" font-size="13" fill="currentColor">Out 6</text>`);
    },
    // straight posture
    posture() {
      return wrap(`
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="70" cy="30" r="14"/>
        <path d="M70 44 V104"/>
        <path d="M70 58 L48 78 M70 58 L92 78"/>
        <path d="M70 104 L52 140 M70 104 L88 140"/>
        <path d="M44 104 h52" stroke-dasharray="3 5"/>
      </g>
      <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M150 20 V140"/><path d="M150 20 l-6 10 M150 20 l6 10"/>
      </g>
      <text x="118" y="80" font-size="12" fill="currentColor">Seedhi</text>
      <text x="118" y="96" font-size="12" fill="currentColor">kamar</text>`, "0 0 200 150");
    },
    // mouth shapes for V vs W
    lipsVW() {
      return wrap(`
      <text x="34" y="20" font-size="13" fill="currentColor">V / F</text>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M20 60 q40 -16 80 0"/>
        <path d="M20 60 q40 22 80 0"/>
        <path d="M30 56 h12 M48 56 h12 M66 56 h12"/>
        <path d="M40 60 q6 8 0 14"/>
      </g>
      <text x="150" y="20" font-size="13" fill="currentColor">W</text>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <circle cx="160" cy="62" r="20"/>
      </g>
      <text x="14" y="104" font-size="11" fill="currentColor">daant honth par</text>
      <text x="138" y="104" font-size="11" fill="currentColor">honth gol</text>`, "0 0 200 120");
    },
    // tongue between teeth for TH
    tongueTH() {
      return wrap(`
      <text x="70" y="18" font-size="13" fill="currentColor">TH</text>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M40 46 q60 -18 120 0"/>
        <path d="M40 92 q60 18 120 0"/>
        <path d="M60 44 v8 M80 42 v9 M100 42 v9 M120 42 v9 M140 44 v8"/>
        <path d="M70 68 q30 -8 60 0 q-30 10 -60 0z" fill="currentColor" fill-opacity="0.12"/>
      </g>
      <text x="40" y="118" font-size="11" fill="currentColor">jeebh daanton ke beech halki</text>`, "0 0 200 130");
    },
    // open mouth for clear articulation
    openmouth() {
      return wrap(`
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="100" cy="62" r="46"/>
        <circle cx="82" cy="52" r="4" fill="currentColor"/>
        <circle cx="118" cy="52" r="4" fill="currentColor"/>
        <ellipse cx="100" cy="82" rx="16" ry="20"/>
      </g>
      <text x="36" y="128" font-size="12" fill="currentColor">muuh poora kholo, saaf bolo</text>`, "0 0 200 140");
    },
    // pace: sentence with pause bars
    pace() {
      return wrap(`
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M16 50 h40"/><path d="M70 40 v20"/>
        <path d="M84 50 h46"/><path d="M144 40 v20"/>
        <path d="M158 50 h26"/>
      </g>
      <text x="58" y="88" font-size="11" fill="currentColor">ruko</text>
      <text x="132" y="88" font-size="11" fill="currentColor">ruko</text>
      <text x="24" y="116" font-size="12" fill="currentColor">| par ruko aur saans lo</text>`, "0 0 200 130");
    },
    // pitch glide wave
    wave() {
      return wrap(`
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M14 100 Q60 20 100 70 Q140 120 186 40"/>
      </g>
      <g fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 20 V130 M14 130 H190"/>
      </g>
      <text x="2" y="24" font-size="10" fill="currentColor">↑</text>
      <text x="150" y="128" font-size="11" fill="currentColor">neeche→upar→neeche</text>`, "0 0 200 140");
    },
  };
  window.VG_SKETCH = { render: (kind) => (S[kind] ? S[kind]() : "") };
})();
