// Paso 6: descargar el archivo final y verlo como lo verá ella.
import { h, toast, fmtBytes, download } from './ui.js';
import { buildHtml, audioPlan, exportReady, fileNameOf, exportSnapshot } from './export.js';
import { fmtTime } from './project.js';

export class ExportPanel {
  constructor(app) {
    this.app = app;
    this.sum = h('dl', { class: 'sum' });
    this.warn = h('div', { class: 'warn hidden', role: 'alert' });
    this.prevBtn = h('button', { class: 'btn', type: 'button', onclick: () => this.make('preview') }, 'Vista del destinatario');
    this.dlBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => this.make('download') }, '⬇ Descargar el HTML');
    this.busy = h('div', { class: 'muted small', role: 'status' });
    this.notes = h(
      'div',
      { class: 'notes' },
      h('h3', {}, 'Para mandárselo'),
      h('ul', {}, [
        h('li', {}, 'El archivo trae todo adentro: se abre sin internet y no depende de este sitio.'),
        h('li', {}, 'Funciona mejor abierto en Chrome, Edge o Safari. En el celular, por WhatsApp se abre en una vista previa limitada: mejor guárdalo en Archivos y ábrelo desde ahí, o súbelo a un hosting (por ejemplo Vercel).'),
        h('li', {}, 'Tu canción y tu letra solo viajan dentro de ese archivo; este sitio no los guarda en ningún servidor.'),
      ]),
    );
    this.el = h('div', { class: 'pane' }, h('h2', {}, 'Exportar'), this.sum, this.warn, h('div', { class: 'row wrap' }, this.prevBtn, this.dlBtn), this.busy, this.notes);
    ['media', 'clip', 'project', 'reset'].forEach((ev) => app.on(ev, () => this.paint()));
    this.paint();
  }
  show() {
    this.paint();
  }
  paint() {
    const app = this.app;
    const r = exportReady(app);
    const plan = audioPlan(app);
    const clip = app.clip();
    const row = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
    this.sum.replaceChildren(
      ...row('Canción', app.media ? app.media.name : 'sin subir'),
      ...row('Tramo', app.media ? `${fmtTime(clip.start)} → ${fmtTime(clip.end)} (${Math.round(clip.end - clip.start)} s)` : '—'),
      ...row('Frases incluidas en el tramo', `${r.done} de ${r.phrases}`),
      ...row('Audio en el archivo', plan ? `${plan.label} · ${fmtBytes(plan.bytes)}` : '—'),
    );
    const msgs = [];
    if (!r.hasSong) msgs.push('Falta subir la canción (paso 1).');
    if (!r.phrases) msgs.push('Falta la letra (paso 2).');
    else if (!r.marked) msgs.push('Falta marcar los tiempos de la letra (paso 3).');
    else if (r.marked < r.phrases) msgs.push(`Faltan ${r.phrases - r.marked} frases por marcar; esas no aparecerán.`);
    if (r.outside) msgs.push(`${r.outside} frases marcadas quedan fuera del tramo y no aparecerán. Amplía el tramo o ajusta sus tiempos.`);
    if (r.hasSong && r.marked && !r.done) msgs.push('No hay frases visibles en este tramo. Vuelve a Canción para revisarlo.');
    if (plan && plan.bytes > 22 * 1048576) msgs.push('El archivo va a pesar bastante. Si quieres uno más ligero, elige un tramo más corto.');
    this.warn.classList.toggle('hidden', !msgs.length);
    this.warn.replaceChildren(...msgs.map((m) => h('p', {}, m)));
    const ok = r.hasSong && r.done > 0 && !this.making;
    this.prevBtn.disabled = !ok;
    this.dlBtn.disabled = !ok;
  }
  async make(kind) {
    if (this.making) return;
    this.making = true;
    const app = this.app;
    const snapshot = exportSnapshot(app), filename = fileNameOf(snapshot);
    app.player.pause();
    app.audioFull.pause();
    let win = null;
    if (kind === 'preview') win = window.open('', '_blank');
    this.prevBtn.disabled = this.dlBtn.disabled = true;
    this.busy.textContent = 'Armando el archivo…';
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { blob, bytes, plan } = await buildHtml(snapshot, { title: snapshot.project.name });
      if (app.destroyed) { win?.close(); return; }
      if (kind === 'download') {
        download(blob, filename);
        toast(`Descargado (${fmtBytes(bytes)}). Ábrelo para probarlo.`);
      } else {
        const url = URL.createObjectURL(blob);
        if (win) win.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      }
      this.busy.textContent = `Archivo de ${fmtBytes(bytes)} · audio ${plan.label}`;
    } catch (e) {
      if (win) win.close();
      this.busy.textContent = '';
      toast(e.message || 'No pude armar el archivo.', 'bad');
    } finally {
      this.making = false;
      if (!app.destroyed) this.paint();
    }
  }
}
