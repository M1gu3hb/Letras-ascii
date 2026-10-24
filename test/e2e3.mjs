import { serve, launch, watch } from './lib.mjs';
import { writeFileSync } from 'node:fs';
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
// proyecto sintético con datos de ejemplo directamente (para no depender de tiempos reales)
await pg.evaluate(async () => {
  const a = window.__app;
  const m = await import('data:text/javascript,export default 1').catch(() => null);
  void m;
  a.project.text = 'luz que se enciende despacio\nlate fuerte el tambor\nhoooy todo suena\nbrilla brilla brilla\nsin freno y sin miedo ¡ahora!\ncanta conmigo la noche entera\ny se queda la luz';
  const mk = (t0, n, held) => {
    const wt = [], wd = [];
    let x = t0;
    for (let k = 0; k < n; k++) {
      const h = held === k;
      wt.push(+x.toFixed(2));
      wd.push(h ? 1.8 : 0.15);
      x += h ? 2.0 : 0.42;
    }
    return { t: wt[0], wt, wd };
  };
  a.project.sync = [mk(0.6, 5), mk(3.4, 4), mk(5.6, 3, 0), mk(9.0, 3), mk(11.4, 6), mk(15.0, 5), mk(19.0, 4, 3)];
  a.projectChanged();
  a.emit('reset');
});
await pg.waitForTimeout(500);
// laboratorio
await pg.click('#tab-style');
await pg.waitForTimeout(300);
await pg.click('.tbtn.play');
await pg.waitForTimeout(1800);
await pg.screenshot({ path: 'test/e2e-style.png' });
// scroll del panel y capturas del escenario en tiempos conocidos
for (const t of [1.2, 6.5, 12.5]) {
  await pg.evaluate((t) => { window.__app.player.pause(); window.__app.player.seek(t); }, t);
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: `test/e2e-stage-${t}.png`, clip: { x: 14, y: 190, width: 942, height: 528 } });
}
// controles del laboratorio
async function clickTxt(t) { await pg.click(`text=${t}`); await pg.waitForTimeout(250); }
const info = () => pg.evaluate(() => { const s = window.__app.scene; return { ball: s.ballOn, floor: s.floorOn, react: s.react, focus: s.tl.focus, units: s.tl.units.length, lines: s.tl.lines.length }; });
console.log('inicial', JSON.stringify(await info()));
await clickTxt('Bolita de karaoke');
await clickTxt('Frase completa');
await pg.waitForTimeout(400);
console.log('tras toggles', JSON.stringify(await info()));
await pg.evaluate(() => { window.__app.player.seek(1.5); });
await pg.waitForTimeout(300);
await pg.screenshot({ path: 'test/e2e-linemode.png', clip: { x: 14, y: 190, width: 942, height: 528 } });
await clickTxt('Palabra principal');
await clickTxt('Bolita de karaoke');
await clickTxt('Todas'); // mayúsculas
await pg.waitForTimeout(500);
console.log('caps all:', await pg.evaluate(() => window.__app.scene.tl.lines.every((l) => l.words.every((w) => w.caps))));
await pg.evaluate(() => window.__app.player.seek(6.0));
await pg.waitForTimeout(300);
await pg.screenshot({ path: 'test/e2e-caps.png', clip: { x: 14, y: 190, width: 942, height: 528 } });
await pg.click('.segb:text-is("No")'); await pg.waitForTimeout(250);
// paleta, fondo
await clickTxt('Hielo');
await clickTxt('Matrix');
await pg.waitForTimeout(500);
console.log('mood:', await pg.evaluate(() => [...new Set(window.__app.scene.tl.lines.map((l) => l.mood))].join(',')), 'cols:', await pg.evaluate(() => [...new Set(window.__app.scene.tl.lines.flatMap((l) => l.words.map((w) => w.colKey)))].join(',')));
await pg.evaluate(() => window.__app.player.seek(12.4));
await pg.waitForTimeout(300);
await pg.screenshot({ path: 'test/e2e-hielo.png', clip: { x: 14, y: 190, width: 942, height: 528 } });
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
