import { h } from './ui.js';
import { fmtTime } from './project.js';
import { Scene } from './scene.js';
import { Player } from './player.js';
import { modelOf } from './project.js';
import { loadFonts } from './fonts.js';
const $ = (id) => document.getElementById(id);
function b64ToBytes(b64) {
  const bin = atob(b64.trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export async function bootPlayer(payload) {
  const root = $('app');
  root.className = 'fullstage';
  const canvas = document.createElement('canvas');
  canvas.id = 'c';
  canvas.setAttribute('aria-hidden', 'true');
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
  const play = h('button', { type: 'button', class: 'btn primary', onclick: () => player.tap() }, 'Reproducir');
  const restart = h('button', { type: 'button', class: 'btn', onclick: () => player.start(0) }, 'Volver al inicio');
  const seek = h('input', { type: 'range', min: 0, max: payload.dur, step: .05, value: 0, 'aria-label': 'Posición en la canción' });
  seek.addEventListener('input', () => player.seek(+seek.value));
  const time = h('span', { class: 'player-time' });
  const caption = h('p', { class: 'player-caption', 'aria-live': 'polite' }, payload.intro || 'Pulsa reproducir para comenzar');
  const transcript = h('details', { class: 'player-transcript' }, h('summary', {}, 'Ver la letra'), h('div', {}, ...String(payload.text || '').split('\n').map((line) => h('p', {}, line))));
  const controls = h('div', { class: 'recipient-controls' }, caption, h('div', { class: 'recipient-row' }, play, restart, time), seek, transcript);
  root.append(controls);
  const update = () => {
    play.textContent = player.state === 'playing' ? 'Pausar' : player.state === 'ended' ? 'Volver a reproducir' : 'Reproducir';
    play.setAttribute('aria-label', play.textContent);
    time.textContent = `${fmtTime(player.t)} / ${fmtTime(payload.dur)}`;
    if (document.activeElement !== seek) seek.value = player.t;
    const line = [...scene.tl.lines].reverse().find((line) => player.t >= line.t && player.t < line.hideAt);
    const text = player.state === 'intro' ? payload.intro || 'Pulsa reproducir para comenzar' : player.state === 'ended' ? payload.outro || 'Fin de la canción' : line?.text || '';
    if (caption.textContent !== text) caption.textContent = text;
  };
  player.onState = update;
  const timer = setInterval(update, 200); update();
  window.addEventListener('pagehide', () => { clearInterval(timer); player.destroy(); URL.revokeObjectURL(url); }, { once: true });
  window.__player = player;
  window.__scene = scene;
  document.documentElement.classList.add('ready');
}

