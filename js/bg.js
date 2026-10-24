// Ambientes de fondo hechos solo de caracteres. Cada uno es una función pura del tiempo
// (sin estado), así que funcionan igual al pausar, saltar o repetir.
import { KC } from './grid.js';
import { hash, clamp } from './util.js';

const TAU = Math.PI * 2;
const C = (s) => s.charCodeAt(0);
const MAT = Array.from('0123456789ABCDEFXZ*+=<>/\\|').map(C);

// E = { low, mid, hi, pulse } entre 0 y 1; a = opacidad del ambiente (0..1)

function stars(g, t, a, E) {
  const n = ((g.cols * g.rows) / 40) | 0;
  const rows = g.rows;
  for (let i = 0; i < n; i++) {
    const sp = 0.18 + hash(i, 3, 77) * 0.5;
    const y = (((hash(i, 2, 77) * rows - t * sp) % rows) + rows) % rows;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.5 + hash(i, 5, 77) * 1.6) + hash(i, 4, 77) * 6.28);
    const v = (0.08 + 0.2 * tw + E.pulse * 0.12) * a;
    const ch = [46, 46, 46, 39, 58, 96, 44, 43][(hash(i, 6, 77) * 8) | 0];
    g.put((hash(i, 1, 77) * g.cols) | 0, y | 0, v, hash(i, 7, 77) > 0.84 ? KC.ROSE : KC.LAV, 0, ch);
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
    const head = ((hash(i, 4, 9) * cyc + t * sp) % cyc) - 3;
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
    const u = (((hash(i, 3, 13) * rows + t * sp) % rows) + rows) % rows;
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
    const col = l % 3 === 0 ? KC.CYAN : l % 3 === 1 ? KC.VIOLET : KC.ICE;
    for (let x = 0; x < cols; x++) {
      const y = base + Math.sin(x * (0.11 + 0.02 * l) + t * (0.8 + 0.25 * l) + l * 1.7) * amp + Math.sin(x * 0.043 - t * 0.5) * 1.4;
      const yi = Math.round(y);
      g.put(x, yi, (0.2 - 0.025 * l) * a, col, 0, l % 2 ? C('-') : C('~'));
      if (l === L - 1) for (let k = 1; k < 4; k++) g.put(x, yi + k, 0.05 * a, KC.VIOLET, 0, C('.'));
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
    const y = (hash(i, 3, 31) * rows + t * sp) % rows;
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
    const col = hash(i, 6, 41) > 0.5 ? KC.GOLD : KC.MINT;
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
    const col = f < 0.33 ? KC.CYAN : f < 0.66 ? KC.VIOLET : KC.FUCHSIA;
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
    const u = (((hash(i, 3, 61) * rows + t * sp) % rows) + rows) % rows;
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
    const col = x / cols < 0.4 ? KC.MINT : x / cols < 0.75 ? KC.CYAN : KC.VIOLET;
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
    const col = f < 0.33 ? KC.ROSE : f < 0.66 ? KC.FUCHSIA : KC.VIOLET;
    for (let k = 0; k <= h; k++) {
      const top = k === h;
      g.put(x, base - k, (top ? 0.34 : 0.1 + 0.1 * (1 - k / (h + 1))) * a, top ? KC.BLUSH : col, 0, top ? C('=') : (k & 1) ? C('|') : C(':'));
    }
  }
}

// tint = [interior, medio] del resplandor; cols = familias de color que le quedan bien al texto
export const MOODS = {
  stars: { draw: stars, tint: [[43, 18, 54], [21, 10, 29]], cols: ['cream', 'white', 'rose', 'violet'] },
  rain: { draw: rain, tint: [[14, 36, 60], [7, 18, 30]], cols: ['white', 'ice', 'cyan', 'violet'] },
  embers: { draw: embers, tint: [[62, 24, 10], [30, 11, 8]], cols: ['gold', 'cream', 'orange', 'rose'] },
  waves: { draw: waves, tint: [[10, 44, 62], [6, 20, 34]], cols: ['white', 'cyan', 'violet', 'mint'] },
  tunnel: { draw: tunnel, tint: [[30, 16, 66], [14, 8, 36]], cols: ['white', 'violet', 'rose', 'ice'] },
  matrix: { draw: matrix, tint: [[10, 46, 34], [6, 22, 17]], cols: ['mint', 'white', 'cyan', 'gold'] },
  snow: { draw: snow, tint: [[22, 36, 62], [10, 16, 32]], cols: ['white', 'ice', 'cyan', 'blush'] },
  rings: { draw: rings, tint: [[62, 16, 56], [28, 8, 28]], cols: ['pink', 'white', 'rose', 'violet'] },
  fireflies: { draw: fireflies, tint: [[30, 44, 18], [12, 20, 9]], cols: ['gold', 'mint', 'cream', 'white'] },
  spectrum: { draw: spectrum, tint: [[44, 16, 74], [18, 8, 36]], cols: ['white', 'cyan', 'pink', 'violet'] },
  plasma: { draw: plasma, tint: [[48, 14, 70], [22, 8, 36]], cols: ['white', 'pink', 'violet', 'cyan'] },
  hearts: { draw: hearts, tint: [[66, 16, 40], [30, 8, 20]], cols: ['cream', 'rose', 'pink', 'gold'] },
  pulse: { draw: pulse, tint: [[56, 14, 48], [26, 8, 30]], cols: ['white', 'pink', 'rose', 'violet'] },
  aurora: { draw: aurora, tint: [[12, 58, 58], [6, 26, 38]], cols: ['white', 'mint', 'cyan', 'violet'] },
};
export const MOOD_NAMES = Object.keys(MOODS);

export function drawMood(name, g, t, a, E) {
  const m = MOODS[name] || MOODS.stars;
  if (a > 0.01) m.draw(g, t, a, E);
}

export function tintOf(name) {
  return (MOODS[name] || MOODS.stars).tint;
}
