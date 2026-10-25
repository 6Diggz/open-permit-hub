// Pro workspace: canvas-first CAD layout (top bar with quick access, tool rail, model viewport, modify bar, command line,
// inspector, status bar, sheet tabs), command palette, shortcut help, and the phone layout with a bottom sheet and ft-in keypad.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Project, Room, RoomUse } from '../../core/model';
import { isDemo, uid, ROOM_USES } from '../../core/model';
import type { Verdict } from '../../core/verdict';
import { bbox, rect, translate, area, type Pt } from '../../core/geom';
import { ft, inch, parseLength, toSqFt } from '../../core/units';
import { applyTape, roomArea, footLocal, roomFits } from '../../core/rooms';
import { DEFAULT_CAD, entDist, type Ent, type CadLayer } from '../../core/cad';
import { serialize } from '../../core/permitpack';
import { takeoff, takeoffCSV } from '../../out/takeoff';
import { packForProject } from '../../rules/registry';
import { citeText } from '../../rules/cites-es';
import { L, UI_LANGS, nativeName } from '../lang';
import type { Lang } from '../i18n';
import { Canvas, layerColor, type CanvasApi, type LayerState, type SheetId } from './Canvas';
import { LAYERS, fmtArch, setUnits } from './drafting';
import { issuesOf, type Issue, type Step } from './issues';
import { hitTest, type Sel } from './view';
import { IDLE, start, point, text as cmdTextFn, enter as cmdEnter, esc as cmdEsc, previewOf, basePt, COMMANDS, ALIASES, dimGeom, type St, type Out, type Ctx } from './cmd';
import './pro.css';

export interface WorkspaceProps {
  p: Project; verdict: Verdict; lang: Lang; ui: string; setLang: (l: string) => void; saveText: string; saveOk: boolean;
  update: (fn: (d: Project) => void, key?: string) => void; preview: (next: Project) => void; commit: (start: Project, next: Project) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  toGuided: (step?: Step) => void; close: () => void; openField: () => void; openClean: () => void;
  panel: (step: Step) => ReactNode; banners: ReactNode; pinRequest: number; download: (name: string, data: BlobPart, type: string) => void;
}

const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } } };
const prefersDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

/** 16px stroke icons drawn for this app (our own set). */
const ICONS: Record<string, string> = {
  select: 'M4 2.5l8.5 5-3.8 1-1.9 3.8z', pan: 'M8 1.5v13M1.5 8h13M8 1.5L6.3 3.2M8 1.5l1.7 1.7M8 14.5l-1.7-1.7M8 14.5l1.7-1.7M1.5 8l1.7-1.7M1.5 8l1.7 1.7M14.5 8l-1.7-1.7M14.5 8l-1.7 1.7',
  measure: 'M2 11.5L11.5 2l2.5 2.5L4.5 14zM5 8.5l1.3 1.3M7 6.5l.9.9M9 4.5l1.3 1.3', room: 'M2.5 2.5h11v11h-11zM2.5 8h5.5v5.5', door: 'M3 13.5h10M4 13.5V3h1.5v10.5M5.5 3a10.5 10.5 0 0 1 8 10.5',
  window: 'M2 6h12v4H2zM2 8h12M2 6v4M14 6v4', pin: 'M8 14.5s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0c0 3.3 4.5 7.5 4.5 7.5zM8 8.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  dim: 'M2 5v6M14 5v6M2 8h12M3.2 9.2l1.6-2.4M11.2 9.2l1.6-2.4', fit: 'M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5M5.5 5.5h5v5h-5z',
  undo: 'M5.5 4L2.5 7l3 3M2.5 7H10a3.5 3.5 0 0 1 0 7H7', redo: 'M10.5 4l3 3-3 3M13.5 7H6a3.5 3.5 0 0 0 0 7h3', search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.6 10.6L14 14',
  eye: 'M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', eyeoff: 'M2 2l12 12M6.5 4C7 3.7 7.5 3.5 8 3.5c4.1 0 6.5 4.5 6.5 4.5s-.7 1.3-2 2.5M4 5.3C2.4 6.5 1.5 8 1.5 8s2.4 4.5 6.5 4.5c1 0 1.9-.3 2.7-.7',
  lock: 'M4 7.5h8v6H4zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5', unlock: 'M4 7.5h8v6H4zM5.5 7.5V5a2.5 2.5 0 0 1 4.8-1', help: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M8 11.3v.2',
  back: 'M10 3L5 8l5 5', more: 'M3.5 8h.01M8 8h.01M12.5 8h.01', close: 'M3.5 3.5l9 9M12.5 3.5l-9 9', sun: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1', moon: 'M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z',
  checks: 'M2.5 8.5l3 3 8-8', details: 'M3 4h10M3 8h10M3 12h6',
  line: 'M3 13L13 3M2 12h2v2H2zM12 2h2v2h-2z', pline: 'M2.5 12.5l3-7 4 4 4-7', rect: 'M2.5 4h11v8h-11z', circle: 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 8h.01', arc: 'M2.5 12.5a5.5 5.5 0 0 1 11 0',
  text: 'M3 3.5h10M8 3.5v10M6 13.5h4', leader: 'M2.5 13.5l6-6h5M2.5 13.5l.6-2.6M2.5 13.5l2.6-.6', cloud: 'M3 11a2 2 0 0 1 0-4 2.2 2.2 0 0 1 3.8-2 2.4 2.4 0 0 1 4.4.6A2.2 2.2 0 0 1 13 11z',
  move: 'M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2', copy: 'M5.5 5.5h8v8h-8zM2.5 10.5v-8h8', rotate: 'M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5',
  mirror: 'M8 1.5v13M6 4L2.5 12H6zM10 4l3.5 8H10z', scale: 'M2.5 13.5v-5h5v5zM7.5 8.5l6-6M9.5 2.5h4v4', offset: 'M2.5 11.5h11M2.5 6.5h11M8 8l0 2M7 9l1 1.2L9 9', trim: 'M2 13L13 2M9 3l4 4M4.5 8.5l-2 2', extend: 'M2 13l7-7M11 2v12M7.5 7.5l1.5-1.5', erase: 'M6 13.5h7.5M3 10l5.5-5.5 4 4L9 12H5z',
  save: 'M3 2.5h8l2.5 2.5v8.5h-10.5zM5 2.5v3.5h5V2.5M5 13.5v-4h6v4', zoomwin: 'M2.5 2.5h7v7h-7zM8 8l5.5 5.5',
  zoomadu: 'M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5M5 11V7.5L8 5l3 2.5V11z', pinoff: 'M2 2l12 12M8 14.5s4.5-4.2 4.5-7.5c0-.9-.3-1.8-.7-2.5M10.6 3A4.5 4.5 0 0 0 3.5 7c0 3.3 4.5 7.5 4.5 7.5',
};
export const Icon = ({ n, s = 16 }: { n: string; s?: number }) => <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="ico"><path d={ICONS[n]} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** Rail tools: Select and Pan are viewport modes; the rest start commands. `key` is the single-key shortcut. */
const RAIL: { id: string; cmd?: string; key?: string; icon: string; en: string; sep?: boolean }[] = [
  { id: 'select', key: 'V', icon: 'select', en: 'Select' }, { id: 'pan', key: 'H', icon: 'pan', en: 'Pan' },
  { id: 'line', cmd: 'LINE', icon: 'line', en: 'Line', sep: true }, { id: 'pline', cmd: 'PLINE', icon: 'pline', en: 'Polyline' }, { id: 'rect', cmd: 'RECTANG', icon: 'rect', en: 'Rectangle' }, { id: 'circle', cmd: 'CIRCLE', icon: 'circle', en: 'Circle' }, { id: 'arc', cmd: 'ARC', icon: 'arc', en: 'Arc' },
  { id: 'room', cmd: 'ROOM', key: 'W', icon: 'room', en: 'Wall / Room', sep: true }, { id: 'door', cmd: 'DOOR', key: 'D', icon: 'door', en: 'Door' }, { id: 'window', cmd: 'WINDOW', key: 'N', icon: 'window', en: 'Window' },
  { id: 'dim', cmd: 'DIMALIGNED', key: 'I', icon: 'dim', en: 'Dimension', sep: true }, { id: 'text', cmd: 'TEXT', icon: 'text', en: 'Text' }, { id: 'leader', cmd: 'LEADER', icon: 'leader', en: 'Leader' }, { id: 'cloud', cmd: 'REVCLOUD', icon: 'cloud', en: 'Revision cloud' }, { id: 'pin', cmd: 'PIN', key: 'P', icon: 'pin', en: 'Markup pin' },
  { id: 'measure', cmd: 'DIST', key: 'M', icon: 'measure', en: 'Measure', sep: true },
];
const MODIFY: { cmd: string; icon: string; en: string }[] = [
  { cmd: 'MOVE', icon: 'move', en: 'Move' }, { cmd: 'COPY', icon: 'copy', en: 'Copy' }, { cmd: 'ROTATE', icon: 'rotate', en: 'Rotate' }, { cmd: 'MIRROR', icon: 'mirror', en: 'Mirror' }, { cmd: 'SCALE', icon: 'scale', en: 'Scale' },
  { cmd: 'OFFSET', icon: 'offset', en: 'Offset' }, { cmd: 'TRIM', icon: 'trim', en: 'Trim' }, { cmd: 'EXTEND', icon: 'extend', en: 'Extend' }, { cmd: 'ERASE', icon: 'erase', en: 'Erase' },
];
const SHEETS: { id: SheetId; en: string }[] = [{ id: 'model', en: 'Model' }, { id: 'a1', en: 'A-1 Site' }, { id: 'a2', en: 'A-2 Floor' }, { id: 'g2', en: 'G-2 Markup' }];
const INCS = [inch(1), inch(3), inch(6), ft(1)];
/** One status vocabulary for Guided and Pro: Fix, Need info, Pass, Off (not checked), Note. */
export const STATUS_LABEL = (s: string) => (s === 'FAIL' ? L('Fix') : s === 'UNKNOWN' ? L('Need info') : s === 'NOT_CHECKED' ? L('Off') : s === 'INFO' ? L('Note') : L('Pass'));
const CMD_EN: Record<string, string> = { LINE: 'Line', PLINE: 'Polyline', RECTANG: 'Rectangle', CIRCLE: 'Circle', ARC: 'Arc', TEXT: 'Text', MTEXT: 'Multiline text', LEADER: 'Leader', REVCLOUD: 'Revision cloud', DIMLINEAR: 'Linear dimension', DIMALIGNED: 'Aligned dimension', DIST: 'Measure distance', AREA: 'Measure area', MOVE: 'Move', COPY: 'Copy', ROTATE: 'Rotate', MIRROR: 'Mirror', SCALE: 'Scale', ERASE: 'Erase', OFFSET: 'Offset', TRIM: 'Trim', EXTEND: 'Extend', ROOM: 'Room', DOOR: 'Door', WINDOW: 'Window', PIN: 'Review note', ZOOM: 'Zoom extents', ZOOMADU: 'Zoom to ADU', MARKUP: 'Show or hide markups', UNDO: 'Undo', REDO: 'Redo', LAYER: 'Layers', ORTHO: 'Ortho', GRID: 'Grid', SNAP: 'Snap', OSNAP: 'Object snap', POLAR: 'Polar tracking', UNITS: 'Units', HELP: 'Help' };

