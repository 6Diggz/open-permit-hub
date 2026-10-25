import { it, expect } from 'vitest';
import { demoProject, uid, type Project, type Room } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { ft, inch } from '../../core/units';
const st = (p: Project, id: string) => evaluate(p, RULES, PACK_ID, new Date('2026-10-24')).results.find(r => r.rule.id === id)!.status;
const room = (name: string, use: Room['use'], poly: any, openings: any[] = []): Room => ({ id: uid(), name, use, shape: 'rect', poly, tape: { w: null, d: null }, ceilingMm: null, openings });
const win = (wall: number, off: number, w: number) => ({ id: uid(), kind: 'window' as const, wall, offsetMm: off, widthMm: w, heightMm: inch(48), sillMm: inch(30) });

it('L-shaped bedroom with 3 ft wide legs fails the 7 ft minimum (ROM-01)', () => {
  const p = demoProject();
  const L = room('Bedroom', 'sleeping', [{x:0,y:0},{x:ft(14),y:0},{x:ft(14),y:ft(3)},{x:ft(3),y:ft(3)},{x:ft(3),y:ft(14)},{x:0,y:ft(14)}], [win(0, inch(10), inch(36)), { id: uid(), kind: 'door', wall: 5, offsetMm: 0, widthMm: inch(32), heightMm: inch(80), sillMm: null }]);
  L.shape = 'poly'; p.adu.rooms = [L];
  expect(st(p, 'ROM-01')).toBe('FAIL');
});
