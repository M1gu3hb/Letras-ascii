// Rejilla de caracteres + render a canvas. Todo lo que se ve son caracteres ASCII (0x20–0x7E).
import { clamp, smooth } from './util.js';

// Paleta: crema / rosa / ámbar / lavanda / blanco / rubor / durazno / rosa profundo + colores neón
export const KC = { CREAM: 0, ROSE: 1, AMBER: 2, LAV: 3, WHITE: 4, BLUSH: 5, PEACH: 6, DEEP: 7, CYAN: 8, MINT: 9, GOLD: 10, VIOLET: 11, RUBY: 12, ICE: 13, ORANGE: 14, FUCHSIA: 15, ROYAL: 16, SKY: 17 };
export const NCOL = 18;
const PAL = [
  [255, 236, 222],
  [255, 112, 150],
  [255, 178, 108],
  [158, 138, 206],
  [255, 250, 245],
  [255, 176, 192],
  [255, 208, 164],
  [214, 72, 122],
  [96, 226, 255],
  [128, 255, 196],
  [255, 214, 92],
  [184, 140, 255],
  [255, 58, 92],
  [206, 236, 255],
  [255, 138, 58],
  [255, 84, 214],
  [84, 128, 255], // azul rey
  [156, 194, 255], // azul cielo
];
const hex = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const BASE = '#03050f'; // negro azulado: el fondo de todo
const EDGE = '#03040c'; // borde del resplandor (se funde con el fondo)
// reacciones a la música que pinta flush(): se llena cada cuadro desde Scene (sin crear objetos nuevos)
const NO_FX = { pulse: 0, lift: 0, bloom: 0, bloomScale: 1, flash: 0, flashMix: 0, shakeX: 0, shakeY: 0, boost: 0 };
const LEVEL_ALPHA = [0.34, 0.5, 0.66, 0.8, 0.92, 1];

// Rampas de densidad (de vacío a sólido). Índice = "paleta de relleno".
export const RAMPS = [
  ' .:-=+*#%@', // 0 clásica
  " .'`,:;~=+x*#%@", // 1 suave
  ' .,-/|\\+x%#@', // 2 rayada
  ' .:;oO0@', // 3 puntos
];
const MIN_ROWS = 28; // filas mínimas que busca la rejilla en un escenario chico (ver fit)
export const PAL_SELF = 4; // relleno con las letras de la propia palabra
export const PAL_EDGE = 5; // relleno @ y bordes según orientación: | - / \
// caracteres que se pueden usar para los rellenos sólidos (todo ASCII)
export const FILL_CHARS = '@#%&80';
const RAMP_CODES = RAMPS.map((s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0))));
const CH = [];
for (let i = 0; i < 128; i++) CH[i] = String.fromCharCode(i);

