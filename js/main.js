// Punto de entrada. Si la página trae un payload es la versión final (solo reproduce);
// si no, es el estudio donde se arma.
import { bootPlayer } from './player-bootstrap.js';
import { loadFonts } from './fonts.js';
import { App } from './studio.js';

const $ = (id) => document.getElementById(id);

async function bootStudio() {
  const fontsReady = loadFonts();
  const app = new App($('app'), $('audio'), $('audioFull'));
  window.__app = app;
  let restored = false;
  try {
    restored = await app.restoreLast();
  } catch (e) {}
  if (!restored) app.refreshAudio();
  await fontsReady;
  if (app.destroyed) return;
  app.scene.typo.fm = {};
  app.scene.resize();
  document.documentElement.classList.add('ready');
}

async function boot() {
  let payload = null;
  try {
    payload = JSON.parse($('payload').textContent);
  } catch (e) {}
  if (payload && payload.sync) await bootPlayer(payload);
  else await bootStudio();
}
boot();
