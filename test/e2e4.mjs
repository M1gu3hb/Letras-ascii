import { serve, launch, watch } from './lib.mjs';
import { statSync } from 'node:fs';
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
await pg.evaluate(() => {
  const a = window.__app;
  a.project.text = 'luz que se enciende despacio\nlate fuerte el tambor\nhoooy todo suena\nbrilla brilla brilla\nsin freno y sin miedo ¡ahora!\ncanta conmigo la noche entera\ny se queda la luz';
  const mk = (t0, n, held) => {
    const wt = [], wd = [];
    let x = t0;
    for (let k = 0; k < n; k++) { const h = held === k; wt.push(+x.toFixed(2)); wd.push(h ? 1.8 : 0.15); x += h ? 2.0 : 0.42; }
    return { t: wt[0], wt, wd };
  };
  a.project.sync = [mk(0.6, 5), mk(3.4, 4), mk(5.6, 3, 0), mk(9.0, 3), mk(11.4, 6), mk(15.0, 5), mk(19.0, 4, 3)];
  a.projectChanged();
  a.emit('reset');
});
// ───────── Palabras
await pg.click('#tab-words');
await pg.waitForTimeout(300);
const chips = await pg.locator('.wc').count();
console.log('palabras listadas:', chips);
await pg.locator('.wc', { hasText: 'fuerte' }).first().click();
await pg.waitForTimeout(600);
await pg.screenshot({ path: 'test/e2e-words.png' });
// efectos a mano
await pg.getByRole('checkbox', { name: 'Elegir efectos a mano' }).check({ force: true });
await pg.locator('.insp .chip', { hasText: 'Explosión' }).click();
await pg.locator('.insp .segb', { hasText: 'Sí' }).first().click();
await pg.waitForTimeout(500);
console.log('override:', await pg.evaluate(() => JSON.stringify(window.__app.project.over)));
console.log('palabra fuerte:', await pg.evaluate(() => { const l = window.__app.scene.tl.lines[1]; const w = l.words[1]; return JSON.stringify({ text: w.text, fxs: w.fxs, caps: w.caps }); }));
// estirar
await pg.locator('.insp input[aria-label="Cuánto se estira"]').fill('1.5');
await pg.waitForTimeout(500);
console.log('ext:', await pg.evaluate(() => { const w = window.__app.scene.tl.lines[1].words[1]; return JSON.stringify({ stretch: w.stretch, em: w.stretchEm }); }));
// ───────── exportar
await pg.click('#tab-export');
await pg.waitForTimeout(300);
console.log('resumen:', (await pg.locator('.sum').innerText()).replace(/\n/g, ' | '));
await pg.screenshot({ path: 'test/e2e-export.png' });
const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('text=Descargar el HTML')]);
const path = 'test/media/export.html';
await dl.saveAs(path);
console.log('descarga:', dl.suggestedFilename(), (statSync(path).size / 1024 / 1024).toFixed(2), 'MB');
console.log('errors editor:', errs.length ? errs : 'none');
await ctx.close();
// ───────── abrir el archivo final desde disco
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p2 = await ctx2.newPage();
const e2 = [];
watch(p2, e2);
await p2.goto('file://' + process.cwd() + '/' + path);
await p2.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 20000 });
await p2.waitForTimeout(2500);
await p2.screenshot({ path: 'test/final-intro.png' });
console.log('estado inicial:', await p2.evaluate(() => window.__player.state));
await p2.mouse.click(640, 360);
await p2.waitForTimeout(2200);
console.log('estado tras tocar:', await p2.evaluate(() => window.__player.state), 't', await p2.evaluate(() => window.__player.t.toFixed(2)));
await p2.screenshot({ path: 'test/final-play.png' });
await p2.evaluate(() => window.__player.seek(6.3));
await p2.waitForTimeout(900);
await p2.screenshot({ path: 'test/final-hoy.png' });
await p2.evaluate(() => window.__player.seek(27.8));
await p2.waitForTimeout(3500);
console.log('estado al final:', await p2.evaluate(() => window.__player.state));
await p2.screenshot({ path: 'test/final-end.png' });
console.log('errors final:', e2.length ? e2 : 'none');
await b.close(); srv.close();
