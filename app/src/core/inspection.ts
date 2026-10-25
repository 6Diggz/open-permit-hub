// Inspector field mode: the site-visit checklist for a garage conversion, the result kept in the project, and the
// .permitpack copy that carries the photos. Items are our own plain words, keyed to the LADBS correction sheet
// (form PC/STR/Corr.Lst.20A) item ids and the California Residential Code section numbers they point at.
import type { Project } from './model';
import type { Report } from '../rules/engine';
import { readiness } from '../rules/readiness';
import { RULE_ITEMS } from '../rules/ladbs-adu-2025';

export type InspStatus = 'pass' | 'fail' | 'na';
export interface InspResult { s: InspStatus | null; note: string; /** Photo id (the photo itself is kept on this device, not in the project). */ photo: string | null; at: string }
export interface Inspection { inspector: string; date: string; general: string; items: Record<string, InspResult> }
/** Inspection stage, in the order of the city's inspection card (r5field-01). */
export type InspStage = 'foundation' | 'frame' | 'insulation' | 'drywall' | 'final';
export interface InspItem { id: string; group: 'site' | 'structure' | 'fire' | 'egress' | 'rooms' | 'systems'; en: string; es: string; sheet: string[]; code: string; stage: InspStage }

export const INSP_ITEMS: InspItem[] = [
  { id: 'addr', group: 'site', en: 'Address numbers posted and readable from the street', es: 'Número de la dirección puesto y legible desde la calle', sheet: ['I.C.2'], code: 'CRC R319' , stage: 'final' },
  { id: 'plans', group: 'site', en: 'Approved plans and permit card on site', es: 'Planos aprobados y tarjeta del permiso en la obra', sheet: ['N.3'], code: '' , stage: 'foundation' },
  { id: 'drain', group: 'site', en: 'Ground slopes away from the building; drainage as shown', es: 'El terreno baja alejándose del edificio; drenaje como en el plano', sheet: ['I.C.7'], code: 'CRC R401.3' , stage: 'final' },
  { id: 'slab', group: 'structure', en: 'Slab vapor retarder or epoxy coating as shown', es: 'Barrera de vapor bajo la losa o capa de epóxico como en el plano', sheet: ['III.J.1'], code: 'CRC R506.2.3' , stage: 'foundation' },
  { id: 'anchor', group: 'structure', en: 'Anchor bolts and hold-downs where shown', es: 'Pernos de anclaje y anclajes de sujeción donde se muestran', sheet: ['III.J.18', 'III.J.12'], code: 'CRC R403.1.6' , stage: 'foundation' },
  { id: 'frame', group: 'structure', en: 'Framing and header at the old garage door opening as shown', es: 'Estructura y dintel en la abertura de la antigua puerta del garaje como en el plano', sheet: ['III.J.9'], code: 'CRC R602' , stage: 'frame' },
  { id: 'shear', group: 'structure', en: 'Shear walls and nailing match the plans', es: 'Muros de corte y clavado según los planos', sheet: ['III.J.8', 'III.J.10'], code: 'CRC R602.10' , stage: 'frame' },
  { id: 'firewall', group: 'fire', en: 'Walls under 5 ft from a lot line: 1-hour rated, no openings where not allowed', es: 'Muros a menos de 5 pies del lindero: protección de 1 hora, sin aberturas donde no se permiten', sheet: ['III.D.1', 'III.A.5'], code: 'CRC R302.1' , stage: 'frame' },
  { id: 'eave', group: 'fire', en: 'Eaves near the lot line protected or cut back as shown', es: 'Aleros cerca del lindero protegidos o recortados como en el plano', sheet: ['III.D.2'], code: 'CRC R302.1' , stage: 'frame' },
  { id: 'smoke', group: 'fire', en: 'Smoke alarms in each bedroom, outside bedrooms and each story; hardwired with battery backup', es: 'Alarmas de humo en cada recámara, fuera de las recámaras y en cada piso; cableadas con batería de respaldo', sheet: ['III.E.1', 'III.E.2'], code: 'CRC R314' , stage: 'final' },
  { id: 'co', group: 'fire', en: 'Carbon monoxide alarm installed', es: 'Alarma de monóxido de carbono instalada', sheet: ['III.E.3', 'III.I.9'], code: 'CRC R315' , stage: 'final' },
  { id: 'sprk', group: 'fire', en: 'Fire sprinklers, where required', es: 'Rociadores contra incendio, donde se requieren', sheet: ['III.E.4', 'III.I.7'], code: 'CRC R313' , stage: 'frame' },
  { id: 'egress', group: 'egress', en: 'Bedroom escape window: clear size and sill height as shown', es: 'Ventana de escape de la recámara: medida libre y altura del antepecho como en el plano', sheet: ['III.F.1'], code: 'CRC R310' , stage: 'final' },
  { id: 'door', group: 'egress', en: 'Exit door size as shown', es: 'Medida de la puerta de salida como en el plano', sheet: ['III.F.2'], code: 'CRC R311.2' , stage: 'final' },
  { id: 'landing', group: 'egress', en: 'Landing at the exit door', es: 'Descanso en la puerta de salida', sheet: ['III.F.3'], code: 'CRC R311.3' , stage: 'final' },
  { id: 'ceiling', group: 'rooms', en: 'Ceiling height in habitable rooms as shown', es: 'Altura del techo en cuartos habitables como en el plano', sheet: ['III.G.1'], code: 'CRC R305' , stage: 'frame' },
  { id: 'light', group: 'rooms', en: 'Light and ventilation in habitable rooms', es: 'Luz y ventilación en cuartos habitables', sheet: ['III.G.2', 'III.G.3'], code: 'CRC R303' , stage: 'final' },
  { id: 'fan', group: 'rooms', en: 'Bathroom exhaust fan vented outside', es: 'Extractor del baño con salida al exterior', sheet: ['III.G.4'], code: 'CRC R303.3' , stage: 'final' },
  { id: 'toilet', group: 'rooms', en: 'Toilet clearances', es: 'Espacios libres del inodoro', sheet: ['III.G.5'], code: 'CRC R307.1' , stage: 'final' },
  { id: 'shower', group: 'rooms', en: 'Shower walls water-resistant to the height shown', es: 'Paredes de la regadera resistentes al agua hasta la altura indicada', sheet: ['III.I.5'], code: 'CRC R307.2' , stage: 'frame' },
  { id: 'glass', group: 'rooms', en: 'Safety glass at doors, tubs, showers and other hazard spots', es: 'Vidrio de seguridad en puertas, tinas, regaderas y otros lugares de riesgo', sheet: ['III.H.2'], code: 'CRC R308.4' , stage: 'final' },
  { id: 'unit', group: 'rooms', en: 'Toilet, sink, tub or shower, and kitchen all in the unit', es: 'Inodoro, lavabo, tina o regadera y cocina dentro de la unidad', sheet: ['III.G.10'], code: '' , stage: 'final' },
  { id: 'wh', group: 'systems', en: 'Water heater strapped', es: 'Calentador de agua amarrado', sheet: ['III.I.6'], code: 'CPC 507.2' , stage: 'final' },
  { id: 'gas', group: 'systems', en: 'Gas shutoff valve, where there is gas', es: 'Válvula de cierre de gas, donde hay gas', sheet: ['III.I.3'], code: '' , stage: 'final' },
  { id: 'infill', group: 'structure', en: 'Old garage door opening: infill footing or curb and sill plate as shown', es: 'Abertura de la antigua puerta del garaje: zapata o bordillo de relleno y solera como en el plano', sheet: ['III.J.4', 'III.J.18'], code: 'CRC R403.1', stage: 'foundation' },
  { id: 'elec', group: 'systems', en: 'Rough electrical: panel or subpanel, wiring and boxes as shown', es: 'Eléctrico en bruto: tablero o subtablero, cableado y cajas como en el plano', sheet: [], code: 'CEC', stage: 'frame' },
  { id: 'plumb', group: 'systems', en: 'Rough plumbing: drain and vent water test, supply pressure test (top-out)', es: 'Plomería en bruto: prueba de agua de drenaje y ventilación, prueba de presión del suministro', sheet: [], code: 'CPC', stage: 'frame' },
  { id: 'gastest', group: 'systems', en: 'Gas line test, where there is gas', es: 'Prueba de la línea de gas, donde hay gas', sheet: ['III.I.3'], code: 'CPC', stage: 'frame' },
  { id: 'flash', group: 'structure', en: 'Window and door flashing at new openings', es: 'Tapajuntas en ventanas y puertas nuevas', sheet: [], code: 'CRC R703.4', stage: 'frame' },
  { id: 'drywall', group: 'rooms', en: 'Drywall or lath nailing before taping (type X where rated walls are shown)', es: 'Clavado del panel de yeso o malla antes de encintar (tipo X donde hay muros resistentes)', sheet: ['III.D.1'], code: 'CRC R702.3', stage: 'drywall' },
  { id: 'gfci', group: 'systems', en: 'GFCI and AFCI protection where required (kitchen, bath, outdoors, bedrooms)', es: 'Protección GFCI y AFCI donde se requiere (cocina, baño, exterior, recámaras)', sheet: [], code: 'CEC 210.8, 210.12', stage: 'final' },
  { id: 'energy', group: 'systems', en: 'Insulation and energy items match the Title 24 forms', es: 'Aislamiento y puntos de energía según los formularios Title 24', sheet: ['III.H.9'], code: 'Title 24 Part 6' , stage: 'insulation' },
];
export const GROUPS: Record<InspItem['group'], { en: string; es: string }> = {
  site: { en: 'Site', es: 'Sitio' }, structure: { en: 'Structure', es: 'Estructura' }, fire: { en: 'Fire and alarms', es: 'Incendio y alarmas' },
  egress: { en: 'Ways out', es: 'Salidas' }, rooms: { en: 'Rooms', es: 'Cuartos' }, systems: { en: 'Systems', es: 'Sistemas' },
};

