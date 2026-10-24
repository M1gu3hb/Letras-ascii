// Auditoría de UI: capturas de cada pestaña en varios tamaños + reproducción del salto de scroll al marcar.
// Usa solo texto de prueba inventado.
import { serve, launch, watch } from './lib.mjs';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT || 'test/audit';
mkdirSync(OUT, { recursive: true });
const { srv, port } = serve('site');
const b = await launch();
const errs = [];

const LINES = Array.from({ length: 26 }, (_, i) => `prueba número ${i + 1} con palabras sueltas y luz`).join('\n');
const DEVICES = {
  'phone-360': { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  'phone-390': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  'phone-land': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  'tablet-p': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
  'tablet-l': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
  'desk-1440': { viewport: { width: 1440, height: 900 } },
  'desk-1024': { viewport: { width: 1024, height: 680 } },
};
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(DEVICES);
for (const name of only) {
  const ctx = await b.newContext(DEVICES[name]);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.waitForTimeout(400);
  await pg.evaluate((txt) => {
    const a = window.__app;
    a.project.text = txt;
    a.projectChanged();
    a.emit('reset');
  }, LINES);
  await pg.evaluate(() => {
    const a = window.__app;
    // algunas frases ya marcadas para que "Palabras" tenga contenido
    for (let i = 0; i < 6; i++) a.project.sync[i] = { t: 1 + i * 2.2 };
    a.projectChanged();
    a.emit('reset');
  });
  await pg.waitForTimeout(500);
  for (const t of ['song', 'text', 'mark', 'style', 'words', 'export']) {
    await pg.click('#tab-' + t);
    await pg.waitForTimeout(350);
    await pg.evaluate(() => window.scrollTo(0, 0));
    await pg.screenshot({ path: `${OUT}/${name}-${t}.png` });
  }
  const ox = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(name, 'overflow-x:', ox);
  await ctx.close();
}

// Salto de scroll al marcar (PC): el botón grande y el panel no deben moverse mientras se marca
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
if (!process.argv[2] || process.argv[2].includes('desk-1440')) {
  const ctx = await b.newContext(DEVICES['desk-1440']);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.click('text=30 s');
  await pg.click('#tab-text');
  await pg.fill('textarea.lyrics', LINES);
  await pg.click('#tab-mark');
  // un toque por frase; la cuenta regresiva 3, 2, 1 va primero y la canción arranca desde el principio del tramo
  await pg.click('.mcard.idle .segb:text-is("Solo frases")');
  await pg.click('.mcard.idle .btn.primary');
  await pg.waitForFunction(() => window.__app.panels.mark.phase === 'run', null, { timeout: 8000 });
  await pg.waitForTimeout(500);
  const snap = () =>
    pg.evaluate(() => {
      const pad = document.querySelector('.pad').getBoundingClientRect();
      const panel = document.querySelector('.panel');
      return { padY: Math.round(pad.top), panelTop: Math.round(panel.scrollTop), page: Math.round(document.scrollingElement.scrollTop) };
    });
  const first = await snap();
  console.log('antes', JSON.stringify(first));
  let moved = 0;
  for (let i = 0; i < 30; i++) {
    const bb = await pg.locator('.pad').boundingBox();
    await pg.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await pg.mouse.down();
    await pg.waitForTimeout(90);
    await pg.mouse.up();
    await pg.waitForTimeout(260);
    // al terminar la última frase el botón grande desaparece a propósito (queda «¿Quedó bien?»): ya no se mide
    if ((await pg.evaluate(() => window.__app.panels.mark.phase)) !== 'run') break;
    const s2 = await snap();
    if (s2.padY !== first.padY || s2.panelTop !== first.panelTop || s2.page !== first.page) moved++;
    console.log('frase', i + 1, JSON.stringify(s2));
  }
  ok(moved === 0, 'PC: al marcar no salta el scroll ni se mueve el botón grande (' + moved + ' cambios)');
  await pg.waitForTimeout(300);
  ok((await pg.evaluate(() => window.__app.panels.mark.phase)) === 'done', 'PC: tras la última frase queda «¿Quedó bien?» (sin cuenta regresiva nueva)');
  await pg.screenshot({ path: `${OUT}/desk-1440-after-marks.png` });
  await ctx.close();
}
console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errors:', errs.length ? errs : 'none');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
