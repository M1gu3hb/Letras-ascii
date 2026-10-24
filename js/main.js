// Punto de entrada. Si la página trae un payload es la versión final (solo reproduce);
// si no, es el estudio donde se arma.
import { Scene } from './scene.js';
import { Player } from './player.js';
import { modelOf } from './project.js';
import { App } from './studio.js';

const $ = (id) => document.getElementById(id);
const FONTS = ['800 48px Nunito', '900 48px Nunito', 'italic 900 48px "Playfair Display"', '400 48px Pacifico', '400 48px Anton', '700 48px Caveat', '900 48px Unbounded', '900 48px Cinzel', '400 14px "JetBrains Mono"', '700 14px "JetBrains Mono"'];
const loadFonts = () => Promise.all(FONTS.map((f) => document.fonts.load(f, 'AaEeOoÁñ¿¡'))).catch(() => {});

function b64ToBytes(b64) {
  const bin = atob(b64.trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function bootPlayer(payload) {
  const root = $('app');
  root.className = 'fullstage';
  const canvas = document.createElement('canvas');
  canvas.id = 'c';
  root.replaceChildren(canvas);
  document.title = payload.title || 'para ti';
  await loadFonts();
  const audio = $('audio');
  const mime = (payload.audio && payload.audio.mime) || 'audio/wav';
  const url = URL.createObjectURL(new Blob([b64ToBytes($('audio-b64').textContent)], { type: mime }));
  const scene = new Scene(canvas);
  const e = payload.energy;
  scene.setEnergy({ fps: e.fps, low: b64ToBytes(e.low), mid: b64ToBytes(e.mid), hi: b64ToBytes(e.hi), hit: b64ToBytes(e.hit) }, 0);
  const model = modelOf({ text: payload.text, sync: payload.sync, style: payload.style, over: payload.over, seed: payload.seed, intro: payload.intro, outro: payload.outro, offset: payload.offset, clip: { start: 0, end: payload.dur } }, { start: 0, end: payload.dur });
  scene.hint = true;
  scene.setData(model);
  const player = new Player(scene, audio, canvas, 'player');
  player.setSource(url, payload.dur);
  player.setState('intro');
  canvas.addEventListener('pointerdown', (ev) => scene.poke(ev.clientX, ev.clientY, 'tap'));
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'mouse' || ev.buttons) scene.poke(ev.clientX, ev.clientY, 'move');
  });
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => scene.resize(), 220);
  });
  window.__player = player;
  window.__scene = scene;
  document.documentElement.classList.add('ready');
}

async function bootStudio() {
  await loadFonts();
  const app = new App($('app'), $('audio'), $('audioFull'));
  window.__app = app;
  let restored = false;
  try {
    restored = await app.restoreLast();
  } catch (e) {}
  if (!restored) app.refreshAudio();
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
