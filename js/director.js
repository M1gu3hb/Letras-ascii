// Director: decide solo la puesta en escena de cada frase y de cada palabra.
// Mira el significado de la palabra (léxico general en inglés y español), sus vocales y acentos,
// cuánto dura, la puntuación, si rima con otra frase y si la frase se repite (estribillo).
// Todo es determinista: la misma letra + la misma semilla producen siempre lo mismo.
import { clamp, rng, pickWeighted } from './util.js';

export const WORD_FX = ['glow', 'blink', 'explode', 'defrag'];
import { MOODS } from './bg.js';

export const NEEDS_TIME = { flip3d: 0.62, assemble: 0.7, burst: 0.55, spiral: 0.8, typewriter: 0.5, drop: 0.55, rise: 0.5, decode: 0.45, zoom: 0.45, slide: 0.5, scan: 0.4, pop: 0.28, glitch: 0.5 };

export const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

// ───────────── léxico: familias de significado -> puesta en escena ─────────────
const STEMS = {
  down: 'down sink sank fall fell drop under below low deep drown bajo baja bajar caer caig hund profund abajo',
  up: 'up rise rose high fly flew sky above top climb arriba alto alta volar vuel subir sube',
  slow: 'slow wait still calm easy gentle quiet lent despac calma tranquil pausa espera',
  fast: 'fast run ran quick rush hurry speed race rapid corr prisa veloz apur',
  break: 'break broke broken crash shatter crack tear rompe romp quiebr destru rasg',
  come: 'come came here near close closer closest approach aqui ven cerca acerc llega',
  leave: 'leave left go gone going away far goodbye bye lejos irse ido adios marcha partir',
  see: 'see saw seen look watch eye eyes stare view ver mira ojos vista',
  love: 'love heart kiss darling baby honey lover amor corazon beso carino querid amad',
  need: 'need want miss crave long desire wish hope necesit quier extran anhel deseo',
  hold: 'hold keep stay stuck tight grip hug embrace cling abraz quedar aferr sosten',
  strong: 'strong hard tough power brave fierce fuerte duro poder valient',
  cold: 'cool cold ice freeze frozen chill winter frio hielo helad',
  hot: 'hot fire burn flame sun heat warm fuego quem calor sol ardi',
  night: 'night dark moon midnight shadow dusk noche oscur luna sombra',
  now: 'now today tonight ahora hoy',
  always: 'always forever everywhere everything every all ever siempre todo jamas',
  no: 'no not never dont cant wont nada nunca',
  oh: 'oh ah ooh uh yeah hey whoa mmm woah',
  time: 'time think mind thought remember memory tiempo pens mente recuer',
  together: 'together pair both couple two one us we juntos par dos uno',
  sing: 'sing song music dance dancing beat rhythm cancion musica bail ritmo',
  cry: 'cry cried tear tears rain storm llor lagrim lluvia tormenta',
  smile: 'smile laugh joy happy fun sonri risa alegr feliz',
  dream: 'dream sleep wake awake sueno dorm desper',
  sweet: 'sweet soft tender sugar dulce suave tiern',
};
const STEM_LIST = [];
for (const [cat, str] of Object.entries(STEMS)) for (const st of str.split(' ')) STEM_LIST.push([st, cat]);
// los tallos cortos deben coincidir exactos; los largos, por prefijo
function catOf(n) {
  if (!n) return null;
  for (const [st, cat] of STEM_LIST) {
    if (st.length <= 3 ? n === st : n.startsWith(st)) return cat;
  }
  return null;
}

const FN = new Set('the a an of to in on at it its is are was were be been am i and or but so if as de la el los las y e o u que en un una unos unas con por para se su sus al del lo le les es son'.split(' '));
const PRON = new Set('you your youre me my mine we us our tu te ti yo mi nos'.split(' '));

