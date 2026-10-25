import { describe, it, expect, beforeEach } from 'vitest';
const mem: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
import * as store from '../core/store';
import { demoProject, blankProject } from '../core/model';
import { serialize } from '../core/permitpack';
describe('project store', () => {
  beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });
  it('migrates the old single-project key', () => { const p = demoProject(); mem['opa.project.v1'] = serialize(p); expect(store.list()[0].id).toBe(p.id); expect(mem['opa.project.v1']).toBeUndefined(); });
  it('saves, lists newest first, duplicates, removes', () => { const a = blankProject(), b = blankProject(); b.name = 'B'; store.save(a); store.save(b); expect(store.list()[0].name).toBe('B'); const c = store.duplicate(a.id); expect(store.list().length).toBe(3); expect(c.name).toContain('(copy)'); store.remove(a.id); expect(store.list().find(e => e.id === a.id)).toBeUndefined(); });
  it('broken legacy data is kept aside, not crashing', () => { mem['opa.project.v1'] = '{bad'; expect(store.list()).toEqual([]); expect(mem['opa.project.v1.broken']).toBe('{bad'); });
});
