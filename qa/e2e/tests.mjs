// Test catalog. Each test: { id, area, findings, title, fn(t) }. A test throws (Fail) to fail.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { BASE, FIX, PHONE, DESK, expect, ft, newPage, gotoApp, startNew, demo, step, setLen, setNum, tri, hasId, results, byId, storedProject, download, sh, py, fillProject, mirror, fakeDeploy } from './lib.mjs';
const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const sideText = pg => pg.locator('aside').first().innerText();
const scoreRe = /(\d+)\s+(?:of|de)\s+(\d+)\s+(?:(?:LADBS\s+correction-)?sheet items|puntos|elementos)/i;

export const TESTS = [
// ---------------------------------------------------------------- 1. happy paths
{ id: 'home-happy-390', area: 'happy path', title: 'Homeowner, detached garage, 390x844: score line and check results render', fn: async t => {
  const { pg } = await newPage(t, PHONE); await gotoApp(pg); await startNew(pg);
  await fillProject(pg);
  await step(pg, 3);
  const side = await sideText(pg); const m = side.match(scoreRe);
  expect(m, 'no "N of M sheet items" readiness line in the check card');
  expect(+m[2] >= 200 && +m[1] > 0 && +m[1] <= +m[2], `score line looks wrong: "${m[0]}"`);
  const rs = await results(pg);
  expect(rs.length >= 10, `only ${rs.length} result cards rendered`);
  expect(rs.every(r => r.id), 'a result card has no rule id in its citation');
  const gar = byId(rs, 'GAR-01')[0]; expect(gar && !/don.t know if the garage is attached/i.test(gar.text), 'GAR-01 still asks attached/detached after picking Detached');
  expect(!byId(rs, 'INP-01').some(r => r.status !== 'PASS'), 'INP-01 still says example sizes after entering real sizes');
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth); expect(sw <= 392, `horizontal scroll at 390px (scrollWidth ${sw})`);
  t.note = m[0];
} },
{ id: 'drafter-export-1440', area: 'happy path', title: 'Drafter at 1440x900 to export: PDF, DXF, handoff ZIP downloaded and validated', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg);
  const v = await fillProject(pg);
  await step(pg, 4);
  await pg.selectOption('#role', 'drafter'); await pg.fill('#pn', 'Dana Drafter');
  const errs = [];
  const rep = await download(t, pg, /Check report/);
  const info = sh('pdfinfo', [rep]); const pages = +(info.match(/Pages:\s+(\d+)/) || [])[1];
  const txt = sh('pdftotext', ['-layout', rep, '-']);
  if (!(pages >= 1)) errs.push('check report PDF has no pages');
  if (!txt.includes('52nd')) errs.push('check report PDF does not show the address');
  if (!scoreRe.test(txt.replace(/\s+/g, ' '))) errs.push('check report PDF has no sheet-items score line');
  const site = await download(t, pg, /Draft site plan/);
  const sinfo = sh('pdfinfo', [site]); const size = sinfo.match(/Page size:\s+([\d.]+) x ([\d.]+)/);
  if (!size || Math.round(Math.max(+size[1], +size[2])) !== 2592) errs.push(`site plan is not 24x36 (page size ${size && size[0]})`);
  const dxfF = await download(t, pg, /Site plan for CAD/);
  const d = py('dxf', dxfF);
  if (d.error) errs.push('DXF did not parse: ' + d.error);
  else { for (const L of ['C-PROP', 'A-EXST-BLDG', 'A-ADU-WALL']) if (!d.layers.includes(L) || !d.entities_by_layer[L]) errs.push(`DXF layer ${L} missing or empty`); if (d.strict_error) errs.push('DXF needed recovery: ' + d.strict_error); }
  const zipBtn = pg.getByRole('button', { name: /Handoff packet/ }).first();
  if (await zipBtn.isDisabled()) errs.push('handoff ZIP is locked for a complete LA City project: ' + (await pg.locator('.banner.warn').allInnerTexts()).join(' / '));
  else { const z = py('zip', await download(t, pg, /Handoff packet/));
    if (z.error || z.crc_bad) errs.push('ZIP is corrupt: ' + (z.error || z.crc_bad));
    else { if (!z.readme) errs.push('ZIP has no README'); if (!z.listed.length) errs.push('README lists no files'); if (z.missing.length) errs.push('README lists files not in the ZIP: ' + z.missing.join(', ')); t.note = `zip: ${z.names.length} files`; } }
  t.artifacts = { rep, site, dxf: dxfF, dxfInfo: d };
  expect(!errs.length, errs.join('; '));
} },

