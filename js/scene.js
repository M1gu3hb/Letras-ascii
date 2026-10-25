// Escena: distribución de la letra, bolita karaoke, polvo, corazón y composición de cada cuadro.
import { clamp, lerp, smooth } from './util.js';
import { Renderer, KC, PAL_SELF, PAL_EDGE } from './grid.js';
import { Typo, edgeChars } from './type.js';
import { buildTimeline, pseudoLine, TONE_COLORS, COLORS } from './timeline.js';
import { renderWord, get3D } from './fx.js';
import { drawHeart, warmHeart } from './heart.js';
import { drawMood, tintOf, drawFloor } from './bg.js';
import { TextLayer } from './text-layer.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Filas que se reservan abajo para la frase completa (chiquita). Con 38 filas o más son 15, exactamente como siempre;
// en escenarios bajitos (el horizontal de un teléfono mide ~22 filas) se achica para que la palabra principal no quede diminuta.
const ctxBand = (rows) => Math.min(15, Math.max(7, Math.round(rows * 0.4)));

export class Scene {
  constructor(canvas) {
    this.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.r = new Renderer(canvas);
    this.typo = new Typo();
    this.textLayer = new TextLayer(this);
    this.tl = null;
    this.intro = null;
    this.outro = null;
    this.energy = null;
    this.tOff = 0; // segundo de la canción donde empieza el tramo (para leer la energía)
    this.react = 1;
    this.ballOn = true;
    this.floorOn = true;
    this.glow = 1; // halo alrededor de las letras
    this.thickG = 0; // grosor general de las letras (-1…+1)
    this.trackG = 0; // espacio extra entre letras (em)
    this.sizeG = 1; // tamaño general de las palabras
    this.overlays = true;
    this.paused = false;
    this.ripples = [];
    this.trail = [];
    this.R = { grid: this.r.grid, pulse: 0, t: 0, zStamp: 0 };
    this.syncMetrics();
    warmHeart();
  }

  syncMetrics() {
    const r = this.r;
    const R = this.R;
    R.grid = r.grid;
    R.cellW = r.cellW;
    R.cellH = r.cellH;
    R.rows = r.rows;
    const n = r.grid.cols * r.grid.rows;
    R.zb = new Float32Array(n);
    R.zs = new Int32Array(n);
    R.ib = new Float32Array(n);
    R.kb = new Uint8Array(n);
    R.touched = new Int32Array(n);
    R.zStamp = 0;
    this.typo.setMetrics(r.cellW, r.cellH);
  }

  setEnergy(e, offset = 0) {
    if (!e) {
      this.energy = null;
      return;
    }
    const n = e.hit.length;
    const decay = Math.pow(0.87, 30 / e.fps);
    const p = new Float32Array(n);
    let prev = 0;
    for (let k = 0; k < n; k++) {
      prev = Math.max((e.hit[k] / 100) * 0.95, prev * decay);
      p[k] = prev;
    }
    this.energy = { fps: e.fps, pulse: p, mid: e.mid, hi: e.hi, low: e.low, hit: e.hit, n };
    this.tOff = offset;
    this.E = { low: 0, mid: 0, hi: 0, pulse: 0, rings: [] };
  }

  // ajustes que se pueden mover en vivo sin rehacer la línea de tiempo
  setLive(st) {
    this.react = st.react ?? 1;
    this.ballOn = st.ball !== false;
    this.floorOn = st.floor !== false;
    this.glow = clamp(st.glow ?? 1, 0, 2.5);
    this.r.setLook(st);
  }

