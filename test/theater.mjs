// Pantalla completa del escenario: se abre/cierra con el botón, con F y con Esc; el escenario ocupa toda la pantalla
// (y se vuelve a acomodar al girar el teléfono); los controles se esconden solos y vuelven al tocar; nada queda
// roto al volver. Solo texto de prueba inventado.
import { serve, launch, watch } from './lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('test/audit', { recursive: true });
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const LINES = ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar', 'otra línea más larga para ver cómo se acomoda'].join('\n');

async function setup(cfg, { marked = true } = {}) {
  const ctx = await b.newContext(cfg);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.evaluate(
    ([t, marked]) => {
      const a = window.__app;
      a.project.text = t;
      if (marked) a.project.sync = [{ t: 1.0 }, { t: 3.8, wt: [3.8, 4.3, 4.9], wd: [0.5, 1.6, 0.4] }, { t: 7.0 }, { t: 9.2 }];
      a.projectChanged();
      a.emit('reset');
    },
    [LINES, marked],
  );
  await pg.waitForTimeout(700);
  return { ctx, pg };
}
const state = (pg) =>
  pg.evaluate(() => {
    const a = window.__app;
    const th = document.querySelector('.theater');
    const cv = a.canvas;
    const r = a.scene.r;
    return {
      open: !th.hidden,
      on: a.theaterOn,
      parent: cv.parentElement.className,
      cw: Math.round(parseFloat(cv.style.width)),
      ch: Math.round(parseFloat(cv.style.height)),
      W: r.W,
      H: r.H,
      cols: r.grid.cols,
      rows: r.grid.rows,
      hud: th.classList.contains('hud'),
      inert: document.querySelector('.grid').inert && document.querySelector('.top').inert,
      iw: window.innerWidth,
      ih: window.innerHeight,
      fs: !!document.fullscreenElement,
      fsAsked: a.fsAsked,
      play: a.player.state,
      demo: a.player.demo,
      tagParent: a.tag.parentElement.className,
    };
  });

