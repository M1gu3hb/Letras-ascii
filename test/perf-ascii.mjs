// Costo de los controles de ASCII: reconstruir con grosor y cuadros por segundo con más detalle. Solo texto inventado.
import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const DEV = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
for (const [name, cfg] of Object.entries(DEV)) {
  const ctx = await b.newContext(cfg);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.evaluate(() => {
    const a = window.__app;
    const words = 'luz noche fuego mar cielo viento sombra danza vuelo calma tiempo ritmo'.split(' ');
    const lines = [];
    const sync = [];
    let t = 1;
    for (let i = 0; i < 40; i++) {
      const n = 6;
      const ws = [];
      const wt = [], wd = [];
      for (let k = 0; k < n; k++) { ws.push(words[(i * 5 + k * 3) % words.length]); wt.push(+(t + k * 0.3).toFixed(2)); wd.push(k === n - 1 && i % 4 === 0 ? 1.0 : 0.12); }
      lines.push(ws.join(' '));
      sync.push({ t: wt[0], wt, wd });
      t += 1.8;
    }
    a.project.text = lines.join('\n');
    a.project.sync = sync;
    a.project.clip = { start: 0, end: 75 };
    a.refreshAudio();
    a.rebuild();
  });
  const rb = await pg.evaluate(() => {
    const a = window.__app;
    const out = {};
    for (const th of [0, 0.5, -0.5, 0]) {
      a.project.style.thick = th;
      const t0 = performance.now();
      a.rebuild();
      out[th + (Object.keys(out).includes(String(th)) ? 'b' : '')] = Math.round(performance.now() - t0);
    }
    return out;
  });
  console.log(`${name}: reconstruir 240 palabras (ms) por grosor`, JSON.stringify(rb));
  const cdp = await ctx.newCDPSession(pg);
  for (const detail of [1, 1.3, 1.6]) {
    await pg.evaluate((d) => { const a = window.__app; a.project.style.detail = d; a.rebuild(); }, detail);
    const g = await pg.evaluate(() => { const r = window.__app.scene.r; return { cols: r.grid.cols, rows: r.grid.rows, n: r.grid.cols * r.grid.rows }; });
    for (const rate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await pg.evaluate(() => { window.__app.player.start(0); });
      await pg.waitForTimeout(700);
      const fr = await pg.evaluate(() => new Promise((res) => {
        const ts = [];
        let n = 0;
        function f(t) { ts.push(t); if (++n < 120) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ avg: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1) }); } }
        requestAnimationFrame(f);
      }));
      console.log(`${name} detalle ${detail} (${g.cols}×${g.rows} = ${g.n} celdas) CPU×${rate}:`, JSON.stringify(fr));
      await pg.evaluate(() => window.__app.player.pause());
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  await ctx.close();
}
console.log('errores:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
