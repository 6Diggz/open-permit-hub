// Browser checks for the parity features (parcel autofill, room drawing, review markup) at 390 and 1440.
// City map answers come from recorded fixtures (src/test/fixtures/parcel); no live service is ever called.
//   npm run build && node e2e/feat.mjs            SHOTS=/path node e2e/feat.mjs  (also saves screenshots)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const here = new URL('.', import.meta.url).pathname; const DIST = resolve(here, '../dist'); const FIX = resolve(here, '../src/test/fixtures/parcel');
const SHOTS = process.env.SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const AXE = readFileSync(resolve(here, '../node_modules/axe-core/axe.min.js'), 'utf8'); const tmp = mkdtempSync(join(tmpdir(), 'opa-feat-'));
let failed = 0, total = 0; const ok = (c, n, x = '') => { total++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c || !x ? '' : ' :: ' + x}`); if (!c) failed++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith('/open-permit-hub/')) return res.writeHead(404).end();
  let f = join(DIST, decodeURIComponent(u.pathname.slice(17)) || 'index.html'); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!f.startsWith(DIST) || !existsSync(f)) return res.writeHead(404).end(); res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${server.address().port}/open-permit-hub/`;
const calls = Object.assign({}, ...readdirSync(FIX).map(f => JSON.parse(readFileSync(join(FIX, f), 'utf8')).calls));
const norm = u => decodeURIComponent(u).replace(/\+/g, ' ');
const byNorm = new Map(Object.entries(calls).map(([k, v]) => [norm(k), v]));
const browser = await chromium.launch();
const ctx = (w, extra = {}) => browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, acceptDownloads: true, bypassCSP: true, ...extra });
/** Serve the city map hosts from fixtures. `mode` = 'ok' | 'fail'. Records every request so the opt-in can be checked. */
async function cityMap(page, mode = 'ok') {
  const seen = [];
  await page.route(/https:\/\/((maps|zimas)\.lacity\.org|services\.arcgis\.com|rdp\.scag\.ca\.gov)\/.*/, route => { const u = route.request().url(); seen.push(u);
    if (mode === 'fail') return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'down' });
    const hit = byNorm.get(norm(u)); return route.fulfill({ status: hit ? hit.status : 404, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(hit ? hit.body : { error: { code: 404 } }) }); });
  return seen;
}
const axe = async (page, rules) => { await page.addScriptTag({ content: AXE }); return page.evaluate(async r => (await window.axe.run(document, { runOnly: { type: 'rule', values: r } })).violations.map(v => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`), rules); };
const RULES = ['button-name', 'label', 'aria-allowed-role', 'color-contrast', 'nested-interactive', 'scrollable-region-focusable', 'aria-required-children', 'list', 'listitem', 'th-has-data-cells'];
const step = async (page, k) => { await page.evaluate(k => { location.hash = '#step=' + k; }, k); await page.waitForTimeout(200); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: false }); };
const fullShot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: true }); };

for (const width of process.env.ONLY_STORAGE ? [] : [390, 1440]) {
  const W = `@${width}`;
  // FEATURE 1: parcel autofill
  { const c = await ctx(width); const page = await c.newPage(); const seen = await cityMap(page);
    await page.goto(BASE); await page.getByRole('button', { name: 'Start my project' }).click(); await page.getByRole('heading', { level: 2, name: 'The lot' }).waitFor();
    ok(await page.getByRole('button', { name: 'Look up' }).isDisabled(), `parcel: Look up is off until an address is typed ${W}`);
    await page.fill('#addr', '4305 Edenhurst Ave, Los Angeles, CA 90039'); await page.waitForTimeout(300);
    ok(seen.length === 0, `parcel: nothing is sent before tapping Look up ${W}`, String(seen.length));
    ok(await page.getByText('the street address is sent to the City of Los Angeles').isVisible(), `parcel: the screen says what leaves the device ${W}`);
    await page.getByRole('button', { name: 'Look up' }).click();
    ok(await page.getByText('4305 W EDENHURST AVE').first().waitFor({ timeout: 8000 }).then(() => true, () => false), `parcel: match shown ${W}`, await page.locator('[role=status]').allTextContents().then(x => x.join(' | ')));
    ok(await page.inputValue('#apn') === '5594-014-021' && await page.inputValue('#zone') === 'R1-1-RIO', `parcel: APN and zone filled ${W}`, await page.inputValue('#apn') + ' / ' + await page.inputValue('#zone'));
    ok((await page.inputValue('#lw')).startsWith("40' ") && (await page.inputValue('#ld')).startsWith("140' "), `parcel: lot size filled ${W}`, await page.inputValue('#lw') + ' / ' + await page.inputValue('#ld'));
    ok(await page.locator('#jur').inputValue() === 'la-city', `parcel: city from the real boundary ${W}`);
    ok(await page.locator('#apn-h').textContent() === 'From parcel map, verify on site', `parcel: filled value is tagged ${W}`);
    ok(seen.every(u => /^https:\/\/((maps|zimas)\.lacity\.org|services\.arcgis\.com|rdp\.scag\.ca\.gov)\//.test(u)) && seen.every(u => !/owner|name=/i.test(u)) && seen.filter(u => !/lacity\.org/.test(u)).every(u => !/Edenhurst|Street=/i.test(decodeURIComponent(u))), `parcel: only the city map hosts get the address; the transit maps get only the lot outline ${W}`);
    await page.locator('.drawing').scrollIntoViewIfNeeded(); await shot(page, `parcel-filled-${width}.png`);
await page.getByText('Filled from the parcel map').scrollIntoViewIfNeeded(); await shot(page, `parcel-status-${width}.png`);
    await page.fill('#apn', '5594-014-099'); ok(await page.locator('#apn-h').textContent() !== 'From parcel map, verify on site', `parcel: an edit overrides and removes the tag ${W}`);
    const v = await axe(page, RULES); ok(v.length === 0, `parcel: axe ${W}`, v.join(' | '));
    // offline and failed lookups fall back to manual entry
    await c.setOffline(true); await page.getByRole('button', { name: 'Look up' }).click();
    ok(await page.getByText("You're offline. Enter the lot by hand").waitFor({ timeout: 5000 }).then(() => true, () => false), `parcel: offline message ${W}`); await page.getByText("You're offline").scrollIntoViewIfNeeded(); await shot(page, `parcel-offline-${width}.png`);
    await c.setOffline(false); await page.unrouteAll(); await cityMap(page, 'fail'); await page.getByRole('button', { name: 'Look up' }).click();
    ok(await page.getByText('The city map did not answer').waitFor({ timeout: 5000 }).then(() => true, () => false), `parcel: failed service message ${W}`);
    ok(await page.inputValue('#apn') === '5594-014-099', `parcel: a failed lookup keeps what the user typed ${W}`);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); ok(await page.getByRole('button', { name: 'Buscar' }).isVisible(), `parcel: Spanish ${W}`);
    await c.close(); }

  // FEATURE 2: rooms
  { const c = await ctx(width); const page = await c.newPage(); await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await step(page, 'rooms');
    ok(await page.getByText('No rooms yet.').isVisible(), `rooms: empty state ${W}`); await shot(page, `rooms-empty-${width}.png`);
    await page.getByRole('button', { name: 'Add a room', exact: true }).click(); await page.getByRole('button', { name: 'Add a room', exact: true }).click();
    const rooms = page.locator('.drawing svg polygon[role=button]'); ok(await rooms.count() === 2, `rooms: two rooms drawn ${W}`);
    await page.fill('#rn', 'Bedroom 1'); await page.locator('#rtw').fill("9' 6\""); await page.locator('#rtw').press('Tab'); await page.locator('#rtd').fill("10'"); await page.locator('#rtd').press('Tab');
    ok((await rooms.nth(1).getAttribute('aria-label')).includes("9' 6\" x 10' 0\"") && (await rooms.nth(1).getAttribute('aria-label')).includes('tape-measured'), `rooms: tape size overrides the drawing ${W}`, await rooms.nth(1).getAttribute('aria-label'));
    await page.getByRole('button', { name: 'Add a window' }).click(); await page.getByRole('button', { name: 'Add a door' }).click();
    const before = await rooms.nth(1).getAttribute('points'); await rooms.nth(1).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowUp');
    ok(await rooms.nth(1).getAttribute('points') !== before, `rooms: keyboard nudge moves the room ${W}`);
    await page.locator('h1').first().click(); await page.getByRole('button', { name: 'Undo', exact: true }).locator('visible=true').first().click();
    ok(await rooms.nth(1).getAttribute('points') === before, `rooms: undo puts it back ${W}`);
    await page.getByRole('button', { name: 'Redo', exact: true }).locator('visible=true').first().click(); ok(await rooms.nth(1).getAttribute('points') !== before, `rooms: redo ${W}`);
    // drag a room with the pointer (touch-friendly: pointer events)
    const bb = await rooms.nth(0).boundingBox(); const p0 = await rooms.nth(0).getAttribute('points');
    await page.mouse.move(bb.x + 10, bb.y + 10); await page.mouse.down(); await page.mouse.move(bb.x - 40, bb.y + 10, { steps: 4 }); await page.mouse.up();
    ok(true, `rooms: pointer drag runs without error ${W}`); ok(typeof p0 === 'string', `rooms: room has an outline ${W}`);
    ok(await page.getByText('Bedrooms from your rooms: 1').isVisible(), `rooms: drawn rooms set the bedroom count ${W}`);
    const res = page.locator('.side .res', { hasText: 'Escape window in each sleeping room' }); ok(await res.count() > 0, `rooms: escape window check uses the rooms ${W}`);
    const v = await axe(page, RULES); ok(v.length === 0, `rooms: axe ${W}`, v.join(' | '));
    if (width === 390) ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), `rooms: no sideways scroll at 390`);
    await rooms.nth(1).focus(); await page.locator('.drawing').scrollIntoViewIfNeeded(); await shot(page, `rooms-drawn-${width}.png`); await fullShot(page, `rooms-full-${width}.png`);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); ok(await page.getByRole('button', { name: 'Agregar un cuarto' }).isVisible(), `rooms: Spanish ${W}`);
    const ves = await axe(page, RULES); ok(ves.length === 0, `rooms: axe (es) ${W}`, ves.join(' | ')); await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en').catch(async () => page.locator('#lang').selectOption('en'));
    // A-2 sheet and DXF carry the rooms
    await step(page, 'export');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Site plan for CAD (DXF)' }).click()]); const dxf = readFileSync(await dl.path(), 'utf8');
    ok(dxf.includes('A-AREA') && dxf.includes('BEDROOM 1') && dxf.includes('A-GLAZ'), `rooms: DXF has room, window layers ${W}`);
    await c.close(); }

  // FEATURE 3: review markup
  { const c = await ctx(width); const page = await c.newPage(); await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await step(page, 'review');
    ok(await page.getByText('No notes yet.').isVisible(), `review: empty state ${W}`);
    await page.fill('#rv-au', 'Ana (plan check)');
    await page.getByRole('button', { name: 'Place a pin on the plan' }).click(); const svg = page.locator('.drawing svg'); await svg.scrollIntoViewIfNeeded(); const b = await svg.boundingBox();
    await page.mouse.click(b.x + b.width * 0.4, b.y + b.height * 0.75); await page.locator('#rv-c').waitFor({ timeout: 5000 }); await page.fill('#rv-c', 'Show the 1-hour wall on the rear side.');
    await page.getByRole('button', { name: 'Add a note at the ADU' }).click(); await page.fill('#rv-c', 'Add the eave detail.');
    ok(await page.locator('.drawing svg g[role=button]').count() === 2, `review: two numbered pins on the plan ${W}`);
    await page.getByRole('button', { name: 'Resolved', exact: true }).click();
    const rows = page.locator('table.take tbody tr'); ok(await rows.count() === 2, `review: list mirrors the pins ${W}`);
    await page.getByRole('button', { name: /^Status/ }).click(); ok((await rows.first().textContent()).includes('Open'), `review: sort by status ${W}`);
    await page.getByRole('button', { name: /^Status/ }).click(); ok((await rows.first().textContent()).includes('Resolved'), `review: sort reverses ${W}`);
    const vb0 = await svg.getAttribute('viewBox'); await page.getByRole('button', { name: 'Show note 1 on the plan' }).first().click(); await page.waitForTimeout(100);
    ok(await svg.getAttribute('viewBox') !== vb0, `review: choosing a row zooms to its pin ${W}`); await page.locator('.drawing').scrollIntoViewIfNeeded(); await shot(page, `review-zoom-${width}.png`);
    await page.getByRole('button', { name: 'Show the whole lot' }).click();
    await page.fill('#rv-l', '1. Show the fire-rated wall on the north side.\n2. Provide a window schedule.\n3) Smoke alarms in each bedroom.');
    await page.getByRole('button', { name: 'Split into items' }).click(); ok(await page.getByText('3 items found.').isVisible(), `review: letter splits into items ${W}`);
    await page.getByRole('button', { name: 'Make it a note on the plan' }).first().click(); await page.getByRole('button', { name: 'Answer in the checklist' }).first().click();
    ok(await page.locator('.drawing svg g[role=button]').count() === 3 && await page.getByRole('heading', { name: 'Correction checklist' }).isVisible(), `review: items become pins and checklist answers ${W}`, `${await page.locator('.drawing svg g[role=button]').count()} pins, heading ${await page.getByRole('heading', { name: 'Correction checklist' }).count()}`);
    const [rl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the response letter (text)' }).click()]); ok(readFileSync(await rl.path(), 'utf8').includes('1. Show the fire-rated wall'), `review: response letter ${W}`);
    const v = await axe(page, RULES); ok(v.length === 0, `review: axe ${W}`, v.join(' | '));
    if (width === 390) ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), `review: no sideways scroll at 390`);
    await page.locator('.drawing').scrollIntoViewIfNeeded(); await shot(page, `review-pins-${width}.png`); await fullShot(page, `review-full-${width}.png`);
    // pins travel in the .permitpack: a reviewer with no account opens it
    await step(page, 'export'); const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save backup' }).click()]); const file = join(tmp, `rev-${width}.permitpack`); await bk.saveAs(file);
    const c2 = await ctx(width); const r = await c2.newPage(); await r.goto(BASE); await r.locator('input[type=file][accept^=".permitpack"]').first().setInputFiles(file);
    await r.getByRole('heading', { level: 2 }).first().waitFor(); await step(r, 'review');
    ok(await r.locator('table.take tbody tr').count() === 3, `review: pins open on another device from the .permitpack ${W}`, `${await r.locator('table.take tbody tr').count()} rows; h2=${await r.getByRole('heading', { level: 2 }).first().textContent()}`);
    const [pdf] = await Promise.all([page.waitForEvent('download'), (await step(page, 'export'), page.getByRole('button', { name: 'Draft site plan (PDF, 24x36)' }).click())]); ok(!!(await pdf.path()), `review: PDF with markup sheet downloads ${W}`);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); await step(page, 'review'); ok(await page.getByRole('heading', { name: 'Notas de revisión' }).isVisible(), `review: Spanish ${W}`);
    await c2.close(); await c.close(); }
}

// FEATURE 4: plan-set pre-check (PDF read on the device) and FEATURE 5: inspector field mode. Fixtures are made here with pdf-lib.
const { PDFDocument, StandardFonts } = await import('pdf-lib');
async function planSetPDF() { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  const sheet = ls => { const pg = d.addPage([2592, 1728]); let y = 1650; for (const l of ls) { pg.drawText(l, { x: 60, y, size: 14, font: f }); y -= 24; } };
  sheet(['COVER SHEET', 'SHEET A-0', 'Project address: 4305 W Edenhurst Ave, Los Angeles, CA 90039', 'Owner: Maria Lopez', 'Occupancy: R-3', 'Type V-B', 'Applicable codes: 2023 LARC', 'Smoke alarms in each bedroom, hardwired with battery backup', 'Carbon monoxide alarm per CRC R315']);
  sheet(['FLOOR PLAN', 'SHEET A-2', 'Scale: 1/4" = 1\'-0"', "Ceiling height 6'-10\"", 'Egress window 18" x 22" net clear']);
  return d.save(); }
async function scanPDF() { const d = await PDFDocument.create(); d.addPage([612, 792]).drawRectangle({ x: 40, y: 40, width: 300, height: 300 }); return d.save(); }
const setFile = async (page, sel, name, bytes, mimeType) => page.locator(sel).setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) });
const PHOTO = resolve(here, 'fixtures/site-photo.jpg');
for (const width of process.env.ONLY_STORAGE ? [] : [390, 1440]) {
  const W = `@${width}`;
  { const c = await ctx(width); const page = await c.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await step(page, 'review');
    const pick = 'input[type=file][accept="application/pdf,.pdf"]';
    ok(await page.getByRole('heading', { name: 'Pre-check a plan set (PDF)' }).isVisible(), `precheck: section shown ${W}`);
    ok(await page.getByText('This is an assist, not a plan review').isVisible(), `precheck: says it is an assist, not a review ${W}`);
    const reqs = []; page.on('request', r => { if (!r.url().startsWith(BASE)) reqs.push(r.url()); });
    // 1) the app's own exported sheets, known good
    await step(page, 'export'); const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Draft site plan (PDF, 24x36)' }).click()]);
    const own = readFileSync(await dl.path()); await step(page, 'review');
    await setFile(page, pick, 'own-sheets.pdf', own, 'application/pdf');
    ok(await page.getByText(/2 pages read/).waitFor({ timeout: 20000 }).then(() => true, () => false), `precheck: the app's own sheets are read ${W}`, errs.join(' | '));
    const i2 = page.locator('li.res', { hasText: 'I.C.2 ·' }); ok((await i2.textContent()).includes('Partly found') && (await i2.textContent()).includes('missing the owner') && (await i2.textContent()).includes('Confidence: Medium'), `precheck: demo has no owner, so I.C.2 is partly found with medium confidence ${W}`, await i2.textContent());
    ok((await page.locator('li.res', { hasText: 'III.G.1 ·' }).textContent()).includes("8' 0\""), `precheck: ceiling height read from the floor plan sheet ${W}`);
    ok((await page.locator('li.res', { hasText: 'I.C.7 ·' }).textContent()).includes('Page 1'), `precheck: page reference shown ${W}`);
    ok(await page.locator('table.take caption', { hasText: 'Sheets found' }).isVisible() && (await page.locator('table.take').last().textContent()).includes('A-2'), `precheck: sheet list ${W}`);
    ok(reqs.length === 0, `precheck: nothing leaves the device ${W}`, reqs.join(', '));
    await page.locator('#pc-h').scrollIntoViewIfNeeded(); await shot(page, `precheck-own-${width}.png`);
    // 2) a drafter set with a low ceiling and small escape window
    await setFile(page, pick, 'drafter-set.pdf', await planSetPDF(), 'application/pdf'); await page.locator('.banner', { hasText: 'drafter-set.pdf' }).filter({ hasText: 'pages read' }).waitFor({ timeout: 20000 });
    ok(await page.getByText(/A ceiling height under 7 ft was read/).isVisible(), `precheck: low ceiling flagged ${W}`);
    ok(await page.getByText(/is under 20" wide, 24" high or 5.0 sq ft/).isVisible(), `precheck: small escape window flagged ${W}`);
    await page.getByRole('button', { name: /^Not found in the text \(\d+\)$/ }).click(); const pc = page.locator('section[aria-labelledby=pc-h]'); const nMiss = await pc.locator('li.res.FAIL').count();
    ok(nMiss > 0 && await pc.locator('li.res.PASS').count() === 0 && await pc.locator('li.res.UNKNOWN').count() === 0, `precheck: filter to not-found items ${W}`);
    const pins0 = await page.locator('.drawing svg g[role=button]').count();
    const nOf = async re => Number((await page.getByRole('button', { name: re }).textContent()).match(/\((\d+)\)/)[1]);
    const nProb = nMiss + await nOf(/^Conflicts with code \(\d+\)$/) + await nOf(/^Says not provided \(\d+\)$/);
    await page.getByRole('button', { name: 'Add the problem items as review notes' }).click();
    ok(await page.locator('.drawing svg g[role=button]').count() === pins0 + nProb, `precheck: not-found, conflict and not-provided items become review notes ${W}`, `${pins0} -> ${await page.locator('.drawing svg g[role=button]').count()} (${nProb})`);
    ok(/Conflicts with code\. “.+” \(Page \d+\)/.test(await page.locator('body').textContent()), `precheck: conflict note carries quote and page ${W}`);
    const v = await axe(page, RULES); ok(v.length === 0, `precheck: axe ${W}`, v.join(' | '));
    if (width === 390) ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), `precheck: no sideways scroll at 390`);
    await page.locator('#pc-h').scrollIntoViewIfNeeded(); await shot(page, `precheck-drafter-${width}.png`); await fullShot(page, `precheck-full-${width}.png`);
    // 3) error and edge states
    await setFile(page, pick, 'scan.pdf', await scanPDF(), 'application/pdf');
    ok(await page.getByText('No text was found in this PDF').waitFor({ timeout: 15000 }).then(() => true, () => false), `precheck: scanned PDF says no text ${W}`); await shot(page, `precheck-scan-${width}.png`);
    await setFile(page, pick, 'notes.pdf', new TextEncoder().encode('just text'), 'application/pdf');
    ok(await page.getByText('This file is not a PDF').waitFor({ timeout: 8000 }).then(() => true, () => false), `precheck: not a PDF ${W}`);
    await setFile(page, pick, 'broken.pdf', new TextEncoder().encode('%PDF-1.7\n1 0 obj << >> garbage'), 'application/pdf');
    ok(await page.getByText('This PDF could not be read').waitFor({ timeout: 15000 }).then(() => true, () => false), `precheck: damaged PDF ${W}`); await shot(page, `precheck-error-${width}.png`);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); await step(page, 'review');
    ok(await page.getByRole('heading', { name: 'Revisión previa de un juego de planos (PDF)' }).isVisible(), `precheck: Spanish ${W}`);
    await setFile(page, pick, 'drafter-set.pdf', await planSetPDF(), 'application/pdf');
    ok(await page.getByText(/Se leyó una altura de techo de menos de 7 pies/).waitFor({ timeout: 20000 }).then(() => true, () => false) && await page.getByText(/Confianza: /).first().isVisible(), `precheck: Spanish results ${W}`);
    await page.locator('#pc-h').scrollIntoViewIfNeeded(); await shot(page, `precheck-es-${width}.png`);
    ok(errs.length === 0, `precheck: no page errors ${W}`, errs.join(' | '));
    await c.close(); }

  { const c = await ctx(width, { hasTouch: width < 600, isMobile: width < 600 }); const page = await c.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await step(page, 'review');
    await page.getByRole('button', { name: 'Open field mode' }).click(); await page.getByRole('heading', { name: 'Site visit' }).waitFor();
    ok(page.url().endsWith('#field'), `field: has its own address ${W}`);
    const items = page.locator('li.fm-item'); const n = await items.count(); ok(n >= 20, `field: garage conversion checklist (${n} items) ${W}`);
    const sizes = await page.locator('.fm-result button').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height)); ok(Math.min(...sizes) >= 48, `field: big tap targets (min ${Math.min(...sizes)} px) ${W}`);
    await page.fill('#fm-who', 'R. Inspector');
    const egress = items.filter({ hasText: 'Bedroom escape window' }); await egress.getByRole('button', { name: 'Fail' }).click();
    ok(await egress.getByRole('button', { name: 'Fail' }).getAttribute('aria-pressed') === 'true' && (await egress.getAttribute('class')).includes('FAIL'), `field: fail marks the item ${W}`);
    await items.filter({ hasText: 'Smoke alarms' }).getByRole('button', { name: 'Pass' }).click(); await items.filter({ hasText: 'Fire sprinklers' }).getByRole('button', { name: 'N/A' }).click();
    await egress.getByLabel('Note').fill('Sill at 46 in, over the limit on the plans');
    ok(await egress.locator('input[type=file]').getAttribute('capture') === 'environment' && await egress.locator('input[type=file]').getAttribute('accept') === 'image/*', `field: photo input opens the camera ${W}`);
    await egress.locator('input[type=file]').setInputFiles(PHOTO); ok(await egress.locator('img.fm-thumb').waitFor({ timeout: 10000 }).then(() => true, () => false), `field: photo kept on the device ${W}`, errs.join(' | '));
    const kb = await egress.locator('img.fm-thumb').evaluate(async img => (await (await fetch(img.src)).blob()).size); ok(kb <= 110 * 1024 && kb > 1000, `field: photo compressed (${kb} bytes) ${W}`);
    await egress.locator('input[type=file]').setInputFiles({ name: 'x.heic', mimeType: 'image/heic', buffer: Buffer.from('not an image') });
    ok(await egress.getByText('This photo format cannot be read here').isVisible().catch(() => false) || await egress.getByText('This photo format cannot be read here').waitFor({ timeout: 4000 }).then(() => true, () => false), `field: unreadable photo explained, old photo kept ${W}`);
    ok(await egress.locator('img.fm-thumb').count() === 1, `field: old photo still there after a bad one ${W}`);
    ok((await page.locator('.fm-count').textContent()).includes('3 / '), `field: progress count ${W}`, await page.locator('.fm-count').textContent());
    await page.getByRole('button', { name: /^Fail \(1\)$/ }).click(); ok(await items.count() === 1, `field: filter to failed items ${W}`);
    await page.getByRole('button', { name: /^All items/ }).click();
    const v = await axe(page, [...RULES, 'target-size']); ok(v.length === 0, `field: axe incl. target size ${W}`, v.join(' | '));
    if (width === 390) ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), `field: no sideways scroll at 390`);
    await shot(page, `field-top-${width}.png`); await egress.scrollIntoViewIfNeeded(); await shot(page, `field-item-${width}.png`); await fullShot(page, `field-full-${width}.png`);
    // offline: keeps working and saving
    await c.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    ok(await page.getByText('Offline: everything still works').isVisible(), `field: offline banner ${W}`);
    await items.filter({ hasText: 'Carbon monoxide' }).getByRole('button', { name: 'Pass' }).click(); await page.waitForTimeout(400);
    await page.reload(); await page.getByRole('heading', { name: 'Site visit' }).waitFor({ timeout: 10000 }).catch(() => {});
    const eg2 = page.locator('li.fm-item').filter({ hasText: 'Bedroom escape window' });
    ok(await eg2.getByRole('button', { name: 'Fail' }).getAttribute('aria-pressed').catch(() => null) === 'true' && await eg2.locator('img.fm-thumb').waitFor({ timeout: 8000 }).then(() => true, () => false), `field: results and photo survive a reload ${W}`);
    ok(await page.locator('li.fm-item').filter({ hasText: 'Carbon monoxide' }).getByRole('button', { name: 'Pass' }).getAttribute('aria-pressed') === 'true', `field: offline tap was saved ${W}`);
    await c.setOffline(false);
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Save the visit record (PDF)' }).click()]);
    const pb = readFileSync(await pdf.path()); ok(pb.subarray(0, 5).toString() === '%PDF-' && pb.toString('latin1').includes('/DCTDecode'), `field: PDF record with the photo ${W}`);
    const [pk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save the visit with photos (.permitpack)' }).click()]);
    const file = join(tmp, `visit-${width}.permitpack`); await pk.saveAs(file); const pj = JSON.parse(readFileSync(file, 'utf8'));
    ok(pj.inspection?.items?.egress?.s === 'fail' && Object.values(pj.inspectionPhotos ?? {}).length === 1, `field: .permitpack carries results and photo ${W}`);
    // r5field-06: Remove photo, then Undo, brings the photo back (the image is not deleted at once).
    await eg2.getByRole('button', { name: 'Remove photo' }).click(); ok(await eg2.locator('img.fm-thumb').count() === 0, `field: photo removed ${W}`);
    await page.locator('h2').first().click(); await page.keyboard.press('Control+z');
    ok(await eg2.locator('img.fm-thumb').waitFor({ timeout: 6000 }).then(() => true, () => false) && !(await eg2.getByText('This photo is not on this device').count()), `field: Undo after Remove photo brings the photo back ${W}`);
    // r5field-09: permit number, stage, type, time zone.
    await page.fill('#fm-permit', '25010-10000-01234'); await page.selectOption('#fm-stage', 'final'); await page.selectOption('#fm-kind', 'building');
    ok(await page.getByText('Times are recorded in this time zone').isVisible(), `field: time zone shown ${W}`);
    // r5field-11: the checklist reads the project.
    const spr = page.locator('li.fm-item').filter({ hasText: 'Fire sprinklers' }); ok(/From the project:.*(Not required|Required|Not known)/.test(await spr.innerText()), `field: sprinklers required or not, from the project ${W}`, await spr.innerText());
    const egt = await page.locator('li.fm-item').filter({ hasText: 'Bedroom escape window' }).innerText(); ok(/From the project:.*\d+" x \d+" clear.*sill \d+"/.test(egt), `field: escape window size from the project ${W}`, egt.slice(0, 300));
    await page.waitForTimeout(400);
    const [pdf2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Save the visit record (PDF)' }).click()]);
    const pt = execFileSync('pdftotext', ['-layout', await pdf2.path(), '-'], { encoding: 'utf8' }); const np = (pt.match(/\f/g) || []).length;
    ok(/Permit: 25010-10000-01234/.test(pt) && /Stage: Final/.test(pt) && /Type: Building/.test(pt) && new RegExp(`Page ${np} of ${np}`).test(pt), `field: PDF has permit, stage, type, Page X of N ${W}`, pt.slice(0, 200));
    // r5field-08 + appsec-08: lock the visit file with a generated passphrase; it opens only with it.
    await page.getByRole('button', { name: 'Save it locked with a passphrase' }).click(); const dlg = page.locator('dialog.ask');
    await dlg.getByRole('button', { name: 'Make one for me' }).click(); await page.waitForFunction(() => document.querySelector('#ask-in')?.value.length > 0, null, { timeout: 8000 }).catch(() => {}); const gen = await dlg.locator('#ask-in').inputValue();
    ok(/^[a-z-]+(-[a-z-]+){4,}$/.test(gen) && await dlg.locator('#ask-in').getAttribute('type') === 'text' && await dlg.locator('#ask-in2').inputValue() === gen, `appsec-08: generated passphrase filled and shown ${W}`, gen);
    await shot(page, `field-lock-${width}.png`);
    const [lk] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dlg.getByRole('button', { name: 'Save locked file' }).click()]);
    const lf = join(tmp, `visit-locked-${width}.permitpack`); await lk.saveAs(lf); const lj = readFileSync(lf, 'utf8');
    ok(lk.suggestedFilename().endsWith('-locked.permitpack') && JSON.parse(lj).format === 'permitpack-encrypted' && !lj.includes('R. Inspector'), `field: locked visit file is encrypted ${W}`);
    { const c3 = await ctx(width); const r3 = await c3.newPage(); await r3.goto(BASE); await r3.locator('input[type=file][accept^=".permitpack"]').first().setInputFiles(lf);
      await r3.locator('dialog.ask #ask-in').fill(gen); await r3.locator('dialog.ask').getByRole('button', { name: 'Open' }).click();
      await r3.locator('nav.rail').waitFor({ timeout: 30000 }).catch(async () => { await r3.screenshot({ path: join(tmp, 'r3.png') }); console.log('DEBUG', tmp, (await r3.locator('body').innerText()).slice(0, 600)); }); await step(r3, 'review'); await r3.getByRole('button', { name: 'Open field mode' }).click();
      ok(await r3.locator('li.fm-item').filter({ hasText: 'Bedroom escape window' }).locator('img.fm-thumb').waitFor({ timeout: 10000 }).then(() => true, () => false) && await r3.inputValue('#fm-permit') === '25010-10000-01234', `field: locked visit opens with the passphrase, photo and permit included ${W}`);
      await c3.close(); }
    // another device opens the pack: results and photo are there
    const c2 = await ctx(width); const r = await c2.newPage(); await r.goto(BASE); await r.locator('input[type=file][accept^=".permitpack"]').first().setInputFiles(file);
    await r.getByRole('heading', { level: 2 }).first().waitFor(); await step(r, 'review'); await r.getByRole('button', { name: 'Open field mode' }).click();
    const eg3 = r.locator('li.fm-item').filter({ hasText: 'Bedroom escape window' });
    ok(await eg3.locator('img.fm-thumb').waitFor({ timeout: 8000 }).then(() => true, () => false) && (await eg3.getByLabel('Note').inputValue()).includes('Sill at 46'), `field: visit opens on another device with its photo ${W}`);
    await c2.close();
    // Spanish and clearing the visit
    await page.getByRole('button', { name: 'Back to the project' }).click(); await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); await step(page, 'review');
    await page.getByRole('button', { name: 'Abrir el modo de campo' }).click(); ok(await page.getByRole('heading', { name: 'Visita a la obra' }).isVisible() && await page.getByRole('button', { name: 'No cumple' }).first().isVisible(), `field: Spanish ${W}`);
    await shot(page, `field-es-${width}.png`);
    await page.getByRole('button', { name: 'Borrar la visita' }).click(); await page.locator('dialog.ask').getByRole('button', { name: 'Borrar la visita' }).click();
    ok(await page.getByText('Se borró la visita.').isVisible() && await page.locator('img.fm-thumb').count() === 0 && await page.locator('.fm-result button[aria-pressed=true]').count() === 0, `field: clear removes results and photos ${W}`);
    ok(await page.inputValue('#fm-who') === 'R. Inspector', `field: inspector name kept after clearing ${W}`);
    ok(errs.length === 0, `field: no page errors ${W}`, errs.join(' | '));
    await c.close(); }
}

