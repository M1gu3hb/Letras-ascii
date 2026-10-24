import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
// 40 frases x 6 palabras distribuidas en 75 s (letra de prueba mía)
const r = await pg.evaluate(() => {
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
  const t0 = performance.now();
  a.refreshAudio();
  a.rebuild();
  return { ms: Math.round(performance.now() - t0), words: 240, units: a.scene.tl.units.length };
});
console.log('rebuild 240 palabras:', JSON.stringify(r));
const cdp = await ctx.newCDPSession(pg);
for (const rate of [1, 4]) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await pg.evaluate(() => { window.__app.player.start(0); });
  await pg.waitForTimeout(800);
  const fr = await pg.evaluate(() => new Promise((res) => {
    const ts = [];
    let n = 0;
    function f(t) { ts.push(t); if (++n < 150) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ avg: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1) }); } }
    requestAnimationFrame(f);
  }));
  console.log(`CPU x${rate}:`, JSON.stringify(fr), 'estado', await pg.evaluate(() => window.__app.player.state + ' t=' + window.__app.player.t.toFixed(1)));
  await pg.evaluate(() => window.__app.player.pause());
}
// tiempo de render en un cuadro pesado (mitad de una palabra con fx)
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
