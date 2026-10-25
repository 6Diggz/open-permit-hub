// Sev 3: masonry garage FAILs ENG-01 forever, even when a licensed architect/engineer prepares the plans (which is what B&P 5537/6737.1 require).
import { it, expect } from 'vitest'; import { base, run } from './golden_base';
it('masonry + architect preparer is not a FAIL', () => {
  const p = base(); p.adu.garageConstruction = 'masonry'; p.people.preparerRole = 'architect'; p.people.preparerLicense = 'C-12345';
  const r = run(p); expect(r.st('ENG-01')).not.toBe('FAIL'); expect(r.rep.overall).toBe('READY_FOR_PREPARER');
});
