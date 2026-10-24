// El HTML exportado conserva el aspecto del ASCII (grosor, espacio, tamaño, detalle, negrita, relleno, halo, intensidad),
// incluido el grosor por palabra. Se abre desde disco en un teléfono. Solo texto de prueba inventado.
import { serve, launch, watch } from './lib.mjs';
import { statSync, mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('test/audit', { recursive: true });
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
await pg.click('text=30 s');
const STYLE = { thick: -0.35, track: 0.04, size: 0.9, detail: 1.25, weight: 'bold', fillch: '%', glow: 0.5, bright: 1.2 };
await pg.evaluate((st) => {
  const a = window.__app;
  a.project.text = ['luz que se enciende despacio', 'late fuerte el tambor', 'hoooy todo suena', 'brilla brilla brilla'].join('\n');
  const mk = (t0, n, held) => {
    const wt = [], wd = [];
    let x = t0;
    for (let k = 0; k < n; k++) { const h = held === k; wt.push(+x.toFixed(2)); wd.push(h ? 1.8 : 0.15); x += h ? 2.0 : 0.42; }
    return { t: wt[0], wt, wd };
  };
  a.project.sync = [mk(0.6, 5), mk(3.4, 4), mk(5.6, 3, 0), mk(9.0, 3)];
  Object.assign(a.project.style, st);
  a.project.over = { '1.1': { thick: 0.8 } };
  a.projectChanged();
  a.emit('reset');
}, STYLE);
await pg.click('#tab-export');
await pg.waitForTimeout(500);
const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('text=Descargar el HTML')]);
const path = 'test/media/export-ascii.html';
await dl.saveAs(path);
console.log('descarga:', dl.suggestedFilename(), (statSync(path).size / 1024 / 1024).toFixed(2), 'MB');
ok(errs.length === 0, 'editor sin errores');
await ctx.close();

// el archivo final, en teléfono
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p2 = await ctx2.newPage();
const e2 = [];
watch(p2, e2);
copyFileSync(path, 'site/ascii-export-test.html');
await p2.goto(`http://localhost:${port}/ascii-export-test.html`);
await p2.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 20000 });
await p2.waitForTimeout(1200);
const f = await p2.evaluate(() => {
  const s = window.__scene;
  const st = s.tl.style;
  return { thickG: s.thickG, trackG: s.trackG, sizeG: s.sizeG, density: s.r.density, bold: s.r.bold, fill: s.r.fillCode, glow: s.glow, gain: s.r.gain, cols: s.r.grid.cols, rows: s.r.grid.rows, style: { thick: st.thick, weight: st.weight } };
});
ok(f.thickG === -0.35 && f.trackG === 0.04 && f.sizeG === 0.9 && f.density === 1.25 && f.bold && f.fill === 37 && f.glow === 0.5 && Math.abs(f.gain - 1.2) < 1e-6, `el archivo final aplica el aspecto (${JSON.stringify(f)})`);
ok(f.cols > 85, `detalle ×1.25 → más columnas que las 85 de siempre en este teléfono (${f.cols}×${f.rows})`);
// grosor por palabra: la palabra «fuerte» (frase 2, palabra 2) es más gruesa que sus vecinas
const per = await p2.evaluate(() => {
  const s = window.__scene;
  const ink = (w) => {
    let t = 0;
    for (let i = 0; i < w.cov0.length; i++) t += w.cov0[i];
    return t / (w.Wb * w.Hb);
  };
  const out = {};
  for (const u of s.tl.units) for (const w of u.words) if (u.line.src === 1) out[w.k] = { text: w.text, thick: w.thick, dens: +ink(w).toFixed(3) };
  return out;
});
ok(per[1] && per[1].thick === 0.8, `la palabra con grosor propio lo conserva (${JSON.stringify(per[1])})`);
await p2.mouse.click(195, 420);
await p2.waitForTimeout(1500);
for (const [t, n] of [[1.5, 'a'], [4.4, 'b'], [6.6, 'c']]) {
  await p2.evaluate((tt) => window.__player.seek(tt), t);
  await p2.waitForTimeout(700);
  await p2.screenshot({ path: `test/audit/export-ascii-${n}.png` });
}
ok(e2.length === 0, 'archivo final sin errores');
console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores:', errs.concat(e2).length ? errs.concat(e2) : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length || e2.length ? 1 : 0);