  // energía de la canción en el instante t del tramo (0..1 por banda) y golpes recientes
  bandsAt(t) {
    const e = this.energy;
    const E = this.E || (this.E = { low: 0, mid: 0, hi: 0, pulse: 0, rings: [] });
    E.rings.length = 0;
    if (!e) {
      E.low = E.mid = E.hi = E.pulse = 0;
      return E;
    }
    const rc = this.react;
    const i = clamp(Math.round((t + this.tOff) * e.fps), 0, e.n - 1);
    E.low = clamp((e.low[i] / 100) * rc, 0, 1.2);
    E.mid = clamp((e.mid[i] / 100) * rc, 0, 1.2);
    E.hi = clamp((e.hi[i] / 100) * rc, 0, 1.2);
    E.pulse = clamp(e.pulse[i] * rc, 0, 1.2);
    if (rc > 0.02) {
      const back = Math.round(1.15 * e.fps);
      for (let j = i; j >= Math.max(0, i - back) && E.rings.length < 6; j--) if (e.hit[j]) E.rings.push([(i - j) / e.fps, Math.min(1.2, e.hit[j] / 100)]);
    }
    return E;
  }

  setData(model) {
    this.tl = buildTimeline(model);
    const st = (model && model.style) || {};
    this.setLive(st);
    // estos cambian la distribución de la letra: se aplican al armar la escena
    this.thickG = clamp(st.thick ?? 0, -1, 1);
    this.trackG = clamp(st.track ?? 0, -0.1, 0.4);
    this.sizeG = clamp(st.size ?? 1, 0.5, 1.4);
    this.r.setDensity(st.detail ?? 1);
    this.layout();
  }

  // ─────────── distribución ───────────
  layout() {
    const r = this.r;
    this.syncMetrics();
    if (!this.tl) return;
    const tl = this.tl;
    const rows = r.rows;
    const karaokeTop = tl.style.karaokeOn === false ? rows - 4 : Math.max(7, (this.textLayer.geometry().top - r.offY) / r.cellH - 1);
    if (tl.focus === 'word') {
      // la palabra que suena ocupa el centro; la frase completa va chiquita abajo
      const heroBottom = Math.min(karaokeTop, rows - Math.max(ctxBand(rows), Math.round(rows * 0.21)));
      const SHIFT = [0, -1.5, 1, 0, -2, 1.5];
      tl.units.forEach((u, n) => {
        const ms = Math.max(...u.words.map((w) => w.size || 1));
        const sc = clamp(0.55 + 0.42 * ms, 0.78, 1.1);
        this.layoutLine(u, { y0: 3, y1: heroBottom, Fmax: Math.min(rows * 0.5, 30) * sc * this.sizeG, yShift: SHIFT[n % SHIFT.length] });
        for (const w of u.words) if (w.appear === 'flip3d' || w.hold === 'sway3d' || u.exit === 'sink3d') get3D(this.R, w);
      });
      for (const line of tl.lines) line.ctx = this.buildCtx(line);
    } else {
      for (const line of tl.lines) {
        this.layoutLine(line, { y0: 3, y1: karaokeTop, Fmax: Math.min(rows * 0.36, 17) * this.sizeG });
        for (const w of line.words) if (w.appear === 'flip3d' || w.hold === 'sway3d' || line.exit === 'sink3d') get3D(this.R, w);
      }
    }
    this.intro = pseudoLine(this.tl.intro ?? 'para ti', 0.35, { appear: 'decode', hold: 'breathe', tone: 'dual', seed: 11, stagger: 0.28, appearDur: 0.9 });
    this.layoutLine(this.intro, { y0: Math.floor(r.rows * 0.64), y1: Math.floor(r.rows * 0.86), Fmax: 12 });
    this.outro = null;
    if (this.tl.outro && this.tl.outro.trim()) {
      this.outro = pseudoLine(this.tl.outro, this.tl.lastHide + 0.4, { appear: 'rise', hold: 'breathe', tone: 'dual', seed: 23, stagger: 0.3, appearDur: 0.9 });
      this.layoutLine(this.outro, { y0: Math.floor(r.rows * 0.64), y1: Math.floor(r.rows * 0.88), Fmax: 12 });
    }
    this.buildBall();
    this.textLayer.layout();
  }

