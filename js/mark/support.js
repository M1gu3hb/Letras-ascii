import { getPreference as lsGet, setPreference as lsSet } from '../storage/preferences.js';

export const COUNT_FROM = 3; // 3, 2, 1
export const COUNT_STEP = 900; // ms por número
export const LOCK_AUTO = 1600; // ms que esperan los botones cuando algo termina solo (última frase, fin del tramo)
export const LOCK_USER = 450; // ms tras pausar tú mismo (por si el dedo rebota)
export const REWIND = 1.5; // al seguir marcando desde la última marca, la canción regresa un poco
export const REWIND_PAUSE = 1.0; // y al seguir después de una pausa, un poco menos
export const GAP_WORD = 0.05; // dos marcas de palabra no pueden quedar más cerca que esto
export const GAP_PHRASE = 0.3; // ni dos marcas de frase (un doble toque sin querer)

export const buzz = (ms) => {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
};

// tic de la cuenta regresiva (un tono corto; si el navegador no deja, no pasa nada)
let actx = null;
export function disposeBeep() { const ctx = actx; actx = null; if (ctx) { try { Promise.resolve(ctx.close()).catch(() => {}); } catch {} } }
export function beep(freq, ms = 90, vol = 0.07) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = actx || new AC();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator();
    const g = actx.createGain();
    const t = actx.currentTime;
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch (e) {}
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;


export { lsGet, lsSet };
