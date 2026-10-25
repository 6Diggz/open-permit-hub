// Rule sources watch (OUT-03, OUT-08, OUT2-05). Exit 1 = a source changed or text was copied (the workflow opens an issue).
// 1) Has any source the rules cite changed since docs/sources.lock.json? PDFs are hashed as bytes; web pages as their
//    visible text (scripts, styles and tags removed) so page chrome churn is ignored.
// 2) Does any rule or catalog text copy 12+ words from the LADBS sheet?
// A source with "sha256": null has no baseline yet: the first successful fetch records it (with --write) and is not a change.
// Unreachable sources (bot walls, outages) are listed and reported in unreachable.txt, but are not a change.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const WRITE = process.argv.includes('--write');
const lockPath = root + 'docs/sources.lock.json';
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
export const pageText = html => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
let changed = false; let wrote = false; const unreachable = []; const out = ['# Rule sources watch', ''];
const today = new Date().toISOString().slice(0, 10);
for (const [id, s] of Object.entries(lock)) {
  try {
    const res = await fetch(s.url, { headers: { 'user-agent': 'open-permit-hub rules-watch (+https://github.com/6Diggz/open-permit-hub)' }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
    if (!res.ok) { unreachable.push(`${id} (${res.status}) ${s.url}`); out.push(`- ${id}: could not download (${res.status}). Check by hand: ${s.url}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (s.type === 'link') { out.push(`- ${id}: reachable (link only, not hashed).`); continue; }
    const body = s.type === 'html' ? Buffer.from(pageText(buf.toString('utf8')), 'utf8') : buf;
    const sha = createHash('sha256').update(body).digest('hex');
    if (s.sha256 == null) { out.push(`- ${id}: baseline recorded ${sha.slice(0, 12)} (${s.url}).`); s.sha256 = sha; s.checked = today; wrote = true; }
    else if (sha !== s.sha256) { changed = true; out.push(`- **${id} changed** (${s.url}). Old ${s.sha256.slice(0, 12)}, new ${sha.slice(0, 12)}. Review what changed, update app/src/rules if the law or sheet changed, then update docs/sources.lock.json.`); }
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
  } catch (e) { unreachable.push(`${id} (${e.name}) ${s.url}`); out.push(`- ${id}: could not download (${e.message}). Check by hand: ${s.url}`); }
}
if (WRITE && wrote) writeFileSync(lockPath, JSON.stringify(lock, null, 1) + '\n');
writeFileSync('unreachable.txt', unreachable.join('\n'));
if (unreachable.length) out.push('', `${unreachable.length} source(s) could not be checked automatically (listed above).`);
console.log(out.join('\n')); process.exit(changed ? 1 : 0);
