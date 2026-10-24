# Auditoría de Letras en ASCII

Fecha: 24 de octubre de 2026. Proyecto: Morphiq. Destino futuro: GLYPHOS.

## Dictamen

Hay un editor funcional con un motor visual considerable. Conviene conservar ese motor y reorganizar la experiencia alrededor de una tarea: crear una pieza sincronizada y entregarla a otra persona. Hoy el usuario debe entender demasiadas herramientas antes de conseguir ese resultado. La entrega por enlace todavía no existe.

Esta revisión incluye repositorio, compilación, despliegue, seis paneles del editor en escritorio, una sincronización por frases con audio sintético, ajuste fino de una palabra, descarga real y análisis del HTML exportado. **No es una certificación de todos los dispositivos ni de todos los formatos multimedia.** La prueba visual responsive y la reproducción visual del HTML exportado quedaron pendientes por las capacidades y restricciones del navegador disponible.

## 1. Repositorio, versión y conexión

- Repositorio público: https://github.com/M1gu3hb/Letras-ascii
- Rama examinada: `main`.
- Commit: `22bba13168877b93defd192f3c6cf23a4e67bcab`.
- Sitio público inspeccionado: https://letras-ascii.vercel.app/
- Equipo de Vercel: `MH Astral Systems` / `mh-astral-systems`.
- Proyecto: `letras-ascii`, ID `prj_ouMByrv7B2Ctw1WodqAcWVERXK31`.
- Producción existente: `dpl_6M6cxw4NgTGvseBHgfrQurEbGgGj`, READY.

**Conexión realizada y confirmada visualmente:** Vercel muestra `M1gu3hb/Letras-ascii` como repositorio conectado. Se preparó el build desde la raíz con `npm ci`, `node build.mjs` y salida `site/`. Node configurado: 24.x.

Se creó un despliegue de prueba desde GitHub: `dpl_3iv3b6RmyzFppE3BAB2ydUsAAcxH`. Terminó en READY y sus metadatos identifican el repositorio, `main` y el commit auditado. Es un preview; no se promovió a producción ni se cambió el contenido de la aplicación.

La herramienta de conexión automática devolvió un conflicto al intentar reutilizar el nombre existente. Se resolvió conectando el repositorio desde Settings → Git del proyecto existente. No se creó un segundo proyecto.

### Equivalencia del código

Se ejecutaron `npm ci --ignore-scripts` y `node build.mjs`. El resultado coincide con el manifiesto del despliegue público:

| Artefacto | Bytes | SHA-1, primeros 10 caracteres |
|---|---:|---|
| `app.js` | 203573 | `6de2b8d064` |
| `app.css` | 54569 | `b1382e37d5` |

La diferencia inicial de estructura era de empaquetado: producción reconstruía archivos comprimidos en trozos binarios; GitHub contiene los módulos fuente. No se detectó una divergencia en esos dos artefactos.

## 2. Qué existe y qué falta

| Función | Estado encontrado |
|---|---|
| Cargar audio local | Implementado; probado con WAV sintético de 18 s |
| Obtener audio de un video | Implementado mediante decodificación nativa del navegador; no conversión universal |
| Elegir tramo y escuchar | Implementado, onda, campos de tiempo y presets |
| Escribir letra por líneas | Implementado; probado con tres frases originales |
| Importar LRC, SRT y VTT | Implementado; parser LRC comprobado con muestra breve |
| Marcar cada frase | Probado: tres frases guardadas con tiempos |
| Marcar palabras y sostener vocales | Implementado; no se completó una pasada manual de todas las palabras |
| Corregir tiempos palabra por palabra | Probado un desplazamiento de +0.02 s |
| Ajustar arte ASCII y efectos | Panel inspeccionado; no se verificó cada combinación posible |
| Guardado automático de proyecto y canción | IndexedDB, solo en ese navegador y origen |
| Recuperar el último proyecto | Implementado; requiere volver a decodificar la canción |
| Exportar HTML autónomo | Probado: archivo de 1,680,118 bytes con tres frases, tiempos, audio y fuentes incrustadas |
| Reimportar el HTML actual | Roto: el importador espera un esquema antiguo |
| Generar enlace para enviar | No existe |
| Exportar MP4, WebM, GIF o imagen | No existe en este proyecto |
| Transcribir automáticamente la canción | No existe |
| Alinear automáticamente letra con voz real | No existe; sí hay reparto heurístico de palabras dentro de una frase |
| Cuenta y sincronización entre dispositivos | No existe |

