import { describe, it, expect } from 'vitest';
import { parseLetter } from '../../core/markup';
describe('r3people-10 correction-letter helper keeps every item', () => {
  it('does not merge "Comment #3" into item 2 or turn a section heading into an item', () => {
    const a = parseLetter('Item 1: Provide window schedule.\nItem 2: Show smoke alarms.\nComment #3 - Indicate ceiling height.');
    expect(a.map(i => i.ref)).toEqual(['1', '2', '3']);
    const b = parseLetter('I. GENERAL\nI.A.2 Provide the full legal description\non the plot plan.\nII.C.3 Show the setbacks.\n1. Provide a north arrow.');
    expect(b.map(i => i.ref)).toEqual(['I.A.2', 'II.C.3', '1']);
  });
});
