import { it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs'; import { execFileSync } from 'node:child_process'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { demoProject, uid, type Room } from '../../core/model';
import { rect } from '../../core/geom';
import { ft, inch } from '../../core/units';
import { sheetsPDF } from '../../out/pdf';
it('A-2 with 40 rooms x 2 OUTSIDE windows (r3draw-10 strict) rooms x 2 windows keeps every schedule row and ROOMS AND SAFETY on a page', async () => {
  const p = demoProject();
  p.adu.rooms = Array.from({ length: 40 }, (_, i): Room => ({ id: uid(), name: 'Room ' + i, use: 'sleeping', shape: 'rect', poly: rect(0, 0, ft(5), ft(3)), tape: { w: null, d: null }, ceilingMm: null,
    openings: [0, 1].map(j => ({ id: uid(), kind: 'window', wall: 0, offsetMm: j * inch(26), widthMm: inch(20), heightMm: inch(24), sillMm: inch(30) })) }));
  const f = join(mkdtempSync(join(tmpdir(), 'r3d')), 'a2.pdf'); writeFileSync(f, await sheetsPDF(p, 'draft'));
  const out = execFileSync('python3', ['-I', '-c', `import fitz,sys\nd=fitz.open(sys.argv[1])\nbad=0;found=0\nfor pg in d:\n  for w in pg.get_text('words'):\n    if w[1]<0 or w[3]>pg.rect.height+0.5: bad+=1\n  found+=pg.get_text().count('ROOMS AND SAFETY')\nprint(bad,found)`, f], { encoding: 'utf8', env: { ...process.env, PYTHONWARNINGS: 'ignore' } }).trim();
  expect(out).toBe('0 1');
});
