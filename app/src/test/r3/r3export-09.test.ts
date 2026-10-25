import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { initCleanfix } from '../../test/wasm';
import { loss, clean } from '../../clean-wasm/cleanfix.js';
// r3export-09: ezdxf examples_dxf/colors.dxf (18 MTEXT) -> 'cnc' (R12). The loss report says MText 18 -> 0 "dropped",
// lost=18, and asks the user to tick "I understand these will not be in the copy". The clean copy actually has all 18
// as TEXT (TEXT 0 -> 30, every MTEXT's words present). The report must say "converted", not lost.
it('MTEXT exploded to TEXT in R12 is reported as converted, not lost', () => {
  initCleanfix(); const b = new Uint8Array(readFileSync(new URL('./fixtures/r3export-ezdxf-colors.dxf', import.meta.url)));
  const out = new TextDecoder().decode(clean(b, 'cnc', -1)); expect(out).toContain('BYOBJECT');
  const L = JSON.parse(loss(b, 'cnc', -1)); const row = L.rows.find((r: any) => r.type === 'MText');
  expect(row.status).not.toBe('dropped'); expect(L.lost).toBe(0);
});
