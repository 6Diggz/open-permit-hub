// Builds dist/server.mjs, dist/selftest.mjs and dist/e2e.mjs with esbuild, and writes dist/build-info.json:
// a hash of every source file that went into the server, so the self-test can prove dist matches src (r4agent-14).
import { build, version } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '../app');
const wasmDir = resolve(app, 'src/clean-wasm');
const hasWasm = existsSync(resolve(wasmDir, 'cleanfix.js')) && existsSync(resolve(wasmDir, 'cleanfix_bg.wasm'));
/** Vite-only imports (?raw, ?inline) and the CAD WASM, made to work in Node. */
const vite = {
  name: 'vite-imports',
  setup(b) {
    b.onResolve({ filter: /\?(raw|inline)$/ }, async a => { const [p, q] = a.path.split('?');
      const r = await b.resolve(p, { resolveDir: a.resolveDir, kind: 'import-statement' }); if (r.errors.length) return { errors: r.errors };
      return { path: r.path, namespace: q }; });
    b.onLoad({ filter: /.*/, namespace: 'raw' }, a => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text', watchFiles: [a.path] }));
    b.onLoad({ filter: /.*/, namespace: 'inline' }, a => ({ contents: `export default ${JSON.stringify('data:application/octet-stream;base64,' + readFileSync(a.path).toString('base64'))};`, loader: 'js', watchFiles: [a.path] }));
    b.onResolve({ filter: /clean-wasm\/cleanfix\.js$/ }, a => (a.namespace === 'wasm' ? undefined : { path: 'cleanfix', namespace: 'wasm' }));
    b.onLoad({ filter: /.*/, namespace: 'wasm' }, () => ({ resolveDir: here, loader: 'js', contents: hasWasm
      ? `import * as m from ${JSON.stringify(resolve(wasmDir, 'cleanfix.js'))}; import { readFileSync } from 'node:fs';
         export * from ${JSON.stringify(resolve(wasmDir, 'cleanfix.js'))};
         export default async function init() { return m.initSync({ module: readFileSync(new URL('./cleanfix_bg.wasm', import.meta.url)) }); }`
      : `export default async function init() { throw new Error('CAD WASM not built: DXF falls back to R12'); }` }));
  },
};
const common = { absWorkingDir: here, bundle: true, platform: 'node', format: 'esm', target: 'node20', metafile: true, nodePaths: [resolve(app, 'node_modules')], plugins: [vite], logLevel: 'warning', legalComments: 'none',
  banner: { js: "import{createRequire as __opaReq}from'module';const require=__opaReq(import.meta.url);" } };
mkdirSync(resolve(here, 'dist'), { recursive: true });
const r = await build({ ...common, entryPoints: [resolve(here, 'src/server.ts')], outfile: resolve(here, 'dist/server.mjs') });
await build({ ...common, entryPoints: [resolve(here, 'src/selftest.ts')], outfile: resolve(here, 'dist/selftest.mjs') });
await build({ ...common, entryPoints: [resolve(here, 'src/e2e.ts')], outfile: resolve(here, 'dist/e2e.mjs') });
if (hasWasm) copyFileSync(resolve(wasmDir, 'cleanfix_bg.wasm'), resolve(here, 'dist/cleanfix_bg.wasm'));
const repo = resolve(here, '..');
/** Same function as selftest's: esbuild version + every input (repo-relative name and bytes). */
export function inputsHash(rels) { const h = createHash('sha256'); h.update('esbuild ' + version + '\n'); for (const f of [...rels].sort()) { h.update(f + '\n'); h.update(readFileSync(resolve(repo, f))); } return h.digest('hex'); }
const inputs = Object.keys(r.metafile.inputs).map(f => f.replace(/^(raw|inline):/, '').replace(/\?.*$/, '')).filter(f => !/^\w+:/.test(f)).map(f => relative(repo, f.startsWith('/') ? f : resolve(here, f)));
// Dependencies are pinned by the lockfiles; hash those instead of every file under node_modules.
const rels = [...new Set([...inputs.filter(f => !f.includes('node_modules/')), 'app/package-lock.json', 'mcp/package-lock.json', 'mcp/build.mjs'])].sort();
const info = { version, wasm: hasWasm, inputs: rels, inputsHash: inputsHash(rels), serverSha256: createHash('sha256').update(readFileSync(resolve(here, 'dist/server.mjs'))).digest('hex') };
writeFileSync(resolve(here, 'dist/build-info.json'), JSON.stringify(info, null, 1));
console.log(`built dist/server.mjs (${info.inputs.length} inputs, wasm ${hasWasm ? 'yes' : 'no: DXF R12 fallback'})`);
