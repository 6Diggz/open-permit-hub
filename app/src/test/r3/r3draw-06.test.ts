import { it, expect } from 'vitest';
import { demoProject, uid } from '../../core/model';
import { responseLetter } from '../../core/markup';
it('multi-line responses stay indented under their item and items come out in letter order', () => {
  const p = demoProject();
  p.markup.responses = [
    { id: uid(), ref: '3', text: 'Show alarms.', response: 'Added.', sheet: 'A-2', done: true },
    { id: uid(), ref: '1', text: 'Dimension the plan.', response: 'Line one\n3. Revised per survey.', sheet: '', done: false },
  ];
  const out = responseLetter(p); const lines = out.split('\n');
  // a response line must never start at column 0 looking like a new item "3."
  expect(lines.filter(l => /^3\. Revised/.test(l))).toHaveLength(0);
  expect(out.indexOf('1. Dimension')).toBeLessThan(out.indexOf('3. Show'));
});
