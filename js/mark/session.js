import { toast } from '../ui.js';


import { COUNT_FROM, COUNT_STEP, LOCK_AUTO, LOCK_USER, REWIND, REWIND_PAUSE, GAP_WORD, GAP_PHRASE, buzz, beep } from './support.js';
export function absAt(self, stamp) {
    const app = self.app;
    const p = app.player;
    const t = stamp > 0 ? p.timeAt(stamp / 1000) : p.time(performance.now() / 1000);
    return app.clip().start + t;
}

export function lastMarkAbs(self) {
    const { p, k } = self.cur;
    if (k > 0 && self.pend.wt[k - 1] != null) return self.pend.wt[k - 1];
    const sync = self.app.project.sync;
    for (let i = p - 1; i >= 0; i--) {
      const s = sync[i];
      if (s && Number.isFinite(s.t)) return s.wt && s.wt.length ? s.wt[s.wt.length - 1] : s.t;
    }
    return null;
}

export function resumePoint(self) {
    const app = self.app;
    let from = 0;
    if (self.phase === 'pause' && self.pausedAt != null && self.reason !== 'end') from = Math.max(0, self.pausedAt - REWIND_PAUSE);
    else {
      const last = self.lastMarkAbs();
      if (last != null) from = Math.max(0, last - app.clip().start - REWIND);
    }
    return Math.min(from, Math.max(0, app.player.dur - 1));
}

export function locked(self) {
    return performance.now() < self.lockUntil;
}

export function lock(self, ms) {
    clearTimeout(self.lockT);
    self.lockUntil = performance.now() + ms;
    self.zone.style.setProperty('--lock-ms', ms + 'ms');
    // se reinicia la animación de la barrita
    self.zone.classList.remove('locked');
    void self.zone.offsetWidth;
    self.zone.classList.add('locked');
    self.syncLock();
    self.lockT = setTimeout(() => self.clearLock(), ms);
}

export function clearLock(self) {
    clearTimeout(self.lockT);
    self.lockUntil = 0;
    self.zone.classList.remove('locked');
    self.syncLock();
}

export function syncLock(self) {
    const lk = self.locked();
    for (const b of self.zone.querySelectorAll('.mcard button')) {
      if (b === self.cancelBtn) continue;
      b.classList.toggle('wait', lk);
      b.setAttribute('aria-disabled', lk ? 'true' : 'false');
    }
}

export function setPhase(self, phase, lockMs = 0) {
    const was = self.phase;
    self.phase = phase;
    if (lockMs) self.lock(lockMs);
    else if (phase !== was) self.clearLock();
    self.paint();
    // si el foco estaba en lo que acaba de desaparecer, pasa a la zona para que el teclado no se pierda
    const ae = document.activeElement;
    if (ae && ae !== document.body && (ae === self.pad || ae.hidden || (ae.closest && ae.closest('[hidden]')))) {
      try {
        self.zone.focus({ preventScroll: true });
      } catch (e) {}
    }
}

export function counting(self) {
    return !!self.cd;
}

export function startCount(self, done) {
    self.cancelCount(true);
    self.prevPhase = self.phase === 'count' ? 'idle' : self.phase;
    self.cd = { i: 0, timer: 0, done };
    self.setPhase('count');
    self.stepCount();
}

export function stepCount(self) {
    const cd = self.cd;
    if (!cd) return;
    const n = COUNT_FROM - cd.i;
    if (n <= 0) {
      const done = cd.done;
      self.cd = null;
      beep(990, 140, 0.09);
      buzz(30);
      self.app.showCount('¡Ya!');
      setTimeout(() => self.app.showCount(null), 520);
      done();
      return;
    }
    self.showCount(String(n));
    beep(660, 90, 0.07);
    buzz(12);
    cd.i++;
    cd.timer = setTimeout(() => self.stepCount(), COUNT_STEP);
}

export function cancelCount(self, quiet = false) {
    if (!quiet) self.pendingStart = null;
    const cd = self.cd;
    if (!cd) return;
    clearTimeout(cd.timer);
    self.cd = null;
    self.app.showCount(null);
    if (quiet) return;
    self.setPhase(self.prevPhase === 'count' ? 'idle' : self.prevPhase);
}

export function showCount(self, txt) {
    self.cdNum.textContent = txt;
    // se reinicia la animación del número
    self.cdNum.style.animation = 'none';
    void self.cdNum.offsetWidth;
    self.cdNum.style.animation = '';
    self.cdSub.textContent = 'prepárate';
    self.count.setAttribute('aria-label', 'Cuenta regresiva ' + txt);
    self.app.showCount(txt);
}

