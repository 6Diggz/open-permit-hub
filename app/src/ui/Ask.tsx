import { useEffect, useRef, useState } from 'react';

/** In-page dialog that replaces alert/confirm/prompt (blocked in many browsers and embedded views). */
type Req = { title: string; body?: string; input?: 'text' | 'password'; minLength?: number; confirm: string; cancel?: string; danger?: boolean; resolve: (v: string | boolean | null) => void };
let push: ((r: Req) => void) | null = null;
export function ask(o: Omit<Req, 'resolve'>): Promise<string | boolean | null> {
  return new Promise(resolve => { if (push) push({ ...o, resolve }); else resolve(null); });
}
export function AskHost() {
  const [q, setQ] = useState<Req | null>(null); const [val, setVal] = useState(''); const [err, setErr] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { push = r => { setVal(''); setErr(''); setQ(r); }; return () => { push = null; }; }, []);
  useEffect(() => { const d = ref.current; if (!d) return; if (q && !d.open) d.showModal?.(); if (!q && d.open) d.close(); }, [q]);
  const done = (v: string | boolean | null) => { q?.resolve(v); setQ(null); };
  const ok = () => {
    if (q?.input) { if ((q.minLength ?? 1) > val.trim().length) { setErr(q.input === 'password' ? `Use at least ${q.minLength} characters.` : 'Type a short reason first.'); return; } done(val.trim()); }
    else done(true);
  };
  return <dialog ref={ref} className="ask" aria-labelledby="ask-t" onCancel={e => { e.preventDefault(); done(q?.input ? null : false); }}>
    {q && <form method="dialog" onSubmit={e => { e.preventDefault(); ok(); }}>
      <h2 id="ask-t">{q.title}</h2>
      {q.body && <p>{q.body}</p>}
      {q.input && <div className="field"><input id="ask-in" autoFocus type={q.input} value={val} onChange={e => setVal(e.target.value)} aria-invalid={!!err} aria-describedby="ask-err" autoComplete={q.input === 'password' ? 'new-password' : 'off'} /><span id="ask-err" className="help" role="alert" style={{ color: 'var(--fix)' }}>{err}</span></div>}
      <div className="ask-row">
        <button type="button" className="btn quiet" onClick={() => done(q.input ? null : false)}>{q.cancel ?? 'Cancel'}</button>
        <button type="submit" className={'btn primary' + (q.danger ? ' danger' : '')} autoFocus={!q.input}>{q.confirm}</button>
      </div>
    </form>}
  </dialog>;
}
