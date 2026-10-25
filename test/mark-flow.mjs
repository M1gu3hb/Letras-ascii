// Paso 3 (Marcar), de punta a punta: lo que pidió Miguel, convertido en pruebas.
//   · la cuenta 3-2-1 SIEMPRE arranca la canción desde el principio del tramo (aunque hubiera marcas viejas o la barra estuviera en otro lado)
//   · cada marca cae donde sonaba la canción en el instante del toque (también si el teléfono tardó en atenderlo)
//   · al marcar la última frase NO vuelve a salir «empezar»: los toques de reflejo no hacen nada y los botones esperan un momento
//   · pausa, fin del tramo, respaldo («Recuperar»), vista previa y «Siguiente»
// Solo texto de prueba inventado y audio sintético (test/media/kick120.wav).
import { serve, launch, watch } from './lib.mjs';
import {openMarkOptions} from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FALLA') + ' ' + m);
  if (!c) fails++;
};
const LINES = ['luna pequeña de papel', 'hoooola mundo azul', 'una frase para probar con palabras largas', 'otra línea más larga para ver cómo se acomoda', 'cierre', 'sol de medianoche brilla'].join('\n');
const N = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(cfg) {
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
    a.projectChanged();
    a.emit('reset');
  }, LINES);
  await pg.click('#tab-mark');
  await pg.waitForTimeout(300);
  return { ctx, pg };
}
const phase = (pg) => pg.evaluate(() => window.__app.panels.mark.phase);
const waitPhase = (pg, ph, ms = 9000) => pg.waitForFunction((p) => window.__app.panels.mark.phase === p, ph, { timeout: ms });
const nMarks = (pg) => pg.evaluate(() => window.__app.project.sync.filter(Boolean).length);
const audioNow = (pg) => pg.evaluate(() => window.__app.player.audio.currentTime);
const visible = (pg, sel) => pg.locator(sel).first().isVisible();
const txt = async (pg, sel) => ((await pg.locator(sel).first().textContent()) || '').trim();
const waiting = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); return !!e && e.classList.contains('wait'); }, sel);

// toque (o «mantener») dentro de la página, para medir contra el reloj del audio sin la demora de Playwright.
// late: milisegundos que el hilo principal se queda «ocupado» entre crear el evento y entregarlo (un teléfono dibujando).
// Devuelve el segundo de la CANCIÓN que tenía el audio al crearse el evento y lo que quedó marcado.
const PAGE_TAP = async ({ hold, late }) => {
  const a = window.__app;
  const pad = document.querySelector('.pad');
  const start = a.clip().start;
  const mk = (type) => new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, bubbles: true, cancelable: true });
  const macro = () => new Promise((r) => setTimeout(r, 0));
  const down = mk('pointerdown');
  const ref = start + a.player.audio.currentTime;
  if (late) {
    // un teléfono ocupado: el toque ya ocurrió, pero otra tarea (dibujar, guardar…) tiene el hilo y el toque se atiende DESPUÉS
    await macro();
    const t0 = performance.now();
    while (performance.now() - t0 < late) {
      /* ocupado */
    }
    await macro();
  }
  pad.dispatchEvent(down);
  let refUp = null;
  if (hold != null) {
    await new Promise((r) => setTimeout(r, hold));
    const up = mk('pointerup');
    refUp = start + a.player.audio.currentTime;
    pad.dispatchEvent(up);
  }
  return { ref, refUp };
};
const tap = (pg, o = {}) => pg.evaluate(PAGE_TAP, { hold: o.hold ?? null, late: o.late ?? 0 });

