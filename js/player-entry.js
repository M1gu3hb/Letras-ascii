import { bootPlayer } from './player-bootstrap.js';
bootPlayer(JSON.parse(document.getElementById('payload').textContent)).catch(() => {
  // sin corazón de carga eterno: un mensaje claro
  const app = document.getElementById('app');
  document.documentElement.classList.add('failed');
  app.className = '';
  app.textContent = 'No se pudo abrir este archivo. Vuelve a exportarlo desde Letras ASCII.';
});
