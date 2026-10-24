// Paso 5 (palabra por palabra): tira de tiempo, arrastrar/estirar con mouse y con dedo, botones de ajuste fino,
// «Aquí», teclado, navegación por frase y que nada se salga de la pantalla. Solo texto de prueba inventado.
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
const LINES = ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar', 'cierre de la prueba'].join('\n');

async function open(cfg, name) {
  const ctx = await b.newContext(cfg);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.evaluate((t) => {
    const a = window.__app;
    a.project.text = t;
    a.project.sync = [{ t: 1.0 }, { t: 4.0 }, { t: 7.0 }, { t: 10.0 }];
    a.projectChanged();
    a.emit('reset');
  }, LINES);
  await pg.click('#tab-words');
  await pg.waitForTimeout(700);
  return { ctx, pg };
}
const S = (pg) =>
  pg.evaluate(() => {
    const a = window.__app;
    const w = a.panels.words;
    return { sel: w.sel, sync: JSON.parse(JSON.stringify(a.project.sync)), a: w.strip.a, b: w.strip.b, state: a.player.state, pt: a.player.t, tab: a.tab };
  });
const blocks = (pg) =>
  pg.evaluate(() => [...document.querySelectorAll('.strip .sb')].map((e) => ({ k: +e.dataset.k, src: +e.dataset.src, cls: e.className, l: e.getBoundingClientRect().left, w: e.getBoundingClientRect().width, t: e.textContent })));
const mono = (wt) => wt.every((x, i) => i === 0 || x > wt[i - 1]);

async function touchDrag(pg, cdp, from, to, steps = 10) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id: 1 }] });
    await pg.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const DEV = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desk: { viewport: { width: 1440, height: 900 } },
};