  // frase completa en chiquito (debajo de la palabra principal); ahí brinca la bolita
  buildCtx(line) {
    const rows = this.r.rows;
    const words = line.words.map((w) => ({ text: w.text, onset: w.onset, dur: w.dur, k: w.k, face: 'round', size: 1, stretch: false, colKey: 'cream' }));
    const c = { t: line.t, hideAt: line.hideAt, words, tone: 'cream', pal: PAL_EDGE, pseudo: true, plain: true };
    this.layoutLine(c, { y0: rows - ctxBand(rows), y1: rows - 4, Fmax: 4.4 });
    // una frase larga en una rejilla chica se saldría por abajo: se aprovecha también el margen de abajo y una letra un poco menor
    if (Math.max(...words.map((w) => w.gy + w.Hb)) > rows) this.layoutLine(c, { y0: rows - ctxBand(rows) - 2, y1: rows - 1, Fmax: 4.4, Fmin: 3 });
    for (const w of words) {
      w.ech0 = new Uint8Array(w.Wb * w.Hb);
      edgeChars(w.cov0, w.Wb, w.Hb, w.ech0);
    }
    return c;
  }

  drawCtx(line, t) {
    if (this.textLayer) return; // ambos modos inferiores usan el layout segmentado compartido
    const c = line.ctx;
    if (!c) return;
    const a = smooth(line.t - 0.55, line.t - 0.15, t) * (1 - smooth(line.hideAt - 0.4, line.hideAt, t));
    if (a <= 0.02) return;
    const g = this.R.grid;
    for (const w of c.words) {
      const rel = t - w.onset;
      const len = Math.max(w.dur, 0.25);
      let alpha;
      let frac = -1;
      if (rel < 0) alpha = 0.3;
      else if (rel < len) {
        alpha = 1;
        frac = clamp(rel / len);
      } else alpha = 0.58;
      const { Wb, Hb, gx, gy, cov0, ech0 } = w;
      for (let j = 0; j < Hb; j++) {
        for (let i = 0; i < Wb; i++) {
          const v0 = cov0[j * Wb + i];
          if (v0 < 0.045) continue;
          const ov = ech0[j * Wb + i];
          const v = (ov !== 64 && ov !== 35 ? 0.58 + 0.42 * v0 : v0) * alpha * a;
          const kc = rel < 0 ? KC.LAV : frac >= 0 ? (i / Wb <= frac ? KC.WHITE : KC.ROSE) : KC.BLUSH;
          g.put(gx + i, gy + j, v > 1.1 ? 1.1 : v, kc, 0, ov);
        }
      }
    }
  }

