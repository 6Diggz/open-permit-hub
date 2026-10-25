import { useRef, useState } from 'react';
import type { PlanCheck as Result, CheckItem, ItemState } from '../io/plancheck';
import { KIND_NAME as KIND, extractPages, analyze, counts, PLAN_LIMITS, PlanError } from '../io/plancheck';
import { CATALOG } from '../rules/ladbs-adu-2025';
import { L, uiLang } from './lang';

type Phase = { k: 'idle' } | { k: 'reading'; page: number; of: number; name: string } | { k: 'error'; msg: string; name: string } | { k: 'done'; r: Result; name: string; total: number };
type Show = 'all' | ItemState;
const STATE_CLASS: Record<ItemState, string> = { addressed: 'PASS', negated: 'UNKNOWN', conflict: 'FAIL', partial: 'UNKNOWN', missing: 'FAIL' };

/**
 * Plan-set pre-check: the user picks the PDF of an existing plan set; its text is read on this device (pdf.js, loaded
 * only now) and matched to the LADBS sheet items. An assist, never a plan review: each item says how sure it is.
 */
export function PlanCheckPanel({ onNotes }: { /** Adds review notes for the items not found (returns how many were added). */ onNotes: (items: { ref: string; text: string }[]) => number }) {
  const es = uiLang() === 'es'; const lang = es ? 'es' : 'en';
  const [ph, setPh] = useState<Phase>({ k: 'idle' }); const [show, setShow] = useState<Show>('all'); const [note, setNote] = useState('');
  const sig = useRef({ cancelled: false }); const input = useRef<HTMLInputElement>(null);
  const STATE: Record<ItemState, string> = { addressed: L('Mentioned'), negated: L('Mentioned, not shown as provided'), conflict: L('Conflicts with code'), partial: L('Partly found'), missing: L('Not found in the text') };
  /** Text proves a mention, not compliance: say where it was mentioned. */
  const stateLabel = (i: CheckItem) => i.state === 'addressed' && i.pages.length ? `${L('Mentioned on page')} ${i.pages.join(', ')}` : STATE[i.state];
  const CONF = { high: L('High'), medium: L('Medium'), low: L('Low') };
  const summary = (id: string) => CATALOG.find(c => c.id === id)?.summary[lang] ?? id;

  const run = async (f: File | undefined) => {
    if (!f) return; setNote(''); setShow('all');
    const s = { cancelled: false }; sig.current = s;
    setPh({ k: 'reading', page: 0, of: 0, name: f.name });
    try {
      const { loadPdfJs } = await import('../io/pdfjs');
      if (f.size > PLAN_LIMITS.maxBytes) throw new PlanError('size', 'too large');
      const lib = await loadPdfJs(); const bytes = new Uint8Array(await f.arrayBuffer());
      const { pages, total } = await extractPages(bytes, lib, (page, of) => { if (!s.cancelled) setPh({ k: 'reading', page, of, name: f.name }); }, s);
      if (s.cancelled) return;
      setPh({ k: 'done', r: analyze(pages, total), name: f.name, total });
    } catch (e) {
      if (s.cancelled) return;
      const code = (e as { code?: string }).code;
      const msg = code === 'size' ? L('This file is larger than 80 MB. Save the plan set as a smaller PDF (or split it) and try again.')
        : code === 'notpdf' ? L('This file is not a PDF. Pick the PDF of your plan set.')
        : code === 'locked' ? L('This PDF is locked with a password. Save an unlocked copy and try again.')
        : code === 'damaged' ? L('This PDF could not be read. It may be damaged. Save it again from the drawing program and try again.')
        : L('The pre-check could not load. Check your connection once (it is saved for offline use after that) and try again.');
      setPh({ k: 'error', msg, name: f.name });
    }
  };
  const cancel = () => { sig.current.cancelled = true; setPh({ k: 'idle' }); };
  const again = () => { setPh({ k: 'idle' }); requestAnimationFrame(() => input.current?.click()); };

  const pagesTxt = (i: CheckItem) => i.pages.length ? `${i.pages.length > 1 ? L('Pages') : L('Page')} ${i.pages.join(', ')}` : L('No page');
  return <section className="field" aria-labelledby="pc-h" style={{ gap: 12 }}>
    <h2 id="pc-h" style={{ fontSize: '1.15rem', margin: 0 }}>{L('Pre-check a plan set (PDF)')}</h2>
    <p className="lead" style={{ margin: 0 }}>{L('Pick the PDF of a plan set. The words in it are read on this device (nothing is uploaded) and matched to the LADBS correction sheet items. This is an assist, not a plan review: drawings, stamps and signatures are pictures and are not read, so check every item yourself.')}</p>
    {ph.k !== 'reading' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <label className="btn primary">{ph.k === 'idle' ? L('Choose a plan set PDF') : L('Check another PDF')}
        <input ref={input} className="sr" type="file" accept="application/pdf,.pdf" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void run(f); }} /></label>
    </div>}
    {ph.k === 'reading' && <div className="banner" role="status" style={{ margin: 0 }}>
      {ph.of ? `${L('Reading page')} ${ph.page} ${L('of')} ${ph.of}…` : L('Opening the PDF…')} <span className="help">{ph.name}</span>{' '}
      <button type="button" className="btn quiet" onClick={cancel}>{L('Cancel')}</button></div>}
    {ph.k === 'error' && <div className="banner warn" role="alert" style={{ margin: 0 }}>{ph.msg} <span className="help">{ph.name}</span>{' '}<button type="button" className="btn quiet" onClick={again}>{L('Try another file')}</button></div>}
    {ph.k === 'done' && done()}
  </section>;

  function done() {
    if (ph.k !== 'done') return null; const { r, name, total } = ph;
    const n = counts(r);
    const list = r.items.filter(i => show === 'all' || i.state === show);
    const missing = r.items.filter(i => i.state === 'missing');
    return <>
      <div className="banner" role="status" style={{ margin: 0 }}>
        <b>{name}</b> · {r.pages} {r.pages === 1 ? L('page read') : L('pages read')}{total > r.pages ? ` (${L('of')} ${total}; ${L('only the first')} ${r.pages} ${L('are read')})` : ''}.{' '}
        {r.items.length} {L('sheet items')}: {n.addressed} {L('mentioned')}, {n.conflict} {L('conflict with code')}, {n.negated} {L('not shown as provided')}, {n.partial} {L('partly found')}, {n.missing} {L('not found in the text')}.
      </div>
      {r.scanned && <div className="banner warn" role="alert" style={{ margin: 0 }}>{r.textPages === 0 ? L('No text was found in this PDF. It looks like a scan or a picture of the plans, so nothing could be read. Ask for a PDF exported from the drawing program.') : L('Most pages have no text (they look scanned). Items on those pages show as not found even if they are drawn.')}</div>}
      <div className="field"><label id="pc-show">{L('Show')}</label>
        <div className="tri" role="group" aria-labelledby="pc-show">
          {(['all', 'conflict', 'missing', 'negated', 'partial', 'addressed'] as Show[]).map(s => <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>{s === 'all' ? `${L('All')} (${r.items.length})` : `${STATE[s]} (${n[s]})`}</button>)}
        </div></div>
      <ul className="results" style={{ padding: 0 }} aria-label={L('Sheet items found in the plan set')}>
        {list.map(i => <li key={i.id} className={'res ' + STATE_CLASS[i.state]}>
          <div className="head"><span className="tag">{stateLabel(i)}</span><span className="title">{i.id} · {summary(i.id)}</span></div>
          <p className="next">{i.why[lang]}</p>
          {i.attention && <p className="pending">{i.attention[lang]}</p>}
          <p className="cite">{L('Confidence')}: {CONF[i.confidence]} · {pagesTxt(i)}</p>
          {i.evidence.length > 0 && <ul className="cite" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{i.evidence.map((h, k) => <li key={k}>{L('p.')} {h.page}: “{h.text}”</li>)}</ul>}
        </li>)}
      </ul>
      {list.length === 0 && <p className="lead">{L('No items in this group.')}</p>}
      <div style={{ overflowX: 'auto' }} role="region" aria-label={L('Sheets found')} tabIndex={0}>
        <table className="take"><caption style={{ textAlign: 'left', fontWeight: 700 }}>{L('Sheets found')}</caption>
          <thead><tr><th scope="col">{L('Page')}</th><th scope="col">{L('Sheet')}</th><th scope="col">{L('Looks like')}</th><th scope="col">{L('Scale')}</th></tr></thead>
          <tbody>{r.sheets.map(s => <tr key={s.page}><td>{s.page}</td><td>{s.id ?? '-'}</td><td>{s.kinds.length ? s.kinds.map(k => KIND[k][lang]).join(', ') : (s.chars < 40 ? L('no text') : '-')}</td><td>{s.scales.join('; ') || '-'}</td></tr>)}</tbody></table></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn" disabled={missing.length === 0} onClick={() => { const k = onNotes(missing.map(i => ({ ref: i.id, text: `${L('Plan set pre-check')}: ${i.id} ${summary(i.id)} ${L('Not found in the text')}.` }))); setNote(k ? `${k} ${L('review notes added. They are in the notes list above.')}` : L('No room for more notes in this project.')); }}>{L('Add the not-found items as review notes')}</button>
        <span className="help" role="status">{note}</span>
      </div>
    </>;
  }
}
