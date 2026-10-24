// Animaciones de palabra: entrada, permanencia y salida. Todo es función pura del tiempo.
// Tres rutas de dibujo: 2D (sprites por letra), 3D (nube de puntos con grosor) y partículas.
import { clamp, hash, smooth, easeOutCubic, easeInCubic, easeOutBack, easeOutBounce, easeOutExpo } from './util.js';
import { KC, PAL_SELF, PAL_EDGE } from './grid.js';
import { composeWord, resetLP, hiResOf, SS, edgeChars, edgeCode } from './type.js';

const SCR = Array.from('!<>-_\\/[]{}=+*^?#$%&@~|;:').map((c) => c.charCodeAt(0));
const DUST = [46, 58, 39, 96, 44, 42];
const TAU = Math.PI * 2;

const S = {}; // especificación reutilizable (evita basura por cuadro)
function resetSpec(s) {
  s.mode = '2d';
  s.alpha = 1;
  s.flash = 0;
  s.extra = 0;
  s.ox = 0;
  s.oy = 0;
  s.letters = null;
  s.maskFn = null;
  s._scr = 0;
  s.q = 0;
  s.kind = '';
  s.ry = 0;
  s.rx = 0;
  s.zoff = 0;
  s.fill = -1;
  s.punch = 0;
  s.shine = -99;
  return s;
}

// ───────────────────────── máscaras ─────────────────────────
function maskDecode(i, j, s, w) {
  const pc = s.q * 1.9 - i / w.Wb - hash(i, j, w.seed) * 0.4;
  if (pc < 0) return 0;
  if (pc < 0.3) {
    s._scr = 1;
    return 0.9;
  }
  s._scr = 0;
  return 1;
}
function maskScan(i, j, s, w) {
  const pc = s.q * 1.7 - j / w.Hb - hash(i, j, w.seed) * 0.18;
  if (pc < 0) return 0;
  if (pc < 0.22) {
    s._scr = 1;
    return 0.9;
  }
  s._scr = 0;
  return 1;
}
function maskWipe(i, j, s, w) {
  const pc = (1 - s.q) * 1.9 - (1 - i / w.Wb) - hash(i, j, w.seed + 3) * 0.4;
  if (pc < 0) return 0;
  if (pc < 0.3) {
    s._scr = 1;
    return 0.85;
  }
  s._scr = 0;
  return 1;
}

// "glitch": franjas horizontales que se desplazan y se codifican hasta estabilizarse
function maskGlitch(i, j, s, w) {
  const fr = Math.floor(s.t * 15);
  const bad = hash(j >> 1, fr, w.seed) < (1 - s.q) * 0.75;
  if (bad) {
    s._scr = hash(i, j, fr) < 0.7 ? 1 : 0;
    return s._scr ? 0.9 : 1;
  }
  s._scr = 0;
  return 1;
}

