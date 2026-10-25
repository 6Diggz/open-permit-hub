import { useEffect, useMemo, useRef, useState } from 'react';
import { blankProject, demoProject, isDemo, MODULES, SAFETY_MODULES, type Project, type Tri, type Window } from '../core/model';
import { History } from '../core/undo';
import { evaluate, exportBlockers, type Report, type Result } from '../rules/engine';
import { RULES, PACK_ID } from '../rules/la-city';
import { bbox, rect, translate } from '../core/geom';
import { fmtFtIn, fmtSqFt, ft, parseLength, toFt } from '../core/units';
import { area } from '../core/geom';
import { Plan } from './Plan';
import { CleanFix } from './CleanFix';
import { autoFit } from '../rules/fit';
import { tr, type Lang } from './i18n';
import { ES } from './es';
let LANG: Lang = 'en';
const L = (en: string) => (LANG === 'es' ? (ES as Record<string, string>)[en] ?? en : en);
import { encryptPack, migrate, openPack, serialize } from '../core/permitpack';
import { takeoff, takeoffCSV } from '../out/takeoff';
import { fromGLTF, fromRoomPlanJSON, tapeCheck } from '../io/scan';

const KEY = 'opa.project.v1';
let loadError = '';
const load = (): Project | null => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try { return migrate(JSON.parse(raw)); }
  catch (e) { loadError = (e as Error).message; try { localStorage.setItem(KEY + '.broken', raw); localStorage.removeItem(KEY); } catch { /* blocked */ } return null; }
};
const persist = (p: Project) => { try { localStorage.setItem(KEY, serialize(p)); return true; } catch { return false; } };
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const slug = (p: Project) => (p.site.address || p.name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'project';

export default function App() {
  const hist = useRef<History<Project> | null>(null); const dragStart = useRef<Project | null>(null);
  const [p, setP] = useState<Project | null>(load);
  const [step, setStep] = useState(0);
  const [tool, setTool] = useState<'adu' | 'clean'>(location.hash === '#clean' ? 'clean' : 'adu');
  const [lang, setLang] = useState<Lang>(() => (p?.people.language ?? (navigator.language?.startsWith('es') ? 'es' : 'en')));
  const [savedOk, setSavedOk] = useState(true);
  if (p && !hist.current) hist.current = new History(p);
  LANG = lang;

  useEffect(() => { if (p) setSavedOk(persist(p)); }, [p]);
  useEffect(() => { navigator.storage?.persist?.().catch(() => {}); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const report: Report | null = useMemo(() => (p ? evaluate(p, RULES, PACK_ID) : null), [p]);
  const commit = (next: Project) => { hist.current!.push(next); setP(next); };
  const update = (fn: (d: Project) => void) => { const d: Project = structuredClone(p!); fn(d); commit(d); };
  const undo = () => { if (hist.current?.undo()) setP(hist.current.present); };
  const redo = () => { if (hist.current?.redo()) setP(hist.current.present); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  if (tool === 'clean') return <CleanFix onBack={() => setTool('adu')} />;
  if (!p || !report) return <Welcome onClean={() => setTool('clean')} lang={lang} setLang={setLang} onStart={(d) => { const x = d ? demoProject() : blankProject(); x.people.language = lang; if (!d && lang === 'es') x.name = 'Mi conversión de garaje'; hist.current = new History(x); setP(x); setStep(0); }} onOpen={x => { hist.current = new History(x); setP(x); setStep(3); }} />;

  const steps: string[] = tr(lang, 'steps');
  const stepDot = (i: number) => { const mod = [['core', 'zoning', 'hazards'], ['zoning', 'fire', 'structural', 'fees'], ['egress'], [], []][i]; const rs = report.results.filter(r => mod.includes(r.rule.module)); return rs.some(r => r.status === 'FAIL') ? 'var(--fix)' : rs.some(r => r.status === 'UNKNOWN') ? 'var(--info-need)' : rs.some(r => r.status === 'NOT_CHECKED') ? 'var(--off)' : rs.some(r => r.status === 'PASS') ? 'var(--pass)' : 'transparent'; };

  return (
    <div className="app">
      <nav className="rail" aria-label={L("Steps")}>
        <p className="brand">{tr(lang, 'app')}</p>
        <p className="brand-sub">LA City · {PACK_ID.split('@')[1]}</p>
        {steps.map((s, i) => (
          <button key={s} className="step" aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}>
            <span className="n" aria-hidden>{i + 1}</span>{s}<span className="dot" style={{ background: stepDot(i) }} aria-hidden />
          </button>
        ))}
        <div className="rail-foot">
          <span>{savedOk ? tr(lang, 'saved') : L("Not saved: storage is blocked. Export a backup.")}</span>
          <button className="btn quiet" onClick={() => { if (confirm('Close this project? It stays saved on this device until you start a new one.')) { setP(null); hist.current = null; } }}>{L("Close project")}</button>
        </div>
      </nav>

      <main className="main" id="main">
        <div className="toolbar">
          <strong>{p.name}</strong>{isDemo(p) && <span className="res tag" style={{ background: 'var(--off)', color: '#fff', padding: '2px 6px' }}>{L("Demo")}</span>}
          <span className="grow" />
          <button className="btn quiet" onClick={undo} disabled={!hist.current?.canUndo}>{tr(lang, 'undo')}</button>
          <button className="btn quiet" onClick={redo} disabled={!hist.current?.canRedo}>{tr(lang, 'redo')}</button>
          <label className="sr" htmlFor="lang">{L("Language")}</label>
          <select id="lang" className="btn quiet" value={lang} onChange={e => { const l = e.target.value as Lang; setLang(l); update(d => { d.people.language = l; }); }}>
            <option value="en">{L("English")}</option><option value="es">{L("Espa\u00f1ol")}</option>
          </select>
        </div>
        {p.site.flags.fireRebuild === 'yes' && <div className="banner warn">{L("This lot is in a 2025 burn area. Use the official rebuild path. Automatic passes are off.")}</div>}
        <div className="drawing">
          <Plan p={p} es={lang === 'es'} onMove={(dx, dy, c) => {
            const moved = (base: Project) => ({ ...base, adu: { ...base.adu, footprint: translate(base.adu.footprint, dx, dy) } });
            if (!c) { if (!dragStart.current) dragStart.current = p; setP(moved(p)); return; }
            if (dragStart.current) { const start = dragStart.current; dragStart.current = null; hist.current!.present = start; commit({ ...p, confirmed: { ...p.confirmed, adu: true } }); return; }
            if (dx || dy) commit({ ...moved(p), confirmed: { ...p.confirmed, adu: true } });
          }} />
          <span className="hint">{L("Drag the ADU, or select it and use arrow keys. Shaded band = 4 ft side/rear setback.")}</span>
        </div>
        <div className="form">
          {step === 0 && <LotStep p={p} update={update} lang={lang} />}
          {step === 1 && <GarageStep p={p} update={update} />}
          {step === 2 && <RoomsStep p={p} update={update} />}
          {step === 3 && <ChecksStep p={p} update={update} report={report} lang={lang} />}
          {step === 4 && <ExportStep p={p} update={update} report={report} lang={lang} />}
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <button className="btn quiet" onClick={() => setStep(step - 1)}>{tr(lang, 'back')}</button>}
            {step < 4 && <button className="btn primary" onClick={() => setStep(step + 1)}>{tr(lang, 'next')}: {steps[step + 1]}</button>}
          </div>
        </div>
      </main>

      <aside className="side" aria-label={L("Check results")}>
        <InspectionCard report={report} lang={lang} />
        <ResultList results={report.results} lang={lang} />
      </aside>
    </div>
  );
}

function Welcome({ lang, setLang, onStart, onOpen, onClean }: { onClean: () => void; lang: Lang; setLang: (l: Lang) => void; onStart: (demo: boolean) => void; onOpen: (p: Project) => void }) {
  const [err, setErr] = useState('');
  const sample = evaluate(demoProject(), RULES, PACK_ID);
  return (
    <div className="welcome-grid"><div className="welcome">
      <button className="btn quiet" style={{ marginBottom: 28 }} onClick={() => setLang(lang === 'en' ? 'es' : 'en')}>{lang === 'en' ? 'Español' : 'English'}</button>
      <h1>{lang === 'es' ? 'Su garaje, revisado contra las reglas de LA.' : 'Your garage, checked against LA\'s rules.'}</h1>
      <p>{tr(lang, 'tagline')}</p>
      <p>{lang === 'es' ? 'Gratis. Funciona en su dispositivo. No necesita cuenta. No es una aprobación de la ciudad.' : 'Free. Runs on your device. No account. Not a city approval.'}</p>
      <div className="row">
        <button className="btn primary" onClick={() => onStart(false)}>{tr(lang, 'start')}</button>
        <button className="btn" onClick={() => onStart(true)}>{tr(lang, 'demo')}</button>
        <label className="btn quiet">{lang === 'es' ? 'Abrir un archivo' : 'Open a saved pack'}
          <input type="file" accept=".permitpack,.json" className="sr" onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return; const text = await f.text();
            try { let pass: string | undefined; if (text.includes('permitpack-encrypted')) pass = prompt('This pack is locked. Passphrase:') ?? undefined; onOpen(await openPack(text, pass)); } catch (x) { setErr((x as Error).message); }
          }} />
        </label>
      </div>
      <p style={{ marginTop: 28 }}><button className="btn quiet" onClick={onClean}>{lang === 'es' ? 'Para dibujantes: limpiar un archivo DWG o DXF' : 'For drafters: clean and fix a DWG or DXF file'}</button></p>
      {(err || loadError) && <p role="alert" style={{ color: 'var(--fix)' }}>{err || `We couldn't open your saved project (${loadError}). A raw copy was kept in this browser; open a backup file instead.`}</p>}
    </div>
    <div className="sample" aria-label={L("Example result from the demo lot")}><InspectionCard report={sample} lang={lang} /><ResultList results={sample.results.filter(r => r.status === 'FAIL').slice(0, 1)} lang={lang} /></div>
    </div>
  );
}

