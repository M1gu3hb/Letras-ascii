// Hoja de contacto en pantalla de teléfono: grosor × detalle, para ver cuál se ve menos «gordo». Solo texto inventado.
import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
await pg.evaluate((t) => {
  const a = window.__app;
  a.project.text = t;
  a.project.sync = [{ t: 1.0, wt: [1.0, 2.6], wd: [0.5, 2.6] }, { t: 6.0 }];
  a.project.over = { '0.0': { face: 'round', fx: 'rise', hold: 'breathe' }, '0.1': { face: 'serif', fx: 'rise', hold: 'breathe', ext: 0 } };
  a.projectChanged();
}, ['gran mundo', 'otra frase de prueba'].join('\n'));
await pg.waitForTimeout(600);
const combos = [];
for (const detail of [1, 1.35]) for (const thick of [0, -0.4, -0.7]) combos.push({ detail, thick });
const imgs = [];
for (const c of combos) {
  const d = await pg.evaluate(async (c) => {
    const a = window.__app;
    a.project.style.thick = c.thick;
    a.project.style.detail = c.detail;
    a.rebuild();
    const sc = a.scene;
    a.player.pause();
    sc.render(3.9, 'song'); // «mundo» ya formado
    const cv = a.canvas;
    return cv.toDataURL('image/png');
  }, c);
  imgs.push({ c, d });
}
const html = `<body style="margin:0;background:#07040b;color:#ddd;font:12px monospace"><div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px">${imgs.map((i) => `<div><div>detalle ${i.c.detail} · grosor ${i.c.thick}</div><img src="${i.d}" style="width:380px"></div>`).join('')}</div></body>`;
const sheet = await ctx.newPage();
await sheet.setViewportSize({ width: 1260, height: 900 });
await sheet.setContent(html);
await sheet.waitForTimeout(500);
await sheet.screenshot({ path: 'test/audit/phone-look.png', fullPage: true });
console.log(errs.length ? errs : 'sin errores');
await b.close();
srv.close();
