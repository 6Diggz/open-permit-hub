import { useEffect, useState } from 'react';
import { plainWasmError } from '../out/wasm';
import { cad, CadStopped } from '../out/cadclient';
import { zipSync, strToU8 } from 'fflate';

type Report = { version: string; bytes: number; units: string; units_code: number; entities: number; by_type: Record<string, number>; layers: string[]; fonts: { style: string; font: string; standard: boolean }[]; xrefs: { name: string; path: string; absolute: boolean; fix: string }[]; warnings: string[]; blocking?: string | null; recovered?: boolean };
type LossRow = { group: 'object' | 'data'; type: string; before: number; after: number; status: 'kept' | 'reduced' | 'dropped' | 'added' | 'converted' | 'approximated' | 'changed' | 'dropped_on_read' | 'cleaned'; changed?: number };
export type CleanOp = { id: string; group: string; label: string; before: number; after: number; items?: string[]; note?: string | null; by_type?: Record<string, number>; merged?: number; by_code?: Record<string, number>; samples?: string[]; actions?: string[]; missing_layers?: string[]; fixed?: boolean; inserts_of_missing_blocks?: number };
type Loss = { ok: true; target?: string; cleaned?: Record<string, number>; rows: LossRow[]; ops?: CleanOp[]; notes?: string[]; lost: number; hidden_lost?: number; changed?: number; incomplete?: boolean; best_format?: boolean; converted: boolean; bytes: number } | { ok: false; error: string };
const UNIT_OPTS: [number, string][] = [[-1, 'Keep as is'], [1, 'Inches'], [2, 'Feet'], [4, 'Millimeters'], [5, 'Centimeters'], [6, 'Meters']];
const TARGETS: [string, string][] = [['r2018', 'DXF 2018 (most CAD apps)'], ['r2000', 'DXF 2000 (older CAD apps)'], ['cnc', 'DXF R12 for laser / CNC'], ['dwg', 'DWG 2018 (beta)']];
const STATUS: Record<LossRow['status'], string> = { kept: 'Kept', reduced: 'Some lost', dropped: 'Lost', added: 'New in the copy (converted)', converted: 'Kept, written in another form', approximated: 'Kept as a polyline through the curve (close, not exact)', changed: 'Changed: shape, place or text differs', dropped_on_read: 'Lost: this tool could not read it', cleaned: 'Removed by cleaning (see the cleaning steps)' };
/** The cleaning steps a person can switch on or off (OUT2-13). Off = undone: the copy is made again without it. */
export const STEPS: [keyof Opts, string, string][] = [
  ['purge', 'Purge unused', 'Layers, blocks, line types and text styles that nothing uses. Anything in use is kept.'],
  ['overkill', 'Remove duplicates and overlaps', 'Lines on top of each other are merged into one; exact duplicate circles, arcs and points are removed.'],
  ['zero', 'Remove zero-length objects', 'Lines with no length, circles and arcs with no radius.'],
  ['empty_text', 'Remove empty text', 'Text with nothing in it.'],
  ['audit', 'Audit and fix', 'Checks the file structure and makes the safe repairs (for example, a missing layer).'],
];
export type Opts = { purge: boolean; overkill: boolean; zero: boolean; empty_text: boolean; audit: boolean };
export const ALL_ON: Opts = { purge: true, overkill: true, zero: true, empty_text: true, audit: true };
/** One line per cleaning step: before, after, and how many were removed. */
export function opLine(o: CleanOp): string {
  if (o.id === 'audit') return `${o.before} problem(s) found, ${o.after} left${o.fixed ? ' after fixing' : ''}`;
  const n = o.before - o.after; return `${o.before.toLocaleString()} before, ${o.after.toLocaleString()} after (${n.toLocaleString()} removed${o.merged ? `, ${o.merged} merged` : ''})`;
}
/** Plain-text audit and cleaning report, for the download and the batch ZIP. */
export function reportText(name: string, l: Extract<Loss, { ok: true }>): string {
  const out = [`Clean and Fix report: ${name}`, `Format: ${l.target ?? ''}`, ''];
  for (const n of l.notes ?? []) out.push('NOTE: ' + n);
  out.push('Cleaning steps:'); for (const o of l.ops ?? []) { out.push(`- ${o.label}: ${opLine(o)}`); if (o.note) out.push(`    ${o.note}`); for (const i of o.items ?? []) out.push(`    removed: ${i}`); for (const [k, v] of Object.entries(o.by_type ?? {})) out.push(`    ${k}: ${v}`); for (const [k, v] of Object.entries(o.by_code ?? {})) out.push(`    ${k}: ${v}`); for (const x of o.samples ?? []) out.push(`    found: ${x}`); for (const x of o.actions ?? []) out.push(`    fixed: ${x}`); }
  out.push('', lossHeadline(l).text, '', 'Type\tIn your file\tIn the copy\tResult');
  for (const r of l.rows) out.push(`${r.type}\t${r.before}\t${r.after}\t${STATUS[r.status]}`);
  return out.join('\n') + '\n';
}
/** The loss headline: only things you can see count; a cut-off file has an unknown loss; the format hint shows only when another format keeps more. */
export type LossOk = Extract<Loss, { ok: true }>;
export function lossHeadline(l: LossOk): { text: string; mustAccept: boolean } {
  const changed = l.changed ?? 0; const parts: string[] = [];
  if (l.incomplete) parts.push('This file is cut off, so the loss is unknown: anything after the cut is missing and can\'t be counted.');
  if (l.lost > 0) parts.push(`${l.lost.toLocaleString()} drawing object(s) will not be in the clean copy.`);
  if (changed > 0) parts.push(`${changed.toLocaleString()} object(s) come out with a different shape, place or text.`);
  if (!parts.length) parts.push(l.converted ? 'Nothing you can see is lost. Some objects are written in another form.' : 'Nothing is lost in this format.');
  if ((l.hidden_lost ?? 0) > 0) parts.push(`${l.hidden_lost!.toLocaleString()} hidden data item(s) (app settings, not drawing objects) are not kept.`);
  if (l.best_format === false && (l.lost > 0 || changed > 0)) parts.push('DXF 2018 keeps more.');
  return { text: parts.join(' '), mustAccept: !!l.incomplete || l.lost > 0 || changed > 0 };
}

