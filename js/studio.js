import { buildNavigation } from './studio/navigation.js';
import { Lifecycle } from './lifecycle.js';
import { Autosave } from './storage/autosave.js';
import { getPreference as lsGet, setPreference as lsSet } from './storage/preferences.js';
import * as Theater from './studio/theater.js';
import * as Projects from './studio/projects.js';
// Estudio: la aplicación completa (escenario, transporte, pestañas, guardado y proyectos).
import { Scene } from './scene.js';
import { Player } from './player.js';
import { newProject, modelOf, syncedCount, fmtTimeMs, phrasesOf } from './project.js';
import { SAMPLE_TEXT, sampleSync, autoSync, fakeEnergy } from './synth.js';
import { wavOf, blobUrl } from './audio.js';
import * as store from './store.js';
import { h, debounce, toast } from './ui.js';
import { SongPanel } from './panel-song.js';
import { TextPanel } from './panel-text.js';
import { MarkPanel } from './panel-mark.js';
import { StylePanel } from './panel-style.js';
import { WordsPanel } from './panel-words.js';
import { ExportPanel } from './panel-export.js';

const TABS = [
  ['song', '1', 'Canción', SongPanel],
  ['text', '2', 'Letra', TextPanel],
  ['mark', '3', 'Marcar', MarkPanel],
  ['style', '4', 'Estilo', StylePanel],
  ['words', '5', 'Palabras', WordsPanel],
  ['export', '6', 'Exportar', ExportPanel],
];
const FORMATS = { wide: ['16 / 9', 16 / 9, 'Horizontal'], tall: ['9 / 16', 9 / 16, 'Vertical'], square: ['1 / 1', 1, 'Cuadrada'] };

