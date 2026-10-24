// Del modelo del proyecto (frases con tiempos) a una línea de tiempo palabra por palabra.
// Si la persona marcó palabra por palabra (mantener presionado), se respetan sus tiempos y duraciones;
// si marcó solo frases, los tiempos de las palabras se reparten por sílabas.
import { clamp, rng } from './util.js';
import { KC } from './grid.js';
import { direct, EXIT_BY_MOOD } from './director.js';
import { PALETTES } from './project-palettes.js';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function syllables(text) {
  const s = norm(text).replace(/[^a-z]/g, '');
  if (!s) return 1;
  const m = s.match(/[aeiouy]+/g);
  return Math.max(1, m ? m.length : 1);
}

export function weightOf(text) {
  const core = text.replace(/[^\p{L}\p{N}']/gu, '');
  let w = syllables(core) + 0.14 * core.length;
  if (/[,;:]$/.test(text)) w += 0.45;
  if (/[.!?…]$/.test(text) || /—$/.test(text)) w += 0.8;
  return w;
}

export function canStretch(text) {
  return /[aeou]/i.test(text);
}

export function tokenize(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export const HELD_MIN = 0.6; // segundos que hay que mantener para que cuente como palabra alargada (ajustable: style.holdMin)

// model: { phrases:[{text, sync:{t, wt?, wd?}|null}], clip:{start,end}, style, over, seed, intro, outro, offset }
export function buildTimeline(model) {
  const clip = model.clip || { start: 0, end: 60 };
  const start = clip.start;
  const duration = Math.max(1, clip.end - clip.start);
  const off = model.offset || 0;
  const style = model.style || {};
  const heldMin = clamp(style.holdMin ?? HELD_MIN, 0.3, 1.5);
  const raw = [];
  (model.phrases || []).forEach((p, src) => {
    const s = p.sync;
    if (!s || !Number.isFinite(s.t)) return;
    const words = tokenize(p.text);
    if (!words.length) return;
    let wt = null;
    let wd = null;
    if (Array.isArray(s.wt) && s.wt.length === words.length && s.wt.every(Number.isFinite)) {
      wt = s.wt.map((x) => x - start + off);
      wd = Array.isArray(s.wd) ? s.wd.slice() : [];
    }
    const t = wt ? wt[0] : s.t - start + off;
    if (t < -0.3 || t > duration - 0.6) return;
    raw.push({ src, t: Math.max(0, t), text: p.text, words, wt, wd });
  });
  raw.sort((a, b) => a.t - b.t);
  for (let i = 1; i < raw.length; i++) if (!raw[i].wt && raw[i].t < raw[i - 1].t + 0.2) raw[i].t = raw[i - 1].t + 0.2;

  const lines = [];
  raw.forEach((rl, i) => {
    const next = raw[i + 1];
    const words = rl.words;
    const n = words.length;
    const gap = (next ? next.t : duration) - rl.t;
    const wts = words.map(weightOf);
    const sum = wts.reduce((a, b) => a + b, 0);
    const wordMode = !!rl.wt;
    let onsets;
    let D;
    let lastEnd;
    if (wordMode) {
      onsets = rl.wt.map((x) => Math.max(0, x));
      for (let k = 1; k < n; k++) onsets[k] = Math.max(onsets[k], onsets[k - 1] + 0.06);
      const sungLast = rl.wd[n - 1] || 0;
      lastEnd = onsets[n - 1] + (sungLast >= heldMin ? sungLast : 0.5);
      D = Math.max(0.5, lastEnd - rl.t);
    } else {
      const dEst = sum * 0.27;
      D = gap <= 4.6 ? gap * 0.9 : clamp(dEst * 1.15, 3.2, gap * 0.9);
      D = Math.max(0.5, Math.min(D, gap * 0.95));
      onsets = [];
      let cum = 0;
      for (let k = 0; k < n; k++) {
        onsets.push(rl.t + D * (cum / sum));
        cum += wts[k];
      }
      lastEnd = rl.t + D;
    }
    const line = { i: lines.length, src: rl.src, t: rl.t, text: rl.text, words: [], D, wordMode };
    words.forEach((txt, k) => {
      const sung = wordMode ? rl.wd[k] || 0 : 0;
      line.words.push({ text: txt, onset: onsets[k], dur: 0, k, line, held: wordMode && sung >= heldMin, sung });
    });
    let hideAt;
    if (gap <= 5.4) hideAt = next ? Math.max(next.t, lastEnd + 0.2) : Math.min(duration - 0.6, lastEnd + 1.6);
    else hideAt = lastEnd + 1.5;
    if (!next) hideAt = Math.min(Math.max(hideAt, lastEnd + 0.8), duration - 0.5);
    hideAt = Math.max(hideAt, lastEnd + 0.15);
    line.hideAt = hideAt;
    line.words.forEach((w, k) => {
      const nx = line.words[k + 1];
      if (w.held) w.dur = w.sung;
      else if (nx) w.dur = wordMode ? Math.min(nx.onset - w.onset, 0.7) : nx.onset - w.onset;
      else w.dur = Math.max(lastEnd - w.onset, 0.4);
    });
    const span = hideAt - rl.t;
    line.exitDur = span < 0.9 ? 0.22 : clamp((hideAt - lastEnd) * 0.6 + 0.35, 0.42, 0.72);
    line.exitStart = Math.max(rl.t + 0.3, hideAt - line.exitDur);
    line.exitDur = hideAt - line.exitStart;
    lines.push(line);
  });

  const opts = {
    faces: style.faces,
    palette: PALETTES[style.palette] || null,
    random: style.random ?? 0.35,
    fill: style.fill || 'auto',
    mood: style.mood && style.mood !== 'auto' ? style.mood : null,
    fx: style.fxAuto ?? 0.5,
    caps: style.caps || 'off',
    fxSet: style.fxSet || null,
    over: model.over || {},
  };
  direct(lines, model.seed || 0, duration, opts);

  const focus = style.focus === 'line' ? 'line' : 'word';
  const units = focus === 'word' ? makeUnits(lines, model.over || {}, model.seed || 0) : [];
  const first = lines.length ? lines[0].t : 0;
  let lastHide = lines.length ? lines[lines.length - 1].hideAt : 0;
  for (const u of units) lastHide = Math.max(lastHide, u.hideAt);
  return { lines, units, focus, intro: model.intro ?? 'para ti', outro: model.outro ?? '', duration, first, lastHide, introMood: 'stars', outroMood: 'hearts', seed: model.seed || 0, style };
}

// "Palabra principal": cada palabra (o dos o tres cortas) es la protagonista mientras suena.
function makeUnits(lines, over, seed) {
  const units = [];
  lines.forEach((line) => {
    let cur = [];
    const flush = () => {
      if (cur.length) {
        units.push({ line, words: cur });
        cur = [];
      }
    };
    line.words.forEach((w) => {
      if (!cur.length) {
        cur.push(w);
        return;
      }
      const first = cur[0];
      const chars = cur.reduce((a, x) => a + x.text.length + 1, 0) + w.text.length;
      const lead = cur.length === 1 && !first.held && first.text.replace(/[^\p{L}]/gu, '').length <= 3;
      const quick = w.onset - first.onset < 0.5;
      const anyHeld = cur.some((x) => x.held) || w.held;
      if (!anyHeld && cur.length < 3 && chars <= 16 && (lead || quick)) cur.push(w);
      else {
        flush();
        cur.push(w);
      }
    });
    flush();
  });
  units.forEach((u, n) => {
    const ws = u.words;
    const last = ws[ws.length - 1];
    u.i = n;
    u.src = u.line.src;
    u.t = ws[0].onset;
    u.end = last.onset + Math.max(last.dur, 0.25);
    u.noGhost = true;
    u.pal = u.line.pal;
    u.mood = u.line.mood;
    u.tone = 'cream';
  });
  let prevExit = '';
  units.forEach((u, n) => {
    const line = u.line;
    const ws = u.words;
    const nx = units[n + 1];
    const cont = nx && nx.t - u.end < 0.45;
    const exitDur = clamp((nx ? Math.min(nx.t - u.t, 1.2) : 1) * 0.5, 0.22, 0.5);
    let exitStart;
    if (cont) exitStart = Math.max(u.t + 0.28, nx.t - exitDur + 0.12);
    else exitStart = Math.max(u.t + 0.3, u.end + Math.min(0.55, nx ? (nx.t - u.end) * 0.5 : 0.8));
    u.exitStart = exitStart;
    u.exitDur = exitDur;
    u.hideAt = exitStart + exitDur;
    // salida: la de la frase si la persona la eligió; si no, una distinta cada vez según el ambiente
    const po = over['p' + line.src];
    if (po && po.exit) u.exit = po.exit;
    else {
      const opts = EXIT_BY_MOOD[line.mood] || ['dissolve', 'wipe'];
      const r = rng((seed | 0) * 131 + line.src * 977 + n * 17 + 5);
      let ex = opts[Math.floor(r() * opts.length)];
      if (ex === prevExit && opts.length > 1) ex = opts[(opts.indexOf(ex) + 1) % opts.length];
      u.exit = ex;
    }
    prevExit = u.exit;
    ws.forEach((w, k) => {
      w.exitDelay = (k / Math.max(1, ws.length)) * exitDur * 0.3;
      w.exitDur = exitDur * 0.66;
    });
  });
  return units;
}

// Línea "sintética" para título, mensaje final, avisos. Siempre visible tras aparecer.
export function pseudoLine(text, t0, opts = {}) {
  const words = tokenize(text);
  const line = { i: -1, t: t0, text, words: [], D: 0, hideAt: Infinity, exitDur: 0.5, exitStart: Infinity, tone: opts.tone || 'dual', pal: opts.pal ?? 0, exit: 'dissolve', pseudo: true };
  words.forEach((txt, k) => {
    const w = {
      text: txt,
      onset: t0 + k * (opts.stagger ?? 0.22),
      dur: 0.5,
      k,
      line,
      stretch: false,
      stretchEm: 0,
      appear: opts.appear || (k % 2 ? 'rise' : 'decode'),
      appearDur: opts.appearDur || 0.8,
      hold: opts.hold || 'breathe',
      seed: 900 + k * 13,
      exitDelay: 0,
      exitDur: 0.5,
    };
    line.words.push(w);
  });
  return line;
}

export const TONE_COLORS = {
  cream: { core: KC.CREAM, edge: KC.BLUSH },
  rose: { core: KC.ROSE, edge: KC.DEEP },
  amber: { core: KC.AMBER, edge: KC.PEACH },
};

// colores por nombre: núcleo (zonas claras) y borde (zonas tenues / sombra)
export const COLORS = {
  white: { core: KC.WHITE, edge: KC.ICE },
  cream: { core: KC.CREAM, edge: KC.BLUSH },
  rose: { core: KC.ROSE, edge: KC.DEEP },
  pink: { core: KC.FUCHSIA, edge: KC.VIOLET },
  gold: { core: KC.GOLD, edge: KC.ORANGE },
  amber: { core: KC.AMBER, edge: KC.PEACH },
  cyan: { core: KC.CYAN, edge: KC.VIOLET },
  ice: { core: KC.ICE, edge: KC.CYAN },
  mint: { core: KC.MINT, edge: KC.CYAN },
  violet: { core: KC.VIOLET, edge: KC.FUCHSIA },
  ruby: { core: KC.RUBY, edge: KC.DEEP },
  blush: { core: KC.BLUSH, edge: KC.ROSE },
  orange: { core: KC.ORANGE, edge: KC.RUBY },
  lav: { core: KC.LAV, edge: KC.VIOLET },
};