const useBusy = () => { const [busy, setBusy] = useState(''); const [secs, setSecs] = useState(0);
  useEffect(() => { if (!busy) return; const s = Date.now(); setSecs(0); const i = window.setInterval(() => setSecs(Math.round((Date.now() - s) / 1000)), 1000); return () => clearInterval(i); }, [busy]);
  return { busy, setBusy, secs }; };
const errText = (e: unknown) => e instanceof CadStopped ? e.message : plainWasmError(e);
function download(name: string, data: Uint8Array | string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart])); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000) /* r4reach-06: iOS reads the blob only after the user taps Download */;
}
const cleanName = (n: string, target: string) => n.replace(/\.(dwg|dxf)$/i, '') + `-clean-${target}.${target === 'dwg' ? 'dwg' : 'dxf'}`;
type BatchRow = { name: string; status: string; ok: boolean };

export function CleanFix({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [rep, setRep] = useState<Report | null>(null); const [err, setErr] = useState(''); const { busy, setBusy, secs } = useBusy();
  const [target, setTarget] = useState('r2018'); const [units, setUnits] = useState(-1);
  const [loss, setLoss] = useState<Loss | null>(null); const [accept, setAccept] = useState(false);
  const [opts, setOpts] = useState<Opts>(ALL_ON); const [hist, setHist] = useState<Opts[]>([]);
  const [batch, setBatch] = useState<File[] | null>(null); const [rows, setRows] = useState<BatchRow[]>([]); const [takeLossy, setTakeLossy] = useState(false);
  const open = async (f: File) => {
    setErr(''); setRep(null); setLoss(null); setBatch(null); setRows([]); setBusy('Reading the file...');
    try { if (f.size > 80 * 1024 * 1024) throw new Error('This file is over 80 MB. Open it on a desktop computer.'); const bytes = new Uint8Array(await f.arrayBuffer());
      const r = await cad().run({ op: 'inspect', bytes }); setRep(JSON.parse(r.text!)); setFile({ name: f.name, bytes }); }
    catch (e) { setErr(errText(e)); } setBusy('');
  };
  /** Clean in memory, read the copy back, and count what each format keeps, before anything is saved. */
  const check = async (t = target, u = units, o = opts) => {
    if (!file) return; setBusy('Checking the clean copy...'); setErr(''); setAccept(false);
    try { const r = await cad().run({ op: 'loss', bytes: file.bytes, target: t, units: u, opts: JSON.stringify(o) }); setLoss(JSON.parse(r.text!)); } catch (e) { setLoss({ ok: false, error: errText(e) }); } setBusy('');
  };
  /** Switch a cleaning step; the copy is checked again so the counts are always for what will be saved. */
  const setStep = (next: Opts) => { setHist(h => [...h, opts]); setOpts(next); if (loss) check(target, units, next); };
  const undo = () => { const prev = hist[hist.length - 1]; if (!prev) return; setHist(h => h.slice(0, -1)); setOpts(prev); if (loss) check(target, units, prev); };
  const save = async () => {
    if (!file) return; setBusy('Writing the clean copy...'); setErr('');
    try { const r = await cad().run({ op: 'clean', bytes: file.bytes, target, units, opts: JSON.stringify(opts) }); const out = r.bytes!; if (!out.length) throw new Error('The clean copy came out empty, so it was not saved.');
      download(cleanName(file.name, target), out); }
    catch (e) { setErr(errText(e)); } setBusy('');
  };
  /** Batch: clean every file with the same steps and format, and save one ZIP with the copies and a report. */
  const runBatch = async () => {
    if (!batch) return; setErr(''); const zip: Record<string, Uint8Array> = {}; const out: BatchRow[] = []; const csv = ['file,result,objects lost,objects changed,notes'];
    for (let i = 0; i < batch.length; i++) {
      const f = batch[i]; setBusy(`Cleaning ${i + 1} of ${batch.length}: ${f.name}`);
      let row: BatchRow;
      try {
        if (f.size > 80 * 1024 * 1024) throw new Error('Over 80 MB: open it on a desktop computer.');
        const bytes = new Uint8Array(await f.arrayBuffer()); const o = JSON.stringify(opts);
        const l: Loss = JSON.parse((await cad().run({ op: 'loss', bytes, target, units, opts: o })).text!);
        if (!l.ok) throw new Error(l.error);
        const h = lossHeadline(l);
        if (h.mustAccept && !takeLossy) { row = { name: f.name, ok: false, status: 'Skipped: ' + h.text }; }
        else { const c = (await cad().run({ op: 'clean', bytes, target, units, opts: o })).bytes!; zip[cleanName(f.name, target)] = c; zip['reports/' + f.name + '.txt'] = strToU8(reportText(f.name, l)); row = { name: f.name, ok: true, status: h.text }; }
        csv.push([f.name, row.ok ? 'cleaned' : 'skipped', l.lost, l.changed ?? 0, h.text].map(x => '"' + String(x).replaceAll('"', '""') + '"').join(','));
      } catch (e) {
        if (e instanceof CadStopped && e.reason === 'cancel') { out.push({ name: f.name, ok: false, status: e.message }); setRows([...out]); setBusy(''); return; }
        row = { name: f.name, ok: false, status: 'Not cleaned: ' + errText(e) }; csv.push(['"' + f.name.replaceAll('"', '""') + '"', 'failed', '', '', '"' + row.status.replaceAll('"', '""') + '"'].join(','));
      }
      out.push(row); setRows([...out]);
    }
    zip['report.csv'] = strToU8(csv.join('\n') + '\n');
    if (out.some(r => r.ok)) download(`clean-and-fix-${batch.length}-files.zip`, zipSync(zip));
    setBusy('');
  };
  const pick = (fs: File[]) => { if (fs.length === 1) { open(fs[0]); return; } setFile(null); setRep(null); setLoss(null); setRows([]); setErr(''); setBatch(fs); };
  const lostRows = loss?.ok ? loss.rows.filter(r => r.status !== 'kept' && r.group === 'object') : [];
  const hiddenRows = loss?.ok ? loss.rows.filter(r => r.status !== 'kept' && r.group === 'data') : [];
  const head = loss?.ok ? lossHeadline(loss) : null;
  const mustAccept = !!head?.mustAccept;
  const canSave = !busy && !rep?.blocking && !!loss?.ok && (!mustAccept || accept);
  return <main className="welcome" id="main" style={{ maxWidth: 860 }}>
    <button className="btn quiet" onClick={onBack} style={{ marginBottom: 24 }}>Back</button>
    <h1>Clean and fix a CAD file.</h1>
    <p>Open any DWG or DXF. See what will break when you send it, then save a clean copy. Your original is never changed, and the file never leaves this device.</p>
    <label className="btn primary" style={{ display: 'inline-block', marginTop: 12 }}>Open a DWG or DXF
      <input className="sr" type="file" multiple accept=".dwg,.dxf,application/octet-stream" onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) pick(fs); }} /></label>
    <p className="help">Pick several files at once to clean them all and save one ZIP.</p>
    {busy && <p role="status">{busy} {secs > 0 && `${secs} s`} <button className="btn quiet" onClick={() => cad().cancel()}>Cancel</button></p>}
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
        <div className="field"><label htmlFor="tgt">Format</label><select id="tgt" value={target} onChange={e => { setTarget(e.target.value); setLoss(null); }}>{TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{target === 'dwg' && <span className="help">DWG writing is new. In our test on 271 public sample drawings, a DWG copy kept every drawing object in 85% of files (DXF 2018: 89%). Some drawings can't be written yet; DXF 2018 is the safe choice.</span>}</div>
        <div className="field"><label htmlFor="un">Units</label><select id="un" value={units} onChange={e => { setUnits(Number(e.target.value)); setLoss(null); }}>{UNIT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><span className="help">Only changes the label, not the geometry. Set it when the file says "Unitless".</span></div>
      </div>
      <fieldset className="mods" style={{ border: 0, padding: 0 }}><legend><strong>Cleaning steps</strong></legend>
        {STEPS.map(([k, l, help]) => <label key={k} style={{ display: 'block' }}><input type="checkbox" checked={opts[k]} disabled={!!busy} onChange={e => setStep({ ...opts, [k]: e.target.checked })} /> {l} <span className="help">{help}</span></label>)}
        <button className="btn quiet" disabled={!hist.length || !!busy} onClick={undo}>Undo last change</button>
      </fieldset>
      <p><button className="btn" disabled={!!busy || !!rep.blocking} onClick={() => check()}>Check what will be lost</button></p>
      {loss && !loss.ok && <p role="alert" style={{ color: 'var(--fix)' }}>{loss.error}</p>}
      {loss?.ok && (loss.ops?.length ?? 0) > 0 && <section aria-label="Cleaning steps result"><h3>What cleaning does</h3>
        <table className="take"><thead><tr><th>Step</th><th>Before</th><th>After</th><th>Result</th></tr></thead><tbody>{loss.ops!.map(o => <tr key={o.id}><td>{o.label}</td><td className="q">{o.before}</td><td className="q">{o.after}</td><td>{opLine(o)}{o.note && <><br />{o.note}</>}{(o.items?.length ?? 0) > 0 && <details><summary>Removed ({o.items!.length})</summary>{o.items!.join(', ')}</details>}{(o.samples?.length ?? 0) > 0 && <details><summary>Problems found</summary><ul>{o.samples!.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}</td></tr>)}</tbody></table>
        <p><button className="btn quiet" onClick={() => download((file?.name ?? 'drawing') + '-clean-report.txt', reportText(file?.name ?? '', loss))}>Download the report</button></p></section>}
      {loss?.ok && <section aria-label="What will be lost" aria-live="polite">
        {lostRows.length === 0 && hiddenRows.length === 0 && !mustAccept ? <p className="res PASS" style={{ padding: 12 }}>Nothing is lost in this format. Every object type is kept.</p> : <>
          <p className={'res ' + (mustAccept ? 'FAIL' : 'UNKNOWN')} style={{ padding: 12 }}>{head!.text}</p>
          {lostRows.length > 0 && <><h3>Things you can see</h3><table className="take"><thead><tr><th>Type</th><th>In your file</th><th>In the copy</th><th>Result</th></tr></thead>
            <tbody>{lostRows.map(r => <tr key={r.group + r.type}><td>{r.type}</td><td className="q">{r.before}</td><td className="q">{r.after}</td><td>{STATUS[r.status]}</td></tr>)}</tbody></table></>}
          {hiddenRows.length > 0 && <details><summary>Hidden drawing data ({hiddenRows.length})</summary><table className="take"><thead><tr><th>Type</th><th>In your file</th><th>In the copy</th><th>Result</th></tr></thead>
            <tbody>{hiddenRows.map(r => <tr key={r.group + r.type}><td>{r.type}</td><td className="q">{r.before}</td><td className="q">{r.after}</td><td>{STATUS[r.status]}</td></tr>)}</tbody></table></details>}
          {mustAccept && <div className="mods"><label><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} /> I understand these will not be in the copy.</label></div>}
        </>}
      </section>}
      <p><button className="btn primary" disabled={!canSave} onClick={save}>Save clean copy</button>{!loss && !rep.blocking && <span className="help"> Check what will be lost first.</span>}</p>
      <p className="help" style={{ color: 'var(--pencil)' }}>Clean copy: the cleaning steps you picked, reference paths made relative, units label set, saved in the format you picked. Your original file is never changed. Uses acadrust (MPL-2.0, <a href="./THIRD_PARTY_NOTICES.txt">notices and source</a>). Check the copy in your CAD app before you send it.</p>
    </section>}
    {batch && <section aria-label="Clean many files" style={{ marginTop: 24 }}>
      <h2>Clean {batch.length} files</h2>
      <div className="grid2">
        <div className="field"><label htmlFor="btgt">Format</label><select id="btgt" value={target} onChange={e => setTarget(e.target.value)}>{TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="bun">Units</label><select id="bun" value={units} onChange={e => setUnits(Number(e.target.value))}>{UNIT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <fieldset className="mods" style={{ border: 0, padding: 0 }}><legend><strong>Cleaning steps</strong></legend>
        {STEPS.map(([k, l]) => <label key={k} style={{ display: 'block' }}><input type="checkbox" checked={opts[k]} disabled={!!busy} onChange={e => setOpts({ ...opts, [k]: e.target.checked })} /> {l}</label>)}
        <label style={{ display: 'block' }}><input type="checkbox" checked={takeLossy} onChange={e => setTakeLossy(e.target.checked)} /> Also save copies that lose objects (each loss is in the report)</label>
      </fieldset>
      <p><button className="btn primary" disabled={!!busy} onClick={runBatch}>Clean all and save a ZIP</button></p>
      {rows.length > 0 && <table className="take"><thead><tr><th>File</th><th>Result</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.ok ? 'Cleaned. ' : ''}{r.status}</td></tr>)}</tbody></table>}
    </section>}
  </main>;
}
