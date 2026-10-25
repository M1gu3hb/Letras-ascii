// Modelo del proyecto: lo que la persona hace (canción, tramo, letra, tiempos, estilo) y cómo se
// convierte en el modelo que lee el motor. Todos los tiempos se guardan en segundos de la CANCIÓN
// completa, así que cambiar el tramo no pierde lo que ya se marcó.
import { tokenize } from './timeline.js';
import { PALETTES } from './project-palettes.js';
import { FACE_NAMES } from './type.js';
import { MOOD_NAMES } from './bg.js';

export const MOOD_LABELS = {
  stars: 'Estrellas',
  rain: 'Lluvia',
  embers: 'Brasas',
  waves: 'Olas',
  tunnel: 'Túnel',
  matrix: 'Matrix',
  snow: 'Nieve',
  rings: 'Anillos',
  fireflies: 'Luciérnagas',
  spectrum: 'Espectro',
  plasma: 'Plasma',
  hearts: 'Corazones',
  aurora: 'Aurora',
  pulse: 'Pulso',
};
export const FACE_LABELS = { round: 'Redonda', heavy: 'Gruesa', serif: 'Serif', script: 'Cursiva', tall: 'Alta', hand: 'A mano', wide: 'Ancha', roman: 'Romana' };

export { PALETTES };
export const PALETTE_LABELS = { auto: 'Automático', rosa: 'Rosa y crema', hielo: 'Hielo', fuego: 'Fuego', neon: 'Neón', bosque: 'Bosque', mono: 'Blanco' };
export const COLOR_NAMES = ['white', 'cream', 'blush', 'rose', 'pink', 'ruby', 'orange', 'amber', 'gold', 'mint', 'cyan', 'ice', 'violet', 'lav'];
export const COLOR_LABELS = { white: 'Blanco', cream: 'Crema', blush: 'Rubor', rose: 'Rosa', pink: 'Fucsia', ruby: 'Rubí', orange: 'Naranja', amber: 'Ámbar', gold: 'Dorado', mint: 'Menta', cyan: 'Cian', ice: 'Hielo', violet: 'Violeta', lav: 'Lavanda' };
export const APPEAR_LABELS = {
  instant: 'Instantánea',
  quick: 'Rápida',
  decode: 'Decodificar',
  rise: 'Subir',
  drop: 'Caer',
  zoom: 'Acercar',
  slide: 'Deslizar',
  glitch: 'Glitch',
  pop: 'Brotar',
  typewriter: 'Máquina',
  flip3d: 'Girar 3D',
  assemble: 'Ensamblar',
  burst: 'Explotar',
  spiral: 'Espiral',
  scan: 'Escanear',
};
export const HOLD_LABELS = { bob: 'Rebotar', wave: 'Ola', sway3d: 'Girar 3D', breathe: 'Respirar' };
export const EXIT_LABELS = { dissolve: 'Disolver', defrag: 'Desfragmentar', sink3d: 'Hundir 3D', wipe: 'Borrar', fall: 'Caer' };
export const WORDFX_LABELS = { glow: 'Brillo', blink: 'Parpadeo', explode: 'Explosión', defrag: 'Desfragmentar' };
export const FILL_LABELS = { auto: 'Automático', edge: 'Bordes y @', self: 'Con sus letras', classic: 'Clásico' };

