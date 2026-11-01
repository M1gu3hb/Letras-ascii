# Auditoría y rediseño — noviembre de 2026

Revisión completa del editor, del HTML que recibe la otra persona, del repositorio y del despliegue en Vercel. Prioridad: que crear el detalle sea fácil en el teléfono y que el resultado se vea y se sienta bien.

## Hallazgos

| Área | Problema encontrado | Efecto |
| --- | --- | --- |
| Identidad | Paleta rosa/morado mezclada con naranja para foco, valores y avisos; ningún sistema claro de acentos. | La interfaz se sentía genérica y los estados (elegido, foco, aviso) se confundían. |
| Teléfono | En el paso Canción la vista previa empezaba plegada. | La persona no veía qué iba a crear hasta el paso 5. |
| Teléfono | Cabecera con tres botones de texto y el nombre del proyecto cortado; transporte con «Inicio» en monoespaciada y «Vista» como texto. | Poco espacio, aspecto improvisado. |
| Escenario | «Ver en grande» con etiqueta abajo a la derecha y la etiqueta del ejemplo arriba ocupando el ancho. | Tapaban la letra y el arte en pantallas chicas. |
| Teléfono horizontal | El botón de vista quedaba encima de la barra de tiempo. | La barra no se podía tocar al inicio. |
| Coherencia | La pestaña decía «Estilo» y el panel «Laboratorio». | Dos nombres para el mismo paso. |
| Aleatorio | «Generar otra versión» compartía fila con Deshacer/Rehacer y no enseñaba el cambio. | Casi nadie lo notaba; había que buscar el play para ver el resultado. |
| Exportar | El botón principal del pie llevaba a «Revisar sincronización»; los faltantes se repetían en el aviso. | La acción principal (descargar) competía con volver atrás. |
| Exportar | Botones de corrección de 40 px. | Debajo del mínimo táctil de 44 px. |
| HTML exportado | Incrustaba todo el CSS del editor (~72 KB). | Archivo más pesado sin beneficio. |
| HTML exportado | Aro de foco naranja alrededor de toda la pantalla después de tocar. | Parecía un error visual. |
| HTML exportado | «pausa / toca para seguir» se dibujaba encima del karaoke. | La letra quedaba tapada al pausar. |
| HTML exportado | Sin Media Session ni recuperación del bloqueo de pantalla al volver a la pestaña. | Controles del sistema sin título; la pantalla podía apagarse. |
| Arranque | Antes de cargar el editor se veía el texto completo de la guía (pensado para buscadores). | Destello de una página distinta al abrir. |
| Repositorio | 29 scripts de diagnóstico mezclados con las suites oficiales; sin `vercel.json`; README con historial en lugar de guía; `package.json` sin `engines` ni script de desarrollo. | Difícil saber qué es parte de la condición de aprobación y cómo arrancar. |

## Cambios

### Sistema de diseño

- Tokens en `css/style.css`: fondo casi negro con matiz azul, superficies azul noche, acento azul rey (`#2f5bff`) con degradado, azul cielo para valores y foco, verde/rojo/ámbar solo para estados.
- Botones primarios con degradado y halo; segmentos y chips elegidos en azul rey con texto blanco.
- `js/icons.js`: iconos SVG propios (trazo de 2 px, `currentColor`, decorativos); el nombre accesible siempre lo lleva el botón.
- Favicon, tarjeta social y portada de arranque con la misma identidad.

### Experiencia en teléfono

- Cabecera: marca, nombre del proyecto e iconos de 44 px (las etiquetas siguen disponibles para lectores de pantalla).
- La vista previa queda abierta por defecto excepto en Ajustar; en pantallas bajitas solo se abre sola en Estilo, para no quitarle ancho al panel.
- Escenario: etiqueta arriba a la izquierda; dado y pantalla completa arriba a la derecha. Nada tapa la letra.
- Zona de carga con texto para el dedo («Toca aquí para buscarla en tu teléfono»).

### Sorpréndeme

- Botón grande en Estilo y un dado sobre el escenario en cualquier paso (`App.surprise()`).
- Cada toque cambia tipografías, colores, fondos y animaciones según lo permitido, hace brillar el escenario y reproduce desde el principio (`App.showcase()`): con canción marcada suena de verdad; sin ella, reinicia el ejemplo animado.
- «Ver cómo queda» abre la pantalla completa y reproduce. Intensidad y grupos siguen disponibles en «Qué puede cambiar». Deshacer/Rehacer conservan la versión anterior.

### Exportar

- Lista de verificación (canción, letra, tiempos) con el botón que resuelve cada pendiente. Cuando todo está listo se compacta en una fila y la descarga queda a la vista.
- «Descargar el HTML» es la primera parada del teclado; el pie ofrece «Revisar tiempos» como acción secundaria.

### Reacción a la música

- `js/drops.js` detecta *drops*: la energía de graves y medios de 0,25 s supera con claridad la media de los 4 s anteriores y se sostiene 0,7 s. Así se descartan un bombo constante, un golpe aislado o una subida lenta. Separación mínima de 7 s, máximo 8 drops. Además produce una curva de intensidad por secciones con un mapeo fijo, para que el editor (canción completa) y el exportado (solo el tramo) coincidan.
- `Scene` añade brillo de graves azul rey, aros en golpes fuertes, corazones `<3` que suben y laten y, en cada drop, destello (alfa máxima 0,34, sin estroboscopio), onda expansiva, estallido de corazones y chispas, sacudida breve y giro del corazón. Las secciones intensas se ven más vivas y las tranquilas más profundas.
- Todo escala con «Qué tanto reacciona a los graves», es determinista (sin `Math.random` ni reloj) y no asigna memoria por cuadro. Con *reducir movimiento* solo queda un cambio suave de brillo.
- Los avisos «toca para…» se dibujan sobre la franja del karaoke, nunca encima.

### HTML del destinatario

- `css/player.css` (~4 KB sin fuentes) reemplaza al CSS del editor dentro del archivo.
- Corazón de carga y aparición suave del lienzo; mensaje claro si el archivo está dañado o sin JavaScript.
- Aro de foco solo con teclado (azul, interior). Sin zoom por doble toque, selección ni rebote; se puede acercar con dos dedos.
- Wake Lock que se recupera al volver a la pestaña, Media Session con título y portada, teclas Espacio/Enter en toda la página sin repetición, reajuste rápido al girar el teléfono.

### Repositorio y despliegue

- `test/diagnostics/` separa los scripts manuales de las suites oficiales.
- `vercel.json` fija build, salida, `npm ci`, cabeceras de seguridad (nosniff, referrer, permisos, frame) y caché de fuentes.
- `npm run dev` compila y sirve en local (`scripts/serve.mjs`). README reescrito como guía del proyecto.

## Verificación

- `npm run lint`, `npm run test:unit` (69 pruebas, incluidas 12 de detección de drops) y `npm run build`.
- Las 19 suites de navegador en Chromium, incluida la nueva `recipient-polish` (26 verificaciones).
- Capturas revisadas en 390×844, 820×1180, 844×390 y 1440×900, y secuencias antes, durante y después de un drop.

## Límites conocidos

- WebKit se valida en GitHub Actions (macOS); aquí solo se ejecutó Chromium. Falta probar Safari en un iPhone físico.
- El brillo de graves es un sprite escalado en modo aditivo. En renderizado por software cuesta ~7 ms por cuadro a 390×844 ×2; en GPU de teléfono debería ser mucho menor, pero no se midió en un dispositivo real.
- `test/diagnostics/theater-vs-export.mjs` ya no corresponde a la interfaz actual: es una utilidad manual, no parte de la condición de aprobación.
