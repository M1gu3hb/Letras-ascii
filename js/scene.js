// Escena: distribución de la letra, bolita karaoke, polvo, corazón y composición de cada cuadro.
import { clamp, lerp, smooth, hash, easeOutCubic } from './util.js';
import { Renderer, KC, PAL_SELF, PAL_EDGE } from './grid.js';
import { Typo } from './type.js';
import { buildTimeline, pseudoLine, TONE_COLORS, COLORS } from './timeline.js';
import { renderWord, get3D } from './fx.js';
import { drawHeart, warmHeart } from './heart.js';
import { drawMood, tintOf, drawFloor, drawLove, drawKick, drawDropFx } from './bg.js';
import { TextLayer } from './text-layer.js';
import { analyzeDrops } from './drops.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Filas que se reservan abajo para la frase completa (chiquita). Con 38 filas o más son 15, exactamente como siempre;
// en escenarios bajitos (el horizontal de un teléfono mide ~22 filas) se achica para que la palabra principal no quede diminuta.
const ctxBand = (rows) => Math.min(15, Math.max(7, Math.round(rows * 0.4)));

const TAU = Math.PI * 2;
// Reacciones a la música (todas dependen de `react`; con react ≈ 0 no se ve ninguna)
const FLASH_PEAK = 0.34; // opacidad máxima del destello del drop (nunca pasa de ~0.35)
const FLASH_TAU = 0.4; // s: el destello se apaga en este tiempo
const FLASH_END = 1.5;
const SHAKE_PX = 5; // sacudida de cámara máxima, en px (en pantallas angostas se reduce)
const SHAKE_TAU = 0.17;
const WARP_TAU = 0.6; // s: el empujón de las estrellas tras un drop
const DROP_TAU = 0.55; // s: estallido del drop (corazón que se hincha, brillo extra)
const SPIN_SEC = 1.7; // s: el corazón da una vuelta al caer el drop
// qué tanto se nota la lluvia de corazoncitos en cada ambiente (0 = ninguno: ya tiene lo suyo)
const LOVE = { stars: 1, snow: 0.8, tunnel: 0.8, waves: 0.7, aurora: 0.7, rings: 0.8, spectrum: 0.55, plasma: 0.6 };
const newE = () => ({ low: 0, mid: 0, hi: 0, pulse: 0, rings: [], inten: 0.5, drop: 0, dropAge: 99, dropIdx: -1, warp: 0, warpV: 0 });

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
    this.E = newE();
    this.ringPool = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
    // lo que flush() pinta cada cuadro (bloom, destello, sacudida…); se reutiliza, nunca se recrea
    this.fx = { pulse: 0, lift: 0, bloom: 0, bloomScale: 1, flash: 0, flashMix: 0, shakeX: 0, shakeY: 0, boost: 0 };
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

  // `end` (segundos de la canción) recorta el análisis al tramo, igual que sliceEnergy al exportar.
  setEnergy(e, offset = 0, end = Infinity) {
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
    // drops e intensidad de sección: se analizan desde donde empieza el tramo. El estudio entrega toda la canción con un
    // `offset`; el archivo exportado, solo el tramo desde 0. Así los dos parten del mismo cuadro y calculan lo mismo.
    const i0 = clamp(Math.floor(offset * e.fps), 0, Math.max(0, n - 2));
    const i1 = Number.isFinite(end) ? clamp(Math.ceil(end * e.fps) + 1, i0 + 2, n) : n;
    const from = (a) => (i0 || i1 < n ? (a.subarray ? a.subarray(i0, i1) : a.slice(i0, i1)) : a);
    const an = analyzeDrops({ fps: e.fps, low: from(e.low), mid: from(e.mid), hi: from(e.hi), hit: from(e.hit) });
    const drops = new Float32Array(an.drops.length);
    for (let k = 0; k < drops.length; k++) drops[k] = an.drops[k] + i0 / e.fps - offset; // en tiempo del tramo
    this.energy = { fps: e.fps, pulse: p, mid: e.mid, hi: e.hi, low: e.low, hit: e.hit, n, drops, inten: an.intensity, i0 };
    this.tOff = offset;
    this.E = newE();
  }

  // ajustes que se pueden mover en vivo sin rehacer la línea de tiempo
  setLive(st) {
    this.react = st.react ?? 1;
    this.ballOn = st.ball !== false;
    this.floorOn = st.floor !== false;
    this.glow = clamp(st.glow ?? 1, 0, 2.5);
    this.r.setLook(st);
  }

  // energía de la canción en el instante t del tramo (0..1 por banda), golpes recientes y estado del último drop
  bandsAt(t) {
    const e = this.energy;
    const E = this.E || (this.E = newE());
    E.rings.length = 0;
    E.inten = 0.5;
    E.drop = E.warp = E.warpV = 0;
    E.dropAge = 99;
    E.dropIdx = -1;
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
      const pool = this.ringPool;
      for (let j = i; j >= Math.max(0, i - back) && E.rings.length < 6; j--) {
        if (!e.hit[j]) continue;
        const ring = pool[E.rings.length];
        ring[0] = (i - j) / e.fps;
        ring[1] = Math.min(1.2, e.hit[j] / 100);
        E.rings.push(ring);
      }
      // sección: 0.5 es «neutra»; con react = 0 no mueve nada
      const q = e.inten.length ? e.inten[clamp(i - e.i0, 0, e.inten.length - 1)] : 0.5;
      E.inten = 0.5 + (q - 0.5) * Math.min(rc, 1.3);
      // drops: el último que ya cayó y el empujón acumulado de todos los anteriores
      const ds = e.drops;
      for (let k = 0; k < ds.length; k++) {
        const age = t - ds[k];
        if (age < 0) break;
        E.warp += 1 - Math.exp(-age / WARP_TAU);
        E.dropAge = age;
        E.dropIdx = k;
      }
      if (E.dropIdx >= 0) {
        E.warpV = Math.exp(-E.dropAge / WARP_TAU);
        E.drop = E.dropAge < 2.2 ? Math.exp(-E.dropAge / DROP_TAU) : 0;
      }
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
        for (const w of u.words) if (w.renderMode !== 'normal' && (w.appear === 'flip3d' || w.hold === 'sway3d' || u.exit === 'sink3d')) get3D(this.R, w);
      });
    } else {
      for (const line of tl.lines) {
        this.layoutLine(line, { y0: 3, y1: karaokeTop, Fmax: Math.min(rows * 0.36, 17) * this.sizeG });
        for (const w of line.words) if (w.renderMode !== 'normal' && (w.appear === 'flip3d' || w.hold === 'sway3d' || line.exit === 'sink3d')) get3D(this.R, w);
      }
    }
    // la frase de la intro y la del final se quedan por encima del aviso «toca para…», que va sobre la franja del karaoke
    const y0 = Math.floor(r.rows * 0.64);
    const hintTop = Math.max(y0 + 8, this.hintRow() - 1);
    this.intro = pseudoLine(this.tl.intro ?? 'para ti', 0.35, { appear: 'decode', hold: 'breathe', tone: 'dual', seed: 11, stagger: 0.28, appearDur: 0.9 });
    this.layoutLine(this.intro, { y0, y1: Math.min(Math.floor(r.rows * 0.86), hintTop), Fmax: 12 });
    this.outro = null;
    if (this.tl.outro && this.tl.outro.trim()) {
      this.outro = pseudoLine(this.tl.outro, this.tl.lastHide + 0.4, { appear: 'rise', hold: 'breathe', tone: 'dual', seed: 23, stagger: 0.3, appearDur: 0.9 });
      this.layoutLine(this.outro, { y0, y1: Math.min(Math.floor(r.rows * 0.88), hintTop), Fmax: 12 });
    }
    this.textLayer.layout();
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
        const built = w.renderMode === 'normal' ? { Wb: plan.bounds[k].width, Hb: plan.bounds[k].height } : typo.buildWord(txtOf(w), Fk, maxExtra, w.stretch, faces[k], thick[k], track);
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

  // Energía y composición del cuadro. El karaoke y su bolita pertenecen a TextLayer.
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

  // La música en este cuadro. En canción sale de la energía; en la intro y el final es un latido sintético.
  // Con «movimiento reducido» queda solo la intensidad de la sección (cambios de brillo lentos, nada de golpes).
  frameE(t, mode) {
    let E;
    if (mode === 'song') E = this.bandsAt(Math.min(t, this.tl ? this.tl.duration : t));
    else {
      const p = this.R.pulse;
      E = this.E || (this.E = newE());
      E.rings.length = 0;
      E.low = 0.25 + p * 0.5;
      E.mid = 0.2;
      E.hi = 0.15;
      E.pulse = p;
      E.inten = 0.5;
      E.drop = E.warp = E.warpV = 0;
      E.dropAge = 99;
      E.dropIdx = -1;
    }
    if (this.R.reduced) {
      E.low = E.mid = E.hi = E.pulse = 0;
      E.rings.length = 0;
      E.drop = E.warp = E.warpV = 0;
      E.dropAge = 99;
      E.dropIdx = -1;
    }
    return E;
  }

  drawBackdrop(t, mode, E) {
    const g = this.r.grid;
    const m = this.moodMix(t, mode);
    // secciones fuertes: fondo más vivo; tranquilas: más callado. El drop lo enciende un instante.
    const brt = 1 + (E.inten - 0.5) * 0.7 + E.drop * 0.3 * Math.min(this.react, 1.3);
    let love = LOVE[m.a] || 0;
    if (m.b) {
      drawMood(m.b, g, t, (1 - m.f) * brt, E);
      drawMood(m.a, g, t, m.f * brt, E);
      love = love * m.f + (LOVE[m.b] || 0) * (1 - m.f);
      const ta = tintOf(m.a);
      const tb = tintOf(m.b);
      this.r.setTint(ta[0].map((c, k) => c * m.f + tb[0][k] * (1 - m.f)), ta[1].map((c, k) => c * m.f + tb[1][k] * (1 - m.f)));
    } else {
      drawMood(m.a, g, t, brt, E);
      const ta = tintOf(m.a);
      const cur = this.r.tint;
      if (cur[0] !== ta[0]) this.r.setTint(ta[0], ta[1]);
    }
    love *= smooth(0, 0.3, this.react);
    if (love > 0.02) drawLove(g, t, love * brt, E);
    if (this.floorOn) drawFloor(g, t, E, 0.9);
    // anillo de caracteres con cada bombo fuerte (el ambiente «pulse» ya dibuja los suyos)
    if (m.a !== 'pulse' && m.b !== 'pulse' && E.rings.length) drawKick(g, E, Math.min(this.react, 1.2));
  }

  // lo que pinta flush() aparte de los caracteres: resplandor de graves, destello del drop, sacudida y brillo extra
  fxFrame(E, pulse) {
    const fx = this.fx;
    const rc = this.react;
    const live = smooth(0, 0.3, rc); // con react ≈ 0, todo apagado
    const k = Math.min(rc, 1.3);
    fx.pulse = pulse;
    fx.flash = fx.flashMix = fx.shakeX = fx.shakeY = fx.boost = 0;
    fx.bloomScale = 1;
    if (this.R.reduced) {
      // brillo suave según la sección, sin movimiento
      fx.bloom = live * (0.1 + 0.2 * E.inten);
      fx.lift = (E.inten - 0.5) * 0.12 * live;
      return fx;
    }
    fx.lift = (E.inten - 0.5) * 0.2 * live;
    fx.bloom = clamp(live * (0.05 + 0.26 * E.low + 0.36 * E.pulse + 0.4 * E.drop) * (0.6 + 0.8 * E.inten), 0, 0.78);
    fx.bloomScale = 0.9 + 0.2 * Math.min(1, E.pulse) + 0.32 * E.drop;
    const age = E.dropAge;
    if (E.dropIdx >= 0 && age < FLASH_END && rc > 0.02) {
      // destello: sube en 3 cuadros, se apaga en ~0.4 s y pasa de blanco a azul rey (nunca parpadea: un solo pulso por drop)
      fx.flash = Math.min(FLASH_PEAK * k, 0.35) * Math.min(1, age / 0.05) * Math.exp(-age / FLASH_TAU);
      fx.flashMix = smooth(0.04, 0.6, age);
      // sacudida de cámara: pocos px, se amortigua en medio segundo (solo mueve los caracteres)
      if (age < 0.7) {
        const amp = Math.min(SHAKE_PX, this.r.W * 0.013) * Math.min(k, 1) * Math.exp(-age / SHAKE_TAU);
        const ph = hash(E.dropIdx, 7, 3) * TAU;
        fx.shakeX = amp * Math.cos(age * 41 + ph);
        fx.shakeY = amp * 0.7 * Math.sin(age * 53 + ph * 1.7);
      }
      // los caracteres se encienden un momento (más brillo y color)
      fx.boost = 0.3 * k * Math.exp(-age / 0.8);
    }
    return fx;
  }

  // fila de la rejilla donde caben los avisos («toca para empezar»…): justo encima de la franja del karaoke,
  // o sobre el borde inferior cuando el karaoke está apagado. Nunca encima de la franja.
  hintRow() {
    const r = this.r;
    const rows = r.grid.rows;
    if (!this.tl) return rows - 5;
    const gm = this.textLayer.geometry();
    const edge = this.tl.style.karaokeOn === false ? gm.top + gm.band : gm.top; // px
    return clamp(Math.floor((edge - r.offY) / r.cellH) - 1, 4, rows - 2);
  }

  // aviso centrado en la rejilla, con un respiro suave (alpha) en vez de un parpadeo
  drawHint(msg, t, col, base, amp) {
    const g = this.r.grid;
    const a = this.R.reduced ? base + amp * 0.5 : base + amp * (0.5 + 0.5 * Math.sin(t * 1.5));
    g.text(msg, Math.floor((g.cols - msg.length) / 2), this.hintRow(), col, a);
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
    if (R.reduced) pulse = R.pulse = 0;
    const E = this.frameE(t, mode);
    this.drawBackdrop(R.reduced ? 0 : t, mode, E);
    const k = Math.min(this.react, 1.3);
    // el drop le da un golpe al corazón: se hincha y da una vuelta (la vuelta completa termina igual que empezó)
    const dropAge = E.dropIdx >= 0 && !R.reduced ? E.dropAge : 99;
    const beat = pulse * 1.15 + E.drop * 1.6 * k;
    const spin = k > 0.02 && dropAge < SPIN_SEC ? TAU * easeOutCubic(dropAge / SPIN_SEC) : 0;

    const heartSize = (s) => Math.min(rows * s, cols * s * 0.9);
    const rot = (tt) => (R.reduced ? 0 : tt * 0.55 + Math.sin(tt * 0.8) * 0.28 + spin);

    if (mode === 'intro' && this.intro) {
      drawHeart(R, cols / 2, rows * 0.36, heartSize(0.42), rot(t), pulse, 0.9 * smooth(0, 0.8, t));
      for (const w of this.intro.words) renderWord(R, this.intro, w, t);
      if (t > 1.6 && this.hint !== false && this.overlays) this.drawHint('toca para empezar', t, KC.LAV, 0.38, 0.34);
    } else if (this.tl) {
      const tl = this.tl;
      let presence = 0;
      for (const line of tl.lines) {
        const p = smooth(line.t - 0.6, line.t - 0.05, t) * (1 - smooth(line.exitStart, line.hideAt, t));
        if (p > presence) presence = p;
      }
      const outroOn = mode === 'ended' || t >= tl.lastHide - 0.2;
      if (!outroOn) {
        // el corazón de fondo se asoma un poco más en el drop, aunque haya letra
        const ga = (1 - presence) * 0.62 + (1 - (1 - presence) * 0.62) * E.drop * 0.4 * k;
        if (ga > 0.03) drawHeart(R, cols / 2, rows * 0.5, heartSize(0.34), rot(t), beat, ga);
      } else {
        const a = mode === 'ended' ? 1 : smooth(tl.lastHide - 0.2, tl.lastHide + 0.9, t);
        drawHeart(R, cols / 2, rows * (this.outro ? 0.36 : 0.45), heartSize(this.outro ? 0.42 : 0.52), rot(t), pulse * 1.3, 0.95 * a);
        if (this.outro) for (const w of this.outro.words) renderWord(R, this.outro, w, t);
      }
      if (mode !== 'ended' && tl.focus === 'word') {
        for (const u of tl.units) {
          if (t < u.t - 0.5 || t > u.hideAt + 0.05) continue;
          for (const w of u.words) if (w.renderMode !== 'normal') renderWord(R, u, w, t);
        }
      } else if (mode !== 'ended') {
        for (const line of tl.lines) {
          if (t < line.t - 0.5 || t > line.hideAt + 0.05) continue;
          for (const w of line.words) if (w.renderMode !== 'normal') renderWord(R, line, w, t);
        }
      }
      if (mode === 'ended' && this.overlays) this.drawHint('toca para volver a verlo', t, KC.LAV, 0.38, 0.32);
    }
    if (dropAge < 2 && k > 0.02) drawDropFx(g, E, k);
    if (this.paused && this.overlays) {
      const msg = '- pausa -  toca para seguir';
      g.text(msg, Math.floor((cols - msg.length) / 2), this.hintRow(), KC.PEACH, 0.8);
    }
    if (!R.reduced) this.drawTouch();
    if (this.glow > 0.02) g.bloom(0.05 * this.glow);
    r.flush(this.fxFrame(E, pulse));
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
