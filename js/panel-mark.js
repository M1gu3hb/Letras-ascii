import * as Session from './mark/session.js';
import { buildView } from './mark/view.js';
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
import { h } from './ui.js';
import { phrasesOf, fmtTime, fmtTimeMs, syncedCount } from './project.js';
import { HELD_MIN } from './timeline.js';

import { lsGet, plural, disposeBeep } from './mark/support.js';

export class MarkPanel {
  constructor(app) {
    this.app = app;
    this.mode = lsGet('markmode', 'phrase');
    if (!['word','phrase'].includes(this.mode)) this.mode = 'phrase';
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

    buildView(this);

    // ───── teclado ─────
    // barra espaciadora = el botón grande. Se cancela también al soltar para que un botón con foco no se «pulse» solo.
    const typing = (tg) => tg && tg.closest && tg.closest('textarea, input:not([type=range]), select, [contenteditable]');
    app.scope.listen(window, 'keydown', (e) => {
      if (this.app.tab !== 'mark' || this.app.theaterOn) return;
      if (e.code === 'Escape') {
        if (this.cd) return this.cancelCount();
        if (this.phase === 'run') return this.pauseRun('user');
        return;
      }
      if (e.code !== 'Space' || typing(e.target)) return;
      if (this.phase !== 'run' && e.target.closest?.('button') && e.target !== this.pad) return;
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
    app.scope.listen(window, 'keyup', (e) => {
      if (e.code !== 'Space' || this.app.tab !== 'mark' || typing(e.target)) return;
      e.preventDefault();
      this.release(e);
    });
    app.scope.listen(document, 'visibilitychange', () => {
      if (document.hidden && this.app.tab === 'mark') this.leave('hidden');
    });
    // la frase actual se achica sola si no cabe (y se vuelve a acomodar si cambia el tamaño de la pantalla)
    if (window.ResizeObserver) {
      let rt = 0;
      app.scope.observe(new ResizeObserver(() => {
        cancelAnimationFrame(rt);
        rt = requestAnimationFrame(() => this.fitCurrent(true));
      }), this.curEl);
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
  absAt(...args) { return Session.absAt(this, ...args); }
  lastMarkAbs(...args) { return Session.lastMarkAbs(this, ...args); }
  resumePoint(...args) { return Session.resumePoint(this, ...args); }
  locked(...args) { return Session.locked(this, ...args); }
  lock(...args) { return Session.lock(this, ...args); }
  clearLock(...args) { return Session.clearLock(this, ...args); }
  syncLock(...args) { return Session.syncLock(this, ...args); }
  setPhase(...args) { return Session.setPhase(this, ...args); }
  counting(...args) { return Session.counting(this, ...args); }
  startCount(...args) { return Session.startCount(this, ...args); }
  stepCount(...args) { return Session.stepCount(this, ...args); }
  cancelCount(...args) { return Session.cancelCount(this, ...args); }
  showCount(...args) { return Session.showCount(this, ...args); }
  showGo(...args) { return Session.showGo(this, ...args); }
  startAction(...args) { return Session.startAction(this, ...args); }
  startFresh(...args) { return Session.startFresh(this, ...args); }
  continuePass(...args) { return Session.continuePass(this, ...args); }
  arm(...args) { return Session.arm(this, ...args); }
  goRun(...args) { return Session.goRun(this, ...args); }
  freshStart(...args) { return Session.freshStart(this, ...args); }
  restoreBackup(...args) { return Session.restoreBackup(this, ...args); }
  pauseRun(...args) { return Session.pauseRun(this, ...args); }
  enterPause(...args) { return Session.enterPause(this, ...args); }
  leave(...args) { return Session.leave(this, ...args); }
  onState(...args) { return Session.onState(this, ...args); }
  press(...args) { return Session.press(this, ...args); }
  release(...args) { return Session.release(this, ...args); }
  closeWord(...args) { return Session.closeWord(this, ...args); }
  dropHold(...args) { return Session.dropHold(this, ...args); }
  commit(...args) { return Session.commit(this, ...args); }
  finishPass(...args) { return Session.finishPass(this, ...args); }
  fadeStop(...args) { return Session.fadeStop(this, ...args); }
  flash(...args) { return Session.flash(this, ...args); }
  flush(...args) { return Session.flush(this, ...args); }
  skip(...args) { return Session.skip(this, ...args); }
  undo(...args) { return Session.undo(this, ...args); }
  jump(...args) { return Session.jump(this, ...args); }
  stopListen(...args) { return Session.stopListen(this, ...args); }
  previewMarked(...args) { return Session.previewMarked(this, ...args); }
  onTheater(...args) { return Session.onTheater(this, ...args); }
  goNext(...args) { return Session.goNext(this, ...args); }
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
      this.padTxt.textContent = 'Marcar palabra';
      this.padSub.textContent = word ? `presionado al empezar «${word}»; suelta cuando termine` : 'presionado mientras suena cada palabra';
      this.pad.setAttribute('aria-label', 'Mantén presionado mientras suena la palabra' + (word ? ' ' + word : ''));
    } else {
      this.padTxt.textContent = 'Marcar frase';
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
    this.optsToggle.textContent = `${this.mode === 'word' ? 'Por palabras' : 'Por frases'} · ${this.countOn ? 'cuenta 3, 2, 1' : 'sin cuenta'}`;
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
            ? 'Toca «Seguir» para empezar ahora, sin cuenta regresiva.'
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
  destroy() { this.leave('destroy'); this.clearLock(); clearInterval(this.fadeT); clearTimeout(this.goT); this.cancelCount(true); disposeBeep(); }

}
