/**
 * OUT-15: second rule pack. LA County, unincorporated areas only, garage-to-ADU conversions. BETA (opt-in).
 * Built only from primary sources, each opened on 2026-10-25 (see COUNTY_SOURCES and docs/JURISDICTION_PACKS.md):
 *  - LA County Public Works (DPW) Expedited ADU Checklist, "Updated: 8/6/2019.V4.2" (item ids A1..GD5)
 *  - DPW "Garage Conversion to ADU & JADU Standard Notes and Details", rev. 01/06/2023 and 03/20/23 (fire-rated walls, Fire Access and Flow, LACoFD Form 195/6)
 *  - DPW "Homeowner Guide to Garage Conversion to ADU & JADU" (no date printed)
 *  - DPW "ADU Guidelines" v4.1, 10/10/2024 (Fire Department requirements, FAQ)
 *  - Title 22 §22.140.640 as amended by Ord. 2025-0029 (adopted 7/29/2025, effective 8/28/2025), via DRP memo of 8/21/2025
 *  - HCD findings letter to LA County, 12/1/2025 (state law wins where HCD found a conflict)
 *  - Gov. Code §66314, §66323 (text current as of 1/1/2026)
 * Numbers are copied from those sources. Nothing here is a County answer; a beta pack never says "Likely yes".
 */
import type { Rule, Outcome, L, Cite } from './engine';
import type { Project, Tri, CountyInputs } from '../core/model';
import { blankCounty } from '../core/model';
import { area } from '../core/geom';
import { ft, fmtFtIn, inch, isNum, toSqFt } from '../core/units';
import { RULES as CITY_RULES, fireSeparation } from './la-city';
import { COUNTY_PACK, COUNTY_PACK_ID, countyFreshness } from './county-pack';

const EFF = COUNTY_PACK.effectiveFrom;
const t = (en: string, es: string): L => ({ en, es });
const pass = (en: string, es: string): Outcome => ({ status: 'PASS', msg: t(en, es) });
const fail = (en: string, es: string, nEn: string, nEs: string): Outcome => ({ status: 'FAIL', msg: t(en, es), next: t(nEn, nEs) });
const unk = (en: string, es: string, nEn: string, nEs: string): Outcome => ({ status: 'UNKNOWN', msg: t(en, es), next: t(nEn, nEs) });
const info = (en: string, es: string, nEn?: string, nEs?: string): Outcome => ({ status: 'INFO', msg: t(en, es), next: nEn ? t(nEn, nEs!) : undefined });
const yes = (v: Tri) => v === 'yes', no = (v: Tri) => v === 'no';
const conv = (p: Project) => p.adu.mode === 'conversion';
const all = () => true;
const fin = (v: number | null | undefined): v is number => isNum(v) && v > 0;
/** County answers, or blanks when none were saved. */
export const cty = (p: Project): CountyInputs => ({ ...blankCounty(), ...(p.site.county ?? {}) });

