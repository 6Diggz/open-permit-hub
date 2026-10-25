import { useEffect, useMemo, useRef, useState } from 'react';
import { blankProject, demoProject, isDemo, MODULES, SAFETY_MODULES, uid, type Project, type Tri, type Window } from '../core/model';
import { History } from '../core/undo';
import { nextPinNumber } from '../core/markup';
import { canDismiss, evaluate, exportBlockers, type Report, type Result } from '../rules/engine';
import { RULES, PACK_ID, addressCity } from '../rules/la-city';
import { PACK, packFreshness, rulesLine } from '../rules/pack';
import { bbox, rect, translate } from '../core/geom';
import { fmtFtIn, fmtSqFt, ft, toFt, RANGES } from '../core/units';
import { area } from '../core/geom';
import { Plan } from './Plan';
import { CleanFix } from './CleanFix';
import { ParcelLookup } from './ParcelLookup';
import { Len, Num, Q } from './fields';
import { RoomsPanel } from './Rooms';
import { RoomPlan } from './RoomPlan';
import { ReviewStep } from './Review';
import { fromMap, unmark, type MapField } from '../io/parcel-apply';
import { ask, AskHost } from './Ask';
import { autoFit } from '../rules/fit';
import { readiness, scoreLine, applies as itemApplies } from '../rules/readiness';
import { CATALOG, RULE_ITEMS } from '../rules/ladbs-adu-2025';
import { citeText } from '../rules/cites-es';
import { tr, type Lang } from './i18n';
import { L, setUiLang, uiLang } from './lang';
import { encryptPack, passphraseProblem, readPackFile, serialize, serializeAll, readBundle, MAX_PACK_BYTES } from '../core/permitpack';
import { takeoff, takeoffCSV } from '../out/takeoff';
import { plainWasmError } from '../out/wasm';
import { missingGlyphNote } from '../out/glyphs';
import { fromGLTF, fromRoomPlanJSON, tapeCheck, SCAN_LIMITS } from '../io/scan';