// ---------------------------------------------------------------- 3. round-1 severity 4-5 findings
{ id: 'qa-01-plain-restore', area: 'r1 sev5', findings: ['qa-01'], title: 'A plain (unlocked) .permitpack backup restores', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg);
  await pg.fill('#addr', 'RESTORE ME 1 Main St'); await pg.waitForTimeout(300); await step(pg, 4);
  const f = await download(t, pg, /^Save backup$/);
  const { pg: p2 } = await newPage(t, DESK); await gotoApp(p2);
  await p2.setInputFiles('input[type=file][accept*=".permitpack"]', f); await p2.waitForTimeout(2000);
  expect(await p2.locator('nav.rail').count(), 'still on the welcome screen after opening a plain backup (nothing happened)');
  await step(p2, 0); expect((await p2.locator('#addr').inputValue()) === 'RESTORE ME 1 Main St', 'restored project lost the address');
} },
{ id: 'qa-01b-garbage-pack-error', area: 'r1 sev5', findings: ['qa-01'], title: 'Opening a non-pack file shows an error', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg);
  const f = path.join(t.outDir, 'garbage.permitpack'); fs.writeFileSync(f, '{{{garbage');
  await pg.setInputFiles('input[type=file][accept*=".permitpack"]', f); await pg.waitForTimeout(1200);
  const a = (await pg.locator('[role=alert]').allInnerTexts()).join(' ');
  expect(a.trim().length > 0, 'no error shown for a garbage .permitpack');
} },
{ id: 'qa-02-infinity-length', area: 'r1 sev5', findings: ['qa-02'], title: 'Typing 1/0" in a length field is rejected and does not brick the project', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg);
  await setLen(pg, 'lw', '1/0"'); await pg.waitForTimeout(400);
  const shown = await pg.locator('#lw').inputValue();
  const sp = await storedProject(pg);
  const finite = JSON.stringify(sp.p.site.lot).indexOf('null') < 0;
  await pg.reload(); await pg.waitForTimeout(1500);
  const body = await pg.locator('body').innerText();
  expect(!/damaged|couldn.t open/i.test(body), 'project is "damaged" after reload');
  expect(await pg.locator('nav.rail').count(), 'project did not reopen after reload');
  expect(finite, 'stored lot has null coordinates (Infinity saved)');
  expect(!/Infinity|NaN/.test(shown), `field shows "${shown}"`);
} },
{ id: 'qa-04-two-tabs', area: 'r1 sev4', findings: ['qa-04'], title: 'Two tabs on one project: no silent lost edit', fn: async t => {
  const { ctx, pg: a } = await newPage(t, DESK); await gotoApp(a); await startNew(a); await a.waitForTimeout(400);
  const b = await ctx.newPage(); t.pages.push(b); await b.goto(BASE); await b.locator('nav.rail').waitFor({ timeout: 15000 });
  await b.fill('#addr', 'TAB B address'); await b.waitForTimeout(400);
  await a.fill('#apn', '1111-111-111'); await a.waitForTimeout(600);
  const warned = /another tab|otra pesta/i.test((await a.locator('body').innerText()) + (await b.locator('body').innerText()));
  const sp = await storedProject(a);
  const both = sp.p.site.address === 'TAB B address' && sp.p.site.apn === '1111-111-111';
  expect(warned || both, `tab B's address was overwritten with no warning (stored address "${sp.p.site.address}")`);
} },
{ id: 'qa-05-mobile-all-projects', area: 'r1 sev4', findings: ['qa-05', 'parity-04'], title: 'At 390px, "All projects" is reachable from inside a project', fn: async t => {
  const { pg } = await newPage(t, PHONE); await gotoApp(pg); await startNew(pg);
  const btns = pg.getByRole('button', { name: /All projects|Todos los proyectos/ }); let vis = false;
  for (let i = 0; i < await btns.count(); i++) if (await btns.nth(i).isVisible()) { const bb = await btns.nth(i).boundingBox(); if (bb && bb.width > 10 && bb.height > 10) vis = true; }
  expect(vis, 'no visible All projects button at 390x844');
} },
{ id: 'qa-05b-mobile-not-saved', area: 'r1 sev4', findings: ['qa-05'], title: 'At 390px with storage blocked, the "Not saved" warning is visible', fn: async t => {
  const { ctx, pg } = await newPage(t, PHONE);
  await ctx.addInitScript(() => { const th = () => { throw new DOMException('blocked', 'SecurityError'); }; Object.defineProperty(window, 'localStorage', { get: th }); Object.defineProperty(window, 'indexedDB', { get: th }); });
  await gotoApp(pg); await startNew(pg); await pg.fill('#addr', 'x'); await pg.waitForTimeout(400);
  const ns = pg.getByText(/Not saved|No se guard/); let anyVis = false; for (let i = 0; i < await ns.count(); i++) if (await ns.nth(i).isVisible()) anyVis = true;
  expect(anyVis, 'no visible "Not saved" warning on a phone');
} },
{ id: 'qa-06-deploy-blank', area: 'r1 sev4', findings: ['qa-06', 'OUT-04'], title: 'First load after a deploy renders the new build (no blank page)', fn: async t => {
  const m = await mirror(t);
  const { ctx, pg } = await newPage(t, DESK); await pg.goto(m.url); await pg.waitForTimeout(2500); await pg.reload(); await pg.waitForTimeout(1500);
  expect(await pg.evaluate(() => !!navigator.serviceWorker.controller), 'service worker never took control of the mirror (setup)');
  const ren = fakeDeploy(m.dir); const newMain = Object.values(ren).find(f => /^index-.*\.js$/.test(f));
  await pg.close();
  const p3 = await ctx.newPage(); t.pages.push(p3); await p3.goto(m.url); await p3.waitForTimeout(3000);
  const len = (await p3.locator('#root').innerText()).length;
  const src = await p3.evaluate(() => document.querySelector('script[type=module]')?.src || '');
  expect(len > 0, 'first load after deploy is a blank page (#root empty)');
  t.note = 'served ' + (src.includes(newMain) ? 'new' : 'old') + ' build on first load';
  expect(src.includes(newMain) || /new version|update|reload|actualiz/i.test(await p3.locator('body').innerText()), 'first load after deploy runs the old build with no update notice (stale rules)');
} },
{ id: 'qa-06b-lazy-chunk-after-deploy', area: 'r1 sev4', findings: ['qa-06'], title: 'Export still works (or asks to reload) when a deploy lands while the app is open', fn: async t => {
  const m = await mirror(t);
  const { pg } = await newPage(t, DESK); await pg.goto(m.url); await pg.waitForTimeout(2500); await pg.reload(); await pg.waitForTimeout(1500);
  await demo(pg); await step(pg, 4);
  // drop the lazy chunks from the SW cache only if the app never cached them: that is the old behavior being tested
  fakeDeploy(m.dir, /^(pdf|dxf|handoff|ics|reporthtml)-/);
  let ok = false; try { await download(t, pg, /Check report/, 10000); ok = true; } catch { /* no download */ }
  const msg = (await pg.locator('[role=status]').allInnerTexts()).join(' ');
  expect(ok || (/reload|refresh|new version|actualiz|recarg/i.test(msg) && !/dynamically imported/i.test(msg)), `export failed after deploy: "${msg.slice(0, 160)}"`);
} },
{ id: 'qa-07-offline-export', area: 'offline', findings: ['qa-07'], title: 'Offline: install SW, go offline, reload, export PDF + DXF + Clean and Fix', fn: async t => {
  const { ctx, pg } = await newPage(t, DESK); await gotoApp(pg);
  await pg.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready); await pg.waitForTimeout(3000); await pg.reload(); await pg.waitForTimeout(2500);
  expect(await pg.evaluate(() => !!navigator.serviceWorker.controller), 'service worker does not control the page after install');
  await ctx.setOffline(true); await pg.reload(); await pg.waitForTimeout(2000);
  expect((await pg.locator('#root').innerText()).length > 0, 'app does not load offline');
  await demo(pg); await step(pg, 4);
  const bad = [];
  for (const n of [/Check report/, /Draft site plan/, /Site plan for CAD/]) { try { await download(t, pg, n, 12000); } catch { bad.push(String(n) + ': ' + (await pg.locator('[role=status]').allInnerTexts()).join(' ').slice(0, 90)); } }
  await pg.getByRole('button', { name: /All projects/ }).filter({ visible: true }).first().click().catch(() => {});
  await pg.getByRole('button', { name: /clean and fix/i }).first().click();
  await pg.setInputFiles('input[accept^=".dwg,.dxf"]', path.join(FIX, 'sample.dxf')); await pg.waitForTimeout(8000);
  if (!(await pg.locator('section[aria-label="File report"]').count())) bad.push('Clean and Fix: ' + (await pg.locator('[role=alert]').allInnerTexts()).join(' ').slice(0, 90));
  expect(!bad.length, 'offline failures: ' + bad.join(' | '));
} },
{ id: 'qa-08-ics-month-end', area: 'r1 sev4', findings: ['qa-08'], title: 'ICS plan-check expiry for a 2026-08-31 filing is 2028-02-29', fn: async t => {
  const { pg } = await newPage(t, DESK, { timezoneId: 'America/Los_Angeles' }); await gotoApp(pg); await demo(pg); await step(pg, 4);
  await pg.fill('#filed', '2026-08-31');
  const s = fs.readFileSync(await download(t, pg, '#ics'), 'utf8');
  const starts = [...s.matchAll(/DTSTART[^:]*:(\d{8})/g)].map(x => x[1]);
  expect(starts.includes('20280229'), `expiry DTSTART is ${starts.join(',')} (expected 20280229)`);
} },
{ id: 'qa-09-truncated-dwg', area: 'r1 sev4', findings: ['qa-09'], title: 'Clean and Fix warns on a truncated DWG instead of "cleaning" it to empty', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await pg.getByRole('button', { name: /clean and fix/i }).first().click();
  await pg.setInputFiles('input[accept^=".dwg,.dxf"]', path.join(FIX, 'trunc_dwg2000.dwg')); await pg.waitForTimeout(6000);
  const txt = await pg.locator('main').innerText(); const alerts = (await pg.locator('[role=alert]').allInnerTexts()).join(' ');
  const saveOk = await pg.getByRole('button', { name: 'Save clean copy' }).isEnabled().catch(() => false);
  expect(/truncat|incomplete|cut off|damaged|corrupt|cortado|dañado/i.test(alerts + txt) || (alerts.trim() && !saveOk), 'truncated DWG opens as a normal file with no warning: ' + (txt.match(/AC10\d\d[^\n]*/) || [''])[0]);
} },
{ id: 'qa-10-loss-report', area: 'r1 sev4', findings: ['qa-10', 'OUT-18'], title: 'Clean and Fix says what R12/CNC output will lose before saving', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await pg.getByRole('button', { name: /clean and fix/i }).first().click();
  await pg.setInputFiles('input[accept^=".dwg,.dxf"]', path.join(FIX, 'example_2000.dwg')); await pg.locator('section[aria-label="File report"]').waitFor({ timeout: 60000 });
  await pg.selectOption('#tgt', 'cnc');
  const chk = pg.getByRole('button', { name: /what will be lost/i }); if (await chk.count()) { await chk.click(); await pg.waitForTimeout(5000); }
  const txt = await pg.locator('main').innerText();
  expect(/will not be in|will be lost|\bLost\b|Some lost|se perder/i.test(txt) && /Hatch|MText|HATCH|MTEXT/i.test(txt), 'no loss report naming dropped types (Hatch, MText...) for the R12 copy');
} },
{ id: 'parity-01-csv', area: 'r1 sev4', findings: ['parity-01'], title: 'Materials CSV parses with a constant column count and keeps 16"', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await demo(pg); await step(pg, 4);
  const c = py('csv', await download(t, pg, /Materials list/));
  expect(c.widths.length === 1 && c.has_inch_mark, `CSV rows have widths ${c.widths} and inch mark kept=${c.has_inch_mark}`);
} },
{ id: 'parity-02-one-pack-id', area: 'r1 sev4', findings: ['parity-02'], title: 'Site plan PDF and check report print the same rule-pack id', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg); await step(pg, 4);
  const ids = f => [...new Set([...sh('pdftotext', [f, '-']).matchAll(/la-city@[\d.]+/g)].map(m => m[0]))];
  const a = ids(await download(t, pg, /Check report/)); const b = ids(await download(t, pg, /Draft site plan/));
  const all = [...new Set([...a, ...b])];
  expect(all.length === 1, `pack ids: report ${a.join(',') || 'none'}, site plan ${b.join(',') || 'none'}`);
} },
{ id: 'cor-01-fire-sep-house', area: 'r1 sev5', findings: ['COR-01'], title: 'Detached garage 2 ft from the house, openings, no rated wall: not a pass', fn: async t => {
  // house: y 20'..60' from street; garage: depth 20, 53 ft from rear on a 135 ft lot -> y 62'..82' (2 ft gap)
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg);
  await fillProject(pg, { gx: ft(10), gy: ft(53), answers: { 'q-open': 'Yes', 'q-rated': 'No' } });
  const rs = await results(pg); const fir = rs.filter(r => /^(FIR|SEP)-/.test(r.id));
  t.note = fir.map(r => r.id + ':' + r.status).join(' ');
  expect(fir.some(r => r.status === 'FAIL' || r.status === 'UNKNOWN'), 'every fire-separation check passes with the garage 2 ft from the house: ' + t.note);
} },
{ id: 'cor-02-egress-two-bedrooms', area: 'r1 sev5', findings: ['COR-02'], title: '2 bedrooms with both escape windows in one room: EGR-01 not a pass', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg);
  await fillProject(pg, { beds: 2, windows: [{ room: 'Bedroom', w: '30"', h: '36"', s: '36"' }, { room: 'Bedroom', w: '30"', h: '36"', s: '36"' }] });
  const e = byId(await results(pg), 'EGR-01'); t.note = e.map(r => r.status).join();
  expect(e.length && e.every(r => r.status !== 'PASS'), 'EGR-01 passes with 2 bedrooms and both windows in one room');
} },
{ id: 'cor-03-irregular-lot', area: 'r1 sev4', findings: ['COR-03'], title: 'Lot vertex 1 ft behind the ADU rear wall: FIR-01 not a pass', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg); await fillProject(pg, { gy: ft(10) }); await pg.waitForTimeout(500);
  const ok = await pg.evaluate(async () => { const S = await window.__opaIdb(); const idx = JSON.parse(S.get('opa.index')); const k = 'opa.p.' + idx[0].id; const p = JSON.parse(S.get(k));
    const lot = p.site.lot; const fp = p.adu.footprint; const maxY = Math.max(...lot.map(q => q.y)); const aMaxY = Math.max(...fp.map(q => q.y)); const cx = (Math.min(...fp.map(q => q.x)) + Math.max(...fp.map(q => q.x))) / 2;
    const i = lot.findIndex((q, j) => q.y === maxY && lot[(j + 1) % lot.length].y === maxY); if (i < 0) return false;
    lot.splice(i + 1, 0, { x: cx, y: aMaxY + 305 }); await S.set(k, JSON.stringify(p)); return true; });
  expect(ok, 'setup: could not edit the stored lot polygon');
  await pg.reload(); await pg.locator('nav.rail').waitFor(); await pg.waitForTimeout(800);
  const f = byId(await results(pg), 'FIR-01'); t.note = f.map(r => r.status + ' ' + r.text.split('\n')[1]).join();
  expect(f.length && f[0].status !== 'PASS', 'FIR-01 passes with a lot corner 1 ft behind the ADU: ' + t.note);
} },
{ id: 'cor-04-dismiss-hs', area: 'r1 sev4', findings: ['COR-04'], title: 'A health-and-safety fail (6\'6" ceiling) cannot be dismissed away', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg); await fillProject(pg, { gc: ft(6, 6) });
  expect(byId(await results(pg), 'CEI-01').some(r => r.status === 'FAIL'), 'setup: CEI-01 does not fail for a 6\'6" ceiling');
  await step(pg, 3);
  const lbl = pg.locator('label').filter({ hasText: /CEI-01/ }).locator('button', { hasText: /Dismiss|Descartar/ });
  if (await lbl.count()) { await lbl.first().click(); await pg.fill('dialog input', 'inspector said ok'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(600); }
  const c = byId(await results(pg), 'CEI-01');
  expect(c.some(r => r.status === 'FAIL' && !/Dismissed|Descartado/.test(r.text)), 'CEI-01 (health and safety) was dismissed and no longer counts as a fix');
} },
{ id: 'cor-05-studio-egress', area: 'r1 sev4', findings: ['COR-05'], title: 'Studio with no windows still gets an escape-window check', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg); await fillProject(pg, { beds: 0, windows: [] });
  const e = byId(await results(pg), 'EGR-01'); t.note = e.map(r => r.status).join() || 'absent';
  expect(e.length && e.every(r => r.status === 'FAIL' || r.status === 'UNKNOWN'), 'EGR-01 is ' + t.note + ' for a windowless studio');
} },
{ id: 'cor-06-entry-addition-setback', area: 'r1 sev4', findings: ['COR-06'], title: '150 sq ft entry addition 1 ft from the side line is flagged', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg); await fillProject(pg, { gx: ft(1), answers: { 'q-rated': 'Yes' } });
  await step(pg, 1); await setNum(pg, 'ga', 150);
  if (await hasId(pg, 'gas')) await setLen(pg, 'gas', ft(1));
  if (await hasId(pg, 'q-ingress')) await tri(pg, 'q-ingress', 'Yes');
  const rs = (await results(pg)).filter(r => /^(SET|SCP|ADD)-/.test(r.id)); t.note = rs.map(r => r.id + ':' + r.status).join(' ');
  expect(rs.some(r => r.status === 'FAIL' || r.status === 'UNKNOWN'), 'SET/SCP/ADD all pass for an addition 1 ft from the side line: ' + t.note);
} },
{ id: 'cor-07-unpermitted-garage', area: 'r1 sev4', findings: ['COR-07'], title: 'Unpermitted pre-2020 garage 1 ft from the line is not given AB 2533 setback relief', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg); await fillProject(pg, { gx: ft(1), answers: { 'q-perm': 'No', 'q-2020': 'Yes', 'q-home': 'No', 'q-rated': 'Yes' } });
  const s = byId(await results(pg), 'SET-01'); t.note = s.map(r => r.status).join();
  expect(s.length && s[0].status !== 'PASS' && !/generally can.t/i.test(s[0].text), 'SET-01: ' + (s[0]?.status) + ' "' + (s[0]?.text.split('\n')[1] || '') + '"');
} },
{ id: 'cor-08-existing-sfd-only', area: 'r1 sev4', findings: ['COR-08'], title: 'A duplex main building is flagged for the II-C conversion path', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg); await fillProject(pg);
  await step(pg, 0); expect(await hasId(pg, 'mb'), 'no question about the main building (SFD vs duplex/multifamily)');
  const opt = await pg.locator('#mb option').evaluateAll(os => os.map(o => [o.value, o.textContent]));
  const dup = opt.find(o => /duplex|multi|two/i.test(o.join(' '))); expect(dup, 'no duplex/multifamily choice: ' + JSON.stringify(opt));
  await pg.selectOption('#mb', dup[0]); await pg.waitForTimeout(400);
  const rs = await results(pg); expect(rs.some(r => (r.status === 'FAIL' || r.status === 'UNKNOWN' || r.status === 'INFO') && /single-family|SFD|duplex|II-C/i.test(r.text)), 'duplex lot gets no SFD-only warning');
} },
{ id: 'out-02-pack-version-shown', area: 'r1 sev4', findings: ['OUT-02'], title: 'Rule pack version and rule date are visible', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg); await startNew(pg);
  const b = await pg.locator('body').innerText();
  expect(/20\d\d\.\d+\.\d+/.test(b) && /(rules (as of|checked|verified)|reglas)[^\n]*20\d\d-\d\d-\d\d/i.test(b), 'no pack version or rule date on screen');
} },
{ id: 'out-05-terms-privacy', area: 'r1 sev4', findings: ['OUT-05'], title: 'Welcome links Terms/warranty disclaimer and privacy notice', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg);
  const b = await pg.locator('body').innerText();
  expect(/terms|warranty|términos/i.test(b) && /privacy|privacidad/i.test(b), 'no terms/warranty and privacy text on the welcome screen');
} },

