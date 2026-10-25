import { serve, launch, watch } from './lib.mjs';
import assert from 'node:assert/strict';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
for (const [name, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: name === 'phone' ? 2 : 1, hasTouch: name === 'phone' });
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 20000 });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `test/smoke-${name}.png` });
  console.log(name, 'ok');
  await ctx.close();
}
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
assert.deepEqual(errs,[]);
