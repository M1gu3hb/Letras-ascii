import { h } from '../ui.js';
import { phrasesOf, syncedCount } from '../project.js';
const STEPS = ['song', 'text', 'mark', 'style', 'words', 'export'];
const LABELS = ['Canción', 'Letra', 'Marcar', 'Estilo', 'Palabras', 'Exportar'];
export function buildNavigation(app) {
  const note = h('span', { class: 'step-note' });
  const back = h('button', { class: 'btn ghost', type: 'button', onclick: () => app.selectTab(app.tab === 'export' && app.previousTab === 'style' ? 'style' : app.tab === 'words' && app.previousTab === 'mark' ? 'mark' : STEPS[Math.max(0, STEPS.indexOf(app.tab) - 1)]) }, 'Atrás');
  const next = h('button', { class: 'btn primary', type: 'button' });
  const footer = h('div', { class: 'step-footer' }, note, h('div', { class: 'step-buttons' }, back, next));
  const paint = () => {
    const i = STEPS.indexOf(app.tab), n = phrasesOf(app.project.text).length, count = syncedCount(app.project);
    footer.hidden = app.tab === 'mark';
    back.hidden = i === 0;
    let destination = STEPS[Math.min(i + 1, STEPS.length - 1)];
    let label = i === 5 ? 'Revisar sincronización' : 'Siguiente: ' + LABELS[Math.min(i + 1, 5)];
    if (i === 5) destination = 'mark';
    if (i === 0 && !app.media) { label = 'Elegir canción o video'; destination = null; }
    if (i === 1 && !n) { label = 'Escribe la letra para continuar'; destination = null; }
    if (i === 1 && n && !app.media) { label = 'Primero: cargar canción'; destination = 'song'; }
    if (i === 3) { label = 'Siguiente: Exportar'; destination = 'export'; }
    next.textContent = label; next.disabled = i === 1 && !n;
    next.onclick = () => destination ? app.selectTab(destination) : app.panels.song.input.click();
    note.textContent = i === 0 ? (app.media ? 'Elige el tramo que quieres usar.' : 'Crea un detalle con tu canción y letra en ASCII.') : i === 1 ? 'Una frase por línea. Luego la sincronizas.' : i === 3 ? 'Reproduce para revisar el diseño. En Palabras puedes afinarlo si lo necesitas.' : i === 4 ? 'Corrige tiempos o estilo. Este paso es opcional.' : 'Descarga el HTML con audio y letra para conservarlo o compartirlo.';
    for (const [index, id] of STEPS.entries()) {
      const done = index === 0 ? !!app.media : index === 1 ? !!n : index === 2 ? n > 0 && count.done === n : false;
      app.tabBtns[id].classList.toggle('complete', done);
      app.tabBtns[id].setAttribute('aria-label', `${index + 1}. ${LABELS[index]}${done ? ', completo' : ''}`);
    }
  };
  ['project', 'media', 'tab', 'reset', 'clip'].forEach((event) => app.on(event, paint));
  app.tabsEl.addEventListener('keydown', (event) => {
    const i = STEPS.indexOf(app.tab);
    const n = event.key === 'ArrowRight' ? (i + 1) % 6 : event.key === 'ArrowLeft' ? (i + 5) % 6 : event.key === 'Home' ? 0 : event.key === 'End' ? 5 : -1;
    if (n < 0) return;
    event.preventDefault(); app.selectTab(STEPS[n]); app.tabBtns[STEPS[n]].focus();
  });
  return { footer, paint };
}
