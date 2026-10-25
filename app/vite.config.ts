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
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob: data: https://maps.lacity.org https://zimas.lacity.org; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";

function walk(dir: string): string[] { return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }

/** After the build: write dist/sw.js with a precache list of every emitted file and a cache name from the build hash. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'opa-service-worker', apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    transformIndexHtml: { order: 'post', handler: html => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`) },
    closeBundle() {
      for (const [f, body] of Object.entries(rulePages())) { mkdirSync(dirname(join(outDir, f)), { recursive: true }); writeFileSync(join(outDir, f), body); }
      const files = walk(outDir).map(f => relative(outDir, f).split('\\').join('/'));
      const sw = buildServiceWorker(files, readFileSync(join(outDir, 'index.html'), 'utf8'));
      writeFileSync(join(outDir, 'sw.js'), sw.source);
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version: sw.version, files: sw.precache.length, pack: PACK_ID, verifiedOn: PACK.verifiedOn }));
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()], base: './',
  // The pdf.js worker ships as .mjs; emit it as .js so every static host sends a JavaScript MIME type (module workers require one).
  build: { rolldownOptions: { output: { assetFileNames: (a: { names?: string[]; name?: string }) => ((a.names?.[0] ?? a.name ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') } } },
})