// ───────────────────────── letras (2D) ─────────────────────────
function lettersGlitch(w, lp, s) {
  const fr = Math.floor(s.t * 15);
  const n = lp.length;
  for (let k = 0; k < n; k++) {
    const bad = hash(k, fr, w.seed + 5) < (1 - s.q) * 0.9;
    lp[k].ox = bad ? (hash(k, fr, w.seed) - 0.5) * w.Wb * 0.28 * (1 - s.q) : 0;
    lp[k].a = s.q > 0.08 && (!bad || hash(k, fr, 3) > 0.25) ? 1 : 0;
  }
}
function lettersRise(w, lp, s) {
  const n = lp.length;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * 0.45;
    const ql = clamp((s.q - d) / 0.55);
    lp[k].oy = (1 - easeOutBack(ql)) * w.Hb * 0.95;
    lp[k].a = ql > 0 ? 1 : 0;
  }
}
function lettersDrop(w, lp, s) {
  const n = lp.length;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * 0.4;
    const ql = clamp((s.q - d) / 0.6);
    lp[k].oy = -(1 - easeOutBounce(ql)) * w.Hb * 1.15;
    lp[k].a = ql > 0.01 ? 1 : 0;
  }
}
function lettersZoom(w, lp, s) {
  const e = easeOutCubic(s.q);
  const sc = 1 + (1 - e) * 2.8;
  for (const p of lp) {
    p.sx = sc;
    p.sy = sc;
    p.a = clamp(s.q * 2.6);
  }
}
function lettersSlide(w, lp, s) {
  const n = lp.length;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * 0.35;
    const ql = clamp((s.q - d) / 0.65);
    lp[k].ox = (k % 2 ? 1 : -1) * (1 - easeOutCubic(ql)) * w.Wb * 0.75;
    lp[k].a = ql > 0 ? 1 : 0;
  }
}
function lettersPop(w, lp, s) {
  const sc = Math.max(0.02, easeOutBack(clamp(s.q)));
  for (const p of lp) {
    p.sx = sc;
    p.sy = sc;
  }
}
function lettersTypewriter(w, lp, s) {
  const n = lp.length;
  for (let k = 0; k < n; k++) {
    const ql = clamp((s.q - (k / n) * 0.7) / 0.3);
    const sc = Math.max(0.02, easeOutBack(ql));
    lp[k].sx = sc;
    lp[k].sy = sc;
    lp[k].a = ql > 0 ? 1 : 0;
  }
}
function lettersFall(w, lp, s) {
  const n = lp.length;
  for (let k = 0; k < n; k++) {
    const ql = clamp((s.q - (k / n) * 0.4) / 0.6);
    lp[k].oy = easeInCubic(ql) * w.Hb * 1.5;
    lp[k].sh = ql * (k % 2 ? 0.25 : -0.25);
    lp[k].a = 1 - ql * ql;
  }
}
// explosión: las letras salen disparadas desde el centro y se reacomodan con rebote
function lettersExplode(w, lp, s) {
  const n = lp.length;
  const q = clamp(s.q);
  const e = easeOutBack(q);
  const d = Math.max(0, 1 - e);
  for (let k = 0; k < n; k++) {
    const a = hash(k, w.seed, 41) * TAU;
    const rr = 0.55 + hash(k, w.seed, 43) * 0.7;
    lp[k].ox = Math.cos(a) * w.Wb * 0.62 * rr * d;
    lp[k].oy = Math.sin(a) * w.Hb * 1.1 * rr * d;
    lp[k].sh = (hash(k, w.seed, 42) - 0.5) * 0.7 * d;
    const sc = 1 + 1.3 * d * d;
    lp[k].sx = sc;
    lp[k].sy = sc;
    lp[k].a = q > 0.01 ? 1 : 0;
  }
}

function lettersWave(w, lp, s) {
  const n = lp.length;
  for (let k = 0; k < n; k++) lp[k].oy = Math.sin(s.t * 3.2 + k * 0.85 + w.seed) * 0.6 - s.pulse * 0.4;
}
function lettersBreathe(w, lp, s) {
  const sc = 1 + 0.02 * Math.sin(s.t * 2.2 + w.seed) + s.pulse * 0.035;
  for (const p of lp) {
    p.sx = sc;
    p.sy = sc;
  }
}

// ───────────────────────── especificaciones por fase ─────────────────────────
function stretchExtra(w, rel) {
  if (!w.stretch || w.maxExtra <= 0) return 0;
  return w.maxExtra * easeOutCubic(clamp((rel - 0.05) / (w.dur * 0.85 + 0.1)));
}

function appearSpec(R, w, q, rel, t, s) {
  s.q = q;
  s.extra = stretchExtra(w, rel);
  switch (w.appear) {
    case 'decode':
      s.maskFn = maskDecode;
      break;
    case 'scan':
      s.maskFn = maskScan;
      break;
    case 'rise':
      s.letters = lettersRise;
      break;
    case 'drop':
      s.letters = lettersDrop;
      break;
    case 'zoom':
      s.letters = lettersZoom;
      break;
    case 'slide':
      s.letters = lettersSlide;
      break;
    case 'glitch':
      s.letters = lettersGlitch;
      s.maskFn = maskGlitch;
      break;
    case 'pop':
      s.letters = lettersPop;
      break;
    case 'typewriter':
      s.letters = lettersTypewriter;
      break;
    case 'flip3d': {
      const e = easeOutCubic(q);
      const dir = hash(w.seed, 5) > 0.5 ? 1 : -1;
      s.mode = '3d';
      s.ry = (1 - e) * 1.4 * dir;
      s.rx = (1 - e) * 0.3;
      s.zoff = -(1 - e) * 220;
      s.alpha = clamp(q * 3);
      break;
    }
    case 'assemble':
    case 'burst':
    case 'spiral':
      s.mode = 'part';
      s.kind = w.appear;
      break;
    default:
      break;
  }
}

