import { chromium } from 'playwright-core';
import { serve } from './lib.mjs';
import { launch } from './lib.mjs';
const { srv, port } = serve('.');
const b = await launch();
const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto(`http://localhost:${port}/test/harness.html?fx=0`);
await pg.waitForFunction(() => document.documentElement.dataset.ready === '1');
// unidades: 'enciende' (unit 1 'se enciende' t≈1.22), 'despacio' t=2.02, 'late fuerte' t=3.12, 'tambor'
const cases = [
  ['explode', '0.2', 0.46, 0.7, 1.0], // luz que, over 0.0 y 0.1
  ['glow', '0.0', 0.9, 1.1],
  ['blink', '0.0', 0.9, 1.0, 1.1, 1.2],
  ['defrag', '0.0', 1.0, 1.15],
];
for (const [fx, , ...times] of cases) {
  await pg.evaluate((fx) => window.__apply((p) => { p.over = { '0.0': { fxs: [fx] }, '0.1': { fxs: [fx] } }; }), fx);
  for (const t of times) {
    await pg.evaluate((t) => window.__render(t), t);
    await pg.screenshot({ path: `test/fx-${fx}-${t}.png` });
  }
}
console.log('errors', errs.length ? errs : 'none');
await b.close(); srv.srv ? srv.srv.close() : srv.close();
