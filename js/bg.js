// Ambientes de fondo hechos solo de caracteres. Cada uno es una función pura del tiempo
// (sin estado), así que funcionan igual al pausar, saltar o repetir.
import { KC } from './grid.js';
import { hash, clamp, smooth } from './util.js';

const TAU = Math.PI * 2;
const C = (s) => s.charCodeAt(0);
const MAT = Array.from('0123456789ABCDEFXZ*+=<>/\\|').map(C);

// E = { low, mid, hi, pulse, rings, inten, drop, dropAge, dropIdx, warp, warpV }: la música en este instante.
//   low/mid/hi/pulse entre 0 y 1 · inten = fuerza de la sección (0 tranquila … 1 a todo)
//   drop = fuerza del estallido del drop (1 → 0) · dropAge/dropIdx = segundos y número del último drop · warp = empujón acumulado
//   que los drops le dan a lo que se desplaza (estrellas, copos…) · warpV = su velocidad (1 → 0)
// a = opacidad del ambiente (0..1)

function stars(g, t, a, E) {
  const n = ((g.cols * g.rows) / 40) | 0;
  const rows = g.rows;
  for (let i = 0; i < n; i++) {
    const sp = 0.18 + hash(i, 3, 77) * 0.5;
    // tras un drop las estrellas se aceleran (las más rápidas, más lejos) y se estiran un instante
    const y = (((hash(i, 2, 77) * rows - t * sp - E.warp * (3 + 22 * sp)) % rows) + rows) % rows;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.5 + hash(i, 5, 77) * 1.6) + hash(i, 4, 77) * 6.28);
    const v = (0.08 + 0.2 * tw + E.pulse * 0.12 + E.warpV * 0.2) * a;
    const x = (hash(i, 1, 77) * g.cols) | 0;
    const rose = hash(i, 7, 77) > 0.84;
    if (E.warpV > 0.4 && sp > 0.3) {
      g.put(x, y | 0, v, rose ? KC.ROSE : KC.SKY, 0, 124);
      g.put(x, (y | 0) + 1, v * 0.55, rose ? KC.ROSE : KC.ROYAL, 0, 58);
      continue;
    }
    const ch = [46, 46, 46, 39, 58, 96, 44, 43][(hash(i, 6, 77) * 8) | 0];
    g.put(x, y | 0, v, rose ? KC.ROSE : hash(i, 8, 77) > 0.5 ? KC.SKY : KC.LAV, 0, ch);
  }
  // estrella fugaz cada ~7 s
  const k = Math.floor(t / 7);
  const u = (t - k * 7) / 0.8;
  if (u >= 0 && u < 1) {
    const x0 = hash(k, 11, 5) * g.cols * 0.6 + g.cols * 0.3;
    const y0 = hash(k, 12, 5) * rows * 0.35;
    for (let j = 0; j < 9; j++) {
      const p = u * 26 - j * 1.1;
      if (p < 0) continue;
      g.put((x0 + p * 1.8) | 0, (y0 + p * 0.55) | 0, (0.5 - j * 0.05) * a, KC.WHITE, 0, j === 0 ? C('*') : j < 3 ? C('-') : C('.'));
    }
  }
}

function rain(g, t, a, E) {
  const { cols, rows } = g;
  const n = (cols * 0.6) | 0;
  for (let i = 0; i < n; i++) {
    const sp = 13 + hash(i, 2, 9) * 17;
    const len = 2 + ((hash(i, 3, 9) * 5) | 0);
    const cyc = rows + len + 6;
    const head = ((hash(i, 4, 9) * cyc + t * sp + E.warp * 14) % cyc) - 3;
    const x = (hash(i, 1, 9) * cols) | 0;
    for (let k = 0; k < len; k++) {
      const y = (head - k) | 0;
      if (y < 0 || y >= rows) continue;
      const v = (k === 0 ? 0.34 : 0.17 * (1 - k / len)) * a * (1 + E.low * 0.7);
      g.put(x, y, v, k === 0 ? KC.CYAN : KC.ICE, 0, k === 0 ? C('|') : k < 3 ? C(':') : C('.'));
    }
    if (head >= rows - 1 && head < rows + 2) g.put(x + ((i & 1) ? 1 : -1), rows - 1, 0.2 * a, KC.ICE, 0, C('.'));
  }
}