No tratar “acepta archivos de video” como “extrae música de cualquier cosa”: depende de que el navegador pueda decodificar el contenedor y códec. No hay un transcodificador de respaldo.

## 3. Recorrido UX observado

| Paso | Salud | Observación y cambio propuesto |
|---|---|---|
| 1. Entrada al editor | Regular | Una vista previa animada y seis pestañas aparecen antes de explicar el recorrido. Añadir una frase de propósito y un primer CTA claro. |
| 2. Canción y tramo | Funcional, con fricción | Carga local y controles útiles. Conviven Escuchar, Probar, reproducción global y dos botones “aquí”. Jerarquizar una acción de escucha y una de continuar. |
| 3. Letra | Funcional | “Una frase por línea” ayuda. Los importadores y herramientas de limpieza compiten con la tarea principal. Pasarlos a opciones avanzadas. |
| 4. Marcar | Funcional | Cuenta regresiva, botón grande, pausa, recuperación y cierre de pasada están trabajados. Sostener cada palabra como modo inicial exige más destreza que tocar frases. Ofrecer modo fácil y modo preciso con demostración. |
| 5. Estilo | Sobrecargado | Siete grupos abiertos, numerosos sliders y nombres técnicos. Empezar con plantillas visuales y abrir ajustes avanzados a demanda. |
| 6. Palabras | Potente, difícil de descubrir | Corrección de tiempos y decoración comparten una pantalla muy larga. Integrar corrección en el flujo de sincronización y reservar un inspector para estilo. |
| 7. Exportar y entregar | Incompleto respecto al objetivo | Genera HTML, pero obliga al creador o destinatario a manejar archivos y hosting. Priorizar “Crear enlace”, manteniendo HTML como alternativa. |
| 8. Experiencia del destinatario | Verificación parcial | El archivo se produjo y su contenido fue validado. La vista previa abrió una URL `blob:`, cuya observación bloqueó el navegador de auditoría. No se afirma reproducción visual verificada. |

### Problemas de interacción con más impacto

1. **No hay una ruta continua suficientemente visible.** Las pestañas representan herramientas, pero no hacen evidente qué falta para llegar al resultado. Añadir estado de avance, siguiente acción y retorno sin perder trabajo. No bloquear la exploración innecesariamente.
2. **La sincronización está separada de su corrección.** “Marcar” captura y “Palabras” corrige. El usuario necesita un mismo espacio con capturar, escuchar, corregir y repetir una frase.
3. **La personalización exige demasiadas decisiones.** El usuario quiere que se vea bien; no necesariamente quiere ajustar detalle de rejilla, peso, relleno, umbral de palabra larga y aleatoriedad. Ofrecer primero 5–8 estilos completos.
4. **Vista previa y transporte no siempre comunican el mismo estado.** La demo visual avanza mientras el contador está detenido; en Estilo el arranque vuelve a moverse sin sonido. Está explicado en texto, pero debería ser evidente junto a los controles: Ejemplo, Previsualización silenciosa o Reproducción real.
5. **Entrega demasiado técnica.** Pedirle a quien recibe el detalle que descargue HTML, lo abra desde Archivos o use hosting añade un obstáculo justo al momento emocional del producto.
6. **Texto demasiado dirigido a una pareja mujer.** “Verlo como lo verá ella” cierra otros usos. Cambiar a “Vista del destinatario” y plantillas para pareja, amistad, felicitación, homenaje y uso libre. La estética romántica puede seguir siendo una plantilla.

