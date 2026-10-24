// Paso 5: palabra por palabra. Elige una palabra, ajusta CUÁNDO suena (tira de tiempo, botones, teclado o «Aquí»)
// y cámbiale lo que quieras: animación, tipografía, color, tamaño, grosor, estiramiento y efectos (o déjala en automático).
import { h, toast, slider, segmented, chips, select, toggle } from './ui.js';
import { phrasesOf, fmtTimeMs, FACE_LABELS, COLOR_NAMES, COLOR_LABELS, APPEAR_LABELS, HOLD_LABELS, EXIT_LABELS, MOOD_LABELS, WORDFX_LABELS } from './project.js';
import { WORD_FX } from './director.js';
import { canStretch, HELD_MIN } from './timeline.js';
import { TimeStrip } from './strip.js';

const HEX = { white: '#ffffff', cream: '#ffecde', blush: '#ffc4c4', rose: '#ff7096', pink: '#ff4fd8', ruby: '#e0245e', orange: '#ff8a3d', amber: '#ffb26c', gold: '#ffd75e', mint: '#7dffc4', cyan: '#4fe3ff', ice: '#cfeeff', violet: '#9a7bff', lav: '#c3b4ee' };
const PALKEY = { edge: 5, self: 4, classic: 0 };
const PALBACK = { 5: 'edge', 4: 'self', 0: 'classic' };
const GAP = 0.06; // separación mínima entre palabras (igual que el motor)
const r3 = (x) => Math.round(x * 1000) / 1000;

const lsGet = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch (e) {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (e) {}
};

// botón que repite mientras se mantiene presionado (ajustes finos con el dedo o el mouse)
function holdRepeat(btn, fn) {
  let t1 = 0;
  let t2 = 0;
  const stop = () => {
    clearTimeout(t1);
    clearInterval(t2);
    t1 = t2 = 0;
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button > 0) return;
    e.preventDefault();
    stop();
    fn();
    t1 = setTimeout(() => {
      t2 = setInterval(() => {
        if (!btn.isConnected) return stop();
        fn();
      }, 85);
    }, 380);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // teclado: una vez por pulsación
  btn.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      fn();
    }
  });
  return btn;
}

