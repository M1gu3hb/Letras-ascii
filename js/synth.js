// Material de ejemplo ORIGINAL (no es la letra de ninguna canción) y energía sintética con bombo,
// para que el estudio tenga algo que mostrar antes de que haya canción o letra marcada.
//
// «Ejemplo» es un mini tutorial: frases que explican, con el propio motor, cómo se va a ver la canción.
// «Mi letra» reparte tu letra con tiempos automáticos (aproximados) para que veas más o menos cómo queda.
import { FPS } from './analyze.js';
import { phrasesOf } from './project.js';
import { weightOf, canStretch } from './timeline.js';

// [texto, índice de la palabra que se sostiene (se estira) o -1]
const SAMPLE = [
  ['así es como se va a ver', -1],
  ['tu letra, palabra por palabra', -1],
  ['si la mantienes, se estira', 4],
  ['con brillo, explosión y parpadeo', -1],
  ['colores y tipografías a tu gusto', -1],
  ['todo late con los graves', -1],
  ['esto es solo un ejemplo', -1],
  ['marca tu letra y verás la tuya', -1],
  ['y así quedará', 2],
];

export const SAMPLE_TEXT = SAMPLE.map((s) => s[0]).join('\n');

// tiempos del ejemplo: una frase cada ~3 s; dos de ellas con una palabra sostenida
export function sampleSync(start = 0) {
  const sync = [];
  let t = start + 0.6;
  SAMPLE.forEach(([text, holdAt]) => {
    const n = text.split(/\s+/).length;
    const wt = [];
    const wd = [];
    let x = t;
    for (let k = 0; k < n; k++) {
      const hold = k === holdAt;
      const d = hold ? 1.9 : 0.34 + (k % 3) * 0.06;
      wt.push(+x.toFixed(2));
      wd.push(+(hold ? d : Math.min(d * 0.6, 0.22)).toFixed(2));
      x += d;
    }
    sync.push({ t: wt[0], wd, wt });
    t = x + 0.7;
  });
  return sync;
}

// «Mi letra»: tiempos automáticos a partir de las sílabas. Cada tercera frase sostiene su última palabra
// y las palabras escritas con vocales repetidas («hoooy») también se sostienen, igual que al marcar a mano.
export function autoSync(text, start = 0) {
  const sync = [];
  let t = start + 0.7;
  phrasesOf(text).forEach((p, i) => {
    const ws = p.words;
    const n = ws.length;
    const weights = ws.map(weightOf);
    const sum = weights.reduce((a, b) => a + b, 0);
    const holds = ws.map((w, k) => {
      const letters = w.replace(/[^\p{L}]/gu, '');
      if (!canStretch(letters)) return false;
      if (/([aeiouáéíóú])\1{2,}/i.test(letters)) return true;
      return n >= 3 && k === n - 1 && i % 3 === 2 && letters.length >= 3;
    });
    const wt = [];
    const wd = [];
    let x = t;
    ws.forEach((w, k) => {
      const hold = holds[k];
      const d = hold ? 1.5 : Math.max(0.2, (weights[k] / sum) * Math.max(1.4, sum * 0.2));
      wt.push(+x.toFixed(2));
      wd.push(+(hold ? d : Math.min(d * 0.6, 0.22)).toFixed(2));
      x += d;
    });
    sync.push({ t: wt[0], wt, wd });
    t = x + 0.7;
  });
  return sync;
}

// Energía sintética con forma de canción (determinista): intro tranquila, build-up que sube, un respiro y un DROP claro
// hacia el 40 % de la duración (pegado al tiempo más cercano); después va a todo y al final se calma.
// Bombo en cada tiempo, hi-hat en el contratiempo, a 112 bpm.
export function fakeEnergy(seconds, bpm = 112) {
  const n = Math.ceil(seconds * FPS) + 2;
  const low = new Uint8Array(n);
  const mid = new Uint8Array(n);
  const hi = new Uint8Array(n);
  const hit = new Uint8Array(n);
  const beat = 60 / bpm;
  const dropT = Math.max(2 * beat, Math.round((seconds * 0.4) / beat) * beat);
  const buildT = dropT - Math.min(dropT * 0.5, 6.4); // empieza a subir
  const gapT = dropT - beat; // un tiempo de aire justo antes del drop
  const fallT = seconds * 0.86; // vuelve a calmarse
  const sm = (a, b, x) => (x <= a ? 0 : x >= b ? 1 : ((x - a) / (b - a)) ** 2 * (3 - (2 * (x - a)) / (b - a)));
  // sección en el instante t: { k: fuerza del bombo, l: bajo sostenido, m: medios, h: agudos }
  const sec = { k: 0, l: 0, m: 0, h: 0 };
  const section = (t, beatIdx) => {
    if (t >= dropT) {
      const w = sm(fallT, fallT + 1.5, t);
      const full = { k: beatIdx % 4 === 0 ? 1 : 0.88, l: 0.5 + 0.1 * Math.sin((t / (4 * beat)) * 6.2832), m: 0.66, h: 0.26 };
      sec.k = full.k + (0.3 - full.k) * w;
      sec.l = full.l + (0.07 - full.l) * w;
      sec.m = full.m + (0.2 - full.m) * w;
      sec.h = full.h + (0.08 - full.h) * w;
    } else if (t >= gapT) {
      sec.k = 0;
      sec.l = 0.02;
      sec.m = 0.1;
      sec.h = 0.22;
    } else if (t >= buildT) {
      const u = (t - buildT) / (gapT - buildT);
      sec.k = 0.3 + 0.35 * u;
      sec.l = 0.05 + 0.05 * u;
      sec.m = 0.2 + 0.12 * u;
      sec.h = 0.1 + 0.5 * Math.pow(u, 1.6);
    } else {
      sec.k = beatIdx % 2 === 0 ? 0.32 : 0;
      sec.l = 0.07;
      sec.m = 0.2 + 0.05 * Math.sin(t * 1.3) ** 2;
      sec.h = 0.08;
    }
    return sec;
  };
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    const bi = Math.floor(t / beat);
    const ph = (t % beat) / beat;
    const off = Math.exp(-((ph + 0.5) % 1) * 9);
    const s = section(t, bi);
    let kick = s.k * Math.exp(-ph * 7.5);
    // redoble de corcheas en la parte alta del build-up
    if (t >= buildT + (gapT - buildT) * 0.55 && t < gapT) kick = Math.max(kick, s.k * 0.55 * Math.exp(-((ph * 2) % 1) * 8));
    low[i] = Math.round(100 * Math.min(1.1, s.l + (1 - s.l) * kick));
    mid[i] = Math.round(100 * Math.min(1.1, s.m + (t >= dropT ? 0.14 : 0.1) * off));
    hi[i] = Math.round(100 * Math.min(1.1, s.h + (t >= dropT ? 0.3 : 0.2) * off));
  }
  // el índice del golpe: primer cuadro de cada tiempo (los de la intro son suaves, el del drop es el más fuerte)
  for (let b = 0; b * beat < seconds; b++) {
    const t = b * beat;
    const i = Math.round(t * FPS);
    if (i >= n) break;
    const k = section(t, b).k;
    if (k > 0.05 && t < gapT + 1e-6) hit[i] = Math.round(40 + 70 * k);
    else if (t >= dropT) hit[i] = Math.abs(t - dropT) < 1e-6 ? 120 : Math.round(40 + 70 * k);
  }
  return { fps: FPS, low, mid, hi, hit };
}
