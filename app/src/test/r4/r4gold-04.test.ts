// r4gold-04: plainAnswer() zone test reads split zoning ("R1-1 / C2-1VL") and RAS zones as plain residential -> "Likely yes".
import { it, expect } from 'vitest';
import { base, run } from '../r3/golden_base';
import { plainAnswer } from '../../rules/readiness';
for (const z of ['R1-1 / C2-1VL', 'RD1.5-1-O, C1-1-O', 'RAS4-1VL', 'RAS3-1']) it(`zone "${z}" is not likely yes`, () => { const p = base(); p.site.zone = z; expect(plainAnswer(p, run(p).rep).verdict).not.toBe('likely-yes'); });
for (const z of ['R1-1', '[Q]R1-1', 'RS-1', 'RE9-1-H', 'R1-1-HCR']) it(`zone "${z}" stays residential`, () => { const p = base(); p.site.zone = z; expect(plainAnswer(p, run(p).rep).verdict).toBe('likely-yes'); });
