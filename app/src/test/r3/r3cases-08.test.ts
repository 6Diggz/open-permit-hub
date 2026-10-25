// Sev 3: readiness marks a sheet ask/doc item done when a linked rule is PASS/INFO, ignoring the user's answer or attachment.
import { it, expect } from 'vitest'; import { base, run } from './golden_base';
const state = (p: any, id: string) => run(p).rd.items.find(x => x.item.id === id)?.state;
it('coastal CDP clearance (I.B.9) unanswered is not done', () => { const p = base(); p.site.flags.coastal = 'yes'; delete p.sheet['I.B.9']; expect(state(p, 'I.B.9')).toBe('needsAnswer'); });
it('agency stamps (I.C.4) not attached is not done, HPOZ or not', () => {
  const p = base(); p.site.flags.hpoz = 'yes'; p.docs['I.C.4'] = false; expect(state(p, 'I.C.4')).toBe('docsMissing');
  const q = base(); q.docs['I.C.4'] = false; expect(state(q, 'I.C.4')).toBe('docsMissing');
});
it('clearance summary (I.B.1) not attached is not done', () => { const p = base(); p.docs['I.B.1'] = false; expect(state(p, 'I.B.1')).toBe('docsMissing'); });
