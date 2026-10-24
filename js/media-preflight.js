export const abortIfNeeded = (signal) => { if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError'); };
export function mediaLimits() {
  const constrained = typeof navigator !== 'undefined' && ((navigator.deviceMemory && navigator.deviceMemory <= 4) || matchMedia('(pointer: coarse)').matches);
  return { bytes: (constrained ? 96 : 256) * 1048576, pcmBytes: (constrained ? 256 : 768) * 1048576 };
}
export function validateMedia(file, duration, limits = mediaLimits()) {
  if (!file.size) throw new Error('El archivo está vacío. Elige otro audio o video.');
  if (file.size > limits.bytes) throw new Error(`El archivo supera el límite de ${Math.round(limits.bytes / 1048576)} MB para este dispositivo. Usa un archivo más ligero o un tramo más corto.`);
  if (Number.isFinite(duration)) {
    if (duration > 1200) throw new Error('Dura más de 20 minutos. Recórtalo antes de cargarlo.');
    if (duration * 44100 * 12 > limits.pcmBytes) throw new Error('La canción necesita demasiada memoria para este dispositivo. Usa un tramo más corto o ábrela en una computadora.');
  }
}
export function probeDuration(file, signal) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    let timer;
    const finish = (error) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      const duration = audio.duration;
      audio.onloadedmetadata = null; audio.onerror = null;
      audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url);
      error ? reject(error) : resolve(duration);
    };
    const abort = () => finish(new DOMException('Carga cancelada', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    audio.onloadedmetadata = () => finish();
    audio.onerror = () => finish(); // decoding reports the useful codec error
    timer = setTimeout(() => finish(), 5000);
    audio.preload = 'metadata'; audio.src = url;
  });
}
