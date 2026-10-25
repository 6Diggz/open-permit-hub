import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { sheetsPDF } from '../../out/pdf';
import { streams, runs } from './_r3x_pdf';
// r3export-02: scale bar numbers must sit on their ticks. Today "0     10     20     30     40 ft" is one string,
// so "40" prints at x=157 while the 40 ft tick is at x=432 (bar is 4 x 90 pt at 1/8").
it('scale bar labels line up with the bar ticks', async () => {
  const all = streams(await sheetsPDF(demoProject(), 'handoff')).flatMap(runs);
  const forty = all.filter(r => /^\s*40( ft)?\s*$/.test(r.t) && r.y < 120);
  expect(forty.length, 'expected a separate "40" label under the scale bar').toBeGreaterThan(0);
  // 1/8" = 1'-0": 40 ft = 5 in = 360 pt from bar start x=72
  expect(Math.abs(forty[0].x - (72 + 360))).toBeLessThan(20);
});