export class WordsPanel {
  constructor(app) {
    this.app = app;
    this.sel = null; // { src, k }
    this.follow = true;
    this.hereAt = null;
    this.playOn = lsGet('wordplay', '1') !== '0';
    this._needFit = false;
    this._stale = false;
    this._pickedNew = false;
    this._warnAt = 0;
    this._chipsKey = '';
    this._chips = [];
    this._listKey = '';
    this._lrows = [];
    this._raf = 0;

    this.empty = h(
      'div',
      { class: 'wempty' },
      h('p', { class: 'muted' }, 'Aquí cambias palabra por palabra cuándo suena y cómo se ve: la animación, la tipografía, el color, el tamaño, el grosor, si se estira y efectos como brillo o explosión. Primero marca tu letra en el paso 3.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => app.selectTab('mark') }, 'Ir a marcar la letra'),
    );

    // frase
    this.prevPh = h('button', { class: 'btn small ghost navb', type: 'button', 'aria-label': 'Frase anterior', onclick: () => this.gotoPhrase(-1) }, '◀');
    this.nextPh = h('button', { class: 'btn small ghost navb', type: 'button', 'aria-label': 'Frase siguiente', onclick: () => this.gotoPhrase(1) }, '▶');
    this.phTitle = h('b', { class: 'phn' });
    this.phText = h('span', { class: 'pht muted' });
    this.nav = h('div', { class: 'phnav' }, this.prevPh, h('div', { class: 'phmid', role: 'status', 'aria-live': 'polite' }, this.phTitle, this.phText), this.nextPh);

    // tira
    this.strip = new TimeStrip({
      onPick: (src, k) => this.pick(src, k),
      onTap: (src, k) => this.tapWord(src, k),
      onMove: (src, k, on, final) => final && this.setStartClip(src, k, on),
      onSize: (src, k, len, final) => final && this.setLen(src, k, len),
      onSeek: (t) => {
        this.follow = false;
        this.syncFollowBtn();
        app.audioFull.pause();
        app.player.seek(t);
        this.strip.setPlayhead(t);
        app.paintTime();
      },
      onView: () => {
        this.follow = false;
        this.syncFollowBtn();
      },
      limits: (src, k) => this.limitsClip(src, k),
      holdMin: () => this.holdMin(),
    });
    const zb = (label, aria, fn) => h('button', { class: 'btn small ghost zb', type: 'button', 'aria-label': aria, title: aria, onclick: fn }, label);
    this.followBtn = h('button', { class: 'btn small ghost zb on', type: 'button', 'aria-pressed': 'true', title: 'Que la tira siga a la canción mientras suena', onclick: () => this.setFollow(!this.follow) }, 'Seguir');
    this.zoomRow = h(
      'div',
      { class: 'zoomrow' },
      zb('−', 'Alejar la tira', () => this.strip.zoom(1.4)),
      zb('+', 'Acercar la tira', () => this.strip.zoom(0.7)),
      zb('Frase', 'Ver la frase completa', () => this.fitPhrase()),
      zb('Palabra', 'Acercar a la palabra elegida', () => this.fitWord()),
      this.followBtn,
    );

    // palabras de la frase
    this.chipsRow = h('div', { class: 'wchips big', role: 'group', 'aria-label': 'Palabras de la frase' });

    // tiempos (se arma una sola vez; después solo se actualizan los textos)
    const nb = (label, aria, fn) => holdRepeat(h('button', { class: 'btn small nb', type: 'button', 'aria-label': aria, title: aria }, label), fn);
    this.tInfo = h('span', { class: 'tinfo' });
    this.dInfo = h('span', { class: 'tinfo' });
    this.longSeg = segmented(
      [
        ['0', 'Corta'],
        ['1', 'Larga (se estira)'],
      ],
      '0',
      (v) => this.setLong(v === '1'),
      'Tipo de palabra',
    );
    const startRow = h(
      'div',
      { class: 'trow2' },
      h('div', { class: 'tl' }, h('b', {}, 'Empieza'), this.tInfo),
      h('div', { class: 'tbs' }, nb('◀◀ 0.1', 'Mover 0.1 segundos antes', () => this.nudge(-0.1)), nb('◀ 0.02', 'Mover 0.02 segundos antes', () => this.nudge(-0.02)), nb('0.02 ▶', 'Mover 0.02 segundos después', () => this.nudge(0.02)), nb('0.1 ▶▶', 'Mover 0.1 segundos después', () => this.nudge(0.1))),
    );
    const durRow = h(
      'div',
      { class: 'trow2' },
      h('div', { class: 'tl' }, h('b', {}, 'Dura'), this.dInfo),
      h('div', { class: 'tbs' }, nb('− 0.25', 'Acortar 0.25 segundos', () => this.nudgeLen(-0.25)), nb('− 0.05', 'Acortar 0.05 segundos', () => this.nudgeLen(-0.05)), nb('+ 0.05', 'Alargar 0.05 segundos', () => this.nudgeLen(0.05)), nb('+ 0.25', 'Alargar 0.25 segundos', () => this.nudgeLen(0.25))),
      this.longSeg,
    );
    const phrRow = h(
      'div',
      { class: 'trow2' },
      h('div', { class: 'tl' }, h('b', {}, 'Toda la frase'), h('span', { class: 'tinfo' }, 'mueve sus palabras juntas')),
      h('div', { class: 'tbs' }, nb('◀◀ 0.25', 'Mover la frase 0.25 segundos antes', () => this.nudgePhrase(-0.25)), nb('◀ 0.05', 'Mover la frase 0.05 segundos antes', () => this.nudgePhrase(-0.05)), nb('0.05 ▶', 'Mover la frase 0.05 segundos después', () => this.nudgePhrase(0.05)), nb('0.25 ▶▶', 'Mover la frase 0.25 segundos después', () => this.nudgePhrase(0.25))),
    );
    this.hereBtn = h('button', { class: 'btn primary here', type: 'button', 'aria-label': 'Poner aquí el inicio de la palabra; mantén presionado si es larga' }, h('b', {}, '● Aquí'), h('small', {}, 'pon el inicio donde suena en la canción'));
    this.hereBtn.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      try {
        this.hereBtn.setPointerCapture(e.pointerId);
      } catch (err) {}
      this.herePress();
    });
    for (const ev of ['pointerup', 'pointercancel']) this.hereBtn.addEventListener(ev, () => this.hereRelease());
    this.hereBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    this.hereBtn.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        this.herePress();
      }
    });
    this.hereBtn.addEventListener('keyup', (e) => (e.key === 'Enter' || e.key === ' ') && this.hereRelease());
    const hearWord = h('button', { class: 'btn', type: 'button', onclick: () => this.preview() }, '▶ Escuchar palabra');
    const hearPhrase = h('button', { class: 'btn', type: 'button', onclick: () => this.playPhrase() }, '▶ Escuchar frase');
    this.hereRow = h('div', { class: 'row wrap here-row' }, this.hereBtn, hearWord, hearPhrase);
    this.timeBox = h('div', { class: 'tbox' }, this.hereRow, startRow, durRow, phrRow);

    // estilo de la palabra
    this.insp = h('div', { class: 'insp' });

    // todas las palabras
    this.list = h('ol', { class: 'wlist' });
    this.listBox = h('div', { class: 'wlistbox' }, this.list);
    this.allBox = h('details', { class: 'grp allw' }, h('summary', {}, 'Todas las frases y palabras'), h('div', { class: 'gbody' }, this.listBox));
    const wide = window.matchMedia && window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches;
    this.allBox.open = !!wide;
    this.allBox.addEventListener('toggle', () => this.allBox.open && this.paintList());

    this.playTog = toggle('Escuchar la palabra al elegirla o moverla', this.playOn, (v) => {
      this.playOn = v;
      lsSet('wordplay', v ? '1' : '0');
    });
    this.playTog.classList.add('small');

    this.keys = h(
      'details',
      { class: 'grp allw keys' },
      h('summary', {}, 'Atajos de teclado'),
      h(
        'ul',
        { class: 'keylist gbody' },
        h('li', {}, h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), ' mueven la palabra 0.02 s (con ', h('kbd', {}, 'Shift'), ' 0.1 s, con ', h('kbd', {}, 'Alt'), ' 0.005 s)'),
        h('li', {}, h('kbd', {}, '['), ' ', h('kbd', {}, ']'), ' acortan o alargan la palabra (con ', h('kbd', {}, 'Shift'), ' más)'),
        h('li', {}, h('kbd', {}, ','), ' ', h('kbd', {}, '.'), ' palabra anterior o siguiente; con ', h('kbd', {}, 'Shift'), ', frase anterior o siguiente'),
        h('li', {}, h('kbd', {}, 'M'), ' o ', h('kbd', {}, 'Enter'), ': «Aquí», pone el inicio de la palabra donde va la canción (si la mantienes, también su duración)'),
        h('li', {}, h('kbd', {}, 'R'), ' escucha la palabra otra vez · ', h('kbd', {}, 'Espacio'), ' reproduce o pausa'),
        h('li', {}, h('kbd', {}, '+'), ' ', h('kbd', {}, '-'), ' acercan o alejan la tira (también ', h('kbd', {}, 'Ctrl'), ' + rueda del mouse)'),
      ),
    );

    this.top = h('div', { class: 'wtop' }, this.nav, this.strip.el, this.zoomRow, this.chipsRow, this.timeBox);
    this.el = h('div', { class: 'pane wordspane' }, h('h2', {}, 'Palabra por palabra'), this.empty, this.top, this.insp, this.allBox, this.playTog, this.keys);

    app.on('project', () => this.onProject());
    app.on('reset', () => {
      this.sel = null;
      this.paintAll();
    });
    app.on('rebuilt', () => this.onRebuilt());
    app.on('tick', () => this.tick());
    app.on('state', () => this.startRaf());
    app.on('tab', () => this.startRaf());
    app.on('clip', () => this.softRefresh(true));
    app.on('media', () => this.softRefresh(true));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    this.paintAll();
  }

  // ───────────── datos ─────────────
  phrases() {
    return phrasesOf(this.app.project.text);
  }
  has() {
    const s = this.app.project.sync;
    return this.phrases().some((p, i) => s[i] && Number.isFinite(s[i].t));
  }
  syncedList() {
    const s = this.app.project.sync;
    return this.phrases()
      .map((p, i) => i)
      .filter((i) => s[i] && Number.isFinite(s[i].t));
  }
  line(src) {
    const tl = this.app.scene.tl;
    return tl ? tl.lines.find((l) => l.src === src) || null : null;
  }
  key() {
    return this.sel ? this.sel.src + '.' + this.sel.k : null;
  }
  getOver(create = false) {
    const p = this.app.project;
    const k = this.key();
    if (!k) return null;
    if (!p.over[k] && create) p.over[k] = {};
    return p.over[k] || null;
  }
  setOver(patch) {
    const o = this.getOver(true);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete o[k];
      else o[k] = v;
    }
    if (!Object.keys(o).length) delete this.app.project.over[this.key()];
    this.app.projectChanged();
    this.paintList();
    this.paintChips();
    this.refreshStrip();
  }
  word() {
    if (!this.sel) return null;
    const line = this.line(this.sel.src);
    return line && line.words[this.sel.k] ? { line, w: line.words[this.sel.k] } : null;
  }
  holdMin() {
    return this.app.project.style.holdMin ?? HELD_MIN;
  }
  limitToast() {
    const now = performance.now();
    if (now - this._warnAt < 2500) return;
    this._warnAt = now;
    toast('Ahí ya toca otra palabra. Muévela primero o usa la tira.');
  }

  // ───────────── pintar ─────────────
  show() {
    const list = this.syncedList();
    if (list.length && (!this.sel || !list.includes(this.sel.src))) this.sel = { src: list[0], k: 0 };
    this._stale = false;
    this.paintAll();
    // si el escenario todavía va a rehacerse (cambió de vista), se ajusta cuando termine para no usar tiempos viejos
    this._needFit = true;
    if (this.app.previewKind() === this.app.kind) this._needFit = !this.fitPhrase();
    this.startRaf();
  }

  softRefresh(media) {
    if (this.app.tab !== 'words') {
      this._stale = true;
      return;
    }
    this.refreshStrip(media);
  }

  onProject() {
    if (this.app.tab !== 'words') {
      this._stale = true;
      return;
    }
    this.paintList();
    this.paintChips();
  }

  onRebuilt() {
    if (this.app.tab !== 'words') {
      this._stale = true;
      return;
    }
    this.refreshHints();
    this.refreshStrip();
    this.paintChips();
    this.paintTimeBox();
    if (this._needFit) this._needFit = !this.fitPhrase();
  }

  paintAll() {
    const has = this.has();
    this.empty.hidden = has;
    this.top.hidden = !has;
    this.allBox.hidden = !has;
    this.playTog.hidden = !has;
    this.keys.hidden = !has;
    if (!has) {
      this.insp.hidden = true;
      return;
    }
    const ph = this.phrases();
    if (this.sel && !ph[this.sel.src]) this.sel = null;
    if (this.sel && this.sel.k >= ph[this.sel.src].words.length) this.sel.k = ph[this.sel.src].words.length - 1;
    this.paintNav();
    this.paintChips();
    this.paintTimeBox();
    this.paintList();
    this.paintInspector();
    this.refreshStrip(true);
  }

  paintNav() {
    const list = this.syncedList();
    const ph = this.phrases();
    if (!this.sel) {
      this.phTitle.textContent = 'Elige una palabra';
      this.phText.textContent = '';
      this.prevPh.disabled = this.nextPh.disabled = true;
      return;
    }
    const i = list.indexOf(this.sel.src);
    this.phTitle.textContent = `Frase ${this.sel.src + 1} de ${ph.length}`;
    this.phText.textContent = ph[this.sel.src] ? ph[this.sel.src].text : '';
    this.prevPh.disabled = i <= 0;
    this.nextPh.disabled = i < 0 || i >= list.length - 1;
  }

  // los botones de las palabras de la frase se reutilizan: solo cambian de clase (así un toque no se pierde si algo se repinta)
  paintChips() {
    if (!this.sel) {
      this.chipsRow.replaceChildren();
      this._chipsKey = '';
      this._chips = [];
      return;
    }
    const ph = this.phrases()[this.sel.src];
    if (!ph) return;
    const key = this.sel.src + '|' + ph.words.join('\u0001');
    if (key !== this._chipsKey) {
      this._chipsKey = key;
      this._chips = ph.words.map((w, k) => h('button', { type: 'button', class: 'wc', onclick: () => this.sel && this.select(this.sel.src, k) }, w));
      this.chipsRow.replaceChildren(...this._chips);
    }
    const over = this.app.project.over;
    const line = this.line(this.sel.src);
    this._chips.forEach((b, k) => {
      const on = this.sel.k === k;
      const ed = !!over[this.sel.src + '.' + k];
      const long = !!(line && line.words[k] && line.words[k].held);
      const cls = 'wc' + (on ? ' on' : '') + (ed ? ' ed' : '') + (long ? ' long' : '');
      if (b.className !== cls) b.className = cls;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  paintList() {
    if (!this.allBox.open || this.allBox.hidden) return;
    const app = this.app;
    const ph = this.phrases();
    const sync = app.project.sync;
    const over = app.project.over;
    const key = ph.map((p, i) => (sync[i] && Number.isFinite(sync[i].t) ? '1' : '0') + p.words.join('\u0001')).join('\u0002');
    if (key !== this._listKey) {
      this._listKey = key;
      this._lrows = [];
      const items = [];
      ph.forEach((p, i) => {
        if (!sync[i] || !Number.isFinite(sync[i].t)) return;
        const time = h('span', { class: 'ptime' });
        const btns = p.words.map((w, k) => h('button', { type: 'button', class: 'wc', onclick: () => this.select(i, k) }, w));
        this._lrows.push({ i, time, btns });
        items.push(h('li', { class: 'wl' }, time, h('span', { class: 'wchips' }, btns)));
      });
      this.list.replaceChildren(...items);
    }
    for (const row of this._lrows) {
      const s = sync[row.i];
      row.time.textContent = s ? fmtTimeMs(s.wt && s.wt.length ? s.wt[0] : s.t) : '';
      row.btns.forEach((b, k) => {
        const on = this.sel && this.sel.src === row.i && this.sel.k === k;
        const ed = !!over[row.i + '.' + k];
        const cls = 'wc' + (on ? ' on' : '') + (ed ? ' ed' : '');
        if (b.className !== cls) b.className = cls;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
  }

  // ───────────── selección ─────────────
  // al tocar un bloque de la tira se elige en seguida (puede ser el inicio de un arrastre), sin mover la vista
  pick(src, k) {
    this._pickedNew = !this.sel || this.sel.src !== src;
    this.afterSelect(src, k);
    this.refreshStrip();
  }

  tapWord() {
    if (this._pickedNew) {
      this._pickedNew = false;
      this.fitPhrase();
    }
    if (this.playOn) this.preview();
  }

  afterSelect(src, k) {
    this.sel = { src, k };
    this.paintNav();
    this.paintChips();
    this.paintList();
    this.paintTimeBox();
    this.paintInspector();
  }

  select(src, k, { play = true } = {}) {
    const changedPhrase = !this.sel || this.sel.src !== src;
    this.afterSelect(src, k);
    this.refreshStrip();
    if (changedPhrase) this.fitPhrase();
    else this.keepWordVisible();
    if (play && this.playOn) this.preview();
  }

  preview() {
    const info = this.word();
    if (!info) return;
    const app = this.app;
    app.audioFull.pause();
    this.follow = true;
    this.syncFollowBtn();
    app.player.start(Math.max(0, info.w.onset - 0.9));
  }

  playPhrase() {
    if (!this.sel) return;
    const line = this.line(this.sel.src);
    if (!line) return;
    this.app.audioFull.pause();
    this.follow = true;
    this.syncFollowBtn();
    this.app.player.start(Math.max(0, line.t - 0.6));
  }

  gotoPhrase(dir) {
    const list = this.syncedList();
    if (!this.sel) return;
    const i = list.indexOf(this.sel.src);
    const j = Math.max(0, Math.min(list.length - 1, i + dir));
    if (j === i || i < 0) return;
    this.select(list[j], 0);
  }

  // palabra anterior o siguiente (pasa a la frase vecina al llegar al final)
  step(dir, opts = {}) {
    if (!this.sel) return false;
    const ph = this.phrases();
    const list = this.syncedList();
    let { src, k } = this.sel;
    k += dir;
    if (k < 0 || k >= ph[src].words.length) {
      const i = list.indexOf(src) + dir;
      if (i < 0 || i >= list.length) return false;
      src = list[i];
      k = dir > 0 ? 0 : ph[src].words.length - 1;
    }
    this.select(src, k, opts);
    return true;
  }

  // ───────────── tira ─────────────
  stripWords() {
    const tl = this.app.scene.tl;
    if (!tl) return [];
    const over = this.app.project.over;
    const out = [];
    for (const line of tl.lines) {
      for (const w of line.words) {
        const len = line.wordMode ? Math.max(w.sung || 0, 0.08) : Math.max(w.dur || 0, 0.1);
        out.push({ src: line.src, k: w.k, text: w.text, on: w.onset, len, held: !!w.held, cur: !!this.sel && line.src === this.sel.src, ed: !!over[line.src + '.' + w.k] });
      }
    }
    return out;
  }

  refreshStrip(media = false) {
    const app = this.app;
    const st = this.strip;
    const c = app.clip();
    if (media || st.clip0 !== c.start || st.media !== app.media) st.setMedia(app.media, c.start, c.end - c.start);
    const line = this.sel ? this.line(this.sel.src) : null;
    const msg = this.sel && !line ? 'Esta frase queda fuera del tramo elegido en el paso 1: amplía el tramo para verla aquí.' : '';
    st.setWords(line || !this.sel ? this.stripWords() : [], this.sel, msg);
    st.setPlayhead(app.player.t);
  }

  fitPhrase() {
    const line = this.sel ? this.line(this.sel.src) : null;
    if (!line || !this.strip.el.clientWidth) return false;
    const last = line.words[line.words.length - 1];
    const end = Math.max(line.hideAt || 0, last.onset + Math.max(last.dur || 0, last.sung || 0) + 0.3);
    const a = line.t - 0.5;
    const b = Math.min(end, line.t + 14) + 0.3;
    this.strip.showRange(a, Math.max(b, a + 2.4));
    this.follow = true;
    this.syncFollowBtn();
    return true;
  }

  fitWord() {
    const info = this.word();
    if (!info) return;
    const len = Math.max(info.w.sung || 0, info.w.dur || 0, 0.3);
    const c = info.w.onset + len / 2;
    const span = Math.max(1.6, len + 1.2);
    this.strip.showRange(c - span / 2, c + span / 2);
    this.follow = false;
    this.syncFollowBtn();
  }

  keepWordVisible() {
    const info = this.word();
    if (!info) return;
    const st = this.strip;
    const a = info.w.onset;
    const b = a + Math.max(info.w.sung || 0, info.w.dur || 0, 0.2);
    if (a < st.a + 0.05 || b > st.b - 0.05) {
      const span = st.span;
      st.setWindow(a - span * 0.25, a - span * 0.25 + span);
    }
  }

  setFollow(v) {
    this.follow = v;
    this.syncFollowBtn();
  }
  syncFollowBtn() {
    this.followBtn.classList.toggle('on', this.follow);
    this.followBtn.setAttribute('aria-pressed', this.follow ? 'true' : 'false');
  }

  // el cursor de la tira se mueve fluido (cada cuadro) mientras suena; el resto, cada 90 ms
  tick() {
    if (this.app.tab !== 'words' || !this.has()) return;
    if (this._stale) {
      this._stale = false;
      this.paintAll();
    }
    if (!this._raf) this.frame();
  }
  frame() {
    const p = this.app.player;
    const t = p.t;
    const st = this.strip;
    st.setPlayhead(t);
    if (this.follow && p.state === 'playing' && !st.drag && st.pointers.size === 0) {
      if (t > st.b - st.span * 0.06 || t < st.a) st.setWindow(t - st.span * 0.18, t - st.span * 0.18 + st.span);
    }
  }
  startRaf() {
    if (this._raf || this.app.tab !== 'words' || this.app.player.state !== 'playing') return;
    const f = () => {
      this._raf = 0;
      if (this.app.tab !== 'words' || this.app.player.state !== 'playing') return;
      this.frame();
      this._raf = requestAnimationFrame(f);
    };
    this._raf = requestAnimationFrame(f);
  }

  // vecinos de una palabra en el tiempo del tramo (para que no se crucen al arrastrar)
  limitsClip(src, k) {
    const tl = this.app.scene.tl;
    const dur = this.app.clip().end - this.app.clip().start;
    if (!tl) return { lo: 0, hi: dur };
    const flat = [];
    for (const l of tl.lines) for (const w of l.words) flat.push({ src: l.src, k: w.k, on: w.onset });
    const i = flat.findIndex((x) => x.src === src && x.k === k);
    return { lo: i > 0 ? flat[i - 1].on : 0, hi: i >= 0 && i < flat.length - 1 ? flat[i + 1].on : dur };
  }

  // ───────────── inspector: cuándo suena ─────────────
  absNow() {
    return this.app.clip().start + this.app.player.time(performance.now() / 1000);
  }

  paintTimeBox() {
    const show = !!this.sel && this.has();
    this.timeBox.hidden = !show;
    if (!show) return;
    const info = this.word();
    this.longSeg.set(info && info.w.held ? '1' : '0');
    this.paintTimeInfo();
  }

  paintTimeInfo() {
    if (!this.sel) return;
    const info = this.word();
    const s = this.app.project.sync[this.sel.src];
    if (!info || !s) {
      this.tInfo.textContent = '';
      this.dInfo.textContent = '';
      return;
    }
    const abs = s.wt && s.wt[this.sel.k] != null ? s.wt[this.sel.k] : info.w.onset + this.app.clip().start - (this.app.project.offset || 0);
    this.tInfo.textContent = fmtTimeMs(abs);
    if (info.line.wordMode) {
      const len = info.w.sung || 0;
      this.dInfo.textContent = `${len.toFixed(2)} s · ${info.w.held ? 'larga: se estira' : 'corta'}`;
    } else this.dInfo.textContent = 'automática (la reparto por sílabas)';
  }

  // ───────────── cambios de tiempo ─────────────
  // si la frase solo tiene inicio, la convierte a palabra por palabra con los tiempos que ya se usan
  ensureWordLevel(src) {
    const app = this.app;
    const p = app.project;
    const ph = this.phrases()[src];
    if (!ph) return null;
    const n = ph.words.length;
    const s = p.sync[src];
    if (s && Array.isArray(s.wt) && s.wt.length === n && s.wt.every(Number.isFinite)) {
      if (!Array.isArray(s.wd)) s.wd = [];
      while (s.wd.length < n) s.wd.push(0.2);
      return s;
    }
    const line = this.line(src);
    if (!line) {
      toast('Esa frase queda fuera del tramo del paso 1. Amplía el tramo para ajustarla.');
      return null;
    }
    const clip0 = app.clip().start;
    const off = p.offset || 0;
    const hm = this.holdMin();
    const wt = line.words.map((w) => r3(w.onset + clip0 - off));
    const wd = line.words.map((w) => r3(Math.max(0.1, Math.min(w.dur || 0.2, hm - 0.05))));
    p.sync[src] = { t: wt[0], wt, wd };
    return p.sync[src];
  }

  // vecinos (en segundos de la canción) para no cruzar palabras ni frases
  limitsAbs(src, k, s) {
    const sync = this.app.project.sync;
    let lo = -Infinity;
    let hi = Infinity;
    if (k > 0) lo = s.wt[k - 1] + GAP;
    else {
      for (let i = src - 1; i >= 0; i--) {
        const q = sync[i];
        if (q && Number.isFinite(q.t)) {
          lo = (q.wt && q.wt.length ? q.wt[q.wt.length - 1] : q.t) + GAP;
          break;
        }
      }
    }
    if (k < s.wt.length - 1) hi = s.wt[k + 1] - GAP;
    else {
      for (let i = src + 1; i < sync.length; i++) {
        const q = sync[i];
        if (q && Number.isFinite(q.t)) {
          hi = q.t - GAP;
          break;
        }
      }
    }
    return { lo: Math.max(0, lo), hi };
  }

  // acorta las palabras cortas que quedaron encima de la que sigue (las largas no se tocan)
  normalizeLens(src) {
    const s = this.app.project.sync[src];
    if (!s || !Array.isArray(s.wt) || !Array.isArray(s.wd)) return;
    const hm = this.holdMin();
    for (let kk = 0; kk < s.wt.length; kk++) {
      const { hi } = this.limitsAbs(src, kk, s);
      if (!Number.isFinite(hi)) continue;
      const cap = hi - s.wt[kk];
      if (s.wd[kk] > cap && s.wd[kk] < hm) s.wd[kk] = r3(Math.max(0.05, cap));
    }
  }

  setStartAbs(src, k, tAbs, replay = true) {
    const s = this.ensureWordLevel(src);
    if (!s) return false;
    const { lo, hi } = this.limitsAbs(src, k, s);
    // una palabra larga no puede pasar encima de la siguiente; una corta se acorta para caber
    const held = (s.wd[k] || 0) >= this.holdMin();
    const top = Number.isFinite(hi) ? Math.max(lo, hi - (held ? s.wd[k] : 0.05)) : Infinity;
    const t = r3(Math.max(lo, Math.min(top, tAbs)));
    if (Math.abs(t - s.wt[k]) < 1e-6) {
      if (Math.abs(tAbs - s.wt[k]) > 0.004) this.limitToast();
      return false;
    }
    s.wt[k] = t;
    s.t = s.wt[0];
    this.afterTime(src, k, replay);
    return true;
  }

  setStartClip(src, k, onClip) {
    const app = this.app;
    this.setStartAbs(src, k, onClip + app.clip().start - (app.project.offset || 0));
  }

  // lo más larga que puede ser la palabra sin pasar a la siguiente
  maxLen(src, k, s) {
    const { hi } = this.limitsAbs(src, k, s);
    return Number.isFinite(hi) ? Math.max(0.05, hi - s.wt[k]) : 10;
  }

  setLen(src, k, len, replay = true) {
    const s = this.ensureWordLevel(src);
    if (!s) return false;
    const cap = this.maxLen(src, k, s);
    const v = r3(Math.max(0.05, Math.min(10, cap, len)));
    if (len > cap + 0.004 && Math.abs(v - (s.wd[k] || 0)) < 1e-6) this.limitToast();
    if (Math.abs(v - (s.wd[k] || 0)) < 1e-6) return false;
    s.wd[k] = v;
    this.afterTime(src, k, replay);
    return true;
  }

  nudge(dt) {
    if (!this.sel) return;
    const { src, k } = this.sel;
    const s = this.ensureWordLevel(src);
    if (!s) return;
    this.setStartAbs(src, k, s.wt[k] + dt);
  }
  nudgeLen(dd) {
    if (!this.sel) return;
    const { src, k } = this.sel;
    const s = this.ensureWordLevel(src);
    if (!s) return;
    this.setLen(src, k, (s.wd[k] || 0.2) + dd);
  }
  setLong(v) {
    if (!this.sel) return;
    const { src, k } = this.sel;
    const s = this.ensureWordLevel(src);
    if (!s) return;
    const hm = this.holdMin();
    const cur = s.wd[k] || 0.2;
    if (v) {
      const room = this.maxLen(src, k, s);
      if (room < hm + 0.02) {
        toast(`No cabe una palabra larga aquí: la que sigue empieza muy pronto. Mueve la siguiente o esta (necesita ${hm.toFixed(1)} s libres).`);
        this.longSeg.set('0');
        return;
      }
      this.setLen(src, k, Math.min(Math.max(cur, hm + 0.5), room));
    } else this.setLen(src, k, Math.min(cur, Math.max(0.1, hm - 0.15)));
  }
  nudgePhrase(dt) {
    if (!this.sel) return;
    const { src } = this.sel;
    const s = this.ensureWordLevel(src);
    if (!s) return;
    const first = this.limitsAbs(src, 0, s);
    const last = this.limitsAbs(src, s.wt.length - 1, s);
    const nL = s.wt.length - 1;
    const lastHeld = (s.wd[nL] || 0) >= this.holdMin();
    const minD = Number.isFinite(first.lo) ? first.lo - s.wt[0] : -Infinity;
    const maxD = Number.isFinite(last.hi) ? last.hi - (lastHeld ? s.wd[nL] : 0.05) - s.wt[nL] : Infinity;
    const d = Math.max(minD, Math.min(maxD, dt));
    if (Math.abs(d) < 1e-6) {
      this.limitToast();
      return;
    }
    s.wt = s.wt.map((x) => r3(Math.max(0, x + d)));
    s.t = s.wt[0];
    this.afterTime(src, this.sel.k);
  }

  // «Aquí»: el inicio de la palabra queda donde va la canción; si se mantiene, también su duración
  herePress() {
    if (!this.sel || this.hereAt) return;
    const t = this.absNow();
    this.hereAt = { t, src: this.sel.src, k: this.sel.k };
    this.hereBtn.classList.add('down');
    this.setStartAbs(this.sel.src, this.sel.k, t, false);
  }
  hereRelease() {
    const hd = this.hereAt;
    if (!hd) return;
    this.hereAt = null;
    this.hereBtn.classList.remove('down');
    const held = this.absNow() - hd.t;
    if (held >= 0.3) this.setLen(hd.src, hd.k, held, false);
    // sigue con la palabra de al lado sin cortar la canción
    this.step(1, { play: false });
  }

  // la tira se actualiza al instante; el motor se rehace en seguida y la palabra se vuelve a escuchar
  afterTime(src, k, replay = true) {
    const app = this.app;
    const s = app.project.sync[src];
    const clip0 = app.clip().start;
    const off = app.project.offset || 0;
    // la frase de atrás también puede haberse quedado sin espacio
    let prev = -1;
    for (let i = src - 1; i >= 0; i--) {
      const q = app.project.sync[i];
      if (q && Number.isFinite(q.t)) {
        prev = i;
        break;
      }
    }
    this.normalizeLens(src);
    if (prev >= 0) this.normalizeLens(prev);
    for (const i of prev >= 0 ? [src, prev] : [src]) {
      const q = app.project.sync[i];
      if (!q || !q.wt) continue;
      const hm = this.holdMin();
      q.wt.forEach((t, kk) => {
        const w = this.strip.words.find((x) => x.src === i && x.k === kk);
        if (!w) return;
        w.on = Math.max(0, t - clip0 + off);
        const len = q.wd && q.wd[kk] != null ? q.wd[kk] : 0.2;
        w.len = Math.max(0.08, len);
        w.held = len >= hm;
      });
    }
    this.strip.layout();
    app.projectChanged();
    this.paintList();
    this.paintTimeInfo();
    if (this.sel && this.sel.src === src) {
      const sw = s && s.wd ? s.wd[this.sel.k] : 0;
      this.longSeg.set((sw || 0) >= this.holdMin() ? '1' : '0');
      if (s && s.wt) this.dInfo.textContent = `${(sw || 0).toFixed(2)} s · ${(sw || 0) >= this.holdMin() ? 'larga: se estira' : 'corta'}`;
    }
    clearTimeout(this._t);
    if (replay && this.playOn && !this.hereAt) this._t = setTimeout(() => this.sel && this.preview(), 420);
  }

  // ───────────── teclado ─────────────
  typing(tg) {
    return tg && tg.closest && tg.closest('textarea, input, select, [contenteditable]');
  }
  onKey(e) {
    const app = this.app;
    if (app.tab !== 'words' || !this.has() || !this.sel || e.ctrlKey || e.metaKey) return;
    if (this.typing(e.target)) return;
    const big = e.shiftKey;
    const fine = e.altKey;
    let used = true;
    switch (e.key) {
      case 'ArrowLeft':
        this.nudge(-(fine ? 0.005 : big ? 0.1 : 0.02));
        break;
      case 'ArrowRight':
        this.nudge(fine ? 0.005 : big ? 0.1 : 0.02);
        break;
      case '[':
        this.nudgeLen(big ? -0.25 : -0.05);
        break;
      case ']':
        this.nudgeLen(big ? 0.25 : 0.05);
        break;
      case ',':
      case '<':
        if (e.key === '<' || big) this.gotoPhrase(-1);
        else this.step(-1);
        break;
      case '.':
      case '>':
        if (e.key === '>' || big) this.gotoPhrase(1);
        else this.step(1);
        break;
      case 'm':
      case 'M':
      case 'Enter':
        if (e.key === 'Enter' && e.target && e.target.closest && e.target.closest('button, a')) return;
        if (!e.repeat) this.herePress();
        break;
      case 'r':
      case 'R':
        this.preview();
        break;
      case '+':
      case '=':
        this.strip.zoom(0.7);
        break;
      case '-':
      case '_':
        this.strip.zoom(1.4);
        break;
      default:
        used = false;
    }
    if (used) e.preventDefault();
  }
  onKeyUp(e) {
    if (this.app.tab !== 'words') return;
    if (['m', 'M', 'Enter'].includes(e.key) && this.hereAt) {
      e.preventDefault();
      this.hereRelease();
    }
  }

  // ───────────── inspector: cómo se ve ─────────────
  paintInspector() {
    const insp = this.insp;
    this.hints = {};
    if (!this.sel || !this.has()) {
      insp.hidden = true;
      return;
    }
    insp.hidden = false;
    const app = this.app;
    const ph = this.phrases();
    const text = ph[this.sel.src] ? ph[this.sel.src].words[this.sel.k] : '';
    const o = this.getOver() || {};
    const hint = (name) => {
      const el = h('span', { class: 'hint' });
      this.hints[name] = el;
      return el;
    };
    const opt = (map, auto) => [['', auto], ...Object.entries(map)];
    // deslizador sin etiqueta propia (la etiqueta la pone `mk`), pero con nombre para lectores de pantalla
    const sl = (cfg) => {
      const row = slider({ ...cfg, label: undefined });
      row.querySelector('input').setAttribute('aria-label', cfg.label);
      return row;
    };

    const sApp = select(opt(APPEAR_LABELS, 'Automática'), o.fx || '', (v) => this.setOver({ fx: v || undefined }), 'Entrada');
    const sHold = select(opt(HOLD_LABELS, 'Automático'), o.hold || '', (v) => this.setOver({ hold: v || undefined }), 'Mientras suena');
    const sFace = select(opt(FACE_LABELS, 'Automática'), o.face || '', (v) => this.setOver({ face: v || undefined }), 'Tipografía');
    const col = h(
      'div',
      { class: 'chips' },
      [['', 'Auto'], ...COLOR_NAMES.map((c) => [c, COLOR_LABELS[c]])].map(([c, t]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip pal' + ((o.col || '') === c ? ' on' : ''),
            'data-v': c,
            'aria-label': t,
            title: t,
            onclick: () => {
              col.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.v === c));
              this.setOver({ col: c || undefined });
            },
          },
          c ? h('span', { class: 'sw one' }, h('i', { style: { background: HEX[c] } })) : 'Auto',
        ),
      ),
    );
    const size = sl({ min: 0.6, max: 1.7, step: 0.02, value: o.size || 1, fmt: (v) => v.toFixed(2) + '×', label: 'Tamaño de la palabra', onInput: (v) => this.setOver({ size: v }) });
    const thickFmt = (v) => (Math.abs(v) < 0.03 ? 'normal' : v < 0 ? 'fina ' + Math.round(-v * 100) + '%' : 'gruesa ' + Math.round(v * 100) + '%');
    // parte del grosor general; si lo dejas igual que el general no se guarda cambio propio
    const gThick = this.app.project.style.thick ?? 0;
    const thick = sl({ min: -1, max: 1, step: 0.05, value: o.thick ?? gThick, fmt: thickFmt, label: 'Grosor de las letras de esta palabra', onInput: (v) => this.setOver({ thick: Math.abs(v - gThick) < 0.03 ? undefined : v }) });
    const ext = sl({ min: 0, max: 2.2, step: 0.05, value: o.ext ?? 0, fmt: (v) => (v === 0 ? 'sin estirar' : v.toFixed(2) + ' letras'), label: 'Cuánto se estira', onInput: (v) => this.setOver({ ext: v }) });
    const stretchOk = canStretch(text);
    const mk = (label, control, name) => h('div', { class: 'field' }, h('div', { class: 'lab' }, label, name ? hint(name) : null), control);
    const fxOn = Array.isArray(o.fxs);
    const fxChips = chips(WORD_FX.map((f) => [f, WORDFX_LABELS[f]]), fxOn ? o.fxs : [], (v) => this.setOver({ fxs: v }));
    const fxAuto = h(
      'label',
      { class: 'switch small' },
      h('input', {
        type: 'checkbox',
        checked: fxOn ? 'checked' : null,
        onchange: (e) => {
          if (e.target.checked) {
            const info = this.word();
            const cur = info && info.w.fxs ? info.w.fxs : [];
            this.setOver({ fxs: cur.slice() });
            fxChips.set(cur);
          } else this.setOver({ fxs: undefined });
          fxChips.classList.toggle('dim', !e.target.checked);
        },
      }),
      h('span', { class: 'knob' }),
      h('span', { class: 'txt' }, 'Elegir efectos a mano'),
    );
    fxChips.classList.toggle('dim', !fxOn);
    const caps = segmented(
      [
        ['', 'Auto'],
        ['1', 'Sí'],
        ['0', 'No'],
      ],
      o.caps == null ? '' : o.caps ? '1' : '0',
      (v) => this.setOver({ caps: v === '' ? undefined : v === '1' }),
      'Mayúsculas',
    );
    const fill = segmented(
      [
        ['', 'Auto'],
        ['edge', 'Bordes'],
        ['self', 'Letras'],
        ['classic', 'Clásico'],
      ],
      o.pal == null ? '' : PALBACK[o.pal],
      (v) => this.setOver({ pal: v === '' ? undefined : PALKEY[v] }),
      'Relleno',
    );

    const po = app.project.over['p' + this.sel.src] || {};
    const sMood = select(opt(MOOD_LABELS, 'Automático'), po.mood || '', (v) => this.setPhrase({ mood: v || undefined }), 'Fondo de la frase');
    const sExit = select(opt(EXIT_LABELS, 'Automática'), po.exit || '', (v) => this.setPhrase({ exit: v || undefined }), 'Salida de la frase');

    const reset = h(
      'button',
      {
        class: 'btn small ghost',
        type: 'button',
        onclick: () => {
          delete app.project.over[this.key()];
          app.projectChanged();
          this.paintAll();
        },
      },
      'Quitar mis cambios de esta palabra',
    );

    insp.replaceChildren(
      h('div', { class: 'wtitle' }, h('b', {}, text), h('span', { class: 'muted small' }, 'cómo se ve · frase ' + (this.sel.src + 1))),
      mk('Cómo entra', sApp, 'appear'),
      mk('Mientras suena', sHold, 'hold'),
      mk('Tipografía', sFace, 'face'),
      mk('Color', col),
      mk('Tamaño', size),
      mk('Grosor', thick),
      mk('Estirar la palabra', stretchOk ? ext : h('span', { class: 'muted small' }, 'No tiene vocales que estirar'), 'stretch'),
      h('div', { class: 'field' }, h('div', { class: 'lab' }, 'Efectos', hint('fx')), fxAuto, fxChips),
      mk('Mayúsculas', caps),
      mk('Relleno', fill),
      h('div', { class: 'lab2' }, 'Toda la frase'),
      mk('Fondo', sMood),
      mk('Cómo sale', sExit),
      h('div', { class: 'row wrap' }, reset),
    );
    this.refreshHints();
  }

  setPhrase(patch) {
    const p = this.app.project;
    const k = 'p' + this.sel.src;
    p.over[k] = p.over[k] || {};
    for (const [a, v] of Object.entries(patch)) {
      if (v === undefined) delete p.over[k][a];
      else p.over[k][a] = v;
    }
    if (!Object.keys(p.over[k]).length) delete p.over[k];
    this.app.projectChanged();
  }

  refreshHints() {
    if (!this.sel || !this.hints) return;
    const info = this.word();
    const H = this.hints;
    if (!info) return;
    const w = info.w;
    const set = (n, t) => H[n] && (H[n].textContent = t ? ' · ahora: ' + t : '');
    set('appear', APPEAR_LABELS[w.appear] || w.appear);
    set('hold', HOLD_LABELS[w.hold] || w.hold);
    set('face', FACE_LABELS[w.face] || w.face);
    set('stretch', w.stretch ? 'se estira' : 'normal');
    set('fx', (w.fxs || []).length ? w.fxs.map((f) => WORDFX_LABELS[f]).join(', ') : 'ninguno');
  }
}