// ───────── teléfono vertical ─────────
{
  const { ctx, pg } = await setup({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const s0 = await state(pg);
  ok(!s0.open && s0.parent === 'stage', `antes: escenario en su lugar (${s0.cw}×${s0.ch}, ${s0.cols}×${s0.rows} celdas)`);
  const bb = await pg.locator('.stagefs').boundingBox();
  ok(bb && bb.width >= 40 && bb.height >= 40, `el botón ⛶ es cómodo de tocar con el dedo (${bb && Math.round(bb.width)}×${bb && Math.round(bb.height)})`);
  const stg = await pg.locator('.stage').boundingBox();
  ok(bb.x >= stg.x && bb.x + bb.width <= stg.x + stg.width + 1 && bb.y + bb.height <= stg.y + stg.height + 1, 'el botón queda dentro del escenario');
  await pg.locator('.stagefs').tap();
  await pg.waitForTimeout(700);
  const s1 = await state(pg);
  ok(s1.open && s1.parent === 'thost', 'se abre la pantalla completa y el escenario se muda a ella');
  ok(s1.W === s1.iw && s1.H === s1.ih, `ocupa toda la pantalla: ${s1.W}×${s1.H} = ventana ${s1.iw}×${s1.ih}`);
  ok(s1.cols >= 72 && s1.rows >= 20, `más celdas que en la vista chica: ${s1.cols}×${s1.rows} (antes ${s0.cols}×${s0.rows})`);
  ok(s1.inert, 'lo de atrás queda inerte (no se enfoca ni se toca)');
  ok(s1.hud, 'los controles se ven al abrir');
  ok(s1.tagParent === 'thost', 'la etiqueta «Ejemplo / Mi letra» viaja con el escenario');
  await pg.screenshot({ path: 'test/audit/theater-phone-open.png' });
  ok(!s1.demo && s1.play !== 'playing', 'al abrir, la imagen respeta la pausa hasta reproducir');
  const fr = [];
  for (let i = 0; i < 2; i++) {
    fr.push(await pg.evaluate(() => window.__app.canvas.toDataURL('image/png')));
    await pg.waitForTimeout(700);
  }
  ok(fr[0] === fr[1], 'y conserva el mismo cuadro mientras está pausada');
  await pg.waitForTimeout(2300);
  ok((await state(pg)).hud, 'en pausa los controles permanecen visibles');
  await pg.touchscreen.tap(195, 300);
  await pg.waitForTimeout(250);
  ok((await state(pg)).hud, 'y vuelven con un toque');
  // reproducir desde la barra
  await pg.locator('.tplay').tap();
  await pg.waitForFunction(() => window.__app.player.state === 'playing', null, { timeout: 5000 });
  ok(true, 'el botón ▶ de la pantalla completa reproduce');
  ok((await pg.locator('.tplay .pauseic').count()) === 1 && (await pg.locator('.play .pauseic').count()) === 1, 'ambos botones muestran la pausa mientras suena');
  await pg.waitForTimeout(3600);
  const s2 = await state(pg);
  ok(!s2.hud, 'mientras suena, los controles se esconden solos');
  await pg.screenshot({ path: 'test/audit/theater-phone-playing.png' });
  await pg.touchscreen.tap(195, 300);
  await pg.waitForTimeout(250);
  ok((await state(pg)).hud, 'un toque en la pantalla vuelve a mostrar los controles');
  // pausar con ▶/⏸ y la barra se queda
  await pg.locator('.tplay').tap();
  await pg.waitForFunction(() => window.__app.player.state === 'paused', null, { timeout: 5000 });
  await pg.waitForTimeout(3300);
  const sp = await state(pg);
  ok(sp.hud && !sp.demo, 'en pausa la imagen se congela y los controles se quedan visibles');
  // mover la barra de posición
  const sb = await pg.locator('.tscrub').boundingBox();
  await pg.touchscreen.tap(sb.x + sb.width * 0.5, sb.y + sb.height / 2);
  await pg.waitForTimeout(300);
  const pos = await pg.evaluate(() => ({ t: window.__app.player.t, dur: window.__app.player.dur }));
  ok(pos.t > pos.dur * 0.3 && pos.t < pos.dur * 0.7, `la barra de la pantalla completa cambia de posición (${pos.t.toFixed(1)} s de ${pos.dur.toFixed(0)})`);
  // girar el teléfono
  await pg.setViewportSize({ width: 844, height: 390 });
  await pg.waitForTimeout(900);
  const s3 = await state(pg);
  ok(s3.W === 844 && s3.H === 390, `al girar se vuelve a acomodar: ${s3.W}×${s3.H} (${s3.cols}×${s3.rows} celdas)`);
  await pg.screenshot({ path: 'test/audit/theater-phone-land.png' });
  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.waitForTimeout(700);
  // cerrar con ✕
  await pg.locator('.theater').evaluate((el) => el.classList.add('hud'));
  await pg.locator('.tclose').tap();
  await pg.waitForTimeout(700);
  const s4 = await state(pg);
  ok(!s4.open && s4.parent === 'stage' && s4.tagParent === 'stage', 'al cerrar, el escenario vuelve a su lugar');
  ok(Math.abs(s4.cw - s0.cw) <= 1 && Math.abs(s4.ch - s0.ch) <= 1 && s4.cols === s0.cols && s4.rows === s0.rows, `y con el mismo tamaño de antes (${s4.cw}×${s4.ch}, ${s4.cols}×${s4.rows})`);
  ok(!s4.inert, 'lo de atrás vuelve a responder');
  // el estudio sigue funcionando
  await pg.click('#tab-style');
  await pg.waitForTimeout(300);
  ok((await pg.locator('.panel').innerText()).includes('Aspecto del ASCII'), 'el estudio sigue respondiendo');
  // gesto «atrás» del teléfono: cierra la vista y no te saca de la página
  const href0 = await pg.evaluate(() => location.href);
  await pg.locator('.stagefs').tap();
  await pg.waitForTimeout(500);
  ok((await state(pg)).open, 'se vuelve a abrir');
  await pg.evaluate(() => history.back());
  await pg.waitForTimeout(600);
  const s5 = await state(pg);
  ok(!s5.open && s5.parent === 'stage' && (await pg.evaluate(() => location.href)) === href0, 'el gesto «atrás» cierra la pantalla completa y se queda en el estudio');
  // abrir y cerrar con ✕ varias veces no deja basura en el historial ni saca de la página
  for (let i = 0; i < 3; i++) {
    await pg.locator('.stagefs').tap();
    await pg.waitForTimeout(350);
    await pg.locator('.theater').evaluate((el) => el.classList.add('hud'));
    await pg.locator('.tclose').tap();
    await pg.waitForTimeout(450);
  }
  const s6 = await state(pg);
  ok(!s6.open && s6.parent === 'stage' && (await pg.evaluate(() => location.href)) === href0 && (await pg.evaluate(() => !!window.__app)), 'abrir y cerrar varias veces deja todo en su lugar');
  await ctx.close();
}

// ───────── PC: teclado ─────────
{
  const { ctx, pg } = await setup({ viewport: { width: 1440, height: 900 } });
  await pg.keyboard.press('f');
  await pg.waitForTimeout(600);
  let s = await state(pg);
  ok(s.open && s.W === s.iw && s.H === s.ih, `F abre la pantalla completa (${s.W}×${s.H}, ${s.cols}×${s.rows} celdas; pantalla completa del navegador: ${s.fs ? 'sí' : 'no'})`);
  await pg.screenshot({ path: 'test/audit/theater-desk-open.png' });
  await pg.keyboard.press('Space');
  await pg.waitForFunction(() => window.__app.player.state === 'playing', null, { timeout: 5000 });
  ok(true, 'la barra espaciadora reproduce (sin cerrar nada)');
  s = await state(pg);
  ok(s.open, 'la pantalla completa sigue abierta tras reproducir');
  await pg.keyboard.press('Space');
  await pg.waitForFunction(() => window.__app.player.state === 'paused', null, { timeout: 5000 });
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(600);
  s = await state(pg);
  ok(!s.open && s.parent === 'stage' && !s.fs, 'Esc la cierra y sale de la pantalla completa del navegador');
  // escribir una F en la letra no debe abrir nada
  await pg.click('#tab-text');
  await pg.click('textarea.lyrics');
  await pg.keyboard.type('fff');
  await pg.waitForTimeout(200);
  s = await state(pg);
  ok(!s.open, 'escribir «f» en la letra no abre la pantalla completa');
  // en «Marcar» no hay botón ni atajo
  await pg.click('#tab-mark');
  await pg.waitForTimeout(300);
  ok(!(await pg.locator('.stagefs').isVisible()), 'en «Marcar» no se ofrece la pantalla completa (ahí se está marcando)');
  await pg.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await pg.keyboard.press('f');
  await pg.waitForTimeout(300);
  ok(!(await state(pg)).open, 'tampoco con la tecla F');
  // ratón: botón y salir
  await pg.click('#tab-song');
  await pg.locator('.stagefs').click();
  await pg.waitForTimeout(500);
  ok((await state(pg)).open, 'el botón ⛶ abre con el ratón');
  await pg.mouse.move(700, 400);
  await pg.waitForTimeout(100);
  await pg.locator('.tclose').click();
  await pg.waitForTimeout(500);
  ok(!(await state(pg)).open, 'la ✕ cierra con el ratón');
  await ctx.close();
}

// ───────── sin letra: el ejemplo de tutorial también se ve en grande ─────────
{
  const { ctx, pg } = await setup({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, { marked: false });
  await pg.evaluate(() => {
    window.__app.project.text = '';
    window.__app.projectChanged();
    window.__app.rebuild();
  });
  await pg.waitForTimeout(500);
  await pg.locator('.stagefs').tap();
  await pg.waitForTimeout(1400);
  const s = await state(pg);
  ok(s.open && s.W === 390 && s.H === 844, 'el ejemplo (tutorial) también abre a pantalla completa');
  const seg = await pg.locator('.theater .tagseg').boundingBox();
  const cl = await pg.locator('.tclose').boundingBox();
  ok(seg && cl && (seg.x + seg.width <= cl.x + 1 || seg.y + seg.height <= cl.y || seg.y >= cl.y + cl.height), 'el selector Ejemplo / Mi letra no se encima con la ✕');
  await pg.screenshot({ path: 'test/audit/theater-phone-demo.png' });
  // cambiar a «Mi letra» sin salir
  await pg.locator('.theater .tagseg button:text-is("Mi letra")').tap().catch(() => {});
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: 'test/audit/theater-phone-mine.png' });
  await ctx.close();
}

console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
