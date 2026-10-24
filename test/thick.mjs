// Grosor de las letras: más grueso = más tinta, más fino = menos; nada se corta; hoja de contacto por tipografía.
// Solo texto de prueba inventado.
import { serve, launch, watch } from './lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('test/audit', { recursive: true });
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const FACES = ['round', 'heavy', 'serif', 'script', 'tall', 'hand', 'wide', 'roman'];
const THICKS = [-1, -0.5, 0, 0.5, 1];
const LINES = ['luna', 'hoooola mundo azul', 'una frase para probar'].join('\n');

const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
await pg.evaluate((t) => {
  const app = window.__app;
  app.project.text = t;
  app.project.sync = [{ t: 1.0, wt: [1.0], wd: [3.2] }, { t: 5.0 }, { t: 9.0 }];
  app.projectChanged();
}, LINES);
await pg.waitForTimeout(800);

const cells = [];
for (const face of FACES) {
  const row = [];
  const inks = [];
  for (const th of THICKS) {
    const r = await pg.evaluate(
      ([face, th]) => {
        const app = window.__app;
        app.project.over = { '0.0': { face, fx: 'rise', hold: 'breathe', size: 1, ext: 0 } };
        app.project.style.thick = th;
        app.rebuild();
        const sc = app.scene;
        const u = sc.tl.units[0];
        const w = u.words[0];
        const { Wb, Hb, cov0 } = w;
        let ink = 0;
        let edge = 0;
        for (let j = 0; j < Hb; j++)
          for (let i = 0; i < Wb; i++) {
            const v = cov0[j * Wb + i];
            ink += v;
            if ((i < 1 || i >= Wb - 1 || j < 1 || j >= Hb - 1) && v > 0.05) edge++;
          }
        // fotograma con la palabra ya formada
        const t = u.t + 2.1;
        sc.render(t, 'song');
        const rr = sc.r;
        const dpr = rr.dpr;
        const x0 = Math.max(0, w.gx * rr.cellW * dpr);
        const y0 = Math.max(0, (rr.offY + w.gy * rr.cellH) * dpr);
        const cw = Math.min(app.canvas.width - x0, Wb * rr.cellW * dpr);
        const ch = Math.min(app.canvas.height - y0, Hb * rr.cellH * dpr);
        const c2 = document.createElement('canvas');
        c2.width = Math.round(cw);
        c2.height = Math.round(ch);
        c2.getContext('2d').drawImage(app.canvas, x0, y0, cw, ch, 0, 0, cw, ch);
        return { ink, edge, Wb, Hb, img: c2.toDataURL('image/png'), text: w.text };
      },
      [face, th],
    );
    row.push(r);
    inks.push(r.ink);
  }
  cells.push(row);
  const mono = inks.every((x, i) => i === 0 || x > inks[i - 1]);
  ok(mono, `${face}: más grosor = más tinta (${inks.map((x) => x.toFixed(0)).join(' < ')})`);
  ok(row.every((r) => r.edge <= row[2].edge + 1), `${face}: engordar o afinar no corta letras en el borde (${row.map((r) => r.edge).join(',')}; con grosor 0 ya eran ${row[2].edge})`);
}

// hoja de contacto
const html = `<body style="margin:0;background:#07040b;color:#ddd;font:12px monospace"><table style="border-collapse:collapse">${cells
  .map(
    (row, i) =>
      `<tr><td style="padding:4px 8px;vertical-align:middle">${FACES[i]}</td>${row.map((r, k) => `<td style="padding:2px;border:1px solid #333"><div style="text-align:center">${THICKS[k]}</div><img src="${r.img}" style="height:150px"></td>`).join('')}</tr>`,
  )
  .join('')}</table></body>`;
const sheet = await ctx.newPage();
await sheet.setViewportSize({ width: 1500, height: 1500 });
await sheet.setContent(html);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: 'test/audit/thick-sheet.png', fullPage: true });

console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
