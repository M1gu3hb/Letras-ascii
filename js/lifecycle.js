// A media decoder may still read the previous blob while a replacement is being selected.
export function retireMediaUrl(audio, url) {
  if (!url) return;
  const events = ['emptied', 'abort', 'loadedmetadata', 'error'];
  const release = () => {
    if (audio.currentSrc === url || audio.getAttribute('src') === url) return;
    for (const event of events) audio.removeEventListener(event, release);
    URL.revokeObjectURL(url);
  };
  for (const event of events) audio.addEventListener(event, release);
}

// One owner for listeners, observers and timers created by the editor.
export class Lifecycle {
  constructor() { this.controller = new AbortController(); this.cleanups = []; }
  listen(target, event, listener, options = {}) {
    target.addEventListener(event, listener, { ...options, signal: this.controller.signal });
  }
  observe(observer, element) { observer.observe(element); this.cleanups.push(() => observer.disconnect()); return observer; }
  destroy() { this.controller.abort(); for (const cleanup of this.cleanups.splice(0)) cleanup(); }
}
