// Shared helpers for the Open Permit Hub e2e suite.
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASE = (process.env.BASE || 'https://6diggz.github.io/open-permit-hub/').replace(/\/?$/, '/');
export const FIX = path.join(HERE, 'fixtures');
export const PHONE = { width: 390, height: 844 };
export const DESK = { width: 1440, height: 900 };

export class Fail extends Error {}
export const expect = (cond, msg) => { if (!cond) throw new Fail(msg); };

/** Length string in feet-inches. */
export const ft = (f, i = 0) => `${f}' ${i}"`;

/** OUT2-10: projects live in IndexedDB 'opa-store'/'kv'. window.__opaIdb() -> { get(k), set(k, v) } for tests. */
export const IDB_HELPER = () => { window.__opaIdb = () => new Promise((res, rej) => { const r = indexedDB.open('opa-store', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onerror = () => rej(r.error); r.onsuccess = () => { const d = r.result; const t = d.transaction('kv', 'readonly'); const s = t.objectStore('kv'); const m = new Map(); const kq = s.getAllKeys(), vq = s.getAll();
    t.oncomplete = () => { kq.result.forEach((k, i) => m.set(k, vq.result[i])); res({ get: k => m.get(k) ?? null, keys: () => [...m.keys()], set: (k, v) => new Promise((ok, no) => { m.set(k, v); const w = d.transaction('kv', 'readwrite'); w.objectStore('kv').put(v, k); w.oncomplete = ok; w.onerror = no; }) }); }; }; }); };
export async function newPage(t, viewport = DESK, ctxOpts = {}) {
  const ctx = await t.browser.newContext({ viewport, acceptDownloads: true, ...ctxOpts });
  t.contexts.push(ctx); await ctx.addInitScript(IDB_HELPER);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => t.log.push('pageerror: ' + e.message));
  t.pages.push(pg);
  return { ctx, pg };
}

export async function gotoApp(pg, url = BASE) {
  await pg.goto(url, { waitUntil: 'load' });
  await pg.getByRole('button', { name: /Start my project|Empezar|Comenzar/i }).first().waitFor({ timeout: 20000 });
}
export async function startNew(pg) { await pg.getByRole('button', { name: /^(Start my project|Empezar mi proyecto|Comenzar)/i }).first().click(); await pg.locator('nav.rail').waitFor(); }
export async function demo(pg) { await pg.getByRole('button', { name: /Try the demo lot|demo|ejemplo/i }).first().click(); await pg.locator('nav.rail').waitFor(); }
export async function step(pg, i) { await pg.locator('nav.rail button.step').nth(i).click(); await pg.waitForTimeout(250); }

export async function setLen(pg, id, v) { const l = pg.locator('#' + id); await l.fill(v); await l.press('Tab'); await pg.waitForTimeout(120); }
export async function setNum(pg, id, v) { const l = pg.locator('#' + id); await l.fill(String(v)); await l.press('Tab'); await pg.waitForTimeout(120); }
/** Pick a Yes/No/Don't know answer for a question whose label id is `id`. */
export async function tri(pg, id, label) {
  const b = pg.locator(`[role=group][aria-labelledby="${id}"] button`).filter({ hasText: new RegExp('^\\s*' + label + '\\s*$') });
  expect(await b.count(), `question #${id} has no "${label}" choice`);
  await b.first().click(); await pg.waitForTimeout(100);
}
export async function hasId(pg, id) { return (await pg.locator('#' + id).count()) > 0; }

/** Result cards in the side panel: [{status, id, text}]. */
export async function results(pg) {
  return pg.evaluate(() => [...document.querySelectorAll('aside li.res')].map(li => {
    const status = ['FAIL', 'UNKNOWN', 'PASS', 'NOT_CHECKED', 'INFO'].find(s => li.classList.contains(s)) || '?';
    const cite = li.querySelector('.cite')?.textContent || '';
    return { status, id: (cite.match(/^\s*([A-Z]{2,5}-\d+[a-z]?)/) || [])[1] || '', text: li.innerText };
  }));
}
export const byId = (rs, id) => rs.filter(r => r.id === id);
export async function storedProject(pg) {
  return pg.evaluate(async () => { const S = await window.__opaIdb(); const idx = JSON.parse(S.get('opa.index') || '[]'); const id = idx[0]?.id; return id ? { id, p: JSON.parse(S.get('opa.p.' + id)) } : null; });
}

export async function download(t, pg, name, timeout = 30000) {
  const btn = typeof name === 'string' ? pg.locator(name) : pg.getByRole('button', { name }).first();
  const [d] = await Promise.all([pg.waitForEvent('download', { timeout }), btn.click()]);
  const dir = path.join(t.outDir, 'dl'); fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, d.suggestedFilename()); await d.saveAs(p); return p;
}
export const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
export const py = (kind, f) => JSON.parse(sh('python3', ['-I', path.join(HERE, 'validate.py'), kind, f]));