function TriPick({ id, value, onChange, lang = 'en' as Lang }: { id: string; value: Tri; onChange: (v: Tri) => void; lang?: Lang }) {
  return <div className="tri" role="group" aria-labelledby={id}>{(['yes', 'no', 'unknown'] as Tri[]).map(v => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{tr(LANG ?? lang, v)}</button>)}</div>;
}
function Q({ id, label, help, value, onChange }: { id: string; label: string; help?: string; value: Tri; onChange: (v: Tri) => void }) {
  return <div className="field"><label id={id}>{label}</label><TriPick id={id} value={value} onChange={onChange} />{help && <span className="help">{help}</span>}</div>;
}
function Len({ id, label, help, mm, onChange, allowZero }: { id: string; label: string; help?: string; mm: number | null; onChange: (mm: number | null) => void; allowZero?: boolean }) {
  const [txt, setTxt] = useState(mm == null ? '' : fmtFtIn(mm)); const [bad, setBad] = useState(false);
  useEffect(() => { setTxt(mm == null ? '' : fmtFtIn(mm)); }, [mm]);
  return <div className="field"><label htmlFor={id}>{label}</label>
    <input id={id} value={txt} inputMode="text" aria-invalid={bad} aria-describedby={id + '-h'} onChange={e => setTxt(e.target.value)}
      onBlur={() => { if (!txt.trim()) { setBad(false); onChange(null); return; } const v = parseLength(txt); const ok = v != null && (allowZero ? v >= 0 : v > 0); setBad(!ok); if (ok) onChange(v); }} />
    <span className="help" id={id + '-h'}>{bad && /^-|^0+(\.0*)?$/.test(txt.trim()) ? L('Enter a size greater than zero.') : bad ? L("Try a format like 20' 6\", 20-6, 20.5 or 6.25m.") : help ?? L("Feet and inches, like 20' 6\"")}</span></div>;
}
function Num({ id, label, help, value, onChange, min = 0 }: { id: string; label: string; help?: string; value: number | null; onChange: (n: number | null) => void; min?: number }) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type="number" min={min} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Math.max(min, Number(e.target.value)))} />{help && <span className="help">{help}</span>}</div>;
}

