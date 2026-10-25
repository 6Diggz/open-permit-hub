import { it, expect } from 'vitest';
import { demoProject, uid, type Project, type Room } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { rect } from '../../core/geom';
import { ft, inch } from '../../core/units';
const st = (p: Project, id: string) => evaluate(p, RULES, PACK_ID, new Date('2026-10-24')).results.find(r => r.rule.id === id)!.status;
const room = (name: string, use: Room['use'], poly: any, openings: any[] = []): Room => ({ id: uid(), name, use, shape: 'rect', poly, tape: { w: null, d: null }, ceilingMm: null, openings });
const win = (wall: number, off: number, w: number) => ({ id: uid(), kind: 'window' as const, wall, offsetMm: off, widthMm: w, heightMm: inch(48), sillMm: inch(30) });

it('escape window on an interior wall (shared with another room) does not pass EGR-01', () => {
  const p = demoProject(); // footprint 20x20 ft; Bedroom 0..10 ft, Living 10..19 ft; bedroom wall 1 (x=10 ft) is interior
  p.adu.rooms = [room('Bedroom', 'sleeping', rect(0, 0, ft(10), ft(10)), [win(1, inch(10), inch(36))]), room('Living', 'living', rect(ft(10), 0, ft(9), ft(10)))];
  expect(st(p, 'EGR-01')).not.toBe('PASS');
});
