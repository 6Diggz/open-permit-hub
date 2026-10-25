// r4gold-03: plainAnswer() gives "rules cover the City of Los Angeles only" for every NOT_SUPPORTED project, even an LA City duplex or a new second story.
import { it, expect } from 'vitest';
import { base, run, ft } from '../r3/golden_base';
import { plainAnswer } from '../../rules/readiness';
it('LA City duplex: reason is the building type, not the city', () => { const p = base(); p.site.mainBuilding = 'duplex'; const a = plainAnswer(p, run(p).rep); expect(a.verdict).toBe('unsure'); expect(a.en).not.toMatch(/City of Los Angeles only/); expect(a.es).not.toMatch(/solo para la Ciudad/); });
it('LA City new second story: reason is the project type', () => { const p = base(); p.adu.heightMm = ft(22); p.adu.newUpperFloor = 'yes'; const a = plainAnswer(p, run(p).rep); expect(a.en).not.toMatch(/City of Los Angeles only/); });
it('a lot outside LA City keeps the city reason', () => { const p = base(); p.site.jurisdiction = 'other'; expect(plainAnswer(p, run(p).rep).en).toMatch(/City of Los Angeles only/); });
