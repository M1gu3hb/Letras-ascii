import { bootPlayer } from './player-bootstrap.js';
bootPlayer(JSON.parse(document.getElementById('payload').textContent)).catch(() => { document.getElementById('app').textContent = 'No se pudo abrir este archivo. Vuelve a exportarlo desde Letras ASCII.'; });
