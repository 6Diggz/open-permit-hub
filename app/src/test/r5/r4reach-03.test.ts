// r4reach-03: a Spanish project's handoff packet carries a Spanish LEAME.txt saying why the sheets are in English.
import { it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { base } from '../r3/golden_base';
import { getVerdict } from '../../core/verdict';
import { handoffZip } from '../../out/handoff';
it('Spanish handoff has LEAME.txt', async () => {
  const p = base(); p.people.language = 'es'; const z = unzipSync(await handoffZip(p, getVerdict(p).report));
  expect(strFromU8(z['LEAME.txt'])).toMatch(/van en inglés/); expect(strFromU8(z['LEAME.txt'])).toContain(getVerdict(p).plain.es);
}, 60000);
