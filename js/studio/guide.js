import { h } from '../ui.js';
import { modalDialog } from '../dialog.js';
import { GUIDE_STEPS, GUIDE_FAQ } from '../guide-content.js';

export function openGuide(app) {
  app.dialogRequest = Symbol('guide');
  app.closeProjects?.();
  app.closeGuide?.();
  app.panels.mark?.leave('user');
  app.panels.words?.audition.stop();
  app.player.pause(); app.audioFull.pause();
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Guía de uso' });
  let close;
  const steps = h('ol', { class: 'guide-steps' }, ...GUIDE_STEPS.map(([id, name, description]) => h('li', {},
    h('h3', {}, name), h('p', {}, description),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => { close(); app.selectTab(id, { focus: true }); } }, 'Ir a ' + name),
  )));
  const faq = GUIDE_FAQ.map(([question, answer]) => h('details', { class: 'grp' }, h('summary', {}, question), h('p', { class: 'gbody' }, answer)));
  dialog.append(h('div', { class: 'mbox guide-box' },
    h('div', { class: 'guide-heading' }, h('h2', {}, 'Guía de uso'), h('button', { class: 'btn small ghost', type: 'button', onclick: () => close() }, 'Cerrar guía')),
    h('p', {}, 'Crea letras sincronizadas en ASCII o texto normal y compártelas en un HTML con tu canción.'),
    steps, h('h3', {}, 'Guardar, recuperar y compartir'), ...faq,
  ));
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  close = modalDialog(dialog, app.root, app.helpBtn);
  app.closeGuide = close;
}
