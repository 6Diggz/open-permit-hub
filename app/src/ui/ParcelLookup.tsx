import { useEffect, useRef, useState } from 'react';
import type { Project } from '../core/model';
import { lookupParcel, type ParcelError, type FetchLike } from '../io/parcel';
import { applyParcel, type MapField } from '../io/parcel-apply';
import { L } from './lang';

/** Tests swap in recorded answers; the app uses the browser's fetch. */
let testFetch: FetchLike | undefined;
export const setParcelFetch = (f: FetchLike | undefined) => { testFetch = f; };

const NAMES: Record<MapField, string> = { lot: 'lot lines and size', apn: 'APN', zone: 'zone', jurisdiction: 'city', hillside: 'Hillside Area', vhfhsz: 'fire zone', coastal: 'Coastal Zone', hpoz: 'historic district', house: 'house outline', garage: 'garage outline', burn: '2025 burn area' };
const LAYER: Record<string, string> = { parcel: 'parcel shape', city: 'city boundary', adjacent: 'nearby cities', zoning: 'zoning', hillside: 'Hillside Area', vhfhsz: 'fire zone', hpoz: 'historic district', coastalDual: 'Coastal Zone', coastalSingle: 'Coastal Zone', coastalCommission: 'Coastal Zone', zoning1a: 'Downtown zoning', palisades: '2025 burn area', buildings: 'house and garage outlines' };
const ERR: Record<ParcelError, string> = {
  offline: "You're offline. Enter the lot by hand below, or look it up when you're connected.",
  empty: 'Enter the street address with the house number first.',
  'not-found': "The city's street list has no match for this address. Check the house number, street and ZIP code. Addresses outside the City of LA are not in this list. You can enter the lot by hand below.",
  'zip-mismatch': "The address matched a street with a different ZIP code. Check the ZIP code. You can enter the lot by hand below.",
  'direction-mismatch': "The city's street list has this house number only with a different street direction (N, S, E or W). That is a different house. Check the address. You can enter the lot by hand below.",
  network: 'The city map did not answer. Try again in a minute, or enter the lot by hand below.',
  'no-parcel': 'The street was found but not this exact parcel. Enter the lot by hand below.',
};

type St = { k: 'idle' } | { k: 'loading' } | { k: 'error'; e: ParcelError; near?: string } | { k: 'done'; filled: string[]; matched: string; failed: string[]; multi: boolean; outside: string | null; condo: boolean; ch1a: boolean; split: boolean; noExact: boolean };