export function defaultStyle() {
  return {
    mainMode: 'ascii', mainFace: 'auto', mainColor: 'auto',
    karaokeMode: 'normal', karaokeFace: 'round', karaokeSize: 1, karaokeDetail: 1, karaokeContrast: 1, karaokeOn: true,
    entryFx: 'quick', entryMs: 80,
    randomGroups: ['faces', 'colors', 'backgrounds', 'animations'],
    focus: 'word',
    random: 0.45,
    ball: true,
    palette: 'auto',
    faces: FACE_NAMES.slice(),
    mood: 'auto',
    react: 1,
    floor: true,
    fill: 'auto',
    fxAuto: 0.5,
    caps: 'off',
    fxSet: ['glow', 'blink', 'explode', 'defrag'],
    // aspecto del ASCII (estos valores son exactamente el aspecto de siempre)
    thick: 0, // grosor de las letras: -1 fino … +1 grueso
    track: 0, // espacio extra entre letras (em)
    size: 1, // tamaño de las palabras
    detail: 1, // detalle de la rejilla: más alto = más caracteres, más chicos
    weight: 'normal', // 'normal' | 'bold' (caracteres en negrita)
    fillch: '@', // carácter de los rellenos sólidos
    glow: 1, // halo alrededor de las letras
    bright: 1, // intensidad del color
  };
}
export const ASCII_KEYS = ['thick', 'track', 'size', 'detail', 'weight', 'fillch', 'glow', 'bright'];
// ajustes rápidos del aspecto del ASCII (lo que no se nombra vuelve a su valor de siempre)
export const ASCII_PRESETS = [
  ['classic', 'Normal', {}],
  ['fine', 'Fino', { thick: -0.35, track: 0.02, detail: 1.3 }],
  ['bold', 'Grueso', { thick: 0.5, weight: 'bold', glow: 1.2 }],
  ['outline', 'Contorno', { thick: -0.85, detail: 1.25, glow: 1.3 }],
  ['retro', 'Retro', { fillch: '#', weight: 'bold', detail: 0.8, glow: 0.6 }],
];
export function asciiPresetValues(id) {
  const p = ASCII_PRESETS.find((x) => x[0] === id);
  if (!p) return null;
  const d = defaultStyle();
  const out = {};
  for (const k of ASCII_KEYS) out[k] = d[k];
  return { ...out, ...p[2] };
}
// qué ajuste rápido coincide con el estilo actual (o null si se movió algo a mano)
export function asciiPresetOf(style) {
  for (const [id] of ASCII_PRESETS) {
    const v = asciiPresetValues(id);
    if (ASCII_KEYS.every((k) => (typeof v[k] === 'number' ? Math.abs((style[k] ?? defaultStyle()[k]) - v[k]) < 0.001 : (style[k] ?? defaultStyle()[k]) === v[k]))) return id;
  }
  return null;
}

export function newProject() {
  return {
    v: 3,
    name: '',
    song: null, // { name, size, type, duration }
    clip: { start: 0, end: 0 },
    intro: 'para ti',
    outro: '',
    text: '',
    sync: [], // por frase: null | { t, wt?: [..], wd?: [..] }  (segundos de la canción)
    style: defaultStyle(),
    over: {}, // "frase.palabra" -> { face, col, fx, hold, size, stretch, fill } ; "p<frase>" -> { mood, exit }
    seed: 1,
    offset: -0.12,
  };
}

