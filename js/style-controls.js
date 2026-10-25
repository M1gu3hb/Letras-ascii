import { h, field, select, segmented, slider, toggle, chips, toast } from './ui.js';
import { APPEAR_LABELS, FACE_LABELS, COLOR_LABELS } from './project.js';
export function readingControls(app) {
  const controls = {};
  const change = (key, value) => { app.project.style[key] = value; app.projectChanged(); };
  const mode = (key, name) => controls[key] = segmented([['ascii','ASCII'],['normal','Texto normal']], app.project.style[key], value => change(key, value), name);
  const choice = (key, name, options) => controls[key] = select(options, app.project.style[key], value => change(key, value), name);
  const range = (key, name, min, max, step) => controls[key] = slider({ min, max, step, value: app.project.style[key], label: name, fmt: value => value.toFixed(2) + '×', onInput: value => change(key, value) });
  controls.karaokeOn = toggle('Mostrar frase de karaoke', app.project.style.karaokeOn, value => change('karaokeOn', value));
  const faces = Object.entries(FACE_LABELS);
  const entry = choice('entryFx', 'Entrada global', [['auto','Automática'], ...Object.entries(APPEAR_LABELS)]);
  const duration = h('input', { type: 'number', min: 0, max: 3000, step: 10, value: app.project.style.entryMs, 'aria-label': 'Duración de entrada global en milisegundos', onchange: e => { if (Number.isFinite(e.target.valueAsNumber)) change('entryMs', Math.max(0, Math.min(3000, e.target.valueAsNumber))); } });
  controls.entryMs = { set: value => { duration.value = value; } };
  const section = (name, ...items) => h('details', { class: 'grp', open: true }, h('summary', {}, name), h('div', { class: 'gbody' }, ...items));
  const elements = [
    section('Letras principales', field('Modo principal', mode('mainMode','Modo de letras principales')), field('Tipografía principal', choice('mainFace','Tipografía principal',[['auto','Variar entre las permitidas'],...faces])), field('Color principal', choice('mainColor','Color principal',[['auto','Automático'],...Object.entries(COLOR_LABELS)]))),
    section('Entradas legibles', field('Entrada global',entry), field('Duración pedida · milisegundos',duration), h('p',{class:'muted small'},'Rápida propone 80 ms. Cada entrada ocupa como máximo el 25% de su ventana visual; el inspector muestra el tiempo efectivo. Cero significa instantánea. Las marcas cantadas se conservan.')),
    section('Karaoke inferior', controls.karaokeOn, field('Modo de karaoke',mode('karaokeMode','Modo de karaoke')), field('Fuente de karaoke',choice('karaokeFace','Fuente de karaoke',faces)), range('karaokeSize','Tamaño de karaoke',.75,2,.05), range('karaokeDetail','Detalle del ASCII de karaoke',.75,1.5,.05), range('karaokeContrast','Contraste de karaoke',.6,1.5,.05), h('p',{class:'muted small'},'Las frases largas avanzan por segmentos de hasta dos líneas. La palabra activa se subraya, además de cambiar de color.')),
  ];
  return { elements, sync() { for (const [key, control] of Object.entries(controls)) control.set(app.project.style[key]); } };
}

export function versionControls(app, onGenerate) {
  const levels = segmented([['0.15','Sutil'],['0.45','Equilibrado'],['0.85','Intenso']], String(app.project.style.random), value => { app.project.style.random = +value; app.projectChanged(); }, 'Intensidad de la variación');
  const groups = chips([['faces','Fuentes'],['colors','Colores'],['backgrounds','Fondos'],['animations','Animaciones']], app.project.style.randomGroups, value => { app.project.style.randomGroups = value; app.projectChanged(); });
  const undo = h('button',{class:'btn',type:'button',onclick:()=>app.history.undo()},'Deshacer');
  const redo = h('button',{class:'btn',type:'button',onclick:()=>app.history.redo()},'Rehacer');
  const update = () => { undo.disabled=!app.history.past.length; redo.disabled=!app.history.future.length; };
  app.on('history',update); update();
  return { element:h('section',{class:'version-controls','aria-label':'Variaciones de diseño'},
    h('div',{class:'row wrap'},h('button',{class:'btn primary',type:'button',onclick:()=>app.project.style.randomGroups.length ? onGenerate() : toast('Elige al menos un grupo para variar.')},'Generar otra versión'),undo,redo),
    levels, field('Qué puede variar',groups), h('button',{class:'btn ghost',type:'button',onclick:async()=>{ if(await app.save()) toast('Versión guardada en este navegador.'); }},'Conservar esta versión'),
    h('p',{class:'muted small'},'Tus cambios por palabra y los ajustes de lectura se conservan. Deshacer recupera la versión anterior.')),
    sync(){levels.set(String(app.project.style.random));groups.set(app.project.style.randomGroups)} };
}
