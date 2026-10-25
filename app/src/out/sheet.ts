// One sheet model for every plotted drawing: the Pro layout tabs (A-1, A-2, G-2), the PDF export (24x36, 11x17, letter)
// and the DXF paper space all come from here, so what the drafter sees on screen is what prints (paper space, WYSIWYG).
// Pure: no DOM, no pdf-lib. Units are paper inches, origin at the sheet's top-left corner, y down.
// The drawing inside each viewport is the model drawing (ui/pro/drafting.ts) at the viewport's scale; sheet annotation
// (north arrow, graphic scale, keynote legend, STREET label, drawing title, title block, schedules) lives only here.
import type { Project } from '../core/model';
import type { Pt } from '../core/geom';
import { bbox, area, gap, clearanceToEdge } from '../core/geom';
import { fmtSqFt, toSqFt } from '../core/units';
import { withRooms, roomSize, roomArea, roomCeiling, roomAbs } from '../core/rooms';
import { PACK, PACK_ID } from '../rules/pack';
import { missingGlyphNote } from './glyphs';
import { draft, SCALES, textW, fmtArch, type Drawing, type DimRef, type Fill, type Dash } from '../ui/pro/drafting';

export type PaperId = 'archd' | 'tabloid' | 'letter';
export const PAPER_IN: Record<PaperId, { w: number; h: number; label: string }> = { archd: { w: 36, h: 24, label: '24x36' }, tabloid: { w: 17, h: 11, label: '11x17' }, letter: { w: 8.5, h: 11, label: '8.5x11' } };
export type Tone = 'ink' | 'exst' | 'fix' | 'mute' | 'red' | 'green' | 'amber';
export interface SPath { k: 'p'; layer: string; d: string; lw: number; fill?: Fill | 'red' | 'green' | 'amber'; dash?: Dash; tone?: Tone; stroke?: boolean; g?: string }
export interface SText { k: 't'; layer: string; x: number; y: number; h: number; s: string; anchor?: 'start' | 'middle' | 'end'; rot?: number; bold?: boolean; tone?: Tone; g?: string;
  /** Laid out by the sheet (title block, tables): never moved by the label pass, but still an obstacle. */ fixed?: boolean;
  /** Title-block field this text fills (for tests and screen readers). */ field?: string; slide?: { x: number; y: number }; white?: boolean }
export type SItem = SPath | SText;
export interface Rect { x: number; y: number; w: number; h: number }
export interface Viewport extends Rect { /** Model window shown (screen-oriented model mm, y down). */ model: Rect; scale: { label: string; k: number } }
export interface Sheet { no: string; title: string; paper: PaperId; w: number; h: number; items: SItem[]; vps: Viewport[]; dims: DimRef[]; kind: 'site' | 'floor' | 'markup' | 'plot'; cont?: boolean }
/** A check or review marker for the G-2 sheet. */
export interface Marker { key: string; n: string; at: Pt; tone: 'fix' | 'need' | 'rev' | 'done'; text: string }
export interface SheetOpts { es?: boolean; kind?: 'draft' | 'precheck' | 'handoff'; markers?: Marker[]; /** User-drawn CAD dimensions (an automatic one on the same points is left out). */ userDims?: { a: Pt; b: Pt }[] }

/** Smallest plotted lettering: 1/8" (LADBS I.C.3, 9 pt). */
export const MIN_TEXT_IN = 1 / 8;
/** Font box (Public Sans ascent / descent, em): what a text covers, for the label pass and the overlap tests. */
export const ASC = 0.95, DSC = 0.225;
const T1 = MIN_TEXT_IN, T2 = 5 / 32, T3 = 3 / 16, T4 = 1 / 4;
const f4 = (n: number) => (Math.round(n * 10000) / 10000).toString();
const R = (x: number, y: number, w: number, h: number) => `M${f4(x)} ${f4(y)}L${f4(x + w)} ${f4(y)}L${f4(x + w)} ${f4(y + h)}L${f4(x)} ${f4(y + h)}Z`;
const Ln = (x0: number, y0: number, x1: number, y1: number) => `M${f4(x0)} ${f4(y0)}L${f4(x1)} ${f4(y1)}`;
const circle = (cx: number, cy: number, r: number, n = 40) => `M${Array.from({ length: n }, (_, i) => `${f4(cx + Math.cos((i / n) * Math.PI * 2) * r)} ${f4(cy + Math.sin((i / n) * Math.PI * 2) * r)}`).join('L')}Z`;
const hex = (cx: number, cy: number, r: number) => `M${Array.from({ length: 6 }, (_, i) => `${f4(cx + Math.cos((i * Math.PI) / 3) * r)} ${f4(cy + Math.sin((i * Math.PI) / 3) * r)}`).join('L')}Z`;
export const streetOf = (address: string) => (address.split(',')[0] ?? '').replace(/^\s*\d+[A-Za-z]?\s+/, '').trim();
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Builder for one sheet. */
class SB {
  items: SItem[] = []; vps: Viewport[] = []; dims: DimRef[] = []; no: string; title: string; paper: PaperId; kind: Sheet['kind'];
  constructor(no: string, title: string, paper: PaperId, kind: Sheet['kind']) { this.no = no; this.title = title; this.paper = paper; this.kind = kind; }
  get w() { return PAPER_IN[this.paper].w; } get h() { return PAPER_IN[this.paper].h; }
  path(d: string, lw: number, o: Partial<SPath> = {}) { this.items.push({ k: 'p', layer: o.layer ?? 'G-ANNO-TTLB', d, lw, ...o }); }
  text(x: number, y: number, h: number, s: string, o: Partial<SText> = {}) { this.items.push({ k: 't', layer: o.layer ?? 'G-ANNO-TTLB', x, y, h, s, fixed: true, ...o }); }
  /** Wrapped text block from (x, y) (first baseline), width w. Returns the y below it. */
  para(x: number, y: number, w: number, h: number, s: string, o: Partial<SText> = {}, lh = 1.3) { for (const l of wrap(s, h, w, o.bold)) { this.text(x, y, h, l, o); y += h * lh; } return y; }
  done(): Sheet { return { no: this.no, title: this.title, paper: this.paper, w: this.w, h: this.h, items: this.items, vps: this.vps, dims: this.dims, kind: this.kind }; }
}
export function wrap(t: string, h: number, max: number, bold = false): string[] {
  const out: string[] = []; let line = '';
  for (const w of t.split(/\s+/).filter(Boolean)) { const n = line ? line + ' ' + w : w; if (textW(n, h, bold) > max && line) { out.push(line); line = w; } else line = n; }
  if (line) out.push(line); return out.length ? out : [''];
}
/** Text cut to fit a width, with an ellipsis. */
const fitText = (s: string, h: number, w: number, bold = false) => { if (textW(s, h, bold) <= w) return s; let t = s; while (t.length > 1 && textW(t + '...', h, bold) > w) t = t.slice(0, -1); return t + '...'; };

// ---------- frame and title block ----------
interface Info { p: Project; es: boolean; kind: SheetOpts['kind']; index: { no: string; title: string }[] }
const L2 = (es: boolean, en: string, sp: string) => (es ? sp : en);
const prepLine = (p: Project) => `${p.people.preparerName || '-'} (${p.people.preparerRole})`;
/** Signature label (B&P §5536.2 asks the preparer to sign plans made for others). Layout only. */
export function sigLabel(p: Project): string {
  return p.people.preparerRole === 'owner' ? 'Owner signature (plans prepared by the owner)' : `Signature of preparer: ${p.people.preparerName || '-'} (${p.people.preparerRole})${p.people.preparerLicense ? `, license ${p.people.preparerLicense}` : ''}`;
}
export const PREP_NOTE = 'Prepared by the person named above using Open Permit Hub software. The software is not the preparer. Not reviewed or approved by any agency. Verify all dimensions in the field.';

/** Border and the NCS title block. Vertical strip on the right (24x36, 11x17); a strip along the bottom on letter.
 * Returns the drawing area inside the border, clear of the title block. */
