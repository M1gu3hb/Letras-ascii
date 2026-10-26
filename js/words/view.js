import { h, segmented, toggle } from '../ui.js';
import { TimeStrip } from '../strip.js';
import { holdRepeat, lsSet } from './support.js';
import { adjustmentTools } from './controls.js';
export function buildView(panel) {
 const app = panel.app;
    panel.empty = h(
      'div',
      { class: 'wempty' },
      h('p', { class: 'muted' }, 'Aquí cambias palabra por palabra cuándo suena y cómo se ve: la animación, la tipografía, el color, el tamaño, el grosor, si se estira y efectos como brillo o explosión. Primero marca tu letra en el paso 3.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => app.selectTab('mark') }, 'Ir a marcar la letra'),
    );

    // frase
    panel.prevPh = h('button', { class: 'btn small ghost navb', type: 'button', 'aria-label': 'Frase anterior', onclick: () => panel.gotoPhrase(-1) }, '◀');
    panel.nextPh = h('button', { class: 'btn small ghost navb', type: 'button', 'aria-label': 'Frase siguiente', onclick: () => panel.gotoPhrase(1) }, '▶');
    panel.phTitle = h('b', { class: 'phn' });
    panel.phText = h('span', { class: 'pht muted' });
    panel.nav = h('div', { class: 'phnav' }, panel.prevPh, h('div', { class: 'phmid', role: 'status', 'aria-live': 'polite' }, panel.phTitle, panel.phText), panel.nextPh);

    // tira
    panel.strip = new TimeStrip({
      onPick: (src, k) => panel.pick(src, k),
      onTap: (src, k) => panel.tapWord(src, k),
      onMove: (src, k, on, final) => final && panel.setStartClip(src, k, on),
      onSize: (src, k, len, final) => final && panel.setLen(src, k, len),
      onSeek: (t) => {
        panel.audition.stop();
        panel.setFollow(false);
        app.audioFull.pause();
        app.player.seek(t);
        panel.strip.setPlayhead(t);
        app.paintTime();
      },
      onView: () => {
        panel.setFollow(false);
      },
      limits: (src, k) => panel.limitsClip(src, k),
      holdMin: () => panel.holdMin(),
    });
    const zb = (label, aria, fn) => h('button', { class: 'btn small ghost zb', type: 'button', 'aria-label': aria, title: aria, onclick: fn }, label);
    panel.followBtn = h('button', { class: 'btn small ghost zb on', type: 'button', 'aria-pressed': 'true', title: 'Que la tira siga a la canción mientras suena', onclick: () => panel.setFollow(!panel.follow) }, 'Seguir');
    panel.zoomRow = h(
      'div',
      { class: 'zoomrow' },
      zb('−', 'Alejar la tira', () => panel.strip.zoom(1.4, panel.word()?.w.onset ?? app.player.t)),
      zb('+', 'Acercar la tira', () => panel.strip.zoom(0.7, panel.word()?.w.onset ?? app.player.t)),
      zb('Frase', 'Ver la frase completa', () => panel.fitPhrase()),
      zb('Palabra', 'Acercar a la palabra elegida', () => panel.fitWord()),
      panel.followBtn,
    );

    // palabras de la frase
    panel.chipsRow = h('div', { class: 'wchips big', role: 'group', 'aria-label': 'Palabras de la frase' });

    // tiempos (se arma una sola vez; después solo se actualizan los textos)
    const nb = (label, aria, fn) => holdRepeat(h('button', { class: 'btn small nb', type: 'button', 'aria-label': aria, title: aria }, label), fn, app.scope);
    panel.tInfo = h('span', { class: 'tinfo' });
    panel.dInfo = h('span', { class: 'tinfo' });
    panel.longSeg = segmented(
      [
        ['0', 'Corta'],
        ['1', 'Larga (se estira)'],
      ],
      '0',
      (v) => panel.setLong(v === '1'),
      'Tipo de palabra',
    );
    const startRow = h(
      'div',
      { class: 'trow2' },
      h('div', { class: 'tl' }, h('b', {}, 'Empieza'), panel.tInfo),
      h('div', { class: 'tbs' }, nb('◀◀ 0.1', 'Mover 0.1 segundos antes', () => panel.nudge(-0.1)), nb('◀ 0.02', 'Mover 0.02 segundos antes', () => panel.nudge(-0.02)), nb('0.02 ▶', 'Mover 0.02 segundos después', () => panel.nudge(0.02)), nb('0.1 ▶▶', 'Mover 0.1 segundos después', () => panel.nudge(0.1))),
    );
    const durRow = h(
      'div',
      { class: 'trow2' },
      h('div', { class: 'tl' }, h('b', {}, 'Dura'), panel.dInfo),
      h('div', { class: 'tbs' }, nb('− 0.1', 'Acortar 0.1 segundos', () => panel.nudgeLen(-0.1)), nb('− 0.02', 'Acortar 0.02 segundos', () => panel.nudgeLen(-0.02)), nb('+ 0.02', 'Alargar 0.02 segundos', () => panel.nudgeLen(0.02)), nb('+ 0.1', 'Alargar 0.1 segundos', () => panel.nudgeLen(0.1))),
      panel.longSeg,
    );
    const phrRow = h(
      'div',
      { class: 'trow2' },
      h('div', { class: 'tl' }, h('b', {}, 'Toda la frase'), h('span', { class: 'tinfo' }, 'mueve sus palabras juntas')),
      h('div', { class: 'tbs' }, nb('◀◀ 0.25', 'Mover la frase 0.25 segundos antes', () => panel.nudgePhrase(-0.25)), nb('◀ 0.05', 'Mover la frase 0.05 segundos antes', () => panel.nudgePhrase(-0.05)), nb('0.05 ▶', 'Mover la frase 0.05 segundos después', () => panel.nudgePhrase(0.05)), nb('0.25 ▶▶', 'Mover la frase 0.25 segundos después', () => panel.nudgePhrase(0.25))),
    );
    panel.hereBtn = h('button', { class: 'btn primary here', type: 'button', 'aria-label': 'Poner aquí el inicio de la palabra; mantén presionado si es larga' }, h('b', {}, '● Aquí'), h('small', {}, 'pon el inicio donde suena en la canción'));
    panel.hereBtn.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      try {
        panel.hereBtn.setPointerCapture(e.pointerId);
      } catch (err) {}
      panel.herePress();
    });
    panel.hereBtn.addEventListener('pointerup', () => panel.hereRelease());
    for (const ev of ['pointercancel','lostpointercapture']) panel.hereBtn.addEventListener(ev, () => { if (panel.hereAt) { panel.cancelHere(); app.history.cancel(); } });
    panel.hereBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    panel.hereBtn.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        panel.herePress();
      }
    });
    panel.hereBtn.addEventListener('keyup', (e) => (e.key === 'Enter' || e.key === ' ') && panel.hereRelease());
    const redoPhrase = h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
      if (!panel.sel || !confirm('¿Volver a marcar esta frase? Las otras frases se conservan.')) return;
      const src = panel.sel.src;
      app.selectTab('mark'); app.panels.mark.jump(src, true);
    } }, 'Volver a marcar esta frase');
    panel.hereRow = h('div', { class: 'row wrap here-row' }, panel.hereBtn, redoPhrase);
    panel.timeBox = h('div', { class: 'tbox' }, panel.hereRow, startRow, durRow, phrRow);

    // estilo de la palabra
    panel.insp = h('div', { class: 'insp' });

    // todas las palabras
    panel.list = h('ol', { class: 'wlist' });
    panel.listBox = h('div', { class: 'wlistbox' }, panel.list);
    panel.allBox = h('details', { class: 'grp allw' }, h('summary', {}, 'Todas las frases y palabras'), h('div', { class: 'gbody' }, panel.listBox));
    const wide = window.matchMedia && window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches;
    panel.allBox.open = !!wide;
    panel.allBox.addEventListener('toggle', () => panel.allBox.open && panel.paintList());

    panel.playTog = toggle('Escuchar la palabra al elegirla o moverla', panel.playOn, (v) => {
      panel.playOn = v;
      lsSet('wordplay', v ? '1' : '0');
    });
    panel.playTog.classList.add('small');

    panel.keys = h(
      'details',
      { class: 'grp allw keys' },
      h('summary', {}, 'Atajos de teclado'),
      h(
        'ul',
        { class: 'keylist gbody' },
        h('li', {}, h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), ' mueven la palabra 0.02 s (con ', h('kbd', {}, 'Shift'), ' 0.1 s, con ', h('kbd', {}, 'Alt'), ' 0.005 s)'),
        h('li', {}, h('kbd', {}, '['), ' ', h('kbd', {}, ']'), ' acortan o alargan la palabra (con ', h('kbd', {}, 'Shift'), ' más)'),
        h('li', {}, h('kbd', {}, ','), ' ', h('kbd', {}, '.'), ' palabra anterior o siguiente; con ', h('kbd', {}, 'Shift'), ', frase anterior o siguiente'),
        h('li', {}, h('kbd', {}, 'M'), ' o ', h('kbd', {}, 'Enter'), ': «Aquí», pone el inicio de la palabra donde va la canción (si la mantienes, también su duración)'),
        h('li', {}, h('kbd', {}, 'R'), ' escucha la palabra otra vez · ', h('kbd', {}, 'Espacio'), ' reproduce o pausa'),
        h('li', {}, h('kbd', {}, '+'), ' ', h('kbd', {}, '-'), ' acercan o alejan la tira (también ', h('kbd', {}, 'Ctrl'), ' + rueda del mouse)'),
      ),
    );

    const tools = adjustmentTools(panel);
    panel.timeBox.prepend(panel.precision);
    panel.zoomRow.append(zb('Tramo', 'Ver todo el tramo', () => { panel.setFollow(false); panel.strip.showRange(0, app.player.dur); }));
    panel.top = h('div', { class: 'wtop' }, panel.nav, panel.strip.el, panel.zoomRow);
    panel.tools = tools;
    panel.inspectorBox = h('details', { class: 'adjust-inspector', open: true }, h('summary', {}, 'Aspecto de la palabra'), panel.insp);
    panel.el = h('div', { class: 'pane wordspane' }, h('h2', {}, 'Ajustar letra'), panel.empty, panel.top, tools, panel.chipsRow, panel.timeBox, panel.inspectorBox, panel.allBox, panel.playTog, panel.keys);


}
