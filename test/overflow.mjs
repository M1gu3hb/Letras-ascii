import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
for (const [name, vp, fmt] of [['desk-wide', { width: 1440, height: 900 }, 'wide'], ['desk-tall', { width: 1440, height: 900 }, 'tall'], ['phone', { width: 390, height: 844 }, 'wide']]) {
  const ctx = await b.newContext({ viewport: vp });
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.evaluate((fmt) => { window.__app.format = fmt; window.__app.applyFormat(); }, fmt);
  const res = await pg.evaluate(async () => {
    const a = window.__app;
    a.project.text = 'extraordinariamente grande\nmaravillosamente hermosísimo todo\nel océano infinito\nsiempre contigo ¡siempre!\nparaparaparaparaparaparapara';
    const mk = (t0, n) => { const wt = [], wd = []; let x = t0; for (let k = 0; k < n; k++) { wt.push(+x.toFixed(2)); wd.push(k === 0 ? 1.4 : 0.15); x += 0.5; } return { t: wt[0], wt, wd }; };
    a.project.sync = [mk(1, 3), mk(5, 4), mk(9, 3), mk(13, 3), mk(17, 1)];
    a.project.style.random = 1;
    a.project.clip = { start: 0, end: 30 };
    a.rebuild();
    await new Promise((r) => setTimeout(r, 400));
    a.rebuild();
    const g = a.scene.r.grid;
    const bad = [];
    for (const u of a.scene.tl.units) for (const w of u.words) {
      const extra = w.stretch ? 0 : 0;
      if (w.gx < -2 || w.gx + w.Wb > g.cols + 2 || w.gy < -2 || w.gy + w.Hb > g.rows + 2) bad.push(`${w.text} gx=${w.gx} Wb=${w.Wb} cols=${g.cols} gy=${w.gy} Hb=${w.Hb} rows=${g.rows}`);
    }
    return { cols: g.cols, rows: g.rows, n: a.scene.tl.units.length, bad };
  });
  console.log(name, JSON.stringify(res));
  await ctx.close();
}
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