export class Grid {
  constructor() {
    this.cols = 0;
    this.rows = 0;
  }
  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.I = new Float32Array(n);
    this.B = new Float32Array(n);
    this.T = new Float32Array(n);
    this.K = new Uint8Array(n);
    this.P = new Uint8Array(n);
    this.O = new Uint8Array(n);
  }
  clear() {
    this.I.fill(0);
    this.O.fill(0);
  }
  // x,y enteros. Gana la celda más intensa.
  put(x, y, v, k = 0, p = 0, o = 0) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    if (v > this.I[i]) {
      this.I[i] = v;
      this.K[i] = k;
      this.P[i] = p;
      this.O[i] = o;
    }
  }
  // Texto ASCII directo (para pistas pequeñas).
  text(str, col, row, k = 0, v = 0.8) {
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c > 32 && c < 127) this.put(col + i, row, v, k, 0, c);
    }
  }
  // Halo: difumina la intensidad y la devuelve como puntos tenues alrededor de las letras.
  bloom(gain, k = KC.ROSE) {
    const { cols, rows, I, B, T } = this;
    // horizontal (radio 2)
    for (let y = 0; y < rows; y++) {
      const o = y * cols;
      for (let x = 0; x < cols; x++) {
        let s = 0;
        for (let d = -2; d <= 2; d++) {
          const xx = x + d;
          if (xx < 0 || xx >= cols) continue;
          const v = I[o + xx];
          s += (v > 1 ? 1 : v) * (d === 0 ? 1 : d === 1 || d === -1 ? 0.8 : 0.5);
        }
        T[o + x] = s;
      }
    }
    // vertical (radio 1)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let s = T[y * cols + x];
        if (y > 0) s += T[(y - 1) * cols + x] * 0.7;
        if (y < rows - 1) s += T[(y + 1) * cols + x] * 0.7;
        B[y * cols + x] = s;
      }
    }
    for (let i = 0; i < cols * rows; i++) {
      if (I[i] < 0.1) {
        const g = B[i] * gain;
        if (g > 0.035) {
          I[i] = g > 0.2 ? 0.2 : g;
          this.K[i] = k;
          this.P[i] = 0;
          this.O[i] = 0;
        }
      }
    }
  }
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.grid = new Grid();
    this.lists = [];
    this.counts = new Int32Array(NCOL * 6);
    this.styles = [];
    this.tint = [[16, 30, 92], [5, 10, 38]];
    for (let k = 0; k < NCOL; k++) {
      for (let l = 0; l < 6; l++) {
        const [r, g, b] = PAL[k];
        this.styles.push(`rgba(${r},${g},${b},${LEVEL_ALPHA[l]})`);
      }
    }
    this.bgGrad = null;
    this.bloomImg = null; // resplandor azul de los graves
    this.flashA = null; // destello del drop: blanco…
    this.flashB = null; // …que se apaga en azul
    // personalización del ASCII (los valores por defecto dejan todo exactamente como siempre)
    this.density = 1; // detalle de la rejilla: más alto = más caracteres, más chicos
    this.bold = false; // caracteres en negrita
    this.fillCode = 64; // carácter de los rellenos sólidos (@ por defecto)
    this.gain = 1; // intensidad del color
    this.fit();
  }

  // Detalle de la rejilla. Devuelve true si cambió (hay que volver a acomodar la letra).
  setDensity(d) {
    const v = clamp(+d || 1, 0.5, 2);
    if (Math.abs(v - this.density) < 0.004) return false;
    this.density = v;
    this.fit();
    return true;
  }

  // ajustes que se aplican al dibujar, sin tocar la distribución
  setLook(st) {
    this.bold = st.weight === 'bold';
    this.gain = clamp(st.bright ?? 1, 0.5, 1.6);
    const c = typeof st.fillch === 'string' && st.fillch.length === 1 ? st.fillch.charCodeAt(0) : 64;
    this.fillCode = FILL_CHARS.includes(String.fromCharCode(c)) ? c : 64;
  }

  fit() {
    const host = this.cv.parentElement;
    // el tamaño REAL del escenario (el de un teléfono, sobre todo en vertical, mide menos de 240 px: con un mínimo
    // el lienzo salía más grande que su caja, se recortaba y las palabras no encajaban)
    const W = Math.max(32, (host && host.clientWidth) || window.innerWidth);
    const H = Math.max(32, (host && host.clientHeight) || window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px';
    this.cv.style.height = H + 'px';
    // columnas: con detalle 1 es exactamente la fórmula de siempre. Más detalle = más columnas
    // (pero nunca celdas de menos de ~3 px ni más de ~30 mil celdas, para que siga fluido)
    const dn = this.density;
    const lo = Math.round(72 * Math.min(1, dn));
    const hi = Math.max(lo, Math.min(Math.round(230 * Math.max(1, dn)), Math.floor(W / 3.1)));
    let cols = clamp(Math.round((W / 4.6) * dn), lo, hi);
    // un escenario chico y apaisado (el «Horizontal» en un teléfono vertical: ~330×185 px) saldría con ~20 filas: no hay
    // dónde poner la palabra grande Y la frase de abajo. Se afina la rejilla hasta tener filas suficientes (en pantalla la
    // letra mide lo mismo; solo se dibuja con más caracteres). Respeta «Detalle»: con menos detalle se pide proporcionalmente menos.
    const need = Math.ceil((MIN_ROWS * 2 * W * Math.min(1, dn)) / H);
    if (cols < need) cols = Math.min(hi, need);
    if (dn > 1) {
      const maxCells = 30000;
      const byCells = Math.floor(Math.sqrt((maxCells * 2 * W) / H));
      cols = Math.max(lo, Math.min(cols, byCells));
    }
    this.cellW = W / cols;
    this.fs = this.cellW / 0.6;
    this.cellH = this.cellW * 2.0;
    this.rows = Math.max(20, Math.floor(H / this.cellH));
    this.offY = (H - this.rows * this.cellH) / 2;
    this.grid.resize(cols, this.rows);
    const n = cols * this.rows;
    this.lists = [];
    for (let i = 0; i < NCOL * 6; i++) this.lists.push(new Int32Array(n));
    // viñeta por celda
    this.vig = new Float32Array(n);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x + 0.5) / cols - 0.5;
        const dy = (y + 0.5) / this.rows - 0.5;
        const r = Math.sqrt(dx * dx * 1.1 + dy * dy * 0.9) * 2;
        this.vig[y * cols + x] = 1 - 0.42 * smooth(0.62, 1.15, r);
      }
    }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.makeGlows();
    this.setTint(this.tint[0], this.tint[1]);
  }

  // Resplandor de los graves y destello del drop. Son degradados muy suaves: se pintan UNA vez por tamaño en un lienzo
  // chico (1/4) y cada cuadro solo se estiran con drawImage, que cuesta mucho menos que evaluar un degradado radial.
  makeGlows() {
    const { W, H } = this;
    const S = 4;
    const cx = W * 0.5;
    const cy = H * 0.44;
    const R = Math.max(H * 0.62, W * 0.55);
    const F = Math.hypot(W, H) * 0.62;
    // [x, y, ancho, alto] en px del escenario donde se estira cada sprite
    this.glowBox = [cx - R, cy - R, R * 2, R * 2];
    const paint = (w, h, ox, oy, rad, stops) => {
      const cv = document.createElement('canvas');
      cv.width = Math.max(4, Math.ceil(w / S));
      cv.height = Math.max(4, Math.ceil(h / S));
      const c = cv.getContext('2d');
      const gr = c.createRadialGradient((cx - ox) / S, (cy - oy) / S, 0, (cx - ox) / S, (cy - oy) / S, rad / S);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      c.fillStyle = gr;
      c.fillRect(0, 0, cv.width, cv.height);
      return cv;
    };
    this.bloomImg = paint(R * 2, R * 2, cx - R, cy - R, R, [
      [0, 'rgba(47,91,255,0.9)'],
      [0.22, 'rgba(40,78,236,0.55)'],
      [0.5, 'rgba(26,52,178,0.2)'],
      [0.78, 'rgba(14,28,110,0.05)'],
      [1, 'rgba(10,20,90,0)'],
    ]);
    this.flashA = paint(W, H, 0, 0, F, [
      [0, 'rgba(255,255,255,1)'],
      [0.16, 'rgba(226,236,255,0.78)'],
      [0.42, 'rgba(96,136,255,0.38)'],
      [0.75, 'rgba(60,100,255,0.14)'],
      [1, 'rgba(47,91,255,0.03)'],
    ]);
    this.flashB = paint(W, H, 0, 0, F, [
      [0, 'rgba(74,118,255,0.95)'],
      [0.4, 'rgba(47,91,255,0.4)'],
      [1, 'rgba(30,60,220,0)'],
    ]);
    this.glowC = [cx, cy];
  }

  // colores del resplandor de fondo (interior, medio); se llama cada cuadro con la mezcla de ambientes
  setTint(a, b) {
    this.tint = [a, b];
    const W = this.W;
    const H = this.H;
    const g = this.ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, Math.max(W, H) * 0.75);
    g.addColorStop(0, hex(a));
    g.addColorStop(0.55, hex(b));
    g.addColorStop(1, EDGE);
    this.bgGrad = g;
  }

  flush(env) {
    const { ctx, grid, lists, counts, cellW, cellH, fs, offY, dpr } = this;
    const fx = env || NO_FX;
    const cols = grid.cols;
    const n = cols * grid.rows;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalAlpha = clamp(0.62 + fx.pulse * 0.3 + fx.lift, 0, 1);
    ctx.fillStyle = this.bgGrad;
    ctx.fillRect(0, 0, this.W, this.H);
    // resplandor azul de los graves (detrás de los caracteres) y destello del drop; ambos aditivos
    if (fx.bloom > 0.01 || fx.flash > 0.004) {
      ctx.globalCompositeOperation = 'lighter';
      if (fx.bloom > 0.01) {
        const [cx, cy] = this.glowC;
        const [bx, by, bw, bh] = this.glowBox;
        const s = fx.bloomScale;
        ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * cx * (1 - s), dpr * cy * (1 - s));
        ctx.globalAlpha = fx.bloom > 1 ? 1 : fx.bloom;
        ctx.drawImage(this.bloomImg, bx, by, bw, bh);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (fx.flash > 0.004) {
        const k = fx.flashMix;
        if (k < 0.98) {
          ctx.globalAlpha = fx.flash * (1 - k);
          ctx.drawImage(this.flashA, 0, 0, this.W, this.H);
        }
        if (k > 0.02) {
          ctx.globalAlpha = fx.flash * k;
          ctx.drawImage(this.flashB, 0, 0, this.W, this.H);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    // sacudida de cámara: solo mueve los caracteres (el fondo y la letra del karaoke se quedan quietos)
    if (fx.shakeX || fx.shakeY) ctx.setTransform(dpr, 0, 0, dpr, fx.shakeX * dpr, fx.shakeY * dpr);

    counts.fill(0);
    const vig = this.vig;
    const Ig = grid.I;
    const Kg = grid.K;
    const gain = this.gain * (1 + fx.boost);
    for (let i = 0; i < n; i++) {
      const raw = Ig[i];
      if (raw <= 0.03) continue;
      const v = raw * vig[i] * gain;
      if (v < 0.03) continue;
      const lvl = v >= 0.95 ? 5 : v >= 0.75 ? 4 : v >= 0.55 ? 3 : v >= 0.38 ? 2 : v >= 0.2 ? 1 : 0;
      const key = Kg[i] * 6 + lvl;
      lists[key][counts[key]++] = i;
    }

    ctx.font = `${this.bold ? '700 ' : ''}${fs}px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const base = offY + fs * 0.93;
    const Pg = grid.P;
    const Og = grid.O;
    const fillCode = this.fillCode;
    for (let key = 0; key < NCOL * 6; key++) {
      const c = counts[key];
      if (!c) continue;
      ctx.fillStyle = this.styles[key];
      const list = lists[key];
      for (let m = 0; m < c; m++) {
        const i = list[m];
        let code = Og[i];
        if (!code) {
          const ramp = RAMP_CODES[Pg[i] > 3 ? 0 : Pg[i]];
          const v = Ig[i] > 1 ? 1 : Ig[i];
          code = ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
          if (code === 32) continue;
        }
        if (code === 64) code = fillCode;
        const y = (i / cols) | 0;
        const x = i - y * cols;
        ctx.fillText(CH[code], x * cellW, base + y * cellH);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
