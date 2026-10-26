# Presentación del destinatario

La exportación conserva el diseño artístico original: corazón animado, frase de introducción y un pequeño «toca para empezar». La animación ocupa toda la ventana. El destinatario toca la obra para reproducir, pausar, continuar o volver a empezar al terminar.

El HTML descargado y Vista del destinatario usan exactamente el mismo documento. No incluyen panel inferior, línea de tiempo, reloj, botones permanentes ni cajón de letra visibles. El transporte y las herramientas de precisión pertenecen al editor.

El karaoke inferior se dibuja directamente sobre la animación, sin rectángulo negro. Se conservan las medidas del texto, el subrayado y la geometría, tamaño y movimiento de la bolita.

El lienzo sigue siendo una acción accesible por teclado: Enter y Espacio controlan la reproducción. La letra y el estado siguen disponibles para lectores de pantalla sin añadir elementos visuales al diseño. Mantener Espacio no alterna repetidamente entre reproducir y pausar.

Compartir por enlace queda fuera de este cambio por decisión del usuario. El resultado se comparte enviando el HTML descargado; la vista previa es para revisarlo en el navegador actual.

## Verificación

`test/recipient-design.mjs` descarga un HTML real, compara sus bytes con la vista del destinatario y prueba teléfono, horizontal y escritorio. Comprueba ausencia de controles, tamaño completo del lienzo, reproducción/pausa/reinicio nativos por toque o ratón, teclado y transparencia del karaoke tanto normal como ASCII. La prueba de transparencia conserva un color de fondo conocido en una esquina de la franja; la bolita se contrasta con las medidas de la palabra activa.

Las regresiones de fiabilidad, reauditoría, lectura y fronteras verifican el nuevo contrato: el archivo no tiene timeline, la letra accesible corresponde al tramo y se conservan el audio, los tiempos y la recuperación de navegación. La suite visual se ejecuta al comienzo de ambas tareas de CI.
