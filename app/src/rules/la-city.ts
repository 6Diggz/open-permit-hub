import type { Rule, Outcome, L } from './engine';
import type { Project, Tri } from '../core/model';
import { area, clearanceToEdge, gap, polyInside } from '../core/geom';
import { ft, fmtFtIn, inch, isNum, toSqFt, RANGES } from '../core/units';
import { PACK, PACK_ID, LA_ED, packFreshness } from './pack';
import { applyTape, footLocal, openingProblems, overlappingRooms, roomArea, roomCeiling, roomFits, roomMinDim } from '../core/rooms';

export { PACK_ID };
const SHEET_URL = PACK.sheet.url;
const EFF = PACK.effectiveFrom; // single source: rules/pack.ts
/** Edition label for LA code sections, as printed on the LADBS sheet (rules/pack.ts). */
const LAED = `${LA_ED} LA codes (as cited by the LADBS sheet)`;
const t = (en: string, es: string): L => ({ en, es });
const pass = (en: string, es: string, values?: Outcome['values']): Outcome => ({ status: 'PASS', msg: t(en, es), values });
const fail = (en: string, es: string, nextEn: string, nextEs: string, values?: Outcome['values']): Outcome => ({ status: 'FAIL', msg: t(en, es), next: t(nextEn, nextEs), values });
const unk = (en: string, es: string, nextEn: string, nextEs: string): Outcome => ({ status: 'UNKNOWN', msg: t(en, es), next: t(nextEn, nextEs) });
const info = (en: string, es: string, nextEn?: string, nextEs?: string, values?: Outcome['values']): Outcome => ({ status: 'INFO', msg: t(en, es), next: nextEn ? t(nextEn, nextEs!) : undefined, values });
const yes = (v: Tri) => v === 'yes', no = (v: Tri) => v === 'no';
const conv = (p: Project) => p.adu.mode === 'conversion';
const all = () => true;
/** Official state text (leginfo). The old public.law links 404 for the renumbered ADU sections (66314 and up). */
const GOV = 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=';

