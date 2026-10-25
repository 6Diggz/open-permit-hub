// r4gold-08: bath 6'-8"..7'-0" fail must mention CRC R305.1 6'-8". r4gold-09: hillside/slope windows are not grade-floor.
import { it, expect } from 'vitest';
import { base, run, ft, inch } from '../r3/golden_base';
import { newRoom, roomWindows } from '../../core/rooms';
const withRoom = (use: 'bath' | 'sleeping', ceil: number) => { const p = base(); const r = newRoom(p, 'r1', use === 'bath' ? 'Bath' : 'Bedroom', use); r.ceilingMm = ceil;
  r.openings.push({ id: 'w9', kind: 'window', wall: 0, offsetMm: inch(12), widthMm: inch(24), heightMm: inch(36), sillMm: inch(40) }); p.adu.rooms = [r]; return p; };
it('bath at 6-9 FAIL says the state code allows 6-8 and to ask plan check', () => {
  const r = run(withRoom('bath', inch(81))).rep.results.find(x => x.rule.id === 'CEI-01')!;
  expect(r.status).toBe('FAIL'); expect(r.next?.en).toMatch(/6' 8"/);
});
it('bedroom at 6-9 FAIL does not get the bath note', () => {
  const r = run(withRoom('sleeping', inch(81))).rep.results.find(x => x.rule.id === 'CEI-01')!;
  expect(r.next?.en ?? '').not.toMatch(/6' 8"/);
});
it('drawn window on a hillside / sloped lot is not grade-floor', () => {
  const p = withRoom('sleeping', inch(96)); expect(roomWindows(p).windows[0].gradeFloor).toBe(true);
  p.site.flags.hillside = 'yes'; expect(roomWindows(p).windows[0].gradeFloor).toBe(false);
  p.site.flags.hillside = 'no'; p.site.flags.slopeOver10 = 'yes'; expect(roomWindows(p).windows[0].gradeFloor).toBe(false);
  void ft;
});