export function showGo(self) {
    clearTimeout(self.goT);
    self.goEl.hidden = false;
    self.goEl.style.animation = 'none';
    void self.goEl.offsetWidth;
    self.goEl.style.animation = '';
    self.goT = setTimeout(() => (self.goEl.hidden = true), 620);
}

export function startAction(self) {
    const app = self.app;
    if (!self.phrases().length) return app.selectTab('text');
    if (!app.media) return app.selectTab('song');
    if (self.partial()) return self.continuePass();
    self.startFresh();
}

export function startFresh(self) {
    self.pend = { wt: [], wd: [] };
    self.arm(0, true);
}

export function continuePass(self) {
    self.arm(self.resumePoint(), self.reason === 'blocked' && self.fresh, undefined, self.reason === 'blocked');
}

export function arm(self, from, fresh, prepare, immediate = false) {
    const app = self.app;
    if (!app.media) return toast('Primero sube la canción (paso 1).', 'bad');
    if (!self.phrases().length) return toast('Primero escribe la letra (paso 2).', 'bad');
    self.fresh = fresh;
    self.dropHold();
    if (app.player.loopClip) app.setLoop(false); // repetir el tramo reiniciaría la canción a media marcación
    app.audioFull.pause();
    app.player.pause();
    app.player.seek(from);
    const token = self.pendingStart = {};
    const run = () => {
      if (self.pendingStart !== token || app.destroyed || app.tab !== 'mark') return;
      self.pendingStart = null;
      prepare?.(); self.goRun(from);
    };
    if (self.countOn && !immediate) {
      const activation = app.player.prepareGesture();
      self.startCount(() => activation.then((ready) => {
        if (self.pendingStart !== token) return;
        if (ready) run();
        else { self.pendingStart = null; self.enterPause('blocked'); }
      }));
    } else {
      self.prevPhase = self.phase === 'count' ? 'idle' : self.phase;
      run();
    }
}

export function goRun(self, from) {
    const app = self.app;
    if (self.fresh) self.freshStart();
    clearInterval(self.fadeT);
    app.audioFull.pause();
    self.reason = '';
    self.pausedAt = null;
    self.setPhase('run');
    self.showGo();
    self.starting = true;
    Promise.resolve(app.player.start(from)).finally(() => (self.starting = false));
}

export function freshStart(self) {
    const app = self.app;
    self.fresh = false;
    if (app.project.sync.some(Boolean)) self.backup = { sync: JSON.parse(JSON.stringify(app.project.sync)) };
    app.project.sync = [];
    self.cur = { p: 0, k: 0 };
    self.pend = { wt: [], wd: [] };
    app.projectChanged();
}

export function restoreBackup(self) {
    const b = self.backup;
    if (!b) return;
    self.app.project.sync = b.sync;
    self.backup = null;
    self.pend = { wt: [], wd: [] };
    self.cur = self.firstOpen();
    self.app.projectChanged();
    self.setPhase(self.complete() ? 'done' : 'idle');
    toast('Listo, recuperé los tiempos anteriores.');
}

export function pauseRun(self, reason = 'user') {
    if (self.phase !== 'run') return;
    const p = self.app.player;
    const at = p.state === 'playing' ? p.time(performance.now() / 1000) : p.t;
    self.dropHold({ finalize: true });
    clearInterval(self.fadeT);
    // (si al cerrar la palabra que tenías presionada ya quedó todo marcado, la tarjeta de «¿Quedó bien?» ya está puesta)
    if (self.phase === 'run') self.enterPause(reason, at);
    if (p.state === 'playing') p.pause();
}

export function enterPause(self, reason, at) {
    self.reason = reason;
    self.pausedAt = reason === 'end' ? null : at != null ? at : self.app.player.t;
    self.setPhase('pause', reason === 'user' || reason === 'undo' || reason === 'blocked' ? LOCK_USER : LOCK_AUTO);
}

export function leave(self, reason) {
    self.cancelCount();
    if (self.phase === 'run') self.pauseRun(reason);
    else if (self.phase === 'listen') self.stopListen();
}

export function onState(self, s, ended) {
    if (self.phase === 'run' && s !== 'playing') {
      // el reproductor se detuvo solo (llegó al final del tramo, el navegador no dejó sonar) o lo pausaron desde otro lado
      self.dropHold({ finalize: true, at: ended ? self.app.clip().end : undefined });
      if (self.phase === 'run') self.enterPause(ended ? 'end' : self.starting ? 'blocked' : 'stop');
    } else if (self.phase === 'listen' && s !== 'playing') {
      self.setPhase(self.complete() ? 'done' : 'idle');
    }
    self.paintTop();
}

