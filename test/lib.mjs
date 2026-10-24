import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
export function serve(root) {
  const srv = createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let f = join(root, p === '/' ? 'index.html' : p);
    if (!existsSync(f) || statSync(f).isDirectory()) {
      res.writeHead(404);
      res.end('no');
      return;
    }
    res.writeHead(200, { 'content-type': mime[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  }).listen(0);
  return { srv, port: srv.address().port };
}
export async function launch(opts = {}) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', ...(opts.args || [])] });
  return b;
}
export function watch(page, errs) {
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });
  page.on('requestfailed', (r) => { if (!r.url().startsWith('blob:')) errs.push('reqfail: ' + r.url().slice(0, 80)); });
}
