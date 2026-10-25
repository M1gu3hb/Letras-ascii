
export function openTheater(self) {
    if (self.theaterOn) return;
    self.theaterOn = true;
    self.fsAsked = false;
    self.thost.append(self.canvas, self.tag);
    self.theater.hidden = false;
    self.scene.bottomInset = self.tBar.getBoundingClientRect().height + 24;
    self.root.classList.add('is-theater');
    self.top.inert = true;
    self.grid.inert = true;
    if (self.needRebuild) self.rebuild(); // (cambios que quedaron pendientes mientras el escenario estaba oculto)
    self.paintPlayIcons();
    self.paintTime();
    self.pokeBar();
    self.syncDemo();
    const el = self.theater;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      try {
        const r = req.call(el);
        if (r && r.then) r.then(() => (self.fsAsked = true), () => {});
        else self.fsAsked = true;
      } catch (e) {}
    }
    // el gesto «atrás» del teléfono cierra la vista en lugar de sacarte de la página
    try {
      history.pushState({ theater: 1 }, '');
      self.hist = true;
    } catch (e) {
      self.hist = false;
    }
    self.scene.resize();
    requestAnimationFrame(() => self.theaterOn && self.scene.resize());
    try {
      el.focus({ preventScroll: true });
    } catch (e) {}
    self.emit('theater', true);
}

export function closeTheater(self, { fromPop = false } = {}) {
    if (!self.theaterOn) return;
    self.theaterOn = false;
    clearTimeout(self.barT);
    if (self.hist && !fromPop) {
      try {
        history.back();
      } catch (e) {}
    }
    self.hist = false;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      try {
        const ex = document.exitFullscreen || document.webkitExitFullscreen;
        const r = ex.call(document);
        if (r && r.catch) r.catch(() => {});
      } catch (e) {}
    }
    self.fsAsked = false;
    self.stage.prepend(self.canvas);
    self.canvas.after(self.tag);
    self.theater.hidden = true;
    self.scene.bottomInset = 0;
    self.root.classList.remove('is-theater');
    self.top.inert = false;
    self.grid.inert = false;
    self.demoHold = false;
    self.syncDemo();
    self.scene.resize();
    requestAnimationFrame(() => !self.theaterOn && self.scene.resize());
    try {
      self.fsBtn.focus({ preventScroll: true });
    } catch (e) {}
    self.emit('theater', false);
}

export function pokeBar(self) {
    self.theater.classList.add('hud');
    clearTimeout(self.barT);
    self.barT = setTimeout(() => {
      if (self.theaterOn && (self.player.state === 'playing' || self.player.demo)) self.theater.classList.remove('hud');
    }, 2800);
}