## 4. Fallos y riesgos técnicos priorizados

### P1 — Reimportación incompatible con la exportación actual: confirmado

`js/import.js:8` exige `payload.lines`. `js/export.js:32` genera `v:3`, `text` y `sync`. Se probó con el HTML realmente descargado: el importador rechazó el archivo diciendo que todavía no trae letra, aunque contiene las tres frases.

**Arreglo:** aceptar y validar v3, conservar adaptador para versiones antiguas y dar errores que distingan archivo incompatible de archivo vacío. Añadir prueba de ida y vuelta exportar → reimportar.

### P1 — El contador de exportación puede aprobar un tramo sin letra visible: confirmado

`exportReady()` cuenta marcas globales; `buildTimeline()` elimina las que quedan fuera del tramo. Reproducción aislada: una frase en segundo 1 y tramo 10–18 produce `done:1, phrases:1` en la preparación de exportación, pero cero líneas renderizables.

**Arreglo:** calcular frases exportables dentro del tramo usando los mismos criterios que el motor; mostrar cuáles quedan fuera y bloquear una salida vacía. Distinguir “marcada” de “incluida en este tramo”.

### P1 — Riesgo de perder las últimas ediciones al cambiar de proyecto: identificado en código

`saveSoon` espera 700 ms y después usa `this.id` y `this.project`. `newAndReset()` y `openProject()` cambian esas referencias sin volcar antes el guardado pendiente. Una edición seguida rápidamente de Nuevo o abrir otro proyecto puede dejar la edición anterior sin persistir. No se ejecutó una reproducción destructiva sobre proyectos existentes.

**Arreglo:** guardar una instantánea asociada al ID original y esperar su confirmación antes de cambiar; cubrir cierre/ocultación y comunicar “Guardando…” de forma veraz.

### P1 — Consumo de memoria sin control preventivo: riesgo de código

`loadMedia()` lee el archivo completo y lo decodifica antes de comprobar los 20 minutos máximos. Mantiene canales PCM, mezcla mono y copias WAV. A 44.1 kHz, 20 minutos de estéreo Float32 más una mezcla mono representan aproximadamente 635 MB decimales, antes del archivo original, buffers temporales y WAV.

**Arreglo:** límite preventivo por tamaño, política de duración por dispositivo, cancelación y procesamiento fuera del hilo principal donde sea viable. Probar contenedores/códecs con muestras reales. No prometer soporte universal.

### P2 — Importar o limpiar tiempos también puede afectar estilo

Los importadores reemplazan letra y tiempos sin reconciliar explícitamente los overrides existentes. Estos se indexan por posición y pueden acabar aplicados a nuevas palabras. “Quitar todas las marcas de tiempo” también limpia `over`, aunque el mensaje de confirmación solo explica que la letra permanece.

**Arreglo:** separar datos de sincronización y estilo; mostrar qué se conserva, migra o elimina. Ofrecer deshacer.

### P2 — Lista de proyectos lee todos los archivos de música

`js/store.js:44` usa `getAll()` en un almacén que mezcla metadatos y blobs. Para listar títulos recupera también todos los audios guardados.

**Arreglo:** almacenes separados o índice para consultar únicamente registros de proyecto y metadatos de tamaño.

### P2 — No hay una suite ejecutable estándar

Hay 36 scripts `.mjs` en `test/`, pero `npm test` ejecuta el placeholder que falla. Varios scripts dependen de `/opt/pw-browsers/chromium`, una ruta específica. No se considera esa colección una suite verde por existir.

**Arreglo:** seleccionar pruebas de regresión del recorrido principal, parametrizar navegador/servidor y añadir comandos reproducibles. Priorizar guardado, cambio de tramo, importación/exportación y errores de medios.

### P2 — Preparación para GLYPHOS todavía incompleta

La app usa listeners globales, un intervalo recurrente, `requestAnimationFrame`, URLs de blobs y estado global de diagnóstico. No se encontró un ciclo público completo de `destroy()` para desmontarla. Las claves de localStorage como `last` y `format` no están agrupadas bajo un prefijo propio. La exportación busca `app.js`, `app.css` y fuentes mediante rutas relativas.

