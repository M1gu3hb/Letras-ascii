# Letras en ASCII

Convierte una canción y su letra en un detalle animado: cada frase aparece al ritmo de la música en arte ASCII, el fondo late con los graves y estalla en los *drops*, y todo se comparte como **un solo archivo HTML** que se abre sin internet.

**En vivo:** https://letras-ascii.vercel.app/

- Todo ocurre en el navegador: la canción y la letra nunca salen del dispositivo (IndexedDB local, sin backend).
- Flujo guiado en seis pasos: **Canción → Letra → Marcar → Ajustar → Estilo → Exportar**.
- «Sorpréndeme» genera otra combinación de tipografías, colores, fondos y animaciones y la reproduce al instante.
- El HTML exportado es autónomo (código, fuentes, audio y tiempos incrustados) y se ve a pantalla completa en teléfono y computadora.

## Inicio rápido

Requiere Node 22 o superior (CI y Vercel usan Node 24).

```sh
npm ci
npm run dev        # compila en site/ y sirve en http://localhost:5173
```

| Script | Qué hace |
| --- | --- |
| `npm run build` | Empaqueta con esbuild en `site/` (editor, reproductor, worker, CSS, fuentes, SEO). |
| `npm run dev` / `npm run serve` | Compila y sirve `site/` / solo sirve `site/`. |
| `npm run lint` | ESLint sobre código, scripts y pruebas. |
| `npm run test:unit` | Pruebas unitarias (`node:test`). |
| `npm run test:browser [suite…]` | Regresiones en navegador con Playwright (`PLAYWRIGHT_EXECUTABLE_PATH` permite usar un Chromium ya instalado). |
| `npm test` | Todo lo anterior, en ese orden. |

## Arquitectura

Vanilla JS con módulos ES, sin framework. `build.mjs` produce `app.js` (editor), `player.js` (reproductor exportable), `audio-worker.js`, `app.css`, `player.css`, `index.html`, fuentes, `robots.txt`, `sitemap.xml` y `404.html`.

```
js/
  main.js, studio.js        arranque y composición del editor (API estable para los paneles)
  studio/                   proyectos, pantalla completa y navegación guiada
  panel-*.js                un panel por paso (canción, letra, marcar, ajustar, estilo, exportar)
  mark/, words/             captura de tiempos y ajuste fino por palabra
  scene.js, grid.js, type.js, fx.js, bg.js, heart.js, director.js, timeline.js, text-layer.js
                            motor visual en Canvas 2D (rejilla ASCII, tipografía, efectos, fondos, karaoke)
  analyze.js, drops.js      análisis de la canción: bandas, golpes de graves, drops e intensidad
  audio.js, media-preflight.js, audio-worker.js
                            validación, decodificación y análisis en un worker
  project.js, import.js, export.js
                            contrato de datos v3, importación (LRC/SRT/VTT/HTML) y exportación
  player-entry.js, player-bootstrap.js, player.js
                            reproductor del HTML exportado (no importa nada del editor)
  store.js, storage/        IndexedDB v2, preferencias y guardado automático
  icons.js, ui.js           iconos SVG y piezas de interfaz sin dependencias
css/
  style.css                 sistema de diseño (tokens negro + azul rey) y componentes del editor
  mobile.css                reglas de teléfono, cargadas después del estilo base
  player.css                lo único que necesita el HTML exportado
```

El HTML exportado solo lleva el reproductor y `player.css`; `player.js` nunca importa el editor ni el almacenamiento. Para montar el editor bajo otra ruta basta conservar sus assets junto a `app.js` (las URLs se resuelven desde el script cargado), y `await app.destroy()` libera reproducción, temporizadores, listeners y URLs.

El mismo `Scene` dibuja la vista previa del editor y el HTML exportado, así que lo que ves al diseñar es lo que recibe la otra persona. Todos los efectos son funciones puras del tiempo y de la energía de la canción: la vista a pantalla completa del editor y el archivo exportado coinciden cuadro a cuadro.

### Reacción a la música

Al cargar la canción se calculan, en un worker, la energía por bandas (graves, medios, agudos) y los golpes de graves a 50 cuadros por segundo. Sobre esos datos `drops.js` detecta los *drops* (subidas fuertes de energía después de una parte más tranquila) y una curva de intensidad por secciones. La escena responde con brillo de graves, ondas en cada golpe, corazones que laten y, en cada drop, destello, estallido de corazones y una sacudida breve. El control «Qué tanto reacciona a los graves» escala todo, y con *reducir movimiento* activado solo quedan cambios suaves de brillo.

## Pruebas y CI

`npm test` ejecuta lint, unitarias, build y las suites de navegador definidas en `scripts/test-browser.mjs`: fronteras de auditoría, smoke, diseño del destinatario, SEO y recorrido, migración de datos, fiabilidad, reauditoría, captura en teléfono, disposición, UX adaptativa (14 tamaños), captura por frase/palabra, timeline, aspecto ASCII, exportación, pantalla completa, ajuste y lectura. `scripts/fixtures.mjs` genera audio sintético; no hacen falta canciones reales. Las capturas quedan en `test/audit/` (ignorado por Git).

GitHub Actions corre la suite completa en Chromium (Ubuntu) y las suites críticas en WebKit (macOS), con permisos de solo lectura. Los scripts manuales de diagnóstico viven en `test/diagnostics/` y no forman parte de la condición de aprobación.

## Despliegue

Vercel compila con `node build.mjs` y publica `site/` (ver `vercel.json`, que también define cabeceras de seguridad y caché de fuentes). Cada rama genera un preview con `noindex`; `main` es producción. La URL canónica vive en `scripts/site-document.mjs`.

## Contratos y límites

- Audio y video deben contener al menos un segundo de audio; el recorte mínimo es un segundo. Las letras admiten hasta 100.000 caracteres; una importación mayor se rechaza completa y conserva el trabajo actual.
- Modelo `v:3`: texto por líneas, `sync` absoluto respecto a la canción, `style`, `over`, `clip`, `offset` y `seed`. El HTML exportado usa tiempos relativos al tramo e incluye `sourceStart` para recuperar los absolutos al reimportarlo.
- Las marcas explícitas conservan milisegundos; la edición permite bordes contiguos sin cruzar el inicio vecino.
- Exportar requiere al menos una frase visible dentro del tramo y congela proyecto, archivo y tramo desde el clic.
- Importar y quitar tiempos tienen deshacer inmediato; una edición posterior invalida ese respaldo.
- El guardado captura una instantánea por proyecto y se vacía antes de cambiar de proyecto; si falla, queda pendiente y se avisa.
- IndexedDB es local al origen: los proyectos no viajan entre dominios ni dispositivos. Se comparte enviando el HTML descargado.
- Los contenedores y códecs admitidos dependen del navegador. Cancelar detiene el análisis y descarta resultados pendientes.

## Documentación

Las auditorías anteriores y sus decisiones están en `docs/`: [auditoría integral](docs/auditoria-integral.md), [SEO, UX y dispositivos](docs/auditoria-seo-ux.md), [experiencia móvil](docs/experiencia-movil.md), [timeline y legibilidad](docs/timeline-y-legibilidad.md), [exportación artística](docs/exportacion-artistica.md), [reauditoría](docs/reauditoria.md) y [validación por etapas](docs/validacion-por-etapas.md). La [auditoría de noviembre de 2026](docs/auditoria-2026-11.md) describe el rediseño actual.
