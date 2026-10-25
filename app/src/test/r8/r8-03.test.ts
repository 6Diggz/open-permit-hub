import { it, expect } from 'vitest';
import { sanitizeInspection } from '../../core/inspection';
it('r8-03 a Fail item note the inspector typed as "Reason for Pass: ..." is not moved into reason (migration only for legacy pass overrides)', () => {
  const note = 'Reason for Pass: none - nailing short at shear wall, re-inspect';
  const r = sanitizeInspection({ items: { addr: { s: 'fail', note } } })!;
  expect(r.items.addr.note).toBe(note); expect(r.items.addr.reason).toBeUndefined();
});
it('r8-03 migration runs once: data already at the schema flag keeps a typed "Reason for Pass:" note as-is', () => {
  const note = 'Reason for Pass: typed by the inspector on purpose';
  const r = sanitizeInspection({ v: 2, items: { addr: { s: 'pass', note } } })!;
  expect(r.items.addr.note).toBe(note); expect(r.items.addr.reason).toBeUndefined(); expect(r.v).toBe(2);
  const legacy = sanitizeInspection({ items: { addr: { s: 'na', note: 'x\nMotivo de Cumple: medido' } } })!;
  expect(legacy.items.addr.reason).toBe('medido'); expect(legacy.v).toBe(2);
  // second load of the migrated data does nothing more
  const again = sanitizeInspection(JSON.parse(JSON.stringify(legacy)))!; expect(again).toEqual(legacy);
});
