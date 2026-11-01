// Paso 6: descargar el archivo final y verlo como lo verá ella.
import { h, toast, fmtBytes, download } from './ui.js';
import { buildHtml, audioPlan, exportReady, fileNameOf, exportSnapshot } from './export.js';
import { fmtTime } from './project.js';
import { icon } from './icons.js';

export class ExportPanel {
  constructor(app) {
    this.app = app;
    this.sum = h('dl', { class: 'sum' });
    this.warn = h('div', { class: 'warn hidden', role: 'alert' });
    this.prevBtn = h('button', { class: 'btn export-preview', type: 'button', onclick: () => this.make('preview') }, icon('eye'), 'Vista del destinatario');
    this.dlBtn = h('button', { class: 'btn primary export-download', type: 'button', 'aria-label': 'Descargar el HTML', onclick: () => this.make('download') }, icon('download'), 'Descargar el HTML');
    this.checks = h('ul', { class: 'export-checks', 'aria-label': 'Lo que lleva tu archivo' });
    this.busy = h('div', { class: 'muted small', role: 'status' });
    this.recovery = h('div', { class: 'row wrap export-recovery', hidden: true });
    this.previewLink = h('a', { class: 'btn', hidden: true, target: '_blank', rel: 'noopener' }, 'Abrir vista del destinatario');
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
    this.details = h('details', { class: 'grp export-details' }, h('summary', {}, 'Detalles del archivo'), h('div', { class: 'gbody' }, this.sum));
    this.el = h(
      'div',
      { class: 'pane export-pane' },
      h('h2', {}, 'Exportar'),
      h('p', { class: 'muted export-lead' }, 'Tu detalle se guarda en un solo archivo HTML con la canción adentro. Se abre en cualquier navegador, incluso sin internet.'),
      this.checks,
      this.warn,
      this.recovery,
      h('div', { class: 'export-actions' }, this.dlBtn, this.prevBtn),
      this.busy,
      this.previewLink,
      this.details,
      this.notes,
    );
    ['media', 'clip', 'project', 'reset'].forEach((ev) => app.on(ev, () => { this.clearPreview(); this.paint(); }));
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
    // lo que falta del todo ya lo dice la lista; aquí solo lo que cambia el resultado
    if (r.marked && r.marked < r.phrases) msgs.push(`Faltan ${r.phrases - r.marked} frases por marcar; esas no aparecerán.`);
    if (r.outside) msgs.push(`${r.outside} frases marcadas quedan fuera del tramo y no aparecerán. Amplía el tramo o ajusta sus tiempos.`);
    if (r.hasSong && r.marked && !r.done) msgs.push('No hay frases visibles en este tramo. Vuelve a Canción para revisarlo.');
    if (plan && plan.bytes > 22 * 1048576) msgs.push('El archivo va a pesar bastante. Si quieres uno más ligero, elige un tramo más corto.');
    this.warn.classList.toggle('hidden', !msgs.length);
    this.warn.replaceChildren(...msgs.map((m) => h('p', {}, m)));
    // lista de lo que lleva el archivo: cada pendiente trae el botón que lo resuelve
    const fix = (tab, text) => h('button', { class: 'btn small', type: 'button', onclick: () => app.selectTab(tab, { focus: true }) }, text);
    const item = (done, title, detail, action) => h('li', { class: done ? 'ok' : 'todo' }, h('span', { class: 'chk', 'aria-hidden': 'true' }, done ? icon('check') : null), h('span', { class: 'ctx' }, h('b', {}, title), h('small', {}, detail)), done ? null : action);
    this.checks.replaceChildren(
      item(r.hasSong, 'Canción', r.hasSong ? `${app.media.name} · ${Math.round(clip.end - clip.start)} s` : 'Falta elegirla', fix('song', 'Elegir canción')),
      item(r.phrases > 0, 'Letra', r.phrases ? `${r.phrases} ${r.phrases === 1 ? 'frase' : 'frases'}` : 'Falta escribirla', fix('text', 'Añadir letra')),
      item(r.phrases > 0 && r.marked >= r.phrases, 'Tiempos', r.phrases ? `${r.marked} de ${r.phrases} marcadas` : 'Después de escribir la letra', r.phrases ? fix('mark', 'Marcar tiempos') : null),
    );
    // con todo listo la lista se vuelve una sola fila y el botón de descarga sube a la vista
    this.checks.classList.toggle('compact', r.hasSong && r.phrases > 0 && r.marked >= r.phrases);
    const actions = [];
    if (r.hasSong && r.outside) actions.push(fix('song', 'Revisar tramo'));
    this.recovery.replaceChildren(...actions); this.recovery.hidden = !actions.length;
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
    if (kind === 'preview') { this.clearPreview(); try { win = window.open('', '_blank'); } catch {} }
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
        if (win) { win.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 120000); }
        else { this.previewUrl = url; this.previewLink.href = url; this.previewLink.hidden = false; }
      }
      this.busy.textContent = `Archivo de ${fmtBytes(bytes)} · audio ${plan.label}` + (kind === 'preview' && !win ? '. El navegador bloqueó la ventana automática. Usa «Abrir vista del destinatario».' : '');
    } catch (e) {
      if (win) win.close();
      this.busy.textContent = '';
      toast(e.message || 'No pude armar el archivo.', 'bad');
    } finally {
      this.making = false;
      if (!app.destroyed) this.paint();
    }
  }
  clearPreview() {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null; this.previewLink.removeAttribute('href'); this.previewLink.hidden = true;
  }
  destroy() { this.clearPreview(); }
}