import * as store from '../core/store';
import type { SaveResult } from '../core/store';
let loadError = ''; let loadErrorId: string | null = null;
const load = (): Project | null => { const id = store.lastId(); try { return id ? store.open(id) : null; } catch (e) { loadError = (e as Error).message; loadErrorId = id; return null; } };
const persist = (p: Project) => store.save(p);
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** On phones, hand the file to the phone's own share sheet (Messages, Mail, WhatsApp); elsewhere, download it. */
async function shareOrDownload(name: string, data: string, type: string): Promise<'shared' | 'saved' | 'cancelled'> {
  try {
    const file = new File([data], name, { type });
    if (matchMedia?.('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return 'shared'; }
  } catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancelled'; }
  download(name, data, type); return 'saved';
}
const slug = (p: Project) => (p.site.address || p.name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'project';
const STEP_KEYS = ['lot', 'garage', 'rooms', 'checks', 'export', 'review'];
const stepFromHash = () => { const m = location.hash.match(/step=(\w+)/); const i = m ? STEP_KEYS.indexOf(m[1]) : -1; return i < 0 ? 0 : i; };
/** Typing in a text field: skip the app-wide undo shortcut so the field's own undo works. */
const inField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export default function App() {
  const hist = useRef<History<Project> | null>(null); const dragStart = useRef<Project | null>(null);
  const [p, setP] = useState<Project | null>(load);
  const [step, setStepRaw] = useState(stepFromHash);
  const [tool, setTool] = useState<'adu' | 'clean'>(location.hash === '#clean' ? 'clean' : 'adu');
  const [lang, setLang] = useState<Lang>(() => (p?.people.language ?? (navigator.language?.startsWith('es') ? 'es' : 'en')));
  const [saveState, setSaveState] = useState<SaveResult>('ok');
  const [notice, setNotice] = useState<string[]>(() => (p ? openNotes(p) : []));
  const formRef = useRef<HTMLDivElement>(null); const moved = useRef(false);
  const [roomSel, setRoomSel] = useState<string | null>(null); const [pinSel, setPinSel] = useState<string | null>(null); const [placing, setPlacing] = useState<string | false>(false);
  if (p && !hist.current) hist.current = new History(p);
  setUiLang(lang);

  useEffect(() => { if (p) setSaveState(persist(p)); }, [p]);
  useEffect(() => { navigator.storage?.persist?.().catch(() => {}); }, []);
  useEffect(() => { document.documentElement.lang = lang; const sk = document.querySelector('a[href="#main"]'); if (sk) sk.textContent = lang === 'es' ? 'Saltar al contenido' : 'Skip to content'; }, [lang]);
  // Another tab saved this project: say so now, before this tab's next save is refused.
  useEffect(() => { const id = p?.id; if (!id) return; const on = (e: StorageEvent) => { if (e.key === store.keyOf(id) && e.newValue) setSaveState('conflict'); }; window.addEventListener('storage', on); return () => window.removeEventListener('storage', on); }, [p?.id]);
  // Browser Back / Forward move between steps; the step lives in the URL so reload keeps it.
  useEffect(() => { const on = () => { if (location.hash === '#clean') { setTool('clean'); return; } setTool('adu'); setStepRaw(stepFromHash()); moved.current = true; }; window.addEventListener('popstate', on); return () => window.removeEventListener('popstate', on); }, []);
  useEffect(() => { if (p && tool === 'adu' && !/step=/.test(location.hash)) history.replaceState(null, '', `#step=${STEP_KEYS[step]}`); }, [p, tool, step]);
  // Move focus to the new step's heading so keyboard and screen-reader users land on it.
  useEffect(() => { if (!moved.current) return; moved.current = false; const h = formRef.current?.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); h.scrollIntoView?.({ block: 'start' }); } }, [step]);
  const setStep = (i: number) => { moved.current = true; setStepRaw(i); history.pushState(null, '', `#step=${STEP_KEYS[i]}`); };
  const openTool = (t: 'adu' | 'clean') => { setTool(t); history.pushState(null, '', t === 'clean' ? '#clean' : `#step=${STEP_KEYS[step]}`); };

  const report: Report | null = useMemo(() => (p ? evaluate(p, RULES, PACK_ID) : null), [p]);
  const commit = (next: Project, key?: string) => { hist.current!.push(next, key); setP(next); };
  const update = (fn: (d: Project) => void, key?: string) => { const d: Project = structuredClone(p!); fn(d); d.rulePack = PACK_ID; commit(d, key); };
  const undo = () => { if (hist.current?.undo()) setP(hist.current.present); };
  const redo = () => { if (hist.current?.redo()) setP(hist.current.present); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && placing) { setPlacing(false); return; } if (inField(e.target)) return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  const show = (x: Project, s = 0) => { setNotice(openNotes(x)); const y = { ...x, repairNotes: undefined }; hist.current = new History(y); setP(y); setStep(s); };

  if (tool === 'clean') return <><CleanFix onBack={() => openTool('adu')} /><AskHost /></>;
  if (!p || !report) return <><AskHost /><Welcome onPick={id => { try { show(store.open(id)); } catch (e) { loadError = (e as Error).message; loadErrorId = id; setP(null); } }} onClean={() => openTool('clean')} lang={lang} setLang={setLang}
    onStart={(d) => { const x = d ? demoProject() : blankProject(); x.people.language = lang; if (!d && lang === 'es') x.name = 'Mi conversión de garaje'; show(x); }} onOpen={x => show(x, 3)} /></>;

  const steps: string[] = tr(lang, 'steps');
  const stepDot = (i: number) => { const mod = [['core', 'zoning', 'hazards'], ['zoning', 'fire', 'structural', 'fees'], ['egress'], [], [], []][i]; const rs = report.results.filter(r => mod.includes(r.rule.module)); return rs.some(r => r.status === 'FAIL') ? 'var(--fix)' : rs.some(r => r.status === 'UNKNOWN') ? 'var(--info-need)' : rs.some(r => r.status === 'NOT_CHECKED') ? 'var(--off)' : rs.some(r => r.status === 'PASS') ? 'var(--pass)' : 'transparent'; };
  const close = () => { setP(null); hist.current = null; history.pushState(null, '', '#projects'); };
  const fresh = packFreshness(new Date(), p.applicationDate);
  const saveText = saveState === 'ok' ? tr(lang, 'saved') : saveState === 'blocked' ? L("Not saved: storage is blocked. Export a backup.") : L("Not saved: this project changed in another tab.");

  return (
    <div className="app"><AskHost />
      <nav className="rail" aria-label={L("Steps")}>
        <p className="brand">{tr(lang, 'app')}</p>
        <p className="brand-sub">LA City · {PACK.version} · {lang === 'es' ? 'reglas revisadas el' : 'rules checked'} {PACK.verifiedOn}</p>
        {steps.map((s, i) => (
          <button key={s} className="step" aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}>
            <span className="n" aria-hidden>{i + 1}</span>{s}<span className="dot" style={{ background: stepDot(i) }} aria-hidden />
          </button>
        ))}
        <div className="rail-foot">
          <span>{saveText}</span>
          <button className="btn quiet" onClick={close}>{L("All projects")}</button>
        </div>
      </nav>

      <main className="main" id="main">
        <div className="toolbar">
          <h1 style={{ font: 'inherit', fontWeight: 700, margin: 0 }}>{p.name}</h1>{isDemo(p) && <span className="res tag" style={{ background: 'var(--off)', color: '#fff', padding: '2px 6px' }}>{L("Demo")}</span>}
          <span className="grow" />
          <button className="btn quiet mobile-only" onClick={close}>{L("All projects")}</button>
          <button className="btn quiet" onClick={undo} disabled={!hist.current?.canUndo}>{tr(lang, 'undo')}</button>
          <button className="btn quiet" onClick={redo} disabled={!hist.current?.canRedo}>{tr(lang, 'redo')}</button>
          <label className="sr" htmlFor="lang">{L("Language")}</label>
          <select id="lang" className="btn quiet" value={lang} onChange={e => { const l = e.target.value as Lang; setLang(l); update(d => { d.people.language = l; }); }}>
            <option value="en">{L("English")}</option><option value="es">{L("Español")}</option>
          </select>
        </div>
        {saveState === 'blocked' && <div className="banner warn" role="alert">{L("Not saved: storage is blocked. Export a backup.")}</div>}
        {saveState === 'conflict' && <div className="banner warn" role="alert">{L("This project changed in another tab. Pick which copy to keep.")}{' '}
          <button className="btn quiet" onClick={() => { try { show(store.open(p.id), step); setSaveState('ok'); } catch { /* gone */ } }}>{L("Load the newer copy")}</button>{' '}
          <button className="btn quiet" onClick={() => setSaveState(store.save(p, { force: true }))}>{L("Keep my version")}</button></div>}
        {notice.length > 0 && <div className="banner" role="status">{notice.map(n => <div key={n}>{n}</div>)}<button className="btn quiet" onClick={() => setNotice([])}>{L("OK")}</button></div>}
        {fresh.stale && <div className="banner warn" role="status">{lang === 'es' ? fresh.reasonEs : fresh.reason}</div>}
        {p.site.flags.fireRebuild === 'yes' && <div className="banner warn">{L("This lot is in a 2025 burn area. Use the official rebuild path. Automatic passes are off.")}</div>}
        <div className="drawing">
          {step === 2 ? <RoomPlan p={p} selected={roomSel} onSelect={setRoomSel} onRemove={id => { update(d => { d.adu.rooms = d.adu.rooms.filter(x => x.id !== id); }); setRoomSel(null); }}
            onChange={(id, poly, key) => update(d => { const r = d.adu.rooms.find(x => x.id === id); if (r) { r.poly = poly; if (r.shape === 'rect') { const bb = bbox(poly); if (r.tape.w != null) r.tape.w = bb.maxX - bb.minX; if (r.tape.d != null) r.tape.d = bb.maxY - bb.minY; } } }, key)} /> :
          <Plan p={p} es={lang === 'es'} pins={step === 5 ? { sel: pinSel, onSelect: setPinSel, placing, zoom: !!pinSel, onPlace: (x, y) => {
            if (placing === 'new') { const id = uid(); update(d => { d.markup.pins.push({ id, n: nextPinNumber(d.markup.pins), x, y, comment: '', status: 'open', author: (() => { try { return localStorage.getItem('opa.author') ?? ''; } catch { return ''; } })(), at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) }); }); setPinSel(id); }
            else if (placing) { const id = placing; update(d => { const x2 = d.markup.pins.find(q => q.id === id); if (x2) { x2.x = x; x2.y = y; } }); }
            setPlacing(false); } } : undefined} onMove={(dx, dy, c) => {
            const moved = (base: Project) => ({ ...base, adu: { ...base.adu, footprint: translate(base.adu.footprint, dx, dy) } });
            if (!c) { if (!dragStart.current) dragStart.current = p; setP(moved(p)); return; }
            if (dragStart.current) { const start = dragStart.current; dragStart.current = null; hist.current!.present = start; commit({ ...p, confirmed: { ...p.confirmed, adu: true } }); return; }
            if (dx || dy) commit({ ...moved(p), confirmed: { ...p.confirmed, adu: true } });
          }} />}
          <span className="hint">{step === 2 ? L("Drag a room, or drag a corner to resize. Keys: arrows move, Alt+arrows resize.") : step === 5 ? (pinSel ? <button type="button" className="btn quiet" onClick={() => setPinSel(null)}>{L("Show the whole lot")}</button> : L("Pins: red = open, green = resolved.")) : L("Drag the ADU, or select it and use arrow keys. Shaded band = 4 ft side/rear setback.")}</span>
        </div>
        <div className="form" ref={formRef}>
          {step === 0 && <LotStep p={p} update={update} lang={lang} replace={next => commit({ ...next, rulePack: PACK_ID })} />}
          {step === 1 && <GarageStep p={p} update={update} />}
          {step === 2 && <RoomsStep p={p} update={update} sel={roomSel} setSel={setRoomSel} />}
          {step === 3 && <ChecksStep p={p} update={update} report={report} lang={lang} />}
          {step === 4 && <ExportStep p={p} update={update} report={report} lang={lang} />}
          {step === 5 && <ReviewStep p={p} update={update} sel={pinSel} setSel={setPinSel} placing={placing} setPlacing={setPlacing} download={(n, d, t) => download(n, d, t)} />}
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <button className="btn quiet" onClick={() => setStep(step - 1)}>{tr(lang, 'back')}</button>}
            {step < steps.length - 1 && <button className="btn primary" onClick={() => setStep(step + 1)}>{tr(lang, 'next')}: {steps[step + 1]}</button>}
          </div>
        </div>
      </main>

      <aside className="side" aria-label={L("Check results")} tabIndex={0}>
        <InspectionCard report={report} lang={lang} appDate={p.applicationDate} score={scoreLine(readiness(p, report), lang === 'es')} />
        <ResultList results={report.results} lang={lang} />
      </aside>
    </div>
  );
}

/** Messages to show once when a project opens: repaired values, and rules updated since it was last checked. */
function openNotes(x: Project): string[] {
  const n: string[] = [];
  if (x.repairNotes?.length) n.push(`${L("Some saved values were damaged and were reset. Enter them again:")} ${x.repairNotes.join(', ')}.`);
  if (x.rulePack && x.rulePack !== PACK_ID) n.push(`${L("The rules were updated since this project was last checked. It is now checked under")} ${PACK_ID} (${L("was")} ${x.rulePack}).`);
  return n;
}

