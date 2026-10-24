// Paso 3: marcar cuándo suena cada palabra mientras escuchas.
//
// Cómo funciona (y por qué está hecho así):
//  · «Empezar» SIEMPRE arranca la canción desde el principio del tramo, con la cuenta 3, 2, 1. Los tiempos que ya había
//    se guardan como respaldo y solo se quitan cuando la canción empieza a sonar (si cancelas la cuenta no se pierde nada).
//  · Cada marca usa la hora EXACTA del toque (la que trae el evento), no la del momento en que el teléfono alcanza a
//    atenderlo: si en ese instante estaba dibujando o guardando, la marca no se corre.
//  · Solo el botón grande marca, y solo mientras la canción suena. Fuera de eso (pausa, fin del tramo, pantalla de
//    «¿Quedó bien?») el botón grande ni existe: un toque de más no reinicia nada. Y cuando todo termina solo (última
//    frase, fin del tramo) los botones esperan un momento antes de dejarse tocar.
//  · Palabra por palabra: mantén presionado desde que empieza la palabra hasta que termina de sonar (una palabra larga
//    se estira en pantalla). Solo frases: un toque al empezar cada una (se guarda en cuanto tocas).
//
// Lo que se toca no cambia de lugar mientras marcas: arriba va la frase que sigues, abajo el botón grande.
import { h, toast, segmented, toggle } from './ui.js';
import { phrasesOf, fmtTime, fmtTimeMs, syncedCount } from './project.js';
import { HELD_MIN } from './timeline.js';

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

const COUNT_FROM = 3; // 3, 2, 1
const COUNT_STEP = 900; // ms por número
const LOCK_AUTO = 1600; // ms que esperan los botones cuando algo termina solo (última frase, fin del tramo)
const LOCK_USER = 450; // ms tras pausar tú mismo (por si el dedo rebota)
const REWIND = 1.5; // al seguir marcando desde la última marca, la canción regresa un poco
const REWIND_PAUSE = 1.0; // y al seguir después de una pausa, un poco menos
const GAP_WORD = 0.05; // dos marcas de palabra no pueden quedar más cerca que esto
const GAP_PHRASE = 0.3; // ni dos marcas de frase (un doble toque sin querer)

const buzz = (ms) => {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
};