function holdSpec(R, w, rel, t, s) {
  s.extra = stretchExtra(w, rel);
  s.t = t;
  s.pulse = R.pulse;
  s.punch = R.pulse; // todas las palabras "laten" con los graves
  switch (w.hold) {
    case 'bob':
      s.oy = -R.pulse * 0.85;
      break;
    case 'wave':
      s.letters = lettersWave;
      break;
    case 'sway3d':
      s.mode = '3d';
      s.ry = Math.sin(t * 1.5 + w.seed) * 0.42;
      s.rx = Math.sin(t * 1.1 + w.seed * 0.7) * 0.12;
      break;
    case 'breathe':
      s.letters = lettersBreathe;
      break;
    default:
      break;
  }
}

function exitSpec(R, line, w, q, t, s, rel) {
  s.q = q;
  s.extra = stretchExtra(w, rel);
  switch (line.exit) {
    case 'dissolve':
      s.mode = 'part';
      s.kind = 'dissolve';
      break;
    case 'defrag':
      s.mode = 'defrag';
      break;
    case 'sink3d': {
      const dir = hash(w.seed, 9) > 0.5 ? 1 : -1;
      s.mode = '3d';
      s.ry = q * 0.9 * dir;
      s.rx = q * 0.9;
      s.zoff = -q * 700;
      s.alpha = 1 - smooth(0.25, 1, q);
      break;
    }
    case 'wipe':
      s.maskFn = maskWipe;
      break;
    case 'fall':
      s.letters = lettersFall;
      break;
    default:
      break;
  }
}

// ───────────────────────── efectos por palabra ─────────────────────────
export const EXPLODE_T = 0.85;

// antes de dibujar: ajustan la especificación (opacidad, modo, letras)
function wordFx(R, w, s, rel, t, fxs) {
  const inHold = rel >= w.appearDur;
  for (let n = 0; n < fxs.length; n++) {
    const f = fxs[n];
    if (f === 'blink') {
      if (inHold) {
        const ph = (t * 5.5 + w.seed * 0.37) % 1;
        const on = ph < 0.6 || R.pulse > 0.6;
        s.alpha *= on ? 1 : 0.16;
      }
    } else if (f === 'glow') {
      s.punch += 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(t * 4.4 + w.seed));
      if (s.mode === '2d') {
        const span = w.Wb + w.Hb * 1.2 + 10;
        s.shine = (((t * 0.62 + (w.seed & 7) * 0.13) % 1.7) / 1.7) * span - 5;
      }
    } else if (f === 'explode') {
      if (rel < EXPLODE_T) {
        s.mode = '2d';
        s.maskFn = null;
        s.q = clamp(rel / EXPLODE_T);
        s.letters = lettersExplode;
        s.alpha = 1;
      }
    } else if (f === 'defrag') {
      if (inHold && s.mode === '2d') {
        const cyc = (t * 1.25 + (w.seed & 15) * 0.07) % 1;
        const burst = cyc < 0.17 ? Math.sin((cyc / 0.17) * Math.PI) : 0;
        const q = clamp(burst * 0.78 + R.pulse * 0.3, 0, 0.9);
        if (q > 0.05) {
          s.mode = 'defrag';
          s.q = q;
        }
      }
    }
  }
}

