import { chromium, webkit, firefox } from 'playwright-core';
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
  const kind = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const type = { chromium, webkit, firefox }[kind];
  if (!type) throw new Error('Unknown PLAYWRIGHT_BROWSER: ' + kind);
  const b = await type.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false', executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || type.executablePath(), args: [...(kind === 'chromium' ? ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] : []), ...(opts.args || [])] });
  return b;
}
export function watch(page, errs) {
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text() + ' ' + (m.location().url || ''));
  });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ': ' + r.url()); });
  page.on('requestfailed', (r) => { if (!r.url().startsWith('blob:')) errs.push('reqfail: ' + r.url().slice(0, 80)); });
}

export async function openMarkOptions(page) {
  const toggle = page.getByRole('button', { name: 'Configurar modo y cuenta regresiva', exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}
