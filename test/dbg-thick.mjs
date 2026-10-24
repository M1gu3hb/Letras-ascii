import { serve, launch, watch } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const { srv, port } = serve('site');
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage();
const errs = []; watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
await pg.evaluate((t) => { const app = window.__app; app.project.text = t; app.project.sync = [{ t: 1.0 }, { t: 5.0 }, { t: 9.0 }]; app.projectChanged(); }, ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar'].join('\n'));
await pg.waitForTimeout(800);
const info = await pg.evaluate(() => {
  const app = window.__app; const sc = app.scene;
  return { kind: app.kind, units: sc.tl.units.slice(0, 4).map((u) => ({ t: u.t, end: u.end, hide: u.hideAt, words: u.words.map((w) => ({ text: w.text, gx: w.gx, gy: w.gy, Wb: w.Wb, Hb: w.Hb, onset: w.onset, dur: w.dur, appear: w.appear, hold: w.hold, face: w.face })) })), cellW: sc.r.cellW, cellH: sc.r.cellH, offY: sc.r.offY, dpr: sc.r.dpr, cv: [app.canvas.width, app.canvas.height], cols: sc.r.grid.cols, rows: sc.r.grid.rows };
});
console.log(JSON.stringify(info, null, 1).slice(0, 3000));
for (const t of [1.3, 2.0]) {
  const d = await pg.evaluate((tt) => { const app = window.__app; app.player.pause(); app.scene.render(tt, 'song'); return app.canvas.toDataURL('image/png'); }, t);
  writeFileSync(`test/audit/dbg-thick-${t}.png`, Buffer.from(d.split(',')[1], 'base64'));
}
console.log(errs);
await b.close(); srv.close();
