// Lane ux: parity2-09 (defaults with sources, who answers), r3people-04 (Spanish code basis), r4cold-08 (materials on Rooms step).
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { demoProject } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { readiness, scoreLine, sheetDefaults } from '../../rules/readiness';
import { PACK } from '../../rules/pack';
const rd = (p: ReturnType<typeof demoProject>) => readiness(p, evaluate(p, RULES, PACK_ID));
const base = () => { const p = demoProject(); p.adu.mode = 'conversion'; p.adu.garageAttachment = 'detached'; p.adu.newUpperFloor = 'no'; return p; };

it('parity2-09 a detached one-story garage proves the attached-garage, stair and between-units items, each with a source', () => {
  const p = base(); const d = sheetDefaults(p);
  for (const id of ['III.A.1', 'III.A.2', 'III.A.4', 'III.A.6', 'III.D.5', 'III.G.9', 'III.F.5', 'III.B.4']) { expect(d[id], id).toBeTruthy(); expect(d[id].en).toMatch(/step/); expect(d[id].es).toMatch(/Paso/); }
  const r = rd(p); const it1 = r.items.find(x => x.item.id === 'III.A.2')!; expect(it1.state).toBe('covered'); expect(it1.from?.en).toMatch(/detached/);
});
it('parity2-09 an attached garage or unknown upper floor proves nothing about those items', () => {
  const p = base(); p.adu.garageAttachment = 'attached'; p.adu.newUpperFloor = 'unknown'; const d = sheetDefaults(p);
  for (const id of ['III.A.2', 'III.D.5', 'III.F.5', 'III.B.4']) expect(d[id], id).toBeUndefined();
});
it('parity2-09 the user\'s own answer always wins over a default', () => {
  const p = base(); p.sheet['III.A.2'] = 'no'; const x = rd(p).items.find(i => i.item.id === 'III.A.2')!;
  expect(x.state).toBe('failing'); expect(x.from).toBeUndefined();
});
it('parity2-09 defaults lower the open questions; open questions split into you + preparer', () => {
  const p = base(); const with_ = rd(p); const q = demoProject(); q.adu.garageAttachment = 'attached'; q.adu.newUpperFloor = 'unknown';
  expect(with_.youLeft + with_.preparerLeft).toBe(with_.needsAnswer); expect(with_.preparerLeft).toBeGreaterThan(0);
  expect(scoreLine(with_)).toMatch(/\d+ for you, \d+ for your preparer/); expect(scoreLine(with_, true)).toMatch(/\d+ para usted, \d+ para su preparador/);
  expect(with_.items.find(i => i.item.id === 'III.C.1')!.who).toBe('you'); expect(with_.items.find(i => i.item.id === 'III.J.9')!.who).toBe('preparer');
});
it('parity2-09 rooms drawn with a bath and kitchen fill the each-unit fixture items, and say the preparer still shows fixtures', () => {
  const p = base(); const r0 = p.adu.rooms[0];
  if (!r0) return; p.adu.rooms = [{ ...r0, id: 'a', use: 'bath' }, { ...r0, id: 'b', use: 'kitchen' }];
  expect(sheetDefaults(p)['III.G.10'].en).toMatch(/preparer/);
});
it('r3people-04 the Spanish code basis has no English sentence', () => {
  expect(PACK.localCycleNoteEs).not.toMatch(/Section numbers|UNVERIFIED/); expect(PACK.stateCycleEs).not.toMatch(/codes/);
  const pdf = readFileSync(new URL('../../out/pdf.ts', import.meta.url), 'utf8'); expect(pdf).toContain('PACK.localCycleNoteEs');
});
it('r4cold-08 the materials estimate table is on the Rooms step and Download points to it', () => {
  const app = readFileSync(new URL('../../ui/App.tsx', import.meta.url), 'utf8');
  const rooms = app.slice(app.indexOf('function RoomsStep'), app.indexOf('function ChecksStep')); const exp = app.slice(app.indexOf('function ExportStep'), app.indexOf('function SheetItems'));
  expect(rooms).toContain('L("Materials estimate")'); expect(exp).not.toContain('L("Materials estimate")'); expect(exp).toContain('on the Rooms step');
});
