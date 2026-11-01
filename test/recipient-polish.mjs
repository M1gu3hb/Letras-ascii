// La página que recibe ella: CSS mínimo (sin el del editor), carga con corazón, aro de foco solo con teclado,
// toque limpio en teléfonos, wake lock, controles del sistema, teclado y reajuste al girar. Solo texto de prueba inventado.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { serve, launch, watch } from './lib.mjs';
import '../scripts/fixtures.mjs';
const folder = 'test/audit/recipient-polish';
mkdirSync(folder, { recursive: true });
const { srv, port } = serve('site'), browser = await launch(), errors = [];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; console.log('ok', message); };
try {
  // exportar desde el editor
  const editor = await browser.newPage({ acceptDownloads: true });
  watch(editor, errors);
  await editor.goto(`http://localhost:${port}`);
  await editor.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await editor.setInputFiles('#songfile', 'test/media/kick120.wav');
  await editor.waitForFunction(() => window.__app.media && !window.__app.loadController);
  await editor.evaluate(() => {
    const a = window.__app;
    a.project.name = 'Para <ti> & "ella"';
    a.project.text = 'Luz contigo\nSiempre cerca';
    a.project.intro = 'para ti';
    a.project.outro = 'con cariño';
    a.project.sync = [{ t: 1 }, { t: 4 }];
    a.projectChanged();
    a.emit('reset');
    a.selectTab('export');
  });
  const downloading = editor.waitForEvent('download');
  await editor.getByRole('button', { name: 'Descargar el HTML', exact: true }).click();
  await (await downloading).saveAs('test/media/recipient-polish.html');
  await editor.close();
  const html = readFileSync('test/media/recipient-polish.html', 'utf8');
  writeFileSync('site/recipient-polish.html', html);
  const head = html.slice(0, html.indexOf('</head>'));
  const css = head.slice(head.indexOf('<style>'));

  // cabecera del archivo exportado
  check(/<meta charset="utf-8">/.test(head) && /viewport-fit=cover/.test(head), 'head: charset and viewport-fit=cover');
  check(/<meta name="theme-color" content="#04050a">/.test(head) && /<meta name="color-scheme" content="dark">/.test(head), 'head: theme-color and color-scheme');
  check(/<meta name="robots" content="noindex, nofollow, noarchive">/.test(head), 'head: robots noindex');
  check(head.includes('<title>Para &lt;ti&gt; &amp; &quot;ella&quot;</title>') && head.includes('property="og:title" content="Para &lt;ti&gt; &amp; &quot;ella&quot;"'), 'head: title and og:title come from the project title, escaped');
  check(/<link rel="icon" href="data:image\/svg\+xml,/.test(head), 'head: inline heart icon, no external request');
  check(!/\.studio\b|\.panel\b|\.tabs\b|\.wave\b/.test(css) && css.replace(/url\(data:[^)]*\)/g, '').length < 6000, 'the export carries player.css (fonts + a few KB), not the editor stylesheet');
  check(html.includes('<script id="payload" type="application/json">') && html.includes('<script id="audio-b64" type="text/plain">'), 'payload and audio-b64 keep their format');

  const wakeStub = () => {
    window.__wl = { requests: 0, releases: 0 };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async (kind) => {
          window.__wl.requests++;
          window.__wl.kind = kind;
          const lock = { release: async () => { window.__wl.releases++; lock.fire?.(); }, addEventListener: (type, fn) => { if (type === 'release') lock.fire = fn; } };
          window.__lock = lock;
          return lock;
        },
      },
    });
  };
  const spyMedia = () => {
    // anota los manejadores que registra la página para poder llamarlos como lo haría la pantalla de bloqueo
    const original = MediaSession.prototype.setActionHandler;
    window.__ms = {};
    MediaSession.prototype.setActionHandler = function (action, fn) { window.__ms[action] = fn; return original.call(this, action, fn); };
  };
  const hold = () => {
    // retiene las tipografías: así se ve la pantalla de carga el tiempo que haga falta
    const real = document.fonts.load.bind(document.fonts);
    window.__queue = [];
    document.fonts.load = (...a) => new Promise((resolve) => window.__queue.push(() => real(...a).then(resolve, resolve)));
    window.__release = () => window.__queue.splice(0).forEach((go) => go());
  };

  // teléfono: carga, aro de foco, toque, controles del sistema, wake lock
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  watch(page, errors);
  await page.addInitScript(wakeStub);
  await page.addInitScript(spyMedia);
  await page.addInitScript(hold);
  await page.goto(`http://localhost:${port}/recipient-polish.html`);
  await page.waitForTimeout(400);
  const first = await page.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    const boot = document.querySelector('.boot');
    return {
      htmlBg: cs(document.documentElement).backgroundColor,
      hasGlow: cs(document.documentElement).backgroundImage.includes('radial-gradient'),
      boot: !!boot && cs(boot).display !== 'none' && cs(boot.querySelector('svg')).animationName !== 'none',
      ready: document.documentElement.classList.contains('ready'),
      canvas: !!document.querySelector('canvas'),
    };
  });
  check(first.htmlBg === 'rgb(4, 5, 10)' && first.hasGlow, 'first paint: near-black background with a royal-blue glow');
  check(first.boot && !first.ready, 'loading: a softly pulsing heart is shown until the scene is ready');
  await page.screenshot({ path: `${folder}/phone-loading.png` });
  await page.evaluate(() => window.__release());
  await page.waitForFunction(() => document.querySelector('#app.fullstage.on'));
  await page.waitForFunction(() => !document.querySelector('.boot'), null, { timeout: 4000 });
  await page.waitForTimeout(900);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('canvas')).opacity === '1' && !document.querySelector('.boot')), 'loading: the canvas fades in fully and the heart leaves the DOM');
  await page.screenshot({ path: `${folder}/phone-intro.png` });

  const touch = await page.evaluate(() => {
    const cv = document.querySelector('canvas'), cs = getComputedStyle(cv), bs = getComputedStyle(document.body), hs = getComputedStyle(document.documentElement);
    return {
      action: cs.touchAction, select: cs.userSelect || cs.webkitUserSelect, overscroll: [hs.overscrollBehaviorY, bs.overscrollBehaviorY], callout: cs.webkitTouchCallout,
      scrollable: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight, overflow: bs.overflow,
    };
  });
  check(touch.action === 'none' && touch.select === 'none' && touch.overscroll.every((v) => v === 'none') && !touch.scrollable && touch.overflow === 'hidden', 'phone: no zoom, selection, callout, overscroll or scroll on the canvas page');

  const meta = await page.evaluate(() => ({ title: navigator.mediaSession?.metadata?.title, art: navigator.mediaSession?.metadata?.artwork?.length, state: navigator.mediaSession?.playbackState }));
  check(meta.title === 'Para <ti> & "ella"' && meta.art === 1, 'media session: lock-screen title and artwork');

  await page.getByRole('button', { name: 'Reproducir', exact: true }).tap();
  await page.waitForFunction(() => window.__player.state === 'playing' && !window.__player.audio.paused);
  await page.waitForFunction(() => window.__wl.requests === 1);
  check(await page.evaluate(() => window.__wl.kind === 'screen' && window.__player.wake === window.__lock && navigator.mediaSession.playbackState === 'playing'), 'wake lock: screen lock requested while playing; media session reports playing');
  const focusAfterTap = await page.evaluate(() => { const cv = document.querySelector('canvas'); return { active: document.activeElement === cv, visible: cv.matches(':focus-visible'), outline: getComputedStyle(cv).outlineStyle }; });
  check(!focusAfterTap.visible && focusAfterTap.outline === 'none', 'focus: a tap leaves no ring around the screen');
  // el navegador suelta el wake lock al ocultar la pestaña; al volver y seguir sonando se pide otra vez
  await page.evaluate(() => {
    window.__lock.released = true;
    window.__lock.fire();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__wl.requests === 2 && window.__player.wake === window.__lock, null, { timeout: 3000 });
  check(true, 'wake lock: requested again when the page becomes visible while still playing');
  // la pantalla de bloqueo pausa y reanuda
  await page.evaluate(() => window.__ms.pause());
  check(await page.evaluate(() => window.__player.state === 'paused' && navigator.mediaSession.playbackState === 'paused'), 'media session: the pause action pauses the player');
  await page.waitForFunction(() => window.__wl.releases >= 1 && !window.__player.wake);
  check(true, 'wake lock: released on pause');
  await page.evaluate(() => window.__ms.play());
  await page.waitForFunction(() => window.__player.state === 'playing' && !window.__player.audio.paused);
  check(await page.evaluate(() => navigator.mediaSession.playbackState === 'playing'), 'media session: the play action resumes the player');
  await page.evaluate(() => window.__player.finish());
  check(await page.evaluate(() => window.__player.state === 'ended' && !window.__player.wake), 'wake lock: still released at the end');

  // giro: la escena se reajusta pronto y solo si el tamaño cambió
  await page.evaluate(() => { window.__fits = 0; const r = window.__scene.resize.bind(window.__scene); window.__scene.resize = () => { window.__fits++; r(); }; });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__scene.r.W === 844 && window.__scene.r.H === 390, null, { timeout: 2000 });
  check(await page.evaluate(() => window.__fits >= 1 && window.__fits <= 2), 'orientation: the scene refits to the new size within a debounce, once');
  await page.evaluate(() => { window.__fits = 0; window.dispatchEvent(new Event('resize')); window.visualViewport.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('orientationchange')); });
  await page.waitForTimeout(700);
  check(await page.evaluate(() => window.__fits === 0), 'orientation: events without a real size change do not rebuild the grid');
  await phone.close();

  // escritorio: teclado y aro de foco
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await desk.newPage();
  watch(dp, errors);
  await dp.goto(`http://localhost:${port}/recipient-polish.html`);
  await dp.waitForFunction(() => document.documentElement.classList.contains('ready'));
  await dp.bringToFront();
  await dp.waitForFunction(() => document.hasFocus());
  check(await dp.evaluate(() => document.activeElement === document.body), 'keyboard: nothing is focused, so the page-level keys must work');
  await dp.keyboard.press('Enter');
  await dp.waitForFunction(() => window.__player.state === 'playing' && !window.__player.audio.paused);
  await dp.keyboard.press('Space');
  check(await dp.evaluate(() => window.__player.state === 'paused'), 'keyboard: Enter starts and Space pauses with focus on the page, not on the canvas');
  await dp.keyboard.down('Enter');
  await dp.keyboard.down('Enter');
  await dp.keyboard.down('Enter');
  await dp.keyboard.up('Enter');
  check(await dp.evaluate(() => window.__player.state === 'playing'), 'keyboard: holding Enter toggles once');
  await dp.keyboard.press('Control+Enter');
  check(await dp.evaluate(() => window.__player.state === 'playing'), 'keyboard: shortcuts with Ctrl are left alone');
  await dp.keyboard.press('Tab');
  const ring = await dp.evaluate(() => { const cv = document.querySelector('canvas'), cs = getComputedStyle(cv); return { on: document.activeElement === cv && cv.matches(':focus-visible'), style: cs.outlineStyle, color: cs.outlineColor, offset: cs.outlineOffset }; });
  check(ring.on && ring.style === 'solid' && /rgba?\(47, 91, 255/.test(ring.color) && parseFloat(ring.offset) < 0, 'focus: keyboard focus draws a subtle royal-blue ring inside the screen');
  await dp.screenshot({ path: `${folder}/desktop-focus.png` });
  await desk.close();

  assert.deepEqual(errors, []);
  console.log(`${checks} recipient polish checks passed (${process.env.PLAYWRIGHT_BROWSER || 'chromium'})`);
} finally {
  await browser.close();
  srv.close();
}
