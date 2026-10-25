import { it, expect } from 'vitest';
import { demoProject, uid, type Project, type Room } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { rect } from '../../core/geom';
import { ft, inch } from '../../core/units';
const st = (p: Project, id: string) => evaluate(p, RULES, PACK_ID, new Date('2026-10-24')).results.find(r => r.rule.id === id)!.status;
const room = (name: string, use: Room['use'], poly: any, openings: any[] = []): Room => ({ id: uid(), name, use, shape: 'rect', poly, tape: { w: null, d: null }, ceilingMm: null, openings });
// eslint-disable-next-line
export const win = (wall: number, off: number, w: number) => ({ id: uid(), kind: 'window' as const, wall, offsetMm: off, widthMm: w, heightMm: inch(48), sillMm: inch(30) });

import { readFileSync } from 'node:fs';
it('CEI-01 bath allowance and LADBS sheet III-G.1 text agree', () => {
  const src = readFileSync(new URL('../../rules/ladbs-adu-2025.ts', import.meta.url), 'utf8');
  const line = src.split(String.fromCharCode(10)).find(l => l.includes("['III.G.1'")) ?? ''; const sheetSaysBaths7ft = /baths/i.test(line) && line.includes('-0" minimum');
  expect(line).toContain('baths');
  const p = demoProject(); p.adu.ceilingHeightMm = inch(81); // 6' 9"
  p.adu.rooms = [room('Bath', 'bath', rect(0, 0, ft(6), ft(8)))];
  const bathPasses = st(p, 'CEI-01') === 'PASS';
  expect(sheetSaysBaths7ft && bathPasses).toBe(false); // one of them must change
});
