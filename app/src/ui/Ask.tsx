import { useEffect, useRef, useState } from 'react';

/** In-page dialog that replaces alert/confirm/prompt (blocked in many browsers and embedded views). */
type Req = { title: string; body?: string; input?: 'text' | 'password'; minLength?: number; confirm: string; cancel?: string; danger?: boolean;
  /** Password: ask twice and require a match (a typo would lock the file forever). */ repeat?: string;
  /** Extra check on the value; return a message to block. */ validate?: (v: string) => string | null;
  /** Labels for the fields (screen readers) and the mismatch / too-short messages, so callers can translate them. */ labels?: { field?: string; repeat?: string; mismatch?: string; short?: string; show?: string };
  /** A third button that resolves with this string instead of the input. */ alt?: { label: string; value: string };
  resolve: (v: string | boolean | null) => void };
let push: ((r: Req) => void) | null = null;
export function ask(o: Omit<Req, 'resolve'>): Promise<string | boolean | null> {
  return new Promise(resolve => { if (push) push({ ...o, resolve }); else resolve(null); });
}
export function AskHost() {
  const [q, setQ] = useState<Req | null>(null); const [val, setVal] = useState(''); const [val2, setVal2] = useState(''); const [err, setErr] = useState(''); const [show, setShow] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { push = r => { setVal(''); setVal2(''); setErr(''); setShow(false); setQ(r); }; return () => { push = null; }; }, []);
  useEffect(() => { const d = ref.current; if (!d) return; if (q && !d.open) d.showModal?.(); if (!q && d.open) d.close(); }, [q]);
  const done = (v: string | boolean | null) => { q?.resolve(v); setQ(null); };
  const ok = () => {
    if (q?.input) {
      const v = q.input === 'password' ? val : val.trim();
      if ((q.minLength ?? 1) > v.trim().length) { setErr(q.labels?.short ?? (q.input === 'password' ? `Use at least ${q.minLength} characters.` : 'Type a short reason first.')); return; }
      const bad = q.validate?.(v); if (bad) { setErr(bad); return; }
      if (q.repeat && val2 !== val) { setErr(q.labels?.mismatch ?? 'The two passphrases do not match.'); return; }
      done(v);
    } else done(true);
  };
  const type = q?.input === 'password' && !show ? 'password' : 'text';
  return <dialog ref={ref} className="ask" aria-labelledby="ask-t" onCancel={e => { e.preventDefault(); done(q?.input ? null : false); }}>
    {q && <form method="dialog" onSubmit={e => { e.preventDefault(); ok(); }}>
      <h2 id="ask-t">{q.title}</h2>
      {q.body && <p>{q.body}</p>}
      {q.input && <div className="field"><label className="sr" htmlFor="ask-in">{q.labels?.field ?? q.title}</label><input id="ask-in" autoFocus type={type} value={val} onChange={e => setVal(e.target.value)} aria-invalid={!!err} aria-describedby="ask-err" autoComplete={q.input === 'password' ? 'new-password' : 'off'} />
        {q.repeat && <><label htmlFor="ask-in2" className="help">{q.labels?.repeat ?? q.repeat}</label><input id="ask-in2" type={type} value={val2} onChange={e => setVal2(e.target.value)} aria-invalid={!!err} aria-describedby="ask-err" autoComplete="new-password" /></>}
        {q.input === 'password' && <label className="help"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> {q.labels?.show ?? 'Show'}</label>}
        <span id="ask-err" className="help" role="alert" style={{ color: 'var(--fix)' }}>{err}</span></div>}
      <div className="ask-row">
        <button type="button" className="btn quiet" onClick={() => done(q.input ? null : false)}>{q.cancel ?? 'Cancel'}</button>
        {q.alt && <button type="button" className="btn" onClick={() => done(q.alt!.value)}>{q.alt.label}</button>}
        <button type="submit" className={'btn primary' + (q.danger ? ' danger' : '')} autoFocus={!q.input}>{q.confirm}</button>
      </div>
    </form>}
  </dialog>;
}
