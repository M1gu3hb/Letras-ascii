import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const root = process.cwd();
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const f = join(root, p);
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': mime[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const port = srv.address().port;
const args = process.argv.slice(2);
const query = args[0] || '';
const times = (args[1] || '2.0').split(',').map(Number);
const W = +(args[2] || 960), H = +(args[3] || 540);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: W, height: H } });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(`http://localhost:${port}/test/harness.html?${query}`);
await pg.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 15000 });
console.log(await pg.evaluate(() => JSON.stringify(window.__tl())));
for (const t of times) {
  await pg.evaluate((t) => window.__render(t), t);
  await pg.screenshot({ path: `test/out-${query.replace(/[^a-z0-9]/gi, '_') || 'x'}-${t}.png` });
}
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
