'use strict';

(() => {
  // ---------- Music data ----------
  const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  // Staff line index (C=0 … B=6) for each pitch class, by spelling.
  const LET_S = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const LET_F = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
  const NATURALS = [0, 2, 4, 5, 7, 9, 11];
  const isNat = (pc) => NATURALS.includes(pc);

  // Index 0 is the 6th (thickest) string.
  const STR = [
    { letter: 'E', num: '6th', name: 'low E', open: 40, w: 3.4, thick: 'thickest' },
    { letter: 'A', num: '5th', name: 'A', open: 45, w: 2.8, thick: '' },
    { letter: 'D', num: '4th', name: 'D', open: 50, w: 2.3, thick: '' },
    { letter: 'G', num: '3rd', name: 'G', open: 55, w: 1.8, thick: '' },
    { letter: 'B', num: '2nd', name: 'B', open: 59, w: 1.35, thick: '' },
    { letter: 'E', num: '1st', name: 'high E', open: 64, w: 1.05, thick: 'thinnest' }
  ];

  const GUITAR = {
    electric: { frets: 22, label: 'Electric', sub: '22 frets · maple', wood: '#E8CD9C', grain: 'rgba(150,100,40,0.10)', dot: '#2A2522', binding: null, wound: [true, true, true, false, false, false], wCol: '#8A9099', wDark: '#5E646C', pCol: '#9EA5AE' },
    acoustic: { frets: 20, label: 'Acoustic', sub: '20 frets · rosewood', wood: '#7A4E35', grain: 'rgba(0,0,0,0.13)', dot: '#F3EFE6', binding: '#F1EBDD', wound: [true, true, true, true, false, false], wCol: '#D2A464', wDark: '#9C7340', pCol: '#E3E6EA' }
  };

  const MODES = {
    flash: { label: 'Name it', sub: 'Name the marked fret', rule: 'A fret is marked with ? on the neck. Name the note.' },
    find: { label: 'Find it', sub: 'Tap the note anywhere', rule: 'You get a note name. Tap any place on the neck where it lives.' },
    string: { label: 'One string', sub: 'Find it on a set string', rule: 'You get a note and a string. Tap that note on that string.' },
    staff: { label: 'Read it', sub: 'Sheet music to fret', rule: 'You get a note on the staff. Tap that exact pitch on the neck.' },
    mix: { label: 'Mix', sub: 'All four at random', rule: 'A random mix of all four question types.' }
  };
  const LENGTHS = {
    lives: { label: '3 lives', sub: 'Play until 3 misses' },
    sprint: { label: '60 seconds', sub: 'Beat the clock' }
  };
  const RANGES = {
    '0-5': [0, 5, 'Open–5'],
    '5-9': [5, 9, '5–9'],
    '7-12': [7, 12, '7–12'],
    '0-12': [0, 12, 'Open–12'],
    all: [0, 99, 'Whole neck']
  };
  const SPRINT_MS = 60000;
  const KEYS = { settings: 'gnf.settings.v1', high: 'gnf.high.v1', stats: 'gnf.stats.v1' };

  // ---------- Storage ----------
  const load = (k, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(k));
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) { return fallback; }
  };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  const DEFAULTS = { mode: 'flash', length: 'lives', guitar: 'electric', range: '0-12', accidentals: false, strings: [true, true, true, true, true, true], lowTop: false, sound: true };

  function loadSettings() {
    const s = Object.assign({}, DEFAULTS, load(KEYS.settings, {}));
    if (!MODES[s.mode]) s.mode = DEFAULTS.mode;
    if (!LENGTHS[s.length]) s.length = DEFAULTS.length;
    if (!GUITAR[s.guitar]) s.guitar = DEFAULTS.guitar;
    if (!RANGES[s.range]) s.range = DEFAULTS.range;
    if (!Array.isArray(s.strings) || s.strings.length !== 6 || !s.strings.some(Boolean)) s.strings = DEFAULTS.strings.slice();
    return s;
  }

  const freshGame = (status) => ({
    status, phase: 'ask', prompt: null, clicked: null, picked: null, result: null,
    score: 0, lives: 3, streak: 0, bestStreak: 0, correct: 0, total: 0,
    askedAt: 0, endsAt: 0, ms: 0, missed: [], newHigh: false, prevHigh: 0, timeUp: false
  });

  const S = {
    set: loadSettings(),
    high: load(KEYS.high, {}),
    stats: Object.assign({ cells: {}, notes: {} }, load(KEYS.stats, {})),
    g: freshGame('idle'),
    labels: false,
    heat: false,
    peek: null,
    confirmReset: false,
    compact: false
  };

  let advanceTimer = null;
  let tickTimer = null;
  let peekTimer = null;
  let resetTimer = null;

  // ---------- Helpers ----------
  const frets = () => GUITAR[S.set.guitar].frets;
  const lo = () => RANGES[S.set.range][0];
  const hi = () => Math.min(RANGES[S.set.range][1], frets());
  const enabled = (s, f) => !!S.set.strings[s] && f >= lo() && f <= hi();
  const pcOf = (s, f) => (STR[s].open + f) % 12;
  const bothNames = (pc) => isNat(pc) ? SHARP[pc] : SHARP[pc] + ' / ' + FLAT[pc];
  const ftxt = (f) => f === 0 ? 'open' : 'fret ' + f;
  const pts = (n) => n === 1 ? 'point' : 'points';
  const highKey = (mode, length) => mode + ':' + length;
  const highFor = (mode) => S.high[highKey(mode, S.set.length)] || 0;
  const playing = () => S.g.status === 'playing';
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function isTarget(p, s, f) {
    if (!enabled(s, f)) return false;
    const midi = STR[s].open + f;
    if (p.kind === 'staff') return midi === p.midi;
    if (p.kind === 'string') return s === p.s && midi % 12 === p.pc;
    return midi % 12 === p.pc;
  }

  function targets(p) {
    const out = [];
    for (let s = 0; s < 6; s++) for (let f = 0; f <= frets(); f++) if (isTarget(p, s, f)) out.push({ s, f });
    return out;
  }

  // ---------- Question picking (weighted toward weak spots) ----------
  function pool(kind) {
    const out = [];
    for (let s = 0; s < 6; s++) {
      if (!S.set.strings[s]) continue;
      for (let f = lo(); f <= hi(); f++) {
        const midi = STR[s].open + f;
        const pc = midi % 12;
        if (!S.set.accidentals && !isNat(pc)) continue;
        if (kind === 'staff' && midi > 76) continue;
        out.push({ s, f, midi, pc });
      }
    }
    return out;
  }

  function weightOf(rec) {
    if (!rec || !rec.n) return 3;
    const acc = (rec.r + 1) / (rec.n + 2);
    const slow = rec.r && rec.t / rec.r > 5000 ? 1 : 0;
    return 1 + 4 * (1 - acc) + slow;
  }

  function pickWeighted(items, weight) {
    const ws = items.map(weight);
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  function makePrompt(last) {
    const m = S.set.mode;
    let kind = { flash: 'name', find: 'letter', string: 'string', staff: 'staff' }[m] || pick(['name', 'letter', 'string', 'staff']);
    let cells = pool(kind);
    if (!cells.length && kind === 'staff') { kind = 'name'; cells = pool(kind); }
    if (!cells.length) return null;

    let chosen;
    if (kind === 'letter') {
      const pcs = [...new Set(cells.map((c) => c.pc))];
      let cand = pcs.filter((pc) => !last || pc !== last.pc);
      if (!cand.length) cand = pcs;
      chosen = { pc: pickWeighted(cand, (pc) => weightOf(S.stats.notes[pc])) };
    } else {
      const same = (c) => !!last && (kind === 'staff' ? c.midi === last.midi
        : kind === 'string' ? c.s === last.s && c.pc === last.pc
        : c.s === last.s && c.f === last.f);
      let cand = cells.filter((c) => !same(c));
      if (!cand.length) cand = cells;
      chosen = pickWeighted(cand, (c) => weightOf(S.stats.cells[c.s + '-' + c.f]));
    }
    const spell = isNat(chosen.pc) ? 'sharp' : (Math.random() < 0.5 ? 'sharp' : 'flat');
    return {
      kind, spell, name: (spell === 'flat' ? FLAT : SHARP)[chosen.pc],
      s: chosen.s ?? null, f: chosen.f ?? null, midi: chosen.midi ?? null, pc: chosen.pc
    };
  }

  function record(p, ok, ms) {
    const bump = (rec) => {
      rec = rec || { n: 0, r: 0, t: 0 };
      rec.n += 1;
      if (ok) { rec.r += 1; rec.t += Math.min(ms, 15000); }
      return rec;
    };
    if (p.kind !== 'letter') S.stats.cells[p.s + '-' + p.f] = bump(S.stats.cells[p.s + '-' + p.f]);
    S.stats.notes[p.pc] = bump(S.stats.notes[p.pc]);
    save(KEYS.stats, S.stats);
  }

  // ---------- Teaching text (only shown after an answer) ----------
  function countUp(s, f) {
    const open = SHARP[STR[s].open % 12];
    if (f === 0) return 'The open ' + STR[s].num + ' string is ' + open + '.';
    return 'The ' + STR[s].num + ' string is ' + open + ' when open, so ' + ftxt(f) + ' is ' + bothNames(pcOf(s, f)) + '.';
  }

  function landmark(s, f) {
    const max = frets();
    if (f === 12) return 'Fret 12 is always the open string’s note, an octave higher.';
    if (f > 12) return 'Fret ' + f + ' is fret ' + (f - 12) + ' plus an octave, so they share a name.';
    if (s === 3 && f === 4) return 'Fret 4 on the 3rd string matches the open 2nd string.';
    if (f === 5 && s < 5 && s !== 3) return 'Fret 5 here sounds the same as the open ' + STR[s + 1].num + ' string.';
    if (s <= 3) {
      const up = s >= 2 ? 3 : 2;
      if (f + up <= max) return 'Octave shape: the same note sits two strings thinner at fret ' + (f + up) + '.';
    } else if (f - 3 >= 0) {
      return 'Octave shape: the same note sits two strings thicker at ' + ftxt(f - 3) + '.';
    }
    if ([4, 5, 11, 0].includes(pcOf(s, f))) return 'B–C and E–F are one fret apart. Every other pair of natural notes is two frets apart.';
    return '';
  }

  const joinFrets = (list) => {
    const t = list.map((c) => ftxt(c.f));
    return t.length <= 1 ? t.join('') : t.slice(0, -1).join(', ') + ' and ' + t[t.length - 1];
  };

  function nearest(list, from) {
    let best = list[0], d = Infinity;
    list.forEach((c) => {
      const dd = Math.abs(c.f - from.f) + Math.abs(c.s - from.s) * 0.8;
      if (dd < d) { d = dd; best = c; }
    });
    return best;
  }

  // ---------- Game flow ----------
  function start() {
    clearTimeout(advanceTimer);
    clearInterval(tickTimer);
    audio();
    S.g = freshGame('playing');
    S.labels = false;
    S.heat = false;
    S.peek = null;
    const g = S.g;
    g.prompt = makePrompt(null);
    if (!g.prompt) { S.g = freshGame('idle'); render(); return; }
    g.askedAt = Date.now();
    if (S.set.length === 'sprint') {
      g.endsAt = g.askedAt + SPRINT_MS;
      tickTimer = setInterval(tick, 200);
    }
    render();
  }

  function tick() {
    const g = S.g;
    if (g.status !== 'playing') { clearInterval(tickTimer); return; }
    const left = Math.max(0, g.endsAt - Date.now());
    const bar = document.querySelector('.timer i');
    const txt = document.querySelector('.time-text');
    if (bar) {
      bar.style.width = (left / SPRINT_MS * 100) + '%';
      bar.parentElement.classList.toggle('low', left < 10000);
    }
    if (txt) txt.textContent = Math.ceil(left / 1000);
    if (left <= 0 && g.phase === 'ask') { g.timeUp = true; endGame(); }
  }

  function resolve(ok, extra) {
    const g = S.g;
    const p = g.prompt;
    const ms = Date.now() - g.askedAt;
    const sprint = S.set.length === 'sprint';
    record(p, ok, ms);

    g.total += 1;
    if (ok) {
      g.correct += 1;
      g.score += 1;
      g.streak += 1;
      g.ms += ms;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
    } else {
      g.streak = 0;
      if (!sprint) g.lives -= 1;
      if (!g.missed.includes(p.pc)) g.missed.push(p.pc);
    }

    const names = p.spell === 'flat' ? FLAT : SHARP;
    const c = extra.cell;
    let answer, detail, sound;
    if (p.kind === 'name') {
      answer = bothNames(p.pc);
      detail = (ok ? '' : 'You picked ' + bothNames(extra.pc) + '. ') + countUp(p.s, p.f) + ' ' + landmark(p.s, p.f);
      sound = p.midi;
    } else {
      answer = p.name;
      const all = targets(p);
      const tapped = names[pcOf(c.s, c.f)];
      const where = STR[c.s].num + ' string, ' + ftxt(c.f);
      const near = ok ? c : nearest(all, c);
      sound = STR[near.s].open + near.f;
      if (p.kind === 'letter') {
        detail = ok
          ? 'Found it on the ' + where + '. Every ' + p.name + ' in range is ringed, so look for the pattern.'
          : 'You tapped ' + tapped + ' (' + where + '). Every ' + p.name + ' in range is ringed.';
      } else if (p.kind === 'string') {
        const spots = p.name + ' on the ' + STR[p.s].num + ' string is at ' + joinFrets(all) + '.';
        detail = ok ? spots + ' ' + landmark(c.s, c.f) : 'You tapped ' + tapped + ' at ' + ftxt(c.f) + '. ' + spots;
      } else {
        const sameName = !ok && pcOf(c.s, c.f) === p.pc;
        detail = ok
          ? 'That’s ' + p.name + ' at the written octave.' + (all.length > 1 ? ' It lives in ' + all.length + ' places in range, all ringed.' : '')
          : 'You tapped ' + tapped + ' (' + where + '). ' + (sameName ? 'Right note, wrong octave. ' : '') + 'The exact pitch is ringed.';
        detail += ' Guitar music is written an octave above how it sounds.';
      }
    }

    g.phase = ok ? 'right' : 'wrong';
    g.clicked = c || null;
    g.picked = extra.pc ?? null;
    g.result = { ok, answer, detail: detail.trim(), out: !sprint && g.lives <= 0 };
    pluck(sound);
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(advance, ok ? (sprint ? 700 : 1100) : (sprint ? 1600 : 3200));
    render();
  }

  function advance() {
    clearTimeout(advanceTimer);
    const g = S.g;
    if (g.status !== 'playing' || g.phase === 'ask') return;
    if (g.result.out) return endGame();
    if (S.set.length === 'sprint' && Date.now() >= g.endsAt) { g.timeUp = true; return endGame(); }
    g.prompt = makePrompt(g.prompt);
    if (!g.prompt) return endGame();
    g.phase = 'ask';
    g.clicked = null;
    g.picked = null;
    g.askedAt = Date.now();
    render();
  }

  function endGame() {
    clearTimeout(advanceTimer);
    clearInterval(tickTimer);
    const g = S.g;
    if (g.status !== 'playing') return;
    const key = highKey(S.set.mode, S.set.length);
    const prev = S.high[key] || 0;
    g.prevHigh = prev;
    g.newHigh = g.score > prev;
    if (g.newHigh) { S.high[key] = g.score; save(KEYS.high, S.high); }
    g.status = 'over';
    g.phase = 'ask';
    g.clicked = null;
    g.picked = null;
    render();
  }

  function answerNote(pc) {
    const g = S.g;
    if (!playing() || g.phase !== 'ask' || !g.prompt || g.prompt.kind !== 'name') return;
    resolve(pc === g.prompt.pc, { pc });
  }

  function canTap(s, f) {
    const g = S.g, p = g.prompt;
    return playing() && g.phase === 'ask' && !!p && p.kind !== 'name' && enabled(s, f) && (p.kind !== 'string' || s === p.s);
  }

  function onCell(s, f) {
    if (!playing()) {
      S.peek = { s, f };
      pluck(STR[s].open + f, true);
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => { S.peek = null; render(); }, 1600);
      render();
      return;
    }
    if (!canTap(s, f)) return;
    resolve(isTarget(S.g.prompt, s, f), { cell: { s, f } });
  }

  function setOpt(key, val) {
    clearTimeout(advanceTimer);
    clearInterval(tickTimer);
    S.set[key] = val;
    save(KEYS.settings, S.set);
    if (S.g.status !== 'idle') S.g = freshGame('idle');
    render();
  }

  function toggleString(i) {
    const arr = S.set.strings.slice();
    arr[i] = !arr[i];
    if (!arr.some(Boolean)) return;
    setOpt('strings', arr);
  }

  function toggle(which) {
    if (which === 'sound') {
      S.set.sound = !S.set.sound;
      save(KEYS.settings, S.set);
    } else if (!playing()) {
      S[which] = !S[which];
    }
    render();
  }

  function resetProgress() {
    clearTimeout(resetTimer);
    if (!S.confirmReset) {
      S.confirmReset = true;
      resetTimer = setTimeout(() => { S.confirmReset = false; render(); }, 4000);
    } else {
      S.confirmReset = false;
      S.stats = { cells: {}, notes: {} };
      save(KEYS.stats, S.stats);
    }
    render();
  }

  // ---------- Sound: a plucked string (Karplus–Strong) ----------
  let ctx = null;
  const buffers = new Map();

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function makePluck(c, midi) {
    const sr = c.sampleRate;
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    const len = Math.floor(sr * 1.8);
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const n = Math.max(2, Math.round(sr / hz));
    const ring = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) { prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5; ring[i] = prev; }
    let idx = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const nx = (idx + 1) % n;
      d[i] = ring[idx];
      ring[idx] = 0.996 * 0.5 * (ring[idx] + ring[nx]);
      idx = nx;
      peak = Math.max(peak, Math.abs(d[i]));
    }
    const fade = Math.floor(sr * 0.25);
    const scale = peak ? 0.7 / peak : 1;
    for (let i = 0; i < len; i++) d[i] *= scale * (i > len - fade ? (len - i) / fade : 1);
    return buf;
  }

  function pluck(midi, force) {
    if ((!S.set.sound && !force) || midi == null) return;
    const c = audio();
    if (!c) return;
    let buf = buffers.get(midi);
    if (!buf) { buf = makePluck(c, midi); buffers.set(midi, buf); }
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = 0.45;
    src.buffer = buf;
    src.connect(gain);
    gain.connect(c.destination);
    src.start();
  }

  // ---------- Rendering ----------
  const $ = (sel) => document.querySelector(sel);

  const TROPHY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B7791F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';
  const heart = (on) => '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8 3 4 6.8 4c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3C21 4 23.1 8 21.6 11.7 19.5 16.4 12 21 12 21z" fill="' + (on ? '#E5484D' : 'none') + '" stroke="' + (on ? '#E5484D' : '#B4BBC6') + '" stroke-width="1.8"/></svg>';

  const CLEF = 'M314 801Q300 854 291.0 906.0Q282 958 282 1012Q282 1059 288.5 1100.5Q295 1142 307 1177Q320 1217 341.0 1252.5Q362 1288 385.5 1311.0Q409 1334 427 1334Q451 1334 493 1249Q514 1206 524.0 1156.0Q534 1106 534 1049Q534 978 515.0 907.5Q496 837 459.5 775.0Q423 713 372 666L407 498Q422 500 432.0 501.0Q442 502 447 502Q508 502 556.0 467.5Q604 433 632.5 377.0Q661 321 661 254Q661 177 621.5 115.5Q582 54 503 25Q508 8 532 -117Q538 -147 541.0 -164.5Q544 -182 545.0 -195.0Q546 -208 546 -225Q546 -275 521.5 -314.5Q497 -354 455.5 -376.0Q414 -398 363 -398Q311 -398 271.0 -378.5Q231 -359 208.0 -324.5Q185 -290 185 -245Q185 -197 211.5 -165.0Q238 -133 287 -133Q329 -133 355.5 -163.5Q382 -194 382 -236Q382 -272 357.0 -299.0Q332 -326 292 -326H282Q308 -365 364 -365Q433 -365 472.0 -320.0Q511 -275 511 -205Q511 -188 507.0 -159.5Q503 -131 493 -91Q483 -51 477.5 -25.0Q472 1 470 12Q436 2 390 2Q304 2 222 52Q142 102 96.0 184.0Q50 266 50 361Q50 451 91 530Q132 609 192.5 675.0Q253 741 314 801ZM341 826Q364 838 390.0 870.5Q416 903 440.0 945.0Q464 987 479.0 1029.5Q494 1072 494 1106Q494 1142 483.0 1163.0Q472 1184 445 1184Q421 1184 398.5 1162.0Q376 1140 358.5 1103.5Q341 1067 331.0 1022.0Q321 977 321 930Q321 898 327.5 872.0Q334 846 341 826ZM398 379Q371 373 347.0 353.5Q323 334 308.5 306.5Q294 279 294 248Q294 223 307.0 196.5Q320 170 339 154Q352 142 365 136Q380 129 380 123Q380 120 370 117Q332 126 301.5 151.0Q271 176 253.5 211.5Q236 247 236 287Q236 330 253.5 370.0Q271 410 302.5 442.0Q334 474 374 490L345 641Q229 547 174.5 456.5Q120 366 120 277Q120 212 154.0 156.0Q188 100 247.0 65.5Q306 31 380 31Q400 31 420.5 35.0Q441 39 464 45ZM495 55Q593 97 593 227Q593 270 571.0 305.5Q549 341 512.0 362.0Q475 383 429 383Z';
  const SHARP_PATH = 'M97 46V189L50 177V277L97 290V486H128V298L195 314V509H226V322L275 333V234L226 220V77L275 89V-14L226 -26V-214H195V-34L128 -52V-247H97V-59L50 -71V32ZM195 70V214L128 197V54Z';
  const FLAT_PATH = 'M50 615H81V225Q118 262 165 262Q197 262 223.0 240.5Q249 219 249 178Q249 146 230.0 119.0Q211 92 179 65L110 6Q91 -10 76.0 -25.5Q61 -41 50 -55ZM81 12Q107 40 125.0 63.5Q143 87 153 105Q164 124 169.5 140.0Q175 156 175 170Q175 198 162.0 210.5Q149 223 134 223Q118 223 102.5 211.5Q87 200 81 180Z';
  const HEAD_PATH = 'M50 135Q50 172 77.0 200.0Q104 228 150.5 244.0Q197 260 253 260Q310 260 358.0 244.5Q406 229 435.0 201.0Q464 173 464 135Q464 96 436.0 67.5Q408 39 361.5 23.5Q315 8 259 8Q203 8 155.5 23.0Q108 38 79.0 66.5Q50 95 50 135ZM280 28Q314 28 326.5 53.0Q339 78 339 112Q339 147 324.5 176.0Q310 205 286.0 222.5Q262 240 232 240Q198 240 186.5 215.0Q175 190 175 156Q175 122 189.0 93.0Q203 64 226.5 46.0Q250 28 280 28Z';

  function staffSvg(p) {
    // Guitar music is written an octave above concert pitch.
    const wm = p.midi + 12;
    const oct = Math.floor(wm / 12) - 1;
    const pos = oct * 7 + (p.spell === 'flat' ? LET_F : LET_S)[wm % 12] - 30; // 0 = bottom line (E)
    const y = 124 - pos * 7;
    const ty = (y + 134 * 0.056).toFixed(2);
    let lines = '';
    [124, 110, 96, 82, 68].forEach((ly) => { lines += '<line x1="14" y1="' + ly + '" x2="246" y2="' + ly + '" stroke="#5E6470" stroke-width="1.4"/>'; });
    lines += '<line x1="14" y1="68" x2="14" y2="124" stroke="#5E6470" stroke-width="1.4"/><line x1="246" y1="68" x2="246" y2="124" stroke="#5E6470" stroke-width="1.4"/>';
    let ledgers = '';
    [-2, -4, -6].forEach((lp) => { if (pos <= lp) ledgers += '<line x1="133" y1="' + (124 - lp * 7) + '" x2="167" y2="' + (124 - lp * 7) + '" stroke="#16181D" stroke-width="1.6"/>'; });
    [10, 12, 14].forEach((lp) => { if (pos >= lp) ledgers += '<line x1="133" y1="' + (124 - lp * 7) + '" x2="167" y2="' + (124 - lp * 7) + '" stroke="#16181D" stroke-width="1.6"/>'; });
    const acc = isNat(p.pc) ? '' : '<path fill="#16181D" transform="translate(119 ' + ty + ') scale(0.056 -0.056)" d="' + (p.spell === 'flat' ? FLAT_PATH : SHARP_PATH) + '"/>';
    return '<svg viewBox="0 0 260 196" role="img" aria-label="A note on the treble staff">' + lines
      + '<path fill="#16181D" transform="translate(20 124) scale(0.056 -0.056)" d="' + CLEF + '"/>' + ledgers + acc
      + '<path fill="#16181D" transform="translate(' + (150 - 257 * 0.056).toFixed(2) + ' ' + ty + ') scale(0.056 -0.056)" d="' + HEAD_PATH + '"/></svg>';
  }

  const letterHtml = (name, small) => '<div class="q-letter' + (small ? ' sm' : '') + '" role="img" aria-label="Note ' + name + '">'
    + name.charAt(0) + (name.length > 1 ? '<span class="acc">' + name.slice(1) + '</span>' : '') + '</div>';

  function render() {
    const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
    renderHeader();
    renderGame();
    renderSide();
    renderBoard();
    renderSettings();
    if (focusKey) {
      const el = document.querySelector('[data-k="' + focusKey + '"]');
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  function renderHeader() {
    const lengthTag = S.set.length === 'sprint' ? ' · 60s' : '';
    $('#high-pill').innerHTML = TROPHY + '<span>High score · ' + MODES[S.set.mode].label + lengthTag + '</span><b>' + highFor(S.set.mode) + '</b>';
  }

  function renderGame() {
    const el = $('#game');
    const g = S.g;
    const p = g.prompt;
    el.classList.toggle('sticky', S.compact && playing() && !!p && p.kind !== 'name');

    if (!playing()) {
      el.dataset.built = '';
      el.innerHTML = g.status === 'over' ? overHtml() : idleHtml();
      return;
    }

    if (el.dataset.built !== 'play') {
      el.innerHTML = '<div class="hud"></div><div class="flip-wrap"><div class="flip"><div class="face front"></div><div class="face back" aria-live="polite"></div></div></div><div class="answers"></div>';
      el.dataset.built = 'play';
    }

    const sprint = S.set.length === 'sprint';
    const highNow = highFor(S.set.mode);
    const beating = highNow > 0 && g.score > highNow;
    const left = Math.max(0, g.endsAt - Date.now());
    el.querySelector('.hud').innerHTML =
      '<div class="hud-left">' + (sprint
        ? '<div class="timer' + (left < 10000 ? ' low' : '') + '" role="img" aria-label="Time left"><i style="width:' + (left / SPRINT_MS * 100) + '%"></i></div><span class="time-text">' + Math.ceil(left / 1000) + '</span>'
        : '<div class="hearts" role="img" aria-label="' + g.lives + ' of 3 lives left">' + [0, 1, 2].map((i) => heart(i < g.lives)).join('') + '</div>')
      + '</div><div class="hud-right">'
      + '<div class="stat">Score<b>' + g.score + '</b></div>'
      + '<span class="tag' + (g.streak >= 3 ? ' hot' : '') + '">Streak ' + g.streak + '</span>'
      + '<span class="tag beat' + (beating ? ' best' : '') + '">' + (beating ? 'New best!' : 'To beat: ' + highNow) + '</span>'
      + '<button type="button" class="btn-ghost" data-act="quit" data-k="quit">End game</button></div>';

    const flip = el.querySelector('.flip');
    const ask = g.phase === 'ask';
    flip.classList.toggle('turned', !ask);
    flip.classList.toggle('staff-q', p.kind === 'staff');

    if (ask) {
      const sname = STR[p.s ?? 0];
      const thick = (s) => STR[s].thick ? ' · ' + STR[s].thick : '';
      let html;
      if (p.kind === 'name') {
        html = '<span class="eyebrow">What note is this?</span>'
          + '<div class="q-big">' + (p.f === 0 ? 'Open string' : 'Fret ' + p.f) + '</div>'
          + '<div class="q-sub">on the ' + sname.num + ' string' + thick(p.s) + '</div>'
          + '<div class="q-hint">Marked with ? on the fretboard</div>';
      } else if (p.kind === 'letter') {
        html = '<span class="eyebrow">Find this note anywhere on the neck</span>' + letterHtml(p.name);
      } else if (p.kind === 'string') {
        html = '<span class="eyebrow">Find this note on one string</span>' + letterHtml(p.name, true)
          + '<div class="q-sub">on the ' + sname.num + ' string' + thick(p.s) + '</div>';
      } else {
        html = '<span class="eyebrow">Find this exact pitch</span><div class="staff">' + staffSvg(p) + '</div>'
          + '<div class="q-hint">Treble clef for guitar</div>';
      }
      el.querySelector('.front').innerHTML = html;
    } else {
      const r = g.result;
      const back = el.querySelector('.back');
      back.classList.toggle('no', !r.ok);
      back.innerHTML = '<div class="verdict-row"><span class="verdict">' + (r.ok ? 'Correct!' : (r.out ? 'Out of lives' : 'Not quite')) + '</span>'
        + '<span class="gain">' + (r.ok ? '+1' : (sprint ? '+0' : '−1 life')) + '</span></div>'
        + '<div class="answer">' + r.answer + '</div>'
        + '<p class="detail">' + r.detail + '</p>'
        + '<button type="button" class="btn-dark" data-act="next" data-k="next">' + (r.out ? 'See results' : 'Next') + '</button>';
    }

    const answers = el.querySelector('.answers');
    if (p.kind === 'name') {
      const acc = S.set.accidentals;
      const order = acc ? [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8] : [9, 11, 0, 2, 4, 5, 7];
      answers.innerHTML = '<div class="notes" role="group" aria-label="Pick the note" style="grid-template-columns:repeat(' + (acc ? 6 : 7) + ', minmax(0, 1fr))">'
        + order.map((pc) => {
          let cls = '';
          if (!ask) cls = pc === p.pc ? ' is-right' : pc === g.picked ? ' is-wrong' : '';
          const label = isNat(pc) ? SHARP[pc] : SHARP[pc] + '/' + FLAT[pc];
          return '<button type="button" class="note-btn' + (acc ? ' acc12' : '') + cls + '" data-act="note" data-v="' + pc + '" data-k="note' + pc + '" aria-label="' + bothNames(pc) + '"' + (ask ? '' : ' disabled') + '>' + label + '</button>';
        }).join('') + '</div>';
    } else {
      answers.innerHTML = '<div class="tap-hint">' + (ask ? (S.compact ? 'Tap' : 'Click') + ' it on the fretboard' + (S.compact ? '.' : ' below.') : '') + '</div>';
    }
  }

  function idleHtml() {
    const highNow = highFor(S.set.mode);
    const m = MODES[S.set.mode];
    const rules = S.set.length === 'sprint'
      ? 'You have 60 seconds. Each right answer is worth 1 point, and a miss only costs you time.'
      : 'Each right answer is worth 1 point. Miss 3 and the game ends.';
    return '<div class="panel">'
      + '<span class="eyebrow">' + m.label + ' · ' + LENGTHS[S.set.length].label + '</span>'
      + '<h2>' + (highNow > 0 ? 'High score to beat' : 'Set your first high score') + '</h2>'
      + '<div class="big-num" style="color:var(--accent)">' + highNow + '</div>'
      + '<p>' + m.rule + ' ' + rules + ' Notes you miss come back more often.</p>'
      + '<button type="button" class="btn-primary" data-act="start" data-k="start">Start game</button>'
      + '</div>';
  }

  function overHtml() {
    const g = S.g;
    const highNow = highFor(S.set.mode);
    let title, line, color = 'var(--ink)';
    if (g.newHigh) {
      title = 'New high score!';
      color = 'var(--accent)';
      line = g.prevHigh > 0
        ? 'You beat your old best of ' + g.prevHigh + ' by ' + (g.score - g.prevHigh) + ' ' + pts(g.score - g.prevHigh) + '.'
        : 'First high score set. Now try to beat it.';
    } else if (g.score === highNow && highNow > 0) {
      title = 'Tied your best';
      line = 'Matched your high score of ' + highNow + '. One more right answer would have beaten it.';
    } else if (g.score === 0) {
      title = 'Keep at it';
      line = 'No points this time. Try a smaller fret range or naturals only to warm up.';
    } else {
      title = 'So close';
      line = (highNow - g.score) + ' ' + pts(highNow - g.score) + ' short of your high score of ' + highNow + '. Run it back?';
    }
    const avg = g.correct ? ' · ' + (g.ms / g.correct / 1000).toFixed(1) + 's per right answer' : '';
    const missed = g.missed.length
      ? '<span class="eyebrow">Practice these</span><div class="missed">' + g.missed.map((pc) => '<span class="chip">' + bothNames(pc) + '</span>').join('') + '</div>'
      : '';
    return '<div class="panel">'
      + '<span class="eyebrow">' + (g.timeUp ? 'Time’s up' : 'Game over') + '</span>'
      + '<h2 style="color:' + color + '">' + title + '</h2>'
      + '<div class="big-num">' + g.score + '</div>'
      + '<p>' + line + '</p>'
      + '<p class="small">' + g.correct + ' right of ' + g.total + ' · best streak ' + g.bestStreak + avg + '</p>'
      + missed
      + '<button type="button" class="btn-primary" data-act="start" data-k="start">Play again</button>'
      + '</div>';
  }

  const accColor = (acc) => acc >= 0.8 ? '#16A34A' : acc >= 0.5 ? '#D97706' : '#DC2626';

  function renderSide() {
    const g = S.g;
    const hs = Object.keys(MODES).map((k) => '<div class="hs' + (k === S.set.mode ? ' on' : '') + '"><span>' + MODES[k].label + '</span><b>' + highFor(k) + '</b></div>').join('');
    const order = S.set.accidentals ? [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8] : [9, 11, 0, 2, 4, 5, 7];
    let answered = 0;
    Object.values(S.stats.notes).forEach((r) => { answered += r.n || 0; });
    const prog = order.map((pc) => {
      const r = S.stats.notes[pc];
      const acc = r && r.n ? r.r / r.n : null;
      const nm = isNat(pc) ? SHARP[pc] : SHARP[pc] + '/' + FLAT[pc];
      return '<span class="nm">' + nm + '</span><span class="bar"><i style="width:' + (acc == null ? 0 : Math.max(4, acc * 100)) + '%;background:' + (acc == null ? 'transparent' : accColor(acc)) + '"></i></span><span class="pct">' + (acc == null ? '–' : Math.round(acc * 100) + '%') + '</span>';
    }).join('');
    const avg = g.correct ? (g.ms / g.correct / 1000).toFixed(1) + 's' : '–';
    $('#side').innerHTML =
      '<h2>High scores</h2><span class="eyebrow">' + LENGTHS[S.set.length].label + '</span>'
      + '<div class="hs-list">' + hs + '</div>'
      + '<div class="rule"></div><span class="eyebrow">This game</span>'
      + '<div class="trio"><div><b>' + g.correct + '/' + g.total + '</b><span>Right</span></div>'
      + '<div><b>' + (g.total ? Math.round(g.correct / g.total * 100) + '%' : '–') + '</b><span>Accuracy</span></div>'
      + '<div><b>' + avg + '</b><span>Avg time</span></div></div>'
      + '<div class="rule"></div><span class="eyebrow">Your accuracy by note</span>'
      + '<div class="prog">' + prog + '</div>'
      + '<p class="side-note">' + (answered ? answered + ' answers so far. Notes you miss show up more often.' : 'Play a game and your accuracy for each note shows up here.') + '</p>'
      + (answered ? '<button type="button" class="btn-ghost reset" data-act="reset" data-k="reset">' + (S.confirmReset ? 'Click again to erase' : 'Reset progress') + '</button>' : '');
  }

  function stringBg(s, vertical) {
    const G = GUITAR[S.set.guitar];
    if (!G.wound[s]) return G.pCol;
    return 'repeating-linear-gradient(' + (vertical ? '0deg' : '90deg') + ', ' + G.wCol + ' 0 1.6px, ' + G.wDark + ' 1.6px 2.6px)';
  }

  function cellHtml(s, f, vertical) {
    const g = S.g, p = g.prompt;
    const live = playing() && !!p;
    const ask = g.phase === 'ask';
    const en = enabled(s, f);
    const pc = pcOf(s, f);
    const names = p && p.spell === 'flat' ? FLAT : SHARP;
    let mk = null, text = '', extra = '';

    if (live) {
      if (p.kind === 'name') {
        if (s === p.s && f === p.f) mk = ask ? 'q' : 'answer';
        else if (!ask && en && pc === p.pc) mk = 'reveal';
      } else {
        const target = isTarget(p, s, f);
        const clicked = g.clicked && g.clicked.s === s && g.clicked.f === f;
        if (clicked) mk = target ? 'right' : 'wrong';
        else if (!ask && target) mk = 'reveal';
      }
    } else if (S.peek && S.peek.s === s && S.peek.f === f) {
      mk = 'peek';
    } else if (S.heat && en && S.stats.cells[s + '-' + f] && S.stats.cells[s + '-' + f].n) {
      const r = S.stats.cells[s + '-' + f];
      mk = 'heat';
      extra = 'background:' + accColor(r.r / r.n) + ';';
    } else if (S.labels && en) {
      mk = 'label';
    }
    if (mk === 'q') text = '?';
    else if (mk === 'heat') text = S.labels ? names[pc] : '';
    else if (mk) text = names[pc];

    const tap = canTap(s, f);
    const study = !playing();
    const off = !en || (live && p.kind === 'string' && s !== p.s);
    const w = STR[s].w;
    const strStyle = vertical
      ? 'width:' + w + 'px;margin-left:' + (-w / 2) + 'px;background:' + stringBg(s, true)
      : 'height:' + w + 'px;margin-top:' + (-w / 2) + 'px;background:' + stringBg(s, false);
    let aria = STR[s].num + ' string, ' + ftxt(f);
    if (study) aria += ', play and show its name';
    const cls = 'cell' + (f === 0 ? ' open' : '') + (tap ? ' tap' : '') + (study ? ' study' : '') + (off ? ' off' : '');
    return '<button type="button" class="' + cls + '"' + (tap || study ? ' data-act="cell"' : ' disabled') + ' data-s="' + s + '" data-f="' + f + '" data-k="c' + s + '-' + f + '" aria-label="' + aria + '">'
      + '<span class="wire"></span><span class="str" style="' + strStyle + '"></span>'
      + (tap && !mk ? '<span class="ghost"></span>' : '')
      + (mk ? '<span class="mk ' + mk + '" style="' + extra + '">' + text + '</span>' : '')
      + '</button>';
  }

  const dotHtml = (top, left, size, color) => '<span class="dot" style="top:' + top + ';left:' + left + ';width:' + size + 'px;height:' + size + 'px;background:' + color + '"></span>';

  function renderBoard() {
    const G = GUITAR[S.set.guitar];
    const N = G.frets;
    const live = playing();
    const singles = [3, 5, 7, 9, 15, 17, 19, 21];
    const isSingle = (f) => singles.includes(f);
    const isDouble = (f) => f === 12 || f === 24;
    const showLetters = !live;
    const vertical = S.compact;
    const wood = 'background-color:' + G.wood + ';background-image:repeating-linear-gradient(' + (vertical ? '90deg' : '0deg') + ', ' + G.grain + ' 0 1px, transparent 1px 6px, ' + G.grain + ' 6px 7px, transparent 7px 13px);'
      + (G.binding ? (vertical ? 'border-left:3px solid ' + G.binding + ';border-right:3px solid ' + G.binding + ';' : 'border-top:3px solid ' + G.binding + ';border-bottom:3px solid ' + G.binding + ';') : '');

    let legend;
    if (live) {
      legend = '<span><i class="sw" style="background:var(--accent)"></i>Right</span>'
        + '<span><i class="sw" style="background:var(--wrong);border-radius:4px"></i>Wrong</span>'
        + '<span><i class="sw" style="background:#fff;border:2.5px solid var(--accent)"></i>Other spots</span>';
    } else if (S.heat) {
      legend = '<span><i class="sw" style="background:#16A34A"></i>80%+</span><span><i class="sw" style="background:#D97706"></i>50–79%</span><span><i class="sw" style="background:#DC2626"></i>Under 50%</span>';
    } else {
      legend = '';
    }
    const tgl = (key, label) => live ? '' : '<button type="button" class="toggle" data-act="toggle" data-v="' + key + '" data-k="t-' + key + '" aria-pressed="' + S[key] + '"><span class="track" aria-hidden="true"></span>' + label + '</button>';
    const sub = live
      ? G.label + ', ' + N + ' frets · standard tuning · faded frets are outside the game'
      : 'Click any fret to hear it and see its name. Note names and weak spots are hidden during games.';

    let board;
    if (!vertical) {
      const fr = [];
      let sum = 0;
      for (let f = 1; f <= N; f++) { const v = Math.pow(2, -(f - 1) / 24); sum += v; fr.push(Math.round(v * 1000) / 10 + 'fr'); }
      const cols = '52px ' + fr.join(' ');
      const minW = Math.round(84 + 52 + 32 * sum / Math.pow(2, -(N - 1) / 24));
      const order = S.set.lowTop ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
      const cap = (s) => STR[s].num + ' string' + (showLetters ? ' · ' + STR[s].name : '') + ' · ' + STR[s].thick;
      const topSide = S.set.lowTop ? 'Closest to your face as you play' : 'Closest to the floor as you play';
      const botSide = S.set.lowTop ? 'Closest to the floor as you play' : 'Closest to your face as you play';

      let inlays = '<div></div>';
      for (let f = 1; f <= N; f++) {
        inlays += '<div>' + (isSingle(f) ? dotHtml('50%', '50%', 13, G.dot) : '') + (isDouble(f) ? dotHtml('33.333%', '50%', 13, G.dot) + dotHtml('66.667%', '50%', 13, G.dot) : '') + '</div>';
      }
      const labels = order.map((s) => {
        const S2 = STR[s];
        const big = showLetters ? S2.letter : S2.num;
        const small = (showLetters ? S2.num : '') + (S2.thick ? (showLetters ? ' · ' : '') + S2.thick : '');
        return '<div class="slabel"><span class="t"><b>' + big + '</b><span>' + small + '</span></span><span aria-hidden="true" style="flex:none;width:14px;height:' + S2.w + 'px;border-radius:2px;background:' + stringBg(s, false) + '"></span></div>';
      }).join('');
      const rows = order.map((s) => {
        let cells = '';
        for (let f = 0; f <= N; f++) cells += cellHtml(s, f, false);
        return '<div class="srow" style="grid-template-columns:' + cols + '">' + cells + '</div>';
      }).join('');
      let nums = '';
      for (let f = 0; f <= N; f++) nums += '<div class="' + (isSingle(f) || isDouble(f) ? 'hi' : '') + '">' + (f === 0 ? 'Open' : f) + '</div>';

      board = '<div class="hscroll"><div class="hboard h" style="min-width:' + minW + 'px">'
        + '<div class="caps"><span>Top: ' + cap(order[0]) + '</span><span>' + topSide + '</span></div>'
        + '<div class="hbody"><div class="slabels" style="padding:' + (G.binding ? '3px 0' : '0') + '">' + labels + '</div>'
        + '<div class="wood" style="' + wood + '"><div class="inlays" aria-hidden="true" style="grid-template-columns:' + cols + '">' + inlays + '</div>' + rows + '</div></div>'
        + '<div class="caps"><span>Bottom: ' + cap(order[5]) + '</span><span>' + botSide + '</span></div>'
        + '<div class="fnums"><div class="pad"></div><div class="g" style="grid-template-columns:' + cols + '">' + nums + '</div></div>'
        + '</div></div>';
    } else {
      const head = '<div></div>' + STR.map((S2) => '<div><b>' + (showLetters ? S2.letter : S2.num) + '</b><span>' + (showLetters ? S2.num : '') + '</span></div>').join('');
      let nums = '', rows = '';
      for (let f = 0; f <= N; f++) {
        const h = f === 0 ? 50 : Math.max(44, Math.round(72 * Math.pow(2, -(f - 1) / 30)));
        nums += '<div class="' + (isSingle(f) || isDouble(f) ? 'hi' : '') + '" style="height:' + h + 'px">' + f + '</div>';
        let cells = '';
        for (let s = 0; s < 6; s++) cells += cellHtml(s, f, true);
        rows += '<div class="frow" style="height:' + h + 'px">'
          + (isSingle(f) ? dotHtml('50%', '50%', 12, G.dot) : '')
          + (isDouble(f) ? dotHtml('50%', '33.333%', 12, G.dot) + dotHtml('50%', '66.667%', 12, G.dot) : '')
          + cells + '</div>';
      }
      board = '<div class="vboard v">'
        + '<div class="caps" style="padding-left:30px"><span>6th · thickest</span><span>1st · thinnest</span></div>'
        + '<div class="vhead">' + head + '</div>'
        + '<div class="vbody"><div class="vnums">' + nums + '</div><div class="wood" style="' + wood + '">' + rows + '</div></div>'
        + '</div>';
    }

    $('#board').innerHTML = '<div class="board-head"><div><h2>Fretboard</h2><div class="sub">' + sub + '</div></div>'
      + '<div class="board-tools"><div class="legend">' + legend + '</div>' + tgl('labels', 'Note names') + tgl('heat', 'Weak spots') + '</div></div>'
      + board;
  }

  function renderSettings() {
    const live = playing();
    const seg = (key, val, label, sub) => {
      const on = S.set[key] === val;
      return '<button type="button" class="seg" data-act="set" data-key="' + key + '" data-v="' + val + '" data-k="s-' + key + '-' + val + '" aria-pressed="' + on + '"><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
    };
    const group = (title, cls, inner, note) => '<div class="set-group"><span class="eyebrow">' + title + '</span><div class="segs ' + cls + '" role="group" aria-label="' + title + '">' + inner + '</div>' + (note ? '<p class="set-note">' + note + '</p>' : '') + '</div>';

    const modes = Object.keys(MODES).map((k) => seg('mode', k, MODES[k].label, MODES[k].sub)).join('');
    const lengths = Object.keys(LENGTHS).map((k) => seg('length', k, LENGTHS[k].label, LENGTHS[k].sub)).join('');
    const guitars = Object.keys(GUITAR).map((k) => seg('guitar', k, GUITAR[k].label, GUITAR[k].sub)).join('');
    const ranges = Object.keys(RANGES).map((k) => seg('range', k, RANGES[k][2])).join('');
    const accs = seg('accidentals', false, 'Naturals', '7 notes') + seg('accidentals', true, 'All 12', 'With sharps and flats');
    const strings = STR.map((S2, i) => '<button type="button" class="seg" data-act="str" data-v="' + i + '" data-k="str' + i + '" aria-pressed="' + !!S.set.strings[i] + '" aria-label="' + S2.num + ' string" style="padding:4px 0"><b>' + S2.num.replace(/\D/g, '') + '</b><small>' + (live ? 'string' : S2.letter) + '</small></button>').join('');
    const flips = seg('lowTop', false, '1st on top', 'Like tab') + seg('lowTop', true, '6th on top', 'Like looking down');
    const sound = '<button type="button" class="toggle" data-act="toggle" data-v="sound" data-k="t-sound" aria-pressed="' + S.set.sound + '"><span class="track" aria-hidden="true"></span>Play the note after each answer</button>';

    $('#settings').innerHTML = '<h2>Settings</h2>'
      + (live ? '<p class="set-note" style="margin-top:-8px">Changing a setting ends the current game.</p>' : '')
      + '<div class="set-grid">'
      + group('Game mode', 'two', modes)
      + group('Game length', 'two', lengths)
      + group('Guitar', 'two', guitars)
      + group('Frets in the game', 'three', ranges)
      + group('Notes', 'two', accs)
      + group('Strings in the game', '', strings, '6 is the thickest string, 1 the thinnest.')
      + (S.compact ? '' : group('String on top', 'two', flips))
      + '<div class="set-group"><span class="eyebrow">Sound</span>' + sound + '</div>'
      + '</div>';
  }

  // ---------- Input ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const v = b.dataset.v;
    switch (b.dataset.act) {
      case 'start': start(); break;
      case 'quit': endGame(); break;
      case 'next': advance(); break;
      case 'note': answerNote(Number(v)); break;
      case 'cell': onCell(Number(b.dataset.s), Number(b.dataset.f)); break;
      case 'set': setOpt(b.dataset.key, v === 'true' ? true : v === 'false' ? false : v); break;
      case 'str': toggleString(Number(v)); break;
      case 'toggle': toggle(v); break;
      case 'reset': resetProgress(); break;
    }
  });

  const LETTER_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const g = S.g;
    const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if (e.key === 'Escape' && playing()) { e.preventDefault(); endGame(); return; }
    if ((e.key === ' ' || e.key === 'Enter') && !onButton) {
      e.preventDefault();
      if (!playing()) start();
      else if (g.phase !== 'ask') advance();
      return;
    }
    const pc = LETTER_PC[e.key.toLowerCase()];
    if (pc == null || !playing() || g.phase !== 'ask' || !g.prompt || g.prompt.kind !== 'name') return;
    e.preventDefault();
    let ans = pc;
    if (e.shiftKey) {
      if (!S.set.accidentals) return;
      ans = (pc + 1) % 12;
    }
    answerNote(ans);
  });

  const mq = window.matchMedia('(max-width: 899px)');
  S.compact = mq.matches;
  const onMq = () => { S.compact = mq.matches; render(); };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);

  render();
})();