const CATS = {
  down: { fx: ['drop'], hold: ['sway3d', 'bob'], face: ['heavy', 'tall'], col: ['ice', 'cyan'], mood: 'rain', size: 1.15, exit: 'sink3d' },
  up: { fx: ['rise'], hold: ['bob'], face: ['serif'], col: ['cream', 'gold'], mood: 'stars', size: 1.1 },
  slow: { fx: ['decode'], hold: ['breathe'], face: ['serif', 'roman'], col: ['violet', 'ice'], mood: 'waves', size: 1.15, long: true },
  fast: { fx: ['slide', 'burst'], hold: ['bob'], face: ['tall', 'wide'], col: ['orange', 'gold'], mood: 'tunnel', size: 1.1 },
  break: { fx: ['glitch', 'burst'], hold: ['wave'], face: ['tall'], col: ['ruby', 'white'], mood: 'matrix', size: 1.2, exit: 'defrag' },
  come: { fx: ['zoom'], hold: ['sway3d'], face: ['heavy', 'wide'], col: ['white', 'pink'], mood: 'tunnel', size: 1.2 },
  leave: { fx: ['slide', 'scan'], hold: ['bob'], face: ['hand'], col: ['violet', 'ice'], mood: 'fireflies', size: 1.05, exit: 'wipe' },
  see: { fx: ['scan', 'decode'], hold: ['breathe'], face: ['roman'], col: ['cyan', 'white'], mood: 'aurora', size: 1.1 },
  love: { fx: ['assemble'], hold: ['breathe'], face: ['script'], col: ['pink', 'rose'], mood: 'hearts', size: 1.3 },
  need: { fx: ['spiral', 'assemble'], hold: ['breathe'], face: ['serif', 'script'], col: ['rose', 'pink'], mood: 'rings', size: 1.2 },
  hold: { fx: ['assemble', 'pop'], hold: ['breathe'], face: ['heavy'], col: ['gold', 'cream'], mood: 'fireflies', size: 1.15 },
  strong: { fx: ['zoom', 'drop'], hold: ['bob'], face: ['tall', 'heavy'], col: ['gold', 'orange'], mood: 'embers', size: 1.3 },
  cold: { fx: ['scan'], hold: ['breathe'], face: ['roman'], col: ['ice', 'cyan'], mood: 'snow', size: 1.1 },
  hot: { fx: ['rise', 'burst'], hold: ['wave'], face: ['heavy'], col: ['orange', 'gold'], mood: 'embers', size: 1.2 },
  night: { fx: ['decode'], hold: ['breathe'], face: ['serif'], col: ['violet', 'ice'], mood: 'stars', size: 1.15 },
  now: { fx: ['zoom', 'pop'], hold: ['bob'], face: ['wide'], col: ['white', 'gold'], mood: null, size: 1.15 },
  always: { fx: ['burst', 'spiral'], hold: ['wave'], face: ['wide', 'heavy'], col: ['gold', 'white'], mood: 'tunnel', vote: 0.7, size: 1.2 },
  no: { fx: ['glitch', 'drop'], hold: ['bob'], face: ['tall'], col: ['ruby', 'white'], mood: 'matrix', vote: 0.5, size: 1.15 },
  oh: { fx: ['decode', 'rise'], hold: ['wave'], face: ['script', 'hand'], col: ['pink', 'violet'], mood: 'plasma', vote: 0.5, size: 1.2, long: true },
  time: { fx: ['typewriter'], hold: ['breathe'], face: ['hand'], col: ['cream', 'ice'], mood: 'snow', vote: 0.7, size: 1.1 },
  together: { fx: ['assemble'], hold: ['breathe'], face: ['script'], col: ['gold', 'rose'], mood: 'hearts', vote: 0.8, size: 1.2 },
  sing: { fx: ['pop', 'rise'], hold: ['wave'], face: ['hand', 'wide'], col: ['pink', 'cyan'], mood: 'spectrum', size: 1.15 },
  cry: { fx: ['drop'], hold: ['sway3d'], face: ['serif'], col: ['cyan', 'ice'], mood: 'rain', size: 1.15, exit: 'fall' },
  smile: { fx: ['pop', 'rise'], hold: ['bob'], face: ['script'], col: ['gold', 'pink'], mood: 'fireflies', size: 1.2 },
  dream: { fx: ['decode'], hold: ['breathe'], face: ['script'], col: ['violet', 'mint'], mood: 'aurora', size: 1.2, long: true },
  sweet: { fx: ['rise', 'decode'], hold: ['breathe'], face: ['script', 'serif'], col: ['blush', 'gold'], mood: 'hearts', size: 1.15 },
};

