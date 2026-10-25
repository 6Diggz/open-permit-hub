import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css'; // sheet text: the same bold the PDF embeds (one width table)
import '@fontsource/public-sans/800.css';
import './ui/styles.css';
import App from './ui/App';
import { initKV } from './core/kv';
import { Component, type ReactNode } from 'react';
import { errorReport } from './core/errorreport';
import { updateText } from './rules/pack';

// Frame protection (GitHub Pages can't send frame-ancestors): refuse to run inside another site's frame.
if (window.top !== window.self) { try { window.top!.location.href = window.self.location.href; } catch { document.documentElement.innerHTML = '<p style="font:16px system-ui;padding:16px">Open this tool directly: <a href="https://6diggz.github.io/open-permit-hub/" target="_top">6diggz.github.io/open-permit-hub</a></p>'; throw new Error('framed'); } }

class Boundary extends Component<{ children: ReactNode }, { err: Error | null; copied: boolean }> {
  state = { err: null as Error | null, copied: false };
  static getDerivedStateFromError(e: Error) { return { err: e, copied: false }; }
  render() {
    const e = this.state.err; if (!e) return this.props.children;
    const rep = errorReport(e); const issue = `https://github.com/6Diggz/open-permit-hub/issues/new?title=${encodeURIComponent('App error: ' + String(e.message).slice(0, 80))}&body=${encodeURIComponent('Error report (no project data):\n\n```json\n' + rep + '\n```')}`;
    return <main className="welcome" id="main"><h1>Something went wrong.</h1><p>{e.message}</p><p>Your work is saved on this device. Reload the page, or open a backup file.</p>
      <div className="row"><button className="btn primary" onClick={() => location.reload()}>Reload</button>
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(rep).then(() => this.setState({ copied: true })).catch(() => {}); }}>{this.state.copied ? 'Copied' : 'Copy error report'}</button>
        <a className="btn quiet" href={issue} target="_blank" rel="noreferrer">Report it on GitHub</a></div>
      <p className="help">The report has the app version and the error only. No addresses, names or drawings.</p></main>;
  }
}

let swapRequested = false;
/** "Update ready" prompt: a new service worker waits until the user reloads, so open work is never cut off. */
function UpdatePrompt() {
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null); const [next, setNext] = useState<{ pack?: string; verifiedOn?: string } | null>(null);
  useEffect(() => { const on = (e: Event) => { setReg((e as CustomEvent).detail); fetch('./version.json', { cache: 'no-store' }).then(r => r.json()).then(setNext, () => {}); }; window.addEventListener('opa-update', on); return () => window.removeEventListener('opa-update', on); }, []);
  if (!reg) return null;
  const es = document.documentElement.lang === 'es';
  return <div className="toast" role="status">{updateText(next, es)} <button className="btn quiet" style={{ color: 'inherit' }} onClick={() => { swapRequested = true; if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); else location.reload(); }}>{es ? 'Recargar' : 'Reload'}</button></div>;
}

// OUT2-10: open IndexedDB (and move any localStorage projects into it) before the app reads its first project.
// App reads the store only while rendering. initKV never throws; it falls back to localStorage.
void initKV().then(() => createRoot(document.getElementById('root')!).render(<StrictMode><Boundary><App /><UpdatePrompt /></Boundary></StrictMode>));

// A lazy chunk from an old deploy is gone: reload once to get the new build instead of showing an error.
window.addEventListener('vite:preloadError', () => { try { if (sessionStorage.getItem('opa.reloaded')) return; sessionStorage.setItem('opa.reloaded', '1'); } catch { /* blocked */ } location.reload(); });
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let reloading = false;
  // Reload only when the user asked for the update (not when the first service worker takes control).
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !swapRequested) return; reloading = true; location.reload(); });
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const tell = () => window.dispatchEvent(new CustomEvent('opa-update', { detail: reg }));
    if (reg.waiting && navigator.serviceWorker.controller) tell();
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) tell(); }); });
    // Look for a new version hourly and whenever the app comes back to the screen.
    const check = () => reg.update().then(() => { if (reg.waiting && navigator.serviceWorker.controller) tell(); }).catch(() => {});
    setInterval(check, 60 * 60 * 1000); window.addEventListener('focus', check); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => {});
}
