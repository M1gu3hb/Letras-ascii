// A pending save owns its project ID and immutable snapshot, never the active tab.
export class Autosave {
  constructor(write, onState = () => {}, delay = 500) {
    this.write = write;
    this.onState = onState;
    this.delay = delay;
    this.pending = new Map();
    this.latest = new Map();
    this.queue = Promise.resolve(true);
  }
  schedule(id, project) {
    const snapshot = structuredClone(project);
    this.pending.set(id, snapshot);
    this.latest.set(id, snapshot);
    this.onState('pending', id);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }
  save(id, project) { this.schedule(id, project); return this.flush(); }
  flush() {
    clearTimeout(this.timer);
    this.queue = this.queue.then(async () => {
      // Read at execution time: an earlier write may have failed while this
      // flush was queued. Its retry must finish before switching projects.
      const batch = [...this.pending];
      this.pending.clear();
      let ok = true;
      for (const [id, snapshot] of batch) {
        try {
          await this.write(id, snapshot, snapshot.name || snapshot.song?.name || 'Sin nombre');
          if (this.latest.get(id) === snapshot) { this.latest.delete(id); this.onState('saved', id); }
        } catch (error) {
          if (this.latest.get(id) === snapshot && !this.pending.has(id)) this.pending.set(id, snapshot);
          this.onState('error', id, error);
          ok = false;
        }
      }
      return ok && this.pending.size === 0;
    });
    return this.queue;
  }
}