type U = (fn: (d: Project) => void) => void;

function LotStep({ p, update }: { p: Project; update: U; lang: Lang }) {
  const lb = bbox(p.site.lot), hb = bbox(p.site.primary); const f = p.site.flags;
  const zimas = `https://zimas.lacity.org/?address=${encodeURIComponent(p.site.address)}`;
  const setLot = (w: number | null, dpt: number | null) => update(d => { d.confirmed.lot = true; const W = w ?? lb.maxX - lb.minX, D = dpt ?? lb.maxY - lb.minY; d.site.lot = rect(0, 0, W, D); });
  return <>
    <h2>{L("The lot")}</h2>
    <p className="lead">{L("Enter the address, then check the parcel in ZIMAS. It's the city's free map, and it answers most of the questions below.")}</p>
    <div className="grid2">
      <div className="field"><label htmlFor="addr">{L("Street address")}</label><input id="addr" value={p.site.address} onChange={e => update(d => { d.site.address = e.target.value; })} autoComplete="street-address" /><span className="help">{p.site.address ? <a href={zimas} target="_blank" rel="noreferrer">{L("Open this address in ZIMAS")}</a> : L("Used only on your sheets. It stays on this device.")}</span></div>
      <div className="field"><label htmlFor="apn">{L("Parcel number (APN)")}</label><input id="apn" value={p.site.apn} onChange={e => update(d => { d.site.apn = e.target.value; })} placeholder="1234-567-890" /><span className="help">{L("The 10-digit number on your property tax bill.")}</span></div>
      <div className="field"><label htmlFor="jur">{L("City")}</label><select id="jur" value={p.site.jurisdiction} onChange={e => update(d => { d.site.jurisdiction = e.target.value as Project['site']['jurisdiction']; })}>
        <option value="unknown">{L("Not sure yet")}</option><option value="la-city">{L("City of Los Angeles")}</option><option value="la-county">{L("Unincorporated LA County")}</option><option value="other">{L("Another city")}</option></select>
        <span className="help">{L("Glendale, Santa Monica and others are separate cities with their own rules.")}</span></div>
    </div>
    <div className="grid2">
      <Len id="lw" label={L("Lot width (street side)")} mm={lb.maxX - lb.minX} onChange={v => setLot(v, null)} />
      <Len id="ld" label={L("Lot depth")} mm={lb.maxY - lb.minY} onChange={v => setLot(null, v)} />
      <Len id="err" label={L("How sure are the lot lines?")} mm={p.site.lotUncertaintyMm} onChange={v => update(d => { d.site.lotUncertaintyMm = v ?? ft(2); })} help={L("County maps can be off by a couple of feet. A survey makes this 0.")} />
    </div>
    <div className="grid2">
      <Len id="hw" label={L("House width")} mm={hb.maxX - hb.minX} onChange={v => update(d => { d.confirmed.house = true; d.site.primary = rect(hb.minX, hb.minY, v ?? hb.maxX - hb.minX, hb.maxY - hb.minY); })} />
      <Len id="hd" label={L("House depth")} mm={hb.maxY - hb.minY} onChange={v => update(d => { d.confirmed.house = true; d.site.primary = rect(hb.minX, hb.minY, hb.maxX - hb.minX, v ?? hb.maxY - hb.minY); })} />
      <Len id="hy" label={L("House distance from street line")} mm={hb.minY} onChange={v => update(d => { d.confirmed.house = true; d.site.primary = rect(hb.minX, v ?? hb.minY, hb.maxX - hb.minX, hb.maxY - hb.minY); })} />
    </div>
    <h2>{L("What ZIMAS shows")}</h2>
    <div className="grid2">
      <Q id="q-hill" label={L("Hillside Area?")} value={f.hillside} onChange={v => update(d => { d.site.flags.hillside = v; })} />
      <Q id="q-fire" label={L("Very High Fire Hazard Severity Zone?")} value={f.vhfhsz} onChange={v => update(d => { d.site.flags.vhfhsz = v; })} />
      <Q id="q-hpoz" help={L("HPOZ = Historic Preservation Overlay Zone.")} label={L("Historic district (HPOZ)?")} value={f.hpoz} onChange={v => update(d => { d.site.flags.hpoz = v; })} />
      <Q id="q-coast" label={L("Coastal Zone?")} value={f.coastal} onChange={v => update(d => { d.site.flags.coastal = v; })} />
      <Q id="q-meth" label={L("Methane zone?")} value={f.methane} onChange={v => update(d => { d.site.flags.methane = v; })} />
      <Q id="q-burn" label={L("In a 2025 burn area (Palisades or Eaton)?")} value={f.fireRebuild} onChange={v => update(d => { d.site.flags.fireRebuild = v; })} />
      <Q id="q-tr" label={L("Within a half-mile walk of major transit?")} help={L("Walking distance, not a straight line.")} value={f.transitHalfMile} onChange={v => update(d => { d.site.flags.transitHalfMile = v; })} />
      <Q id="q-slope" label={L("Lot slopes more than 10%?")} value={f.slopeOver10} onChange={v => update(d => { d.site.flags.slopeOver10 = v; })} />
      <Q id="q-spk" label={L("Does the main house have fire sprinklers?")} value={f.primarySprinklered} onChange={v => update(d => { d.site.flags.primarySprinklered = v; })} />
      <Q id="q-rent" label={L("Is any unit on the lot rented now?")} value={f.anyUnitRented} onChange={v => update(d => { d.site.flags.anyUnitRented = v; })} />
      <Q id="q-ease" label={L("Have you checked easements in your title report?")} value={f.easementsKnown} onChange={v => update(d => { d.site.flags.easementsKnown = v; })} />
    </div>
  </>;
}