const PLAIN_FX = [
  ['decode', 2],
  ['rise', 2],
  ['flip3d', 1.6],
  ['drop', 1.1],
  ['zoom', 1],
  ['slide', 1],
  ['scan', 0.9],
  ['assemble', 0.8],
  ['typewriter', 1],
  ['burst', 0.5],
  ['spiral', 0.5],
];
const LONG_FX = [
  ['decode', 2],
  ['rise', 2],
  ['drop', 1.3],
  ['zoom', 1.2],
  ['slide', 1],
];
const SHORT_FX = [
  ['pop', 3],
  ['scan', 1],
  ['decode', 1.5],
  ['drop', 1.2],
];
const MOOD_FX = {
  pulse: ['pop', 'zoom', 'burst'],
  rain: ['drop', 'decode', 'rise'],
  embers: ['rise', 'assemble', 'decode'],
  waves: ['slide', 'rise', 'decode'],
  tunnel: ['zoom', 'slide', 'scan'],
  matrix: ['decode', 'scan', 'glitch'],
  snow: ['decode', 'rise', 'typewriter'],
  rings: ['pop', 'zoom', 'assemble'],
  fireflies: ['assemble', 'rise', 'decode'],
  spectrum: ['pop', 'scan', 'slide'],
  plasma: ['flip3d', 'decode', 'zoom'],
  hearts: ['assemble', 'pop', 'rise'],
  aurora: ['decode', 'scan', 'rise'],
  stars: ['decode', 'rise', 'flip3d'],
};
const PLAIN_FACES = [
  ['round', 3],
  ['heavy', 2],
  ['round', 1],
];
const ACCENT_FACES = ['serif', 'script', 'tall', 'wide', 'hand', 'roman'];
const HOLDS = [
  ['bob', 3],
  ['wave', 1.6],
  ['sway3d', 1.2],
  ['breathe', 2],
];
const EXITS = [
  ['dissolve', 2],
  ['wipe', 1.6],
  ['sink3d', 1.4],
  ['fall', 1.2],
  ['defrag', 0.7],
];
export const EXIT_BY_MOOD = {
  pulse: ['dissolve', 'wipe', 'defrag'],
  rain: ['fall', 'sink3d', 'dissolve'],
  embers: ['dissolve', 'fall'],
  waves: ['sink3d', 'wipe', 'dissolve'],
  tunnel: ['wipe', 'sink3d'],
  matrix: ['defrag', 'dissolve'],
  snow: ['dissolve', 'fall'],
  rings: ['dissolve', 'wipe'],
  fireflies: ['dissolve', 'wipe'],
  spectrum: ['wipe', 'dissolve'],
  plasma: ['wipe', 'defrag'],
  hearts: ['dissolve', 'sink3d'],
  aurora: ['wipe', 'dissolve'],
  stars: ['dissolve', 'wipe', 'sink3d'],
};
const SECTION_MOODS = ['stars', 'waves', 'aurora', 'embers', 'rain', 'fireflies', 'snow', 'plasma'];
const CHORUS_MOODS = ['rings', 'spectrum', 'pulse', 'tunnel', 'hearts'];

const canStretch = (text) => /[aeou]/i.test(text);
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// terminación sonora de la última palabra, para detectar rimas
function rhymeSig(text) {
  const n = norm(text);
  if (n.length < 3) return n;
  const m = n.match(/[aeiouy]+[^aeiouy]*$/);
  return m && m[0].length >= 2 ? m[0] : n.slice(-3);
}

