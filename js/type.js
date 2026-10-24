// Tipografía -> cobertura por celda. Cada letra es un "sprite" rasterizado a 2x2 subceldas por celda,
// para que los bordes se vean suaves aun siendo caracteres.
import { clamp } from './util.js';

export const SS = 2; // subceldas por celda
export const PADC = 1.5; // margen lateral de cada letra (en celdas)
// Familias disponibles. sq = compresión horizontal (letras más altas por el mismo ancho).
export const FACES = {
  round: { f: '"Nunito"', w: 800, i: '', sq: 0.78 },
  heavy: { f: '"Nunito"', w: 900, i: '', sq: 0.76 },
  serif: { f: '"Playfair Display"', w: 900, i: 'italic ', sq: 0.8 },
  script: { f: '"Pacifico"', w: 400, i: '', sq: 0.84 },
  tall: { f: '"Anton"', w: 400, i: '', sq: 0.94 },
  hand: { f: '"Caveat"', w: 700, i: '', sq: 0.86 },
  wide: { f: '"Unbounded"', w: 900, i: '', sq: 0.62 },
  roman: { f: '"Cinzel"', w: 900, i: '', sq: 0.7 },
};
export const FACE_NAMES = Object.keys(FACES);
const TAIL = ', system-ui, sans-serif';
export const fontStr = (name, px) => {
  const f = FACES[name] || FACES.round;
  return `${f.i}${f.w} ${px}px ${f.f}${TAIL}`;
};
const CAP_TARGET = 70; // altura de la "H" (en % del cuerpo) a la que se igualan todas las fuentes
const STRETCH_ORDER = ['o', 'a', 'e', 'u'];

// ───────── grosor ─────────
// -1 (fino) … 0 (como siempre) … +1 (grueso). Se hace engordando o comiendo el contorno de cada letra
// antes de pasarla a caracteres, así que sirve con cualquier tipografía. El grosor se mide en "em"
// (la altura de la tipografía) para que se vea igual en pantallas chicas y grandes.
export const THICK_STEPS = 20;
export const thickQ = (t) => Math.round(clamp(+t || 0, -1, 1) * THICK_STEPS);
const GROW_EM = 0.034; // cuánto se engorda cada lado con grosor +1
// cuánto se come cada lado con grosor -1 (en las tipografías de trazos finísimos, menos: si no, se borran)
const SHRINK_EM = { round: 0.05, heavy: 0.05, serif: 0.03, script: 0.036, tall: 0.05, hand: 0.027, wide: 0.05, roman: 0.016 };
// radio (en em) con signo: + engorda, - adelgaza
export function thickRadiusEm(face, tq) {
  if (!tq) return 0;
  const t = tq / THICK_STEPS;
  if (t > 0) return GROW_EM * t;
  return -(SHRINK_EM[face] ?? 0.03) * -t;
}
// Las letras más gordas necesitan más aire (como en una tipografía negrita) y las finas se pueden acercar un poco.
// k = escala de cuerpo de la tipografía (ver Typo.face).
export function thickTrackEm(face, tq, k = 1) {
  const r = thickRadiusEm(face, tq);
  return (r > 0 ? 2 * r : 1.2 * r) * k;
}

export class Typo {
  constructor() {
    this.mctx = document.createElement('canvas').getContext('2d');
    this.cv = document.createElement('canvas');
    this.cx = this.cv.getContext('2d', { willReadFrequently: true });
    this.cw = 10;
    this.ch = 20;
    this.cache = new Map();
    this.fm = {};
  }
  // escala de cuerpo para que todas las familias tengan la misma altura de mayúscula
  face(name) {
    const n = FACES[name] ? name : 'round';
    let m = this.fm[n];
    if (m) return m;
    this.mctx.font = fontStr(n, 100);
    const asc = this.mctx.measureText('H').actualBoundingBoxAscent || CAP_TARGET;
    m = { n, k: clamp(CAP_TARGET / asc, 0.6, 1.5), sq: FACES[n].sq };
    this.fm[n] = m;
    return m;
  }
  setMetrics(cw, ch) {
    this.cw = cw;
    this.ch = ch;
    this.cache.clear();
  }
  // ancho de la palabra en "em" (track = espacio extra entre letras, también en "em")
  unitWidth(text, face = 'round', track = 0, thick = 0) {
    const m = this.face(face);
    this.mctx.font = fontStr(m.n, 100 * m.k);
    const base = (this.mctx.measureText(text).width / 100) * m.sq;
    const trk = track + thickTrackEm(m.n, thickQ(thick), m.k);
    return trk && text.length > 1 ? base + trk * m.sq * (text.length - 1) : base;
  }
  // celdas horizontales por em cuando el em mide F filas
  emCells(F) {
    return (F * this.ch) / this.cw;
  }

