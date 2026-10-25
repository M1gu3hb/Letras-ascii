// Historial de edición, acotado al proyecto y a la letra que lo originó.
const fields = ['sync', 'style', 'over', 'seed', 'offset'];
const snapshot = (app) => structuredClone(Object.fromEntries(fields.map(key => [key, app.project[key]])));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class EditHistory {
  constructor(app) {
    this.app = app;
    this.past = []; this.future = [];
    this.reset();
    app.on('project', () => this.record());
    app.on('reset', () => this.reset());
    app.on('tab', () => { if (this.batch) this.cancel(); });
    app.scope.listen(app.root, 'pointerdown', e => {
      if (e.target.closest('input[type=range], .nb, .here')) this.begin();
    }, { capture: true });
    app.scope.listen(window, 'pointerup', () => queueMicrotask(() => this.commit()));
    app.scope.listen(window, 'pointercancel', () => queueMicrotask(() => this.cancel()));
    app.scope.listen(window, 'blur', () => this.cancel());
    app.scope.listen(window, 'keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if (e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
    });
  }
  context() { const a = this.app; return JSON.stringify([a.id, a.project.text, a.project.song?.mediaId, a.project.clip]); }
  reset() { this.key = this.context(); this.current = snapshot(this.app); this.batch = null; this.past = []; this.future = []; this.notify(); }
  notify() { this.app.emit('history'); }
  record() {
    if (this.applying) return;
    if (this.key !== this.context()) { this.reset(); return; }
    const next = snapshot(this.app);
    if (equal(next, this.current)) return;
    if (!this.batch) { this.past.push(this.current); this.past = this.past.slice(-80); this.future = []; }
    this.current = next; this.notify();
  }
  begin() { if (!this.batch) { this.record(); this.batch = snapshot(this.app); } }
  commit() {
    if (!this.batch) return;
    const before = this.batch; this.batch = null;
    this.current = snapshot(this.app);
    if (!equal(before, this.current)) { this.past.push(before); this.past = this.past.slice(-80); this.future = []; }
    this.notify();
  }
  cancel() { if (this.batch) { const before = this.batch; this.batch = null; this.apply(before); } }
  apply(value) {
    this.applying = true;
    Object.assign(this.app.project, structuredClone(value));
    this.current = snapshot(this.app);
    this.app.projectChanged(); this.app.rebuild();
    this.app.emit('editrestored');
    this.applying = false; this.notify();
  }
  undo() { this.commit(); if (this.key !== this.context()) return this.reset(); const value = this.past.pop(); if (!value) return; this.future.push(snapshot(this.app)); this.apply(value); }
  redo() { if (this.key !== this.context()) return this.reset(); const value = this.future.pop(); if (!value) return; this.past.push(snapshot(this.app)); this.apply(value); }
}
