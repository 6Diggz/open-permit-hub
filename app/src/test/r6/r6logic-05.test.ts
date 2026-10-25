// r6logic-05: field N/A over an item the app fails needs no reason and is missing from the handoff README.
import { it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { base, inch } from '../../../../qa/golden/golden_base';
import { getVerdict } from '../../core/verdict';
import { fieldConflicts } from '../../core/inspection';
import { handoffZip } from '../../out/handoff';
it('N/A on a failing escape window is recorded as an override', async () => {
  const p = base(); p.adu.windows[0].clearWidthMm = inch(14);
  p.inspection = { inspector: 'I', date: '2026-10-24', general: '', items: { egress: { s: 'na', note: '', photo: null, at: '2026-10-24T10:00' } } } as never;
  const rep = getVerdict(p).report;
  expect(fieldConflicts(p, rep)).toContain('egress');
  const readme = strFromU8(unzipSync(await handoffZip(p, rep))['README.txt']);
  expect(readme).toMatch(/N\/A in the field.*escape window/i);
}, 30000);