function GarageStep({ p, update }: { p: Project; update: U }) {
  const fb = bbox(p.adu.footprint); const a = p.adu; const [scanMsg, setScanMsg] = useState(''); const [tape, setTape] = useState<number | null>(null);
  const resize = (w: number | null, dpt: number | null) => update(d => { d.confirmed.adu = true; d.adu.footprint = rect(fb.minX, fb.minY, w ?? fb.maxX - fb.minX, dpt ?? fb.maxY - fb.minY); });
  return <>
    <h2>{L("The garage")}</h2>
    <div className="field"><label id="mode">{L("What are you building?")}</label>
      <div className="tri" role="group" aria-labelledby="mode">
        <button aria-pressed={a.mode === 'conversion'} onClick={() => update(d => { d.adu.mode = 'conversion'; })}>{L("Convert my detached garage")}</button>
        <button aria-pressed={a.mode === 'youadu'} onClick={() => update(d => { d.adu.mode = 'youadu'; })}>{L("New ADU from the city's free plan")}</button>
      </div>
      <span className="help">{a.mode === 'youadu' ? L("Uses the city-owned YOU-ADU plan footprint. Plans from design firms must be bought from the firm; we link to them instead.") : L("Converting inside the existing walls keeps the existing setbacks if the garage was permitted.")}</span></div>
    {a.mode === 'youadu' && <div><button className="btn" onClick={() => { const r = autoFit(p); setScanMsg(r.why); if (r.footprint) update(d => { d.adu.footprint = r.footprint!; }); }}>{L("Fit it on my lot")}</button> <span role="status" className="help">{scanMsg}</span></div>}
    {a.mode === 'youadu' && <p className="lead"><a href="https://dbs.lacity.gov/services/plan-review-permitting/standard-plan-program" target="_blank" rel="noreferrer">{L("See the LA Standard Plan list")}</a>. Enter the footprint from the plan sheet below.</p>}
    <div className="grid2">
      <Len id="gw" label={L("Outside width")} mm={fb.maxX - fb.minX} onChange={v => resize(v, null)} />
      <Len id="gd" label={L("Outside depth")} mm={fb.maxY - fb.minY} onChange={v => resize(null, v)} />
      <Len allowZero id="gx" label={L("Distance from the left side line")} help={L("Facing the lot from the street.")} mm={fb.minX - bbox(p.site.lot).minX} onChange={v => { if (v != null) update(d => { d.confirmed.adu = true; d.adu.footprint = translate(d.adu.footprint, v - (fb.minX - bbox(p.site.lot).minX), 0); }); }} />
      <Len allowZero id="gy" label={L("Distance from the rear line")} mm={bbox(p.site.lot).maxY - fb.maxY} onChange={v => { if (v != null) update(d => { d.confirmed.adu = true; d.adu.footprint = translate(d.adu.footprint, 0, (bbox(p.site.lot).maxY - fb.maxY) - v); }); }} />
      <Len id="gh" label={L("Overall height")} mm={a.heightMm} onChange={v => update(d => { d.adu.heightMm = v ?? d.adu.heightMm; })} />
      <Len id="gc" label={L("Finished ceiling height")} mm={a.ceilingHeightMm} onChange={v => update(d => { d.adu.ceilingHeightMm = v; })} help={L("After insulation and drywall. Garages often come out short.")} />
      <Num id="gs" label={L("Interior livable area (sq ft)")} value={a.interiorLivableSqFt} onChange={v => update(d => { d.adu.interiorLivableSqFt = v; })} help={`Inside the walls. Outside footprint is ${fmtSqFt(area(a.footprint))}.`} />
      {a.mode === 'conversion' && <Num id="ga" label={L("Added floor area (sq ft)")} value={a.addedAreaSqFt} onChange={v => update(d => { d.adu.addedAreaSqFt = v ?? 0; })} />}
      <Num id="hp" label={L("Walking distance from street curb to the farthest point (ft)")} value={a.hosePullFt} onChange={v => update(d => { d.adu.hosePullFt = v; })} help={L("Firefighters drag hose along this path.")} />
    </div>
    <div className="grid2">
      {a.mode === 'conversion' && <Q id="q-perm" label={L("Was the garage built with a permit?")} value={a.existingStructurePermitted} onChange={v => update(d => { d.adu.existingStructurePermitted = v; })} help={L("Check LADBS permit records for the address.")} />}
      {a.mode === 'conversion' && <Q id="q-2020" label={L("Was it built before 2020?")} value={a.builtBefore2020} onChange={v => update(d => { d.adu.builtBefore2020 = v; })} />}
      {a.mode === 'conversion' && <Q id="q-door" label={L("Will you fill in or change the garage door opening?")} value={a.removesGarageDoorWall} onChange={v => update(d => { d.adu.removesGarageDoorWall = v; })} />}
      <Q id="q-rated" label={L("Do you plan a 1-hour fire-rated wall where it is close to the line?")} value={a.ratedWallPlanned} onChange={v => update(d => { d.adu.ratedWallPlanned = v; })} />
      {a.mode === 'youadu' && <Q id="q-pitch" label={L("Does the ADU roof pitch match the main house?")} value={a.roofPitchMatches} onChange={v => update(d => { d.adu.roofPitchMatches = v; })} />}
      <Q id="q-aspk" label={L("Will the ADU have fire sprinklers?")} value={a.sprinklered} onChange={v => update(d => { d.adu.sprinklered = v; })} />
      <Q id="q-elec" label={L("All-electric (no gas)?")} value={a.allElectric} onChange={v => update(d => { d.adu.allElectric = v; })} />
    </div>
    <h2>{L("Import a scan (optional)")}</h2>
    <p className="lead">{L("Scan the inside with Polycam (GLTF) or an app that exports Apple RoomPlan JSON. You can always type sizes instead.")}</p>
    <div className="grid2">
      <div className="field"><label htmlFor="scan">{L("Scan file")}</label><input id="scan" type="file" accept=".gltf,.glb,.json" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return; setScanMsg('Reading scan...');
        try {
          const r = file.name.endsWith('.json') ? fromRoomPlanJSON(await file.text()) : await fromGLTF(await file.arrayBuffer());
          let fp = r.footprint; let msg = `${r.source}: ${fmtFtIn(bbox(fp).maxX)} x ${fmtFtIn(bbox(fp).maxY)}. ${r.note}`;
          if (tape) { const t = tapeCheck(bbox(fp).maxX, tape); if (t.rescan) { setScanMsg(`The scan is ${t.driftPct.toFixed(1)}% off your tape. Scan again in better light.`); return; } fp = fp.map(q => ({ x: q.x * t.factor, y: q.y * t.factor })); msg += ` Scaled to your tape (${t.driftPct.toFixed(1)}% change).`; }
          update(d => { d.adu.footprint = translate(fp, fb.minX, fb.minY); if (r.heightMm) d.adu.ceilingHeightMm = r.heightMm; }); setScanMsg(msg);
        } catch (x) { setScanMsg((x as Error).message); }
      }} /><span className="help" role="status">{scanMsg}</span></div>
      <Len id="tape" label={L("Tape-measured width (to check the scan)")} mm={tape} onChange={setTape} help={L("Measure the same wall with a tape. Scans drift.")} />
    </div>
  </>;
}

