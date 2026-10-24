import { serve, launch, watch } from './lib.mjs';
const { srv, port } = serve('site');
const b = await launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const pg = await ctx.newPage();
watch(pg, errs);
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => document.documentElement.classList.contains('ready'));
await pg.setInputFiles('#songfile', 'test/media/kick120.wav');
await pg.waitForFunction(() => window.__app.media, null, { timeout: 60000 });
await pg.click('text=30 s');
const S = () => pg.evaluate(() => ({ sync: window.__app.project.sync.map((s) => s && { t: s.t, n: s.wt ? s.wt.length : 0 }), clip: window.__app.project.clip, units: window.__app.scene.tl.units.length, marks: window.__app.__marks }));

// 1) modo solo frases
await pg.click('#tab-text');
await pg.fill('textarea.lyrics', 'primera frase de prueba\nsegunda frase inventada\ntercera y última');
await pg.click('#tab-mark');
await pg.click('.segb:text-is("Solo frases")');
await pg.click('text=▶ Empezar a marcar');
// cuenta regresiva 3-2-1 y luego empieza la canción
await pg.waitForFunction(() => window.__app.player.state === 'playing', null, { timeout: 8000 });
await pg.waitForTimeout(500);
const pad = await pg.locator('.pad').boundingBox();
const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2;
const tap = async (gap) => { await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.up(); await pg.waitForTimeout(gap); };
await tap(900); await tap(900); 
console.log('frases (2 toques):', JSON.stringify((await S()).sync));
// deshacer la última
await pg.click('.mbtns .btn:has-text("Deshacer")');
console.log('tras deshacer:', JSON.stringify((await S()).sync));
await tap(300);
console.log('toque temprano tras deshacer (debe ignorarse):', JSON.stringify((await S()).sync));
await pg.waitForTimeout(1500);
await tap(700);
await pg.waitForTimeout(500);
console.log('frases completas:', JSON.stringify((await S()).sync), 'units', (await S()).units);

// 2) marcas en la onda
await pg.click('#tab-song');
await pg.waitForTimeout(300);
console.log('marcas en onda:', await pg.evaluate(() => window.__app.panels && window.__app.panels.song ? window.__app.panels.song.wave.marks : 'sin acceso'));

// 3) cambiar tramo conserva marcas
const before = (await S()).sync.map((s) => s && s.t);
await pg.evaluate(() => window.__app.setClip(2, 40));
await pg.waitForTimeout(300);
const after = (await S()).sync.map((s) => s && s.t);
console.log('marcas antes/después de mover tramo:', JSON.stringify(before), JSON.stringify(after), 'clip', JSON.stringify((await S()).clip));

// 4) re-marcar desde la frase 2 (↻)
await pg.click('#tab-mark');
await pg.locator('button[aria-label="Volver a marcar desde la frase 2"]').click();
await pg.waitForTimeout(300);
console.log('tras ↻ frase 2:', JSON.stringify((await S()).sync));
// saltar (cuando ya suena y se está marcando)
await pg.waitForFunction(() => window.__app.panels.mark.phase === 'run', null, { timeout: 8000 });
await pg.click('.mbtns .btn:has-text("Saltar frase")');
console.log('tras saltar:', JSON.stringify((await S()).sync));

// 5) editar letra en medio conserva tiempos
await pg.click('#tab-text');
await pg.fill('textarea.lyrics', 'primera frase de prueba\nuna línea nueva en medio\nsegunda frase inventada\ntercera y última');
await pg.waitForTimeout(300);
console.log('tras insertar línea:', JSON.stringify((await S()).sync));

// 6) importar .lrc (texto inventado)
const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('text=Letra con tiempos (.lrc .srt .vtt)')]);
await fc.setFiles('test/media/prueba.lrc');
await pg.waitForTimeout(500);
console.log('tras importar lrc:', JSON.stringify((await S()).sync), 'units', (await S()).units);

// 7) pestaña Palabras: ajustar tiempos
await pg.click('#tab-words');
await pg.waitForTimeout(300);
const wl = await pg.locator('.wlistbox button, .wlistbox .witem').count();
console.log('items palabras:', wl);
if (wl) { await pg.locator('.wlistbox button, .wlistbox .witem').nth(1).click(); await pg.waitForTimeout(200); }
await pg.screenshot({ path: 'test/e2e6-words.png' });

// 8) reproducir todo y llegar al final sin errores
await pg.evaluate(() => { window.__app.player.start(0); });
await pg.waitForTimeout(3500);
console.log('estado reproduciendo:', await pg.evaluate(() => window.__app.player.state));
console.log('errors:', errs.length ? errs : 'none');
await b.close(); srv.close();
