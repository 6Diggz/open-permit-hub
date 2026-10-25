// r7-03: list_projects caps the walk of the WHOLE root at 501 before filtering by `folder`, so a subfolder whose packs come after
// the first 501 in walk order lists 0 projects with truncated:false, while the tip says "Pass folder to list a subfolder".
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const MCP = process.env.MCP_DIR || '/home/claude/opa/mcp';
const require = createRequire(join(MCP, 'package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const root = mkdtempSync(join(tmpdir(), 'r7-03-'));
let failed = false;
try {
  const c = new Client({ name: 't', version: '1' });
  await c.connect(new StdioClientTransport({ command: 'node', args: [join(MCP, 'dist/server.mjs')], env: { ...process.env, OPA_ROOT: root } }));
  const call = async (n, a) => JSON.parse((await c.callTool({ name: n, arguments: a })).content[0].text);
  const made = await call('create_project', { name: 'Base', width: "20'", depth: "20'" });
  const raw = readFileSync(join(root, made.created), 'utf8'); rmSync(join(root, made.created));
  mkdirSync(join(root, 'a')); mkdirSync(join(root, 'z'));
  for (let i = 0; i < 600; i++) writeFileSync(join(root, 'a', `p${i}.permitpack`), raw);
  for (let i = 0; i < 3; i++) writeFileSync(join(root, 'z', `q${i}.permitpack`), raw);
  const z = await call('list_projects', { folder: 'z' });
  console.log('folder z: count', z.count, 'truncated', z.truncated);
  if (z.count !== 3) { console.error('FAIL: subfolder z has 3 packs, list_projects({folder:"z"}) returned', z.count, 'truncated', z.truncated); failed = true; }
  const all = await call('list_projects', {});
  if (all.truncated !== true) { console.error('FAIL: 603 packs, truncated not true'); failed = true; }
  await c.close();
} finally { rmSync(root, { recursive: true, force: true }); }
if (failed) process.exit(1); console.log('PASS');
