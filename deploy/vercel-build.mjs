// Corre en el build de Vercel: reconstruye app.js y app.css desde las partes binarias comprimidas (brotli),
// verifica cada parte y el resultado por SHA-1, copia index.html y baja las tipografías (fontsource 5.3.0 via jsDelivr).
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';

const sha = (b) => createHash('sha1').update(b).digest('hex').slice(0, 10);
const MANIFEST = {"app.js":{"parts":[["d/app_js_1.bin","62c1234786"],["d/app_js_2.bin","7a2ca753ab"],["d/app_js_3.bin","ba4fe4fa53"],["d/app_js_4.bin","8feed560db"],["d/app_js_5.bin","6842598f80"],["d/app_js_6.bin","ece7f5f807"],["d/app_js_7.bin","7704525d9b"],["d/app_js_8.bin","fbb915b391"],["d/app_js_9.bin","f247316a6d"],["d/app_js_10.bin","0715c2935a"]],"sha":"6de2b8d064","size":203573},"app.css":{"parts":[["d/app_css_1.bin","36f9ce5425"],["d/app_css_2.bin","fb66a97c06"]],"sha":"b1382e37d5","size":54569}};
const V = '5.3.0';
const FONTS = [
  ['anton', 'anton-latin-400-normal.woff2', 'b9beea0804'],
  ['caveat', 'caveat-latin-700-normal.woff2', 'e25ad33cc7'],
  ['cinzel', 'cinzel-latin-900-normal.woff2', '46694920e9'],
  ['jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff2', '3ae6215182'],
  ['jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff2', 'e67f8fefd2'],
  ['nunito', 'nunito-latin-400-normal.woff2', '19064e82b3'],
  ['nunito', 'nunito-latin-700-normal.woff2', 'fd0ec8a345'],
  ['nunito', 'nunito-latin-800-normal.woff2', 'bce64e8580'],
  ['nunito', 'nunito-latin-900-normal.woff2', 'af8c841fe1'],
  ['pacifico', 'pacifico-latin-400-normal.woff2', '8304ce1e39'],
  ['playfair-display', 'playfair-display-latin-900-italic.woff2', '9c95e5ffc3'],
  ['unbounded', 'unbounded-latin-900-normal.woff2', '38109e1aaf'],
];

mkdirSync('dist/fonts', { recursive: true });

const bad = [];
const bufs = {};
for (const [name, m] of Object.entries(MANIFEST)) {
  const list = [];
  for (const [f, h] of m.parts) {
    let t = Buffer.alloc(0);
    try {
      t = readFileSync(f);
    } catch (e) {}
    if (sha(t) !== h) bad.push(f);
    list.push(t);
  }
  bufs[name] = Buffer.concat(list);
}
if (bad.length) throw new Error('PARTES CON ERROR: ' + bad.join(', '));
for (const [name, m] of Object.entries(MANIFEST)) {
  let raw;
  try {
    raw = brotliDecompressSync(bufs[name]);
  } catch (e) {
    throw new Error('No se pudo descomprimir ' + name + ': ' + e.message);
  }
  if (raw.length !== m.size || sha(raw) !== m.sha) throw new Error('Resultado distinto en ' + name);
  writeFileSync('dist/' + name, raw);
}
copyFileSync('index.html', 'dist/index.html');

for (const [pkg, file, h] of FONTS) {
  const url = 'https://cdn.jsdelivr.net/npm/@fontsource/' + pkg + '@' + V + '/files/' + file;
  let buf = null;
  for (let i = 0; i < 3 && !buf; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) buf = Buffer.from(await r.arrayBuffer());
    } catch (e) {}
  }
  if (!buf) throw new Error('No se pudo bajar ' + url);
  if (sha(buf) !== h) throw new Error('SHA distinto en ' + file);
  writeFileSync('dist/fonts/' + file, buf);
}
console.log('listo: dist/ con app.js, app.css, index.html y', FONTS.length, 'tipografias');
