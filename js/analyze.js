// Análisis de la canción, todo en el navegador: energía por bandas (graves / medios / agudos),
// golpes de graves (bombo) y picos para dibujar la onda. Funciones puras: no tocan el DOM.

export const FPS = 50;
const N = 1024; // ventana de la FFT

const cache = {};
function plan(n) {
  if (cache[n]) return cache[n];
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }
  cache[n] = { cos, sin, rev };
  return cache[n];
}

// FFT radix-2 en sitio
export function fft(re, im) {
  const n = re.length;
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = start + k;
        const b = a + half;
        const tr = re[b] * cos[w] - im[b] * sin[w];
        const ti = re[b] * sin[w] + im[b] * cos[w];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

const pct = (arr, p) => {
  const c = Float32Array.from(arr).sort();
  return c[Math.min(c.length - 1, Math.floor(c.length * p))] || 0;
};

// x: mono Float32Array, sr: frecuencia de muestreo. Devuelve { fps, low, mid, hi, hit } (Uint8, 0..~120)
// `progress(0..1)` y `yieldFn` opcionales para no congelar la pantalla.
export async function analyzePCM(x, sr, progress, yieldFn) {
  const d = Math.max(1, Math.round(sr / 22050));
  const sr2 = sr / d;
  let y = x;
  if (d > 1) {
    y = new Float32Array(Math.floor(x.length / d));
    for (let i = 0; i < y.length; i++) {
      let s = 0;
      for (let k = 0; k < d; k++) s += x[i * d + k];
      y[i] = s / d;
    }
  }
  const hop = sr2 / FPS;
  const frames = Math.max(2, Math.floor(y.length / hop) + 1);
  const binHz = sr2 / N;
  const b = (hz) => Math.max(1, Math.round(hz / binHz));
  const L0 = b(30);
  const L1 = Math.max(L0 + 1, b(150));
  const M1 = b(2000);
  const H1 = Math.min(N / 2 - 1, b(9000));
  const OB = b(260); // banda del "golpe": hasta 260 Hz
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const low = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const hi = new Float32Array(frames);
  const onset = new Float32Array(frames);
  const prev = new Float32Array(OB + 1);
  const norm = 4 / N; // seno a escala completa -> 1
  for (let f = 0; f < frames; f++) {
    const c = Math.round(f * hop) - N / 2;
    for (let i = 0; i < N; i++) {
      const idx = c + i;
      re[i] = idx >= 0 && idx < y.length ? y[idx] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    let sl = 0;
    let sm = 0;
    let sh = 0;
    let fl = 0;
    for (let k = 1; k <= H1; k++) {
      const m = Math.hypot(re[k], im[k]) * norm;
      const p = m * m;
      if (k >= L0 && k <= L1) sl += p;
      else if (k > L1 && k <= M1) sm += p;
      else if (k > M1) sh += p;
      if (k <= OB) {
        const lg = Math.log(1 + 100 * m);
        const dlt = lg - prev[k];
        if (dlt > 0 && f > 0) fl += dlt;
        prev[k] = lg;
      }
    }
    low[f] = Math.sqrt(sl);
    mid[f] = Math.sqrt(sm);
    hi[f] = Math.sqrt(sh);
    onset[f] = fl;
    if (yieldFn && f % 600 === 599) {
      if (progress) progress(f / frames);
      await yieldFn();
    }
  }
  if (progress) progress(1);

  // normalizar cada banda por su percentil 98 -> 0..~100 (más suavizado corto)
  const scale = (arr, mix) => {
    const p = pct(arr, 0.98) || 1e-6;
    const out = new Uint8Array(frames);
    let s = 0;
    for (let i = 0; i < frames; i++) {
      const v = Math.min(1.2, arr[i] / p) * 100;
      s = i === 0 ? v : s * mix + v * (1 - mix);
      out[i] = Math.round(s);
    }
    return out;
  };
  const lowN = scale(low, 0.35);
  const midN = scale(mid, 0.35);
  const hiN = scale(hi, 0.3);

  // golpes de graves: picos del flujo espectral por encima de su media local
  const o95 = pct(onset, 0.95) || 1e-6;
  const pre = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) pre[i + 1] = pre[i] + onset[i];
  const hit = new Uint8Array(frames);
  const W = Math.round(0.5 * FPS);
  const R = 4;
  const minGap = Math.round(0.14 * FPS);
  let last = -1e9;
  for (let i = 1; i < frames - 1; i++) {
    const v = onset[i];
    if (v < 0.12 * o95) continue;
    const a = Math.max(0, i - W);
    const e = Math.min(frames, i + W + 1);
    const mean = (pre[e] - pre[a]) / (e - a);
    if (v < mean * 1.55 + 0.06 * o95) continue;
    let isMax = true;
    for (let k = Math.max(0, i - R); k <= Math.min(frames - 1, i + R); k++) {
      if (onset[k] > v) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    if (i - last < minGap) {
      // dentro del hueco mínimo: se queda el más fuerte
      if (v > hit[last] / 100 * o95 && hit[last]) hit[last] = 0;
      else continue;
    }
    hit[i] = Math.round(Math.min(1.25, Math.max(0.35, v / o95)) * 100);
    last = i;
  }
  return { fps: FPS, low: lowN, mid: midN, hi: hiN, hit };
}

// Picos para la onda: n valores 0..1 (máximo absoluto por tramo)
export function peaksOf(x, n) {
  const out = new Float32Array(n);
  const step = x.length / n;
  let top = 1e-6;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const e = Math.max(a + 1, Math.floor((i + 1) * step));
    let m = 0;
    const stride = Math.max(1, ((e - a) / 64) | 0);
    for (let k = a; k < e && k < x.length; k += stride) {
      const v = Math.abs(x[k]);
      if (v > m) m = v;
    }
    out[i] = m;
    if (m > top) top = m;
  }
  const p = pct(out, 0.985) || top;
  for (let i = 0; i < n; i++) out[i] = Math.min(1, out[i] / p);
  return out;
}

// Recorta la energía a un tramo [start, end] (segundos) -> arreglos nuevos que empiezan en 0
export function sliceEnergy(e, start, end) {
  const a = Math.max(0, Math.floor(start * e.fps));
  const b = Math.min(e.hit.length, Math.ceil(end * e.fps) + 1);
  return { fps: e.fps, low: e.low.slice(a, b), mid: e.mid.slice(a, b), hi: e.hi.slice(a, b), hit: e.hit.slice(a, b) };
}

// WAV de 16 bits a partir de canales Float32
export function encodeWav(channels, sr) {
  const nch = channels.length;
  const len = channels[0].length;
  const bytes = 44 + len * nch * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const w = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, bytes - 8, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * nch * 2, true);
  v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, len * nch * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return buf;
}