export const MAX_NOTE = 1000;
/** Photos: one per item, compressed on the phone to at most this size. 25 items x 110 KB keeps the .permitpack under its 5 MB cap. */
export const PHOTO_MAX_BYTES = 110 * 1024;
export const PHOTO_INPUT_MAX_BYTES = 40 * 1024 * 1024;

export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const blankInspection = (): Inspection => ({ inspector: '', date: today(), general: '', items: {} });
export const result = (i: Inspection | undefined, id: string): InspResult => i?.items[id] ?? { s: null, note: '', photo: null, at: '' };
export function tally(i: Inspection | undefined) {
  const r = INSP_ITEMS.map(x => result(i, x.id).s);
  return { pass: r.filter(s => s === 'pass').length, fail: r.filter(s => s === 'fail').length, na: r.filter(s => s === 'na').length, open: r.filter(s => s == null).length, total: INSP_ITEMS.length,
    photos: INSP_ITEMS.filter(x => result(i, x.id).photo).length };
}

const PHOTO_ID = /^[A-Za-z0-9-]{8,64}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
/** Never trusts a file: known item ids only, statuses from the list, capped text, photo ids of a safe shape. */
export function sanitizeInspection(raw: unknown): Inspection | undefined {
  if (!raw || typeof raw !== 'object') return undefined; const r = raw as any;
  const items: Record<string, InspResult> = {};
  const src = r.items && typeof r.items === 'object' ? r.items : {};
  for (const x of INSP_ITEMS) { const v = src[x.id]; if (!v || typeof v !== 'object') continue;
    items[x.id] = { s: v.s === 'pass' || v.s === 'fail' || v.s === 'na' ? v.s : null, note: str(v.note, MAX_NOTE), photo: typeof v.photo === 'string' && PHOTO_ID.test(v.photo) ? v.photo : null, at: str(v.at, 40) }; }
  return { inspector: str(r.inspector, 80), date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : today(), general: str(r.general, MAX_NOTE * 2), items };
}
const DATA_JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
/** Photos carried in a .permitpack: only for photo ids the inspection uses, JPEG only, size-capped. */
export function sanitizePhotos(raw: unknown, ins: Inspection | undefined): Record<string, string> {
  const out: Record<string, string> = {}; if (!raw || typeof raw !== 'object' || !ins) return out;
  const used = new Set(Object.values(ins.items).map(v => v.photo).filter(Boolean) as string[]);
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) if (used.has(id) && typeof v === 'string' && v.length <= Math.ceil(PHOTO_MAX_BYTES * 1.4) + 32 && DATA_JPEG.test(v)) out[id] = v;
  return out;
}