// ═════════ PC (ratón + teclado) ═════════
{
  const { ctx, pg } = await open({ viewport: { width: 1440, height: 900 } });

  // ── 0. antes de empezar: no existe el botón grande, así que un toque de más no marca ni reinicia nada
  ok((await phase(pg)) === 'idle', 'inicio: la pantalla está «sin empezar»');
  ok(!(await visible(pg, '.pad')), 'inicio: el botón grande NO existe todavía (nada que tocar por error)');
  ok((await txt(pg, '.mcard.idle .btn.primary')).includes('Empezar a marcar'), 'inicio: el botón principal dice «Empezar a marcar»');
  ok((await txt(pg, '.mstat')).includes(`${N} frases`), 'inicio: arriba dice cuántas frases hay (' + (await txt(pg, '.mstat')) + ')');

  // ── 1. marcas viejas y la barra en otro lado: empezar de cero SIEMPRE es desde el principio del tramo
  await pg.evaluate(() => {
    const a = window.__app;
    a.project.sync = [{ t: 5 }, { t: 8.2 }];
    a.projectChanged();
    a.emit('reset');
    a.player.seek(20);
  });
  await pg.waitForTimeout(200);
  ok((await txt(pg, '.mcard.idle .btn.primary')).includes('Seguir con la frase 3'), 'con 2 frases ya marcadas, el botón principal es «Seguir con la frase 3»');
  ok(await visible(pg, '.mcard.idle .btn.alt'), '…y aparece «Empezar de cero»');
  await openMarkOptions(pg);
  await pg.click('.mcard.idle .segb:text-is("Solo frases")');
  const t0 = Date.now();
  await pg.click('.mcard.idle .btn.alt');
  const seen = [];
  let playAt = null;
  let during = null;
  while (Date.now() - t0 < 4200) {
    const n = await pg.evaluate(() => { const e = document.querySelector('.mcard.count .cnum'); return e && !e.closest('[hidden]') ? e.textContent : null; });
    if (n && seen[seen.length - 1] !== n) seen.push(n);
    if (n === '2' && !during) during = await pg.evaluate(() => ({ st: window.__app.player.state, t: window.__app.player.t, marks: window.__app.project.sync.filter(Boolean).length, cd: !!document.querySelector('.stagecd:not([hidden])') }));
    if (playAt == null && (await pg.evaluate(() => window.__app.player.state)) === 'playing') {
      playAt = Date.now() - t0;
      break;
    }
    await pg.waitForTimeout(40);
  }
  ok(seen.join(',') === '3,2,1', 'la cuenta muestra 3, 2, 1 → ' + seen.join(','));
  ok(playAt != null && playAt > 2300 && playAt < 3500, 'la canción arranca al terminar la cuenta (' + playAt + ' ms)');
  ok(during && during.st !== 'playing' && during.t < 0.05, 'durante la cuenta la canción espera en el segundo 0 (estado ' + (during && during.st) + ', t=' + (during && during.t.toFixed(2)) + ')');
  ok(during && during.marks === 2, 'durante la cuenta lo marcado antes NO se borra (si cancelas, no pierdes nada)');
  ok(during && during.cd, 'la cuenta también se ve grande sobre el escenario');
  const at0 = await audioNow(pg);
  ok(at0 < 0.6, 'la canción suena DESDE EL PRINCIPIO del tramo (currentTime=' + at0.toFixed(2) + ' s, antes la barra estaba en 20 s)');
  ok((await phase(pg)) === 'run', 'después de la cuenta se está marcando');
  ok((await nMarks(pg)) === 0, 'al sonar, lo anterior se quitó (quedó respaldado)');
  ok(await visible(pg, '.pad'), 'ahora SÍ aparece el botón grande');
  ok((await txt(pg, '.pad .padtxt')) === 'Marcar frase', 'en «Solo frases» el botón dice «Toca»');
  ok((await txt(pg, '.mstat')) === `Frase 1 de ${N}`, 'arriba dice «Frase 1 de ' + N + '»');
  ok((await txt(pg, '.mline.cur')).startsWith('luna'), 'arriba va la frase que sigues');

  // ── 2. cada marca cae donde sonaba la canción
  await pg.waitForTimeout(500);
  const errsMs = [];
  const r1 = await tap(pg, { hold: 40 });
  await pg.waitForTimeout(450);
  const r2 = await tap(pg, { hold: 40, late: 250 }); // el teléfono se tardó 250 ms en atender el toque
  await pg.waitForTimeout(450);
  const r3 = await tap(pg, { hold: 40 });
  const sync = await pg.evaluate(() => window.__app.project.sync.map((s) => (s ? s.t : null)));
  [r1, r2, r3].forEach((r, i) => errsMs.push(Math.round((sync[i] - r.ref) * 1000)));
  ok(sync.length === 3 && sync.every(Number.isFinite), 'las 3 frases quedaron marcadas (' + sync.length + ')');
  ok(Math.abs(errsMs[0]) < 130 && Math.abs(errsMs[2]) < 130, 'toque normal: la marca cae donde sonaba (error ' + errsMs[0] + ' y ' + errsMs[2] + ' ms)');
  ok(Math.abs(errsMs[1]) < 130, 'toque que el teléfono tardó 250 ms en atender: la marca NO se corre (error ' + errsMs[1] + ' ms; sin corrección serían ~250)');
  ok(sync[0] < sync[1] && sync[1] < sync[2], 'las marcas van en orden');

  // doble toque sin querer: se ignora
  await pg.waitForTimeout(450);
  await tap(pg, { hold: 20 });
  await tap(pg, { hold: 20 }); // inmediatamente después
  ok((await nMarks(pg)) === 4, 'un doble toque seguido cuenta como UNA marca (' + (await nMarks(pg)) + ')');

  // ratón de verdad sobre el botón grande
  const bb = await pg.locator('.pad').boundingBox();
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;
  await pg.waitForTimeout(450);
  await pg.mouse.move(cx, cy);
  await pg.mouse.down();
  await pg.waitForTimeout(60);
  ok(await pg.evaluate(() => document.querySelector('.pad').classList.contains('down')), 'el botón grande se ve presionado mientras lo tocas');
  await pg.mouse.up();
  ok((await nMarks(pg)) === 5, 'ratón: la quinta frase quedó marcada');

  // ── 3. la última frase: lo que más molestaba
  await pg.waitForTimeout(450);
  await pg.mouse.move(cx, cy);
  await pg.mouse.down();
  await pg.waitForTimeout(50);
  await pg.mouse.up();
  const tLast = Date.now();
  // reflejos: sigue tocando donde estaba el botón grande, ~1.2 s, como cuando vas rápido en el teléfono
  const trace = [];
  for (let i = 0; i < 10; i++) {
    await pg.mouse.click(cx, cy);
    trace.push(await pg.evaluate(() => { const m = window.__app.panels.mark; return { ph: m.phase, cd: !!m.cd, st: window.__app.player.state, th: window.__app.theaterOn, tab: window.__app.tab }; }));
    await pg.waitForTimeout(95);
  }
  const lapse = Date.now() - tLast;
  ok(trace.every((x) => x.ph === 'done'), 'tras la última frase la pantalla se queda en «¿Quedó bien?» aunque sigas tocando (' + lapse + ' ms de toques)');
  ok(trace.every((x) => !x.cd), 'ningún toque de reflejo empezó otra cuenta regresiva');
  ok(trace.every((x) => x.tab === 'mark' && !x.th), 'ningún toque de reflejo abrió la vista previa ni cambió de paso');
  ok(trace.slice(6).every((x) => x.st !== 'playing'), 'la canción ya no suena (se apagó suave) y no volvió a empezar');
  ok(await waiting(pg, '.mcard.done .btn.primary'), 'los botones esperan un momento (se ven apagados)');
  ok((await nMarks(pg)) === N, 'siguen las ' + N + ' frases marcadas');
  ok((await txt(pg, '.mcard.done .mtitle')).includes('¡Listo!'), 'dice «¡Listo! Marcaste las ' + N + ' frases» (' + (await txt(pg, '.mcard.done .mtitle')) + ')');
  ok((await txt(pg, '.mcard.done .mask')).includes('¿Quedó bien?'), 'pregunta «¿Quedó bien?»');
  ok((await txt(pg, '.mcard.done .btn.primary')).includes('Ver vista previa') && (await txt(pg, '.mcard.done .btn.alt')).includes('Siguiente'), 'ofrece «Ver vista previa» y «Siguiente»');
  const left = 1750 - (Date.now() - tLast);
  if (left > 0) await pg.waitForTimeout(left);
  ok(!(await waiting(pg, '.mcard.done .btn.primary')), 'pasado el momento de espera, los botones se pueden tocar');
  ok(!(await visible(pg, '.pad')), 'el botón grande ya no existe en «¿Quedó bien?»');

  // ── 4. «Marcar otra vez» → cancelar la cuenta no pierde lo marcado
  await pg.click('.mcard.done .btn:has-text("Marcar otra vez")');
  await pg.waitForTimeout(700);
  ok((await phase(pg)) === 'count', '«Marcar otra vez» empieza la cuenta');
  ok((await nMarks(pg)) === N, 'durante la cuenta los tiempos siguen ahí');
  await pg.click('.mcard.count .btn');
  await pg.waitForTimeout(300);
  ok((await phase(pg)) === 'done' && (await nMarks(pg)) === N, 'cancelar la cuenta regresa a «¿Quedó bien?» con todo intacto');
  await pg.waitForTimeout(3300);
  ok((await pg.evaluate(() => window.__app.player.state)) !== 'playing', 'cancelar la cuenta: la canción no arranca');

  // ── 5. «Marcar otra vez» de verdad → respaldo y «Recuperar»
  await pg.click('.mcard.done .btn:has-text("Marcar otra vez")');
  await waitPhase(pg, 'run', 6000);
  ok((await nMarks(pg)) === 0 && (await audioNow(pg)) < 0.6, 'otra vuelta: empieza de cero y desde el segundo 0');
  await pg.waitForTimeout(600);
  await pg.keyboard.press('Escape');
  await waitPhase(pg, 'pause', 2000);
  ok(!(await visible(pg, '.pad')), 'en pausa tampoco existe el botón grande');
  ok(await visible(pg, '.mcard.pause .mrestore'), 'en pausa se ofrece «Recuperar los tiempos anteriores»');
  await pg.waitForTimeout(700);
  await pg.click('.mcard.pause .mrestore');
  await pg.waitForTimeout(200);
  ok((await nMarks(pg)) === N && (await phase(pg)) === 'done', 'recuperar devuelve las ' + N + ' frases y la pantalla «¿Quedó bien?»');

  // ── 6. vista previa y «Siguiente»
  await pg.waitForTimeout(1800);
  await pg.click('.mcard.done .btn.primary');
  await pg.waitForTimeout(900);
  const pv = await pg.evaluate(() => ({ th: window.__app.theaterOn, st: window.__app.player.state, t: window.__app.player.t }));
  ok(pv.th && pv.st === 'playing' && pv.t < 2.5, 'ver vista previa: pantalla completa, suena desde el principio (t=' + pv.t.toFixed(2) + ')');
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(500);
  const pv2 = await pg.evaluate(() => ({ th: window.__app.theaterOn, st: window.__app.player.state, t: window.__app.player.t, ph: window.__app.panels.mark.phase }));
  ok(!pv2.th && pv2.st !== 'playing' && pv2.t < 0.3 && pv2.ph === 'done', 'al cerrar la vista previa: se detiene, vuelve al principio y a «¿Quedó bien?»');
  await pg.click('.mcard.done .btn.alt');
  await pg.waitForTimeout(400);
  ok((await pg.evaluate(() => window.__app.tab)) === 'style', '«Siguiente» lleva al paso de Estilo');
  await ctx.close();
}