function frame(sb: SB, I: Info, scaleLabel: string, extraNote = ''): Rect {
  const { p, es } = I; const W = sb.w, H = sb.h; const m = sb.paper === 'archd' ? 0.5 : 0.375;
  sb.path(R(m, m, W - 2 * m, H - 2 * m), 0.7, { layer: 'G-ANNO-TTLB' });
  const vertical = sb.paper !== 'letter'; const tw = sb.paper === 'archd' ? 4.0 : 3.4; const pad = 0.12;
  const ln = (x0: number, y0: number, x1: number, y1: number, lw = 0.35) => sb.path(Ln(x0, y0, x1, y1), lw);
  const lab = (x: number, y: number, s: string, field?: string) => sb.text(x, y, T1, s, { tone: 'mute', field: field ? field + ':label' : undefined });
  const val = (x: number, y: number, s: string, w: number, field?: string, bold = true, h = T2) => sb.text(x, y, h, fitText(s, h, w, bold), { bold, field });
  const stamp = I.kind === 'draft' ? 'DRAFT - NOT FOR SUBMITTAL' : I.kind === 'precheck' ? 'Pre-check copy - not a submittal' : '';
  const glyph = missingGlyphNote(p, false, true); const note = PREP_NOTE + (extraNote ? ' ' + extraNote : '') + (glyph ? ' ' + glyph : '');
  // Sizes the user never entered are the app's example numbers: said on every sheet, in red, so nobody reads them as measured.
  const miss = [!p.confirmed?.lot && 'LOT SIZE', !p.confirmed?.house && 'HOUSE SIZE AND POSITION', !p.confirmed?.adu && 'GARAGE SIZE AND POSITION'].filter(Boolean);
  const example = miss.length ? `EXAMPLE SIZES - NOT MEASURED: ${miss.join(', ')}` : '';
  if (vertical) {
    const x0 = W - m - tw, x1 = W - m, cw = tw - 2 * pad; ln(x0, m, x0, H - m, 0.7); let y = m;
    const box = (hh: number) => { y += hh; ln(x0, y, x1, y); };
    // Preparer
    let yy = y + pad + T1; lab(x0 + pad, yy, 'Prepared by', 'preparer'); yy += T2 * 1.45; val(x0 + pad, yy, prepLine(p), cw, 'preparer'); yy += T1 * 1.6;
    lab(x0 + pad, yy, 'License'); yy += T2 * 1.45; val(x0 + pad, yy, p.people.preparerLicense || 'n/a', cw, 'license', false); box(yy - y + pad);
    // Stamp / seal area: a blank box (no legal text)
    const sh = sb.paper === 'archd' ? 2.2 : 0.85; lab(x0 + pad, y + pad + T1, L2(es, 'STAMP', 'SELLO'), 'stamp'); sb.path(R(x0 + pad, y + pad * 2 + T1, cw, sh - pad * 3 - T1), 0.18); box(sh);
    // Project
    yy = y + pad + T1; lab(x0 + pad, yy, 'Project', 'project'); yy += T2 * 1.45; val(x0 + pad, yy, p.name || '-', cw, 'project'); yy += T1 * 1.6;
    lab(x0 + pad, yy, 'Address', 'address'); yy += T2 * 1.45; for (const l of wrap(p.site.address || '-', T2, cw, true).slice(0, 2)) { val(x0 + pad, yy, l, cw, 'address'); yy += T2 * 1.3; } yy += T1 * 0.3;
    lab(x0 + pad, yy, 'APN', 'apn'); yy += T2 * 1.45; val(x0 + pad, yy, p.site.apn || '-', cw, 'apn'); yy += T1 * 1.6;
    lab(x0 + pad, yy, 'Owner', 'owner'); yy += T2 * 1.45; val(x0 + pad, yy, p.people.ownerName || '-', cw, 'owner'); box(yy - y + pad);
    // Revisions: delta, date, description (blank rows for the preparer)
    const rh = 0.24; yy = y + pad + T1; sb.text(x0 + pad, yy, T1, L2(es, 'REVISIONS', 'REVISIONES'), { bold: true, field: 'rev' }); yy += pad;
    const cx = [x0 + pad, x0 + pad + 0.45, x0 + pad + 1.35];
    ln(x0 + pad, yy, x1 - pad, yy, 0.18); [L2(es, 'REV', 'REV'), L2(es, 'DATE', 'FECHA'), L2(es, 'DESCRIPTION', 'DESCRIPCIÓN')].forEach((s, i) => lab(cx[i] + 0.04, yy + rh - 0.06, s)); yy += rh;
    for (let r = 0; r < 3; r++) { ln(x0 + pad, yy, x1 - pad, yy, 0.13); yy += rh; } ln(x0 + pad, yy, x1 - pad, yy, 0.13);
    const top = y + pad + T1 + pad; [cx[1], cx[2]].forEach(x => ln(x, top, x, yy, 0.13)); ln(x0 + pad, top, x0 + pad, yy, 0.13); ln(x1 - pad, top, x1 - pad, yy, 0.13); box(yy - y + pad);
    // Drawn / checked / date / scale
    const half = tw / 2; const cell = (cx0: number, cy: number, l: string, v: string, field: string) => { lab(cx0 + pad, cy + pad + T1, l, field); val(cx0 + pad, cy + pad + T1 + T2 * 1.5, v, half - 2 * pad, field, true); };
    const ch = pad * 2 + T1 + T2 * 1.7;
    cell(x0, y, L2(es, 'DRAWN BY', 'DIBUJÓ'), p.people.preparerName || '-', 'drawn'); cell(x0 + half, y, L2(es, 'CHECKED BY', 'REVISÓ'), '', 'checked'); ln(x0 + half, y, x0 + half, y + ch * 2); box(ch);
    cell(x0, y, 'Date', today(), 'date'); cell(x0 + half, y, L2(es, 'SCALE', 'ESCALA'), scaleLabel || 'AS NOTED', 'scale'); box(ch);
    // Signature and date lines
    yy = y + pad + 0.42; ln(x0 + pad, yy, x1 - pad - 1.0, yy, 0.25); ln(x1 - pad - 0.85, yy, x1 - pad, yy, 0.25); yy += T1 * 1.3;
    lab(x1 - pad - 0.85, yy, 'Date'); for (const l of wrap(sigLabel(p), T1, cw - 1.0)) { lab(x0 + pad, yy, l, 'signature'); yy += T1 * 1.3; } box(yy - y);
    // Preparer note and sheet status
    yy = y + pad + T1; yy = sb.para(x0 + pad, yy, cw, T1, note, { tone: 'ink' }, 1.25);
    if (stamp) { yy += T1 * 0.3; sb.text(x0 + pad, yy, T1, stamp, { bold: true, tone: 'red', field: 'status' }); yy += T1 * 1.3; }
    if (example) yy = sb.para(x0 + pad, yy, cw, T1, example, { bold: true, tone: 'red', field: 'example' }, 1.25);
    // Sheet title and number (bottom, big)
    const ny = H - m - 0.3; sb.text(x0 + pad, ny - 0.62 - T4 * 1.4, T4, fitText(sb.title, T4, cw, true), { bold: true, field: 'title' });
    lab(x0 + pad, ny - 0.62, 'SHEET', 'sheet'); sb.text(x0 + pad, ny, 0.5, sb.no, { bold: true, field: 'sheet' }); ln(x0, ny - 0.62 - T4 * 1.4 - T4 * 1.2, x1, ny - 0.62 - T4 * 1.4 - T4 * 1.2);
    void yy; return { x: m + 0.25, y: m + 0.25, w: x0 - m - 0.5, h: H - 2 * m - 0.5 };
  }
  // Letter: strip along the bottom, three columns.
  const sh = 2.75; const y0 = H - m - sh, y1 = H - m; ln(m, y0, W - m, y0, 0.7); const c1 = m, c2 = m + 2.95, c3 = m + 5.35; ln(c2, y0, c2, y1); ln(c3, y0, c3, y1);
  let y = y0 + pad + T1; const w1 = c2 - c1 - 2 * pad, w2 = c3 - c2 - 2 * pad, w3 = W - m - c3 - 2 * pad;
  const row = (x: number, l: string, v: string, w: number, field: string) => { if (v.trim() === '-' && field !== 'project') return; /* empty fields are left off, never printed as '-' */ lab(x, y, l, field); val(x + textW(l, T1) + 0.08, y, v, w - textW(l, T1) - 0.08, field, true, T1); y += T1 * 1.45; };
  row(c1 + pad, 'Project:', p.name || '-', w1, 'project'); row(c1 + pad, 'Address:', p.site.address || '-', w1, 'address'); row(c1 + pad, 'APN:', p.site.apn || '-', w1, 'apn'); row(c1 + pad, 'Owner:', p.people.ownerName || '-', w1, 'owner');
  row(c1 + pad, 'Prepared by:', prepLine(p), w1, 'preparer'); row(c1 + pad, 'Lot area:', fmtSqFt(area(p.site.lot)), w1, 'lotArea'); row(c1 + pad, 'ADU footprint:', fmtSqFt(area(p.adu.footprint)), w1, 'aduArea');
  y += 0.12; ln(c1 + pad, y, c2 - pad - 0.9, y, 0.25); ln(c2 - pad - 0.8, y, c2 - pad, y, 0.25); y += T1 * 1.3; lab(c2 - pad - 0.8, y, 'Date'); y += T1 * 1.3; for (const l of wrap(sigLabel(p), T1, w1).slice(0, 3)) { lab(c1 + pad, y, l, 'signature'); y += T1 * 1.25; }
  // column 2: revisions, drawn/checked, date/scale, note
  y = y0 + pad + T1; sb.text(c2 + pad, y, T1, L2(es, 'REVISIONS', 'REVISIONES'), { bold: true, field: 'rev' }); y += 0.06;
  for (let r = 0; r < 3; r++) { y += 0.2; ln(c2 + pad, y, c3 - pad, y, 0.13); } y += T1 * 1.5;
  const rw = (l: string, v: string, field: string) => { lab(c2 + pad, y, l, field); val(c2 + pad + textW(l, T1) + 0.08, y, v, w2 - textW(l, T1) - 0.08, field, true, T1); y += T1 * 1.45; };
  rw('Drawn by:', p.people.preparerName || '-', 'drawn'); rw('Checked by:', '', 'checked'); rw('Date:', today(), 'date'); rw('Scale:', scaleLabel, 'scale');
  y = sb.para(c2 + pad, y, w2, T1, `Rule pack ${PACK_ID}. ${note}`, { tone: 'mute' }, 1.2);
  // column 3: stamp, status, title and number
  y = y0 + pad + T1; lab(c3 + pad, y, L2(es, 'STAMP', 'SELLO'), 'stamp'); sb.path(R(c3 + pad, y + 0.06, w3, 0.85), 0.18); y += 1.1;
  for (const s2 of [stamp, example].filter(Boolean)) for (const l of wrap(s2, T1, w3, true)) { sb.text(c3 + pad, y, T1, l, { bold: true, tone: 'red', field: 'status' }); y += T1 * 1.25; }
  sb.text(c3 + pad, y1 - 0.62 - T2 * 0.6, T2, fitText(sb.title, T2, w3, true), { bold: true, field: 'title' }); lab(c3 + pad, y1 - 0.47, 'SHEET', 'sheet'); sb.text(c3 + pad, y1 - pad, 0.3, sb.no, { bold: true, field: 'sheet' });
  return { x: m + 0.15, y: m + 0.15, w: W - 2 * m - 0.3, h: y0 - m - 0.3 };
}

