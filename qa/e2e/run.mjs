#!/usr/bin/env node
// Open Permit Hub e2e regression runner.
//   node run.mjs                     run everything against $BASE (default: live site)
//   node run.mjs qa-0 cor            run tests whose id contains any of the words
//   node run.mjs --workers=2 --repeat=3 --out=baseline.json
// Writes results.json (or --out) and out/<test-id>/ (downloads, failure screenshots).
import fs from 'fs';
import path from 'path';
import { chromium, BASE, HERE, Fail } from './lib.mjs';
import { TESTS } from './tests.mjs';

const args = process.argv.slice(2);
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const words = args.filter(a => !a.startsWith('--'));
const WORKERS = +(opt('workers') || 3), REPEAT = +(opt('repeat') || 1), TIMEOUT = +(opt('timeout') || 180000);
const OUT = path.resolve(HERE, opt('out') || 'results.json');
const picked = TESTS.filter(t => !words.length || words.some(w => t.id.includes(w)));
const outRoot = path.join(HERE, 'out'); fs.mkdirSync(outRoot, { recursive: true });

async function runOne(browser, def, rep) {
  const outDir = path.join(outRoot, def.id + (REPEAT > 1 ? `-r${rep}` : '')); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const t = { browser, outDir, contexts: [], pages: [], cleanup: [], log: [] };
  const t0 = Date.now(); let status = 'PASS', error = '';
  try {
    await Promise.race([def.fn(t), new Promise((_, rj) => setTimeout(() => rj(new Error(`timeout after ${TIMEOUT} ms`)), TIMEOUT))]);
  } catch (e) { status = e instanceof Fail ? 'FAIL' : 'ERROR'; error = (e.message || String(e)).split('\n')[0].slice(0, 400); }
  const shots = [];
  if (status !== 'PASS') for (const [i, pg] of t.pages.entries()) { if (pg.isClosed()) continue; const f = path.join(outDir, `fail-${i}.png`); try { await pg.screenshot({ path: f, fullPage: true, timeout: 8000 }); shots.push(path.relative(HERE, f)); } catch { /* page gone */ } }
  for (const c of t.contexts) await c.close().catch(() => {});
  for (const c of t.cleanup) try { c(); } catch { /* ignore */ }
  return { id: def.id, area: def.area, title: def.title, findings: def.findings || [], status, ms: Date.now() - t0, error, note: t.note || '', summary: t.summary, screenshots: shots, pageErrors: t.log.slice(0, 5) };
}

const browser = await chromium.launch();
const jobs = []; for (const d of picked) for (let r = 1; r <= REPEAT; r++) jobs.push([d, r]);
const results = []; let next = 0;
console.log(`Open Permit Hub e2e: ${picked.length} tests x${REPEAT}, ${WORKERS} workers, BASE=${BASE}`);
await Promise.all(Array.from({ length: WORKERS }, async () => { while (next < jobs.length) { const [d, r] = jobs[next++]; const res = await runOne(browser, d, r); res.rep = r; results.push(res); process.stdout.write(`  ${res.status.padEnd(5)} ${d.id}\n`); } }));
await browser.close();

// collapse repeats: flaky = mixed outcomes
const byId = {}; for (const r of results) (byId[r.id] ||= []).push(r);
const rows = picked.map(d => { const rs = byId[d.id].sort((a, b) => a.rep - b.rep); const st = [...new Set(rs.map(r => r.status))]; const r0 = rs.find(r => r.status !== 'PASS') || rs[0];
  return { ...r0, status: st.length > 1 ? 'FLAKY' : st[0], runs: rs.map(r => r.status) }; });
const w = Math.max(...rows.map(r => r.id.length));
console.log('\n' + 'TEST'.padEnd(w) + '  RESULT  SEC   DETAIL'); console.log('-'.repeat(w + 60));
for (const r of rows) console.log(`${r.id.padEnd(w)}  ${r.status.padEnd(6)}  ${String(Math.round(r.ms / 1000)).padStart(3)}   ${(r.status === 'PASS' ? r.note : r.error).slice(0, 150)}`);
const count = s => rows.filter(r => r.status === s).length;
console.log(`\n${rows.length} tests: ${count('PASS')} pass, ${count('FAIL')} fail, ${count('ERROR')} error, ${count('FLAKY')} flaky`);
const a11y = rows.filter(r => r.id.startsWith('a11y') && r.summary); for (const r of a11y) console.log(`${r.id} axe nodes by severity: ${JSON.stringify(r.summary.bySeverity)}`);
fs.writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), repeat: REPEAT, totals: { pass: count('PASS'), fail: count('FAIL'), error: count('ERROR'), flaky: count('FLAKY') }, tests: rows }, null, 1));
console.log('wrote ' + path.relative(process.cwd(), OUT));
process.exitCode = count('PASS') === rows.length ? 0 : 1;
