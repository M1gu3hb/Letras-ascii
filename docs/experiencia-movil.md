# Corrección de la experiencia en teléfono

Fecha: 24 de octubre de 2026 (America/Mexico_City).
Base: bf0a284f7c3fc380093e6258594ea597cf4147e6.

El reporte del usuario reveló una combinación no cubierta por el cierre anterior: teléfono + arte vertical + Marcar. Una regla posterior para el formato vertical reemplazaba `display:none` del escenario por `display:grid`. La vista previa ocupaba el espacio reservado a captura; el botón no se podía tocar porque otras zonas y las pestañas interceptaban el gesto. Se reprodujo con 390×700 y audio/texto sintéticos antes de editar. La comprobación anterior de escenarios recorría los formatos y probaba Marcar únicamente después del último (cuadrado), así que no cubría esa combinación.

## Cambios visibles

- Marcar tiene su propio espacio, independiente de la proporción elegida para el arte. En vertical, cuadrado y horizontal se ven la frase actual, un botón grande de Marcar frase/palabra, pausa, deshacer y saltar. Mientras se captura no es necesario desplazar la pantalla.
- El botón de captura tiene un fondo sólido y la acción explícita. Su posición permanece estable entre frases y después de pausar/reanudar.
- El modo por frases/palabras y la cuenta se mantienen en Ajustes de marcado. Se pueden desplegar; no se elimina ningún modo.
- En teléfono, la vista previa de los otros pasos se puede plegar con Vista. Canción, Letra y Palabras abren con el área de trabajo primero; Estilo muestra el arte. Reproducción, posición, velocidad, repetición y formato siguen disponibles.
- Campos de inicio/final del tramo en dos columnas, controles táctiles de al menos 44 px, campos de texto de 16 px y navegación de avance más compacta.
- El layout de la letra se mantiene hasta recibir el click real posterior al toque, evitando que el botón de continuar se mueva durante el gesto.

## Arranque del audio

La cuenta regresiva termina fuera del gesto que autoriza reproducción en algunos navegadores. Se prepara el mismo elemento de audio desde el toque inicial, sin adelantar audiblemente la canción. Se invalida ese inicio si se cancela la cuenta o se sale de la herramienta. Si el navegador todavía rechaza el arranque, Seguir inicia directamente dentro del siguiente gesto, sin repetir una cuenta que vuelva a bloquearlo. El modo sin cuenta también inicia dentro del gesto original.

## Comprobación

`test/mobile-capture.mjs` comprueba toques nativos (no PointerEvent creado por JavaScript) en 320×568, 360×640, 390×700, 430×932 y 844×390, cada uno con los tres formatos. Comprueba los puntos del botón con hit testing para detectar superposiciones, el guardado de tres frases, pausa/reanudación y posición estable. Incluye palabra por palabra, cuenta, una política simulada que exige gesto confiable, recuperación tras un rechazo y disponibilidad de controles de vista previa/formato/velocidad. Se ejecuta también en WebKit.

Las pruebas de políticas simuladas son una regresión controlada, no una certificación de iOS físico. Las capturas emuladas se inspeccionan como evidencia de layout. La revisión general de escritorio y tablet se conserva; las reglas de teléfono viven en `css/mobile.css` para evitar seguir mezclando excepciones en el estilo general.
