// A furnished demo project for the sheet tests: four rooms, doors and windows (the same plan e2e/cadviz.mjs draws).
import { DEFAULT_CAD } from '../core/cad';
import { demoProject, type Room, type Opening } from '../core/model';
import { rect } from '../core/geom';
import { ft } from '../core/units';
const op = (id: string, kind: Opening['kind'], wall: number, off: number, w: number): Opening => ({ id, kind, wall, offsetMm: ft(off), widthMm: ft(w), heightMm: ft(kind === 'door' ? 6.67 : 4), sillMm: kind === 'window' ? ft(3) : null });
const room = (id: string, name: string, use: Room['use'], x0: number, y0: number, x1: number, y1: number, openings: Opening[]): Room => ({ id, name, use, shape: 'rect', poly: rect(ft(x0), ft(y0), ft(x1 - x0), ft(y1 - y0)), tape: { w: null, d: null }, ceilingMm: null, openings });
export function furnished() {
  const p = demoProject();
  p.adu.rooms = [
    room('bed', 'Bedroom', 'sleeping', 0.5, 0.5, 9.5, 11.5, [op('w1', 'window', 0, 2, 3), op('w2', 'window', 3, 4, 3), op('d1', 'door', 1, 7.25, 2.5)]),
    room('bath', 'Bath', 'bath', 9.9, 0.5, 19.5, 7, [op('d2', 'door', 2, 4.25, 2.5)]),
    room('kit', 'Kitchen', 'kitchen', 9.9, 7.4, 19.5, 19.5, [op('w3', 'window', 1, 4.1, 3)]),
    room('liv', 'Living', 'living', 0.5, 11.9, 9.5, 19.5, [op('d3', 'door', 2, 3, 3)]),
  ];
  const P = (x: number, y: number) => ({ x: ft(x), y: ft(y) });
  p.cad = { ...DEFAULT_CAD(), ents: [
    { id: 'e1', t: 'dim', layer: 'A-ANNO-DIMS', pts: [P(28, 128), P(48, 128)], off: ft(3) }, { id: 'e2', t: 'dim', layer: 'A-ANNO-DIMS', pts: [P(48, 108), P(48, 115)], off: ft(-3) }, { id: 'e2b', t: 'dim', layer: 'A-ANNO-DIMS', pts: [P(48, 115), P(48, 128)], off: ft(-3) },
    { id: 'e3', t: 'leader', layer: 'A-ANNO-NOTE', pts: [P(47.8, 111), P(51.8, 107)], text: '1-HR WALL AT PROPERTY LINE' }, { id: 'e4', t: 'text', layer: 'A-ANNO-NOTE', pts: [P(50, 124)], text: 'NEW 2X4 PARTITIONS' },
    { id: 'e5', t: 'line', layer: 'A-DETL', pts: [P(20, 100), P(26, 100)] }] } as any;
  return p;
}