export function press(self, e) {
    if (self.phase !== 'run' || self.hold) return;
    const ph = self.phrases();
    if (self.cur.p >= ph.length) return;
    const t = self.absAt(e && e.timeStamp);
    const { p, k } = self.cur;
    // después de «Deshacer» la canción regresa unos segundos: no dejar marcar antes de lo ya marcado
    const prev = self.lastMarkAbs();
    const gap = self.mode === 'phrase' ? GAP_PHRASE : GAP_WORD;
    if (prev != null && t <= prev + gap) {
      if (t < prev - 0.15) {
        const now = performance.now();
        if (!self.warnAt || now - self.warnAt > 2500) {
          self.warnAt = now;
          toast('Todavía suena lo que ya marcaste. Espera a que llegue la parte que sigue.');
        }
      }
      return; // si no, fue un doble toque: se ignora
    }
    buzz(12);
    const id = e && e.pointerId != null ? e.pointerId : null;
    if (self.mode === 'phrase') {
      // en «Solo frases» se guarda en cuanto tocas; soltar no hace nada
      self.hold = { p, k, t0: t, at: performance.now(), id, phrase: true };
      self.pad.classList.add('down');
      self.commit(p, { t: +t.toFixed(3) });
      return;
    }
    self.hold = { p, k, t0: t, at: performance.now(), id };
    self.pend.wt[k] = +t.toFixed(3);
    self.pad.classList.add('down');
    self.paintHeld();
    self.paintPad();
}

export function release(self, e) {
    const hd = self.hold;
    if (!hd) return;
    if (e && hd.id != null && e.pointerId != null && e.pointerId !== hd.id) return; // otro dedo
    self.hold = null;
    self.pad.classList.remove('down');
    try {
      if (hd.id != null) self.pad.releasePointerCapture(hd.id);
    } catch (err) {}
    buzz(6);
    if (hd.phrase) return self.paintPad();
    self.closeWord(hd, self.absAt(e && e.timeStamp));
}

export function closeWord(self, hd, t) {
    const ph = self.phrases();
    const { p, k } = hd;
    if (!ph[p]) return;
    const n = ph[p].words.length;
    self.pend.wd[k] = +Math.max(0.05, t - hd.t0).toFixed(3);
    if (k + 1 >= n) {
      const { wt, wd } = self.pend;
      self.pend = { wt: [], wd: [] };
      self.commit(p, { t: wt[0], wt: wt.slice(0, n), wd: wd.slice(0, n) });
    } else {
      self.cur = { p, k: k + 1 };
      self.paint();
    }
}

export function dropHold(self, opts) {
    const hd = self.hold;
    if (!hd) return;
    self.hold = null;
    self.pad.classList.remove('down');
    try {
      if (hd.id != null) self.pad.releasePointerCapture(hd.id);
    } catch (e) {}
    if (hd.phrase) return;
    if (opts && opts.finalize) self.closeWord(hd, opts.at != null ? opts.at : self.absAt());
    else {
      // se descarta el inicio de esa palabra (no llegó a terminar)
      self.pend.wt.length = Math.min(self.pend.wt.length, hd.k);
      self.pend.wd.length = Math.min(self.pend.wd.length, hd.k);
    }
}

export function commit(self, p, entry) {
    const app = self.app;
    app.project.sync[p] = entry;
    self.cur = { p: p + 1, k: 0 };
    app.projectChanged();
    self.paint();
    self.flash(p);
    if (self.cur.p >= self.phrases().length) self.finishPass();
}

export function finishPass(self) {
    self.dropHold();
    self.fadeStop();
    self.reason = 'finished';
    self.setPhase('done', LOCK_AUTO);
    buzz([40, 50, 40]);
}

export function fadeStop(self, ms = 500) {
    const p = self.app.player;
    const a = p.audio;
    clearInterval(self.fadeT);
    if (p.state !== 'playing') return;
    const t0 = performance.now();
    self.fadeT = setInterval(() => {
      const u = Math.min(1, (performance.now() - t0) / ms);
      try {
        a.volume = Math.max(0, 1 - u);
      } catch (e) {}
      if (u >= 1) {
        clearInterval(self.fadeT);
        self.fadeT = 0;
        if (p.state === 'playing') p.pause();
        try {
          a.volume = 1;
        } catch (e) {}
      }
    }, 40);
}

