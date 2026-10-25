// LADBS item I.A.1 asks for a dimensioned 8.5x11 plot plan to scale. The app makes only 24x36 sheets, yet marks I.A.1 auto-passed.
import { it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { base, run } from '../r3/golden_base';
import { sheetsPDF } from '../../out/pdf';
it('I.A.1 is only auto-passed when an 8.5x11 plot plan is produced', async () => {
  const p = base(); const { rd } = run(p);
  const st = rd.items.find(i => i.item.id === 'I.A.1')!.state;
  const doc = await PDFDocument.load(await sheetsPDF(p, 'handoff'));
  const hasLetter = doc.getPages().some(pg => { const w = Math.round(pg.getWidth()), h = Math.round(pg.getHeight()); return (w === 612 && h === 792) || (w === 792 && h === 612); });
  if (!hasLetter) expect(st).not.toBe('autoPassed');
}, 30000);