// completa lo que falte (proyectos viejos o a medias)
export function normalize(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
  const d = newProject();
  const out = { ...d, ...p, style: { ...d.style, ...(p.style || {}) }, clip: { ...d.clip, ...(p.clip || {}) } };
  // Proyectos anteriores conservan sus dos renderers ASCII; sus tiempos no cambian.
  if (p.style && !Object.hasOwn(p.style, 'mainMode')) { out.style.karaokeMode = 'ascii'; out.style.entryFx = 'auto'; }
  for (const key of ['mainMode', 'karaokeMode']) if (!['ascii', 'normal'].includes(out.style[key])) out.style[key] = d.style[key];
  for (const key of ['mainFace', 'karaokeFace']) if (![...(key === 'mainFace' ? ['auto'] : []), ...FACE_NAMES].includes(out.style[key])) out.style[key] = d.style[key];
  if (!['auto', ...COLOR_NAMES].includes(out.style.mainColor)) out.style.mainColor = 'auto';
  if (!['auto', ...Object.keys(APPEAR_LABELS)].includes(out.style.entryFx)) out.style.entryFx = 'quick';
  for (const [key, lo, hi] of [['entryMs',0,3000],['karaokeSize',.75,2],['karaokeDetail',.75,1.5],['karaokeContrast',.6,1.5]]) out.style[key] = Number.isFinite(out.style[key]) ? Math.max(lo, Math.min(hi, out.style[key])) : d.style[key];
  if (typeof out.style.karaokeOn !== 'boolean') out.style.karaokeOn = true;
  out.style.randomGroups = (Array.isArray(out.style.randomGroups) ? out.style.randomGroups : d.style.randomGroups).filter(x => ['faces','colors','backgrounds','animations'].includes(x));
  out.text = typeof p.text === 'string' ? p.text.slice(0, 100000) : '';
  for (const key of ['name', 'intro', 'outro']) out[key] = typeof out[key] === 'string' ? out[key].slice(0, key === 'name' ? 60 : 200) : d[key];
  out.style.faces = (Array.isArray(out.style.faces) ? out.style.faces : []).filter((f) => FACE_NAMES.includes(f));
  if (!out.style.faces.length) out.style.faces = FACE_NAMES.slice();
  for (const key of ['fxSet']) out.style[key] = Array.isArray(out.style[key]) ? out.style[key].filter((k) => Object.hasOwn(WORDFX_LABELS, k)) : d.style[key];
  const ranges = { thick: [-1,1], track: [-.06,.3], size: [.6,1.3], detail: [.6,1.8], glow: [0,2], bright: [.6,1.5], random: [0,1], fxAuto: [0,1], react: [0,2], holdMin: [.3,1.5] };
  for (const [key, [lo, hi]] of Object.entries(ranges)) {
    const value = out.style[key];
    if (value !== undefined) out.style[key] = Number.isFinite(value) ? Math.max(lo, Math.min(hi,value)) : d.style[key];
  }
  out.offset = Number.isFinite(out.offset) ? Math.max(-.6, Math.min(.6,out.offset)) : d.offset;
  out.seed = Number.isFinite(out.seed) ? out.seed | 0 : d.seed;
  const enums = { focus: ['word','line'], palette: ['auto',...Object.keys(PALETTES)], mood: ['auto',...MOOD_NAMES], caps: ['off','all','auto'], fill: Object.keys(FILL_LABELS), weight: ['normal','bold'], fillch: ['@','#','%','&','8','0'] };
  for (const [key, values] of Object.entries(enums)) if (!values.includes(out.style[key])) out.style[key] = d.style[key];
  for (const key of ['ball','floor']) if (typeof out.style[key] !== 'boolean') out.style[key] = d.style[key];
  for (const key of ['start','end']) out.clip[key] = Number.isFinite(out.clip[key]) ? Math.max(0,out.clip[key]) : 0;
  if (!Array.isArray(out.sync)) out.sync = [];
  out.sync = phrasesOf(out.text).map((phrase,i) => {
    const s = out.sync[i];
    if (!Number.isFinite(s?.t)) return null;
    if (!Array.isArray(s.wt) || s.wt.length !== phrase.words.length || !s.wt.every(Number.isFinite)) return { t: s.t };
    return { t: s.t, wt: [...s.wt], wd: s.wt.map((_,k) => Number.isFinite(s.wd?.[k]) ? Math.max(0,Math.min(60,s.wd[k])) : .2) };
  });
  if (!out.over || typeof out.over !== 'object') out.over = {};
  const cleaned = {};
  for (const [key,value] of Object.entries(out.over)) {
    if (!/^(p\d+|\d+\.\d+)$/.test(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const o = {};
    const choices = key.startsWith('p') ? { mood: MOOD_NAMES, exit: Object.keys(EXIT_LABELS) } : { face: FACE_NAMES, col: COLOR_NAMES, fx: Object.keys(APPEAR_LABELS), mode: ['ascii','normal'], hold: Object.keys(HOLD_LABELS), pal: [0,4,5] };
    for (const [field, values] of Object.entries(choices)) if (values.includes(value[field])) o[field] = value[field];
    if (!key.startsWith('p')) {
      for (const [field,[lo,hi]] of Object.entries({size:[.5,1.8],thick:[-1,1],ext:[0,2.2],entryMs:[0,3000]})) if (Number.isFinite(value[field])) o[field] = Math.max(lo,Math.min(hi,value[field]));
      for (const field of ['fill','stretch','caps']) if (typeof value[field] === 'boolean') o[field] = value[field];
      if (Array.isArray(value.fxs)) o.fxs = value.fxs.filter((fx) => Object.hasOwn(WORDFX_LABELS,fx));
    }
    if (Object.keys(o).length) cleaned[key] = o;
  }
  out.over = cleaned;
  return out;
}

export function phrasesOf(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ text: s, words: tokenize(s) }));
}

