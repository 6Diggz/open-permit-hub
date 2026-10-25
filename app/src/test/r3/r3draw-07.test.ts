import { it, expect } from 'vitest';
import { demoProject, uid } from '../../core/model';
import { migrate, serialize } from '../../core/permitpack';
it('more than 500 pins: reopening the pack tells the user notes were dropped', () => {
  const p = demoProject();
  p.markup.pins = Array.from({ length: 520 }, (_, i) => ({ id: uid(), n: i + 1, x: 1000, y: 1000, comment: 'c' + i, status: 'open', author: 'a', at: '2026-10-24' })) as any;
  const m = migrate(JSON.parse(serialize(p)));
  expect(m.markup.pins.length).toBe(500);
  expect((m.repairNotes ?? []).join(' ')).toMatch(/note|pin/i);
});
it('a pin hundreds of miles off the plan is pulled back or dropped (DXF extents, PDF sheet)', () => {
  const p = demoProject();
  p.markup.pins = [{ id: uid(), n: 1, x: -9e8, y: 9e8, comment: 'far', status: 'open', author: 'a', at: '2026-10-24' }] as any;
  const m = migrate(JSON.parse(serialize(p))); const q = m.markup.pins[0];
  const lot = m.site.lot; const xs = lot.map(v => v.x), ys = lot.map(v => v.y); const pad = 30480; // 100 ft
  expect(!q || (q.x >= Math.min(...xs) - pad && q.x <= Math.max(...xs) + pad && q.y >= Math.min(...ys) - pad && q.y <= Math.max(...ys) + pad)).toBe(true);
});