const ALL_FACES = ['round', 'heavy', 'serif', 'script', 'tall', 'hand', 'wide', 'roman'];
const ALL_COLORS = ['white', 'cream', 'blush', 'rose', 'pink', 'gold', 'amber', 'orange', 'cyan', 'ice', 'mint', 'violet', 'lav'];
const RANDOM_FX = [
  ['decode', 1.5],
  ['rise', 1.5],
  ['flip3d', 1.4],
  ['drop', 1.2],
  ['zoom', 1.2],
  ['slide', 1.2],
  ['scan', 1],
  ['assemble', 1.2],
  ['typewriter', 1],
  ['burst', 1.2],
  ['spiral', 1.2],
  ['glitch', 1],
  ['pop', 1],
];

// Lo que la persona decidió: ajustes generales (tipografías, colores, qué tan al azar, relleno)
// y cambios palabra por palabra. Es determinista: misma letra + misma semilla = mismo resultado.
function restyle(line, opts, si, seed) {
  // (el relleno de línea completa se fija aparte, al final de la dirección de cada frase)
  const faces = opts.faces && opts.faces.length && opts.faces.length < ALL_FACES.length ? opts.faces : null;
  const pal = opts.palette && opts.palette.length ? opts.palette : null;
  const rnd = clamp(opts.random ?? 0, 0, 1);
  const rr = rng((seed | 0) * 7331 + si * 4259 + 17);
  let prevCol = '';
  line.words.forEach((w, k) => {
    if (rnd > 0 && rr() < rnd * 0.85) {
      const plain = w.text.replace(/[^\p{L}]/gu, '');
      const longish = w.held || w.dur >= 0.78;
      const short = w.dur < 0.3 || plain.length <= 2;
      w.appear = pickWeighted(rr, longish ? LONG_FX : short ? SHORT_FX : RANDOM_FX);
      w.face = ALL_FACES[Math.floor(rr() * ALL_FACES.length)];
      w.hold = pickWeighted(rr, HOLDS);
      if (rnd > 0.45 && !pal) w.colKey = ALL_COLORS[Math.floor(rr() * ALL_COLORS.length)];
      if (rr() < rnd * 0.6) w.size = clamp(0.8 + rr() * 0.62, 0.7, 1.5);
    }
    if (faces && !faces.includes(w.face)) w.face = faces[Math.floor(rr() * faces.length)];
    if (pal) {
      let c = pal[Math.floor(rr() * pal.length)];
      if (c === prevCol && pal.length > 1) c = pal[(pal.indexOf(c) + 1) % pal.length];
      w.colKey = c;
      prevCol = c;
    }
    if (opts.fill === 'edge') w.palOverride = 5;
    else if (opts.fill === 'self') w.palOverride = 4;
    else if (opts.fill === 'classic') w.palOverride = 0;
  });
}

function applyOver(line, over) {
  if (!over) return;
  const si = line.src ?? line.i;
  line.words.forEach((w, k) => {
    const o = over[si + '.' + k];
    if (!o) return;
    if (o.face && ALL_FACES.includes(o.face)) w.face = o.face;
    if (o.col) w.colKey = o.col;
    if (o.fx) w.appear = o.fx;
    if (o.hold) w.hold = o.hold;
    if (o.size) w.size = clamp(o.size, 0.5, 1.8);
    if (o.thick != null && Number.isFinite(+o.thick)) w.thick = clamp(+o.thick, -1, 1);
    if (o.fill != null) w.fill = !!o.fill;
    if (o.pal != null) w.palOverride = o.pal;
    if (o.stretch != null) w.stretch = !!o.stretch && canStretch(w.text);
    if (o.ext != null) {
      w.userExt = clamp(+o.ext || 0, 0, 2.2);
      w.stretch = w.userExt > 0.02 && canStretch(w.text);
    }
    if (Array.isArray(o.fxs)) w.userFxs = o.fxs.filter((f) => WORD_FX.includes(f));
    if (o.caps != null) w.userCaps = !!o.caps;
    w.userSet = true;
  });
  const po = over['p' + si];
  if (po && po.exit) line.exit = po.exit;
}