function embers(g, t, a, E) {
  const { cols, rows } = g;
  const n = (cols * 0.55) | 0;
  for (let i = 0; i < n; i++) {
    const sp = 2.4 + hash(i, 2, 13) * 5.5;
    const u = (((hash(i, 3, 13) * rows + t * sp + E.warp * 6) % rows) + rows) % rows;
    const y = rows - 1 - u;
    const x = hash(i, 1, 13) * cols + Math.sin(t * 0.7 + hash(i, 5, 13) * 6.28) * 2.6;
    const life = 1 - u / rows;
    const fl = 0.6 + 0.4 * Math.sin(t * (4 + hash(i, 6, 13) * 6) + i);
    const col = hash(i, 7, 13);
    g.put(x | 0, y | 0, (0.1 + 0.3 * life * fl) * a * (1 + E.low * 0.9 + E.pulse * 0.5), col > 0.7 ? KC.GOLD : col > 0.25 ? KC.ORANGE : KC.ROSE, 0, [C('.'), C('*'), C("'"), C('^'), C('`')][(hash(i, 8, 13) * 5) | 0]);
  }
}

function waves(g, t, a, E) {
  const { cols, rows } = g;
  const L = 5;
  for (let l = 0; l < L; l++) {
    const base = rows * (0.5 + 0.1 * l);
    const amp = 1.0 + l * 0.35 + E.low * 3.2;
    const col = l % 3 === 0 ? KC.ROYAL : l % 3 === 1 ? KC.SKY : KC.ICE;
    for (let x = 0; x < cols; x++) {
      const y = base + Math.sin(x * (0.11 + 0.02 * l) + t * (0.8 + 0.25 * l) + l * 1.7) * amp + Math.sin(x * 0.043 - t * 0.5) * 1.4;
      const yi = Math.round(y);
      g.put(x, yi, (0.2 - 0.025 * l) * a, col, 0, l % 2 ? C('-') : C('~'));
      if (l === L - 1) for (let k = 1; k < 4; k++) g.put(x, yi + k, 0.05 * a, KC.ROYAL, 0, C('.'));
    }
  }
}

function tunnel(g, t, a, E) {
  const { cols, rows } = g;
  const cx = cols / 2;
  const cy = rows * 0.46;
  const R = Math.max(cols, rows * 2) * 0.62 * (1 + E.pulse * 0.07);
  const n = (cols * 1.4) | 0;
  const sp = 0.3;
  for (let i = 0; i < n; i++) {
    const th = hash(i, 1, 3) * TAU;
    const z = (hash(i, 2, 3) + t * sp * (0.6 + hash(i, 3, 3) * 0.8)) % 1;
    const r = Math.pow(z, 1.9) * R;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    const x = cx + dx * r;
    const y = cy + dy * r * 0.5;
    const ang = Math.abs(Math.atan2(dy * 0.5, dx));
    const ch = z < 0.25 ? C('.') : ang < 0.4 || ang > 2.74 ? C('-') : ang > 1.17 && ang < 1.97 ? C('|') : dx * dy > 0 ? C('\\') : C('/');
    g.put(x | 0, y | 0, (0.04 + 0.34 * z * z) * a * (1 + E.pulse * 0.6), z > 0.8 ? KC.WHITE : hash(i, 4, 3) > 0.6 ? KC.ROSE : KC.LAV, 0, ch);
  }
}

function matrix(g, t, a, E) {
  const { cols, rows } = g;
  for (let x = 0; x < cols; x++) {
    if (hash(x, 1, 21) < 0.38) continue;
    const sp = 6 + hash(x, 2, 21) * 11;
    const len = 6 + ((hash(x, 3, 21) * 12) | 0);
    const cyc = rows + len + 8;
    const head = (hash(x, 4, 21) * cyc + t * sp) % cyc;
    for (let k = 0; k < len; k++) {
      const y = (head - k) | 0;
      if (y < 0 || y >= rows) continue;
      const ch = MAT[(hash(x, y, Math.floor(t * 5) + k) * MAT.length) | 0];
      g.put(x, y, (k === 0 ? 0.42 : 0.22 * (1 - k / len)) * a * (1 + E.mid * 0.5 + E.pulse * 0.4), k === 0 ? KC.WHITE : KC.MINT, 0, ch);
    }
  }
}

