// Regenerates the Rust part of app/public/THIRD_PARTY_NOTICES.txt with each crate's own license and copyright files
// (MIT, BSD and Unicode licenses require the notice to travel with binary copies such as cleanfix_bg.wasm).
// Usage: node scripts/notices.mjs          write the file
//        node scripts/notices.mjs --check  exit 1 if the file is stale (CI)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(new URL('..', import.meta.url).pathname);
const file = join(root, 'app/public/THIRD_PARTY_NOTICES.txt');
const MARK = '== Rust crates compiled into cleanfix_bg.wasm ==';
const tree = execFileSync('cargo', ['tree', '-e', 'normal', '--target', 'wasm32-unknown-unknown', '--prefix', 'none', '--format', '{p}|{l}'], { cwd: join(root, 'clean'), encoding: 'utf8' });
const crates = [...new Set(tree.split('\n').filter(Boolean))].map(l => { const [p, lic] = l.split('|'); const [name, ver] = p.replace(/ \(.*\)$/, '').replace(/ \(\*\)$/, '').trim().split(' v'); return { name, ver: ver?.replace(' (*)', ''), lic: lic || 'unknown' }; })
  .filter(c => c.name && c.name !== 'cleanfix').sort((a, b) => a.name.localeCompare(b.name));
const reg = join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'registry/src');
const regDirs = existsSync(reg) ? readdirSync(reg).map(d => join(reg, d)) : [];
const LIC = /^(licen[cs]e|copying|notice|copyright|unlicense)/i;
let out = MARK + '\nEach crate below is compiled, unmodified, into cleanfix_bg.wasm. Its license and copyright files follow its name.\n';
const missing = [];
for (const c of uniq(crates)) {
  const dir = regDirs.map(d => join(d, `${c.name}-${c.ver}`)).find(existsSync);
  out += `\n-- ${c.name} ${c.ver}: ${c.lic} --\nSource: https://crates.io/crates/${c.name}/${c.ver}\n`;
  const files = dir ? readdirSync(dir).filter(f => LIC.test(f)).sort() : [];
  if (!files.length) { missing.push(`${c.name} ${c.ver}`); out += '(No license file ships in this crate. The license is the SPDX license named above; its text is at https://spdx.org/licenses/.)\n'; continue; }
  for (const f of files) out += `\n[${f}]\n${readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim()}\n`;
}
function uniq(a) { const s = new Set(); return a.filter(c => { const k = c.name + c.ver; if (s.has(k)) return false; s.add(k); return true; }); }
const cur = readFileSync(file, 'utf8'); const i = cur.indexOf(MARK);
const next = (i < 0 ? cur.trimEnd() + '\n\n' : cur.slice(0, i)) + out;
if (process.argv.includes('--check')) {
  if (next !== cur) { console.error('THIRD_PARTY_NOTICES.txt is stale. Run: node scripts/notices.mjs'); process.exit(1); }
  console.log(`notices up to date (${crates.length} crates${missing.length ? `, ${missing.length} without a license file: ${missing.join(', ')}` : ''})`);
} else { writeFileSync(file, next); console.log(`wrote ${file} (${crates.length} crates)`); if (missing.length) console.log('no license file in: ' + missing.join(', ')); }