/** Every source the pack cites, with the edition printed on it and the day it was opened. */
const D = 'https://pw.lacounty.gov/bsd/lib/fp/Building/Residential/Accessory%20Dwelling%20Units/';
export const COUNTY_SOURCES = {
  checklist: { url: D + 'ADU%20Checklist.V4.2.pdf', edition: 'DPW ADU Checklist V4.2 (updated 8/6/2019)', opened: '2026-10-25' },
  notes: { url: D + 'Garage%20Conversion%20to%20ADU%20%26%20JADU%20Standard%20Notes%20and%20Details.pdf', edition: 'DPW Garage Conversion Standard Notes (rev. 01/06/2023, 03/20/23)', opened: '2026-10-25' },
  guide: { url: D + 'Homeowner%20Guide%20to%20Garage%20Conversion%20to%20ADU%20%26%20JADU.pdf', edition: 'DPW Homeowner Guide to Garage Conversion (no date printed)', opened: '2026-10-25' },
  guidelines: { url: D + 'ADU%20Guidelines.pdf', edition: 'DPW ADU Guidelines v4.1 (10/10/2024)', opened: '2026-10-25' },
  title22: { url: 'https://planning.lacounty.gov/wp-content/uploads/2025/08/ADU_Ordinance_Amendment.pdf', edition: 'Title 22 §22.140.640, Ord. 2025-0029 (eff. 8/28/2025)', opened: '2026-10-25' },
  hcd: { url: 'https://www.hcd.ca.gov/sites/default/files/docs/policy-and-research/ordinance-review-letters/los-angeles-county-adu-findings-120125.pdf', edition: 'HCD letter to LA County, 12/1/2025', opened: '2026-10-25' },
  gov66314: { url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=66314.', edition: 'Gov. Code (current as of 1/1/2026)', opened: '2026-10-25' },
  gov66323: { url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=66323.', edition: 'Gov. Code (current as of 1/1/2026)', opened: '2026-10-25' },
} as const;
const c = (src: keyof typeof COUNTY_SOURCES, code: string): Cite => ({ code, url: COUNTY_SOURCES[src].url, verified: true, edition: COUNTY_SOURCES[src].edition });

/** Thresholds a maintainer can change in one place (Standard Notes, Fire Access and Flow; fire-rated walls). */
export const COUNTY_PARAMS = {
  fireFlowGpm: { fireZone: 1250, unsprinklered: 1000, sprinklered: 500 },
  hydrantMaxFt: 450, accessMaxFt: { unsprinklered: 150, sprinklered: 300 }, roadMinWidthFt: 20, pathMinWidthFt: 5,
  fireSep: { ratedBelowFt: 5, ratedBelowFtSprinklered: 3, openingsBanFt: 3, nothingBelowFt: 2 },
  maxAduSqFt: 1200, maxAddSqFt: 150, maxFireAreaSqFt: 3600, ceilingMinIn: 84, schoolFeeOverSqFt: 500,
} as const;
const P = COUNTY_PARAMS;

const reuse = (id: string): Rule => { const r = CITY_RULES.find(x => x.id === id); if (!r) throw new Error(`missing ${id}`); return r; };

export const COUNTY_RULES: Rule[] = [
  reuse('GEO-01'), reuse('INP-01'),

  { id: 'CJUR-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Lot is in unincorporated LA County', 'El lote está en el condado de LA no incorporado'),
    cites: [c('checklist', 'DPW ADU Checklist V4.2 header (job address, city/locality)'), c('guide', 'DPW Homeowner Guide, Step 1 (LA County Planning approval first)')],
    check: p => p.site.jurisdiction !== 'la-county'
      ? { status: 'FAIL', unsupported: true, msg: t('This lot is not in unincorporated LA County.', 'Este lote no está en el condado de LA no incorporado.'), next: t('Look up the parcel again. The County pack only covers unincorporated areas.', 'Busque la parcela de nuevo. El paquete del condado solo cubre áreas no incorporadas.') }
      : !cty(p).betaOptIn ? { status: 'FAIL', unsupported: true, msg: t('The LA County beta is switched off.', 'La versión beta del condado de LA está apagada.'), next: t('Turn on "Beta: LA County (unincorporated)" on the Lot step to try it.', 'Active "Beta: Condado de LA (no incorporado)" en el paso Lote para probarla.') }
      : pass('LA County (unincorporated) beta rules apply.', 'Aplican las reglas beta del condado de LA (no incorporado).') },

  { id: 'CREV-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Rules are current for this application date', 'Las reglas están al día para esta fecha de solicitud'), cites: [{ code: 'Rule pack review date (state ADU laws change each January 1)', verified: true }],
    check: (p, ctx) => { const f = countyFreshness(ctx?.today ? new Date(ctx.today + 'T12:00:00') : new Date(), ctx?.vestDate ?? p.applicationDate ?? undefined);
      return f.stale ? unk(f.reason, f.reasonEs, 'Update the app and check again.', 'Actualice la app y revise de nuevo.') : pass(`Rule pack ${COUNTY_PACK_ID} covers this date.`, `El paquete ${COUNTY_PACK_ID} cubre esta fecha.`); } },

  { id: 'CGAR-01', version: '1', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Fits the County Garage Conversion program', 'Cabe en el programa de conversión de garaje del condado'),
    cites: [c('guide', 'DPW Homeowner Guide: existing garage, no unpermitted construction, no added footprint, single story'), c('checklist', 'DPW ADU Checklist V4.2 A2 (all existing structures permitted, 106.3)')],
    check: p => { const a = p.adu;
      if (!conv(p)) return { status: 'FAIL', unsupported: true, msg: t('The County beta only checks garage conversions.', 'La beta del condado solo revisa conversiones de garaje.'), next: t('Switch to a garage conversion, or ask LA County Public Works.', 'Cambie a conversión de garaje, o pregunte a Obras Públicas del condado.') };
      if (yes(a.newUpperFloor)) return { status: 'FAIL', unsupported: true, msg: t('A new story is not part of the County Garage Conversion program (single story only).', 'Un piso nuevo no es parte del programa (solo un piso).'), next: t('Use the County\'s regular ADU plan check.', 'Use la revisión regular de ADU del condado.') };
      if (a.existingStructurePermitted === 'unknown' || a.staysInsideWalls === 'unknown' || a.newUpperFloor === 'unknown') return unk('We don\'t know yet if the garage is permitted, stays inside its walls and stays one story.', 'Aún no sabemos si el garaje tiene permiso, queda dentro de sus muros y de un piso.', 'Answer those three questions on the ADU step. The program needs all three.', 'Responda esas tres preguntas en el paso ADU. El programa necesita las tres.');
      if (no(a.existingStructurePermitted)) return fail('The garage has unpermitted work. The program says "NO unpermitted construction within the building."', 'El garaje tiene trabajo sin permiso. El programa no lo acepta.', 'Legalize it first or use regular plan check (state law also lets unpermitted structures convert).', 'Legalícelo primero o use la revisión regular.');
      if (no(a.staysInsideWalls) || a.addedAreaSqFt > 0) return info('Adding floor area is outside the County program ("NO additional footprint"). State law still allows up to 150 sq ft for entry.', 'Agregar área queda fuera del programa del condado. La ley estatal permite hasta 150 pies² para entrada.', 'Expect regular County plan check instead of the program.', 'Espere la revisión regular del condado.');
      return pass('Permitted garage, inside its walls, one story: fits the program.', 'Garaje con permiso, dentro de sus muros, un piso: cabe en el programa.'); } },

  { id: 'CSIZ-01', version: '1', module: 'zoning', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('ADU size under 1,200 sq ft', 'Tamaño del ADU menor de 1,200 pies²'),
    cites: [c('guide', 'DPW Homeowner Guide: converted ADU "less than 1200 square feet"'), c('guidelines', 'DPW ADU Guidelines v4.1: ADU living area capped at 1,200 sq ft')],
    check: p => { const s = p.adu.interiorLivableSqFt ?? Math.round(toSqFt(area(p.adu.footprint)));
      return s >= P.maxAduSqFt ? fail(`About ${s} sq ft. The program is for ADUs under ${P.maxAduSqFt} sq ft.`, `Unos ${s} pies². El programa es para ADU menores de ${P.maxAduSqFt} pies².`, 'Above this size the County needs an engineer and regular review.', 'Sobre este tamaño el condado pide ingeniero y revisión regular.')
        : pass(`About ${s} sq ft: under ${P.maxAduSqFt}.`, `Unos ${s} pies²: menos de ${P.maxAduSqFt}.`); } },

  { id: 'CADD-01', version: '1', module: 'zoning', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Added area: 150 sq ft at most, for entry only', 'Área agregada: máximo 150 pies², solo para entrada'),
    cites: [c('gov66323', 'Gov. Code §66323(a)(1)(A) (expansion of not more than 150 sq ft, ingress and egress only)')],
    check: p => { const a = p.adu; if (!(a.addedAreaSqFt > 0)) return pass('No added area.', 'Sin área agregada.');
      if (a.addedAreaSqFt > P.maxAddSqFt) return fail(`${a.addedAreaSqFt} sq ft added. State law allows ${P.maxAddSqFt} sq ft for this path.`, `${a.addedAreaSqFt} pies² agregados. La ley estatal permite ${P.maxAddSqFt}.`, 'Make the addition smaller, or use the County local ADU path.', 'Reduzca la adición, o use el camino local del condado.');
      if (no(a.addedForIngressOnly)) return fail('The added area is not only for getting in and out.', 'El área agregada no es solo para entrar y salir.', 'State law limits the extra area to entry and exit.', 'La ley estatal limita el área extra a entrada y salida.');
      if (a.addedForIngressOnly === 'unknown') return unk('We don\'t know if the added area is only for entry.', 'No sabemos si el área agregada es solo para entrada.', 'Answer "Added only for getting in and out?".', 'Responda "¿Agregado solo para entrar y salir?".');
      return pass(`${a.addedAreaSqFt} sq ft added for entry: within ${P.maxAddSqFt}.`, `${a.addedAreaSqFt} pies² para entrada: dentro de ${P.maxAddSqFt}.`); } },

  { id: 'CSET-01', version: '1', module: 'zoning', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Setbacks for a converted garage', 'Retiros para un garaje convertido'),
    cites: [c('gov66314', 'Gov. Code §66314(d)(7) (no setback for an existing accessory structure; 4 ft side and rear for new area)'), c('gov66323', 'Gov. Code §66323(a)(1)(C) (side and rear setbacks sufficient for fire and safety)')],
    check: p => { const a = p.adu;
      if (!(a.addedAreaSqFt > 0)) return pass('Existing garage walls: state law requires no setback (fire rules still apply).', 'Muros existentes: la ley estatal no exige retiro (las reglas de incendio siguen).');
      if (!isNum(a.addedSetbackMm)) return unk('The added area\'s distance to the side or rear line is not entered.', 'No se ingresó la distancia del área agregada al lindero.', 'Measure it and enter it on the ADU step.', 'Mídala e ingrésela en el paso ADU.');
      return a.addedSetbackMm < ft(4) ? fail(`The added area is ${fmtFtIn(a.addedSetbackMm)} from the line. New area needs 4 ft.`, `El área agregada está a ${fmtFtIn(a.addedSetbackMm)} del lindero. Se necesitan 4 pies.`, 'Move the addition to at least 4 ft from side and rear lines.', 'Mueva la adición a 4 pies o más.') : pass(`Added area ${fmtFtIn(a.addedSetbackMm)} from the line: at least 4 ft.`, `Área agregada a ${fmtFtIn(a.addedSetbackMm)}: 4 pies o más.`); } },

  { id: 'CFIR-01', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire-rated walls near the property line', 'Muros resistentes al fuego cerca del lindero'),
    cites: [c('notes', 'DPW Standard Notes, Fire-Rated Walls (R302.1, T-R302.1(1) & (2)): unsprinklered <3 ft no openings, 1-hr; 3-5 ft or sprinklered <=3 ft 25% openings, 1-hr; openings and eaves not under 2 ft'), c('checklist', 'DPW ADU Checklist V4.2 B7 (no openings under 3 ft), B8 (eaves within 5 ft)')],
    check: p => { const a = p.adu; const { dist, line } = fireSeparation(p); const d = dist / ft(1);
      if (a.sprinklered === 'unknown') return unk('We don\'t know if the ADU will have fire sprinklers. The County limits change with sprinklers.', 'No sabemos si el ADU tendrá rociadores. Los límites cambian con rociadores.', 'Answer "Fire sprinklers in the ADU?".', 'Responda "¿Rociadores en el ADU?".');
      const spr = yes(a.sprinklered); const ratedBelow = spr ? P.fireSep.ratedBelowFtSprinklered : P.fireSep.ratedBelowFt;
      const where = `${fmtFtIn(dist)} from ${line.en}`, whereEs = `${fmtFtIn(dist)} ${line.es}`;
      if (d < P.fireSep.nothingBelowFt && (yes(a.openingsNearLine) || (a.eaveDepthMm ?? 0) > 0)) return fail(`The ADU wall is ${where}. No openings or eaves are allowed under 2 ft.`, `El muro está a ${whereEs}. No se permiten aberturas ni aleros a menos de 2 pies.`, 'Remove openings and eaves on that wall.', 'Quite aberturas y aleros en ese muro.');
      if (!spr && d < P.fireSep.openingsBanFt && yes(a.openingsNearLine)) return fail(`The ADU wall is ${where}. Without sprinklers, no openings are allowed under 3 ft.`, `El muro está a ${whereEs}. Sin rociadores, no se permiten aberturas a menos de 3 pies.`, 'Close the openings, or add sprinklers (then 25% openings are allowed).', 'Cierre las aberturas, o agregue rociadores.');
      if (d <= ratedBelow) {
        if (yes(a.ratedWallPlanned)) return pass(`The ADU wall is ${where} and will be 1-hour rated.`, `El muro está a ${whereEs} y será de 1 hora.`);
        if (no(a.ratedWallPlanned)) return fail(`The ADU wall is ${where}. It must be 1-hour rated (and so must the eaves).`, `El muro está a ${whereEs}. Debe ser de 1 hora (y los aleros también).`, 'Plan a 1-hour wall and eave detail.', 'Planee muro y alero de 1 hora.');
        return unk(`The ADU wall is ${where}. We don't know if it will be 1-hour rated.`, `El muro está a ${whereEs}. No sabemos si será de 1 hora.`, 'Answer "1-hour rated wall planned?".', 'Responda "¿Muro de 1 hora planeado?".');
      }
      return pass(`The ADU wall is ${where}: no wall or eave protection needed.`, `El muro está a ${whereEs}: no necesita protección.`); } },

  { id: 'CSPR-01', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Sprinklers only if the house has them', 'Rociadores solo si la casa los tiene'),
    cites: [c('checklist', 'DPW ADU Checklist V4.2 A6 (ADU sprinklers required if the SFD is sprinklered)'), c('gov66314', 'Gov. Code §66314(d)(12)')],
    check: p => { const h = p.site.flags.primarySprinklered, s = p.adu.sprinklered;
      if (h === 'unknown') return unk('We don\'t know if the main house has fire sprinklers.', 'No sabemos si la casa tiene rociadores.', 'Answer "Main house has sprinklers?".', 'Responda "¿La casa tiene rociadores?".');
      if (yes(h) && no(s)) return fail('The house has sprinklers, so the ADU needs them too.', 'La casa tiene rociadores, así que el ADU también.', 'Plan sprinklers in the ADU.', 'Planee rociadores en el ADU.');
      if (yes(h) && s === 'unknown') return unk('The house has sprinklers. Will the ADU?', 'La casa tiene rociadores. ¿Y el ADU?', 'The ADU needs sprinklers when the house has them.', 'El ADU los necesita si la casa los tiene.');
      return pass(yes(h) ? 'House and ADU both sprinklered.' : 'The house has no sprinklers, so the ADU does not need them.', yes(h) ? 'Casa y ADU con rociadores.' : 'La casa no tiene rociadores; el ADU no los necesita.'); } },

  { id: 'CFF-01', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire flow (LACoFD Form 195/196)', 'Flujo de agua contra incendios (formulario LACoFD 195/196)'),
    cites: [c('notes', 'DPW Standard Notes, Fire Access and Flow (LACoFD Form 195/6): 1250 GPM fire zone; 1000 GPM unsprinklered; 500 GPM sprinklered; at 20 psi'), c('guidelines', 'DPW ADU Guidelines v4.1, Fire Department requirements (Form 195; referral unless thresholds met)')],
    check: p => { const g = cty(p).fireFlowGpm, z = p.site.flags.vhfhsz, s = p.adu.sprinklered;
      if (z === 'unknown' || s === 'unknown') return unk('We need the fire zone and sprinkler answers to know the fire flow needed.', 'Necesitamos la zona de incendio y los rociadores para saber el flujo.', 'Answer the fire zone and sprinkler questions.', 'Responda las preguntas de zona y rociadores.');
      const need = yes(z) ? P.fireFlowGpm.fireZone : yes(s) ? P.fireFlowGpm.sprinklered : P.fireFlowGpm.unsprinklered;
      if (!fin(g)) return unk(`Fire flow is not entered. This lot needs ${need} GPM at 20 psi.`, `No se ingresó el flujo. Este lote necesita ${need} GPM a 20 psi.`, 'Ask your water company to fill out LACoFD Form 195/196 and enter the GPM.', 'Pida a su compañía de agua el formulario LACoFD 195/196 e ingrese los GPM.');
      return g < need ? fail(`${g} GPM is under the ${need} GPM needed.`, `${g} GPM es menos que los ${need} GPM necesarios.`, 'LA County Fire must review the project (Fire Department referral).', 'Bomberos del condado debe revisar el proyecto.') : pass(`${g} GPM meets the ${need} GPM needed.`, `${g} GPM cumple los ${need} GPM.`); } },

  { id: 'CHYD-01', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire hydrant under 450 ft', 'Hidrante a menos de 450 pies'),
    cites: [c('notes', 'DPW Standard Notes, Fire Access and Flow: hydrant less than 450 feet'), c('guidelines', 'DPW ADU Guidelines v4.1: 450 ft of vehicular access from a public hydrant')],
    check: p => { const h = cty(p).hydrantFt;
      if (!isNum(h)) return unk('Distance to the nearest hydrant is not entered.', 'No se ingresó la distancia al hidrante.', 'Measure along the street from the lot front to the nearest public hydrant.', 'Mida por la calle desde el frente del lote al hidrante público.');
      return h >= P.hydrantMaxFt ? fail(`Hydrant is ${h} ft away. It must be under ${P.hydrantMaxFt} ft.`, `El hidrante está a ${h} pies. Debe ser menos de ${P.hydrantMaxFt}.`, 'LA County Fire must review the project.', 'Bomberos del condado debe revisar el proyecto.') : pass(`Hydrant ${h} ft away: under ${P.hydrantMaxFt}.`, `Hidrante a ${h} pies: menos de ${P.hydrantMaxFt}.`); } },

  { id: 'CACC-01', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('ADU close enough to a fire truck road', 'ADU cerca de un camino para camión de bomberos'),
    cites: [c('notes', 'DPW Standard Notes, Fire Access and Flow: vehicular access less than 150 ft (unsprinklered) or 300 ft (sprinklered)'), c('checklist', 'DPW ADU Checklist V4.2 A7 (driveway to back corner 150 ft max)')],
    check: p => { const d = cty(p).vehicleAccessFt, s = p.adu.sprinklered;
      if (s === 'unknown') return unk('We need the sprinkler answer to know the access limit.', 'Necesitamos saber de rociadores para el límite.', 'Answer "Fire sprinklers in the ADU?".', 'Responda "¿Rociadores en el ADU?".');
      const max = yes(s) ? P.accessMaxFt.sprinklered : P.accessMaxFt.unsprinklered;
      if (!isNum(d)) return unk(`Distance from the road to the ADU is not entered (limit ${max} ft).`, `No se ingresó la distancia del camino al ADU (límite ${max} pies).`, 'Measure the walking route from the 20 ft road to the farthest corner of the ADU.', 'Mida la ruta desde el camino de 20 pies hasta la esquina más lejana del ADU.');
      return d >= max ? fail(`${d} ft from the road. The limit is under ${max} ft${yes(s) ? '' : ' without sprinklers'}.`, `${d} pies del camino. El límite es menos de ${max}.`, yes(s) ? 'LA County Fire must review access.' : 'Adding sprinklers raises the limit to 300 ft, or ask LA County Fire.', yes(s) ? 'Bomberos del condado debe revisar.' : 'Con rociadores el límite sube a 300 pies.') : pass(`${d} ft from the road: under ${max}.`, `${d} pies del camino: menos de ${max}.`); } },

  { id: 'CROAD-01', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire truck road: 20 ft wide, 15% grade or less', 'Camino: 20 pies de ancho, pendiente de 15% o menos'),
    cites: [c('notes', 'DPW Standard Notes, Fire Access and Flow: 20 feet wide, less than 15% grade'), c('guidelines', 'DPW ADU Guidelines v4.1: 20 ft wide clear to the sky, paved, not over 15% grade')],
    check: p => { const k = cty(p);
      if (!isNum(k.roadWidthFt) || k.roadGradeOk === 'unknown') return unk('Road width or grade is not entered.', 'Falta el ancho o la pendiente del camino.', 'Enter the road width and whether it is paved and 15% or flatter.', 'Ingrese el ancho y si está pavimentado y con 15% o menos.');
      if (k.roadWidthFt < P.roadMinWidthFt) return fail(`Road is ${k.roadWidthFt} ft wide. It must be ${P.roadMinWidthFt} ft.`, `El camino mide ${k.roadWidthFt} pies. Debe medir ${P.roadMinWidthFt}.`, 'LA County Fire must review access.', 'Bomberos del condado debe revisar.');
      if (no(k.roadGradeOk)) return fail('The road is steeper than 15% or not paved.', 'El camino es más empinado que 15% o no está pavimentado.', 'LA County Fire must review access.', 'Bomberos del condado debe revisar.');
      return pass(`Road ${k.roadWidthFt} ft wide, paved, 15% or flatter.`, `Camino de ${k.roadWidthFt} pies, pavimentado, 15% o menos.`); } },

  { id: 'CPATH-01', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Walking path to the ADU: 5 ft wide, under 15%', 'Camino a pie al ADU: 5 pies de ancho, menos de 15%'),
    cites: [c('notes', 'DPW Standard Notes, Fire Access note: minimum 5-foot-wide access path, grade under 15%')],
    check: p => { const k = cty(p);
      if (!isNum(k.pathWidthFt) || k.pathGradeOk === 'unknown') return unk('Path width or grade is not entered.', 'Falta el ancho o la pendiente del camino a pie.', 'Measure the narrowest spot of the path from the road to the ADU door.', 'Mida el punto más angosto del camino a la puerta del ADU.');
      if (k.pathWidthFt < P.pathMinWidthFt) return fail(`Path is ${k.pathWidthFt} ft at its narrowest. It must be ${P.pathMinWidthFt} ft.`, `El camino mide ${k.pathWidthFt} pies. Debe medir ${P.pathMinWidthFt}.`, 'Widen the path (move a fence, gate or bins).', 'Ensanche el camino (mueva cerca, puerta o botes).');
      if (no(k.pathGradeOk)) return fail('The path is 15% or steeper.', 'El camino tiene 15% o más.', 'LA County Fire must review access.', 'Bomberos del condado debe revisar.');
      return pass(`Path ${k.pathWidthFt} ft wide, under 15%.`, `Camino de ${k.pathWidthFt} pies, menos de 15%.`); } },

  { id: 'CAREA-01', version: '1', module: 'fire', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: conv,
    title: t('ADU and attached buildings under 3,600 sq ft', 'ADU y edificios adjuntos menos de 3,600 pies²'),
    cites: [c('notes', 'DPW Standard Notes, Fire Access and Flow: less than 3600 sq ft for ADU plus any attached structure'), c('checklist', 'DPW ADU Checklist V4.2 A7')],
    check: p => { const adu = toSqFt(area(p.adu.footprint)) + (p.adu.addedAreaSqFt || 0);
      if (p.adu.garageAttachment === 'unknown') return unk('We don\'t know if the garage is attached.', 'No sabemos si el garaje está adjunto.', 'Pick attached or detached.', 'Elija adjunto o separado.');
      const tot = Math.round(adu + (p.adu.garageAttachment === 'attached' ? toSqFt(area(p.site.primary)) : 0));
      if (tot >= P.maxFireAreaSqFt) return fail(`About ${tot} sq ft together. The limit is under ${P.maxFireAreaSqFt}.`, `Unos ${tot} pies² en total. El límite es menos de ${P.maxFireAreaSqFt}.`, 'LA County Fire must review the project.', 'Bomberos del condado debe revisar.');
      return p.adu.garageAttachment === 'attached' ? info(`About ${tot} sq ft on the ground floor with the house. Upper floors count too.`, `Unos ${tot} pies² en planta baja con la casa. Los pisos altos también cuentan.`, 'Your preparer adds every floor of the house.', 'Su preparador suma todos los pisos.') : pass(`About ${tot} sq ft: under ${P.maxFireAreaSqFt}.`, `Unos ${tot} pies²: menos de ${P.maxFireAreaSqFt}.`); } },

  { id: 'CFHZ-01', version: '1', module: 'hazards', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Fire hazard zone', 'Zona de peligro de incendio'),
    cites: [c('checklist', 'DPW ADU Checklist V4.2 A8 (site plan states the project is outside a Fire Hazard Severity Zone, R337)'), c('guidelines', 'DPW ADU Guidelines v4.1 (fuel modification in VHFHSZ)')],
    check: p => { const z = p.site.flags.vhfhsz;
      if (z === 'unknown') return unk('We don\'t know if the lot is in a Very High Fire Hazard Severity Zone.', 'No sabemos si el lote está en zona de muy alto peligro de incendio.', 'Check the parcel on the County GIS map and answer it on the Lot step.', 'Revise el mapa del condado y responda en el paso Lote.');
      return yes(z) ? info('Fire zone: wildfire building rules (R337), fuel modification and 1,250 GPM fire flow apply. Not the expedited checklist.', 'Zona de incendio: aplican reglas R337, modificación de vegetación y 1,250 GPM.', 'Expect LA County Fire review.', 'Espere revisión de bomberos del condado.') : pass('Outside the fire hazard zone.', 'Fuera de la zona de peligro.'); } },

  { id: 'CPRK-01', version: '1', module: 'zoning', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Parking', 'Estacionamiento'),
    cites: [c('gov66314', 'Gov. Code §66314(d)(11) (converted garage spaces need not be replaced)'), c('title22', 'Title 22 §22.140.640 as amended 2025: one space only in a VHFHSZ unless exempt (e.g. half-mile of transit)')],
    check: p => { const z = p.site.flags.vhfhsz, tr = p.site.flags.transitHalfMile;
      if (!yes(z)) return z === 'unknown' ? unk('Parking depends on the fire zone answer.', 'El estacionamiento depende de la zona de incendio.', 'Answer the fire zone question.', 'Responda la pregunta de zona.') : pass('No ADU parking, and the garage spaces need not be replaced.', 'Sin estacionamiento para el ADU, y no hay que reponer el garaje.');
      if (yes(tr)) return pass('Fire zone, but within a half mile of transit: no ADU parking.', 'Zona de incendio pero cerca de transporte: sin estacionamiento.');
      return unk('In a fire zone the County asks for 1 parking space unless an exemption applies.', 'En zona de incendio el condado pide 1 espacio salvo exención.', 'Show 1 space, or show an exemption (half mile of transit, historic district, car share within a block).', 'Muestre 1 espacio, o una exención.'); } },

  { id: 'CSLP-01', version: '1', module: 'hazards', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Slope, landslide and fault zone', 'Pendiente, deslizamiento y falla'),
    cites: [c('checklist', 'DPW ADU Checklist V4.2 A3 (lot slope 3:1 or less), A4 (outside Alquist-Priolo fault zone)'), c('guide', 'DPW Homeowner Guide: NO slope, landslide or liquefaction; no hillside construction')],
    check: p => { const h = p.site.flags.hillside, f = cty(p).faultZone;
      if (h === 'unknown' || f === 'unknown') return unk('Hillside or fault zone is not answered.', 'Falta ladera o zona de falla.', 'Check the parcel on LAC-GIS (Alquist-Priolo layer) and answer both.', 'Revise LAC-GIS y responda ambas.');
      return yes(h) || yes(f) ? info(`${yes(f) ? 'Fault zone' : 'Hillside'}: outside the expedited program. An engineer is needed.`, `${yes(f) ? 'Zona de falla' : 'Ladera'}: fuera del programa. Se necesita ingeniero.`, 'Expect regular plan check.', 'Espere revisión regular.') : pass('Not hillside, not in a fault zone.', 'Sin ladera ni zona de falla.'); } },

  { id: 'CEGR-01', version: '1', module: 'egress', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Escape window in each bedroom', 'Ventana de escape en cada dormitorio'),
    cites: [c('notes', 'DPW Standard Notes: bedroom egress window 5.7 sq ft net clear, 20 in wide, 24 in high, sill under 44 in'), c('checklist', 'DPW ADU Checklist V4.2 B6 (R310.2)')],
    check: p => { const need = Math.max(1, p.adu.bedrooms); const ws = p.adu.windows.filter(w => w.sleeping);
      if (ws.length < need) return unk(`Escape windows entered for ${ws.length} of ${need} sleeping room(s).`, `Ventanas de escape para ${ws.length} de ${need} cuarto(s).`, 'Add each bedroom\'s window.', 'Agregue la ventana de cada dormitorio.');
      if (ws.some(w => !fin(w.clearWidthMm) || !fin(w.clearHeightMm) || !isNum(w.sillMm))) return unk('Some window sizes are missing.', 'Faltan medidas de ventana.', 'Enter clear width, clear height and sill height.', 'Ingrese ancho, alto y alféizar.');
      const bad = ws.filter(w => toSqFt(w.clearWidthMm! * w.clearHeightMm!) < 5.7 || w.clearWidthMm! < inch(20) || w.clearHeightMm! < inch(24) || w.sillMm! >= inch(44));
      return bad.length ? fail(`${bad.length} escape window(s) too small or too high.`, `${bad.length} ventana(s) muy pequeña(s) o alta(s).`, 'Use 5.7 sq ft clear, 20 in wide, 24 in high, sill under 44 in.', 'Use 5.7 pies², 20 pulg de ancho, 24 de alto, alféizar menos de 44.') : pass('Every sleeping room has a big enough escape window.', 'Cada cuarto tiene ventana de escape suficiente.'); } },

  { id: 'CCEI-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Ceiling at least 7 ft', 'Techo de al menos 7 pies'),
    cites: [c('notes', 'DPW Standard Notes: ceiling height "not be less than 7 feet"')],
    check: p => { const h = p.adu.ceilingHeightMm;
      if (!fin(h)) return unk('Ceiling height is not entered.', 'No se ingresó la altura del techo.', 'Measure floor to ceiling.', 'Mida del piso al techo.');
      return h < inch(P.ceilingMinIn) ? fail(`Ceiling ${fmtFtIn(h)} is under 7 ft.`, `Techo de ${fmtFtIn(h)}: menos de 7 pies.`, 'Raise the ceiling or lower the floor.', 'Suba el techo o baje el piso.') : pass(`Ceiling ${fmtFtIn(h)}: at least 7 ft.`, `Techo de ${fmtFtIn(h)}: 7 pies o más.`); } },

  { id: 'CALM-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Hard-wired smoke and CO alarms', 'Alarmas de humo y CO cableadas'),
    cites: [c('checklist', 'DPW ADU Checklist V4.2 B3 (R314), B4 (R315): interconnected, hard-wired, battery backup')],
    check: p => yes(p.adu.smokeCoPlanned) && yes(p.adu.smokeHardwired) ? pass('Hard-wired, linked smoke and CO alarms are planned.', 'Alarmas cableadas y conectadas planeadas.')
      : no(p.adu.smokeHardwired) ? fail('Alarms must be hard-wired with battery backup.', 'Las alarmas deben ser cableadas con batería.', 'Plan hard-wired, interconnected alarms.', 'Planee alarmas cableadas e interconectadas.')
      : unk('Alarms are not confirmed.', 'Las alarmas no están confirmadas.', 'Show hard-wired smoke alarms in and outside bedrooms and a CO alarm outside bedrooms.', 'Muestre alarmas de humo y CO.') },

  { id: 'CVAP-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: conv,
    title: t('Vapor barrier on the garage slab', 'Barrera de vapor en la losa'),
    cites: [c('checklist', 'DPW ADU Checklist V4.2 AGC1 (County-approved vapor barrier on foundation plan)'), c('notes', 'DPW Standard Notes: existing slab 2 in with 2 in topping, or 3 in sound slab')],
    check: p => yes(p.adu.slabVaporBarrier) ? pass('Vapor barrier is on the foundation plan.', 'Barrera de vapor en el plano.') : no(p.adu.slabVaporBarrier) ? fail('No vapor barrier planned.', 'No hay barrera de vapor.', 'Add a County-approved vapor barrier.', 'Agregue una barrera aprobada por el condado.') : unk('Vapor barrier not confirmed.', 'Barrera de vapor no confirmada.', 'Show it on the foundation plan.', 'Muéstrela en el plano.') },

  { id: 'CDOR-01', version: '1', module: 'structural', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: conv,
    title: t('Garage door opening filled in', 'Abertura de la puerta del garaje rellenada'),
    cites: [c('checklist', 'DPW ADU Checklist V4.2 AGC2 (new continuous footing, or existing footing verified by a design professional)'), c('notes', 'DPW Standard Notes: front entrance "shall be converted to a permanent wall"')],
    check: p => p.adu.removesGarageDoorWall === 'unknown' ? unk('We don\'t know how the garage door opening is closed.', 'No sabemos cómo se cierra la puerta.', 'Answer the garage door wall question.', 'Responda la pregunta del muro.') : info('The garage door becomes a permanent wall on a new continuous footing, or a design professional verifies the old one.', 'La puerta se vuelve muro permanente con zapata nueva, o un profesional verifica la existente.', 'Your preparer details it on the foundation plan.', 'Su preparador lo detalla.') },

  { id: 'CPLN-01', version: '1', module: 'people', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Regional Planning approval comes first', 'Primero la aprobación de Planificación Regional'),
    cites: [c('guide', 'DPW Homeowner Guide, Step 1 and Step 3 (approved LA County Planning plans, Agency Referral items, Owner\'s Agreement)'), c('checklist', 'DPW ADU Checklist V4.2 A1')],
    check: () => info('Get LA County Regional Planning\'s stamp, then send the plans to Public Works with Title 24, agency referrals and the signed Owner\'s Agreement on 24 x 36 in sheets.', 'Obtenga el sello de Planificación Regional, luego envíe a Obras Públicas con Título 24, referencias y el acuerdo del dueño firmado en hojas de 24 x 36 pulg.') },

  { id: 'CFEE-01', version: '1', module: 'fees', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Water, sewer and school receipts', 'Recibos de agua, drenaje y escuela'),
    cites: [c('notes', 'DPW Standard Notes: Will Serve letter from the water purveyor; sanitation fee receipt for a new sewer connection; school fee receipt over 500 sq ft of new construction')],
    check: p => { const s = p.adu.interiorLivableSqFt ?? Math.round(toSqFt(area(p.adu.footprint)));
      return info(`Get a Will Serve letter from your water company${s > P.schoolFeeOverSqFt ? ' and a school fee receipt (over 500 sq ft)' : ''}, plus a sanitation receipt if you add a sewer connection. The sources print no amounts.`, `Obtenga carta "Will Serve" de su compañía de agua${s > P.schoolFeeOverSqFt ? ' y recibo de cuota escolar (más de 500 pies²)' : ''}, y recibo de saneamiento si agrega conexión. Las fuentes no dan montos.`); } },

  { id: 'CRNT-01', version: '1', module: 'people', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Rentals longer than 30 days', 'Rentas de más de 30 días'),
    cites: [c('gov66323', 'Gov. Code §66323(e) (rental for a term longer than 30 days)')],
    check: () => info('If you rent the ADU, each rental must be longer than 30 days. No owner-occupancy rule for the ADU.', 'Si renta el ADU, cada renta debe ser de más de 30 días. No se exige que el dueño viva ahí.') },

  { id: 'CHCD-01', version: '1', module: 'zoning', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Where state law overrides County rules', 'Donde la ley estatal anula reglas del condado'),
    cites: [c('hcd', 'HCD findings letter 12/1/2025: Title 22 §22.140.640 G.1.c.i and G.1.f.7.a (front setback siting), G.1.b.iii (attached height, Gov. Code §66321(b)(4)(D)), G.1.f.2.i (subjective conversion standards)')],
    check: () => info('HCD found parts of the County ADU rules out of line with state law (front-yard siting, attached ADU height, "character-defining features"). This app uses state law there. The County may still apply them until it amends the code.', 'HCD encontró partes de las reglas del condado contrarias a la ley estatal. Esta app usa la ley estatal ahí.', 'If plan check cites one of these, point to the HCD letter of Dec 1, 2025.', 'Si la revisión cita una, muestre la carta de HCD del 1 de dic. de 2025.') },
];
