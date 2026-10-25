// r5mcp-02: apply_edit is annotated idempotentHint:true but is NOT idempotent under concurrency.
// Two concurrent apply_edit calls on ONE proposal (against a non-working/original pack) both pass the
// `applied` TOCTOU check before either writes, so both call writeNew -> two "-edited" copies.
// Sequential double-apply is correctly idempotent ("already_applied"); only the concurrent race duplicates.
// PASS (after fix): exactly one new .permitpack is written for one proposal, even under concurrent apply.
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const MCP = process.env.MCP_DIR || '/home/claude/opa/mcp';
const require = createRequire(join(MCP, 'package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const root = mkdtempSync(join(tmpdir(), 'r5mcp02-'));
let failed = false;
try {
  const c = new Client({ name: 't', version: '1' });
  await c.connect(new StdioClientTransport({ command: 'node', args: [join(MCP, 'dist/server.mjs')], env: { ...process.env, OPA_ROOT: root } }));
  const call = async (n, a) => JSON.parse((await c.callTool({ name: n, arguments: a })).content[0].text);
  const base = (await call('create_project', { name: 'B', width: "20'", depth: "20'" })).created;
  // hand-place an ORIGINAL pack (not created/imported by the server -> not a working copy)
  const obj = JSON.parse(readFileSync(join(root, base), 'utf8')); obj.name = 'Orig';
  writeFileSync(join(root, 'orig.permitpack'), JSON.stringify(obj));
  const pv = await call('edit_project', { path: 'orig.permitpack', ops: [{ op: 'set', path: 'adu.heightMm', value: "9'" }] });
  const pid = pv.proposal_id;
  await Promise.all([call('apply_edit', { proposal_id: pid }), call('apply_edit', { proposal_id: pid })]);
  const edited = readdirSync(root).filter(f => f.startsWith('orig') && f.includes('edited'));
  if (edited.length !== 1) { console.error('FAIL: concurrent apply of one proposal wrote', edited.length, 'copies:', edited); failed = true; }
  else console.log('PASS: one proposal wrote exactly one copy under concurrency');
  await c.close().catch(() => {});
} catch (e) { console.error('ERROR', e.message); failed = true; }
finally { rmSync(root, { recursive: true, force: true }); }
process.exit(failed ? 1 : 0);
