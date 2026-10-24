// Armar el archivo final: UN solo .html con el código, las fuentes, la letra con sus tiempos,
// la energía de la canción y el audio. Se abre sin internet y sin este sitio.
import { wavOf, pickTier, TIER_LABELS, bytesToB64, energyForClip } from './audio.js';
import { phrasesOf } from './project.js';
import { buildTimeline } from './timeline.js';
import { modelOf } from './project.js';
import { assetUrl } from './assets.js';

const MB = 1048576;
export const ORIGINAL_MAX = 12 * MB;

// qué audio se va a incluir y cuánto pesa, sin construirlo todavía
export function audioPlan(app) {
  const m = app.media;
  const clip = app.clip();
  const dur = clip.end - clip.start;
  if (!m) return null;
  const whole = clip.start < 0.06 && clip.end >= m.dur - 0.35;
  const f = app.file;
  if (f && !m.video && whole && f.size <= ORIGINAL_MAX) return { kind: 'original', label: TIER_LABELS.original, bytes: f.size, dur };
  const tier = pickTier(dur);
  const ch = tier.mono || m.chans.length === 1 ? 1 : 2;
  return { kind: 'wav', tier, label: TIER_LABELS[tier.id], bytes: Math.round(dur * tier.sr * ch * 2) + 44, dur };
}

export function exportReady(app) {
  const p = app.project;
  const n = phrasesOf(p.text).length;
  const marked = phrasesOf(p.text).filter((_, i) => Number.isFinite(p.sync[i]?.t)).length;
  const done = buildTimeline(modelOf(p, app.clip ? app.clip() : p.clip)).lines.length;
  return { phrases: n, done, marked, outside: marked - done, hasSong: !!app.media };
}

const b64Arr = (u8) => bytesToB64(u8);

function payloadOf(app, title) {
  const p = app.project;
  const clip = app.clip();
  const sh = (t) => +(t - clip.start).toFixed(3);
  const sync = p.sync.map((s) => (s && Number.isFinite(s.t) ? { t: sh(s.t), wt: s.wt ? s.wt.map(sh) : undefined, wd: s.wd } : null));
  const en = energyForClip(app.media, clip.start, clip.end);
  return {
    v: 3,
    title,
    text: p.text,
    intro: p.intro,
    outro: p.outro,
    sync,
    style: p.style,
    over: p.over,
    seed: p.seed,
    offset: p.offset,
    dur: +(clip.end - clip.start).toFixed(3),
    energy: { fps: en.fps, low: b64Arr(en.low), mid: b64Arr(en.mid), hi: b64Arr(en.hi), hit: b64Arr(en.hit) },
  };
}

async function assets() {
  const get = async (name) => {
    const r = await fetch(assetUrl(name), { cache: 'force-cache' });
    if (!r.ok) throw new Error('No pude leer ' + name + ' del sitio. Recarga la página e intenta de nuevo.');
    return r.text();
  };
  const [js, css0] = await Promise.all([get('player.js'), get('app.css')]);
  return { js, css: await inlineFonts(css0) };
}

// el CSS del sitio apunta a fonts/*.woff2; el HTML final debe ser un solo archivo, así que se incrustan
async function inlineFonts(css) {
  const re = /url\((fonts\/[^)]+)\)/g;
  const urls = [...new Set([...css.matchAll(re)].map((m) => m[1]))];
  const data = new Map();
  await Promise.all(
    urls.map(async (u) => {
      const r = await fetch(assetUrl(u), { cache: 'force-cache' });
      if (!r.ok) throw new Error('No pude leer las tipografías del sitio. Recarga la página e intenta de nuevo.');
      data.set(u, 'data:font/woff2;base64,' + bytesToB64(await r.arrayBuffer()));
    }),
  );
  return css.replace(re, (_, u) => `url(${data.get(u)})`);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// -> { blob, bytes, plan }
export async function buildHtml(app, { title } = {}) {
  const plan = audioPlan(app);
  if (!plan) throw new Error('Falta la canción.');
  if (!exportReady(app).done) throw new Error('No hay frases con tiempo dentro del tramo elegido. Revisa Canción y Marcar.');
  const name = (title || app.project.name || 'para ti').trim() || 'para ti';
  const { js, css } = await assets();
  const payload = payloadOf(app, name);
  let audioB64;
  let mime;
  if (plan.kind === 'original') {
    audioB64 = bytesToB64(await app.file.arrayBuffer());
    mime = app.file.type || 'audio/mpeg';
  } else {
    const clip = app.clip();
    const ab = wavOf(app.media, clip.start, clip.end, { sr: plan.tier.sr, mono: plan.tier.mono });
    audioB64 = bytesToB64(ab);
    mime = 'audio/wav';
  }
  payload.audio = { mime, kind: plan.kind };
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const safeJs = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  const html =
    '<!doctype html>\n<html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta name="theme-color" content="#07040b"><link rel="icon" href="data:,">' +
    `<title>${esc(name)}</title><style>${css}</style></head><body class="playerpage">` +
    '<div id="app"></div><audio id="audio" playsinline preload="auto"></audio>' +
    `<script id="payload" type="application/json">${json}</script>` +
    `<script id="audio-b64" type="text/plain">${audioB64}</script>` +
    `<script>${safeJs}</script></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  return { blob, bytes: blob.size, plan };
}

export function fileNameOf(app) {
  const n = (app.project.name || 'para-ti')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return (n || 'para-ti') + '.html';
}
