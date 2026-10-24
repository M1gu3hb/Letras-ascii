import { getPreference as lsGet, setPreference as lsSet } from '../storage/preferences.js';
export const HEX = { white: '#ffffff', cream: '#ffecde', blush: '#ffc4c4', rose: '#ff7096', pink: '#ff4fd8', ruby: '#e0245e', orange: '#ff8a3d', amber: '#ffb26c', gold: '#ffd75e', mint: '#7dffc4', cyan: '#4fe3ff', ice: '#cfeeff', violet: '#9a7bff', lav: '#c3b4ee' };
export const PALKEY = { edge: 5, self: 4, classic: 0 };
export const PALBACK = { 5: 'edge', 4: 'self', 0: 'classic' };
export const GAP = 0.06; // separación mínima entre palabras (igual que el motor)
export const r3 = (x) => Math.round(x * 1000) / 1000;


// botón que repite mientras se mantiene presionado (ajustes finos con el dedo o el mouse)
export function holdRepeat(btn, fn, scope) {
  let t1 = 0;
  let t2 = 0;
  const stop = () => {
    clearTimeout(t1);
    clearInterval(t2);
    t1 = t2 = 0;
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  scope?.cleanups.push(stop);
  btn.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button > 0) return;
    e.preventDefault();
    stop();
    fn();
    t1 = setTimeout(() => {
      t2 = setInterval(() => {
        if (!btn.isConnected) return stop();
        fn();
      }, 85);
    }, 380);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // teclado: una vez por pulsación
  btn.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      fn();
    }
  });
  return btn;
}


export { lsGet, lsSet };
