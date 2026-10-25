import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { buildServiceWorker } from './sw-build.ts'
import { rulePages } from './rule-pages.ts'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { PACK, PACK_ID } from './src/rules/pack.ts'

/** Content-Security-Policy for the built site (GitHub Pages can't send headers). 'wasm-unsafe-eval' is for the CAD WASM. */
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob: data: https://maps.lacity.org https://zimas.lacity.org https://services.arcgis.com https://rdp.scag.ca.gov; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";

function walk(dir: string): string[] { return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }

/** After the build: write dist/sw.js with a precache list of every emitted file and a cache name from the build hash. */
function serviceWorker(): Plugin {
  let outDir = 'dist'; let allowed = new Set<string>();
  return {
    name: 'opa-service-worker', apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    // r8-04: the landing chunks by exact file name, from the bundle itself (not a name prefix): the entry chunk, the runtime,
    // and the one 'index' group chunk that holds the modules main.tsx reaches statically. A lazy index.ts screen is not on it.
    generateBundle(_o, bundle) {
      allowed = new Set(Object.values(bundle).filter((c: any) => c.type === 'chunk' && !c.isDynamicEntry && (c.isEntry || c.name === 'rolldown-runtime' || (c.name === 'index' && landingSet && Object.keys(c.modules ?? {}).some(m => landingSet!.has(m))))).map((c: any) => c.fileName.replace(/^assets\//, '')));
    },
    transformIndexHtml: { order: 'post', handler: html => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`) },
    closeBundle() {
      for (const [f, body] of Object.entries(rulePages())) { mkdirSync(dirname(join(outDir, f)), { recursive: true }); writeFileSync(join(outDir, f), body); }
      // r6ux-07 guard: the landing page may preload only the runtime and the one landing chunk, never a lazy screen's code.
      const pre = [...readFileSync(join(outDir, 'index.html'), 'utf8').matchAll(/rel="modulepreload"[^>]*href="\.\/assets\/([^"]+)"/g)].map(m => m[1]);
      const bad = pre.filter(f => !allowed.has(f));
      if (bad.length || pre.length > 2) throw new Error(`landing page preloads lazy chunks: ${pre.join(', ')}`);
      const files = walk(outDir).map(f => relative(outDir, f).split('\\').join('/'));
      const sw = buildServiceWorker(files, readFileSync(join(outDir, 'index.html'), 'utf8'));
      writeFileSync(join(outDir, 'sw.js'), sw.source);
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version: sw.version, files: sw.precache.length, pack: PACK_ID, verifiedOn: PACK.verifiedOn }));
    },
  };
}

/** Ids statically reachable from src/main.tsx (computed once per chunking pass). */
let landingSet: Set<string> | null = null, landingCtx: unknown = null;
function landing(ctx: { getModuleInfo(id: string): { importedIds: readonly string[] } | null }): Set<string> {
  if (landingSet && landingCtx === ctx) return landingSet;
  const seen = new Set<string>(), root = join(process.cwd(), 'src', 'main.tsx').split('\\').join('/'), todo = [root];
  while (todo.length) { const id = todo.pop()!; if (seen.has(id)) continue; seen.add(id); for (const d of ctx.getModuleInfo(id)?.importedIds ?? []) todo.push(d); }
  landingCtx = ctx; return landingSet = seen;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()], base: './',
  // The pdf.js worker ships as .mjs; emit it as .js so every static host sends a JavaScript MIME type (module workers require one).
  // r6ux-07: everything the landing page imports statically goes in ONE chunk, so the landing page loads one JS file and
  // never modulepreloads code that only lazy screens (field mode, PDFs, plan check) share with it.
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: (id: string, ctx: { getModuleInfo(id: string): { importedIds: readonly string[] } | null }) => landing(ctx).has(id) ? 'index' : null }] }, assetFileNames: (a: { names?: string[]; name?: string }) => ((a.names?.[0] ?? a.name ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') } } },
})
