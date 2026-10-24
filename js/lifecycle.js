// One owner for listeners, observers and timers created by the editor.
export class Lifecycle {
  constructor() { this.controller = new AbortController(); this.cleanups = []; }
  listen(target, event, listener, options = {}) {
    target.addEventListener(event, listener, { ...options, signal: this.controller.signal });
  }
  observe(observer, element) { observer.observe(element); this.cleanups.push(() => observer.disconnect()); return observer; }
  destroy() { this.controller.abort(); for (const cleanup of this.cleanups.splice(0)) cleanup(); }
}