// ---------- viewports ----------
/** Largest standard scale (at most `maxK` inverse: the smallest k allowed) at which the drawing fits the box. Draws at each scale tried. */
function fitDraw(p: Project, box: { w: number; h: number }, o: { es: boolean; scope: 'site' | 'adu'; minK?: number; userDims?: { a: Pt; b: Pt }[] }): { d: Drawing; sc: { label: string; k: number } } {
  const cands = SCALES.filter(s => s.k >= (o.minK ?? 12) && s.k <= 720);
  let last: { d: Drawing; sc: { label: string; k: number } } | null = null;
  for (const sc of cands) { const mmPerIn = sc.k * 25.4; const d = draft(p, { anno: mmPerIn, es: o.es, scope: o.scope, withCad: true, detail: o.scope === 'adu' ? 'plan' : 'site', userDims: o.userDims });
    last = { d, sc }; const e = d.extents; if ((e.maxX - e.minX) / mmPerIn <= box.w && (e.maxY - e.minY) / mmPerIn <= box.h) return last; }
  return last!;
}
/** Put a drawing on the sheet: centered in `box`, paths and text moved to paper inches. Model-only layers (check pins) are dropped. */
function place(sb: SB, d: Drawing, sc: { label: string; k: number }, box: Rect, drop = new Set(['G-ANNO-REDL'])): Viewport {
  const mmPerIn = sc.k * 25.4; const e = d.extents; const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2;
  const model = { x: cx - (box.w / 2) * mmPerIn, y: cy - (box.h / 2) * mmPerIn, w: box.w * mmPerIn, h: box.h * mmPerIn };
  const X = (x: number) => box.x + (x - model.x) / mmPerIn, Y = (y: number) => box.y + (y - model.y) / mmPerIn;
  const tr = (s: string) => s.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a, b) => `${f4(X(+a))} ${f4(Y(+b))}`);
  const minH = MIN_TEXT_IN * mmPerIn * 0.999;
  for (const x of d.prims) if (!drop.has(x.layer)) sb.items.push({ k: 'p', layer: x.layer, d: tr(x.d), lw: x.lw, fill: x.fill, dash: x.dash, tone: x.tone, stroke: x.stroke, g: x.g });
  for (const t of d.texts) { if (drop.has(t.layer) || t.h < minH) continue; // never print below 1/8"
    const h = t.h / mmPerIn; let x = X(t.x), y = Y(t.y);
    if (t.mid) { const r = ((t.rot ?? 0) * Math.PI) / 180; const dy = 0.36 * h; x += -Math.sin(r) * dy; y += Math.cos(r) * dy; }
    sb.items.push({ k: 't', layer: t.layer, x, y, h, s: t.s, anchor: t.anchor, rot: t.rot, bold: t.bold, tone: t.tone, g: t.g, slide: t.slide }); }
  sb.dims.push(...d.dims);
  const vp: Viewport = { ...box, model, scale: sc }; sb.vps.push(vp); return vp;
}
const toPaper = (vp: Viewport, q: Pt) => ({ x: vp.x + (q.x - vp.model.x) / (vp.scale.k * 25.4), y: vp.y + (-q.y - vp.model.y) / (vp.scale.k * 25.4) });

