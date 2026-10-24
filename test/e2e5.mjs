import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
// ───────── video
await pg.setInputFiles('#songfile', 'test/media/video20.webm');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
console.log('video:', await pg.evaluate(() => { const m = window.__app.media; return JSON.stringify({ video: m.video, dur: +m.dur.toFixed(2), name: m.name, clip: window.__app.clip() }); }));
await pg.screenshot({ path: 'test/e2e-video.png' });
// ───────── letra + marcas, luego recargar
await pg.evaluate(() => {
  const a = window.__app;
  a.project.text = 'hola de prueba uno\nsegunda frase aquí';
  a.project.sync = [{ t: 1.0, wt: [1.0, 1.5, 2.0, 2.6], wd: [0.2, 0.2, 0.2, 0.9] }, { t: 5.0 }];
  a.project.style.palette = 'fuego';
  a.project.over = { '0.1': { face: 'serif' } };
  a.projectChanged(); a.emit('reset');
});
await pg.waitForTimeout(1500);
const before = await pg.evaluate(() => JSON.stringify({ id: window.__app.id, text: window.__app.project.text, sync: window.__app.project.sync, pal: window.__app.project.style.palette, over: window.__app.project.over, clip: window.__app.project.clip }));
await pg.reload();
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 30000 });
await pg.waitForFunction(() => window.__app.media, null, { timeout: 30000 });
const after = await pg.evaluate(() => JSON.stringify({ id: window.__app.id, text: window.__app.project.text, sync: window.__app.project.sync, pal: window.__app.project.style.palette, over: window.__app.project.over, clip: window.__app.project.clip }));
console.log('restaurado igual:', before === after);
if (before !== after) console.log(before, '\n', after);
console.log('media tras recargar:', await pg.evaluate(() => window.__app.media && window.__app.media.dur.toFixed(2)));
// ───────── Nuevo + proyectos
await pg.click('text=Nuevo');
await pg.waitForTimeout(500);
console.log('nuevo limpio:', await pg.evaluate(() => JSON.stringify({ media: !!window.__app.media, text: window.__app.project.text })));
await pg.click('text=Mis proyectos');
await pg.waitForTimeout(500);
await pg.screenshot({ path: 'test/e2e-projects.png' });
console.log('proyectos en lista:', await pg.locator('.prow').count());
await pg.locator('.pname-btn').first().click();
await pg.waitForFunction(() => window.__app.media, null, { timeout: 30000 });
console.log('reabierto:', await pg.evaluate(() => window.__app.project.text.split('\n')[0]));
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
