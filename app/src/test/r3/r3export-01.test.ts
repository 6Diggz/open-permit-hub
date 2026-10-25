import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { toDXF } from '../../out/dxf';
import { initCleanfix } from '../wasm';
// r3export-01: every DIMENSION must reference an existing anonymous *D block and have a text midpoint off the origin,
// otherwise ezdxf recover / LibreCAD / TrueView show no dimensions at all.
it('DXF dimensions carry geometry blocks', async () => {
  initCleanfix(); const d = new TextDecoder().decode(await toDXF(demoProject()));
  const l = d.split(/\r?\n/).map(x => x.trim()); const blocks = new Set<string>();
  for (let i = 0; i < l.length - 1; i++) if (l[i] === '0' && l[i + 1] === 'BLOCK') { for (let j = i + 2; j < i + 40; j += 2) if (l[j] === '2') { blocks.add(l[j + 1]); break; } }
  let n = 0;
  for (let i = 0; i < l.length - 1; i++) if (l[i] === '0' && l[i + 1] === 'DIMENSION') { n++; let blk = '', tx = '', ty = '';
    for (let j = i + 2; j < l.length && l[j] !== '0'; j += 2) { if (l[j] === '2') blk = l[j + 1]; if (l[j] === '11') tx = l[j + 1]; if (l[j] === '21') ty = l[j + 1]; }
    expect(blk, 'DIMENSION has no group 2 block').toMatch(/^\*D\d+$/); expect(blocks.has(blk)).toBe(true); expect(Number(tx) !== 0 || Number(ty) !== 0).toBe(true); }
  expect(n).toBeGreaterThan(0);
});