// ---------- sheet annotation ----------
/** Drawing title: numbered bubble, title, scale under it. */
function drawingTitle(sb: SB, x: number, y: number, n: string, title: string, scale: string, w: number) {
  const r = 0.22; sb.path(circle(x + r, y, r), 0.35, { layer: 'A-ANNO-SYMB' }); sb.text(x + r, y + 0.36 * T2, T2, n, { anchor: 'middle', bold: true, layer: 'A-ANNO-SYMB' });
  sb.text(x + 2 * r + 0.12, y - 0.02, T3, title, { bold: true, layer: 'A-ANNO-SYMB' }); const tl = Math.max(w, textW(title, T3, true) + 0.2);
  sb.path(Ln(x + 2 * r + 0.12, y + 0.06, x + 2 * r + 0.12 + tl, y + 0.06), 0.5, { layer: 'A-ANNO-SYMB' });
  sb.text(x + 2 * r + 0.12, y + 0.06 + T1 * 1.4, T1, `SCALE: ${scale}`, { layer: 'A-ANNO-SYMB' });
}
/** North arrow (filled half-arrow turned to true north; plan north up until north is entered). */
function northArrow(sb: SB, cx: number, cy: number, r: number, deg: number | null) {
  const t = ((deg ?? 0) * Math.PI) / 180; const dir = { x: Math.sin(t), y: -Math.cos(t) }; const perp = { x: -dir.y, y: dir.x };
  const P = (a: number, b: number) => `${f4(cx + dir.x * a + perp.x * b)} ${f4(cy + dir.y * a + perp.y * b)}`;
  sb.path(circle(cx, cy, r, 48), 0.25, { layer: 'A-ANNO-SYMB' });
  sb.path(`M${P(r * 1.15, 0)}L${P(-r * 0.85, r * 0.42)}L${P(-r * 0.45, 0)}L${P(-r * 0.85, -r * 0.42)}Z`, 0.25, { layer: 'A-ANNO-SYMB' });
  sb.path(`M${P(r * 1.15, 0)}L${P(-r * 0.45, 0)}L${P(-r * 0.85, -r * 0.42)}Z`, 0.09, { layer: 'A-ANNO-SYMB', fill: 'ink', stroke: false });
  const lx = cx + dir.x * (r * 1.15 + T2 * 0.9), ly = cy + dir.y * (r * 1.15 + T2 * 0.9); sb.text(lx, ly + 0.36 * T2, T2, 'N', { anchor: 'middle', bold: true, layer: 'A-ANNO-SYMB' });
}
/** Graphic scale: four true-size divisions of a round number of feet, numbers under the ticks, then FEET. */
function scaleBar(sb: SB, x: number, y: number, k: number, minIn: number) {
  const ftIn = 12 / k; const unit = [1, 2, 5, 10, 20, 25, 50, 100].find(u => 4 * u * ftIn >= minIn) ?? 100; const seg = unit * ftIn; const bh = 0.08;
  for (let i = 0; i < 4; i++) { sb.path(R(x + i * seg, y, seg, bh), 0.18, { layer: 'A-ANNO-SYMB', fill: i % 2 ? 'bg' : 'ink' }); }
  for (let i = 0; i <= 4; i++) sb.text(x + i * seg, y + bh + T1 * 1.25, T1, String(i * unit), { anchor: 'middle', layer: 'A-ANNO-SYMB' });
  sb.text(x + 4 * seg + 0.18, y + bh + T1 * 1.25, T1, 'FEET', { layer: 'A-ANNO-SYMB' }); return x + 4 * seg + 0.18 + textW('FEET', T1);
}
/** Keynote legend (numbers in hexagons, always drawn). Returns the y below it. */
function legend(sb: SB, x: number, y: number, w: number, d: Drawing, es: boolean) {
  if (!d.keynotes.length) return y; sb.text(x, y, T2, es ? 'NOTAS CLAVE' : 'KEYNOTES', { bold: true, layer: 'A-ANNO-KEYN' }); y += T2 * 0.6;
  for (const k of d.keynotes) { const r = T1 * 1.2; const cy = y + r + 0.04; sb.path(hex(x + r, cy, r), 0.18, { layer: 'A-ANNO-KEYN' }); sb.text(x + r, cy + 0.36 * T1, T1, String(k.n), { anchor: 'middle', bold: true, layer: 'A-ANNO-KEYN' });
    let ly = cy + 0.36 * T1; for (const l of wrap(k.text, T1, w - r * 2 - 0.15)) { sb.text(x + r * 2 + 0.15, ly, T1, l, { layer: 'A-ANNO-KEYN' }); ly += T1 * 1.3; } y = Math.max(cy + r, ly - T1) + 0.08; }
  return y + 0.1;
}
/** A ruled table: heading, column heads, rows (text cut to fit). Returns the y below it, or the row index it stopped at. */
function table(sb: SB, x: number, y: number, title: string, cols: { h: string; w: number }[], rows: string[][], maxY = Infinity): { y: number; next: number } {
  const rh = T1 * 2; const W = cols.reduce((s, c) => s + c.w, 0); sb.text(x, y, T2, title, { bold: true }); y += T2 * 0.5;
  const top = y; sb.path(Ln(x, y, x + W, y), 0.35); let cx = x; cols.forEach(c => { sb.text(cx + 0.06, y + rh * 0.68, T1, c.h, { bold: true }); cx += c.w; }); y += rh; sb.path(Ln(x, y, x + W, y), 0.25);
  let i = 0; for (; i < rows.length; i++) { if (y + rh > maxY) break; cx = x; rows[i].forEach((t, j) => { sb.text(cx + 0.06, y + rh * 0.68, T1, fitText(t, T1, cols[j].w - 0.12), {}); cx += cols[j].w; }); y += rh; sb.path(Ln(x, y, x + W, y), 0.13); }
  cx = x; sb.path(Ln(cx, top, cx, y), 0.13); cols.forEach(c => { cx += c.w; sb.path(Ln(cx, top, cx, y), 0.13); });
  return { y: y + 0.25, next: i };
}
/** Label / value rows stacked (label line, value line), the way the title-sheet data is read back by plan checkers. */
function dataRows(sb: SB, x: number, y: number, w: number, title: string, rows: [string, string][], maxY = Infinity): number {
  sb.text(x, y, T2, title, { bold: true }); y += T2 * 1.5;
  for (const [a, b] of rows) { if (y > maxY) break; sb.text(x, y, T1, a, { tone: 'mute' }); y += T1 * 1.35; for (const l of wrap(b, T1, w, true)) { sb.text(x, y, T1, l, { bold: true }); y += T1 * 1.3; } y += T1 * 0.5; }
  return y + 0.1;
}
function streetLabel(sb: SB, vp: Viewport, d: Drawing, p: Project, es: boolean) {
  if (!d.street) return; const q = toPaper(vp, d.street.at); const st = streetOf(p.site.address); const s = st ? `${es ? 'CALLE' : 'STREET'}: ${st.toUpperCase()}` : es ? 'CALLE' : 'STREET';
  const r = (d.street.rot * Math.PI) / 180; sb.items.push({ k: 't', layer: 'A-ANNO-TEXT', x: q.x - Math.sin(r) * 0.36 * T2, y: q.y + Math.cos(r) * 0.36 * T2, h: T2, s, anchor: 'middle', rot: d.street.rot, bold: true });
}
function siteData(p: Project, es: boolean): [string, string][] {
  const lot = p.site.lot; const st = new Set([p.site.streetEdge, ...(p.site.streetEdges ?? [])]); const out: [string, string][] = [];
  const sa = lot[p.site.streetEdge], sbp = lot[(p.site.streetEdge + 1) % lot.length]; const su = { x: sbp.x - sa.x, y: sbp.y - sa.y };
  const side = (i: number) => { const a = lot[i], b = lot[(i + 1) % lot.length]; const u = { x: b.x - a.x, y: b.y - a.y }; const cr = Math.abs(u.x * su.y - u.y * su.x) / ((Math.hypot(u.x, u.y) * Math.hypot(su.x, su.y)) || 1);
    return cr < 0.5 ? (es ? 'TRASERO' : 'REAR') : (es ? 'LATERAL' : 'SIDE'); };
  lot.forEach((_, i) => { if (st.has(i)) return; const d = clearanceToEdge(p.adu.footprint, lot, i); if (Number.isFinite(d)) out.push([`${es ? 'RETIRO DEL ADU' : 'ADU SETBACK'}, ${side(i)}`, fmtArch(d)]); });
  const g = gap(p.adu.footprint, p.site.primary); if (g > 0 && Number.isFinite(g)) out.push([es ? 'SEPARACIÓN DE EDIFICIOS' : 'BUILDING SEPARATION', fmtArch(g)]);
  return out;
}

