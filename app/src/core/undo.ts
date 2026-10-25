export class History<T> {
  private past: T[] = []; private future: T[] = [];
  present: T; private limit: number; private lastKey: string | null = null; private lastAt = 0;
  constructor(present: T, limit = 200) { this.present = present; this.limit = limit; }
  /** `key` groups typing in one field into one undo step (same key within `windowMs`, nothing else in between). */
  push(next: T, key?: string, now = Date.now(), windowMs = 1500) {
    if (key && key === this.lastKey && now - this.lastAt < windowMs) { this.present = next; this.future = []; this.lastAt = now; return; }
    this.past.push(this.present); if (this.past.length > this.limit) this.past.shift(); this.present = next; this.future = [];
    this.lastKey = key ?? null; this.lastAt = now;
  }
  undo() { const p = this.past.pop(); if (p === undefined) return false; this.future.push(this.present); this.present = p; this.lastKey = null; return true; }
  redo() { const f = this.future.pop(); if (f === undefined) return false; this.past.push(this.present); this.present = f; this.lastKey = null; return true; }
  get canUndo() { return this.past.length > 0; } get canRedo() { return this.future.length > 0; }
}