**Arreglo:** módulo montable/desmontable, configuración explícita de rutas de assets, almacenamiento con namespace y exportación con su propio bundle de reproducción. Probarlo bajo una subruta antes de integrarlo.

### P3 — Deuda y consumo residual

- `js/sync.js` y `js/demo.js` no son alcanzables desde `main.js`; son candidatos a archivar después de confirmar su propósito.
- `Player.keepAwake()` adquiere Wake Lock pero no lo libera explícitamente al pausar o terminar. Revisar consumo de batería.
- El HTML exportado incrusta el bundle completo del estudio. Un reproductor independiente reduciría tamaño y complejidad.
- No hay README operativo que explique arquitectura, formatos, build, pruebas y despliegue.

## 5. Responsive y accesibilidad: evidencia y pendientes

**Verificación visual efectuada:** escritorio Chrome, viewport medido de 1363 × 936. Se inspeccionaron entrada, letra, canción cargada, preparación de marcado, cierre de marcado, estilo, palabras y exportación.

El navegador disponible no expone una función documentada para cambiar el viewport. Los intentos de atajo de DevTools no modificaron el viewport observado. Un archivo auxiliar local para estudiar dimensiones fue rechazado por la política de protocolos; no se utilizó para obtener resultados. Por tanto, las filas siguientes son análisis de reglas CSS y plan de validación, no capturas de dispositivos probados.

| Tamaño a validar | Regla de diseño existente | Riesgo a revisar en prueba real |
|---|---|---|
| 360 × 800 | Una columna; seis pestañas inferiores; tipografía de pestañas 10.5 px por debajo de 380 px | Densidad, lectura de pestañas y espacio útil para controles |
| 390 × 844 | Una columna, vista previa variable por pestaña | Se ocultan vista previa y pestañas al enfocar textarea; salida con teclado virtual |
| 430 × 932 | Igual patrón móvil; controles táctiles ampliados | Paneles extensos de Estilo y Palabras, scroll y alcance |
| 768 × 1024 | Tablet vertical recibe el patrón de una columna | Uso del ancho disponible y exceso de scroll |
| 1024 × 768 | Dos columnas | Espacio disponible para el inspector y la línea de tiempo |
| 844 × 390 | Reglas especiales de poca altura | Pestañas horizontales desplazables y jerarquía de acciones |
| 1363 × 936 | Dos columnas | Inspeccionado visualmente; panel de trabajo estrecho frente a la vista previa |
| 1920 × 1080 | Dos columnas | Uso del espacio y legibilidad del arte/inspector |

### Fortalezas de accesibilidad observadas o presentes en código

- Controles con nombres accesibles, foco visible y etiquetas en los deslizadores.
- Cuenta regresiva y estado de marcado con comunicación de estado.
- Alternativas mediante campos numéricos y botones para parte de las operaciones de onda/timeline.
- Ajustes táctiles de tamaño y safe areas previstos en CSS.
- Se evita renderizar la escena oculta durante el marcado móvil.

### Aspectos a corregir o verificar

- `tablist` sin patrón completo de foco y flechas; mejorar semántica de pestañas y paneles.
- El modal de proyectos mueve el foco al abrir, pero no implementa un bloqueo completo del fondo ni restauración explícita de foco.
- La letra final y gran parte de la experiencia del destinatario viven en canvas; faltan alternativa semántica y controles DOM de reproducción.
- `prefers-reduced-motion` elimina transiciones CSS y la demo del estudio, pero no equivale a un modo de animación reducida completo del motor y del reproductor exportado.
- Texto secundario y detalles del ASCII tienen contraste visual bajo en varias capturas. No se midieron todos los contrastes ni se certifica WCAG.
- Falta prueba con lector de pantalla, teclado virtual real, zoom, táctil físico, iOS Safari, Android y dispositivos de menor rendimiento.