// ---------- the label pass ----------
interface OBB { cx: number; cy: number; hw: number; hh: number; c: number; s: number }
/** The box a text covers (font ascent to descent, advance width), rotated with it. */
export function textBox(t: SText): OBB {
  const w = textW(t.s, t.h, t.bold); const r = ((t.rot ?? 0) * Math.PI) / 180; const c = Math.cos(r), s = Math.sin(r);
  const x0 = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0; const lx = x0 + w / 2, ly = (-ASC * t.h + DSC * t.h) / 2;
  return { cx: t.x + lx * c - ly * s, cy: t.y + lx * s + ly * c, hw: w / 2, hh: ((ASC + DSC) * t.h) / 2, c, s };
}
const corners = (b: OBB) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: b.cx + i * b.hw * b.c - j * b.hh * b.s, y: b.cy + i * b.hw * b.s + j * b.hh * b.c }));
export function obbHit(a: OBB, b: OBB, eps = 0.005): boolean {
  const axes = [{ x: a.c, y: a.s }, { x: -a.s, y: a.c }, { x: b.c, y: b.s }, { x: -b.s, y: b.c }]; const ca = corners(a), cb = corners(b);
  for (const ax of axes) { const pa = ca.map(q => q.x * ax.x + q.y * ax.y), pb = cb.map(q => q.x * ax.x + q.y * ax.y); if (Math.max(...pa) - eps <= Math.min(...pb) || Math.max(...pb) - eps <= Math.min(...pa)) return false; }
  return true;
}
/** Does segment p-q cross the box (shrunk by eps)? */
export function segHit(b: OBB, x0: number, y0: number, x1: number, y1: number, eps = 0.005): boolean {
  const loc = (x: number, y: number) => { const dx = x - b.cx, dy = y - b.cy; return { u: dx * b.c + dy * b.s, v: -dx * b.s + dy * b.c }; };
  const A = loc(x0, y0), B = loc(x1, y1); const hw = b.hw - eps, hh = b.hh - eps; if (hw <= 0 || hh <= 0) return false;
  let t0 = 0, t1 = 1; const du = B.u - A.u, dv = B.v - A.v;
  for (const [pp, q] of [[-du, A.u + hw], [du, hw - A.u], [-dv, A.v + hh], [dv, hh - A.v]] as [number, number][]) {
    if (Math.abs(pp) < 1e-12) { if (q < 0) return false; continue; } const r = q / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  return t0 <= t1;
}
/** Line segments of an M/L/Z path. */
export function segs(d: string): [number, number, number, number][] {
  const out: [number, number, number, number][] = []; const re = /([MLZ])\s*(-?[\d.]+)?\s*(-?[\d.]+)?/g; let m: RegExpExecArray | null; let cx = 0, cy = 0, sx = 0, sy = 0;
  while ((m = re.exec(d))) { if (m[1] === 'Z') { out.push([cx, cy, sx, sy]); cx = sx; cy = sy; continue; } const x = +m[2], y = +m[3]; if (m[1] === 'M') { sx = cx = x; sy = cy = y; } else { out.push([cx, cy, x, y]); cx = x; cy = y; } }
  return out;
}
/** Every overlap on a sheet: text on text, and text on linework that is not its own (same annotation group). */
export function overlaps(sh: { items: SItem[] }): { a: string; b: string }[] {
  const T = sh.items.filter((x): x is SText => x.k === 't' && !!x.s.trim()); const P = sh.items.filter((x): x is SPath => x.k === 'p' && x.stroke !== false);
  const boxes = T.map(textBox); const S = P.map(p => ({ g: p.g, s: segs(p.d) })); const out: { a: string; b: string }[] = [];
  T.forEach((t, i) => { for (let j = i + 1; j < T.length; j++) if (obbHit(boxes[i], boxes[j])) out.push({ a: t.s, b: T[j].s });
    for (const p of S) { if (p.g && p.g === t.g && !p.g.startsWith('dim')) continue; if (p.s.some(q => segHit(boxes[i], ...q))) { out.push({ a: t.s, b: 'linework' }); break; } } });
  return out;
}
/** Moves drawing labels off linework, borders and each other: dimension text slides along its line, then flips sides; other
 * labels (and whole tags) try spots around their place, with a leader when they end up away from it. Title-block and table
 * text never moves. `bounds`: where each viewport's labels must stay. */
function labelPass(sb: SB) {
  const items = sb.items; const T = items.filter((x): x is SText => x.k === 't');
  const P = items.filter((x): x is SPath => x.k === 'p' && x.stroke !== false);
  const segOf = new Map(P.map(p => [p, segs(p.d)]));
  const placed: OBB[] = []; const order = [...T].sort((a, b) => Number(!!b.fixed) - Number(!!a.fixed));
  const inVp = (b: OBB) => { if (!sb.vps.length) return true; return sb.vps.some(v => corners(b).every(q => q.x >= v.x && q.x <= v.x + v.w && q.y >= v.y && q.y <= v.y + v.h)); };
  const clear = (t: SText, b: OBB, skipG0: string | undefined, groupPaths: SPath[] = []) => { const skipG = skipG0?.startsWith('dim') ? undefined : skipG0; return !placed.some(q => obbHit(q, b)) && !P.some(p => (skipG && p.g === skipG) || groupPaths.includes(p) ? false : segOf.get(p)!.some(s => segHit(b, ...s))) && (t.fixed || inVp(b)); };
  for (const t of order) {
    if (t.fixed) { placed.push(textBox(t)); continue; }
    const gPaths = t.g ? P.filter(p => p.g === t.g) : []; const tag = !!t.g && !t.slide && gPaths.length > 0; // a tag or keynote: the symbol moves with its text
    const try1 = (dx: number, dy: number) => { const c = { ...t, x: t.x + dx, y: t.y + dy }; const b = textBox(c); if (tag) { const moved = gPaths.map(p => ({ p, s: segOf.get(p)!.map(([a, b2, c2, d2]) => [a + dx, b2 + dy, c2 + dx, d2 + dy] as [number, number, number, number]) }));
        // the symbol must also be clear of other linework and text
        const sym = moved.flatMap(m => m.s); const symHit = placed.some(q => sym.some(s => segHit(q, ...s))) || T.some(o => o !== t && o.g !== t.g && o.fixed && sym.some(s => segHit(textBox(o), ...s)));
        if (symHit) return false; }
      if (!tag && !t.slide && Math.hypot(dx, dy) > t.h * 2.2) { const tx = t.x, ty = t.y - t.h * 0.36; if (placed.some(q => segHit(q, b.cx, b.cy, tx, ty))) return false; }
      return clear(c, b, t.g, tag ? gPaths : []); };
    let best: [number, number] | null = try1(0, 0) ? [0, 0] : null;
    if (!best && t.slide) { const L = 3; for (let k = 1; k <= 24 && !best; k++) for (const sg of [1, -1]) { const dd = sg * k * t.h * 0.5; if (k * t.h * 0.5 > L) break; if (try1(t.slide.x * dd, t.slide.y * dd)) { best = [t.slide.x * dd, t.slide.y * dd]; break; } }
      // other side of the dimension line
      if (!best) { const n = { x: -t.slide.y, y: t.slide.x }; const off = t.h * (ASC + DSC) + 0.04; for (let k = 0; k <= 16 && !best; k++) for (const sg of [1, -1]) { const dd = sg * k * t.h * 0.5; if (try1(n.x * off + t.slide.x * dd, n.y * off + t.slide.y * dd)) { best = [n.x * off + t.slide.x * dd, n.y * off + t.slide.y * dd]; break; } } } }
    if (!best) { const step = t.h * 0.6; outer: for (let r = 1; r <= 40; r++) for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; const dx = Math.cos(an) * step * r, dy = Math.sin(an) * step * r; if (try1(dx, dy)) { best = [dx, dy]; break outer; } } }
    if (!best) { placed.push(textBox(t)); continue; } // left where it was: the overlap test reports it
    const [dx, dy] = best;
    if (dx || dy) { const t0 = { x: t.x, y: t.y }; t.x += dx; t.y += dy;
      if (tag) for (const p of gPaths) { p.d = p.d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a, b) => `${f4(+a + dx)} ${f4(+b + dy)}`); segOf.set(p, segs(p.d)); }
      else if (!t.slide && Math.hypot(dx, dy) > t.h * 2.2) { // leader back to where the label belongs
        const b = textBox(t); const to = { x: t0.x, y: t0.y - t.h * 0.36 };
        const vx = to.x - b.cx, vy = to.y - b.cy; const lu = vx * b.c + vy * b.s, lv = -vx * b.s + vy * b.c; const k = Math.min(Math.abs(lu) > 1e-9 ? (b.hw + 0.03) / Math.abs(lu) : Infinity, Math.abs(lv) > 1e-9 ? (b.hh + 0.03) / Math.abs(lv) : Infinity, 1);
        const from = { x: b.cx + vx * k, y: b.cy + vy * k }; if (Math.hypot(to.x - from.x, to.y - from.y) > 0.05) {
        const lp: SPath = { k: 'p', layer: t.layer, d: Ln(from.x, from.y, to.x, to.y), lw: 0.13, g: t.g ?? `ld${items.length}` }; t.g = lp.g; items.push(lp); } } }
    placed.push(textBox(t));
  }
}