/** Opt-in parcel autofill. The address leaves the device only when the user taps "Look up", and the screen says so before. */
export function ParcelLookup({ p, commit }: { p: Project; commit: (next: Project) => void }) {
  const [st, setSt] = useState<St>({ k: 'idle' }); const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const run = async () => {
    ctl.current?.abort(); const c = new AbortController(); ctl.current = c; setSt({ k: 'loading' });
    try {
      const fetchFn = testFetch;
      const r = await lookupParcel(p.site.address, { signal: c.signal, online: fetchFn ? true : navigator.onLine, fetch: fetchFn });
      if (c.signal.aborted) return;
      if (!r.ok) { setSt({ k: 'error', e: r.error === 'network' && !navigator.onLine ? 'offline' : r.error, near: r.error === 'network' ? undefined : r.detail }); return; }
      if (r.fill.noParcelMatch) { setSt({ k: 'error', e: 'no-parcel' }); return; }
      const { next, filled } = applyParcel(p, r.fill);
      if (!filled.length) { setSt({ k: 'error', e: r.fill.failed.length ? 'network' : 'no-parcel' }); return; }
      commit(next);
      const outside = r.fill.jurisdiction === 'other' ? r.fill.cityName : null;
      const yn = (v: string) => (v === 'yes' ? L('yes') : L('no'));
      const said: Record<MapField, string> = { lot: L(NAMES.lot), apn: `${L(NAMES.apn)} ${next.site.apn}`, zone: `${L(NAMES.zone)} ${next.site.zone}`, jurisdiction: `${L(NAMES.jurisdiction)}: ${r.fill.jurisdiction === 'la-city' ? 'Los Angeles' : r.fill.cityName || L('outside LA')}`,
        hillside: `${L(NAMES.hillside)}: ${yn(next.site.flags.hillside)}`, vhfhsz: `${L(NAMES.vhfhsz)}: ${yn(next.site.flags.vhfhsz)}`, coastal: `${L(NAMES.coastal)}: ${yn(next.site.flags.coastal)}`, hpoz: `${L(NAMES.hpoz)}: ${yn(next.site.flags.hpoz)}`,
        house: L(NAMES.house), garage: L(NAMES.garage), burn: `${L(NAMES.burn)}: ${yn(next.site.flags.fireRebuild)}` };
      setSt({ k: 'done', filled: filled.map(f => said[f]), matched: r.fill.matched, failed: [...new Set(r.fill.failed.map(f => L(LAYER[f] ?? f)))], multi: r.fill.multiPiece, outside, condo: !!r.fill.condo, ch1a: !!r.fill.chapter1a, split: !!r.fill.splitZone, noExact: !!r.fill.noExactParcel });
    } catch (e) { if ((e as Error)?.name === 'AbortError') { setSt({ k: 'idle' }); return; } setSt({ k: 'error', e: navigator.onLine ? 'network' : 'offline' }); }
  };
  return <div className="field" role="group" aria-labelledby="pl-h">
    <label id="pl-h">{L('Fill in from the city parcel map (optional)')}</label>
    <span className="help" id="pl-priv">{L('Only the street address is sent, to the City of Los Angeles map services (maps.lacity.org and zimas.lacity.org), and only when you tap "Look up". Nothing else leaves this device.')}</span>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn" aria-describedby="pl-priv" disabled={st.k === 'loading' || !p.site.address.trim()} onClick={run}>{st.k === 'loading' ? L('Looking up...') : L('Look up')}</button>
      {st.k === 'loading' && <button type="button" className="btn quiet" onClick={() => ctl.current?.abort()}>{L('Cancel')}</button>}
    </div>
    <div role="status" aria-live="polite" className="help">
      {st.k === 'idle' && !p.site.address.trim() && L('Type the address above first.')}
      {st.k === 'loading' && L('Asking the city map about this address...')}
      {st.k === 'error' && <span style={{ color: 'var(--info-text)' }}>{L(ERR[st.e])}{st.near && <> {L('Closest match in the city list:')} <strong>{st.near.slice(0, 120)}</strong>.</>}</span>}
      {st.k === 'done' && <>
        {L('Found')} <strong>{st.matched}</strong>. {L('Filled from the parcel map:')} {st.filled.join('; ')}. {L('Verify these on site. Change any value below; Undo puts back what you had.')}
        {st.failed.length > 0 && <> {L('These map layers did not answer, so enter them by hand:')} {st.failed.join(', ')}.</>}
        {st.noExact && <> {L('No parcel in the city map has this exact address (it may be a vacant lot, or the parcel is listed under another address), so the lot shape and map questions were not filled. Enter them by hand.')}</>}
        {st.condo && <> {L('This is a condo or multi-unit parcel, so no APN or lot shape was filled. Use the APN on your own property tax bill, and ask the HOA about the lot.')}</>}
        {st.ch1a && <> {L('This lot uses the new Downtown zoning (Chapter 1A). The rules in this tool may not cover it: check with City Planning.')}</>}
        {st.split && <> {L('This lot touches more than one zone. Check ZIMAS to see which part the garage is in.')}</>}
        {st.multi && <> {L('This parcel is mapped as more than one piece, so the lot shape was not drawn. Enter the lot size by hand.')}</>}
      </>}
    </div>
    {st.k === 'done' && st.outside != null && <div className="banner warn" role="alert" style={{ margin: 0 }}>{L('The city map shows this lot is outside the City of Los Angeles')}{st.outside ? ` (${st.outside})` : ''}. {L("This tool's rules are for LA City only.")}</div>}
  </div>;
}
