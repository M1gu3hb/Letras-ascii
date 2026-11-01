import { h, debounce } from './ui.js';
import { Scene } from './scene.js';
import { Player } from './player.js';
import { modelOf } from './project.js';
import { loadFonts } from './fonts.js';
import { retireMediaUrl } from './lifecycle.js';
import { HEART_PATH } from './logo.js';
const $ = (id) => document.getElementById(id);
function b64ToBytes(b64) {
  const bin = atob(b64.trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

// Pantalla de bloqueo / audífonos / carro: título y play/pausa del sistema. Todo opcional: si el navegador no lo tiene, no pasa nada.
function mediaControls(player, title) {
  const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
  if (!ms) return { sync() {}, off() {} };
  const handlers = { play: () => { if (player.state !== 'playing') void player.tap(); }, pause: () => { if (player.state === 'playing') player.pause(); } };
  for (const [action, fn] of Object.entries(handlers)) { try { ms.setActionHandler(action, fn); } catch { /* acción no soportada */ } }
  try { if (typeof MediaMetadata === 'function') ms.metadata = new MediaMetadata({ title, artwork: coverArt() }); } catch { /* sin metadatos */ }
  return {
    sync() { try { ms.playbackState = player.state === 'playing' ? 'playing' : 'paused'; } catch { /* sin estado */ } },
    off() { for (const action of Object.keys(handlers)) { try { ms.setActionHandler(action, null); } catch { /* ya no está */ } } },
  };
}

// carátula de 256 px (corazón azul real sobre noche) para la pantalla de bloqueo; una sola vez, sin archivos externos
function coverArt() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const bg = g.createRadialGradient(128, 118, 8, 128, 128, 190);
    bg.addColorStop(0, '#16214d');
    bg.addColorStop(1, '#04050a');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 256);
    g.translate(48, 50);
    g.scale(6.67, 6.67);
    g.shadowColor = 'rgba(47,91,255,.7)';
    g.shadowBlur = 40;
    g.fillStyle = '#2f5bff';
    g.fill(new Path2D(HEART_PATH));
    return [{ src: c.toDataURL('image/png'), sizes: '256x256', type: 'image/png' }];
  } catch { return []; }
}

export async function bootPlayer(payload) {
  const root = $('app');
  root.className = 'fullstage';
  const canvas = document.createElement('canvas');
  canvas.id = 'c';
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', 'Reproducir');
  canvas.tabIndex = 0;
  root.replaceChildren(canvas);
  document.title = payload.title || 'para ti';
  await loadFonts();
  const audio = $('audio');
  const mime = (payload.audio && payload.audio.mime) || 'audio/wav';
  const url = URL.createObjectURL(new Blob([b64ToBytes($('audio-b64').textContent)], { type: mime }));
  const scene = new Scene(canvas);
  scene.overlays = true;
  const e = payload.energy;
  scene.setEnergy({ fps: e.fps, low: b64ToBytes(e.low), mid: b64ToBytes(e.mid), hi: b64ToBytes(e.hi), hit: b64ToBytes(e.hit) }, 0);
  const model = modelOf({ text: payload.text, sync: payload.sync, style: payload.style, over: payload.over, seed: payload.seed, intro: payload.intro, outro: payload.outro, offset: payload.offset, clip: { start: 0, end: payload.dur } }, { start: 0, end: payload.dur });
  scene.hint = true;
  scene.setData(model);
  const player = new Player(scene, audio, canvas, 'player');
  player.setSource(url, payload.dur);
  player.setState('intro');
  const { signal } = player.scope;
  // Espacio y Enter (con la página enfocada, no solo el lienzo) los atiende el propio Player
  canvas.addEventListener('pointerdown', (ev) => scene.poke(ev.clientX, ev.clientY, 'tap'));
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'mouse' || ev.buttons) scene.poke(ev.clientX, ev.clientY, 'move');
  });
  // Giro, barras del navegador, teclado: se reajusta solo si el tamaño del escenario cambió de verdad (un pellizco o
  // un rebote de la barra no rehacen la rejilla). En el giro se revisa otra vez al asentarse: iOS tarda en medir.
  const size = () => `${root.clientWidth}x${root.clientHeight}@${window.devicePixelRatio || 1}`;
  let fitted = size();
  const fit = () => {
    const now = size();
    if (now === fitted) return;
    fitted = now;
    scene.resize();
  };
  const refit = debounce(fit, 120), settle = debounce(fit, 450);
  const turned = () => { refit(); settle(); };
  window.addEventListener('resize', refit, { signal });
  window.addEventListener('orientationchange', turned, { signal });
  window.visualViewport?.addEventListener('resize', refit, { signal });
  const caption = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const transcript = h('section', { class: 'sr-only', 'aria-label': 'Letra de la canción' }, ...scene.tl.lines.map(line => h('p', {}, line.text)));
  root.append(caption, transcript);
  const media = mediaControls(player, payload.title || 'para ti');
  const update = () => {
    canvas.setAttribute('aria-label', player.state === 'playing' ? 'Pausar' : player.state === 'ended' ? 'Volver a reproducir' : 'Reproducir');
    const line = [...scene.tl.lines].reverse().find((line) => player.t >= line.t && player.t < line.hideAt);
    const text = player.state === 'intro' ? payload.intro || 'Pulsa reproducir para comenzar' : player.state === 'ended' ? payload.outro || 'Fin de la canción' : line?.text || '';
    if (caption.textContent !== text) caption.textContent = text;
  };
  player.onState = () => { update(); media.sync(); };
  const timer = setInterval(update, 200); update(); media.sync();
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) { if (player.state === 'playing') player.pause(); return; }
    clearInterval(timer); refit.cancel(); settle.cancel(); media.off(); retireMediaUrl(audio, url); player.destroy();
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) { fitted = size(); scene.resize(); update(); } });
  window.__player = player;
  window.__scene = scene;
  document.documentElement.classList.add('ready');
  // el lienzo aparece (fundido) cuando ya pintó al menos un cuadro; el corazón de carga se retira después
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add('on');
    setTimeout(() => document.querySelector('.boot')?.remove(), 800);
  }));
}