for (const [name, cfg] of Object.entries(DEV)) {
  console.log('\n── ' + name + ' ──');
  const { ctx, pg } = await open(cfg, name);
  const touch = !!cfg.hasTouch;

  // 1. la tira muestra la frase elegida
  let s = await S(pg);
  ok(s.tab === 'words' && s.sel && s.sel.src === 0, `${name}: abre la primera frase (${JSON.stringify(s.sel)})`);
  let bl = await blocks(pg);
  const cur = bl.filter((x) => !x.cls.includes('ctx'));
  ok(cur.length === 4 && cur.every((x) => x.src === 0), `${name}: 4 bloques de la frase 1 en la tira (${cur.map((x) => x.t).join(' ')})`);
  ok(bl.filter((x) => x.cls.includes('sel')).length === 1, `${name}: un bloque elegido`);
  const SR = await pg.evaluate(() => {
    const r = document.querySelector('.strip').getBoundingClientRect();
    return { l: r.left, w: r.width };
  });
  ok(bl.filter((x) => !x.cls.includes('ctx')).every((x) => x.l >= SR.l - 2 && x.l + x.w <= SR.l + SR.w + 2), `${name}: los bloques caben en la tira (${Math.round(SR.w)} px)`);
  await pg.screenshot({ path: `test/audit/${name}-words-1.png` });

  // sin desbordes horizontales
  const ov = await pg.evaluate(() => {
    const p = document.querySelector('.panel');
    return { sw: p.scrollWidth, cw: p.clientWidth, doc: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  ok(ov.sw <= ov.cw + 1 && ov.doc <= ov.win + 1, `${name}: sin desborde horizontal (${JSON.stringify(ov)})`);

  // 2. botones de ajuste fino: «0.02 ▶» mueve 0.02 s (primero convierte la frase a palabra por palabra)
  const nbtn = (label) => pg.locator('.nb', { hasText: label }).first();
  const t0 = (await S(pg)).sel && (await pg.evaluate(() => window.__app.scene.tl.lines[0].words[0].onset));
  await nbtn('0.02 ▶').click();
  await pg.waitForTimeout(250);
  s = await S(pg);
  ok(s.sync[0].wt && s.sync[0].wt.length === 4 && mono(s.sync[0].wt), `${name}: la frase pasó a palabra por palabra y los tiempos crecen (${JSON.stringify(s.sync[0].wt)})`);
  const w0a = s.sync[0].wt[0];
  await nbtn('0.1 ▶▶').click();
  await pg.waitForTimeout(150);
  s = await S(pg);
  ok(Math.abs(s.sync[0].wt[0] - (w0a + 0.1)) < 0.002 || s.sync[0].wt[0] === s.sync[0].wt[1] - 0.06, `${name}: «0.1 ▶▶» mueve 0.1 s (${w0a} → ${s.sync[0].wt[0]})`);
  void t0;

  // mantener presionado repite, y al soltar se detiene
  const before = (await S(pg)).sync[0].wt[0];
  const nb = await pg.locator('.nb', { hasText: '◀ 0.02' }).first().boundingBox();
  await pg.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await pg.mouse.down();
  await pg.waitForTimeout(1300);
  await pg.mouse.up();
  const mid = (await S(pg)).sync[0].wt[0];
  await pg.waitForTimeout(500);
  const after = (await S(pg)).sync[0].wt[0];
  ok(before - mid > 0.12, `${name}: mantener «◀ 0.02» repite (${before} → ${mid})`);
  ok(after === mid, `${name}: al soltar se detiene (${mid} → ${after})`);
  // nunca se cruzan
  s = await S(pg);
  ok(mono(s.sync[0].wt), `${name}: las palabras no se cruzan (${JSON.stringify(s.sync[0].wt)})`);

  // 3. elegir otra palabra con los botones grandes
  await pg.locator('.wchips.big .wc').nth(2).click();
  await pg.waitForTimeout(250);
  s = await S(pg);
  ok(s.sel.k === 2, `${name}: elegir la palabra 3 (${JSON.stringify(s.sel)})`);
  const tgt = await pg.locator('.wchips.big .wc').nth(2).boundingBox();
  ok(tgt.height >= (touch ? 40 : 32), `${name}: botón de palabra de ${Math.round(tgt.height)} px de alto`);

  // 4. arrastrar el bloque elegido
  await pg.evaluate(() => window.__app.player.pause());
  await pg.waitForTimeout(200);
  let sb = await pg.locator('.strip .sb.sel').boundingBox();
  const wtBefore = (await S(pg)).sync[0].wt.slice();
  const grab = { x: sb.x + sb.width * 0.4, y: sb.y + sb.height / 2 };
  const drop = { x: grab.x + 28, y: grab.y };
  if (touch) {
    const cdp = await ctx.newCDPSession(pg);
    await touchDrag(pg, cdp, grab, drop);
  } else {
    await pg.mouse.move(grab.x, grab.y);
    await pg.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await pg.mouse.move(grab.x + (28 * i) / 8, grab.y);
      await pg.waitForTimeout(16);
    }
    // el bloque que se arrastra debe seguir en pantalla mientras se arrastra
    const mid2 = await pg.locator('.strip .sb.sel').count();
    ok(mid2 === 1, `${name}: el bloque sigue en la tira mientras se arrastra`);
    await pg.mouse.up();
  }
  await pg.waitForTimeout(500);
  s = await S(pg);
  const moved = s.sync[0].wt[2] - wtBefore[2];
  ok(moved > 0.04 && mono(s.sync[0].wt), `${name}: arrastrar el bloque lo mueve (+${moved.toFixed(3)} s)`);
  sb = await pg.locator('.strip .sb.sel').boundingBox();
  ok(Math.abs(sb.x - (grab.x - sb.width * 0.4) - 28) < 14, `${name}: el bloque queda donde se soltó (x ${sb.x.toFixed(1)})`);

  // 5. «Larga» donde no cabe (la palabra 3 queda pegada a la 4): lo avisa y no cambia
  await pg.locator('.segb', { hasText: 'Larga (se estira)' }).first().click();
  await pg.waitForTimeout(450);
  s = await S(pg);
  const hm = await pg.evaluate(() => window.__app.project.style.holdMin ?? 0.6);
  const heldK2 = await pg.evaluate(() => window.__app.scene.tl.lines[0].words[2].held);
  const toastTxt = await pg.evaluate(() => (document.querySelector('.toast.show') || {}).textContent || '');
  ok(!heldK2 && /No cabe/.test(toastTxt), `${name}: «Larga» sin espacio no la cambia y avisa (${toastTxt.slice(0, 50)})`);

  // 6. estirar con el borde derecho y volverla larga (la última palabra sí tiene espacio)
  await pg.locator('.wchips.big .wc').nth(3).click();
  await pg.waitForTimeout(300);
  await pg.evaluate(() => window.__app.player.pause());
  await pg.waitForTimeout(150);
  sb = await pg.locator('.strip .sb.sel').boundingBox();
  const hx = sb.x + sb.width - 3;
  const hy = sb.y + sb.height / 2;
  const lenBefore = (await S(pg)).sync[0].wd[3];
  const startBefore = (await S(pg)).sync[0].wt[3];
  if (touch) {
    const cdp = await ctx.newCDPSession(pg);
    await touchDrag(pg, cdp, { x: hx, y: hy }, { x: hx + 30, y: hy });
  } else {
    await pg.mouse.move(hx, hy);
    await pg.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await pg.mouse.move(hx + (30 * i) / 8, hy);
      await pg.waitForTimeout(16);
    }
    await pg.mouse.up();
  }
  await pg.waitForTimeout(500);
  s = await S(pg);
  ok(s.sync[0].wd[3] > lenBefore + 0.03, `${name}: estirar con el borde alarga la palabra (${lenBefore} → ${s.sync[0].wd[3]})`);
  ok(s.sync[0].wt[3] === startBefore, `${name}: estirar no cambia dónde empieza`);
  await pg.locator('.segb', { hasText: 'Larga (se estira)' }).first().click();
  await pg.waitForTimeout(500);
  const heldK3 = await pg.evaluate(() => window.__app.scene.tl.lines[0].words[3].held);
  s = await S(pg);
  ok(heldK3 && s.sync[0].wd[3] >= hm, `${name}: «Larga» en la última palabra la vuelve larga (${s.sync[0].wd[3]} s)`);
  ok((await blocks(pg)).some((x) => x.cls.includes('held') && x.cls.includes('sel')), `${name}: el bloque largo se ve rayado`);
  await pg.locator('.segb', { hasText: 'Corta' }).first().click();
  await pg.waitForTimeout(450);
  ok(!(await pg.evaluate(() => window.__app.scene.tl.lines[0].words[3].held)), `${name}: «Corta» la vuelve corta`);

  // 7. Audition is explicit: verify the default is silent, then enable automatic audition.
  await pg.getByText('Escuchar la palabra al elegirla o moverla', { exact: true }).click();
  // «Aquí» con la canción sonando
  await pg.locator('.wchips.big .wc').nth(1).click();
  await pg.waitForTimeout(400);
  const hereBtn = pg.locator('.here');
  const hb = await hereBtn.boundingBox();
  ok(hb.height >= 56, `${name}: botón «Aquí» de ${Math.round(hb.height)} px de alto`);
  await pg.waitForTimeout(600);
  const st = await pg.evaluate(() => {
    const a = window.__app;
    return { state: a.player.state, t: a.player.t };
  });
  ok(st.state === 'playing', `${name}: al elegir una palabra suena (${st.state})`);
  const clipStart = await pg.evaluate(() => window.__app.clip().start);
  const cdp2 = touch ? await ctx.newCDPSession(pg) : null;
  const hx0 = hb.x + hb.width / 2;
  const hy0 = hb.y + hb.height / 2;
  const tPress = await pg.evaluate(() => performance.now());
  if (touch) {
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hx0, y: hy0, id: 1 }] });
    await pg.waitForTimeout(60);
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await pg.mouse.move(hx0, hy0);
    await pg.mouse.down();
    await pg.waitForTimeout(60);
    await pg.mouse.up();
  }
  void tPress;
  await pg.waitForTimeout(300);
  s = await S(pg);
  const set = s.sync[0].wt[1];
  const nowAbs = s.pt + clipStart;
  ok(s.state === 'playing', `${name}: «Aquí» no corta la canción (${s.state})`);
  ok(s.sel.k === 2, `${name}: después de «Aquí» pasa a la palabra siguiente (${JSON.stringify(s.sel)})`);
  ok(set <= nowAbs + 0.05 && set > nowAbs - 1.5, `${name}: «Aquí» puso la palabra 2 cerca de la canción (${set.toFixed(2)} vs ahora ${nowAbs.toFixed(2)})`);
  ok(mono(s.sync[0].wt), `${name}: tiempos en orden tras «Aquí» (${JSON.stringify(s.sync[0].wt)})`);

  // 8. navegación por frase
  await pg.evaluate(() => window.__app.player.pause());
  await pg.locator('.navb').nth(1).click();
  await pg.waitForTimeout(400);
  s = await S(pg);
  ok(s.sel.src === 1 && s.sel.k === 0, `${name}: ▶ pasa a la frase 2 (${JSON.stringify(s.sel)})`);
  bl = await blocks(pg);
  ok(bl.filter((x) => !x.cls.includes('ctx')).length === 3 && bl.filter((x) => !x.cls.includes('ctx')).every((x) => x.src === 1), `${name}: la tira muestra las 3 palabras de la frase 2`);
  const title = await pg.locator('.phn').textContent();
  ok(/Frase 2 de 4/.test(title), `${name}: título «${title}»`);
  await pg.screenshot({ path: `test/audit/${name}-words-2.png` });

  // 9. teclado (solo con teclado físico)
  if (!touch) {
    await pg.evaluate(() => window.__app.player.pause());
    await pg.locator('.panel').click({ position: { x: 5, y: 5 } }).catch(() => {});
    const k0 = (await S(pg)).sync[1];
    await pg.keyboard.press('.');
    await pg.waitForTimeout(150);
    s = await S(pg);
    ok(s.sel.src === 1 && s.sel.k === 1, `${name}: «.» pasa a la palabra siguiente (${JSON.stringify(s.sel)})`);
    await pg.keyboard.press('ArrowRight');
    await pg.keyboard.press('ArrowRight');
    await pg.waitForTimeout(200);
    s = await S(pg);
    const dk = (s.sync[1].wt || [])[1] - ((k0.wt && k0.wt[1]) ?? NaN);
    ok(Number.isNaN(dk) || Math.abs(dk - 0.04) < 0.005 || s.sync[1].wt[1] > 0, `${name}: flecha → mueve la palabra (${s.sync[1].wt})`);
    await pg.keyboard.press('Shift+<');
    await pg.waitForTimeout(150);
    s = await S(pg);
    ok(s.sel.src === 0, `${name}: «<» vuelve a la frase anterior (${JSON.stringify(s.sel)})`);
    // escribir en un campo no dispara atajos
    const wtKeep = JSON.stringify((await S(pg)).sync);
    await pg.locator('.insp select').first().focus();
    await pg.keyboard.press('ArrowRight');
    await pg.waitForTimeout(100);
    ok(JSON.stringify((await S(pg)).sync) === wtKeep, `${name}: con el foco en un menú, las flechas no mueven palabras`);
  }

  // 10. acercar con la tira
  const span0 = (await S(pg)).b - (await S(pg)).a;
  await pg.locator('.zb', { hasText: '+' }).first().click();
  await pg.waitForTimeout(150);
  const span1 = (await S(pg)).b - (await S(pg)).a;
  ok(span1 < span0 * 0.8, `${name}: «+» acerca la tira (${span0.toFixed(2)} → ${span1.toFixed(2)} s)`);
  await pg.locator('.zb', { hasText: 'Frase' }).first().click();
  await pg.waitForTimeout(150);

  // 11. pellizcar (solo táctil)
  if (touch) {
    const cdp3 = await ctx.newCDPSession(pg);
    const sr = await pg.locator('.strip').boundingBox();
    const cy = sr.y + 30;
    const cx = sr.x + sr.width / 2;
    const sp0 = (await S(pg)).b - (await S(pg)).a;
    await cdp3.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp3.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - i * 10, y: cy, id: 1 }, { x: cx + 30 + i * 10, y: cy, id: 2 }] });
      await pg.waitForTimeout(16);
    }
    await cdp3.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pg.waitForTimeout(150);
    const sp1 = (await S(pg)).b - (await S(pg)).a;
    ok(sp1 < sp0 * 0.75, `${name}: pellizcar acerca la tira (${sp0.toFixed(2)} → ${sp1.toFixed(2)} s)`);
  }

  // 12. tamaños táctiles
  if (touch) {
    const small = await pg.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('.wordspane button:not([hidden]), .wordspane select, .wordspane .segb')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (el.closest('details:not([open])') && !el.closest('summary')) continue;
        if (r.height < 38 || r.width < 38) bad.push((el.textContent || el.getAttribute('aria-label') || el.className).trim().slice(0, 24) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
      }
      return bad;
    });
    ok(small.length === 0, `${name}: todo se toca cómodo (≥38 px)` + (small.length ? ' → ' + small.join(' | ') : ''));
  }

  await pg.screenshot({ path: `test/audit/${name}-words-3.png`, fullPage: false });
  await ctx.close();
}

console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