/** The .permitpack for a site visit: the project (with the results) plus the photos as JPEG data URLs, under the pack size cap. */
export function inspectionPack(base: string, photos: Record<string, string>, maxBytes: number): { text: string; left: string[] } {
  const j = JSON.parse(base); const keep: Record<string, string> = {}; const left: string[] = [];
  let size = base.length + 64;
  for (const [id, d] of Object.entries(photos).sort((a, b) => a[1].length - b[1].length)) { if (size + d.length + id.length + 8 > maxBytes) { left.push(id); continue; } keep[id] = d; size += d.length + id.length + 8; }
  j.inspectionPhotos = keep; return { text: JSON.stringify(j, null, 1), left };
}
export const hasInspection = (p: Project) => !!p.inspection && (Object.keys(p.inspection.items).length > 0 || !!p.inspection.inspector || !!p.inspection.general);

/** r5whole-02: items marked Pass in the field whose sheet items the app's checks fail (the field result overrides a failing check). */
export function fieldConflicts(p: Project, rep: Report): string[] {
  const failing = new Set(readiness(p, rep).items.filter(x => x.state === 'failing').map(x => x.item.id));
  return INSP_ITEMS.filter(x => result(p.inspection, x.id).s === 'pass' && x.sheet.some(id => failing.has(id))).map(x => x.id);
}
/** The app's own result for one field item: the failing rule messages behind its sheet items (empty when nothing fails). */
export function appFails(p: Project, rep: Report, itemId: string, lang: 'en' | 'es'): string[] {
  const x = INSP_ITEMS.find(i => i.id === itemId); if (!x) return [];
  const rd = readiness(p, rep); const bad = new Set(rd.items.filter(i => i.state === 'failing').map(i => i.item.id));
  if (!x.sheet.some(id => bad.has(id))) return [];
  return [...new Set(rep.results.filter(r => r.status === 'FAIL' && !r.dismissed && (RULE_ITEMS_OF(r.rule.id).some(id => x.sheet.includes(id)))).map(r => r.msg[lang]))];
}
const RULE_ITEMS_OF = (id: string): string[] => RULE_ITEMS[id] ?? [];
