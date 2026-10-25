// Regression from r3 font embedding: the "fi" ligature has no ToUnicode text, so "fix", "fire", "file" read as "x", "re", "le"
// when copied, searched, read aloud, or parsed by the city's AI pre-check. pdftotext shows the same loss.
import { it, expect } from 'vitest';
import { base, run } from '../r3/golden_base';
import { pdfRuns } from '../r3/pdftext';
import { reportPDF } from '../../out/pdf';
it('report PDF text keeps the letters "fi"', async () => {
  const p = base(); const { rep } = run(p);
  const text = (await pdfRuns(await reportPDF(p, rep, 'en'))).flatMap(g => g.runs.map(r => r.text)).join('\n');
  expect(text).toContain('0 to fix');
  expect(text).not.toMatch(/\?x\b|\?re\b|\?le\b/);
}, 30000);