// ---------- G-2 markers ----------
function markers(sb: SB, vp: Viewport, ms: Marker[]) {
  const r = 0.16; const P = sb.items.filter((x): x is SPath => x.k === 'p' && x.stroke !== false); const S = P.flatMap(p => segs(p.d)); const boxes = sb.items.filter((x): x is SText => x.k === 't').map(textBox);
  const got: { x: number; y: number }[] = [];
  let a0 = { x: 0, y: 0 }; const free = (x: number, y: number) => { const b: OBB = { cx: x, cy: y, hw: r + 0.03, hh: r + 0.03, c: 1, s: 0 }; return x - r > vp.x && x + r < vp.x + vp.w && y - r > vp.y && y + r < vp.y + vp.h && !got.some(q => Math.hypot(q.x - x, q.y - y) < 2 * r + 0.08) && !boxes.some(q => obbHit(q, b) || segHit(q, a0.x, a0.y, x, y)) && !S.some(s => segHit(b, ...s)); };
  for (const m of ms) { const a = toPaper(vp, m.at); a0 = a; let at = { x: a.x + 0.5, y: a.y - 0.5 };
    search: for (let k = 1; k <= 14; k++) for (let i = 0; i < 12; i++) { const an = (i / 12) * Math.PI * 2 - Math.PI / 4; const q = { x: a.x + Math.cos(an) * (0.35 + k * 0.18), y: a.y + Math.sin(an) * (0.35 + k * 0.18) }; if (free(q.x, q.y)) { at = q; break search; } }
    got.push(at); const g = 'mk:' + m.key; const fill = m.tone === 'fix' ? 'red' : m.tone === 'need' ? 'amber' : m.tone === 'rev' ? 'red' : 'green';
    const L = Math.hypot(at.x - a.x, at.y - a.y) || 1; sb.path(Ln(a.x, a.y, at.x - ((at.x - a.x) / L) * r, at.y - ((at.y - a.y) / L) * r), 0.18, { layer: 'G-ANNO-REDL', g, tone: m.tone === 'done' ? 'ink' : 'fix' });
    sb.path(circle(a.x, a.y, 0.025, 12), 0.09, { layer: 'G-ANNO-REDL', g, fill: 'ink', stroke: false });
    sb.path(circle(at.x, at.y, r), 0.18, { layer: 'G-ANNO-REDL', g, fill: fill as SPath['fill'] }); sb.text(at.x, at.y + 0.36 * T1, T1, m.n, { anchor: 'middle', bold: true, white: true, g, layer: 'G-ANNO-REDL' }); }
}

// ---------- sheets ----------
const projectData = (p: Project, I: Info): [string, string][] => {
  const yn = (v: string) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not answered');
  return [['Scope', p.adu.mode === 'conversion' ? 'Convert existing detached garage to ADU' : 'Detached ADU (YOU-ADU plan site fit)'], ...(p.site.zone ? [['Zone', p.site.zone] as [string, string]] : []),
    ...(p.site.lotSource === 'gis' ? [['Lot lines', 'From the LA City parcel map. Verify on site.'] as [string, string]] : []),
    ['Legal description', (p.site.legalDescription || 'Not entered (tract, block and lot from the deed or ZIMAS)').slice(0, 120)], ['Lot area', fmtSqFt(area(p.site.lot))], ['ADU footprint', fmtSqFt(area(p.adu.footprint))],
    ['Occupancy', 'R-3 (dwelling unit; preparer to confirm)'], ['Construction type', p.adu.garageConstruction === 'wood' ? 'Type V-B wood frame (preparer to confirm)' : 'Preparer to state'],
    ['Stories', p.adu.mode === 'conversion' ? '1 (existing garage)' : 'Preparer to state'], ['ADU height', p.adu.heightMm ? fmtArch(p.adu.heightMm) : '-'],
    ['Very High Fire Hazard Severity Zone', yn(p.site.flags.vhfhsz)], ['Sprinklers', yn(p.adu.sprinklered)], ...(p.people.engineerName ? [['Engineer (non-conventional parts)', p.people.engineerName] as [string, string]] : []),
    ['Vicinity map', 'Not drawn by this app. The preparer adds one (a ZIMAS map works).'], ['Rule pack', `${PACK_ID} (checked ${PACK.verifiedOn})`], ['Sheet index', I.index.map(x => x.no).join(', ')]];
};

function siteSheet(p: Project, I: Info, o: SheetOpts): Sheet {
  const sb = new SB('A-1', I.es ? 'PLANO DEL SITIO' : 'SITE PLAN', 'archd', 'site');
  const da0 = frame(sb, I, '');
  const colW = 6.4; const box: Rect = { x: da0.x, y: da0.y, w: da0.w - colW - 0.4, h: da0.h - 1.55 };
  const { d, sc } = fitDraw(p, box, { es: I.es, scope: 'site', minK: 48, userDims: o.userDims }); const vp = place(sb, d, sc, box); streetLabel(sb, vp, d, p, I.es);
  sb.items.filter(x => x.k === 't' && x.field === 'scale').forEach(x => { (x as SText).s = sc.label; });
  const by = da0.y + da0.h - 1.2; drawingTitle(sb, da0.x + 0.25, by, '1', sb.title, sc.label, 6); scaleBar(sb, 1.0, by + 0.62, sc.k, 4);
  northArrow(sb, da0.x + 9.4, by + 0.25, 0.34, p.site.northDeg);
  // Right column: project data (LADBS I.C.8), site data, sheet index, keynotes.
  const cx = da0.x + da0.w - colW; let y = da0.y + 0.2;
  y = dataRows(sb, cx, y, colW, I.es ? 'DATOS DEL PROYECTO' : 'PROJECT DATA', projectData(p, I));
  y = table(sb, cx, y + 0.1, I.es ? 'DATOS DEL SITIO' : 'SITE DATA', [{ h: I.es ? 'ELEMENTO' : 'ITEM', w: colW - 1.6 }, { h: I.es ? 'MEDIDA' : 'SIZE', w: 1.6 }], siteData(p, I.es)).y;
  y = table(sb, cx, y + 0.1, 'Sheet index', [{ h: I.es ? 'HOJA' : 'SHEET', w: 1.2 }, { h: I.es ? 'TÍTULO' : 'TITLE', w: colW - 1.2 }], I.index.map(x => [x.no, x.title])).y;
  legend(sb, cx, y + 0.15, colW, d, I.es);
  labelPass(sb); return sb.done();
}

