# Reauditoría de la primera reparación

Fecha local del cliente: 24 de octubre de 2026. Base revisada: `c8b6ce5d8408dc6ce1a250025cbc535d4ca35545`, confirmada en `main` y en el dominio de producción antes de modificar fuentes.

## Dictamen sobre el informe anterior

La reparación sí había sido integrada y desplegada; no quedó solamente en una rama. La batería anterior volvió a pasar al comienzo de esta revisión. Sin embargo, esa batería no cubría todas las carreras de escritura, la cancelación de recuperación, entradas malformadas ni todos los estados del destinatario. El informe anterior fue demasiado amplio al dar por cerrados todos los fallos de interacción. Esta revisión añade regresiones independientes y corrige los casos siguientes.

## Hallazgos nuevos y correcciones

| Hallazgo | Reparación y evidencia |
|---|---|
| Un segundo flush podía responder true tras el fallo del primero, con un guardado pendiente | El lote se toma al ejecutar la cola y el éxito exige que no queden cambios pendientes. Reproducción anterior: false / true / pending=1. Regresión unitaria. |
| El autosave conservaba instantáneas de todos los proyectos ya guardados | Se liberan al confirmar la última revisión. Regresión de 20 proyectos. |
| Cancelar la recuperación vaciaba el audio y devolvía éxito | La apertura prepara proyecto y medios sin reemplazar el estado actual hasta terminar. Cancelar descarta el resultado y conserva el medio anterior. |
| Aperturas solapadas podían aplicar un resultado antiguo | Un controlador por operación valida cada paso; únicamente se aplica la operación vigente. |
| Tras fallar la persistencia de una canción nueva se podía reutilizar un blob anterior | Identificador de medio compartido entre metadatos y blob; se rechaza una pareja incoherente y se pide elegir el archivo. |
| Un HTML con mensajes/overrides inválidos podía contaminar el motor | Normalización de tipos, opciones y rangos; las marcas null antiguas ya no se convierten a cero. |
| Una exportación lenta podía mezclar letra, audio, tramo y nombre de revisiones distintas | Instantánea desde el clic, exclusión de exportaciones duplicadas y prueba que cambia el proyecto mientras se esperan recursos. |
| Al reimportar un tramo no nulo faltaba su origen temporal | `sourceStart` en nuevos HTML; recuperación automática con opción de inicio manual para compatibilidad. |
| Faltaba el deshacer solicitado para reemplazos y limpieza de tiempos | Respaldo inmediato, restauración completa del cambio e invalidación al editar después. |
| La audición diferida de una palabra podía arrancar en otra herramienta | Cancelación al salir, reset y destroy, más guardas en la llamada. |
| Vaciar la lista de efectos automáticos volvía a permitirlos todos | Se distingue una lista vacía de una configuración ausente. |
| Refinar palabras figuraba como opcional pero el avance lo imponía | Diseño puede continuar a Exportar; se conserva la herramienta completa y el regreso al paso de origen. |
| Repetir una frase borraba su marca antes de terminar la cuenta | La sustitución se aplaza hasta comenzar; cancelar conserva las marcas y al iniciar existe respaldo. Se expone el regreso desde la corrección de palabras. |
| Seek del destinatario durante intro/final no se reflejaba en su estado | Seek pasa a pausa y conserva la posición para reproducir. |
| Volver mediante caché de navegación podía dejar el destinatario destruido | `pagehide.persisted` conserva reproductor/URL y pausa solo si suena; `pageshow` actualiza el tamaño y los controles. |
| Solicitudes de reproducción o Wake Lock solapadas podían interferirse | Generación de reproducción, una solicitud de Wake Lock simultánea y liberación vinculada a su propio sentinel. |
| El estado de carga dejaba controles de fondo accesibles al teclado | Diálogo estable, fondo inerte, foco contenido, Escape/Cancelar y devolución del foco. |
| El primer toque en Continuar podía perderse al salir del textarea móvil | El layout de edición se conserva entre pointerdown y click; el botón no se mueve al perder foco la letra. Regresión con reducción y ampliación del viewport. |
| La ayuda de zoom se apilaba en una columna estrecha en teléfono y algunos signos no tenían glifo | Ayuda táctil en una fila propia y operadores compatibles con las fuentes incluidas. |
| Semántica de panel duplicada y recursos residuales | Un panel accesible activo; limpieza de audición, contexto de cuenta y desmontaje probado con remontaje. |

## Trazabilidad de la auditoría original

| Punto original | Estado de esta revisión |
|---|---|
| P1: ida y vuelta v3 | Parser + importación real, estilos, duraciones y origen del tramo verificados. |
| P1: exportar un tramo sin letra | Se conserva el bloqueo por contenido realmente renderizable; prueba integral. |
| P1: guardar antes de cambiar | Se cubren IDs/instantáneas, errores, escritura antigua y flushes solapados. |
| P1: memoria de medios | Se mantienen límites preventivos, worker, cancelación y descarte. Sigue dependiendo del decodificador y recursos del navegador. |
| P2: importación, estilo y deshacer | Normalización, limpieza coherente y deshacer comprobados. |
| P2: listado sin blobs | Índice y migración conservados; regresión de almacenamiento. |
| P2: pruebas estándar | Lint, unitarias, build, 12 suites de navegador y segundo motor WebKit en CI. |
| P2: preparación para incrustar | Prefijo, desmontaje, recursos desde subruta y constructor remontable probados. La integración real en GLYPHOS sigue siendo una etapa separada. |
| P3: deuda, batería y empaquetado | Archivos obsoletos retirados, reproductor propio, Wake Lock y documentación. |
| Recorrido y corrección | Avance guiado, modo por frases, corrección opcional y recaptura de frase accesible. |
| Propuesta de cuatro etapas | Se conservan seis herramientas para respetar la interfaz y las funciones existentes; el camino principal puede omitir el ajuste fino. No se presenta como una implementación literal de cuatro pestañas. |
| Plantillas completas por intención | No se añadieron; se conservan los ajustes ASCII existentes. Forman parte de funciones nuevas. |
| Enlaces, video, alineación y GLYPHOS | Pospuestos según el alcance acordado. No se dan por terminados por aparecer en el plan original. |

## Procedimiento y límites

Las Critical Overrides se revisaron como reglas del proceso: respetar el producto y sus fuentes, capturar el estado actual, usar el navegador y su autorización previa de CLI, verificar antes de publicar y no sustituir esta corrección por un rediseño. No son un módulo de la aplicación.

Se capturó el recorrido actual en producción con canción y letra sintéticas; se completó una pasada de tres frases. Las pruebas adicionales usan perfiles vacíos y fallos controlados, no archivos del usuario. Se probaron localmente MP3, MP4/AAC y WebM/Opus de tres segundos generados con FFmpeg. El resto de formatos, el rendimiento de hardware móvil, el teclado virtual real, lectores de pantalla y Safari/iOS físicos requieren pruebas específicas; no se deducen de un viewport emulado. WebKit automatizado tampoco equivale a Safari físico.

Las ejecuciones de cierre, SHA final, despliegue y capturas aceptadas se registran en el informe entregado y en el PR. No se reclama que las pruebas enumeren todos los errores posibles.
