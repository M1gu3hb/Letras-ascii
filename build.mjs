// Arma el sitio estático en site/ : index.html + app.js + app.css + fonts/.
// El mismo app.js y app.css se incrustan después en el HTML final que se descarga.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const asciiOnly = (t) => t.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const js = asciiOnly((
  await build({ entryPoints: ['js/main.js'], bundle: true, minify: !process.env.NOMIN, format: 'iife', target: 'es2020', write: false, legalComments: 'none', lineLimit: 1000, charset: 'ascii' })
).outputFiles[0].text);

// Las tipografías van como archivos aparte (site/fonts/). Al exportar el HTML final se incrustan en base64.
const font = (family, weight, file, style = 'normal') =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};font-display:block;src:url(fonts/${file}) format('woff2');}`;
const fonts = [
  font('Nunito', 400, 'nunito-latin-400-normal.woff2'),
  font('Nunito', 700, 'nunito-latin-700-normal.woff2'),
  font('Nunito', 800, 'nunito-latin-800-normal.woff2'),
  font('Nunito', 900, 'nunito-latin-900-normal.woff2'),
  font('JetBrains Mono', 400, 'jetbrains-mono-latin-400-normal.woff2'),
  font('JetBrains Mono', 700, 'jetbrains-mono-latin-700-normal.woff2'),
  font('Playfair Display', 900, 'playfair-display-latin-900-italic.woff2', 'italic'),
  font('Pacifico', 400, 'pacifico-latin-400-normal.woff2'),
  font('Anton', 400, 'anton-latin-400-normal.woff2'),
  font('Caveat', 700, 'caveat-latin-700-normal.woff2'),
  font('Unbounded', 900, 'unbounded-latin-900-normal.woff2'),
  font('Cinzel', 900, 'cinzel-latin-900-normal.woff2'),
].join('\n');
const css = fonts + '\n' + readFileSync('css/style.css', 'utf8') + '\n' + readFileSync('css/mobile.css', 'utf8');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07040b">
<meta name="robots" content="noindex">
<title>Letras en ASCII</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="app"></div>
<audio id="audio" playsinline preload="auto"></audio>
<audio id="audioFull" playsinline preload="auto"></audio>
<script id="payload" type="application/json">null</script>
<script src="app.js"></script>
</body>
</html>
`;
mkdirSync('site/fonts', { recursive: true });
for (const f of readdirSync('assets/fonts')) copyFileSync(`assets/fonts/${f}`, `site/fonts/${f}`);
writeFileSync('site/app.js', js);
for (const [entry, output] of [['js/player-entry.js', 'player.js'], ['js/audio-worker.js', 'audio-worker.js']]) {
  const result = await build({ entryPoints: [entry], bundle: true, minify: !process.env.NOMIN, format: 'iife', target: 'es2020', write: false, legalComments: 'none', charset: 'ascii' });
  writeFileSync('site/' + output, result.outputFiles[0].text);
}
writeFileSync('site/app.css', css);
writeFileSync('site/index.html', html);
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
console.log(`site/app.js ${(js.length / 1024).toFixed(0)} KB (${sha(js)})  site/app.css ${(css.length / 1024).toFixed(0)} KB (${sha(css)})`);
