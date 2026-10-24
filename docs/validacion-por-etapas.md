# Validación por etapas

## 1. Estructura, antes de cambiar comportamiento

Se separaron vistas, captura de marcado, edición temporal, proyectos y teatro manteniendo la API de los paneles y el motor. `panel-mark.js`: 1159 → 494 líneas; `panel-words.js`: 1109 → 671; `studio.js`: 745 → 526.

- Compilación: correcta.
- Smoke escritorio/teléfono: correcto, sin errores.
- Regresión `mark-flow`: todas las comprobaciones correctas, incluidos presión sostenida, cuenta, pausas, deshacer, recuperación, cierre y toques reflejos.
- UX 360×640, tablet 820×1180, escritorio 1024×680: sin overflow. Una deuda confirmada: botones de zoom de onda 33×42 px en tablet, por debajo del umbral táctil de la prueba. Pendiente para la etapa responsive.

## 2. Fiabilidad e intercambio de datos

- Importación v3 con estilo, overrides, duraciones y frases aún no marcadas; compatibilidad antigua y LRC/SRT/VTT.
- Exportación validada contra las líneas efectivamente renderizables en el tramo.
- Autosave por instantánea/ID, cola secuencial, reintento de fallos sin sobrescribir revisiones nuevas y vaciado antes del cambio de proyecto.
- Migración IndexedDB v1→v2 conservando registros; listado mediante índice sin cargar los blobs.
- Validación previa de archivo/duración/memoria, cancelación y análisis en worker. Audio completo reproducido desde el archivo original, evitando una copia WAV redundante.
- Reproductor separado, navegación de assets desde el script y desmontaje del editor.

Auditoría del bloque: 8 pruebas unitarias correctas; 14 comprobaciones integrales correctas; 6 comprobaciones de migración/listado/borrado correctas. Exportación visual adicional en móvil: conserva los ocho ajustes de ASCII y el grosor por palabra, sin errores de consola. El bundle de reproducción pasa de ~199 KB a ~72 KB.

## 3. Interacción y accesibilidad

- Navegación guiada y progreso, sin retirar las seis herramientas originales.
- Opciones de importación y controles avanzados plegados; corrección por palabra accesible desde el fin de marcado.
- Modo inicial por frases; audición por palabra voluntaria; el transporte pausado deja de avanzar silenciosamente en Estilo/teatro.
- Modal con fondo inerte, contención y devolución de foco; pestañas con flechas/Home/End; botones de marcado conservan activación nativa de teclado.
- Controles DOM y letra accesible en el HTML del destinatario; preferencia de movimiento reducido aplicada al canvas.
- Avisos fuera de los botones de avance. Error de guardado visible también en móvil.

Auditoría del bloque: se detectó y corrigió un import de preferencia omitido en la vista extraída de palabras. Lint ahora detecta identificadores no definidos e imports/variables sin uso. Las pruebas de efectos y teatro se actualizaron para exigir que una pausa real conserve la imagen, y la prueba de palabras activa explícitamente la audición antes de exigir audio automático.

## 4. Adaptación por tamaño y entrada

- Transporte móvil con barra de avance de ancho útil, botones de zoom ampliados y regreso al inicio con texto legible.
- Revisión estricta de controles táctiles ≥44 px, incluyendo excepciones de poca altura y tablet.
- Viewport visual para teclado virtual y cambios de orientación; distribución específica de final de marcado en horizontal.
- Las palabras pequeñas de la timeline conservan su proporción temporal: se proporcionan chips y botones alternativos de ajuste de tamaño táctil, sin deformar la escala de tiempo.

La auditoría estricta encontró excepciones de 36–42 px en cabecera horizontal y pantalla completa; se corrigieron antes de ampliar la validación. La matriz UX activa cubre 320×568, 360×640, 390×844, 430×932, 768×1024, 820×1180, 844×390, 1180×820, 1024×680, 1440×900 y 1920×1080. La suite adicional de formatos valida también 393×736 y 412×915.

## Límites de evidencia

Las pruebas usan Chromium automatizado con viewport y entrada táctil emulados, audio sintético original y archivos locales de prueba. No equivalen a una certificación en hardware Android/iOS ni Safari físico. Se conserva la dependencia de los códecs nativos del navegador. No se añaden enlaces alojados, exportación de video ni integración con GLYPHOS: son funciones posteriores, fuera de esta corrección.

## Cierre de regresiones

La revisión de teclado detectó que Espacio debe seguir siendo el botón de captura durante una pasada, incluso si quedó foco en otro control. Se conserva ese contrato durante `run`; fuera de la captura, los botones recuperan su activación nativa. La regresión de marcado volvió a pasar después de ese ajuste.

Resultados acumulados tras correcciones: lint sin errores; 8 pruebas unitarias; 6 comprobaciones de almacenamiento/migración; 17 comprobaciones de fiabilidad; UX en 11 tamaños; validación de rejilla, formatos y marcado en 7 configuraciones; marcado completo, timeline por palabra, controles ASCII, exportación y teatro sin errores de consola. Se revisaron capturas de los seis paneles y del destinatario. La selección final de capturas se vuelve a generar con el build publicado.

## Verificación adicional en GitHub y Vercel

La revisión publicada en Vercel abrió el editor, Estilo y el modal de proyectos correctamente. El navegador de CI detectó peticiones 404 implícitas al icono del HTML exportado, que no aparecían en el Chromium local. Se añadió un icono autocontenido a la exportación y diagnóstico con URL/respuestas HTTP en el observador de pruebas. Fiabilidad (17) y exportación visual volvieron a pasar localmente. La matriz responsive final de 320 px, teléfono horizontal, tablet y escritorio terminó sin desbordes, objetivos táctiles insuficientes ni saltos al marcar. Se ajustó también el texto del modal para referirse a cualquier dispositivo.

La batería de CI encontró además un sprite de palabra que excedía la rejilla de pantalla completa en escritorio. El cálculo previo contaba el avance del texto, pero omitía el margen del raster y el crecimiento del trazo. Se incorporó ese límite al ajuste y se acotan las coordenadas del sprite. Una regresión determinista verifica ocho familias, tres grosores, mayúsculas, estiramiento y palabras agrupadas en móvil y escritorio; pasó sin errores.
