import { toast } from '../ui.js';
import { fmtTimeMs } from '../project.js';

import { GAP, r3 } from './support.js';
export function limitsClip(self, src, k) {
    const tl = self.app.scene.tl;
    const dur = self.app.clip().end - self.app.clip().start;
    if (!tl) return { lo: 0, hi: dur };
    const flat = [];
    for (const l of tl.lines) for (const w of l.words) flat.push({ src: l.src, k: w.k, on: w.onset });
    const i = flat.findIndex((x) => x.src === src && x.k === k);
    return { lo: i > 0 ? flat[i - 1].on : 0, hi: i >= 0 && i < flat.length - 1 ? flat[i + 1].on : dur };
}

export function absNow(self) {
    return self.app.clip().start + self.app.player.time(performance.now() / 1000);
}

export function paintTimeBox(self) {
    const show = !!self.sel && self.has();
    self.timeBox.hidden = !show;
    if (!show) return;
    const info = self.word();
    self.longSeg.set(info && info.w.held ? '1' : '0');
    self.paintTimeInfo();
}

export function paintTimeInfo(self) {
    if (!self.sel) return;
    const info = self.word();
    const s = self.app.project.sync[self.sel.src];
    if (!info || !s) {
      self.tInfo.textContent = '';
      self.dInfo.textContent = '';
      return;
    }
    const abs = s.wt && s.wt[self.sel.k] != null ? s.wt[self.sel.k] : info.w.onset + self.app.clip().start - (self.app.project.offset || 0);
    self.tInfo.textContent = fmtTimeMs(abs);
    if (info.line.wordMode) {
      const len = info.w.sung || 0;
      self.dInfo.textContent = `${len.toFixed(2)} s · ${info.w.held ? 'larga: se estira' : 'corta'}`;
    } else self.dInfo.textContent = 'automática (la reparto por sílabas)';
}

export function ensureWordLevel(self, src) {
    const app = self.app;
    const p = app.project;
    const ph = self.phrases()[src];
    if (!ph) return null;
    const n = ph.words.length;
    const s = p.sync[src];
    if (s && Array.isArray(s.wt) && s.wt.length === n && s.wt.every(Number.isFinite)) {
      if (!Array.isArray(s.wd)) s.wd = [];
      while (s.wd.length < n) s.wd.push(0.2);
      return s;
    }
    const line = self.line(src);
    if (!line) {
      toast('Esa frase queda fuera del tramo del paso 1. Amplía el tramo para ajustarla.');
      return null;
    }
    const clip0 = app.clip().start;
    const off = p.offset || 0;
    const hm = self.holdMin();
    const wt = line.words.map((w) => r3(w.onset + clip0 - off));
    const wd = line.words.map((w) => r3(Math.max(0.1, Math.min(w.dur || 0.2, hm - 0.05))));
    p.sync[src] = { t: wt[0], wt, wd };
    return p.sync[src];
}

export function limitsAbs(self, src, k, s) {
    const sync = self.app.project.sync;
    let lo = -Infinity;
    let hi = Infinity;
    if (k > 0) lo = s.wt[k - 1] + GAP;
    else {
      for (let i = src - 1; i >= 0; i--) {
        const q = sync[i];
        if (q && Number.isFinite(q.t)) {
          lo = (q.wt && q.wt.length ? q.wt[q.wt.length - 1] : q.t) + GAP;
          break;
        }
      }
    }
    if (k < s.wt.length - 1) hi = s.wt[k + 1] - GAP;
    else {
      for (let i = src + 1; i < sync.length; i++) {
        const q = sync[i];
        if (q && Number.isFinite(q.t)) {
          hi = q.t - GAP;
          break;
        }
      }
    }
    return { lo: Math.max(0, lo), hi };
}

export function normalizeLens(self, src) {
    const s = self.app.project.sync[src];
    if (!s || !Array.isArray(s.wt) || !Array.isArray(s.wd)) return;
    const hm = self.holdMin();
    for (let kk = 0; kk < s.wt.length; kk++) {
      const { hi } = self.limitsAbs(src, kk, s);
      if (!Number.isFinite(hi)) continue;
      const cap = hi - s.wt[kk];
      if (s.wd[kk] > cap && s.wd[kk] < hm) s.wd[kk] = r3(Math.max(0.05, cap));
    }
}

export function setStartAbs(self, src, k, tAbs, replay = true) {
    const s = self.ensureWordLevel(src);
    if (!s) return false;
    const { lo, hi } = self.limitsAbs(src, k, s);
    // una palabra larga no puede pasar encima de la siguiente; una corta se acorta para caber
    const held = (s.wd[k] || 0) >= self.holdMin();
    const top = Number.isFinite(hi) ? Math.max(lo, hi - (held ? s.wd[k] : 0.05)) : Infinity;
    const t = r3(Math.max(lo, Math.min(top, tAbs)));
    if (Math.abs(t - s.wt[k]) < 1e-6) {
      if (Math.abs(tAbs - s.wt[k]) > 0.004) self.limitToast();
      return false;
    }
    s.wt[k] = t;
    s.t = s.wt[0];
    self.afterTime(src, k, replay);
    return true;
}

export function setStartClip(self, src, k, onClip) {
    const app = self.app;
    self.setStartAbs(src, k, onClip + app.clip().start - (app.project.offset || 0));
}

