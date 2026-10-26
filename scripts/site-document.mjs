import { GUIDE_STEPS, GUIDE_FAQ } from '../js/guide-content.js';

export const SITE_URL = 'https://letras-ascii.vercel.app/';
const title = 'Letras en ASCII | Sincroniza tu canción y crea un karaoke';
const description = 'Crea letras sincronizadas en ASCII o texto normal. Ajusta tiempos, diseña el karaoke y descarga un HTML con tu canción. Tus archivos se procesan en tu dispositivo.';
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

export function editorDocument({ preview = false } = {}) {
  const schema = { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Letras en ASCII', url: SITE_URL, description, applicationCategory: 'MultimediaApplication', operatingSystem: 'Web', inLanguage: 'es', isAccessibleForFree: true, browserRequirements: 'JavaScript y un navegador actual' };
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07040b">
<meta name="description" content="${description}">
<meta name="robots" content="${preview ? 'noindex, nofollow' : 'index, follow'}">
<link rel="canonical" href="${SITE_URL}">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:locale" content="es_MX">
<meta property="og:site_name" content="Letras en ASCII">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Letras en ASCII: tu canción, tu letra y tu karaoke, en un archivo HTML">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${SITE_URL}social-card.png">
<meta name="twitter:image:alt" content="Letras en ASCII: letras sincronizadas y karaoke">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="stylesheet" href="app.css">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
</head><body>
<div id="app"><main class="boot-intro">
<h1>Letras en ASCII: tu canción con letras sincronizadas</h1>
<p>${description}</p>
<p id="boot-status" role="status">Abriendo el editor…</p>
<noscript><p>Activa JavaScript para editar y reproducir. Puedes consultar esta guía sin activarlo.</p></noscript>
<h2>Cómo crear tu karaoke</h2>
<ol>${GUIDE_STEPS.map(([, name, text]) => `<li><h3>${esc(name)}</h3><p>${esc(text)}</p></li>`).join('')}</ol>
<h2>Guardar y compartir</h2>
${GUIDE_FAQ.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
</main></div>
<audio id="audio" playsinline preload="auto"></audio>
<audio id="audioFull" playsinline preload="auto"></audio>
<script id="payload" type="application/json">null</script>
<script src="app.js" defer></script>
</body></html>\n`;
}

export function crawlerFiles() {
  return {
    'robots.txt': `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`,
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}</loc></url></urlset>\n`,
    '404.html': `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Página no encontrada | Letras en ASCII</title><link rel="stylesheet" href="/app.css"></head><body><main class="boot-intro"><h1>No encontramos esa página</h1><p>Vuelve al editor para continuar con tu canción. Tus proyectos guardados siguen en este navegador.</p><a class="btn primary" href="/">Volver al editor</a></main></body></html>\n`,
  };
}
