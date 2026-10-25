// Builds the service worker at build time: cache name from a hash of the build, and a precache list of every
// emitted file (lazy JS chunks, CSS, fonts, the CAD WASM) so the app and every export work offline after one visit.
import { createHash } from 'node:crypto';

export const SW_TEMPLATE = `// Generated at build time by sw-build.ts. Do not edit dist/sw.js by hand.
const VERSION = __VERSION__;
const C = 'opa-' + VERSION;
const PRECACHE = __PRECACHE__;
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(PRECACHE))); });
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); if (e.data === 'VERSION' && e.source) e.source.postMessage({ version: VERSION }); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('opa-') && k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page itself, so a new deploy is picked up; the cached page keeps working offline.
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put('./index.html', copy)); } return r; }).catch(() => caches.match('./index.html', { cacheName: C }).then(h => h || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: C, ignoreSearch: true }).then(hit => hit || fetch(req).then(r => { if (r.ok && url.pathname.includes('/assets/')) { const copy = r.clone(); caches.open(C).then(c => c.put(req, copy)); } return r; })));
});
`;

/** files: paths relative to the site root (no leading slash). Returns the service worker source. */
export function buildServiceWorker(files: string[], indexHtml: string): { source: string; version: string; precache: string[] } {
  const precache = ['./', ...[...new Set(files)].filter(f => f !== 'sw.js' && !f.endsWith('.map')).sort().map(f => './' + f)];
  const version = createHash('sha256').update(precache.join('\n')).update(indexHtml).digest('hex').slice(0, 12);
  const source = SW_TEMPLATE.replace('__VERSION__', JSON.stringify(version)).replace('__PRECACHE__', JSON.stringify(precache));
  return { source, version, precache };
}