const SPARK = [42, 43, 46, 39, 42, 120];
// después de dibujar: chispas y ondas de choque sobre la palabra
function afterFx(R, w, s, rel, t, fxs) {
  const g = R.grid;
  const cx = w.gx + w.Wb / 2;
  const cy = w.gy + w.Hb * 0.5;
  for (let n = 0; n < fxs.length; n++) {
    const f = fxs[n];
    if (f === 'explode' && rel < EXPLODE_T + 0.3) {
      const q = clamp(rel / (EXPLODE_T + 0.3));
      const rad = easeOutExpo(q) * Math.max(w.Wb * 0.68, 16);
      const a = Math.pow(1 - q, 1.4);
      const m = Math.round(26 + rad * 3.2);
      for (let k = 0; k < m; k++) {
        const ang = (k / m) * TAU + w.seed;
        const x = Math.round(cx + Math.cos(ang) * rad);
        const y = Math.round(cy + Math.sin(ang) * rad * 0.48);
        g.put(x, y, 0.95 * a, q < 0.35 ? KC.WHITE : KC.GOLD, 0, k % 3 ? 111 : 79);
      }
      const sp = 34;
      for (let k = 0; k < sp; k++) {
        const ang = hash(k, w.seed, 51) * TAU;
        const sr = (0.35 + hash(k, w.seed, 52) * 0.9) * rad * 1.15;
        const x = Math.round(cx + Math.cos(ang) * sr);
        const y = Math.round(cy + Math.sin(ang) * sr * 0.5);
        g.put(x, y, 0.85 * a, hash(k, w.seed, 53) > 0.5 ? KC.AMBER : KC.BLUSH, 0, SPARK[k % SPARK.length]);
      }
    } else if (f === 'glow') {
      const cnt = clamp(Math.round((w.Wb * w.Hb) / 90), 6, 46);
      const fr = Math.floor(t * 9);
      for (let k = 0; k < cnt; k++) {
        const f2 = fr + ((k * 5) % 3);
        const x = w.gx - 2 + Math.floor(hash(k, f2, w.seed) * (w.Wb + 4));
        const y = w.gy - 1 + Math.floor(hash(k, f2, w.seed + 9) * (w.Hb + 2));
        const tw = 0.5 + 0.5 * Math.sin(t * 11 + k * 1.9);
        g.put(x, y, 0.5 + 0.5 * tw, k % 4 ? KC.WHITE : KC.GOLD, 0, SPARK[(k + fr) % SPARK.length]);
      }
    }
  }
}

// ───────────────────────── entrada principal ─────────────────────────
export function renderWord(R, line, w, t) {
  if (R.reduced) {
    if (t < w.onset || t >= line.hideAt) return;
    const still = resetSpec(S);
    still.fill = 1;
    draw2D(R, line, w, still);
    return;
  }
  const rel = t - w.onset;
  if (rel < 0) {
    if (!line.pseudo && !line.noGhost) drawGhost(R, line, w, t);
    return;
  }
  const eq = (t - (line.exitStart + w.exitDelay)) / w.exitDur;
  if (eq >= 1) return;
  const s = resetSpec(S);
  s.t = t;
  s.pulse = R.pulse;
  if (eq > 0) exitSpec(R, line, w, eq, t, s, rel);
  else if (rel < w.appearDur) appearSpec(R, w, rel / w.appearDur, rel, t, s);
  else holdSpec(R, w, rel, t, s);
  const fxs = w.fxs && w.fxs.length && eq <= 0 ? w.fxs : null;
  if (fxs) wordFx(R, w, s, rel, t, fxs);
  // barrido de relleno (como karaoke) en palabras sostenidas
  if (w.fill && eq <= 0 && s.mode === '2d') s.fill = clamp(rel / Math.max(0.35, w.dur * 0.92));

  // aterrizaje de la bolita: destello y "presión"
  if (rel < 0.45 && eq <= 0) {
    s.flash = clamp(1 - rel / 0.22);
    if (s.mode === '2d') s.oy += 0.75 * Math.exp(-rel * 11) * Math.cos(rel * 24);
  }

  switch (s.mode) {
    case '3d':
      draw3D(R, line, w, s);
      break;
    case 'part':
      drawPart(R, line, w, s, t);
      break;
    case 'defrag':
      drawDefrag(R, line, w, s);
      break;
    default:
      draw2D(R, line, w, s);
  }
  if (fxs) afterFx(R, w, s, rel, t, fxs);
}

