// Paso Marcar en teléfonos ACOSTADOS (de 568×320 a 915×412): todo lo que se toca cabe sin desplazar y es legible.
// Capturas en test/audit/land-*.png. Solo texto de prueba inventado y audio sintético.
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
const LINES = Array.from({ length: 12 }, (_, i) => `prueba número ${i + 1} con palabras sueltas y luz`).join('\n');
const DEV = {
  l568: { viewport: { width: 568, height: 320 } },
  l640: { viewport: { width: 640, height: 360 } },
  l667: { viewport: { width: 667, height: 375 } },
  l740: { viewport: { width: 740, height: 360 } },
  l844: { viewport: { width: 844, height: 390 } },
  l915: { viewport: { width: 915, height: 412 } },
};
const ONLY = (process.env.DEV || '').split(',').filter(Boolean);
for (const [name, d] of Object.entries(DEV)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const ctx = await b.newContext({ ...d, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.evaluate((t) => { const a = window.__app; a.project.text = t; a.projectChanged(); a.emit('reset'); }, LINES);
  await pg.click('#tab-mark');
  await pg.waitForTimeout(500);
  const vh = d.viewport.height;
  const vw = d.viewport.width;
  const box = (sel) => pg.evaluate((s) => { const e = document.querySelector(s); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height, w: r.width }; }, sel);
  const inView = (r) => r && r.t >= -0.5 && r.b <= vh + 0.5 && r.l >= -0.5 && r.r <= vw + 0.5;
  // Qué tanto de cada elemento (título, botones, interruptor…) se ve de verdad: se recorta contra la pantalla y contra
  // cada ancestro que oculta lo que se sale (overflow). Devuelve los que se ven menos de 97 % (cortados) o con menos de 36 px de alto táctil.
  const cut = (root, sel) => pg.evaluate(({ root, sel }) => {
    const out = [];
    const host = document.querySelector(root);
    if (!host || host.closest('[hidden]')) return ['(no existe ' + root + ')'];
    for (const e of host.querySelectorAll(sel)) {
      if (e.closest('[hidden]')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      let L = Math.max(0, r.left), T = Math.max(0, r.top), R = Math.min(innerWidth, r.right), B = Math.min(innerHeight, r.bottom);
      for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const ar = a.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { L = Math.max(L, ar.left + a.clientLeft); R = Math.min(R, ar.left + a.clientLeft + a.clientWidth); }
        if (cs.overflowY !== 'visible') { T = Math.max(T, ar.top + a.clientTop); B = Math.min(B, ar.top + a.clientTop + a.clientHeight); }
      }
      const vis = Math.max(0, R - L) * Math.max(0, B - T) / (r.width * r.height);
      const label = (e.textContent || e.className || e.tagName).trim().slice(0, 28);
      if (vis < 0.97) out.push(label + ' (se ve ' + Math.round(vis * 100) + ' %)');
      else if (e.matches('button, .btn, .segb, .switch') && r.height < (innerHeight <= 330 ? 32 : 36)) out.push(label + ' (solo ' + Math.round(r.height) + ' px de alto)');
    }
    return out;
  }, { root, sel });
  // sin empezar: el título y el botón principal a la vista, sin cortar
  await pg.screenshot({ path: `test/audit/land-${name}-1-idle.png` });
  const card = await box('.mcard.idle');
  const title = await box('.mcard.idle .mtitle');
  const start = await box('.mcard.idle .btn.primary');
  ok(inView(card) && inView(title) && inView(start), `${name}: «sin empezar» muestra título y botón principal completos (título ${Math.round(title.t)}–${Math.round(title.b)}, botón ${Math.round(start.t)}–${Math.round(start.b)} de ${vh})`);
  ok(title.t >= card.t - 0.5, `${name}: el título no queda cortado por arriba de su tarjeta`);
  const idleCut = await cut('.mcard.idle', '.mtitle, .mnote, .btn, .segb, .switch, .mask, .mcheck');
  ok(idleCut.length === 0, `${name}: «sin empezar» — nada queda cortado ni chico${idleCut.length ? ' → ' + idleCut.join(' | ') : ''}`);
  const idleScroll = await pg.evaluate(() => { const c = document.querySelector('.mcard.idle'); return c.scrollHeight - c.clientHeight; });
  console.log(`   (tarjeta «sin empezar»: ${idleScroll > 1 ? 'se desplaza ' + idleScroll + ' px' : 'cabe completa'})`);
  // marcando
  await pg.tap('.mcard.idle .btn.primary');
  await pg.waitForFunction(() => window.__app.panels.mark.phase === 'run', null, { timeout: 8000 });
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: `test/audit/land-${name}-2-run.png` });
  const pad = await box('.pad');
  const btns = await box('.mbtns');
  const phr = await box('.mstage');
  ok(inView(pad) && pad.h >= 90 && pad.w >= 150, `${name}: el botón grande cabe (${Math.round(pad.w)}×${Math.round(pad.h)})`);
  ok(inView(btns), `${name}: «Deshacer» y «Saltar frase» se ven`);
  ok(inView(phr) && phr.h >= 60, `${name}: la frase de arriba se ve (${Math.round(phr.w)}×${Math.round(phr.h)})`);
  const runCut = await cut('.markpane', '.pad, .mbtns .btn, .mtop .mtopbtn, .mtop .mstat, .mtop .mclock, .mprog');
  ok(runCut.length === 0, `${name}: marcando — botón grande, Deshacer, Saltar, pausa y reloj enteros${runCut.length ? ' → ' + runCut.join(' | ') : ''}`);
  const fit = await pg.evaluate(() => { const c = document.querySelector('.mline.cur'); const w = document.querySelector('.mwrap'); return w.offsetHeight <= c.clientHeight + 1 && w.scrollWidth <= c.clientWidth + 1; });
  ok(fit, `${name}: la frase cabe en su caja`);
  // solo frases, con toques reales
  await pg.evaluate(() => {
    const m = window.__app.panels.mark;
    m.mode = 'phrase';
    m.paint();
  });
  const bb = await pg.locator('.pad').boundingBox();
  const cdp = await ctx.newCDPSession(pg);
  const tapPad = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }] });
    await pg.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pg.waitForTimeout(340);
  };
  const phaseNow = () => pg.evaluate(() => window.__app.panels.mark.phase);
  const waitPhase = (ph, ms = 8000) => pg.waitForFunction((p) => window.__app.panels.mark.phase === p, ph, { timeout: ms });
  const notScrolling = (sel) => pg.evaluate((s) => { const c = document.querySelector(s); return c.scrollHeight - c.clientHeight; }, sel);
  // pausa a la mitad → «En pausa»
  for (let i = 0; i < 3; i++) await tapPad();
  await pg.tap('.mtopbtn');
  await waitPhase('pause');
  await pg.waitForTimeout(1900);
  await pg.screenshot({ path: `test/audit/land-${name}-2b-pause.png` });
  // lo principal (título, «Seguir», deshacer, empezar de cero) siempre entero; las opciones de abajo, sin desplazar salvo en pantallas de ~320 px
  const pauseMain = await cut('.mcard.pause', '.mtitle, .btn:not(.mrestore)');
  ok(pauseMain.length === 0, `${name}: en pausa — título y botones principales enteros${pauseMain.length ? ' → ' + pauseMain.join(' | ') : ''}`);
  const pauseCut = await cut('.mcard.pause', '.mnote, .segb, .switch, .mrestore');
  const pauseScroll = await notScrolling('.mcard.pause');
  ok(pauseCut.length === 0 || vh <= 330, `${name}: en pausa — nota y opciones enteras (o la tarjeta se desplaza en pantallas de ~320 px)${pauseCut.length ? ' → ' + pauseCut.join(' | ') : ''}`);
  console.log(`   (tarjeta «en pausa»: ${pauseScroll > 1 ? 'se desplaza ' + pauseScroll + ' px' : 'cabe completa'})`);
  // «Empezar de cero» → cuenta regresiva a pantalla
  await pg.tap('.mcard.pause .btn:has-text("Empezar de cero")');
  await waitPhase('count');
  await pg.waitForTimeout(450);
  await pg.screenshot({ path: `test/audit/land-${name}-2c-count.png` });
  const cntCut = await cut('.mcard.count', '.cnum, .csub, .btn');
  ok(cntCut.length === 0, `${name}: cuenta regresiva — número y «Cancelar» enteros${cntCut.length ? ' → ' + cntCut.join(' | ') : ''}`);
  const cn = await box('.mcard.count .cnum');
  ok(cn && cn.h >= 50, `${name}: el número de la cuenta es grande (${cn ? Math.round(cn.h) : '?'} px de alto)`);
  // cancelar la cuenta → vuelve a la pausa; y la tarjeta «Ya marcaste X de N» (así se ve al volver con la letra a medias)
  await pg.tap('.mcard.count .btn');
  await waitPhase('pause');
  await pg.evaluate(() => { const m = window.__app.panels.mark; m.pend = { wt: [], wd: [] }; m.setPhase('idle'); });
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: `test/audit/land-${name}-2d-partial.png` });
  const partMain = await cut('.mcard.idle', '.mtitle, .btn:not(.mrestore)');
  ok(partMain.length === 0, `${name}: «Ya marcaste…» — título y botones principales enteros${partMain.length ? ' → ' + partMain.join(' | ') : ''}`);
  const partCut = await cut('.mcard.idle', '.segb, .switch, .mrestore');
  const partScroll = await notScrolling('.mcard.idle');
  ok(partCut.length === 0 || vh <= 330, `${name}: «Ya marcaste…» — opciones enteras (o la tarjeta se desplaza en pantallas de ~320 px)${partCut.length ? ' → ' + partCut.join(' | ') : ''}`);
  console.log(`   (tarjeta «Ya marcaste…»: ${partScroll > 1 ? 'se desplaza ' + partScroll + ' px' : 'cabe completa'})`);
  // seguir (cuenta regresiva otra vez) y terminar rápido
  await pg.tap('.mcard.idle .btn.primary');
  await waitPhase('run');
  for (let i = 0; i < 40; i++) {
    if ((await phaseNow()) !== 'run') break;
    await tapPad();
  }
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: `test/audit/land-${name}-3-done.png` });
  ok((await pg.evaluate(() => window.__app.panels.mark.phase)) === 'done', `${name}: se llega a «¿Quedó bien?»`);
  const dcard = await box('.mcard.done');
  const dtitle = await box('.mcard.done .mtitle');
  const dprev = await box('.mcard.done .btn.primary');
  const dnext = await box('.mcard.done .btn.alt');
  ok(inView(dcard) && inView(dtitle) && inView(dprev) && inView(dnext), `${name}: «¿Quedó bien?» muestra título, «Ver vista previa» y «Siguiente» sin desplazar`);
  const dscroll = await pg.evaluate(() => { const c = document.querySelector('.mcard.done'); return c.scrollHeight - c.clientHeight; });
  const doneCut = await cut('.mcard.done', '.mtitle, .mnote, .mask, .mcheck, .btn');
  ok(doneCut.length === 0, `${name}: «¿Quedó bien?» — título, pregunta y TODOS los botones se ven enteros${doneCut.length ? ' → ' + doneCut.join(' | ') : ''}`);
  ok(dscroll <= 1, `${name}: la tarjeta de «¿Quedó bien?» no necesita desplazarse (${dscroll > 1 ? 'se desplaza ' + dscroll + ' px' : 'cabe completa'})`);
  const tapSizes = await pg.evaluate(() => [...document.querySelectorAll('.mcard.done .btn')].filter((e) => !e.closest('[hidden]')).map((e) => Math.round(e.getBoundingClientRect().height)));
  console.log(`   (alto de los botones de «¿Quedó bien?»: ${tapSizes.join(', ')} px)`);
  await ctx.close();
}
console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
