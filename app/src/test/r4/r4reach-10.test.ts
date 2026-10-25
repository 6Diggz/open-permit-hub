// LA tier-1/2 languages (City LAP FY22-24): Vietnamese, Russian and Armenian owner names print as "?" on signed sheets.
// Vietnamese is cheap: the UI already ships the Public Sans vietnamese + latin-ext subsets; the PDF embeds only latin.
import { it, expect } from 'vitest';
import { base } from '../r3/golden_base';
import { missingGlyphNote } from '../../out/glyphs';
it.each(['Nguyễn Văn Đức', 'Иван Петров', 'Արամ Սարգսյան'])('PDF can print owner name %s', n => {
  const p = base(); p.people.ownerName = n; expect(missingGlyphNote(p, false, true)).toBe('');
});
