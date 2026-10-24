// Importadores: todo ocurre en el navegador de la persona; la letra nunca pasa por ningún servidor.
// 1) un para-ti.html anterior (trae su letra y sus tiempos)
// 2) archivos de letra con tiempos: .lrc, .srt, .vtt

const num = (s) => parseFloat(String(s).replace(',', '.'));

// ───────────── HTML anterior ─────────────
export function readPayloadFromHtml(html) {
  const m = html.match(/<script id="payload" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No encontré la letra dentro de ese archivo. ¿Es un para-ti.html que descargaste de aquí?');
  let d;
  try {
    d = JSON.parse(m[1]);
  } catch (e) {
    throw new Error('El archivo trae la letra dañada.');
  }
  if (d?.v === 3 && typeof d.text === 'string' && Array.isArray(d.sync)) {
    const phrases = d.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!phrases.length) throw new Error('Ese proyecto no contiene letra.');
    const lines = phrases.map((text, i) => {
      const s = d.sync[i];
      const t = Number.isFinite(s?.t) ? s.t : null;
      return [t, text, Array.isArray(s?.wt) && s.wt.every(Number.isFinite) ? s.wt : undefined, Array.isArray(s?.wd) ? s.wd : undefined];
    });
    return { intro: d.intro ?? 'para ti', outro: d.outro ?? '', seed: d.seed | 0, lines,
      project: { text: phrases.join('\n'), sync: d.sync, style: d.style, over: d.over, offset: d.offset } };
  }
  if (!d || !Array.isArray(d.lines) || !d.lines.length) throw new Error('Ese archivo no es un proyecto compatible de Letras ASCII o no contiene letra.');
  return {
    intro: d.intro ?? 'para ti',
    outro: d.outro ?? '',
    seed: d.seed | 0,
    lines: d.lines
      .filter((l) => Array.isArray(l) && Number.isFinite(+l[0]) && typeof l[1] === 'string' && l[1].trim())
      .map((l) => [+l[0], l[1].trim(), Array.isArray(l[2]) ? l[2].map(Number) : undefined]),
  };
}

// ───────────── LRC / SRT / VTT ─────────────
function parseLrc(text) {
  const out = [];
  const tagRe = /\[(\d{1,3}):(\d{2}(?:[.:]\d{1,3})?)\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const tags = [];
    let m;
    tagRe.lastIndex = 0;
    let lastEnd = 0;
    while ((m = tagRe.exec(raw))) {
      tags.push(+m[1] * 60 + num(m[2].replace(':', '.')));
      lastEnd = tagRe.lastIndex;
    }
    if (!tags.length) continue;
    let body = raw.slice(lastEnd).trim();
    // LRC "enhanced": <mm:ss.xx> palabra <mm:ss.xx> palabra
    let wt;
    if (/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/.test(body)) {
      const parts = body.split(/<(\d{1,3}):(\d{2}(?:[.:]\d{1,3})?)>/);
      // parts: [antes, mm, ss, texto, mm, ss, texto, ...]
      const words = [];
      const times = [];
      for (let i = 1; i + 2 < parts.length + 1; i += 3) {
        const t = +parts[i] * 60 + num(parts[i + 1].replace(':', '.'));
        const txt = (parts[i + 2] || '').trim();
        if (!txt) continue;
        const ws = txt.split(/\s+/).filter(Boolean);
        ws.forEach((w, k) => {
          words.push(w);
          times.push(+(t + k * 0.05).toFixed(2));
        });
      }
      if (words.length) {
        body = words.join(' ');
        wt = times;
      }
    }
    body = body.replace(/<[^>]+>/g, '').trim();
    if (!body) continue;
    for (const t of tags) out.push({ t, text: body, wt: wt ? wt.map((x) => x + (t - tags[0])) : undefined });
  }
  return out;
}

const timeRe = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*/;
function parseCues(text) {
  const out = [];
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  for (const b of blocks) {
    const ls = b.split('\n');
    const k = ls.findIndex((l) => timeRe.test(l));
    if (k < 0) continue;
    const m = ls[k].match(timeRe);
    const t = (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3] + num('0.' + m[4].padEnd(3, '0'));
    const body = ls
      .slice(k + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (body) out.push({ t, text: body });
  }
  return out;
}

// Devuelve [{ t, text, wt? }] ordenado por tiempo.
export function parseTimed(text, filename = '') {
  const t = text.replace(/^﻿/, '');
  const isCue = /-->/.test(t) && (/\.(srt|vtt)$/i.test(filename) || !/\[\d{1,3}:\d{2}/.test(t));
  const rows = isCue ? parseCues(t) : parseLrc(t);
  const valid = rows.filter((r) => Number.isFinite(r.t) && r.t >= 0);
  valid.sort((a, b) => a.t - b.t);
  if (!valid.length) throw new Error('No encontré tiempos válidos en ese archivo. Necesito un .lrc, .srt o .vtt.');
  return valid;
}

// Pasa a "líneas" del motor aplicando el segundo en que empieza el fragmento y recortando a la canción.
export function toLines(rows, start, duration) {
  const lines = [];
  let dropped = 0;
  for (const r of rows) {
    const t = +(r.t - start).toFixed(2);
    if (t < -0.2 || t > duration - 0.9) {
      dropped++;
      continue;
    }
    lines.push([Math.max(0, t), r.text, r.wt ? r.wt.map((x) => Math.max(0, +(x - start).toFixed(2))) : undefined]);
  }
  return { lines, dropped };
}

export function readFileText(accept) {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return reject(new Error('cancelado'));
      const rd = new FileReader();
      rd.onload = () => resolve({ name: f.name, text: String(rd.result) });
      rd.onerror = () => reject(new Error('No pude leer ese archivo.'));
      rd.readAsText(f);
    });
    inp.addEventListener('cancel', () => { inp.remove(); reject(new Error('cancelado')); }, { once: true });
    document.body.append(inp);
    inp.click();
  });
}

// "1:23", "83", "01:23.5" -> segundos
export function parseClock(s) {
  const t = String(s).trim().replace(',', '.');
  if (!t) return 0;
  const p = t.split(':').map(Number);
  if (p.some((x) => !Number.isFinite(x))) return NaN;
  return p.length === 1 ? p[0] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
}