function snow(g, t, a, E) {
  const { cols, rows } = g;
  const n = (cols * 0.6) | 0;
  for (let i = 0; i < n; i++) {
    const sp = 1.4 + hash(i, 2, 31) * 3;
    const y = (hash(i, 3, 31) * rows + t * sp + E.warp * (4 + 6 * sp)) % rows;
    const x = hash(i, 1, 31) * cols + Math.sin(t * 0.55 + hash(i, 5, 31) * 6.28) * 3;
    const big = hash(i, 6, 31);
    g.put(x | 0, y | 0, (0.1 + 0.2 * big) * a * (1 + E.pulse * 0.9), big > 0.5 ? KC.WHITE : KC.ICE, 0, big > 0.85 ? C('*') : big > 0.55 ? C('o') : big > 0.25 ? C('+') : C('.'));
  }
}

function rings(g, t, a, E) {
  const { cols, rows } = g;
  const cx = cols / 2;
  const cy = rows * 0.48;
  const R = Math.max(cols * 0.55, 10);
  for (let k = 0; k < 5; k++) {
    const u = (t * 0.2 + k / 5) % 1;
    const r = u * R;
    const steps = Math.max(14, Math.floor(r * 4.4));
    const col = k % 3 === 0 ? KC.FUCHSIA : k % 3 === 1 ? KC.ROSE : KC.VIOLET;
    const v = (0.28 * (1 - u) + E.pulse * 0.22 * (1 - u)) * a;
    for (let s = 0; s < steps; s++) {
      const th = (s / steps) * TAU;
      g.put((cx + Math.cos(th) * r) | 0, (cy + Math.sin(th) * r * 0.5) | 0, v, col, 0, u < 0.2 ? C('.') : u < 0.6 ? C('o') : C('O'));
    }
  }
}

function fireflies(g, t, a, E) {
  const { cols, rows } = g;
  const n = Math.max(10, (cols * 0.2) | 0);
  for (let i = 0; i < n; i++) {
    const x = cols * (0.5 + 0.46 * Math.sin(t * (0.12 + hash(i, 1, 41) * 0.2) + hash(i, 2, 41) * 6.28) * Math.cos(t * 0.07 + i));
    const y = rows * (0.5 + 0.42 * Math.sin(t * (0.1 + hash(i, 3, 41) * 0.18) + hash(i, 4, 41) * 6.28));
    const b = 0.5 + 0.5 * Math.sin(t * (1.4 + hash(i, 5, 41) * 2.2) + i * 2);
    const col = hash(i, 6, 41) > 0.5 ? KC.GOLD : KC.SKY;
    g.put(x | 0, y | 0, (0.1 + 0.4 * b) * a * (1 + E.pulse * 0.8), col, 0, b > 0.7 ? C('*') : C('.'));
    if (b > 0.78) {
      g.put((x | 0) - 1, y | 0, 0.14 * a, col, 0, C('.'));
      g.put((x | 0) + 1, y | 0, 0.14 * a, col, 0, C('.'));
    }
  }
}

function spectrum(g, t, a, E) {
  const { cols, rows } = g;
  const base = rows - 2;
  for (let x = 0; x < cols; x++) {
    const f = Math.abs(x - cols / 2) / (cols / 2);
    const jit = 0.65 + 0.35 * hash(x, Math.floor(t * 9), 51);
    const amp = clamp((E.low * (1 - f) * (1 - f) * 1.15 + E.mid * Math.sin(f * Math.PI) * 0.95 + E.hi * f * 0.85) * jit + 0.05, 0, 1);
    const h = Math.round(amp * rows * 0.34);
    const col = f < 0.33 ? KC.ROYAL : f < 0.66 ? KC.VIOLET : KC.FUCHSIA;
    for (let k = 0; k <= h; k++) {
      const top = k === h;
      g.put(x, base - k, (top ? 0.36 : 0.05 + 0.13 * (1 - k / (h + 1))) * a, top ? KC.WHITE : col, 0, top ? C('=') : (k & 1) ? C('|') : C(':'));
    }
  }
}

