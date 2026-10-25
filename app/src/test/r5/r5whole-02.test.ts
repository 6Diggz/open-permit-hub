// r5whole-02: field mode lets the inspector mark PASS on an item whose sheet item the app's checks FAIL, with no warning anywhere
// (screen, site-visit PDF). Proposed API: fieldConflicts(p, report) in core/inspection -> item ids where field says pass but checks fail.
// Run: cd /home/claude/opa/app && npx vitest run --root /home/claude/stress/r5/tests r5whole-02
import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { readiness } from '../../rules/readiness';
import { inch } from '../../core/units';
import { blankInspection } from '../../core/inspection';
import { inspectionPDF } from '../../out/inspectpdf';
import { pdfRuns } from '../r3/pdftext';
it('field PASS on a sheet item the checks fail is flagged', async () => {
  const p = demoProject(); p.adu.ceilingHeightMm = inch(78); // 6'-6": CEI-01 fails
  const rep = evaluate(p, RULES, PACK_ID, new Date('2026-10-24'));
  expect(rep.results.find(r => r.rule.id === 'CEI-01')!.status).toBe('FAIL');
  expect(readiness(p, rep).items.find(x => x.item.id === 'III.G.1')!.state).toBe('failing');
  p.inspection = blankInspection(); p.inspection.items.ceiling = { s: 'pass', note: '', photo: null, at: '2026-10-24T10:00' };
  const mod: any = await import('../../core/inspection');
  expect(typeof mod.fieldConflicts).toBe('function');
  expect(mod.fieldConflicts(p, rep)).toContain('ceiling');
  const text = (await pdfRuns(await inspectionPDF(p, {}, 'en'))).flatMap(x => x.runs.map(r => r.text)).join(' ');
  expect(text).toMatch(/check(s)? (in the app )?fail|does not match the app/i);
});
