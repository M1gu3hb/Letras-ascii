import { readPayloadFromHtml, parseTimed, toLines, readFileText, parseClock } from './import.js';

// Modo sincronizar: la persona pega su letra, toca una vez por línea (o por palabra) mientras suena
// la canción, y descarga su versión final como un solo archivo HTML. La letra nunca sale del navegador.

const DRAFT_KEY = 'detalle-ascii:draft';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

const scene_hint = (app) => {
  app.scene.hint = true;
};

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || {};
  } catch (e) {
    return {};
  }
}
function saveDraft(d) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch (e) {}
}

export class Sync {
  constructor(app) {
    this.app = app;
    this.root = app.ui;
    this.cleanup = null;
  }

  clear() {
    if (this.cleanup) this.cleanup();
    this.cleanup = null;
    this.root.replaceChildren();
  }

  // ───────────── paso 1: la letra ─────────────
  showForm() {
    const app = this.app;
    this.clear();
    app.setBackdrop();
    const d = loadDraft();
    const ta = h('textarea', { rows: 9, spellcheck: 'false', placeholder: 'Una frase por renglón…' });
    ta.value = d.text || '';
    const intro = h('input', { type: 'text', value: d.intro ?? 'para ti', maxlength: 28 });
    const outro = h('input', { type: 'text', value: d.outro ?? '', maxlength: 40, placeholder: 'Opcional' });
    const perWord = h('input', { type: 'checkbox' });
    perWord.checked = !!d.perWord;
    const err = h('p', { class: 'err' });
    const go = () => {
      const lines = ta.value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        err.textContent = 'Pega al menos dos renglones de letra.';
        return;
      }
      saveDraft({ text: ta.value, intro: intro.value, outro: outro.value, perWord: perWord.checked });
      this.showTap({ lines, intro: intro.value.trim(), outro: outro.value.trim(), perWord: perWord.checked });
    };
    this.root.append(
      h(
        'div',
        { class: 'screen form' },
        h('h1', {}, 'Sincronizar la letra'),
        h('p', { class: 'lead' }, 'Copia la letra de tu video y pégala aquí, una frase por renglón. Cada renglón aparece junto en pantalla. Todo se queda en tu navegador.'),
        h('label', {}, 'Letra', ta),
        h('div', { class: 'two' }, h('label', {}, 'Texto de inicio', intro), h('label', {}, 'Mensaje final', outro)),
        h('label', { class: 'check' }, perWord, h('span', {}, 'Marcar palabra por palabra (más preciso, más difícil)')),
        err,
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => app.showHome() }, 'Volver'), h('button', { class: 'btn primary', onclick: go }, 'Marcar tiempos'))
      )
    );
  }

  // ───────────── paso 2: tocar al ritmo ─────────────
  showTap(cfg) {
    const app = this.app;
    const audio = app.audio;
    this.clear();
    app.player.enabled = false;
    app.player.stop();
    // objetivos a marcar
    const targets = [];
    cfg.lines.forEach((text, li) => {
      if (cfg.perWord) text.split(/\s+/).filter(Boolean).forEach((w, wi) => targets.push({ li, wi, text, w }));
      else targets.push({ li, wi: 0, text });
    });
    const taps = [];
    let phase = 'idle'; // idle | count | run | done
    let lastCT = -1;
    let stamp = 0;
    const now = () => {
      const ct = audio.currentTime;
      const n = performance.now() / 1000;
      if (ct !== lastCT) {
        lastCT = ct;
        stamp = n;
      }
      return audio.paused ? ct : ct + Math.min((n - stamp) * audio.playbackRate, 0.09);
    };

    const prog = h('span', {});
    const clock = h('span', { class: 'clock' }, '0:00');
    const cur = h('div', { class: 'cur' });
    const nxt = h('div', { class: 'next' });
    const nxt2 = h('div', { class: 'next2' });
    const prv = h('div', { class: 'prev' });
    const big = h('button', { class: 'big' }, 'Empezar canción');
    const bPause = h('button', { class: 'btn ghost small' }, 'Pausar');
    const bUndo = h('button', { class: 'btn ghost small' }, 'Deshacer');
    const bReset = h('button', { class: 'btn ghost small' }, 'Reiniciar');
    const bBack = h('button', { class: 'btn ghost small' }, 'Editar letra');
    const bRate = h('button', { class: 'btn ghost small' }, 'Velocidad: normal');
    const bFinish = h('button', { class: 'btn ghost small hidden' }, 'Terminar ya');
    const overText = h('p', {});
    const over = h(
      'div',
      { class: 'donebox hidden' },
      overText,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: () => bReset.onclick() }, 'Marcar otra vez'), h('button', { class: 'btn primary', onclick: () => finishNow() }, 'Completar solo y ver vista previa'))
    );
    const done = h('div', { class: 'donebox hidden' }, h('p', {}, 'Listo, ya están todos los tiempos.'), h('button', { class: 'btn primary', onclick: () => this.showPreview(cfg, targets, taps) }, 'Ver vista previa'));

    const lineAt = (i) => (i < cfg.lines.length ? cfg.lines[i] : '');
    const render = () => {
      const idx = taps.length;
      const tg = targets[idx];
      const li = tg ? tg.li : cfg.lines.length - 1;
      prog.textContent = cfg.perWord ? `Palabra ${Math.min(idx + 1, targets.length)} de ${targets.length}` : `Línea ${Math.min(idx + 1, targets.length)} de ${targets.length}`;
      prv.textContent = li > 0 ? lineAt(li - 1) : '';
      if (cfg.perWord && tg) {
        const words = tg.text.split(/\s+/).filter(Boolean);
        cur.replaceChildren(...words.map((w, k) => h('span', { class: k === tg.wi ? 'w on' : k < tg.wi ? 'w past' : 'w' }, w + ' ')));
      } else cur.textContent = tg ? tg.text : '';
      nxt.textContent = lineAt(li + 1);
      nxt2.textContent = lineAt(li + 2);
      done.classList.toggle('hidden', phase !== 'done');
      over.classList.toggle('hidden', phase !== 'over');
      big.classList.toggle('hidden', phase === 'done' || phase === 'over');
      bFinish.classList.toggle('hidden', !(taps.length > 0 && (phase === 'run' || phase === 'over') && taps.length < targets.length));
      if (phase === 'over') {
        const n = targets.length - taps.length;
        overText.textContent = `La canción terminó y quedaron ${n} ${cfg.perWord ? (n === 1 ? 'palabra' : 'palabras') : n === 1 ? 'línea' : 'líneas'} sin marcar. Puedo repartirlas en partes iguales (queda aproximado) o marcar otra vez.`;
      }
    };

    const tick = setInterval(() => {
      clock.textContent = fmt(now());
      if (phase === 'run' && audio.ended && taps.length < targets.length) {
        phase = 'over';
        render();
      }
    }, 120);

    const total = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 58.3);
    // si faltan marcas, reparte las que faltan en partes iguales entre la última marca y el final
    const completeTaps = () => {
      const out = taps.slice();
      const m = targets.length - out.length;
      if (m > 0) {
        const last = out.length ? out[out.length - 1] : 0.4;
        const end = Math.max(last + 1, total() - 1.8);
        const step = Math.max(0.4, (end - last) / (m + 1));
        for (let i = 1; i <= m; i++) out.push(+Math.min(last + step * i, total() - 0.8).toFixed(2));
      }
      return out;
    };
    const finishNow = () => {
      if (!taps.length) return;
      audio.pause();
      this.showPreview(cfg, targets, completeTaps());
    };
    // arranca la canción de verdad. Si el navegador no deja (necesita un toque), avisa y espera otro toque.
    const startRun = async () => {
      audio.muted = false;
      audio.currentTime = 0;
      lastCT = -1;
      try {
        await audio.play();
      } catch (e) {
        phase = 'ready';
        big.classList.remove('counting');
        big.classList.add('warn');
        big.textContent = 'Toca otra vez para que suene la canción';
        return;
      }
      phase = 'run';
      big.classList.remove('counting', 'warn');
      big.textContent = cfg.perWord ? 'Toca en cada palabra' : 'Toca cuando empiece cada línea';
      render();
    };
    const begin = async () => {
      phase = 'count';
      big.classList.add('counting');
      // "desbloquear" el audio dentro del toque: iPhone/Safari no dejan hacer play() después de una espera
      try {
        audio.muted = true;
        await audio.play();
        audio.pause();
      } catch (e) {}
      audio.muted = false;
      for (const n of ['3', '2', '1']) {
        big.textContent = n;
        await new Promise((r) => setTimeout(r, 700));
        if (phase !== 'count') return;
      }
      await startRun();
    };
    const doTap = () => {
      if (phase === 'idle') return begin();
      if (phase === 'ready') return startRun();
      if (phase !== 'run') return;
      if (audio.ended || audio.paused) return;
      taps.push(now());
      big.classList.remove('flash');
      void big.offsetWidth;
      big.classList.add('flash');
      if (taps.length >= targets.length) {
        phase = 'done';
        audio.pause();
      }
      render();
    };
    big.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      doTap();
    });
    const onKey = (e) => {
      const tg = e.target;
      if (tg && tg.closest && tg.closest('textarea, input, select, [contenteditable]')) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        doTap();
      }
    };
    window.addEventListener('keydown', onKey);
    bPause.onclick = () => {
      if (phase !== 'run') return;
      if (audio.paused) {
        audio.play();
        bPause.textContent = 'Pausar';
      } else {
        audio.pause();
        bPause.textContent = 'Seguir';
      }
    };
    bUndo.onclick = () => {
      if (!taps.length) return;
      const last = taps.pop();
      phase = 'run';
      audio.currentTime = Math.max(0, last - 2.5);
      lastCT = -1;
      audio.play().catch(() => {});
      bPause.textContent = 'Pausar';
      big.classList.remove('warn');
      big.textContent = cfg.perWord ? 'Toca en cada palabra' : 'Toca cuando empiece cada línea';
      render();
    };
    bReset.onclick = () => {
      audio.pause();
      audio.currentTime = 0;
      taps.length = 0;
      phase = 'idle';
      audio.muted = false;
      big.classList.remove('counting', 'warn');
      big.textContent = 'Empezar canción';
      bPause.textContent = 'Pausar';
      render();
    };
    bFinish.onclick = finishNow;
    bRate.onclick = () => {
      const slow = audio.playbackRate === 1;
      audio.playbackRate = slow ? 0.75 : 1;
      bRate.textContent = slow ? 'Velocidad: lenta' : 'Velocidad: normal';
    };
    bBack.onclick = () => {
      audio.pause();
      this.showForm();
    };
    this.cleanup = () => {
      audio.playbackRate = 1;
      clearInterval(tick);
      window.removeEventListener('keydown', onKey);
      audio.pause();
      phase = 'idle';
    };
    this.root.append(
      h(
        'div',
        { class: 'screen tap' },
        h('div', { class: 'meta' }, prog, clock),
        h('div', { class: 'lyr' }, prv, cur, nxt, nxt2),
        done,
        over,
        h('div', { class: 'tools' }, bBack, bReset, bUndo, bPause, bRate, bFinish),
        big
      )
    );
    render();
  }

  // ───────────── importar ─────────────
  async importHtml() {
    try {
      const { text } = await readFileText('.html,.htm,text/html');
      const base = readPayloadFromHtml(text);
      this.showPreviewData({ ...base, off0: 0, back: () => this.app.showHome(), origin: 'html' });
    } catch (e) {
      if (e.message !== 'cancelado') this.showMessage(e.message);
    }
  }

  async importTimed() {
    try {
      const { name, text } = await readFileText('.lrc,.srt,.vtt,.txt,text/plain');
      const rows = parseTimed(text, name);
      this.showTimedForm(rows, name);
    } catch (e) {
      if (e.message !== 'cancelado') this.showMessage(e.message);
    }
  }

  showMessage(msg) {
    this.clear();
    this.app.setBackdrop();
    this.root.append(
      h('div', { class: 'screen form' }, h('h1', {}, 'Algo no cuadró'), h('p', { class: 'lead' }, msg), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => this.app.showHome() }, 'Volver')))
    );
  }

  // letra con tiempos (.lrc/.srt/.vtt): hay que decir en qué segundo empieza el fragmento de la canción
  showTimedForm(rows, name) {
    const app = this.app;
    this.clear();
    app.setBackdrop();
    const dur = Number.isFinite(app.audio.duration) && app.audio.duration > 0 ? app.audio.duration : 58.3;
    const first = rows[0].t;
    const startIn = h('input', { type: 'text', value: first > 5 ? fmt(Math.max(0, first - 0.5)) : '0:00', inputmode: 'numeric', placeholder: '0:00' });
    const intro = h('input', { type: 'text', value: 'para ti', maxlength: 28 });
    const outro = h('input', { type: 'text', value: '', maxlength: 40, placeholder: 'Opcional' });
    const info = h('p', { class: 'hint' });
    const err = h('p', { class: 'err' });
    const refresh = () => {
      const st = parseClock(startIn.value);
      if (Number.isNaN(st)) {
        info.textContent = '';
        return null;
      }
      const r = toLines(rows, st, dur);
      info.textContent = `Se usarán ${r.lines.length} renglones de ${rows.length}. La letra de ${name} empieza en ${fmt(first)} y tu canción dura ${fmt(dur)}.`;
      return r;
    };
    startIn.addEventListener('input', refresh);
    refresh();
    const go = () => {
      const r = refresh();
      if (!r || r.lines.length < 2) {
        err.textContent = 'Con ese segundo de inicio casi no quedan renglones dentro de la canción. Prueba otro.';
        return;
      }
      this.showPreviewData({ intro: intro.value.trim(), outro: outro.value.trim(), seed: 0, lines: r.lines, off0: 0, back: () => this.showTimedForm(rows, name), origin: 'timed' });
    };
    this.root.append(
      h(
        'div',
        { class: 'screen form' },
        h('h1', {}, 'Letra con tiempos'),
        h('p', { class: 'lead' }, 'Tu archivo trae los tiempos de la canción completa. Dime en qué segundo de esa canción empieza el fragmento que sí tiene este archivo de audio (lo puedes ver en tu reproductor).'),
        h('label', {}, 'El fragmento empieza en (min:seg)', startIn),
        info,
        h('div', { class: 'two' }, h('label', {}, 'Texto de inicio', intro), h('label', {}, 'Mensaje final', outro)),
        err,
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => app.showHome() }, 'Volver'), h('button', { class: 'btn primary', onclick: go }, 'Ver cómo queda'))
      )
    );
  }

  // ───────────── paso 3: vista previa y descarga ─────────────
  // marcas de los toques -> líneas base (sin desfase)
  baseFromTaps(cfg, targets, taps) {
    const lines = [];
    cfg.lines.forEach((text, li) => {
      const idxs = targets.map((t, k) => (t.li === li ? k : -1)).filter((k) => k >= 0);
      const times = idxs.map((k) => taps[k]);
      lines.push([times[0], text, cfg.perWord ? times : undefined]);
    });
    return lines;
  }

  buildData(base, off) {
    const lines = base.lines.map((l) => {
      const t = Math.max(0, +(l[0] + off).toFixed(2));
      return l[2] ? [t, l[1], l[2].map((x) => Math.max(0, +(x + off).toFixed(2)))] : [t, l[1]];
    });
    // los tiempos de cada línea deben ir en orden y separados
    for (let i = 1; i < lines.length; i++) if (lines[i][0] < lines[i - 1][0] + 0.25) lines[i][0] = +(lines[i - 1][0] + 0.25).toFixed(2);
    return { v: 2, intro: base.intro, outro: base.outro, seed: base.seed | 0, lines };
  }

  showPreview(cfg, targets, taps) {
    this.showPreviewData({ intro: cfg.intro, outro: cfg.outro, seed: 0, lines: this.baseFromTaps(cfg, targets, taps), off0: -0.12, back: () => this.showTap(cfg), origin: 'tap' });
  }

  showPreviewData(base) {
    const app = this.app;
    this.clear();
    scene_hint(app);
    let off = base.off0 ?? 0;
    let timer = null;
    const offTxt = () => (off > 0 ? '+' : '') + off.toFixed(2) + ' s';
    const out = h('output', {}, offTxt());
    const slider = h('input', { type: 'range', min: -0.6, max: 0.6, step: 0.02, value: off });
    const status = h('p', { class: 'status' });
    const apply = () => {
      const data = this.buildData(base, off);
      app.applyData(data);
      return data;
    };
    const replay = async () => {
      app.player.enabled = true;
      await app.player.start(0);
    };
    slider.addEventListener('input', () => {
      off = parseFloat(slider.value);
      out.textContent = offTxt();
      clearTimeout(timer);
      timer = setTimeout(() => apply(), 160);
    });
    const again = async () => {
      base.seed = (base.seed | 0) + 1;
      apply();
      status.textContent = 'Otra versión: cambié la puesta en escena (los tiempos son los mismos).';
      await replay();
    };
    const dl = () => {
      const data = apply();
      app.download(data);
      status.textContent = 'Se descargó para-ti.html. Ábrelo con doble clic para verlo; ese archivo ya trae la canción y tu letra.';
    };
    this.cleanup = () => clearTimeout(timer);
    this.root.append(
      h(
        'div',
        { class: 'sheet' },
        h('div', { class: 'row sl' }, h('label', {}, 'Sincronía'), slider, out),
        h('p', { class: 'hint' }, 'Si las palabras llegan tarde, mueve la barra a la izquierda; si llegan antes de la voz, a la derecha.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost small', onclick: base.back || (() => app.showHome()) }, base.origin === 'tap' ? 'Volver a marcar' : 'Volver'),
          h('button', { class: 'btn ghost small', onclick: again }, 'Otra versión'),
          h('button', { class: 'btn ghost small', onclick: replay }, 'Ver de nuevo'),
          h('button', { class: 'btn primary small', onclick: dl }, 'Descargar mi versión')
        ),
        status
      )
    );
    apply();
    replay();
  }
}
