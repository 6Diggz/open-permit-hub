import { useState } from 'react';
import type { Tri } from '../core/model';
import { fmtFtIn, lengthBlur, lengthTooLarge, outOfRange } from '../core/units';
import { tr, type Lang } from './i18n';
import { L, uiLang } from './lang';

export function TriPick({ id, value, onChange, lang = 'en' as Lang }: { id: string; value: Tri; onChange: (v: Tri) => void; lang?: Lang }) {
  return <div className="tri" role="group" aria-labelledby={id}>{(['yes', 'no', 'unknown'] as Tri[]).map(v => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{tr(uiLang() ?? lang, v)}</button>)}</div>;
}
export function Q({ id, label, help, value, onChange }: { id: string; label: string; help?: string; value: Tri; onChange: (v: Tri) => void }) {
  return <div className="field"><label id={id}>{label}</label><TriPick id={id} value={value} onChange={onChange} />{help && <span className="help">{help}</span>}</div>;
}
/** Length field. Rejects what can't be a size; accepts unusual sizes but says "check this number". */
export function Len({ id, label, help, mm, onChange, allowZero, range, bare, always }: { id: string; label: string; help?: string; mm: number | null; onChange: (mm: number | null) => void; allowZero?: boolean; range?: readonly [number, number]; /** Unit of a bare number (window fields: inches). */ bare?: 'ft' | 'in'; /** Commit on every good entry, even an unchanged one (confirms example sizes). */ always?: boolean }) {
  const [txt, setTxt] = useState(mm == null ? '' : fmtFtIn(mm)); const [bad, setBad] = useState(false); const [dirty, setDirty] = useState(false);
  const [prev, setPrev] = useState(mm); if (prev !== mm) { setPrev(mm); setTxt(mm == null ? '' : fmtFtIn(mm)); }
  const odd = !bad && range != null && mm != null && outOfRange(mm, range);
  return <div className="field"><label htmlFor={id}>{label}</label>
    <input id={id} value={txt} inputMode="text" aria-invalid={bad} aria-describedby={id + '-h'} onChange={e => { setTxt(e.target.value); setDirty(true); }}
      onBlur={() => { const r = lengthBlur(txt, mm, { allowZero, bare, always: always && dirty }); setDirty(false); setBad(r.bad); if (r.commit) onChange(r.value); }} />
    <span className="help" id={id + '-h'} style={odd ? { color: 'var(--info-need)' } : undefined}>{bad && lengthTooLarge(txt) ? L('Check this number: it is larger than any lot or building.') : bad && /^-|^0+(\.0*)?$/.test(txt.trim()) ? L('Enter a size greater than zero.') : bad ? (bare === 'in' ? L("Try a format like 24, 24\" or 2' 0\".") : L("Try a format like 20' 6\", 20-6, 20.5 or 6.25m.")) : odd ? L('Check this number: it looks unusual for a garage ADU.') : help ?? L("Feet and inches, like 20' 6\"")}</span></div>;
}
/** Number field with whole-number and range handling that says what happened instead of silently changing the value. */
export function Num({ id, label, help, value, onChange, min = 0, max, integer }: { id: string; label: string; help?: string; value: number | null; onChange: (n: number | null) => void; min?: number; max?: number; integer?: boolean }) {
  const [msg, setMsg] = useState('');
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type="number" min={min} max={max} step={integer ? 1 : 'any'} inputMode={integer ? 'numeric' : 'decimal'} value={value ?? ''} aria-describedby={id + '-h'}
    onChange={e => { if (e.target.value === '') { setMsg(''); onChange(null); return; } let n = Number(e.target.value); if (!Number.isFinite(n)) return; let m = '';
      if (integer && !Number.isInteger(n)) { n = Math.round(n); m = L('Use a whole number.'); }
      if (n < min) { n = min; m = `${L('The smallest allowed is')} ${min}.`; }
      if (max != null && n > max) m = L('Check this number: it looks unusual for a garage ADU.');
      setMsg(m); onChange(n); }} />
    <span className="help" id={id + '-h'} style={msg ? { color: 'var(--info-need)' } : undefined}>{msg || help}</span></div>;
}