function Welcome({ lang, setLang, onStart, onOpen, onClean, onPick }: { onPick: (id: string) => void; onClean: () => void; lang: Lang; setLang: (l: Lang) => void; onStart: (demo: boolean) => void; onOpen: (p: Project) => void }) {
  const [err, setErr] = useState(''); const [tick, setTick] = useState(0);
  const sample = evaluate(demoProject(), RULES, PACK_ID); const es = lang === 'es';
  const openFile = async (f: File) => {
    setErr('');
    try {
      if (f.size > MAX_PACK_BYTES) throw new Error(es ? 'Este archivo es demasiado grande para ser un paquete.' : 'This file is too large to be a permit pack.');
      const text = await f.text(); const bundle = readBundle(text);
      if (bundle) { let n = 0; for (const x of bundle.projects) { if (store.has(x.id)) { x.id = uid(); x.name = `${x.name} ${es ? '(copia abierta)' : '(opened copy)'}`; } if (store.save(x, { force: true }) === 'ok') n++; }
        setErr(es ? `Se restauraron ${n} proyectos.${bundle.skipped ? ` ${bundle.skipped} estaban dañados.` : ''}` : `Restored ${n} projects.${bundle.skipped ? ` ${bundle.skipped} were damaged.` : ''}`); setTick(t => t + 1); return; }
      const x = await readPackFile(text, async () => ((await ask({ title: es ? 'Este paquete está bloqueado' : 'This pack is locked', body: es ? 'Ingrese la frase de acceso que le dieron con el archivo.' : 'Enter the passphrase you were given with the file.', input: 'password', minLength: 1, confirm: es ? 'Abrir' : 'Open', cancel: es ? 'Cancelar' : 'Cancel', labels: { field: es ? 'Frase de acceso' : 'Passphrase', show: es ? 'Mostrar' : 'Show' } })) as string | null));
      if (!x) return;
      if (store.has(x.id)) {
        const c = await ask({ title: es ? 'Ya tiene este proyecto' : 'You already have this project', body: es ? `"${x.name}" ya está en este dispositivo. Abrir el archivo como copia aparte guarda las dos versiones.` : `"${x.name}" is already on this device. Opening the file as a separate copy keeps both versions.`, confirm: es ? 'Guardar los dos' : 'Keep both', alt: { label: es ? 'Reemplazar el mío' : 'Replace mine', value: 'replace' }, cancel: es ? 'Cancelar' : 'Cancel' });
        if (!c) return;
        if (c !== 'replace') { x.id = uid(); x.name = `${x.name} ${es ? '(copia abierta)' : '(opened copy)'}`; }
      }
      onOpen(x);
    } catch (e) { setErr((e as Error).message); }
  };
  const raw = loadErrorId ? store.raw(loadErrorId) : null;
  return (
    <main className="welcome-grid" id="main"><div className="welcome">
      <button className="btn quiet" style={{ marginBottom: 28 }} onClick={() => setLang(lang === 'en' ? 'es' : 'en')}>{lang === 'en' ? 'Español' : 'English'}</button>
      <h1>{es ? 'Su garaje, revisado contra las reglas de LA.' : 'Your garage, checked against LA\'s rules.'}</h1>
      <p>{tr(lang, 'tagline')}</p>
      <p>{es ? 'Gratis. Funciona en su dispositivo. No necesita cuenta. No es una aprobación de la ciudad.' : 'Free. Runs on your device. No account. Not a city approval.'}</p>
      <div className="row">
        <button className="btn primary" onClick={() => onStart(false)}>{tr(lang, 'start')}</button>
        <button className="btn" onClick={() => onStart(true)}>{tr(lang, 'demo')}</button>
        <label className="btn quiet">{es ? 'Abrir un archivo' : 'Open a saved pack'}
          <input type="file" accept=".permitpack,.json" className="sr" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await openFile(f); }} />
        </label>
      </div>
      {(err || loadError) && <p role="alert" style={{ color: 'var(--fix)' }}>{err || (es ? `No pudimos abrir su proyecto guardado (${loadError}).` : `We couldn't open your saved project (${loadError}).`)}
        {!err && raw && <> <button className="btn quiet" onClick={() => download('damaged-project.permitpack', raw, 'application/json')}>{es ? 'Descargar la copia guardada' : 'Download the saved copy'}</button></>}</p>}
      <Projects key={tick} lang={lang} onPick={onPick} onNew={() => onStart(false)} />
      <p style={{ marginTop: 28 }}><button className="btn quiet" onClick={onClean}>{es ? 'Para dibujantes: limpiar un archivo DWG o DXF' : 'For drafters: clean and fix a DWG or DXF file'}</button></p>
      <p className="help" style={{ fontSize: '.82rem' }}>{es ? 'Código abierto (Apache-2.0).' : 'Open source (Apache-2.0).'} <a href="./THIRD_PARTY_NOTICES.txt">{es ? 'Avisos de terceros' : 'Third-party notices'}</a> · <a href="https://github.com/6Diggz/open-permit-hub" target="_blank" rel="noreferrer">{es ? 'Código fuente' : 'Source code'}</a> · {es ? 'Reglas' : 'Rules'} {PACK_ID}, {es ? 'revisadas el' : 'checked'} {PACK.verifiedOn}</p>
    </div>
    <div className="sample" aria-label={L("Example result from the demo lot")}><InspectionCard example report={sample} lang={lang} /><ResultList results={sample.results.filter(r => r.status === 'FAIL').slice(0, 1)} lang={lang} /></div>
    </main>
  );
}

type U = (fn: (d: Project) => void, key?: string) => void;