function RoomsStep({ p, update }: { p: Project; update: U }) {
  const a = p.adu;
  const setW = (i: number, patch: Partial<Window>) => update(d => { d.adu.windows[i] = { ...d.adu.windows[i], ...patch }; });
  return <>
    <h2>{L("Rooms, windows and alarms")}</h2>
    <p className="lead">{L("Every bedroom needs a window you can climb out of. Measure the clear opening when the window is fully open, not the size on the label.")}</p>
    <div className="grid2"><Num id="beds" label={L("Bedrooms")} value={a.bedrooms} onChange={v => update(d => { d.adu.bedrooms = v ?? 0; })} />
      <Q id="q-alarm" label={L("Smoke and CO alarms shown on the plan?")} value={a.smokeCoPlanned} onChange={v => update(d => { d.adu.smokeCoPlanned = v; })} /></div>
    {a.windows.map((w, i) => <fieldset key={w.id} className="grid2" style={{ border: '1px solid var(--rule)', padding: 12 }}>
      <legend>Window {i + 1}</legend>
      <div className="field"><label htmlFor={`wr${i}`}>{L("Room")}</label><input id={`wr${i}`} value={w.room} onChange={e => setW(i, { room: e.target.value })} /></div>
      <Len id={`ww${i}`} label={L("Clear width")} mm={w.clearWidthMm} onChange={v => setW(i, { clearWidthMm: v })} />
      <Len id={`wh${i}`} label={L("Clear height")} mm={w.clearHeightMm} onChange={v => setW(i, { clearHeightMm: v })} />
      <Len id={`ws${i}`} label={L("Sill height above floor")} mm={w.sillMm} onChange={v => setW(i, { sillMm: v })} />
      <div className="mods"><label><input type="checkbox" checked={w.sleeping} onChange={e => setW(i, { sleeping: e.target.checked })} /> This is a bedroom escape window</label>
        <label><input type="checkbox" checked={w.gradeFloor} onChange={e => setW(i, { gradeFloor: e.target.checked })} /> Ground-level floor</label>
        <button className="btn quiet" onClick={() => update(d => { d.adu.windows.splice(i, 1); })}>{L("Remove window")}</button></div>
    </fieldset>)}
    <div><button className="btn" onClick={() => update(d => { d.adu.windows.push({ id: crypto.randomUUID(), room: 'Bedroom', sleeping: true, clearWidthMm: null, clearHeightMm: null, sillMm: null, gradeFloor: true }); })}>{L("Add a window")}</button></div>
  </>;
}