  // Include the raster margin and thick-stroke padding in fitting decisions.
  wordBounds(text, F, maxExtra, wantStretch, face = 'round', thick = 0, track = 0) {
    const fm = this.face(face);
    const radius = thickRadiusEm(fm.n, thickQ(thick)) * F * this.ch * fm.k;
    const pad = PADC + (radius > 0 ? Math.ceil(radius * fm.sq / this.cw) : 0);
    const extra = wantStretch && /[oaeu]/i.test(text) ? maxExtra : 0;
    return { width: Math.ceil(this.unitWidth(text, face, track, thick) * this.emCells(F) + extra + 2 * pad + 4), height: Math.ceil(F * 1.16) + 2 };
  }

  // thick: -1 … +1 (0 = grosor original de la tipografía)
  letterSprite(chr, F, face = 'round', thick = 0) {
    const m = this.face(face);
    const tq = thickQ(thick);
    const key = m.n + '|' + chr + '|' + F.toFixed(2) + (tq ? '|' + tq : '');
    const hit = this.cache.get(key);
    if (hit) return hit;
    const em = this.emCells(F);
    const adv = this.unitWidth(chr, m.n) * em;
    const fpx = F * this.ch * m.k; // cuerpo de la letra en píxeles
    const r = thickRadiusEm(m.n, tq) * fpx; // radio del grosor en píxeles (con signo)
    // si engorda, el margen lateral crece para que el trazo no se corte
    const pad = PADC + (r > 0 ? Math.ceil((r * m.sq) / this.cw) : 0);
    const wc = Math.ceil(adv + 2 * pad);
    const hc = Math.ceil(F * 1.16) + 2;
    const w = wc * SS;
    const h = hc * SS;
    this.cv.width = w;
    this.cv.height = h;
    const cx = this.cx;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, w, h);
    cx.setTransform((SS * m.sq) / this.cw, 0, 0, SS / this.ch, 0, 0);
    cx.font = fontStr(m.n, fpx);
    cx.textBaseline = 'alphabetic';
    cx.fillStyle = '#fff';
    const px = (pad * this.cw) / m.sq;
    const py = (1 + F * 0.86) * this.ch;
    cx.fillText(chr, px, py);
    if (r) {
      cx.lineJoin = 'round';
      cx.lineWidth = Math.abs(r) * 2;
      if (r > 0) {
        cx.strokeStyle = '#fff';
        cx.strokeText(chr, px, py);
      } else {
        cx.globalCompositeOperation = 'destination-out';
        cx.strokeStyle = '#000';
        cx.strokeText(chr, px, py);
        cx.globalCompositeOperation = 'source-over';
      }
    }
    const d = cx.getImageData(0, 0, w, h).data;
    const cov = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) cov[i] = d[i * 4 + 3] / 255;
    const sp = { chr, w, h, cov, adv, wc, hc, pad, pivot: -1, face: m.n };
    this.cache.set(key, sp);
    return sp;
  }

  // Columna "plana" del glifo, donde se puede duplicar para estirar la vocal sin deformar el trazo.
  pivotOf(sp) {
    if (sp.pivot >= 0) return sp.pivot;
    const { w, h, cov } = sp;
    const pad = sp.pad ?? PADC;
    const lo = Math.floor(pad * SS + (w - 2 * pad * SS) * 0.34);
    const hi = Math.ceil(pad * SS + (w - 2 * pad * SS) * 0.66);
    let best = lo;
    let bestScore = 1e9;
    for (let x = lo; x < hi; x++) {
      let d = 0;
      for (let y = 0; y < h; y++) d += Math.abs(cov[y * w + x] - cov[y * w + x + 1]) + Math.abs(cov[y * w + x] - cov[y * w + x - 1]);
      if (d < bestScore) {
        bestScore = d;
        best = x;
      }
    }
    sp.pivot = best;
    return best;
  }

  // Construye una palabra: letras, caja y buffers.
  // thick: grosor (-1…+1); track: espacio extra entre letras en "em"
  buildWord(text, F, maxExtra, wantStretch, face = 'round', thick = 0, track = 0) {
    const fm = this.face(face);
    const em = this.emCells(F);
    this.mctx.font = fontStr(fm.n, 100 * fm.k);
    const mw = (s) => (this.mctx.measureText(s).width / 100) * em * fm.sq;
    const tq = thickQ(thick);
    const trk = track + thickTrackEm(fm.n, tq, fm.k);
    const tr = trk ? trk * em * fm.sq : 0;
    const W = mw(text) + tr * Math.max(0, text.length - 1);
    const letters = [];
    for (let i = 0; i < text.length; i++) {
      const x = mw(text.slice(0, i));
      const xe = mw(text.slice(0, i + 1));
      letters.push({ ch: text[i], x: x + tr * i, adv: xe - x, sp: this.letterSprite(text[i], F, fm.n, thick) });
    }
    let pad = PADC;
    for (const L of letters) if (L.sp.pad > pad) pad = L.sp.pad;
    let stretchIdx = -1;
    if (wantStretch && maxExtra > 0) {
      for (const v of STRETCH_ORDER) {
        const k = text.toLowerCase().indexOf(v);
        if (k >= 0) {
          stretchIdx = k;
          break;
        }
      }
    }
    const Hb = Math.ceil(F * 1.16) + 2;
    const Wb = Math.ceil(W + (stretchIdx >= 0 ? maxExtra : 0) + 2 * pad + 4);
    const w = {
      text,
      face: fm.n,
      F,
      em,
      W,
      Wb,
      Hb,
      letters,
      stretchIdx,
      maxExtra: stretchIdx >= 0 ? maxExtra : 0,
      buf: new Float32Array(Wb * Hb),
      cov0: new Float32Array(Wb * Hb),
      ech: new Uint8Array(Wb * Hb),
      lp: letters.map(() => ({ ox: 0, oy: 0, sx: 1, sy: 1, sh: 0, a: 1 })),
      hi: null,
      p3: null,
      homes: null,
      ghost: null,
      topRow: 0,
      gx: 0,
      gy: 0,
    };
    if (stretchIdx >= 0) letters[stretchIdx].sp.pivotCol = this.pivotOf(letters[stretchIdx].sp);
    // estado final (sin estiramiento)
    resetLP(w);
    composeWord(w, w.lp, 0, w.cov0);
    // fila superior visible y puntos fantasma
    let top = Hb;
    const ghost = [];
    for (let j = 0; j < Hb; j++) {
      for (let i = 0; i < Wb; i++) {
        const v = w.cov0[j * Wb + i];
        if (v > 0.3 && j < top) top = j;
        if (v > 0.55 && (i + j) % 2 === 0) ghost.push(i, j);
      }
    }
    w.topRow = top === Hb ? 1 : top;
    w.ghost = Int16Array.from(ghost);
    // puntos de partida para partículas
    const hx = [];
    const hy = [];
    const hc = [];
    for (let j = 0; j < Hb; j++) {
      for (let i = 0; i < Wb; i++) {
        const v = w.cov0[j * Wb + i];
        if (v > 0.16) {
          hx.push(i);
          hy.push(j);
          hc.push(v);
        }
      }
    }
    const ech0 = new Uint8Array(Wb * Hb);
    edgeChars(w.cov0, Wb, Hb, ech0);
    const hch = [];
    for (let k = 0; k < hx.length; k++) hch.push(ech0[hy[k] * Wb + hx[k]] || 64);
    w.homes = { x: Float32Array.from(hx), y: Float32Array.from(hy), c: Float32Array.from(hc), ch: Uint8Array.from(hch), n: hx.length };
    return w;
  }
}