function LotStep({ p, update, replace }: { p: Project; update: U; lang: Lang; replace: (next: Project) => void }) {
  const lb = bbox(p.site.lot), hb = bbox(p.site.primary); const f = p.site.flags; const s = p.site;
  const zimas = `https://zimas.lacity.org/?address=${encodeURIComponent(p.site.address)}`;
  const tag = (k: MapField, help?: string) => (fromMap(p, k) ? L('From parcel map, verify on site') : help);
  const shaped = p.site.lot.length !== 4 || p.site.lotSource === 'gis';
  const setLot = (w: number | null, dpt: number | null) => update(d => { d.confirmed.lot = true; d.site.lotSource = 'manual'; unmark(d, 'lot'); const W = w ?? lb.maxX - lb.minX, D = dpt ?? lb.maxY - lb.minY; d.site.lot = rect(0, 0, W, D); d.site.streetEdge = 0; });
  const flag = (k: 'hillside' | 'vhfhsz' | 'hpoz' | 'coastal') => (v: Tri) => update(d => { d.site.flags[k] = v; unmark(d, k); });
  return <>
    <h2>{L("The lot")}</h2>
    <p className="lead">{L("Enter the address. Tap Look up to fill in the lot from the city's parcel map, or check the parcel in ZIMAS and type it in.")}</p>
    <div className="grid2">
      <div className="field"><label htmlFor="addr">{L("Street address")}</label><input id="addr" value={p.site.address} onChange={e => update(d => { d.site.address = e.target.value; }, 'addr')} autoComplete="street-address" /><span className="help">{p.site.address ? <a href={zimas} target="_blank" rel="noreferrer">{L("Open this address in ZIMAS")}</a> : L("Used only on your sheets. It stays on this device.")}</span></div>
      <ParcelLookup p={p} commit={replace} />
      <div className="field"><label htmlFor="apn">{L("Parcel number (APN)")}</label><input id="apn" value={p.site.apn} onChange={e => update(d => { d.site.apn = e.target.value; unmark(d, 'apn'); }, 'apn')} placeholder="1234-567-890" aria-describedby="apn-h" /><span className="help" id="apn-h">{tag('apn', L("The 10-digit number on your property tax bill."))}</span></div>
      <div className="field"><label htmlFor="zone">{L("Zone")}</label><input id="zone" value={p.site.zone} onChange={e => update(d => { d.site.zone = e.target.value; unmark(d, 'zone'); }, 'zone')} placeholder="R1-1" aria-describedby="zone-h" /><span className="help" id="zone-h">{tag('zone', L("Shown in ZIMAS, like R1-1. Printed on your site plan."))}</span></div>
      <div className="field"><label htmlFor="jur">{L("City")}</label><select id="jur" value={p.site.jurisdiction} aria-describedby="jur-h" onChange={e => update(d => { d.site.jurisdiction = e.target.value as Project['site']['jurisdiction']; unmark(d, 'jurisdiction'); })}>
        <option value="unknown">{L("Not sure yet")}</option><option value="la-city">{L("City of Los Angeles")}</option><option value="la-county">{L("Unincorporated LA County")}</option><option value="other">{L("Another city")}</option></select>
        <span className="help" id="jur-h">{tag('jurisdiction', L("A \"Los Angeles\" mailing address is not always LA City. Pasadena, Long Beach, Glendale, Burbank and Santa Monica are separate cities, and East LA, View Park and Altadena are unincorporated county. ZIMAS shows if the lot is in LA City."))}</span></div>
    </div>
    {p.site.jurisdiction === 'la-city' && (() => { const c = addressCity(p.site.address); return c && c !== 'los angeles' && c !== 'la' ? <div className="mods"><label><input type="checkbox" checked={!!s.jurisdictionConfirmed} onChange={e => update(d => { d.site.jurisdictionConfirmed = e.target.checked; })} /> {L("I checked ZIMAS: this lot is in the City of Los Angeles")}</label></div> : null; })()}
    {p.site.parcel && fromMap(p, 'jurisdiction') && p.site.jurisdiction === 'other' && <div className="banner warn" role="status">{L("The city map shows this lot is outside the City of Los Angeles")}{p.site.parcel.cityName ? ` (${p.site.parcel.cityName})` : ''}. {L("This tool's rules are for LA City only.")}</div>}
    <div className="grid2">
      <div className="field"><label htmlFor="mb">{L("What is the main building on the lot?")}</label><select id="mb" value={s.mainBuilding} onChange={e => update(d => { d.site.mainBuilding = e.target.value as Project['site']['mainBuilding']; })}>
        <option value="unknown">{L("Not sure yet")}</option><option value="sfd">{L("One single-family house")}</option><option value="duplex">{L("A duplex")}</option><option value="multifamily">{L("Apartments (3 or more units)")}</option></select></div>
      <Num id="exa" label={L("ADUs already on the lot")} integer max={4} value={s.existingAdus} onChange={v => update(d => { d.site.existingAdus = v; })} help={L("Count permitted and unpermitted ones. 0 if none.")} />
      <Num id="exj" label={L("Junior ADUs already on the lot")} integer max={4} value={s.existingJadus} onChange={v => update(d => { d.site.existingJadus = v; })} help={L("A junior ADU is a unit inside the house, up to 500 sq ft. 0 if none.")} />
    </div>
    <div className="grid2">
      <Len always id="lw" range={RANGES.lot} label={L("Lot width (street side)")} mm={p.site.lotSource === 'gis' ? Math.hypot(p.site.lot[1].x - p.site.lot[0].x, p.site.lot[1].y - p.site.lot[0].y) : lb.maxX - lb.minX} onChange={v => setLot(v, null)} help={tag('lot', shaped ? L("Typing a width or depth replaces the drawn lot shape with a rectangle.") : undefined)} />
      <Len always id="ld" range={RANGES.lot} label={L("Lot depth")} mm={lb.maxY - lb.minY} onChange={v => setLot(null, v)} help={tag('lot', shaped ? L("Typing a width or depth replaces the drawn lot shape with a rectangle.") : undefined)} />
      <Len id="err" allowZero range={RANGES.uncertainty} label={L("How sure are the lot lines?")} mm={p.site.lotUncertaintyMm} onChange={v => update(d => { d.site.lotUncertaintyMm = v ?? ft(2); })} help={L("County maps can be off by a couple of feet. A survey makes this 0.")} />
    </div>
    <div className="grid2">
      <Len always id="hw" range={RANGES.building} label={L("House width")} mm={hb.maxX - hb.minX} onChange={v => update(d => { d.confirmed.house = true; d.site.primary = rect(hb.minX, hb.minY, v ?? hb.maxX - hb.minX, hb.maxY - hb.minY); })} />
      <Len always id="hd" range={RANGES.building} label={L("House depth")} mm={hb.maxY - hb.minY} onChange={v => update(d => { d.confirmed.house = true; d.site.primary = rect(hb.minX, hb.minY, hb.maxX - hb.minX, v ?? hb.maxY - hb.minY); })} />
      <Len always id="hy" allowZero range={RANGES.setback} label={L("House distance from street line")} mm={hb.minY} onChange={v => update(d => { d.confirmed.house = true; d.site.primary = rect(hb.minX, v ?? hb.minY, hb.maxX - hb.minX, hb.maxY - hb.minY); })} />
    </div>
    <div className="grid2">
      <Q id="q-others" label={L("Other buildings on the lot (shed, second garage, workshop)?")} help={L("Not the main house. Each one sets a fire line halfway between it and the ADU.")} value={s.otherBuildings} onChange={v => update(d => { d.site.otherBuildings = v; })} />
      {s.otherBuildings === 'yes' && <Len allowZero id="obg" range={RANGES.setback} label={L("Distance from the ADU to the closest other building")} mm={s.otherBuildingGapMm} onChange={v => update(d => { d.site.otherBuildingGapMm = v; })} />}
    </div>
    <h2>{L("What ZIMAS shows")}</h2>
    <div className="grid2">
      <Q id="q-hill" label={L("Hillside Area?")} help={tag('hillside')} value={f.hillside} onChange={flag('hillside')} />
      <Q id="q-fire" label={L("Very High Fire Hazard Severity Zone?")} help={tag('vhfhsz')} value={f.vhfhsz} onChange={flag('vhfhsz')} />
      <Q id="q-hpoz" help={tag('hpoz', L("HPOZ = Historic Preservation Overlay Zone."))} label={L("Historic district (HPOZ)?")} value={f.hpoz} onChange={flag('hpoz')} />
      <Q id="q-coast" label={L("Coastal Zone?")} help={tag('coastal')} value={f.coastal} onChange={flag('coastal')} />
      <Q id="q-meth" label={L("Methane zone?")} value={f.methane} onChange={v => update(d => { d.site.flags.methane = v; })} />
      <Q id="q-burn" label={L("In a 2025 burn area (Palisades or Eaton)?")} value={f.fireRebuild} onChange={v => update(d => { d.site.flags.fireRebuild = v; })} />
      <Q id="q-tr" label={L("Within a half-mile walk of a major transit stop or a frequent bus corridor?")} help={L("Walking distance, not a straight line. A high-quality transit corridor counts too.")} value={f.transitHalfMile} onChange={v => update(d => { d.site.flags.transitHalfMile = v; })} />
      <Q id="q-slope" label={L("Lot slopes more than 10%?")} value={f.slopeOver10} onChange={v => update(d => { d.site.flags.slopeOver10 = v; })} />
      <Q id="q-spk" label={L("Does the main house have fire sprinklers?")} value={f.primarySprinklered} onChange={v => update(d => { d.site.flags.primarySprinklered = v; })} />
      <Q id="q-rent" label={L("Is any unit on the lot rented now?")} value={f.anyUnitRented} onChange={v => update(d => { d.site.flags.anyUnitRented = v; })} />
      <Q id="q-dwp" label={L("Is the garage within 10 ft of a DWP easement or power line?")} value={f.dwpEasement10ft} onChange={v => update(d => { d.site.flags.dwpEasement10ft = v; })} />
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
    {a.mode === 'conversion' && <div className="field"><label id="att">{L("Is the garage attached to the house?")}</label>
      <div className="tri" role="group" aria-labelledby="att">
        <button aria-pressed={a.garageAttachment === 'detached'} onClick={() => update(d => { d.adu.garageAttachment = 'detached'; })}>{L("Detached")}</button>
        <button aria-pressed={a.garageAttachment === 'attached'} onClick={() => update(d => { d.adu.garageAttachment = 'attached'; })}>{L("Attached")}</button>
        <button aria-pressed={a.garageAttachment === 'unknown'} onClick={() => update(d => { d.adu.garageAttachment = 'unknown'; })}>{tr(uiLang(), 'unknown')}</button>
      </div><span className="help">{L("The city uses sheet II-C for detached garages and II-G for attached ones.")}</span></div>}
    {a.mode === 'conversion' && <div className="field"><label id="cons">{L("What are the garage walls made of?")}</label>
      <div className="tri" role="group" aria-labelledby="cons">
        {(['wood', 'masonry', 'concrete', 'unknown'] as const).map(c => <button key={c} aria-pressed={a.garageConstruction === c} onClick={() => update(d => { d.adu.garageConstruction = c; })}>{c === 'unknown' ? tr(uiLang(), 'unknown') : (c === 'wood' ? L("Wood frame") : c === 'masonry' ? L("Brick or block") : L("Concrete"))}</button>)}
      </div><span className="help">{L("Wood-frame is common. Brick, block (CMU) and concrete garages need a licensed architect or engineer.")}</span></div>}
    {a.mode === 'youadu' && <div><button className="btn" onClick={() => { const r = autoFit(p); setScanMsg(r.why); if (r.footprint) update(d => { d.adu.footprint = r.footprint!; }); }}>{L("Fit it on my lot")}</button> <span role="status" className="help">{scanMsg}</span></div>}
    {a.mode === 'youadu' && <p className="lead"><a href="https://dbs.lacity.gov/standard-plan-program" target="_blank" rel="noreferrer">{L("See the LA Standard Plan list")}</a>. {L("Enter the footprint from the plan sheet below.")}</p>}
    <div className="grid2">
      <Len always id="gw" range={RANGES.building} label={L("Outside width")} mm={fb.maxX - fb.minX} onChange={v => resize(v, null)} />
      <Len always id="gd" range={RANGES.building} label={L("Outside depth")} mm={fb.maxY - fb.minY} onChange={v => resize(null, v)} />
      <Len always allowZero id="gx" label={L("Distance from the left side line")} help={L("Facing the lot from the street.")} mm={fb.minX - bbox(p.site.lot).minX} onChange={v => { if (v != null) update(d => { d.confirmed.adu = true; d.adu.footprint = translate(d.adu.footprint, v - (fb.minX - bbox(p.site.lot).minX), 0); }); }} />
      <Len always allowZero id="gy" label={L("Distance from the rear line")} mm={bbox(p.site.lot).maxY - fb.maxY} onChange={v => { if (v != null) update(d => { d.confirmed.adu = true; d.adu.footprint = translate(d.adu.footprint, 0, (bbox(p.site.lot).maxY - fb.maxY) - v); }); }} />
      <Len id="gh" range={RANGES.height} label={L("Overall height")} mm={a.heightMm} onChange={v => update(d => { d.adu.heightMm = v ?? d.adu.heightMm; })} />
      <Len id="gc" range={RANGES.ceiling} label={L("Finished ceiling height")} mm={a.ceilingHeightMm} onChange={v => update(d => { d.adu.ceilingHeightMm = v; })} help={L("After insulation and drywall. Garages often come out short.")} />
      <Len allowZero id="ge" range={[0, ft(4)]} label={L("Eave depth (roof overhang past the wall)")} mm={a.eaveDepthMm} onChange={v => update(d => { d.adu.eaveDepthMm = v; })} help={L("Enter 0 if the roof stops at the wall. Eaves near a property line are limited.")} />
      <Num id="gs" max={1200} label={L("Interior livable area (sq ft)")} value={a.interiorLivableSqFt} onChange={v => update(d => { d.adu.interiorLivableSqFt = v; })} help={`${L("Inside the walls. Outside footprint is")} ${fmtSqFt(area(a.footprint))}.`} />
      {a.mode === 'conversion' && <Num id="ga" max={150} label={L("Added floor area (sq ft)")} value={a.addedAreaSqFt} onChange={v => update(d => { d.adu.addedAreaSqFt = v ?? 0; })} />}
      {a.mode === 'conversion' && a.addedAreaSqFt > 0 && <Len allowZero id="gas" range={RANGES.setback} label={L("Closest distance from the added part to a side or rear line")} mm={a.addedSetbackMm} onChange={v => update(d => { d.adu.addedSetbackMm = v; })} help={L("Additions need 4 ft from side and rear lines.")} />}
      <Num id="hp" max={1000} label={L("Walking distance from street curb to the farthest point (ft)")} value={a.hosePullFt} onChange={v => update(d => { d.adu.hosePullFt = v; })} help={L("Firefighters drag hose along this path.")} />
    </div>
    <div className="grid2">
      {a.mode === 'conversion' && <Q id="q-perm" label={L("Was the garage built with a permit?")} value={a.existingStructurePermitted} onChange={v => update(d => { d.adu.existingStructurePermitted = v; })} help={L("Check LADBS permit records for the address.")} />}
      {a.mode === 'conversion' && <Q id="q-2020" label={L("Was it built before 2020?")} value={a.builtBefore2020} onChange={v => update(d => { d.adu.builtBefore2020 = v; })} />}
      {a.mode === 'conversion' && a.existingStructurePermitted !== 'yes' && <Q id="q-home" label={L("Was it already used as a separate home before January 1, 2020?")} help={L("Only a unit people already lived in counts for AB 2533. A garage converted now does not.")} value={a.usedAsHomeBefore2020} onChange={v => update(d => { d.adu.usedAsHomeBefore2020 = v; })} />}
      {a.mode === 'conversion' && <Q id="q-door" label={L("Will you fill in or change the garage door opening?")} value={a.removesGarageDoorWall} onChange={v => update(d => { d.adu.removesGarageDoorWall = v; })} />}
      {a.mode === 'conversion' && <Q id="q-inside" label={L("Does the ADU stay inside the existing walls?")} value={a.staysInsideWalls} onChange={v => update(d => { d.adu.staysInsideWalls = v; })} />}
      {a.mode === 'conversion' && a.addedAreaSqFt > 0 && <Q id="q-ingress" label={L("Is the added area only for the entry?")} value={a.addedForIngressOnly} onChange={v => update(d => { d.adu.addedForIngressOnly = v; })} />}
      <Q id="q-slab" label={L("Does the slab have a vapor barrier, or will you add an approved epoxy coating?")} value={a.slabVaporBarrier} onChange={v => update(d => { d.adu.slabVaporBarrier = v; })} />
      <Q id="q-open" label={L("Any windows, doors or vents in walls under 5 ft from the property line or the halfway line to the house?")} value={a.openingsNearLine} onChange={v => update(d => { d.adu.openingsNearLine = v; })} />
      <Q id="q-rated" label={L("Do you plan a 1-hour fire-rated wall where it is close to the line or the house?")} value={a.ratedWallPlanned} onChange={v => update(d => { d.adu.ratedWallPlanned = v; })} />
      {a.mode === 'youadu' && <Q id="q-pitch" label={L("Does the ADU roof pitch match the main house?")} value={a.roofPitchMatches} onChange={v => update(d => { d.adu.roofPitchMatches = v; })} />}
 {a.eaveDepthMm != null && a.eaveDepthMm > 0 && <Q id="q-eave" label={L("Will the eave underside be 1-hour fire-rated where it is near the line?")} help={L("An eave 2 to 5 ft from the line needs a rated underside. This is separate from the wall.")} value={a.ratedEaveUndersidePlanned} onChange={v => update(d => { d.adu.ratedEaveUndersidePlanned = v; })} />}
      <Q id="q-aspk" label={L("Will the ADU have fire sprinklers?")} value={a.sprinklered} onChange={v => update(d => { d.adu.sprinklered = v; })} />
      <Q id="q-elec" label={L("All-electric (no gas)?")} value={a.allElectric} onChange={v => update(d => { d.adu.allElectric = v; })} />
      {a.allElectric !== 'yes' && <Q id="q-gasm" label={L("Will the ADU have its own gas meter?")} value={a.separateGasMeter} onChange={v => update(d => { d.adu.separateGasMeter = v; })} />}
    </div>
    <div className="grid2">
      <Len allowZero id="fps" range={RANGES.setback} label={L("Side setback written on the floor plan")} mm={a.floorPlanSideSetbackMm} onChange={v => update(d => { d.adu.floorPlanSideSetbackMm = v; })} help={L("We compare it with the site plan.")} />
      <Len allowZero id="fpr" range={RANGES.setback} label={L("Rear setback written on the floor plan")} mm={a.floorPlanRearSetbackMm} onChange={v => update(d => { d.adu.floorPlanRearSetbackMm = v; })} help={L("We compare it with the site plan.")} />
      <Num id="amps" max={800} label={L("Main electrical panel size (amps)")} value={a.panelAmps} onChange={v => update(d => { d.adu.panelAmps = v; })} help={L("Printed on the main breaker.")} />
    </div>
    {a.mode === 'conversion' && <div className="mods"><label><input type="checkbox" checked={a.legalization} onChange={e => update(d => { d.adu.legalization = e.target.checked; })} /> {L("Legalize an unpermitted unit that was already a home before 2020 (AB 2533)")}</label></div>}
    <h2>{L("Import a scan (optional)")}</h2>
    <p className="lead">{L("Scan the inside with Polycam (GLTF) or an app that exports Apple RoomPlan JSON. You can always type sizes instead.")}</p>
    <div className="grid2">
      <div className="field"><label htmlFor="scan">{L("Scan file")}</label><input id="scan" type="file" accept=".gltf,.glb,.json" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return; setScanMsg(L('Reading scan...'));
        try {
          if (file.size > SCAN_LIMITS.bytes) throw new Error(L('This scan file is too large.'));
          const r = file.name.endsWith('.json') ? fromRoomPlanJSON(await file.text()) : await fromGLTF(await file.arrayBuffer());
          let fp = r.footprint; let msg = `${r.source}: ${fmtFtIn(bbox(fp).maxX)} x ${fmtFtIn(bbox(fp).maxY)}. ${r.note}`;
          if (tape) { const t = tapeCheck(bbox(fp).maxX, tape); if (t.rescan) { setScanMsg(`The scan is ${t.driftPct.toFixed(1)}% off your tape. Scan again in better light.`); return; } fp = fp.map(q => ({ x: q.x * t.factor, y: q.y * t.factor })); msg += ` Scaled to your tape (${t.driftPct.toFixed(1)}% change).`; }
          update(d => { d.adu.footprint = translate(fp, fb.minX, fb.minY); if (r.heightMm) d.adu.ceilingHeightMm = r.heightMm; }); setScanMsg(msg);
        } catch (x) { setScanMsg(plainWasmError(x)); }
      }} /><span className="help" role="status">{scanMsg}</span></div>
      <Len id="tape" label={L("Tape-measured width (to check the scan)")} mm={tape} onChange={setTape} help={L("Measure the same wall with a tape. Scans drift.")} />
    </div>
  </>;
}