function colorOf(w, s, v) {
  if (s.flash > 0.25) return KC.WHITE;
  return v > 0.55 ? w.col.core : w.col.edge;
}

// 0..1: cuánto de la letra ya está "cantada" en x (borde suave)
function fillAt(s, f) {
  return smooth(s.fill + 0.05, s.fill - 0.05, f);
}

// ───────────────────────── 2D ─────────────────────────
function draw2D(R, line, w, s) {
  const lp = w.lp;
  resetLP(w);
  if (s.letters) s.letters(w, lp, s);
  if (s.punch > 0.02) {
    const k = 1 + s.punch * 0.07;
    for (const p of lp) {
      p.sx *= k;
      p.sy *= k;
    }
  }
  if (s.oy || s.ox) {
    for (const p of lp) {
      p.oy += s.oy;
      p.ox += s.ox;
    }
  }
  composeWord(w, lp, s.extra, w.buf);
  const { buf, Wb, Hb, gx, gy } = w;
  const g = R.grid;
  const pal = w.pal;
  const selfN = w.self ? w.self.length : 0;
  const ech = w.ech;
  if (pal === PAL_EDGE) edgeChars(buf, Wb, Hb, ech);
  for (let j = 0; j < Hb; j++) {
    for (let i = 0; i < Wb; i++) {
      let v = buf[j * Wb + i];
      if (v < 0.045) continue;
      let m = 1;
      s._scr = 0;
      if (s.maskFn) {
        m = s.maskFn(i, j, s, w);
        if (m <= 0) continue;
      }
      let ov = 0;
      if (s._scr) {
        ov = SCR[(hash(i, j, (R.t * 18) | 0) * SCR.length) | 0];
        v = 0.9;
      } else {
        v = v * m * s.alpha * (1 + s.flash * 0.25 + s.punch * 0.12);
        if (s.fill >= 0) v *= 0.42 + 0.58 * fillAt(s, i / Wb);
        if (pal === PAL_EDGE) {
          ov = ech[j * Wb + i];
          if (ov !== 64 && ov !== 35) v = 0.58 + 0.42 * v;
        } else if (pal === PAL_SELF && selfN) {
          if (v < 0.22) ov = 58;
          else {
            const c = w.self[(i * 3 + j * 5) % selfN];
            ov = v > 0.6 ? c : c + 32;
          }
        }
      }
      let kc = s._scr ? KC.WHITE : colorOf(w, s, v);
      if (s.fill >= 0 && !s._scr && fillAt(s, i / Wb) < 0.5) kc = w.col.edge;
      if (s.shine > -90 && !s._scr) {
        const dd = Math.abs(i + j * 1.2 - s.shine);
        if (dd < 3.2) {
          v *= 1 + (3.2 - dd) * 0.12;
          if (dd < 1.6) kc = KC.WHITE;
        }
      }
      g.put(gx + i, gy + j, v > 1.15 ? 1.15 : v, kc, pal >= PAL_SELF ? 0 : pal, ov);
    }
  }
}

function drawGhost(R, line, w, t) {
  // guía: línea punteada donde va a aparecer la palabra
  const a = smooth(line.t - 0.4, line.t + 0.1, t) * (1 - smooth(line.exitStart, line.hideAt, t));
  if (a <= 0.01) return;
  const g = R.grid;
  const y = w.gy + Math.round(1 + w.F * 0.86) + 1;
  const x0 = Math.round(w.gx + w.Wb / 2 - w.W / 2);
  const x1 = Math.round(w.gx + w.Wb / 2 + w.W / 2);
  for (let x = x0; x <= x1; x += 3) g.put(x, y, 0.1 * a, KC.LAV, 0, 46);
}