const safeName = (s: string) => s.replace(/[<>\r\n`]/g, ' ').slice(0, 40);
const sane = (v: number | null, lo: number, hi: number) => v != null && Number.isFinite(v) && v >= lo && v <= hi;
/** A usable measurement: finite and above zero. Anything else is "not entered", never a silent PASS. */
const fin = (v: number | null | undefined): v is number => isNum(v) && v > 0;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const winOk = (x: { clearWidthMm: number | null; clearHeightMm: number | null; sillMm: number | null; gradeFloor: boolean }) => {
  const sq = toSqFt(x.clearWidthMm! * x.clearHeightMm!), need = x.gradeFloor ? 5.0 : 5.7;
  return [sq < need && `net clear ${sq.toFixed(1)} sq ft < ${need}`, x.clearHeightMm! < inch(24) && 'clear height under 24"', x.clearWidthMm! < inch(20) && 'clear width under 20"', x.sillMm! > inch(44) && 'sill over 44"'].filter(Boolean) as string[];
};

/**
 * Fire separation lines for the ADU (LADBS sheet III-D.1: "less than 5' from property line or assumed property line").
 * Measured to every lot line, to the assumed line halfway to every other building on the lot, and to the added entry area.
 */
export function fireSeparation(p: Project): { dist: number; line: L } {
  const fp = p.adu.footprint, lot = p.site.lot; let best = { dist: Infinity, line: t('the property line', 'del lindero') };
  lot.forEach((_, i) => { const d = clearanceToEdge(fp, lot, i); if (d < best.dist) best = { dist: d, line: t('the property line', 'del lindero') }; });
  // An attached garage converted inside the house is separated by a fire partition between units (III-D.5), not by an exterior wall.
  // "Attached" is trusted only when the drawing agrees (the footprints touch). A drawn gap is measured like any other building.
  const houseGap = gap(fp, p.site.primary);
  const g = attachedShared(p) ? Infinity : houseGap / 2;
  if (g < best.dist) best = { dist: g, line: t('the assumed line halfway to the main house', 'de la línea supuesta a medio camino de la casa') };
  // Every other building on the lot (second garage, shed, workshop) sets its own assumed line halfway (III-D.1).
  if (p.site.otherBuildings === 'yes' && isNum(p.site.otherBuildingGapMm) && p.site.otherBuildingGapMm / 2 < best.dist) best = { dist: p.site.otherBuildingGapMm / 2, line: t('the assumed line halfway to the other building', 'de la línea supuesta a medio camino del otro edificio') };
  if (p.adu.addedAreaSqFt > 0 && isNum(p.adu.addedSetbackMm) && p.adu.addedSetbackMm < best.dist) best = { dist: p.adu.addedSetbackMm, line: t('the property line (added entry area)', 'del lindero (área de entrada agregada)') };
  return best;
}

/** Attached garage whose drawn footprint shares a wall with the house (gap 0). */
export const attachedShared = (p: Project) => p.adu.mode === 'conversion' && p.adu.garageAttachment === 'attached' && gap(p.adu.footprint, p.site.primary) === 0;
/** Fire-separation inputs that are still missing (other buildings on the lot). Returns an UNKNOWN outcome, or null. */
function otherBuildingsMissing(p: Project): Outcome | null {
  const o = p.site.otherBuildings;
  if (o === 'unknown') return unk('We don\'t know if there are other buildings on the lot (a shed, second garage or workshop).', 'No sabemos si hay otros edificios en el lote (un cobertizo, otro garaje o un taller).', 'Answer "Other buildings on the lot?" on the Lot step. Each one sets an assumed property line halfway between it and the ADU.', 'Responda "¿Otros edificios en el lote?" en el paso Lote. Cada uno fija un lindero supuesto a medio camino entre él y el ADU.');
  if (o === 'yes' && !isNum(p.site.otherBuildingGapMm)) return unk('There are other buildings on the lot, but the distance to the closest one is not entered.', 'Hay otros edificios en el lote, pero no se ingresó la distancia al más cercano.', 'Measure from the ADU to the closest other building and enter it on the Lot step.', 'Mida desde el ADU hasta el otro edificio más cercano e ingréselo en el paso Lote.');
  return null;
}
function jurLaCity(p: Project): Outcome {
  const city = addressCity(p.site.address);
  if (city && city !== 'los angeles' && city !== 'la' && !p.site.jurisdictionConfirmed) return { status: 'NOT_CHECKED', msg: t(`The address names "${safeName(city)}". Many places with their own rules sit inside or next to LA, and some LA neighborhoods use their own name in addresses.`, `La dirección dice "${safeName(city)}". Muchos lugares con sus propias reglas están dentro o junto a LA, y algunos barrios de LA usan su propio nombre en las direcciones.`), next: t('Look up the parcel in ZIMAS (zimas.lacity.org). If it is in the City of Los Angeles, tick "I checked ZIMAS" on the Lot step.', 'Busque la parcela en ZIMAS (zimas.lacity.org). Si está en la Ciudad de Los Ángeles, marque "Revisé ZIMAS" en el paso Lote.') };
  return pass('Rules for the City of Los Angeles apply.', 'Aplican las reglas de la Ciudad de Los Ángeles.');
}
/** Words in a room name that mean it is not a bedroom. */
const NOT_BEDROOM = /\b(living|kitchen|bath|bathroom|dining|family|laundry|hall|closet|sala|cocina|baño|bano|comedor|lavander[ií]a|pasillo)\b/i;
/** Cities and places named in the address other than Los Angeles: "123 Main St, Compton, CA 90220" -> "compton". */
export function addressCity(addr: string): string | null {
  const parts = addr.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // City is the part before "CA" / "CA 90xxx" / "California", or the last part when no state is given.
  let i = parts.findIndex(x => /^(ca|calif(ornia)?)(\s+\d{5}(-\d{4})?)?$/i.test(x));
  if (i < 0) i = parts.length;
  const c = parts[i - 1]?.replace(/\s+\d{5}(-\d{4})?$/, '').trim().toLowerCase();
  return c && i - 1 >= 1 && !/\d/.test(c) ? c : null;
}

export const RULES: Rule[] = [
  { id: 'GEO-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Drawing and numbers make sense', 'El dibujo y los números tienen sentido'), cites: [{ code: 'Data check (not a code rule)', verified: true }],
    check: p => {
      const lot = p.site.lot, A = lot.length >= 3 ? area(lot) : 0, a = p.adu;
      if (A <= 0 || !lot.every(q => Number.isFinite(q.x) && Number.isFinite(q.y))) return fail('The lot shape is empty or broken.', 'La forma del lote está vacía o rota.', 'Enter the lot width and depth again.', 'Ingrese de nuevo el ancho y fondo del lote.');
      if (area(a.footprint) <= 0) return fail('The ADU has no size.', 'El ADU no tiene tamaño.', 'Enter the garage width and depth.', 'Ingrese el ancho y fondo del garaje.');
      if (!polyInside(a.footprint, lot)) return fail('Part of the ADU is drawn outside the lot.', 'Parte del ADU está fuera del lote.', 'Drag the ADU inside the lot lines, or fix the lot size.', 'Mueva el ADU dentro del lote.');
      const bad: string[] = [];
      if (!sane(a.heightMm, ft(7), ft(60))) bad.push('overall height');
      if (a.ceilingHeightMm != null && !sane(a.ceilingHeightMm, ft(5), ft(30))) bad.push('ceiling height');
      if (a.hosePullFt != null && !sane(a.hosePullFt, 1, 2000)) bad.push('hose pull distance');
      if (a.interiorLivableSqFt != null && !sane(a.interiorLivableSqFt, 50, 5000)) bad.push('livable area');
      if (!sane(a.addedAreaSqFt, 0, 5000)) bad.push('added area');
      if (a.windows.some(w => [w.clearWidthMm, w.clearHeightMm].some(v => v != null && !sane(v, 0, RANGES.window[1])) || (w.sillMm != null && !sane(w.sillMm, 0, RANGES.sill[1])))) bad.push('a window size');
      if (a.eaveDepthMm != null && !sane(a.eaveDepthMm, 0, ft(6))) bad.push('eave depth');
      if (a.addedSetbackMm != null && !sane(a.addedSetbackMm, 0, ft(500))) bad.push('added area setback');
      if (!Number.isInteger(a.bedrooms) || a.bedrooms < 0 || a.bedrooms > 6) bad.push('bedrooms');
      if (bad.length) return unk(`Check these numbers: ${bad.join(', ')}.`, `Revise estos números: ${bad.join(', ')}.`, 'They look out of range for a garage ADU.', 'Parecen fuera de rango para un ADU de garaje.');
      return pass('Drawing and numbers look valid.', 'El dibujo y los números son válidos.');
    } },

  { id: 'INP-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Your real sizes are entered', 'Sus medidas reales están ingresadas'), cites: [{ code: 'Data check (not a code rule)', verified: true }],
    check: p => { const miss = [!p.confirmed?.lot && 'lot size', !p.confirmed?.house && 'house size and position', !p.confirmed?.adu && 'garage size and position'].filter(Boolean) as string[];
      const missEs = [!p.confirmed?.lot && 'tamaño del lote', !p.confirmed?.house && 'tamaño y posición de la casa', !p.confirmed?.adu && 'tamaño y posición del garaje'].filter(Boolean) as string[];
      return miss.length ? unk(`Still showing example sizes: ${miss.join(', ')}.`, `Aún muestra medidas de ejemplo: ${missEs.join(', ')}.`, 'Enter your own measurements. Checks use example numbers until you do.', 'Ingrese sus propias medidas. Las revisiones usan números de ejemplo hasta que lo haga.') : pass('Sizes entered by you.', 'Medidas ingresadas por usted.'); } },
  { id: 'JUR-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Address is in LA City', 'La dirección está en la Ciudad de LA'), cites: [{ code: 'LADBS jurisdiction', url: 'https://dbs.lacity.gov', verified: true }],
    check: p => p.site.jurisdiction === 'la-city' ? jurLaCity(p)
      : p.site.jurisdiction === 'unknown' ? unk('We don\'t know the city yet.', 'Aún no sabemos la ciudad.', 'Look up the parcel in ZIMAS (zimas.lacity.org). It shows if the lot is in LA City.', 'Busque la parcela en ZIMAS (zimas.lacity.org). Muestra si el lote está en la Ciudad de LA.')
      : fail('This lot is outside LA City. Other cities have their own rules.', 'Este lote está fuera de la Ciudad de LA.', 'Only LA City is supported in this version. LA County is next.', 'Solo la Ciudad de LA está disponible por ahora.') },

  { id: 'REV-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Rules are current for this application date', 'Las reglas están al día para esta fecha de solicitud'), cites: [{ code: 'Rule pack review date (state ADU laws change each January 1)', verified: true }],
    check: (p, ctx) => { const f = packFreshness(ctx?.today ? new Date(ctx.today + 'T12:00:00') : new Date(), ctx?.vestDate ?? p.applicationDate ?? undefined);
      return f.stale ? unk(f.reason, f.reasonEs, 'Update the app (reload it online) and check again. Until the rules are re-checked, nothing here is ready to file.', 'Actualice la app (recárguela con internet) y revise de nuevo. Hasta revisar las reglas, nada aquí está listo para presentar.')
        : pass(`Rule pack ${PACK_ID}, checked ${PACK.verifiedOn}, covers this date.`, `El paquete de reglas ${PACK_ID}, revisado el ${PACK.verifiedOn}, cubre esta fecha.`); } },

  { id: 'GAR-01', version: '1', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Garage path: attached or detached, inside the existing walls', 'Camino del garaje: adjunto o separado, dentro de los muros existentes'),
    cites: [{ code: 'Gov. Code §66323(a)(1)(A); LADBS sheet II-C (detached) and II-G (attached)', url: GOV + '66323.', verified: true }],
    check: p => {
      const a = p.adu;
      if (a.garageAttachment === 'unknown') return unk('We don\'t know if the garage is attached to the house or detached.', 'No sabemos si el garaje está adjunto a la casa o separado.', 'Pick attached or detached. The city uses a different checklist for each (sheet II-C or II-G).', 'Elija adjunto o separado. La ciudad usa una lista distinta para cada uno (hoja II-C o II-G).');
      if (a.staysInsideWalls === 'unknown') return unk('We don\'t know if the ADU stays inside the existing garage walls.', 'No sabemos si el ADU queda dentro de los muros existentes del garaje.', 'Answer "Does the ADU stay inside the existing walls?".', 'Responda "¿El ADU queda dentro de los muros existentes?".');
      if (no(a.staysInsideWalls)) return fail('The ADU goes outside the existing garage walls, so it is not a simple conversion.', 'El ADU sale de los muros existentes, así que no es una conversión simple.', a.garageAttachment === 'detached' ? 'Keep it inside the walls (plus up to 150 sq ft for entry), or treat it as a new ADU.' : 'Keep it inside the house walls, or use the attached Ordinance ADU path (sheet II-F).', a.garageAttachment === 'detached' ? 'Manténgalo dentro de los muros (más hasta 150 pies² para entrada), o trátelo como ADU nuevo.' : 'Manténgalo dentro de la casa, o use el camino de ADU adjunto por ordenanza (hoja II-F).');
      if (a.garageAttachment === 'attached' && a.mode === 'conversion' && !attachedShared(p)) return unk(`You picked attached, but the drawing shows the garage ${fmtFtIn(gap(a.footprint, p.site.primary))} away from the house.`, `Eligió adjunto, pero el dibujo muestra el garaje a ${fmtFtIn(gap(a.footprint, p.site.primary))} de la casa.`, 'Is it attached? If it shares a wall with the house, move the garage on the drawing so it touches the house. If not, pick detached. Fire checks measure the drawn gap until then.', '¿Está adjunto? Si comparte un muro con la casa, mueva el garaje en el dibujo para que toque la casa. Si no, elija separado. Las revisiones de incendio miden el espacio dibujado hasta entonces.');
      return a.garageAttachment === 'detached' ? pass('Detached garage converted inside its walls: sheet II-C path.', 'Garaje separado convertido dentro de sus muros: camino de la hoja II-C.') : pass('Attached garage converted inside the house: sheet II-G path.', 'Garaje adjunto convertido dentro de la casa: camino de la hoja II-G.');
    } },

  { id: 'MIX-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Main house and units already on the lot', 'Casa principal y unidades que ya hay en el lote'),
    cites: [{ code: 'LADBS sheet II-C (conversion per Gov. Code §66323(a)(1) for an existing single-family dwelling only); II-C.1, II-C.5 (unit mix)', url: SHEET_URL, verified: true }, { code: 'Gov. Code §66323(a)(1) (one ADU and one JADU per single-family lot)', url: GOV + '66323.', verified: true }],
    check: p => {
      const s = p.site;
      if (s.mainBuilding === 'unknown') return unk('We don\'t know what the main building is.', 'No sabemos qué es el edificio principal.', 'Pick single-family house, duplex or apartments. The garage path (sheet II-C) is only for a lot with one existing single-family house.', 'Elija casa unifamiliar, dúplex o apartamentos. El camino del garaje (hoja II-C) es solo para un lote con una casa unifamiliar existente.');
      if (s.mainBuilding !== 'sfd') return { status: 'FAIL', unsupported: true, msg: t('This lot has a duplex or apartments. The city uses a different checklist (sheet II-E or II-I) that this app does not check yet.', 'Este lote tiene un dúplex o apartamentos. La ciudad usa otra lista (hoja II-E o II-I) que esta app aún no revisa.'), next: t('Ask a preparer who handles multifamily ADUs.', 'Consulte a un preparador que haga ADU en multifamiliares.') };
      if (s.existingAdus == null || s.existingJadus == null) return unk('We don\'t know if the lot already has an ADU or a junior ADU.', 'No sabemos si el lote ya tiene un ADU o un ADU junior.', 'Enter how many ADUs and junior ADUs are already on the lot (0 if none).', 'Indique cuántos ADU y ADU junior ya hay en el lote (0 si no hay).');
      if (s.existingAdus >= 1) return fail(`The lot already has ${s.existingAdus} ADU. A single-family lot gets one ADU plus one junior ADU on this path.`, `El lote ya tiene ${s.existingAdus} ADU. Un lote unifamiliar tiene un ADU más un ADU junior en este camino.`, 'Ask your preparer about another path (sheet II-A or II-F), or legalize the existing unit instead.', 'Pregunte a su preparador por otro camino (hoja II-A o II-F), o legalice la unidad existente.');
      if (s.existingJadus > 1) return fail(`The lot has ${s.existingJadus} junior ADUs. Only one is allowed.`, `El lote tiene ${s.existingJadus} ADU junior. Solo se permite uno.`, 'Check the permit records with your preparer.', 'Revise los permisos con su preparador.');
      return pass('One single-family house and no other ADU: the garage path applies.', 'Una casa unifamiliar y ningún otro ADU: aplica el camino del garaje.');
    } },

  { id: 'SCP-01', version: '2', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Added area: 150 sq ft max, only for getting in and out', 'Área agregada: máximo 150 pies², solo para entrar y salir'),
    cites: [{ code: 'Gov. Code §66323(a)(1)(A) (150 sq ft expansion for ingress and egress); LADBS sheet II-C.3, II-C.4', url: GOV + '66323.', verified: true }],
    check: p => {
      const add = p.adu.addedAreaSqFt;
      if (add <= 0) return pass('No new floor area is added.', 'No se agrega área nueva.');
      if (add > 150) return fail(`Adds ${add} sq ft. Over 150 sq ft moves this off the simple conversion path.`, `Agrega ${add} pies². Más de 150 pies² cambia el camino.`, 'Treat it as a new ADU. Regular ADU rules (Gov. Code §66314) apply.', 'Trátelo como un ADU nuevo. Aplican las reglas normales (Código de Gobierno §66314).');
      if (p.adu.garageAttachment === 'attached') return unk(`Adds ${add} sq ft to an attached garage. The 150 sq ft allowance is written for detached accessory structures.`, `Agrega ${add} pies² a un garaje adjunto. La extensión de 150 pies² es para estructuras separadas.`, 'Sheet II-G allows only existing space. Ask your preparer if the addition goes under the Ordinance ADU path (II-F).', 'La hoja II-G solo permite espacio existente. Pregunte a su preparador si va por el camino II-F.');
      if (p.adu.garageAttachment === 'unknown') return unk(`Adds ${add} sq ft, but we don't know if the garage is attached or detached.`, `Agrega ${add} pies², pero no sabemos si el garaje es adjunto o separado.`, 'Pick attached or detached first.', 'Elija adjunto o separado primero.');
      const io = p.adu.addedForIngressOnly;
      if (io === 'unknown') return unk(`Adds ${add} sq ft. It must be only for getting in and out.`, `Agrega ${add} pies². Debe ser solo para entrar y salir.`, 'Answer "Is the added area only for the entry?".', 'Responda "¿El área agregada es solo para la entrada?".');
      return yes(io) ? pass(`Adds ${add} sq ft for entry only (150 sq ft max).`, `Agrega ${add} pies² solo para la entrada (máx. 150).`) : fail(`Adds ${add} sq ft that is not just for the entry.`, `Agrega ${add} pies² que no son solo para la entrada.`, 'Limit the addition to the entry, or treat it as a new ADU.', 'Limite la adición a la entrada, o trátelo como ADU nuevo.');
    } },

  { id: 'SET-01', version: '2', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Setbacks for a converted existing structure', 'Retiros para una estructura existente convertida'),
    cites: [{ code: 'Gov. Code §66314(d)(7) (4 ft side/rear applies only to ADUs not converted from an existing structure)', url: GOV + '66314.', verified: true }, { code: 'Gov. Code §66332 / AB 2533 (unpermitted ADUs built before 2020)', url: GOV + '66332.', verified: true }],
    check: p => {
      const a = p.adu;
      if (yes(a.existingStructurePermitted)) return pass('The garage was built with a permit. Converting it in place needs no extra setback.', 'El garaje tiene permiso. Convertirlo no requiere retiro adicional.');
      if (no(a.existingStructurePermitted) && yes(a.builtBefore2020) && yes(a.usedAsHomeBefore2020)) return info('Unpermitted, and already used as a separate home before 2020. Under AB 2533 the city generally can\'t deny it over setbacks, only health and safety issues (HSC §17920.3).', 'Sin permiso, y ya usado como vivienda separada antes de 2020. Bajo AB 2533 la ciudad generalmente no puede negarlo por retiros, solo por salud y seguridad (HSC §17920.3).', 'Gather proof it was lived in before 2020: old photos, aerial images, utility bills, leases. Confirm with LADBS.', 'Reúna pruebas de que se habitó antes de 2020: fotos, imágenes aéreas, facturas, contratos. Confirme con LADBS.');
      if (no(a.existingStructurePermitted)) return unk('The garage has no permit. AB 2533 protects only units already used as a home before 2020, not a garage converted now, so it may not keep the existing-structure setback.', 'El garaje no tiene permiso. AB 2533 protege solo unidades ya usadas como vivienda antes de 2020, no un garaje que se convierte ahora, así que puede no conservar el retiro existente.', 'Legalize the garage first, or treat it as new construction with 4 ft side and rear setbacks. Confirm with LADBS.', 'Legalice primero el garaje, o trátelo como construcción nueva con retiros de 4 pies. Confirme con LADBS.');
      return unk('We don\'t know if the garage had a permit.', 'No sabemos si el garaje tenía permiso.', 'Look up the address in LADBS permit records (dbs.lacity.gov), then answer "Was the garage built with a permit?".', 'Busque la dirección en los registros de permisos de LADBS (dbs.lacity.gov), y luego responda "¿El garaje se construyó con permiso?".');
    } },

  { id: 'ADD-01', version: '1', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: p => conv(p) && p.adu.addedAreaSqFt > 0,
    title: t('Setbacks for the added entry area', 'Retiros del área de entrada agregada'),
    cites: [{ code: 'Gov. Code §66323(a)(1)(A) (entry expansion must keep side and rear setbacks sufficient for fire and safety)', url: GOV + '66323.', verified: true }, { code: 'LADBS sheet II-D.4 (4 ft side and rear setback for addition portions of a new detached State ADU; applied to a II-C entry addition here as the likely plan-check standard)', url: SHEET_URL, verified: false }],
    check: p => {
      const d = p.adu.addedSetbackMm;
      if (!isNum(d)) return unk(`Adds ${p.adu.addedAreaSqFt} sq ft, but we don't know how close the added part is to a side or rear line.`, `Agrega ${p.adu.addedAreaSqFt} pies², pero no sabemos qué tan cerca está la parte agregada de un lindero lateral o trasero.`, 'Measure from the added part to the closest side or rear line and enter it on the Garage step.', 'Mida desde la parte agregada al lindero lateral o trasero más cercano e ingréselo en el paso Garaje.');
      return d >= ft(4) ? pass(`Added part is ${fmtFtIn(d)} from the closest side or rear line (need 4' 0").`, `La parte agregada está a ${fmtFtIn(d)} del lindero más cercano (se necesitan 4' 0").`)
        : unk(`Added part is ${fmtFtIn(d)} from a side or rear line. LADBS asks 4' 0" for addition portions, and state law asks for setbacks sufficient for fire and safety.`, `La parte agregada está a ${fmtFtIn(d)} de un lindero. LADBS pide 4' 0" para adiciones, y la ley estatal pide retiros suficientes para incendio y seguridad.`, 'Keep the entry addition 4 ft from side and rear lines, or confirm with LADBS before you design it closer.', 'Mantenga la adición a 4 pies de los linderos, o confirme con LADBS antes de diseñarla más cerca.');
    } },

  { id: 'SET-02', version: '2', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: p => !conv(p),
    title: t('New ADU: 4 ft side and rear setbacks', 'ADU nuevo: retiros de 4 pies laterales y traseros'),
    cites: [{ code: 'Gov. Code §66314 (max 4 ft side and rear; state law controls over the 5 ft on older LADBS sheets)', url: GOV + '66314.', verified: true }],
    check: p => {
      const { lot, streetEdge, lotUncertaintyMm } = p.site; const fp = p.adu.footprint;
      if (!polyInside(fp, lot)) return fail('Part of the ADU is outside the lot lines.', 'Parte del ADU está fuera del lote.', 'Move the ADU fully inside the lot.', 'Mueva el ADU dentro del lote.');
      let worst = Infinity;
      lot.forEach((_, i) => { if (i !== streetEdge) worst = Math.min(worst, clearanceToEdge(fp, lot, i)); });
      const need = ft(4), margin = worst - need;
      const v = { closest: fmtFtIn(worst), required: fmtFtIn(need) };
      if (margin < 0) return fail(`Closest side/rear line is ${v.closest}. At least ${v.required} is required.`, `La línea lateral o trasera más cercana está a ${v.closest}. Se requieren ${v.required}.`, 'Move the ADU away from the lot line.', 'Aleje el ADU de la línea del lote.', v);
      if (margin < lotUncertaintyMm) return unk(`Closest line is ${v.closest}, within the map's error of ${fmtFtIn(lotUncertaintyMm)}.`, `La línea más cercana está dentro del margen de error del mapa.`, 'County maps are not surveys. Get a survey or move the ADU further in.', 'Los mapas del condado no son levantamientos. Obtenga un levantamiento.');
      return pass(`Closest side/rear line is ${v.closest} (need ${v.required}).`, `La línea más cercana está a ${v.closest}.`, v);
    } },

  { id: 'SEP-01', version: '1', module: 'zoning', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: p => !conv(p),
    title: t('Space between the ADU and the main house', 'Espacio entre el ADU y la casa'), cites: [{ code: 'LARC R302.1 (fire separation depends on distance; LADBS sheet III-D.1 assumed property line)', verified: true, edition: LAED }],
    check: p => { const g = gap(p.adu.footprint, p.site.primary); return g === 0 ? fail('The ADU overlaps the main house on the plan.', 'El ADU se superpone con la casa.', 'Move the ADU so it does not touch the house, or design it as attached.', 'Mueva el ADU.') : info(`Gap to the main house: ${fmtFtIn(g)}.`, `Espacio a la casa: ${fmtFtIn(g)}.`, g < ft(10) ? 'Close buildings may need fire-rated walls facing each other. Your preparer confirms.' : undefined, 'Edificios cercanos pueden requerir muros resistentes al fuego.'); } },

  { id: 'HGT-01', version: '2', module: 'zoning', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: p => !conv(p),
    title: t('Height of a detached ADU', 'Altura de un ADU separado'), cites: [{ code: 'Gov. Code §66321(b)(4) (16 ft; 18 ft within a half-mile walk of a major transit stop or a high-quality transit corridor, (b)(4)(B); +2 ft to match roof pitch)', url: GOV + '66321.', verified: true }],
    check: p => {
      const tr = p.site.flags.transitHalfMile;
      if (tr === 'unknown') return unk('We need to know if the lot is within a half-mile walk of a major transit stop or a high-quality transit corridor.', 'Necesitamos saber si el lote está a media milla caminando de una parada de transporte principal o de un corredor de transporte de alta calidad.', 'Check walking distance (not straight-line) to the nearest major transit stop or frequent bus corridor.', 'Revise la distancia caminando a la parada principal o corredor de autobús frecuente más cercano.');
      const pitch = p.adu.roofPitchMatches; const h = p.adu.heightMm;
      const max = yes(tr) ? (yes(pitch) ? ft(20) : ft(18)) : ft(16);
      if (yes(tr) && h > ft(18) && h <= ft(20) && pitch === 'unknown') return unk(`Height ${fmtFtIn(h)}: over 18 ft is allowed only if the roof pitch matches the house.`, `Altura ${fmtFtIn(h)}: más de 18 pies solo si la pendiente coincide con la casa.`, 'Say whether the ADU roof pitch matches the main house.', 'Indique si la pendiente coincide.');
      return h <= max ? pass(`Height ${fmtFtIn(h)} is within ${fmtFtIn(max)}.`, `Altura ${fmtFtIn(h)} dentro de ${fmtFtIn(max)}.`) : fail(`Height ${fmtFtIn(h)} is over the ${fmtFtIn(max)} limit.`, `Altura ${fmtFtIn(h)} supera el límite de ${fmtFtIn(max)}.`, yes(tr) && !yes(pitch) ? 'Lower the roof to 18 ft, or match the main roof pitch (allows up to 20 ft).' : 'Lower the roof.', yes(tr) ? 'Baje a 18 pies o iguale la pendiente (hasta 20 pies).' : 'Baje el techo.');
    } },

  { id: 'CEI-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Ceiling height in living areas', 'Altura del techo en áreas habitables'), cites: [{ code: 'LARC R305.1 (7\'-0" minimum; LADBS sheet III-G.1)', url: SHEET_URL, verified: true, edition: LAED }],
    check: p => {
      // Drawn rooms: every room is checked with its own ceiling (or the garage's). Bathrooms may be 6' 8" (R305.1 exception).
      if (p.adu.rooms?.length) {
        const low: string[] = [], none: string[] = [];
        p.adu.rooms.forEach((r, i) => { const c = roomCeiling(p, r); const nm = safeName(r.name) || `room ${i + 1}`; const need = r.use === 'bath' ? inch(80) : inch(84);
          if (!fin(c)) none.push(nm); else if (c < need) low.push(`${nm} ${fmtFtIn(c)} (need ${fmtFtIn(need)})`); });
        if (low.length) return fail(`Ceiling too low in ${low.join('; ')}.`, `Techo demasiado bajo en ${low.join('; ')}.`, 'Garages often fail here once insulation and drywall go in. Plan for the finished height.', 'Los garajes suelen fallar aquí después del aislamiento y el panel de yeso. Planifique la altura terminada.');
        if (none.length) return unk(`Ceiling height not entered for ${none.join(', ')}.`, `Falta la altura del techo en ${none.join(', ')}.`, 'Measure floor to ceiling in each room, or enter the garage ceiling height.', 'Mida del piso al techo en cada cuarto, o ingrese la altura del techo del garaje.');
        return pass('Every room meets the ceiling height (7\' 0", bathrooms 6\' 8").', 'Cada cuarto cumple la altura del techo (7\' 0", baños 6\' 8").');
      }
      return !fin(p.adu.ceilingHeightMm) ? unk('Ceiling height not entered.', 'Altura del techo no ingresada.', 'Measure floor to ceiling in the main room.', 'Mida del piso al techo en el cuarto principal.')
      : p.adu.ceilingHeightMm >= inch(84) ? pass(`Ceiling ${fmtFtIn(p.adu.ceilingHeightMm)} (need 7' 0").`, `Techo de ${fmtFtIn(p.adu.ceilingHeightMm)} (se necesitan 7' 0").`)
      : fail(`Ceiling ${fmtFtIn(p.adu.ceilingHeightMm)} is under 7' 0".`, `El techo de ${fmtFtIn(p.adu.ceilingHeightMm)} mide menos de 7' 0".`, 'Garages often fail here once insulation and drywall go in. Plan for the finished height.', 'Los garajes a menudo no cumplen aquí una vez que se ponen el aislamiento y los paneles. Planifique la altura terminada.');
    } },

  { id: 'ROM-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: p => (p.adu.rooms?.length ?? 0) > 0,
    title: t('Room sizes and room drawing', 'Tamaño de los cuartos y dibujo'), cites: [{ code: 'LARC R304.1, R304.2 (habitable rooms at least 70 sq ft and 7 ft in any direction; kitchens exempt)', verified: false, edition: LAED }, { code: 'LADBS sheet III-G.8 (interior doors at least 32" wide)', url: SHEET_URL, verified: true, edition: LAED }],
    check: p => {
      const foot = footLocal(p); const out: string[] = [], small: string[] = [], bad: string[] = [];
      p.adu.rooms.forEach((r, i) => { const nm = safeName(r.name) || `room ${i + 1}`;
        if (!roomFits(r.shape === 'rect' ? applyTape(r).poly : r.poly, foot)) out.push(nm);
        if (openingProblems(r).length) bad.push(nm);
        if (r.use === 'sleeping' || r.use === 'living') { const a = toSqFt(roomArea(r)), m = roomMinDim(r); if (a < 70 || m < ft(7)) small.push(`${nm} (${Math.round(a)} sq ft, narrowest ${fmtFtIn(m)})`); } });
      if (out.length) return fail(`Drawn outside the garage outline: ${out.join(', ')}.`, `Dibujado fuera del contorno del garaje: ${out.join(', ')}.`, 'Move or resize the room inside the garage, or check the garage size and the tape sizes.', 'Mueva o cambie el tamaño del cuarto dentro del garaje, o revise el tamaño del garaje y las medidas con cinta.');
      const ov = overlappingRooms(p.adu.rooms).map(([x, y]) => `${safeName(x.name) || 'room'} / ${safeName(y.name) || 'room'}`);
      if (ov.length) return fail(`Rooms drawn on top of each other: ${ov.join(', ')}.`, `Cuartos dibujados uno encima de otro: ${ov.join(', ')}.`, 'Move or resize the rooms so they only share walls.', 'Mueva o cambie el tamaño de los cuartos para que solo compartan muros.');
      if (small.length) return fail(`Too small for a living or sleeping room: ${small.join('; ')}.`, `Demasiado pequeño para sala o dormitorio: ${small.join('; ')}.`, 'Habitable rooms need 70 sq ft and 7 ft across. Make it bigger, or call it a different use.', 'Los cuartos habitables necesitan 70 pies² y 7 pies de ancho. Hágalo más grande o cambie su uso.');
      const doors = p.adu.rooms.flatMap(r => r.openings.filter(o => o.kind === 'door').map(o => ({ r, o })));
      const narrow = doors.filter(x => x.o.widthMm < inch(32) - 0.5).map(x => `${safeName(x.r.name) || 'room'} ${fmtFtIn(x.o.widthMm)}`);
      if (narrow.length) return fail(`Door narrower than 32": ${narrow.join(', ')}.`, `Puerta de menos de 32": ${narrow.join(', ')}.`, 'Use doors at least 32" wide (the door slab size, like 2-8).', 'Use puertas de al menos 32" de ancho (tamaño de la hoja, como 2-8).');
      if (bad.length) return unk(`A door or window does not fit its wall in ${bad.join(', ')}.`, `Una puerta o ventana no cabe en su muro en ${bad.join(', ')}.`, 'Check where each door and window starts and how wide it is.', 'Revise dónde empieza cada puerta y ventana y su ancho.');
      if (!doors.length) return unk('No doors drawn yet.', 'Aún no hay puertas dibujadas.', 'Add the doors to the rooms so door widths can be checked.', 'Agregue las puertas a los cuartos para revisar su ancho.');
      return pass('Rooms fit inside the garage, are big enough, and doors are at least 32" wide.', 'Los cuartos caben en el garaje, tienen el tamaño suficiente y las puertas miden al menos 32".');
    } },

  { id: 'EGR-01', version: '3', module: 'egress', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Escape window in each sleeping room', 'Ventana de escape en cada cuarto para dormir'), cites: [{ code: 'LARC R310.1, R310.2 (every sleeping room; 5.7 sq ft net clear; 5.0 at grade; 24" high; 20" wide; 44" max to bottom; LADBS sheet III-F.1)', url: SHEET_URL, verified: true, edition: LAED }],
    check: p => {
      const a = p.adu; const studio = a.bedrooms === 0;
      const need = studio ? 1 : a.bedrooms;
      // Plan checkers usually treat a studio's main room as a sleeping room (III-F.1, R310.1): "nobody sleeps there" never passes on its own.
      const studioNoSleep = studio && no(a.mainRoomSleeping);
      // Group escape windows by room; a room passes if ANY of its windows passes (extra small windows don't matter).
      const rooms = new Map<string, { label: string; wins: typeof a.windows }>();
      const notBed = a.windows.filter(x => x.sleeping && !studio && NOT_BEDROOM.test(x.room));
      a.windows.filter(x => x.sleeping && !(!studio && NOT_BEDROOM.test(x.room))).forEach((x, i) => { const k = norm(x.room) || `#${i + 1}`; const r = rooms.get(k) ?? { label: safeName(x.room) || `window ${i + 1}`, wins: [] }; r.wins.push(x); rooms.set(k, r); });
      const failing: string[] = [], missing: string[] = []; let good = 0;
      for (const r of rooms.values()) {
        const measured = r.wins.filter(x => fin(x.clearWidthMm) && fin(x.clearHeightMm) && isNum(x.sillMm) && x.sillMm >= 0);
        if (measured.some(x => winOk(x).length === 0)) { good++; continue; }
        if (measured.length < r.wins.length) { missing.push(r.label); continue; }
        failing.push(`${r.label}: ${winOk(measured[0]).join(', ')}`);
      }
      if (failing.length) return fail(`No escape window that meets the rules in ${failing.join('; ')}.`, `Sin ventana de escape que cumpla en ${failing.join('; ')}.`, 'Common sliders often fail. Pick a casement or a larger slider.', 'Las ventanas corredizas comunes a menudo no cumplen. Elija una ventana abatible o una corrediza más grande.');
      if (missing.length) return unk(`Window measurements missing for ${missing.join(', ')}.`, `Faltan medidas de ventana en ${missing.join(', ')}.`, 'Enter clear width, clear height and sill height.', 'Ingrese el ancho libre, el alto libre y la altura del alféizar.');
      if (studioNoSleep && good === 0) return unk('Studio where you say nobody sleeps in the main room. Plan checkers usually treat a studio\'s main room as a sleeping room, so it still needs an escape window.', 'Estudio donde dice que nadie duerme en el cuarto principal. Los revisores suelen tratar el cuarto principal de un estudio como cuarto para dormir, así que igual necesita una ventana de escape.', 'Add the main room\'s escape window (clear width, clear height, sill height), or confirm with plan check that the studio needs none.', 'Agregue la ventana de escape del cuarto principal (ancho libre, alto libre, altura del alféizar), o confirme con la revisión de planos que el estudio no la necesita.');
      if (notBed.length && rooms.size < need) return unk(`A window in ${notBed.map(x => safeName(x.room)).join(', ')} is marked as a bedroom escape window, but that room is not a bedroom.`, `Una ventana en ${notBed.map(x => safeName(x.room)).join(', ')} está marcada como ventana de escape de dormitorio, pero ese cuarto no es un dormitorio.`, 'Each bedroom needs its own escape window. Add the bedroom\'s window and name the room Bedroom.', 'Cada dormitorio necesita su propia ventana de escape. Agregue la ventana del dormitorio y nombre el cuarto Dormitorio.');
      if (rooms.size < need) return unk(studio ? 'Studio: the main room counts as a sleeping room and needs an escape window.' : `${a.bedrooms} bedroom(s), but escape windows are entered for ${rooms.size} room(s).`, studio ? 'Estudio: el cuarto principal cuenta como cuarto para dormir y necesita ventana de escape.' : `${a.bedrooms} dormitorio(s), pero hay ventanas de escape para ${rooms.size} cuarto(s).`,
        studio ? 'Add the main room\'s escape window.' : 'Add a window for each bedroom, and give each bedroom its own room name (Bedroom 1, Bedroom 2).', studio ? 'Agregue la ventana de escape del cuarto principal.' : 'Agregue una ventana por dormitorio, con su propio nombre (Dormitorio 1, Dormitorio 2).');
      return good >= need ? pass(studio ? 'The studio\'s main room has an escape window that meets size rules.' : 'Every bedroom has an escape window that meets size rules.', studio ? 'El cuarto principal del estudio tiene ventana de escape.' : 'Cada dormitorio tiene ventana de escape.') : unk('Not every sleeping room has a measured escape window.', 'No todos los cuartos para dormir tienen ventana medida.', 'Enter each bedroom\'s window.', 'Ingrese la ventana de cada dormitorio.');
    } },

  { id: 'ALM-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Smoke and carbon monoxide alarms', 'Alarmas de humo y monóxido de carbono'), cites: [{ code: 'LARC R314.2, R315 (LADBS sheet III-E.1, III-E.3)', url: SHEET_URL, verified: true, edition: LAED }],
    check: p => yes(p.adu.smokeCoPlanned) ? pass('Alarms are shown on the plan.', 'Alarmas en el plano.') : unk('Alarms are not confirmed on the plan.', 'Las alarmas no están confirmadas en el plano.', 'Show smoke alarms in each bedroom and hall, and CO alarms if there is gas or an attached garage.', 'Muestre alarmas de humo en cada dormitorio y pasillo, y alarmas de CO si hay gas o un garaje adjunto.') },

  { id: 'FIR-01', version: '3', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire-rated walls near the property line or the house', 'Muros resistentes al fuego cerca del lindero o de la casa'),
    cites: [{ code: 'LADBS sheet III-D.1 (1-hour exterior walls under 5 ft from the property line or assumed property line; LABC 706.1.1, LARC R302.1)', url: SHEET_URL, verified: true, edition: LAED },
      { code: 'LADBS sheet III-D.2 (projections such as eaves limited by fire separation distance; LARC Table R302.1(1), R302.1(2))', url: SHEET_URL, verified: true, edition: LAED }],
    check: p => {
      if (!polyInside(p.adu.footprint, p.site.lot)) return unk('The ADU is not fully inside the lot, so distances can\'t be measured.', 'El ADU no está dentro del lote, así que no se pueden medir las distancias.', 'Fix the drawing first.', 'Corrija el dibujo primero.');
      const { dist: worst, line } = fireSeparation(p);
      if (!Number.isFinite(worst)) return unk('Distances could not be measured.', 'No se pudieron medir las distancias.', 'Fix the drawing first.', 'Corrija el dibujo primero.');
      // LADBS sheet III-D.1: 1-hour walls under 5 ft. LABC Table 602 gives no sprinkler reduction, so the pass line is 5 ft in every case.
      const lim = ft(5);
      const eave = p.adu.eaveDepthMm; const proj = isNum(eave) && eave > 0 ? worst - eave : null;
      if (proj != null && proj < ft(2)) return fail(`The eave reaches ${fmtFtIn(Math.max(0, proj))} from ${line.en}. Projections can't come closer than 2 ft.`, `El alero llega a ${fmtFtIn(Math.max(0, proj))} ${line.es}. Las salientes no pueden acercarse a menos de 2 pies.`, 'Cut the eave back on that side.', 'Recorte el alero de ese lado.');
      // Eave depth is asked whenever an eave of up to 6 ft (the largest GEO-01 accepts) could reach the 5 ft line.
      if (eave == null && worst < lim + ft(6)) return unk(`Closest wall is ${fmtFtIn(worst)} from ${line.en}. An eave on that side could come too close, and walls this close may need a rating.`, `El muro más cercano está a ${fmtFtIn(worst)} ${line.es}. Un alero de ese lado podría quedar demasiado cerca, y muros tan cercanos pueden necesitar resistencia al fuego.`, 'Enter the eave depth (roof overhang) on the Garage step. Enter 0 if there is none.', 'Ingrese la profundidad del alero en el paso Garaje. Ingrese 0 si no hay.');
      const other = otherBuildingsMissing(p); if (other && worst >= lim) return other;
      // Table R302.1(1): a projection 2-5 ft from the line needs a 1-hour underside. This is its own answer, not the wall rating.
      const eaveNeedsRating = proj != null && proj < ft(5);
      const eaveOk = !eaveNeedsRating || yes(p.adu.ratedEaveUndersidePlanned);
      const eaveAsk = (pre: L) => unk(`${pre.en} The eave on that side reaches ${fmtFtIn(proj!)} from the line and needs a 1-hour rated underside.`, `${pre.es} El alero de ese lado llega a ${fmtFtIn(proj!)} del lindero y necesita una parte inferior con resistencia de 1 hora.`, 'Answer "Will the eave underside be 1-hour rated?" on the Garage step, or cut the eave back.', 'Responda "¿La parte inferior del alero tendrá resistencia de 1 hora?" en el paso Garaje, o recorte el alero.');
      if (worst >= lim) {
        if (!eaveOk) return eaveAsk(t(`Closest wall is ${fmtFtIn(worst)} from ${line.en}.`, `El muro más cercano está a ${fmtFtIn(worst)} ${line.es}.`));
        return pass(`Closest wall is ${fmtFtIn(worst)} from ${line.en}. No rated wall needed.${eaveNeedsRating ? ' A 1-hour eave underside is planned.' : ''}`, `El muro más cercano está a ${fmtFtIn(worst)} ${line.es}. No se necesita muro resistente.${eaveNeedsRating ? ' Se planea un alero con parte inferior de 1 hora.' : ''}`);
      }
      if (yes(p.adu.ratedWallPlanned)) {
        if (!eaveOk) return eaveAsk(t(`Closest wall is ${fmtFtIn(worst)} from ${line.en}. A 1-hour wall is planned.`, `El muro más cercano está a ${fmtFtIn(worst)} ${line.es}. Se planea un muro de 1 hora.`));
        return pass(`Closest wall is ${fmtFtIn(worst)} from ${line.en}. A 1-hour wall is planned.${eaveNeedsRating ? ' A 1-hour eave underside is planned.' : ''}`, `El muro más cercano está a ${fmtFtIn(worst)} ${line.es}. Se planea un muro de 1 hora.${eaveNeedsRating ? ' Se planea un alero con parte inferior de 1 hora.' : ''}`);
      }
      if (yes(p.adu.sprinklered) && worst >= ft(3)) return unk(`Closest wall is ${fmtFtIn(worst)} from ${line.en}, and the ADU will have sprinklers. LADBS sheet III-D.1 asks for a 1-hour wall under 5 ft. The residential code (Table R302.1(2)) may allow an unrated wall with a sprinkler system.`, `El muro más cercano está a ${fmtFtIn(worst)} ${line.es}, y el ADU tendrá rociadores. La hoja LADBS III-D.1 pide un muro de 1 hora a menos de 5 pies. El código residencial (Tabla R302.1(2)) puede permitir un muro sin resistencia con rociadores.`, 'Plan a 1-hour wall on that side, or confirm with plan check that sprinklers allow an unrated wall.', 'Planee un muro de 1 hora de ese lado, o confirme con la revisión de planos que los rociadores permiten un muro sin resistencia.');
      return fail(`Closest wall is ${fmtFtIn(worst)} from ${line.en}. It needs a 1-hour fire-rated wall.`, `El muro más cercano está a ${fmtFtIn(worst)} ${line.es}. Necesita un muro resistente al fuego de 1 hora.`, 'Plan a 1-hour wall on that side, and limit windows there. Escape windows can clash with this on narrow lots.', 'Planee un muro de 1 hora de ese lado, y limite las ventanas allí. En lotes angostos, las ventanas de escape pueden chocar con esto.');
    } },

  { id: 'SPK-01', version: '2', module: 'fire', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire sprinklers', 'Rociadores contra incendios'), cites: [{ code: 'LADBS sheet III-E.4 (sprinklers required for the ADU if the existing dwelling has them)', url: SHEET_URL, verified: true }, { code: 'Gov. Code §66314(d)(12) (not required when the main house does not need them)', url: GOV + '66314.', verified: true }],
    check: p => { const f = p.site.flags.primarySprinklered; return f === 'unknown' ? unk('We don\'t know if the main house has sprinklers.', 'No sabemos si la casa tiene rociadores.', 'Check the main house for sprinkler heads.', 'Revise si la casa principal tiene cabezas de rociadores.') : yes(f) ? (yes(p.adu.sprinklered) ? pass('Main house has sprinklers and so does the ADU.', 'La casa principal tiene rociadores y el ADU también.') : fail('The main house has sprinklers, so the ADU needs them too (LADBS sheet III-E.4).', 'La casa tiene rociadores; el ADU también los necesita (hoja III-E.4).', 'Add sprinklers to the ADU plan. A bigger water meter may be needed.', 'Agregue rociadores al plano del ADU. Puede necesitar un medidor de agua más grande.')) : pass('Not required: the main house has no sprinklers (Gov. Code §66314(d)(12)). Adding them is optional and can help with fire access.', 'No requerido: la casa no tiene rociadores (Código de Gobierno §66314(d)(12)). Agregarlos es opcional y puede ayudar con el acceso de bomberos.'); } },

  { id: 'ACC-01', version: '2', module: 'fire', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire department access (hose pull)', 'Acceso de bomberos'), cites: [{ code: 'Fire access review (LA County guideline: 150 ft, 300 ft if sprinklered detached ADU). LAFD verifies in LA City.', verified: true }],
    check: p => { const h = p.adu.hosePullFt; if (!fin(h)) return unk('Hose pull distance not measured.', 'Distancia de la manguera no medida.', 'Measure the walking path from the street curb to the farthest point of the ADU. LAFD checks this.', 'Mida el camino a pie desde la banqueta de la calle hasta el punto más lejano del ADU. LAFD revisa esto.'); const lim = yes(p.adu.sprinklered) ? 300 : 150; return h <= lim ? pass(`About ${h} ft from the street (limit ${lim} ft).`, `Aprox. ${h} pies desde la calle (límite ${lim} pies).`) : unk(`About ${h} ft from the street, over ${lim} ft.`, `Aprox. ${h} pies desde la calle, más de ${lim} pies.`, 'This is an access review, not an automatic no. Sprinklers or other fixes may solve it. LAFD decides.', 'Es una revisión de acceso, no un no automático. Los rociadores u otras soluciones pueden resolverlo. LAFD decide.'); } },

  { id: 'ENG-01', version: '3', module: 'structural', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: conv,
    title: t('When an engineer or architect is needed', 'Cuándo se necesita un ingeniero o arquitecto'), cites: [{ code: 'B&P §5537 (exemption covers conventional wood-frame dwellings and garages only) and §6737.1 (non-conventional parts need a licensed engineer)', verified: true }],
    check: p => {
      const c = p.adu.garageConstruction;
      if (c === 'unknown') return unk('We don\'t know what the garage walls are made of.', 'No sabemos de qué son los muros del garaje.', 'Answer "What are the garage walls made of?" on the Garage step. Wood-frame is common; brick, block (CMU) and concrete garages need a licensed architect or engineer.', 'Responda "¿De qué son los muros del garaje?" en el paso Garaje. La madera es común; los garajes de ladrillo, bloque (CMU) o concreto necesitan un arquitecto o ingeniero con licencia.');
      if (c === 'masonry' || c === 'concrete') return fail(`${c === 'masonry' ? 'Brick or block (masonry)' : 'Concrete'} garage walls are not wood-frame construction, so the B&P §5537 exemption does not cover them.`, `Los muros de ${c === 'masonry' ? 'ladrillo o bloque (mampostería)' : 'concreto'} no son de madera, así que la exención de B&P §5537 no los cubre.`, 'A licensed architect or engineer must prepare the plans for this conversion. Unreinforced brick can also need seismic work.', 'Un arquitecto o ingeniero con licencia debe preparar los planos de esta conversión. El ladrillo sin refuerzo también puede necesitar trabajo sísmico.');
      if (yes(p.adu.removesGarageDoorWall)) return info('Filling or changing the garage door opening changes how the wall holds the building up.', 'Rellenar o cambiar la abertura de la puerta del garaje cambia cómo el muro sostiene el edificio.', 'Ask a licensed engineer for that wall only (header and bracing). The rest of a conventional wood-frame building is covered by the B&P §5537 exemption.', 'Pida a un ingeniero con licencia solo ese muro (dintel y arriostramiento). El resto de un edificio convencional de madera está cubierto por la exención de B&P §5537.');
      if (p.adu.removesGarageDoorWall === 'unknown') return unk('We don\'t know the plan for the garage door opening.', 'No sabemos el plan para la abertura de la puerta del garaje.', 'Say if the garage door opening will be filled in or changed.', 'Indique si la abertura de la puerta del garaje se rellenará o cambiará.');
      return pass('Wood-frame garage with no structural change planned to the garage door wall.', 'Garaje de madera sin cambios estructurales planeados al muro de la puerta.');
    } },

  { id: 'HAZ-01', version: '2', module: 'hazards', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Hillside and very high fire zone', 'Ladera y zona de muy alto riesgo de incendio'), cites: [{ code: 'LAMC 12.22 A.33 (HCD found parts noncompliant, 11/19/2024: contested)', verified: true }, { code: 'Gov. Code §66323(a) (conversions inside an existing accessory structure: ministerial approval)', url: GOV + '66323.', verified: true }],
    check: p => { const { hillside, vhfhsz, slopeOver10 } = p.site.flags; if ([hillside, vhfhsz, slopeOver10].includes('unknown')) return unk('Hillside, fire zone or slope not confirmed.', 'Ladera, zona de incendio o pendiente sin confirmar.', 'Check ZIMAS for "Hillside Area" and "Very High Fire Hazard Severity Zone".', 'Busque en ZIMAS "Hillside Area" y "Very High Fire Hazard Severity Zone".'); if (yes(hillside) && yes(vhfhsz) && conv(p)) return info('Lot is in both Hillside and Very High Fire zones. A conversion inside an existing garage must be approved ministerially by state law (Gov. Code §66323(a)); LA\'s hillside limit targets new ADUs.', 'Lote en ladera y zona de fuego muy alto. El estado exige aprobar en forma ministerial una conversión dentro de un garaje existente (Código de Gobierno §66323(a)); el límite de LA apunta a ADU nuevos.', 'Expect fire-access and hazard review notes (hose pull, sprinklers, brush clearance). Your preparer confirms.', 'Espere notas de acceso de bomberos y riesgos (manguera, rociadores, limpieza de maleza). Su preparador confirma.'); if (yes(hillside) && yes(vhfhsz)) return fail('Lot is in both Hillside and Very High Fire zones. LA limits ADUs here, though the state says parts of that limit don\'t comply (contested).', 'El lote está en zona de Ladera y de Muy Alto Riesgo de Incendio. LA limita los ADU aquí, aunque el estado dice que partes de ese límite no cumplen (disputado).', 'Talk to LADBS or a land-use attorney before designing.', 'Hable con LADBS o un abogado de uso de suelo antes de diseñar.'); if (yes(slopeOver10) || yes(hillside)) return info('Hillside lot: engineering needed. Automatic fitting is off.', 'Lote en ladera: se necesita ingeniería. El ajuste automático está apagado.', 'Get a soils report and an engineer. Draft sheets still work.', 'Obtenga un informe de suelos y un ingeniero. Las hojas de borrador siguen funcionando.'); return pass('Not in Hillside + Very High Fire zones.', 'Fuera de las zonas de Ladera y de Muy Alto Riesgo de Incendio.'); } },

  { id: 'HAZ-02', version: '1', module: 'hazards', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Historic district (HPOZ)', 'Distrito histórico (HPOZ)'), cites: [{ code: 'LA HPOZ review; draft ADU design standards (6/22/2026)', verified: true }],
    check: p => p.site.flags.hpoz === 'yes' ? info('Exterior changes need HPOZ approval, which can take up to 75 days.', 'Cambios exteriores requieren aprobación HPOZ.', 'Contact the HPOZ planner early.', 'Contacte al planificador HPOZ.') : p.site.flags.hpoz === 'unknown' ? unk('Not known if the lot is in an HPOZ.', 'No se sabe si el lote está en un HPOZ.', 'Check ZIMAS for "HPOZ".', 'Busque "HPOZ" en ZIMAS.') : pass('Not in a historic district.', 'No está en distrito histórico.') },

  { id: 'HAZ-03', version: '2', module: 'hazards', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Coastal zone and Mello Act', 'Zona costera y Ley Mello'), cites: [{ code: 'Gov. Code §65590(b) (structures under 3 units exempt); City Planning decides', url: GOV + '65590.', verified: true }],
    check: p => p.site.flags.coastal === 'yes' ? info('Coastal zone: a coastal permit step applies. Small lots (under 3 units) are usually exempt from Mello Act replacement rules.', 'Zona costera.', 'Ask City Planning for the Mello exemption check first.', 'Pida a Planificación la revisión de exención.') : p.site.flags.coastal === 'unknown' ? unk('Not known if the lot is in the coastal zone.', 'No se sabe si el lote está en la zona costera.', 'Check ZIMAS for "Coastal Zone".', 'Busque "Coastal Zone" en ZIMAS.') : pass('Not in the coastal zone.', 'Fuera de la zona costera.') },

  { id: 'HAZ-04', version: '2', module: 'hazards', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Methane zone', 'Zona de metano'), cites: [{ code: 'LABC Ch. 71 (91.7104-91.7105); no automatic exemption for an existing slab', verified: true, edition: LAED }],
    check: p => p.site.flags.methane === 'yes' ? info('Methane zone: new trenches or footings may require gas mitigation (a membrane and vents).', 'Zona de metano: zanjas o cimientos nuevos pueden requerir mitigación de gas (una membrana y ventilas).', 'Budget for mitigation and ask LADBS if your scope triggers it.', 'Presupueste la mitigación y pregunte a LADBS si su obra la activa.') : p.site.flags.methane === 'unknown' ? unk('Not known if the lot is in a methane zone.', 'No se sabe si el lote está en zona de metano.', 'Check ZIMAS for "Methane Hazard Site".', 'Busque en ZIMAS "Methane Hazard Site".') : pass('Not in a methane zone.', 'No está en zona de metano.') },

  { id: 'HAZ-05', version: '1', module: 'hazards', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire rebuild area (Palisades / Eaton)', 'Área de reconstrucción por incendio'), cites: [{ code: 'State and LA emergency orders for 2025 burn areas', url: 'https://recovery.lacounty.gov/rebuilding/policies-interpretations-exemptions', verified: true }],
    suspendsAutoPass: p => p.site.flags.fireRebuild === 'yes',
    check: p => p.site.flags.fireRebuild === 'unknown' ? unk('We don\'t know if the lot is in a 2025 burn area.', 'No sabemos si el lote está en un área de incendio 2025.', 'Check the LA County rebuild map for your address.', 'Revise el mapa de reconstrucción.') : p.site.flags.fireRebuild === 'yes' ? info('This lot is in a 2025 burn area. Special rebuild rules and emergency orders apply. Automatic passes are off.', 'Área de incendio 2025: reglas especiales.', 'Use the official rebuild path and talk to the rebuild center.', 'Use el camino oficial.') : pass('Not in a 2025 burn area.', 'Fuera del área.') },

  { id: 'ESM-01', version: '1', module: 'zoning', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Easements', 'Servidumbres'), cites: [{ code: 'Recorded title documents (not shown in ZIMAS)', verified: true }],
    check: p => yes(p.site.flags.easementsKnown) ? pass('Easements checked against the title report.', 'Servidumbres revisadas con el informe de título.') : info('Easements are unknown. Maps don\'t show them.', 'Servidumbres desconocidas. Los mapas no las muestran.', 'Get a title report or check your grant deed so the ADU doesn\'t sit on an easement.', 'Obtenga un informe de título o revise su escritura para que el ADU no quede sobre una servidumbre.') },

  { id: 'FEE-01', version: '3', module: 'fees', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Fee estimate (2026 rules)', 'Estimado de tarifas (reglas 2026)'),
    cites: [{ code: 'Gov. Code §66311.5 (formerly §66324), SB 543: no impact fees under 750 sq ft interior livable space', url: 'https://www.aalrr.com/newsroom-alerts-4196', verified: true },
      { code: 'SB 543 / Ed. Code §17620(a)(1)(C): no school fees under 500 sq ft interior livable space', url: 'https://www.aalrr.com/newsroom-alerts-4196', verified: true },
      { code: 'Former Gov. Code §66324(d)(1): a §66323(a)(1)(A) conversion needs no new utility connection, connection fee or capacity charge (section number after SB 543 renumbering not yet confirmed)', verified: false }],
    check: p => feeEstimate(p).outcome },

  { id: 'NRG-01', version: '2', module: 'energy', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Energy code report (Title 24): CF1R and HERS', 'Informe de energía (Título 24): CF1R y HERS'),
    cites: [{ code: 'LADBS sheet III-H.9 (energy calcs, HERS field verification, CF1R certificate)', url: SHEET_URL, verified: true }],
    check: p => {
      const cf = !!p.docs['NRG.CF1R'], hers = !!p.docs['NRG.HERS'];
      if (cf && hers) return pass('CF1R energy certificate and HERS verification plan are attached.', 'El certificado CF1R y el plan de verificación HERS están adjuntos.');
      const miss = [!cf && 'CF1R certificate', !hers && 'HERS verification'].filter(Boolean).join(' and ');
      const missEs = [!cf && 'certificado CF1R', !hers && 'verificación HERS'].filter(Boolean).join(' y ');
      return unk(`Missing: ${miss}.`, `Falta: ${missEs}.`, 'A Title 24 energy consultant makes the CF1R in the state\'s CBECC software and lists the HERS checks. Tick each one when you have it.', 'Un consultor de energía hace el CF1R en el software CBECC del estado e indica las pruebas HERS. Marque cada uno cuando lo tenga.');
    } },

  { id: 'VAP-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Vapor barrier under the garage slab', 'Barrera de vapor bajo la losa del garaje'),
    cites: [{ code: 'LABC 1907.1, LARC R506.2.3 (vapor retarder below slab, or approved epoxy coating on top; LADBS sheet III-J.1)', url: SHEET_URL, verified: true, edition: LAED }],
    check: p => { const v = p.adu.slabVaporBarrier; return v === 'unknown' ? unk('We don\'t know if the slab has a vapor barrier.', 'No sabemos si la losa tiene barrera de vapor.', 'Old garage slabs often have none. Answer the slab question, or plan an approved epoxy coating on top.', 'Las losas viejas a menudo no tienen. Responda la pregunta, o planee un recubrimiento epóxico aprobado.')
      : yes(v) ? pass('Slab has a vapor barrier, or an approved epoxy coating is planned.', 'La losa tiene barrera de vapor, o se planea un recubrimiento epóxico aprobado.')
      : fail('No vapor barrier and no coating planned.', 'Sin barrera de vapor ni recubrimiento planeado.', 'Add an approved epoxy slab coating on top, and show it on the plans.', 'Agregue un recubrimiento epóxico aprobado y muéstrelo en los planos.'); } },

  { id: 'FIR-02', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Windows and doors in walls near the property line or the house', 'Ventanas y puertas en muros cerca del lindero o de la casa'),
    cites: [{ code: 'LADBS sheet III-A.5 (detached garage under 5 ft: 1-hour, no openings) and III-D.4 (opening analysis per LABC 705.8 / LARC R302.1; distance to the property line or assumed property line, III-D.1)', url: SHEET_URL, verified: true, edition: LAED }],
    check: p => {
      if (!polyInside(p.adu.footprint, p.site.lot)) return unk('The ADU is not fully inside the lot, so distances can\'t be measured.', 'El ADU no está dentro del lote.', 'Fix the drawing first.', 'Corrija el dibujo primero.');
      const { dist: worst, line } = fireSeparation(p);
      const other = otherBuildingsMissing(p); if (other && worst >= ft(5)) return other;
      if (worst >= ft(5)) return pass(`Closest wall is ${fmtFtIn(worst)} from ${line.en}. No opening limit there.`, `El muro más cercano está a ${fmtFtIn(worst)} ${line.es}. Sin límite de aberturas.`);
      const o = p.adu.openingsNearLine;
      if (o === 'unknown') return unk(`A wall is ${fmtFtIn(worst)} from ${line.en}. Openings there are limited.`, `Un muro está a ${fmtFtIn(worst)} ${line.es}. Las aberturas allí son limitadas.`, 'Say if that wall has any windows, doors or vents.', 'Indique si ese muro tiene ventanas, puertas o rejillas.');
      if (no(o)) return pass(`No openings in the wall ${fmtFtIn(worst)} from the line.`, `Sin aberturas en el muro a ${fmtFtIn(worst)} del lindero.`);
      if (worst < ft(3)) return fail(`Openings in a wall only ${fmtFtIn(worst)} from the line.`, `Aberturas en un muro a solo ${fmtFtIn(worst)} del lindero.`, 'Remove them. Walls this close generally can\'t have openings. Move the escape window to another wall.', 'Quítelas. Muros tan cercanos generalmente no pueden tener aberturas. Mueva la ventana de escape a otro muro.');
      return unk(`Openings in a wall ${fmtFtIn(worst)} from the line (3 to 5 ft).`, `Aberturas en un muro a ${fmtFtIn(worst)} del lindero (3 a 5 pies).`, 'Some openings may be allowed here up to a share of the wall area. Your preparer runs the opening analysis (sheet III-D.4).', 'Algunas aberturas pueden permitirse hasta una parte del muro. Su preparador hace el análisis (hoja III-D.4).');
    } },

  { id: 'ALM-02', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Smoke alarm power source', 'Energía de las alarmas de humo'),
    cites: [{ code: 'LABC 907.2.11.5 / LARC R314.4 (new construction: building wiring with battery backup; LADBS sheet III-E.2)', url: SHEET_URL, verified: true, edition: LAED }],
    check: p => { const h = p.adu.smokeHardwired; return yes(h) ? pass('Smoke alarms are hardwired with battery backup.', 'Alarmas cableadas con batería de respaldo.')
      : h === 'unknown' ? unk('We don\'t know how the smoke alarms are powered.', 'No sabemos cómo se alimentan las alarmas.', 'Plan hardwired alarms with battery backup. That is what new work needs.', 'Planee alarmas cableadas con batería de respaldo.')
      : conv(p) ? unk('Battery-only alarms planned. Battery-only is allowed in an existing house, but this is a new unit.', 'Alarmas solo con batería. Se permite en casa existente, pero esta es una unidad nueva.', 'Ask your preparer, or plan hardwired alarms with battery backup to be safe.', 'Pregunte a su preparador, o planee alarmas cableadas.')
      : fail('A new ADU needs smoke alarms wired to the building, with battery backup.', 'Un ADU nuevo necesita alarmas cableadas con batería de respaldo.', 'Change to hardwired alarms with battery backup.', 'Cambie a alarmas cableadas con batería de respaldo.'); } },

  { id: 'SET-03', version: '1', module: 'zoning', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Setbacks match between site plan and floor plan', 'Los retiros coinciden entre plano del lote y planta'),
    cites: [{ code: 'LADBS sheet I-C.7 (fully dimensioned plot plan with setbacks)', url: SHEET_URL, verified: true }, { code: 'Data check: plan sheets must agree', verified: true }],
    check: p => {
      const { side, rear } = siteSetbacks(p), fs = p.adu.floorPlanSideSetbackMm, fr = p.adu.floorPlanRearSetbackMm;
      if (fs == null && fr == null) return unk('Floor plan setbacks not entered.', 'Retiros de la planta no ingresados.', 'Type the side and rear setbacks written on the floor plan sheet. Mismatched numbers are a common correction.', 'Escriba los retiros lateral y trasero de la planta. Números distintos son una corrección común.');
      const tol = inch(1); const bad: string[] = [], badEs: string[] = [];
      if (fs != null && Math.abs(fs - side) > tol) { bad.push(`side ${fmtFtIn(fs)} vs site plan ${fmtFtIn(side)}`); badEs.push(`lateral ${fmtFtIn(fs)} vs plano ${fmtFtIn(side)}`); }
      if (fr != null && Math.abs(fr - rear) > tol) { bad.push(`rear ${fmtFtIn(fr)} vs site plan ${fmtFtIn(rear)}`); badEs.push(`trasero ${fmtFtIn(fr)} vs plano ${fmtFtIn(rear)}`); }
      if (bad.length) return fail(`Setbacks don't match: ${bad.join('; ')}.`, `Los retiros no coinciden: ${badEs.join('; ')}.`, 'Fix one sheet so both show the same number.', 'Corrija una hoja para que ambas muestren el mismo número.');
      if (fs == null || fr == null) return unk('Only one floor plan setback entered.', 'Solo se ingresó un retiro.', 'Enter both the side and rear numbers.', 'Ingrese ambos números.');
      return pass(`Floor plan matches the site plan (side ${fmtFtIn(side)}, rear ${fmtFtIn(rear)}).`, `La planta coincide con el plano (lateral ${fmtFtIn(side)}, trasero ${fmtFtIn(rear)}).`);
    } },

  { id: 'PRK-01', version: '1', module: 'zoning', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: conv,
    title: t('No replacement parking for the garage', 'Sin reemplazo de estacionamiento por el garaje'),
    cites: [{ code: 'Gov. Code §66314(d)(11) (garage converted to an ADU: city may not require replacement parking)', url: GOV + '66314.', verified: true }, { code: 'SB 1211 (2024): extends this to uncovered spaces', verified: false }],
    check: () => pass('Converting the garage does not require replacing its parking spaces.', 'Convertir el garaje no requiere reemplazar sus espacios de estacionamiento.') },

  { id: 'LEG-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: p => p.adu.legalization,
    title: t('Legalization mode (AB 2533)', 'Modo de legalización (AB 2533)'),
    cites: [{ code: 'Gov. Code §66332 (AB 2533): unpermitted ADU built before 1/1/2020 may be denied only for health and safety (HSC §17920.3)', url: 'https://www.colma.ca.gov/ab-2533', verified: true }],
    check: p => { const a = p.adu;
      if (yes(a.existingStructurePermitted)) return fail('Legalization mode is on, but the garage has a permit.', 'El modo de legalización está activo, pero el garaje tiene permiso.', 'Turn legalization mode off. It is for unpermitted units.', 'Apague el modo de legalización. Es para unidades sin permiso.');
      if (no(a.builtBefore2020)) return fail('AB 2533 covers units built before 2020 only.', 'AB 2533 cubre solo unidades construidas antes de 2020.', 'Turn legalization mode off and use the regular path.', 'Apague el modo y use el camino normal.');
      if (no(a.usedAsHomeBefore2020)) return fail('AB 2533 covers units already used as a home before 2020. A garage converted now does not qualify.', 'AB 2533 cubre unidades ya usadas como vivienda antes de 2020. Un garaje que se convierte ahora no califica.', 'Turn legalization mode off and use the regular path.', 'Apague el modo y use el camino normal.');
      if (!yes(a.builtBefore2020) || !no(a.existingStructurePermitted) || !yes(a.usedAsHomeBefore2020)) return unk('Confirm the unit is unpermitted, was built before 2020, and was already used as a separate home before 2020.', 'Confirme que la unidad no tiene permiso y se construyó antes de 2020.', 'Answer the permit and build-date questions. Gather proof: photos, aerial images, utility bills.', 'Responda las preguntas de permiso y fecha. Reúna pruebas.');
      return info('Legalization mode: only health-and-safety items are enforced. Zoning items show as notes.', 'Modo de legalización: solo se exigen puntos de salud y seguridad. Los de zonificación aparecen como notas.', 'The city still inspects for health and safety. Fix those before the permit issues.', 'La ciudad aún inspecciona salud y seguridad. Corríjalos antes del permiso.'); } },

  { id: 'DWP-01', version: '1', module: 'hazards', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('DWP easement nearby', 'Servidumbre de DWP cercana'),
    cites: [{ code: 'LADBS sheet I-B.8 (DWP written approval for work in or within 10 ft of a DWP easement)', url: SHEET_URL, verified: true }],
    check: p => { const d = p.site.flags.dwpEasement10ft; return d === 'unknown' ? unk('We don\'t know if the garage is within 10 ft of a DWP easement.', 'No sabemos si el garaje está a 10 pies de una servidumbre de DWP.', 'Check your title report and the site for DWP lines or easements.', 'Revise su informe de título y el sitio.')
      : yes(d) ? info('Within 10 ft of a DWP easement: DWP must approve in writing first.', 'A 10 pies de una servidumbre de DWP: DWP debe aprobar por escrito primero.', 'Contact LADWP early. This can take weeks.', 'Contacte a LADWP temprano. Puede tardar semanas.') : pass('Not within 10 ft of a DWP easement.', 'No está a 10 pies de una servidumbre de DWP.'); } },

  { id: 'PNL-01', version: '1', module: 'hazards', severity: 'minor', kind: 'info', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Electrical panel size', 'Tamaño del panel eléctrico'),
    cites: [{ code: 'Electrical load calculation (separate electrical permit, LADBS sheet I-A.3)', url: SHEET_URL, verified: true }],
    check: p => p.adu.panelAmps == null ? { status: 'NOT_CHECKED', msg: t('Panel size not entered.', 'Tamaño del panel no ingresado.'), next: t('Read the amps on the main breaker. An electrician runs the load calculation; we don\'t guess a required size.', 'Lea los amperios del interruptor principal. Un electricista hace el cálculo; no adivinamos un tamaño.') }
      : info(`Main panel: ${p.adu.panelAmps} A.`, `Panel principal: ${p.adu.panelAmps} A.`, 'Ask an electrician for a load calculation. An upgrade is a build cost and a separate permit.', 'Pida a un electricista un cálculo de carga. Una mejora es un costo y un permiso aparte.') },

  { id: 'GAS-01', version: '1', module: 'hazards', severity: 'minor', kind: 'info', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Gas service and meter', 'Servicio y medidor de gas'),
    cites: [{ code: 'LADBS sheet III-I.1 (all-electric new buildings, Ord. 187714, with exceptions) and III-I.3 (seismic gas shutoff valve)', url: SHEET_URL, verified: true }],
    check: p => yes(p.adu.allElectric) ? pass('All-electric: no gas meter or shutoff valve needed for the ADU.', 'Todo eléctrico: no se necesita medidor ni válvula de gas.')
      : p.adu.separateGasMeter === 'unknown' ? { status: 'NOT_CHECKED', msg: t('Gas plan not answered.', 'Plan de gas no respondido.'), next: t('Say if the ADU will be all-electric, or if it gets its own gas meter.', 'Indique si el ADU será todo eléctrico, o si tendrá su propio medidor.') }
      : info(yes(p.adu.separateGasMeter) ? 'Separate gas meter planned.' : 'Gas shared with the main house.', yes(p.adu.separateGasMeter) ? 'Medidor de gas separado.' : 'Gas compartido con la casa.', 'LA requires new buildings to be all-electric, with exceptions. A seismic gas shutoff valve is needed on gas lines. Your preparer confirms.', 'LA exige edificios nuevos todo eléctricos, con excepciones. Se necesita válvula sísmica en líneas de gas. Su preparador confirma.') },

  { id: 'OWN-01', version: '2', module: 'people', severity: 'major', kind: 'info', effectiveFrom: EFF, applies: p => p.people.preparerRole === 'owner',
    title: t('Owner-builder rules', 'Reglas de dueño-constructor'), cites: [{ code: 'B&P §7044', verified: true }],
    check: () => info('As owner-builder, anyone you pay to help must be a licensed contractor or your employee (with workers\' comp). Selling within a year can be presumed "built to sell".', 'Como dueño-constructor, a quien le pague por ayudar debe ser contratista con licencia o su empleado (con seguro de compensación). Vender dentro de un año puede presumirse "construido para vender".', 'Read the LADBS owner-builder form before you sign it.', 'Lea el formulario antes de firmar.') },

  { id: 'RSO-01', version: '1', module: 'people', severity: 'major', kind: 'info', effectiveFrom: EFF, applies: p => p.site.flags.anyUnitRented === 'yes',
    title: t('Rent stabilization', 'Estabilización de rentas'), cites: [{ code: 'LA Rent Stabilization Ordinance (LAHD)', verified: false }],
    check: () => info('A unit on this lot is rented. The ADU may fall under LA rent rules.', 'Una unidad está rentada.', 'Check with the LA Housing Department (LAHD) before you rent the ADU.', 'Consulte con LAHD.') },

  { id: 'CLK-01', version: '2', module: 'clocks', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Permit deadlines', 'Plazos del permiso'), cites: [{ code: 'LAMC 98.0603 (plan check expires 18 months after filing)', verified: true }, { code: 'LAMC 98.0602 (permit expires if work doesn\'t start within 12 months or stops for 12 months; permit valid 2 years unless extended)', verified: true }, { code: 'LAMC 98.0605 (extensions)', verified: false }],
    check: () => info('Plan check: 18 months after filing. Permit: 12 months to start work, no 12-month stop, and valid 2 years unless extended.', 'Revisión: 18 meses. Permiso: 12 meses para empezar, sin pausas de 12 meses, y vale 2 años salvo extensión.', 'Add these deadlines to your calendar from the export screen.', 'Agregue estos plazos a su calendario desde la pantalla de descarga.') },
];

