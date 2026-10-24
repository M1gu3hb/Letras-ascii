// Línea de tiempo de la canción: onda, tramo elegido con dos asas, cursor y marcas de frases.
import { PEAKS_PER_SEC } from './audio.js';
import { fmtTime } from './project.js';

const HANDLE = 11; // zona de agarre en px (CSS)
const MIN_LEN = 3;

export class Wave {
  constructor({ height = 132, onRange, onSeek } = {}) {
    this.cv = document.createElement('canvas');
    this.cv.className = 'wave';
    this.cv.style.height = height + 'px';
    this.cv.tabIndex = 0;
    this.cv.setAttribute('role', 'img');
    this.cv.setAttribute('aria-label', 'Onda de la canción con el tramo elegido');
    this.h = height;
    this.onRange = onRange;
    this.onSeek = onSeek;
    this.media = null;
    this.dur = 0;
    this.start = 0;
    this.end = 0;
    this.cursor = 0;
    this.marks = [];
    this.v0 = 0;
    this.v1 = 1;
    this.drag = null;
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('pointercancel', (e) => this.up(e));
    cv.addEventListener(
      'wheel',
      (e) => {
        if (!this.media) return;
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const r = cv.getBoundingClientRect();
          this.zoom(e.deltaY < 0 ? 0.8 : 1.25, this.v0 + ((e.clientX - r.left) / r.width) * (this.v1 - this.v0));
        } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          e.preventDefault();
          this.pan(((e.shiftKey ? e.deltaY : e.deltaX) / 600) * (this.v1 - this.v0));
        }
      },
      { passive: false },
    );
    cv.addEventListener('keydown', (e) => {
      if (!this.media) return;
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft') this.onSeek && this.onSeek(Math.max(0, this.cursor - step));
      else if (e.key === 'ArrowRight') this.onSeek && this.onSeek(Math.min(this.dur, this.cursor + step));
      else return;
      e.preventDefault();
    });
    if (window.ResizeObserver) new ResizeObserver(() => this.draw()).observe(cv);
  }

  setMedia(media) {
    this.media = media;
    this.dur = media ? media.dur : 0;
    this.v0 = 0;
    this.v1 = this.dur;
    this.draw();
  }
  setRange(start, end) {
    this.start = start;
    this.end = end;
    this.draw();
  }
  setCursor(t) {
    if (Math.abs(t - this.cursor) < 1e-3) return;
    this.cursor = t;
    this.draw();
  }
  setMarks(m) {
    this.marks = m || [];
    this.draw();
  }

  zoom(f, around) {
    if (!this.media) return;
    const c = around ?? (this.v0 + this.v1) / 2;
    let len = (this.v1 - this.v0) * f;
    len = Math.max(4, Math.min(this.dur, len));
    let a = c - ((c - this.v0) / (this.v1 - this.v0)) * len;
    a = Math.max(0, Math.min(this.dur - len, a));
    this.v0 = a;
    this.v1 = a + len;
    this.draw();
  }
  pan(dt) {
    const len = this.v1 - this.v0;
    const a = Math.max(0, Math.min(this.dur - len, this.v0 + dt));
    this.v0 = a;
    this.v1 = a + len;
    this.draw();
  }
  fitAll() {
    this.v0 = 0;
    this.v1 = this.dur;
    this.draw();
  }
  fitRange() {
    const pad = Math.max(2, (this.end - this.start) * 0.12);
    this.v0 = Math.max(0, this.start - pad);
    this.v1 = Math.min(this.dur, this.end + pad);
    this.draw();
  }

  tx(t) {
    const w = this.cv.clientWidth;
    return ((t - this.v0) / (this.v1 - this.v0)) * w;
  }
  xt(x) {
    const w = this.cv.clientWidth;
    return this.v0 + (x / w) * (this.v1 - this.v0);
  }

  hit(x) {
    const a = this.tx(this.start);
    const b = this.tx(this.end);
    if (Math.abs(x - a) <= HANDLE) return 'start';
    if (Math.abs(x - b) <= HANDLE) return 'end';
    if (x > a && x < b) return 'move';
    return 'seek';
  }

  down(e) {
    if (!this.media) return;
    const r = this.cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    const kind = this.hit(x);
    this.cv.setPointerCapture(e.pointerId);
    this.drag = { kind, x0: x, s0: this.start, e0: this.end, moved: false };
    if (kind === 'seek') {
      this.cursor = Math.max(0, Math.min(this.dur, this.xt(x)));
      this.onSeek && this.onSeek(this.cursor);
      this.draw();
    }
    this.cv.focus({ preventScroll: true });
  }
  move(e) {
    const r = this.cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    const d = this.drag;
    if (!d) {
      if (this.media) {
        const k = this.hit(x);
        this.cv.style.cursor = k === 'start' || k === 'end' ? 'ew-resize' : k === 'move' ? 'grab' : 'pointer';
      }
      return;
    }
    const dt = this.xt(x) - this.xt(d.x0);
    if (Math.abs(x - d.x0) > 2) d.moved = true;
    let s = this.start;
    let en = this.end;
    if (d.kind === 'start') s = Math.max(0, Math.min(d.e0 - MIN_LEN, d.s0 + dt));
    else if (d.kind === 'end') en = Math.min(this.dur, Math.max(d.s0 + MIN_LEN, d.e0 + dt));
    else if (d.kind === 'move') {
      const len = d.e0 - d.s0;
      s = Math.max(0, Math.min(this.dur - len, d.s0 + dt));
      en = s + len;
    } else if (d.kind === 'seek') {
      this.cursor = Math.max(0, Math.min(this.dur, this.xt(x)));
      this.onSeek && this.onSeek(this.cursor);
      this.draw();
      return;
    }
    this.start = s;
    this.end = en;
    this.draw();
    this.onRange && this.onRange(s, en, false);
  }
  up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind !== 'seek' && d.moved) this.onRange && this.onRange(this.start, this.end, true);
    else if (d.kind === 'move' && !d.moved) {
      // un toque dentro del tramo: mueve el cursor ahí
      const r = this.cv.getBoundingClientRect();
      this.cursor = Math.max(0, Math.min(this.dur, this.xt(e.clientX - r.left)));
      this.onSeek && this.onSeek(this.cursor);
      this.draw();
    }
  }

  draw() {
    const cv = this.cv;
    const W = cv.clientWidth;
    if (!W) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const Hh = this.h;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(Hh * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, Hh);
    const css = getComputedStyle(cv);
    const cIn = css.getPropertyValue('--wave-in').trim() || '#ff7096';
    const cOut = css.getPropertyValue('--wave-out').trim() || '#5a4880';
    const cHan = css.getPropertyValue('--wave-handle').trim() || '#ffb26c';
    const cInk = css.getPropertyValue('--ink').trim() || '#fff';
    const axisH = 18;
    const mid = (Hh - axisH) / 2;
    g.fillStyle = 'rgba(255,255,255,0.03)';
    g.fillRect(0, 0, W, Hh - axisH);
    if (!this.media) {
      g.fillStyle = cOut;
      g.font = '600 13px Nunito, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Aquí aparece la onda de tu canción', W / 2, mid + 4);
      return;
    }
    const pk = this.media.peaks;
    const a = this.tx(this.start);
    const b = this.tx(this.end);
    // región elegida (fondo)
    g.fillStyle = 'rgba(255,112,150,0.10)';
    g.fillRect(Math.max(0, a), 0, Math.min(W, b) - Math.max(0, a), Hh - axisH);
    // onda
    const tpp = (this.v1 - this.v0) / W;
    for (let x = 0; x < W; x++) {
      const t0 = this.v0 + x * tpp;
      const i0 = Math.floor(t0 * PEAKS_PER_SEC);
      const i1 = Math.max(i0 + 1, Math.floor((t0 + tpp) * PEAKS_PER_SEC));
      let m = 0;
      for (let i = i0; i < i1 && i < pk.length; i++) if (pk[i] > m) m = pk[i];
      const hh = Math.max(1, m * (mid - 4));
      g.fillStyle = x >= a && x <= b ? cIn : cOut;
      g.fillRect(x, mid - hh, 1, hh * 2);
    }
    // eje de tiempo
    const span = this.v1 - this.v0;
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((s) => span / s <= W / 62) || 300;
    g.font = '600 10px "JetBrains Mono", monospace';
    g.textAlign = 'left';
    g.fillStyle = cOut;
    for (let t = Math.ceil(this.v0 / step) * step; t < this.v1; t += step) {
      const x = this.tx(t);
      g.fillRect(x, Hh - axisH, 1, 5);
      g.fillText(fmtTime(t) + (step < 1 ? '.5' : ''), x + 3, Hh - 4);
    }
    // marcas de frases
    g.fillStyle = cHan;
    for (const m of this.marks) {
      const x = this.tx(m);
      if (x < 0 || x > W) continue;
      g.fillRect(Math.round(x), 0, 1, 7);
      g.fillRect(Math.round(x) - 1, 0, 3, 3);
    }
    // asas
    const handle = (x, dir) => {
      g.fillStyle = cHan;
      g.fillRect(x - 1, 0, 3, Hh - axisH);
      g.beginPath();
      const hx = dir < 0 ? x - 11 : x + 1;
      g.roundRect ? g.roundRect(hx, mid - 14, 10, 28, 4) : g.rect(hx, mid - 14, 10, 28);
      g.fill();
      g.fillStyle = '#1b0b14';
      g.fillRect(hx + 3, mid - 7, 1.5, 14);
      g.fillRect(hx + 6, mid - 7, 1.5, 14);
    };
    if (a >= -12 && a <= W + 12) handle(a, -1);
    if (b >= -12 && b <= W + 12) handle(b, 1);
    // cursor
    const cx = this.tx(this.cursor);
    if (cx >= 0 && cx <= W) {
      g.fillStyle = cInk;
      g.fillRect(Math.round(cx) - 1, 0, 2, Hh - axisH);
    }
  }
}