// ═════════ PC: palabra por palabra, deshacer, saltar, pausa, teclado ═════════
{
  const { ctx, pg } = await open({ viewport: { width: 1440, height: 900 } });
  await openMarkOptions(pg);
  await pg.click('.mcard.idle .mopts .switch'); // cuenta apagada: arranca en seguida
  ok((await pg.evaluate(() => window.__app.panels.mark.countOn)) === false, 'cuenta regresiva apagada desde la tarjeta');
  await openMarkOptions(pg);
  await pg.click('.mcard.idle .segb:text-is("Palabra por palabra")');
  await pg.click('.mcard.idle .btn.primary');
  await pg.waitForTimeout(500);
  ok((await phase(pg)) === 'run' && (await pg.evaluate(() => window.__app.player.state)) === 'playing', 'con la cuenta apagada la canción suena en seguida');
  ok((await txt(pg, '.pad .padtxt')) === 'Marcar palabra', 'en «Palabra por palabra» el botón dice «Mantén»');
  ok((await pg.locator('.mline.cur .mw').count()) === 4, 'arriba se ven las 4 palabras de la frase');
  ok(await pg.evaluate(() => document.querySelector('.mline.cur .mw').classList.contains('now')), 'la palabra que sigue está resaltada');
  const w = [];
  for (let k = 0; k < 4; k++) {
    w.push(await tap(pg, { hold: 250 }));
    await pg.waitForTimeout(140);
  }
  const s0 = await pg.evaluate(() => window.__app.project.sync[0]);
  ok(s0 && s0.wt && s0.wt.length === 4 && s0.wd.length === 4, 'la frase guarda el inicio y la duración de sus 4 palabras');
  ok(s0 && s0.wt.every((t, i) => i === 0 || t > s0.wt[i - 1]) && s0.t === s0.wt[0], 'los inicios van en orden y la frase empieza con su primera palabra');
  ok(s0 && s0.wd.every((d) => d > 0.12 && d < 0.45), 'duraciones ≈ lo que se mantuvo presionado: ' + (s0 && s0.wd.join(', ')));
  ok(s0 && s0.wt.every((t, i) => Math.abs(t - w[i].ref) < 0.13), 'cada palabra empieza donde sonaba la canción (errores ' + (s0 && s0.wt.map((t, i) => Math.round((t - w[i].ref) * 1000)).join(', ')) + ' ms)');
  ok((await txt(pg, '.mline.cur')).startsWith('hoooola'), 'ya va la siguiente frase');

  // deshacer a media frase: se quita la palabra, la canción regresa y SIGUE sonando
  await tap(pg, { hold: 200 });
  const before = await audioNow(pg);
  await pg.click('.mbtns .btn:has-text("Deshacer")');
  await pg.waitForTimeout(200);
  const mk = await pg.evaluate(() => ({ k: window.__app.panels.mark.cur.k, pw: window.__app.panels.mark.pend.wt.length, st: window.__app.player.state }));
  ok(mk.k === 0 && mk.pw === 0 && mk.st === 'playing', 'deshacer: la palabra se quita, la canción sigue sonando');
  ok((await audioNow(pg)) < before + 0.1 && (await audioNow(pg)) >= 0, 'deshacer: la canción regresa unos segundos (' + before.toFixed(1) + ' → ' + (await audioNow(pg)).toFixed(1) + ')');

  // saltar frase
  await pg.click('.mbtns .btn:has-text("Saltar frase")');
  ok((await pg.evaluate(() => window.__app.project.sync[1])) == null && (await pg.evaluate(() => window.__app.panels.mark.cur.p)) === 2, 'saltar frase: la frase queda sin tiempo y sigue la siguiente');

  // pausa con el botón de arriba
  await pg.waitForTimeout(700);
  const at = await audioNow(pg);
  const bounce = await pg.evaluate(() => {
    document.querySelector('.mtopbtn').click();
    const m = window.__app.panels.mark, waiting = m.resumeBtn.classList.contains('wait');
    m.resumeBtn.click();
    return { waiting, phase: m.phase };
  });
  await waitPhase(pg, 'pause', 1500);
  ok((await pg.evaluate(() => window.__app.player.state)) !== 'playing', 'pausa: la canción se detiene');
  ok(!(await visible(pg, '.pad')) && (await txt(pg, '.mcard.pause .mtitle')) === 'En pausa', 'pausa: no hay botón grande y dice «En pausa»');
  ok(bounce.waiting, 'pausa: «Seguir» espera un instante por si el dedo rebota');
  ok(bounce.phase === 'pause', 'pausa: un toque inmediato NO reanuda');
  await pg.waitForTimeout(600);
  ok(!(await waiting(pg, '.mcard.pause .btn.primary')), 'pausa: «Seguir» ya se puede tocar');
  await pg.click('.mcard.pause .btn.primary');
  await pg.waitForTimeout(500);
  const rs = await audioNow(pg);
  ok((await phase(pg)) === 'run' && rs > at - 1.6 && rs < at + 0.2, 'seguir: regresa ~1 s antes de donde pausaste (' + at.toFixed(1) + ' → ' + rs.toFixed(1) + ')');
  ok((await pg.evaluate(() => window.__app.panels.mark.cur.p)) === 2, 'seguir: continúa en la misma frase (la 3)');

  // teclado: la barra espaciadora es el botón grande aunque el foco esté en otro botón
  await pg.focus('.mbtns .btn:has-text("Saltar frase")');
  // (después de seguir, la canción regresó: hay que esperar a que pase por lo que ya estaba marcado)
  await pg.waitForFunction(() => { const m = window.__app.panels.mark; return window.__app.clip().start + window.__app.player.audio.currentTime > m.lastMarkAbs() + 0.2; }, null, { timeout: 8000 });
  await pg.keyboard.down('Space');
  await pg.waitForTimeout(220);
  const heldNow = await pg.evaluate(() => !!window.__app.panels.mark.hold);
  await pg.keyboard.up('Space');
  await pg.waitForTimeout(150);
  ok(heldNow && (await pg.evaluate(() => window.__app.panels.mark.cur.k)) === 1 && (await pg.evaluate(() => window.__app.panels.mark.cur.p)) === 2, 'teclado: Espacio marca la palabra y NO activa «Saltar frase»');
  await pg.keyboard.press('Escape');
  await waitPhase(pg, 'pause', 1500);
  ok(true, 'teclado: Esc pausa');
  await ctx.close();
}

