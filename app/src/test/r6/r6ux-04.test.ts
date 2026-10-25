// r6ux-04: the override reason is its own field, printed once, separate from the note; it survives a pack round trip.
import { it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { base, inch } from '../../../../qa/golden/golden_base';
import { getVerdict } from '../../core/verdict';
import { sanitizeInspection } from '../../core/inspection';
import { handoffZip } from '../../out/handoff';
it('README prints the reason, not the whole note', async () => {
  const p = base(); p.adu.windows[0].clearWidthMm = inch(14);
  p.inspection = { inspector: 'I', date: '2026-10-24', general: '', items: { egress: { s: 'pass', note: 'sill paint chipped', reason: 'Window replaced on site', photo: null, at: '2026-10-24T10:00' } } } as never;
  const readme = strFromU8(unzipSync(await handoffZip(p, getVerdict(p).report))['README.txt']);
  expect(readme).toMatch(/Reason given: Window replaced on site/);
  expect(readme).not.toMatch(/Reason given: sill paint/);
}, 30000);
it('sanitizer keeps a short reason and drops an empty one', () => {
  const i = sanitizeInspection({ inspector: '', date: '2026-10-24', general: '', items: { egress: { s: 'na', note: '', photo: null, at: '', reason: 'x'.repeat(400) }, addr: { s: 'pass', note: '', photo: null, at: '', reason: '  ' } } });
  expect(i!.items.egress.reason!.length).toBe(300); expect(i!.items.addr?.reason).toBeUndefined();
});
