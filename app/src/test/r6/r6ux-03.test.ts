// r6ux-03: PRIVACY_NOTES (for the attorney) now contradicts itself: "Network requests: only to the site's own origin ...
// CSP limits connections to the same origin" vs the new bullet "Parcel lookup sends the typed address to maps.lacity.org,
// zimas.lacity.org". The shipped CSP connect-src does list both city hosts.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
it('PRIVACY_NOTES network bullet names every connect-src host', () => {
  const md = readFileSync(new URL('../../../../docs/PRIVACY_NOTES.md', import.meta.url), 'utf8');
  const net = md.split('\n').find(l => /\*\*Network requests\*\*/.test(l)) ?? '';
  expect(net).toMatch(/maps\.lacity\.org/);
  expect(net).toMatch(/zimas\.lacity\.org/);
  expect(net).not.toMatch(/limits connections to the same origin\./);
});