// Después de editar la letra: las frases que no cambiaron conservan sus tiempos y ajustes aunque
// agregues o quites líneas en medio (se compara el principio y el final de la letra).
export function reconcile(project, prevText) {
  const next = phrasesOf(project.text);
  const prev = phrasesOf(prevText ?? project.text);
  const oldSync = project.sync;
  const oldOver = project.over;
  let a = 0;
  while (a < prev.length && a < next.length && prev[a].text === next[a].text) a++;
  let b = 0;
  while (b < prev.length - a && b < next.length - a && prev[prev.length - 1 - b].text === next[next.length - 1 - b].text) b++;
  const map = new Array(next.length).fill(-1);
  for (let i = 0; i < a; i++) map[i] = i;
  for (let i = 0; i < b; i++) map[next.length - 1 - i] = prev.length - 1 - i;
  // el tramo del medio: si tiene el mismo número de líneas, se emparejan por posición (líneas editadas)
  const midNext = next.length - a - b;
  const midPrev = prev.length - a - b;
  if (midNext === midPrev) for (let i = 0; i < midNext; i++) map[a + i] = a + i;
  const sync = [];
  for (let i = 0; i < next.length; i++) {
    const s = map[i] >= 0 ? oldSync[map[i]] : null;
    if (!s) sync.push(null);
    else if (s.wt && s.wt.length !== next[i].words.length) sync.push(Number.isFinite(s.t) ? { t: s.t } : null);
    else sync.push(s);
  }
  const over = {};
  const inv = new Map();
  map.forEach((o, n) => o >= 0 && inv.set(o, n));
  for (const [k, v] of Object.entries(oldOver)) {
    const m = /^(p?)(\d+)(.*)$/.exec(k);
    if (!m) continue;
    const n = inv.get(+m[2]);
    if (n == null) continue;
    over[m[1] + n + m[3]] = v;
  }
  project.sync = sync;
  project.over = over;
  return project;
}

// modelo que lee buildTimeline
export function modelOf(project, clipOverride) {
  const ph = phrasesOf(project.text);
  return {
    phrases: ph.map((p, i) => ({ text: p.text, sync: project.sync[i] || null })),
    clip: clipOverride || project.clip,
    style: project.style,
    over: project.over,
    seed: project.seed,
    intro: project.intro,
    outro: project.outro,
    offset: project.offset,
  };
}

export function syncedCount(project) {
  const n = phrasesOf(project.text).length;
  let k = 0;
  for (let i = 0; i < n; i++) if (project.sync[i] && Number.isFinite(project.sync[i].t)) k++;
  return { done: k, total: n };
}

export const fmtTime = (t) => {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
export const fmtTimeMs = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export function parseClock(s) {
  const t = String(s).trim().replace(',', '.');
  if (!t) return NaN;
  const p = t.split(':').map(Number);
  if (p.some((x) => !Number.isFinite(x))) return NaN;
  return p.length === 1 ? p[0] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
}

export { MOOD_NAMES, FACE_NAMES };