function ChecksStep({ p, update, report, lang }: { p: Project; update: U; report: Report; lang: Lang }) {
  return <>
    <h2>{L("Checks")}</h2>
    <p className="lead">{L("Turn off a group only if someone else is handling it. Anything off prints as \"not checked\" on every export. Safety groups must be on to export.")}</p>
    <div className="mods">{MODULES.map(m => <label key={m.id}><input type="checkbox" checked={p.modules[m.id]} onChange={e => update(d => { d.modules[m.id] = e.target.checked; })} /> {m.label}{m.safety ? ' (safety)' : ''}</label>)}</div>
    <h2>{L("Notes you've dismissed")}</h2>
    {p.dismissed.length === 0 ? <p className="lead">{L("None. You can dismiss a minor or major item with a reason. Critical items can't be dismissed.")}</p> :
      <ul>{p.dismissed.map(x => <li key={x.ruleId}>{x.ruleId}: {x.reason} <button className="btn quiet" onClick={() => update(d => { d.dismissed = d.dismissed.filter(y => y.ruleId !== x.ruleId); })}>{L("Restore")}</button></li>)}</ul>}
    <div className="mods">{report.results.filter(r => (r.status === 'FAIL' || r.status === 'UNKNOWN') && r.rule.severity !== 'critical' && !r.dismissed).map(r =>
      <label key={r.rule.id}><button className="btn quiet" onClick={() => { const reason = prompt(`Why dismiss "${r.rule.title[lang]}"? This prints on the report.`); if (reason?.trim()) update(d => { d.dismissed.push({ ruleId: r.rule.id, reason: reason.trim(), at: new Date().toISOString(), ruleVersion: r.rule.version }); }); }}>{L("Dismiss")}</button> {r.rule.id} {r.rule.title[lang]}</label>)}</div>
  </>;
}

