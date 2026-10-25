import { useState } from 'react';
import { cleanfix, plainWasmError } from '../out/wasm';

type Report = { version: string; bytes: number; units: string; units_code: number; entities: number; by_type: Record<string, number>; layers: string[]; fonts: { style: string; font: string; standard: boolean }[]; xrefs: { name: string; path: string; absolute: boolean; fix: string }[]; warnings: string[]; blocking?: string | null; recovered?: boolean };
type LossRow = { group: 'object' | 'data'; type: string; before: number; after: number; status: 'kept' | 'reduced' | 'dropped' | 'added' };
type Loss = { ok: true; rows: LossRow[]; lost: number; converted: boolean; bytes: number } | { ok: false; error: string };
const UNIT_OPTS: [number, string][] = [[-1, 'Keep as is'], [1, 'Inches'], [2, 'Feet'], [4, 'Millimeters'], [5, 'Centimeters'], [6, 'Meters']];
const TARGETS: [string, string][] = [['r2018', 'DXF 2018 (most CAD apps)'], ['r2000', 'DXF 2000 (older CAD apps)'], ['cnc', 'DXF R12 for laser / CNC'], ['dwg', 'DWG 2018 (beta)']];
const STATUS: Record<LossRow['status'], string> = { kept: 'Kept', reduced: 'Some lost', dropped: 'Lost', added: 'New in the copy (converted)' };

