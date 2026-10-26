import { NEEDS_TIME } from './director.js';
// Se resuelve después de agrupar palabras: la salida real pertenece a la unidad visual.
export function resolveEntries(timeline, over = {}) {
  const style = timeline.style;
  const containers = timeline.focus === 'word' ? timeline.units : timeline.lines;
  for (const line of containers) {
    const last = line.words.at(-1);
    if (!last) continue;
    line.exitStart = Math.max(line.exitStart, last.onset + Math.min(.15, Math.max(.06, last.dur * .75)));
    line.hideAt = Math.max(line.hideAt, line.exitStart + line.exitDur);
    for (let k = 0; k < line.words.length; k++) {
      const w = line.words[k], own = over[`${line.src}.${w.k}`] || {};
      const next = line.words[k + 1];
      const end = Math.min(next?.onset ?? Infinity, line.exitStart + (w.exitDelay || 0), timeline.duration ?? Infinity);
      w.visualWindow = Math.max(0, end - w.onset);
      const mode = own.fx ?? style.entryFx ?? 'quick';
      const requested = own.entryMs ?? style.entryMs ?? 80;
      const effect = mode === 'auto' ? w.appear : mode === 'quick' ? 'pop' : mode;
      const limit = w.visualWindow * .25;
      const desired = mode === 'instant' ? 0 : requested / 1000;
      w.appearDur = Math.max(0, Math.min(desired, limit));
      w.entryLimited = desired > limit + .0001;
      w.requestedAppear = effect;
      w.appear = effect === 'instant' ? 'instant' : (NEEDS_TIME[effect] || 0) > w.appearDur * 5 ? 'pop' : effect;
      if (w.appearDur === 0) w.appear = 'instant';
      else if (w.appear !== effect) w.entryLimited = true;
      w.renderMode = own.mode ?? style.mainMode ?? 'ascii';
      if (style.mainFace && style.mainFace !== 'auto' && !own.face) w.face = style.mainFace;
      if (style.mainColor && style.mainColor !== 'auto' && !own.col) w.colKey = style.mainColor;
      if (w.visualWindow < .3 && !Array.isArray(own.fxs)) w.fxs = (w.fxs || []).filter(fx => fx === 'glow');
    }
  }
}
