// Paso 4: laboratorio. Todo lo que cambia cómo se ve y cómo reacciona, con vista en vivo en el escenario.
import { h, toast, slider, toggle, segmented, chips, field } from './ui.js';
import { defaultStyle, ASCII_KEYS, ASCII_PRESETS, asciiPresetValues, asciiPresetOf, MOOD_LABELS, MOOD_NAMES, FACE_LABELS, FACE_NAMES, PALETTES, PALETTE_LABELS, FILL_LABELS, WORDFX_LABELS } from './project.js';
import { FILL_CHARS } from './grid.js';
import { FACES } from './type.js';
import { WORD_FX } from './director.js';
import { readingControls, versionControls } from './style-controls.js';

const HEX = { white: '#ffffff', cream: '#ffecde', blush: '#ffc4c4', rose: '#ff7096', pink: '#ff4fd8', ruby: '#e0245e', orange: '#ff8a3d', amber: '#ffb26c', gold: '#ffd75e', mint: '#7dffc4', cyan: '#4fe3ff', ice: '#cfeeff', violet: '#9a7bff', lav: '#c3b4ee' };
const pct = (v) => Math.round(v * 100) + '%';

function group(title, ...kids) {
  return h('details', { class: 'grp', open: title === 'Qué se ve' || title === 'Aspecto del ASCII' }, h('summary', {}, title), h('div', { class: 'gbody' }, ...kids));
}

