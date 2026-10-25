import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../core/model';
import { INSP_ITEMS, GROUPS, MAX_NOTE, blankInspection, result, tally, today, inspectionPack, appFailMap, planHints, deviceTz, tzLabel, INSP_STAGES, INSP_KINDS, type InspStatus, type Inspection, type InspStage, type InspKind } from '../core/inspection';
import { getVerdict } from '../core/verdict';
import { putPhoto, getPhoto, compressPhoto, toDataUrl, storageBlocked } from '../core/photos';
import { serialize, MAX_PACK_BYTES, encryptText, passphraseProblem } from '../core/permitpack';
import { passOpts } from './passgen';
import { uid } from '../core/model';
import { ask } from './Ask';
import { L, uiLang } from './lang';

type U = (fn: (d: Project) => void, key?: string) => void;
type Show = 'all' | 'open' | 'fail';
const slug = (p: Project) => (p.site.address || p.name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'project';
const now = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** A photo thumbnail from the device store (object URL revoked on change). */
function Thumb({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null); const [gone, setGone] = useState(false);
  useEffect(() => { let u: string | null = null; let live = true; getPhoto(id).then(b => { if (!live) return; if (b) { u = URL.createObjectURL(b); setUrl(u); } else setGone(true); }); return () => { live = false; if (u) URL.revokeObjectURL(u); }; }, [id]);
  if (gone) return <span className="help">{L('This photo is not on this device.')}</span>;
  return url ? <img src={url} alt={alt} className="fm-thumb" /> : <span className="help">{L('Loading photo…')}</span>;
}

/**
 * Inspector field mode: a phone screen for the site visit. Big targets for gloved hands, the app's own high-contrast
 * colors for bright sun, one photo per item from the phone camera, and results saved on the phone as they are tapped.
 */
export function FieldMode({ p, update, onBack, download }: { p: Project; update: U; onBack: () => void; download: (name: string, data: BlobPart, type: string) => void }) {
  const es = uiLang() === 'es'; const lang = es ? 'es' : 'en';
  const ins: Inspection = p.inspection ?? blankInspection(); const t = tally(p.inspection);
  const [show, setShow] = useState<Show>('all'); const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState(''); const [err, setErr] = useState<Record<string, string>>({});
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [memOnly, setMemOnly] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); const on = () => setOnline(navigator.onLine !== false); window.addEventListener('online', on); window.addEventListener('offline', on); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); }; }, []);
  // r5field-09: the time zone the times were taken in is kept with the visit.
  const edit = (fn: (i: Inspection) => void, key?: string) => update(d => { const i = d.inspection ?? blankInspection(); fn(i); if (!i.tz) { const z = deviceTz(); if (z) i.tz = z; } d.inspection = i; }, key);
  const setItem = (id: string, fn: (r: ReturnType<typeof result>) => void, key?: string) => edit(i => { const r = { ...result(i, id) }; fn(r); i.items[id] = r; }, key);
  // r5whole-02: the app's own result for each item, from the one shared verdict; a Pass over a failing check needs a reason.
  // r6ux-02: rules never read p.inspection, so typing a note must not re-run the verdict; one fail map per verdict.
  const coreKey = useMemo(() => JSON.stringify({ ...p, inspection: undefined }), [p]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rep = useMemo(() => getVerdict(p).report, [coreKey]);
  const fails = useMemo(() => appFailMap(p, rep, lang), [rep, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const failsOf = (id: string) => fails.get(id) ?? [];
  // r5field-11: what the project already says about each item (sizes, sprinklers required or not, all-electric).
  const hints = useMemo(() => planHints(p, rep, lang), [rep, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async (id: string, s: InspStatus) => {
    const cur = result(p.inspection, id);
    // r6logic-05: Pass or N/A over a failing check is an override and needs a reason.
    if ((s === 'pass' || s === 'na') && cur.s !== s && failsOf(id).length) {
      const na = s === 'na';
      const why = await ask({ title: L('This item fails the app\'s checks'), body: `${failsOf(id).join(' ')} ${L(na ? 'Say why it does not apply in the field. The reason is printed on the visit record.' : 'Say why it passes in the field. The reason is printed on the visit record.')}`, input: 'text', minLength: 3, confirm: L(na ? 'Mark N/A' : 'Mark Pass'), cancel: L('Cancel'), labels: { field: L('Reason'), short: L('Type a short reason first.') } });
      if (typeof why !== 'string') return;
      setItem(id, r => { r.s = s; r.at = now(); r.reason = why.trim().slice(0, 300); }); return;
    }
    setItem(id, r => { r.s = r.s === s ? null : s; r.at = now(); delete r.reason; });
  };

  const addPhoto = async (id: string, f: File | undefined) => {
    if (!f) return; setErr(e => ({ ...e, [id]: '' })); setBusy(id);
    try {
      const b = await compressPhoto(f); const pid = uid(); const stored = await putPhoto(pid, b); if (!stored) setMemOnly(true);
      setItem(id, r => { r.photo = pid; r.at = now(); }); // r5field-06: the old image stays until no saved project uses it (Undo)
    } catch (e) { const c = (e as Error).message; setErr(x => ({ ...x, [id]: c === 'too-big' ? L('This photo is too large to keep. Take it again closer, or at a lower camera size.') : L('This photo format cannot be read here. Use the camera, or a JPEG or PNG photo.') })); }
    finally { setBusy(null); }
  };
  // r5field-06: the image is not deleted here, so Undo brings the photo back; gcPhotos removes unused images on the next start.
  const removePhoto = (id: string) => { setItem(id, r => { r.photo = null; }); };

  const photoBytes = async () => { const out: Record<string, Uint8Array> = {}; let missing = 0;
    for (const x of INSP_ITEMS) { const pid = result(p.inspection, x.id).photo; if (!pid) continue; const b = await getPhoto(pid); if (b) out[pid] = new Uint8Array(await b.arrayBuffer()); else missing++; }
    return { out, missing }; };
  const savePDF = async () => { setBusy('pdf'); setMsg('');
    try { const { out, missing } = await photoBytes(); const { inspectionPDF } = await import('../out/inspectpdf'); download(`${slug(p)}-${es ? 'visita-obra' : 'site-visit'}-${ins.date}.pdf`, await inspectionPDF(p, out, lang) as BlobPart, 'application/pdf');
      setMsg(L('Saved to your downloads.') + (missing ? ` ${missing} ${L('photos were not on this device and are listed as missing.')}` : '')); }
    catch { setMsg(L('The record could not be made. Try again.')); } finally { setBusy(null); } };
  const savePack = async (lock = false) => {
    // r5field-08: optional passphrase lock, the same AES-GCM lock as "Save locked copy to share".
    let pass: string | null = null;
    if (lock) { pass = await ask({ title: L('Lock the visit file'), body: L('Pick a passphrase of 8 or more characters, like 3 or 4 unrelated words. Send it separately from the file, for example by text message. Nobody can recover it if it is lost, not even this app.'), input: 'password', minLength: 8, repeat: L('Type it again'), validate: v => { const m = passphraseProblem(v); return m ? L(m) : null; }, confirm: L('Save locked file'), cancel: L('Cancel'), ...passOpts(), labels: { field: L('Passphrase'), repeat: L('Type it again'), mismatch: L('The two passphrases do not match.'), short: L('Use a passphrase of 8 or more characters.'), show: L('Show') } }) as string | null; if (!pass) return; }
    setBusy('pack'); setMsg('');
    try { const { out } = await photoBytes(); const urls: Record<string, string> = {}; for (const [k, v] of Object.entries(out)) urls[k] = await toDataUrl(new Blob([v as BlobPart], { type: 'image/jpeg' }));
      // A locked file is about 4/3 the size of its contents (base64): leave room so it still opens under the pack size cap.
      const { text, left } = inspectionPack(serialize(p), urls, pass ? Math.floor(MAX_PACK_BYTES * 0.74) : MAX_PACK_BYTES);
      download(`${slug(p)}-${es ? 'visita-obra' : 'site-visit'}${pass ? '-locked' : ''}.permitpack`, pass ? await encryptText(text, pass) : text, 'application/json');
      setMsg(L('Saved to your downloads.') + (left.length ? ` ${left.length} ${L('photos did not fit in the file. They are in the PDF record.')}` : '')); }
    catch { setMsg(L('The file could not be made. Try again.')); } finally { setBusy(null); } };
  const clearAll = async () => {
    if (!await ask({ title: L('Clear this site visit?'), body: L('Every result, note and photo of this visit is removed from this project. Save the record first if you need it.'), confirm: L('Clear the visit'), cancel: L('Cancel'), danger: true })) return;
    update(d => { d.inspection = { ...blankInspection(), inspector: d.inspection?.inspector ?? '' }; }); setMsg(L('The visit was cleared.'));
  };

  const list = INSP_ITEMS.filter(x => { const s = result(p.inspection, x.id).s; return show === 'all' || (show === 'open' ? s == null : s === 'fail'); });
  return <div className="fm fm-hc" lang={lang}>
    <div className="toolbar fm-bar">
      <button type="button" className="btn" onClick={onBack}>{L('Back to the project')}</button>
      <span className="grow" />
      <span className="fm-count" role="status">{t.total - t.open} / {t.total} {L('checked')}{t.fail ? ` · ${t.fail} ${es && t.fail === 1 ? 'no cumple' : L('fail')}` : ''}</span>
    </div>
    <main className="form fm-main" id="main">
      <h2 ref={head} tabIndex={-1}>{L('Site visit')}</h2>
      <p className="lead">{p.site.address || p.name}{p.site.apn ? ` · APN ${p.site.apn}` : ''}</p>
      <p className="lead">{L('Tap a result for each item. Everything saves on this phone as you go and works with no signal.')}</p>
      {!online && <div className="banner" role="status">{L('Offline: everything still works and saves on this phone.')}</div>}
      {(memOnly || storageBlocked()) && <div className="banner warn" role="alert">{L('Photos cannot be stored on this phone (storage is blocked or full). They stay only until this page is closed: save the record now.')}</div>}
      <div className="grid2">
        <div className="field"><label htmlFor="fm-who">{L('Inspector')}</label><input id="fm-who" value={ins.inspector} maxLength={80} autoComplete="name" onChange={e => edit(i => { i.inspector = e.target.value; }, 'fm-who')} /></div>
        <div className="field"><label htmlFor="fm-date">{L('Date of visit')}</label><input id="fm-date" type="date" value={ins.date} max="2100-12-31" onChange={e => edit(i => { i.date = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : today(); }, 'fm-date')} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="fm-permit">{L('Permit number')}</label><input id="fm-permit" value={ins.permit ?? ''} maxLength={40} autoComplete="off" inputMode="text" onChange={e => edit(i => { i.permit = e.target.value.replace(/[^A-Za-z0-9 ./-]/g, '').slice(0, 40); }, 'fm-permit')} /></div>
        <div className="field"><label htmlFor="fm-stage">{L('Inspection stage')}</label><select id="fm-stage" value={ins.stage ?? ''} onChange={e => edit(i => { i.stage = e.target.value as InspStage | ''; })}><option value="">{L('Not set')}</option>{(Object.keys(INSP_STAGES) as InspStage[]).map(k => <option key={k} value={k}>{INSP_STAGES[k][lang]}</option>)}</select></div>
        <div className="field"><label htmlFor="fm-kind">{L('Inspection type')}</label><select id="fm-kind" value={ins.kind ?? ''} onChange={e => edit(i => { i.kind = e.target.value as InspKind | ''; })}><option value="">{L('Not set')}</option>{(Object.keys(INSP_KINDS) as InspKind[]).map(k => <option key={k} value={k}>{INSP_KINDS[k][lang]}</option>)}</select></div>
      </div>
      {ins.tz && <p className="help">{L('Times are recorded in this time zone')}: {ins.tz} ({tzLabel(now(), ins.tz)})</p>}
      <div className="field"><label id="fm-show">{L('Show')}</label>
        <div className="tri fm-tri" role="group" aria-labelledby="fm-show">
          {(['all', 'open', 'fail'] as Show[]).map(s => <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>{s === 'all' ? `${L('All items')} (${t.total})` : s === 'open' ? `${L('Not checked')} (${t.open})` : `${L('Fail')} (${t.fail})`}</button>)}
        </div></div>
      {list.length === 0 && <p className="lead" role="status">{show === 'open' ? L('Every item has a result.') : L('No items failed.')}</p>}
      <ol className="results fm-list">
        {list.map((x, i) => { const r = result(p.inspection, x.id); const g = i === 0 || list[i - 1].group !== x.group ? GROUPS[x.group][lang] : null; const hid = `fm-${x.id}`;
          return <li key={x.id} className={'res fm-item ' + (r.s === 'pass' ? 'PASS' : r.s === 'fail' ? 'FAIL' : r.s === 'na' ? 'NOT_CHECKED' : 'UNKNOWN')}>
            {g && <p className="fm-group">{g}</p>}
            <h3 className="title" id={hid}>{x[lang]}</h3>
            <p className="cite">{[x.sheet.length ? `${es ? 'Lista de correcciones LADBS, punto' : 'LADBS correction list item'} ${x.sheet.join(', ')}` : '', x.code].filter(Boolean).join(' · ')}</p>
            {failsOf(x.id).length > 0 && <p className="pending">{L("The app's checks fail this item")}: {failsOf(x.id).join(' ')}</p>}
            {hints.get(x.id)?.text.length ? <div className="help fm-plan"><strong>{L('From the project')}:</strong> {hints.get(x.id)!.text.join(' · ')}{hints.get(x.id)!.na && r.s == null ? <> <em>{L('This item likely does not apply. Check on site.')}</em></> : null}</div> : null}
            {r.reason && <p className="help">{L(r.s === 'na' ? 'Reason for N/A' : 'Reason for Pass')}: {r.reason}</p>}
            <div className="tri fm-tri fm-result" role="group" aria-labelledby={hid}>
              {(['pass', 'fail', 'na'] as InspStatus[]).map(s => <button key={s} type="button" data-s={s} aria-pressed={r.s === s} onClick={() => { void pick(x.id, s); }}>{s === 'pass' ? L('Pass') : s === 'fail' ? L('Fail') : L('N/A')}</button>)}
            </div>
            <div className="fm-photo">
              {r.photo && <Thumb id={r.photo} alt={`${L('Photo')}: ${x[lang]}`} />}
              <label className="btn fm-big" aria-disabled={busy === x.id}>
                {busy === x.id ? L('Saving photo…') : r.photo ? L('Retake photo') : L('Take a photo')}
                <input className="sr" type="file" accept="image/*" capture="environment" disabled={busy === x.id} aria-describedby={`${hid}-ph`} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void addPhoto(x.id, f); }} />
              </label>
              {r.photo && <button type="button" className="btn quiet fm-big" onClick={() => removePhoto(x.id)}>{L('Remove photo')}</button>}
              <span className="help" id={`${hid}-ph`} role={err[x.id] ? 'alert' : undefined} style={err[x.id] ? { color: 'var(--fix)' } : undefined}>{err[x.id] || L('One photo per item, made smaller on this phone.')}</span>
            </div>
            <div className="field"><label htmlFor={`${hid}-n`}>{L('Note')}</label>
              <textarea id={`${hid}-n`} className="fm-note" rows={2} maxLength={MAX_NOTE} value={r.note} onChange={e => setItem(x.id, q => { q.note = e.target.value; }, 'fm-n' + x.id)} /></div>
          </li>; })}
      </ol>
      <div className="field"><label htmlFor="fm-gen">{L('General notes for this visit')}</label>
        <textarea id="fm-gen" className="fm-note" rows={3} maxLength={MAX_NOTE * 2} value={ins.general} onChange={e => edit(i => { i.general = e.target.value; }, 'fm-gen')} /></div>
      <div className="fm-actions">
        <button type="button" className="btn primary fm-big" disabled={!!busy} onClick={savePDF}>{busy === 'pdf' ? L('Making the record…') : L('Save the visit record (PDF)')}</button>
        <button type="button" className="btn fm-big" disabled={!!busy} onClick={() => { void savePack(); }}>{busy === 'pack' ? L('Making the file…') : L('Save the visit with photos (.permitpack)')}</button>
        <button type="button" className="btn fm-big" disabled={!!busy} onClick={() => { void savePack(true); }}>{L('Save it locked with a passphrase')}</button>
        <button type="button" className="btn quiet fm-big" disabled={!!busy || (t.open === t.total && !ins.general && t.photos === 0)} onClick={clearAll}>{L('Clear the visit')}</button>
      </div>
      <p className="help" role="status">{msg}</p>
    </main>
  </div>;
}
