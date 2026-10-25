import { h, select, field, toggle } from '../ui.js';
export function adjustmentTools(panel) {
  const app = panel.app;
  const number = (name, value, min, max, change) => h('input', { type: 'number', step: '.001', min, max, value, 'aria-label': name, onchange: e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) change(e.target.valueAsNumber); panel.paintTimeInfo(); } });
  panel.startInput = number('Inicio de palabra en segundos de canción', 0, 0, 86400, value => panel.sel && panel.setStartAbs(panel.sel.src, panel.sel.k, value, false));
  panel.lengthInput = number('Duración cantada en segundos', .2, .05, 10, value => panel.sel && panel.setLen(panel.sel.src, panel.sel.k, value, false));
  panel.precision = h('div', { class: 'precision-fields' }, field('Inicio · segundos de canción', panel.startInput), field('Duración cantada · segundos', panel.lengthInput));
  const undo = h('button', { class: 'btn small', type: 'button', onclick: () => app.history.undo() }, 'Deshacer');
  const redo = h('button', { class: 'btn small', type: 'button', onclick: () => app.history.redo() }, 'Rehacer');
  app.on('history', () => { undo.disabled = !app.history.past.length && !app.history.batch; redo.disabled = !app.history.future.length; });
  undo.disabled = redo.disabled = true;
  panel.snap = toggle('Ajuste magnético', false, v => { panel.strip.snap = v; }, 'cursor, vecinos y cuadrícula de 100 ms');
  const loop = h('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false', onclick: () => {
    panel.audition.loop = !panel.audition.loop; loop.setAttribute('aria-pressed', String(panel.audition.loop)); panel.audition.refresh();
  } }, 'A–B');
  loop.setAttribute('aria-label', 'Bucle A–B');
  const speed = select([['.5','0.5×'],['.75','0.75×'],['1','1×']], '1', v => { app.player.setRate(+v); app.rateSel.value = v === '.5' ? '0.5' : v === '.75' ? '0.75' : '1'; }, 'Velocidad para corregir');
  const context = (label, key, value) => h('label', { class: 'context-field' }, label, h('input', { type: 'number', min: 0, max: 3, step: '.05', value, 'aria-label': label, onchange: e => {
    if (Number.isFinite(e.target.valueAsNumber)) panel.audition[key] = Math.max(0, Math.min(3, e.target.valueAsNumber));
    panel.audition.refresh();
  } }));
  const listen = (name, kind) => h('button', { class: 'btn small', type: 'button', onclick: () => panel.audition.play(kind) }, name);
  return h('div', { class: 'adjust-tools' },
    h('div', { class: 'audition-transport' }, h('button', {class:'btn small',type:'button','aria-label':'Escuchar palabra',onclick:()=>panel.preview()},'▶ Escuchar'), loop, h('button', { class: 'btn small', type: 'button', 'aria-label':'Detener audición', onclick: () => panel.audition.stop() }, '■'), speed),
    h('div', { class: 'row wrap' }, undo, redo, h('span', { class: 'muted small' }, 'La vista se queda donde editas. Seguir la reactiva.')),
    h('details', { class: 'audition-settings' }, h('summary', {}, 'Contexto y ajuste magnético'), h('div', { class: 'row wrap' }, context('Antes · segundos', 'before', .3), context('Después · segundos', 'after', .6), listen('▶ Escuchar frase', 'phrase'), listen('Escuchar rango visible', 'visible')), panel.snap));
}