function RoomsStep({ p, update, sel, setSel }: { p: Project; update: U; sel: string | null; setSel: (id: string | null) => void }) {
  const a = p.adu;
  const setW = (i: number, patch: Partial<Window>, key?: string) => update(d => { d.adu.windows[i] = { ...d.adu.windows[i], ...patch }; }, key);
  return <>
    <RoomsPanel p={p} update={update} selected={sel} setSelected={setSel} />
    {a.rooms.length === 0 && <>
    <h2>{L("Or list windows without drawing rooms")}</h2>
    <p className="lead">{L("Every bedroom needs a window you can climb out of. Measure the clear opening when the window is fully open, not the size on the label.")}</p>
    {a.windows.map((w, i) => <fieldset key={w.id} className="grid2" style={{ border: '1px solid var(--rule)', padding: 12 }}>
      <legend>{L("Window")} {i + 1}</legend>
      <div className="field"><label htmlFor={`wr${i}`}>{L("Room")}</label><input id={`wr${i}`} value={w.room} onChange={e => setW(i, { room: e.target.value }, 'wr' + w.id)} aria-describedby={`wr${i}-h`} /><span className="help" id={`wr${i}-h`}>{L("Give each bedroom its own name, like Bedroom 1 and Bedroom 2.")}</span></div>
      <Len bare="in" help={L("Inches if you type just a number, like 24.")} id={`ww${i}`} range={RANGES.window} label={L("Clear width (inches)")} mm={w.clearWidthMm} onChange={v => setW(i, { clearWidthMm: v })} />
      <Len bare="in" help={L("Inches if you type just a number, like 24.")} id={`wh${i}`} range={RANGES.window} label={L("Clear height (inches)")} mm={w.clearHeightMm} onChange={v => setW(i, { clearHeightMm: v })} />
      <Len bare="in" help={L("Inches if you type just a number, like 24.")} allowZero id={`ws${i}`} range={RANGES.sill} label={L("Sill height above floor (inches)")} mm={w.sillMm} onChange={v => setW(i, { sillMm: v })} />
      <div className="mods"><label><input type="checkbox" checked={w.sleeping} onChange={e => setW(i, { sleeping: e.target.checked })} /> {L("This is a bedroom escape window")}</label>
        <label><input type="checkbox" checked={w.gradeFloor} onChange={e => setW(i, { gradeFloor: e.target.checked })} /> {L("Ground-level floor")}</label>
        <button className="btn quiet" onClick={() => update(d => { d.adu.windows.splice(i, 1); })}>{L("Remove window")}</button></div>
    </fieldset>)}
    <div><button className="btn" onClick={() => update(d => { const n = d.adu.windows.filter(x => x.sleeping).length; d.adu.windows.push({ id: uid(), room: d.adu.bedrooms === 0 ? L('Main room') : d.adu.bedrooms > 1 ? `${L('Bedroom')} ${n + 1}` : L('Bedroom'), sleeping: true, clearWidthMm: null, clearHeightMm: null, sillMm: null, gradeFloor: true }); })}>{L("Add a window")}</button></div>
    </>}
  </>;
}

