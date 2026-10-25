// r4agent-02: check_citations passes invented sections written in plain words (no LAMC/LARC/Gov. Code abbreviation).
import { it, expect } from 'vitest';
import { checkCitations } from '../../app/src/rules/engine';
import { RULES } from '../../app/src/rules/la-city';
for (const t of ['LA Municipal Code 99.1', 'California Residential Code R999.1', 'Government Code section 66399', 'Residential Code section R999.9', 'Building Code 9999.1', 'Business and Professions Code 9999'])
  it(`flags invented section: ${t}`, () => expect(checkCitations(t, RULES).ok).toBe(false));
it('still passes a real cited section in words', () => expect(checkCitations('Government Code section 66314', RULES).ok).toBe(true));