function plasma(g, t, a, E) {
  const { cols, rows } = g;
  const cx = cols / 2;
  const cy = rows;
  for (let y = 0; y < rows; y += 2) {
    for (let x = 0; x < cols; x += 2) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y * 2 - cy) * (y * 2 - cy));
      const v = (Math.sin(x * 0.16 + t * 0.7) + Math.sin(y * 0.3 - t * 0.5) + Math.sin((x + y) * 0.1 + t * 0.4) + Math.sin(d * 0.15 - t * 0.8) + 4) / 8;
      if (v > 0.52 - E.low * 0.08) g.put(x, y, (v - 0.4) * 0.5 * a * (1 + E.pulse * 0.7), v > 0.78 ? KC.FUCHSIA : KC.VIOLET, 0, 0);
    }
  }
}

function hearts(g, t, a, E) {
  const { cols, rows } = g;
  const n = Math.max(8, (cols * 0.14) | 0);
  for (let i = 0; i < n; i++) {
    const sp = 1.6 + hash(i, 2, 61) * 3.6;
    const u = (((hash(i, 3, 61) * rows + t * sp + E.warp * 7) % rows) + rows) % rows;
    const x = hash(i, 1, 61) * (cols - 3) + Math.sin(t * 0.9 + hash(i, 5, 61) * 6.28) * 2.4;
    const y = (rows - 1 - u) | 0;
    const v = (0.14 + 0.2 * (1 - u / rows) + E.pulse * 0.1) * a;
    const col = hash(i, 6, 61) > 0.5 ? KC.ROSE : hash(i, 6, 61) > 0.25 ? KC.FUCHSIA : KC.BLUSH;
    g.put(x | 0, y, v, col, 0, C('<'));
    g.put((x | 0) + 1, y, v, col, 0, C('3'));
  }
}

function aurora(g, t, a, E) {
  const { cols, rows } = g;
  for (let x = 0; x < cols; x++) {
    const base = rows * 0.3 + Math.sin(x * 0.07 + t * 0.35) * rows * 0.12 + Math.sin(x * 0.17 - t * 0.5) * rows * 0.05;
    const hh = rows * 0.3 * (0.6 + 0.4 * Math.sin(x * 0.11 + t * 0.7)) * (1 + E.low * 0.55);
    const col = x / cols < 0.4 ? KC.SKY : x / cols < 0.75 ? KC.ROYAL : KC.VIOLET;
    for (let k = 0; k < hh; k += 1) {
      const u = k / hh;
      g.put(x, (base + k) | 0, 0.22 * (1 - u) * (0.6 + 0.4 * Math.sin(x * 0.5 + t * 2)) * a * (1 + E.pulse * 0.6), col, 0, u < 0.3 ? C('|') : u < 0.65 ? C(':') : C('.'));
    }
  }
}