/** Fill a full real (non-demo) detached-garage project. `o` overrides values. */
export async function fillProject(pg, o = {}) {
  const v = { addr: '1234 W 52nd St, Los Angeles, CA 90037', apn: '5001-002-003', lw: ft(52), ld: ft(135), hw: ft(32), hd: ft(40), hy: ft(20),
    gw: ft(20), gd: ft(20), gx: ft(5), gy: ft(10), gh: ft(12), gc: ft(8), gs: 380, ...o };
  await step(pg, 0);
  await pg.fill('#addr', v.addr); await pg.fill('#apn', v.apn);
  await pg.selectOption('#jur', 'la-city');
  if (await hasId(pg, 'mb')) { try { await pg.selectOption('#mb', o.mb || { index: 1 }); } catch { /* option names may differ */ } }
  if (await hasId(pg, 'exa')) await setNum(pg, 'exa', 0);
  if (await hasId(pg, 'exj')) await setNum(pg, 'exj', 0);
  for (const k of ['lw', 'ld', 'hw', 'hd', 'hy']) await setLen(pg, k, v[k]);
  await setLen(pg, 'err', v.err ?? ft(1));
  for (const q of ['q-hill', 'q-fire', 'q-hpoz', 'q-coast', 'q-meth', 'q-burn', 'q-tr', 'q-slope', 'q-spk', 'q-rent', 'q-dwp']) if (await hasId(pg, q)) await tri(pg, q, 'No');
  if (await hasId(pg, 'q-ease')) await tri(pg, 'q-ease', 'Yes');
  await step(pg, 1);
  await pg.getByRole('button', { name: /Convert my detached garage/ }).click();
  await pg.locator('[role=group][aria-labelledby="att"] button', { hasText: o.attached ? /^Attached$/ : /^Detached$/ }).click();
  for (const k of ['gw', 'gd', 'gx', 'gy', 'gh', 'gc']) await setLen(pg, k, v[k]);
  await setNum(pg, 'gs', v.gs); await setNum(pg, 'hp', o.hp ?? 120);
  const answers = { 'q-perm': 'Yes', 'q-2020': 'Yes', 'q-home': 'No', 'q-door': 'No', 'q-inside': 'Yes', 'q-slab': 'Yes', 'q-open': 'No', 'q-rated': 'No', 'q-aspk': 'No', 'q-elec': 'Yes', ...(o.answers || {}) };
  for (const [q, a] of Object.entries(answers)) if (await hasId(pg, q)) await tri(pg, q, a);
  for (const [k, val] of [['fps', v.gx], ['fpr', v.gy]]) if (await hasId(pg, k)) await setLen(pg, k, val);
  if (await hasId(pg, 'amps')) await setNum(pg, 'amps', 200);
  await step(pg, 2);
  await setNum(pg, 'beds', o.beds ?? 1);
  if (await hasId(pg, 'q-studio')) await tri(pg, 'q-studio', 'Yes');
  for (const q of ['q-alarm', 'q-hw']) await tri(pg, q, 'Yes');
  const wins = o.windows ?? [{ room: 'Bedroom 1', w: '30"', h: '36"', s: '36"' }];
  for (let i = 0; i < wins.length; i++) {
    if (!(await hasId(pg, 'wr' + i))) await pg.getByRole('button', { name: /Add a window/ }).click();
    await pg.fill('#wr' + i, wins[i].room);
    await setLen(pg, 'ww' + i, wins[i].w); await setLen(pg, 'wh' + i, wins[i].h); await setLen(pg, 'ws' + i, wins[i].s);
  }
  return v;
}

/** Copy the target site into a local folder (index, sw, manifest, every asset reachable by reference) and serve it. */
export async function mirror(t) {
  const dir = path.join(t.outDir, 'mirror'); fs.rmSync(dir, { recursive: true, force: true });
  const seen = new Set(); const queue = ['index.html', 'sw.js', 'manifest.webmanifest', 'version.json', 'icon.svg', 'THIRD_PARTY_NOTICES.txt'];
  while (queue.length) {
    const rel = queue.shift(); if (seen.has(rel)) continue; seen.add(rel);
    const r = await fetch(BASE + rel); if (!r.ok) continue;
    const buf = Buffer.from(await r.arrayBuffer()); const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
    if (!/\.(html|js|css|json|webmanifest)$/.test(rel)) continue;
    const s = buf.toString('utf8'); const base = path.posix.dirname(rel);
    if (rel === 'sw.js') for (const m of s.matchAll(/"\.\/([^"]+)"/g)) queue.push(m[1]);
    for (const m of s.matchAll(/(?:\.\/|\/)?((?:assets\/)?[\w.\-]+\.(?:js|css|wasm|woff2?|png|svg|json|webmanifest))(?=["'`)\s?#])/g)) {
      let ref = m[1]; if (!ref.startsWith('assets/') && base === 'assets' && !/^(sw|index|manifest|version)\b/.test(ref)) ref = 'assets/' + ref;
      if (ref.startsWith('assets/') || /^(icon|apple|manifest|version|sw)/.test(ref)) queue.push(ref);
    }
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };
  const srv = http.createServer((q, s) => {
    let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
    const f = path.join(dir, path.normalize(u)); if (!f.startsWith(dir) || !fs.existsSync(f)) { s.writeHead(404); return s.end('nf'); }
    s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(s);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); t.cleanup.push(() => srv.close());
  return { dir, url: `http://127.0.0.1:${srv.address().port}/`, files: [...seen] };
}

/** Simulate a deploy on a mirror: give every hashed JS/CSS file a new name, rewrite every reference, delete the old file. */
export function fakeDeploy(dir, only) {
  const ad = path.join(dir, 'assets'); const ren = {};
  for (const f of fs.readdirSync(ad)) if (/-[\w-]{8}\.(js|css)$/.test(f) && (!only || only.test(f))) ren[f] = f.replace(/-([\w-]{8})\.(js|css)$/, (_, h, e) => `-${h[0] === "Z" ? "Q" : "Z"}${h.slice(1)}.${e}`);
  const textFiles = []; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(html|js|css|json|webmanifest)$/.test(f)) textFiles.push(p); } }; walk(dir);
  for (const p of textFiles) { let s = fs.readFileSync(p, 'utf8'); let c = false; for (const [a, b] of Object.entries(ren)) if (s.includes(a)) { s = s.split(a).join(b); c = true; } if (c) fs.writeFileSync(p, s); }
  for (const [a, b] of Object.entries(ren)) fs.renameSync(path.join(ad, a), path.join(ad, b));
  return ren;
}
