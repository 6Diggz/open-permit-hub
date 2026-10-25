import { it, expect } from 'vitest';
import { pdfRuns } from './pdftext';
import { demoProject, uid, type Room } from '../../core/model';
import { rect } from '../../core/geom';
import { ft, inch } from '../../core/units';
import { sheetsPDF } from '../../out/pdf';
it('A-2 with 40 rooms x 2 OUTSIDE windows (r3draw-10 strict) rooms x 2 windows keeps every schedule row and ROOMS AND SAFETY on a page', async () => {
  const p = demoProject();
  p.adu.rooms = Array.from({ length: 40 }, (_, i): Room => ({ id: uid(), name: 'Room ' + i, use: 'sleeping', shape: 'rect', poly: rect(0, 0, ft(5), ft(3)), tape: { w: null, d: null }, ceilingMm: null,
    openings: [0, 1].map(j => ({ id: uid(), kind: 'window', wall: 0, offsetMm: j * inch(26), widthMm: inch(20), heightMm: inch(24), sillMm: inch(30) })) }));
  // Every text run sits on its page, and ROOMS AND SAFETY is printed exactly once (was a pymupdf check; CI has no python).
  const pages = await pdfRuns(await sheetsPDF(p, 'draft'));
  const bad = pages.reduce((n, pg) => n + pg.runs.filter(r => r.y < 0 || r.y > pg.height + 0.5).length, 0);
  const found = pages.reduce((n, pg) => n + pg.runs.filter(r => r.text.includes('ROOMS AND SAFETY')).length, 0);
  const out = `${bad} ${found}`;
  expect(out).toBe('0 1');
});