// tic de la cuenta regresiva (un tono corto; si el navegador no deja, no pasa nada)
let actx = null;
function beep(freq, ms = 90, vol = 0.07) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = actx || new AC();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator();
    const g = actx.createGain();
    const t = actx.currentTime;
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch (e) {}
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export class MarkPanel {
  constructor(app) {
    this.app = app;
    this.mode = lsGet('markmode', 'word');
    // fase: 'idle' (sin empezar) · 'count' (cuenta 3-2-1) · 'run' (suena y se marca) · 'pause' · 'listen' (solo escuchar) · 'done' (todo marcado)
    this.phase = 'idle';
    this.prevPhase = 'idle'; // a la que se vuelve si se cancela la cuenta
    this.reason = ''; // por qué está en pausa: 'user' | 'end' | 'tab' | 'hidden' | 'stop' | 'blocked' | 'undo'
    this.cur = { p: 0, k: 0 };
    this.pend = { wt: [], wd: [] };
    this.hold = null;
    this.cd = null; // cuenta regresiva en curso: { i, timer, done }
    this.countOn = lsGet('markcount', '1') !== '0';
    this.fresh = false; // la próxima vez que suene, se empieza de cero (se respalda y se quita lo anterior)
    this.backup = null; // { sync } de lo que había antes de empezar de cero
    this.pausedAt = null; // segundo del tramo donde quedó la pausa
    this.starting = false;
    this.previewing = false;
    this.lockUntil = 0;
    this.lockT = 0;
    this.goT = 0;
    this.fadeT = 0;
    this.warnAt = 0;
    this.rows = [];
    this.listSig = null;
    this.lastCurP = -1;
    this.phCache = { text: null, ph: [] };
    this.shown = {}; // últimos textos pintados (para no tocar el DOM sin necesidad)
    this.fitKey = '';

    // ───── lo de arriba: dónde vas ─────
    this.statEl = h('div', { class: 'mstat', role: 'status', 'aria-live': 'polite' });
    this.clockEl = h('span', { class: 'mclock', 'aria-hidden': 'true' });
    this.pauseBtn = h('button', { class: 'mtopbtn', type: 'button', 'aria-label': 'Pausar', title: 'Pausar (Esc)', onclick: () => this.pauseRun('user') }, h('span', { class: 'pauseic' }, h('i'), h('i')));
    this.top = h('div', { class: 'mtop' }, this.statEl, this.clockEl, this.pauseBtn);
    this.progEl = h('i', { class: 'mprog', 'aria-hidden': 'true' }, h('b'));

    // ───── la frase que sigues ─────
    this.prevEl = h('div', { class: 'mline prev' });
    this.curWrap = h('div', { class: 'mwrap' });
    this.curEl = h('div', { class: 'mline cur' }, this.curWrap);
    this.nxtEl = h('div', { class: 'mline nxt' });
    this.stageBox = h('div', { class: 'mstage', 'aria-live': 'off' }, this.prevEl, this.curEl, this.nxtEl);

    // ───── el botón grande ─────
    this.pad = h('button', { class: 'pad', type: 'button', hidden: true });
    this.padTxt = h('span', { class: 'padtxt' });
    this.padSub = h('span', { class: 'padsub' });
    this.padBar = h('i', { class: 'padbar' });
    this.pad.append(this.padTxt, this.padSub, this.padBar);
    this.pad.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      if (this.phase !== 'run' || this.hold) return;
      try {
        this.pad.setPointerCapture(e.pointerId);
      } catch (err) {}
      this.press(e);
    });
    const rel = (e) => this.release(e);
    this.pad.addEventListener('pointerup', rel);
    this.pad.addEventListener('pointercancel', rel);
    this.pad.addEventListener('lostpointercapture', rel);
    this.pad.addEventListener('contextmenu', (e) => e.preventDefault());
    this.pad.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.press(e);
      }
    });
    this.pad.addEventListener('keyup', (e) => e.key === 'Enter' && this.release(e));
    this.goEl = h('span', { class: 'mgo', hidden: true, 'aria-hidden': 'true' }, '¡Ya!');

    // ───── tarjetas: lo que se muestra en lugar del botón grande cuando no se está marcando ─────
    // (los botones de una tarjeta no se dejan tocar mientras «espera»: ver lock())
    const act = (cls, txt, fn) => h('button', { class: cls, type: 'button', onclick: (e) => !this.locked() && fn(e) }, txt);

    this.modeSeg = segmented(
      [
        ['word', 'Palabra por palabra'],
        ['phrase', 'Solo frases'],
      ],
      this.mode,
      (v) => {
        this.flush();
        this.mode = v;
        lsSet('markmode', v);
        this.paint();
      },
      'Cómo marcar',
    );
    this.cdSwitch = toggle('Cuenta regresiva 3, 2, 1', this.countOn, (v) => {
      this.countOn = v;
      lsSet('markcount', v ? '1' : '0');
      this.paintZone();
    });
    this.cdSwitch.classList.add('small');
    this.opts = h('div', { class: 'mopts' }, this.modeSeg, this.cdSwitch);
    this.restoreBtn = act('btn ghost small mrestore', '↺ Recuperar los tiempos anteriores', () => this.restoreBackup());
    this.restoreBtn.hidden = true;

    // sin empezar
    this.idleTitle = h('h3', { class: 'mtitle' });
    this.idleNote = h('p', { class: 'mnote' });
    this.startBtn = act('btn primary big', '', () => this.startAction());
    this.freshBtn = act('btn alt', 'Empezar de cero', () => this.startFresh());
    this.idleBtns = h('div', { class: 'mbtnrow' }, this.startBtn, this.freshBtn);
    this.idle = h('div', { class: 'mcard idle' }, this.idleTitle, this.idleNote, this.idleBtns);

    // cuenta regresiva
    this.cdNum = h('b', { class: 'cnum' });
    this.cdSub = h('small', { class: 'csub' });
    this.cancelBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => this.cancelCount() }, 'Cancelar');
    this.count = h('div', { class: 'mcard count', role: 'status' }, this.cdNum, this.cdSub, this.cancelBtn);

    // en pausa
    this.pauseTitle = h('h3', { class: 'mtitle' });
    this.pauseNote = h('p', { class: 'mnote' });
    this.resumeBtn = act('btn primary big', '▶ Seguir', () => this.continuePass());
    this.undoPauseBtn = act('btn ghost', '↶ Deshacer la última', () => this.undo());
    this.freshPauseBtn = act('btn ghost', 'Empezar de cero', () => this.startFresh());
    this.pauseBtns = h('div', { class: 'mbtnrow two' }, this.undoPauseBtn, this.freshPauseBtn);
    this.pausedCard = h('div', { class: 'mcard pause' }, this.pauseTitle, this.pauseNote, this.resumeBtn, this.pauseBtns);

    // solo escuchando
    this.listenTitle = h('h3', { class: 'mtitle' });
    this.stopBtn = h('button', { class: 'btn primary big', type: 'button', onclick: () => this.stopListen() }, '■ Parar');
    this.listen = h('div', { class: 'mcard listen' }, this.listenTitle, this.stopBtn);

    // todo marcado
    this.doneTitle = h('h3', { class: 'mtitle' }, h('span', { class: 'mcheck', 'aria-hidden': 'true' }, '✓'), h('span', { class: 'mtxt' }));
    this.doneAsk = h('p', { class: 'mask' }, '¿Quedó bien?');
    this.previewBtn = act('btn primary big', '▶ Ver vista previa', () => this.previewMarked());
    this.nextBtn = act('btn alt big', 'Siguiente: Estilo →', () => this.goNext());
    this.againBtn = act('btn ghost', '↻ Marcar otra vez', () => this.startFresh());
    this.undoDoneBtn = act('btn ghost', '↶ Deshacer la última', () => this.undo());
    this.doneBtns = h('div', { class: 'mbtnrow two' }, this.againBtn, this.undoDoneBtn);
    this.doneCard = h('div', { class: 'mcard done' }, this.doneTitle, this.doneAsk, this.previewBtn, this.nextBtn, this.doneBtns);

    this.cards = { idle: this.idle, count: this.count, pause: this.pausedCard, listen: this.listen, done: this.doneCard };
    this.zone = h('div', { class: 'mzone', tabindex: '-1' }, this.pad, this.goEl, ...Object.values(this.cards));

    // ───── abajo del botón grande (solo mientras se marca) ─────
    this.undoBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => this.undo() }, '↶ Deshacer');
    this.skipBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => this.skip() }, 'Saltar frase');
    this.mbtns = h('div', { class: 'mbtns' }, this.undoBtn, this.skipBtn);

    // ───── ayuda y lista de frases ─────
    this.helpTxt = h('p', {});
    this.helpTip = h('p', { class: 'tip' }, 'Con audífonos Bluetooth el sonido llega con un pequeño retraso: para marcar usa la bocina o unos audífonos con cable. Si al verlo todo queda un poco antes o después, mueve «Sincronía» en el paso 4.');
    this.help = h('details', { class: 'mhelp' }, h('summary', {}, '¿Cómo se marca?'), this.helpTxt, this.helpTip);
    // la primera vez se muestra abierta, pero solo si sobra pantalla (en teléfonos chicos se queda cerrada)
    const roomy = window.matchMedia && window.matchMedia('(min-height: 860px)').matches;
    if (lsGet('markhelp', '') !== 'seen' && roomy) this.help.open = true;
    this.help.addEventListener('toggle', () => {
      if (!this.help.open) lsSet('markhelp', 'seen');
    });

    this.list = h('ol', { class: 'plines' });
    this.plbox = h('div', { class: 'plbox' }, this.list);
    this.plsum = h('summary', {}, 'Todas las frases');
    this.plwrap = h('details', { class: 'plwrap' }, this.plsum, this.plbox);
    const narrow = window.matchMedia && window.matchMedia('(max-width: 899px), (max-aspect-ratio: 1/1), (max-height: 520px)').matches;
    this.plwrap.open = lsGet('marklist', narrow ? '0' : '1') === '1';
    this.plwrap.addEventListener('toggle', () => {
      lsSet('marklist', this.plwrap.open ? '1' : '0');
      if (this.plwrap.open) this.revealCurrent(true);
    });

    this.el = h('div', { class: 'pane markpane', 'data-phase': 'idle', 'data-mode': this.mode }, h('h2', {}, 'Marcar la letra'), this.top, this.progEl, this.stageBox, this.zone, this.mbtns, this.help, this.plwrap);

    // ───── teclado ─────
    // barra espaciadora = el botón grande. Se cancela también al soltar para que un botón con foco no se «pulse» solo.
    const typing = (tg) => tg && tg.closest && tg.closest('textarea, input:not([type=range]), select, [contenteditable]');
    window.addEventListener('keydown', (e) => {
      if (this.app.tab !== 'mark' || this.app.theaterOn) return;
      if (e.code === 'Escape') {
        if (this.cd) return this.cancelCount();
        if (this.phase === 'run') return this.pauseRun('user');
        return;
      }
      if (e.code !== 'Space' || typing(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (this.phase === 'run') this.press(e);
      else if (this.phase === 'idle' || this.phase === 'pause') {
        // fuera del botón grande, la barra espaciadora hace lo principal de la pantalla (empezar / seguir)
        if (this.locked()) return;
        if (this.phase === 'idle') this.startAction();
        else this.continuePass();
      }
      // en «todo marcado», en la cuenta y escuchando no hace nada (ahí un golpe de más no debe empezar nada)
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'Space' || this.app.tab !== 'mark' || typing(e.target)) return;
      e.preventDefault();
      this.release(e);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.app.tab === 'mark') this.leave('hidden');
    });
    // la frase actual se achica sola si no cabe (y se vuelve a acomodar si cambia el tamaño de la pantalla)
    if (window.ResizeObserver) {
      let rt = 0;
      new ResizeObserver(() => {
        cancelAnimationFrame(rt);
        rt = requestAnimationFrame(() => this.fitCurrent(true));
      }).observe(this.curEl);
    }

    app.on('reset', () => this.reset());
    app.on('state', (s, ended) => this.onState(s, ended));
    app.on('tick', () => this.tick());
    app.on('media', () => this.paint());
    app.on('clip', () => this.paintTop());
    app.on('tab', (id) => id !== 'mark' && this.leave('tab'));
    app.on('interrupted', () => this.leave('stop'));
    app.on('theater', (open) => this.onTheater(open));
    this.reset();
  }

  // ───────────── estado ─────────────
  phrases() {
    const text = this.app.project.text;
    if (this.phCache.text !== text) this.phCache = { text, ph: phrasesOf(text) };
    return this.phCache.ph;
  }

  // la primera frase todavía sin tiempo
  firstOpen() {
    const ph = this.phrases();
    const sync = this.app.project.sync;
    let p = 0;
    while (p < ph.length && sync[p] && Number.isFinite(sync[p].t)) p++;
    return { p: Math.min(p, ph.length), k: 0 };
  }

  complete() {
    const n = this.phrases().length;
    return n > 0 && this.cur.p >= n;
  }

  // ya hay frases marcadas, pero todavía faltan
  partial() {
    const n = this.phrases().length;
    return n > 0 && this.cur.p < n && syncedCount(this.app.project).done > 0;
  }

  reset() {
    this.cancelCount();
    this.dropHold();
    clearInterval(this.fadeT);
    clearTimeout(this.goT);
    this.goEl.hidden = true;
    this.pend = { wt: [], wd: [] };
    this.backup = null;
    this.fresh = false;
    this.previewing = false;
    this.pausedAt = null;
    this.reason = '';
    this.cur = this.firstOpen();
    this.phase = this.complete() ? 'done' : 'idle';
    this.clearLock();
    this.paint();
  }

  show() {
    // al volver a este paso se pone al día lo que pudo cambiar en otro (la letra, los tiempos)
    if (this.phase !== 'run' && this.phase !== 'count' && this.phase !== 'listen') {
      const n = this.phrases().length;
      if (this.cur.p > n) this.cur = { p: n, k: 0 };
      if (this.phase === 'done' && !this.complete()) this.phase = 'idle';
      else if ((this.phase === 'idle' || this.phase === 'pause') && this.complete()) this.phase = 'done';
    }
    this.paint();
    this.fitCurrent(true);
    this.revealCurrent(true);
  }

  // ───────────── el tiempo ─────────────
  // segundo de la CANCIÓN (no del tramo) en el instante del toque. `stamp` es el sello del evento (ms de la página).
  absAt(stamp) {
    const app = this.app;
    const p = app.player;
    const t = stamp > 0 ? p.timeAt(stamp / 1000) : p.time(performance.now() / 1000);
    return app.clip().start + t;
  }

  // último instante ya marcado antes de la posición actual (para no marcar hacia atrás); null si no hay
  lastMarkAbs() {
    const { p, k } = this.cur;
    if (k > 0 && this.pend.wt[k - 1] != null) return this.pend.wt[k - 1];
    const sync = this.app.project.sync;
    for (let i = p - 1; i >= 0; i--) {
      const s = sync[i];
      if (s && Number.isFinite(s.t)) return s.wt && s.wt.length ? s.wt[s.wt.length - 1] : s.t;
    }
    return null;
  }

  // dónde seguir (segundos del tramo): donde quedó la pausa, o un poco antes de la última marca
  resumePoint() {
    const app = this.app;
    let from = 0;
    if (this.phase === 'pause' && this.pausedAt != null && this.reason !== 'end') from = Math.max(0, this.pausedAt - REWIND_PAUSE);
    else {
      const last = this.lastMarkAbs();
      if (last != null) from = Math.max(0, last - app.clip().start - REWIND);
    }
    return Math.min(from, Math.max(0, app.player.dur - 1));
  }

  // ───────────── candado: después de algo que pasa solo, los botones esperan un momento ─────────────
  locked() {
    return performance.now() < this.lockUntil;
  }

  lock(ms) {
    clearTimeout(this.lockT);
    this.lockUntil = performance.now() + ms;
    this.zone.style.setProperty('--lock-ms', ms + 'ms');
    // se reinicia la animación de la barrita
    this.zone.classList.remove('locked');
    void this.zone.offsetWidth;
    this.zone.classList.add('locked');
    this.syncLock();
    this.lockT = setTimeout(() => this.clearLock(), ms);
  }

  clearLock() {
    clearTimeout(this.lockT);
    this.lockUntil = 0;
    this.zone.classList.remove('locked');
    this.syncLock();
  }

  syncLock() {
    const lk = this.locked();
    for (const b of this.zone.querySelectorAll('.mcard button')) {
      if (b === this.cancelBtn) continue;
      b.classList.toggle('wait', lk);
      b.setAttribute('aria-disabled', lk ? 'true' : 'false');
    }
  }

  setPhase(phase, lockMs = 0) {
    const was = this.phase;
    this.phase = phase;
    if (lockMs) this.lock(lockMs);
    else if (phase !== was) this.clearLock();
    this.paint();
    // si el foco estaba en lo que acaba de desaparecer, pasa a la zona para que el teclado no se pierda
    const ae = document.activeElement;
    if (ae && ae !== document.body && (ae === this.pad || ae.hidden || (ae.closest && ae.closest('[hidden]')))) {
      try {
        this.zone.focus({ preventScroll: true });
      } catch (e) {}
    }
  }

  // ───────────── cuenta regresiva ─────────────
  counting() {
    return !!this.cd;
  }

  startCount(done) {
    this.cancelCount(true);
    this.prevPhase = this.phase === 'count' ? 'idle' : this.phase;
    this.cd = { i: 0, timer: 0, done };
    this.setPhase('count');
    this.stepCount();
  }

  stepCount() {
    const cd = this.cd;
    if (!cd) return;
    const n = COUNT_FROM - cd.i;
    if (n <= 0) {
      const done = cd.done;
      this.cd = null;
      beep(990, 140, 0.09);
      buzz(30);
      this.app.showCount('¡Ya!');
      setTimeout(() => this.app.showCount(null), 520);
      done();
      return;
    }
    this.showCount(String(n));
    beep(660, 90, 0.07);
    buzz(12);
    cd.i++;
    cd.timer = setTimeout(() => this.stepCount(), COUNT_STEP);
  }

  // `quiet`: solo detener (para empezar otra cuenta enseguida)
  cancelCount(quiet = false) {
    const cd = this.cd;
    if (!cd) return;
    clearTimeout(cd.timer);
    this.cd = null;
    this.app.showCount(null);
    if (quiet) return;
    this.setPhase(this.prevPhase === 'count' ? 'idle' : this.prevPhase);
  }

  // número grande en la tarjeta y sobre el escenario (si se ve)
  showCount(txt) {
    this.cdNum.textContent = txt;
    // se reinicia la animación del número
    this.cdNum.style.animation = 'none';
    void this.cdNum.offsetWidth;
    this.cdNum.style.animation = '';
    this.cdSub.textContent = 'prepárate';
    this.count.setAttribute('aria-label', 'Cuenta regresiva ' + txt);
    this.app.showCount(txt);
  }

  // el «¡Ya!» sobre el botón grande mientras ya suena la canción
  showGo() {
    clearTimeout(this.goT);
    this.goEl.hidden = false;
    this.goEl.style.animation = 'none';
    void this.goEl.offsetWidth;
    this.goEl.style.animation = '';
    this.goT = setTimeout(() => (this.goEl.hidden = true), 620);
  }

  // ───────────── empezar, seguir, pausar ─────────────
  // lo principal de la tarjeta «sin empezar»
  startAction() {
    const app = this.app;
    if (!this.phrases().length) return app.selectTab('text');
    if (!app.media) return app.selectTab('song');
    if (this.partial()) return this.continuePass();
    this.startFresh();
  }

  // siempre desde el principio del tramo; lo anterior se respalda al empezar a sonar
  startFresh() {
    this.pend = { wt: [], wd: [] };
    this.arm(0, true);
  }

  // seguir donde se quedó (después de una pausa o de marcar a medias)
  continuePass() {
    this.arm(this.resumePoint(), false);
  }

  // empezar a sonar desde `from` (segundos del tramo), con cuenta regresiva si está activada
  arm(from, fresh) {
    const app = this.app;
    if (!app.media) return toast('Primero sube la canción (paso 1).', 'bad');
    if (!this.phrases().length) return toast('Primero escribe la letra (paso 2).', 'bad');
    this.fresh = fresh;
    this.dropHold();
    if (app.player.loopClip) app.setLoop(false); // repetir el tramo reiniciaría la canción a media marcación
    app.audioFull.pause();
    app.player.pause();
    app.player.seek(from);
    const go = () => this.goRun(from);
    if (this.countOn) this.startCount(go);
    else {
      this.prevPhase = this.phase === 'count' ? 'idle' : this.phase;
      go();
    }
  }

  goRun(from) {
    const app = this.app;
    if (this.fresh) this.freshStart();
    clearInterval(this.fadeT);
    app.audioFull.pause();
    this.reason = '';
    this.pausedAt = null;
    this.setPhase('run');
    this.showGo();
    this.starting = true;
    Promise.resolve(app.player.start(from)).finally(() => (this.starting = false));
  }

  // empezar de cero: lo que había se respalda y se quita (justo cuando empieza a sonar)
  freshStart() {
    const app = this.app;
    this.fresh = false;
    if (app.project.sync.some(Boolean)) this.backup = { sync: JSON.parse(JSON.stringify(app.project.sync)) };
    app.project.sync = [];
    this.cur = { p: 0, k: 0 };
    this.pend = { wt: [], wd: [] };
    app.projectChanged();
  }

  restoreBackup() {
    const b = this.backup;
    if (!b) return;
    this.app.project.sync = b.sync;
    this.backup = null;
    this.pend = { wt: [], wd: [] };
    this.cur = this.firstOpen();
    this.app.projectChanged();
    this.setPhase(this.complete() ? 'done' : 'idle');
    toast('Listo, recuperé los tiempos anteriores.');
  }

  // pausa que pides tú (botón ⏸, tecla Esc) o que pasa por algo (saliste de la pantalla…)
  pauseRun(reason = 'user') {
    if (this.phase !== 'run') return;
    const p = this.app.player;
    const at = p.state === 'playing' ? p.time(performance.now() / 1000) : p.t;
    this.dropHold({ finalize: true });
    clearInterval(this.fadeT);
    // (si al cerrar la palabra que tenías presionada ya quedó todo marcado, la tarjeta de «¿Quedó bien?» ya está puesta)
    if (this.phase === 'run') this.enterPause(reason, at);
    if (p.state === 'playing') p.pause();
  }

  enterPause(reason, at) {
    this.reason = reason;
    this.pausedAt = reason === 'end' ? null : at != null ? at : this.app.player.t;
    this.setPhase('pause', reason === 'user' || reason === 'undo' || reason === 'blocked' ? LOCK_USER : LOCK_AUTO);
  }

  // salir (de la pestaña, de la pantalla): todo lo que esté sonando se detiene, sin perder lo marcado
  leave(reason) {
    this.cancelCount();
    if (this.phase === 'run') this.pauseRun(reason);
    else if (this.phase === 'listen') this.stopListen();
  }

  onState(s, ended) {
    if (this.phase === 'run' && s !== 'playing') {
      // el reproductor se detuvo solo (llegó al final del tramo, el navegador no dejó sonar) o lo pausaron desde otro lado
      this.dropHold({ finalize: true, at: ended ? this.app.clip().end : undefined });
      if (this.phase === 'run') this.enterPause(ended ? 'end' : this.starting ? 'blocked' : 'stop');
    } else if (this.phase === 'listen' && s !== 'playing') {
      this.setPhase(this.complete() ? 'done' : 'idle');
    }
    this.paintTop();
  }

  // ───────────── marcar ─────────────
  press(e) {
    if (this.phase !== 'run' || this.hold) return;
    const ph = this.phrases();
    if (this.cur.p >= ph.length) return;
    const t = this.absAt(e && e.timeStamp);
    const { p, k } = this.cur;
    // después de «Deshacer» la canción regresa unos segundos: no dejar marcar antes de lo ya marcado
    const prev = this.lastMarkAbs();
    const gap = this.mode === 'phrase' ? GAP_PHRASE : GAP_WORD;
    if (prev != null && t <= prev + gap) {
      if (t < prev - 0.15) {
        const now = performance.now();
        if (!this.warnAt || now - this.warnAt > 2500) {
          this.warnAt = now;
          toast('Todavía suena lo que ya marcaste. Espera a que llegue la parte que sigue.');
        }
      }
      return; // si no, fue un doble toque: se ignora
    }
    buzz(12);
    const id = e && e.pointerId != null ? e.pointerId : null;
    if (this.mode === 'phrase') {
      // en «Solo frases» se guarda en cuanto tocas; soltar no hace nada
      this.hold = { p, k, t0: t, at: performance.now(), id, phrase: true };
      this.pad.classList.add('down');
      this.commit(p, { t: +t.toFixed(3) });
      return;
    }
    this.hold = { p, k, t0: t, at: performance.now(), id };
    this.pend.wt[k] = +t.toFixed(3);
    this.pad.classList.add('down');
    this.paintHeld();
    this.paintPad();
  }

  release(e) {
    const hd = this.hold;
    if (!hd) return;
    if (e && hd.id != null && e.pointerId != null && e.pointerId !== hd.id) return; // otro dedo
    this.hold = null;
    this.pad.classList.remove('down');
    try {
      if (hd.id != null) this.pad.releasePointerCapture(hd.id);
    } catch (err) {}
    buzz(6);
    if (hd.phrase) return this.paintPad();
    this.closeWord(hd, this.absAt(e && e.timeStamp));
  }

  // la palabra que se tenía presionada termina en `t`: sigue la siguiente o se guarda la frase
  closeWord(hd, t) {
    const ph = this.phrases();
    const { p, k } = hd;
    if (!ph[p]) return;
    const n = ph[p].words.length;
    this.pend.wd[k] = +Math.max(0.05, t - hd.t0).toFixed(3);
    if (k + 1 >= n) {
      const { wt, wd } = this.pend;
      this.pend = { wt: [], wd: [] };
      this.commit(p, { t: wt[0], wt: wt.slice(0, n), wd: wd.slice(0, n) });
    } else {
      this.cur = { p, k: k + 1 };
      this.paint();
    }
  }

  // se quita el dedo de donde estaba (sin marcar nada más). `finalize`: la palabra que estaba presionada se cierra en ese instante
  dropHold(opts) {
    const hd = this.hold;
    if (!hd) return;
    this.hold = null;
    this.pad.classList.remove('down');
    try {
      if (hd.id != null) this.pad.releasePointerCapture(hd.id);
    } catch (e) {}
    if (hd.phrase) return;
    if (opts && opts.finalize) this.closeWord(hd, opts.at != null ? opts.at : this.absAt());
    else {
      // se descarta el inicio de esa palabra (no llegó a terminar)
      this.pend.wt.length = Math.min(this.pend.wt.length, hd.k);
      this.pend.wd.length = Math.min(this.pend.wd.length, hd.k);
    }
  }

  commit(p, entry) {
    const app = this.app;
    app.project.sync[p] = entry;
    this.cur = { p: p + 1, k: 0 };
    app.projectChanged();
    this.paint();
    this.flash(p);
    if (this.cur.p >= this.phrases().length) this.finishPass();
  }

  // se marcó la última frase: la música se apaga suave y aparece «¿Quedó bien?» (con un momento de espera)
  finishPass() {
    this.dropHold();
    this.fadeStop();
    this.reason = 'finished';
    this.setPhase('done', LOCK_AUTO);
    buzz([40, 50, 40]);
  }

  fadeStop(ms = 500) {
    const p = this.app.player;
    const a = p.audio;
    clearInterval(this.fadeT);
    if (p.state !== 'playing') return;
    const t0 = performance.now();
    this.fadeT = setInterval(() => {
      const u = Math.min(1, (performance.now() - t0) / ms);
      try {
        a.volume = Math.max(0, 1 - u);
      } catch (e) {}
      if (u >= 1) {
        clearInterval(this.fadeT);
        this.fadeT = 0;
        if (p.state === 'playing') p.pause();
        try {
          a.volume = 1;
        } catch (e) {}
      }
    }, 40);
  }

  flash(p) {
    const r = this.rows[p];
    if (!r) return;
    r.li.classList.remove('flash');
    void r.li.offsetWidth;
    r.li.classList.add('flash');
  }

  // si hay una frase a medias, la guarda al menos con su inicio
  flush() {
    const { wt } = this.pend;
    if (wt.length && wt[0] != null) {
      this.app.project.sync[this.cur.p] = { t: wt[0] };
      this.cur = { p: this.cur.p + 1, k: 0 };
      this.pend = { wt: [], wd: [] };
      this.app.projectChanged();
    }
  }

  skip() {
    if (this.phase !== 'run') return;
    const ph = this.phrases();
    if (this.cur.p >= ph.length) return;
    this.dropHold();
    this.pend = { wt: [], wd: [] };
    this.app.project.sync[this.cur.p] = null;
    this.cur = { p: this.cur.p + 1, k: 0 };
    this.paint();
    if (this.cur.p >= ph.length) this.finishPass();
  }

  undo() {
    const app = this.app;
    if (this.phase === 'count') return;
    const clip0 = app.clip().start;
    const run = this.phase === 'run';
    let back = null;
    this.dropHold();
    if (this.pend.wt.length) {
      // hay una palabra a medias (se presionó pero no se soltó) o ya soltada
      const idx = this.pend.wt.length - 1;
      back = this.pend.wt[idx];
      this.pend.wt.length = idx;
      this.pend.wd.length = Math.min(this.pend.wd.length, idx);
      this.cur = { p: this.cur.p, k: idx };
    } else {
      let p = this.cur.p - 1;
      const sync = app.project.sync;
      while (p >= 0 && !sync[p]) p--;
      if (p < 0) return toast('No hay nada que deshacer.');
      const s = sync[p];
      const n = this.phrases()[p].words.length;
      back = s.t;
      if (s.wt && s.wt.length === n) {
        this.pend = { wt: s.wt.slice(0, n - 1), wd: (s.wd || []).slice(0, n - 1) };
        this.cur = { p, k: n - 1 };
        back = s.wt[n - 1];
      } else this.cur = { p, k: 0 };
      sync[p] = null;
      app.projectChanged();
    }
    const to = Math.max(0, back - clip0 - 1.6);
    if (run) {
      // sigue sonando, pero unos segundos antes de lo que se quitó
      this.paint();
      app.player.seek(to);
      if (app.player.state !== 'playing') app.player.resume();
    } else {
      // sin empezar o en pausa: se queda quieto, listo para seguir desde ahí
      this.pausedAt = to + REWIND_PAUSE;
      this.reason = 'undo';
      this.setPhase('pause', LOCK_USER);
    }
  }

  jump(i, restart) {
    // (la lista queda lejos del botón grande: un toque ahí es a propósito, no un reflejo; no espera)
    if (this.phase === 'run' || this.phase === 'count') return;
    this.flush();
    const app = this.app;
    const s = app.project.sync[i];
    const clip0 = app.clip().start;
    if (restart) {
      const from = s ? Math.max(0, s.t - clip0 - 2) : this.resumePoint();
      app.project.sync[i] = null;
      this.cur = { p: i, k: 0 };
      this.pend = { wt: [], wd: [] };
      app.projectChanged();
      this.phase = 'idle';
      this.paint();
      this.arm(from, false);
    } else if (s) {
      const t = s.t - clip0;
      if (t < -0.5 || t > app.player.dur) return toast('Esa frase queda fuera del tramo elegido.', 'bad');
      app.audioFull.pause();
      this.listenFrom = i;
      this.setPhase('listen');
      app.player.start(Math.max(0, t - 1));
    }
  }

  stopListen() {
    const p = this.app.player;
    if (p.state === 'playing') p.pause();
    p.seek(0);
    if (this.phase === 'listen') this.setPhase(this.complete() ? 'done' : 'idle');
  }

  // ───────────── cuando todo está marcado ─────────────
  // la vista previa es la pantalla completa, desde el principio, con lo que acabas de marcar
  previewMarked() {
    const app = this.app;
    if (app.theaterOn) return;
    this.previewing = true;
    app.audioFull.pause();
    if (app.player.loopClip) app.setLoop(false);
    app.demoHold = false;
    app.player.start(0);
    app.openTheater();
  }

  onTheater(open) {
    if (open || !this.previewing) return;
    this.previewing = false;
    const p = this.app.player;
    if (p.state === 'playing') p.pause();
    p.seek(0);
    if (this.app.tab === 'mark') this.paint();
  }

  goNext() {
    this.app.selectTab('style');
  }

  // ───────────── dibujo ─────────────
  tick() {
    if (this.app.tab !== 'mark') return;
    const p = this.app.player;
    const dur = p.dur || 0;
    const t = Math.max(0, Math.min(dur || 1e9, p.time(performance.now() / 1000)));
    const clock = `${fmtTime(t)} / ${fmtTime(dur)}`;
    if (clock !== this.shown.clock) {
      this.shown.clock = clock;
      this.clockEl.textContent = clock;
    }
    const w = dur ? Math.round((t / dur) * 1000) / 10 : 0;
    if (w !== this.shown.prog) {
      this.shown.prog = w;
      this.progEl.firstChild.style.width = w + '%';
    }
    if (this.hold && !this.hold.phrase) {
      const el = (performance.now() - this.hold.at) / 1000;
      const min = this.app.project.style.holdMin ?? HELD_MIN;
      this.padBar.style.width = Math.min(100, (el / Math.max(min, 0.01)) * 100) + '%';
      this.padSub.textContent = el >= min ? `${el.toFixed(1)} s · palabra larga: se va a estirar` : `${el.toFixed(1)} s`;
    }
  }

  // textos de arriba y botón de pausa
  paintTop() {
    const ph = this.phrases();
    const n = ph.length;
    const sc = syncedCount(this.app.project);
    const at = Math.min(this.cur.p + 1, Math.max(n, 1));
    let txt = '';
    switch (this.phase) {
      case 'idle':
        txt = n ? `${plural(n, 'frase', 'frases')} · tramo de ${fmtTime(this.app.player.dur || 0)}` : 'Todavía no hay letra';
        break;
      case 'count':
        txt = 'Prepárate…';
        break;
      case 'run':
        txt = `Frase ${at} de ${n}`;
        break;
      case 'pause':
        txt = `En pausa · frase ${at} de ${n}`;
        break;
      case 'listen':
        txt = 'Escuchando';
        break;
      case 'done':
        txt = `${sc.done} de ${sc.total} frases con tiempo`;
        break;
    }
    if (txt !== this.shown.stat) {
      this.shown.stat = txt;
      this.statEl.textContent = txt;
    }
    this.statEl.setAttribute('aria-live', this.phase === 'run' ? 'off' : 'polite');
    this.pauseBtn.hidden = this.phase !== 'run';
  }

  // el botón grande
  paintPad() {
    const ph = this.phrases();
    const word = ph[this.cur.p] ? ph[this.cur.p].words[this.cur.k] : '';
    this.padBar.style.width = '0%';
    if (this.hold && !this.hold.phrase) {
      this.padTxt.textContent = 'Suelta al terminar';
      this.pad.setAttribute('aria-label', 'Suelta cuando termine de sonar la palabra');
    } else if (this.mode === 'word') {
      this.padTxt.textContent = 'Mantén';
      this.padSub.textContent = word ? `presionado al empezar «${word}»; suelta cuando termine` : 'presionado mientras suena cada palabra';
      this.pad.setAttribute('aria-label', 'Mantén presionado mientras suena la palabra' + (word ? ' ' + word : ''));
    } else {
      this.padTxt.textContent = 'Toca';
      this.padSub.textContent = 'justo cuando empiece la frase';
      this.pad.setAttribute('aria-label', 'Toca cuando empiece la frase');
    }
  }

  // la palabra de la frase que se está sosteniendo
  paintHeld() {
    const kids = this.curWrap.children;
    const k = this.hold && !this.hold.phrase ? this.hold.k : -1;
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('held', i === k);
  }

  // la frase que sigues (y la anterior y la siguiente, tenues)
  paintStage() {
    const ph = this.phrases();
    const c = this.cur;
    const pv = c.p - 1 >= 0 && ph[c.p - 1] ? ph[c.p - 1].text : '';
    const nx = ph[c.p + 1] ? ph[c.p + 1].text : '';
    if (pv !== this.shown.prev) {
      this.shown.prev = pv;
      this.prevEl.textContent = pv || ' ';
    }
    if (nx !== this.shown.nxt) {
      this.shown.nxt = nx;
      this.nxtEl.textContent = nx || ' ';
    }
    const key = c.p + '|' + c.k + '|' + this.mode + '|' + (ph[c.p] ? ph[c.p].text : '') + '|' + ph.length;
    if (key !== this.shown.cur) {
      const newPhrase = this.shown.curP !== c.p;
      this.shown.cur = key;
      this.shown.curP = c.p;
      if (ph.length && c.p < ph.length) {
        this.curWrap.replaceChildren(
          ...ph[c.p].words.map((w, k) => {
            const st = k < c.k ? 'done' : k === c.k ? 'now' : 'next';
            return h('span', { class: 'mw ' + (this.mode === 'word' ? st : 'next') }, w);
          }),
        );
        this.curEl.classList.remove('empty');
        if (newPhrase) {
          this.curEl.classList.remove('swap');
          void this.curEl.offsetWidth;
          this.curEl.classList.add('swap');
        }
      } else {
        this.curWrap.textContent = ph.length ? 'Todas las frases tienen tiempo ✓' : 'Escribe la letra en el paso 2';
        this.curEl.classList.add('empty');
      }
      this.fitCurrent(true);
    }
    this.paintHeld();
  }

  // la letra se achica sola si no cabe, para que la caja nunca cambie de tamaño
  fitCurrent(force = false) {
    const box = this.curEl;
    const w = box.clientWidth;
    const hh = box.clientHeight;
    if (!w || !hh) return;
    const key = w + 'x' + hh + '|' + this.shown.cur;
    if (!force && key === this.fitKey) return;
    this.fitKey = key;
    let fs = Math.max(20, Math.min(46, Math.round(w / 9.5)));
    box.style.setProperty('--cur-fs', fs + 'px');
    while (fs > 13 && this.curWrap.offsetHeight > hh + 1) {
      fs -= 1;
      box.style.setProperty('--cur-fs', fs + 'px');
    }
  }

  // la zona de abajo: el botón grande o la tarjeta que toca
  paintZone() {
    const ph = this.phase;
    const app = this.app;
    const n = this.phrases().length;
    const sc = syncedCount(app.project);
    this.el.dataset.phase = ph;
    this.el.dataset.mode = this.mode;
    this.pad.hidden = ph !== 'run';
    for (const [k, c] of Object.entries(this.cards)) c.hidden = k !== ph;
    this.mbtns.hidden = ph !== 'run';
    this.mbtns.classList.toggle('off', ph !== 'run');
    // las opciones (cómo marcar, cuenta regresiva) y «recuperar» viajan a la tarjeta que se ve
    const host = ph === 'idle' ? this.idle : ph === 'pause' ? this.pausedCard : ph === 'done' ? this.doneCard : null;
    this.opts.hidden = !host || ph === 'done';
    this.restoreBtn.hidden = !host || !this.backup;
    if (host) {
      if (this.restoreBtn.parentNode !== host) host.append(this.restoreBtn);
      if (ph !== 'done' && this.opts.parentNode !== host) host.append(this.opts);
    }
    if (ph === 'run') this.paintPad();
    else if (ph === 'idle') {
      const noText = !n;
      const noSong = !app.media;
      const partial = this.partial();
      this.freshBtn.hidden = !partial || noSong;
      if (noText) {
        this.idleTitle.textContent = 'Primero escribe la letra';
        this.idleNote.textContent = 'Escribe o pega las frases en el paso 2 y aquí las marcas mientras suena la canción.';
        this.startBtn.textContent = 'Ir a escribir la letra';
      } else if (noSong) {
        this.idleTitle.textContent = 'Primero sube la canción';
        this.idleNote.textContent = 'Súbela en el paso 1 y vuelve aquí a marcar la letra.';
        this.startBtn.textContent = 'Ir a subir la canción';
      } else if (partial) {
        this.idleTitle.textContent = `Ya marcaste ${sc.done} de ${n}`;
        this.idleNote.textContent = `Sigue desde la frase ${this.cur.p + 1} (la canción regresa un poquito) o empieza otra vez desde el principio.`;
        this.startBtn.textContent = `▶ Seguir con la frase ${this.cur.p + 1}`;
      } else {
        this.idleTitle.textContent = this.mode === 'word' ? 'Mantén presionado en cada palabra' : 'Toca cuando empiece cada frase';
        this.idleNote.textContent = (this.countOn ? 'Cuenta 3, 2, 1 y la canción suena desde el principio del tramo.' : 'La canción suena desde el principio del tramo.') + ' La frase que sigues aparece arriba.';
        this.startBtn.textContent = '▶ Empezar a marcar';
      }
    } else if (ph === 'count') {
      this.cdSub.textContent = 'prepárate';
    } else if (ph === 'pause') {
      const left = n - sc.done;
      const why = {
        user: 'En pausa',
        end: 'Se acabó el tramo',
        tab: 'Pausé la canción',
        hidden: 'Pausé la canción',
        stop: 'En pausa',
        blocked: 'El navegador no dejó sonar',
        undo: 'Quité la última marca',
      }[this.reason] || 'En pausa';
      this.pauseTitle.textContent = why;
      this.pauseNote.textContent =
        this.reason === 'end'
          ? left > 0
            ? `Faltan ${plural(left, 'frase', 'frases')} por marcar. Sigue desde la última o empieza otra vez.`
            : 'Ya no faltan frases.'
          : this.reason === 'blocked'
            ? 'Toca «Seguir» para que vuelva a sonar.'
            : this.reason === 'undo'
              ? 'Sigue desde unos segundos antes de esa palabra.'
              : `Vas en la frase ${Math.min(this.cur.p + 1, n)} de ${n}. Lo que ya marcaste se queda.`;
      this.undoPauseBtn.disabled = this.fresh || !(this.pend.wt.length || sc.done);
      this.freshPauseBtn.hidden = !sc.done && !this.pend.wt.length;
    } else if (ph === 'listen') {
      this.listenTitle.textContent = this.listenFrom != null ? `Escuchando desde la frase ${this.listenFrom + 1}` : 'Escuchando';
    } else if (ph === 'done') {
      const skipped = n - sc.done;
      this.doneTitle.querySelector('.mtxt').textContent = skipped > 0 ? `Quedaron ${plural(skipped, 'frase', 'frases')} sin tiempo` : n === 1 ? '¡Listo! Marcaste la frase' : `¡Listo! Marcaste las ${n} frases`;
      this.undoDoneBtn.disabled = !(this.pend.wt.length || sc.done);
    }
    this.syncLock();
  }

  paintList() {
    const ph = this.phrases();
    const sync = this.app.project.sync;
    const c = this.cur;
    const sig = ph.map((p) => p.text).join('\n');
    if (sig !== this.listSig) {
      this.listSig = sig;
      this.rows = ph.map((p, i) => {
        const time = h('span', { class: 'ptime' }, '—');
        const txt = h('span', { class: 'ptxt' }, p.text);
        const em = h('em', {}, ' ·palabras');
        const play = h('button', { class: 'mini', type: 'button', 'aria-label': 'Escuchar desde la frase ' + (i + 1), onclick: () => this.jump(i, false) }, '▶');
        const redo = h('button', { class: 'mini', type: 'button', 'aria-label': 'Volver a marcar desde la frase ' + (i + 1), title: 'Volver a marcar desde aquí', onclick: () => this.jump(i, true) }, '↻');
        const li = h('li', { class: 'pline' }, time, txt, play, redo);
        return { li, time, txt, em, play, redo, emOn: false, tShown: '—' };
      });
      this.list.replaceChildren(...this.rows.map((r) => r.li));
    }
    this.rows.forEach((r, i) => {
      const s = sync[i];
      const t = s ? fmtTimeMs(s.t) : '—';
      if (t !== r.tShown) {
        r.time.textContent = t;
        r.tShown = t;
      }
      const wl = !!(s && s.wt);
      if (wl !== r.emOn) {
        if (wl) r.txt.append(r.em);
        else r.em.remove();
        r.emOn = wl;
      }
      r.li.classList.toggle('cur', i === c.p);
      r.li.classList.toggle('ok', !!s);
      r.play.disabled = !s;
    });
    const sc = syncedCount(this.app.project);
    this.plsum.replaceChildren('Todas las frases', h('span', { class: 'muted' }, ph.length ? ` (${sc.done}/${sc.total})` : ''));
  }

  // mueve SOLO la caja de la lista (nunca la página ni el panel) para que se vea la frase actual
  revealCurrent(force = false) {
    const box = this.plbox;
    const r = this.rows[this.cur.p];
    if (!r || !this.plwrap.open || !box.clientHeight) return;
    const top = r.li.offsetTop;
    const bottom = top + r.li.offsetHeight;
    const vis0 = box.scrollTop;
    const vis1 = vis0 + box.clientHeight;
    if (force || top < vis0 + 2 || bottom > vis1 - 2) box.scrollTop = Math.max(0, top - box.clientHeight * 0.3);
  }

  paint() {
    this.helpTxt.textContent =
      this.mode === 'word'
        ? 'Mantén presionado el botón grande (o la barra espaciadora) desde que empieza cada palabra y suelta cuando termina de sonar. Una palabra larga se estira en pantalla durante todo ese tiempo.'
        : 'Toca el botón grande (o la barra espaciadora) justo cuando empiece cada frase. Los tiempos de cada palabra los reparto yo.';
    this.paintTop();
    this.paintStage();
    this.paintList();
    this.paintZone();
    this.undoBtn.disabled = !(this.pend.wt.length || this.app.project.sync.some(Boolean)) || this.fresh;
    this.skipBtn.disabled = this.cur.p >= this.phrases().length;
    if (this.cur.p !== this.lastCurP) {
      this.lastCurP = this.cur.p;
      this.revealCurrent();
    }
  }
}
