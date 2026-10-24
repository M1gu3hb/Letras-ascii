// Prueba de humo contra una URL ya publicada (copia de prueba o en vivo): que cargue, que las tipografías
// lleguen, que no haya errores, que no lleve canción ni letra, y que la pantalla completa («Ver en grande») abra
// en teléfono y en compu. Solo audio sintético y texto inventado.
//   TARGET=https://... TAG=prev node test/live-smoke.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test/audit', { recursive: true });
const TARGET = process.env.TARGET;
const TAG = process.env.TAG || 'live';
if (!TARGET) throw new Error('falta TARGET');
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], proxy });
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const errs = [];
const fontsSeen = new Map();
function watch(pg, label) {
  pg.on('pageerror', (e) => errs.push(label + ' pageerror: ' + String(e)));
  pg.on('console', (m) => {
    if (m.type() === 'error') errs.push(label + ' console: ' + m.text());
  });
  pg.on('requestfailed', (r) => {
    const u = r.url();
    if (u.startsWith('blob:') || u.includes('vercel.live')) return; // vercel.live: script de la barra de comentarios, solo en copias de prueba
    errs.push(label + ' reqfail: ' + u.slice(0, 100));
  });
  pg.on('response', (r) => {
    const u = r.url();
    if (u.includes('/fonts/')) fontsSeen.set(u.split('/').pop(), r.status());
  });
}
const LINES = ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar', 'otra línea más larga para ver cómo se acomoda'].join('\n');

async function boot(cfg, label) {
  const ctx = await b.newContext(cfg);
  const pg = await ctx.newPage();
  watch(pg, label);
  const resp = await pg.goto(TARGET, { waitUntil: 'load' });
  ok(resp && resp.status() === 200, `${label}: responde 200`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 30000 });
  ok(true, `${label}: la página arranca («ready»)`);
  const payload = await pg.evaluate(() => document.getElementById('payload').textContent.trim());
  ok(payload === 'null', `${label}: no lleva canción ni letra (payload = ${payload.slice(0, 20)})`);
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app && window.__app.media, null, { timeout: 60000 });
  await pg.evaluate(
    ([t]) => {
      const a = window.__app;
      a.project.text = t;
      a.project.sync = [{ t: 1.0 }, { t: 3.8, wt: [3.8, 4.3, 4.9], wd: [0.5, 1.6, 0.4] }, { t: 7.0 }, { t: 9.2 }];
      a.projectChanged();
      a.emit('reset');
    },
    [LINES],
  );
  await pg.waitForTimeout(900);
  return { ctx, pg };
}
const theaterState = (pg) =>
  pg.evaluate(() => {
    const a = window.__app;
    const th = document.querySelector('.theater');
    const r = a.scene.r;
    return { open: !th.hidden, parent: a.canvas.parentElement.className, W: r.W, H: r.H, cols: r.grid.cols, rows: r.grid.rows, iw: window.innerWidth, ih: window.innerHeight };
  });

// ───────── teléfono ─────────
{
  const { ctx, pg } = await boot({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, 'teléfono');
  const hasSheet = await pg.evaluate(() => [...document.styleSheets].some((s) => (s.href || '').endsWith('app.css')));
  ok(hasSheet, 'teléfono: la hoja de estilos cargó');
  const mono = await pg.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('400 16px "JetBrains Mono"');
  });
  ok(mono, 'teléfono: la tipografía del ASCII (JetBrains Mono) está disponible');
  await pg.screenshot({ path: `test/audit/${TAG}-phone-home.png` });
  const s0 = await theaterState(pg);
  await pg.locator('.stagefs').tap();
  await pg.waitForTimeout(800);
  const s1 = await theaterState(pg);
  ok(s1.open && s1.parent === 'thost', 'teléfono: «Ver en grande» abre la pantalla completa');
  ok(s1.W === s1.iw && s1.H === s1.ih, `teléfono: ocupa toda la pantalla (${s1.W}×${s1.H})`);
  // total de celdas, no columna por columna: el escenario chico ahora usa una cuadrícula más fina (mínimo 28 filas) para que las palabras quepan
  ok(s1.cols * s1.rows > s0.cols * s0.rows && s1.rows > s0.rows, `teléfono: más celdas en grande (${s1.cols}×${s1.rows}) que en chico (${s0.cols}×${s0.rows})`);
  const f1 = await pg.evaluate(() => window.__app.canvas.toDataURL('image/png'));
  await pg.waitForTimeout(700);
  const f2 = await pg.evaluate(() => window.__app.canvas.toDataURL('image/png'));
  ok(f1 !== f2, 'teléfono: la imagen se mueve sola (vista de ejemplo)');
  await pg.screenshot({ path: `test/audit/${TAG}-phone-theater.png` });
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(500);
  ok(!(await theaterState(pg)).open, 'teléfono: Esc cierra la pantalla completa');
  await ctx.close();
}

// ───────── compu ─────────
{
  const { ctx, pg } = await boot({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }, 'compu');
  await pg.screenshot({ path: `test/audit/${TAG}-desk-home.png` });
  await pg.keyboard.press('f');
  await pg.waitForTimeout(800);
  const s1 = await theaterState(pg);
  ok(s1.open && s1.W === s1.iw && s1.H === s1.ih, `compu: la tecla F abre la pantalla completa (${s1.W}×${s1.H} celdas ${s1.cols}×${s1.rows})`);
  await pg.screenshot({ path: `test/audit/${TAG}-desk-theater.png` });
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(500);
  ok(!(await theaterState(pg)).open, 'compu: Esc la cierra');
  await ctx.close();
}

const fl = [...fontsSeen.entries()];
console.log('tipografías pedidas:', fl.length, fl.map(([n, s]) => n + ':' + s).join(' '));
ok(fl.length > 0 && fl.every(([, s]) => s === 200), 'todas las tipografías que pidió la página llegaron (200)');
ok(errs.length === 0, 'sin errores en consola ni peticiones fallidas' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
await b.close();
console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO BIEN');
process.exit(fails ? 1 : 0);
