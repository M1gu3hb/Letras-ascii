import { h, segmented, toggle } from '../ui.js';
import { lsGet, lsSet } from './support.js';
export function buildView(panel) {
 const app = panel.app;
    // ───── lo de arriba: dónde vas ─────
    panel.statEl = h('div', { class: 'mstat', role: 'status', 'aria-live': 'polite' });
    panel.clockEl = h('span', { class: 'mclock', 'aria-hidden': 'true' });
    panel.pauseBtn = h('button', { class: 'mtopbtn', type: 'button', 'aria-label': 'Pausar', title: 'Pausar (Esc)', onclick: () => panel.pauseRun('user') }, h('span', { class: 'pauseic' }, h('i'), h('i')));
    panel.top = h('div', { class: 'mtop' }, panel.statEl, panel.clockEl, panel.pauseBtn);
    panel.progEl = h('i', { class: 'mprog', 'aria-hidden': 'true' }, h('b'));

    // ───── la frase que sigues ─────
    panel.prevEl = h('div', { class: 'mline prev' });
    panel.curWrap = h('div', { class: 'mwrap' });
    panel.curEl = h('div', { class: 'mline cur' }, panel.curWrap);
    panel.nxtEl = h('div', { class: 'mline nxt' });
    panel.stageBox = h('div', { class: 'mstage', 'aria-live': 'off' }, panel.prevEl, panel.curEl, panel.nxtEl);

    // ───── el botón grande ─────
    panel.pad = h('button', { class: 'pad', type: 'button', hidden: true });
    panel.padTxt = h('span', { class: 'padtxt' });
    panel.padSub = h('span', { class: 'padsub' });
    panel.padBar = h('i', { class: 'padbar' });
    panel.pad.append(panel.padTxt, panel.padSub, panel.padBar);
    panel.pad.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      if (panel.phase !== 'run' || panel.hold) return;
      try {
        panel.pad.setPointerCapture(e.pointerId);
      } catch (err) {}
      panel.press(e);
    });
    const rel = (e) => panel.release(e);
    panel.pad.addEventListener('pointerup', rel);
    panel.pad.addEventListener('pointercancel', rel);
    panel.pad.addEventListener('lostpointercapture', rel);
    panel.pad.addEventListener('contextmenu', (e) => e.preventDefault());
    panel.pad.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) panel.press(e);
      }
    });
    panel.pad.addEventListener('keyup', (e) => e.key === 'Enter' && panel.release(e));
    panel.goEl = h('span', { class: 'mgo', hidden: true, 'aria-hidden': 'true' }, '¡Ya!');

    // ───── tarjetas: lo que se muestra en lugar del botón grande cuando no se está marcando ─────
    // (los botones de una tarjeta no se dejan tocar mientras «espera»: ver lock())
    const act = (cls, txt, fn) => h('button', { class: cls, type: 'button', onclick: (e) => !panel.locked() && fn(e) }, txt);

    panel.modeSeg = segmented(
      [
        ['word', 'Palabra por palabra'],
        ['phrase', 'Solo frases'],
      ],
      panel.mode,
      (v) => {
        panel.flush();
        panel.mode = v;
        lsSet('markmode', v);
        panel.paint();
      },
      'Cómo marcar',
    );
    panel.cdSwitch = toggle('Cuenta regresiva 3, 2, 1', panel.countOn, (v) => {
      panel.countOn = v;
      lsSet('markcount', v ? '1' : '0');
      panel.paintZone();
    });
    panel.cdSwitch.classList.add('small');
    panel.optsToggle = h('button', { class: 'btn ghost mopts-toggle', type: 'button', 'aria-label': 'Configurar modo y cuenta regresiva', 'aria-expanded': 'false', onclick: () => { const open = panel.opts.classList.toggle('expanded'); panel.optsToggle.setAttribute('aria-expanded', String(open)); } });
    panel.opts = h('div', { class: 'mopts' }, panel.optsToggle, panel.modeSeg, panel.cdSwitch);
    panel.restoreBtn = act('btn ghost small mrestore', '↺ Recuperar los tiempos anteriores', () => panel.restoreBackup());
    panel.restoreBtn.hidden = true;

    // sin empezar
    panel.idleTitle = h('h3', { class: 'mtitle' });
    panel.idleNote = h('p', { class: 'mnote' });
    panel.startBtn = act('btn primary big', '', () => panel.startAction());
    panel.freshBtn = act('btn alt', 'Empezar de cero', () => panel.startFresh());
    panel.idleBtns = h('div', { class: 'mbtnrow' }, panel.startBtn, panel.freshBtn);
    panel.idle = h('div', { class: 'mcard idle' }, panel.idleTitle, panel.idleNote, panel.idleBtns);

    // cuenta regresiva
    panel.cdNum = h('b', { class: 'cnum' });
    panel.cdSub = h('small', { class: 'csub' });
    panel.cancelBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => panel.cancelCount() }, 'Cancelar');
    panel.count = h('div', { class: 'mcard count', role: 'status' }, panel.cdNum, panel.cdSub, panel.cancelBtn);

    // en pausa
    panel.pauseTitle = h('h3', { class: 'mtitle' });
    panel.pauseNote = h('p', { class: 'mnote' });
    panel.resumeBtn = act('btn primary big', '▶ Seguir', () => panel.continuePass());
    panel.undoPauseBtn = act('btn ghost', '↶ Deshacer la última', () => panel.undo());
    panel.freshPauseBtn = act('btn ghost', 'Empezar de cero', () => panel.startFresh());
    panel.pauseBtns = h('div', { class: 'mbtnrow two' }, panel.undoPauseBtn, panel.freshPauseBtn);
    panel.pausedCard = h('div', { class: 'mcard pause' }, panel.pauseTitle, panel.pauseNote, panel.resumeBtn, panel.pauseBtns);

    // solo escuchando
    panel.listenTitle = h('h3', { class: 'mtitle' });
    panel.stopBtn = h('button', { class: 'btn primary big', type: 'button', onclick: () => panel.stopListen() }, '■ Parar');
    panel.listen = h('div', { class: 'mcard listen' }, panel.listenTitle, panel.stopBtn);

    // todo marcado
    panel.doneTitle = h('h3', { class: 'mtitle' }, h('span', { class: 'mcheck', 'aria-hidden': 'true' }, '✓'), h('span', { class: 'mtxt' }));
    panel.doneAsk = h('p', { class: 'mask' }, '¿Quedó bien?');
    panel.previewBtn = act('btn primary big', '▶ Ver vista previa', () => panel.previewMarked());
    panel.nextBtn = act('btn alt big', 'Siguiente: Ajustar →', () => panel.goNext());
    panel.correctBtn = act('btn ghost', 'Omitir ajuste: ir a Estilo', () => app.selectTab('style'));
    panel.againBtn = act('btn ghost', '↻ Marcar otra vez', () => panel.startFresh());
    panel.undoDoneBtn = act('btn ghost', '↶ Deshacer la última', () => panel.undo());
    panel.doneBtns = h('div', { class: 'mbtnrow two' }, panel.againBtn, panel.undoDoneBtn);
    panel.doneCard = h('div', { class: 'mcard done' }, panel.doneTitle, panel.doneAsk, panel.previewBtn, panel.correctBtn, panel.nextBtn, panel.doneBtns);

    panel.cards = { idle: panel.idle, count: panel.count, pause: panel.pausedCard, listen: panel.listen, done: panel.doneCard };
    panel.zone = h('div', { class: 'mzone', tabindex: '-1' }, panel.pad, panel.goEl, ...Object.values(panel.cards));

    // ───── abajo del botón grande (solo mientras se marca) ─────
    panel.undoBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => panel.undo() }, '↶ Deshacer');
    panel.skipBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => panel.skip() }, 'Saltar frase');
    panel.mbtns = h('div', { class: 'mbtns' }, panel.undoBtn, panel.skipBtn);

    // ───── ayuda y lista de frases ─────
    panel.helpTxt = h('p', {});
    panel.helpTip = h('p', { class: 'tip' }, 'Con audífonos Bluetooth el sonido llega con un pequeño retraso: para marcar usa la bocina o unos audífonos con cable. Si al verlo todo queda un poco antes o después, mueve «Sincronía» en Estilo.');
    panel.help = h('details', { class: 'mhelp' }, h('summary', {}, '¿Cómo se marca?'), panel.helpTxt, panel.helpTip);
    // la primera vez se muestra abierta, pero solo si sobra pantalla (en teléfonos chicos se queda cerrada)
    const roomy = window.matchMedia && window.matchMedia('(min-height: 860px)').matches;
    if (lsGet('markhelp', '') !== 'seen' && roomy) panel.help.open = true;
    panel.help.addEventListener('toggle', () => {
      if (!panel.help.open) lsSet('markhelp', 'seen');
    });

    panel.list = h('ol', { class: 'plines' });
    panel.plbox = h('div', { class: 'plbox' }, panel.list);
    panel.plsum = h('summary', {}, 'Todas las frases');
    panel.plwrap = h('details', { class: 'plwrap' }, panel.plsum, panel.plbox);
    const narrow = window.matchMedia && window.matchMedia('(max-width: 899px), (max-aspect-ratio: 1/1), (max-height: 520px)').matches;
    panel.plwrap.open = lsGet('marklist', narrow ? '0' : '1') === '1';
    panel.plwrap.addEventListener('toggle', () => {
      lsSet('marklist', panel.plwrap.open ? '1' : '0');
      if (panel.plwrap.open) panel.revealCurrent(true);
    });

    panel.el = h('div', { class: 'pane markpane', 'data-phase': 'idle', 'data-mode': panel.mode }, h('h2', {}, 'Marcar la letra'), panel.top, panel.progEl, panel.stageBox, panel.zone, panel.mbtns, panel.help, panel.plwrap);


}