// ───────────── API ─────────────
export function direct(lines, seed = 0, duration = 58.3, opts = {}) {
  const total = lines.length;
  const sBase = (seed | 0) * 7919 + 101;
  const fixedMood = opts.mood && MOODS[opts.mood] ? opts.mood : null;

  // pase 0: llaves de frase y conteo de repeticiones (estribillos)
  const counts = new Map();
  lines.forEach((line) => {
    line.key = line.words.map((w) => norm(w.text)).join(' ');
    counts.set(line.key, (counts.get(line.key) || 0) + 1);
  });

  // pase 1: significado de cada palabra y votos de ambiente por frase
  lines.forEach((line) => {
    line.votes = {};
    line.words.forEach((w) => {
      w.n = norm(w.text);
      w.cat = catOf(w.n);
      w.fn = !w.cat && FN.has(w.n);
      w.pron = !w.cat && PRON.has(w.n);
      const C = w.cat ? CATS[w.cat] : null;
      if (C && C.mood) line.votes[C.mood] = (line.votes[C.mood] || 0) + (C.vote ?? 1);
    });
  });

  // pase 2: ambiente por frase (secciones, votos por significado y estribillos)
  const secStart = [0];
  for (let i = 1; i < total; i++) {
    const gap = lines[i].t - lines[i - 1].t;
    if (gap >= 2.4 || i - secStart[secStart.length - 1] >= 4) secStart.push(i);
  }
  const secOf = new Array(total).fill(0);
  secStart.forEach((s0, si) => {
    const s1 = si + 1 < secStart.length ? secStart[si + 1] : total;
    for (let i = s0; i < s1; i++) secOf[i] = si;
  });
  const r0 = rng(sBase);
  const secOffset = Math.floor(r0() * SECTION_MOODS.length);
  const motifMood = new Map();
  let chorusN = 0;
  let prevMood = null;
  lines.forEach((line, i) => {
    let m = null;
    const reps = counts.get(line.key);
    if (reps >= 2 && line.key.length >= 8) {
      if (!motifMood.has(line.key)) motifMood.set(line.key, CHORUS_MOODS[(chorusN++ + (seed | 0)) % CHORUS_MOODS.length]);
      m = motifMood.get(line.key);
    } else {
      const v = {};
      for (let k = i - 1; k <= i + 1; k++) {
        if (k < 0 || k >= total) continue;
        for (const [mm, c] of Object.entries(lines[k].votes)) v[mm] = (v[mm] || 0) + c * (k === i ? 1 : 0.5);
      }
      let best = null;
      let bv = 0;
      for (const [mm, c] of Object.entries(v)) {
        if (c > bv) {
          bv = c;
          best = mm;
        }
      }
      m = bv >= 1 ? best : SECTION_MOODS[(secOf[i] + secOffset) % SECTION_MOODS.length];
    }
    // dos secciones seguidas con el mismo ambiente por defecto aburren: se mueve al siguiente
    if (m === prevMood && i > 0 && secOf[i] !== secOf[i - 1] && !(reps >= 2)) m = SECTION_MOODS[(SECTION_MOODS.indexOf(m) + 1 + SECTION_MOODS.length) % SECTION_MOODS.length];
    if (!(reps >= 2) && i >= 2 && lines[i - 1].mood === m && lines[i - 2].mood === m) {
      const base = SECTION_MOODS[(secOf[i] + secOffset) % SECTION_MOODS.length];
      m = base === m ? SECTION_MOODS[(SECTION_MOODS.indexOf(m) + 1) % SECTION_MOODS.length] : base;
    }
    line.mood = fixedMood || (MOODS[m] ? m : 'stars');
    const mo = opts.over && opts.over['p' + (line.src ?? i)];
    if (mo && mo.mood && MOODS[mo.mood]) line.mood = mo.mood;
    prevMood = line.mood;
  });

  // pase 3: dirección de cada palabra (clonando la primera vez que aparece una frase repetida)
  const firstOf = new Map();
  const seen = new Map();
  const sigs = [];
  lines.forEach((line, i) => {
    const rep = seen.get(line.key) || 0;
    seen.set(line.key, rep + 1);
    line.rep = rep;
    if (rep > 0 && firstOf.has(line.key) && line.key.length >= 8) {
      const src = firstOf.get(line.key);
      line.exit = src.exit;
      line.pal = src.pal;
      line.kw = src.kw;
      line.words.forEach((w, k) => {
        const o = src.words[k];
        Object.assign(w, { appear: o.appear, hold: o.hold, face: o.face, colKey: o.colKey, size: o.size, fill: o.fill, palOverride: o.palOverride, stretch: o.stretch && (w.held || w.dur >= 0.6) });
        if (rep >= 2) {
          w.size = clamp(w.size * 1.06, 0.7, 1.5);
          if (k === src.kw) w.colKey = 'white';
        }
      });
      applyOver(line, opts.over);
      styleDurations(line);
      sigs.push(null);
      return;
    }
    const si = line.src ?? i;
    const r = rng(sBase + si * 977 + 13);
    const palette = (MOODS[line.mood] || MOODS.stars).cols;
    const n = line.words.length;
    // palabra clave de la frase
    let kw = -1;
    let ks = -1;
    line.words.forEach((w, k) => {
      let sc = 0;
      if (w.cat) sc += 3;
      if (w.fn) sc -= 5;
      if (w.pron) sc -= 1;
      if (w.dur >= 0.78 && canStretch(w.text)) sc += 2;
      if (/[áéíóúÁÉÍÓÚ]/.test(w.text)) sc += 1;
      if (/[!¡?¿]/.test(w.text)) sc += 1;
      sc += Math.min(w.n.length, 9) / 6;
      if (k === n - 1) sc += 0.8;
      if (sc > ks) {
        ks = sc;
        kw = k;
      }
    });
    line.kw = kw;
    let pa1 = '';
    let pa2 = '';
    let plainI = 0;
    line.words.forEach((w, k) => {
      const sustained = w.held || (w.dur >= 0.78 && canStretch(w.text));
      const longW = sustained && canStretch(w.text);
      const plain = w.text.replace(/[^\p{L}]/gu, '');
      const C = w.cat ? CATS[w.cat] : null;
      const accent = /[áéíóúÁÉÍÓÚ]/.test(w.text);
      const q = /[?¿]/.test(w.text);
      const ex = /[!¡]/.test(w.text);
      const ell = /(\.\.\.|…)$/.test(w.text);
      const isKw = k === kw && !w.fn;
      let fx;
      let hold;
      let face;
      let col;
      let size = 1;
      let fill = false;
      let palOverride = null;
      if (w.fn) {
        size = 0.74;
        face = 'round';
        fx = pickWeighted(r, SHORT_FX);
        hold = 'bob';
        col = k % 2 ? 'cream' : 'blush';
      } else if (C) {
        fx = pick(r, C.fx);
        hold = pick(r, C.hold);
        face = pick(r, C.face);
        col = pick(r, C.col);
        size = C.size;
      } else {
        const moodFx = MOOD_FX[line.mood] || MOOD_FX.stars;
        fx = r() < 0.7 ? pick(r, moodFx) : pickWeighted(r, plain.length <= 2 || w.dur < 0.3 ? SHORT_FX : PLAIN_FX);
        hold = pickWeighted(r, HOLDS);
        face = pickWeighted(r, PLAIN_FACES);
        col = w.pron ? 'gold' : palette[plainI++ % 2 === 0 ? 0 : 1 + Math.floor(r() * (palette.length - 1))];
        if (w.pron) size = 1.05;
      }
      if (isKw && !C) {
        face = pick(r, ACCENT_FACES);
        size = 1.28;
        col = palette[2 + Math.floor(r() * 2) > palette.length - 1 ? palette.length - 1 : 2 + Math.floor(r() * 2)];
        if (w.n.length >= 4 && r() < 0.35) palOverride = 4; // relleno con sus propias letras
      }
      if (sustained || (accent && w.dur >= 0.5 && canStretch(w.text)) || (C && C.long && w.dur >= 0.6 && canStretch(w.text))) {
        fx = pickWeighted(r, LONG_FX);
        if (!C || !C.long) hold = 'breathe';
        else hold = pick(r, ['breathe', 'wave']);
        if (face === 'round' || face === 'heavy' || face === 'tall') face = pick(r, ['serif', 'script', 'wide', 'heavy']);
        fill = true;
        size = Math.max(size, 1.12);
      }
      if (q) {
        hold = 'wave';
        fx = 'flip3d';
      }
      if (ex) {
        fx = pick(r, ['zoom', 'burst']);
        size = Math.max(size, 1.15);
        col = 'white';
      }
      if (ell) fx = 'decode';
      if (fill && (hold === 'sway3d' || hold === 'bob')) hold = 'breathe';
      // sin repetir la misma entrada tres veces seguidas
      let guard = 0;
      while ((fx === pa1 || fx === pa2) && guard++ < 6 && !C) fx = pickWeighted(r, PLAIN_FX);
      pa2 = pa1;
      pa1 = fx;
      Object.assign(w, { appear: fx, hold, face, colKey: col, size: clamp(size, 0.7, 1.5), fill, palOverride, stretch: longW || (fill && canStretch(w.text) && w.dur >= 0.6) });
    });
    restyle(line, opts, si, seed);
    applyOver(line, opts.over);
    // salida
    const catEx = line.words.find((w) => w.cat && CATS[w.cat].exit);
    let ex;
    if (catEx && r() < 0.8) ex = CATS[catEx.cat].exit;
    else {
      const opts = EXIT_BY_MOOD[line.mood] || EXITS.map((e) => e[0]);
      ex = pick(r, opts);
    }
    if (i > 0 && lines[i - 1].exit === ex && r() < 0.7) ex = pick(r, EXIT_BY_MOOD[line.mood] || ['dissolve', 'wipe']);
    line.exit = ex;
    line.pal = pickWeighted(r, [
      [5, 6],
      [4, 1.5],
      [0, 1],
      [2, 0.8],
    ]);
    if (opts.fill === 'edge') line.pal = 5;
    else if (opts.fill === 'self') line.pal = 4;
    else if (opts.fill === 'classic') line.pal = 0;
    const po = opts.over && opts.over['p' + si];
    if (po && po.exit) line.exit = po.exit;
    // rimas: si la última palabra rima con la de hace 1 a 4 frases, comparten su acento
    const last = line.words[n - 1];
    const sig = rhymeSig(last.text);
    sigs.push(sig);
    for (let b = 1; b <= 4 && i - b >= 0; b++) {
      const pl = lines[i - b];
      const pw = pl.words[pl.words.length - 1];
      if (sigs[i - b] && sig && sig === sigs[i - b] && norm(pw.text) !== norm(last.text) && pl.rep === 0) {
        Object.assign(last, { face: pw.face, colKey: pw.colKey });
        break;
      }
    }
    styleDurations(line);
    if (!firstOf.has(line.key)) firstOf.set(line.key, line);
  });

  // pase 4: salida de cada palabra (cascada) para todas las frases
  lines.forEach((line) => {
    line.words.forEach((w, k) => {
      w.exitDelay = (k / Math.max(1, line.words.length)) * line.exitDur * 0.42;
      w.exitDur = line.exitDur * 0.58;
      w.seed = ((line.src ?? line.i) * 97 + k * 31 + 7) | 0;
    });
  });
  autoFx(lines, opts, seed);
  return lines;
}