export function resetLP(w) {
  for (const p of w.lp) {
    p.ox = 0;
    p.oy = 0;
    p.sx = 1;
    p.sy = 1;
    p.sh = 0;
    p.a = 1;
  }
}

// Compone la palabra en w.buf (o en `out`) aplicando transformaciones por letra.
export function composeWord(w, lp, extra, out) {
  out.fill(0);
  const { Wb, Hb, W, letters, stretchIdx } = w;
  const extraSub = stretchIdx >= 0 ? Math.round(clamp(extra, 0, w.maxExtra) * SS) : 0;
  const e = extraSub / SS;
  const cx = Wb / 2;
  for (let li = 0; li < letters.length; li++) {
    const L = letters[li];
    const sp = L.sp;
    const p = lp[li];
    if (p.a <= 0.01) continue;
    const isS = li === stretchIdx && extraSub > 0;
    const sws = sp.w + (isS ? extraSub : 0);
    const left = cx + (L.x - W / 2 - e / 2 + (stretchIdx >= 0 && li > stretchIdx ? e : 0)) - (sp.pad ?? PADC);
    const wS = sws / SS;
    const px = left + wS / 2;
    const py = Hb * 0.62;
    const sx = p.sx;
    const sy = p.sy;
    if (sx <= 0.01 || sy <= 0.01) continue;
    let x0 = px + (left - px) * sx + p.ox;
    let x1 = px + (left + wS - px) * sx + p.ox;
    if (x0 > x1) {
      const t = x0;
      x0 = x1;
      x1 = t;
    }
    const shAbs = Math.abs(p.sh) * Hb * 0.7;
    x0 -= shAbs + 1;
    x1 += shAbs + 1;
    let y0 = py - py * sy + p.oy;
    let y1 = py + (Hb - py) * sy + p.oy;
    if (y0 > y1) {
      const t = y0;
      y0 = y1;
      y1 = t;
    }
    const ix0 = Math.max(0, Math.floor(x0));
    const ix1 = Math.min(Wb - 1, Math.ceil(x1));
    const iy0 = Math.max(0, Math.floor(y0));
    const iy1 = Math.min(Hb - 1, Math.ceil(y1));
    const piv = isS ? sp.pivot : -1;
    const cov = sp.cov;
    const spw = sp.w;
    const sph = sp.h;
    const pa = p.a * 0.25;
    for (let j = iy0; j <= iy1; j++) {
      for (let i = ix0; i <= ix1; i++) {
        let acc = 0;
        for (let b = 0; b < 2; b++) {
          const yy = (j + 0.25 + b * 0.5 - p.oy - py) / sy + py;
          const v = yy * SS;
          if (v < 0 || v >= sph) continue;
          const row = (v | 0) * spw;
          for (let a = 0; a < 2; a++) {
            const xx = (i + 0.25 + a * 0.5 - p.ox - px) / sx + px - p.sh * (yy - py);
            let u = (xx - left) * SS;
            if (u < 0 || u >= sws) continue;
            if (isS && u > piv) u = u < piv + extraSub ? piv : u - extraSub;
            acc += cov[row + (u | 0)];
          }
        }
        const c = acc * pa;
        const idx = j * Wb + i;
        if (c > out[idx]) out[idx] = c;
      }
    }
  }
}

