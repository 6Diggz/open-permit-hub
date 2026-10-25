// Builds public/THIRD_PARTY_NOTICES.txt (shipped in the site and in every handoff ZIP).
// Run: node scripts/notices.mjs   (needs app node_modules and `cargo metadata` in ../clean)
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
try {
  const meta = JSON.parse(execSync('cargo metadata --format-version 1', { cwd: join(app, '..', 'clean'), stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  out.push('== Rust crates compiled into cleanfix_bg.wasm ==');
  meta.packages.filter(p => p.name !== 'cleanfix').sort((a, b) => a.name.localeCompare(b.name)).forEach(p => out.push(`${p.name} ${p.version}: ${p.license}`));
} catch { out.push('== Rust crates: see clean/Cargo.lock =='); }
writeFileSync(join(app, 'public', 'THIRD_PARTY_NOTICES.txt'), out.join('\n') + '\n');
console.log('wrote public/THIRD_PARTY_NOTICES.txt', out.length, 'lines');
