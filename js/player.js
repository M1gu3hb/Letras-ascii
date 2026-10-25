// Reproductor: audio del tramo (o reloj virtual si todavía no hay canción), reloj suavizado y estados.
// Dos modos: 'player' (la página que recibe ella: intro, toca para empezar, final) y 'studio' (controles propios).
export class Player {
  constructor(scene, audio, canvas, mode = 'player') {
    this.scene = scene;
    this.scope = new AbortController();
    this.audio = audio;
    this.canvas = canvas;
    this.mode = mode;
    this.state = mode === 'player' ? 'intro' : 'paused';
    this.t0 = performance.now() / 1000;
    this.lastCT = -1;
    this.lastStamp = 0;
    this.endStart = 0;
    this.dur = 0;
    this.virtual = true;
    this.vT = 0;
    this.vStamp = 0;
    this.rate = 1;
    this.loopClip = false;
    this.t = 0;
    this.justEnded = false;
    this.onState = null;
    this.onEnd = null;
    this.wake = null;
    // vitrina (solo estudio): mientras no suena nada, el escenario se mueve solo en bucle, sin audio,
    // para enseñar cómo se va a ver. No toca `t` ni el transporte.
    this.demo = false;
    this.demoT0 = 0;
    this.demoDur = 0;
    this.demoFrom = 0;
    audio.addEventListener('ended', () => {
      if (this.state === 'playing') this.finish();
    }, { signal: this.scope.signal });
    if (mode === 'player') {
      const act = (e) => {
        if (e.type === 'keydown') {
          if (e.code !== 'Space') return;
          const tg = e.target;
          if (tg && tg.closest && tg.closest('textarea, input, select, button, a, [contenteditable]')) return;
          e.preventDefault();
        }
        this.tap();
      };
      canvas.addEventListener('pointerdown', act, { signal: this.scope.signal });
      window.addEventListener('keydown', act, { signal: this.scope.signal });
    }
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // url: audio del tramo (WAV o el original); sin url = reloj virtual de `dur` segundos
  setSource(url, dur) {
    this.auditionRange = null;
    this.playEpoch = (this.playEpoch || 0) + 1;
    const a = this.audio;
    this.dur = dur;
    this.virtual = !url;
    this.lastCT = -1;
    this.vT = 0;
    if (this.state === 'playing') this.setState('paused');
    try {
      a.pause();
    } catch (e) {}
    if (url) {
      a.src = url;
      a.load();
    } else a.removeAttribute('src');
  }

  setState(s) {
    this.state = s;
    if (s !== 'playing') this.releaseAwake();
    this.scene.paused = s === 'paused' && this.mode === 'player';
    if (s === 'intro') this.t0 = performance.now() / 1000;
    if (s === 'ended') this.endStart = performance.now() / 1000;
    if (this.onState) this.onState(s);
  }

  async tap() {
    if (this.state === 'intro') await this.start(0);
    else if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'ended') await this.start(0);
  }

  async prepareGesture() {
    if (this.virtual) return true;
    const audio = this.audio, epoch = this.playEpoch, muted = audio.muted;
    // Unlock this exact media element while the Start tap is still active.
    // A timer at the end of a countdown has no user gesture on mobile Safari.
    audio.muted = true;
    try {
      await audio.play();
      if (this.destroyed || epoch !== this.playEpoch) return false;
      audio.pause();
      return true;
    } catch { return false; }
    finally { audio.muted = muted; }
  }

  async start(from = 0) {
    if (this.destroyed) return;
    this.seek(from);
    this.scene.wpCursor = 0;
    this.setState('playing');
    await this.resumeClock();
  }

  async resumeClock() {
    const epoch = this.playEpoch = (this.playEpoch || 0) + 1;
    this.lastCT = -1;
    this.audio.volume = 1;
    if (this.virtual) {
      this.vStamp = performance.now() / 1000;
      return;
    }
    this.audio.playbackRate = this.rate;
    this.lastPlayError = null;
    try {
      await this.audio.play();
    } catch (e) {
      if (epoch === this.playEpoch && !this.destroyed) { this.lastPlayError = { name: e.name, message: e.message }; this.setState(this.mode === 'player' ? 'intro' : 'paused'); }
      return;
    }
    if (epoch !== this.playEpoch || this.destroyed || this.state !== 'playing') return;
    this.keepAwake();
  }

  pause() {
    this.playEpoch = (this.playEpoch || 0) + 1;
    if (this.state === 'playing') this.vT = this.time(performance.now() / 1000);
    if (!this.virtual) this.audio.pause();
    this.setState('paused');
  }
  resume() {
    if (this.destroyed) return;
    if (this.auditionRange && (this.t >= this.auditionRange.b || this.t < this.auditionRange.a)) this.seek(this.auditionRange.a);
    this.setState('playing');
    this.resumeClock();
  }
  stop() {
    this.playEpoch = (this.playEpoch || 0) + 1;
    this.audio.pause();
    this.seek(0);
    this.setState(this.mode === 'player' ? 'intro' : 'paused');
  }