// ---------------------------------------------------------------- 4. accessibility
...[['a11y-390', PHONE], ['a11y-1440', DESK]].map(([id, vp]) => ({ id, area: 'a11y', title: `axe-core WCAG 2.2 AA scan at ${vp.width}x${vp.height} (welcome, 5 steps, Clean and Fix)`, fn: async t => {
  const { pg } = await newPage(t, vp); await gotoApp(pg); const agg = {};
  const run = async label => { await pg.evaluate(AXE); const r = await pg.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }));
    for (const v of r.violations) { const a = agg[v.id] ||= { impact: v.impact, help: v.help, nodes: 0, screens: [] }; a.nodes += v.nodes.length; a.screens.push(label); } };
  await run('welcome'); await demo(pg);
  for (let i = 0; i < 5; i++) { await step(pg, i); await run('step' + (i + 1)); }
  await pg.goto(BASE + '#clean'); await pg.reload(); await pg.waitForTimeout(800);
  if (await pg.locator('input[accept^=".dwg,.dxf"]').count()) { await pg.setInputFiles('input[accept^=".dwg,.dxf"]', path.join(FIX, 'sample.dxf')); await pg.waitForTimeout(4000); await run('clean'); }
  const sev = { critical: 0, serious: 0, moderate: 0, minor: 0 }; for (const v of Object.values(agg)) sev[v.impact] = (sev[v.impact] || 0) + v.nodes;
  t.summary = { bySeverity: sev, rules: agg }; t.note = Object.entries(sev).map(([k, n]) => `${k} ${n}`).join(', ');
  expect(!sev.critical && !sev.serious, 'axe critical/serious violations: ' + Object.entries(agg).filter(([, v]) => ['critical', 'serious'].includes(v.impact)).map(([k, v]) => `${k}(${v.nodes})`).join(' '));
} })),