// Versión en alta resolución (sin transformaciones) para la nube de puntos 3D.
export function hiResOf(w) {
  if (w.hi) return w.hi;
  const hw = w.Wb * SS;
  const hh = w.Hb * SS;
  const hi = new Float32Array(hw * hh);
  const cx = w.Wb / 2;
  for (const L of w.letters) {
    const sp = L.sp;
    const left = Math.round((cx + (L.x - w.W / 2) - (sp.pad ?? PADC)) * SS);
    for (let y = 0; y < sp.h && y < hh; y++) {
      for (let x = 0; x < sp.w; x++) {
        const X = left + x;
        if (X < 0 || X >= hw) continue;
        const v = sp.cov[y * sp.w + x];
        if (v > hi[y * hw + X]) hi[y * hw + X] = v;
      }
    }
  }
  w.hi = hi;
  return hi;
}

// ───────── caracteres según la orientación del borde (| - / \) ─────────
// Devuelve para cada celda un código ASCII: relleno ("@", "#") o trazo de borde.
const C_FILL = 64; // @
const C_FILL2 = 35; // #
export function edgeCode(v, gx, gy) {
  if (v >= 0.84) return C_FILL;
  const ax = Math.abs(gx);
  const ay = Math.abs(gy);
  const m = ax + ay;
  if (m < 0.3) return v >= 0.6 ? C_FILL2 : v >= 0.3 ? 58 : 46; // # : .
  if (ay < 0.414 * ax) return 124; // |
  if (ax < 0.414 * ay) return v >= 0.5 ? 61 : 45; // = -
  return gx * gy > 0 ? 47 : 92; // / \
}

export function edgeChars(buf, W, H, out) {
  for (let j = 0; j < H; j++) {
    const r0 = (j - 1) * W;
    const r1 = j * W;
    const r2 = (j + 1) * W;
    for (let i = 0; i < W; i++) {
      const idx = r1 + i;
      const v = buf[idx];
      if (v < 0.045) {
        out[idx] = 0;
        continue;
      }
      if (v >= 0.84) {
        out[idx] = C_FILL;
        continue;
      }
      const l = i > 0;
      const r = i < W - 1;
      const u = j > 0;
      const d = j < H - 1;
      const tl = u && l ? buf[r0 + i - 1] : 0;
      const tc = u ? buf[r0 + i] : 0;
      const tr = u && r ? buf[r0 + i + 1] : 0;
      const ml = l ? buf[r1 + i - 1] : 0;
      const mr = r ? buf[r1 + i + 1] : 0;
      const bl = d && l ? buf[r2 + i - 1] : 0;
      const bc = d ? buf[r2 + i] : 0;
      const br = d && r ? buf[r2 + i + 1] : 0;
      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * 0.5;
      out[idx] = edgeCode(v, gx, gy);
    }
  }
}
