// Reproductor: audio del tramo (o reloj virtual si todavía no hay canción), reloj suavizado y estados.
// Dos modos: 'player' (la página que recibe ella: intro, toca para empezar, final) y 'studio' (controles propios).
export class Player {
  constructor(scene, audio, canvas, mode = 'player') {
    this.scene = scene;
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
    });
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
      canvas.addEventListener('pointerdown', act);
      window.addEventListener('keydown', act);
    }
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // url: audio del tramo (WAV o el original); sin url = reloj virtual de `dur` segundos
  setSource(url, dur) {
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

  async start(from = 0) {
    this.seek(from);
    this.scene.wpCursor = 0;
    this.setState('playing');
    await this.resumeClock();
  }

  async resumeClock() {
    this.lastCT = -1;
    this.audio.volume = 1;
    if (this.virtual) {
      this.vStamp = performance.now() / 1000;
      return;
    }
    this.audio.playbackRate = this.rate;
    try {
      await this.audio.play();
    } catch (e) {
      this.setState(this.mode === 'player' ? 'intro' : 'paused');
      return;
    }
    this.keepAwake();
  }

  pause() {
    if (this.state === 'playing') this.vT = this.time(performance.now() / 1000);
    if (!this.virtual) this.audio.pause();
    this.setState('paused');
  }
  resume() {
    this.setState('playing');
    this.resumeClock();
  }
  stop() {
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
    try {
      if ('wakeLock' in navigator && !this.wake) {
        this.wake = await navigator.wakeLock.request('screen');
        this.wake.addEventListener('release', () => (this.wake = null));
      }
    } catch (e) {}
  }

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
    const now = performance.now() / 1000;
    const sc = this.scene;
    try {
      // estudio con el escenario oculto (p. ej. escribiendo la letra o marcando en un teléfono): no se dibuja,
      // pero el reloj y el final del tramo siguen al día
      if (this.mode === 'studio' && !this.canvas.offsetParent) {
        this.clock(now);
        requestAnimationFrame(this.loop);
        return;
      }
      if (this.state === 'intro') sc.render(now - this.t0, 'intro');
      else if (this.state === 'ended') sc.render((sc.tl ? sc.tl.duration : 60) + (now - this.endStart), 'ended');
      else if (this.demo && this.state === 'paused' && this.mode === 'studio') sc.render(this.demoTime(now), 'song');
      else sc.render(this.clock(now), 'song');
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(this.loop);
  }
}
