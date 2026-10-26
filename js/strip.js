// Tira de tiempo: la onda de la canción y, encima, las palabras de la frase elegida como bloques que se
// arrastran (cambia cuándo empieza) o se estiran por el borde derecho (cuánto dura). Funciona con dedo, mouse y lápiz.
//
// Todos los tiempos de aquí son del TRAMO (segundos desde el inicio del tramo elegido).
// Un toque en un espacio vacío mueve el cursor; arrastrar en el vacío desplaza la vista; dos dedos (o Ctrl + rueda) acercan.
import { PEAKS_PER_SEC } from './audio.js';
import { h } from './ui.js';
import { fmtRuler } from './project.js';

const MIN_LEN = 0.05; // lo más corta que puede ser una palabra
const MIN_GAP = 0; // permite tiempos rápidos y bordes contiguos sin cruzar al vecino
const RULER = 18;
const MIN_SPAN = 0.8; // lo más cerca que se puede acercar (segundos visibles)

export class TimeStrip {
  constructor(cb = {}) {
    this.cb = cb;
    this.media = null;
    this.clip0 = 0;
    this.dur = 30;
    this.a = 0;
    this.b = 6;
    this.words = []; // [{ src, k, text, on, len, held, cur, ed }]
    this.sel = null; // { src, k }
    this.ph = 0;
    this.drag = null;
    this.pointers = new Map();
    this.blocks = new Map(); // 'src.k' -> elemento (se reutilizan para que el que se está arrastrando no desaparezca)
    this.cv = h('canvas', { class: 'stripcv', 'aria-hidden': 'true' });
    this.layer = h('div', { class: 'sblks' });
    this.head = h('div', { class: 'sph', 'aria-hidden': 'true' });
    this.tip = h('div', { class: 'stip', hidden: true, 'aria-hidden': 'true' });
    this.msg = h('div', { class: 'smsg', hidden: true });
    this.rangeEl = h('div', { class: 'audition-range', hidden: true, 'aria-hidden': 'true' });
    this.el = h('div', { class: 'strip', role: 'group', 'aria-label': 'Tira de tiempo: arrastra las palabras para cambiar cuándo suenan' }, this.cv, this.layer, this.head, this.tip, this.msg);
    this.el.prepend(this.rangeEl);
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', (e) => this.up(e, true));
    this.el.addEventListener('lostpointercapture', (e) => this.up(e, true));
    this.el.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.zoom(e.deltaY < 0 ? 0.8 : 1.25, this.xt(e.clientX - this.el.getBoundingClientRect().left));
        } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          e.preventDefault();
          this.pan(((e.shiftKey ? e.deltaY : e.deltaX) / 500) * (this.b - this.a));
        }
      },
      { passive: false },
    );
    if (window.ResizeObserver) { this.resizeObserver = new ResizeObserver(() => this.layout()); this.resizeObserver.observe(this.el); }
  }

  // ───────────── datos ─────────────
  setMedia(media, clip0, dur) {
    this.media = media;
    this.clip0 = clip0 || 0;
    this.dur = dur || 30;
    this.draw();
  }

  setWindow(a, b) {
    const span = Math.max(MIN_SPAN, b - a);
    let a2 = a;
    const lo = -0.4;
    const hi = Math.max(this.dur + 0.4, lo + span);
    a2 = Math.max(lo, Math.min(hi - span, a2));
    this.a = a2;
    this.b = a2 + span;
    this.layout();
  }

  // words: [{ src, k, text, on, len, held, cur, ed }] · sel: { src, k }
  setWords(words, sel, msg) {
    // si se está arrastrando una palabra, conserva su posición viva (aún no llega al motor)
    const d = this.drag;
    if (d && d.w && (d.kind === 'move' || d.kind === 'size')) {
      const nw = words.find((q) => q.src === d.src && q.k === d.k);
      if (nw) {
        nw.on = d.w.on;
        nw.len = d.w.len;
        nw.held = d.w.held;
        d.w = nw;
      }
    }
    this.words = words;
    this.sel = sel;
    this.msg.hidden = !msg;
    this.msg.textContent = msg || '';
    this.layout();
  }

  get span() {
    return this.b - this.a;
  }
  get W() {
    return this.el.clientWidth || 300;
  }
  tx(t) {
    return ((t - this.a) / (this.b - this.a)) * this.W;
  }
  xt(x) {
    return this.a + (x / this.W) * (this.b - this.a);
  }

  // ───────────── vista ─────────────
  zoom(f, around) {
    const c = around ?? (this.a + this.b) / 2;
    const span = Math.max(MIN_SPAN, Math.min(Math.max(8, this.dur + 0.8), this.span * f));
    const k = (c - this.a) / this.span;
    this.setWindow(c - k * span, c - k * span + span);
    this.cb.onView && this.cb.onView();
  }
  pan(dt) {
    this.setWindow(this.a + dt, this.b + dt);
    this.cb.onView && this.cb.onView();
  }
  showRange(t0, t1) {
    this.setWindow(t0, t1);
  }

  setPlayhead(t) {
    this.ph = t;
    const x = this.tx(t);
    const vis = x >= -2 && x <= this.W + 2;
    this.head.style.transform = `translateX(${x.toFixed(1)}px)`;
    this.head.classList.toggle('off', !vis);
  }

  setRange(range) { this.range = range; this.layout(); }
  magnet(value, src, k) {
    if (!this.snap) return value;
    const points = [this.ph, Math.round(value * 10) / 10, ...this.words.filter(w => w.src !== src || w.k !== k).map(w => w.on)];
    const nearest = points.reduce((a, b) => Math.abs(b - value) < Math.abs(a - value) ? b : a, value + .036);
    return Math.abs(nearest - value) <= .035 ? nearest : value;
  }
  cancelGesture() {
    const d = this.drag;
    if (d?.w) { d.w.on = d.on0; d.w.len = d.len0; d.w.held = d.held0; }
    this.drag = null; this.pinch = null; this.pointers.clear(); this.hideTip(); this.layout();
  }

  // coloca los bloques (reutilizando los que ya existen) y vuelve a dibujar la onda
  layout() {
    const W = this.W;
    if (!W) return;
    const sel = this.sel;
    this.rangeEl.hidden = !this.range;
    if (this.range) { const a = Math.max(0, this.tx(this.range.a)), b = Math.min(W, this.tx(this.range.b)); this.rangeEl.style.left = a + 'px'; this.rangeEl.style.width = Math.max(0, b - a) + 'px'; }
    const seen = new Set();
    for (const w of this.words) {
      const x0 = this.tx(w.on);
      const x1 = this.tx(w.on + w.len);
      if (x1 < -30 || x0 > W + 30) continue;
      const key = w.src + '.' + w.k;
      seen.add(key);
      let b = this.blocks.get(key);
      if (!b) {
        b = h('div', { class: 'sb', tabindex: '0', role: 'button', 'aria-label': 'Seleccionar ' + w.text, 'data-src': w.src, 'data-k': w.k, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.cb.onPick?.(w.src, w.k); } } }, h('span', { class: 'sbt' }, w.text), h('i', { class: 'sbr', title: 'Estirar o acortar' }));
        b._txt = w.text;
        this.blocks.set(key, b);
        this.layer.append(b);
      } else if (b._txt !== w.text) {
        b._txt = w.text;
        b.firstChild.textContent = w.text;
      }
      const on = sel && sel.src === w.src && sel.k === w.k;
      const cls = 'sb' + (w.held ? ' held' : '') + (on ? ' sel' : '') + (w.cur ? '' : ' ctx') + (w.ed ? ' ed' : '');
      if (b.className !== cls) b.className = cls;
      b.style.left = x0.toFixed(1) + 'px';
      b.style.width = Math.max(14, x1 - x0).toFixed(1) + 'px';
    }
    for (const [key, b] of this.blocks) {
      if (seen.has(key)) continue;
      // el que se está arrastrando no se quita aunque salga un poco de la vista
      if (this.drag && this.drag.blk === b) continue;
      b.remove();
      this.blocks.delete(key);
    }
    this.draw();
  }

  draw() {
    const cv = this.cv;
    const W = this.W;
    const H = this.el.clientHeight || 150;
    if (!W) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const css = getComputedStyle(this.el);
    const cIn = css.getPropertyValue('--wave-in').trim() || '#ff7096';
    const cOut = css.getPropertyValue('--wave-out').trim() || '#5a4880';
    const cInk = css.getPropertyValue('--muted').trim() || '#9a8bc0';
    const waveTop = RULER + 2;
    const waveH = Math.max(40, H - waveTop - 52);
    const mid = waveTop + waveH / 2;
    // zona de la onda
    g.fillStyle = 'rgba(255,255,255,0.03)';
    g.fillRect(0, waveTop, W, waveH);
    // onda
    const m = this.media;
    if (m && m.peaks) {
      const pk = m.peaks;
      const tpp = this.span / W;
      g.fillStyle = cIn;
      g.globalAlpha = 0.75;
      for (let x = 0; x < W; x++) {
        const s0 = this.clip0 + this.a + x * tpp;
        if (s0 < 0) continue;
        const i0 = Math.floor(s0 * PEAKS_PER_SEC);
        const i1 = Math.max(i0 + 1, Math.floor((s0 + tpp) * PEAKS_PER_SEC));
        let mx = 0;
        for (let i = i0; i < i1 && i < pk.length; i++) if (pk[i] > mx) mx = pk[i];
        const hh = Math.max(0.5, mx * (waveH / 2 - 2));
        g.fillRect(x, mid - hh, 1, hh * 2);
      }
      g.globalAlpha = 1;
      // golpes de graves (para alinear palabras con el ritmo)
      const e = m.energy;
      if (e && e.hit && this.span <= 24) {
        g.fillStyle = 'rgba(255,214,92,0.55)';
        const i0 = Math.max(0, Math.floor((this.clip0 + this.a) * e.fps));
        const i1 = Math.min(e.hit.length - 1, Math.ceil((this.clip0 + this.b) * e.fps));
        for (let i = i0; i <= i1; i++) {
          if (!e.hit[i]) continue;
          const x = this.tx(i / e.fps - this.clip0);
          g.fillRect(Math.round(x), waveTop + waveH - 9, 2, 9);
        }
      }
    } else {
      g.fillStyle = cOut;
      g.font = '600 12px Nunito, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Sin la canción cargada no hay onda, pero las palabras se pueden mover igual', W / 2, mid + 4);
      g.textAlign = 'left';
    }
    // regla de tiempo (tiempo de la canción completa, igual que en las listas)
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30];
    const step = steps.find((s) => this.span / s <= W / 58) || 30;
    g.font = '600 10px "JetBrains Mono", monospace';
    g.textAlign = 'left';
    g.fillStyle = cInk;
    const first = Math.max(0, Math.ceil((this.clip0 + this.a) / step) * step);
    for (let s = first; s < this.clip0 + this.b + 1e-6; s += step) {
      const x = this.tx(s - this.clip0);
      g.fillRect(Math.round(x), RULER - 5, 1, 5);
      const lab = fmtRuler(s, step);
      g.fillText(lab, x + 3, RULER - 6);
    }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, RULER, W, 1);
  }

  // ───────────── gestos ─────────────
  blockAt(target) {
    const b = target.closest && target.closest('.sb');
    return b && this.layer.contains(b) ? b : null;
  }

  down(e) {
    if (e.button != null && e.button > 0) return;
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch (err) {}
    if (this.pointers.size === 2) {
      // dos dedos: acercar / alejar
      if (this.drag?.w) { this.drag.w.on = this.drag.on0; this.drag.w.len = this.drag.len0; this.layout(); }
      this.drag = null;
      const [p, q] = [...this.pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      this.pinch = { d0: d, span0: this.span, c: this.xt((p.x + q.x) / 2 - r.left) };
      return;
    }
    const blk = this.blockAt(e.target);
    if (blk) {
      const src = +blk.dataset.src;
      const k = +blk.dataset.k;
      const w = this.words.find((q) => q.src === src && q.k === k);
      if (!w) return;
      const handle = e.target.classList && e.target.classList.contains('sbr');
      this.drag = { kind: handle ? 'size' : 'move', src, k, x0: x, on0: w.on, len0: w.len, held0: !!w.held, moved: false, id: e.pointerId, w, blk };
      this.cb.onPick && this.cb.onPick(src, k);
      e.preventDefault();
    } else {
      this.drag = { kind: 'view', x0: x, a0: this.a, moved: false, id: e.pointerId };
    }
  }

  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (this.pinch && this.pointers.size >= 2) {
      const [p, q] = [...this.pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      const span = Math.max(MIN_SPAN, Math.min(Math.max(8, this.dur + 0.8), (this.pinch.span0 * this.pinch.d0) / d));
      const cx = (p.x + q.x) / 2 - r.left;
      const k = cx / this.W;
      this.setWindow(this.pinch.c - k * span, this.pinch.c - k * span + span);
      this.cb.onView && this.cb.onView();
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) {
      // cursor según lo que hay debajo
      if (e.pointerType === 'mouse') {
        const blk = this.blockAt(e.target);
        this.el.style.cursor = blk ? (e.target.classList.contains('sbr') ? 'ew-resize' : 'grab') : 'default';
      }
      return;
    }
    const dxPx = x - d.x0;
    if (!d.moved && Math.abs(dxPx) < (e.pointerType === 'touch' ? 9 : 4)) return;
    d.moved = true;
    const dt = dxPx / (this.W / this.span);
    if (d.kind === 'view') {
      this.setWindow(d.a0 - dt, d.a0 - dt + this.span);
      this.cb.onView && this.cb.onView();
      return;
    }
    const lim = (this.cb.limits && this.cb.limits(d.src, d.k)) || { lo: 0, hi: this.dur };
    if (d.kind === 'move') {
      let on = Math.round(this.magnet(d.on0 + dt, d.src, d.k) * 1000) / 1000;
      // no pasa al vecino de atrás; una palabra larga tampoco puede pasar encima de la siguiente, una corta se acorta para caber
      const held = !!d.held0;
      const top = Number.isFinite(lim.hi) ? lim.hi - MIN_GAP - (held ? d.len0 : MIN_LEN) : Infinity;
      on = Math.max(lim.lo + MIN_GAP, Math.min(Math.max(lim.lo + MIN_GAP, top), on));
      d.on = on;
      d.w.on = on;
      if (!held && Number.isFinite(lim.hi)) d.w.len = Math.max(MIN_LEN, Math.min(d.len0, lim.hi - MIN_GAP - on));
      d.blk.style.left = this.tx(on).toFixed(1) + 'px';
      d.blk.style.width = Math.max(14, this.tx(on + d.w.len) - this.tx(on)).toFixed(1) + 'px';
      this.showTip(d.blk, `${fmtTime2(on + this.clip0)}  (${on - d.on0 >= 0 ? '+' : ''}${(on - d.on0).toFixed(2)} s)`);
      this.cb.onMove && this.cb.onMove(d.src, d.k, on, false);
    } else {
      let len = Math.round((this.magnet(d.w.on + d.len0 + dt, d.src, d.k) - d.w.on) * 1000) / 1000;
      len = Math.max(MIN_LEN, Math.min(8, len));
      // no pasar de donde empieza la palabra que sigue
      if (Number.isFinite(lim.hi)) len = Math.max(MIN_LEN, Math.min(len, lim.hi - MIN_GAP - d.w.on));
      d.len = len;
      d.w.len = len;
      d.blk.style.width = Math.max(14, this.tx(d.w.on + len) - this.tx(d.w.on)).toFixed(1) + 'px';
      const long = this.cb.holdMin ? len >= this.cb.holdMin() : false;
      d.blk.classList.toggle('held', long);
      this.showTip(d.blk, `${len.toFixed(2)} s · ${long ? 'larga: se estira' : 'corta'}`);
      this.cb.onSize && this.cb.onSize(d.src, d.k, len, false);
    }
  }

  up(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    this.hideTip();
    if (cancelled) {
      if (d.w) { d.w.on = d.on0; d.w.len = d.len0; d.w.held = d.held0; }
      this.layout();
      return;
    }
    if (d.kind === 'view') {
      if (!d.moved) {
        const r = this.el.getBoundingClientRect();
        const t = this.xt(e.clientX - r.left);
        this.cb.onSeek && this.cb.onSeek(Math.max(0, Math.min(this.dur, t)));
      }
      return;
    }
    if (!d.moved) {
      this.cb.onTap && this.cb.onTap(d.src, d.k);
      return;
    }
    if (d.kind === 'move' && d.on != null) this.cb.onMove && this.cb.onMove(d.src, d.k, d.on, true);
    else if (d.kind === 'size' && d.len != null) this.cb.onSize && this.cb.onSize(d.src, d.k, d.len, true);
  }

  showTip(blk, txt) {
    this.tip.hidden = false;
    this.tip.textContent = txt;
    const r = this.el.getBoundingClientRect();
    const br = blk.getBoundingClientRect();
    const w = this.tip.offsetWidth || 120;
    let x = br.left - r.left + br.width / 2 - w / 2;
    x = Math.max(2, Math.min(this.W - w - 2, x));
    this.tip.style.transform = `translate(${x.toFixed(0)}px, ${RULER + 2}px)`;
  }
  hideTip() {
    this.tip.hidden = true;
  }
  destroy() { this.cancelGesture(); this.resizeObserver?.disconnect(); }
}

// 1:07.35
function fmtTime2(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;

}
