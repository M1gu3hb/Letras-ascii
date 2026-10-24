// Panel «Aspecto del ASCII» (Estilo): controles, efecto real en el escenario, guardado, reinicio y exportación.
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
const LINES = ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar', 'cierre de la prueba'].join('\n');
const DEV = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desk: { viewport: { width: 1440, height: 900 } },
};
const setRange = (pg, label, v) =>
  pg.evaluate(
    ([label, v]) => {
      const el = [...document.querySelectorAll('.panel input[type=range]')].find((x) => x.getAttribute('aria-label') === label);
      if (!el) return false;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    [label, v],
  );
const inkOf = (pg) =>
  pg.evaluate(() => {
    const w = window.__app.scene.tl.units[0].words[0];
    let s = 0;
    for (let i = 0; i < w.cov0.length; i++) s += w.cov0[i];
    return Math.round(s);
  });

for (const [name, cfg] of Object.entries(DEV)) {
  console.log('\n── ' + name + ' ──');
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
  await pg.click('#tab-style');
  await pg.waitForTimeout(700);

  const cols0init = await pg.evaluate(() => window.__app.scene.r.grid.cols);
  // 0. con la letra marcada, en «Estilo» el escenario se repite solo (sin sonido) para ver cada cambio
  const pk = await pg.evaluate(() => {
    const a = window.__app;
    return { kind: a.kind, demo: a.player.demo, from: a.player.demoFrom, dur: a.player.demoDur, first: a.scene.tl.first, state: a.player.state };
  });
  ok(pk.kind === 'real' && !pk.demo && pk.state === 'paused', `${name}: en «Estilo» con la letra marcada la vista previa respeta la pausa (${JSON.stringify(pk)})`);
  ok(pk.from >= 0 && Math.abs(pk.from - Math.max(0, pk.first - 1)) < 0.01, `${name}: la vuelta empieza justo antes de la primera frase (${pk.from.toFixed(2)} s; primera frase ${pk.first.toFixed(2)} s)`);
  const tA = await pg.evaluate(() => window.__app.scene.R.t);
  await pg.waitForTimeout(500);
  const tB = await pg.evaluate(() => window.__app.scene.R.t);
  ok(tA === tB, `${name}: el tiempo del escenario permanece pausado (${tA.toFixed(2)} → ${tB.toFixed(2)})`);

  // 1. el grupo está y es claro
  const g = await pg.evaluate(() => {
    const grp = [...document.querySelectorAll('.grp')].find((x) => x.querySelector('summary').textContent === 'Aspecto del ASCII');
    if (!grp) return null;
    const labs = [...grp.querySelectorAll('.lab')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    return { labs, open: grp.open, h: grp.getBoundingClientRect().height };
  });
  ok(!!g && g.open, `${name}: el grupo «Aspecto del ASCII» está y abierto`);
  ok(g && g.labs.length >= 8, `${name}: 8 controles (${g && g.labs.map((x) => x.split(' ').slice(0, 3).join(' ')).join(' | ')})`);
  const ov = await pg.evaluate(() => {
    const p = document.querySelector('.panel');
    return { sw: p.scrollWidth, cw: p.clientWidth, doc: document.documentElement.scrollWidth, vw: window.innerWidth };
  });
  ok(ov.sw <= ov.cw + 1 && ov.doc <= ov.vw + 1, `${name}: sin desborde horizontal (panel ${ov.sw}/${ov.cw}, página ${ov.doc}/${ov.vw})`);
  await pg.evaluate(() => {
    const grp = [...document.querySelectorAll('.grp')].find((x) => x.querySelector('summary').textContent === 'Aspecto del ASCII');
    grp.scrollIntoView({ block: 'start' });
  });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: `test/audit/${name}-ascii-1.png` });

  // 1b. ajustes rápidos
  const presetOn = () => pg.evaluate(() => [...document.querySelectorAll('.seg[aria-label="Ajustes rápidos del ASCII"] .segb.on')].map((x) => x.textContent));
  ok(JSON.stringify(await presetOn()) === '["Normal"]', `${name}: al empezar el ajuste rápido activo es «Normal» (${JSON.stringify(await presetOn())})`);
  await pg.click('.seg[aria-label="Ajustes rápidos del ASCII"] .segb:has-text("Fino")');
  await pg.waitForTimeout(500);
  let pr = await pg.evaluate(() => {
    const s = window.__app.project.style;
    const sl = (l) => [...document.querySelectorAll('.panel input[type=range]')].find((x) => x.getAttribute('aria-label') === l).value;
    return { thick: s.thick, detail: s.detail, track: s.track, uiThick: +sl('Grosor de las letras'), uiDetail: +sl('Detalle de la rejilla'), cols: window.__app.scene.r.grid.cols };
  });
  ok(pr.thick === -0.35 && pr.detail === 1.3 && pr.track === 0.02 && pr.uiThick === -0.35 && pr.uiDetail === 1.3, `${name}: «Fino» aplica y mueve los controles (${JSON.stringify(pr)})`);
  ok(JSON.stringify(await presetOn()) === '["Fino"]', `${name}: queda marcado «Fino»`);
  await setRange(pg, 'Grosor de las letras', 0.2);
  ok((await presetOn()).length === 0, `${name}: al mover un control a mano ya no hay ajuste rápido marcado`);
  for (const label of ['Grueso', 'Contorno', 'Retro']) {
    await pg.click(`.seg[aria-label="Ajustes rápidos del ASCII"] .segb:has-text("${label}")`);
    await pg.waitForTimeout(450);
    const q = await pg.evaluate(() => ({ s: { ...window.__app.project.style }, bold: window.__app.scene.r.bold, fill: window.__app.scene.r.fillCode, cols: window.__app.scene.r.grid.cols }));
    ok(JSON.stringify(await presetOn()) === `["${label}"]`, `${name}: «${label}» queda marcado (thick ${q.s.thick}, detalle ${q.s.detail}, negrita ${q.bold}, relleno ${String.fromCharCode(q.fill)}, ${q.cols} cols)`);
  }
  await pg.screenshot({ path: `test/audit/${name}-ascii-presets.png` });
  await pg.click('.seg[aria-label="Ajustes rápidos del ASCII"] .segb:has-text("Normal")');
  await pg.waitForTimeout(450);
  pr = await pg.evaluate(() => ({ ...window.__app.project.style, bold: window.__app.scene.r.bold, cols: window.__app.scene.r.grid.cols }));
  ok(pr.thick === 0 && pr.detail === 1 && pr.weight === 'normal' && pr.fillch === '@' && pr.glow === 1 && !pr.bold && pr.cols === cols0init, `${name}: «Normal» deja el aspecto de siempre (${pr.cols} cols)`);

  // 2. grosor: más tinta / menos tinta, se guarda en el proyecto
  const ink0 = await inkOf(pg);
  ok(await setRange(pg, 'Grosor de las letras', 0.6), `${name}: existe el control de grosor`);
  await pg.waitForTimeout(500);
  const inkP = await inkOf(pg);
  ok(inkP > ink0 * 1.1, `${name}: grosor +60% engorda (tinta ${ink0} → ${inkP})`);
  ok((await pg.evaluate(() => window.__app.project.style.thick)) === 0.6, `${name}: el grosor queda en el proyecto`);
  await setRange(pg, 'Grosor de las letras', -0.6);
  await pg.waitForTimeout(500);
  const inkM = await inkOf(pg);
  ok(inkM < ink0 * 0.9, `${name}: grosor -60% afina (tinta ${ink0} → ${inkM})`);
  await pg.screenshot({ path: `test/audit/${name}-ascii-thin.png` });

  // 3. arrastrando se reconstruye varias veces pero no en cada evento
  await setRange(pg, 'Grosor de las letras', 0);
  await pg.waitForTimeout(400);
  const rb = await pg.evaluate(async () => {
    const a = window.__app;
    let n = 0;
    const orig = a.scene.setData.bind(a.scene);
    a.scene.setData = (m) => {
      n++;
      return orig(m);
    };
    const el = [...document.querySelectorAll('.panel input[type=range]')].find((x) => x.getAttribute('aria-label') === 'Grosor de las letras');
    for (let i = 0; i <= 20; i++) {
      el.value = -1 + i * 0.1;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 16));
    }
    await new Promise((r) => setTimeout(r, 400));
    a.scene.setData = orig;
    return n;
  });
  ok(rb >= 2 && rb <= 6, `${name}: arrastrar el grosor reconstruye ${rb} veces (no en cada evento, y al soltar queda al día)`);
  const endVal = await pg.evaluate(() => window.__app.project.style.thick);
  ok(Math.abs(endVal - 1) < 0.001, `${name}: el último valor (${endVal}) es el que queda`);
  await setRange(pg, 'Grosor de las letras', 0);
  await pg.waitForTimeout(400);

  // 4. detalle de la rejilla
  const cols0 = await pg.evaluate(() => ({ c: window.__app.scene.r.grid.cols, r: window.__app.scene.r.grid.rows }));
  await setRange(pg, 'Detalle de la rejilla', 1.5);
  await pg.waitForTimeout(500);
  const cols1 = await pg.evaluate(() => ({ c: window.__app.scene.r.grid.cols, r: window.__app.scene.r.grid.rows, cw: window.__app.scene.r.cellW }));
  ok(cols1.c > cols0.c && cols1.c * cols1.r <= 30500, `${name}: más detalle = más columnas (${cols0.c}×${cols0.r} → ${cols1.c}×${cols1.r}, celda ${cols1.cw.toFixed(2)} px)`);
  await pg.screenshot({ path: `test/audit/${name}-ascii-fine.png` });
  await setRange(pg, 'Detalle de la rejilla', 0.7);
  await pg.waitForTimeout(500);
  const cols2 = await pg.evaluate(() => ({ c: window.__app.scene.r.grid.cols, r: window.__app.scene.r.grid.rows }));
  ok(cols2.c < cols0.c || cols0.c === 72, `${name}: menos detalle = menos columnas (${cols0.c} → ${cols2.c})`);
  await setRange(pg, 'Detalle de la rejilla', 1);
  await pg.waitForTimeout(500);
  const cols3 = await pg.evaluate(() => ({ c: window.__app.scene.r.grid.cols, r: window.__app.scene.r.grid.rows }));
  ok(cols3.c === cols0.c && cols3.r === cols0.r, `${name}: detalle normal vuelve a la rejilla de siempre (${cols3.c}×${cols3.r})`);

  // 5. negrita, relleno, halo, intensidad (en vivo)
  await pg.click('.panel .seg[aria-label="Peso de los caracteres"] .segb:nth-child(2)');
  let r = await pg.evaluate(() => ({ bold: window.__app.scene.r.bold, w: window.__app.project.style.weight }));
  ok(r.bold && r.w === 'bold', `${name}: negrita activada (${JSON.stringify(r)})`);
  await pg.click('.panel .seg[aria-label="Carácter de relleno"] .segb[data-v="#"]');
  r = await pg.evaluate(() => ({ f: window.__app.scene.r.fillCode, s: window.__app.project.style.fillch }));
  ok(r.f === 35 && r.s === '#', `${name}: relleno con # (${JSON.stringify(r)})`);
  await setRange(pg, 'Halo alrededor de las letras', 0);
  r = await pg.evaluate(() => window.__app.scene.glow);
  ok(r === 0, `${name}: sin halo`);
  await setRange(pg, 'Intensidad del color', 1.3);
  r = await pg.evaluate(() => window.__app.scene.r.gain);
  ok(Math.abs(r - 1.3) < 0.001, `${name}: intensidad 130% (${r})`);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: `test/audit/${name}-ascii-misc.png` });
  const bold = await pg.evaluate(() => {
    const a = window.__app;
    a.player.pause();
    a.scene.render(2.0, 'song');
    return a.scene.r.ctx.font;
  });
  ok(/^bold /.test(bold), `${name}: el canvas dibuja con peso 700 (${bold.slice(0, 40)})`);

  // 6. se guardan y vuelven al recargar
  await pg.waitForTimeout(1200);
  await pg.reload();
  await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await pg.waitForTimeout(1500);
  const st = await pg.evaluate(() => {
    const s = window.__app.project.style;
    return { weight: s.weight, fillch: s.fillch, glow: s.glow, bright: s.bright, text: window.__app.project.text.slice(0, 4) };
  });
  ok(st.weight === 'bold' && st.fillch === '#' && st.glow === 0 && Math.abs(st.bright - 1.3) < 0.001, `${name}: tras recargar siguen ${JSON.stringify(st)}`);

  // 6b. en otras pestañas no se repite; con ▶ suena de verdad
  await pg.click('#tab-words');
  await pg.waitForTimeout(400);
  let dm = await pg.evaluate(() => window.__app.player.demo);
  ok(dm === false, `${name}: en «Palabras» la vista previa no se repite sola`);
  await pg.click('#tab-style');
  await pg.waitForTimeout(400);
  dm = await pg.evaluate(() => window.__app.player.demo);
  ok(dm === false, `${name}: al volver a «Estilo» conserva la pausa`);
  await pg.click('.tbtn.play');
  await pg.waitForTimeout(400);
  dm = await pg.evaluate(() => ({ demo: window.__app.player.demo, st: window.__app.player.state }));
  ok(dm.demo === false && dm.st === 'playing', `${name}: ▶ detiene la repetición y suena de verdad (${JSON.stringify(dm)})`);
  await pg.click('.tbtn.play');
  await pg.waitForTimeout(300);

  // 7. restablecer aspecto
  await pg.click('#tab-style');
  await pg.waitForTimeout(500);
  await pg.evaluate(() => [...document.querySelectorAll('.panel button')].find((x) => x.textContent === 'Restablecer aspecto').click());
  await pg.waitForTimeout(600);
  const rs = await pg.evaluate(() => {
    const s = window.__app.project.style;
    const r = window.__app.scene.r;
    return { thick: s.thick, detail: s.detail, weight: s.weight, fillch: s.fillch, glow: s.glow, bright: s.bright, bold: r.bold, fill: r.fillCode, gain: r.gain, glowScene: window.__app.scene.glow, faces: s.faces.length };
  });
  ok(rs.thick === 0 && rs.detail === 1 && rs.weight === 'normal' && rs.fillch === '@' && rs.glow === 1 && rs.bright === 1 && !rs.bold && rs.fill === 64 && rs.gain === 1 && rs.glowScene === 1, `${name}: «Restablecer aspecto» deja todo como siempre ${JSON.stringify(rs)}`);
  ok(rs.faces === 8, `${name}: y no toca lo demás (tipografías: ${rs.faces})`);
  await ctx.close();
}
console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
