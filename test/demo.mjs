// Vista previa tipo tutorial: «Ejemplo» (se mueve sola), «Mi letra» (tiempos automáticos) y comportamiento con canción.
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
const LINES = ['probando una letra inventada', 'con palabras sueltas y cortas', 'hoooola luz', 'segunda prueba de renglones', 'otra línea más para ver el ritmo'].join('\n');

const DEV = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desk: { viewport: { width: 1440, height: 900 } },
};
for (const [name, cfg] of Object.entries(DEV)) {
  const ctx = await b.newContext(cfg);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  const info = () => pg.evaluate(() => ({ kind: window.__app.kind, demo: window.__app.player.demo, state: window.__app.player.state, tag: !document.querySelector('.stagetag').hidden, txt: document.querySelector('.tagtxt').textContent, mineDisabled: [...document.querySelectorAll('.tagseg button')].find((x) => x.textContent === 'Mi letra').disabled }));
  let s = await info();
  ok(s.kind === 'demo' && s.demo && s.tag, `${name}: al abrir se ve el ejemplo (${JSON.stringify(s)})`);
  ok(s.mineDisabled, `${name}: «Mi letra» está desactivado mientras no haya letra`);

  // la animación avanza sola
  const grab = (n) => pg.locator('.stage').screenshot({ path: `test/audit/${name}-demo-${n}.png` });
  await pg.waitForTimeout(1500);
  await grab('a');
  await pg.waitForTimeout(3500);
  await grab('b');
  const t1 = await pg.evaluate(() => window.__app.scene.R.t);
  await pg.waitForTimeout(400);
  const t2 = await pg.evaluate(() => window.__app.scene.R.t);
  ok(t2 !== t1, `${name}: el escenario se mueve solo (t ${t1.toFixed(2)} → ${t2.toFixed(2)})`);

  // con letra: se ofrece «Mi letra»
  await pg.evaluate((t) => {
    const a = window.__app;
    a.project.text = t;
    a.projectChanged();
  }, LINES);
  await pg.waitForTimeout(500);
  s = await info();
  ok(s.kind === 'mine' && !s.mineDisabled, `${name}: al escribir letra pasa a «Mi letra» (${s.kind})`);
  await pg.waitForTimeout(1800);
  await grab('mine-a');
  await pg.waitForTimeout(3000);
  await grab('mine-b');
  const words = await pg.evaluate(() => window.__app.scene.tl.lines.map((l) => l.text));
  ok(words.length === 5 && words[0] === 'probando una letra inventada', `${name}: el escenario usa mi letra (${words.length} frases)`);

  // volver al ejemplo con el botón
  await pg.click('.tagseg >> text=Ejemplo');
  await pg.waitForTimeout(400);
  s = await info();
  ok(s.kind === 'demo', `${name}: «Ejemplo» vuelve al tutorial`);
  await pg.click('.tagseg >> text=Mi letra');
  await pg.waitForTimeout(400);
  s = await info();
  ok(s.kind === 'mine', `${name}: «Mi letra» vuelve a mi letra`);

  // marcando: solo el fondo; al marcar aparece lo marcado
  await pg.click('#tab-mark');
  await pg.waitForTimeout(500);
  s = await info();
  // en teléfono (y tablet / acostado) el escenario se esconde en «Marcar» para dejar todo el espacio al marcado:
  // ahí no se rehace la escena (es lo más pesado) y se deja anotado para cuando vuelva a verse
  const hiddenStage = await pg.evaluate(() => window.__app.stageHidden());
  if (hiddenStage) {
    ok(await pg.evaluate(() => window.__app.needRebuild === true || window.__app.kind === 'blank'), `${name}: en «Marcar» el escenario está escondido y no gasta en rehacerse`);
  } else {
    ok(s.kind === 'blank' && !s.tag, `${name}: en «Marcar» el escenario no enseña texto ajeno (${s.kind})`);
  }
  await pg.evaluate(() => {
    const a = window.__app;
    a.project.sync[0] = { t: 1 };
    a.projectChanged();
  });
  await pg.waitForTimeout(500);
  s = await info();
  if (!hiddenStage) ok(s.kind === 'real' && !s.tag && !s.demo, `${name}: con una frase marcada se ve lo real (${s.kind})`);

  // ▶ detiene la vitrina
  await pg.evaluate(() => {
    const a = window.__app;
    a.project.sync[0] = null;
    a.projectChanged();
  });
  await pg.click('#tab-style');
  await pg.waitForTimeout(500);
  s = await info();
  ok(s.kind === 'mine' && s.demo, `${name}: en «Estilo» vuelve la vitrina (${s.kind})`);
  await pg.click('.tbtn.play');
  await pg.waitForTimeout(300);
  s = await info();
  ok(s.state === 'playing' && !s.demo, `${name}: ▶ detiene la vitrina y suena de verdad`);
  await pg.click('.tbtn.play');
  await pg.waitForTimeout(300);
  s = await info();
  ok(s.state === 'paused' && s.demo, `${name}: al pausar vuelve la vitrina`);
  await pg.screenshot({ path: `test/audit/${name}-demo-full.png` });
  await ctx.close();
}
console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
