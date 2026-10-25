// r8-01: noteIntent probe corpus (60+ new phrases). N = absent must read 'negated'; P = provided must read 'addressed'.
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
import { C8 as C } from './corpus8';

it.each(C)('%s [%s] -> %s', (line, id, want) => {
  const item = analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', line] }]).items.find(i => i.id === id)!;
  if (want === 'N') expect(item.state).toBe('negated'); else { expect(item.state).toBe('addressed'); expect(item.confidence).not.toBe('high'); }
});
