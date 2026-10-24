// El aspecto por defecto NO debe cambiar: se compara, pixel por pixel, el sitio de antes de los controles
// de ASCII (carpeta pasada en OLD) contra el sitio nuevo con los mismos datos y los mismos instantes.
// Solo texto de prueba inventado.
import { serve, launch, watch } from './lib.mjs';
const OLD = process.env.OLD;
if (!OLD) {
  console.log('Falta OLD=<carpeta con el sitio anterior>');
  process.exit(2);
}
const a = serve(OLD);
const bsrv = serve('site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const LINES = ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar', '¡cierre de la prueba!', 'otra línea más larga para ver cómo se acomoda'].join('\n');
const DEV = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desk: { viewport: { width: 1440, height: 900 } },
  tab: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const TIMES = [0.4, 1.3, 2.2, 3.1, 4.4, 5.6, 6.9, 8.2, 9.5, 11.0, 12.6];

async function frames(port, cfg, mode) {
  const ctx = await b.newContext(cfg);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  if (mode !== 'demo') {
    await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
    await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
    await pg.evaluate(
      ([t, focus]) => {
        const app = window.__app;
        app.project.text = t;
        app.project.style.focus = focus;
        app.project.sync = [
          { t: 1.0 },
          { t: 3.8, wt: [3.8, 4.3, 4.9], wd: [0.5, 1.6, 0.4] },
          { t: 7.0 },
          { t: 9.2, wt: [9.2, 9.7, 10.1, 10.5], wd: [0.4, 0.3, 0.3, 0.8] },
          { t: 12.0 },
        ];
        app.projectChanged();
      },
      [LINES, mode === 'line' ? 'line' : 'word'],
    );
  }
  await pg.waitForTimeout(900);
  const out = [];
  for (const t of TIMES) {
    out.push(
      await pg.evaluate((tt) => {
        const app = window.__app;
        app.player.pause();
        const mode = app.player.demo ? 'song' : 'song';
        app.scene.render(tt, mode);
        return app.canvas.toDataURL('image/png');
      }, t),
    );
  }
  await ctx.close();
  return out;
}

// SKIP=phone: el teléfono cambia a propósito (escenario y rejilla más finos en pantallas chicas); compu y tablet no deben cambiar.
const SKIP = (process.env.SKIP || '').split(',').filter(Boolean);
for (const [name, cfg] of Object.entries(DEV)) {
  if (SKIP.includes(name)) {
    console.log(`omitido ${name} (cambia a propósito)`);
    continue;
  }
  for (const mode of ['real', 'line', 'demo']) {
    const fa = await frames(a.port, cfg, mode);
    const fb = await frames(bsrv.port, cfg, mode);
    const same = fa.map((x, i) => x === fb[i]);
    const bad = TIMES.filter((_, i) => !same[i]);
    ok(bad.length === 0, `${name} / ${mode}: ${TIMES.length} cuadros idénticos al sitio anterior${bad.length ? ' — distintos en t=' + bad.join(', ') : ''}`);
  }
}
console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
a.srv.close();
bsrv.srv.close();
process.exit(fails || errs.length ? 1 : 0);
