export class History<T> {
  private past: T[] = []; private future: T[] = [];
  present: T; private limit: number;
  constructor(present: T, limit = 200) { this.present = present; this.limit = limit; }
  push(next: T) { this.past.push(this.present); if (this.past.length > this.limit) this.past.shift(); this.present = next; this.future = []; }
  undo() { const p = this.past.pop(); if (p === undefined) return false; this.future.push(this.present); this.present = p; return true; }
  redo() { const f = this.future.pop(); if (f === undefined) return false; this.past.push(this.present); this.present = f; return true; }
  get canUndo() { return this.past.length > 0; } get canRedo() { return this.future.length > 0; }
}