export class StylePanel {
  constructor(app) {
    this.app = app;
    const st = () => app.project.style;
    const set = (k, v, live = false) => {
      st()[k] = v;
      if (ASCII_KEYS.includes(k)) this.paintPreset();
      if (live) {
        app.scene.setLive(st());
        app.saveSoon();
        app.emit('project');
      } else app.projectChanged();
    };
    // Lo que reacomoda la letra (grosor, espacio, tamaño, detalle) se reconstruye mientras arrastras,
    // como máximo unas 7 veces por segundo, y una última vez al soltar.
    let rbTimer = 0;
    app.scope.cleanups.push(() => clearTimeout(rbTimer));
    let lastRb = 0;
    const setLayout = (k, v) => {
      st()[k] = v;
      this.paintPreset();
      app.saveSoon();
      app.emit('project');
      if (rbTimer) return;
      rbTimer = setTimeout(() => {
        rbTimer = 0;
        lastRb = performance.now();
        app.rebuildSoon.now();
      }, Math.max(0, 140 - (performance.now() - lastRb)));
    };
    const ctl = (this.ctl = {});

    ctl.focus = segmented(
      [
        ['word', 'Palabra principal'],
        ['line', 'Frase completa'],
      ],
      st().focus,
      (v) => set('focus', v),
      'Qué se muestra grande',
    );
    ctl.ball = toggle('Bolita de karaoke', st().ball, (v) => set('ball', v, true), 'salta sobre la frase');
    ctl.floor = toggle('Piso que late con los graves', st().floor, (v) => set('floor', v, true));
    ctl.react = slider({ min: 0, max: 2, step: 0.05, value: st().react, fmt: pct, label: 'Qué tanto reacciona a los graves', onInput: (v) => set('react', v, true) });
    this.meter = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', {}));
    this.stats = h('div', { class: 'muted small' });

    ctl.random = slider({ min: 0, max: 1, step: 0.05, value: st().random, fmt: pct, label: 'Qué tan al azar cambian letras y animaciones', onInput: (v) => set('random', v) });
    ctl.fxAuto = slider({ min: 0, max: 1, step: 0.05, value: st().fxAuto, fmt: (v) => (v === 0 ? 'apagados' : pct(v)), label: 'Efectos automáticos por palabra', hint: 'brillo, parpadeo, explosión…', onInput: (v) => set('fxAuto', v) });
    ctl.fxSet = chips(WORD_FX.map((f) => [f, WORDFX_LABELS[f]]), st().fxSet, (v) => set('fxSet', v));
    ctl.caps = segmented(
      [
        ['off', 'No'],
        ['auto', 'En palabras fuertes'],
        ['all', 'Todas'],
      ],
      st().caps,
      (v) => set('caps', v),
      'Mayúsculas',
    );
    ctl.holdMin = slider({ min: 0.3, max: 1.5, step: 0.05, value: st().holdMin ?? 0.6, fmt: (v) => v.toFixed(2) + ' s', label: 'Desde cuándo una palabra cuenta como larga', hint: 'al mantener presionado', onInput: (v) => set('holdMin', v) });

    // ── aspecto del ASCII ──
    const thickFmt = (v) => (Math.abs(v) < 0.03 ? 'normal' : v < 0 ? 'fina ' + Math.round(-v * 100) + '%' : 'gruesa ' + Math.round(v * 100) + '%');
    ctl.thick = slider({ min: -1, max: 1, step: 0.05, value: st().thick ?? 0, fmt: thickFmt, label: 'Grosor de las letras', hint: 'fino = casi de línea · grueso = llenas', onInput: (v) => setLayout('thick', Math.abs(v) < 0.03 ? 0 : v) });
    ctl.track = slider({ min: -0.06, max: 0.3, step: 0.01, value: st().track ?? 0, fmt: (v) => (Math.abs(v) < 0.005 ? 'normal' : (v > 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%'), label: 'Espacio entre letras', onInput: (v) => setLayout('track', Math.abs(v) < 0.005 ? 0 : v) });
    ctl.size = slider({ min: 0.6, max: 1.3, step: 0.05, value: st().size ?? 1, fmt: pct, label: 'Tamaño de las palabras', hint: 'si no caben se achican solas', onInput: (v) => setLayout('size', Math.abs(v - 1) < 0.03 ? 1 : v) });
    ctl.detail = slider({
      min: 0.6,
      max: 1.8,
      step: 0.05,
      value: st().detail ?? 1,
      fmt: (v) => (Math.abs(v - 1) < 0.03 ? 'normal' : v > 1 ? 'fino ×' + v.toFixed(2) : 'grueso ×' + v.toFixed(2)),
      label: 'Detalle de la rejilla',
      hint: 'más fino = más caracteres, más chicos',
      onInput: (v) => setLayout('detail', Math.abs(v - 1) < 0.03 ? 1 : v),
    });
    ctl.weight = segmented(
      [
        ['normal', 'Normal'],
        ['bold', 'Negrita'],
      ],
      st().weight || 'normal',
      (v) => set('weight', v, true),
      'Peso de los caracteres',
    );
    ctl.fillch = segmented([...FILL_CHARS].map((c) => [c, c]), st().fillch || '@', (v) => set('fillch', v, true), 'Carácter de relleno');
    ctl.fillch.classList.add('monoseg');
    ctl.glow = slider({ min: 0, max: 2, step: 0.05, value: st().glow ?? 1, fmt: (v) => (v < 0.03 ? 'sin halo' : pct(v)), label: 'Halo alrededor de las letras', onInput: (v) => set('glow', v, true) });
    ctl.bright = slider({ min: 0.6, max: 1.5, step: 0.05, value: st().bright ?? 1, fmt: pct, label: 'Intensidad del color', onInput: (v) => set('bright', Math.abs(v - 1) < 0.03 ? 1 : v, true) });
    ctl.preset = segmented(
      ASCII_PRESETS.map(([id, label]) => [id, label]),
      asciiPresetOf(st()),
      (id) => {
        const v = asciiPresetValues(id);
        for (const k of ASCII_KEYS) st()[k] = v[k];
        this.syncFromProject();
        app.scene.setLive(st());
        app.projectChanged();
      },
      'Ajustes rápidos del ASCII',
    );
    const resetAscii = h('button', { class: 'btn ghost small', type: 'button', onclick: () => {
      const d = defaultStyle();
      for (const k of ASCII_KEYS) st()[k] = d[k];
      this.syncFromProject();
      app.scene.setLive(st());
      app.projectChanged();
      toast('Aspecto del ASCII restablecido.');
    } }, 'Restablecer aspecto');

    ctl.palette = h(
      'div',
      { class: 'chips' },
      Object.keys(PALETTES).map((k) =>
        h(
          'button',
          { type: 'button', class: 'chip pal' + (st().palette === k ? ' on' : ''), 'data-v': k, 'aria-pressed': st().palette === k ? 'true' : 'false', onclick: () => {
            ctl.palette.querySelectorAll('.chip').forEach((b) => {
              b.classList.toggle('on', b.dataset.v === k);
              b.setAttribute('aria-pressed', b.dataset.v === k ? 'true' : 'false');
            });
            set('palette', k);
          } },
          PALETTES[k] ? h('span', { class: 'sw' }, PALETTES[k].slice(0, 4).map((c) => h('i', { style: { background: HEX[c] } }))) : null,
          PALETTE_LABELS[k],
        ),
      ),
    );
    ctl.faces = chips(FACE_NAMES.map((f) => [f, FACE_LABELS[f]]), st().faces, (v) => set('faces', v), {
      min: 1,
      render: (v, text) => h('span', { style: { fontFamily: FACES[v].f + ', system-ui', fontWeight: FACES[v].w, fontStyle: FACES[v].i ? 'italic' : 'normal' } }, text),
    });
    ctl.fill = segmented(Object.entries(FILL_LABELS), st().fill, (v) => set('fill', v), 'Relleno de las letras');
    ctl.mood = h(
      'div',
      { class: 'chips' },
      [['auto', 'Automático (cambia por frase)'], ...MOOD_NAMES.map((m) => [m, MOOD_LABELS[m]])].map(([k, t]) =>
        h(
          'button',
          { type: 'button', class: 'chip' + (st().mood === k ? ' on' : ''), 'data-v': k, 'aria-pressed': st().mood === k ? 'true' : 'false', onclick: () => {
            ctl.mood.querySelectorAll('.chip').forEach((b) => {
              b.classList.toggle('on', b.dataset.v === k);
              b.setAttribute('aria-pressed', b.dataset.v === k ? 'true' : 'false');
            });
            set('mood', k);
          } },
          t,
        ),
      ),
    );
    this.offsetCtl = slider({
      min: -0.6,
      max: 0.6,
      step: 0.01,
      value: app.project.offset,
      fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2) + ' s',
      label: 'Ajuste fino de sincronía',
      hint: 'si las palabras salen antes o después',
      onInput: (v) => {
        app.project.offset = v;
        app.projectChanged();
      },
    });
    this.seedLab = h('span', { class: 'muted small' });
    const other = h('button', { class: 'btn', type: 'button', onclick: () => {
      app.project.seed = (app.project.seed | 0) + 1;
      this.paintSeed();
      app.projectChanged();
    } }, '🎲 Otra versión');
    this.reading = readingControls(app);
    this.versions = versionControls(app, () => other.click());
    const clean = h('button', { class: 'btn ghost', type: 'button', onclick: () => {
      if (!Object.keys(app.project.over).length) return toast('No hay cambios hechos a mano.');
      if (!confirm('¿Quitar los cambios que hiciste palabra por palabra?')) return;
      app.project.over = {};
      app.projectChanged();
      app.emit('editrestored');
      toast('Listo: todo vuelve a lo automático.');
    } }, 'Quitar cambios por palabra');
    const reset = h('button', { class: 'btn ghost', type: 'button', onclick: () => {
      app.project.style = defaultStyle();
      app.project.offset = -0.12;
      app.projectChanged();
      this.syncFromProject();
      toast('Estilo restablecido.');
    } }, 'Restablecer estilo');

    this.el = h(
      'div',
      { class: 'pane' },
      h('h2', {}, 'Laboratorio'),
      h('p', { class: 'muted small' }, 'Elige un ajuste rápido y afina lo que necesites. La vista conserva el instante pausado. Pulsa reproducir para comprobar el resultado con tu canción.'),
      this.versions.element,
      ...this.reading.elements,
      group('Qué se ve', field('Lo grande en pantalla', ctl.focus), ctl.ball, ctl.floor),
      group(
        'Aspecto del ASCII',
        field('Ajustes rápidos', ctl.preset, 'toca uno y luego afina'),
        ctl.thick,
        ctl.track,
        ctl.size,
        ctl.detail,
        field('Peso de los caracteres', ctl.weight),
        field('Carácter de relleno', ctl.fillch),
        ctl.glow,
        ctl.bright,
        h('p', { class: 'muted small' }, 'Grosor, espacio, tamaño y detalle reacomodan la letra. Para una sola palabra usa «Grosor» en Ajustar.'),
        h('div', { class: 'row wrap' }, resetAscii),
      ),
      group('Ritmo y graves', ctl.react, this.meter, this.stats),
      group('Efectos por palabra', ctl.fxAuto, field('Cuáles puede usar', ctl.fxSet), field('Mayúsculas', ctl.caps), ctl.holdMin, h('p', { class: 'muted small' }, 'Automático: las palabras sostenidas, las que se repiten mucho y las que llevan ¡! reciben efectos. Puedes cambiarlos por palabra en Ajustar.')),
      group('Colores y letras', field('Colores', ctl.palette), field('Tipografías que puede usar', ctl.faces), field('Relleno de las letras', ctl.fill), ctl.random),
      group('Fondo', field('Ambiente', ctl.mood)),
      group('Sincronía', this.offsetCtl),
      h('div', { class: 'row wrap' }, this.seedLab, clean, reset),
    );
    this.paintSeed();
    app.on('tick', () => this.tick());
    app.on('rebuilt', () => this.paintStats());
    app.on('clip', () => this.paintStats());
    app.on('media', () => this.paintStats());
    app.on('reset', () => this.syncFromProject());
    app.on('editrestored', () => this.syncFromProject());
    app.on('project', () => this.syncFromProject());
    this.paintStats();
  }

  syncFromProject() {
    this.reading.sync(); this.versions.sync();
    const st = this.app.project.style;
    const c = this.ctl;
    c.focus.set(st.focus);
    c.ball.set(st.ball);
    c.floor.set(st.floor);
    c.react.set(st.react);
    c.random.set(st.random);
    c.fxAuto.set(st.fxAuto);
    c.fxSet.set(st.fxSet);
    c.caps.set(st.caps);
    c.holdMin.set(st.holdMin ?? 0.6);
    c.fill.set(st.fill);
    c.thick.set(st.thick ?? 0);
    c.track.set(st.track ?? 0);
    c.size.set(st.size ?? 1);
    c.detail.set(st.detail ?? 1);
    c.weight.set(st.weight || 'normal');
    c.fillch.set(st.fillch || '@');
    c.glow.set(st.glow ?? 1);
    c.bright.set(st.bright ?? 1);
    this.paintPreset();
    c.faces.set(st.faces);
    c.palette.querySelectorAll('.chip').forEach((b) => { b.classList.toggle('on', b.dataset.v === st.palette); b.setAttribute('aria-pressed', String(b.dataset.v === st.palette)); });
    c.mood.querySelectorAll('.chip').forEach((b) => { b.classList.toggle('on', b.dataset.v === st.mood); b.setAttribute('aria-pressed', String(b.dataset.v === st.mood)); });
    this.offsetCtl.set(this.app.project.offset);
    this.paintSeed();
  }

  paintPreset() {
    this.ctl.preset.set(asciiPresetOf(this.app.project.style));
  }

  paintSeed() {
    this.seedLab.textContent = 'versión ' + ((this.app.project.seed | 0) + 1);
  }

  paintStats() {
    const e = this.app.media ? this.app.media.energy : null;
    if (!e) {
      this.stats.textContent = 'Con una canción real, aquí verás sus golpes de graves. Ahora se usa un ritmo de ejemplo.';
      return;
    }
    const c = this.app.clip();
    const a = Math.floor(c.start * e.fps);
    const b = Math.min(e.hit.length, Math.ceil(c.end * e.fps));
    const hits = [];
    for (let i = a; i < b; i++) if (e.hit[i]) hits.push(i / e.fps);
    let txt = `${hits.length} golpes de graves en este tramo`;
    if (hits.length > 6) {
      const d = [];
      for (let i = 1; i < hits.length; i++) d.push(hits[i] - hits[i - 1]);
      d.sort((x, y) => x - y);
      const med = d[Math.floor(d.length / 2)];
      let bpm = 60 / med;
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      txt += ` · ritmo aproximado ${Math.round(bpm)} por minuto`;
    }
    this.stats.textContent = txt;
  }

  tick() {
    if (this.app.tab !== 'style') return;
    const E = this.app.scene.E;
    const v = E ? Math.min(1, Math.max(E.low, E.pulse)) : 0;
    this.meter.firstChild.style.width = Math.round(v * 100) + '%';
  }
}