function ExportStep({ p, update, report, lang }: { p: Project; update: U; report: Report; lang: Lang }) {
  const blockers = exportBlockers(p, report); const [busy, setBusy] = useState(''); const [filed, setFiled] = useState('');
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); try { await fn(); } catch (e) { alert((e as Error).message); } setBusy(''); };
  const t = takeoff(p);
  return <>
    <h2>{L("People on the plans")}</h2>
    <div className="grid2">
      <div className="field"><label htmlFor="own">{L("Property owner")}</label><input id="own" value={p.people.ownerName} onChange={e => update(d => { d.people.ownerName = e.target.value; })} /></div>
      <div className="field"><label htmlFor="role">{L("Who prepares the final plans?")}</label><select id="role" value={p.people.preparerRole} onChange={e => update(d => { d.people.preparerRole = e.target.value as Project['people']['preparerRole']; })}>
        <option value="owner">{L("Me, the owner")}</option><option value="drafter">{L("A drafter or designer")}</option><option value="architect">{L("A licensed architect")}</option><option value="engineer">{L("A licensed engineer")}</option><option value="contractor">{L("A licensed contractor")}</option></select></div>
      <div className="field"><label htmlFor="pn">{L("Preparer name")}</label><input id="pn" value={p.people.preparerName} onChange={e => update(d => { d.people.preparerName = e.target.value; })} /></div>
      {p.people.preparerRole !== 'owner' && <div className="field"><label htmlFor="pl">{L("License number (if any)")}</label><input id="pl" value={p.people.preparerLicense} onChange={e => update(d => { d.people.preparerLicense = e.target.value; })} /></div>}
    </div>
    <h2>{L("Download")}</h2>
    <p className="lead">{L("Nothing here is a permit. Your preparer finalizes the handoff packet and submits it to the city.")}</p>
    {blockers.length > 0 && <div className="banner warn" role="alert"><strong>{L("The handoff packet is locked:")}</strong><ul style={{ margin: '4px 0 0' }}>{blockers.map(b => <li key={b}>{L(b)}</li>)}</ul>{L("Draft sheets and the check report still work.")}</div>}
    <div className="mods" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', display: 'grid' }}>
      <button className="btn primary" disabled={!!busy} onClick={() => run('report', async () => { const { reportPDF } = await import('../out/pdf'); download(`${slug(p)}-check-report-${lang}.pdf`, await reportPDF(p, report, lang) as BlobPart, 'application/pdf'); })}>{L("Check report (PDF)")}</button>
      <button className="btn" disabled={!!busy} onClick={() => run('draft', async () => { const { sheetsPDF } = await import('../out/pdf'); download(`${slug(p)}-draft-site-plan.pdf`, await sheetsPDF(p, 'draft') as BlobPart, 'application/pdf'); })}>{L("Draft site plan (PDF, 24x36)")}</button>
      <button className="btn" disabled={!!busy || isDemo(p)} onClick={() => run('pre', async () => { const { sheetsPDF } = await import('../out/pdf'); download(`${slug(p)}-city-precheck.pdf`, await sheetsPDF(p, 'precheck') as BlobPart, 'application/pdf'); })}>{L("Copy for the city's AI pre-check")}</button>
      <button className="btn" disabled={!!busy || blockers.length > 0} onClick={() => run('zip', async () => { const { handoffZip } = await import('../out/handoff'); download(`${slug(p)}-handoff-packet.zip`, await handoffZip(p, report) as BlobPart, 'application/zip'); })}>{L("Handoff packet for your preparer (ZIP)")}</button>
      <button className="btn" disabled={!!busy} onClick={() => run('dxf', async () => { const { toDXF } = await import('../out/dxf'); download(`${slug(p)}-site-plan.dxf`, toDXF(p), 'application/dxf'); })}>{L("Site plan for CAD (DXF)")}</button>
      <button className="btn" onClick={() => download(`${slug(p)}-materials.csv`, takeoffCSV(t), 'text/csv')}>{L("Materials list (CSV)")}</button>
    </div>
    {busy && <p role="status">{L('Making')} {busy}...</p>}
    <h2>{L("Materials estimate")}</h2>
    <table className="take"><thead><tr><th>{L("Item")}</th><th>Qty</th><th>{L("Unit")}</th></tr></thead><tbody>{t.map(r => <tr key={r.item}><td>{r.item}<br /><span className="help" style={{ color: 'var(--pencil)', fontSize: '.8rem' }}>{r.basis}</span></td><td className="q">{r.qty}</td><td>{r.unit}</td></tr>)}</tbody></table>
    <h2>{L("Deadlines")}</h2>
    <div className="grid2"><div className="field"><label htmlFor="filed">{L("Date you filed for plan check")}</label><input id="filed" type="date" value={filed} onChange={e => setFiled(e.target.value)} /></div>
      <div className="field"><label>&nbsp;</label><button className="btn" disabled={!filed} onClick={async () => { const { deadlinesICS } = await import('../out/ics'); download('plan-check-deadline.ics', deadlinesICS(p, filed), 'text/calendar'); }}>{L("Add to my calendar")}</button></div></div>
    <h2>{L("Backup and share")}</h2>
    <p className="lead">{L("Your project lives only on this device. On iPhone, save a backup to Files every week.")}</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn" onClick={() => download(`${slug(p)}.permitpack`, serialize(p), 'application/json')}>{L("Save backup")}</button>
      <button className="btn" onClick={async () => { const pass = prompt('Pick a passphrase (8+ characters). Send it separately from the file.'); if (!pass) return; try { download(`${slug(p)}-locked.permitpack`, await encryptPack(p, pass), 'application/json'); } catch (e) { alert((e as Error).message); } }}>{L("Save locked copy to share")}</button>
    </div>
    <p className="help" style={{ color: 'var(--pencil)', fontSize: '.82rem' }}>{L("This tool is free. If anyone charges you for \"guaranteed permits\" made with it, that's a scam.")}</p>
  </>;
}

