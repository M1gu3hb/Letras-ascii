import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
for (const [name, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }], ['mid', { width: 1100, height: 800 }]]) {
  const ctx = await b.newContext({ viewport: vp });
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.click('#tab-words');
  await pg.waitForTimeout(400);
  const info = await pg.evaluate(() => {
    const t = document.querySelector('.tabs');
    const ov = [...document.querySelectorAll('.panel *')].filter((e) => e.getBoundingClientRect().right > document.querySelector('.panel').getBoundingClientRect().right + 1).map((e) => e.className || e.tagName).slice(0, 5);
    return { tabsScroll: t.scrollWidth, tabsClient: t.clientWidth, overflowing: ov, docW: document.documentElement.scrollWidth, winW: innerWidth };
  });
  console.log(name, JSON.stringify(info));
  await pg.screenshot({ path: `test/s6-${name}.png` });
  await ctx.close();
}
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