export function CleanFix({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [rep, setRep] = useState<Report | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('r2018'); const [units, setUnits] = useState(-1);
  const [loss, setLoss] = useState<Loss | null>(null); const [accept, setAccept] = useState(false);
  const open = async (f: File) => {
    setErr(''); setRep(null); setLoss(null); setBusy(true);
    try { if (f.size > 80 * 1024 * 1024) throw new Error('This file is over 80 MB. Open it on a desktop computer.'); const bytes = new Uint8Array(await f.arrayBuffer()); const m = await cleanfix(); setRep(JSON.parse(m.inspect(bytes))); setFile({ name: f.name, bytes }); }
    catch (e) { setErr(plainWasmError(e)); } setBusy(false);
  };
  /** Clean in memory, read the copy back, and count what each format keeps, before anything is saved. */
  const check = async (t = target, u = units) => {
    if (!file) return; setBusy(true); setErr(''); setAccept(false);
    try { const m = await cleanfix(); setLoss(JSON.parse(m.loss(file.bytes, t, u))); } catch (e) { setLoss({ ok: false, error: plainWasmError(e) }); } setBusy(false);
  };
  const save = async () => {
    if (!file) return; setBusy(true); setErr('');
    try { const m = await cleanfix(); const out = m.clean(file.bytes, target, units); if (!out.length) throw new Error('The clean copy came out empty, so it was not saved.'); const ext = target === 'dwg' ? 'dwg' : 'dxf';
      const url = URL.createObjectURL(new Blob([out as BlobPart])); const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.(dwg|dxf)$/i, '') + `-clean-${target}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    catch (e) { setErr(plainWasmError(e)); } setBusy(false);
  };
  const lostRows = loss?.ok ? loss.rows.filter(r => r.status !== 'kept') : [];
  const mustAccept = !!loss?.ok && loss.lost > 0;
  const canSave = !busy && !rep?.blocking && !!loss?.ok && (!mustAccept || accept);
  return <main className="welcome" id="main" style={{ maxWidth: 860 }}>
    <button className="btn quiet" onClick={onBack} style={{ marginBottom: 24 }}>Back</button>
    <h1>Clean and fix a CAD file.</h1>
    <p>Open any DWG or DXF. See what will break when you send it, then save a clean copy. Your original is never changed, and the file never leaves this device.</p>
    <label className="btn primary" style={{ display: 'inline-block', marginTop: 12 }}>Open a DWG or DXF
      <input className="sr" type="file" accept=".dwg,.dxf" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) open(f); }} /></label>
    {busy && <p role="status">Working...</p>}
    {err && <p role="alert" style={{ color: 'var(--fix)' }}>{err}</p>}
    {rep && file && <section aria-label="File report" style={{ marginTop: 24 }}>
      <h2 style={{ marginBottom: 4 }}>{file.name}</h2>
      <p style={{ marginTop: 0 }}>{rep.version} · {(rep.bytes / 1024).toFixed(0)} KB · {rep.entities.toLocaleString()} objects · units: <strong>{rep.units}</strong> · {rep.layers.length} layers</p>
      {rep.blocking && <p role="alert" className="res FAIL" style={{ padding: 12 }}>{rep.blocking}</p>}
      {rep.warnings.length ? <ul className="results" style={{ padding: 0 }}>{rep.warnings.filter(w => w !== rep.blocking).map(w => <li key={w} className="res UNKNOWN"><div className="head"><span className="tag">Check</span></div><p>{w}</p></li>)}</ul> : <p className="res PASS" style={{ padding: 12 }}>No problems found.</p>}
      <h2>Fonts</h2>
      <table className="take"><thead><tr><th>Style</th><th>Font</th><th>Others will see it?</th></tr></thead><tbody>{rep.fonts.map(f => <tr key={f.style}><td>{f.style.startsWith('{') ? '(hidden style)' : f.style}</td><td>{f.font || '(default)'}</td><td>{f.standard ? 'Yes' : 'Maybe not: substituted'}</td></tr>)}</tbody></table>
      {rep.xrefs.length > 0 && <><h2>References to other files</h2><table className="take"><tbody>{rep.xrefs.map(x => <tr key={x.name}><td>{x.name}</td><td>{x.path}</td><td>{x.fix}</td></tr>)}</tbody></table></>}
      <h2>What's inside</h2>
      <p>{Object.entries(rep.by_type).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
      <h2>Save a clean copy</h2>
      <div className="grid2">
        <div className="field"><label htmlFor="tgt">Format</label><select id="tgt" value={target} onChange={e => { setTarget(e.target.value); setLoss(null); }}>{TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{target === 'dwg' && <span className="help">DWG writing is new. Some drawings can't be written yet; DXF 2018 is the safe choice.</span>}</div>
        <div className="field"><label htmlFor="un">Units</label><select id="un" value={units} onChange={e => { setUnits(Number(e.target.value)); setLoss(null); }}>{UNIT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><span className="help">Only changes the label, not the geometry. Set it when the file says "Unitless".</span></div>
      </div>
      <p><button className="btn" disabled={busy || !!rep.blocking} onClick={() => check()}>Check what will be lost</button></p>
      {loss && !loss.ok && <p role="alert" style={{ color: 'var(--fix)' }}>{loss.error}</p>}
      {loss?.ok && <section aria-label="What will be lost" aria-live="polite">
        {lostRows.length === 0 ? <p className="res PASS" style={{ padding: 12 }}>Nothing is lost in this format. Every object type is kept.</p> : <>
          <p className={'res ' + (mustAccept ? 'FAIL' : 'UNKNOWN')} style={{ padding: 12 }}>{mustAccept ? `${loss.lost.toLocaleString()} item(s) will not be in the clean copy.` : 'Some objects are converted to other types.'} Pick DXF 2018 to keep more.</p>
          <table className="take"><thead><tr><th>What</th><th>Type</th><th>In your file</th><th>In the copy</th><th>Result</th></tr></thead>
            <tbody>{lostRows.map(r => <tr key={r.group + r.type}><td>{r.group === 'object' ? 'Drawing object' : 'Drawing data'}</td><td>{r.type}</td><td className="q">{r.before}</td><td className="q">{r.after}</td><td>{STATUS[r.status]}</td></tr>)}</tbody></table>
          {mustAccept && <div className="mods"><label><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} /> I understand these will not be in the copy.</label></div>}
        </>}
      </section>}
      <p><button className="btn primary" disabled={!canSave} onClick={save}>Save clean copy</button>{!loss && !rep.blocking && <span className="help"> Check what will be lost first.</span>}</p>
      <p className="help" style={{ color: 'var(--pencil)' }}>Clean copy: reference paths made relative, units label set, saved in the format you picked. Uses acadrust (MPL-2.0, <a href="./THIRD_PARTY_NOTICES.txt">notices and source</a>). Check the copy in your CAD app before you send it.</p>
    </section>}
  </main>;
}
