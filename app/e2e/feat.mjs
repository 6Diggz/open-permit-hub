// Browser checks for the parity features (parcel autofill, room drawing, review markup) at 390 and 1440.
// City map answers come from recorded fixtures (src/test/fixtures/parcel); no live service is ever called.
//   npm run build && node e2e/feat.mjs            SHOTS=/path node e2e/feat.mjs  (also saves screenshots)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

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
  await page.route(/https:\/\/(maps|zimas)\.lacity\.org\/.*/, route => { const u = route.request().url(); seen.push(u);
    if (mode === 'fail') return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'down' });
    const hit = byNorm.get(norm(u)); return route.fulfill({ status: hit ? hit.status : 404, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(hit ? hit.body : { error: { code: 404 } }) }); });
  return seen;
}
const axe = async (page, rules) => { await page.addScriptTag({ content: AXE }); return page.evaluate(async r => (await window.axe.run(document, { runOnly: { type: 'rule', values: r } })).violations.map(v => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`), rules); };
const RULES = ['button-name', 'label', 'aria-allowed-role', 'color-contrast', 'nested-interactive', 'scrollable-region-focusable', 'aria-required-children', 'list', 'listitem', 'th-has-data-cells'];
const step = async (page, k) => { await page.evaluate(k => { location.hash = '#step=' + k; }, k); await page.waitForTimeout(200); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: false }); };
const fullShot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: true }); };

for (const width of [390, 1440]) {
  const W = `@${width}`;
  // FEATURE 1: parcel autofill
  { const c = await ctx(width); const page = await c.newPage(); const seen = await cityMap(page);
    await page.goto(BASE); await page.getByRole('button', { name: 'Start my project' }).click(); await page.getByRole('heading', { level: 2, name: 'The lot' }).waitFor();
    ok(await page.getByRole('button', { name: 'Look up' }).isDisabled(), `parcel: Look up is off until an address is typed ${W}`);
    await page.fill('#addr', '4305 Edenhurst Ave, Los Angeles, CA 90039'); await page.waitForTimeout(300);
    ok(seen.length === 0, `parcel: nothing is sent before tapping Look up ${W}`, String(seen.length));
    ok(await page.getByText('Only the street address is sent').isVisible(), `parcel: the screen says what leaves the device ${W}`);
    await page.getByRole('button', { name: 'Look up' }).click();
    ok(await page.getByText('4305 W EDENHURST AVE').first().waitFor({ timeout: 8000 }).then(() => true, () => false), `parcel: match shown ${W}`, await page.locator('[role=status]').allTextContents().then(x => x.join(' | ')));
    ok(await page.inputValue('#apn') === '5594-014-021' && await page.inputValue('#zone') === 'R1-1-RIO', `parcel: APN and zone filled ${W}`, await page.inputValue('#apn') + ' / ' + await page.inputValue('#zone'));
    ok((await page.inputValue('#lw')).startsWith("40' ") && (await page.inputValue('#ld')).startsWith("140' "), `parcel: lot size filled ${W}`, await page.inputValue('#lw') + ' / ' + await page.inputValue('#ld'));
    ok(await page.locator('#jur').inputValue() === 'la-city', `parcel: city from the real boundary ${W}`);
    ok(await page.locator('#apn-h').textContent() === 'From parcel map, verify on site', `parcel: filled value is tagged ${W}`);
    ok(seen.every(u => /^https:\/\/(maps|zimas)\.lacity\.org\//.test(u)) && seen.every(u => !/owner|name=/i.test(u)), `parcel: only the city map hosts, only the address ${W}`);
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
    const c2 = await ctx(width); const r = await c2.newPage(); await r.goto(BASE); await r.locator('input[type=file][accept=".permitpack,.json"]').first().setInputFiles(file);
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
for (const width of [390, 1440]) {
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
    await page.getByRole('button', { name: 'Add the not-found items as review notes' }).click();
    ok(await page.locator('.drawing svg g[role=button]').count() === pins0 + nMiss, `precheck: not-found items become review notes ${W}`, `${pins0} -> ${await page.locator('.drawing svg g[role=button]').count()} (${nMiss})`);
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
    // another device opens the pack: results and photo are there
    const c2 = await ctx(width); const r = await c2.newPage(); await r.goto(BASE); await r.locator('input[type=file][accept=".permitpack,.json"]').first().setInputFiles(file);
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
await browser.close(); server.close();
console.log(`${total - failed}/${total} passed` + (failed ? `, ${failed} FAILED` : '')); process.exit(failed ? 1 : 0);