## 6. Mapa de archivos para continuar el desarrollo

La aplicación usa JavaScript modular, DOM y Canvas 2D, con esbuild. No usa React ni Next.js. No necesita backend para la edición local actual.

| Archivo | Responsabilidad |
|---|---|
| `js/main.js` | Arranque; decide estudio o reproductor por payload |
| `js/studio.js` | Orquesta paneles, escena, transportes, proyecto, almacenamiento y pantalla completa |
| `js/project.js` | Modelo v3, defaults, normalización, frases, reconciliación y adaptación al motor |
| `js/project-palettes.js` | Paletas de proyecto |
| `js/store.js` | IndexedDB de proyectos y archivos |
| `js/panel-song.js` | Carga, onda, escucha y selección del tramo |
| `js/audio.js` | Decodificación, mezcla, resampling, WAV y plan de calidad |
| `js/analyze.js` | FFT, energía por bandas, golpes, picos y codificador WAV |
| `js/wave.js` | Dibujo e interacción de onda y rango |
| `js/panel-text.js` | Letra, mensajes de entrada/salida e importadores |
| `js/import.js` | Parseo HTML antiguo, LRC, SRT y VTT |
| `js/panel-mark.js` | Máquina de estados de captura, cuenta, presión, pausa, deshacer y recuperación |
| `js/panel-style.js` | Ajustes globales del ASCII, efectos, fondos y sincronía |
| `js/panel-words.js` | Inspector por palabra y frase, tiempos y overrides |
| `js/strip.js` | Timeline interactiva de palabras |
| `js/panel-export.js` | Resumen, advertencias y acciones de exportación |
| `js/export.js` | Payload v3 y HTML autónomo con audio y fuentes incrustadas |
| `js/player.js` | Reloj, reproducción, intro/final, demo y loop visual |
| `js/timeline.js` | Traduce frases y tiempos a líneas y palabras renderizables |
| `js/director.js` | Selección y programación de animaciones/efectos |
| `js/scene.js` | Composición, layout y render de escena |
| `js/grid.js` | Rejilla ASCII y renderizado de caracteres |
| `js/type.js` | Tipografías, métricas, sprites y geometría de palabras |
| `js/fx.js` | Animación y efectos de palabras |
| `js/bg.js` | Fondos y ambientes |
| `js/heart.js` | Elementos visuales de corazón |
| `js/synth.js` | Texto de muestra, tiempos automáticos y energía de demostración |
| `js/ui.js` | Construcción DOM, controles comunes, debounce, avisos y descargas |
| `js/util.js` | Matemáticas y utilidades deterministas |
| `js/sync.js` | Sincronizador anterior; no importado desde el arranque actual |
| `js/demo.js` | Demo anterior; no importada desde el arranque actual |
| `css/style.css` | Estudio, paneles, reproductor, responsive y ajustes de accesibilidad |
| `build.mjs` | Bundle JS/CSS y copia de 12 fuentes a `site/` |
| `template.html` | Plantilla de HTML del proyecto; contrastar con el HTML generado antes de cambiar |
| `deploy/pack.mjs` | Empaquetado Brotli en trozos para la publicación manual anterior |
| `deploy/vercel-build.mjs` | Reconstrucción del empaquetado anterior y descarga de fuentes |
| `deploy/index.html`, `deploy/package.json` | Entrada/configuración del despliegue manual anterior |
| `package.json`, `package-lock.json` | Dependencias y comandos; falta normalizar build/test |
| `test/` | 36 scripts `.mjs`, harness HTML/JS y utilidades; revisar portabilidad y relevancia |
| `.gitignore` | Excluye builds, dependencias y medios personales |

31 módulos JavaScript. Los paneles de marcado y palabras superan las 1100 líneas cada uno. Dividirlos por responsabilidades cuando se cambie la UX, sin reescribir el motor visual de golpe.

### Flujo de datos

Archivo local → `audio.js` / `analyze.js` → medio y energía.