  layoutLine(line, opts = {}) {
    const r = this.r;
    const typo = this.typo;
    const cols = r.grid.cols;
    const rows = r.rows;
    const words = line.words;
    const y0 = opts.y0 ?? opts.top ?? 7;
    const y1 = opts.y1 ?? rows - (opts.bottom ?? 4);
    const availW = cols - 4;
    const availH = y1 - y0;
    const faces = words.map((w) => w.face || 'round');
    const sizes = words.map((w) => w.size || 1);
    const smax = Math.max(...sizes);
    const txtOf = (w) => (w.caps ? w.text.toUpperCase() : w.text);
    // grosor y espacio entre letras (las frases chiquitas de apoyo no los llevan)
    const thick = words.map((w) => (line.plain ? 0 : w.thick ?? this.thickG));
    const track = line.plain ? 0 : this.trackG;
    const uw = words.map((w, k) => typo.unitWidth(txtOf(w), faces[k], track, thick[k]));
    const Fmax = (opts.Fmax ?? Math.min(rows * 0.36, 17)) / smax;
    const Fmin = opts.Fmin ?? 3.5;

    const wrap = (widths, space, maxW) => {
      const rowsArr = [[]];
      let cur = 0;
      widths.forEach((wd, k) => {
        const row = rowsArr[rowsArr.length - 1];
        if (row.length && cur + space + wd > maxW) {
          rowsArr.push([k]);
          cur = wd;
        } else {
          row.push(k);
          cur += (row.length > 1 ? space : 0) + wd;
        }
      });
      return rowsArr;
    };
    const measure = (f) => {
      const em = typo.emCells(f);
      const widths = words.map((w, k) => uw[k] * typo.emCells(f * sizes[k]) + (w.stretch ? w.stretchEm * typo.emCells(f * sizes[k]) : 0));
      const bounds = words.map((w, k) => typo.wordBounds(txtOf(w), f * sizes[k], w.stretchEm * typo.emCells(f * sizes[k]), w.stretch, faces[k], thick[k], track));
      const space = 0.27 * em;
      const rowsArr = wrap(widths, space, availW);
      const rowH = rowsArr.map((row) => 1.12 * f * Math.max(...row.map((k) => sizes[k])));
      const last = rowsArr[rowsArr.length - 1];
      const blockH = rowH.slice(0, -1).reduce((a, b) => a + b, 0) + 1.14 * f * Math.max(...last.map((k) => sizes[k]));
      return { em, widths, space, rowsArr, rowH, blockH, bounds };
    };

    let F = Fmin;
    let plan = null;
    for (let f = Fmax; f >= Fmin; f -= 0.5) {
      const p = measure(f);
      if (Math.max(...p.widths) <= availW && p.blockH <= availH && p.bounds.every((b) => b.width <= cols && b.height <= rows)) {
        F = f;
        plan = p;
        break;
      }
    }
    if (!plan) {
      // palabra larguísima: se achica por debajo del mínimo hasta que quepa a lo ancho
      F = Fmin;
      plan = measure(F);
      while ((Math.max(...plan.widths) > availW || plan.bounds.some((b) => b.width > cols || b.height > rows)) && F > 1.2) {
        F -= 0.25;
        plan = measure(F);
      }
    }
    // equilibrar filas: el ancho mínimo que mantiene el mismo número de filas
    {
      const n = plan.rowsArr.length;
      if (n > 1) {
        const widest = Math.max(...plan.widths);
        for (let mw = Math.max(widest, 10); mw <= availW; mw += 1) {
          const t = wrap(plan.widths, plan.space, mw);
          if (t.length <= n) {
            plan.rowsArr = t;
            plan.rowH = t.map((row) => 1.12 * F * Math.max(...row.map((k) => sizes[k])));
            const last = t[t.length - 1];
            plan.blockH = plan.rowH.slice(0, -1).reduce((a, b) => a + b, 0) + 1.14 * F * Math.max(...last.map((k) => sizes[k]));
            break;
          }
        }
      }
    }
    const { widths, space, rowsArr, rowH, blockH } = plan;
    const yTop = y0 + (availH - blockH) / 2 + (opts.yShift || 0);
    const n = words.length;
    let yRow = yTop;
    rowsArr.forEach((row, ri) => {
      const rowW = row.reduce((a, k) => a + widths[k], 0) + space * (row.length - 1);
      let x = (cols - rowW) / 2;
      const base = Math.max(...row.map((k) => 1 + 0.86 * F * sizes[k]));
      row.forEach((k) => {
        const w = words[k];
        const wd = widths[k];
        const Fk = F * sizes[k];
        const emk = typo.emCells(Fk);
        const maxExtra = w.stretch ? w.stretchEm * emk : 0;
        const built = typo.buildWord(txtOf(w), Fk, maxExtra, w.stretch, faces[k], thick[k], track);
        Object.assign(w, built);
        w.gx = clamp(Math.round(x + wd / 2 - w.Wb / 2), 0, Math.max(0, cols - w.Wb));
        w.gy = clamp(Math.round(yRow + (base - (1 + 0.86 * Fk)) - 1), 0, Math.max(0, rows - w.Hb));
        // color
        if (w.colKey && COLORS[w.colKey]) w.col = COLORS[w.colKey];
        else {
          const tone = line.tone;
          if (tone === 'dual') {
            const f = n > 1 ? k / (n - 1) : 0;
            w.col = f < 0.34 ? TONE_COLORS.cream : f < 0.67 ? { core: KC.BLUSH, edge: KC.ROSE } : TONE_COLORS.rose;
          } else w.col = TONE_COLORS[tone] || TONE_COLORS.cream;
        }
        // relleno
        const selfCodes = [...norm(w.text).replace(/[^A-Za-z]/g, '').toUpperCase()].map((c) => c.charCodeAt(0));
        w.self = selfCodes.length ? Uint8Array.from(selfCodes) : null;
        const pal = w.palOverride ?? line.pal;
        w.pal = pal === PAL_SELF ? (w.self ? PAL_SELF : PAL_EDGE) : pal;
        x += wd + space;
      });
      yRow += rowH[ri];
    });
    line.F = F;
  }