function ChecksStep({ p, update, report, lang }: { p: Project; update: U; report: Report; lang: Lang }) {
  return <>
    <h2>{L("Checks")}</h2>
    <p className="lead">{L("Turn off a group only if someone else is handling it. Anything off prints as \"not checked\" on every export. Safety groups must be on to export.")}</p>
    <div className="mods">{MODULES.map(m => <label key={m.id}><input type="checkbox" checked={p.modules[m.id]} onChange={e => update(d => { d.modules[m.id] = e.target.checked; })} /> {L(m.label)}{m.safety ? ` (${L('safety')})` : ''}</label>)}</div>
    <SheetItems p={p} update={update} report={report} lang={lang} />
    <h2>{L("Notes you've dismissed")}</h2>
    {p.dismissed.length === 0 ? <p className="lead">{L("None. You can dismiss a minor or major item with a reason. Critical and health-and-safety items can't be dismissed.")}</p> :
      <ul>{p.dismissed.map(x => <li key={x.ruleId}>{x.ruleId}: {x.reason} <button className="btn quiet" onClick={() => update(d => { d.dismissed = d.dismissed.filter(y => y.ruleId !== x.ruleId); })}>{L("Restore")}</button></li>)}</ul>}
    <div className="mods">{report.results.filter(r => (r.status === 'FAIL' || r.status === 'UNKNOWN') && canDismiss(r.rule) && !r.dismissed).map(r =>
      <label key={r.rule.id}><button className="btn quiet" onClick={async () => { const reason = await ask({ title: L('Dismiss this item?'), body: `${r.rule.title[lang]}. ${L('Your reason prints on the report.')}`, input: 'text', minLength: 3, confirm: L('Dismiss'), cancel: L('Cancel'), labels: { field: L('Reason'), short: L('Type a short reason first.') } }) as string | null; if (reason) update(d => { d.dismissed.push({ ruleId: r.rule.id, reason, at: new Date().toISOString(), ruleVersion: r.rule.version }); }); }}>{L("Dismiss")}</button> {r.rule.id} {r.rule.title[lang]}</label>)}</div>
  </>;
}