// ───────────────────────── 3D ─────────────────────────
export function get3D(R, w) {
  if (w.p3) return w.p3;
  const hi = hiResOf(w);
  const hw = w.Wb * SS;
  const hh = w.Hb * SS;
  const cw = R.cellW;
  const ch = R.cellH;
  const fx = [];
  const fy = [];
  const fc = [];
  const wl = []; // x,y,z,nx,ny,c
  const thick = w.F * ch * 0.2;
  const K = 5;
  for (let v = 1; v < hh - 1; v++) {
    for (let u = 1; u < hw - 1; u++) {
      const c = hi[v * hw + u];
      if (c < 0.5) continue;
      const x = ((u + 0.5) / SS - w.Wb / 2) * cw;
      const y = ((v + 0.5) / SS - w.Hb * 0.5) * ch;
      fx.push(x);
      fy.push(y);
      fc.push(c > 1 ? 1 : c);
      const l = hi[v * hw + u - 1];
      const r = hi[v * hw + u + 1];
      const up = hi[(v - 1) * hw + u];
      const dn = hi[(v + 1) * hw + u];
      if (l < 0.35 || r < 0.35 || up < 0.35 || dn < 0.35) {
        let nx = l - r;
        let ny = up - dn;
        const m = Math.hypot(nx, ny) || 1;
        nx /= m;
        ny /= m;
        for (let k = 1; k < K; k++) wl.push(x, y, (-thick * k) / (K - 1), nx, ny, c > 1 ? 1 : c);
      }
    }
  }
  w.p3 = {
    fx: Float32Array.from(fx),
    fy: Float32Array.from(fy),
    fc: Float32Array.from(fc),
    nf: fx.length,
    wl: Float32Array.from(wl),
    nw: wl.length / 6,
    D: Math.max(w.Wb * cw * 1.7, 520),
  };
  return w.p3;
}

const LX = -0.4;
const LY = -0.55;
const LZ = 0.75;
const LN = Math.hypot(LX, LY, LZ);

