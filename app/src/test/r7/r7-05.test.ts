// r7-05: a pre-r6 project kept the override reason inside the note; it must come back as the reason.
import { it, expect } from 'vitest';
import { sanitizeInspection, INSP_ITEMS } from '../../core/inspection';
it('lifts "Reason for Pass:" out of the note', () => {
  const id = INSP_ITEMS[0].id;
  const r = sanitizeInspection({ inspector: 'A', date: '2026-01-02', items: { [id]: { s: 'pass', note: 'Checked twice\nReason for Pass: measured on site 7\'-2"', photo: null, at: '' } } })!;
  expect(r.items[id].reason).toBe('measured on site 7\'-2"'); expect(r.items[id].note).toBe('Checked twice');
  const e = sanitizeInspection({ items: { [id]: { s: 'pass', note: 'Motivo de Cumple: medido', photo: null, at: '' } } })!;
  expect(e.items[id].reason).toBe('medido'); expect(e.items[id].note).toBe('');
  const k = sanitizeInspection({ items: { [id]: { s: 'pass', note: 'Reason for Pass: old', reason: 'new', photo: null, at: '' } } })!;
  expect(k.items[id].reason).toBe('new');
});
