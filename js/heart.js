// Corazón 3D hecho solo de caracteres: superficie implícita muestreada como nube de puntos.
import { KC } from './grid.js';

let P = null;

function build() {
  const xs = [];
  const ys = [];
  const zs = [];
  const ns = [];
  // (x² + 9/4 y² + z² − 1)³ − x² z³ − 9/80 y² z³ = 0   (z hacia arriba)
  const f = (x, y, z) => {
    const a = x * x + 2.25 * y * y + z * z - 1;
    return a * a * a - x * x * z * z * z - 0.1125 * y * y * z * z * z;
  };
  const addPoint = (x, y, z) => {
    const e = 1e-3;
    let gx = f(x + e, y, z) - f(x - e, y, z);
    let gy = f(x, y + e, z) - f(x, y - e, z);
    let gz = f(x, y, z + e) - f(x, y, z - e);
    const m = Math.hypot(gx, gy, gz) || 1;
    xs.push(x);
    ys.push(y);
    zs.push(z);
    ns.push(gx / m, gy / m, gz / m);
  };
  const scan = (axis) => {
    const step = 0.03;
    const ra = axis === 0 ? [-1.5, 1.5] : axis === 1 ? [-1.0, 1.0] : [-1.4, 1.7];
    const A = axis === 0 ? 1 : 0; // ejes de la rejilla
    const B = axis === 2 ? 1 : 2;
    const lim = [
      [-1.4, 1.4],
      [-0.9, 0.9],
      [-1.4, 1.7],
    ];
    const ga = axis === 0 ? 1 : 0;
    const gb = axis === 2 ? 1 : 2;
    for (let a = lim[ga][0]; a <= lim[ga][1]; a += step) {
      for (let b = lim[gb][0]; b <= lim[gb][1]; b += step) {
        let prev = null;
        let pt = ra[0];
        for (let t = ra[0]; t <= ra[1]; t += 0.025) {
          const p = [0, 0, 0];
          p[axis] = t;
          p[ga] = a;
          p[gb] = b;
          const cur = f(p[0], p[1], p[2]);
          if (prev !== null && prev < 0 !== cur < 0) {
            const tr = pt + (t - pt) * (prev / (prev - cur));
            p[axis] = tr;
            addPoint(p[0], p[1], p[2]);
          }
          prev = cur;
          pt = t;
        }
      }
    }
  };
  scan(2);
  scan(0);
  scan(1);
  return { x: Float32Array.from(xs), y: Float32Array.from(ys), z: Float32Array.from(zs), n: Float32Array.from(ns), count: xs.length };
}

const LX = -0.42;
const LY = -0.5;
const LZ = 0.76;
const LN = Math.hypot(LX, LY, LZ);

export function warmHeart() {
  if (!P) P = build();
}

// cx, cy en celdas (centro), sizeRows = alto aproximado en filas, rotY en radianes
export function drawHeart(R, cx, cy, sizeRows, rotY, beat, alpha, tint = 0) {
  if (!P) P = build();
  const g = R.grid;
  const cols = g.cols;
  const rows = g.rows;
  const unit = ((sizeRows * R.cellH) / 2.4) * (1 + beat * 0.07);
  const cs = Math.cos(rotY);
  const sn = Math.sin(rotY);
  const tilt = 0.18;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const stamp = ++R.zStamp;
  const { zb, zs, ib, kb, touched } = R;
  let nt = 0;
  for (let k = 0; k < P.count; k++) {
    const x = P.x[k];
    const y = P.y[k];
    const z = P.z[k] - 0.12;
    // rotación alrededor del eje vertical (z de la fórmula = y de pantalla)
    const X = x * cs + y * sn;
    const Zd = -x * sn + y * cs;
    const Yv = -z;
    const Y2 = Yv * ct - Zd * st;
    const Z2 = Yv * st + Zd * ct;
    const sc = 6 / (6 - Z2);
    const gx = Math.floor(cx + (X * unit * sc) / R.cellW);
    const gy = Math.floor(cy + (Y2 * unit * sc) / R.cellH);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
    const idx = gy * cols + gx;
    if (zs[idx] !== stamp) {
      zs[idx] = stamp;
      zb[idx] = -1e9;
      touched[nt++] = idx;
      ib[idx] = 0;
    }
    if (Z2 > zb[idx]) {
      zb[idx] = Z2;
      const nx = P.n[k * 3];
      const ny = P.n[k * 3 + 1];
      const nz = P.n[k * 3 + 2];
      const nX = nx * cs + ny * sn;
      const nZd = -nx * sn + ny * cs;
      const nY = -nz;
      const nY2 = nY * ct - nZd * st;
      const nZ2 = nY * st + nZd * ct;
      let lum = Math.max(0, (nX * LX + nY2 * LY + nZ2 * LZ) / LN);
      const rim = Math.pow(1 - Math.max(0, nZ2), 2) * 0.22;
      const v = (0.13 + 0.95 * Math.pow(lum, 1.15) + rim) * alpha;
      ib[idx] = v;
      kb[idx] = lum > 0.97 ? KC.WHITE : lum > 0.66 ? KC.BLUSH : lum > 0.3 ? KC.ROSE : KC.DEEP;
    }
  }
  for (let m = 0; m < nt; m++) {
    const idx = touched[m];
    const v = ib[idx];
    if (v < 0.05) continue;
    const y = (idx / cols) | 0;
    g.put(idx - y * cols, y, v > 1.1 ? 1.1 : v, kb[idx], 1, 0);
  }
}