function scheduleRows(p: Project, d: Drawing) {
  const q = withRooms(p); const doors = d.openings.filter(x => x.kind === 'door'); const wins = d.openings.filter(x => x.kind === 'window');
  const doorRows = doors.map(x => [x.mark, (x.room.name || '-').slice(0, 26), fmtArch(x.op.widthMm), x.op.heightMm != null ? fmtArch(x.op.heightMm) : '-', 'SWING']);
  const winRows = p.adu.rooms.length ? wins.map(x => { const w = q.adu.windows.find(v => v.room === x.room.name); const sq = x.op.widthMm && x.op.heightMm ? toSqFt(x.op.widthMm * x.op.heightMm).toFixed(1) : '-';
    return [x.mark, (x.room.name || '-').slice(0, 28), fmtArch(x.op.widthMm), x.op.heightMm != null ? fmtArch(x.op.heightMm) : '-', x.op.sillMm != null ? fmtArch(x.op.sillMm) : '-', x.room.use === 'sleeping' || w?.sleeping ? 'EGRESS' : '-', sq]; })
    : q.adu.windows.map((w, i) => [String.fromCharCode(65 + (i % 26)), (w.room || '-').slice(0, 28), w.clearWidthMm != null ? fmtArch(w.clearWidthMm) : '-', w.clearHeightMm != null ? fmtArch(w.clearHeightMm) : '-', w.sillMm != null ? fmtArch(w.sillMm) : '-', w.sleeping ? 'EGRESS' : '-', w.clearWidthMm != null && w.clearHeightMm != null ? toSqFt(w.clearWidthMm * w.clearHeightMm).toFixed(1) : '-']);
  const roomRows = p.adu.rooms.map((r, i) => { const z = roomSize(r); const c = roomCeiling(p, r); return [String(101 + i), (r.name || '-').slice(0, 26), r.use, `${fmtArch(z.w)} x ${fmtArch(z.d)}`, fmtSqFt(roomArea(r)) + (z.taped ? ' (tape)' : ''), c != null ? fmtArch(c) : '-']; });
  const tri = (v: string) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not answered');
  const safety: [string, string][] = [['Bedrooms', q.adu.bedrooms === 0 ? 'Studio (main room counts as a sleeping room unless stated)' : String(q.adu.bedrooms)], ['Smoke and CO alarms on plan', tri(p.adu.smokeCoPlanned)], ['Smoke alarms hardwired with battery backup', tri(p.adu.smokeHardwired)], ['Sprinklers', tri(p.adu.sprinklered)], ['All-electric', tri(p.adu.allElectric)], ['Slab vapor barrier or epoxy coating', tri(p.adu.slabVaporBarrier)]];
  return { doorRows, winRows, roomRows, safety };
}
function floorSheets(p: Project, I: Info, o: SheetOpts): Sheet[] {
  const out: Sheet[] = []; const title = I.es ? 'PLANTA' : 'FLOOR PLAN';
  let sb = new SB('A-2', title, 'archd', 'floor'); let da = frame(sb, I, '');
  const box: Rect = { x: da.x, y: da.y + 0.2, w: Math.min(14.5, da.w * 0.5), h: da.h - 1.75 };
  const { d, sc } = fitDraw(p, box, { es: I.es, scope: 'adu', minK: 24, userDims: o.userDims }); place(sb, d, sc, box);
  sb.items.filter(x => x.k === 't' && x.field === 'scale').forEach(x => { (x as SText).s = sc.label; });
  const by = da.y + da.h - 1.2; drawingTitle(sb, da.x + 0.25, by, '1', p.adu.rooms.length ? title : (I.es ? 'PLANTA (CONTORNO)' : 'FLOOR PLAN (OUTLINE)'), sc.label, 6);
  scaleBar(sb, da.x + 7.6, by + 0.1, sc.k, 2.5);
  const fb = bbox(p.adu.footprint); const sub = `Outside ${fmtArch(fb.maxX - fb.minX)} x ${fmtArch(fb.maxY - fb.minY)} (${fmtSqFt(area(p.adu.footprint))}). Livable ${p.adu.interiorLivableSqFt ?? '-'} sq ft. Ceiling ${p.adu.ceilingHeightMm != null ? fmtArch(p.adu.ceilingHeightMm) : '-'}.`;
  sb.text(da.x + 0.25, by + 0.82, T1, sub, {}); sb.text(da.x + 0.25, by + 0.82 + T1 * 1.4, T1, p.adu.rooms.length ? 'Rooms, doors and windows as drawn in the app. Tape sizes marked (tape). Verify all sizes in the field.' : 'Room layout, doors and wall locations: drawn by your preparer. This sheet lists what you entered.', { tone: 'mute' });
  labelPass(sb);
  // Schedules beside the plan; long ones continue on the next sheet.
  const S = scheduleRows(p, d); let x0 = box.x + box.w + 0.5; let y = da.y + 0.2; const maxY = da.y + da.h - 0.2; const cw = da.x + da.w - x0;
  const cont = () => { const s = sb.done(); out.push(s); sb = new SB('A-2', `${title} (${I.es ? 'CONT.' : 'CONTINUED'})`, 'archd', 'floor'); da = frame(sb, I, sc.label); x0 = da.x + 0.2; y = da.y + 0.2;
    sb.text(da.x + 0.2, da.y + da.h - 0.1, T1, `A-2 Floor plan data (continued)   ${p.site.address || p.name}`, {}); };
  const run = (title2: string, cols: { h: string; w: number }[], rows: string[][]) => { let i = 0; let first = true;
    while (first || i < rows.length) { if (y + T1 * 6 > maxY) cont(); const r = table(sb, x0, y, first ? title2 : `${title2} (${I.es ? 'CONT.' : 'CONT.'})`, cols, rows.slice(i), maxY); y = r.y; i += r.next; first = false; if (i < rows.length) cont(); } };
  const fit = (ws: number[]) => { const k = Math.min(1, cw / ws.reduce((a, b) => a + b, 0)); return ws.map(w => w * k); };
  const dw = fit([0.8, 3.2, 1.3, 1.3, 1.4]); if (S.doorRows.length) run('DOOR SCHEDULE', ['MARK', 'ROOM', 'WIDTH', 'HEIGHT', 'TYPE'].map((h, i) => ({ h, w: dw[i] })), S.doorRows);
  const ww = fit([0.8, 3.0, 1.2, 1.2, 1.1, 1.2, 1.3]); run('WINDOW SCHEDULE', ['MARK', 'ROOM', 'WIDTH', 'HEIGHT', 'SILL', 'ESCAPE', 'NET SQ FT'].map((h, i) => ({ h, w: ww[i] })), S.winRows.length ? S.winRows : [['-', 'No windows entered yet.', '', '', '', '', '']]);
  const rw = fit([0.8, 3.0, 1.2, 2.3, 1.6, 1.1]); if (S.roomRows.length) run('ROOM SCHEDULE', ['NO.', 'ROOM', 'USE', 'SIZE', 'AREA', 'CEILING'].map((h, i) => ({ h, w: rw[i] })), S.roomRows);
  { const need = T2 * 1.5 + S.safety.length * T1 * 3.5; if (y + need > maxY) cont(); y = dataRows(sb, x0, y, Math.min(cw, 7), 'ROOMS AND SAFETY', S.safety); }
  if (d.keynotes.length) { if (y + 1.2 > maxY) cont(); y = legend(sb, x0, y, Math.min(cw, 7), d, I.es); }
  out.push(sb.done()); out.forEach((s, i) => { if (i) s.cont = true; }); return out;
}

