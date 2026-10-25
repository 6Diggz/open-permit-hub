// Builds public/THIRD_PARTY_NOTICES.txt (shipped in the site and in every handoff ZIP).
// Run: node scripts/notices.mjs   (needs app node_modules and cargo in ../clean). It then runs the root scripts/notices.mjs for the crates.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
const app = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
const out = ['Open Permit Hub - third-party notices', '', 'Open Permit Hub is Apache-2.0. It includes the components below, under their own licenses.', ''];
out.push('== acadrust 0.6.7 (MPL-2.0) ==', 'Compiled, unmodified, into the Clean and Fix WebAssembly file (cleanfix_bg.wasm).',
  'Source Code Form: https://github.com/hakanaktt/acadrust (repository) and https://crates.io/crates/acadrust/0.6.7 (exact published source)',
  'License text: https://www.mozilla.org/en-US/MPL/2.0/', 'Our own source, including how acadrust is built in: https://github.com/6Diggz/open-permit-hub', '');
const seen = new Set();
function walk(name) {
  if (seen.has(name)) return; seen.add(name);
  const dir = join(app, 'node_modules', name); if (!existsSync(join(dir, 'package.json'))) return;
  const j = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const lic = readdirSync(dir).find(f => /^(licen[cs]e|copying)/i.test(f));
  out.push(`== ${j.name} ${j.version} (${typeof j.license === 'string' ? j.license : JSON.stringify(j.license)}) ==`);
  if (lic) out.push(readFileSync(join(dir, lic), 'utf8').trim()); out.push('');
  Object.keys(j.dependencies ?? {}).forEach(walk);
}
Object.keys(pkg.dependencies).forEach(walk);
writeFileSync(join(app, 'public', 'THIRD_PARTY_NOTICES.txt'), out.join('\n') + '\n');
console.log('wrote npm part of public/THIRD_PARTY_NOTICES.txt', out.length, 'lines');
// lead-04: one entry point. The root script appends every Rust crate with its own license files (a summary line is not enough).
execSync('node scripts/notices.mjs', { cwd: join(app, '..'), stdio: 'inherit' });
