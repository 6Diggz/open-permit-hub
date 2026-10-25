// r5whole-05: the plain answer ("Not as entered" / "Likely yes" / "Not sure") is on the screen only. The check report PDF,
// the HTML report and the handoff README never carry it, so what the owner saw and what the preparer gets differ.
// Run: cd /home/claude/opa/app && npx vitest run --root /home/claude/stress/r5/tests r5whole-05
import { it, expect } from 'vitest';
import { unzipSync, strFromU8 } from '../../../node_modules/fflate/esm/index.mjs';
import { demoProject } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { plainAnswer } from '../../rules/readiness';
import { reportPDF } from '../../out/pdf';
import { reportHTML } from '../../out/reporthtml';
import { handoffZip } from '../../out/handoff';
import { pdfRuns } from '../r3/pdftext';
it('every export carries the same plain answer as the check card', async () => {
  const p = demoProject(); p.site.apn = '5594-014-021'; const rep = evaluate(p, RULES, PACK_ID);
  const head = plainAnswer(p, rep).en.split(':')[0]; // "Not as entered"
  const pdf = (await pdfRuns(await reportPDF(p, rep, 'en'))).flatMap(x => x.runs.map(r => r.text)).join(' ');
  expect(pdf).toContain(head);
  expect(reportHTML(p, rep, 'en')).toContain(head);
  expect(strFromU8(unzipSync(await handoffZip(p, rep))['README.txt'])).toContain(head);
}, 60000);
