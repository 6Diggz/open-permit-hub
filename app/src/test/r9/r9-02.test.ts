// r9-02: compliant notes are marked "Says not provided" (red). Run: cd /home/claude/opa/app && npx vitest run --root /home/claude/stress/r9/tests r9-02
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
import { P9 } from './fixtures/p9';
const run = (l: string, id: string) => analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', l] }]).items.find(x => x.id === id)!;
it.each(P9)('compliant note is not "Says not provided": %s [%s]', (l, id) => { expect(run(l, id).state).not.toBe('negated'); });
