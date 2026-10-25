// r5mcp-01: list_projects OOM-crashes the whole MCP server when OPA_ROOT holds many large packs.
// Root cause: the handler Promise.all reads + JSON.parse + migrate + evaluate EVERY pack (cap 500)
// concurrently with no concurrency limit. 500 x MAX_PACK_BYTES (5MB) ~= 2.5GB >> default heap -> OOM.
// PASS condition (after fix): list_projects completes (or errors cleanly) AND the server is still alive
// for a follow-up call. FAIL (current): server process dies, follow-up throws "Connection closed".
//
// Self-contained. Resolves the MCP SDK from the server's own node_modules. No external fixtures committed
// (2.4GB of packs would be absurd to commit); they are generated in a temp dir and deleted after.
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MCP = process.env.MCP_DIR || '/home/claude/opa/mcp';
const require = createRequire(join(MCP, 'package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const root = mkdtempSync(join(tmpdir(), 'r5mcp01-'));
let failed = false;
try {
  const c = new Client({ name: 't', version: '1' });
  await c.connect(new StdioClientTransport({ command: 'node', args: [join(MCP, 'dist/server.mjs')], env: { ...process.env, OPA_ROOT: root } }));
  const call = (n, a) => c.callTool({ name: n, arguments: a });

  // one valid base pack
  const made = await call('create_project', { name: 'Base', width: "20'", depth: "20'" });
  const basePath = JSON.parse(made.content[0].text).created;
  // read it back and clone into N large (~4.8MB) valid packs
  const { readFileSync } = await import('node:fs');
  const obj = JSON.parse(readFileSync(join(root, basePath), 'utf8'));
  const pad = 'x'.repeat(4_800_000);
  const N = Number(process.env.N || 500);
  for (let i = 0; i < N; i++) { const o = JSON.parse(JSON.stringify(obj)); o.name = 'P' + i; o.site.legalDescription = pad; writeFileSync(join(root, 'big' + i + '.permitpack'), JSON.stringify(o)); }

  try { await call('list_projects', {}); } catch { /* may error; the real test is whether the server survives */ }
  // Server must still answer a trivial, cheap call:
  const alive = await call('list_rules', {});
  const txt = alive.content?.[0]?.text ?? '';
  if (!txt.includes('"pack"')) { console.error('FAIL: follow-up call did not return rules; server unhealthy'); failed = true; }
  else console.log('PASS: server survived list_projects on', N, 'large packs');
  await c.close().catch(() => {});
} catch (e) {
  console.error('FAIL: server crashed (OOM) -', e.message);
  failed = true;
} finally {
  rmSync(root, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
