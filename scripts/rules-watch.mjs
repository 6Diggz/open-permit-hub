// Rule sources watch (OUT-03, OUT-08). Exit 1 = something needs a maintainer (the workflow opens an issue).
// 1) Has a source document changed since docs/sources.lock.json? 2) Does any rule or catalog text copy 12+ words from the sheet?
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const lock = JSON.parse(readFileSync(root + 'docs/sources.lock.json', 'utf8'));
let changed = false; const out = ['# Rule sources watch', ''];
for (const [id, s] of Object.entries(lock)) {
  try {
    const res = await fetch(s.url); if (!res.ok) { out.push(`- ${id}: could not download (${res.status}). Check by hand.`); changed = true; continue; }
    const buf = Buffer.from(await res.arrayBuffer()); const sha = createHash('sha256').update(buf).digest('hex');
    if (sha !== s.sha256) { changed = true; out.push(`- **${id} changed** (${s.url}). Old ${s.sha256.slice(0, 12)}, new ${sha.slice(0, 12)}. Compare the revision date and code edition, update app/src/rules, then update docs/sources.lock.json.`); }
    else out.push(`- ${id}: unchanged since ${s.checked}.`);
    if (id === 'ladbs-corr-lst-20a') {
      writeFileSync('/tmp/sheet.pdf', buf); let text = '';
      try { text = execFileSync('pdftotext', ['/tmp/sheet.pdf', '-'], { encoding: 'utf8' }); } catch { out.push('- pdftotext not available: verbatim check skipped.'); }
      if (text) {
        const words = (t) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
        const sheet = words(text); const grams = new Set(); for (let i = 0; i + 12 <= sheet.length; i++) grams.add(sheet.slice(i, i + 12).join(' '));
        const ours = [readFileSync(root + 'app/src/rules/la-city.ts', 'utf8'), readFileSync(root + 'app/src/rules/ladbs-adu-2025.ts', 'utf8')].join('\n');
        const strs = [...ours.matchAll(/'((?:[^'\\]|\\.){40,})'/g)].map(m => m[1]);
        const copies = strs.filter(s2 => { const w = words(s2); for (let i = 0; i + 12 <= w.length; i++) if (grams.has(w.slice(i, i + 12).join(' '))) return true; return false; });
        if (copies.length) { changed = true; out.push(`- **Verbatim text**: ${copies.length} rule string(s) share 12+ words in a row with the sheet. Rewrite them in our own words:`, ...copies.slice(0, 20).map(c => `  - ${c.slice(0, 120)}`)); }
        else out.push('- Verbatim check: no rule text copies 12+ words from the sheet.');
      }
    }
  } catch (e) { out.push(`- ${id}: error ${e.message}`); changed = true; }
}
console.log(out.join('\n')); process.exit(changed ? 1 : 0);
