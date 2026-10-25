// r3data-03: a "Back up all projects" file must always be restorable, even when the device is full.
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { migrate, serializeAll, readBundle } from '../../core/permitpack';
it('backup of a full device (over 5 MB) restores', () => {
  const one = JSON.parse(readFileSync('/home/claude/stress/r3/tests/fixtures/r3data-big1.permitpack', 'utf8'));
  const ps = [0, 1, 2, 3, 4].map(i => migrate({ ...structuredClone(one), id: crypto.randomUUID(), name: 'P' + i }));
  const text = serializeAll(ps);
  expect(text.length).toBeGreaterThan(5 * 1024 * 1024);
  const r = readBundle(text);
  expect(r?.projects.length).toBe(5);
});