function ExportStep({ p, update, report, lang }: { p: Project; update: U; report: Report; lang: Lang }) {
  const blockers = exportBlockers(p, report); const [busy, setBusy] = useState(''); const [note, setNote] = useState(''); const [filed, setFiled] = useState(''); const [issued, setIssued] = useState('');
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setNote(''); try { await fn(); setNote(L('Saved to your downloads.')); } catch (e) { setNote(plainWasmError(e)); } setBusy(''); };
  const t = takeoff(p); const es = lang === 'es';
  const missing = missingGlyphNote(p, es);
  return <>
    <h2>{L("People on the plans")}</h2>
    <div className="grid2">
      <div className="field"><label htmlFor="own">{L("Property owner")}</label><input id="own" value={p.people.ownerName} onChange={e => update(d => { d.people.ownerName = e.target.value; }, 'own')} /></div>
      <div className="field"><label htmlFor="role">{L("Who prepares the final plans?")}</label><select id="role" value={p.people.preparerRole} onChange={e => update(d => { d.people.preparerRole = e.target.value as Project['people']['preparerRole']; })}>
        <option value="owner">{L("Me, the owner")}</option><option value="drafter">{L("A drafter or designer")}</option><option value="architect">{L("A licensed architect")}</option><option value="engineer">{L("A licensed engineer")}</option><option value="contractor">{L("A licensed contractor")}</option></select></div>
      <div className="field"><label htmlFor="pn">{L("Preparer name")}</label><input id="pn" value={p.people.preparerName} onChange={e => update(d => { d.people.preparerName = e.target.value; }, 'pn')} /></div>
      {p.people.preparerRole !== 'owner' && <div className="field"><label htmlFor="pl">{L("License number (if any)")}</label><input id="pl" value={p.people.preparerLicense} onChange={e => update(d => { d.people.preparerLicense = e.target.value; }, 'pl')} /></div>}
      {p.adu.mode === 'conversion' && p.adu.removesGarageDoorWall === 'yes' && <div className="field"><label htmlFor="eng">{L("Licensed engineer for the garage door wall")}</label><input id="eng" value={p.people.engineerName} onChange={e => update(d => { d.people.engineerName = e.target.value; }, 'eng')} aria-describedby="eng-h" /><span className="help" id="eng-h">{L("Changing that wall is not conventional framing, so an engineer details it.")}</span></div>}
    </div>
    <p className="help" style={{ color: 'var(--pencil)', fontSize: '.82rem' }}>{L("The sheets print the preparer's name and role. This app is a tool; it is not the preparer of your plans.")}</p>
    <h2>{L("Download")}</h2>
    <p className="lead">{L("Nothing here is a permit. Your preparer finalizes the handoff packet and submits it to the city.")}</p>
    {blockers.length > 0 && <div className="banner warn" role="alert"><strong>{L("The handoff packet is locked:")}</strong><ul style={{ margin: '4px 0 0' }}>{blockers.map(b => <li key={b}>{L(b)}</li>)}</ul>{L("Draft sheets and the check report still work.")}</div>}
    {missing && <div className="banner warn" role="status">{missing}</div>}
    <div className="mods" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', display: 'grid' }}>
      <button className="btn primary" disabled={!!busy} onClick={() => run('report', async () => { const { reportPDF } = await import('../out/pdf'); download(`${slug(p)}-check-report-${lang}.pdf`, await reportPDF(p, report, lang) as BlobPart, 'application/pdf'); })}>{L("Check report (PDF)")}</button>
      <button className="btn" disabled={!!busy} onClick={() => run('html', async () => { const { reportHTML } = await import('../out/reporthtml'); download(`${slug(p)}-check-report-${lang}.html`, reportHTML(p, report, lang), 'text/html'); })}>{L("Check report for screen readers (HTML)")}</button>
      <button className="btn" disabled={!!busy} onClick={() => run('draft', async () => { const { sheetsPDF } = await import('../out/pdf'); download(`${slug(p)}-draft-site-plan.pdf`, await sheetsPDF(p, 'draft') as BlobPart, 'application/pdf'); })}>{L("Draft site plan (PDF, 24x36)")}</button>
      <button className="btn" disabled={!!busy || isDemo(p)} onClick={() => run('pre', async () => { const { sheetsPDF } = await import('../out/pdf'); download(`${slug(p)}-city-precheck.pdf`, await sheetsPDF(p, 'precheck') as BlobPart, 'application/pdf'); })}>{L("Download for the city's AI pre-check (PDF)")}</button>
      <button className="btn" disabled={!!busy || blockers.length > 0} onClick={() => run('zip', async () => { const { handoffZip } = await import('../out/handoff'); download(`${slug(p)}-handoff-packet.zip`, await handoffZip(p, report) as BlobPart, 'application/zip'); })}>{L("Handoff packet for your preparer (ZIP)")}</button>
      <button className="btn" disabled={!!busy} onClick={() => run('dxf', async () => { const { toDXF } = await import('../out/dxf'); download(`${slug(p)}-site-plan.dxf`, await toDXF(p) as BlobPart, 'application/dxf'); })}>{L("Site plan for CAD (DXF)")}</button>
      <button className="btn" onClick={() => { download(`${slug(p)}-materials.csv`, '﻿' + takeoffCSV(t, es), 'text/csv'); setNote(L('Saved to your downloads.')); }}>{L("Materials list (CSV)")}</button>
    </div>
    {note && !busy && <p role="status">{note}</p>}
    {busy && <p role="status">{L('Making')} {busy}...</p>}
    <h2>{L("Materials estimate")}</h2>
    <table className="take"><thead><tr><th>{L("Item")}</th><th>{L("Qty")}</th><th>{L("Unit")}</th></tr></thead><tbody>{t.map(r => <tr key={r.item}><td>{es ? r.itemEs : r.item}<br /><span className="help" style={{ color: 'var(--pencil)', fontSize: '.8rem' }}>{es ? r.basisEs : r.basis}</span></td><td className="q">{r.qty}</td><td>{es ? r.unitEs : r.unit}</td></tr>)}</tbody></table>
    <h2>{L("Deadlines")}</h2>
    <div className="grid2"><div className="field"><label htmlFor="filed">{L("Date you filed for plan check")}</label><input id="filed" type="date" value={filed} onChange={e => setFiled(e.target.value)} /></div>
      <div className="field"><label htmlFor="issued">{L("Date the permit was issued (optional)")}</label><input id="issued" type="date" value={issued} onChange={e => setIssued(e.target.value)} /></div>
      <div className="field"><label htmlFor="ics">&nbsp;</label><button id="ics" className="btn" disabled={!filed} aria-describedby="ics-h" onClick={async () => { const { deadlinesICS } = await import('../out/ics'); download('plan-check-deadline.ics', deadlinesICS(p, filed, 0, issued || undefined), 'text/calendar'); setNote(L('Saved to your downloads.')); }}>{L("Add to my calendar")}</button>
        <span className="help" id="ics-h">{filed ? L("Plan check expires 18 months after filing. With an issue date, the 12-month start and 2-year permit limits are added too.") : L("Enter the date you filed to set the reminder.")}</span></div></div>
    <h2>{L("Backup and share")}</h2>
    <p className="lead">{L("Your project lives only on this device. On iPhone, save a backup to Files every week.")}</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn" onClick={async () => { const r = await shareOrDownload(`${slug(p)}.permitpack`, serialize(p), 'application/json'); if (r !== 'cancelled') setNote(r === 'shared' ? L('Shared.') : L('Saved to your downloads.')); }}>{L("Save backup")}</button>
      <button className="btn" onClick={async () => { const pass = await ask({ title: L('Lock a copy to share'), body: L('Pick a passphrase of 8 or more characters, like 3 or 4 unrelated words. Send it separately from the file, for example by text message. Nobody can recover it if it is lost, not even this app.'), input: 'password', minLength: 8, repeat: L('Type it again'), validate: v => { const m = passphraseProblem(v); return m ? L(m) : null; }, confirm: L('Save locked copy'), cancel: L('Cancel'), labels: { field: L('Passphrase'), repeat: L('Type it again'), mismatch: L('The two passphrases do not match.'), short: L('Use a passphrase of 8 or more characters.'), show: L('Show') } }) as string | null; if (!pass) return; try { const r = await shareOrDownload(`${slug(p)}-locked.permitpack`, await encryptPack(p, pass), 'application/json'); if (r !== 'cancelled') setNote(r === 'shared' ? L('Shared.') : L('Saved to your downloads.')); } catch (e) { setNote(L((e as Error).message)); } }}>{L("Save locked copy to share")}</button>
    </div>
    <p className="help" style={{ color: 'var(--pencil)', fontSize: '.82rem' }}>{L("This tool is free. If anyone charges you for \"guaranteed permits\" made with it, that's a scam.")}</p>
  </>;
}

function SheetItems({ p, update, report, lang }: { p: Project; update: U; report: Report; lang: Lang }) {
  const rd = readiness(p, report); const linked = new Set(Object.values(RULE_ITEMS).flat());
  const open = CATALOG.filter(i => itemApplies(i, p) && !linked.has(i.id) && i.mode !== 'auto');
  const docs = open.filter(i => i.mode === 'doc'), asks = open.filter(i => i.mode === 'ask');
  const must = docs.filter(i => i.garageRelevant), maybe = docs.filter(i => !i.garageRelevant);
  const setA = (id: string, v: 'yes' | 'no' | 'na' | undefined) => update(d => { if (v) d.sheet[id] = v; else delete d.sheet[id]; });
  const docBox = (i: typeof docs[number]) => <label key={i.id}><input type="checkbox" checked={!!p.docs[i.id]} onChange={e => update(d => { d.docs[i.id] = e.target.checked; })} /> {i.id} {i.summary[lang]}</label>;
  return <>
    <h2>{L("LADBS correction sheet")}</h2>
    <p className="lead">{scoreLine(rd, lang === 'es')}. {L("Form")} {PACK.sheet.form}, Rev {PACK.sheet.rev}.</p>
    <h2>{L("Documents to attach")}</h2>
    <div className="mods">
      <label><input type="checkbox" checked={!!p.docs['NRG.CF1R']} onChange={e => update(d => { d.docs['NRG.CF1R'] = e.target.checked; })} /> III.H.9 {L("Title 24 CF1R energy certificate")}</label>
      <label><input type="checkbox" checked={!!p.docs['NRG.HERS']} onChange={e => update(d => { d.docs['NRG.HERS'] = e.target.checked; })} /> III.H.9 {L("HERS field verification")}</label>
      {must.map(docBox)}
    </div>
    {maybe.length > 0 && <><p className="lead">{L("May apply: ask your preparer. These depend on grading, shared driveways, lifts and other facts this app does not ask about.")}</p><div className="mods">{maybe.map(docBox)}</div></>}
    <h2>{L("Shown on your plans?")}</h2>
    <details open={p.people.preparerRole !== 'owner'}><summary>{L("Plan-sheet items for your preparer")} ({asks.filter(i => !p.sheet[i.id]).length} {L("not answered")})</summary>
    {asks.map(i => <div className="field" key={i.id}><label id={'si-' + i.id}>{i.id} {i.summary[lang]}</label>
      <div className="tri" role="group" aria-labelledby={'si-' + i.id}>
        <button type="button" aria-pressed={p.sheet[i.id] === 'yes'} onClick={() => setA(i.id, 'yes')}>{tr(uiLang(), 'yes')}</button>
        <button type="button" aria-pressed={p.sheet[i.id] === 'no'} onClick={() => setA(i.id, 'no')}>{tr(uiLang(), 'no')}</button>
        <button type="button" aria-pressed={p.sheet[i.id] === 'na'} onClick={() => setA(i.id, 'na')}>{L("Doesn't apply")}</button>
        <button type="button" aria-pressed={!p.sheet[i.id]} onClick={() => setA(i.id, undefined)}>{tr(uiLang(), 'unknown')}</button>
      </div></div>)}
    </details>
  </>;
}

