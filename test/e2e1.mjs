import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
// 1. subir audio sintético
const t0 = Date.now();
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
console.log('subida+análisis ms:', Date.now() - t0);
const info = await pg.evaluate(() => {
  const a = window.__app;
  const e = a.media.energy;
  let hits = 0;
  for (let i = 0; i < e.hit.length; i++) if (e.hit[i]) hits++;
  return { dur: a.media.dur, hits, clip: a.clip(), frames: e.hit.length };
});
console.log(JSON.stringify(info));
await pg.waitForTimeout(600);
await pg.screenshot({ path: 'test/e2e-song.png' });
// 2. presets
await pg.click('text=1 min');
await pg.waitForTimeout(500);
console.log('clip 1min:', JSON.stringify(await pg.evaluate(() => window.__app.clip())));
await pg.click('text=30 s');
await pg.waitForTimeout(500);
console.log('clip 30s:', JSON.stringify(await pg.evaluate(() => window.__app.clip())));
console.log('player dur:', await pg.evaluate(() => window.__app.player.dur));
// 3. reproducir y verificar tiempo
await pg.click('.tbtn.play');
await pg.waitForTimeout(1500);
console.log('t tras 1.5s:', await pg.evaluate(() => window.__app.player.t.toFixed(2)), 'estado', await pg.evaluate(() => window.__app.player.state));
await pg.screenshot({ path: 'test/e2e-play.png' });
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