  seek(t) {
    const tt = Math.max(0, Math.min(this.dur || 1e9, t));
    this.vT = tt;
    this.vStamp = performance.now() / 1000;
    this.lastCT = -1;
    if (!this.virtual) {
      try {
        this.audio.currentTime = tt;
      } catch (e) {}
    }
    this.t = tt;
  }

  setRate(r) {
    this.rate = r;
    if (!this.virtual) this.audio.playbackRate = r;
    this.audio.preservesPitch = true;
  }

  finish() {
    if (this.mode === 'studio') {
      if (this.loopClip) {
        this.start(0);
        return;
      }
      this.audio.pause();
      this.seek(0);
      // quien escucha el cambio de estado puede saber que se detuvo por llegar al final del tramo (y no porque alguien pausó)
      this.justEnded = true;
      this.setState('paused');
      this.justEnded = false;
      if (this.onEnd) this.onEnd();
    } else {
      this.audio.pause();
      this.setState('ended');
    }
  }

  async keepAwake() {
    if (this.wakeRequest || this.wake || this.destroyed || this.state !== 'playing') return;
    try {
      if ('wakeLock' in navigator) {
        this.wakeRequest = navigator.wakeLock.request('screen');
        const wake = await this.wakeRequest;
        if (this.state !== 'playing' || this.destroyed) { await wake.release(); return; }
        this.wake = wake;
        wake.addEventListener('release', () => { if (this.wake === wake) this.wake = null; });
      }
    } catch (e) {} finally { this.wakeRequest = null; }
  }

  releaseAwake() { const wake = this.wake; this.wake = null; if (wake) Promise.resolve(wake.release()).catch(() => {}); }
  destroy() { this.destroyed = true; this.playEpoch = (this.playEpoch || 0) + 1; cancelAnimationFrame(this.raf); this.scope.abort(); this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.releaseAwake(); }

  // tiempo del tramo, interpolado entre actualizaciones del audio
  time(now) {
    if (this.virtual) return this.state === 'playing' ? this.vT + (now - this.vStamp) * this.rate : this.vT;
    const a = this.audio;
    const ct = a.currentTime;
    if (ct !== this.lastCT) {
      this.lastCT = ct;
      this.lastStamp = now;
    }
    if (a.paused) return ct;
    return ct + Math.min(now - this.lastStamp, 0.09) * this.rate;
  }

  // tiempo del tramo en un instante que ya pasó (`stamp`, en segundos del reloj de la página: el sello de un toque).
  // Si el procesador se tardó en atender el toque (se está dibujando, se está guardando…), la marca no se corre.
  timeAt(stamp, now = performance.now() / 1000) {
    const t = this.time(now);
    const dt = now - stamp;
    if (this.state !== 'playing' || !(dt >= 0 && dt <= 0.6)) return t; // sello raro (otra base de tiempo): se usa el instante actual
    return Math.max(0, t - dt * this.rate);
  }

  // reloj: actualiza `t`, detecta el final del tramo y baja el volumen al terminar. Devuelve el tiempo.
  clock(now) {
    let t = this.time(now);
    const range = this.auditionRange;
    if (this.state === 'playing' && range && t >= range.b) {
      if (range.loop) { this.seek(range.a); t = range.a; }
      else { this.pause(); this.seek(range.b); t = range.b; }
    }
    if (this.state === 'playing' && this.dur && t >= this.dur - 0.01) {
      this.finish();
      t = this.dur;
    } else if (this.state === 'playing' && !this.virtual && this.dur && t > this.dur - 0.25) this.audio.volume = Math.max(0, (this.dur - t) / 0.25);
    this.t = t;
    return t;
  }

  // vitrina: el escenario se mueve solo, sin sonido. dur = cuánto dura cada vuelta; from = desde qué segundo del tramo
  setDemo(on, dur, from = 0) {
    if (dur) this.demoDur = dur;
    this.demoFrom = from || 0;
    if (on && !this.demo) this.demoT0 = performance.now() / 1000;
    this.demo = !!on;
  }

  demoTime(now) {
    const d = Math.max(2, this.demoDur || this.dur || 30);
    return (this.demoFrom || 0) + ((now - this.demoT0) % d);
  }

  loop() {
    if (this.destroyed) return;
    const now = performance.now() / 1000;
    const sc = this.scene;
    try {
      // estudio con el escenario oculto (p. ej. escribiendo la letra o marcando en un teléfono): no se dibuja,
      // pero el reloj y el final del tramo siguen al día
      if (this.mode === 'studio' && !this.canvas.offsetParent) {
        this.clock(now);
        this.raf = requestAnimationFrame(this.loop);
        return;
      }
      if (this.state === 'intro') sc.render(now - this.t0, 'intro');
      else if (this.state === 'ended') sc.render((sc.tl ? sc.tl.duration : 60) + (now - this.endStart), 'ended');
      else if (this.demo && this.state === 'paused' && this.mode === 'studio') sc.render(this.demoTime(now), 'song');
      else sc.render(this.clock(now), 'song');
    } catch (err) {
      console.error(err);
    }
    this.raf = requestAnimationFrame(this.loop);
  }
}
