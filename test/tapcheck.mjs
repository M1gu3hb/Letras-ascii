import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
await pg.click('text=30 s');
await pg.click('#tab-text');
await pg.fill('textarea.lyrics', 'uno dos tres cuatro cinco\nseis siete ocho');
await pg.click('#tab-mark');
await pg.click('text=▶ Empezar a marcar');
await pg.waitForFunction(() => window.__app.player.state === 'playing', null, { timeout: 8000 });
await pg.waitForTimeout(500);
console.log('estado tras empezar:', await pg.evaluate(() => window.__app.player.state));
const pad = await pg.locator('.pad').boundingBox();
const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2;
for (let i = 0; i < 3; i++) {
  await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.waitForTimeout(120); await pg.mouse.up(); await pg.waitForTimeout(300);
  console.log('tap', i + 1, JSON.stringify(await pg.evaluate(() => ({ pend: window.__app.panels.mark.pend, cur: window.__app.panels.mark.cur, st: window.__app.player.state, t: +window.__app.player.t.toFixed(2) }))));
}
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