function draw3D(R, line, w, s) {
  const P = get3D(R, w);
  const g = R.grid;
  const cw = R.cellW;
  const ch = R.cellH;
  const cxw = w.gx + w.Wb / 2;
  const cyw = w.gy + w.Hb * 0.5 + s.oy;
  const cyA = Math.cos(s.ry);
  const syA = Math.sin(s.ry);
  const cxA = Math.cos(s.rx);
  const sxA = Math.sin(s.rx);
  const D = P.D;
  const zoff = s.zoff + s.punch * 55;
  const stamp = ++R.zStamp;
  const zb = R.zb;
  const zs = R.zs;
  const ib = R.ib;
  const kb = R.kb;
  const touched = R.touched;
  let nt = 0;
  const cols = g.cols;
  const rows = g.rows;
  // normal de la cara frontal
  const nfx = cxA * syA;
  const nfy = -sxA;
  const nfz = cxA * cyA;
  const lumF = Math.max(0, (nfx * LX + nfy * LY + nfz * LZ) / LN);
  const alpha = s.alpha * (1 + s.flash * 0.2);
  const baseK = s.flash > 0.25 ? KC.WHITE : w.col.core;
  const edgeK = s.flash > 0.25 ? KC.WHITE : w.col.edge;
  // cara frontal
  for (let k = 0; k < P.nf; k++) {
    const x = P.fx[k];
    const y = P.fy[k];
    const y1 = y * cxA;
    const z1 = y * sxA;
    const x2 = x * cyA + z1 * syA;
    const z2 = -x * syA + z1 * cyA;
    const den = D - z2 - zoff;
    if (den < 60) continue;
    const sc = D / den;
    const cx = Math.floor(cxw + (x2 * sc) / cw);
    const cy = Math.floor(cyw + (y1 * sc) / ch);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
    const idx = cy * cols + cx;
    if (zs[idx] !== stamp) {
      zs[idx] = stamp;
      zb[idx] = -1e9;
      touched[nt++] = idx;
      ib[idx] = 0;
    }
    if (z2 > zb[idx]) {
      zb[idx] = z2;
      ib[idx] = P.fc[k] * (0.5 + 0.62 * lumF) * alpha;
      kb[idx] = lumF > 0.55 ? baseK : edgeK;
    }
  }
  // paredes (grosor)
  for (let k = 0; k < P.nw; k++) {
    const o = k * 6;
    const x = P.wl[o];
    const y = P.wl[o + 1];
    const z = P.wl[o + 2];
    const nx = P.wl[o + 3];
    const ny = P.wl[o + 4];
    const c = P.wl[o + 5];
    const y1 = y * cxA - z * sxA;
    const z1 = y * sxA + z * cxA;
    const x2 = x * cyA + z1 * syA;
    const z2 = -x * syA + z1 * cyA;
    const den = D - z2 - zoff;
    if (den < 60) continue;
    const sc = D / den;
    const cx = Math.floor(cxw + (x2 * sc) / cw);
    const cy = Math.floor(cyw + (y1 * sc) / ch);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
    // normal de la pared rotada
    const ny1 = ny * cxA;
    const nz1 = ny * sxA;
    const nx2 = nx * cyA + nz1 * syA;
    const nz2 = -nx * syA + nz1 * cyA;
    const lum = Math.max(0, (nx2 * LX + ny1 * LY + nz2 * LZ) / LN);
    const idx = cy * cols + cx;
    if (zs[idx] !== stamp) {
      zs[idx] = stamp;
      zb[idx] = -1e9;
      touched[nt++] = idx;
      ib[idx] = 0;
    }
    if (z2 > zb[idx]) {
      zb[idx] = z2;
      ib[idx] = c * (0.3 + 0.55 * lum) * alpha;
      kb[idx] = lum > 0.5 ? KC.PEACH : lum > 0.2 ? KC.ROSE : KC.DEEP;
    }
  }
  const pal = w.pal >= PAL_SELF ? 0 : w.pal;
  const edge = w.pal === PAL_EDGE;
  const gv = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? 0 : zs[y * cols + x] === stamp ? Math.min(1, ib[y * cols + x]) : 0);
  for (let m = 0; m < nt; m++) {
    const idx = touched[m];
    let v = ib[idx];
    if (v < 0.05) continue;
    const y = (idx / cols) | 0;
    const x = idx - y * cols;
    let ov = 0;
    if (edge) {
      const gx = gv(x + 1, y - 1) + 2 * gv(x + 1, y) + gv(x + 1, y + 1) - (gv(x - 1, y - 1) + 2 * gv(x - 1, y) + gv(x - 1, y + 1));
      const gyy = (gv(x - 1, y + 1) + 2 * gv(x, y + 1) + gv(x + 1, y + 1) - (gv(x - 1, y - 1) + 2 * gv(x, y - 1) + gv(x + 1, y - 1))) * 0.5;
      ov = edgeCode(Math.min(1, v), gx, gyy);
      if (ov !== 64 && ov !== 35) v = 0.58 + 0.42 * v;
    }
    g.put(x, y, v > 1.1 ? 1.1 : v, kb[idx], pal, ov);
  }
}

