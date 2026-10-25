// Paso 2: la letra (la escribes o pegas tú), textos de inicio y final, e importar letras con tiempos.
import { h, toast, field } from './ui.js';
import { phrasesOf, reconcile, parseClock, normalize } from './project.js';
import { parseTimed, readPayloadFromHtml, readFileText } from './import.js';

export class TextPanel {
  constructor(app) {
    this.app = app;
    this.ta = h('textarea', {
      class: 'lyrics',
      rows: 12,
      spellcheck: 'false',
      maxlength: 100000,
      placeholder: 'Escribe o pega aquí la letra.\nUna frase por línea.\nLas líneas vacías se ignoran.',
      'aria-label': 'Letra de la canción',
    });
    // Keep the editing layout stable from pointerdown through click. Blurring
    // the textarea must not move the button out from under the same touch.
    const pointers = new Set();
    const settleEditing = () => requestAnimationFrame(() => {
      if (!app.destroyed && document.activeElement !== this.ta && !pointers.size) app.root.classList.remove('editing-text');
    });
    this.ta.addEventListener('focus', () => app.root.classList.add('editing-text'));
    this.ta.addEventListener('blur', () => { if (!pointers.size) settleEditing(); });
    let clickFallback = 0;
    app.scope.listen(window, 'pointerdown', (event) => pointers.add(event.pointerId), { capture: true });
    app.scope.listen(window, 'pointerup', (event) => {
      pointers.delete(event.pointerId);
      // Touch browsers can deliver click after the next animation frame.
      // Keep the target in place until that click has actually dispatched.
      clearTimeout(clickFallback);
      clickFallback = setTimeout(settleEditing, 700);
    }, { capture: true });
    app.scope.listen(window, 'click', () => { clearTimeout(clickFallback); settleEditing(); }, { capture: true });
    app.scope.listen(window, 'pointercancel', (event) => { pointers.delete(event.pointerId); settleEditing(); }, { capture: true });
    app.scope.cleanups.push(() => clearTimeout(clickFallback));
    app.on('tab', (tab) => { if (tab !== 'text') app.root.classList.remove('editing-text'); });
    this.count = h('div', { class: 'muted small' });
    this.ta.addEventListener('input', () => {
      const p = app.project;
      const before = p.text;
      p.text = this.ta.value;
      reconcile(p, before);
      this.paintCount();
      app.projectChanged();
    });
    this.intro = h('input', { type: 'text', value: app.project.intro, maxlength: 40, 'aria-label': 'Texto de inicio' });
    this.outro = h('input', { type: 'text', value: app.project.outro, maxlength: 60, placeholder: 'opcional', 'aria-label': 'Mensaje final' });
    this.intro.addEventListener('input', () => {
      app.project.intro = this.intro.value;
      app.projectChanged({ save: true });
    });
    this.outro.addEventListener('input', () => {
      app.project.outro = this.outro.value;
      app.projectChanged();
    });
    this.importBox = h('div', { class: 'stackv' });
    this.startAt = h('input', { type: 'text', id: 'startat', class: 'tin', placeholder: 'Automático', inputmode: 'decimal' });
    const timedBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => this.importTimed() }, 'Letra con tiempos (.lrc .srt .vtt)');
    const oldBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => this.importOld() }, 'HTML de Letras ASCII (.html)');
    const clearBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => this.clearSync() }, 'Quitar todas las marcas de tiempo');
    this.undoLabel = h('span');
    this.undoBox = h('div', { class: 'notes undo-change', hidden: true, role: 'status' }, h('div', { class: 'row wrap' }, this.undoLabel, h('button', { class: 'btn small ghost', type: 'button', onclick: () => this.undo() }, 'Deshacer cambio de letra y tiempos')));
    this.el = h(
      'div',
      { class: 'pane' },
      h('h2', {}, 'La letra'),
      h('p', { class: 'muted' }, 'La escribes o pegas tú; no se envía a ningún lado. Cada línea es una frase.'),
      this.ta,
      this.count,
      this.undoBox,
      h('div', { class: 'two' }, field('Al abrir dice', this.intro), field('Al terminar dice', this.outro)),
      h('details', { class: 'grp text-import' }, h('summary', {}, 'Importar letra o administrar tiempos'), h('div', { class: 'gbody' },
      h('div', { class: 'lab2' }, 'Traer tiempos de otro lado'),
      h('p', { class: 'muted small' }, 'Trae una letra con tiempos o un HTML exportado. El HTML recupera automáticamente el inicio de su tramo. Para otros archivos se usa 0:00; puedes indicar otro inicio aquí:'),
      h('div', { class: 'row' }, h('label', { class: 'small', for: 'startat' }, 'El archivo empieza en'), this.startAt),
      h('div', { class: 'row wrap' }, timedBtn, oldBtn),
      h('div', { class: 'row' }, clearBtn),
      )),
    );
    this.ta.value = app.project.text;
    this.paintCount();
    app.on('reset', () => this.refresh());
    app.on('project', () => this.paintUndo());
  }

  change(label, mutate) {
    const before = structuredClone(this.app.project);
    mutate(this.app.project);
    this.undoChange = { id: this.app.id, before, after: JSON.stringify(this.app.project) };
    this.undoLabel.textContent = label;
    this.refresh(); this.app.projectChanged(); this.app.emit('reset');
  }

  paintUndo() {
    if (this.undoChange && (this.app.id !== this.undoChange.id || JSON.stringify(this.app.project) !== this.undoChange.after)) this.undoChange = null;
    this.undoBox.hidden = !this.undoChange;
  }

  undo() {
    this.paintUndo();
    if (!this.undoChange) return;
    this.app.project = this.undoChange.before; this.undoChange = null;
    this.refresh(); this.app.projectChanged(); this.app.emit('reset');
    toast('Recuperé la letra, los tiempos y el diseño anteriores.');
  }

  paintCount() {
    const ph = phrasesOf(this.app.project.text);
    const words = ph.reduce((a, p) => a + p.words.length, 0);
    this.count.textContent = ph.length ? `${ph.length} frases · ${words} palabras` : 'Todavía no hay letra.';
  }

  refresh() {
    const p = this.app.project;
    this.ta.value = p.text;
    this.intro.value = p.intro;
    this.outro.value = p.outro;
    this.paintCount();
    this.paintUndo();
  }

  startOffset(fallback = 0) {
    if (!this.startAt.value.trim()) return fallback;
    const v = parseClock(this.startAt.value);
    return Number.isFinite(v) ? v : 0;
  }

  async importTimed() {
    try {
      const id = this.app.id;
      const f = await readFileText('.lrc,.srt,.vtt,.txt');
      if (this.app.destroyed || this.app.id !== id) return;
      const rows = parseTimed(f.text, f.name);
      const off = this.startOffset();
      const p = this.app.project;
      if (p.text && !confirm('¿Reemplazar la letra y sus tiempos? Se quitarán los estilos por palabra de la letra anterior.')) return;
      this.change('Se importó otra letra.', (p) => {
      p.over = {};
      p.text = rows.map((r) => r.text).join('\n');
      p.sync = rows.map((r) => {
        const t = +(r.t + off).toFixed(2);
        const words = r.text.trim().split(/\s+/).filter(Boolean);
        if (r.wt && r.wt.length === words.length) return { t, wt: r.wt.map((x) => +(x + off).toFixed(2)), wd: r.wt.map(() => 0.2) };
        return { t };
      });
      });
      toast(`Traje ${rows.length} frases con sus tiempos.`);
    } catch (e) {
      if (e && e.message !== 'cancelado') toast(e.message || 'No pude leer ese archivo.', 'bad');
    }
  }

  async importOld() {
    try {
      const id = this.app.id;
      const f = await readFileText('.html,.htm');
      if (this.app.destroyed || this.app.id !== id) return;
      const d = readPayloadFromHtml(f.text);
      if (!d.lines.length) throw new Error('Ese archivo no contiene frases válidas.');
      const off = this.startOffset(d.sourceStart || 0);
      const p = this.app.project;
      if (p.text && !confirm('¿Reemplazar la letra y sus tiempos con los del archivo?')) return;
      this.change('Se importó otro proyecto.', (p) => {
      p.over = {};
      if (d.project) {
        const imported = normalize(d.project);
        p.style = imported.style; p.over = imported.over; p.offset = imported.offset; p.seed = d.seed;
      }
      p.text = d.lines.map((l) => l[1]).join('\n');
      p.sync = d.lines.map((l) => {
        if (l[0] == null) return null;
        const t = +(l[0] + off).toFixed(2);
        const words = l[1].trim().split(/\s+/).filter(Boolean);
        if (l[2] && l[2].length === words.length) return { t, wt: l[2].map((x) => +(x + off).toFixed(2)), wd: l[3]?.length === words.length ? l[3] : l[2].map(() => 0.2) };
        return { t };
      });
      if (d.intro != null) p.intro = d.intro;
      if (d.outro != null) p.outro = d.outro;
      });
      toast(`Traje ${d.lines.length} frases de tu archivo anterior.`);
    } catch (e) {
      if (e && e.message !== 'cancelado') toast(e.message || 'No pude leer ese archivo.', 'bad');
    }
  }

  clearSync() {
    const p = this.app.project;
    if (!p.sync.some(Boolean)) return toast('Todavía no hay marcas.');
    if (!confirm('¿Quitar todas las marcas de tiempo? La letra se queda.')) return;
    this.change('Se quitaron las marcas de tiempo.', (p) => { p.sync = []; });
    toast('Listo, sin marcas.');
  }
}
