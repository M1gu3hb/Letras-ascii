// «Así se verá»: la pantalla completa del estudio debe ser lo mismo que se ve al abrir el HTML exportado en esa misma pantalla.
// Se comparan, píxel por píxel, los mismos instantes. Solo texto de prueba inventado.
import { serve, launch, watch } from './lib.mjs';
import { statSync } from 'node:fs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const LINES = ['luz que se enciende despacio', 'late fuerte el tambor', 'hoooy todo suena', 'brilla brilla brilla'].join('\n');
const TIMES = [0.8, 1.6, 2.9, 4.1, 5.8, 7.3, 9.4, 11.2];
const DEV = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desk: { viewport: { width: 1280, height: 800 } },
};

for (const [name, cfg] of Object.entries(DEV)) {
  const ctx = await b.newContext({ ...cfg, acceptDownloads: true });
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.click('text=30 s');
  await pg.evaluate((t) => {
    const a = window.__app;
    a.project.text = t;
    const mk = (t0, n, held) => {
      const wt = [], wd = [];
      let x = t0;
      for (let k = 0; k < n; k++) { const hd = held === k; wt.push(+x.toFixed(2)); wd.push(hd ? 1.8 : 0.15); x += hd ? 2.0 : 0.42; }
      return { t: wt[0], wt, wd };
    };
    a.project.sync = [mk(0.6, 5), mk(3.4, 4), mk(5.6, 3, 0), mk(9.0, 3)];
    Object.assign(a.project.style, { thick: 0.3, detail: 1.1, glow: 1.2 });
    a.projectChanged();
    a.emit('reset');
  }, LINES);
  await pg.waitForTimeout(900);
  // pantalla completa del estudio
  await pg.locator('.stagefs').click();
  await pg.waitForTimeout(900);
  const a = await pg.evaluate((times) => {
    const app = window.__app;
    app.player.pause();
    app.demoHold = true;
    app.syncDemo();
    const out = [];
    for (const t of times) {
      app.scene.render(t, 'song');
      out.push(app.canvas.toDataURL('image/png'));
    }
    const r = app.scene.r;
    return { frames: out, cols: r.grid.cols, rows: r.grid.rows, W: r.W, H: r.H, dpr: r.dpr };
  }, TIMES);
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(400);
  await pg.click('#tab-export');
  await pg.waitForTimeout(500);
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('text=Descargar el HTML')]);
  const path = `test/media/export-compare-${name}.html`;
  await dl.saveAs(path);
  console.log(name, 'exportado', (statSync(path).size / 1024 / 1024).toFixed(2), 'MB');
  await ctx.close();

  // el archivo final, en la misma pantalla
  const c2 = await b.newContext({ ...cfg });
  const p2 = await c2.newPage();
  watch(p2, errs);
  await p2.goto('file://' + process.cwd() + '/' + path);
  await p2.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 20000 });
  await p2.waitForTimeout(1200);
  const e = await p2.evaluate((times) => {
    const pl = window.__player;
    const sc = window.__scene;
    pl.pause && pl.pause();
    sc.paused = false;
    const cv = document.querySelector('canvas');
    const out = [];
    for (const t of times) {
      sc.render(t, 'song');
      out.push(cv.toDataURL('image/png'));
    }
    const r = sc.r;
    return { frames: out, cols: r.grid.cols, rows: r.grid.rows, W: r.W, H: r.H, dpr: r.dpr };
  }, TIMES);
  ok(a.W === e.W && a.H === e.H && a.cols === e.cols && a.rows === e.rows, `${name}: misma rejilla (estudio ${a.W}×${a.H}, ${a.cols}×${a.rows} · archivo ${e.W}×${e.H}, ${e.cols}×${e.rows})`);
  const bad = TIMES.filter((_, i) => a.frames[i] !== e.frames[i]);
  ok(bad.length === 0, `${name}: ${TIMES.length} cuadros idénticos entre la pantalla completa y el archivo final${bad.length ? ' — distintos en t=' + bad.join(', ') : ''}`);
  await c2.close();
}
console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
