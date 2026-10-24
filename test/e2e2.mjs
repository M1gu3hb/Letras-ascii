import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
await pg.click('text=30 s');
// letra (texto original de prueba)
await pg.click('#tab-text');
await pg.fill('textarea.lyrics', 'luz que se enciende despacio\nlate fuerte el tambor\nhoooy todo suena');
console.log('letra:', await pg.textContent('.muted.small'));
// marcar
await pg.click('#tab-mark');
await pg.click('text=▶ Empezar a marcar');
// cuenta regresiva 3-2-1 y luego la canción desde el principio del tramo
await pg.waitForFunction(() => window.__app.panels.mark.phase === 'run', null, { timeout: 8000 });
await pg.waitForTimeout(800);
const pad = await pg.locator('.pad').boundingBox();
const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2;
async function word(holdMs, gapMs) {
  await pg.mouse.move(cx, cy);
  await pg.mouse.down();
  await pg.waitForTimeout(holdMs);
  await pg.mouse.up();
  await pg.waitForTimeout(gapMs);
}
// frase 1: 5 palabras cortas; frase 2: 4; frase 3: 'hoooy' larga + 2
for (let i = 0; i < 5; i++) await word(120, 280);
await pg.waitForTimeout(500);
for (let i = 0; i < 4; i++) await word(120, 300);
await pg.waitForTimeout(500);
await word(1800, 200); // hoooy larga
await word(120, 300);
await word(120, 300);
await pg.waitForTimeout(900);
const res = await pg.evaluate(() => ({ sync: window.__app.project.sync, state: window.__app.player.state, t: window.__app.player.t }));
console.log(JSON.stringify(res.sync).slice(0, 700));
console.log('estado:', res.state, 't', res.t.toFixed(1));
await pg.screenshot({ path: 'test/e2e-mark.png' });
// el escenario ya no usa el ejemplo
console.log('usa ejemplo:', await pg.evaluate(() => window.__app.usingSample()));
console.log('units:', await pg.evaluate(() => window.__app.scene.tl.units.map((u) => u.words.map((w) => w.text + (w.held ? '*' : '')).join(' ')).join(' | ')));
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