function markupSheets(p: Project, I: Info, o: SheetOpts): Sheet[] {
  const out: Sheet[] = []; let sb = new SB('G-2', I.es ? 'MARCAS DE REVISIÓN' : 'REVIEW MARKUP', 'archd', 'markup'); let da = frame(sb, I, '');
  const box: Rect = { x: da.x, y: da.y, w: da.w * 0.5, h: da.h - 1.3 };
  const { d, sc } = fitDraw(p, box, { es: I.es, scope: 'site', minK: 96, userDims: o.userDims }); const vp = place(sb, d, sc, box); streetLabel(sb, vp, d, p, I.es); labelPass(sb);
  sb.items.filter(x => x.k === 't' && x.field === 'scale').forEach(x => { (x as SText).s = sc.label; });
  const ms = o.markers ?? []; markers(sb, vp, ms);
  const by = da.y + da.h - 0.95; drawingTitle(sb, da.x + 0.25, by, '1', sb.title, sc.label, 6);
  const open = p.markup.pins.filter(x => x.status === 'open').length; sb.text(da.x + 7.4, by, T1, `${p.markup.pins.length} notes: ${open} open, ${p.markup.pins.length - open} resolved. Notes travel in the .permitpack file.`, {});
  let x0 = box.x + box.w + 0.5, y = da.y + 0.2; let cw = da.x + da.w - x0; const maxY = da.y + da.h - 0.2;
  const ensure = (need: number) => { if (y + need > maxY) { out.push(sb.done()); sb = new SB('G-2', `${I.es ? 'MARCAS DE REVISIÓN' : 'REVIEW MARKUP'} (${I.es ? 'CONT.' : 'CONTINUED'})`, 'archd', 'markup'); da = frame(sb, I, sc.label); x0 = da.x + 0.2; y = da.y + 0.2; cw = da.w - 0.4; } };
  const checks = ms.filter(m => m.tone === 'fix' || m.tone === 'need');
  if (checks.length) { sb.text(x0, y, T2, I.es ? 'REVISIONES' : 'CHECKS', { bold: true }); y += T2 * 1.6;
    for (const m of checks) { const ls = wrap(m.text, T1, cw - 0.6); ensure(ls.length * T1 * 1.3 + 0.1); sb.text(x0, y, T1, m.n, { bold: true, tone: m.tone === 'fix' ? 'red' : 'amber' }); for (const l of ls) { sb.text(x0 + 0.5, y, T1, l, {}); y += T1 * 1.3; } y += 0.06; } y += 0.15; }
  ensure(0.6); sb.text(x0, y, T2, 'NOTES', { bold: true }); y += T2 * 1.6;
  for (const x of [...p.markup.pins].sort((a, b) => a.n - b.n)) { const ls = wrap(x.comment || '(no text)', T1, cw - 0.6); ensure(T1 * 1.4 + ls.length * T1 * 1.3 + 0.1);
    sb.text(x0, y, T1, `R${x.n}`, { bold: true, tone: x.status === 'open' ? 'red' : 'green' }); sb.text(x0 + 0.5, y, T1, fitText(`${x.status === 'open' ? 'OPEN' : 'RESOLVED'}  ${x.author || '-'}  ${x.at}${x.ref ? '  letter item ' + x.ref : ''}`, T1, cw - 0.6, true), { bold: true, tone: 'mute' }); y += T1 * 1.4;
    for (const l of ls) { sb.text(x0 + 0.5, y, T1, l, {}); y += T1 * 1.3; } y += 0.08; }
  if (p.markup.responses.length) { ensure(0.6); y += 0.1; sb.text(x0, y, T2, 'CORRECTION RESPONSES', { bold: true }); y += T2 * 1.6;
    for (const r of p.markup.responses) { const pin = r.pinId ? p.markup.pins.find(q => q.id === r.pinId) : undefined;
      const a = wrap(`${r.ref}. ${r.text}`, T1, cw - 0.2), b = wrap(`Response: ${r.response || '(no response yet)'}${r.sheet ? '  Sheet ' + r.sheet : ''}${pin ? '  Note ' + pin.n : ''}  ${r.done ? 'DONE' : 'OPEN'}`, T1, cw - 0.3, true);
      ensure((a.length + b.length) * T1 * 1.3 + 0.1); for (const l of a) { sb.text(x0, y, T1, l, {}); y += T1 * 1.3; } for (const l of b) { sb.text(x0 + 0.12, y, T1, l, { bold: true, tone: r.done ? 'green' : 'ink' }); y += T1 * 1.3; } y += 0.08; } }
  out.push(sb.done()); out.forEach((s, i) => { if (i) s.cont = true; }); return out;
}

/** Dimensioned plot plan on one page (letter: LADBS I.A.1, or 11x17), at the largest standard scale that fits that paper. */
function plotSheet(p: Project, I: Info, o: SheetOpts, paper: Exclude<PaperId, 'archd'>, no: string): Sheet {
  const sb = new SB(no, I.es ? 'PLANO DE PARCELA' : 'PLOT PLAN', paper, 'plot'); const da = frame(sb, I, '');
  const box: Rect = { x: da.x, y: da.y + 0.1, w: da.w - (paper === 'tabloid' ? 0 : 0), h: da.h - 1.25 };
  const { d, sc } = fitDraw(p, box, { es: I.es, scope: 'site', minK: 96, userDims: o.userDims }); const vp = place(sb, d, sc, box); streetLabel(sb, vp, d, p, I.es);
  sb.items.filter(x => x.k === 't' && x.field === 'scale').forEach(x => { (x as SText).s = sc.label; });
  const by = da.y + da.h - 1.0; drawingTitle(sb, da.x + 0.1, by, '1', sb.title, sc.label, 2.6);
  const end = scaleBar(sb, da.x + 0.1, by + 0.55, sc.k, 1.6); sb.text(Math.max(end + 0.25, da.x + 3.2), by - 0.02, T1, `Scale ${sc.label} on ${PAPER_IN[paper].label} sheet. Print at actual size.`, {});
  const sd = siteData(p, I.es); let sy = by + 0.2; const sx = Math.max(end + 0.25, da.x + 3.2); for (const [a, b] of sd.slice(0, 4)) { sb.text(sx, sy, T1, `${a} ${b}`, {}); sy += T1 * 1.3; }
  northArrow(sb, da.x + da.w - 0.45, by + 0.35, 0.28, p.site.northDeg);
  labelPass(sb); return sb.done();
}

/** Every sheet of a set. 'archd': A-1 site, A-2 floor plan (+ continuation sheets), G-2 markup when there is markup, then the
 * A-1.1 letter plot plan for the application (I.A.1). 11x17 or letter: the plot plan alone at that size. */
export function buildSheets(p: Project, paper: PaperId = 'archd', o: SheetOpts = {}): Sheet[] {
  const es = o.es ?? p.people.language === 'es'; const g2 = p.markup.pins.length > 0 || p.markup.responses.length > 0 || !!o.markers?.length;
  if (paper !== 'archd') { const I: Info = { p, es, kind: o.kind, index: [{ no: 'A-1', title: 'PLOT PLAN' }] }; return [plotSheet(p, I, o, paper, 'A-1')]; }
  const index = sheetIndex(p, !!o.markers?.length);
  const I: Info = { p, es, kind: o.kind, index };
  return [siteSheet(p, I, o), ...floorSheets(p, I, o), ...(g2 ? markupSheets(p, I, o) : []), plotSheet(p, I, o, 'letter', 'A-1.1')];
}
/** NCS sheet list for a set (also the README of the handoff). */
export function sheetIndex(p: Project, markers = false): { no: string; title: string }[] {
  const g2 = p.markup.pins.length > 0 || p.markup.responses.length > 0 || markers;
  return [{ no: 'A-1', title: 'SITE PLAN' }, { no: 'A-2', title: 'FLOOR PLAN, SCHEDULES' }, ...(g2 ? [{ no: 'G-2', title: 'REVIEW MARKUP' }] : []), { no: 'A-1.1', title: 'PLOT PLAN 8.5x11 (for the application)' }];
}
/** One sheet for the screen tabs (first page of that sheet). */
export function screenSheet(p: Project, id: 'a1' | 'a2' | 'g2', o: SheetOpts = {}): Sheet {
  const es = o.es ?? false; const index = sheetIndex(p, true); const I: Info = { p, es, kind: 'draft', index };
  return id === 'a1' ? siteSheet(p, I, o) : id === 'a2' ? floorSheets(p, I, o)[0] : markupSheets(p, I, o)[0];
}
void roomAbs;