  // ─────────── bolita ───────────
  buildBall() {
    const wps = [];
    for (const l of this.tl.lines) {
      const line = this.tl.focus === 'word' && l.ctx ? l.ctx : l;
      for (const w of line.words) wps.push({ t: w.onset, x: w.gx + w.Wb / 2, y: w.gy + w.topRow - 1.9, line, w });
    }
    this.wps = wps;
    this.wpCursor = 0;
  }

  ballState(t) {
    const wps = this.wps;
    if (!wps || !wps.length) return null;
    const first = wps[0];
    if (t < first.t - 0.9) return null;
    if (t < first.t) {
      const u = (t - (first.t - 0.9)) / 0.9;
      return { x: lerp(first.x - 8, first.x, u), y: lerp(-3, first.y, u) - 4 * 5 * u * (1 - u), alpha: smooth(0, 0.5, u), vy: 1, land: 0, wp: -1, rad: first.line.F || 6 };
    }
    // índice del waypoint actual
    let k = this.wpCursor;
    if (k >= wps.length || wps[k].t > t) k = 0;
    while (k + 1 < wps.length && wps[k + 1].t <= t) k++;
    this.wpCursor = k;
    const a = wps[k];
    const b = wps[k + 1];
    const sinceLand = t - a.t;
    let x = a.x;
    let y = a.y;
    let alpha = 1;
    let vy = 0;
    if (!b) {
      alpha = 1 - smooth(a.line.hideAt, a.line.hideAt + 0.5, t);
      y += this.restBob(t);
    } else {
      const gap = b.t - a.t;
      const sameLine = a.line === b.line;
      const longGap = !sameLine && gap > 5.4;
      const launchDur = sameLine ? gap : Math.min(gap, 0.9);
      const launch = b.t - launchDur;
      if (t < launch) {
        // descansa sobre la última palabra
        y += this.restBob(t);
        if (longGap) alpha = 1 - smooth(a.line.hideAt, a.line.hideAt + 0.5, t);
        else alpha = 1;
        if (sinceLand < 0.12) vy = -1; // aplastamiento al aterrizar
      } else {
        const u = clamp((t - launch) / launchDur);
        const dx = Math.abs(b.x - a.x);
        let h = clamp(1.8 + 0.1 * dx, 2, 8) * clamp(launchDur / 0.4, 0.4, 1);
        let sx0 = a.x;
        let sy0 = a.y;
        if (longGap) {
          sx0 = b.x - 8;
          sy0 = -3;
          h = 5;
          alpha = smooth(0, 0.45, u);
        }
        x = lerp(sx0, b.x, u);
        y = lerp(sy0, b.y, u) - 4 * h * u * (1 - u);
        vy = u > 0.86 ? 1 : 0.2;
        if (!longGap && sameLine && sinceLand < 0.1) vy = -1;
      }
    }
    const Fa = a.line.F || 6;
    const Fb = b ? b.line.F || 6 : Fa;
    const rad = Fa + (Fb - Fa) * (b ? clamp(1 - (b.t - t) / 0.5) : 0);
    return { x, y, alpha, vy, land: sinceLand, wp: k, rad };
  }

  restBob(t) {
    const p = this.R.pulse;
    return -Math.abs(Math.sin(t * 5.2)) * 0.35 - p * 0.55;
  }

