import type { Rule, Outcome, L } from './engine';
import type { Project, Tri } from '../core/model';
import { area, clearanceToEdge, gap, polyInside } from '../core/geom';
import { ft, fmtFtIn, inch, toSqFt } from '../core/units';

export const PACK_ID = 'la-city@2026.10.1';
const SHEET_URL = 'https://dbs.lacity.gov/sites/default/files/efs/forms/pc17/PC.STR.Corr.Lst.20A.pdf';
const EFF = '2026-01-01'; // 2025 California codes effective 2026-01-01 (confirmed)
const t = (en: string, es: string): L => ({ en, es });
const pass = (en: string, es: string, values?: Outcome['values']): Outcome => ({ status: 'PASS', msg: t(en, es), values });
const fail = (en: string, es: string, nextEn: string, nextEs: string, values?: Outcome['values']): Outcome => ({ status: 'FAIL', msg: t(en, es), next: t(nextEn, nextEs), values });
const unk = (en: string, es: string, nextEn: string, nextEs: string): Outcome => ({ status: 'UNKNOWN', msg: t(en, es), next: t(nextEn, nextEs) });
const info = (en: string, es: string, nextEn?: string, nextEs?: string, values?: Outcome['values']): Outcome => ({ status: 'INFO', msg: t(en, es), next: nextEn ? t(nextEn, nextEs!) : undefined, values });
const yes = (v: Tri) => v === 'yes', no = (v: Tri) => v === 'no';
const conv = (p: Project) => p.adu.mode === 'conversion';
const all = () => true;
const GOV = 'https://california.public.law/codes/ca_gov_code_section_';

