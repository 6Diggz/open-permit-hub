// r4agent-04: apply_edit failures (unknown/expired proposal, file changed) come back with isError false, so an agent reports success.
import { it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
const SERVER = process.env.MCP_SERVER ?? new URL('../dist/server.mjs', import.meta.url).pathname;
it('unknown proposal is an error result', () => {
  const root = mkdtempSync(join(tmpdir(), 'r4a04-'));
  const msgs = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'apply_edit', arguments: { proposal_id: 'nope' } } }];
  const r = spawnSync('node', [SERVER], { input: msgs.map(m => JSON.stringify(m)).join('\n') + '\n', env: { ...process.env, OPA_ROOT: root }, encoding: 'utf8', timeout: 20000 });
  const res = JSON.parse(r.stdout.split('\n').find(l => l.includes('"id":2'))!).result;
  expect(res.isError).toBe(true);
}, 30000);
