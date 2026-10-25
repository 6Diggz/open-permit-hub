import type { Project } from '../core/model';
import type { Poly } from '../core/geom';
import { MM_PER_IN, fmtFtIn } from '../core/units';
import { clearanceToEdge } from '../core/geom';

/** AutoCAD R12 ASCII DXF: opens in AutoCAD, LibreCAD, laser/CNC tools. Drawing units: inches (noted on sheet). */
export function toDXF(p: Project): string {
  if (p.site.lot.length < 3) throw new Error('The lot has no shape yet. Enter the lot size first.');
  const o: string[] = []; const w = (c: number, v: string | number) => o.push(String(c), String(v));
  const inch = (mm: number) => (mm / MM_PER_IN).toFixed(4);
  const layers: [string, number][] = [['C-PROP', 7], ['A-EXST-BLDG', 8], ['A-ADU-WALL', 1], ['C-PROP-SETB', 3], ['A-ANNO-DIMS', 5], ['G-ANNO-TEXT', 7]]; // US National CAD Standard style names
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSBASE'); w(10, 0); w(20, 0); w(30, 0); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, layers.length);
  layers.forEach(([n, c]) => { w(0, 'LAYER'); w(2, n); w(70, 0); w(62, c); w(6, 'CONTINUOUS'); });
  w(0, 'ENDTAB'); w(0, 'ENDSEC'); w(0, 'SECTION'); w(2, 'ENTITIES');
  const poly = (pl: Poly, layer: string) => pl.forEach((a, i) => { const b = pl[(i + 1) % pl.length]; w(0, 'LINE'); w(8, layer); w(10, inch(a.x)); w(20, inch(a.y)); w(30, 0); w(11, inch(b.x)); w(21, inch(b.y)); w(31, 0); });
  const text = (x: number, y: number, h: number, s: string, layer = 'G-ANNO-TEXT') => { w(0, 'TEXT'); w(8, layer); w(10, inch(x)); w(20, inch(y)); w(30, 0); w(40, (h).toFixed(2)); w(1, s.replace(/[^\x20-\x7E]/g, '?')); };
  poly(p.site.lot, 'C-PROP'); poly(p.site.primary, 'A-EXST-BLDG'); poly(p.adu.footprint, 'A-ADU-WALL');
  const lot = p.site.lot;
  lot.forEach((a, i) => { const b = lot[(i + 1) % lot.length]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; text(mx, my, 9, fmtFtIn(Math.hypot(b.x - a.x, b.y - a.y)), 'A-ANNO-DIMS');
    const d = clearanceToEdge(p.adu.footprint, lot, i); if (Number.isFinite(d)) text(mx, my - 300, 7, `ADU to line: ${fmtFtIn(d)}`, 'C-PROP-SETB'); });
  text(lot[0].x, lot[0].y - 1200, 10, `${p.site.address || 'Address'}  APN ${p.site.apn || '-'}  UNITS: INCHES  DRAFT - verify all dimensions`);
  w(0, 'ENDSEC'); w(0, 'EOF');
  return o.join('\r\n');
}
