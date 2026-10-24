// Diagnóstico de la pantalla en teléfono (393×736, como el de Miguel): mide el escenario, el lienzo y la rejilla en
// cada formato y pestaña, y deja capturas en test/audit/<TAG>-*.png. Solo texto inventado y audio sintético.
//   TAG=antes node test/repro-phone.mjs      (SITE=<carpeta> para usar otro sitio, por defecto «site»)
import { serve, launch, watch } from './lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('test/audit', { recursive: true });
const TAG = process.env.TAG || 'repro';
const { srv, port } = serve(process.env.SITE || 'site');
const b = await launch();
const errs = [];
const LINES = ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar con palabras largas', 'otra línea más larga para ver cómo se acomoda', 'cierre'].join('\n');
const DEV = {
  p393: { viewport: { width: 393, height: 736 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  p360: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(DEV);
for (const name of only) {
  const ctx = await b.newContext(DEV[name]);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.evaluate((t) => {
    const a = window.__app;
    a.project.text = t;
    a.project.sync = [{ t: 1.0 }, { t: 3.8, wt: [3.8, 4.3, 4.9], wd: [0.5, 1.6, 0.4] }, { t: 7.0 }, { t: 9.2 }, { t: 12.0 }];
    a.projectChanged();
    a.emit('reset');
  }, LINES);
  await pg.waitForTimeout(900);
  for (const fmt of ['wide', 'tall', 'square']) {
    for (const tab of ['style', 'mark', 'words']) {
      await pg.evaluate((f) => {
        const a = window.__app;
        a.format = f;
        a.applyFormat();
      }, fmt);
      await pg.click('#tab-' + tab);
      await pg.waitForTimeout(700);
      const m = await pg.evaluate(() => {
        const a = window.__app;
        const st = a.stage.getBoundingClientRect();
        const cv = a.canvas.getBoundingClientRect();
        const r = a.scene.r;
        const left = document.querySelector('.left').getBoundingClientRect();
        // palabras de la escena que se salen de la rejilla
        const out = [];
        const tl = a.scene.tl;
        const chk = (w, tag) => {
          if (w.gx == null || w.Wb == null) return;
          if (w.gx < 0 || w.gy < 0 || w.gx + w.Wb > r.grid.cols || w.gy + w.Hb > r.grid.rows) out.push(`${tag}:${w.text}`);
        };
        if (tl) {
          for (const u of tl.units) for (const w of u.words) chk(w, 'hero');
          for (const l of tl.lines) if (l.ctx) for (const w of l.ctx.words) chk(w, 'ctx');
        }
        return {
          stage: [Math.round(st.width), Math.round(st.height)],
          canvasCss: [Math.round(cv.width), Math.round(cv.height)],
          fit: [r.W, r.H],
          grid: [r.grid.cols, r.grid.rows],
          left: Math.round(left.height),
          fuera: out,
          tab: a.tab,
        };
      });
      console.log(name, fmt, tab, JSON.stringify(m));
      await pg.screenshot({ path: `test/audit/${TAG}-${name}-${fmt}-${tab}.png` });
    }
  }
  await ctx.close();
}
console.log('errores:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