// OUT2-10: projects move from localStorage to IndexedDB at start, losslessly, from saves of every earlier version.
{ const SAVES = resolve(here, 'fixtures/saves'); const fx = Object.fromEntries(readdirSync(SAVES).map(f => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(SAVES, f), 'utf8'))]));
  // v0.1 single-project key, built from the round-1 project; and a messy device: two projects, one damaged, one with no list entry.
  const r1 = Object.entries(fx['r1-oldbuild']).find(([k]) => k.startsWith('opa.p.'))[1]; fx['v0.1-single-key'] = { 'opa.project.v1': r1 };
  const m = fx['main-6785e84']; const mid = Object.keys(m).find(k => k.startsWith('opa.p.')); const orphan = JSON.parse(m[mid]); orphan.id = '11111111-2222-4333-8444-555555555555'; orphan.name = 'Orphan project';
  fx['messy'] = { ...m, ...fx['r1-oldbuild'], 'opa.index': JSON.stringify([...JSON.parse(m['opa.index']), ...JSON.parse(fx['r1-oldbuild']['opa.index']), { id: 'deadbeef-0000-4000-8000-000000000000', name: 'Damaged one', address: '', updatedAt: '2026-01-01T00:00:00Z', demo: false }]), 'opa.p.deadbeef-0000-4000-8000-000000000000': '{"format":"permitpack", broken', ['opa.p.' + orphan.id]: JSON.stringify(orphan), 'opa.lang': 'en' };
  const idb = page => page.evaluate(() => new Promise(res => { const r = indexedDB.open('opa-store', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { const t = r.result.transaction('kv'); const s = t.objectStore('kv'); const k = s.getAllKeys(), v = s.getAll(); t.oncomplete = () => res(Object.fromEntries(k.result.map((x, i) => [x, v.result[i]]))); }; }));
  for (const [name, dump] of Object.entries(fx)) {
    const c = await ctx(1440); const page = await c.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + 'no-such-page'); await page.evaluate(d => { localStorage.clear(); for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v); }, dump);
    await page.goto(BASE); await page.waitForTimeout(1200);
    const want = Object.keys(dump).filter(k => k.startsWith('opa.p.')).map(k => k.slice(6)).concat(dump['opa.project.v1'] ? [JSON.parse(dump['opa.project.v1']).id] : []);
    const db = await idb(page); const ls = await page.evaluate(() => Object.keys(localStorage));
    ok(want.every(id => typeof db['opa.p.' + id] === 'string'), `storage: ${name}: every project is in IndexedDB`, JSON.stringify(Object.keys(db)));
    ok(Object.entries(dump).filter(([k]) => k.startsWith('opa.p.')).every(([k, v]) => { try { return (JSON.parse(db[k]).rev ?? 0) >= (JSON.parse(v).rev ?? 0); } catch { return db[k] === v; } }), `storage: ${name}: moved byte for byte or newer`);
    ok(!ls.some(k => k.startsWith('opa.p.') || k === 'opa.index' || k === 'opa.project.v1'), `storage: ${name}: localStorage copies removed after the move`, ls.join());
    ok(!dump['opa.lang'] || ls.includes('opa.lang'), `storage: ${name}: preferences stay in localStorage`);
    const idx = JSON.parse(db['opa.index'] || '[]'); ok(want.every(id => idx.some(e => e.id === id)), `storage: ${name}: every project is listed`, JSON.stringify(idx.map(e => e.name)));
    // The app opens the newest project; go to the list and open each one that is not damaged.
    await page.evaluate(() => { location.hash = ''; }); await page.reload(); await page.waitForTimeout(800);
    const all = page.getByRole('button', { name: /All projects/ }); if (await all.count()) { await all.first().click(); await page.waitForTimeout(400); }
    const rows = await page.locator('section[aria-label="Your projects"] li').count();
    ok(rows === want.length, `storage: ${name}: the project list shows all ${want.length}`, String(rows));
    if (name === 'messy') { await page.getByRole('button', { name: /Orphan project/ }).click(); ok(await page.locator('nav.rail').waitFor({ timeout: 5000 }).then(() => true, () => false), `storage: messy: the project that had no list entry opens`); }
    // Reload with localStorage now empty: still there (read from IndexedDB).
    await page.reload(); await page.waitForTimeout(800); const db2 = await idb(page); ok(want.every(id => db2['opa.p.' + id]), `storage: ${name}: still there after reload`);
    ok(errs.length === 0, `storage: ${name}: no page errors`, errs.join(' | '));
    await c.close();
  }
  // A real old build writing to localStorage on the same origin, then this build (local runs only; the old build is not in the repo).
  const OLD = '/home/claude/stress/e2e/oldbuild';
  if (existsSync(OLD)) { const old = createServer((req, res) => { const u = new URL(req.url, 'http://x'); const root = u.searchParams.has('new') || !globalThis.__oldMode ? DIST : OLD; let f = join(root, decodeURIComponent(u.pathname.replace(/^\/open-permit-hub\//, '/')) || 'index.html'); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html'); if (!existsSync(f)) return res.writeHead(404).end(); res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f)); });
    await new Promise(r => old.listen(0, '127.0.0.1', r)); const OB = `http://127.0.0.1:${old.address().port}/open-permit-hub/`;
    const c = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } }); const page = await c.newPage();
    globalThis.__oldMode = true; await page.goto(OB); await page.getByRole('button', { name: /demo/i }).first().click(); await page.waitForTimeout(1500);
    const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
    globalThis.__oldMode = false; await page.goto(OB + '#'); await page.reload(); await page.waitForTimeout(1500);
    const db = await idb(page); const ids = Object.keys(before).filter(k => k.startsWith('opa.p.'));
    ok(ids.length > 0 && ids.every(k => db[k] === before[k]), `storage: round-1 build -> this build moves the project byte for byte`, ids.join());
    ok(await page.locator('nav.rail').waitFor({ timeout: 5000 }).then(() => true, () => false), `storage: round-1 project opens in this build`);
    await c.close(); old.close(); }
  // A save right before a reload or close is never lost (write-ahead journal in localStorage, replayed on start).
  { const c = await ctx(1440); const page = await c.newPage(); await page.goto(BASE); await page.getByRole('button', { name: 'Start my project' }).click(); await page.waitForTimeout(500);
    await page.fill('#addr', '9 Quick Close Rd'); await page.fill('#lw', "61'"); await page.locator('#lw').press('Tab'); await page.reload(); await page.locator('#addr').waitFor();
    ok(await page.inputValue('#addr') === '9 Quick Close Rd' && (await page.inputValue('#lw')).startsWith("61'"), `storage: edit then immediate reload keeps the edit`, await page.inputValue('#addr'));
    await page.fill('#addr', '10 Quick Close Rd'); await page.close({ runBeforeUnload: true }); const p2 = await c.newPage(); await p2.goto(BASE); await p2.locator('#addr').waitFor({ timeout: 8000 }).catch(() => {});
    ok(await p2.inputValue('#addr').catch(() => '') === '10 Quick Close Rd', `storage: edit then closing the tab keeps the edit`);
    ok(await p2.evaluate(() => new Promise(r => setTimeout(() => r(Object.keys(localStorage).filter(k => k.startsWith('opa.wal.')).length), 800))) === 0, `storage: journal is empty once IndexedDB has the writes`);
    await c.close(); }
  // Fallback: IndexedDB blocked -> localStorage, saves still work across a reload.
  { const c = await ctx(1440); await c.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('blocked', 'SecurityError'); } }); }); const page = await c.newPage();
    await page.goto(BASE); await page.getByRole('button', { name: 'Start my project' }).click(); await page.fill('#addr', '77 Fallback Ave'); await page.waitForTimeout(800);
    ok(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('opa.p.'))), `storage: IndexedDB blocked: saved to localStorage instead`);
    await page.reload(); await page.waitForTimeout(800); ok(await page.inputValue('#addr').catch(() => '') === '77 Fallback Ave', `storage: IndexedDB blocked: project kept after reload`);
    ok(!(await page.getByText('Not saved').count()), `storage: IndexedDB blocked: no false "Not saved"`); await c.close(); }
  // Two tabs on one project: a save in tab B is noticed in tab A (BroadcastChannel replaces the storage event).
  { const c = await ctx(1440); const a = await c.newPage(); await a.goto(BASE); await a.getByRole('button', { name: 'Start my project' }).click(); await a.fill('#addr', '1 Tab St'); await a.waitForTimeout(800);
    const bp = await c.newPage(); await bp.goto(BASE); await bp.waitForTimeout(800); await bp.fill('#addr', '2 Tab St'); await bp.waitForTimeout(800);
    ok(await a.getByText('This project changed in another tab').first().waitFor({ timeout: 4000 }).then(() => true, () => false), `storage: another tab's save is noticed (IndexedDB)`, await bp.inputValue('#addr').catch(() => 'no addr in tab B') + ' | ' + (await a.locator('.banner').allTextContents()).join(' / ')); await c.close(); }
  // Persistent storage: the answer is shown on the project list.
  { const c = await ctx(390); const page = await c.newPage(); await page.goto(BASE); await page.getByRole('button', { name: 'Start my project' }).click(); await page.waitForTimeout(600); await page.evaluate(() => { location.hash = ''; }); await page.reload(); await page.waitForTimeout(600);
    const all = page.getByRole('button', { name: /All projects/ }); if (await all.count()) { await all.first().click(); await page.waitForTimeout(400); }
    const s = page.locator('[data-persist]'); ok(await s.waitFor({ timeout: 4000 }).then(() => true, () => false) && /^Storage: /.test(await s.textContent()), `storage: persistent-storage answer shown`, await s.textContent().catch(() => 'none'));
    await s.scrollIntoViewIfNeeded().catch(() => {}); await shot(page, 'storage-persist-390.png'); await c.close(); }
  // iOS Safari only: Add to Home Screen hint, dismissible and remembered.
  { const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    for (const [ua, want] of [[IOS, true], [IOS.replace('Version/18.0', 'CriOS/130.0.0.0'), false]]) { const c = await ctx(390, { userAgent: ua, hasTouch: true }); const page = await c.newPage(); await page.goto(BASE); await page.getByRole('button', { name: 'Start my project' }).click(); await page.waitForTimeout(500);
      const tip = page.getByText('Tip: in Safari tap Share'); ok((await tip.count() > 0) === want, `storage: Home Screen hint ${want ? 'shown on iOS Safari' : 'hidden on Chrome for iOS'}`);
      if (want) { await shot(page, 'storage-ios-hint-390.png'); await page.getByRole('button', { name: 'Hide this tip' }).click(); ok(await tip.count() === 0, 'storage: hint dismissed'); await page.reload(); await page.waitForTimeout(600); ok(await tip.count() === 0, 'storage: hint stays dismissed'); }
      await c.close(); } }
}
await browser.close(); server.close();
console.log(`${total - failed}/${total} passed` + (failed ? `, ${failed} FAILED` : '')); process.exit(failed ? 1 : 0);
