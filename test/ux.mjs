// Contrato de usabilidad en todos los tamaños: sin scroll horizontal, lo que se toca cabe en pantalla y es lo bastante grande
// para el dedo, el botón de marcar no se mueve ni sale de la pantalla mientras se marca. Solo texto de prueba inventado.
import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const LINES = Array.from({ length: 18 }, (_, i) => `prueba número ${i + 1} con palabras sueltas y luz`).join('\n');
const DEVICES = {
  'phone-320': { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, touch: true },
  'phone-430': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, touch: true },
  'tablet-768': { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true, touch: true },
  'desk-1920': { viewport: { width: 1920, height: 1080 } },
  'phone-360': { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, touch: true },
  'phone-390': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, touch: true },
  'phone-land': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, touch: true },
  'tablet-p': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, touch: true },
  'tablet-l': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, touch: true },
  'desk-1440': { viewport: { width: 1440, height: 900 } },
  'desk-1024': { viewport: { width: 1024, height: 680 } },
  'phone-360-original': { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, touch: true },
  'desk-1024-original': { viewport: { width: 1024, height: 768 } },
  'desk-1363-original': { viewport: { width: 1363, height: 936 } },
};
const TABS = ['song', 'text', 'mark', 'style', 'words', 'export'];
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(DEVICES);
const REPORT = process.env.REPORT === '1';

for (const name of only) {
  const { touch, ...cfg } = DEVICES[name];
  const ctx = await b.newContext(cfg);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.evaluate((txt) => {
    const a = window.__app;
    a.project.text = txt;
    for (let i = 0; i < 6; i++) a.project.sync[i] = { t: 1 + i * 2.2 };
    a.projectChanged();
    a.emit('reset');
  }, LINES);
  await pg.waitForTimeout(900);
  // En horizontal compacto se conserva el mínimo táctil de 44 px.
  const minSide = touch ? 44 : 22;
  for (const t of TABS) {
    await pg.click('#tab-' + t);
    await pg.waitForTimeout(450);
    const r = await pg.evaluate((minSide) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const small = [];
      const out = [];
      const sel = 'button, a[href], select, [role=tab], input[type=text], input[type=number], textarea, label.btn, summary';
      for (const el of document.querySelectorAll(sel)) {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        if (el.closest('[hidden], .hidden, .theater')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        const bb = el.getBoundingClientRect();
        if (bb.width === 0 || bb.height === 0) continue;
        // lo que está dentro de una caja con scroll puede estar fuera de la vista sin problema
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowY;
          if ((o === 'auto' || o === 'scroll') && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) {
            const pr = p.getBoundingClientRect();
            if (bb.bottom > pr.bottom + 1 || bb.top < pr.top - 1 || bb.right > pr.right + 1 || bb.left < pr.left - 1) clipped = true;
            break;
          }
        }
        if (clipped) continue;
        const label = (el.getAttribute('aria-label') || el.textContent || el.placeholder || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
        if (Math.min(bb.width, bb.height) < minSide) small.push(`${label} [${el.className.toString().slice(0, 24)}] ${Math.round(bb.width)}×${Math.round(bb.height)}`);
        if (bb.right > vw + 1 || bb.left < -1) out.push(`${label} x=${Math.round(bb.left)}..${Math.round(bb.right)}`);
      }
      const panel = document.querySelector('.panel');
      return {
        docX: document.documentElement.scrollWidth > vw + 1,
        panelX: panel.scrollWidth > panel.clientWidth + 1,
        small,
        out,
        vh,
      };
    }, minSide);
    ok(!r.docX && !r.panelX, `${name} / ${t}: sin scroll horizontal`);
    ok(r.out.length === 0, `${name} / ${t}: nada se sale por los lados${r.out.length ? ' — ' + r.out.join('; ') : ''}`);
    if (r.small.length) {
      console.log(`${REPORT ? 'info' : 'FALLA'} ${name} / ${t}: ${r.small.length} controles chicos para ${touch ? 'el dedo' : 'el ratón'}: ${r.small.join(' | ')}`);
      if (!REPORT) fails++;
    } else ok(true, `${name} / ${t}: todo lo que se toca mide al menos ${minSide}px`);
  }

  // marcar: el botón grande no se mueve ni sale de la pantalla
  await pg.click('#tab-mark');
  await pg.waitForTimeout(300);
  await pg.click('.segb:text-is("Solo frases")');
  // ya había 6 frases marcadas: «Empezar de cero» arranca (con la cuenta 3-2-1) desde el principio del tramo
  await pg.click('.mcard.idle .btn.alt');
  await pg.waitForFunction(() => window.__app.player.state === 'playing', null, { timeout: 8000 });
  await pg.waitForTimeout(400);
  const snap = () =>
    pg.evaluate(() => {
      const pad = document.querySelector('.pad').getBoundingClientRect();
      const panel = document.querySelector('.panel');
      return { top: Math.round(pad.top), bottom: Math.round(pad.bottom), left: Math.round(pad.left), right: Math.round(pad.right), w: Math.round(pad.width), h: Math.round(pad.height), panelTop: Math.round(panel.scrollTop), page: Math.round(document.scrollingElement.scrollTop), vh: window.innerHeight, vw: window.innerWidth };
    });
  const s0 = await snap();
  ok(s0.top >= 0 && s0.bottom <= s0.vh && s0.left >= 0 && s0.right <= s0.vw, `${name}: el botón de marcar se ve completo (${s0.w}×${s0.h} en ${s0.vw}×${s0.vh})`);
  ok(s0.w >= (touch ? 120 : 100) && s0.h >= (touch ? 70 : 60), `${name}: y es grande (${s0.w}×${s0.h})`);
  const drift = [];
  for (let i = 0; i < 8; i++) {
    const bb = await pg.locator('.pad').boundingBox();
    if (touch) await pg.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    else {
      await pg.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await pg.mouse.down();
      await pg.waitForTimeout(60);
      await pg.mouse.up();
    }
    await pg.waitForTimeout(700);
    const s = await snap();
    drift.push(Math.abs(s.top - s0.top) + Math.abs(s.left - s0.left) + s.page + Math.abs(s.h - s0.h));
  }
  ok(drift.every((d) => d <= 1), `${name}: al marcar 8 frases el botón no se mueve ni la página se desplaza (desvíos ${drift.join(',')})`);
  const marked = await pg.evaluate(() => window.__app.project.sync.filter(Boolean).length);
  ok(marked >= 8, `${name}: y las marcas quedaron (${marked} frases con tiempo)`);
  await ctx.close();
}
console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(REPORT ? 0 : fails || errs.length ? 1 : 0);