// ═════════ PC: se acaba el tramo antes de marcar todo ═════════
{
  const { ctx, pg } = await open({ viewport: { width: 1440, height: 900 } });
  await pg.evaluate(async () => {
    await window.__app.setClip(0, 3);
  });
  await pg.waitForFunction(() => Math.abs(window.__app.player.dur - 3) < 0.05, null, { timeout: 5000 });
  await pg.evaluate(() => window.__app.emit('reset'));
  await openMarkOptions(pg);
  await pg.click('.mcard.idle .mopts .switch');
  await openMarkOptions(pg);
  await pg.click('.mcard.idle .segb:text-is("Solo frases")');
  await pg.click('.mcard.idle .btn.primary');
  await waitPhase(pg, 'run', 2000);
  await pg.waitForTimeout(800);
  await tap(pg, { hold: 20 });
  // aunque el dedo siga tocando cuando termina el tramo, nada se reinicia
  const t0 = Date.now();
  let seenPause = null;
  while (Date.now() - t0 < 5000) {
    if ((await phase(pg)) === 'pause') {
      seenPause = Date.now() - t0;
      break;
    }
    await pg.waitForTimeout(30);
  }
  ok(seenPause != null, 'al acabarse el tramo la pantalla pasa a «pausa» (' + seenPause + ' ms)');
  ok((await pg.evaluate(() => window.__app.panels.mark.reason)) === 'end' && (await txt(pg, '.mcard.pause .mtitle')) === 'Se acabó el tramo', 'dice «Se acabó el tramo»');
  ok((await txt(pg, '.mcard.pause .mnote')).includes('Faltan 5 frases'), 'explica cuántas faltan (' + (await txt(pg, '.mcard.pause .mnote')) + ')');
  ok(await waiting(pg, '.mcard.pause .btn.primary'), 'los botones esperan (se acabó solo, tú no pausaste)');
  const rt = [];
  const cb = await pg.locator('.mcard.pause').boundingBox();
  for (let i = 0; i < 8; i++) {
    await pg.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
    rt.push(await pg.evaluate(() => ({ ph: window.__app.panels.mark.phase, st: window.__app.player.state })));
    await pg.waitForTimeout(100);
  }
  ok(rt.every((x) => x.ph === 'pause' && x.st !== 'playing'), 'toques de reflejo al acabarse el tramo: no reinician nada');
  await pg.waitForTimeout(1000);
  ok(!(await waiting(pg, '.mcard.pause .btn.primary')), 'pasado el momento, «Seguir» se deja tocar');
  await pg.click('.mcard.pause .btn.primary');
  await pg.waitForTimeout(400);
  ok((await phase(pg)) === 'run', 'seguir después del fin del tramo continúa marcando');
  await ctx.close();
}

