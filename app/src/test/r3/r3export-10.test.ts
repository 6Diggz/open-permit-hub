import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { sheetsPDF } from '../../out/pdf';
import { addRoom } from '../../core/rooms';
import { streams } from './_r3x_pdf';
// r3export-10: LADBS correction item I.C.3 asks for 1/8" minimum lettering (9 pt). Sheets draw title-block labels,
// signature/date labels and room size/area tags at 8 pt (0.111").
it('no text on plan sheets is smaller than 1/8 inch (9 pt)', async () => {
  const p = demoProject(); p.adu.rooms = addRoom(p, 'r1', 'Bedroom', 'sleeping');
  const sizes = streams(await sheetsPDF(p, 'handoff')).flatMap(s => [...s.matchAll(/\/\S+ ([\d.]+) Tf/g)].map(m => +m[1]));
  expect(sizes.length).toBeGreaterThan(0); expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9);
});