  drawBall(t) {
    const R = this.R;
    const g = R.grid;
    const b = this.ballState(t);
    if (!b || b.alpha <= 0.02) return;
    // estela
    for (let m = 5; m >= 1; m--) {
      const bt = this.ballStateLite(t - m * 0.032);
      if (!bt) continue;
      const v = (0.5 * (6 - m)) / 6 * b.alpha;
      g.put(Math.floor(bt.x), Math.floor(bt.y), v, KC.BLUSH, 3, 0);
    }
    // ondas al aterrizar
    if (b.wp >= 0) {
      const wp = this.wps[b.wp];
      const tau = b.land / 0.42;
      if (tau >= 0 && tau < 1) {
        const rr = 2.5 + 15 * (1 - Math.pow(1 - tau, 2));
        for (let a = 0; a < 40; a++) {
          const ang = (a / 40) * Math.PI * 2;
          const px = Math.floor(wp.x + Math.cos(ang) * rr);
          const py = Math.floor(wp.y + 2.6 + Math.sin(ang) * rr * 0.34);
          g.put(px, py, 0.72 * (1 - tau), KC.ROSE, 3, a % 2 ? 45 : 46);
        }
      }
    }
    const sx = b.vy < 0 ? 1.3 : b.vy > 0.8 ? 0.86 : 1;
    const sy = b.vy < 0 ? 0.66 : b.vy > 0.8 ? 1.24 : 1;
    const Rpx = R.cellH * clamp((b.rad || 6) * 0.27, 2.2, 4.6);
    const rx = (Rpx * sx) / R.cellW;
    const ry = (Rpx * sy) / R.cellH;
    const x0 = Math.floor(b.x - rx * 1.9);
    const x1 = Math.ceil(b.x + rx * 1.9);
    const y0 = Math.floor(b.y - ry * 1.9);
    const y1 = Math.ceil(b.y + ry * 1.9);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - b.x) / rx;
        const dy = (y + 0.5 - b.y) / ry;
        const r2 = dx * dx + dy * dy;
        if (r2 <= 1) {
          const z = Math.sqrt(1 - r2);
          const lum = Math.max(0, (-0.36 * dx - 0.5 * dy + 0.79 * z) / 1.0);
          const v = (0.4 + 0.75 * lum) * b.alpha;
          g.put(x, y, v, lum > 0.82 ? KC.WHITE : lum > 0.5 ? KC.BLUSH : KC.ROSE, 1, 0);
        } else if (r2 < 3.4) {
          const v = 0.22 * (1 - (r2 - 1) / 2.4) * b.alpha;
          g.put(x, y, v, KC.ROSE, 1, 0);
        }
      }
    }
  }

  ballStateLite(t) {
    const s = this.ballState(t);
    return s && s.alpha > 0.02 ? s : null;
  }

  // ─────────── cuadro ───────────
  pulseAt(t) {
    const e = this.energy;
    if (!e) return 0;
    const f = clamp((t + this.tOff) * e.fps, 0, e.n - 1.001);
    const i = Math.floor(f);
    return lerp(e.pulse[i], e.pulse[i + 1], f - i) * this.react;
  }

  // interacción: un toque lanza una onda de caracteres; arrastrar deja una estela
  poke(clientX, clientY, kind) {
    const r = this.r;
    const rect = r.cv.getBoundingClientRect();
    const cx = (clientX - rect.left) / r.cellW;
    const cy = (clientY - rect.top - r.offY) / r.cellH;
    const now = performance.now() / 1000;
    if (kind === 'tap') {
      this.ripples.push({ cx, cy, t0: now, k: this.ripples.length % 4 });
      if (this.ripples.length > 6) this.ripples.shift();
    } else {
      const last = this.trail[this.trail.length - 1];
      if (last && Math.abs(last.cx - cx) < 1.2 && Math.abs(last.cy - cy) < 0.6) return;
      this.trail.push({ cx, cy, t0: now });
      if (this.trail.length > 28) this.trail.shift();
    }
  }

  drawTouch() {
    if (!this.ripples.length && !this.trail.length) return;
    const g = this.r.grid;
    const now = performance.now() / 1000;
    const cols = [KC.ROSE, KC.CYAN, KC.GOLD, KC.FUCHSIA];
    this.ripples = this.ripples.filter((p) => now - p.t0 < 1.7);
    for (const p of this.ripples) {
      const a = now - p.t0;
      const rad = a * 15;
      const steps = Math.max(12, Math.floor(rad * 4.4));
      const v = 0.42 * (1 - a / 1.7);
      for (let s = 0; s < steps; s++) {
        const th = (s / steps) * Math.PI * 2;
        g.put(Math.round(p.cx + Math.cos(th) * rad), Math.round(p.cy + Math.sin(th) * rad * 0.5), v, cols[p.k], 0, a < 0.3 ? 42 : a < 0.9 ? 111 : 46);
      }
    }
    this.trail = this.trail.filter((p) => now - p.t0 < 0.9);
    for (const p of this.trail) {
      const a = (now - p.t0) / 0.9;
      g.put(Math.round(p.cx), Math.round(p.cy), 0.4 * (1 - a), a < 0.35 ? KC.WHITE : KC.BLUSH, 0, a < 0.5 ? 42 : 46);
    }
  }

  // ambiente de fondo: depende de la frase activa; al cambiar de frase se mezcla con el anterior
  moodMix(t, mode) {
    const tl = this.tl;
    if (mode === 'intro' || !tl || !tl.lines.length) return { a: tl && tl.introMood ? tl.introMood : 'stars', b: null, f: 1 };
    if (mode === 'ended' || t >= tl.lastHide + 0.2) {
      const m = tl.outroMood || 'hearts';
      const f = mode === 'ended' ? 1 : smooth(tl.lastHide, tl.lastHide + 1.2, t);
      const last = tl.lines[tl.lines.length - 1].mood;
      return last === m ? { a: m, b: null, f: 1 } : { a: m, b: last, f };
    }
    const L = tl.lines;
    let i = -1;
    for (let k = 0; k < L.length; k++) {
      if (t >= L[k].t - 0.4) i = k;
      else break;
    }
    if (i < 0) return { a: L[0].mood, b: tl.introMood || 'stars', f: smooth(L[0].t - 1.2, L[0].t - 0.4, t) };
    const cur = L[i].mood;
    const prev = i > 0 ? L[i - 1].mood : tl.introMood || 'stars';
    const f = smooth(L[i].t - 0.4, L[i].t + 0.6, t);
    return cur === prev ? { a: cur, b: null, f: 1 } : { a: cur, b: prev, f };
  }

  drawBackdrop(t, mode) {
    const g = this.r.grid;
    let E;
    if (mode === 'song') E = this.bandsAt(Math.min(t, this.tl ? this.tl.duration : t));
    else {
      const p = this.R.pulse;
      E = this.fakeE || (this.fakeE = { low: 0, mid: 0, hi: 0, pulse: 0, rings: [] });
      E.low = 0.25 + p * 0.5;
      E.mid = 0.2;
      E.hi = 0.15;
      E.pulse = p;
    }
    const m = this.moodMix(t, mode);
    if (m.b) {
      drawMood(m.b, g, t, 1 - m.f, E);
      drawMood(m.a, g, t, m.f, E);
      const ta = tintOf(m.a);
      const tb = tintOf(m.b);
      this.r.setTint(ta[0].map((c, k) => c * m.f + tb[0][k] * (1 - m.f)), ta[1].map((c, k) => c * m.f + tb[1][k] * (1 - m.f)));
    } else {
      drawMood(m.a, g, t, 1, E);
      const ta = tintOf(m.a);
      const cur = this.r.tint;
      if (cur[0] !== ta[0]) this.r.setTint(ta[0], ta[1]);
    }
    if (this.floorOn) drawFloor(g, t, E, 0.9);
  }

  // mode: 'intro' | 'song' | 'ended'
  render(t, mode) {
    const R = this.R;
    const r = this.r;
    const g = r.grid;
    const cols = g.cols;
    const rows = g.rows;
    R.reduced = !!this.motionQuery?.matches;
    g.clear();
    R.t = t;
    let pulse;
    if (mode === 'song' || mode === 'ended') pulse = this.pulseAt(Math.min(t, this.tl ? this.tl.duration : t));
    else pulse = Math.pow(0.5 + 0.5 * Math.sin(t * 6.4), 9) * 0.8;
    if (mode === 'ended') pulse = Math.pow(0.5 + 0.5 * Math.sin(t * 6.4), 9) * 0.8;
    R.pulse = pulse;
    if (R.reduced) { pulse = 0; R.pulse = 0; this.drawBackdrop(0, mode); }
    else this.drawBackdrop(t, mode);

    const heartSize = (s) => Math.min(rows * s, cols * s * 0.9);
    const rot = (tt) => R.reduced ? 0 : tt * 0.55 + Math.sin(tt * 0.8) * 0.28;

    if (mode === 'intro' && this.intro) {
      drawHeart(R, cols / 2, rows * 0.36, heartSize(0.42), rot(t), pulse, 0.9 * smooth(0, 0.8, t));
      for (const w of this.intro.words) renderWord(R, this.intro, w, t);
      if (t > 1.6 && this.hint !== false && this.overlays) {
        const blink = 0.5 + 0.5 * Math.sin(t * 3.2);
        const msg = 'toca para empezar';
        g.text(msg, Math.floor((cols - msg.length) / 2), rows - 5, KC.LAV, 0.3 + 0.55 * blink);
      }
    } else if (this.tl) {
      const tl = this.tl;
      let presence = 0;
      for (const line of tl.lines) {
        const p = smooth(line.t - 0.6, line.t - 0.05, t) * (1 - smooth(line.exitStart, line.hideAt, t));
        if (p > presence) presence = p;
      }
      const outroOn = mode === 'ended' || t >= tl.lastHide - 0.2;
      if (!outroOn) {
        const ga = (1 - presence) * 0.62;
        if (ga > 0.03) drawHeart(R, cols / 2, rows * 0.5, heartSize(0.34), rot(t), pulse, ga);
      } else {
        const a = mode === 'ended' ? 1 : smooth(tl.lastHide - 0.2, tl.lastHide + 0.9, t);
        drawHeart(R, cols / 2, rows * (this.outro ? 0.36 : 0.45), heartSize(this.outro ? 0.42 : 0.52), rot(t), pulse * 1.3, 0.95 * a);
        if (this.outro) for (const w of this.outro.words) renderWord(R, this.outro, w, t);
      }
      if (tl.focus === 'word') {
        for (const line of tl.lines) if (t >= line.t - 0.6 && t <= line.hideAt + 0.1) this.drawCtx(line, t);
        for (const u of tl.units) {
          if (t < u.t - 0.5 || t > u.hideAt + 0.05) continue;
          for (const w of u.words) if (w.renderMode !== 'normal') renderWord(R, u, w, t);
        }
      } else {
        for (const line of tl.lines) {
          if (t < line.t - 0.5 || t > line.hideAt + 0.05) continue;
          for (const w of line.words) if (w.renderMode !== 'normal') renderWord(R, line, w, t);
        }
      }
      if (!this.textLayer && !R.reduced && this.ballOn && (!outroOn || t < tl.lastHide + 0.3)) this.drawBall(t);
      if (mode === 'ended' && this.overlays) {
        const msg = 'toca para volver a verlo';
        const blink = 0.5 + 0.5 * Math.sin(t * 3.2);
        g.text(msg, Math.floor((cols - msg.length) / 2), rows - 5, KC.LAV, 0.3 + 0.5 * blink);
      }
    }
    if (this.paused && this.overlays) {
      const msg = '- pausa -  toca para seguir';
      g.text(msg, Math.floor((cols - msg.length) / 2), rows - 5, KC.PEACH, 0.85);
    }
    if (!R.reduced) this.drawTouch();
    if (this.glow > 0.02) g.bloom(0.05 * this.glow);
    r.flush({ pulse });
    this.textLayer.draw(t, mode);
  }

  resize() {
    // escenario oculto (el estudio lo esconde en «Marcar» del teléfono): no hay tamaño que medir. Se queda anotado y
    // se hace cuando vuelva a verse (el estudio avisa solo, al cambiar su tamaño).
    const host = this.r.cv.parentElement;
    if (this.deferHidden && host && host.clientWidth === 0 && host.clientHeight === 0) {
      this.stale = true;
      return;
    }
    this.stale = false;
    this.r.fit();
    this.layout();
  }
}