// ───────────────────────── partículas ─────────────────────────
function drawPart(R, line, w, s, t) {
  const H = w.homes;
  const n = H.n;
  const g = R.grid;
  const q = s.q;
  const kind = s.kind;
  const seed = w.seed;
  const frame = (t * 14) | 0;
  const rows = R.rows;
  const dirT = ((seed >> 1) & 3) % 3;
  const cxc = w.Wb / 2;
  const cyc = w.Hb * 0.5;
  for (let k = 0; k < n; k++) {
    const hx = H.x[k];
    const hy = H.y[k];
    const c = H.c[k];
    const r1 = hash(seed, k, 1);
    const r2 = hash(seed, k, 2);
    const r3 = hash(seed, k, 3);
    let x;
    let y;
    let v;
    let moving = true;
    if (kind === 'dissolve') {
      const d = r3 * 0.42;
      const tau = clamp((q - d) / (1 - d));
      if (tau <= 0) {
        x = hx;
        y = hy;
        v = c;
        moving = false;
      } else {
        x = hx + (r1 - 0.5) * 16 * tau + Math.sin(tau * 7 + r2 * 6) * 1.6 * tau;
        y = hy - tau * (5 + r2 * 13);
        v = c * Math.pow(1 - tau, 1.15);
      }
    } else {
      const d = r3 * 0.5;
      const qq = clamp((q - d) / (1 - d));
      let ox;
      let oy;
      let e;
      if (kind === 'burst') {
        ox = cxc + (r1 - 0.5) * 2;
        oy = cyc - 2 + (r2 - 0.5) * 2;
        e = easeOutBack(qq);
        x = ox + (hx - ox) * e;
        y = oy + (hy - oy) * e;
      } else if (kind === 'spiral') {
        e = easeOutCubic(qq);
        const ang = r1 * TAU + (1 - e) * (4 + r3 * 2.5);
        const R0 = (14 + r2 * 16) * (1 - e);
        x = hx + Math.cos(ang) * R0;
        y = hy + Math.sin(ang) * R0 * 0.45;
      } else {
        e = easeOutCubic(qq);
        if (dirT === 0) {
          ox = hx + (r1 - 0.5) * 30;
          oy = hy - 12 - r2 * Math.min(rows * 0.4, 22);
        } else if (dirT === 1) {
          ox = hx + (r1 - 0.5) * 30;
          oy = hy + 10 + r2 * 18;
        } else {
          ox = hx + (r1 > 0.5 ? 1 : -1) * (20 + r2 * 30);
          oy = hy + (r3 - 0.5) * 10;
        }
        x = ox + (hx - ox) * e + Math.sin(r1 * 9 + q * 9) * (1 - e) * 1.6;
        y = oy + (hy - oy) * e;
      }
      v = c * (0.3 + 0.7 * qq);
      if (qq <= 0.001) continue;
      moving = qq < 0.94;
    }
    if (v < 0.05) continue;
    let ov = 0;
    if (moving) ov = DUST[(hash(k, frame, seed) * DUST.length) | 0];
    else if (w.pal === PAL_EDGE) ov = H.ch[k];
    const gxi = Math.floor(w.gx + x + 0.5);
    const gyi = Math.floor(w.gy + y + 0.5);
    const kc = s.flash > 0.25 ? KC.WHITE : moving ? (r2 > 0.5 ? KC.BLUSH : w.col.edge) : v > 0.55 ? w.col.core : w.col.edge;
    g.put(gxi, gyi, v > 1 ? 1 : v, kc, w.pal >= PAL_SELF ? 0 : w.pal, ov);
  }
}

// ───────────────────────── desfragmentar ─────────────────────────
function drawDefrag(R, line, w, s) {
  const lp = w.lp;
  resetLP(w);
  composeWord(w, lp, s.extra, w.buf);
  const { buf, Wb, Hb, gx, gy, seed } = w;
  const g = R.grid;
  const q = s.q;
  const edge = w.pal === PAL_EDGE;
  if (edge) edgeChars(buf, Wb, Hb, w.ech);
  for (let j = 0; j < Hb; j++) {
    for (let i = 0; i < Wb; i++) {
      const v0 = buf[j * Wb + i];
      if (v0 < 0.045) continue;
      const bx = i >> 2;
      const by = j >> 1;
      const b1 = hash(seed + 11, bx, by);
      const b2 = hash(seed + 12, bx, by);
      const b3 = hash(seed + 13, bx, by);
      const d = b3 * 0.5;
      const tau = clamp((q - d) / (1 - d));
      if (tau > 0 && hash(i, j, seed) < tau * 1.12) continue;
      const e = easeInCubic(tau);
      const dx = Math.round((b1 - 0.5) * 2 * 18 * e);
      const dy = Math.round((b2 - 0.5) * 2 * 5 * e - e * 3);
      const v = v0 * (1 - tau * 0.8);
      let ov = edge ? w.ech[j * Wb + i] : 0;
      if (tau > 0.1 && hash(i, j, seed + 5) < 0.3) ov = SCR[(hash(i, j, seed + 6) * SCR.length) | 0];
      g.put(gx + i + dx, gy + j + dy, edge ? 0.6 + 0.4 * v : v, tau > 0.2 ? KC.BLUSH : w.col.core, w.pal >= PAL_SELF ? 0 : w.pal, ov);
    }
  }
}
