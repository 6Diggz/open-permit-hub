import { useState } from 'react';
import type { Pin, Project } from '../core/model';
import { uid } from '../core/model';
import { defaultPinSpot, nextPinNumber, parseLetter, responseLetter, sortPins, type SortKey } from '../core/markup';
import { L, uiLang } from './lang';

type U = (fn: (d: Project) => void, key?: string) => void;
const AUTHOR_KEY = 'opa.author';
const readAuthor = () => { try { return localStorage.getItem(AUTHOR_KEY) ?? ''; } catch { return ''; } };
const saveAuthor = (v: string) => { try { localStorage.setItem(AUTHOR_KEY, v); } catch { /* storage blocked: name is kept for this visit */ } };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/**
 * Review step: numbered pins on the plan with comment, status, author and date, a sortable list that mirrors them,
 * and a helper that turns a pasted city correction letter into pins or checklist responses.
 */
export function ReviewStep({ p, update, sel, setSel, placing, setPlacing, download }: { p: Project; update: U; sel: string | null; setSel: (id: string | null) => void; placing: string | false; setPlacing: (v: string | false) => void; download: (name: string, data: string, type: string) => void }) {
  const [author, setAuthor] = useState(readAuthor); const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: 'n', d: 1 });
  const [letter, setLetter] = useState(''); const [items, setItems] = useState<{ ref: string; text: string }[] | null>(null); const [msg, setMsg] = useState('');
  const es = uiLang() === 'es'; const pins = p.markup.pins; const pin = pins.find(x => x.id === sel) ?? null;
  const open = pins.filter(x => x.status === 'open').length;
  const setPin = (id: string, fn: (x: Pin) => void, key?: string) => update(d => { const x = d.markup.pins.find(y => y.id === id); if (x) fn(x); }, key);
  const addPin = (comment = '', ref?: string) => { const id = uid(); update(d => { const spot = defaultPinSpot(d); d.markup.pins.push({ id, n: nextPinNumber(d.markup.pins), ...spot, comment, status: 'open', author: author.trim(), at: today(), ...(ref ? { ref } : {}) }); }); setSel(id); return id; };
  const head = (k: SortKey, label: string) => <th aria-sort={sort.k === k ? (sort.d === 1 ? 'ascending' : 'descending') : 'none'} scope="col">
    <button type="button" className="btn quiet" style={{ border: 0, padding: '2px 4px' }} onClick={() => setSort(s => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : 1 }))}>{label}{sort.k === k ? (sort.d === 1 ? ' ▲' : ' ▼') : ''}</button></th>;
  return <>
    <h2>{L('Review notes')}</h2>
    <p className="lead">{L('Put numbered notes on the plan. They travel inside the .permitpack file, so a reviewer needs no account: open the file, add notes, save a backup and send it back.')}</p>
    <div className="grid2">
      <div className="field"><label htmlFor="rv-au">{L('Your name (shown on your notes)')}</label><input id="rv-au" value={author} maxLength={80} autoComplete="name" onChange={e => { setAuthor(e.target.value); saveAuthor(e.target.value); }} /></div>
      <div className="field"><label id="rv-add">{L('Add a note')}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-labelledby="rv-add">
          <button type="button" className="btn primary" aria-pressed={placing === 'new'} onClick={() => setPlacing(placing === 'new' ? false : 'new')}>{placing === 'new' ? L('Tap the plan to place it') : L('Place a pin on the plan')}</button>
          <button type="button" className="btn" onClick={() => { setPlacing(false); addPin(); }}>{L('Add a note at the ADU')}</button>
        </div>
        <span className="help" role="status">{placing ? L('Tap or click the spot on the plan. Press Escape to stop.') : `${pins.length} ${L('notes')}: ${open} ${L('open')}, ${pins.length - open} ${L('resolved')}.`}</span></div>
    </div>
    {pins.length === 0 ? <p className="lead">{L('No notes yet. Place a pin on the plan, or paste a correction letter below.')}</p> :
      <div style={{ overflowX: 'auto' }} role="region" aria-label={L('Notes list')} tabIndex={0}>
        <table className="take"><caption className="sr">{L('Notes list. Sort with the column buttons; choose a note to show it on the plan.')}</caption>
          <thead><tr>{head('n', '#')}{head('comment', L('Note'))}{head('status', L('Status'))}{head('author', L('By'))}{head('at', L('Date'))}</tr></thead>
          <tbody>{sortPins(pins, sort.k, sort.d).map(x => <tr key={x.id} aria-selected={x.id === sel}>
            <td><button type="button" className="btn quiet" aria-label={`${L('Show note')} ${x.n} ${L('on the plan')}`} aria-pressed={x.id === sel} onClick={() => setSel(x.id === sel ? null : x.id)}>{x.n}</button></td>
            <td>{x.comment || <span className="help">{L('(no text yet)')}</span>}{x.ref ? <span className="help"> · {L('letter item')} {x.ref}</span> : null}</td>
            <td style={{ color: x.status === 'open' ? 'var(--fix)' : 'var(--pass)', fontWeight: 700 }}>{x.status === 'open' ? L('Open') : L('Resolved')}</td>
            <td>{x.author || '-'}</td><td>{x.at}</td></tr>)}</tbody></table></div>}
    {pin && <fieldset className="grid2" style={{ border: '1px solid var(--rule)', padding: 12 }}>
      <legend>{L('Note')} {pin.n}</legend>
      <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="rv-c">{L('Comment')}</label><textarea id="rv-c" rows={3} maxLength={2000} value={pin.comment} onChange={e => setPin(pin.id, x => { x.comment = e.target.value; }, 'pc' + pin.id)} style={{ font: 'inherit', padding: 8, border: '1.5px solid var(--rule)', borderRadius: 'var(--r-sm)', background: 'var(--sheet)', color: 'inherit' }} /></div>
      <div className="field"><label id="rv-s">{L('Status')}</label><div className="tri" role="group" aria-labelledby="rv-s">
        <button type="button" aria-pressed={pin.status === 'open'} onClick={() => setPin(pin.id, x => { x.status = 'open'; })}>{L('Open')}</button>
        <button type="button" aria-pressed={pin.status === 'resolved'} onClick={() => setPin(pin.id, x => { x.status = 'resolved'; })}>{L('Resolved')}</button></div></div>
      <div className="field"><span className="help">{L('By')} {pin.author || '-'} · {pin.at}</span>
        <button type="button" className="btn" aria-pressed={placing === pin.id} onClick={() => setPlacing(placing === pin.id ? false : pin.id)}>{placing === pin.id ? L('Tap the plan to place it') : L('Move this note')}</button>
        <button type="button" className="btn quiet" onClick={() => { const id = pin.id; update(d => { d.markup.pins = d.markup.pins.filter(x => x.id !== id); d.markup.responses.forEach(r => { if (r.pinId === id) delete r.pinId; }); }); setSel(null); }}>{L('Delete note')}</button></div>
    </fieldset>}

    <h2>{L('Answer a correction letter')}</h2>
    <p className="lead">{L('Paste the text of the city\'s correction letter. Each numbered item becomes a note on the plan or a checklist answer.')}</p>
    <div className="field"><label htmlFor="rv-l">{L('Correction letter text')}</label><textarea id="rv-l" rows={5} value={letter} onChange={e => setLetter(e.target.value)} style={{ font: 'inherit', padding: 8, border: '1.5px solid var(--rule)', borderRadius: 'var(--r-sm)', background: 'var(--sheet)', color: 'inherit' }} aria-describedby="rv-l-h" />
      <span className="help" id="rv-l-h" role="status">{msg || L('Nothing is sent anywhere. The text stays on this device.')}</span></div>
    <div><button type="button" className="btn" disabled={!letter.trim()} onClick={() => { const it = parseLetter(letter); setItems(it); setMsg(it.length ? `${it.length} ${L('items found.')}` : L('No items found. Put each item on its own numbered line.')); }}>{L('Split into items')}</button></div>
    {items && items.length > 0 && <ul className="results" style={{ padding: 0 }}>{items.map((it, k) => <li key={k} className="res">
      <p><strong>{it.ref}.</strong> {it.text}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button type="button" className="btn" onClick={() => { const pid = addPin(it.text, it.ref); update(d => { d.markup.responses.push({ id: uid(), ref: it.ref, text: it.text, response: '', sheet: '', done: false, pinId: pid }); }); setItems(items.filter((_, j) => j !== k)); setMsg(L('Added as a note at the ADU. To move it, choose the note and then "Move this note".')); }}>{L('Make it a note on the plan')}</button>
        <button type="button" className="btn quiet" onClick={() => { update(d => { d.markup.responses.push({ id: uid(), ref: it.ref, text: it.text, response: '', sheet: '', done: false }); }); setItems(items.filter((_, j) => j !== k)); }}>{L('Answer in the checklist')}</button>
        <button type="button" className="btn quiet" onClick={() => setItems(items.filter((_, j) => j !== k))}>{L('Skip')}</button>
      </div></li>)}</ul>}
    {p.markup.responses.length > 0 && <>
      <h2>{L('Correction checklist')}</h2>
      {p.markup.responses.map(r => { const set = (fn: (x: typeof r) => void, key?: string) => update(d => { const x = d.markup.responses.find(y => y.id === r.id); if (x) fn(x); }, key); const linked = r.pinId ? pins.find(x => x.id === r.pinId) : undefined;
        return <fieldset key={r.id} className="grid2" style={{ border: '1px solid var(--rule)', padding: 12 }}>
          <legend>{L('Item')} {r.ref}{linked ? ` · ${L('note')} ${linked.n}` : ''}</legend>
          <p style={{ gridColumn: '1 / -1', margin: 0 }}>{r.text}</p>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor={'rr' + r.id}>{L('Response')}</label><textarea id={'rr' + r.id} rows={2} maxLength={2000} value={r.response} onChange={e => set(x => { x.response = e.target.value; }, 'rr' + r.id)} style={{ font: 'inherit', padding: 8, border: '1.5px solid var(--rule)', borderRadius: 'var(--r-sm)', background: 'var(--sheet)', color: 'inherit' }} /></div>
          <div className="field"><label htmlFor={'rs' + r.id}>{L('Fixed on sheet')}</label><input id={'rs' + r.id} value={r.sheet} maxLength={60} placeholder="A-2" onChange={e => set(x => { x.sheet = e.target.value; }, 'rs' + r.id)} /></div>
          <div className="mods"><label><input type="checkbox" checked={r.done} onChange={e => set(x => { x.done = e.target.checked; })} /> {L('Done')}</label>
            {linked && <button type="button" className="btn quiet" onClick={() => setSel(linked.id)}>{L('Show note')} {linked.n} {L('on the plan')}</button>}
            <button type="button" className="btn quiet" onClick={() => update(d => { d.markup.responses = d.markup.responses.filter(x => x.id !== r.id); })}>{L('Remove item')}</button></div>
        </fieldset>; })}
      <div><button type="button" className="btn" onClick={() => download('correction-responses.txt', responseLetter(p, es), 'text/plain;charset=utf-8')}>{L('Download the response letter (text)')}</button></div>
    </>}
    <p className="help">{L('The draft site plan PDF adds a markup sheet with every note and answer.')}</p>
  </>;
}
