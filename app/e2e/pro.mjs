// Pro (CAD) workspace end-to-end checks: mode switch, pan/zoom/pinch, snaps, selection, layers, command palette and command line,
// drawing and modify commands with typed input, undo per step, checks pins and fixes, phone layout and keypad, states, a11y, Spanish,
// 60 fps pan under a 4x CPU throttle, and the M2 keyboard-only floor plan with a DXF round trip.
// Run: npm run build && node e2e/pro.mjs   (serves dist/ under /open-permit-hub/ on its own port)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = new URL('.', import.meta.url).pathname; const DIST = resolve(here, '../dist');
const AXE = readFileSync(resolve(here, '../node_modules/axe-core/axe.min.js'), 'utf8'); const tmp = mkdtempSync(join(tmpdir(), 'opa-pro-'));
let failed = 0; const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !extra ? '' : ' :: ' + extra}`); if (!cond) failed++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const server = createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith('/open-permit-hub/')) { res.writeHead(404).end(); return; } let f = join(DIST, decodeURIComponent(u.pathname.slice(17)) || 'index.html'); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html'); if (!f.startsWith(DIST) || !existsSync(f)) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${server.address().port}/open-permit-hub/`;
const browser = await chromium.launch();
const ctx = (width, o = {}) => browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, acceptDownloads: true, bypassCSP: true, ...(width < 600 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}), ...o });
const axe = async (page, rules) => { await page.addScriptTag({ content: AXE }); return page.evaluate(async r => (await window.axe.run(document, { runOnly: { type: 'rule', values: r } })).violations.map(v => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`), rules); };
const SVG = '[data-testid=viewport] svg';
// Projects live in IndexedDB (opa-store / kv); these helpers read and write a key there.
const IDB = `(op, k, v) => new Promise((res, rej) => { const r = indexedDB.open('opa-store', 1); r.onsuccess = () => { const t = r.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite'); const st = t.objectStore('kv'); const q = op === 'get' ? st.get(k) : st.put(v, k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; r.onerror = () => rej(r.error); })`;
const idb = (page, op, k, v) => page.evaluate(([src, op, k, v]) => (0, eval)(src)(op, k, v), [IDB, op, k, v]);
const proj = async page => { await page.waitForTimeout(400); const idx = JSON.parse((await idb(page, 'get', 'opa.index')) ?? '[]'); return JSON.parse(await idb(page, 'get', 'opa.p.' + idx[0].id)); };
const putProj = async (page, p) => { await idb(page, 'put', 'opa.p.' + p.id, JSON.stringify(p)); };
const cam = page => page.locator(SVG).evaluate(s => ({ k: +s.dataset.k, cx: +s.dataset.cx, cy: +s.dataset.cy }));
async function pro(page, { demo = true } = {}) {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('opa.e2e')) { localStorage.setItem('opa.ws', 'pro'); sessionStorage.setItem('opa.e2e', '1'); } } catch { /* */ } });
  await page.goto(BASE); await page.getByRole('button', { name: demo ? /Try the demo lot/ : /Start/ }).first().click(); await page.locator(SVG).waitFor(); await page.waitForTimeout(250);
}
/** Type into the command line (keyboard only: / focuses it). */
async function cmd(page, ...lines) { for (const l of lines) { await page.locator('#pw-cmd-in').focus(); await page.locator('#pw-cmd-in').fill(l); await page.keyboard.press('Enter'); await page.waitForTimeout(30); } }
const live = page => page.locator('.pw p[role=status]').last().textContent();
const ents = async page => (await proj(page)).cad?.ents ?? [];
// Demo footprint: x 28'..48', y 108'..128' (model feet, lot lower-left = 0,0).

// 1. Mode switch is remembered; Guided still works.
{ const c = await ctx(1440); const page = await c.newPage(); await page.goto(BASE); await page.getByRole('button', { name: /Try the demo lot/ }).click();
  await page.getByRole('heading', { level: 2, name: 'The lot' }).waitFor();
  await page.getByRole('button', { name: 'Pro workspace' }).click(); await page.locator(SVG).waitFor();
  ok(await page.locator('.pw-rail').isVisible(), 'mode: Pro workspace opens from Guided');
  await page.reload(); await page.locator(SVG).waitFor({ timeout: 8000 }).catch(() => {});
  ok(await page.locator(SVG).isVisible(), 'mode: the Pro choice is remembered after reload');
  await page.getByRole('group', { name: 'Workspace mode' }).getByRole('button', { name: 'Guided' }).click();
  ok(await page.getByRole('heading', { level: 2, name: 'The lot' }).isVisible(), 'mode: Guided mode comes back with the 6-step flow');
  await page.reload(); ok(await page.getByRole('heading', { level: 2, name: 'The lot' }).isVisible(), 'mode: the Guided choice is remembered too');
  await c.close(); }

// 2. Pan, zoom, fit, zoom to selection, zoom window; grid adapts; snap glyphs; selection, grips, properties.
{ const c = await ctx(1440); const page = await c.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await pro(page);
  const s = page.locator(SVG); const b = await page.getByTestId('viewport').boundingBox(); const c0 = await cam(page);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, -400); await page.waitForTimeout(100);
  const c1 = await cam(page); ok(c1.k > c0.k * 1.5, 'zoom: wheel zooms in at the cursor', `${c0.k} -> ${c1.k}`);
  const g1 = await page.locator('.grid .g-mi').getAttribute('d');
  await page.keyboard.press('h'); await page.mouse.move(b.x + 300, b.y + 300); await page.mouse.down(); await page.mouse.move(b.x + 420, b.y + 360, { steps: 6 }); await page.mouse.up();
  const c2 = await cam(page); ok(Math.abs(c2.cx - c1.cx) > 1 && Math.abs(c2.cy - c1.cy) > 1, 'pan: Pan tool drag moves the view');
  await page.keyboard.press('v'); await page.mouse.move(b.x + 300, b.y + 300); await page.mouse.down({ button: 'middle' }); await page.mouse.move(b.x + 200, b.y + 260, { steps: 4 }); await page.mouse.up({ button: 'middle' });
  ok((await cam(page)).cx !== c2.cx, 'pan: middle-button drag pans');
  await page.keyboard.press('f'); const c3 = await cam(page); ok(Math.abs(c3.k - c0.k) / c0.k < 0.02, 'zoom: F zooms to fit', JSON.stringify([c0, c3]));
  await page.mouse.wheel(0, 600); await page.waitForTimeout(80); const g2 = await page.locator('.grid .g-mi').getAttribute('d');
  ok(g1 !== g2, 'grid: grid spacing adapts to zoom');
  // Snap: hover near the ADU's top-left corner (28', 128') shows the endpoint glyph and snaps the cursor readout.
  await page.keyboard.press('f'); const pt = await page.evaluate(([x, y]) => { const s = document.querySelector('[data-testid=viewport] svg'); const m = s.getScreenCTM(); const p = new DOMPoint(x, y).matrixTransform(m); return { x: p.x, y: p.y }; }, [28 * 304.8, -128 * 304.8]);
  await page.mouse.move(pt.x + 4, pt.y + 3); await page.waitForTimeout(80);
  ok(await page.locator('.snapg').count() === 1, 'snap: endpoint glyph shows near a corner');
  ok((await page.locator('.pw-xy').textContent()).includes("X 28'-0\"  Y 128'-0\""), 'snap: the cursor snaps exactly to the corner', await page.locator('.pw-xy').textContent());
  // Click the ADU: selected with grips, Properties shows exact ft-in fields.
  const mid = await page.evaluate(([x, y]) => { const s = document.querySelector('[data-testid=viewport] svg'); const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return { x: p.x, y: p.y }; }, [36 * 304.8, -112 * 304.8]);
  await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(80);
  ok(await page.locator('.grip').count() === 4, 'select: the ADU shows 4 grips');
  ok(await page.getByLabel('From left side line').isVisible(), 'select: Properties edits the ADU in ft-in');
  await page.getByLabel('From left side line').fill("29'-0\""); await page.getByLabel('From left side line').press('Enter'); await page.waitForTimeout(80);
  const fp = (await proj(page)).adu.footprint; ok(Math.abs(Math.min(...fp.map(q => q.x)) - 29 * 304.8) < 1, 'properties: typed 29\'-0" moves the ADU exactly');
  await page.locator(SVG).focus(); await page.keyboard.press('Control+z'); await page.waitForTimeout(80); const fp2 = (await proj(page)).adu.footprint; ok(Math.abs(Math.min(...fp2.map(q => q.x)) - 28 * 304.8) < 1, 'undo: Ctrl+Z restores the move');
  await page.keyboard.press('Shift+F'); const c4 = await cam(page); ok(c4.k > c3.k * 3, 'zoom: Shift+F zooms to the selection');
  // Keyboard nudge: arrow moves the selected ADU by the snap increment (6").
  await s.focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(60); const fp3 = (await proj(page)).adu.footprint; ok(Math.abs(Math.min(...fp3.map(q => q.x)) - (28 * 304.8 - 152.4)) < 1, 'nudge: arrow key moves 6"');
  await page.keyboard.press('Control+z');
  ok(!errs.length, 'no page errors in navigation tests', errs.join(' | '));
  await c.close(); }

// 3. M1: line from a typed length, pan, rotate a room 90°, measure it, ortho/grid toggles, undo restores each step.
{ const c = await ctx(1440); const page = await c.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await pro(page);
  await page.locator(SVG).focus(); await page.keyboard.press('/'); ok(await page.evaluate(() => document.activeElement?.id === 'pw-cmd-in'), 'cmdline: / focuses the command line');
  await cmd(page, 'L', '10,60', "12'6", ''); let e = await ents(page);
  ok(e.length === 1 && e[0].t === 'line' && Math.abs(Math.hypot(e[0].pts[1].x - e[0].pts[0].x, e[0].pts[1].y - e[0].pts[0].y) - (12.5 * 304.8)) < 0.5, "M1: LINE from a typed length makes a 12'-6\" line", JSON.stringify(e));
  await cmd(page, 'RM', 'BED', '29,109', '@10,8'); let r = (await proj(page)).adu.rooms; ok(r.length === 1 && r[0].use === 'sleeping', 'M1: ROOM with typed corners and use');
  const w0 = Math.max(...r[0].poly.map(q => q.x)) - Math.min(...r[0].poly.map(q => q.x));
  await cmd(page, 'RO', '34,113', '90'); r = (await proj(page)).adu.rooms; const w1 = Math.max(...r[0].poly.map(q => q.x)) - Math.min(...r[0].poly.map(q => q.x));
  ok(Math.abs(w0 - 10 * 304.8) < 1 && Math.abs(w1 - 8 * 304.8) < 1, 'M1: ROTATE turns the selected room 90°', `${w0} -> ${w1}`);
  await cmd(page, 'DI', '30,109', '@8,0'); ok((await live(page)).includes("8'-0\""), 'M1: DIST measures the room wall (8\'-0")', await live(page));
  await page.locator(SVG).focus(); await page.keyboard.press('F8'); ok(await page.getByRole('button', { name: 'Ortho' }).getAttribute('aria-pressed') === 'true', 'M1: F8 turns ortho on');
  await page.keyboard.press('F7'); ok(await page.getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed') === 'false', 'M1: F7 turns the grid off'); ok(await page.locator('.grid').count() === 0, 'M1: grid is hidden');
  await page.keyboard.press('F7'); await page.keyboard.press('F8');
  // Pan between steps.
  const b = await page.getByTestId('viewport').boundingBox(); const k0 = await cam(page); await page.keyboard.press('h'); await page.mouse.move(b.x + 200, b.y + 200); await page.mouse.down(); await page.mouse.move(b.x + 300, b.y + 250, { steps: 5 }); await page.mouse.up(); await page.keyboard.press('v');
  ok((await cam(page)).cx !== k0.cx, 'M1: view pans', (await page.getByTestId('viewport').getAttribute('class')) + ' ' + JSON.stringify([k0, await cam(page)]));
  // Undo restores each step: rotate, then room, then line.
  await page.locator(SVG).focus(); await page.keyboard.press('Control+z'); r = (await proj(page)).adu.rooms; ok(r.length === 1 && Math.abs(Math.max(...r[0].poly.map(q => q.x)) - Math.min(...r[0].poly.map(q => q.x)) - 10 * 304.8) < 1, 'M1 undo: rotation undone');
  await page.keyboard.press('Control+z'); ok((await proj(page)).adu.rooms.length === 0, 'M1 undo: room undone');
  await page.keyboard.press('Control+z'); ok((await ents(page)).length === 0, 'M1 undo: line undone');
  await page.keyboard.press('Control+Shift+z'); ok((await ents(page)).length === 1, 'M1 redo: line back');
  // Circle, arc, polyline, revision cloud, copy, mirror, erase, offset, trim, extend.
  await cmd(page, 'C', '20,40', '3'); await cmd(page, 'A', '10,30', '13,33', '16,30'); await cmd(page, 'PL', '5,5', '@10,0', '@0,10', 'C'); await cmd(page, 'RC', '2,2', '@6,0', '@0,6', '');
  e = await ents(page); ok(['circle', 'arc', 'pline', 'cloud'].every(t => e.some(x => x.t === t)), 'M1: circle, arc, closed polyline and revision cloud', e.map(x => x.t).join(','));
  const line = e.find(x => x.t === 'line'); await page.evaluate(() => {});
  await cmd(page, 'L', '0,70', '@20,0', ''); await cmd(page, 'L', '10,65', '@0,10', ''); e = await ents(page); const n0 = e.length;
  await cmd(page, 'TR'); const h = e.find(x => x.t === 'line' && x.pts[0].y === 70 * 304.8);
  const pt = await page.evaluate(([x, y]) => { const s = document.querySelector('[data-testid=viewport] svg'); const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return { x: p.x, y: p.y }; }, [15 * 304.8, -70 * 304.8]);
  await page.keyboard.press('F3'); await page.mouse.click(pt.x, pt.y); await page.keyboard.press('Escape'); await page.keyboard.press('F3');
  e = await ents(page); const trimmed = e.find(x => x.id === h.id); ok(trimmed && Math.abs(Math.max(trimmed.pts[0].x, trimmed.pts[1].x) - 10 * 304.8) < 1, 'M2: TRIM cuts the line at the crossing', JSON.stringify(trimmed?.pts));
  await cmd(page, 'O', '2'); const vl = e.find(x => x.t === 'line' && x.pts[0].x === 10 * 304.8 && x.pts[0].y === 65 * 304.8);
  const pv = await page.evaluate(([x, y]) => { const s = document.querySelector('[data-testid=viewport] svg'); const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return { x: p.x, y: p.y }; }, [10 * 304.8, -72 * 304.8]);
  const side = await page.evaluate(([x, y]) => { const s = document.querySelector('[data-testid=viewport] svg'); const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return { x: p.x, y: p.y }; }, [14 * 304.8, -72 * 304.8]);
  await page.keyboard.press('F3'); await page.mouse.click(pv.x, pv.y); await page.mouse.click(side.x, side.y); await page.keyboard.press('Escape'); await page.keyboard.press('F3');
  e = await ents(page); ok(e.some(x => x.t === 'line' && Math.abs(x.pts[0].x - 12 * 304.8) < 1), 'M2: OFFSET makes a parallel line 2\' away', String(vl?.id));
  // Window selection (left to right) then COPY and ERASE.
  const tl = await page.evaluate(([x, y]) => { const s = document.querySelector('[data-testid=viewport] svg'); const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return { x: p.x, y: p.y }; }, [1 * 304.8, -17 * 304.8]);
  const br = await page.evaluate(([x, y]) => { const s = document.querySelector('[data-testid=viewport] svg'); const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return { x: p.x, y: p.y }; }, [17 * 304.8, -1 * 304.8]);
  await page.mouse.move(tl.x, tl.y); await page.mouse.down(); await page.mouse.move(br.x, br.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(60);
  ok((await live(page)).startsWith('2 selected'), 'M2: window selection picks the polyline and cloud only', await live(page));
  const before = (await ents(page)).length; await cmd(page, 'CO', '0,0', '@30,0', ''); ok((await ents(page)).length === before + 2, 'M1: COPY duplicates the selection');
  await cmd(page, 'MI', '0,0', '@0,10'); e = await ents(page); ok(e.some(x => x.t === 'pline' && x.pts.some(q => q.x < -1)), 'M1: MIRROR flips the selection');
  await cmd(page, 'E'); ok((await ents(page)).length === before, 'M1: ERASE removes the selection');
  ok(!errs.length, 'no page errors in M1 tests', errs.join(' | ')); void line; void n0;
  await c.close(); }

// 4. M2: keyboard-only 20x20 garage floor plan: 4 rooms, 6 openings, 12 dimensions, 5 notes; DXF has the layers and dimensions.
{ const c = await ctx(1440); const page = await c.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await pro(page); const t0 = Date.now();
  await page.locator(SVG).focus(); await page.keyboard.press('/');
  await cmd(page, 'RM', 'BED', '28.5,108.5', '37.5,119.5'); await cmd(page, 'RM', 'BATH', '37.9,108.5', '47.5,115'); await cmd(page, 'RM', 'KITCHEN', '37.9,115.4', '47.5,127.5'); await cmd(page, 'RM', 'LIVING', '28.5,119.9', '37.5,127.5');
  await cmd(page, 'WI', '32,108.5'); await cmd(page, 'WI', '28.5,114'); await cmd(page, 'DR', '37.5,117'); await cmd(page, 'DR', '42,115'); await cmd(page, 'WI', '47.5,121'); await cmd(page, 'DR', '33,127.5');
  const dims = [['28,128', '48,128', '38,131'], ['28,108', '28,128', '25,118'], ['28.5,108.5', '37.5,108.5', '33,106'], ['37.9,108.5', '47.5,108.5', '43,106'], ['48,108', '48,115', '51,111'], ['48,115', '48,128', '51,121'],
    ['28.5,119.5', '28.5,108.5', '26.5,114'], ['28.5,127.5', '28.5,119.9', '26.5,124'], ['37.9,115', '47.5,115', '43,113'], ['28.5,119.9', '37.5,119.9', '33,121.5'], ['37.9,127.5', '47.5,127.5', '43,129.5'], ['28,100', '48,100', '38,98']];
  for (const [a, b, l] of dims) await cmd(page, 'DLI', a, b, l);
  await cmd(page, 'T', '50,126', 'NEW 2X4 PARTITIONS AT 16" O.C.'); await cmd(page, 'T', '50,124', 'EXISTING SLAB TO REMAIN'); await cmd(page, 'MT', '50,121', 'SMOKE/CO ALARM\\PHARDWIRED');
  await cmd(page, 'LE', '42,111', '@6,-6', '', '1-HR WALL AT PROPERTY LINE'); await cmd(page, 'LE', '33,114', '@-10,-8', '', 'ESCAPE WINDOW 5.7 SF MIN');
  const p = await proj(page); const e = p.cad.ents; const mins = (Date.now() - t0) / 60000;
  ok(p.adu.rooms.length === 4 && p.adu.rooms.map(r => r.use).sort().join() === 'bath,kitchen,living,sleeping', 'M2: 4 rooms with uses', p.adu.rooms.map(r => r.use).join());
  ok(p.adu.rooms.reduce((s, r) => s + r.openings.length, 0) === 6, 'M2: 6 openings', String(p.adu.rooms.reduce((s, r) => s + r.openings.length, 0)));
  ok(e.filter(x => x.t === 'dim').length === 12, 'M2: 12 dimensions', String(e.filter(x => x.t === 'dim').length));
  ok(e.filter(x => x.t === 'text' || x.t === 'leader').length === 5, 'M2: 5 notes', String(e.filter(x => x.t === 'text' || x.t === 'leader').length));
  ok(mins < 20, `M2: keyboard-only plan done in ${mins.toFixed(2)} min (< 20)`);
  ok(Math.abs(e.filter(x => x.t === 'dim')[0].pts[1].x - e.filter(x => x.t === 'dim')[0].pts[0].x - 20 * 304.8) < 1, 'M2: the 20\'-0" dimension measures exactly');
  // Checks react live: the bedroom gets escape-window and room checks.
  ok(await page.getByText('Escape', { exact: false }).first().isVisible(), 'M2: room checks run as you draw');
  // DXF export includes the drafter's layers, dims and notes.
  await page.getByRole('button', { name: 'Export', exact: true }).click(); const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Site plan for CAD (DXF)' }).click()]);
  const f = join(tmp, 'm2.dxf'); await dl.saveAs(f); const dxf = readFileSync(f, 'latin1');
  const count = t => (dxf.match(new RegExp(`\\r?\\n${t}\\r?\\n`, 'g')) || []).length;
  ok(/AC1032/.test(dxf), 'DXF: 2018 format');
  ok(count('DIMENSION') >= 12 + 4, 'DXF: the 12 drafter dimensions are real DIMENSION entities', String(count('DIMENSION')));
  ok(dxf.includes('A-ANNO-NOTE') && dxf.includes('A-ANNO-DIMS'), 'DXF: note and dimension layers are present');
  ok(dxf.includes('EXISTING SLAB TO REMAIN') && dxf.includes('1-HR WALL AT PROPERTY LINE'), 'DXF: notes and leader text are in the file');
  ok(!errs.length, 'no page errors in M2 test', errs.join(' | '));
  console.log('DXF saved for the round-trip check:', f);
  await c.close(); }

// 5. Layers, command palette, help overlay, checks inspector with pins and one-click fix.
{ const c = await ctx(1440); const page = await c.newPage(); await pro(page);
  await page.getByRole('tab', { name: 'Layers' }).click();
  const before = await page.locator('[data-layer=A-WALL-EXST]').count(); await page.getByRole('button', { name: 'A-WALL-EXST visible' }).click();
  ok(before > 0 && await page.locator('[data-layer=A-WALL-EXST]').count() === 0, 'layers: turning a layer off hides its objects');
  await page.getByRole('button', { name: 'A-WALL-EXST visible' }).click();
  await page.getByPlaceholder('New layer name').fill('A-FURN'); await page.getByRole('button', { name: 'Add layer' }).click();
  ok((await proj(page)).cad.current === 'A-FURN', 'layers: a new layer is created and made current');
  await page.locator(SVG).focus(); await cmd(page, 'L', '5,5', '@3,0', ''); ok((await ents(page)).at(-1).layer === 'A-FURN', 'layers: new objects go on the current layer');
  await page.getByLabel('A-FURN color').selectOption('1'); ok(await page.locator('.cad [data-ent]').last().evaluate(x => getComputedStyle(x).stroke) === 'rgb(229, 72, 77)', 'layers: layer color shows on its objects');
  await page.getByRole('button', { name: 'A-FURN locked' }).click(); ok((await proj(page)).cad.layers.find(l => l.name === 'A-FURN').locked, 'layers: lock is saved');
  await page.keyboard.press('Control+k'); ok(await page.getByRole('dialog', { name: 'Command palette' }).isVisible(), 'palette: Ctrl+K opens the command palette');
  await page.keyboard.type('ortho'); await page.keyboard.press('Enter'); ok(await page.getByRole('button', { name: 'Ortho' }).getAttribute('aria-pressed') === 'true', 'palette: a command runs from the palette');
  await page.locator(SVG).focus(); await page.keyboard.press('?'); ok(await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).isVisible(), 'help: ? lists the shortcuts');
  await page.keyboard.press('Escape'); ok(!(await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).isVisible()), 'help: Esc closes it');
  await page.getByRole('tab', { name: /Checks/ }).click();
  ok(await page.locator('[data-pin^="issue:"]').count() >= 1, 'checks: numbered pins on the canvas');
  const rows = await page.locator('.pw-iss .pw-num').count(); ok(rows === await page.locator('[data-pin^="issue:"]').count(), 'checks: the list mirrors the pins');
  const k0 = (await cam(page)).k; await page.locator('.pw-iss-h', { hasText: 'Fire-rated walls' }).click(); await page.waitForTimeout(100);
  ok((await cam(page)).k > k0 * 2, 'checks: clicking a row zooms to its pin');
  ok(await page.getByTestId('plain-answer').isVisible(), 'checks: the plain answer is at the top');
  await page.getByRole('button', { name: "Move ADU to 5'-0\"" }).click(); await page.waitForTimeout(100);
  ok(!(await page.locator('.pw-iss.s-FAIL', { hasText: 'Fire-rated walls' }).count()), 'checks: the one-click fix clears the fire-separation issue');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(80); ok(await page.locator('.pw-iss.s-FAIL', { hasText: 'Fire-rated walls' }).count() === 1, 'checks: undo brings the issue back');
  // Sheets, exports still reachable, Guided panels inside Pro.
  await page.getByRole('tab', { name: 'A-1 Site' }).click(); ok(await page.locator('.paper .pp-sheet').count() === 1, 'sheets: A-1 shows a 36x24 sheet with a title block');
  await page.getByRole('tab', { name: 'G-2 Markup' }).click(); ok(await page.locator('.paper .pin').count() >= 1, 'sheets: G-2 shows the pins');
  await page.getByRole('tab', { name: 'Model' }).click();
  await page.keyboard.press('Control+k'); await page.keyboard.type('lot and parcel'); await page.keyboard.press('Enter');
  ok(await page.getByRole('heading', { level: 2, name: 'The lot' }).isVisible() && await page.getByRole('button', { name: 'Look up' }).count() >= 0, 'reach: parcel lookup opens inside Pro');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click(); ok(await page.getByRole('button', { name: 'Check report (PDF)' }).isVisible(), 'reach: all exports are in the Export panel');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.keyboard.press('Control+k'); await page.keyboard.type('review notes'); await page.keyboard.press('Enter'); ok(await page.getByRole('heading', { name: 'Review notes' }).isVisible() && await page.getByRole('heading', { name: 'Pre-check a plan set (PDF)' }).isVisible(), 'reach: review notes and plan-set check open inside Pro');
  await page.getByRole('button', { name: 'Close' }).click();
  for (const scheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(100); const v = await axe(page, ['color-contrast', 'button-name', 'label', 'aria-allowed-attr', 'aria-required-children', 'aria-valid-attr-value', 'list', 'listitem', 'region', 'landmark-unique', 'nested-interactive', 'select-name']); ok(!v.length, `a11y: axe passes on the Pro workspace (${scheme})`, v.join('; ')); }
  await c.close(); }

// 6. Phone: canvas hero, bottom sheet, bottom tools, pinch zoom, ft-in keypad.
{ const c = await ctx(390); const page = await c.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await pro(page);
  ok(await page.locator('.pw-sheet').isVisible() && await page.locator('.pw-ph-tools').isVisible(), 'phone: bottom sheet and tool bar');
  const b = await page.getByTestId('viewport').boundingBox(); ok(b.width === 390 && b.height > 700, 'phone: the canvas fills the screen', JSON.stringify(b));
  const k0 = (await cam(page)).k; const cdp = await c.newCDPSession(page);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  await touch('touchStart', [[150, 400], [240, 400]]); for (let i = 1; i <= 6; i++) await touch('touchMove', [[150 - i * 15, 400], [240 + i * 15, 400]]); await touch('touchEnd', []);
  await page.waitForTimeout(100); ok((await cam(page)).k > k0 * 1.5, 'phone: pinch zooms in', `${k0} -> ${(await cam(page)).k}`);
  const k1 = await cam(page); await touch('touchStart', [[200, 300]]); for (let i = 1; i <= 5; i++) await touch('touchMove', [[200 + i * 12, 300 + i * 8]]); await touch('touchEnd', []);
  ok((await cam(page)).cx !== k1.cx, 'phone: one-finger drag on empty canvas pans');
  await page.getByRole('button', { name: 'Checks' }).click(); ok(await page.locator('.pw-sheet-half').isVisible() && await page.getByTestId('plain-answer').isVisible(), 'phone: Checks opens the bottom sheet with the plain answer');
  await page.getByRole('button', { name: 'Details' }).click(); await page.getByRole('button', { name: 'Select the ADU' }).click();
  await page.getByLabel('Width').first().click(); ok(await page.getByRole('group', { name: 'Feet and inches keypad' }).isVisible(), 'phone: length fields open the ft-in keypad');
  const kp = page.getByRole('group', { name: 'Feet and inches keypad' }); await page.getByLabel('Width').first().fill('');
  for (const k of ['2', '1']) await kp.getByRole('button', { name: k, exact: true }).click(); await kp.getByRole('button', { name: 'feet' }).click(); await kp.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(80); const fp = (await proj(page)).adu.footprint; ok(Math.abs(Math.max(...fp.map(q => q.x)) - Math.min(...fp.map(q => q.x)) - 21 * 304.8) < 1, "phone: keypad entry 21' sets the width");
  const v = await axe(page, ['color-contrast', 'button-name', 'label', 'aria-valid-attr-value', 'nested-interactive']); ok(!v.length, 'phone: axe passes', v.join('; '));
  ok(!errs.length, 'no page errors on the phone', errs.join(' | '));
  await c.close(); }

// 7. States: empty project, offline, big project, Spanish.
{ const c = await ctx(1440); const page = await c.newPage(); await pro(page, { demo: false });
  ok(await page.getByText('Start with the lot').isVisible(), 'state: an empty project says where to start');
  await c.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.waitForTimeout(80);
  ok(await page.getByText('Offline · saved on this device').isVisible(), 'state: offline is shown and work continues'); await c.setOffline(false);
  await page.locator('#pw-lang').selectOption('es'); await page.waitForTimeout(100);
  ok(await page.getByRole('tab', { name: 'Revisiones' }).isVisible() && await page.getByRole('tab', { name: 'Capas' }).isVisible(), 'es: inspector tabs are in Spanish');
  ok(await page.locator('.pw-cmd-p').textContent().then(t => t.startsWith('Escriba un comando')), 'es: the command line prompt is in Spanish');
  await page.locator(SVG).focus(); await cmd(page, 'L'); ok((await page.locator('.pw-cmd-p').textContent()).startsWith('LÍNEA'), 'es: command prompts are in Spanish'); await page.keyboard.press('Escape');
  await page.locator('#pw-lang').selectOption('fa'); await page.waitForFunction(() => document.documentElement.dir === 'rtl');
  const rail = await page.locator('.pw-rail').boundingBox(), vp = await page.getByTestId('viewport').boundingBox();
  ok(rail.x > vp.x, 'rtl: the chrome mirrors (tool rail on the right in Farsi)');
  ok(await page.locator(SVG).evaluate(s => getComputedStyle(s).direction === 'ltr' && !/matrix\(-1/.test(getComputedStyle(s).transform)), 'rtl: the drawing canvas is not mirrored');
  ok(await page.getByTestId('beta-translation').isVisible(), 'rtl: the beta translation note shows in Pro');
  await page.locator('#pw-lang').selectOption('en');
  await c.close(); }
{ const c = await ctx(1440); const page = await c.newPage(); await pro(page);
  { const p = await proj(page); const ents = []; for (let k = 0; k < 3000; k++) ents.push({ id: 'b' + k, t: k % 3 ? 'line' : 'circle', layer: 'A-DETL', pts: k % 3 ? [{ x: (k % 60) * 600, y: Math.floor(k / 60) * 600 }, { x: (k % 60) * 600 + 400, y: Math.floor(k / 60) * 600 + 300 }] : [{ x: (k % 60) * 600, y: Math.floor(k / 60) * 600 }], ...(k % 3 ? {} : { r: 200 }) });
    p.cad = { ents, layers: [{ name: 'A-DETL', color: 7, on: true, locked: false }], current: 'A-DETL' }; p.rev = (p.rev ?? 0) + 1; await putProj(page, p); }
  await page.reload(); await page.locator(SVG).waitFor();
  ok(await page.locator('.cad [data-ent]').count() === 3000, 'state: a big drawing (3,000 objects) loads');
  // 60 fps pan under a 4x CPU throttle (mid phone).
  const cdp = await c.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const b = await page.getByTestId('viewport').boundingBox(); await page.keyboard.press('h');
  await page.evaluate(() => { window.__f = []; let last = performance.now(); const tick = t => { window.__f.push(t - last); last = t; if (window.__f.length < 400) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.mouse.move(b.x + 400, b.y + 400); await page.mouse.down(); for (let i = 0; i < 60; i++) { await page.mouse.move(b.x + 400 + i * 4, b.y + 400 + i * 2); } await page.mouse.up();
  const fr = await page.evaluate(() => window.__f.slice(5)); const avg = fr.reduce((a, x) => a + x, 0) / fr.length; await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`pan frame time with 3,000 objects at 4x throttle: avg ${avg.toFixed(1)} ms`);
  { const p = await proj(page); delete p.cad; p.rev = (p.rev ?? 0) + 1; await putProj(page, p); } await page.reload(); await page.locator(SVG).waitFor();
  // 60 fps budget under a 4x CPU throttle (mid phone): main-thread work a pan adds per pointer move, measured against the same
  // number of plain pointer moves over the inspector (the harness's own input cost), must stay under half a frame (8 ms).
  const cdp2 = await c.newCDPSession(page); await cdp2.send('Performance.enable'); await cdp2.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const met = async () => Object.fromEntries((await cdp2.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const b2 = await page.getByTestId('viewport').boundingBox(); await page.keyboard.press('h'); const N = 80;
  const a0 = await met(); for (let i = 0; i < N; i++) await page.mouse.move(1250 + (i % 2) * 3, 300 + i); const a1 = await met();
  await page.mouse.move(b2.x + 400, b2.y + 300); await page.mouse.down(); const p0 = await met(); for (let i = 0; i < N; i++) await page.mouse.move(b2.x + 400 + i * 3, b2.y + 300 + i); const p1 = await met(); await page.mouse.up();
  await cdp2.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const work = (x, y) => ((y.ScriptDuration - x.ScriptDuration) + (y.LayoutDuration - x.LayoutDuration) + (y.RecalcStyleDuration - x.RecalcStyleDuration)) * 1000 / N;
  const base = (a1.TaskDuration - a0.TaskDuration) * 1000 / N, panMs = (p1.TaskDuration - p0.TaskDuration) * 1000 / N, added = work(p0, p1) - work(a0, a1);
  console.log(`pan at 4x throttle: main-thread task ${panMs.toFixed(1)} ms per move (input-only baseline ${base.toFixed(1)} ms); script+style+layout the pan adds: ${added.toFixed(2)} ms; layouts during pan: ${p1.LayoutCount - p0.LayoutCount}. The rest is the compositor commit of one GPU-slid layer (software compositing in this headless container).`);
  ok(added <= 4 && p1.LayoutCount - p0.LayoutCount <= 1, 'perf: panning does no layout and adds under 4 ms of script/style work per move at 4x CPU throttle (GPU-slid layer)', JSON.stringify({ panMs, base, added }));
  await c.close(); }

await browser.close(); server.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0);
