import { Scene } from '../js/scene.js';
import { newProject, modelOf, phrasesOf } from '../js/project.js';
import { SAMPLE_TEXT, sampleSync, fakeEnergy } from '../js/synth.js';

const fonts = ['800 48px Nunito','900 48px Nunito','italic 900 48px "Playfair Display"','400 48px Pacifico','400 48px Anton','700 48px Caveat','900 48px Unbounded','900 48px Cinzel','400 14px "JetBrains Mono"','700 14px "JetBrains Mono"'];
async function boot() {
  await Promise.all(fonts.map((f) => document.fonts.load(f, 'AaEeOo'))).catch(() => {});
  const cv = document.getElementById('c');
  const scene = new Scene(cv);
  scene.overlays = false;
  const p = newProject();
  p.text = SAMPLE_TEXT;
  p.clip = { start: 0, end: 30 };
  p.sync = sampleSync(0);
  const q = new URLSearchParams(location.search);
  if (q.get('focus')) p.style.focus = q.get('focus');
  if (q.get('caps')) p.style.caps = q.get('caps');
  if (q.get('fx')) p.style.fxAuto = +q.get('fx');
  if (q.get('seed')) p.seed = +q.get('seed');
  scene.setEnergy(fakeEnergy(40), 0);
  scene.setData(modelOf(p));
  window.__scene = scene;
  window.__p = p;
  window.__render = (t) => scene.render(t, 'song');
  window.__tl = () => ({ units: scene.tl.units.length, lines: scene.tl.lines.length, dur: scene.tl.duration });
  document.documentElement.dataset.ready = '1';
}
boot();
window.__apply = (fn) => { fn(window.__p); window.__scene.setData(modelOf(window.__p)); };
