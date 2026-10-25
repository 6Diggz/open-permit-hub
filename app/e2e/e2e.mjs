// End-to-end checks in a real browser (Playwright + Chromium), at phone (390) and desktop (1440) widths.
// Local:  npm run build && node e2e/e2e.mjs            (serves dist/ under /open-permit-hub/)
// Live:   BASE=https://6diggz.github.io/open-permit-hub/ node e2e/e2e.mjs --smoke
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, cpSync, readdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SMOKE = process.argv.includes('--smoke');
const here = new URL('.', import.meta.url).pathname;
const DIST = resolve(here, '../dist'); const FIXTURE = resolve(here, '../../clean/tests/fixtures/mixed_r2018.dxf');
const AXE = readFileSync(resolve(here, '../node_modules/axe-core/axe.min.js'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'opa-e2e-'));
let failed = 0; const results = [];
const ok = (cond, name, extra = '') => { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !extra ? '' : ' :: ' + extra}`); if (!cond) failed++; };

// Static server with a switchable root (to simulate a new deploy).
let ROOT = DIST; let server; let BASE = process.env.BASE;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff' };
if (!BASE) {
  server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith('/open-permit-hub/')) { res.writeHead(404).end(); return; }
    let f = join(ROOT, decodeURIComponent(u.pathname.slice('/open-permit-hub/'.length)) || 'index.html');
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/open-permit-hub/`;
}
const ORIGIN = new URL(BASE).origin;
const browser = await chromium.launch();
const ctx = async (width, extra = {}) => browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, acceptDownloads: true, ...extra });
const axe = async (page, rules) => { await page.addScriptTag({ content: AXE }); return page.evaluate(async r => (await window.axe.run(document, { runOnly: { type: 'rule', values: r } })).violations.map(v => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`), rules); };
const seen = (loc, timeout = 8000) => loc.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);
const visibleButton = (page, name) => page.getByRole('button', { name, exact: true }).locator('visible=true').first();
async function startDemo(page) { await page.goto(BASE); await page.getByRole('button', { name: /Try the demo lot|Probar el lote/ }).click(); await page.getByRole('heading', { level: 2, name: 'The lot' }).waitFor(); }
async function step(page, key) { await page.evaluate(k => { location.hash = '#step=' + k; }, key); await page.waitForTimeout(150); }

for (const width of [390, 1440]) {
  const W = `@${width}`;
  // Privacy (appsec-12): no request leaves the site.
  { const c = await ctx(width); const page = await c.newPage(); const hosts = new Set(); page.on('request', r => { const o = new URL(r.url()).origin; if (!r.url().startsWith('blob:') && !r.url().startsWith('data:')) hosts.add(o); });
    await startDemo(page); await step(page, 'export'); await page.waitForTimeout(300);
    ok([...hosts].every(h => h === ORIGIN), `appsec-12 no third-party requests ${W}`, [...hosts].join(','));
    // qa-28 headings, landmarks and focus
    ok(await page.locator('h1').count() >= 1, `qa-28 project page has an h1 ${W}`);
    await step(page, 'lot'); await page.getByRole('button', { name: /^Next/ }).click();
    ok(await page.evaluate(() => document.activeElement?.tagName === 'H2' && document.activeElement.textContent === 'The garage'), `qa-28 focus moves to the new step heading ${W}`);
    // qa-24 Back stays in the app and the step survives reload
    await page.goBack(); await page.waitForTimeout(200);
    ok(page.url().includes('#step=lot') && await page.getByRole('heading', { level: 2, name: 'The lot' }).isVisible(), `qa-24 browser Back returns to the previous step ${W}`);
    await page.goForward(); await page.reload(); await page.getByRole('heading', { level: 2, name: 'The garage' }).waitFor({ timeout: 5000 }).catch(() => {});
    ok(await page.getByRole('heading', { level: 2, name: 'The garage' }).isVisible(), `qa-24 reload keeps the step ${W}`);
    // parity-04 / qa-05 All projects reachable at this width
    const all = visibleButton(page, 'All projects'); ok(await all.isVisible(), `parity-04 qa-05 "All projects" visible ${W}`);
    await all.click(); ok(await page.getByRole('button', { name: '+ New project' }).isVisible(), `parity-05 "+ New project" on the projects list ${W}`);
    ok(await page.locator('main#main').count() === 1, `qa-28 welcome has a main landmark ${W}`);
    await c.close(); }

  // parity-15 / qa-25 undo, redo, resume; Ctrl+Z inside a field doesn't undo the project
  { const c = await ctx(width); const page = await c.newPage(); await startDemo(page);
    await page.fill('#lw', "60'"); await page.locator('#lw').press('Tab');
    await page.fill('#addr', '1 Undo Test St'); await page.locator('#addr').press('Control+z');
    ok((await page.inputValue('#lw')).startsWith("60'"), `qa-25 Ctrl+Z in a text field leaves the project alone ${W}`);
    await page.locator('h1').first().click(); await visibleButton(page, 'Undo').click();
    if ((await page.inputValue('#lw')).startsWith("60'") && await visibleButton(page, 'Undo').isEnabled()) await visibleButton(page, 'Undo').click();
    ok(!(await page.inputValue('#lw')).startsWith("60'"), `parity-15 Undo reverts the lot width ${W}`);
    while (await visibleButton(page, 'Redo').isEnabled()) await visibleButton(page, 'Redo').click();
    ok((await page.inputValue('#lw')).startsWith("60'"), `parity-15 Redo brings it back ${W}`);
    await page.reload(); await page.getByRole('heading', { level: 2 }).first().waitFor();
    ok((await page.inputValue('#lw')).startsWith("60'"), `parity-15 reload resumes the saved project ${W}`);
    // qa-02 Infinity can't be typed into a length
    await page.fill('#ld', '1/0"'); await page.locator('#ld').press('Tab');
    ok(await page.locator('#ld').getAttribute('aria-invalid') === 'true', `qa-02 1/0" is rejected in a length field ${W}`);
    await page.reload(); ok(await page.getByRole('heading', { level: 2, name: 'The lot' }).isVisible(), `qa-02 project still opens after the bad input ${W}`);
    // qa-21 survey makes uncertainty 0
    await page.fill('#err', '0'); await page.locator('#err').press('Tab'); ok(await page.locator('#err').getAttribute('aria-invalid') !== 'true', `qa-21 lot-line uncertainty accepts 0 ${W}`);
    // parity-07 absurd sizes get a warning
    await page.fill('#lw', "99999'"); await page.locator('#lw').press('Tab'); ok(await page.getByText('Check this number').first().isVisible(), `parity-07 absurd lot width shows "Check this number" ${W}`);
    await c.close(); }

  // qa-01 / appsec-06 / appsec-08: save and restore plain and locked packs
  if (!SMOKE || width === 390) { const c = await ctx(width); const page = await c.newPage(); await startDemo(page); await step(page, 'export');
    const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save backup' }).click()]); const plain = join(tmp, `plain-${width}.permitpack`); await d1.saveAs(plain);
    await page.getByRole('button', { name: 'Save locked copy to share' }).click();
    await page.fill('#ask-in', 'copper lamp river'); await page.fill('#ask-in2', 'copper lamp rivet'); await page.getByRole('button', { name: 'Save locked copy', exact: true }).click();
    ok(await page.getByText('The two passphrases do not match.').isVisible(), `appsec-08 passphrase typo is caught ${W}`);
    await page.fill('#ask-in2', 'copper lamp river');
    const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save locked copy', exact: true }).click()]); const locked = join(tmp, `locked-${width}.permitpack`); await d2.saveAs(locked);
    await visibleButton(page, 'All projects').click();
    await page.locator('input[type=file][accept=".permitpack,.json"]').setInputFiles(plain);
    await page.getByRole('button', { name: 'Keep both' }).click();
    ok(await page.getByRole('heading', { level: 2, name: 'Checks' }).isVisible({ timeout: 5000 }).catch(() => false), `qa-01 a plain backup restores ${W}`);
    ok((await page.locator('h1').first().textContent()).includes('(opened copy)'), `appsec-06 opening a pack with the same id keeps both ${W}`);
    await visibleButton(page, 'All projects').click();
    await page.locator('input[type=file][accept=".permitpack,.json"]').setInputFiles(locked);
    await page.fill('#ask-in', 'copper lamp river'); await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: 'Keep both' }).click();
    ok(await page.getByRole('heading', { level: 2, name: 'Checks' }).isVisible({ timeout: 15000 }).catch(() => false), `qa-01 a locked pack restores with its passphrase ${W}`);
    writeFileSync(join(tmp, 'garbage.permitpack'), '{{{garbage');
    await visibleButton(page, 'All projects').click(); await page.locator('input[type=file][accept=".permitpack,.json"]').setInputFiles(join(tmp, 'garbage.permitpack'));
    ok(await seen(page.getByText('This file is damaged or is not a permit pack.')), `qa-33 damaged file shows a plain message ${W}`);
    await c.close(); }

  // qa-04 two tabs on one project; qa-29 focus ring on file pickers; appsec-10 CSP and frame protection
  { const c = await ctx(width); const a = await c.newPage(); await startDemo(a); const b = await c.newPage(); await b.goto(a.url()); await b.getByRole('heading', { level: 2 }).first().waitFor();
    await b.fill('#addr', 'Tab B St'); await b.waitForTimeout(300);
    ok(await seen(a.locator('.banner', { hasText: 'Pick which copy to keep' })), `qa-04 the other tab is warned ${W}`);
    await a.fill('#apn', '1111-222-333'); await a.waitForTimeout(300); await b.reload(); await b.getByRole('heading', { level: 2 }).first().waitFor();
    ok((await b.inputValue('#addr')) === 'Tab B St', `qa-04 tab B's edit is not overwritten ${W}`);
    await a.goto(BASE + '#projects'); await visibleButton(a, 'All projects').click().catch(() => {});
    const c2 = await ctx(width); const w = await c2.newPage(); await w.goto(BASE); await w.keyboard.press('Tab'); let found = false;
    for (let i = 0; i < 12 && !found; i++) { found = await w.evaluate(() => document.activeElement?.type === 'file'); if (!found) await w.keyboard.press('Tab'); }
    ok(found && await w.evaluate(() => getComputedStyle(document.activeElement.closest('label')).outlineStyle !== 'none'), `qa-29 the file picker shows a focus ring ${W}`);
    ok(await w.locator('meta[http-equiv="Content-Security-Policy"]').count() === 1, `appsec-10 CSP meta present ${W}`);
    const host = await c.newPage(); await host.setContent(`<iframe src="${BASE}" width="400" height="300"></iframe>`); await host.waitForTimeout(1500);
    const framedApp = await host.frames()[1]?.locator('text=Try the demo lot').count().catch(() => 0);
    ok(!framedApp, `appsec-10 the app refuses to run inside another site's frame ${W}`);
    await c2.close(); await c.close(); }

  // parity-13 calendar hint; qa-16 unprintable characters are flagged
  { const c = await ctx(width); const page = await c.newPage(); await startDemo(page); await step(page, 'export');
    ok(await page.getByText('Enter the date you filed to set the reminder.').isVisible(), `parity-13 calendar button explains why it is off ${W}`);
    await page.fill('#own', 'Wang 王'); ok(await page.getByText(/can't print in this PDF yet/).isVisible(), `qa-16 characters the PDF can't print are flagged ${W}`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Check report (PDF)' }).click()]); ok(!!(await dl.path()), `qa-16 report PDF still exports with those characters ${W}`);
    const [dx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Site plan for CAD (DXF)' }).click()]);
    const dxf = readFileSync(await dx.path(), 'utf8'); ok(dxf.includes('AC1032') && dxf.includes('LWPOLYLINE'), `parity-11 DXF download is DXF 2018 with polylines ${W}`);
    await c.close(); }

  // Accessibility (qa-26, qa-27, qa-28, qa-30, OUT-09): key axe rules on every screen, EN and ES, light and dark
  for (const scheme of ['light', 'dark']) { const c = await ctx(width, { colorScheme: scheme, bypassCSP: true }); const page = await c.newPage(); await page.goto(BASE);
    const rules = ['nested-interactive', 'page-has-heading-one', 'landmark-one-main', 'scrollable-region-focusable', 'color-contrast', 'button-name', 'label', 'aria-allowed-role', 'heading-order'];
    const v0 = await axe(page, rules); ok(v0.length === 0, `OUT-09 qa2-06 axe welcome ${scheme} ${W}`, v0.join(' | '));
    ok(await page.getByText('Example result (demo lot, not your project)').isVisible(), `parity2-02 home sample card is labeled as an example ${scheme} ${W}`);
    await startDemo(page);
    for (const k of ['lot', 'garage', 'rooms', 'checks', 'export']) { await step(page, k); const v = await axe(page, rules); ok(v.length === 0, `OUT-09 qa-27 qa-30 axe ${k} ${scheme} ${W}`, v.join(' | ')); }
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); await step(page, 'checks'); const ves = await axe(page, rules); ok(ves.length === 0, `OUT-09 axe checks (es) ${scheme} ${W}`, ves.join(' | '));
    ok(await page.getByText('Retiros, altura y tamaño').isVisible(), `parity-08 check groups in Spanish ${scheme} ${W}`);
    await c.close(); }

  // Clean and Fix (qa-09, qa-10, OUT-18)
  { const c = await ctx(width); const page = await c.newPage(); await page.goto(BASE + '#clean');
    await page.locator('input[type=file][accept=".dwg,.dxf"]').setInputFiles(FIXTURE); await page.getByText('mixed_r2018.dxf').waitFor({ timeout: 30000 });
    await page.selectOption('#tgt', 'cnc'); await page.getByRole('button', { name: 'Check what will be lost' }).click();
    const lostTable = page.getByRole('region', { name: 'What will be lost' }); await lostTable.waitFor({ timeout: 30000 });
    ok(await lostTable.getByRole('cell', { name: 'MText' }).isVisible(), `qa-10 OUT-18 loss report lists MText for R12 ${W}`);
    const save = page.getByRole('button', { name: 'Save clean copy' }); ok(await save.isDisabled(), `qa-10 saving with losses needs a tick ${W}`);
    await page.getByLabel('I understand these will not be in the copy.').check(); ok(await save.isEnabled(), `qa-10 tick enables save ${W}`);
    const pad = '999\n' + 'x'.repeat(3000) + '\n'; writeFileSync(join(tmp, 'cut.dxf'), `${pad}  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n`);
    await page.locator('input[type=file][accept=".dwg,.dxf"]').setInputFiles(join(tmp, 'cut.dxf')); await page.getByText('cut.dxf').waitFor({ timeout: 30000 }).catch(() => {});
    const blocked = await page.getByText(/cut off or damaged|nothing to clean/).first().isVisible().catch(() => false);
    const errShown = await page.getByRole('alert').first().isVisible().catch(() => false);
    ok(blocked || errShown, `qa-09 an empty or cut-off drawing is flagged ${W}`);
    ok(await page.getByRole('button', { name: 'Save clean copy' }).isDisabled().catch(() => true), `qa-09 it can't be saved as an empty file ${W}`);
    ok(await page.locator('main#main').count() === 1, `qa-28 Clean and Fix has a main landmark ${W}`);
    await c.close(); }
}

// Offline and deploys (qa-06, qa-07, OUT-04): local only (needs a server we control)
if (!SMOKE && server) {
  const c = await ctx(1440); const page = await c.newPage(); await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  await page.waitForFunction(async () => { const ks = await caches.keys(); const c = await caches.open(ks.find(k => k.startsWith('opa-'))); return (await c.keys()).some(r => r.url.endsWith('.wasm')); }, null, { timeout: 60000 });
  ok(true, 'qa-07 service worker precached the WASM and chunks');
  await c.setOffline(true); await page.reload(); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await step(page, 'export');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Check report (PDF)' }).click()]).catch(() => [null]);
  ok(!!pdf, 'qa-07 offline: check report PDF exports');
  const [dxf] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Site plan for CAD (DXF)' }).click()]).catch(() => [null]);
  ok(!!dxf, 'qa-07 offline: DXF exports');
  await page.goto(BASE + '#clean'); await page.locator('input[type=file][accept=".dwg,.dxf"]').setInputFiles(FIXTURE);
  ok(await seen(page.getByText('mixed_r2018.dxf'), 30000), 'qa-07 offline: Clean and Fix opens a file');
  await c.setOffline(false); await page.goto(BASE);
  // Simulate a new deploy: new hashed entry file, new service worker.
  const v1 = JSON.parse(readFileSync(join(DIST, 'version.json'), 'utf8')).version;
  const D2 = join(tmp, 'dist2'); cpSync(DIST, D2, { recursive: true });
  const entry = readdirSync(join(D2, 'assets')).find(f => /^index-.*\.js$/.test(f)); renameSync(join(D2, 'assets', entry), join(D2, 'assets', 'index-NEWDEPLOY.js'));
  const swap = f => writeFileSync(join(D2, f), readFileSync(join(D2, f), 'utf8').split(entry).join('index-NEWDEPLOY.js'));
  swap('index.html'); writeFileSync(join(D2, 'sw.js'), readFileSync(join(D2, 'sw.js'), 'utf8').replace(v1, 'deploy2').split(entry).join('index-NEWDEPLOY.js'));
  ROOT = D2;
  const fresh = await c.newPage(); await fresh.goto(BASE); await fresh.waitForTimeout(800);
  ok((await fresh.locator('#root').innerText()).length > 0, 'qa-06 first load after a deploy is not blank');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  ok(await seen(page.getByText('An update is ready'), 30000), 'OUT-04 qa-06 update prompt appears after a deploy');
  await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.getByRole('button', { name: 'Reload' }).click()]).catch(() => {});
  await page.waitForTimeout(1000);
  const keys = await page.evaluate(() => caches.keys()); ok(keys.filter(k => k.startsWith('opa-')).length === 1 && keys.includes('opa-deploy2'), 'qa-06 old caches removed, new cache active', keys.join(','));
  await c.close(); ROOT = DIST; rmSync(D2, { recursive: true, force: true });
}

await browser.close(); server?.close();
console.log(`${results.length - failed}/${results.length} passed` + (failed ? `, ${failed} FAILED` : ''));
process.exit(failed ? 1 : 0);