const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export class App {
  constructor(root, audio, audioFull) {
    this.scope = new Lifecycle();
    this.root = root;
    this.audio = audio;
    this.audioFull = audioFull;
    this.id = uid();
    this.project = newProject();
    this.media = null;
    this.file = null;
    this.listeners = {};
    this.clipUrl = null;
    this.fullUrl = null;
    this.tab = 'song';
    this.format = lsGet('format', 'wide');
    if (!FORMATS[this.format]) this.format = 'wide';
    this.kind = 'demo'; // qué muestra el escenario: 'demo' (tutorial), 'mine' (tu letra, tiempos automáticos), 'blank' (marcando) o 'real'
    this.prevChoice = lsGet('prevmode', '') === 'demo' ? 'demo' : null;
    this.hadText = false;
    this.demoHold = false;
    this.needRebuild = false; // el escenario estaba oculto (p. ej. «Marcar» en el teléfono) y quedó algo por rehacer
    this.build();
    this.scene = new Scene(this.canvas);
    this.scene.overlays = false;
    this.scene.deferHidden = true; // con el escenario oculto no se rehace nada: se arregla solo al volver a verse
    this.player = new Player(this.scene, audio, this.canvas, 'studio');
    this.player.onState = () => this.paintTransport();
    this.player.onEnd = () => this.paintTransport();
    this.persistence = new Autosave(store.putProject, (state, id) => {
      if (id !== this.id) return;
      this.savedEl.textContent = state === 'saved' ? 'Guardado en este navegador' : state === 'pending' ? 'Guardando…' : 'No se pudo guardar; conserva esta pestaña abierta';
      this.savedEl.dataset.state = state;
      this.saveAlert.hidden = state !== 'error';
      if (state === 'saved') lsSet('last', id);
    });
    this.saveSoon = () => this.persistence.schedule(this.id, this.project);
    this.rebuildSoon = debounce(() => this.rebuild(), 140);
    this.canvas.addEventListener('pointerdown', (e) => this.scene.poke(e.clientX, e.clientY, 'tap'));
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.buttons) this.scene.poke(e.clientX, e.clientY, 'move');
    });
    let rt = 0;
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        clearTimeout(rt);
        rt = setTimeout(() => !this.destroyed && this.scene.resize(), 160);
      });
      this.scope.observe(ro, this.stage);
      this.scope.observe(ro, this.thost); // girar el teléfono o cambiar a pantalla completa vuelve a acomodar las letras
    }
    // pantalla completa: tocar o mover el ratón muestra los controles; salir de la pantalla completa del navegador cierra la vista
    this.theaterOn = false;
    this.fsAsked = false;
    this.thost.addEventListener('pointerdown', () => this.pokeBar());
    this.thost.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && this.pokeBar());
    this.theater.addEventListener('focusin', () => this.pokeBar());
    const onFs = () => {
      if (this.theaterOn && this.fsAsked && !(document.fullscreenElement || document.webkitFullscreenElement)) this.closeTheater();
    };
    this.scope.listen(document, 'fullscreenchange', onFs);
    this.scope.listen(document, 'webkitfullscreenchange', onFs);
    this.scope.listen(window, 'popstate', () => this.theaterOn && this.closeTheater({ fromPop: true }));
    this.scope.listen(window, 'keydown', (e) => this.onKey(e));
    this.ticker = setInterval(() => this.emit('tick', this.player.t), 90);
    this.scope.listen(document, 'visibilitychange', () => { if (document.hidden) void this.persistence.flush(); });
    this.scope.listen(window, 'pagehide', () => void this.persistence.flush());
    this.on('tick', () => this.paintTime());
    this.panels = {};
    this.navigation = buildNavigation(this);
    this.root.querySelector('.right').append(this.navigation.footer);
    this.selectTab('song');
    const fitViewport = () => { this.root.style.setProperty('--app-height', `${window.visualViewport?.height || window.innerHeight}px`); };
    if (window.visualViewport) this.scope.listen(window.visualViewport, 'resize', fitViewport);
    fitViewport();
    this.rebuild();
    this.refreshAudio();
  }

  // ───────────── eventos ─────────────
  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
    return () => { this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn); };
  }
  emit(ev, a, b) {
    (this.listeners[ev] || []).forEach((f) => f(a, b));
  }

  // ───────────── estructura ─────────────
  build() {
    const root = this.root;
    root.className = 'studio';
    document.documentElement.classList.add('studio-page');
    root.dataset.tab = 'song';
    this.canvas = h('canvas', { id: 'c', role: 'img', 'aria-label': 'Vista previa artística de la letra' });
    this.tagTxt = h('span', { class: 'tagtxt' }, 'Así se verá tu canción');
    this.tagBtns = {
      demo: h('button', { type: 'button', onclick: () => this.setPreview('demo') }, 'Ejemplo'),
      mine: h('button', { type: 'button', onclick: () => this.setPreview('mine') }, 'Mi letra'),
    };
    this.tagSeg = h('div', { class: 'tagseg', role: 'group', 'aria-label': 'Qué vista previa ver' }, this.tagBtns.demo, this.tagBtns.mine);
    this.tag = h('div', { class: 'stagetag' }, this.tagTxt, this.tagSeg);
    this.stageCd = h('div', { class: 'stagecd', hidden: true, 'aria-hidden': 'true' });
    // pantalla completa: el mismo escenario, a todo lo que da la pantalla (así se ve el HTML ya exportado)
    this.fsBtn = h('button', { class: 'stagefs', type: 'button', 'aria-label': 'Ver en pantalla completa', title: 'Pantalla completa (tecla F)', onclick: () => this.openTheater() }, h('span', { class: 'fsic', 'aria-hidden': 'true' }), h('span', { class: 'fslab', 'aria-hidden': 'true' }, 'Ver en grande'));
    this.stage = h('div', { class: 'stage', id: 'stage' }, this.canvas, this.tag, this.stageCd, this.fsBtn);
    this.playBtn = h('button', { class: 'tbtn play', type: 'button', 'aria-label': 'Reproducir', onclick: () => this.togglePlay() }, '▶');
    this.restartBtn = h('button', { class: 'tbtn restart', type: 'button', 'aria-label': 'Volver al inicio del tramo', onclick: () => this.restart() }, 'Inicio');
    this.timeEl = h('span', { class: 'time' }, '0:00.0 / 0:30.0');
    this.scrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'scrub', 'aria-label': 'Posición en el tramo' });
    this.tScrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'tscrub', 'aria-label': 'Posición en el tramo' });
    for (const el of [this.scrub, this.tScrub]) {
      el.addEventListener('input', () => {
        this.scrubbing = true;
        this.demoHold = true; // quien mueve la barra quiere ver ese instante quieto
        this.syncDemo();
        this.player.seek((+el.value / 1000) * this.player.dur);
        this.paintTime();
      });
      el.addEventListener('change', () => (this.scrubbing = false));
    }
    this.loopBtn = h('button', { class: 'tbtn', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Repetir el tramo', onclick: () => this.setLoop(!this.player.loopClip) }, '↻');
    this.rateSel = h('select', { class: 'rate', 'aria-label': 'Velocidad' }, [['1', '1×'], ['0.75', '0.75×'], ['0.5', '0.5×']].map(([v, t]) => h('option', { value: v }, t)));
    this.rateSel.addEventListener('change', () => this.player.setRate(+this.rateSel.value));
    const fmtSel = h('select', { class: 'rate', 'aria-label': 'Forma de la pantalla' }, Object.entries(FORMATS).map(([k, v]) => h('option', { value: k }, v[2])));
    fmtSel.value = this.format;
    fmtSel.addEventListener('change', () => {
      this.format = fmtSel.value;
      lsSet('format', this.format);
      this.applyFormat();
    });
    this.moreBtn = h('button', { class: 'tbtn moreBtn', type: 'button', 'aria-label': 'Más controles', 'aria-expanded': 'false', onclick: () => this.toggleMore() }, '⋯');
    this.transport = h(
      'div',
      { class: 'transport' },
      h('div', { class: 'trow main' }, this.playBtn, this.restartBtn, this.timeEl, this.scrub, this.moreBtn),
      h('div', { class: 'trow extra' }, this.loopBtn, this.rateSel, fmtSel),
    );
    this.savedEl = h('span', { class: 'saved', role: 'status' }, '');
    this.saveAlert = h('div', { class: 'save-alert', role: 'alert', hidden: true }, 'No se pudo guardar. Conserva esta pestaña abierta y libera espacio antes de cambiar de proyecto.');
    this.nameEl = h('input', { class: 'pname', type: 'text', placeholder: 'Nombre del proyecto', 'aria-label': 'Nombre del proyecto', maxlength: 60 });
    this.nameEl.addEventListener('input', () => {
      this.project.name = this.nameEl.value;
      this.saveSoon();
    });
    this.projBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => this.openProjects() }, 'Mis proyectos');
    this.newBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => this.newAndReset() }, 'Nuevo');
    const top = h('header', { class: 'top' }, h('div', { class: 'brand' }, h('span', { class: 'mark' }, '▚'), h('span', { class: 'txt' }, 'Letras en ASCII')), this.nameEl, this.projBtn, this.newBtn, this.savedEl);
    this.tabsEl = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Pasos' });
    this.tabBtns = {};
    for (const [id, n, label] of TABS) {
      const b = h('button', { class: 'tab', role: 'tab', type: 'button', id: 'tab-' + id, onclick: () => this.selectTab(id) }, h('i', {}, n), label);
      this.tabBtns[id] = b;
      this.tabsEl.append(b);
    }
    this.panelEl = h('div', { class: 'panel' });
    this.loadText = h('div', { class: 'ltxt' });
    this.loadProgress = h('i');
    this.loadCancel = h('button', { class: 'btn', type: 'button', onclick: () => this.cancelLoad() }, 'Cancelar carga');
    this.status = h('div', { class: 'loading hidden', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Procesando canción', tabindex: '-1' }, h('div', { class: 'lbox' }, this.loadText, h('div', { class: 'lbar' }, this.loadProgress), this.loadCancel));
    this.scope.listen(this.status, 'keydown', (event) => {
      if (event.key === 'Tab') { event.preventDefault(); (this.loadCancel.hidden ? this.status : this.loadCancel).focus(); }
      if (event.key === 'Escape' && !this.loadCancel.hidden) { event.preventDefault(); event.stopPropagation(); this.cancelLoad(); }
    });
    const left = h('section', { class: 'left' }, h('div', { class: 'stagewrap' }, this.stage), this.transport);
    const right = h('aside', { class: 'right' }, this.tabsEl, this.panelEl);
    this.top = top;
    this.grid = h('main', { class: 'grid' }, left, right);

    // vista a pantalla completa (se llena al abrirla: el escenario se muda aquí y vuelve al cerrar)
    this.thost = h('div', { class: 'thost' });
    this.tPlay = h('button', { class: 'tbtn tplay', type: 'button', 'aria-label': 'Reproducir', onclick: () => this.togglePlay() }, '▶');
    this.tTime = h('span', { class: 'ttime' }, '0:00.0 / 0:30.0');
    this.tClose = h('button', { class: 'tbtn tclose', type: 'button', 'aria-label': 'Cerrar pantalla completa', title: 'Cerrar (Esc)', onclick: () => this.closeTheater() }, h('span', { class: 'xic', 'aria-hidden': 'true' }));
    this.tBar = h('div', { class: 'tbar' }, this.tPlay, this.tTime, this.tScrub);
    this.theater = h('div', { class: 'theater', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Vista previa en pantalla completa', tabindex: '-1' }, this.thost, this.tBar, this.tClose);
    root.replaceChildren(top, this.saveAlert, this.grid, this.theater, this.status);
    this.applyFormat();
  }

  // ───────────── pantalla completa ─────────────
  // El escenario se muda a una capa que cubre toda la pantalla (y, si el navegador deja, se pide la
  // pantalla completa de verdad para esconder sus barras). Vuelve a su lugar al cerrar.
  openTheater(...args) { return Theater.openTheater(this, ...args); }
  closeTheater(...args) { return Theater.closeTheater(this, ...args); }
  pokeBar(...args) { return Theater.pokeBar(this, ...args); }
  applyFormat() {
    const f = FORMATS[this.format] || FORMATS.wide;
    this.stage.style.setProperty('--ar', f[0]);
    this.stage.style.setProperty('--arn', f[1]);
    this.stage.dataset.fmt = this.format;
    this.root.dataset.fmt = this.format;
    // la caja del escenario ya cambió de forma: la rejilla se acomoda a la caja nueva enseguida (no 160 ms después, estirada)
    if (this.scene) requestAnimationFrame(() => this.scene && this.scene.resize());
  }

  selectTab(id) {
    if (this.destroyed) return;
    if (this.tab !== id) toast(null);
    this.previousTab = this.tab;
    this.tab = id;
    this.root.dataset.tab = id;
    // si en la pestaña anterior el escenario estaba oculto y quedaron cambios sin dibujar, ahora que se ve se ponen al día
    if (this.needRebuild && this.scene && !this.stageHidden()) this.rebuild();
    for (const [k, b] of Object.entries(this.tabBtns)) {
      b.classList.toggle('on', k === id);
      b.setAttribute('aria-selected', k === id ? 'true' : 'false');
      b.tabIndex = k === id ? 0 : -1;
      b.setAttribute('aria-controls', 'panel-' + k);
    }
    // si la barra de pestañas se desplaza (pantalla angosta), deja a la vista la elegida. Sin scrollIntoView:
    // eso movía también la página y el panel.
    const on = this.tabBtns[id];
    const bar = this.tabsEl;
    if (on && bar.scrollWidth > bar.clientWidth + 2) bar.scrollLeft = Math.max(0, on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2);
    if (!this.panels[id]) {
      const Cls = TABS.find((t) => t[0] === id)[3];
      this.panels[id] = new Cls(this);
      this.panels[id].el.hidden = true;
      this.panels[id].el.id = 'panel-' + id;
      this.panels[id].el.setAttribute('role', 'tabpanel');
      this.panels[id].el.setAttribute('aria-labelledby', 'tab-' + id);
      this.panelEl.append(this.panels[id].el);
    }
    for (const [k, p] of Object.entries(this.panels)) p.el.hidden = k !== id;
    this.panelEl.classList.toggle('fit', id === 'mark');
    this.panelEl.scrollTop = 0;
    if (this.panels[id].show) this.panels[id].show();
    if (this.scene && this.previewKind() !== this.kind) this.rebuildSoon();
    this.syncDemo();
    this.emit('tab', id);
  }

  restart() {
    this.player.seek(0);
    this.demoHold = false;
    if (this.player.demo) this.player.demoT0 = performance.now() / 1000;
    this.syncDemo();
  }

  toggleMore(force) {
    const open = force ?? !this.transport.classList.contains('open');
    this.transport.classList.toggle('open', open);
    this.moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.moreBtn.classList.toggle('on', open);
  }

  // número grande sobre el escenario (cuenta regresiva); null lo quita
  showCount(txt) {
    const el = this.stageCd;
    if (txt == null) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    el.hidden = false;
    el.replaceChildren(h('b', {}, txt));
  }

  onKey(e) {
    const tg = e.target;
    const typing = tg && tg.closest && tg.closest('textarea, input:not([type=range]), select, [contenteditable]');
    // pantalla completa: Esc la cierra, la barra espaciadora reproduce/pausa
    if (this.theaterOn) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.closeTheater();
      } else if ((e.code === 'Space' || e.code === 'KeyK') && !e.repeat && !typing && !(tg && tg.closest && tg.closest('button, a'))) {
        e.preventDefault();
        this.togglePlay();
        this.pokeBar();
      } else if (e.code === 'KeyF' && !e.repeat && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.closeTheater();
      } else if (e.code.startsWith('Arrow') || e.code === 'Tab') this.pokeBar();
      return;
    }
    // F abre la pantalla completa (no mientras se escribe ni se marca)
    if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && this.tab !== 'mark') {
      e.preventDefault();
      this.openTheater();
      return;
    }
    if (e.code !== 'Space' || e.repeat) return;
    if (tg && tg.closest && tg.closest('textarea, input:not([type=range]), select, button, a, [contenteditable]')) return;
    if (this.tab === 'mark') return; // en "Marcar" la barra espaciadora es el botón de marcar
    e.preventDefault();
    this.togglePlay();
  }

  // ───────────── reproducción ─────────────
  togglePlay() {
    const p = this.player;
    if (this.audioFull && !this.audioFull.paused) this.audioFull.pause();
    if (p.state === 'playing') {
      p.pause();
      if (this.theaterOn) {
        // en pantalla completa, pausar es congelar la imagen
        this.demoHold = true;
        this.syncDemo();
      }
    } else if (p.t >= p.dur - 0.05) p.start(0);
    else p.resume();
  }
  setLoop(v) {
    this.player.loopClip = v;
    this.loopBtn.classList.toggle('on', v);
    this.loopBtn.setAttribute('aria-pressed', v ? 'true' : 'false');
  }
  paintPlayIcons() {
    const playing = this.player.state === 'playing';
    for (const b of [this.playBtn, this.tPlay]) {
      b.replaceChildren(playing ? h('span', { class: 'pauseic' }, h('i'), h('i')) : '▶');
      b.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    }
    return playing;
  }
  paintTransport() {
    if (this.paintPlayIcons()) this.demoHold = false;
    this.syncDemo();
    // el segundo dato dice si el reproductor se detuvo porque llegó al final del tramo
    this.emit('state', this.player.state, this.player.justEnded);
    if (this.theaterOn && this.player.state === 'playing') this.pokeBar();
  }
  paintTime() {
    const p = this.player;
    const t = p.t;
    const txt = `${fmtTimeMs(t)} / ${fmtTimeMs(p.dur)}`;
    this.timeEl.textContent = txt;
    const v = p.dur ? Math.round((t / p.dur) * 1000) : 0;
    if (!this.scrubbing && document.activeElement !== this.scrub) this.scrub.value = v;
    if (this.theaterOn) {
      this.tTime.textContent = txt;
      if (!this.scrubbing && document.activeElement !== this.tScrub) this.tScrub.value = v;
    }
  }

  // ───────────── tramo ─────────────
  clip() {
    const p = this.project;
    const m = this.media;
    if (!m) return { start: 0, end: 30 };
    let { start, end } = p.clip;
    if (!(end > start)) {
      start = 0;
      end = Math.min(m.dur, 60);
    }
    start = Math.max(0, Math.min(start, m.dur - 1));
    end = Math.max(start + 1, Math.min(end, m.dur));
    return { start, end };
  }

  async setClip(start, end, { final = true } = {}) {
    const m = this.media;
    if (!m) return;
    start = Math.max(0, Math.min(start, m.dur - 1));
    end = Math.max(start + 1, Math.min(end, m.dur));
    this.project.clip = { start: +start.toFixed(2), end: +end.toFixed(2) };
    this.emit('clip', this.clip());
    if (final) {
      this.rebuildSoon();
      this.refreshAudioSoon();
      this.saveSoon();
    }
  }

  // ───────────── modelo → escena ─────────────
  usingSample() {
    return syncedCount(this.project).done === 0;
  }

  // qué enseña el escenario:
  //  'real'  tus frases ya marcadas
  //  'blank' estás marcando y todavía no hay ninguna: solo el fondo (lo que marques aparece al instante)
  //  'demo'  tutorial de ejemplo («así es como se va a ver»)
  //  'mine'  tu letra con tiempos automáticos (aproximados), antes de marcarla
  previewKind() {
    if (!this.usingSample()) return 'real';
    if (this.tab === 'mark') return 'blank';
    if (!phrasesOf(this.project.text).length) return 'demo';
    return this.prevChoice || 'mine';
  }

  setPreview(k) {
    this.prevChoice = k === 'demo' ? 'demo' : null;
    lsSet('prevmode', k === 'demo' ? 'demo' : '');
    this.demoHold = false;
    this.rebuild();
  }

  // ¿el escenario no se ve ahora mismo? (en «Marcar» del teléfono se esconde para dejar todo el espacio al marcado)
  stageHidden() {
    return !this.theaterOn && !this.canvas.offsetParent;
  }

  rebuild() {
    // con el escenario oculto no tiene caso rehacer la escena (es lo más pesado y justo ahí se está marcando con el dedo):
    // se deja anotado y se hace en cuanto vuelva a verse
    if (this.stageHidden()) {
      this.needRebuild = true;
      return;
    }
    this.needRebuild = false;
    const clip = this.clip();
    const p = this.project;
    const hasText = phrasesOf(p.text).length > 0;
    // la primera vez que aparece letra, se enseña tu letra (si antes habías elegido «Ejemplo», vuelve a ofrecerse lo tuyo)
    if (hasText && !this.hadText && this.prevChoice === 'demo') {
      this.prevChoice = null;
      lsSet('prevmode', '');
    }
    this.hadText = hasText;
    const kind = this.previewKind();
    this.kind = kind;
    let model;
    if (kind === 'demo') model = modelOf({ ...p, text: SAMPLE_TEXT, sync: sampleSync(clip.start), over: {} }, clip);
    else if (kind === 'mine') model = modelOf({ ...p, sync: autoSync(p.text, clip.start) }, clip);
    else if (kind === 'blank') model = modelOf({ ...p, sync: [] }, clip);
    else model = modelOf(p, clip);
    this.scene.setData(model);
    this.paintTag();
    this.syncDemo();
    this.emit('rebuilt');
  }

  paintTag() {
    const k = this.kind;
    const show = k === 'demo' || k === 'mine';
    this.tag.hidden = !show;
    if (!show) return;
    const hasText = phrasesOf(this.project.text).length > 0;
    this.tagTxt.textContent = k === 'demo' ? 'Ejemplo animado · sin audio' : 'Tu letra · tiempos de ejemplo';
    for (const [id, b] of Object.entries(this.tagBtns)) {
      b.classList.toggle('on', id === k);
      b.setAttribute('aria-pressed', id === k ? 'true' : 'false');
    }
    this.tagBtns.mine.disabled = !hasText;
    this.tagBtns.mine.title = hasText ? '' : 'Escribe tu letra en el paso 2 para verla aquí';
  }

  // vitrina: mientras no suena nada, el escenario se mueve solo (con un bombo de mentiras); al darle ▶ manda la canción
  syncDemo() {
    if (!this.player || !this.scene) return;
    const k = this.kind;
    // con tu canción ya marcada, en «Estilo» el escenario repite el arranque sin sonido (con los graves reales)
    // para que veas cada cambio al mover un control; con ▶ suena de verdad
    // (lo mismo en la pantalla completa: se ve vivo desde que se abre, hasta que le des ▶)
    const peek = false; // Paused means paused; styling never advances the real song silently.
    const want = (k === 'demo' || k === 'mine' || k === 'blank' || peek) && this.player.state === 'paused' && !this.demoHold && !REDUCED;
    const tl = this.scene.tl;
    let len = tl && tl.lines.length ? Math.min(Math.max(this.player.dur || 30, 6), tl.lastHide + 1.6) : 8;
    let from = 0;
    if (peek && tl && tl.lines.length) {
      from = Math.max(0, tl.first - 1.0);
      len = Math.max(4, Math.min(tl.lastHide + 1.6, from + 16) - from);
    }
    const changed = want !== this.player.demo;
    this.player.setDemo(want, len, from);
    if (changed) this.refreshEnergy();
  }

  refreshEnergy() {
    const clip = this.clip();
    if (this.media && (!this.player.demo || this.kind === 'real')) this.scene.setEnergy(this.media.energy, clip.start);
    else this.scene.setEnergy(fakeEnergy(clip.end - clip.start + 2), 0);
  }
  refreshAudio() {
    const clip = this.clip();
    const dur = clip.end - clip.start;
    this.refreshEnergy();
    const was = this.player.state === 'playing';
    if (this.media) {
      const ab = wavOf(this.media, clip.start, clip.end, { mono: dur > 90 });
      const url = blobUrl(ab);
      this.player.setSource(url, dur);
      if (this.clipUrl) URL.revokeObjectURL(this.clipUrl);
      this.clipUrl = url;
    } else this.player.setSource(null, dur);
    this.player.setRate(+this.rateSel.value);
    this.paintTransport();
    this.paintTime();
    if (was) this.emit('interrupted');
  }
  refreshAudioSoon = debounce(() => this.refreshAudio(), 260);

  refreshFull() {
    if (this.fullUrl) URL.revokeObjectURL(this.fullUrl);
    this.fullUrl = null;
    if (!this.media) {
      this.audioFull.removeAttribute('src');
      return;
    }
    this.fullUrl = URL.createObjectURL(this.file);
    this.audioFull.src = this.fullUrl;
    this.audioFull.load();
  }

  // ───────────── archivos y proyectos ─────────────
  busy(msg, frac) {
    if (!msg) {
      this.status.classList.add('hidden');
      if (this.loadingFocus) {
        [this.top.inert, this.grid.inert] = this.loadingInert;
        if (this.loadingFocus.isConnected) this.loadingFocus.focus({ preventScroll: true });
        this.loadingFocus = null;
      }
      return;
    }
    const opening = this.status.classList.contains('hidden');
    if (opening) {
      this.loadingFocus = document.activeElement || this.projBtn;
      this.loadingInert = [this.top.inert, this.grid.inert];
      this.top.inert = this.grid.inert = true;
    }
    this.status.classList.remove('hidden');
    this.loadText.textContent = msg;
    this.loadProgress.style.width = `${Math.round((frac || 0) * 100)}%`;
    this.loadCancel.hidden = !this.loadController || frac >= .99;
    if (opening || document.activeElement === this.loadCancel && this.loadCancel.hidden) (this.loadCancel.hidden ? this.status : this.loadCancel).focus({ preventScroll: true });
  }

  cancelLoad() { this.loadController?.abort(); this.loadController = null; this.busy(null); }

  loadFile(...args) { return Projects.loadFile(this, ...args); }
  save(...args) { return Projects.save(this, ...args); }
  projectChanged(...args) { return Projects.projectChanged(this, ...args); }
  restoreLast(...args) { return Projects.restoreLast(this, ...args); }
  openProject(...args) { return Projects.openProject(this, ...args); }
  newAndReset(...args) { return Projects.newAndReset(this, ...args); }
  openProjects(...args) { return Projects.openProjects(this, ...args); }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelLoad();
    for (const panel of Object.values(this.panels)) panel.destroy?.();
    await this.persistence.flush();
    this.scope.destroy();
    clearInterval(this.ticker); clearTimeout(this.barT);
    this.rebuildSoon.cancel(); this.refreshAudioSoon.cancel();
    this.player.destroy(); this.audioFull.pause(); this.audioFull.removeAttribute('src'); this.audioFull.load();
    if (this.clipUrl) URL.revokeObjectURL(this.clipUrl);
    if (this.fullUrl) URL.revokeObjectURL(this.fullUrl);
    this.listeners = {}; this.closeProjects?.(); this.root.replaceChildren();
    document.documentElement.classList.remove('studio-page');
  }

}
