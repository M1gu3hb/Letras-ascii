// Servidor estático mínimo para probar site/ en local: `npm run dev` (compila y sirve) o `npm run serve`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const root = normalize(process.argv[2] || 'site');
const port = Number(process.env.PORT) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('no file');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(join(root, '404.html')).catch(() => 'No encontrado'));
  }
}).listen(port, () => console.log(`Letras en ASCII → http://localhost:${port}/`));
