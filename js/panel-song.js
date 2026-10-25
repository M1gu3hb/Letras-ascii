// Paso 1: subir la canción (o un video), ver la onda y elegir el tramo.
import { h, toast } from './ui.js';
import { Wave } from './wave.js';
import { fmtTime, fmtTimeMs, parseClock } from './project.js';

const ACCEPT = 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.mp4,.mov,.m4v,.webm,.mkv,.3gp';

export class SongPanel {
  constructor(app) {
    this.app = app;
    const input = h('input', { type: 'file', accept: ACCEPT, class: 'sr-only', id: 'songfile', 'aria-label': 'Elegir canción o video' });
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) this.pick(f);
    });
    this.input = input;
    this.drop = h(
      'label',
      { class: 'drop', for: 'songfile' },
      h('b', {}, 'Sube tu canción o un video'),
      h('span', {}, 'Arrastra el archivo aquí o toca para elegirlo. También puedo leer el audio de videos compatibles.'),
      h('small', {}, 'mp3, m4a, wav, ogg, mp4, mov, webm · se queda en tu equipo, no se sube a ningún servidor'),
    );
    const dz = this.drop;
    ['dragenter', 'dragover'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add('over');
      }),
    );
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('over')));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) this.pick(f);
    });

    this.info = h('div', { class: 'songinfo hidden' });
    this.wave = new Wave({
      onRange: (s, e, final) => {
        this.paintRange(s, e);
        app.setClip(s, e, { final });
      },
      onSeek: (t) => this.seekFull(t),
    });
    const zbtn = (txt, label, fn) => h('button', { class: 'btn small ghost', type: 'button', 'aria-label': label, onclick: fn }, txt);
    this.zoomRow = h('div', { class: 'row tight' }, zbtn('−', 'Alejar', () => this.wave.zoom(1.5)), zbtn('+', 'Acercar', () => this.wave.zoom(0.66)), zbtn('Ver todo', 'Ver toda la canción', () => this.wave.fitAll()), zbtn('Ver mi tramo', 'Acercar al tramo elegido', () => this.wave.fitRange()), h('span', { class: 'muted small grow wave-zoom-hint' }, matchMedia('(pointer: coarse)').matches ? 'Usa los botones para acercar o alejar la onda.' : 'Zoom: botones o Ctrl + rueda'));
    this.listenBtn = h('button', { class: 'btn small', type: 'button', onclick: () => this.toggleFull() }, '▶ Escuchar la canción');
    this.startIn = h('input', { type: 'text', class: 'tin', inputmode: 'decimal', 'aria-label': 'Empieza en' });
    this.endIn = h('input', { type: 'text', class: 'tin', inputmode: 'decimal', 'aria-label': 'Termina en' });
    const commit = () => {
      const m = app.media;
      if (!m) return;
      let s = parseClock(this.startIn.value);
      let e = parseClock(this.endIn.value);
      const c = app.clip();
      if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e > m.dur + .01 || s >= e) {
        toast('Usa tiempos válidos: inicio menor que final, dentro de la canción. Ejemplo: 1:23.50.', 'bad');
        this.paintRange(c.start, c.end); return;
      }
      if (e - s < 3) e = Math.min(m.dur, s + 3);
      app.setClip(s, e);
    };
    this.startIn.addEventListener('change', commit);
    this.endIn.addEventListener('change', commit);
    const here = (which) =>
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
        const m = app.media;
        if (!m) return;
        const t = this.cursor();
        const c = app.clip();
        if (which === 'start') app.setClip(Math.min(t, c.end - 3), Math.max(c.end, t + 3));
        else app.setClip(Math.min(c.start, t - 3), t);
      } }, which === 'start' ? 'Empieza aquí' : 'Termina aquí');
    this.rangeBox = h(
      'div',
      { class: 'rangebox' },
      h('div', { class: 'rfield' }, h('label', {}, 'Empieza'), this.startIn, here('start')),
      h('div', { class: 'rfield' }, h('label', {}, 'Termina'), this.endIn, here('end')),
    );
    const preset = (txt, f) => h('button', { class: 'chip', type: 'button', onclick: () => this.preset(f) }, txt);
    this.presets = h('div', { class: 'chips' }, preset('30 s', 30), preset('1 min', 60), preset('2 min', 120), preset('Toda la canción', 0));
    this.len = h('div', { class: 'lenline' });
    this.testBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => this.testClip() }, '▶ Probar este tramo');
    this.tip = h('p', { class: 'muted small' }, 'Tip: toca la onda para poner el cursor, dale a «Escuchar» y usa «aquí» para marcar dónde empieza y dónde termina. Lo que marques de la letra se conserva aunque cambies el tramo.');
    this.body = h('div', { class: 'songbody hidden' }, this.info, this.wave.cv, this.zoomRow, h('div', { class: 'row' }, this.listenBtn, this.testBtn), h('div', { class: 'lab2' }, 'Tramo de la canción'), this.presets, this.rangeBox, this.len, this.tip);
    this.el = h('div', { class: 'pane' }, h('h2', {}, 'Tu canción'), this.input, this.drop, this.body);

    app.on('media', () => this.refresh());
    app.on('clip', (c) => {
      this.wave.setRange(c.start, c.end);
      this.paintRange(c.start, c.end);
    });
    app.on('reset', () => this.refresh());
    app.on('project', () => this.paintMarks());
    app.on('rebuilt', () => this.paintMarks());
    app.on('tick', () => this.tick());
    app.audioFull.addEventListener('ended', () => this.paintListen());
    app.audioFull.addEventListener('pause', () => this.paintListen());
    app.audioFull.addEventListener('play', () => this.paintListen());
    this.refresh();
  }

  async pick(file) {
    const ok = await this.app.loadFile(file);
    if (ok) {
      toast('Listo. Elige el tramo y sigue con la letra.');
    }
  }

  cursor() {
    return this.wave.cursor || 0;
  }

  seekFull(t) {
    const a = this.app.audioFull;
    this.wave.cursor = t;
    if (a.src) {
      try {
        a.currentTime = t;
      } catch (e) {}
    }
  }

  toggleFull() {
    const a = this.app.audioFull;
    if (!this.app.media) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    this.app.player.pause();
    try {
      a.currentTime = this.wave.cursor || 0;
    } catch (e) {}
    a.play().catch(() => toast('El navegador no dejó reproducir. Toca de nuevo.', 'bad'));
  }
  paintListen() {
    const a = this.app.audioFull;
    this.listenBtn.textContent = a.paused ? '▶ Escuchar la canción' : '■ Parar';
  }

  testClip() {
    const app = this.app;
    app.audioFull.pause();
    app.player.start(0);
  }

  preset(len) {
    const m = this.app.media;
    if (!m) return;
    const c = this.app.clip();
    if (!len) return this.app.setClip(0, m.dur);
    let s = c.start;
    if (s + len > m.dur) s = Math.max(0, m.dur - len);
    this.app.setClip(s, Math.min(m.dur, s + len));
    this.wave.fitRange();
  }

  paintMarks() {
    const p = this.app.project;
    const ts = [];
    for (const s of p.sync || []) if (s && Number.isFinite(s.t)) ts.push(s.t);
    const key = ts.join(',');
    if (key === this._marksKey) return;
    this._marksKey = key;
    this.wave.setMarks(ts);
  }

  paintRange(s, e) {
    if (document.activeElement !== this.startIn) this.startIn.value = fmtTimeMs(s);
    if (document.activeElement !== this.endIn) this.endIn.value = fmtTimeMs(e);
    const d = e - s;
    this.len.textContent = `Tramo de ${d < 100 ? d.toFixed(1) + ' s' : fmtTime(d)}  ·  ${fmtTime(s)} → ${fmtTime(e)}`;
  }

  tick() {
    const a = this.app.audioFull;
    if (!a.paused && this.app.media) this.wave.setCursor(a.currentTime);
    else if (this.app.player.state === 'playing' && this.app.media) this.wave.setCursor(this.app.clip().start + this.app.player.t);
  }

  refresh() {
    const m = this.app.media;
    this.drop.classList.toggle('hidden', !!m);
    this.body.classList.toggle('hidden', !m);
    if (m) {
      const c = this.app.clip();
      this.wave.setMedia(m);
      this.wave.setRange(c.start, c.end);
      this.paintRange(c.start, c.end);
      this.wave.setCursor(c.start);
      this._marksKey = null;
      this.paintMarks();
      this.info.classList.remove('hidden');
      this.info.replaceChildren(
        h('div', { class: 'sname' }, h('b', {}, m.name), h('small', {}, `${fmtTime(m.dur)} de ${m.video ? 'audio sacado del video' : 'canción'}`)),
        h('label', { class: 'btn small ghost', for: 'songfile', tabindex: 0, onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), this.input.click()) }, 'Cambiar archivo'),
      );
    } else {
      this.info.classList.add('hidden');
      this.wave.setMedia(null);
    }
  }
  show() {
    this.wave.draw();
  }
  destroy() { this.wave.destroy(); }

}
