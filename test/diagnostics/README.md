# Diagnósticos manuales

Scripts antiguos de diagnóstico y captura. No forman parte de `npm test` ni de las suites oficiales de `scripts/test-browser.mjs`, y CI no los ejecuta.

Ejecútalos desde la raíz del repositorio, después de `npm run build`, con `node test/diagnostics/<nombre>.mjs`.

Las capturas van a `test/` o `test/audit/`, excluidas de Git. `harness.html` y `harness.js` son auxiliares: el HTML carga `../../dist/harness.js`, que el build no genera.