const safeName = (s: string) => s.replace(/[<>\r\n`]/g, ' ').slice(0, 40);
const sane = (v: number | null, lo: number, hi: number) => v != null && Number.isFinite(v) && v >= lo && v <= hi;

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
      if (a.windows.some(w => [w.clearWidthMm, w.clearHeightMm, w.sillMm].some(v => v != null && !sane(v, 0, ft(20))))) bad.push('a window size');
      if (bad.length) return unk(`Check these numbers: ${bad.join(', ')}.`, `Revise estos números: ${bad.join(', ')}.`, 'They look out of range for a garage ADU.', 'Parecen fuera de rango.');
      return pass('Drawing and numbers look valid.', 'El dibujo y los números son válidos.');
    } },

  { id: 'INP-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Your real sizes are entered', 'Sus medidas reales están ingresadas'), cites: [{ code: 'Data check (not a code rule)', verified: true }],
    check: p => { const miss = [!p.confirmed?.lot && 'lot size', !p.confirmed?.house && 'house size and position', !p.confirmed?.adu && 'garage size and position'].filter(Boolean) as string[];
      const missEs = [!p.confirmed?.lot && 'tamaño del lote', !p.confirmed?.house && 'tamaño y posición de la casa', !p.confirmed?.adu && 'tamaño y posición del garaje'].filter(Boolean) as string[];
      return miss.length ? unk(`Still showing example sizes: ${miss.join(', ')}.`, `Aún muestra medidas de ejemplo: ${missEs.join(', ')}.`, 'Enter your own measurements. Checks use example numbers until you do.', 'Ingrese sus propias medidas.') : pass('Sizes entered by you.', 'Medidas ingresadas por usted.'); } },
  { id: 'JUR-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Address is in LA City', 'La dirección está en la Ciudad de LA'), cites: [{ code: 'LADBS jurisdiction', url: 'https://dbs.lacity.gov', verified: true }],
    check: p => p.site.jurisdiction === 'la-city' ? pass('Rules for the City of Los Angeles apply.', 'Aplican las reglas de la Ciudad de Los Ángeles.')
      : p.site.jurisdiction === 'unknown' ? unk('We don\'t know the city yet.', 'Aún no sabemos la ciudad.', 'Look up the parcel in ZIMAS (zimas.lacity.org). It shows if the lot is in LA City.', 'Busque la parcela en ZIMAS (zimas.lacity.org).')
      : fail('This lot is outside LA City. Other cities have their own rules.', 'Este lote está fuera de la Ciudad de LA.', 'Only LA City is supported in this version. LA County is next.', 'Solo la Ciudad de LA está disponible por ahora.') },

  { id: 'GAR-01', version: '1', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Garage path: attached or detached, inside the existing walls', 'Camino del garaje: adjunto o separado, dentro de los muros existentes'),
    cites: [{ code: 'Gov. Code §66323(a)(1)(A); LADBS sheet II-C (detached) and II-G (attached)', url: GOV + '66323', verified: true }],
    check: p => {
      const a = p.adu;
      if (a.garageAttachment === 'unknown') return unk('We don\'t know if the garage is attached to the house or detached.', 'No sabemos si el garaje está adjunto a la casa o separado.', 'Pick attached or detached. The city uses a different checklist for each (sheet II-C or II-G).', 'Elija adjunto o separado. La ciudad usa una lista distinta para cada uno (hoja II-C o II-G).');
      if (a.staysInsideWalls === 'unknown') return unk('We don\'t know if the ADU stays inside the existing garage walls.', 'No sabemos si el ADU queda dentro de los muros existentes del garaje.', 'Answer "Does the ADU stay inside the existing walls?".', 'Responda "¿El ADU queda dentro de los muros existentes?".');
      if (no(a.staysInsideWalls)) return fail('The ADU goes outside the existing garage walls, so it is not a simple conversion.', 'El ADU sale de los muros existentes, así que no es una conversión simple.', a.garageAttachment === 'detached' ? 'Keep it inside the walls (plus up to 150 sq ft for entry), or treat it as a new ADU.' : 'Keep it inside the house walls, or use the attached Ordinance ADU path (sheet II-F).', a.garageAttachment === 'detached' ? 'Manténgalo dentro de los muros (más hasta 150 pies² para entrada), o trátelo como ADU nuevo.' : 'Manténgalo dentro de la casa, o use el camino de ADU adjunto por ordenanza (hoja II-F).');
      return a.garageAttachment === 'detached' ? pass('Detached garage converted inside its walls: sheet II-C path.', 'Garaje separado convertido dentro de sus muros: camino de la hoja II-C.') : pass('Attached garage converted inside the house: sheet II-G path.', 'Garaje adjunto convertido dentro de la casa: camino de la hoja II-G.');
    } },

  { id: 'SCP-01', version: '2', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: conv,
    title: t('Added area: 150 sq ft max, only for getting in and out', 'Área agregada: máximo 150 pies², solo para entrar y salir'),
    cites: [{ code: 'Gov. Code §66323(a)(1)(A) (150 sq ft expansion for ingress and egress); LADBS sheet II-C.3, II-C.4', url: GOV + '66323', verified: true }],
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
    cites: [{ code: 'Gov. Code §66314(d)(7) (4 ft side/rear applies only to ADUs not converted from an existing structure)', url: GOV + '66314', verified: true }, { code: 'Gov. Code §66332 / AB 2533 (unpermitted units built before 2020)', url: GOV + '66332', verified: true }],
    check: p => {
      const a = p.adu;
      if (yes(a.existingStructurePermitted)) return pass('The garage was built with a permit. Converting it in place needs no extra setback.', 'El garaje tiene permiso. Convertirlo no requiere retiro adicional.');
      if (no(a.existingStructurePermitted) && yes(a.builtBefore2020)) return info('Unpermitted but built before 2020. The city generally can\'t deny it over setbacks, only health and safety issues (HSC §17920.3).', 'Sin permiso pero construido antes de 2020.', 'Gather proof of build date: old photos, aerial images, utility bills. Confirm with LADBS.', 'Reúna pruebas de la fecha de construcción.');
      if (no(a.existingStructurePermitted)) return unk('Unpermitted and built 2020 or later (or date unknown). It may not get the existing-structure setback.', 'Sin permiso y construido en 2020 o después.', 'Use the legalization path (AB 2533) or treat it as new construction with 4 ft side and rear setbacks. Confirm with LADBS.', 'Use el camino de legalización o trátelo como construcción nueva.');
      return unk('We don\'t know if the garage had a permit.', 'No sabemos si el garaje tenía permiso.', 'Look up the address in LADBS permit records (dbs.lacity.gov), then answer "Was the garage built with a permit?".', 'Busque la dirección en los registros de LADBS.');
    } },

  { id: 'SET-02', version: '2', module: 'zoning', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: p => !conv(p),
    title: t('New ADU: 4 ft side and rear setbacks', 'ADU nuevo: retiros de 4 pies laterales y traseros'),
    cites: [{ code: 'Gov. Code §66314 (max 4 ft side and rear; state law controls over the 5 ft on older LADBS sheets)', url: GOV + '66314', verified: true }],
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
    title: t('Space between the ADU and the main house', 'Espacio entre el ADU y la casa'), cites: [{ code: 'CRC R302.1 (fire separation depends on distance)', verified: true }],
    check: p => { const g = gap(p.adu.footprint, p.site.primary); return g === 0 ? fail('The ADU overlaps the main house on the plan.', 'El ADU se superpone con la casa.', 'Move the ADU so it does not touch the house, or design it as attached.', 'Mueva el ADU.') : info(`Gap to the main house: ${fmtFtIn(g)}.`, `Espacio a la casa: ${fmtFtIn(g)}.`, g < ft(10) ? 'Close buildings may need fire-rated walls facing each other. Your preparer confirms.' : undefined, 'Edificios cercanos pueden requerir muros resistentes al fuego.'); } },

  { id: 'HGT-01', version: '2', module: 'zoning', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: p => !conv(p),
    title: t('Height of a detached ADU', 'Altura de un ADU separado'), cites: [{ code: 'Gov. Code §66321(b)(4) (16 ft; 18 ft near transit, +2 ft to match roof pitch)', url: GOV + '66321', verified: true }],
    check: p => {
      const tr = p.site.flags.transitHalfMile;
      if (tr === 'unknown') return unk('We need to know if the lot is within a half mile walk of major transit.', 'Necesitamos saber si el lote está a media milla de transporte.', 'Check walking distance (not straight-line) to the nearest major transit stop.', 'Revise la distancia caminando.');
      const pitch = p.adu.roofPitchMatches; const h = p.adu.heightMm;
      const max = yes(tr) ? (yes(pitch) ? ft(20) : ft(18)) : ft(16);
      if (yes(tr) && h > ft(18) && h <= ft(20) && pitch === 'unknown') return unk(`Height ${fmtFtIn(h)}: over 18 ft is allowed only if the roof pitch matches the house.`, `Altura ${fmtFtIn(h)}: más de 18 pies solo si la pendiente coincide con la casa.`, 'Say whether the ADU roof pitch matches the main house.', 'Indique si la pendiente coincide.');
      return h <= max ? pass(`Height ${fmtFtIn(h)} is within ${fmtFtIn(max)}.`, `Altura ${fmtFtIn(h)} dentro de ${fmtFtIn(max)}.`) : fail(`Height ${fmtFtIn(h)} is over the ${fmtFtIn(max)} limit.`, `Altura ${fmtFtIn(h)} supera el límite de ${fmtFtIn(max)}.`, yes(tr) && !yes(pitch) ? 'Lower the roof to 18 ft, or match the main roof pitch (allows up to 20 ft).' : 'Lower the roof.', yes(tr) ? 'Baje a 18 pies o iguale la pendiente (hasta 20 pies).' : 'Baje el techo.');
    } },

  { id: 'CEI-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Ceiling height in living areas', 'Altura del techo en áreas habitables'), cites: [{ code: 'LARC R305.1 (7\'-0" minimum; LADBS sheet III-G.1)', url: SHEET_URL, verified: true }],
    check: p => p.adu.ceilingHeightMm == null ? unk('Ceiling height not entered.', 'Altura del techo no ingresada.', 'Measure floor to ceiling in the main room.', 'Mida del piso al techo.')
      : p.adu.ceilingHeightMm >= inch(84) ? pass(`Ceiling ${fmtFtIn(p.adu.ceilingHeightMm)} (need 7' 0").`, `Techo ${fmtFtIn(p.adu.ceilingHeightMm)}.`)
      : fail(`Ceiling ${fmtFtIn(p.adu.ceilingHeightMm)} is under 7' 0".`, `El techo mide menos de 7 pies.`, 'Garages often fail here once insulation and drywall go in. Plan for the finished height.', 'Planifique la altura terminada.') },

  { id: 'EGR-01', version: '2', module: 'egress', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: p => p.adu.bedrooms > 0,
    title: t('Escape window in each bedroom', 'Ventana de escape en cada dormitorio'), cites: [{ code: 'LARC R310.2 (5.7 sq ft net clear; 5.0 at grade; 24" high; 20" wide; 44" max to bottom; LADBS sheet III-F.1)', url: SHEET_URL, verified: true }],
    check: p => {
      const w = p.adu.windows.filter(x => x.sleeping);
      if (w.length < p.adu.bedrooms) return unk(`${p.adu.bedrooms} bedroom(s) but ${w.length} escape window(s) entered.`, 'Faltan ventanas de escape.', 'Add each bedroom\'s window. Measure the clear opening, not the window\'s label size.', 'Mida la abertura libre, no el tamaño nominal.');
      for (const x of w) {
        if (x.clearWidthMm == null || x.clearHeightMm == null || x.sillMm == null) return unk(`Window in ${safeName(x.room)}: measurements missing.`, 'Faltan medidas.', 'Enter clear width, clear height and sill height.', 'Ingrese ancho, alto y altura del alféizar.');
        const sq = toSqFt(x.clearWidthMm * x.clearHeightMm), need = x.gradeFloor ? 5.0 : 5.7;
        const bad = [sq < need && `net clear ${sq.toFixed(1)} sq ft < ${need}`, x.clearHeightMm < inch(24) && 'clear height under 24"', x.clearWidthMm < inch(20) && 'clear width under 20"', x.sillMm > inch(44) && 'sill over 44"'].filter(Boolean);
        if (bad.length) return fail(`Window in ${safeName(x.room)}: ${bad.join(', ')}.`, `Ventana en ${safeName(x.room)}: ${bad.join(', ')}.`, 'Common sliders often fail. Pick a casement or a larger slider.', 'Elija una ventana abatible o más grande.');
      }
      return pass('Every bedroom has an escape window that meets size rules.', 'Cada dormitorio tiene ventana de escape.');
    } },

  { id: 'ALM-01', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Smoke and carbon monoxide alarms', 'Alarmas de humo y monóxido de carbono'), cites: [{ code: 'LARC R314.2, R315 (LADBS sheet III-E.1, III-E.3)', url: SHEET_URL, verified: true }],
    check: p => yes(p.adu.smokeCoPlanned) ? pass('Alarms are shown on the plan.', 'Alarmas en el plano.') : unk('Alarms are not confirmed on the plan.', 'Alarmas no confirmadas.', 'Show smoke alarms in each bedroom and hall, and CO alarms if there is gas or an attached garage.', 'Muestre alarmas en cada dormitorio.') },

  { id: 'FIR-01', version: '2', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire-rated walls near the property line', 'Muros resistentes al fuego cerca del lindero'), cites: [{ code: 'CRC R302.1 (walls under 5 ft from the line, or under 3 ft if sprinklered, need 1-hour rating)', verified: true }],
    check: p => {
      if (!polyInside(p.adu.footprint, p.site.lot)) return unk('The ADU is not fully inside the lot, so distances can\'t be measured.', 'El ADU no está dentro del lote.', 'Fix the drawing first.', 'Corrija el dibujo primero.');
      let worst = Infinity; p.site.lot.forEach((_, i) => { worst = Math.min(worst, clearanceToEdge(p.adu.footprint, p.site.lot, i)); });
      if (!Number.isFinite(worst)) return unk('Distances could not be measured.', 'No se pudo medir.', 'Fix the drawing first.', 'Corrija el dibujo primero.');
      const sprk = yes(p.adu.sprinklered); const lim = sprk ? ft(3) : ft(5);
      if (worst >= lim) return pass(`Closest wall is ${fmtFtIn(worst)} from the line. No rated wall needed.`, `El muro más cercano está a ${fmtFtIn(worst)}.`);
      if (yes(p.adu.ratedWallPlanned)) return pass(`Closest wall is ${fmtFtIn(worst)}. A 1-hour wall is planned.`, 'Se planea un muro de 1 hora.');
      return fail(`Closest wall is ${fmtFtIn(worst)} from the line. It needs a 1-hour fire-rated wall.`, `El muro más cercano está a ${fmtFtIn(worst)} del lindero. Necesita un muro resistente al fuego de 1 hora.`, 'Plan a 1-hour wall on that side, and limit windows there. Escape windows can clash with this on narrow lots.', 'Planifique un muro de 1 hora.');
    } },

  { id: 'SPK-01', version: '2', module: 'fire', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire sprinklers', 'Rociadores contra incendios'), cites: [{ code: 'Gov. Code §66314(d)(12) (required only if the main house has them)', url: GOV + '66314', verified: true }],
    check: p => { const f = p.site.flags.primarySprinklered; return f === 'unknown' ? unk('We don\'t know if the main house has sprinklers.', 'No sabemos si la casa tiene rociadores.', 'Check the main house for sprinkler heads.', 'Revise si la casa tiene rociadores.') : yes(f) ? (yes(p.adu.sprinklered) ? pass('Main house has sprinklers and so does the ADU.', 'Ambos tienen rociadores.') : fail('The main house has sprinklers, so the ADU needs them too.', 'La casa tiene rociadores; el ADU también los necesita.', 'Add sprinklers to the ADU plan. A bigger water meter may be needed.', 'Agregue rociadores.')) : pass('Not required: the main house has no sprinklers. Adding them is optional and can help with fire access.', 'No requerido.'); } },

  { id: 'ACC-01', version: '2', module: 'fire', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire department access (hose pull)', 'Acceso de bomberos'), cites: [{ code: 'Fire access review (LA County guideline: 150 ft, 300 ft if sprinklered detached ADU). LAFD verifies in LA City.', verified: true }],
    check: p => { const h = p.adu.hosePullFt; if (h == null) return unk('Hose pull distance not measured.', 'Distancia no medida.', 'Measure the walking path from the street curb to the farthest point of the ADU. LAFD checks this.', 'Mida el camino desde la calle.'); const lim = yes(p.adu.sprinklered) ? 300 : 150; return h <= lim ? pass(`About ${h} ft from the street (limit ${lim} ft).`, `Aprox. ${h} pies.`) : unk(`About ${h} ft from the street, over ${lim} ft.`, 'Supera el límite.', 'This is an access review, not an automatic no. Sprinklers or other fixes may solve it. LAFD decides.', 'LAFD decide.'); } },

  { id: 'ENG-01', version: '2', module: 'structural', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: conv,
    title: t('When an engineer is needed', 'Cuándo se necesita un ingeniero'), cites: [{ code: 'B&P §6737.1 and §5537 (conventional wood framing is exempt; non-conventional parts need a licensed engineer)', verified: true }],
    check: p => yes(p.adu.removesGarageDoorWall) ? info('Filling or changing the garage door opening changes how the wall holds the building up.', 'Cambiar la puerta del garaje afecta la estructura.', 'Ask a licensed engineer for that wall only (header and bracing). The rest can be owner-prepared.', 'Pida a un ingeniero solo ese muro.') : p.adu.removesGarageDoorWall === 'unknown' ? unk('We don\'t know the plan for the garage door opening.', 'No sabemos el plan para la puerta.', 'Say if the garage door opening will be filled in or changed.', 'Indique el plan.') : pass('No structural change planned to the garage door wall.', 'Sin cambios estructurales.') },

  { id: 'HAZ-01', version: '2', module: 'hazards', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Hillside and very high fire zone', 'Ladera y zona de muy alto riesgo de incendio'), cites: [{ code: 'LAMC 12.22 A.33 (HCD found parts noncompliant, 11/19/2024: contested)', verified: true }],
    check: p => { const { hillside, vhfhsz, slopeOver10 } = p.site.flags; if ([hillside, vhfhsz, slopeOver10].includes('unknown')) return unk('Hillside, fire zone or slope not confirmed.', 'No confirmado.', 'Check ZIMAS for "Hillside Area" and "Very High Fire Hazard Severity Zone".', 'Revise ZIMAS.'); if (yes(hillside) && yes(vhfhsz)) return fail('Lot is in both Hillside and Very High Fire zones. LA limits ADUs here, though the state says parts of that limit don\'t comply (contested).', 'Zona de ladera y fuego muy alto: limitado (disputado).', 'Talk to LADBS or a land-use attorney before designing.', 'Hable con LADBS.'); if (yes(slopeOver10) || yes(hillside)) return info('Hillside lot: engineering needed. Automatic fitting is off.', 'Lote en ladera: se necesita ingeniería.', 'Get a soils report and an engineer. Draft sheets still work.', 'Obtenga un informe de suelos.'); return pass('Not in Hillside + Very High Fire zones.', 'Fuera de esas zonas.'); } },

  { id: 'HAZ-02', version: '1', module: 'hazards', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Historic district (HPOZ)', 'Distrito histórico (HPOZ)'), cites: [{ code: 'LA HPOZ review; draft ADU design standards (6/22/2026)', verified: true }],
    check: p => p.site.flags.hpoz === 'yes' ? info('Exterior changes need HPOZ approval, which can take up to 75 days.', 'Cambios exteriores requieren aprobación HPOZ.', 'Contact the HPOZ planner early.', 'Contacte al planificador HPOZ.') : p.site.flags.hpoz === 'unknown' ? unk('Not known if the lot is in an HPOZ.', 'No se sabe.', 'Check ZIMAS for "HPOZ".', 'Revise ZIMAS.') : pass('Not in a historic district.', 'No está en distrito histórico.') },

  { id: 'HAZ-03', version: '2', module: 'hazards', severity: 'major', kind: 'city', effectiveFrom: EFF, applies: all,
    title: t('Coastal zone and Mello Act', 'Zona costera y Ley Mello'), cites: [{ code: 'Gov. Code §65590(b) (structures under 3 units exempt); City Planning decides', url: GOV + '65590', verified: true }],
    check: p => p.site.flags.coastal === 'yes' ? info('Coastal zone: a coastal permit step applies. Small lots (under 3 units) are usually exempt from Mello Act replacement rules.', 'Zona costera.', 'Ask City Planning for the Mello exemption check first.', 'Pida a Planificación la revisión de exención.') : p.site.flags.coastal === 'unknown' ? unk('Not known if the lot is in the coastal zone.', 'No se sabe.', 'Check ZIMAS for "Coastal Zone".', 'Revise ZIMAS.') : pass('Not in the coastal zone.', 'Fuera de la zona costera.') },

  { id: 'HAZ-04', version: '2', module: 'hazards', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Methane zone', 'Zona de metano'), cites: [{ code: 'LABC Ch. 71 (91.7104-91.7105); no automatic exemption for an existing slab', verified: true }],
    check: p => p.site.flags.methane === 'yes' ? info('Methane zone: new trenches or footings may require gas mitigation (a membrane and vents).', 'Zona de metano: puede requerir mitigación.', 'Budget for mitigation and ask LADBS if your scope triggers it.', 'Presupueste mitigación.') : p.site.flags.methane === 'unknown' ? unk('Not known if the lot is in a methane zone.', 'No se sabe.', 'Check ZIMAS for "Methane Hazard Site".', 'Revise ZIMAS.') : pass('Not in a methane zone.', 'Fuera de zona de metano.') },

  { id: 'HAZ-05', version: '1', module: 'hazards', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Fire rebuild area (Palisades / Eaton)', 'Área de reconstrucción por incendio'), cites: [{ code: 'State and LA emergency orders for 2025 burn areas', url: 'https://recovery.lacounty.gov/rebuilding/rebuild-policies-interpretations-and-exemptions', verified: true }],
    suspendsAutoPass: p => p.site.flags.fireRebuild === 'yes',
    check: p => p.site.flags.fireRebuild === 'unknown' ? unk('We don\'t know if the lot is in a 2025 burn area.', 'No sabemos si el lote está en un área de incendio 2025.', 'Check the LA County rebuild map for your address.', 'Revise el mapa de reconstrucción.') : p.site.flags.fireRebuild === 'yes' ? info('This lot is in a 2025 burn area. Special rebuild rules and emergency orders apply. Automatic passes are off.', 'Área de incendio 2025: reglas especiales.', 'Use the official rebuild path and talk to the rebuild center.', 'Use el camino oficial.') : pass('Not in a 2025 burn area.', 'Fuera del área.') },

  { id: 'ESM-01', version: '1', module: 'zoning', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Easements', 'Servidumbres'), cites: [{ code: 'Recorded title documents (not shown in ZIMAS)', verified: true }],
    check: p => yes(p.site.flags.easementsKnown) ? pass('Easements checked against the title report.', 'Servidumbres revisadas.') : info('Easements are unknown. Maps don\'t show them.', 'Servidumbres desconocidas.', 'Get a title report or check your grant deed so the ADU doesn\'t sit on an easement.', 'Obtenga un informe de título.') },

  { id: 'FEE-01', version: '3', module: 'fees', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Fee estimate (2026 rules)', 'Estimado de tarifas (reglas 2026)'),
    cites: [{ code: 'Gov. Code §66311.5 (formerly §66324), SB 543: no impact fees under 750 sq ft interior livable space', url: 'https://www.aalrr.com/newsroom-alerts-4196', verified: true },
      { code: 'SB 543 / Ed. Code §17620(a)(1)(C): no school fees under 500 sq ft interior livable space', url: 'https://www.aalrr.com/newsroom-alerts-4196', verified: true }],
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
    cites: [{ code: 'LABC 1907.1, LARC R506.2.3 (vapor retarder below slab, or approved epoxy coating on top; LADBS sheet III-J.1)', url: SHEET_URL, verified: true }],
    check: p => { const v = p.adu.slabVaporBarrier; return v === 'unknown' ? unk('We don\'t know if the slab has a vapor barrier.', 'No sabemos si la losa tiene barrera de vapor.', 'Old garage slabs often have none. Answer the slab question, or plan an approved epoxy coating on top.', 'Las losas viejas a menudo no tienen. Responda la pregunta, o planee un recubrimiento epóxico aprobado.')
      : yes(v) ? pass('Slab has a vapor barrier, or an approved epoxy coating is planned.', 'La losa tiene barrera de vapor, o se planea un recubrimiento epóxico aprobado.')
      : fail('No vapor barrier and no coating planned.', 'Sin barrera de vapor ni recubrimiento planeado.', 'Add an approved epoxy slab coating on top, and show it on the plans.', 'Agregue un recubrimiento epóxico aprobado y muéstrelo en los planos.'); } },

  { id: 'FIR-02', version: '1', module: 'fire', severity: 'critical', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Windows and doors in walls near the property line', 'Ventanas y puertas en muros cerca del lindero'),
    cites: [{ code: 'LADBS sheet III-A.5 (detached garage under 5 ft: 1-hour, no openings) and III-D.4 (opening analysis per LABC 705.8 / LARC R302.1)', url: SHEET_URL, verified: true }],
    check: p => {
      if (!polyInside(p.adu.footprint, p.site.lot)) return unk('The ADU is not fully inside the lot, so distances can\'t be measured.', 'El ADU no está dentro del lote.', 'Fix the drawing first.', 'Corrija el dibujo primero.');
      let worst = Infinity; p.site.lot.forEach((_, i) => { worst = Math.min(worst, clearanceToEdge(p.adu.footprint, p.site.lot, i)); });
      if (worst >= ft(5)) return pass(`Closest wall is ${fmtFtIn(worst)} from the line. No opening limit there.`, `El muro más cercano está a ${fmtFtIn(worst)}. Sin límite de aberturas.`);
      const o = p.adu.openingsNearLine;
      if (o === 'unknown') return unk(`A wall is ${fmtFtIn(worst)} from the line. Openings there are limited.`, `Un muro está a ${fmtFtIn(worst)} del lindero. Las aberturas allí son limitadas.`, 'Say if that wall has any windows, doors or vents.', 'Indique si ese muro tiene ventanas, puertas o rejillas.');
      if (no(o)) return pass(`No openings in the wall ${fmtFtIn(worst)} from the line.`, `Sin aberturas en el muro a ${fmtFtIn(worst)} del lindero.`);
      if (worst < ft(3)) return fail(`Openings in a wall only ${fmtFtIn(worst)} from the line.`, `Aberturas en un muro a solo ${fmtFtIn(worst)} del lindero.`, 'Remove them. Walls this close generally can\'t have openings. Move the escape window to another wall.', 'Quítelas. Muros tan cercanos generalmente no pueden tener aberturas. Mueva la ventana de escape a otro muro.');
      return unk(`Openings in a wall ${fmtFtIn(worst)} from the line (3 to 5 ft).`, `Aberturas en un muro a ${fmtFtIn(worst)} del lindero (3 a 5 pies).`, 'Some openings may be allowed here up to a share of the wall area. Your preparer runs the opening analysis (sheet III-D.4).', 'Algunas aberturas pueden permitirse hasta una parte del muro. Su preparador hace el análisis (hoja III-D.4).');
    } },

  { id: 'ALM-02', version: '1', module: 'egress', severity: 'major', kind: 'city', hs: true, effectiveFrom: EFF, applies: all,
    title: t('Smoke alarm power source', 'Energía de las alarmas de humo'),
    cites: [{ code: 'LABC 907.2.11.5 / LARC R314.4 (new construction: building wiring with battery backup; LADBS sheet III-E.2)', url: SHEET_URL, verified: true }],
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
    cites: [{ code: 'Gov. Code §66314(d)(11) (garage converted to an ADU: city may not require replacement parking)', url: GOV + '66314', verified: true }, { code: 'SB 1211 (2024): extends this to uncovered spaces', verified: false }],
    check: () => pass('Converting the garage does not require replacing its parking spaces.', 'Convertir el garaje no requiere reemplazar sus espacios de estacionamiento.') },

  { id: 'LEG-01', version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: EFF, applies: p => p.adu.legalization,
    title: t('Legalization mode (AB 2533)', 'Modo de legalización (AB 2533)'),
    cites: [{ code: 'Gov. Code §66332 (AB 2533): unpermitted ADU built before 1/1/2020 may be denied only for health and safety (HSC §17920.3)', url: 'https://www.colma.ca.gov/ab-2533', verified: true }],
    check: p => { const a = p.adu;
      if (yes(a.existingStructurePermitted)) return fail('Legalization mode is on, but the garage has a permit.', 'El modo de legalización está activo, pero el garaje tiene permiso.', 'Turn legalization mode off. It is for unpermitted units.', 'Apague el modo de legalización. Es para unidades sin permiso.');
      if (no(a.builtBefore2020)) return fail('AB 2533 covers units built before 2020 only.', 'AB 2533 cubre solo unidades construidas antes de 2020.', 'Turn legalization mode off and use the regular path.', 'Apague el modo y use el camino normal.');
      if (!yes(a.builtBefore2020) || !no(a.existingStructurePermitted)) return unk('Confirm the unit is unpermitted and was built before 2020.', 'Confirme que la unidad no tiene permiso y se construyó antes de 2020.', 'Answer the permit and build-date questions. Gather proof: photos, aerial images, utility bills.', 'Responda las preguntas de permiso y fecha. Reúna pruebas.');
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
    check: () => info('As owner-builder, anyone you pay to help must be a licensed contractor or your employee (with workers\' comp). Selling within a year can be presumed "built to sell".', 'Como dueño-constructor, quien le ayude debe ser contratista o empleado.', 'Read the LADBS owner-builder form before you sign it.', 'Lea el formulario antes de firmar.') },

  { id: 'RSO-01', version: '1', module: 'people', severity: 'major', kind: 'info', effectiveFrom: EFF, applies: p => p.site.flags.anyUnitRented === 'yes',
    title: t('Rent stabilization', 'Estabilización de rentas'), cites: [{ code: 'LA Rent Stabilization Ordinance (LAHD)', verified: false }],
    check: () => info('A unit on this lot is rented. The ADU may fall under LA rent rules.', 'Una unidad está rentada.', 'Check with the LA Housing Department (LAHD) before you rent the ADU.', 'Consulte con LAHD.') },

  { id: 'CLK-01', version: '2', module: 'clocks', severity: 'minor', kind: 'info', effectiveFrom: EFF, applies: all,
    title: t('Permit deadlines', 'Plazos del permiso'), cites: [{ code: 'LAMC 98.0603 (plan check expires 18 months after filing)', verified: true }, { code: 'LAMC 98.0602 (permit expires if work doesn\'t start within 12 months or stops for 12 months)', verified: true }],
    check: () => info('Plan check: 18 months after filing. Permit: 12 months to start work, and no 12-month stop.', 'Revisión: 18 meses. Permiso: 12 meses para empezar.', 'Add these deadlines to your calendar from the export screen.', 'Agregue los plazos a su calendario.') },
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
  if (s == null) return { school: verify, impact: verify, outcome: unk('Interior livable area not entered.', 'Área no ingresada.', 'Measure inside the walls. Fees are based on interior livable space.', 'Mida dentro de los muros. Las tarifas se basan en el área habitable interior.') };
  const school = s < 500 ? t('$0 (under 500 sq ft)', '$0 (menos de 500 pies²)') : verify;
  const impact = s < 750 ? t('$0 (under 750 sq ft)', '$0 (menos de 750 pies²)') : verify;
  const edge = (s >= 490 && s <= 510) || (s >= 740 && s <= 760);
  const leg = p.adu.legalization ? t(' Legalization (AB 2533) limits impact and connection fees too.', ' La legalización (AB 2533) también limita tarifas.') : t('', '');
  return { school, impact, outcome: info(`${s} sq ft livable. School fee: ${school.en}. Impact fee: ${impact.en}. Plan check, permit and connection fees still apply: estimate, verify with LADBS.${leg.en}`,
    `${s} pies² habitables. Tarifa escolar: ${school.es}. Tarifa de impacto: ${impact.es}. Las de revisión, permiso y conexión aún aplican: estimado, verifique con LADBS.${leg.es}`,
    edge ? 'You are near a fee line (500 or 750 sq ft). A few feet changes the fees. Exactly on the line: verify with LADBS.' : undefined, 'Está cerca de un límite (500 o 750 pies²). Exactamente en el límite: verifique con LADBS.', { sqft: s }) };
}

export const ruleArea = (p: Project) => toSqFt(area(p.adu.footprint));
