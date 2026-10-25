// qa-15 / appsec-16: CAD jobs run in a worker with a time limit and Cancel; a stop or crash gets a fresh worker.
// OUT2-13: the worker job runs the cleaning steps; switching one off undoes it.
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCadClient, CadStopped, timeLimitMs } from '../../out/cadclient';
import { runJob } from '../../out/cadjob';
import { initCleanfix } from '../wasm';
import * as m from '../../clean-wasm/cleanfix.js';
import { lossHeadline, opLine, reportText, type LossOk } from '../../ui/CleanFix';

class Fake { static made = 0; static killed = 0; onmessage: ((e: MessageEvent) => void) | null = null; onerror: ((e: unknown) => void) | null = null; reply: 'ok' | 'never' | 'trap' = 'ok';
  constructor() { Fake.made++; } terminate() { Fake.killed++; }
  postMessage(q: { id: number }) { if (this.reply === 'never') return; const d = this.reply === 'ok' ? { id: q.id, ok: true, text: 'x' } : { id: q.id, ok: false, error: 'RuntimeError: unreachable' }; queueMicrotask(() => this.onmessage?.({ data: d } as MessageEvent)); } }

it('times out, terminates the worker and starts a new one next time', async () => {
  vi.useFakeTimers(); let mode: Fake['reply'] = 'never'; const c = createCadClient(() => { const f = new Fake(); f.reply = mode; return f; });
  const p = c.run({ op: 'inspect', bytes: new Uint8Array(10) }, 1000); const caught = p.catch(e => e);
  await vi.advanceTimersByTimeAsync(1001); const e = await caught; expect(e).toBeInstanceOf(CadStopped); expect((e as CadStopped).reason).toBe('timeout');
  expect(Fake.killed).toBe(1); mode = 'ok'; const before = Fake.made;
  await expect(c.run({ op: 'inspect', bytes: new Uint8Array(1) }, 1000)).resolves.toMatchObject({ ok: true }); expect(Fake.made).toBe(before + 1); vi.useRealTimers();
});
it('Cancel stops the job at once and says nothing changed', async () => {
  const c = createCadClient(() => { const f = new Fake(); f.reply = 'never'; return f; });
  const p = c.run({ op: 'loss', bytes: new Uint8Array(1) }); expect(c.busy()).toBe(true); c.cancel();
  await expect(p).rejects.toThrow(/Stopped/); expect(c.busy()).toBe(false);
});
it('a WASM trap throws away the worker', async () => {
  const k = Fake.killed; const c = createCadClient(() => { const f = new Fake(); f.reply = 'trap'; return f; });
  await expect(c.run({ op: 'inspect', bytes: new Uint8Array(1) })).rejects.toThrow(/unreachable/); expect(Fake.killed).toBe(k + 1);
});
it('time limit grows with size, capped at 3 minutes', () => { expect(timeLimitMs(0)).toBe(30000); expect(timeLimitMs(80e6)).toBe(110000); expect(timeLimitMs(1e9)).toBe(180000); });

it('worker jobs run the cleaning steps; switching all off removes nothing', () => {
  initCleanfix(); const bytes = new Uint8Array(readFileSync(new URL('../../../../qa/e2e/fixtures/sample.dxf', import.meta.url)));
  const on = runJob(m, { id: 1, op: 'loss', bytes, target: 'r2018', units: -1, opts: '{}' }); expect(on.ok).toBe(true);
  const l = JSON.parse((on as { text: string }).text) as LossOk; expect(l.ok).toBe(true);
  expect(l.ops!.map(o => o.id)).toEqual(expect.arrayContaining(['audit', 'zero', 'empty_text', 'overkill', 'purge_blocks', 'purge_layers', 'purge_linetypes', 'purge_styles']));
  for (const o of l.ops!) { expect(opLine(o)).toMatch(/before|found/); }
  const off = JSON.parse((runJob(m, { id: 2, op: 'loss', bytes, opts: JSON.stringify({ purge: false, overkill: false, zero: false, empty_text: false, audit: false }) }) as { text: string }).text) as LossOk;
  expect(off.ops).toEqual([]); expect(Object.keys(off.cleaned ?? {})).toEqual([]);
  expect(reportText('sample.dxf', l)).toMatch(/Cleaning steps:/); expect(lossHeadline(l).text.length).toBeGreaterThan(0);
  const c = runJob(m, { id: 3, op: 'clean', bytes, opts: '{}' }); expect(c.ok && (c as { bytes: Uint8Array }).bytes.length > 1000).toBe(true);
}, 120000);