export function maxLen(self, src, k, s) {
    const { hi } = self.limitsAbs(src, k, s);
    return Number.isFinite(hi) ? Math.max(0.05, hi - s.wt[k]) : 10;
}

export function setLen(self, src, k, len, replay = true) {
    const s = self.ensureWordLevel(src);
    if (!s) return false;
    const cap = self.maxLen(src, k, s);
    const v = r3(Math.max(0.05, Math.min(10, cap, len)));
    if (len > cap + 0.004 && Math.abs(v - (s.wd[k] || 0)) < 1e-6) self.limitToast();
    if (Math.abs(v - (s.wd[k] || 0)) < 1e-6) return false;
    s.wd[k] = v;
    self.afterTime(src, k, replay);
    return true;
}

export function nudge(self, dt) {
    if (!self.sel) return;
    const { src, k } = self.sel;
    const s = self.ensureWordLevel(src);
    if (!s) return;
    self.setStartAbs(src, k, s.wt[k] + dt);
}

export function nudgeLen(self, dd) {
    if (!self.sel) return;
    const { src, k } = self.sel;
    const s = self.ensureWordLevel(src);
    if (!s) return;
    self.setLen(src, k, (s.wd[k] || 0.2) + dd);
}

export function setLong(self, v) {
    if (!self.sel) return;
    const { src, k } = self.sel;
    const s = self.ensureWordLevel(src);
    if (!s) return;
    const hm = self.holdMin();
    const cur = s.wd[k] || 0.2;
    if (v) {
      const room = self.maxLen(src, k, s);
      if (room < hm + 0.02) {
        toast(`No cabe una palabra larga aquí: la que sigue empieza muy pronto. Mueve la siguiente o esta (necesita ${hm.toFixed(1)} s libres).`);
        self.longSeg.set('0');
        return;
      }
      self.setLen(src, k, Math.min(Math.max(cur, hm + 0.5), room));
    } else self.setLen(src, k, Math.min(cur, Math.max(0.1, hm - 0.15)));
}

export function nudgePhrase(self, dt) {
    if (!self.sel) return;
    const { src } = self.sel;
    const s = self.ensureWordLevel(src);
    if (!s) return;
    const first = self.limitsAbs(src, 0, s);
    const last = self.limitsAbs(src, s.wt.length - 1, s);
    const nL = s.wt.length - 1;
    const lastHeld = (s.wd[nL] || 0) >= self.holdMin();
    const minD = Number.isFinite(first.lo) ? first.lo - s.wt[0] : -Infinity;
    const maxD = Number.isFinite(last.hi) ? last.hi - (lastHeld ? s.wd[nL] : 0.05) - s.wt[nL] : Infinity;
    const d = Math.max(minD, Math.min(maxD, dt));
    if (Math.abs(d) < 1e-6) {
      self.limitToast();
      return;
    }
    s.wt = s.wt.map((x) => r3(Math.max(0, x + d)));
    s.t = s.wt[0];
    self.afterTime(src, self.sel.k);
}

export function herePress(self) {
    if (!self.sel || self.hereAt) return;
    const t = self.absNow();
    self.hereAt = { t, src: self.sel.src, k: self.sel.k };
    self.hereBtn.classList.add('down');
    self.setStartAbs(self.sel.src, self.sel.k, t, false);
}

export function hereRelease(self) {
    const hd = self.hereAt;
    if (!hd) return;
    self.hereAt = null;
    self.hereBtn.classList.remove('down');
    const held = self.absNow() - hd.t;
    if (held >= 0.3) self.setLen(hd.src, hd.k, held, false);
    // sigue con la palabra de al lado sin cortar la canción
    self.step(1, { play: false });
}

export function afterTime(self, src, k, replay = true) {
    const app = self.app;
    const s = app.project.sync[src];
    const clip0 = app.clip().start;
    const off = app.project.offset || 0;
    // la frase de atrás también puede haberse quedado sin espacio
    let prev = -1;
    for (let i = src - 1; i >= 0; i--) {
      const q = app.project.sync[i];
      if (q && Number.isFinite(q.t)) {
        prev = i;
        break;
      }
    }
    self.normalizeLens(src);
    if (prev >= 0) self.normalizeLens(prev);
    for (const i of prev >= 0 ? [src, prev] : [src]) {
      const q = app.project.sync[i];
      if (!q || !q.wt) continue;
      const hm = self.holdMin();
      q.wt.forEach((t, kk) => {
        const w = self.strip.words.find((x) => x.src === i && x.k === kk);
        if (!w) return;
        w.on = Math.max(0, t - clip0 + off);
        const len = q.wd && q.wd[kk] != null ? q.wd[kk] : 0.2;
        w.len = Math.max(0.08, len);
        w.held = len >= hm;
      });
    }
    self.strip.layout();
    app.projectChanged();
    self.paintList();
    self.paintTimeInfo();
    if (self.sel && self.sel.src === src) {
      const sw = s && s.wd ? s.wd[self.sel.k] : 0;
      self.longSeg.set((sw || 0) >= self.holdMin() ? '1' : '0');
      if (s && s.wt) self.dInfo.textContent = `${(sw || 0).toFixed(2)} s · ${(sw || 0) >= self.holdMin() ? 'larga: se estira' : 'corta'}`;
    }
    clearTimeout(self._t);
    if (replay && self.playOn && !self.hereAt) self._t = setTimeout(() => self.sel && self.preview(), 420);
}
