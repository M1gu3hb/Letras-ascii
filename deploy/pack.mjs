// Prepara el despliegue: comprime site/app.js y site/app.css con brotli, los parte en trozos binarios de 6750 bytes
// (deploy/d/*.bin; en base64 son exactamente 9000 caracteres), y reescribe el MANIFEST de deploy/vercel-build.mjs con el SHA-1
// de cada parte y del resultado. Además deja, FUERA del despliegue (carpeta que se pasa en B64DIR), el base64 de cada parte
// para subirlas una por una con upload_file y comprobar cada SHA-1.
// Uso: node deploy/pack.mjs   (desde la raíz del proyecto)   [B64DIR=/ruta node deploy/pack.mjs]
import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants } from 'node:zlib';

const sha = (b) => createHash('sha1').update(b).digest('hex').slice(0, 10);
const sha40 = (b) => createHash('sha1').update(b).digest('hex');
const CHUNK = 6750;
const B64DIR = process.env.B64DIR || '';
mkdirSync('deploy/d', { recursive: true });
for (const f of readdirSync('deploy/d')) unlinkSync('deploy/d/' + f);
if (B64DIR) {
  mkdirSync(B64DIR, { recursive: true });
  for (const f of readdirSync(B64DIR)) unlinkSync(B64DIR + '/' + f);
}

const manifest = {};
const listing = [];
for (const [name, key] of [['app.js', 'app_js'], ['app.css', 'app_css']]) {
  const raw = readFileSync('site/' + name);
  const comp = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 24, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
  const parts = [];
  for (let i = 0, n = 1; i < comp.length; i += CHUNK, n++) {
    const buf = comp.subarray(i, i + CHUNK);
    const file = `d/${key}_${n}.bin`;
    writeFileSync('deploy/' + file, buf);
    parts.push([file, sha(buf)]);
    listing.push({ file, bytes: buf.length, sha1: sha40(buf) });
    if (B64DIR) writeFileSync(`${B64DIR}/${key}_${n}.b64`, buf.toString('base64'));
  }
  manifest[name] = { parts, sha: sha(raw), size: raw.length };
  console.log(name, raw.length, 'bytes →', comp.length, 'bytes brotli en', parts.length, 'partes (sha', sha(raw) + ')');
}
let src = readFileSync('deploy/vercel-build.mjs', 'utf8');
src = src.replace(/^const MANIFEST = .*;$/m, 'const MANIFEST = ' + JSON.stringify(manifest) + ';');
writeFileSync('deploy/vercel-build.mjs', src);
for (const l of listing) console.log(l.sha1, l.bytes, l.file);
console.log('MANIFEST actualizado');
