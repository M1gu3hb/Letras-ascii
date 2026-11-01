import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDrops } from '../../js/drops.js';
import { fakeEnergy } from '../../js/synth.js';

const FPS = 50;

// energía sintética: `sections` = [[desde_s, hasta_s, low, mid]]; el resto queda en silencio. Un golpe al inicio de cada sección fuerte.
function make(seconds, sections, hitAt = []) {
  const n = Math.round(seconds * FPS);
  const low = new Uint8Array(n);
  const mid = new Uint8Array(n);
  const hi = new Uint8Array(n);
  const hit = new Uint8Array(n);
  for (const [a, b, l, m] of sections) {
    for (let i = Math.round(a * FPS); i < Math.min(n, Math.round(b * FPS)); i++) {
      low[i] = l;
      mid[i] = m;
    }
  }
  for (const s of hitAt) hit[Math.round(s * FPS)] = 100;
  return { fps: FPS, low, mid, hi, hit };
}

const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

test('silencio y de pronto fuerte: un drop justo en la transición', () => {
  const { drops, intensity } = analyzeDrops(make(20, [[8, 20, 90, 70]], [8.04]));
  assert.equal(drops.length, 1);
  assert.ok(near(drops[0], 8), `cayó en ${drops[0]}`);
  assert.equal(intensity.length, 1000);
  assert.ok(intensity[100] < 0.05, 'en silencio la intensidad es casi 0');
  assert.ok(intensity[999] > 0.9, 'a todo volumen la intensidad es casi 1');
});

test('el drop se pega al golpe de graves cercano', () => {
  const { drops } = analyzeDrops(make(20, [[8, 20, 90, 70]], [8.1]));
  assert.equal(drops.length, 1);
  assert.ok(Math.abs(drops[0] - 8.1) < 0.021, `cayó en ${drops[0]}`);
});

test('volumen constante: ningún drop', () => {
  const { drops } = analyzeDrops(make(40, [[0, 40, 60, 50]]));
  assert.equal(drops.length, 0);
});

test('un bombo constante (golpes periódicos) no cuenta como drop', () => {
  const e = make(40, []);
  for (let i = 0; i < e.low.length; i++) {
    const ph = ((i / FPS) % 0.5) / 0.5;
    e.low[i] = Math.round(100 * Math.exp(-ph * 6));
    e.mid[i] = Math.round(25 + 10 * Math.exp(-ph * 5));
    if (i % 25 === 0) e.hit[i] = 100;
  }
  assert.equal(analyzeDrops(e).drops.length, 0);
});

test('una subida lenta y gradual (build-up) no es un drop', () => {
  const e = make(30, []);
  for (let i = 0; i < e.low.length; i++) {
    e.low[i] = Math.round(10 + 80 * (i / e.low.length));
    e.mid[i] = Math.round(10 + 60 * (i / e.low.length));
  }
  assert.equal(analyzeDrops(e).drops.length, 0);
});

test('dos subidas lejanas: dos drops', () => {
  const e = make(40, [[8, 15, 90, 70], [26, 34, 95, 75]], [8.02, 26.02]);
  const { drops } = analyzeDrops(e);
  assert.equal(drops.length, 2);
  assert.ok(near(drops[0], 8), `primero en ${drops[0]}`);
  assert.ok(near(drops[1], 26), `segundo en ${drops[1]}`);
  assert.ok(drops[0] < drops[1]);
});

test('subidas más juntas que la separación mínima: un solo drop', () => {
  const e = make(30, [[8, 9.5, 90, 70], [11.5, 20, 90, 70]], [8.02, 11.52]);
  const { drops } = analyzeDrops(e);
  assert.equal(drops.length, 1);
});

test('un golpe suelto (un solo cuadro fuerte) no es un drop', () => {
  const e = make(20, [[0, 20, 20, 20]]);
  for (let i = 400; i < 405; i++) {
    e.low[i] = 100;
    e.mid[i] = 90;
  }
  assert.equal(analyzeDrops(e).drops.length, 0);
});

test('no hay más de 8 drops', () => {
  const sections = [];
  for (let k = 0; k < 14; k++) sections.push([5 + k * 8, 9 + k * 8, 95, 80]);
  const { drops } = analyzeDrops(make(5 + 14 * 8 + 4, sections));
  assert.ok(drops.length <= 8 && drops.length >= 5, `hay ${drops.length}`);
  for (let k = 1; k < drops.length; k++) assert.ok(drops[k] - drops[k - 1] >= 7);
});

test('entrada vacía, mínima o rara no lanza', () => {
  for (const e of [null, undefined, {}, { fps: 50 }, { fps: 50, low: [], mid: [], hi: [], hit: [] }, { fps: 50, low: [5], mid: [5], hi: [5], hit: [0] }, make(0.5, [[0, 0.5, 100, 100]])]) {
    const r = analyzeDrops(e);
    assert.equal(r.drops.length, 0);
    assert.ok(r.intensity.length <= 25);
  }
  // sin `hit` también funciona
  const e = make(20, [[8, 20, 90, 70]]);
  delete e.hit;
  assert.equal(analyzeDrops(e).drops.length, 1);
});

test('es determinista y la intensidad queda en 0..1', () => {
  const e = make(40, [[8, 15, 90, 70], [26, 34, 95, 75]], [8.02, 26.02]);
  const a = analyzeDrops(e);
  const b = analyzeDrops(e);
  assert.deepEqual([...a.drops], [...b.drops]);
  assert.deepEqual([...a.intensity], [...b.intensity]);
  for (const v of a.intensity) assert.ok(v >= 0 && v <= 1);
});

test('la energía de ejemplo del editor tiene un drop claro cerca del 40 %', () => {
  const secs = 30;
  const e = fakeEnergy(secs);
  const { drops, intensity } = analyzeDrops(e);
  assert.equal(drops.length, 1, `drops: ${[...drops]}`);
  assert.ok(drops[0] > secs * 0.34 && drops[0] < secs * 0.48, `cayó en ${drops[0]}`);
  // tranquilo al principio, a todo después del drop
  assert.ok(intensity[Math.round(2 * FPS)] < 0.5);
  assert.ok(intensity[Math.round((drops[0] + 3) * FPS)] > 0.6);
  // y es la misma cada vez
  assert.deepEqual([...fakeEnergy(secs).low], [...e.low]);
});