// anillos que salen del centro con cada golpe de graves (E.rings = golpes recientes)
function pulse(g, t, a, E) {
  const { cols, rows } = g;
  const cx = cols / 2;
  const cy = rows * 0.46;
  const R = Math.max(cols * 0.5, 14);
  // respiración lenta de fondo para que nunca quede vacío
  for (let k = 0; k < 3; k++) {
    const u = (t * 0.12 + k / 3) % 1;
    const r = 3 + u * R * 0.8;
    const steps = Math.max(14, Math.floor(r * 4.4));
    for (let s = 0; s < steps; s++) {
      const th = (s / steps) * TAU;
      g.put((cx + Math.cos(th) * r) | 0, (cy + Math.sin(th) * r * 0.5) | 0, 0.1 * (1 - u) * a, KC.VIOLET, 0, C('.'));
    }
  }
  const rings = E.rings || [];
  for (let n = 0; n < rings.length; n++) {
    const age = rings[n][0];
    const str = rings[n][1];
    const u = age / 1.15;
    if (u >= 1) continue;
    const r = 2 + (1 - Math.pow(1 - u, 2)) * R * (0.65 + 0.35 * str);
    const steps = Math.max(16, Math.floor(r * 4.8));
    const v = 0.4 * (1 - u) * (0.55 + 0.45 * Math.min(1, str)) * a;
    const col = n % 3 === 0 ? KC.FUCHSIA : n % 3 === 1 ? KC.ROSE : KC.VIOLET;
    for (let s = 0; s < steps; s++) {
      const th = (s / steps) * TAU;
      g.put((cx + Math.cos(th) * r) | 0, (cy + Math.sin(th) * r * 0.5) | 0, v, col, 0, u < 0.22 ? C('O') : u < 0.6 ? C('o') : C('.'));
    }
  }
  // núcleo que late
  const cr = 1.5 + E.pulse * 4;
  for (let y = -Math.ceil(cr); y <= Math.ceil(cr); y++) {
    for (let x = -Math.ceil(cr * 2); x <= Math.ceil(cr * 2); x++) {
      const d = Math.hypot(x / 2, y);
      if (d <= cr) g.put((cx + x) | 0, (cy + y) | 0, (0.12 + 0.3 * E.pulse) * (1 - d / (cr + 0.5)) * a, KC.ROSE, 0, d < cr * 0.5 ? C('@') : C('o'));
    }
  }
}

// barras de graves pegadas al piso (se dibujan bajo todos los ambientes)
export function drawFloor(g, t, E, a) {
  const { cols, rows } = g;
  const base = rows - 1;
  const frame = Math.floor(t * 12);
  for (let x = 0; x < cols; x++) {
    const f = x / cols;
    const jit = 0.55 + 0.45 * hash(x, frame, 71);
    const amp = clamp((E.low * 0.85 + E.pulse * 0.7) * jit * (1 - 0.35 * Math.abs(f - 0.5) * 2) + E.mid * 0.08, 0, 1);
    const h = Math.round(amp * Math.max(2, rows * 0.1));
    const col = f < 0.33 ? KC.ROSE : f < 0.66 ? KC.VIOLET : KC.ROYAL;
    for (let k = 0; k <= h; k++) {
      const top = k === h;
      g.put(x, base - k, (top ? 0.34 : 0.1 + 0.1 * (1 - k / (h + 1))) * a, top ? KC.BLUSH : col, 0, top ? C('=') : (k & 1) ? C('|') : C(':'));
    }
  }
}

// ───────── reacciones a la música ─────────
// Todo es una función pura de (t, energía): el «azar» sale de hash() y nunca de Math.random() ni del reloj,
// para que el estudio y el HTML exportado dibujen exactamente lo mismo. Nada crea objetos dentro del cuadro.

// corazoncitos que suben despacio en los ambientes neutros y laten con el bombo (w = cuánto se nota: 0..1)
export function drawLove(g, t, w, E) {
  const { cols, rows } = g;
  const n = Math.max(4, Math.min(22, Math.round(cols * 0.075 * (0.6 + 0.8 * E.inten))));
  for (let i = 0; i < n; i++) {
    const sp = 0.9 + hash(i, 2, 91) * 1.7;
    const u = (((hash(i, 3, 91) * rows + t * sp + E.warp * 5) % rows) + rows) % rows;
    const life = u / rows;
    const env = smooth(0, 0.12, life) * (1 - smooth(0.72, 1, life));
    if (env < 0.04) continue;
    const x = (hash(i, 1, 91) * (cols - 3) + Math.sin(t * 0.8 + hash(i, 5, 91) * TAU) * 1.8) | 0;
    const y = (rows - 1 - u) | 0;
    const kind = hash(i, 6, 91);
    const col = kind > 0.66 ? KC.ROSE : kind > 0.33 ? KC.BLUSH : KC.FUCHSIA;
    const v = (0.12 + 0.2 * env + E.pulse * 0.32) * env * w;
    if (hash(i, 7, 91) > 0.45) {
      g.put(x, y, v, col, 0, C('<'));
      g.put(x + 1, y, v, col, 0, C('3'));
    } else g.put(x, y, v * 0.8, col, 0, E.pulse > 0.45 ? C('*') : C('.'));
  }
}

