// Sev 2: float boundary. 6 ft yard with a 12" eave leaves exactly 5'0" (Table R302.1(1): rating only <5 ft), but 1828.7999 - 304.8 < 1524 asks for a rated eave.
import { it, expect } from 'vitest'; import { base, run, ft } from './golden_base';
it('eave ending exactly 5 ft from the line needs no rated underside', () => { const p = base(); p.adu.eaveDepthMm = ft(1); expect(run(p).st('FIR-01')).toBe('PASS'); });