// ═════════ teléfono: táctil de verdad ═════════
for (const cfg of [
  { name: '393×736', viewport: { width: 393, height: 736 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
]) {
  const { ctx, pg } = await open({ viewport: cfg.viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const T = cfg.name;
  await openMarkOptions(pg);
  await pg.click('.mcard.idle .segb:text-is("Solo frases")');
  await pg.tap('.mcard.idle .btn.primary');
  await waitPhase(pg, 'run', 6000);
  await pg.waitForTimeout(500);
  const bb0 = await pg.locator('.pad').boundingBox();
  ok(bb0 && bb0.width > cfgW(cfg) * 0.85 && bb0.height > 150, T + ': el botón grande es enorme (' + Math.round(bb0.width) + '×' + Math.round(bb0.height) + ')');
  ok(bb0.y + bb0.height <= cfg.viewport.height + 1 && bb0.x >= 0 && bb0.x + bb0.width <= cfg.viewport.width + 1, T + ': cabe en la pantalla');
  const cdp = await ctx.newCDPSession(pg);
  const cx = bb0.x + bb0.width / 2;
  const cy = bb0.y + bb0.height / 2;
  const moved = [];
  const real = [];
  for (let i = 0; i < 5; i++) {
    const ref = await pg.evaluate(() => window.__app.clip().start + window.__app.player.audio.currentTime);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await pg.waitForTimeout(70);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    real.push(ref);
    await pg.waitForTimeout(420);
    const bb = await pg.locator('.pad').boundingBox().catch(() => null);
    if (bb) moved.push(Math.abs(bb.y - bb0.y) + Math.abs(bb.height - bb0.height));
  }
  const ss = await pg.evaluate(() => window.__app.project.sync.map((s) => (s ? s.t : null)));
  ok(ss.slice(0, 5).every(Number.isFinite), T + ': 5 toques con el dedo = 5 frases marcadas (' + ss.filter(Number.isFinite).length + ')');
  ok(ss.slice(0, 5).every((t, i) => t - real[i] > -0.05 && t - real[i] < 0.35), T + ': las marcas caen cerca del toque (' + ss.slice(0, 5).map((t, i) => Math.round((t - real[i]) * 1000)).join(', ') + ' ms)');
  ok(moved.every((m) => m < 1), T + ': el botón grande no se mueve ni cambia de tamaño entre una marca y otra');
  // la última frase + dedo nervioso
  await pg.waitForTimeout(300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
  await pg.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const tr = [];
  for (let i = 0; i < 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await pg.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    tr.push(await pg.evaluate(() => ({ ph: window.__app.panels.mark.phase, cd: !!window.__app.panels.mark.cd, th: window.__app.theaterOn, tab: window.__app.tab })));
    await pg.waitForTimeout(110);
  }
  ok(tr.every((x) => x.ph === 'done' && !x.cd && !x.th && x.tab === 'mark'), T + ': tras la última frase, 8 toques nerviosos no hacen NADA (se queda en «¿Quedó bien?»)');
  const card = await pg.locator('.mcard.done').boundingBox();
  ok(card && card.y >= 0 && card.y + card.height <= cfg.viewport.height + 1, T + ': la tarjeta «¿Quedó bien?» cabe completa en la pantalla');
  await ctx.close();
}
function cfgW(c) {
  return c.viewport.width;
}

console.log(fails ? `\n${fails} FALLAS` : '\nTodo bien');
console.log('errores de consola:', errs.length ? errs : 'ninguno');
await b.close();
srv.close();
process.exit(fails || errs.length ? 1 : 0);