// duración de entrada de cada palabra según su efecto
function styleDurations(line) {
  const n = line.words.length;
  line.words.forEach((w, k) => {
    const need = NEEDS_TIME[w.appear] || 0.5;
    const slow = w.cat && CATS[w.cat] && CATS[w.cat].long ? 1.35 : 1;
    w.appearDur = clamp(Math.max(need * slow, Math.min(w.dur * 1.05, 1.0)), 0.28, 1.1);
    if (k === n - 1) w.appearDur = Math.max(w.appearDur, Math.min(0.9, need + 0.1));
    // palabra sostenida: entra rápido y se va formando (estirando) hasta que termina de sonar
    if (w.held) w.appearDur = clamp(Math.min(w.dur * 0.5, 1.5), Math.max(need * slow, 0.5), 1.5);
    w.stretchEm = w.held ? clamp(0.3 + 0.32 * (w.dur - 0.5), 0.3, 1.5) : clamp(0.16 + 0.2 * (w.dur - 0.75), 0.18, 0.62);
    if (w.userExt != null) w.stretchEm = Math.max(0.1, w.userExt);
  });
}

// Efectos por palabra (brillo, parpadeo, explosión, desfragmentar) y mayúsculas.
// Automático: palabras sostenidas, palabras que se repiten mucho en la letra, exclamaciones y la palabra clave de cada frase.
function autoFx(lines, opts, seed) {
  const level = clamp(opts.fx ?? 0, 0, 1);
  const capsMode = opts.caps || 'off';
  const allowed = opts.fxSet && opts.fxSet.length ? opts.fxSet.filter((f) => WORD_FX.includes(f)) : WORD_FX;
  const freq = new Map();
  lines.forEach((l) =>
    l.words.forEach((w) => {
      if (w.fn || w.pron || w.n.length < 3) return;
      freq.set(w.n, (freq.get(w.n) || 0) + 1);
    }),
  );
  const choose = (r, list, weights) => {
    const ok = list.filter((f) => allowed.includes(f));
    if (!ok.length) return null;
    const ws = ok.map((f) => weights[list.indexOf(f)]);
    const tot = ws.reduce((a, b) => a + b, 0);
    let x = r() * tot;
    for (let i = 0; i < ok.length; i++) {
      x -= ws[i];
      if (x <= 0) return ok[i];
    }
    return ok[ok.length - 1];
  };
  let lastFx = '';
  lines.forEach((line, i) => {
    const si = line.src ?? i;
    const r = rng((seed | 0) * 6151 + si * 389 + 29);
    line.words.forEach((w, k) => {
      const ra = r();
      const rb = r();
      const rc = r();
      let fxs = [];
      const ex = /[!¡]/.test(w.text);
      const isKw = k === line.kw && !w.fn;
      const rep = freq.get(w.n) || 0;
      if (level > 0 && !w.fn) {
        let f = null;
        if (w.held || (w.dur >= 0.78 && canStretch(w.text))) {
          if (ra < 0.35 + 0.65 * level) f = choose(r, ['glow', 'blink', 'explode', 'defrag'], [4, 1, 1, 1]);
        } else if (ex) {
          if (ra < 0.4 + 0.6 * level) f = choose(r, ['explode', 'glow', 'blink', 'defrag'], [4, 2, 1, 1]);
        } else if (rep >= 3) {
          if (ra < level * 0.9) f = choose(r, ['blink', 'defrag', 'glow', 'explode'], [2, 2, 2, 0.6]);
        } else if (isKw) {
          if (ra < level * 0.55) f = choose(r, ['glow', 'explode', 'blink', 'defrag'], [3, 1.5, 1, 1]);
        }
        if (f && f === lastFx && rb < 0.5) f = choose(r, ['glow', 'blink', 'explode', 'defrag'], [1, 1, 1, 1]);
        if (f) {
          fxs.push(f);
          lastFx = f;
        }
      }
      let caps = false;
      if (capsMode === 'all') caps = true;
      else if (capsMode === 'auto') caps = ex || fxs.includes('explode') || (isKw && (line.rep || 0) >= 1) || (rep >= 4 && !w.fn && rc < 0.5);
      if (w.userFxs) fxs = w.userFxs.slice();
      if (w.userCaps != null) caps = w.userCaps;
      w.fxs = fxs;
      w.caps = caps;
    });
  });
}