/** Site-plan side and rear clearances (lot edge after the street edge = side; opposite = rear on 4-sided lots). */
export function siteSetbacks(p: Project): { side: number; rear: number } {
  const lot = p.site.lot, n = lot.length, se = p.site.streetEdge, rearI = n === 4 ? (se + 2) % 4 : -1;
  let side = Infinity, rear = Infinity;
  lot.forEach((_, i) => { if (i === se) return; const c = clearanceToEdge(p.adu.footprint, lot, i); if (i === rearI) rear = c; else side = Math.min(side, c); });
  if (rearI < 0) rear = side;
  return { side, rear };
}

/** Fee estimate: only $0 lines we can cite; anything else is "estimate, verify with LADBS". No invented amounts. */
export function feeEstimate(p: Project): { school: L; impact: L; outcome: Outcome } {
  const s = p.adu.interiorLivableSqFt;
  const verify = t('estimate, verify with LADBS', 'estimado, verifique con LADBS');
  if (s == null) return { school: verify, impact: verify, outcome: unk('Interior livable area not entered.', 'Área habitable interior no ingresada.', 'Measure inside the walls. Fees are based on interior livable space.', 'Mida dentro de los muros. Las tarifas se basan en el área habitable interior.') };
  // Cross-check the typed livable area against the drawn footprint (outside size, plus any added area).
  const gross = Math.round(ruleArea(p) + Math.max(0, p.adu.addedAreaSqFt || 0));
  const tooBig = s > gross, tooSmall = s < 0.85 * gross;
  const school = s < 500 && !tooBig ? t('$0 (under 500 sq ft)', '$0 (menos de 500 pies²)') : verify;
  const impact = s < 750 && !tooBig ? t('$0 (under 750 sq ft)', '$0 (menos de 750 pies²)') : verify;
  const xc = tooBig ? t(` The typed livable area is larger than the drawn footprint (${gross} sq ft outside), so one of them is wrong.`, ` El área habitable escrita es mayor que la huella dibujada (${gross} pies² por fuera), así que una de las dos está mal.`)
    : tooSmall && (s < 750 && gross >= 750 || s < 500 && gross >= 500) ? t(` The drawn footprint is ${gross} sq ft outside. The $0 line depends on the inside number: measure it carefully.`, ` La huella dibujada mide ${gross} pies² por fuera. El límite de $0 depende del número interior: mídalo con cuidado.`) : t('', '');
  const edge = (s >= 490 && s <= 510) || (s >= 740 && s <= 760);
  const leg = p.adu.legalization ? t(' Legalization (AB 2533) limits impact and connection fees too.', ' La legalización (AB 2533) también limita tarifas.') : t('', '');
  const conn = p.adu.mode === 'conversion' ? t(' Connection or capacity fee: $0 (state conversion: no new utility connection may be required).', ' Tarifa de conexión o capacidad: $0 (conversión estatal: no se puede exigir conexión nueva).') : t(' Connection fees may apply: estimate, verify with LADBS.', ' Pueden aplicar tarifas de conexión: estimado, verifique con LADBS.');
  return { school, impact, outcome: info(`${s} sq ft livable. School fee: ${school.en}. Impact fee: ${impact.en}.${conn.en} Plan check and permit fees still apply: estimate, verify with LADBS.${leg.en}${xc.en}`,
    `${s} pies² habitables. Tarifa escolar: ${school.es}. Tarifa de impacto: ${impact.es}.${conn.es} Las de revisión y permiso aún aplican: estimado, verifique con LADBS.${leg.es}${xc.es}`,
    edge ? 'You are near a fee line (500 or 750 sq ft). A few feet changes the fees. Exactly on the line: verify with LADBS.' : undefined, 'Está cerca de un límite (500 o 750 pies²). Exactamente en el límite: verifique con LADBS.', { sqft: s }) };
}

export const ruleArea = (p: Project) => toSqFt(area(p.adu.footprint));
