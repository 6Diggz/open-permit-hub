import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { handoffZip } from '../../out/handoff';
import { initCleanfix } from '../../test/wasm';
import { unzipSync } from 'fflate';
// r3export-08: README "Contents" says site-plan.pdf is "A-1 site plan, A-2 floor plan data" but the PDF also has G-2 Review
// markup when pins exist; open review notes and correction responses are not listed in the README at all.
it('README lists every sheet in site-plan.pdf and the open review notes', async () => {
  initCleanfix(); const p = demoProject();
  p.markup.pins = [{ id: 'a', n: 1, x: p.adu.footprint[0].x, y: p.adu.footprint[0].y, comment: 'Add window detail', status: 'open', author: 'r', at: '2026-10-20' }];
  const r = new TextDecoder().decode(unzipSync(await handoffZip(p, evaluate(p, RULES, PACK_ID, new Date('2026-10-24'))))['README.txt']);
  expect(r).toContain('G-2'); expect(r).toContain('Add window detail'); expect(r).toContain('A-0 Plot plan 8.5x11');
}, 30000);