// anillo que sale del centro con cada bombo fuerte: puntos azules con un corazón <3 de vez en cuando
export function drawKick(g, E, k) {
  const rings = E.rings;
  const m = Math.min(rings.length, 3);
  if (!m) return;
  const { cols, rows } = g;
  const cx = cols / 2;
  const cy = rows * 0.44;
  const R = Math.max(cols * 0.5, 14);
  for (let q = 0; q < m; q++) {
    const str = rings[q][1];
    const u = rings[q][0] / 0.95;
    if (str < 0.5 || u >= 1) continue;
    const s1 = str > 1 ? 1 : str;
    const r = 3 + (1 - Math.pow(1 - u, 2.2)) * R * (0.5 + 0.42 * s1);
    const steps = Math.max(18, Math.floor(r * 4.8));
    const v = 0.4 * (1 - u) * (0.5 + 0.5 * s1) * k;
    const ch = u < 0.2 ? C('O') : u < 0.55 ? C('o') : C('.');
    const heartEvery = 11;
    const phase = (q * 5) % heartEvery;
    for (let s = 0; s < steps; s++) {
      const th = (s / steps) * TAU;
      const x = Math.round(cx + Math.cos(th) * r);
      const y = Math.round(cy + Math.sin(th) * r * 0.5);
      if ((s + phase) % heartEvery === 0 && u < 0.7) {
        g.put(x, y, v * 1.25, KC.ROSE, 0, C('<'));
        g.put(x + 1, y, v * 1.25, KC.ROSE, 0, C('3'));
      } else g.put(x, y, v, u < 0.3 ? KC.SKY : KC.ROYAL, 0, ch);
    }
  }
}

export const DROP_LIFE = 1.9; // s que dura el estallido de un drop
const DRAG = 2.2; // 1/s: qué tan rápido frenan las chispas

// el drop: onda de choque que cruza la pantalla y una explosión de corazones y chispas desde el centro
export function drawDropFx(g, E, k) {
  const age = E.dropAge;
  const di = E.dropIdx;
  if (di < 0 || age < 0 || age > DROP_LIFE) return;
  const { cols, rows } = g;
  const cx = cols / 2;
  const cy = rows * 0.42;
  // ondas de choque (la segunda llega un poco después y más tenue)
  const R = cols * 0.6;
  for (let w = 0; w < 2; w++) {
    const aw = age - w * 0.11;
    if (aw <= 0 || aw >= 1.2) continue;
    const u = aw / 1.2;
    const r = R * (1 - Math.exp(-aw * 3.4));
    const steps = Math.max(28, Math.floor(r * 5));
    const v = (w ? 0.34 : 0.62) * (1 - u) * (1 - u) * k;
    const col = w ? KC.ROYAL : u < 0.3 ? KC.WHITE : KC.SKY;
    const ch = u < 0.25 ? C('#') : u < 0.6 ? C('O') : C('o');
    for (let s = 0; s < steps; s++) {
      const th = (s / steps) * TAU;
      const x = Math.round(cx + Math.cos(th) * r);
      const y = Math.round(cy + Math.sin(th) * r * 0.5);
      if (!w && s % 9 === 4 && u > 0.08) {
        g.put(x, y, v * 1.2, KC.ROSE, 0, C('<'));
        g.put(x + 1, y, v * 1.2, KC.ROSE, 0, C('3'));
      } else g.put(x, y, v, col, 0, ch);
    }
  }
  // explosión: corazones (suben y se mecen) y chispas (salen disparadas y frenan), desde el centro. En pantallas grandes
  // viajan más lejos, para que la explosión ocupe la misma proporción de la pantalla.
  const n = Math.round(Math.max(70, Math.min(230, (cols * rows) / 70)));
  const half = cols * 0.5;
  for (let p = 0; p < n; p++) {
    const life = 0.9 + 1.0 * hash(p, di, 103);
    if (age >= life) continue;
    const ang = hash(p, di, 101) * TAU;
    // alcance (en celdas) y rozamiento: salen disparadas y frenan; las más rápidas llegan a los bordes
    const spd = half * (0.22 + 0.95 * Math.pow(hash(p, di, 102), 1.2)) * DRAG;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    const kind = hash(p, di, 104);
    const heart = kind < 0.4;
    const d = (spd * (1 - Math.exp(-age * DRAG))) / DRAG;
    const lift = heart ? 2 * age * age + 2.5 * age : 2 * age * age;
    const sway = heart ? Math.sin(age * 5 + p) * 0.8 : 0;
    const x = Math.round(cx + cs * d + sway);
    const y = Math.round(cy + sn * d * 0.5 - lift);
    const fade = 1 - age / life;
    const v = 0.95 * Math.pow(fade, 1.1) * k;
    if (heart) {
      const col = age < 0.1 ? KC.WHITE : kind < 0.13 ? KC.FUCHSIA : kind < 0.26 ? KC.BLUSH : KC.ROSE;
      g.put(x, y, v, col, 0, C('<'));
      g.put(x + 1, y, v, col, 0, C('3'));
    } else {
      const col = age < 0.12 ? KC.WHITE : kind < 0.62 ? KC.SKY : kind < 0.86 ? KC.ROYAL : KC.WHITE;
      g.put(x, y, v, col, 0, fade > 0.55 ? C('*') : fade > 0.28 ? C('+') : C('.'));
      if (age > 0.05) {
        const a2 = age - 0.05;
        const d2 = (spd * (1 - Math.exp(-a2 * DRAG))) / DRAG;
        g.put(Math.round(cx + cs * d2), Math.round(cy + sn * d2 * 0.5 - 2 * a2 * a2), v * 0.5, KC.ROYAL, 0, C('.'));
      }
    }
  }
}

