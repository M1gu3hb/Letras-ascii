# Letras en ASCII

Editor local de canciones con letra animada en Canvas 2D. Carga audio/video compatible, elige un tramo, escribe o importa la letra, marca frases o palabras, ajusta el diseño y descarga un HTML autónomo. Los proyectos y archivos se guardan en IndexedDB del navegador. No hay backend de medios, enlaces alojados ni exportación de video en esta versión.

## Desarrollo y despliegue

Node 24. `npm ci`, `npm run build`; servir `site/` con cualquier servidor estático. Vercel usa `node build.mjs` desde la raíz y publica `site/`. GitHub es el origen del proyecto; el empaquetado manual anterior fue retirado. Las fuentes están versionadas; el build no necesita descargarlas de un CDN.

## Arquitectura

El flujo es Canción → Letra → Marcar → Ajustar → Estilo → Exportar. Ajustar permite audición A–B con contexto, edición numérica y deshacer/rehacer sin que la tira siga al audio mientras editas. Estilo ofrece entradas rápidas, modos independientes ASCII/texto normal para letras y karaoke, y versiones reversibles. Consulta [la auditoría integral y su diagrama](docs/auditoria-integral.md) para los defectos reproducidos y sus regresiones, y `docs/timeline-y-legibilidad.md` para el contrato, el mapa de módulos, la migración y el plan de validación/publicación.

- `js/studio.js`: composición de la app y API estable utilizada por sus paneles.
- `js/studio/`: proyectos, teatro/pantalla completa y navegación guiada.
- `js/mark/`: vista, constantes y máquina de captura, pausa, cuenta y recuperación.
- `js/words/`: vista, manipulación de tiempos y controles repetibles por palabra.
- `js/edit-history.js`, `js/words/audition.js`: historial por proyecto y audición temporal independiente del tramo.
- `js/entry.js`, `js/text-layer.js`, `js/style-controls.js`: entradas legibles, texto normal/karaoke segmentado y controles de lectura/variación.
- `js/storage/`: preferencias con namespace y autosave por ID e instantánea.
- `js/store.js`: IndexedDB v2, migración de v1 e índice de metadatos.
- `js/audio.js`, `media-preflight.js`, `audio-worker.js`, `analyze.js`: validación, decodificación nativa y análisis en worker con alternativa compatible.
- `js/project.js`, `import.js`, `export.js`: contrato v3, compatibilidad antigua y exportación.
- `js/scene.js`, `grid.js`, `type.js`, `director.js`, `timeline.js`, `fx.js`, `bg.js`, `heart.js`: motor visual.
- `js/player-entry.js`, `player-bootstrap.js`, `player.js`: reproductor independiente exportable, con controles DOM y texto accesible.
- `js/lifecycle.js`, `dialog.js`, `assets.js`: ciclo de vida, foco y resolución de recursos bajo subrutas.

El build produce `app.js`, `player.js`, `audio-worker.js`, `app.css`, `index.html` y fuentes. El exportado solo incluye el reproductor; `player.js` no debe importar el estudio ni almacenamiento. Para montar el editor bajo otra ruta, conservar el conjunto de assets junto a `app.js`. Las URLs se resuelven desde el script cargado, no desde la ruta de navegación. `await app.destroy()` libera reproducción, timers, listeners, observers y URLs; no montar dos instancias en el mismo root.

## Pruebas

```sh
npm run lint
npm run test:unit
npx playwright-core install --with-deps chromium
npm test
```

`npm test` ejecuta lint, pruebas unitarias, build y regresiones de navegador. `npm run test:browser -- reliability ux` selecciona suites. `PLAYWRIGHT_EXECUTABLE_PATH` permite utilizar un Chromium ya instalado. `scripts/fixtures.mjs` crea audio sintético original para las pruebas; no hacen falta canciones personales. Las capturas se guardan en `test/audit/` y están excluidas de Git.

Suites activas: auditoría de fronteras (`audit-boundaries`), smoke, migración de datos, fiabilidad integral, UX adaptativa (14 tamaños), disposición/formato de escena, captura por frase/palabra, timeline por mouse/toque/teclado, aspecto ASCII, exportación y pantalla completa. Los demás scripts antiguos son utilidades de diagnóstico, no parte de la condición de aprobación. GitHub Actions ejecuta la suite con permisos de lectura y sin credenciales de despliegue.

