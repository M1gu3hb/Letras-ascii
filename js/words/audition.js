// La audición usa el reloj del reproductor y nunca modifica el tramo exportable.
export class Audition {
  constructor(panel) {
    this.panel = panel; this.before = .3; this.after = .6; this.loop = false;
    const app = panel.app;
    app.on('tab', () => { if (app.tab !== 'words') this.stop(); });
    for (const event of ['reset', 'clip', 'media']) app.on(event, () => this.stop());
  }
  range(kind = 'word') {
    const p = this.panel, info = p.word();
    if (!info) return null;
    const start = kind === 'phrase' ? info.line.t : kind === 'visible' ? p.strip.a : info.w.onset;
    const last = info.line.words.at(-1);
    const end = kind === 'phrase' ? last.onset + Math.max(last.sung, last.dur, .05) : kind === 'visible' ? p.strip.b : info.w.onset + Math.max(info.w.sung, info.w.dur, .05);
    return { a: Math.max(0, start - this.before), b: Math.min(p.app.player.dur, end + this.after), loop: this.loop };
  }
  play(kind = 'word') {
    const range = this.range(kind);
    if (!range || range.b <= range.a) return;
    const p = this.panel;
    p.setFollow(false); p.app.audioFull.pause();
    this.kind = kind; p.app.player.auditionRange = range;
    p.strip.setRange(range);
    void p.app.player.start(range.a);
  }
  refresh() {
    if (!this.panel.app.player.auditionRange) return;
    const range = this.range(this.kind);
    this.panel.app.player.auditionRange = range;
    this.panel.strip.setRange(range);
  }
  stop() {
    const p = this.panel;
    if (p.app.player.auditionRange) p.app.player.pause();
    p.app.player.auditionRange = null; p.strip.setRange(null);
  }
}