export function flash(self, p) {
    const r = self.rows[p];
    if (!r) return;
    r.li.classList.remove('flash');
    void r.li.offsetWidth;
    r.li.classList.add('flash');
}

export function flush(self) {
    const { wt } = self.pend;
    if (wt.length && wt[0] != null) {
      self.app.project.sync[self.cur.p] = { t: wt[0] };
      self.cur = { p: self.cur.p + 1, k: 0 };
      self.pend = { wt: [], wd: [] };
      self.app.projectChanged();
    }
}

export function skip(self) {
    if (self.phase !== 'run') return;
    const ph = self.phrases();
    if (self.cur.p >= ph.length) return;
    self.dropHold();
    self.pend = { wt: [], wd: [] };
    self.app.project.sync[self.cur.p] = null;
    self.cur = { p: self.cur.p + 1, k: 0 };
    self.paint();
    if (self.cur.p >= ph.length) self.finishPass();
}

export function undo(self) {
    const app = self.app;
    if (self.phase === 'count') return;
    const clip0 = app.clip().start;
    const run = self.phase === 'run';
    let back = null;
    self.dropHold();
    if (self.pend.wt.length) {
      // hay una palabra a medias (se presionó pero no se soltó) o ya soltada
      const idx = self.pend.wt.length - 1;
      back = self.pend.wt[idx];
      self.pend.wt.length = idx;
      self.pend.wd.length = Math.min(self.pend.wd.length, idx);
      self.cur = { p: self.cur.p, k: idx };
    } else {
      let p = self.cur.p - 1;
      const sync = app.project.sync;
      while (p >= 0 && !sync[p]) p--;
      if (p < 0) return toast('No hay nada que deshacer.');
      const s = sync[p];
      const n = self.phrases()[p].words.length;
      back = s.t;
      if (s.wt && s.wt.length === n) {
        self.pend = { wt: s.wt.slice(0, n - 1), wd: (s.wd || []).slice(0, n - 1) };
        self.cur = { p, k: n - 1 };
        back = s.wt[n - 1];
      } else self.cur = { p, k: 0 };
      sync[p] = null;
      app.projectChanged();
    }
    const to = Math.max(0, back - clip0 - 1.6);
    if (run) {
      // sigue sonando, pero unos segundos antes de lo que se quitó
      self.paint();
      app.player.seek(to);
      if (app.player.state !== 'playing') app.player.resume();
    } else {
      // sin empezar o en pausa: se queda quieto, listo para seguir desde ahí
      self.pausedAt = to + REWIND_PAUSE;
      self.reason = 'undo';
      self.setPhase('pause', LOCK_USER);
    }
}

export function jump(self, i, restart) {
    // (la lista queda lejos del botón grande: un toque ahí es a propósito, no un reflejo; no espera)
    if (self.phase === 'run' || self.phase === 'count') return;
    self.flush();
    const app = self.app;
    const s = app.project.sync[i];
    const clip0 = app.clip().start;
    if (restart) {
      const from = s ? Math.max(0, s.t - clip0 - 2) : self.resumePoint();
      self.cur = { p: i, k: 0 };
      self.pend = { wt: [], wd: [] };
      self.phase = self.complete() ? 'done' : 'idle';
      self.paint();
      self.arm(from, false, () => {
        self.backup = { sync: structuredClone(app.project.sync) };
        app.project.sync[i] = null;
        app.projectChanged();
      });
    } else if (s) {
      const t = s.t - clip0;
      if (t < -0.5 || t > app.player.dur) return toast('Esa frase queda fuera del tramo elegido.', 'bad');
      app.audioFull.pause();
      self.listenFrom = i;
      self.setPhase('listen');
      app.player.start(Math.max(0, t - 1));
    }
}

export function stopListen(self) {
    const p = self.app.player;
    if (p.state === 'playing') p.pause();
    p.seek(0);
    if (self.phase === 'listen') self.setPhase(self.complete() ? 'done' : 'idle');
}

export function previewMarked(self) {
    const app = self.app;
    if (app.theaterOn) return;
    self.previewing = true;
    app.audioFull.pause();
    if (app.player.loopClip) app.setLoop(false);
    app.demoHold = false;
    app.player.start(0);
    app.openTheater();
}

export function onTheater(self, open) {
    if (open || !self.previewing) return;
    self.previewing = false;
    const p = self.app.player;
    if (p.state === 'playing') p.pause();
    p.seek(0);
    if (self.app.tab === 'mark') self.paint();
}

export function goNext(self) {
    self.app.selectTab('words');
}
