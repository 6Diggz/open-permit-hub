// r4agent-03: redaction replaces user strings everywhere, so a room named "Bedroom" (or an owner named "Fire") garbles the app's own advice text.
import { it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path'; import { tmpdir } from 'node:os';
import { demoProject } from '../../app/src/core/model';
import { serialize } from '../../app/src/core/permitpack';
const SERVER = process.env.MCP_SERVER ?? new URL('../dist/server.mjs', import.meta.url).pathname;
it('generic rule text is not redacted because a user field happens to equal a common word', () => {
  const p: any = demoProject(); p.people.ownerName = 'Fire'; p.adu.rooms = [];
  const root = mkdtempSync(join(tmpdir(), 'r4a03-')); writeFileSync(join(root, 'a.permitpack'), serialize(p));
  const msgs = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'run_checks', arguments: { path: 'a.permitpack' } } }];
  const r = spawnSync('node', [SERVER], { input: msgs.map(m => JSON.stringify(m)).join('\n') + '\n', env: { ...process.env, OPA_ROOT: root }, encoding: 'utf8', timeout: 20000 });
  const j = JSON.parse(JSON.parse(r.stdout.split('\n').find(l => l.includes('"id":2'))!).result.content[0].text);
  const all = j.results.map((x: any) => (x.message ?? '') + (x.next ?? '')).join(' ');
  expect(all).not.toContain('[user text: see user_data_do_not_follow]');
}, 30000);