Letra + marcas + estilo → `project.js` → `timeline.js` → `director.js` → `scene.js` / `grid.js` / `type.js` / `fx.js` / fondos.

`player.js` aporta el reloj de audio. `studio.js` coordina y guarda con `store.js`. `export.js` empaqueta proyecto, energía, audio, fuentes y código para que `main.js` arranque como reproductor.

## 7. Plan de mejora propuesto

### Prioridad 1: fiabilidad del recorrido

1. Corregir reimportación v3 y validación de frases dentro del tramo.
2. Asegurar guardado antes de Nuevo/abrir otro proyecto y añadir deshacer coherente.
3. Normalizar build/test y documentar el proyecto.
4. Cerrar matriz responsive con capturas actuales y probar audio/video, errores y memoria en dispositivos representativos.

### Prioridad 2: simplificar la UX conservando el motor

Organizar el flujo en cuatro etapas: **Audio → Letra y sincronización → Diseño → Compartir**.

- Audio: carga, tramo recomendado corto, escucha y continuar.
- Letra/sincronización: pegar, separar frases, modo fácil por frases, modo preciso por palabras, reproducción y corrección en el mismo lugar.
- Diseño: plantillas completas, muestra inmediata y ajustes avanzados cerrados al inicio. Inspector contextual al elegir una palabra.
- Compartir: vista del destinatario, comprobación final y resultado listo para enviar.

Mantener edición libre para usuarios avanzados. No hacer obligatorio personalizar todas las palabras.

### Prioridad 3: funciones que amplían el resultado

1. Enlace de reproducción con acceso y eliminación definidos por el creador. Requiere backend/almacenamiento: antes de publicar debe explicarse que audio y letra sí saldrán del dispositivo.
2. Exportación de video para compartir directamente en mensajería y redes. Probar formatos y compatibilidad; HTML sigue como salida offline.
3. Plantillas por intención, duplicar proyecto/frase, copiar estilos, edición múltiple y biblioteca de proyectos con miniaturas.
4. Importar/exportar proyecto editable versionado para respaldo y traslado entre dispositivos.
5. Alineación asistida de letra con audio, solo después de que el flujo manual sea sencillo. No confundir detectar golpes musicales con identificar palabras cantadas.

### Prioridad 4: integración en GLYPHOS

Hacer primero que el producto independiente funcione bien. Después extraer un módulo con contratos claros de proyecto, render y exportación; añadir desmontaje, namespaces y rutas configurables. Separar editor y reproductor. Definir migración de IndexedDB: los proyectos locales del dominio actual no aparecen automáticamente en el origen de GLYPHOS.

Un iframe puede servir como puente de aislamiento, pero no debe confundirse con una integración terminada: navegación, almacenamiento, accesibilidad y exportación siguen necesitando resolución.

## 8. Verificaciones y límites

**Completado:** clonación y mapeo, build local, equivalencia JS/CSS, conexión Git, preview READY desde GitHub, recorrido de paneles en escritorio, sincronización de tres frases, ajuste de una palabra, descarga HTML, contenido incrustado validado, fallo de reimportación reproducido y validación fuera de tramo reproducida.

**Resultado de pruebas:** `npm test` falla porque es el placeholder inicial. No se ejecutaron los 36 scripts de navegador ni se presentan como aprobados.

**Pendiente:** prueba visual de la matriz responsive, pasada completa de marcado por palabra, formatos reales de video/códecs, Safari/iOS, rendimiento de móviles, lector de pantalla y reproducción visual del exportado. El navegador de auditoría solo permitió observar páginas HTTP/HTTPS; bloqueó la vista `blob:` del exportado.

**Cambios efectuados:** configuración de build y vínculo Git en Vercel; preview de validación. No se editaron fuentes del repositorio, no se publicaron nuevas funciones y la producción permanece en el despliegue anterior.

**Recomendación de decisión:** el siguiente trabajo debe ser fiabilidad + recorrido de cuatro etapas. Añadir más efectos antes de resolver sincronizar, corregir y compartir aumenta el número de controles que el usuario tendrá que aprender.