// tint = [interior, medio] del resplandor; cols = familias de color que le quedan bien al texto
export const MOODS = {
  stars: { draw: stars, tint: [[16, 30, 92], [5, 10, 38]], cols: ['cream', 'white', 'rose', 'violet'] },
  rain: { draw: rain, tint: [[10, 30, 74], [5, 13, 36]], cols: ['white', 'ice', 'cyan', 'violet'] },
  embers: { draw: embers, tint: [[58, 22, 20], [22, 9, 18]], cols: ['gold', 'cream', 'orange', 'rose'] },
  waves: { draw: waves, tint: [[12, 42, 112], [5, 15, 52]], cols: ['white', 'cyan', 'violet', 'mint'] },
  tunnel: { draw: tunnel, tint: [[22, 28, 108], [8, 10, 50]], cols: ['white', 'violet', 'rose', 'ice'] },
  matrix: { draw: matrix, tint: [[8, 40, 40], [4, 17, 24]], cols: ['mint', 'white', 'cyan', 'gold'] },
  snow: { draw: snow, tint: [[24, 44, 108], [8, 15, 46]], cols: ['white', 'ice', 'cyan', 'blush'] },
  rings: { draw: rings, tint: [[36, 26, 112], [13, 10, 54]], cols: ['pink', 'white', 'rose', 'violet'] },
  fireflies: { draw: fireflies, tint: [[14, 32, 76], [5, 12, 34]], cols: ['gold', 'mint', 'cream', 'white'] },
  spectrum: { draw: spectrum, tint: [[26, 32, 112], [9, 11, 52]], cols: ['white', 'cyan', 'pink', 'violet'] },
  plasma: { draw: plasma, tint: [[34, 28, 116], [12, 10, 54]], cols: ['white', 'pink', 'violet', 'cyan'] },
  hearts: { draw: hearts, tint: [[34, 26, 104], [12, 9, 48]], cols: ['cream', 'rose', 'pink', 'gold'] },
  pulse: { draw: pulse, tint: [[30, 28, 112], [10, 10, 52]], cols: ['white', 'pink', 'rose', 'violet'] },
  aurora: { draw: aurora, tint: [[16, 52, 122], [6, 20, 58]], cols: ['white', 'mint', 'cyan', 'violet'] },
};
export const MOOD_NAMES = Object.keys(MOODS);

export function drawMood(name, g, t, a, E) {
  const m = MOODS[name] || MOODS.stars;
  if (a > 0.01) m.draw(g, t, a, E);
}

export function tintOf(name) {
  return (MOODS[name] || MOODS.stars).tint;
}
