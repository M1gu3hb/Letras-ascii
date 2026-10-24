// Cuenta regresiva 3-2-1 del paso Marcar: secuencia, cancelar (botón y Esc), apagarla, teclado (barra espaciadora) y táctil.
// El flujo completo (marcas exactas, fin de frase, pausa…) está en mark-flow.mjs. Solo texto de prueba inventado.
import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const LINES = Array.from({ length: 10 }, (_, i) => `prueba número ${i + 1} con palabras sueltas y luz`).join('\n');

async function open(cfg) {
  const ctx = await b.newContext(cfg);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.evaluate((t) => {
    const a = window.__app;
    a.project.text = t;
    a.projectChanged();
    a.emit('reset');
  }, LINES);
  await pg.click('#tab-mark');
  await pg.waitForTimeout(250);
  return { ctx, pg };
}
const state = (pg) => pg.evaluate(() => window.__app.player.state);
const phase = (pg) => pg.evaluate(() => window.__app.panels.mark.phase);
const cdText = (pg) => pg.evaluate(() => { const e = document.querySelector('.mcard.count .cnum'); return e && !e.closest('[hidden]') ? e.textContent : null; });
const stageCd = (pg) => pg.evaluate(() => { const e = document.querySelector('.stagecd'); return e && !e.hidden ? e.textContent : null; });
const nMarks = (pg) => pg.evaluate(() => window.__app.project.sync.filter(Boolean).length);

async function sequence(pg, ms = 4200) {
  const seen = [];
  const t0 = Date.now();
  let playAt = null;
  while (Date.now() - t0 < ms) {
    const t = await cdText(pg);
    if (t && seen[seen.length - 1] !== t) seen.push(t);
    if (playAt == null && (await state(pg)) === 'playing') {
      playAt = Date.now() - t0;
      break;
    }
    await pg.waitForTimeout(40);
  }
  return { seen, playAt };
}

// ───────── PC: ratón + teclado ─────────
{
  const { ctx, pg } = await open({ viewport: { width: 1440, height: 900 } });
  await pg.click('.mcard.idle .segb:text-is("Solo frases")');
  await pg.click('.mcard.idle .btn.primary');
  const r = await sequence(pg);
  ok(r.seen[0] === '3' && r.seen[1] === '2' && r.seen[2] === '1', 'PC: la cuenta muestra 3, 2, 1 → ' + JSON.stringify(r.seen));
  ok(r.playAt != null && r.playAt > 2300 && r.playAt < 3500, 'PC: la canción arranca al terminar la cuenta (' + r.playAt + ' ms)');
  await pg.waitForTimeout(150);
  ok((await cdText(pg)) === null, 'PC: la cuenta desaparece');
  ok((await phase(pg)) === 'run', 'PC: después de la cuenta se está marcando');

  // Barra espaciadora: marca la frase (toque corto), no reinicia nada
  await pg.waitForTimeout(500);
  const before = await nMarks(pg);
  await pg.keyboard.down('Space');
  await pg.waitForTimeout(80);
  await pg.keyboard.up('Space');
  await pg.waitForTimeout(200);
  const after = await nMarks(pg);
  ok(after === before + 1, 'PC: Espacio marca una frase (' + before + ' → ' + after + ')');
  ok((await cdText(pg)) === null && (await state(pg)) === 'playing', 'PC: Espacio no reinicia la cuenta ni la canción');

  // el foco quedó en un botón: Espacio no debe «presionarlo»
  await pg.focus('.mbtns .btn:has-text("Saltar frase")');
  const p0 = await nMarks(pg);
  await pg.waitForTimeout(700);
  await pg.keyboard.down('Space');
  await pg.waitForTimeout(80);
  await pg.keyboard.up('Space');
  await pg.waitForTimeout(200);
  const p1 = await nMarks(pg);
  ok(p1 === p0 + 1, 'PC: con el foco en «Saltar frase», Espacio marca y NO salta la frase (' + p0 + ' → ' + p1 + ')');

  // pausar y empezar otra vez: cancelar la cuenta con el botón
  await pg.click('.mtopbtn');
  await pg.waitForTimeout(700);
  await pg.click('.mcard.pause .btn:has-text("Empezar de cero")');
  await pg.waitForTimeout(1100);
  ok((await cdText(pg)) !== null && (await phase(pg)) === 'count', 'PC: durante la cuenta se ve el número');
  ok((await pg.locator('.mcard.count .btn').first().textContent()).includes('Cancelar'), 'PC: la tarjeta ofrece «Cancelar»');
  ok((await stageCd(pg)) !== null, 'PC: y el número también sale grande sobre el escenario');
  await pg.click('.mcard.count .btn');
  await pg.waitForTimeout(3300);
  ok((await cdText(pg)) === null && (await state(pg)) !== 'playing' && (await phase(pg)) !== 'run', 'PC: cancelar detiene la cuenta y la canción no arranca');
  ok((await nMarks(pg)) >= 2, 'PC: cancelar no borró lo que ya estaba marcado');

  // Escape cancela
  await pg.click('.mcard:not([hidden]) .btn.primary');
  await pg.waitForTimeout(700);
  ok((await phase(pg)) === 'count', 'PC: otra cuenta en marcha');
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(3300);
  ok((await state(pg)) !== 'playing' && (await cdText(pg)) === null && (await phase(pg)) !== 'run', 'PC: Escape cancela la cuenta');

  // cuenta apagada: arranca de inmediato
  await pg.locator('.mopts .switch').click();
  await pg.click('.mcard:not([hidden]) .btn.primary');
  await pg.waitForTimeout(500);
  ok((await state(pg)) === 'playing' && (await cdText(pg)) === null, 'PC: con la cuenta apagada la canción suena en seguida');
  await ctx.close();
}

// ───────── teléfono: táctil ─────────
{
  const { ctx, pg } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await pg.tap('.mcard.idle .btn.primary');
  const r = await sequence(pg, 3600);
  ok(r.seen[0] === '3' && r.seen[1] === '2' && r.seen[2] === '1', 'Teléfono: cuenta 3, 2, 1 → ' + JSON.stringify(r.seen));
  await pg.waitForTimeout(900);
  ok((await state(pg)) === 'playing', 'Teléfono: la canción suena');
  // tocar y mantener en el botón grande (palabra por palabra)
  const bb = await pg.locator('.pad').boundingBox();
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;
  const pad0 = bb.y;
  const cdp = await ctx.newCDPSession(pg);
  for (let i = 0; i < 4; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await pg.waitForTimeout(220);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pg.waitForTimeout(300);
  }
  const bb2 = await pg.locator('.pad').boundingBox();
  ok(Math.abs(bb2.y - pad0) < 1, 'Teléfono: el botón grande no se mueve al marcar (' + pad0 + ' → ' + bb2.y + ')');
  const cur = await pg.evaluate(() => window.__app.panels.mark.pend.wt.length + (window.__app.project.sync[0] ? window.__app.project.sync[0].wt.length : 0));
  ok(cur === 4, 'Teléfono: 4 palabras mantenidas = 4 palabras marcadas (' + cur + ')');
  await ctx.close();
}

console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
