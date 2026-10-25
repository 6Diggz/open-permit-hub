// r5whole-03: the handoff packet drops the site visit: no site-visit PDF, README never mentions it, photos not carried.
// Run: cd /home/claude/opa/app && npx vitest run --root /home/claude/stress/r5/tests r5whole-03
import { it, expect } from 'vitest';
import { unzipSync, strFromU8 } from '../../../node_modules/fflate/esm/index.mjs';
import { demoProject } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { blankInspection } from '../../core/inspection';
import { handoffZip } from '../../out/handoff';
it('handoff carries the site-visit record when there is one', async () => {
  const p = demoProject(); p.site.apn = '5594-014-021'; p.inspection = blankInspection(); p.inspection.inspector = 'R. Diaz';
  p.inspection.items.egress = { s: 'fail', note: 'sill at 50 in', photo: null, at: '2026-10-24T10:00' };
  const z = unzipSync(await handoffZip(p, evaluate(p, RULES, PACK_ID)));
  expect(Object.keys(z).some(k => /site-visit/.test(k))).toBe(true);
  expect(strFromU8(z['README.txt'])).toMatch(/site visit/i);
}, 60000);