// ---------------------------------------------------------------- 6. Spanish
{ id: 'spanish-no-english', area: 'i18n', findings: ['parity-08'], title: 'Spanish toggle: no English strings on welcome, 5 steps and check card', fn: async t => {
  const { pg } = await newPage(t, DESK); await gotoApp(pg);
  await pg.getByRole('button', { name: /^Español$/ }).first().click(); await pg.waitForTimeout(400);
  const EN = ["Don't know", 'Yes', 'Next', 'Back', 'Fix', 'Need info', 'Pass', 'Download', 'Street address', 'Lot width', 'Lot depth', 'House width', 'Bedrooms', 'Add a window', 'Check report', 'Draft site plan', 'Materials', 'Drywall', 'Studs', 'insulation', 'Save backup', 'sheet items', 'Software check', 'rules as of', 'Fire separation', 'Escape windows', 'Setbacks', 'Fees and size limits', 'Energy code', 'Permit deadlines', 'Documents to attach', 'Turn off', 'affidavit', 'Saved on this device', 'All projects', 'Undo', 'Redo', 'Feet and inches', 'The garage', 'The lot', 'People on the plans', 'Property owner', 'Preparer', 'Deadlines', 'Some things need fixing', 'Some answers are missing', 'Closest wall', 'needs', 'should', 'the ', ' and ', ' with '];
  const hits = {}; const scan = async label => { const s = (await pg.locator('body').innerText()).split('\n').filter(l => !/^\s*[A-Z]{2,5}-\d+\s·/.test(l)).join('\n');
    for (const w of EN) { const re = new RegExp('(^|[^\\p{L}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}])', 'u' + (w === w.toLowerCase() ? 'i' : '')); const m = s.match(re); if (m) (hits[w] ||= []).push(label); } };
  await scan('welcome'); await startNew(pg);
  if ((await pg.locator('#lang').inputValue()) !== 'es') await pg.selectOption('#lang', 'es');
  for (let i = 0; i < 5; i++) { await step(pg, i); await scan('step' + (i + 1)); }
  t.summary = hits; const n = Object.keys(hits).length; t.note = n + ' English strings';
  expect(!n, 'English left in Spanish mode: ' + Object.entries(hits).slice(0, 12).map(([w, l]) => `"${w.trim()}"@${[...new Set(l)].join('/')}`).join(', '));
} },
];
