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

// energía de 4 tiempos a 112 bpm: bombo en cada tiempo, hi-hat entre tiempos
export function fakeEnergy(seconds, bpm = 112) {
  const n = Math.ceil(seconds * FPS) + 2;
  const low = new Uint8Array(n);
  const mid = new Uint8Array(n);
  const hi = new Uint8Array(n);
  const hit = new Uint8Array(n);
  const beat = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    const ph = (t % beat) / beat;
    const kick = Math.exp(-ph * 7.5);
    const bar = Math.floor(t / beat) % 4;
    low[i] = Math.round(100 * (0.12 + 0.88 * kick * (bar === 0 ? 1 : 0.85)));
    mid[i] = Math.round(100 * (0.25 + 0.2 * Math.sin(t * 2.1) ** 2 + 0.25 * Math.exp(-((ph + 0.5) % 1) * 9)));
    hi[i] = Math.round(100 * (0.2 + 0.3 * Math.exp(-(((ph + 0.5) % 1) * 12))));
    if (ph < 1 / (beat * FPS) && i > 0) hit[i] = bar === 0 ? 110 : 85;
  }
  // el índice del golpe: primer cuadro de cada tiempo
  for (let b = 0; b * beat < seconds; b++) {
    const i = Math.round(b * beat * FPS);
    if (i < n) hit[i] = b % 4 === 0 ? 110 : 85;
  }
  return { fps: FPS, low, mid, hi, hit };
}