type Tab = 'checks' | 'props' | 'layers' | 'takeoff';
interface Cmd { id: string; label: string; key?: string; group: string; run: () => void }

export function Workspace(W: WorkspaceProps) {
  const { p, verdict, lang } = W; const es = lang === 'es';
  const api = useRef<CanvasApi>(null);
  const [tool, setTool] = useState<'select' | 'pan'>('select'); const [sheet, setSheet] = useState<SheetId>('model');
  const [tab, setTab] = useState<Tab>('checks'); const [sel, setSel] = useState<Sel | null>(null); const [activeIssue, setActiveIssue] = useState<string | null>(null);
  const [osnap, setOsnap] = useState(() => store.get('opa.pro.osnap') !== '0'); const [orthoOn, setOrtho] = useState(() => store.get('opa.pro.ortho') === '1');
  const [polarOn, setPolar] = useState(() => store.get('opa.pro.polar') === '1');
  const [gridOn, setGrid] = useState(() => store.get('opa.pro.grid') !== '0'); const [snapOn, setSnapOn] = useState(() => store.get('opa.pro.snap') !== '0');
  const [snapInc, setSnapInc] = useState(() => { const v = Number(store.get('opa.pro.inc')); return INCS.includes(v) ? v : inch(6); });
  const [lwt, setLwt] = useState(() => store.get('opa.pro.lwt') !== '0');
  const [units, setUnitsState] = useState<'ftin' | 'metric'>(() => (store.get('opa.pro.units') === 'metric' ? 'metric' : 'ftin')); setUnits(units);
  const [msTheme, setMsTheme] = useState<'auto' | 'dark' | 'light'>(() => (store.get('opa.pro.ms') as 'dark' | 'light' | null) ?? 'auto');
  const [sysDark, setSysDark] = useState(prefersDark);
  useEffect(() => { if (typeof matchMedia === 'undefined') return; const m = matchMedia('(prefers-color-scheme: dark)'); const on = () => setSysDark(m.matches); m.addEventListener?.('change', on); return () => m.removeEventListener?.('change', on); }, []);
  const dark = msTheme === 'auto' ? sysDark : msTheme === 'dark';
  const [layers, setLayers] = useState<Record<string, LayerState>>(() => { let saved: Record<string, LayerState> = {}; try { saved = JSON.parse(store.get('opa.pro.layers') ?? '{}'); } catch { /* ignore */ } return Object.fromEntries(LAYERS.map(l => [l.id, { on: saved[l.id]?.on !== false, locked: !!saved[l.id]?.locked }])); });
  useEffect(() => { store.set('opa.pro.layers', JSON.stringify(layers)); }, [layers]);
  useEffect(() => { store.set('opa.pro.osnap', osnap ? '1' : '0'); store.set('opa.pro.ortho', orthoOn ? '1' : '0'); store.set('opa.pro.polar', polarOn ? '1' : '0'); store.set('opa.pro.grid', gridOn ? '1' : '0'); store.set('opa.pro.snap', snapOn ? '1' : '0'); store.set('opa.pro.inc', String(snapInc)); store.set('opa.pro.lwt', lwt ? '1' : '0'); store.set('opa.pro.ms', msTheme); store.set('opa.pro.units', units); }, [osnap, orthoOn, polarOn, gridOn, snapOn, snapInc, lwt, msTheme, units]);
  const [cursor, setCursor] = useState<Pt | null>(null); const [scale, setScale] = useState(''); const [annoMm, setAnnoMm] = useState(ft(1));
  const [live, setLive] = useState(''); const say = (m: string) => { setLive(''); requestAnimationFrame(() => setLive(m)); setHist(h => [...h.slice(-30), m]); };
  const [palette, setPalette] = useState(false); const [help, setHelp] = useState(false); const [panel, setPanel] = useState<Step | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => { const on = () => setOnline(navigator.onLine !== false); window.addEventListener('online', on); window.addEventListener('offline', on); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); }; }, []);
  const [phone, setPhone] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 719px)').matches);
  useEffect(() => { if (typeof matchMedia === 'undefined') return; const m = matchMedia('(max-width: 719px)'); const on = () => setPhone(m.matches); m.addEventListener?.('change', on); return () => m.removeEventListener?.('change', on); }, []);
  const [sheetUp, setSheetUp] = useState<'peek' | 'half' | 'full'>('peek');
  // Touch screens: the command line stays hidden until asked for (More > Command line); taps drive the tools.
  const [touch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches); const [cmdShown, setCmdShown] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const markupOn = layers['G-ANNO-REDL']?.on !== false;
  const toggleMarkup = () => setLayers(l => ({ ...l, 'G-ANNO-REDL': { ...l['G-ANNO-REDL'], on: !markupOn } }));

  // ----- command engine -----
  const [st, setSt] = useState<St>(IDLE); const [prompt, setPrompt] = useState(''); const [hist, setHist] = useState<string[]>([]); const lastCmd = useRef<string | null>(null);
  const [cmdCursor, setCmdCursor] = useState<Pt | null>(null); const cmdIn = useRef<HTMLInputElement>(null); const [line, setLine] = useState('');
  const pRef = useRef(p); pRef.current = p; const selRef = useRef(sel); selRef.current = sel;
  const ctx = (): Ctx => { const s = selRef.current; const cad = pRef.current.cad ?? DEFAULT_CAD(); return { p: pRef.current, cursor: cmdCursor, sel: s?.kind === 'ents' ? s.ids : [], room: s?.kind === 'room' ? s.id : null, layer: cad.current, textH: Math.max(inch(3), annoMm), /* annotative: 3/32" plotted at the current scale */ newId: uid, es,
    hit: q => { const tol = Math.max(ft(0.5), annoMm * 0.6); const ents = pRef.current.cad?.ents ?? []; for (let i = ents.length - 1; i >= 0; i--) if (entDist(ents[i], q) <= tol) return { ent: ents[i].id }; const h = hitTest(pRef.current, q, tol); return h?.kind === 'room' ? { room: h.id } : null; } }; };
  const run = (o: Out) => {
    setSt(o.st); setPrompt(o.st.name ? o.prompt : '');
    if (o.st.name) { lastCmd.current = o.st.name; setSel(s => (o.st.step === 'sel' ? s : s)); }
    for (const f of o.fx) {
      if (f.kind === 'apply') { const d: Project = structuredClone(pRef.current); try { f.fn(d); } catch { say(L('That would put the room outside the garage walls. Nothing changed.')); continue; } W.update(x => { Object.assign(x, d); }); if (f.msg) say(f.msg); }
      else if (f.kind === 'say') say(f.msg);
      else if (f.kind === 'select') setSel(f.room ? { kind: 'room', id: f.room } : f.ids.length ? { kind: 'ents', ids: f.ids } : null);
      else if (f.kind === 'toggle') { const m = { ortho: () => setOrtho(v => !v), grid: () => setGrid(v => !v), snap: () => setSnapOn(v => !v), osnap: () => setOsnap(v => !v), polar: () => setPolar(v => !v), units: () => setUnitsState(u => (u === 'ftin' ? 'metric' : 'ftin')) }; m[f.what](); say(`${L(CMD_EN[f.what.toUpperCase()] ?? f.what)}: ${L('switched')}`); }
      else if (f.kind === 'view') { if (f.what === 'fit') api.current?.fit(); if (f.what === 'adu') api.current?.zoomAdu(); if (f.what === 'markup') toggleMarkup(); if (f.what === 'undo') W.undo(); if (f.what === 'redo') W.redo(); if (f.what === 'layers') setTab('layers'); if (f.what === 'help') setHelp(true); }
    }
  };
  const begin = (name: string) => { if (sheet !== 'model') setSheet('model'); setTool('select'); const o = start(name, ctx()); run(o); if (o.st.name) say(`${L(CMD_EN[o.st.name] ?? o.st.name)}: ${o.prompt}`); };
  // History echoes commands and typed points, never note text (AutoCAD shows "Command: TEXT", not the words typed).
  const submit = (raw: string) => { const s = raw; setLine(''); if (!s.trim()) { run(cmdEnter(st, ctx(), lastCmd.current)); return; }
    if (!st.name) { const nm = ALIASES[s.trim().toUpperCase()] ?? s.trim().toUpperCase(); setHist(h => [...h.slice(-30), `${L('Command')}: ${nm}`]); begin(s.trim()); return; }
    const isText = (st.name === 'TEXT' || st.name === 'MTEXT' || st.name === 'LEADER') && st.step === 's';
    if (!isText) setHist(h => [...h.slice(-30), `${prompt ? prompt.replace(/[:.]?\s*$/, '') + ': ' : ''}${s}`]);
    run(cmdTextFn(st, s, ctx())); };
  const cancel = () => { if (st.name) run(cmdEsc(ctx())); };
  const ghost = useMemo(() => previewOf(st, cmdCursor, ctx()), [st, cmdCursor, p, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (W.pinRequest) { setPanel(null); begin('PIN'); } }, [W.pinRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const issues = useMemo(() => issuesOf(p, verdict.report.results), [p, verdict]);
  useEffect(() => { if (!sel) return; const gone = (sel.kind === 'room' && !p.adu.rooms.some(r => r.id === sel.id)) || (sel.kind === 'opening' && !p.adu.rooms.some(r => r.id === sel.room && r.openings.some(o => o.id === sel.id))) || (sel.kind === 'pin' && !p.markup.pins.some(x => x.id === sel.id)) || (sel.kind === 'ents' && !sel.ids.every(id => p.cad?.ents.some(e => e.id === id))); if (gone) setSel(sel.kind === 'ents' ? (() => { const ids = sel.ids.filter(id => p.cad?.ents.some(e => e.id === id)); return ids.length ? { kind: 'ents', ids } : null; })() : null); }, [p, sel]);

  const goIssue = (id: string) => { const i = issues.find(x => x.id === id); setActiveIssue(id); setTab('checks'); if (phone) setSheetUp('half'); if (i?.at) { if (sheet !== 'model') setSheet('model'); requestAnimationFrame(() => api.current?.zoomTo(i.at!, ft(36))); } requestAnimationFrame(() => document.getElementById('iss-' + id)?.scrollIntoView?.({ block: 'nearest' })); };
  const pickRail = (id: string) => { const t = RAIL.find(x => x.id === id)!; if (st.name) run(cmdEsc(ctx())); if (t.cmd) begin(t.cmd); else { setTool(id as 'select' | 'pan'); say(L(t.en)); } };
  const slug = (p.site.address || p.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'project';
  const exportCsv = () => W.download(`${slug}-materials.csv`, '﻿' + takeoffCSV(takeoff(p), es), 'text/csv');
  const saveBackup = () => { W.download(`${slug}.permitpack`, serialize(p), 'application/json'); say(L('Backup saved to your downloads.')); };

  const cmds: Cmd[] = [
    ...RAIL.map(t => ({ id: 'tool-' + t.id, label: `${L('Tool')}: ${L(t.en)}${t.cmd ? ` (${t.cmd})` : ''}`, key: t.key, group: L('Draw'), run: () => pickRail(t.id) })),
    ...MODIFY.map(m => ({ id: 'mod-' + m.cmd, label: `${L(m.en)} (${m.cmd})`, group: L('Modify'), run: () => begin(m.cmd) })),
    ...['MTEXT', 'DIMLINEAR', 'AREA'].map(c => ({ id: 'c-' + c, label: `${L(CMD_EN[c])} (${c})`, group: L('Draw'), run: () => begin(c) })),
    { id: 'fit', label: L('Zoom extents'), key: 'F', group: L('View'), run: () => api.current?.fit() },
    { id: 'zadu', label: L('Zoom to ADU'), key: 'A', group: L('View'), run: () => api.current?.zoomAdu() },
    { id: 'markup', label: `${L('Markups')}: ${markupOn ? L('hide') : L('show')}`, group: L('View'), run: toggleMarkup },
    { id: 'zsel', label: L('Zoom to selection'), key: 'Shift+F', group: L('View'), run: () => api.current?.zoomSel() },
    { id: 'zwin', label: L('Zoom window'), group: L('View'), run: () => api.current?.zoomWindow() },
    { id: 'zin', label: L('Zoom in'), key: '+', group: L('View'), run: () => api.current?.zoomBy(1.25) }, { id: 'zout', label: L('Zoom out'), key: '−', group: L('View'), run: () => api.current?.zoomBy(0.8) },
    ...SHEETS.map(s => ({ id: 'sheet-' + s.id, label: `${L('Sheet')}: ${L(s.en)}`, group: L('Sheets'), run: () => setSheet(s.id) })),
    { id: 'osnap', label: `${L('Object snap')}: ${osnap ? L('turn off') : L('turn on')}`, key: 'F3', group: L('Drafting aids'), run: () => setOsnap(v => !v) },
    { id: 'grid', label: `${L('Grid')}: ${gridOn ? L('turn off') : L('turn on')}`, key: 'F7', group: L('Drafting aids'), run: () => setGrid(v => !v) },
    { id: 'ortho', label: `${L('Ortho')}: ${orthoOn ? L('turn off') : L('turn on')}`, key: 'F8', group: L('Drafting aids'), run: () => setOrtho(v => !v) },
    { id: 'snap', label: `${L('Snap to increment')}: ${snapOn ? L('turn off') : L('turn on')}`, key: 'F9', group: L('Drafting aids'), run: () => setSnapOn(v => !v) },
    { id: 'polar', label: `${L('Polar tracking')}: ${polarOn ? L('turn off') : L('turn on')}`, key: 'F10', group: L('Drafting aids'), run: () => setPolar(v => !v) },
    { id: 'lwt', label: `${L('Line weights')}: ${lwt ? L('turn off') : L('turn on')}`, group: L('Drafting aids'), run: () => setLwt(v => !v) },
    { id: 'units', label: `${L('Units')}: ${units === 'ftin' ? L('metric (mm)') : L('feet and inches')}`, group: L('Drafting aids'), run: () => setUnitsState(u => (u === 'ftin' ? 'metric' : 'ftin')) },
    { id: 'theme', label: `${L('Model space')}: ${dark ? L('light') : L('dark')}`, group: L('View'), run: () => setMsTheme(dark ? 'light' : 'dark') },
    { id: 'undo', label: L('Undo'), key: 'Ctrl+Z', group: L('Edit'), run: W.undo }, { id: 'redo', label: L('Redo'), key: 'Ctrl+Shift+Z', group: L('Edit'), run: W.redo },
    { id: 'cmdline', label: L('Command line'), key: '/', group: L('Edit'), run: () => { setCmdShown(true); if (phone) setSheetUp('half'); requestAnimationFrame(() => cmdIn.current?.focus()); } },
    { id: 'p-lot', label: L('Lot and parcel lookup…'), group: L('Project data'), run: () => setPanel('lot') },
    { id: 'p-garage', label: L('Garage details…'), group: L('Project data'), run: () => setPanel('garage') },
    { id: 'p-rooms', label: L('Rooms and openings list…'), group: L('Project data'), run: () => setPanel('rooms') },
    { id: 'p-checks', label: L('Check groups and sheet items…'), group: L('Project data'), run: () => setPanel('checks') },
    { id: 'p-export', label: L('Export: PDF, DXF, handoff packet, backup…'), group: L('Export'), run: () => setPanel('export') },
    { id: 'p-review', label: L('Review notes and plan-set check…'), group: L('Review'), run: () => setPanel('review') },
    { id: 'backup', label: L('Save backup (.permitpack)'), group: L('Export'), run: saveBackup },
    { id: 'csv', label: L('Materials list (CSV)'), group: L('Export'), run: exportCsv },
    { id: 'field', label: L('Site visit (field mode)'), group: L('Review'), run: W.openField },
    { id: 'clean', label: L('Clean and fix a DWG or DXF file'), group: L('Tools'), run: W.openClean },
    { id: 'guided', label: L('Switch to Guided mode'), group: L('Workspace'), run: () => W.toGuided() },
    ...UI_LANGS.filter(c => c !== W.ui).map(c => ({ id: 'lang-' + c, label: `${L('Language')}: ${c === 'en' ? 'English' : c === 'es' ? 'Español' : nativeName(c)}`, group: L('Workspace'), run: () => W.setLang(c) })),
    { id: 'help', label: L('Keyboard shortcuts'), key: '?', group: L('Workspace'), run: () => setHelp(true) },
    { id: 'projects', label: L('All projects'), group: L('Workspace'), run: W.close },
  ];

  // Single-key shortcuts (not while typing), / for the command line, Ctrl/Cmd+K palette, F-keys for drafting aids. Other letters and digits type into the command line.
  const SINGLE = new Set(['V', 'H', 'M', 'W', 'D', 'N', 'P', 'I', 'F', 'A']);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(v => !v); return; }
      const fk: Record<string, () => void> = { F2: () => setHistOpen(v => !v), F3: () => setOsnap(v => !v), F7: () => setGrid(v => !v), F8: () => setOrtho(v => !v), F9: () => setSnapOn(v => !v), F10: () => setPolar(v => !v) };
      if (fk[e.key]) { e.preventDefault(); fk[e.key](); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || palette || help) return;
      if (e.key === 'Escape') { if (st.name) cancel(); else if (panel) setPanel(null); else if (tool !== 'select') setTool('select'); else setSel(null); return; }
      if (e.key === '?') { e.preventDefault(); setHelp(true); return; }
      if (e.key === '/') { e.preventDefault(); cmdIn.current?.focus(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !st.name) { e.preventDefault();
        if (sel.kind === 'ents' || sel.kind === 'room') { run(start('ERASE', ctx())); return; }
        if (sel.kind === 'opening') { W.update(d => { const r = d.adu.rooms.find(x => x.id === sel.room); if (r) r.openings = r.openings.filter(o => o.id !== sel.id); }); setSel(null); say(L('Opening deleted.')); }
        if (sel.kind === 'pin') { W.update(d => { d.markup.pins = d.markup.pins.filter(x => x.id !== sel.id); }); setSel(null); say(L('Review note deleted.')); }
        return; }
      if ((e.key === ' ' || e.key === 'Enter') && st.name && t?.tagName !== 'BUTTON') { if (e.key === ' ' && t?.closest('svg')) return; e.preventDefault(); run(cmdEnter(st, ctx(), lastCmd.current)); return; }
      const k = e.key.toUpperCase();
      if (!st.name && !e.shiftKey && SINGLE.has(k)) { e.preventDefault(); if (k === 'F') { api.current?.fit(); return; } if (k === 'A') { api.current?.zoomAdu(); return; } const r = RAIL.find(x => x.key === k); if (r) pickRail(r.id); return; }
      if (e.shiftKey && k === 'F' && !st.name) { e.preventDefault(); api.current?.zoomSel(); return; }
      // Anything else that can start a command or a typed point goes to the command line.
      if (/^[a-zA-Z0-9@.,<'"\-]$/.test(e.key)) { e.preventDefault(); setLine(v => v + e.key); cmdIn.current?.focus(); }
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  });

  const counts = verdict.counts; const nIssues = counts.FAIL;
  const plain = verdict.plain[es ? 'es' : 'en'];
  const blank = !p.confirmed.lot && !p.confirmed.adu && !p.site.address;
  const crumbs = [p.site.address ? p.site.address.split(',')[0] : p.name, p.adu.mode === 'conversion' ? L('Garage conversion') : L('New ADU'), L(SHEETS.find(s => s.id === sheet)!.en)];
  const activeRail = st.name ? RAIL.find(r => r.cmd === st.name)?.id ?? null : tool;

  const canvas = <Canvas ref={api} p={p} es={es} sheet={sheet} layers={layers} lwt={lwt} dark={dark} tool={st.name ? 'cmd' : tool} units={units} osnap={osnap} orthoOn={orthoOn} polarOn={polarOn} gridOn={gridOn} snapOn={snapOn} snapInc={snapInc}
    sel={sel} onSel={s => { setSel(s); if (s && !phone && !st.name) setTab('props'); if (s && phone && !st.name) setSheetUp('half'); }} issues={issues} activeIssue={activeIssue} onIssue={goIssue} onCursor={setCursor} onScale={(l, a) => { setScale(l); setAnnoMm(a); }} say={say}
    preview={W.preview} commit={W.commit}
    cmd={{ active: !!st.name, selecting: st.step === 'sel', base: basePt(st), ghost, cursorSet: q => { if (st.name) setCmdCursor(q); }, pick: q => run(point(st, q, ctx())) }} />;

  const checksTab = <ChecksPanel issues={issues} verdict={verdict} es={es} active={activeIssue} onPick={goIssue} update={W.update} openStep={setPanel} say={say} northSet={p.site.northDeg != null} />;
  const propsTab = <Properties p={p} sel={sel} update={W.update} openStep={setPanel} setSel={setSel} phone={phone} />;
  const layersTab = <LayersPanel p={p} update={W.update} layers={layers} setLayers={setLayers} />;
  const takeoffTab = <TakeoffPanel p={p} es={es} onCsv={exportCsv} />;
  const tabBody = tab === 'checks' ? checksTab : tab === 'props' ? propsTab : tab === 'layers' ? layersTab : takeoffTab;
  const tabs: { id: Tab; en: string }[] = [{ id: 'checks', en: 'Checks' }, { id: 'props', en: 'Properties' }, { id: 'layers', en: 'Layers' }, { id: 'takeoff', en: 'Takeoff' }];
  const tabList = <div className="pw-tabs" role="tablist" aria-label={L('Inspector')}>{tabs.map(t => <button key={t.id} type="button" role="tab" id={'tab-' + t.id} aria-selected={tab === t.id} aria-controls="pw-tabpanel" tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}
    onKeyDown={e => { const i = tabs.findIndex(x => x.id === tab); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setTab(n.id); document.getElementById('tab-' + n.id)?.focus(); } }}>
    {L(t.en)}{t.id === 'checks' && nIssues > 0 && <span className="pw-badge" aria-label={`${nIssues} ${L('to fix')}`}>{nIssues}</span>}</button>)}</div>;

  const sugg = !st.name && line.trim() ? COMMANDS.filter(c => c.startsWith(line.trim().toUpperCase()) || Object.entries(ALIASES).some(([a, v]) => v === c && a.startsWith(line.trim().toUpperCase()) && a.length <= 3)).slice(0, 6) : [];
  const cmdLine = <div className="pw-cmd" role="group" aria-label={L('Command line')}>
    <div className={`pw-cmd-hist${histOpen ? ' open' : ''}`} aria-hidden>{hist.slice(histOpen ? -12 : -1).map((h, i) => <div key={i}>{h}</div>)}</div>
    <button type="button" className="pw-cmd-x" aria-expanded={histOpen} onClick={() => setHistOpen(v => !v)} title={`${L('Command history')} (F2)`} aria-label={`${L('Command history')} (F2)`}>{histOpen ? '▾' : '▴'}</button>
    <div className="pw-cmd-row"><label htmlFor="pw-cmd-in" className="pw-cmd-p">{prompt || `${L('Command')}:`}</label>
      <input id="pw-cmd-in" ref={cmdIn} value={line} autoComplete="off" spellCheck={false} placeholder={prompt ? '' : 'L, PL, C, DLI, M, RO…'} aria-describedby="pw-cmd-hint" aria-autocomplete="list" aria-controls={sugg.length ? 'pw-cmd-sugg' : undefined}
        onChange={e => setLine(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(sugg.length && !st.name && !ALIASES[line.trim().toUpperCase()] ? sugg[0] : line); } else if (e.key === 'Escape') { e.preventDefault(); setLine(''); cancel(); (document.querySelector('[data-testid=viewport] svg') as HTMLElement | null)?.focus(); } else if (e.key === ' ' && !st.name && line.trim()) { e.preventDefault(); submit(line); } else if (e.key === 'Tab' && sugg.length) { e.preventDefault(); setLine(sugg[0]); } }} />
      <span id="pw-cmd-hint" className="sr">{L('Type a command name or alias and press Enter. Points: x,y or @dx,dy or @distance<angle, or a distance along the cursor.')}</span></div>
    {sugg.length > 0 && <ul id="pw-cmd-sugg" className="pw-cmd-sugg" role="listbox" aria-label={L('Matching commands')}>{sugg.map(c => <li key={c} role="option" aria-selected="false" onMouseDown={e => { e.preventDefault(); submit(c); }}><b>{c}</b> <span className="mut">{L(CMD_EN[c] ?? c)}</span></li>)}</ul>}
  </div>;

  // Status bar: items drop into the "…" menu by priority as the bar narrows (coords > scale > SNAP/GRID/ORTHO/OSNAP > units > LWT/POLAR > theme).
  const statusItems: StatusItem[] = [
    { id: 'snap', w: 104, prio: 3, node: <><Toggle on={snapOn} set={setSnapOn} label={L('Snap')} k="F9" /><label className="pw-inc"><span className="sr">{L('Snap increment')}</span><select value={snapInc} onChange={e => setSnapInc(Number(e.target.value))}>{INCS.map(v => <option key={v} value={v}>{fmtArch(v).replace(/^0'-/, '')}</option>)}</select></label></> },
    { id: 'grid', w: 50, prio: 3, node: <Toggle on={gridOn} set={setGrid} label={L('Grid')} k="F7" /> },
    { id: 'ortho', w: 58, prio: 3, node: <Toggle on={orthoOn} set={setOrtho} label={L('Ortho')} k="F8" /> },
    { id: 'osnap', w: 58, prio: 3, node: <Toggle on={osnap} set={setOsnap} label={L('Osnap')} k="F3" /> },
    { id: 'units', w: 52, prio: 4, node: <button type="button" className="pw-tog" onClick={() => setUnitsState(u => (u === 'ftin' ? 'metric' : 'ftin'))} aria-label={`${L('Units')}: ${units === 'ftin' ? L('feet and inches') : L('millimeters')}`}>{units === 'ftin' ? 'ft-in' : 'mm'}</button> },
    { id: 'polar', w: 58, prio: 5, node: <Toggle on={polarOn} set={setPolar} label={L('Polar')} k="F10" /> },
    { id: 'lwt', w: 46, prio: 5, node: <Toggle on={lwt} set={setLwt} label={L('LWT')} /> },
    { id: 'markup', w: 78, prio: 5, node: <Toggle on={markupOn} set={() => toggleMarkup()} label={L('Markups')} /> },
    { id: 'theme', w: 34, prio: 6, node: <button type="button" className="pw-ibtn" onClick={() => setMsTheme(dark ? 'light' : 'dark')} aria-label={dark ? L('Light model space') : L('Dark model space')} title={dark ? L('Light model space') : L('Dark model space')}><Icon n={dark ? 'sun' : 'moon'} /></button> },
  ];
  const status = <StatusBar items={statusItems} lead={<><span className="pw-xy" aria-live="off">{cursor ? `X ${fmtArch(cursor.x)}  Y ${fmtArch(cursor.y)}` : `X —  Y —`}</span>
    <span className="pw-sep" /><span className="pw-scale" title={L('Scale')}>{scale}</span><span className="pw-sep" /></>} />;

  const sheetTabs = <div className="pw-sheets" role="tablist" aria-label={L('Sheets')}>{SHEETS.map(s => <button key={s.id} type="button" role="tab" aria-selected={sheet === s.id} onClick={() => setSheet(s.id)}>{L(s.en)}</button>)}</div>;
  const modBar = sheet === 'model' && <div className="pw-modbar" role="toolbar" aria-label={L('Modify')}>{MODIFY.map(m => <button key={m.cmd} type="button" aria-pressed={st.name === m.cmd} aria-label={`${L(m.en)} (${m.cmd})`} title={`${L(m.en)} (${m.cmd})`} onClick={() => { if (st.name) run(cmdEsc(ctx())); begin(m.cmd); }}><Icon n={m.icon} /></button>)}
    <span className="pw-modsep" /><button type="button" aria-label={L('Zoom window')} title={L('Zoom window')} onClick={() => api.current?.zoomWindow()}><Icon n="zoomwin" /></button><button type="button" aria-label={`${L('Zoom to ADU')} (A)`} title={`${L('Zoom to ADU')} (A)`} onClick={() => api.current?.zoomAdu()}><Icon n="zoomadu" /></button><button type="button" aria-label={`${L('Zoom extents')} (F)`} title={`${L('Zoom extents')} (F)`} onClick={() => api.current?.fit()}><Icon n="fit" /></button>
    <span className="pw-modsep" /><button type="button" aria-pressed={markupOn} aria-label={markupOn ? L('Hide markups') : L('Show markups')} title={`${markupOn ? L('Hide markups') : L('Show markups')} (MARKUP)`} onClick={toggleMarkup}><Icon n={markupOn ? 'pin' : 'pinoff'} /></button></div>;

  const overlays = <>
    {palette && <Palette cmds={cmds} onClose={() => setPalette(false)} />}
    {help && <HelpOverlay onClose={() => setHelp(false)} />}
    {panel && <div className="pw-panel" role="dialog" aria-modal="false" aria-label={L('Project data')}>
      <div className="pw-panel-h"><strong>{({ lot: L('Lot and parcel'), garage: L('Garage details'), rooms: L('Rooms and openings'), checks: L('Check groups and sheet items'), export: L('Export'), review: L('Review') } as Record<Step, string>)[panel]}</strong><span className="grow" />
        <button type="button" className="pw-btn" onClick={() => { const s = panel; setPanel(null); W.toGuided(s); }}>{L('Open in Guided')}</button>
        <button type="button" className="pw-ibtn" aria-label={L('Close')} onClick={() => setPanel(null)}><Icon n="close" /></button></div>
      <div className="pw-panel-b form">{W.panel(panel)}</div></div>}
    <p className="sr" role="status" aria-live="polite">{live}</p>
  </>;

  const empty = blank && sheet === 'model' && !st.name && <div className="pw-empty" role="note"><strong>{L('Start with the lot')}</strong><span>{L('The drawing uses placeholder sizes until you enter the lot, house and garage.')}</span>
    <div className="pw-row"><button type="button" className="pw-btn primary" onClick={() => setPanel('lot')}>{L('Enter the address')}</button><button type="button" className="pw-btn" onClick={() => setPanel('garage')}>{L('Garage size')}</button></div></div>;

  if (phone) {
    const sel1 = sel ? describeSel(p, sel, es) : null; const iss = issues.find(i => i.id === activeIssue) ?? issues.find(i => i.n);
    return <div className={`pw pw-phone${dark ? ' pw-msdark' : ''}`}>
      <header className="pw-ph-top">
        <button type="button" className="pw-ibtn" aria-label={L('All projects')} onClick={W.close}><Icon n="back" /></button>
        <div className="pw-ph-title"><h1>{crumbs[0]}</h1><div className="sub">{L(SHEETS.find(s => s.id === sheet)!.en)} · {online ? W.saveText : L('Offline · saved on this device')}</div></div>
        <button type="button" className="pw-btn primary" onClick={() => setPanel('export')}>{L('Export')}</button>
      </header>
      {sheetTabs}
      <div className="pw-ph-canvas">{canvas}{empty}<span className="pw-scale-chip" aria-label={`${L('Scale')}: ${scale}`}>{scale}</span>{st.name && <div className="pw-ph-prompt" role="status">{prompt}<button type="button" className="pw-btn" onClick={() => run(cmdEnter(st, ctx(), null))}>{L('Done')}</button><button type="button" className="pw-btn" onClick={cancel}>{L('Cancel')}</button></div>}{sel1 && sheetUp === 'peek' && !st.name && <div className="pw-chip" aria-hidden>{sel1}</div>}</div>
      {W.banners}
      <section className={`pw-sheet pw-sheet-${sheetUp}`} aria-label={L('Inspector')}>
        <button type="button" className="pw-grab" aria-label={sheetUp === 'peek' ? L('Show more') : L('Show less')} aria-expanded={sheetUp !== 'peek'} onClick={() => setSheetUp(sheetUp === 'peek' ? 'half' : sheetUp === 'half' ? 'full' : 'peek')}><span /></button>
        {sheetUp === 'peek' ? <div className="pw-peek" data-testid="plain-answer-pro">{iss ? <><span className={`pw-num ${iss.status === 'FAIL' ? 'fix' : 'need'}`}>{iss.n ?? '·'}</span><b>{iss.r.rule.title[es ? 'es' : 'en']}</b><span className="grow" /><span className="mut">{counts.PASS} {L('pass')}</span></> : <b>{plain}</b>}</div>
          : <div className="pw-sheet-body">{tabList}<div id="pw-tabpanel" role="tabpanel" aria-labelledby={'tab-' + tab}>{tabBody}</div>{(!touch || cmdShown) && cmdLine}</div>}
        <nav className="pw-ph-tools" aria-label={L('Tools')}>
          <button type="button" aria-pressed={!st.name && tool === 'select'} onClick={() => pickRail('select')}><Icon n="select" />{L('Select')}</button>
          <button type="button" aria-pressed={st.name === 'DIST'} onClick={() => pickRail('measure')}><Icon n="measure" />{L('Measure')}</button>
          <button type="button" aria-pressed={st.name === 'LINE'} onClick={() => { if (st.name) run(cmdEsc(ctx())); begin('LINE'); }}><Icon n="line" />{L('Line')}</button>
          <button type="button" aria-pressed={tab === 'checks' && sheetUp !== 'peek'} onClick={() => { setTab('checks'); setSheetUp('half'); }}><Icon n="checks" />{L('Checks')}</button>
          <button type="button" aria-pressed={tab === 'props' && sheetUp !== 'peek'} onClick={() => { setTab('props'); setSheetUp('half'); }}><Icon n="details" />{L('Details')}</button>
          <button type="button" onClick={() => setPalette(true)}><Icon n="more" />{L('More')}</button>
        </nav>
      </section>
      {overlays}
    </div>;
  }

  return <div className={`pw${dark ? ' pw-msdark' : ''}`}>
    <header className="pw-top">
      <div className="pw-qa" role="toolbar" aria-label={L('Quick access')}>
        <button type="button" className="pw-ibtn" onClick={W.close} aria-label={L('All projects')} title={L('All projects')}><Icon n="back" /></button>
        <button type="button" className="pw-ibtn" onClick={saveBackup} aria-label={L('Save backup (.permitpack)')} title={L('Save backup (.permitpack)')}><Icon n="save" /></button>
        <button type="button" className="pw-ibtn" onClick={W.undo} disabled={!W.canUndo} aria-label={L('Undo')} title={L('Undo') + ' (Ctrl+Z)'}><Icon n="undo" /></button>
        <button type="button" className="pw-ibtn" onClick={W.redo} disabled={!W.canRedo} aria-label={L('Redo')} title={L('Redo') + ' (Ctrl+Shift+Z)'}><Icon n="redo" /></button>
      </div>
      <h1 className="pw-crumb"><span className="pw-proj">{crumbs[0]}</span>{isDemo(p) && <span className="pw-tag">{L('Demo')}</span>}<span className="mut"> / {crumbs[1]} / {crumbs[2]}</span></h1>
      <span className={`pw-save${W.saveOk ? '' : ' warn'}`}>{online ? W.saveText : L('Offline · saved on this device')}</span>
      <span className="grow" />
      <span className="mut pw-hide-md">{L('Rules')}: {packForProject(p).id}{packForProject(p).beta ? ' (beta)' : ''}</span>
      <div className="pw-seg" role="group" aria-label={L('Workspace mode')}><button type="button" aria-pressed="false" onClick={() => W.toGuided()}>{L('Guided')}</button><button type="button" aria-pressed="true">{L('Pro')}</button></div>
      <button type="button" className="pw-btn" onClick={() => setPalette(true)} aria-keyshortcuts="Control+K"><Icon n="search" /><span className="pw-hide-md">{L('Commands')}</span><kbd className="pw-hide-md">Ctrl K</kbd></button>
      <label className="sr" htmlFor="pw-lang">{L('Language')}</label>
      <select id="pw-lang" className="pw-btn" value={W.ui} onChange={e => W.setLang(e.target.value)}>{UI_LANGS.map(c => <option key={c} value={c} lang={c}>{c === 'en' ? 'English' : c === 'es' ? 'Español' : nativeName(c)}</option>)}</select>
      <button type="button" className="pw-btn primary" onClick={() => setPanel('export')}>{L('Export')}</button>
    </header>
    {W.banners}
    <div className="pw-body">
      <nav className="pw-rail" aria-label={L('Tools')}>
        {RAIL.map(t => <span key={t.id} className="pw-rail-i">{t.sep && <span className="pw-rail-sep" />}<button type="button" aria-pressed={activeRail === t.id} aria-label={`${L(t.en)}${t.key ? ` (${t.key})` : ''}`} title={`${L(t.en)}${t.key ? ` (${t.key})` : ''}${t.cmd ? ` · ${t.cmd}` : ''}`} aria-keyshortcuts={t.key} onClick={() => pickRail(t.id)}><Icon n={t.icon} /></button></span>)}
        <span className="grow" />
        <button type="button" aria-label={`${L('Keyboard shortcuts')} (?)`} title={`${L('Keyboard shortcuts')} (?)`} onClick={() => setHelp(true)}><Icon n="help" /></button>
      </nav>
      <main className="pw-main" id="main">
        <div className="pw-canvas">{canvas}{empty}{modBar}
          <div className="pw-hud" aria-hidden>{st.name ? L(CMD_EN[st.name] ?? st.name) : tool === 'pan' ? L('Pan') : ''}{sheet !== 'model' ? `${L('Sheets are view-only; edit in Model')}` : ''}</div>
        </div>
        {(!touch || cmdShown) && cmdLine}
        {sheetTabs}
        {status}
      </main>
      <aside className="pw-insp" aria-label={L('Inspector')}>{tabList}<div id="pw-tabpanel" className="pw-tabpanel" role="tabpanel" aria-labelledby={'tab-' + tab}>{tabBody}</div></aside>
    </div>
    {overlays}
  </div>;
}

interface StatusItem { id: string; w: number; prio: number; node: ReactNode }
/** Status bar that measures itself and moves the lowest-priority items into a "…" menu when they do not fit. */
function StatusBar({ items, lead }: { items: StatusItem[]; lead: ReactNode }) {
  const ref = useRef<HTMLElement>(null); const [w, setW] = useState(2000); const [open, setOpen] = useState(false);
  useEffect(() => { const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const LEAD = 300, MORE = 36; let budget = w - LEAD; const shown = new Set<string>();
  const total = items.reduce((a, x) => a + x.w, 0); const fitsAll = total <= budget;
  if (fitsAll) items.forEach(x => shown.add(x.id)); else { budget -= MORE; [...items].sort((a, b) => a.prio - b.prio).forEach(x => { if (x.w <= budget) { shown.add(x.id); budget -= x.w; } else budget = -1; }); }
  const hidden = items.filter(x => !shown.has(x.id));
  return <footer ref={ref} className="pw-status" aria-label={L('Status bar')}>{lead}
    {items.filter(x => shown.has(x.id) && x.prio <= 4).map(x => <span key={x.id} className="pw-si" data-si={x.id}>{x.node}</span>)}
    <span className="grow" />
    {items.filter(x => shown.has(x.id) && x.prio > 4).map(x => <span key={x.id} className="pw-si" data-si={x.id}>{x.node}</span>)}
    {hidden.length > 0 && <span className="pw-si pw-more-wrap"><button type="button" className="pw-ibtn" aria-expanded={open} aria-label={`${L('More status bar items')} (${hidden.length})`} title={L('More status bar items')} onClick={() => setOpen(v => !v)}><Icon n="more" /></button>
      {open && <div className="pw-more-pop" role="group" aria-label={L('More status bar items')}>{hidden.map(x => <span key={x.id} className="pw-si" data-si={x.id}>{x.node}</span>)}</div>}</span>}
  </footer>;
}

function Toggle({ on, set, label, k }: { on: boolean; set: (f: (v: boolean) => boolean) => void; label: string; k?: string }) {
  return <button type="button" className="pw-tog" aria-pressed={on} onClick={() => set(v => !v)} title={k ? `${label} (${k})` : label}>{label}</button>;
}

function describeSel(p: Project, s: Sel, es: boolean): string {
  if (s.kind === 'adu') { const b = bbox(p.adu.footprint); return `ADU · ${fmtArch(b.maxX - b.minX)} × ${fmtArch(b.maxY - b.minY)}`; }
  if (s.kind === 'room') { const r = p.adu.rooms.find(x => x.id === s.id); return r ? `${r.name} · ${Math.round(toSqFt(roomArea(r)))} ${es ? 'p²' : 'sq ft'}` : ''; }
  if (s.kind === 'opening') return L('Opening'); if (s.kind === 'house') return L('Existing house'); if (s.kind === 'lot') return L('Lot'); if (s.kind === 'pin') return L('Review note');
  return '';
}

function ChecksPanel({ issues, verdict, es, active, onPick, update, openStep, say, northSet }: { issues: Issue[]; verdict: Verdict; es: boolean; active: string | null; onPick: (id: string) => void; update: (fn: (d: Project) => void) => void; openStep: (s: Step) => void; say: (m: string) => void; northSet: boolean }) {
  const c = verdict.counts; const lg = es ? 'es' : 'en'; const total = Math.max(1, c.FAIL + c.UNKNOWN + c.PASS + c.INFO);
  const pinned = issues.filter(i => i.n); const rest = issues.filter(i => !i.n);
  const passes = verdict.report.results.filter(r => r.status === 'PASS');
  const [morePass, setMorePass] = useState(false);
  const row = (i: Issue) => { const on = i.id === active; return <li key={i.id} id={'iss-' + i.id} className={`pw-iss s-${i.status}${on ? ' on' : ''}`}>
    <button type="button" className="pw-iss-h" aria-expanded={on} onClick={() => onPick(i.id)}>{i.n ? <span className={`pw-num ${i.status === 'FAIL' ? 'fix' : 'need'}`} aria-label={`${L('Pin')} ${i.n}`}>{i.n}</span> : <span className="pw-st">{STATUS_LABEL(i.status)}</span>}
      <span className="pw-iss-t">{i.r.rule.title[lg]}</span><span className="pw-id">{i.id}</span></button>
    {on && <div className="pw-iss-b"><p>{i.r.msg[lg]}</p>{i.r.next && <p className="mut"><b>{L('Next')}:</b> {i.r.next[lg]}</p>}
      <div className="pw-row">{i.fixes.map(f => <button key={f.id} type="button" className="pw-btn primary" onClick={() => { update(f.apply); say(`${es ? f.es : f.en}: ${L('done')}`); }}>{es ? f.es : f.en}</button>)}
        <button type="button" className="pw-btn" onClick={() => openStep(i.step)}>{L('Answer or edit…')}</button></div>
      <p className="pw-cite">{i.id} · {i.r.rule.cites.map(x => citeText(x, es)).join('; ')}</p></div>}
  </li>; };
  return <div className="pw-checks">
    <div className="pw-sum"><p className="pw-plain" data-testid="plain-answer">{verdict.plain[lg]}</p>
      <div className="pw-counts" data-testid="pro-counts"><span className="big">{c.FAIL} {L('Fix')}</span><span className="mut">{c.UNKNOWN} {L('Need info')} · {c.PASS} {L('Pass')} · {c.NOT_CHECKED} {L('Off')}</span></div>
      <div className="pw-bar" aria-hidden><span className="fix" style={{ flex: c.FAIL / total }} /><span className="need" style={{ flex: c.UNKNOWN / total }} /><span className="pass" style={{ flex: c.PASS / total }} /></div>
      <p className="mut small">{verdict.score[lg]}</p></div>
    {pinned.length > 0 && <><h2 className="pw-h">{L('On the drawing')}</h2><ul className="pw-list">{pinned.map(row)}</ul></>}
    {(rest.length > 0 || !northSet) && <><h2 className="pw-h">{L('Not tied to one spot')}</h2><ul className="pw-list">
      {!northSet && <li className="pw-iss s-UNKNOWN" data-testid="north-not-set"><div className="pw-iss-h static"><span className="pw-st">{L('Need info')}</span><span className="pw-iss-t">{L('North is not set. The sheet shows plan north up until you enter it.')}</span><button type="button" className="pw-btn" onClick={() => openStep('lot')}>{L('Set north…')}</button></div></li>}
      {rest.map(row)}</ul></>}
    <h2 className="pw-h">{L('Passing')} ({passes.length})</h2>
    <ul className="pw-list">{(morePass ? passes : passes.slice(0, 5)).map(r => <li key={r.rule.id} className="pw-iss s-PASS"><div className="pw-iss-h static"><span className="pw-st">{L('Pass')}</span><span className="pw-iss-t">{r.rule.title[lg]}</span><span className="pw-id">{r.rule.id}</span></div></li>)}</ul>
    {passes.length > 5 && <button type="button" className="pw-link" onClick={() => setMorePass(v => !v)}>{morePass ? L('Show fewer') : `+ ${passes.length - 5} ${L('more passing')}`}</button>}
    <p className="pw-foot">{L('Software check, not a city review.')} {L('Rules')} {verdict.report.pack}.</p>
  </div>;
}

/** Length input in feet-inches. Enter or leaving the field commits; bad text is refused with a message. Phones get the ft-in keypad. */
export function LenField({ id, label, mm, onChange, phone, allowZero }: { id: string; label: string; mm: number | null; onChange: (v: number) => void; phone?: boolean; allowZero?: boolean }) {
  const show = mm == null ? '' : fmtArch(mm); const [txt, setTxt] = useState(show); const [bad, setBad] = useState(false); const [pad, setPad] = useState(false);
  const [prev, setPrev] = useState(mm); if (prev !== mm) { setPrev(mm); setTxt(show); setBad(false); }
  const commit = (t = txt) => { if (t.trim() === show) return; const v = parseLength(t); if (v == null || (!allowZero && v <= 0)) { setBad(true); return; } setBad(false); onChange(v); };
  return <div className="pw-f"><label htmlFor={id}>{label}</label>
    <input id={id} value={txt} inputMode={phone ? 'none' : 'text'} aria-invalid={bad} aria-describedby={id + '-e'} onChange={e => setTxt(e.target.value)} onFocus={() => phone && setPad(true)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setTxt(show); setBad(false); } }} onBlur={() => !pad && commit()} />
    <span id={id + '-e'} className="pw-err" role={bad ? 'alert' : undefined}>{bad ? L("Use feet and inches, like 12'-6\" or 12 6.") : ''}</span>
    {pad && <Keypad value={txt} set={setTxt} done={() => { setPad(false); commit(); }} />}
  </div>;
}
function Keypad({ value, set, done }: { value: string; set: (v: string) => void; done: () => void }) {
  const keys = ['7', '8', '9', "'", '4', '5', '6', '"', '1', '2', '3', '-', '1/2', '0', '1/4', '⌫'];
  const press = (k: string) => set(k === '⌫' ? value.slice(0, -1) : k === '1/2' || k === '1/4' ? `${value.trim()} ${k}` : value + k);
  return <div className="pw-pad" role="group" aria-label={L('Feet and inches keypad')}>{keys.map(k => <button key={k} type="button" onMouseDown={e => e.preventDefault()} onClick={() => press(k)} aria-label={k === '⌫' ? L('Delete') : k === "'" ? L('feet') : k === '"' ? L('inches') : k}>{k}</button>)}
    <button type="button" className="pw-pad-done" onMouseDown={e => e.preventDefault()} onClick={done}>{L('Done')}</button></div>;
}

function Properties({ p, sel, update, openStep, setSel, phone }: { p: Project; sel: Sel | null; update: (fn: (d: Project) => void, key?: string) => void; openStep: (s: Step) => void; setSel: (s: Sel | null) => void; phone: boolean }) {
  const lot = bbox(p.site.lot); const fb = bbox(p.adu.footprint); const hb = bbox(p.site.primary);
  const rows = (pairs: [string, string][]) => <dl className="pw-dl">{pairs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
  if (!sel) return <div className="pw-props"><h2 className="pw-h">{L('Drawing')}</h2>
    {rows([[L('Project'), p.name], [L('Address'), p.site.address || L('Not entered')], [L('Lot'), `${fmtArch(lot.maxX - lot.minX)} × ${fmtArch(lot.maxY - lot.minY)}`], [L('ADU footprint'), `${Math.round(toSqFt(area(p.adu.footprint)))} sq ft`], [L('Rooms'), String(p.adu.rooms.length)], [L('Units'), L('Feet and inches')]])}
    <p className="mut small">{L('Select an object on the drawing to edit it. Press ] to step through objects.')}</p>
    <div className="pw-row"><button type="button" className="pw-btn" onClick={() => setSel({ kind: 'adu' })}>{L('Select the ADU')}</button><button type="button" className="pw-btn" onClick={() => openStep('lot')}>{L('Lot and parcel lookup…')}</button></div></div>;
  if (sel.kind === 'ents') {
    const list = (p.cad?.ents ?? []).filter(e => sel.ids.includes(e.id)); if (!list.length) return null; const e = list[0]; const one = list.length === 1;
    const lays = [...LAYERS.map(l => l.id as string), ...(p.cad?.layers ?? []).map(l => l.name)];
    const setE = (fn: (x: Ent) => void, key?: string) => update(d => { d.cad?.ents.forEach(x => { if (sel.ids.includes(x.id)) fn(x); }); }, key);
    const kinds: Record<string, string> = { line: L('Line'), pline: L('Polyline'), circle: L('Circle'), arc: L('Arc'), text: L('Text'), leader: L('Leader'), cloud: L('Revision cloud'), dim: L('Dimension') };
    const len = e.t === 'line' ? Math.hypot(e.pts[1].x - e.pts[0].x, e.pts[1].y - e.pts[0].y) : null;
    return <div className="pw-props"><h2 className="pw-h">{one ? kinds[e.t] : `${list.length} ${L('objects')}`}</h2>
      <div className="pw-f"><label htmlFor="pp-el">{L('Layer')}</label><select id="pp-el" value={list.every(x => x.layer === e.layer) ? e.layer : ''} onChange={ev => setE(x => { x.layer = ev.target.value; })}>{!list.every(x => x.layer === e.layer) && <option value="">{L('Varies')}</option>}{[...new Set([...lays, e.layer])].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
      {one && e.t === 'line' && len != null && <dl className="pw-dl"><div><dt>{L('Length')}</dt><dd>{fmtArch(len)}</dd></div><div><dt>{L('Angle')}</dt><dd>{(((Math.atan2(e.pts[1].y - e.pts[0].y, e.pts[1].x - e.pts[0].x) * 180) / Math.PI + 360) % 360).toFixed(1)}°</dd></div></dl>}
      {one && e.t === 'line' && <LenField phone={phone} id="pp-ll" label={L('Length')} mm={len} onChange={v => setE(x => { const a = x.pts[0], b = x.pts[1]; const L0 = Math.hypot(b.x - a.x, b.y - a.y) || 1; x.pts = [a, { x: a.x + (b.x - a.x) / L0 * v, y: a.y + (b.y - a.y) / L0 * v }]; })} />}
      {one && (e.t === 'circle' || e.t === 'arc') && <LenField phone={phone} id="pp-cr" label={L('Radius')} mm={e.r ?? null} onChange={v => setE(x => { x.r = v; })} />}
      {one && (e.t === 'text' || e.t === 'leader') && <div className="pw-f"><label htmlFor="pp-tx">{L('Text')}</label><textarea id="pp-tx" rows={3} maxLength={2000} value={e.text ?? ''} onChange={ev => setE(x => { x.text = ev.target.value; }, 'tx' + e.id)} /></div>}
      {one && (e.t === 'text' || e.t === 'leader') && <LenField phone={phone} id="pp-th" label={L('Text height')} mm={e.h ?? null} onChange={v => setE(x => { x.h = v; })} />}
      {one && e.t === 'dim' && <><dl className="pw-dl"><div><dt>{L('Measured')}</dt><dd>{fmtArch(dimGeom(e).len)}</dd></div></dl><div className="pw-f"><label htmlFor="pp-dt">{L('Text override (blank = measured)')}</label><input id="pp-dt" value={e.text ?? ''} maxLength={120} onChange={ev => setE(x => { if (ev.target.value) x.text = ev.target.value; else delete x.text; }, 'dt' + e.id)} /></div></>}
      <button type="button" className="pw-btn danger" onClick={() => { const ids = new Set(sel.ids); update(d => { if (d.cad) d.cad.ents = d.cad.ents.filter(x => !ids.has(x.id)); }); setSel(null); }}>{L('Erase')}</button></div>;
  }
  if (sel.kind === 'adu') {
    const a = p.adu; const rect4 = p.adu.footprint.length === 4;
    const resize = (w: number | null, d: number | null) => update(x => { const b = bbox(x.adu.footprint); x.adu.footprint = rect(b.minX, b.minY, w ?? b.maxX - b.minX, d ?? b.maxY - b.minY); x.confirmed.adu = true; });
    return <div className="pw-props"><h2 className="pw-h">ADU · {a.mode === 'conversion' ? L('Garage conversion') : L('New ADU')}</h2>
      <div className="pw-grid">
        <LenField phone={phone} id="pp-x" allowZero label={L('From left side line')} mm={fb.minX - lot.minX} onChange={v => update(d => { d.adu.footprint = translate(d.adu.footprint, v - (fb.minX - lot.minX), 0); d.confirmed.adu = true; })} />
        <LenField phone={phone} id="pp-y" allowZero label={L('From rear line')} mm={lot.maxY - fb.maxY} onChange={v => update(d => { d.adu.footprint = translate(d.adu.footprint, 0, (lot.maxY - fb.maxY) - v); d.confirmed.adu = true; })} />
        {rect4 && <LenField phone={phone} id="pp-w" label={L('Width')} mm={fb.maxX - fb.minX} onChange={v => resize(v, null)} />}
        {rect4 && <LenField phone={phone} id="pp-d" label={L('Depth')} mm={fb.maxY - fb.minY} onChange={v => resize(null, v)} />}
        <LenField phone={phone} id="pp-h" label={L('Overall height')} mm={a.heightMm} onChange={v => update(d => { d.adu.heightMm = v; })} />
        <LenField phone={phone} id="pp-e" allowZero label={L('Eave depth')} mm={a.eaveDepthMm} onChange={v => update(d => { d.adu.eaveDepthMm = v; })} />
        <LenField phone={phone} id="pp-c" label={L('Finished ceiling height')} mm={a.ceilingHeightMm} onChange={v => update(d => { d.adu.ceilingHeightMm = v; })} />
      </div>
      <div className="pw-f"><span className="pw-lbl" id="pp-door">{L('Garage door wall filled in')}</span><div className="pw-seg" role="group" aria-labelledby="pp-door">{(['yes', 'no', 'unknown'] as const).map(v => <button key={v} type="button" aria-pressed={a.removesGarageDoorWall === v} onClick={() => update(d => { d.adu.removesGarageDoorWall = v; })}>{v === 'yes' ? L('Yes') : v === 'no' ? L('No') : L('Not sure')}</button>)}</div></div>
      <button type="button" className="pw-btn" onClick={() => openStep('garage')}>{L('All garage questions…')}</button></div>;
  }
  if (sel.kind === 'room') {
    const r = p.adu.rooms.find(x => x.id === sel.id); if (!r) return null; const b = bbox(applyTape(r).poly); const isRect = r.shape === 'rect';
    const setR = (fn: (x: Room) => void, key?: string) => update(d => { const x = d.adu.rooms.find(y => y.id === r.id); if (x) fn(x); }, key);
    const size = (w: number | null, dd: number | null) => setR(x => { const bb = bbox(x.poly); const np = rect(bb.minX, bb.minY, w ?? bb.maxX - bb.minX, dd ?? bb.maxY - bb.minY); if (roomFits(np, footLocal(p))) { x.poly = np; x.tape = { w: null, d: null }; } });
    return <div className="pw-props"><h2 className="pw-h">{L('Room')}</h2>
      <div className="pw-grid">
        <div className="pw-f"><label htmlFor="pp-rn">{L('Name')}</label><input id="pp-rn" value={r.name} maxLength={60} onChange={e => setR(x => { x.name = e.target.value; }, 'rn' + r.id)} /></div>
        <div className="pw-f"><label htmlFor="pp-ru">{L('Use')}</label><select id="pp-ru" value={r.use} onChange={e => setR(x => { x.use = e.target.value as RoomUse; })}>{ROOM_USES.map(u => <option key={u} value={u}>{({ sleeping: L('Bedroom'), living: L('Living'), kitchen: L('Kitchen'), bath: L('Bath') } as Record<string, string>)[u]}</option>)}</select></div>
        {isRect && <LenField phone={phone} id="pp-rw" label={L('Width')} mm={b.maxX - b.minX} onChange={v => size(v, null)} />}
        {isRect && <LenField phone={phone} id="pp-rd" label={L('Depth')} mm={b.maxY - b.minY} onChange={v => size(null, v)} />}
        <LenField phone={phone} id="pp-rc" label={L('Ceiling height')} mm={r.ceilingMm ?? p.adu.ceilingHeightMm} onChange={v => setR(x => { x.ceilingMm = v; })} />
      </div>
      {rows([[L('Area'), `${Math.round(toSqFt(roomArea(r)))} sq ft`], [L('Openings'), String(r.openings.length)]])}
      <div className="pw-row"><button type="button" className="pw-btn" onClick={() => openStep('rooms')}>{L('Rooms and openings list…')}</button><button type="button" className="pw-btn danger" onClick={() => { update(d => { d.adu.rooms = d.adu.rooms.filter(x => x.id !== r.id); }); setSel(null); }}>{L('Delete room')}</button></div></div>;
  }
  if (sel.kind === 'opening') {
    const r = p.adu.rooms.find(x => x.id === sel.room); const o = r?.openings.find(x => x.id === sel.id); if (!r || !o) return null;
    const setO = (fn: (x: NonNullable<typeof o>) => void) => update(d => { const x = d.adu.rooms.find(y => y.id === r.id)?.openings.find(y => y.id === o.id); if (x) fn(x); });
    return <div className="pw-props"><h2 className="pw-h">{o.kind === 'door' ? L('Door') : L('Window')} · {r.name}</h2>
      <div className="pw-grid">
        <LenField phone={phone} id="pp-ow" label={o.kind === 'window' ? L('Clear width') : L('Width')} mm={o.widthMm} onChange={v => setO(x => { x.widthMm = v; })} />
        <LenField phone={phone} id="pp-oh" label={o.kind === 'window' ? L('Clear height') : L('Height')} mm={o.heightMm} onChange={v => setO(x => { x.heightMm = v; })} />
        {o.kind === 'window' && <LenField phone={phone} id="pp-os" allowZero label={L('Sill height above floor')} mm={o.sillMm} onChange={v => setO(x => { x.sillMm = v; })} />}
        <LenField phone={phone} id="pp-oo" allowZero label={L('From wall corner')} mm={o.offsetMm} onChange={v => setO(x => { x.offsetMm = v; })} />
      </div>
      {o.kind === 'window' && <p className="mut small">{L('Escape windows are checked on the clear opening when fully open, not the size on the label.')}</p>}
      <button type="button" className="pw-btn danger" onClick={() => { update(d => { const x = d.adu.rooms.find(y => y.id === r.id); if (x) x.openings = x.openings.filter(y => y.id !== o.id); }); setSel(null); }}>{L('Delete')}</button></div>;
  }
  if (sel.kind === 'house') return <div className="pw-props"><h2 className="pw-h">{L('Existing house')}</h2><div className="pw-grid">
    <LenField phone={phone} id="pp-hw" label={L('Width')} mm={hb.maxX - hb.minX} onChange={v => update(d => { d.site.primary = rect(hb.minX, hb.minY, v, hb.maxY - hb.minY); d.confirmed.house = true; })} />
    <LenField phone={phone} id="pp-hd" label={L('Depth')} mm={hb.maxY - hb.minY} onChange={v => update(d => { d.site.primary = rect(hb.minX, hb.minY, hb.maxX - hb.minX, v); d.confirmed.house = true; })} />
    <LenField phone={phone} id="pp-hy" allowZero label={L('From street line')} mm={hb.minY - lot.minY} onChange={v => update(d => { d.site.primary = rect(hb.minX, lot.minY + v, hb.maxX - hb.minX, hb.maxY - hb.minY); d.confirmed.house = true; })} />
  </div></div>;
  if (sel.kind === 'lot') return <div className="pw-props"><h2 className="pw-h">{L('Lot')}</h2>{rows([[L('Width'), fmtArch(lot.maxX - lot.minX)], [L('Depth'), fmtArch(lot.maxY - lot.minY)], [L('Source'), p.site.lotSource === 'gis' ? L('City parcel map, verify on site') : p.site.lotSource === 'survey' ? L('Survey') : L('Typed in')]])}
    <button type="button" className="pw-btn" onClick={() => openStep('lot')}>{L('Lot and parcel lookup…')}</button></div>;
  if (sel.kind === 'pin') { const x = p.markup.pins.find(y => y.id === sel.id); if (!x) return null;
    return <div className="pw-props"><h2 className="pw-h">{L('Review note')} {x.n}</h2>
      <div className="pw-f"><label htmlFor="pp-pc">{L('Comment')}</label><textarea id="pp-pc" rows={3} value={x.comment} maxLength={2000} onChange={e => update(d => { const y = d.markup.pins.find(q => q.id === x.id); if (y) y.comment = e.target.value; }, 'pc' + x.id)} /></div>
      <div className="pw-seg" role="group" aria-label={L('Status')}>{(['open', 'resolved'] as const).map(s => <button key={s} type="button" aria-pressed={x.status === s} onClick={() => update(d => { const y = d.markup.pins.find(q => q.id === x.id); if (y) y.status = s; })}>{s === 'open' ? L('Open') : L('Resolved')}</button>)}</div>
      <div className="pw-row"><button type="button" className="pw-btn" onClick={() => openStep('review')}>{L('Review notes and plan-set check…')}</button><button type="button" className="pw-btn danger" onClick={() => { update(d => { d.markup.pins = d.markup.pins.filter(q => q.id !== x.id); }); setSel(null); }}>{L('Delete')}</button></div></div>; }
  return null;
}

function LayersPanel({ p, update, layers, setLayers }: { p: Project; update: (fn: (d: Project) => void) => void; layers: Record<string, LayerState>; setLayers: (f: (l: Record<string, LayerState>) => Record<string, LayerState>) => void }) {
  const flip = (id: string, k: 'on' | 'locked') => setLayers(l => ({ ...l, [id]: { ...l[id], [k]: !l[id][k] } }));
  const cad = p.cad ?? DEFAULT_CAD(); const [name, setName] = useState(''); const [err, setErr] = useState('');
  const setCad = (fn: (c: NonNullable<Project['cad']>) => void) => update(d => { d.cad ??= DEFAULT_CAD(); fn(d.cad); });
  const count = (n: string) => cad.ents.filter(e => e.layer === n).length;
  const add = () => { const n = name.trim().toUpperCase(); if (!/^[A-Z0-9_\-$ ]{1,40}$/.test(n)) { setErr(L('Use letters, numbers and dashes (up to 40).')); return; } if (cad.layers.some(l => l.name === n) || LAYERS.some(l => l.id === n)) { setErr(L('That layer already exists.')); return; } setCad(c => { c.layers.push({ name: n, color: 7, on: true, locked: false }); c.current = n; }); setName(''); setErr(''); };
  const COLORS: [number, string][] = [[7, L('Ink')], [1, L('Red')], [2, L('Yellow')], [3, L('Green')], [4, L('Cyan')], [5, L('Blue')], [6, L('Magenta')], [8, L('Gray')]];
  return <div className="pw-layers">
    <h2 className="pw-h">{L('Your layers')}</h2>
    <table><caption className="sr">{L('Your layers')}</caption><thead><tr><th scope="col"><span className="sr">{L('Current')}</span></th><th scope="col"><span className="sr">{L('On')}</span></th><th scope="col"><span className="sr">{L('Lock')}</span></th><th scope="col">{L('Layer')}</th><th scope="col">{L('Color')}</th></tr></thead>
      <tbody>{cad.layers.map((l: CadLayer, i: number) => <tr key={l.name} className={l.on ? '' : 'off'}>
        <td><input type="radio" name="pw-cur" checked={cad.current === l.name} aria-label={`${l.name} ${L('current layer')}`} onChange={() => setCad(c => { c.current = l.name; })} /></td>
        <td><button type="button" className="pw-ibtn sm" aria-pressed={l.on} aria-label={`${l.name} ${L('visible')}`} onClick={() => setCad(c => { c.layers[i].on = !c.layers[i].on; })}><Icon n={l.on ? 'eye' : 'eyeoff'} /></button></td>
        <td><button type="button" className="pw-ibtn sm" aria-pressed={l.locked} aria-label={`${l.name} ${L('locked')}`} onClick={() => setCad(c => { c.layers[i].locked = !c.layers[i].locked; })}><Icon n={l.locked ? 'lock' : 'unlock'} /></button></td>
        <td><span className="pw-lname">{l.name}</span><span className="mut small">{count(l.name)} {L('objects')}</span></td>
        <td><span className="pw-sw" style={{ background: layerColor(l.color) ?? 'var(--c-ink)' }} aria-hidden /><select aria-label={`${l.name} ${L('color')}`} value={l.color} onChange={e => setCad(c => { c.layers[i].color = Number(e.target.value); })}>{COLORS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></td></tr>)}</tbody></table>
    <div className="pw-row pw-newlayer"><label className="sr" htmlFor="pw-nl">{L('New layer name')}</label><input id="pw-nl" value={name} placeholder={L('New layer name')} maxLength={40} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} aria-describedby="pw-nl-e" /><button type="button" className="pw-btn" onClick={add}>{L('Add layer')}</button></div>
    <p id="pw-nl-e" className="pw-err" role={err ? 'alert' : undefined}>{err}</p>
    <h2 className="pw-h">{L('Drawing layers (NCS)')}</h2>
    <table><caption className="sr">{L('Layers')}</caption><thead><tr><th scope="col"><span className="sr">{L('On')}</span></th><th scope="col"><span className="sr">{L('Lock')}</span></th><th scope="col">{L('Layer')}</th><th scope="col" className="r">LW</th></tr></thead>
    <tbody>{LAYERS.map(l => { const s = layers[l.id]; return <tr key={l.id} className={s.on ? '' : 'off'}>
      <td><button type="button" className="pw-ibtn sm" aria-pressed={s.on} aria-label={`${l.id} ${L('visible')}`} onClick={() => flip(l.id, 'on')}><Icon n={s.on ? 'eye' : 'eyeoff'} /></button></td>
      <td><button type="button" className="pw-ibtn sm" aria-pressed={s.locked} aria-label={`${l.id} ${L('locked')}`} onClick={() => flip(l.id, 'locked')}><Icon n={s.locked ? 'lock' : 'unlock'} /></button></td>
      <td><span className="pw-lname">{l.id}</span><span className="mut small">{L(l.desc)}</span></td><td className="r mut">{l.lw.toFixed(2)}</td></tr>; })}</tbody></table>
    <div className="pw-row"><button type="button" className="pw-btn" onClick={() => setLayers(l => Object.fromEntries(Object.keys(l).map(k => [k, { on: true, locked: false }])))}>{L('Show and unlock all')}</button></div></div>;
}

function TakeoffPanel({ p, es, onCsv }: { p: Project; es: boolean; onCsv: () => void }) {
  const t = takeoff(p); const rooms = p.adu.rooms;
  return <div className="pw-takeoff">
    {rooms.length > 0 && <><h2 className="pw-h">{L('Rooms')}</h2><table><thead><tr><th scope="col">{L('Room')}</th><th scope="col" className="r">sq ft</th></tr></thead><tbody>{rooms.map(r => <tr key={r.id}><td>{r.name}</td><td className="r">{Math.round(toSqFt(roomArea(r)))}</td></tr>)}</tbody></table></>}
    <h2 className="pw-h">{L('Materials estimate')}</h2>
    <table><thead><tr><th scope="col">{L('Item')}</th><th scope="col" className="r">{L('Qty')}</th><th scope="col">{L('Unit')}</th></tr></thead><tbody>{t.map(r => <tr key={r.item}><td>{es ? r.itemEs : r.item}<div className="mut small">{es ? r.basisEs : r.basis}</div></td><td className="r">{r.qty}</td><td>{es ? r.unitEs : r.unit}</td></tr>)}</tbody></table>
    <button type="button" className="pw-btn" onClick={onCsv}>{L('Materials list (CSV)')}</button></div>;
}

function Palette({ cmds, onClose }: { cmds: Cmd[]; onClose: () => void }) {
  const [q, setQ] = useState(''); const [i, setI] = useState(0); const inp = useRef<HTMLInputElement>(null); const back = useRef<Element | null>(null);
  useEffect(() => { back.current = document.activeElement; inp.current?.focus(); return () => { (back.current as HTMLElement | null)?.focus?.(); }; }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = cmds.filter(c => words.every(w => (c.label + ' ' + c.group + ' ' + (c.key ?? '')).toLowerCase().includes(w))).slice(0, 40);
  const run = (c: Cmd | undefined) => { if (!c) return; onClose(); c.run(); };
  return <div className="pw-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="pw-pal" role="dialog" aria-modal="true" aria-label={L('Command palette')}>
      <div className="pw-pal-in"><Icon n="search" /><input ref={inp} role="combobox" aria-expanded="true" aria-controls="pw-pal-list" aria-activedescendant={list[i] ? 'pc-' + list[i].id : undefined} aria-label={L('Type a command')} placeholder={L('Type a command')} value={q}
        onChange={e => { setQ(e.target.value); setI(0); }} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(v => Math.min(list.length - 1, v + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(v => Math.max(0, v - 1)); } else if (e.key === 'Enter') { e.preventDefault(); run(list[i]); } else if (e.key === 'Escape') { e.preventDefault(); onClose(); } }} /></div>
      <ul id="pw-pal-list" role="listbox" aria-label={L('Commands')}>{list.map((c, k) => <li key={c.id} id={'pc-' + c.id} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onMouseDown={e => { e.preventDefault(); run(c); }}><span>{c.label}</span><span className="mut small">{c.group}</span>{c.key && <kbd>{c.key}</kbd>}</li>)}
        {!list.length && <li className="mut" role="option" aria-selected="false" aria-disabled="true">{L('No matching command')}</li>}</ul>
    </div></div>;
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null); useEffect(() => { const back = document.activeElement as HTMLElement | null; ref.current?.focus(); return () => back?.focus?.(); }, []);
  const rows: [string, string][] = [...RAIL.filter(t => t.key).map(t => [t.key!, L(t.en)] as [string, string]), ['/', L('Command line')], ['L, PL, REC, C, A', L('Line, polyline, rectangle, circle, arc')], ['T, MT, LE, RC', L('Text, multiline text, leader, revision cloud')], ['DLI, DAL, DI, AA', L('Linear and aligned dimensions, distance, area')], ['M, CO, RO, MI, SC, E', L('Move, copy, rotate, mirror, scale, erase')], ['O, TR, EX', L('Offset, trim, extend')], ['10,20  @5,0  @12<90', L('Typed points: absolute, relative, polar')], ['Enter / Space', L('Finish or repeat the last command')], ['F10', L('Polar tracking')], ['F', L('Zoom to fit')], ['Shift+F', L('Zoom to selection')], ['+ / −', L('Zoom in / out')], [L('Wheel, pinch'), L('Zoom at the cursor')], [L('Space + drag, middle drag'), L('Pan')],
    [L('Arrows'), L('Nudge the selection by the snap increment (Shift: 1 ft)')], ['[ / ]', L('Step through objects')], [L('Delete'), L('Delete the selected room, opening or note')], ['Esc', L('Cancel, then deselect')],
    ['F3', L('Object snap')], ['F7', L('Grid')], ['F8', L('Ortho')], ['F9', L('Snap to increment')], ['Ctrl+K', L('Command palette')], ['Ctrl+Z', L('Undo')], ['Ctrl+Shift+Z', L('Redo')], ['?', L('Keyboard shortcuts')]];
  return <div className="pw-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <div className="pw-help" role="dialog" aria-modal="true" aria-labelledby="pw-help-h"><div className="pw-panel-h"><strong id="pw-help-h">{L('Keyboard shortcuts')}</strong><span className="grow" /><button ref={ref} type="button" className="pw-ibtn" aria-label={L('Close')} onClick={onClose}><Icon n="close" /></button></div>
      <table><tbody>{rows.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table></div></div>;
}

