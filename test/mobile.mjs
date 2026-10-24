import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
await pg.waitForTimeout(500);
await pg.screenshot({ path: 'test/m-song.png' });
await pg.evaluate(() => {
  const a = window.__app;
  a.project.text = 'luz que se enciende despacio\nlate fuerte el tambor\nhoooy todo suena';
  a.projectChanged(); a.emit('reset');
});
for (const t of ['text', 'mark', 'style', 'words', 'export']) {
  await pg.click('#tab-' + t);
  await pg.waitForTimeout(300);
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.screenshot({ path: `test/m-${t}.png`, fullPage: false });
}
// ancho: que no haya scroll horizontal
console.log('overflow-x:', await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