function InspectionCard({ report, lang }: { report: Report; lang: Lang }) {
  const v = { READY_FOR_PREPARER: lang === 'es' ? 'Listo para su preparador' : 'Ready for your preparer', FIX_ISSUES: lang === 'es' ? 'Hay cosas que corregir' : 'Some things need fixing', INCOMPLETE: lang === 'es' ? 'Falta información' : 'Some answers are missing', NOT_SUPPORTED: lang === 'es' ? 'Dirección no soportada' : 'Address not supported yet' }[report.overall];
  const c = report.counts;
  return <section className="card" aria-live="polite">
    <h3>{lang === 'es' ? 'Tarjeta de revisión' : 'Check card'}</h3>
    <div className="verdict">{v}</div>
    <div className="sub">{lang === 'es' ? 'Revisión por software, no de la ciudad' : 'Software check, not a city review'} · {lang === 'es' ? 'reglas al' : 'rules as of'} {report.vestDate}</div>
    <div className="punch"><div><b>{c.FAIL}</b>{lang === 'es' ? 'Corregir' : 'Fix'}</div><div><b>{c.UNKNOWN}</b>{lang === 'es' ? 'Falta info' : 'Need info'}</div><div><b>{c.PASS}</b>{lang === 'es' ? 'Cumple' : 'Pass'}</div><div><b>{c.NOT_CHECKED}</b>{lang === 'es' ? 'Apagado' : 'Off'}</div></div>
  </section>;
}
function ResultList({ results, lang }: { results: Result[]; lang: Lang }) {
  const order = ['FAIL', 'UNKNOWN', 'NOT_CHECKED', 'INFO', 'PASS'];
  const label = { FAIL: lang === 'es' ? 'Corregir' : 'Fix', UNKNOWN: lang === 'es' ? 'Falta info' : 'Need info', PASS: lang === 'es' ? 'Cumple' : 'Pass', NOT_CHECKED: lang === 'es' ? 'No revisado' : 'Not checked', INFO: lang === 'es' ? 'Nota' : 'Note' };
  return <ul className="results">{[...results].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).map(r =>
    <li key={r.rule.id} className={`res ${r.status}`}>
      <div className="head"><span className="tag">{label[r.status]}</span><span className="title">{r.rule.title[lang]}</span></div>
      <p>{r.msg[lang]}</p>{r.next && <p className="next"><strong>{lang === 'es' ? 'Siguiente: ' : 'Next: '}</strong>{r.next[lang]}</p>}
      {r.dismissed && <p className="pending">Dismissed: {r.dismissed}</p>}
      <p className="cite">{r.rule.id} · {r.rule.cites.map(c => c.code).join('; ')}{r.rule.cites.some(c => !c.verified) && <span className="pending"> · citation being verified</span>}</p>
    </li>)}</ul>;
}

export { SAFETY_MODULES, toFt };