function InspectionCard({ report, lang, score, appDate = null, example }: { report: Report; lang: Lang; score?: string; appDate?: string | null; example?: boolean }) {
  const es = lang === 'es';
  const v = { READY_FOR_PREPARER: es ? 'Listo para su preparador' : 'Ready for your preparer', FIX_ISSUES: es ? 'Hay cosas que corregir' : 'Some things need fixing', INCOMPLETE: es ? 'Falta información' : 'Some answers are missing', NOT_SUPPORTED: es ? 'Dirección no soportada' : 'Address not supported yet' }[report.overall];
  const c = report.counts; const fr = rulesLine(appDate, report.pack, es);
  return <section className="card" aria-live="polite">
    {example ? <h2 className="card-h">{es ? 'Resultado de ejemplo (lote de demostración, no es su proyecto)' : 'Example result (demo lot, not your project)'}</h2> : <h3>{es ? 'Tarjeta de revisión' : 'Check card'}</h3>}
    <div className="verdict">{v}</div>
    <div className="sub">{es ? 'Revisión por software, no de la ciudad' : 'Software check, not a city review'} · {fr.text}</div>
    {score && <div className="sub">{es ? 'Puntos de la hoja: ' : 'Sheet items: '}{score}</div>}
    <div className="sub" style={{ marginBottom: 4 }}>{es ? 'Revisiones de reglas' : 'Rule checks'}</div>
    <div className="punch"><div><b>{c.FAIL}</b>{es ? 'Corregir' : 'Fix'}</div><div><b>{c.UNKNOWN}</b>{es ? 'Falta info' : 'Need info'}</div><div><b>{c.PASS}</b>{es ? 'Cumple' : 'Pass'}</div><div><b>{c.NOT_CHECKED}</b>{es ? 'Apagado' : 'Off'}</div></div>
  </section>;
}
function ResultList({ results, lang }: { results: Result[]; lang: Lang }) {
  const es = lang === 'es';
  const order = ['FAIL', 'UNKNOWN', 'NOT_CHECKED', 'INFO', 'PASS'];
  const label = { FAIL: es ? 'Corregir' : 'Fix', UNKNOWN: es ? 'Falta info' : 'Need info', PASS: es ? 'Cumple' : 'Pass', NOT_CHECKED: es ? 'No revisado' : 'Not checked', INFO: es ? 'Nota' : 'Note' };
  return <ul className="results">{[...results].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).map(r =>
    <li key={r.rule.id} className={`res ${r.status}`}>
      <div className="head"><span className="tag">{label[r.status]}</span><span className="title">{r.rule.title[lang]}</span></div>
      <p>{r.msg[lang]}</p>{r.next && <p className="next"><strong>{es ? 'Siguiente: ' : 'Next: '}</strong>{r.next[lang]}</p>}
      {r.dismissed && <p className="pending">{es ? 'Descartado' : 'Dismissed'}: {r.dismissed}</p>}
      <p className="cite">{r.rule.id} · {r.rule.cites.map(c => citeText(c, es)).join('; ')}{RULE_ITEMS[r.rule.id]?.length ? ` · ${es ? 'hoja LADBS' : 'LADBS sheet'} ${RULE_ITEMS[r.rule.id].join(', ')}` : ''}{r.rule.cites.some(c => !c.verified) && <span className="pending"> · {es ? 'cita en verificación' : 'citation being verified'}</span>}</p>
    </li>)}</ul>;
}

export { SAFETY_MODULES, toFt };

function Projects({ lang, onPick, onNew }: { lang: Lang; onPick: (id: string) => void; onNew: () => void }) {
  const [items, setItems] = useState(store.list); const es = lang === 'es';
  const [renaming, setRenaming] = useState<string | null>(null); const [name, setName] = useState('');
  if (!items.length) return null;
  return <section aria-label={es ? 'Sus proyectos' : 'Your projects'} style={{ marginTop: 28 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 8px' }}><h2 style={{ fontSize: '1.05rem', margin: 0, flex: 1 }}>{es ? 'Sus proyectos en este dispositivo' : 'Your projects on this device'}</h2>
      <button className="btn" onClick={onNew}>{es ? '+ Proyecto nuevo' : '+ New project'}</button>
      <button className="btn quiet" onClick={() => { const ps = items.flatMap(e => { try { return [store.open(e.id)]; } catch { return []; } }); download(`all-projects-${new Date().toISOString().slice(0, 10)}.permitpack`, serializeAll(ps), 'application/json'); }}>{es ? 'Respaldar todos los proyectos' : 'Back up all projects'}</button></div>
    <p className="help" style={{ margin: '0 0 8px' }}>{es ? 'Los proyectos viven solo en este dispositivo. Guarde un respaldo de todos a menudo; ábralo con "Abrir un archivo" para restaurarlos.' : 'Projects live only on this device. Back them all up often; open the file with "Open a saved pack" to restore them.'}</p>
    <ul className="results" style={{ padding: 0 }}>{items.map(e => <li key={e.id} className="res" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {renaming === e.id ? <form style={{ display: 'flex', gap: 6, flex: 1 }} onSubmit={ev => { ev.preventDefault(); try { const x = store.open(e.id); x.name = name.trim() || x.name; store.save(x); } catch { /* gone */ } setRenaming(null); setItems(store.list()); }}>
        <label className="sr" htmlFor={'rn-' + e.id}>{es ? 'Nombre' : 'Name'}</label><input id={'rn-' + e.id} autoFocus value={name} onChange={ev => setName(ev.target.value)} style={{ flex: 1, padding: 6 }} /><button className="btn">{es ? 'Guardar' : 'Save'}</button></form>
        : <button className="btn quiet" style={{ flex: 1, textAlign: 'left', border: 0 }} onClick={() => onPick(e.id)}><strong>{e.name}</strong>{e.demo ? (es ? ' (ejemplo)' : ' (demo)') : ''}<br /><span style={{ fontSize: '.82rem', color: 'var(--pencil)' }}>{e.address || (es ? 'Sin dirección' : 'No address yet')} · {new Date(e.updatedAt).toLocaleDateString()}</span></button>}
      <button className="btn quiet" onClick={() => { setRenaming(e.id); setName(e.name); }}>{es ? 'Renombrar' : 'Rename'}</button>
      <button className="btn quiet" onClick={() => { try { store.duplicate(e.id); } catch { /* damaged */ } setItems(store.list()); }}>{es ? 'Duplicar' : 'Duplicate'}</button>
      <button className="btn quiet" onClick={async () => { if (await ask({ title: es ? '¿Borrar este proyecto?' : 'Delete this project?', body: es ? `"${e.name}" se borra de este dispositivo. Guarde una copia antes si la necesita.` : `"${e.name}" is removed from this device. Save a backup first if you need it.`, confirm: es ? 'Borrar' : 'Delete', cancel: es ? 'Cancelar' : 'Cancel', danger: true })) { store.remove(e.id); setItems(store.list()); } }}>{es ? 'Borrar' : 'Delete'}</button>
    </li>)}</ul>
  </section>;
}
