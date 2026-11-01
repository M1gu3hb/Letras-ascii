// «Drops»: el instante en que la energía salta de golpe después de un tramo más tranquilo (un estribillo que entra,
// el bajo que vuelve tras el build-up). Pura y determinista: solo mira los arreglos de energía (low / mid / hit),
// recorre la canción una vez (O(n)) y no depende de nada del navegador.
//
// Devuelve { drops, intensity }:
//   drops     segundos (ordenados) donde cae cada drop, ya pegados al golpe de graves más cercano
//   intensity un valor 0..1 por cuadro: qué tan fuerte suena la sección en ese momento (suavizado ~1.5 s)
//
// La intensidad usa una escala FIJA (no percentiles de la canción): el estudio le pasa toda la canción y el HTML exportado
// solo el tramo elegido, y los dos tienen que dibujar exactamente lo mismo cuadro por cuadro.

const LOW_W = 0.6; // peso de los graves en la «fuerza» de un cuadro
const MID_W = 0.4;
const TAU_SHORT = 0.25; // s: nivel «de ahora»
const BASE_SEC = 4; // s: tramo anterior contra el que se compara
const BASE_GAP = 0.35; // s: hueco entre ese tramo y «ahora» (para que el salto no contamine la referencia)
const BASE_MIN = 0.8; // s: historia mínima antes de poder decir que algo es un drop
const AHEAD_SEC = 0.7; // s: el salto tiene que sostenerse (un golpe suelto no es un drop)
const RATIO_NOW = 1.6;
const RATIO_AHEAD = 1.45;
const FLOOR_NOW = 0.32; // piso absoluto: nunca un drop dentro del murmullo
const FLOOR_AHEAD = 0.3;
const MIN_GAP = 7; // s entre drops
const MAX_DROPS = 8;
const TAU_UP = 1; // s: la intensidad sube rápido…
const TAU_DOWN = 2; // …y baja con calma
const I_LO = 0.1; // fuerza que cuenta como «tranquilo»
const I_HI = 0.62; // fuerza que cuenta como «a todo»

const ss = (a, b, x) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export function analyzeDrops(e) {
  const fps = e && e.fps > 0 ? e.fps : 50;
  const low = e && e.low ? e.low : [];
  const mid = e && e.mid ? e.mid : [];
  const hit = e && e.hit ? e.hit : [];
  const n = Math.min(low.length, mid.length);
  const intensity = new Float32Array(n);
  if (n < 2) return { drops: new Float32Array(0), intensity };

  // fuerza por cuadro (0..~1.2) y sumas acumuladas para promediar cualquier tramo en O(1)
  const loud = new Float32Array(n);
  const P = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = (LOW_W * low[i] + MID_W * mid[i]) / 100;
    loud[i] = v > 1.2 ? 1.2 : v;
    P[i + 1] = P[i] + loud[i];
  }
  const mean = (a, b) => (P[b] - P[a]) / (b - a);

  // intensidad: suavizado asimétrico (sube en ~1 s, baja en ~2 s) y escala fija 0..1
  const kUp = 1 - Math.exp(-1 / (fps * TAU_UP));
  const kDown = 1 - Math.exp(-1 / (fps * TAU_DOWN));
  let lv = mean(0, Math.min(n, Math.round(fps / 2))); // arranca en el promedio de medio segundo (no en un bombo suelto)
  for (let i = 0; i < n; i++) {
    lv += (loud[i] - lv) * (loud[i] > lv ? kUp : kDown);
    intensity[i] = ss(I_LO, I_HI, lv);
  }

  const baseN = Math.round(BASE_SEC * fps);
  const gapN = Math.round(BASE_GAP * fps);
  const minHist = Math.round(BASE_MIN * fps);
  const aheadN = Math.round(AHEAD_SEC * fps);
  const aheadMin = Math.max(2, Math.round(0.25 * fps));
  const kShort = 1 - Math.exp(-1 / (fps * TAU_SHORT));
  const endGap = Math.round(0.5 * fps); // un salto «se acabó» tras medio segundo sin cumplirse

  const times = []; // candidatos aceptados: { t, score }
  let short = loud[0];
  let epStart = -1; // primer cuadro del salto en curso (-1: ninguno)
  let epBase = 0;
  let epScore = 0;
  let epLast = -1e9;

  const close = () => {
    if (epStart < 0) return;
    // el nivel «de ahora» llega tarde (~0.15 s): se retrocede hasta donde empezó a subir de verdad
    const thr = epBase * 1.25 + 0.04;
    const lim = Math.max(0, epStart - Math.round(0.3 * fps));
    let j = epStart;
    while (j > lim && loud[j - 1] > thr) j--;
    // y se pega al golpe de graves más cercano para que el destello caiga justo en el bombo
    const lo = Math.max(0, j - 5);
    const hi = Math.min(hit.length - 1, j + 14);
    let k = -1;
    for (let q = lo; q <= hi; q++) if (hit[q] >= 50) { k = q; break; }
    if (k < 0) {
      let best = 29;
      for (let q = lo; q <= hi; q++) if (hit[q] > best) { best = hit[q]; k = q; }
    }
    const t = (k >= 0 ? k : j) / fps;
    // separación mínima: gana el salto más fuerte de los que quedan demasiado cerca
    let ok = true;
    while (times.length && t - times[times.length - 1].t < MIN_GAP) {
      if (epScore > times[times.length - 1].score) times.pop();
      else { ok = false; break; }
    }
    if (ok && times.length < MAX_DROPS) times.push({ t, score: epScore });
    epStart = -1;
  };

  for (let i = 0; i < n; i++) {
    short += (loud[i] - short) * kShort;
    const b1 = i - gapN;
    const b0 = Math.max(0, b1 - baseN);
    let hot = false;
    let base = 0;
    if (b1 - b0 >= minHist && n - i >= aheadMin) {
      base = mean(b0, b1);
      const ahead = mean(i, Math.min(n, i + aheadN));
      hot = short >= Math.max(FLOOR_NOW, base * RATIO_NOW + 0.06) && ahead >= Math.max(FLOOR_AHEAD, base * RATIO_AHEAD + 0.05);
    }
    if (hot) {
      if (epStart < 0) {
        epStart = i;
        epBase = base;
        epScore = 0;
      }
      const sc = short / (base + 0.08);
      if (sc > epScore) epScore = sc;
      epLast = i;
    } else if (epStart >= 0 && i - epLast > endGap) close();
  }
  close();

  const drops = new Float32Array(times.length);
  for (let k = 0; k < times.length; k++) drops[k] = times[k].t;
  return { drops, intensity };
}
