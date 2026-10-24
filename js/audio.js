// Audio en el navegador: leer canción o video, sacar la pista de audio, analizarla (graves, medios,
// agudos, golpes) y preparar copias para reproducir (tramo) y para exportar. Nada sale del equipo.
import { analyzePCM, peaksOf, encodeWav, sliceEnergy, FPS } from './analyze.js';
import { assetUrl } from './assets.js';
import { abortIfNeeded, validateMedia, probeDuration } from './media-preflight.js';

export const MAX_MINUTES = 20;
export const PEAKS_PER_SEC = 50;
const tick = () => new Promise((r) => setTimeout(r, 0));

export const isVideoFile = (f) => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(f.name);

function decodeBuffer(ab) {
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Off(2, 44100, 44100);
  return new Promise((resolve, reject) => {
    // forma con callbacks: funciona también en Safari viejo
    const p = ctx.decodeAudioData(ab, resolve, reject);
    if (p && p.catch) p.catch(reject);
  });
}

export function downmix(buf) {
  const n = buf.length;
  const out = new Float32Array(n);
  const ch = buf.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i];
  }
  if (ch > 1) for (let i = 0; i < n; i++) out[i] /= ch;
  return out;
}

// file -> { name, video, dur, sr, chans:[Float32Array], mono, peaks, energy }
export async function loadMedia(file, onStatus = () => {}, { signal } = {}) {
  abortIfNeeded(signal);
  validateMedia(file);
  const video = isVideoFile(file);
  onStatus('Comprobando el archivo…', 0.02);
  validateMedia(file, await probeDuration(file, signal));
  abortIfNeeded(signal);
  onStatus(video ? 'Leyendo el video…' : 'Leyendo la canción…', 0.05);
  const ab = await file.arrayBuffer();
  abortIfNeeded(signal);
  onStatus(video ? 'Sacando el audio del video…' : 'Decodificando…', 0.2);
  await tick();
  let buf;
  try {
    buf = await decodeBuffer(ab);
  } catch (e) {
    throw new Error(
      video
        ? 'No pude sacar el audio de ese video. Prueba con Chrome o Edge en la computadora, o sube el audio por separado (mp3, m4a, wav).'
        : 'No pude leer ese archivo de audio. Prueba con mp3, m4a, wav u ogg.',
    );
  }
  abortIfNeeded(signal);
  validateMedia(file, buf.duration);
  if (!buf.length || !buf.duration) throw new Error('El archivo no trae audio.');
  if (buf.duration > MAX_MINUTES * 60) throw new Error(`Dura más de ${MAX_MINUTES} minutos. Recórtalo un poco antes de subirlo.`);
  const chans = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chans.push(buf.getChannelData(c));
  let mono = downmix(buf);
  onStatus('Dibujando la onda…', 0.4);
  await tick();
  const count = Math.max(100, Math.ceil(buf.duration * PEAKS_PER_SEC));
  onStatus('Escuchando graves y golpes…', 0.45);
  let peaks, energy;
  if (typeof Worker !== 'undefined') {
    try {
      const result = await new Promise((resolve, reject) => {
        const worker = new Worker(assetUrl('audio-worker.js'));
        const finish = (value, error) => { worker.terminate(); signal?.removeEventListener('abort', abort); clearTimeout(timeout); error ? reject(error) : resolve(value); };
        const abort = () => finish(null, new DOMException('Carga cancelada', 'AbortError'));
        const timeout = setTimeout(() => finish(null, new Error('El análisis tardó demasiado.')), 120000);
        signal?.addEventListener('abort', abort, { once: true });
        worker.onerror = () => finish(null, new Error('Análisis no disponible'));
        worker.onmessage = ({ data }) => {
          if (data.error) finish(null, new Error(data.error));
          else if (data.mono) finish(data);
          else onStatus('Escuchando graves y golpes…', 0.45 + 0.55 * data.progress);
        };
        worker.postMessage({ mono, sr: buf.sampleRate, count }, [mono.buffer]);
      });
      ({ mono, peaks, energy } = result);
    } catch (error) { abortIfNeeded(signal); if (!mono.byteLength) mono = downmix(buf); }
  }
  if (!energy) {
    peaks = peaksOf(mono, count);
    energy = await analyzePCM(mono, buf.sampleRate, (p) => onStatus('Escuchando graves y golpes…', 0.45 + 0.55 * p), async () => { abortIfNeeded(signal); await tick(); });
  }
  abortIfNeeded(signal);
  return { name: file.name, video, dur: buf.duration, sr: buf.sampleRate, chans, mono, peaks, energy };
}

// ───────────── copias para reproducir / exportar ─────────────
function resample(x, from, to) {
  if (from === to) return x;
  const ratio = from / to;
  const n = Math.max(1, Math.floor(x.length / ratio));
  const out = new Float32Array(n);
  if (ratio > 1) {
    for (let i = 0; i < n; i++) {
      const a = i * ratio;
      const b = Math.min(x.length, (i + 1) * ratio);
      let s = 0;
      let c = 0;
      for (let k = Math.floor(a); k < Math.ceil(b); k++) {
        s += x[k];
        c++;
      }
      out[i] = c ? s / c : 0;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const p = i * ratio;
      const k = Math.floor(p);
      const f = p - k;
      out[i] = x[k] * (1 - f) + (x[Math.min(x.length - 1, k + 1)] ?? x[k]) * f;
    }
  }
  return out;
}

// WAV 16 bits del tramo [start,end] (segundos). opts: { sr, mono }
export function wavOf(media, start, end, opts = {}) {
  const sr0 = media.sr;
  const a = Math.max(0, Math.floor(start * sr0));
  const b = Math.min(media.mono.length, Math.ceil(end * sr0));
  const sr = opts.sr || sr0;
  const useMono = opts.mono || media.chans.length === 1;
  const src = useMono ? [media.mono.subarray(a, b)] : media.chans.map((c) => c.subarray(a, b));
  const chs = src.map((c) => (sr === sr0 ? Float32Array.from(c) : resample(c, sr0, sr)));
  const fade = Math.min(Math.floor(sr * 0.012), chs[0].length >> 2);
  for (const c of chs) {
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      c[i] *= g;
      c[c.length - 1 - i] *= g;
    }
  }
  return encodeWav(chs, sr);
}

const blobUrl = (ab) => URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
export { blobUrl };

// qué calidad cabe en un archivo HTML razonable
export const TIERS = [
  { id: 'estereo', sr: 44100, mono: false, maxSec: 34 },
  { id: 'mono44', sr: 44100, mono: true, maxSec: 68 },
  { id: 'mono32', sr: 32000, mono: true, maxSec: 93 },
  { id: 'mono22', sr: 22050, mono: true, maxSec: 136 },
];
export function pickTier(seconds) {
  return TIERS.find((t) => seconds <= t.maxSec) || { id: 'mono22', sr: 22050, mono: true, maxSec: 9999 };
}
export const TIER_LABELS = { estereo: 'estéreo 44.1 kHz', mono44: 'mono 44.1 kHz', mono32: 'mono 32 kHz', mono22: 'mono 22 kHz', original: 'archivo original' };

export function bytesToB64(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}

export function energyForClip(media, start, end) {
  return sliceEnergy(media.energy, start, end);
}

export { FPS };
