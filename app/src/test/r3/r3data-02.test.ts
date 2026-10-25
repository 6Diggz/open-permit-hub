// r3data-02: when the index write hits the quota, the project must not be left stored but invisible.
import { it, expect } from 'vitest';
import { makeStore } from '../../core/store';
import { blankProject } from '../../core/model';
it('no orphaned project when the index write fails', () => {
  const m = new Map<string, string>(); let n = 0;
  const kv = { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { if (k === 'opa.index' && n++ > 0) throw new DOMException('full', 'QuotaExceededError'); m.set(k, v); } };
  const st = makeStore(() => kv);
  expect(st.save(blankProject())).toBe('ok');
  const r = st.save(blankProject());
  const stored = [...m.keys()].filter(k => k.startsWith('opa.p.')).length;
  // Either the save is rolled back (blocked + 1 stored) or it is listed; never stored-but-unlisted.
  expect(stored).toBe(st.list().length);
  expect(r).toBe('blocked');
});
