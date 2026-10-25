/**
 * OUT-15: pack record and checklist catalog for LA County (unincorporated), BETA.
 * The catalog is the DPW Expedited ADU Checklist, "Updated: 8/6/2019.V4.2" (opened 2026-10-25), in our own plain words.
 */
import type { SheetItem } from './ladbs-adu-2025';
import type { Freshness } from './pack';

export const COUNTY_PACK = {
  jurisdiction: 'la-county',
  version: '2026.10.0-beta',
  effectiveFrom: '2026-01-01',
  verifiedOn: '2026-10-25',
  reviewBy: '2027-01-01',
  /** Beta: opt-in only, never says "Likely yes", export blocked, until human-reviewed golden cases exist. */
  beta: true,
  label: { en: 'Beta: LA County (unincorporated)', es: 'Beta: Condado de LA (no incorporado)' },
  sheet: {
    form: 'LA County DPW Expedited ADU Checklist', rev: 'V4.2 (8/6/2019)',
    url: 'https://pw.lacounty.gov/bsd/lib/fp/Building/Residential/Accessory%20Dwelling%20Units/ADU%20Checklist.V4.2.pdf',
    codes: '2023 LACBC (Title 26)',
    name: { en: 'LA County ADU checklist', es: 'lista de ADU del condado de LA' },
  },
} as const;
export const COUNTY_PACK_ID = `${COUNTY_PACK.jurisdiction}@${COUNTY_PACK.version}`;

export function countyFreshness(today = new Date(), vestDate?: string | null): Freshness {
  const d = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const later = [d, ...(vestDate && /^\d{4}-\d{2}-\d{2}$/.test(vestDate) ? [vestDate] : [])].sort().pop()!;
  if (later >= COUNTY_PACK.reviewBy || later.slice(0, 4) > COUNTY_PACK.verifiedOn.slice(0, 4))
    return { stale: true, reason: `These County rules were last checked on ${COUNTY_PACK.verifiedOn}. New state laws start each January 1.`, reasonEs: `Estas reglas del condado se revisaron el ${COUNTY_PACK.verifiedOn}. Las leyes estatales nuevas empiezan cada 1 de enero.` };
  return { stale: false, reason: `Rules checked on ${COUNTY_PACK.verifiedOn}.`, reasonEs: `Reglas revisadas el ${COUNTY_PACK.verifiedOn}.` };
}

const it = (id: string, section: string, en: string, es: string, mode: SheetItem['mode'], hs = false): SheetItem => ({ id, section, summary: { en, es }, garageRelevant: true, mode, hs });
export const COUNTY_CATALOG: SheetItem[] = [
  it('A1', 'Administrative', 'Regional Planning approval date and number', 'Fecha y número de aprobación de Planificación', 'doc'),
  it('A2', 'Administrative', 'All existing structures on the lot are permitted (106.3)', 'Todas las estructuras tienen permiso', 'auto'),
  it('A3', 'Administrative', 'Lot slope 3:1 or flatter', 'Pendiente del lote 3:1 o menos', 'auto'),
  it('A4', 'Administrative', 'Outside an Alquist-Priolo fault zone', 'Fuera de zona de falla Alquist-Priolo', 'auto'),
  it('A5', 'Administrative', 'General notes, BMP, CF1R forms on the plans', 'Notas generales, BMP y CF1R en planos', 'doc'),
  it('A6', 'Administrative', 'Sprinkler status of house and ADU noted', 'Rociadores de casa y ADU anotados', 'auto', true),
  it('A7', 'Administrative', 'Driveway to back corner 150 ft max; ADU plus attached under 3,600 sq ft', 'Entrada a esquina 150 pies máx.; menos de 3,600 pies²', 'auto', true),
  it('A8', 'Administrative', 'Outside a Fire Hazard Severity Zone (R337)', 'Fuera de zona de peligro de incendio', 'auto', true),
  it('B3', 'Building', 'Hard-wired, interconnected smoke alarms (R314)', 'Alarmas de humo cableadas (R314)', 'auto', true),
  it('B4', 'Building', 'Hard-wired CO alarm outside bedrooms (R315)', 'Alarma de CO cableada (R315)', 'auto', true),
  it('B6', 'Building', 'Bedroom escape windows (R310.2)', 'Ventanas de escape (R310.2)', 'auto', true),
  it('B7', 'Building', 'No openings under 3 ft from the property line', 'Sin aberturas a menos de 3 pies', 'auto', true),
  it('B8', 'Building', 'Eaves within 5 ft: blocking or 1-hour detail, no vents', 'Aleros a menos de 5 pies: detalle de 1 hora', 'auto', true),
  it('AGC1', 'Garage conversion', 'County-approved vapor barrier', 'Barrera de vapor aprobada', 'auto', true),
  it('AGC2', 'Garage conversion', 'Garage door opening infilled on a footing', 'Puerta del garaje rellenada sobre zapata', 'auto', true),
  it('AGC3', 'Garage conversion', 'Owner acknowledges upgrades may be needed', 'El dueño acepta posibles mejoras', 'ask'),
  it('FIRE', 'Fire (Standard Notes)', 'LACoFD Form 195/196 fire flow, hydrant, access road and path', 'Formulario LACoFD 195/196, hidrante, acceso', 'auto', true),
];
export const COUNTY_RULE_ITEMS: Record<string, string[]> = {
  'CJUR-01': ['A1'], 'CGAR-01': ['A2'], 'CSLP-01': ['A3', 'A4'], 'CSPR-01': ['A6'], 'CACC-01': ['A7', 'FIRE'], 'CAREA-01': ['A7'],
  'CFHZ-01': ['A8'], 'CALM-01': ['B3', 'B4'], 'CEGR-01': ['B6'], 'CFIR-01': ['B7', 'B8'], 'CVAP-01': ['AGC1'], 'CDOR-01': ['AGC2'],
  'CFF-01': ['FIRE'], 'CHYD-01': ['FIRE'], 'CROAD-01': ['FIRE'], 'CPATH-01': ['FIRE'],
};
