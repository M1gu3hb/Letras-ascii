import { analyzePCM, peaksOf } from './analyze.js';
self.onmessage = async ({ data: { mono, sr, count } }) => {
  try {
    const peaks = peaksOf(mono, count);
    const energy = await analyzePCM(mono, sr, (progress) => self.postMessage({ progress }));
    self.postMessage({ mono, peaks, energy }, [mono.buffer, peaks.buffer, energy.low.buffer, energy.mid.buffer, energy.hi.buffer, energy.hit.buffer]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
