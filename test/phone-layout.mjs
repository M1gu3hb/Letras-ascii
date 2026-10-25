// Teléfono (y tablet / compu): el escenario encaja en cada formato, la letra cabe, y el paso Marcar no se desborda.
// Lo que reportó Miguel con capturas de su Android: «se ve raro, no encajan las palabras, horizontal y vertical se ven muy mal».
// Solo texto inventado y audio sintético. Mide (no adivina): caja del escenario, lienzo, rejilla y palabras.
import { serve, launch, watch } from './lib.mjs';
import {openMarkOptions} from './lib.mjs';
const { srv, port } = serve(process.env.SITE || 'site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const LINES = ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar con palabras largas', 'otra línea más larga para ver cómo se acomoda', 'cierre', 'una frase larga con diez palabras para ver cómo se acomoda'].join('\n');
const LONG = 'una frase todavía más larga que tiene muchas palabras seguidas para ver cómo se achica la letra de arriba sin salirse';
const DEVS = [
  { name: '360×640', cfg: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, stacked: true },
  { name: '393×736', cfg: { viewport: { width: 393, height: 736 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, stacked: true },
  { name: '412×915', cfg: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true }, stacked: true },
  { name: '430×932', cfg: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, stacked: true },
  { name: '820×1180 (tablet)', cfg: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, stacked: true },
  { name: '844×390 (acostado)', cfg: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, stacked: true, short: true },
  { name: '1440×900 (compu)', cfg: { viewport: { width: 1440, height: 900 } }, stacked: false },
];
const only = process.argv[2] ? process.argv[2].split(',') : null;
const FORMATS = { wide: 16 / 9, tall: 9 / 16, square: 1 };

// lo que se ve del escenario, medido
const MEASURE = ({ inTheater }) => {
  const a = window.__app;
  const host = inTheater ? a.thost : a.stage;
  const hr = host.getBoundingClientRect();
  const cr = a.canvas.getBoundingClientRect();
  // la rejilla se acomoda al interior de la caja (sin su borde de 1 px)
  const inner = [host.clientWidth, host.clientHeight];
  const bw = (hr.width - inner[0]) / 2;
  const bh = (hr.height - inner[1]) / 2;
  const r = a.scene.r;
  const out = [];
  const tl = a.scene.tl;
  const chk = (w, tag) => {
    if (w.gx == null || w.Wb == null) return;
    // las letras llevan ~1.5 celdas de margen propio: se tolera hasta 2.5
    if (w.gx < -2.5 || w.gy < 0 || w.gx + w.Wb > r.grid.cols + 2.5 || w.gy + w.Hb > r.grid.rows) out.push(`${tag}:${w.text} (${w.gx},${w.gy} ${w.Wb}×${w.Hb})`);
  };
  if (tl) {
    for (const u of tl.units) for (const w of u.words) chk(w, 'hero');
    for (const l of tl.lines) if (l.ctx) for (const w of l.ctx.words) chk(w, 'ctx');
  }
  return {
    host: inner,
    canvas: [cr.width, cr.height],
    dx: Math.abs(cr.left - (hr.left + bw)) + Math.abs(cr.top - (hr.top + bh)),
    px: [a.canvas.width, a.canvas.height],
    dpr: r.dpr,
    fit: [r.W, r.H],
    grid: [r.grid.cols, r.grid.rows],
    cell: [r.cellW, r.cellH],
    offY: r.offY,
    fuera: out,
    ovX: document.documentElement.scrollWidth - innerWidth,
    visible: !!a.canvas.offsetParent,
  };
};

function checkStage(tag, m, fmt, { isTheater = false } = {}) {
  const sameBox = Math.abs(m.canvas[0] - m.host[0]) <= 1 && Math.abs(m.canvas[1] - m.host[1]) <= 1 && m.dx <= 1;
  ok(sameBox, `${tag}: el lienzo ocupa justo la caja del escenario (${m.canvas.map(Math.round)} vs ${m.host.map(Math.round)})`);
  ok(Math.abs(m.px[0] - m.fit[0] * m.dpr) <= 2 && Math.abs(m.px[1] - m.fit[1] * m.dpr) <= 2 && Math.abs(m.fit[0] - m.host[0]) <= 1 && Math.abs(m.fit[1] - m.host[1]) <= 1, `${tag}: la rejilla se calculó con el tamaño REAL (${m.fit.map(Math.round)}), no con uno mínimo`);
  ok(Math.abs(m.grid[0] * m.cell[0] - m.fit[0]) < 0.6, `${tag}: las ${m.grid[0]} columnas llenan todo el ancho`);
  ok(m.grid[1] * m.cell[1] <= m.fit[1] + 0.5 && m.offY < m.cell[1] + 0.5, `${tag}: las ${m.grid[1]} filas caben en el alto (sobra ${m.offY.toFixed(1)} px arriba y abajo)`);
  if (!isTheater && fmt) {
    const ar = m.host[0] / m.host[1];
    ok(Math.abs(ar - FORMATS[fmt]) / FORMATS[fmt] < 0.06, `${tag}: el escenario tiene la forma ${fmt} (${ar.toFixed(2)} vs ${FORMATS[fmt].toFixed(2)})`);
  }
  ok(m.fuera.length === 0, `${tag}: todas las palabras caben en la rejilla` + (m.fuera.length ? ' → fuera: ' + m.fuera.join(', ') : ''));
  ok(m.ovX <= 0, `${tag}: la página no se desborda a los lados`);
}

for (const dev of DEVS) {
  if (only && !only.some((o) => dev.name.startsWith(o))) continue;
  console.log('\n── ' + dev.name + ' ──');
  const ctx = await b.newContext(dev.cfg);
  const pg = await ctx.newPage();
  watch(pg, errs);
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
  await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
  await pg.evaluate((t) => {
    const a = window.__app;
    a.project.text = t;
    a.project.sync = [{ t: 1.0 }, { t: 3.8, wt: [3.8, 4.3, 4.9], wd: [0.5, 1.6, 0.4] }, { t: 7.0 }, { t: 9.2 }, { t: 12.0 }, { t: 14 }];
    a.projectChanged();
    a.emit('reset');
  }, LINES);
  await pg.waitForTimeout(700);

  // ── los tres formatos, en «Estilo» (con el escenario a la vista), cambiando con el selector de verdad
  await pg.click('#tab-style');
  await pg.waitForTimeout(400);
  for (const fmt of ['wide', 'tall', 'square', 'wide']) {
    // el selector de forma vive detrás de «⋯» (en el teléfono)
    const more = pg.locator('.moreBtn');
    if (await more.isVisible()) {
      if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
    }
    await pg.locator('select[aria-label="Forma de la pantalla"]').selectOption(fmt);
    await pg.waitForTimeout(420);
    const m = await pg.evaluate(MEASURE, { inTheater: false });
    ok(m.visible, `${dev.name} · ${fmt}: el escenario se ve en «Estilo»`);
    checkStage(`${dev.name} · ${fmt}`, m, fmt);
    // acostado (390 px de alto) el escenario vertical solo puede ser chico: lo importante es que encaje
    const minSide = dev.short ? 90 : 150;
    const sz = m.host[0] >= minSide && m.host[1] >= minSide;
    ok(sz, `${dev.name} · ${fmt}: no queda diminuto (${m.host.map(Math.round)})`);
  }

  // ── cambiar la forma mientras el escenario está oculto (Marcar en el teléfono) y luego verlo
  await pg.click('#tab-mark');
  await pg.waitForTimeout(300);
  const hiddenOnMark = await pg.evaluate(() => !window.__app.canvas.offsetParent);
  ok(hiddenOnMark === dev.stacked, `${dev.name}: en «Marcar» el escenario ${dev.stacked ? 'se esconde para dejar sitio al marcado' : 'sigue a la vista'} (${hiddenOnMark ? 'oculto' : 'visible'})`);
  await pg.evaluate(() => {
    const a = window.__app;
    a.format = 'tall';
    a.applyFormat();
  });
  await pg.waitForTimeout(300);
  await pg.click('#tab-style');
  await pg.waitForTimeout(600);
  checkStage(`${dev.name} · vertical cambiado desde Marcar`, await pg.evaluate(MEASURE, { inTheater: false }), 'tall');
  await pg.evaluate(() => {
    const a = window.__app;
    a.format = 'wide';
    a.applyFormat();
  });
  await pg.waitForTimeout(500);

  // ── pantalla completa en cada formato
  for (const fmt of ['wide', 'tall', 'square']) {
    await pg.evaluate((f) => {
      const a = window.__app;
      if (a.theaterOn) a.closeTheater();
      a.format = f;
      a.applyFormat();
    }, fmt);
    await pg.waitForTimeout(300);
    await pg.evaluate(() => window.__app.openTheater());
    await pg.waitForTimeout(700);
    const m = await pg.evaluate(MEASURE, { inTheater: true });
    checkStage(`${dev.name} · pantalla completa ${fmt}`, m, null, { isTheater: true });
    ok(m.host[0] >= dev.cfg.viewport.width * 0.6 || m.host[1] >= dev.cfg.viewport.height * 0.6, `${dev.name} · pantalla completa ${fmt}: ocupa buena parte de la pantalla (${m.host.map(Math.round)})`);
    await pg.evaluate(() => window.__app.closeTheater());
    await pg.waitForTimeout(300);
  }
  await pg.evaluate(() => {
    const a = window.__app;
    a.format = 'wide';
    a.applyFormat();
  });

  // ── paso Marcar: cabe sin desplazarse, y la frase siempre cabe en su caja
  await pg.evaluate((t) => {
    const a = window.__app;
    a.project.text = t;
    a.projectChanged();
    a.emit('reset');
  }, LINES + '\n' + LONG);
  await pg.click('#tab-mark');
  await pg.waitForTimeout(400);
  const vh = dev.cfg.viewport.height;
  const vw = dev.cfg.viewport.width;
  const idle = await pg.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e || e.closest('[hidden]')) return null; const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, b: q.bottom, r: q.right }; };
    return { start: r('.mcard.idle .btn.primary'), stage: r('.mstage'), top: r('.mtop'), ovX: document.documentElement.scrollWidth - innerWidth };
  });
  ok(idle.start && idle.start.b <= vh + 1 && idle.start.y >= 0, `${dev.name} · Marcar: el botón «Empezar a marcar» se ve completo sin desplazarse (y=${Math.round(idle.start && idle.start.y)}–${Math.round(idle.start && idle.start.b)} de ${vh})`);
  ok(idle.stage && idle.stage.r <= vw + 1 && idle.stage.x >= -1, `${dev.name} · Marcar: la caja de la frase cabe a lo ancho`);
  ok(idle.ovX <= 0, `${dev.name} · Marcar: sin desbordes a los lados`);
  // con cuenta apagada y «solo frases» se llega pronto al botón grande
  await openMarkOptions(pg);
  await pg.click('.mcard.idle .mopts .switch');
  await openMarkOptions(pg);
  await pg.click('.mcard.idle .segb:text-is("Solo frases")').catch(() => {});
  // empezar de cero (hay marcas): «Empezar de cero»
  const fresh = pg.locator('.mcard.idle .btn.alt');
  if (await fresh.isVisible()) await fresh.click();
  else await pg.click('.mcard.idle .btn.primary');
  await pg.waitForFunction(() => window.__app.panels.mark.phase === 'run', null, { timeout: 5000 });
  await pg.waitForTimeout(400);
  const run = await pg.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e || e.closest('[hidden]')) return null; const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, b: q.bottom, r: q.right }; };
    const cur = document.querySelector('.mline.cur');
    const wrap = document.querySelector('.mwrap');
    return { pad: r('.pad'), stage: r('.mstage'), btns: r('.mbtns'), top: r('.mtop'), fitH: wrap.offsetHeight <= cur.clientHeight + 1, fitW: wrap.scrollWidth <= cur.clientWidth + 1, fs: getComputedStyle(cur).fontSize };
  });
  ok(run.pad && run.pad.b <= vh + 1 && run.pad.y >= 0 && run.pad.x >= 0 && run.pad.r <= vw + 1, `${dev.name} · Marcar: el botón grande cabe en la pantalla (${Math.round(run.pad.w)}×${Math.round(run.pad.h)})`);
  ok(run.pad.w >= Math.min(vw, 600) * 0.4 && run.pad.h >= Math.min(130, vh * 0.3), `${dev.name} · Marcar: el botón grande es grande de verdad (${Math.round(run.pad.w)}×${Math.round(run.pad.h)})`);
  ok(run.btns && run.btns.b <= vh + 1, `${dev.name} · Marcar: «Deshacer» y «Saltar frase» se ven (${Math.round(run.btns.b)} ≤ ${vh})`);
  ok(run.fitH && run.fitW, `${dev.name} · Marcar: la frase de arriba cabe en su caja (letra ${run.fs})`);
  // la frase más larga: se achica sola y sigue cabiendo
  await pg.evaluate(() => { const m = window.__app.panels.mark; m.cur = { p: 6, k: 0 }; m.paint(); m.fitCurrent(true); });
  await pg.waitForTimeout(250);
  const longFit = await pg.evaluate(() => { const cur = document.querySelector('.mline.cur'); const wrap = document.querySelector('.mwrap'); return { h: wrap.offsetHeight, ch: cur.clientHeight, w: wrap.scrollWidth, cw: cur.clientWidth, fs: getComputedStyle(cur).fontSize }; });
  ok(longFit.h <= longFit.ch + 1 && longFit.w <= longFit.cw + 1, `${dev.name} · Marcar: una frase muy larga también cabe (letra ${longFit.fs}, ${longFit.h}/${longFit.ch} px)`);
  await ctx.close();
}

console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