## Contratos y límites

- Audio y video deben contener al menos un segundo de audio; el recorte mínimo es un segundo. Las letras admiten hasta 100.000 caracteres; una importación que supera ese límite se rechaza completa, conservando el trabajo actual.
- Las marcas explícitas mantienen milisegundos y no reciben una separación artificial de 60 ms. La edición permite bordes contiguos sin cruzar el inicio vecino.
- Modelo `v:3`: texto por líneas, `sync` absoluto respecto a la canción, `style`, `over`, `clip`, `offset` y `seed`. El HTML exportado usa tiempos relativos al tramo.
- Exportar requiere al menos una frase renderizable dentro del tramo; se avisa si faltan marcas o quedan fuera.
- Reimportar v3 conserva estilo, overrides, duraciones y frases no marcadas. LRC/SRT/VTT y HTML antiguo siguen admitidos.
- Los nuevos HTML incluyen `sourceStart` para recuperar tiempos absolutos al reimportar un tramo. El campo de inicio permite sobrescribirlo; los HTML anteriores conservan el ajuste manual.
- Importar y quitar tiempos tienen un deshacer inmediato. Una edición posterior invalida ese respaldo para no reemplazar trabajo más reciente.
- Reproducir, audicionar o empezar a marcar aplica los cambios pendientes del recorte dentro del gesto, evitando iniciar con audio anterior y sustituirlo después.
- Exportar congela proyecto, archivo y tramo desde el clic; los recursos se revalidan para evitar incrustar un reproductor antiguo del caché.
- El guardado captura una instantánea por ID y se vacía antes de cambiar de proyecto. Si falla, se conserva pendiente y se informa del error.
- Las aperturas de proyecto aplican solo el último resultado solicitado. Cancelar la recuperación conserva el proyecto actual y su audio; los archivos guardados se comprueban con su identificador de medio.
- Cambiar la canción conserva texto/diseño y pide confirmación antes de reiniciar sus marcas.
- Los controles avanzados permanecen disponibles en grupos plegables. En una pantalla con poco alto puede ser necesario desplazar el panel; las pestañas, la navegación y el transporte conservan acceso.
- Límites preventivos de archivo y memoria protegen la decodificación. Los contenedores/códecs admitidos dependen del navegador. Cancelar detiene el análisis y descarta resultados pendientes; una decodificación nativa que ya empezó puede terminar internamente.
- IndexedDB es local al origen: integrar en GLYPHOS no traslada automáticamente proyectos entre dominios. La integración y nuevas salidas se trabajan por separado.

Ver `docs/validacion-por-etapas.md` para cambios y pruebas, y `docs/auditoria-inicial.md` para la auditoría previa (describe la versión anterior, no el estado corregido).

## Reauditoría

`docs/reauditoria.md` contrasta la propuesta original con el producto y registra los casos añadidos. `test/reaudit.mjs` cubre recuperación/cancelación, exportación concurrente, importación real y deshacer, recaptura de frase, montaje bajo subruta, desmontaje y navegación del destinatario. La matriz UX cubre 14 dimensiones, incluidas las de la auditoría original. El flujo también se ejecuta en WebKit en GitHub Actions: `PLAYWRIGHT_BROWSER=webkit node scripts/test-browser.mjs smoke reliability reaudit mobile-capture adjust reading audit-boundaries` tras instalar WebKit y sus dependencias. CI utiliza WebKit en macOS 15 y Chromium en Ubuntu 24.04; los backends Linux de WebKit siguen disponibles para diagnóstico local. Eso no certifica Safari o iOS físicos.

## Experiencia en teléfono

Ver `docs/experiencia-movil.md`. Las reglas de teléfono viven en `css/mobile.css`; el build las incluye después del estilo base. Marcar usa un espacio propio independiente del formato artístico. La vista previa se puede plegar con Vista y los ajustes de captura se despliegan sin quitar funciones. `test/mobile-capture.mjs` cubre toques nativos y los tres formatos en teléfono, también en WebKit.
