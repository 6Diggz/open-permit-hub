// r3data-01: a v0.1 save (opa.project.v1) must migrate once, cleanly: no ".broken" copy, no recursion.
import { it, expect } from 'vitest';
import { makeStore } from '../../core/store';
import * as v01 from '/home/claude/stress/r3/tests/fixtures/r3data-v01/model';
import * as v01p from '/home/claude/stress/r3/tests/fixtures/r3data-v01/permitpack';
it('v0.1 legacy save migrates without leaving a broken copy', () => {
  const m = new Map<string, string>(); let sets = 0;
  const kv = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { sets++; m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  const p: any = v01.blankProject(); p.name = 'Old one';
  kv.setItem('opa.project.v1', v01p.serialize(p)); sets = 0;
  const l = makeStore(() => kv).list();
  expect(l.map(e => e.name)).toEqual(['Old one']);
  expect(m.has('opa.project.v1.broken')).toBe(false);
  expect(sets).toBeLessThanOrEqual(3);
});
