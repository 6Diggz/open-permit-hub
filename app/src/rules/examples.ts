// OUT2-08: worked examples for the rule pages, made by running the real rules on small changes to the demo lot.
// Nothing is typed in by hand: each example is the rule's own message for a project built from the listed inputs,
// so the pages can never say something the app does not.
import { blankProject, demoProject, type Project } from '../core/model';
import { ft, inch } from '../core/units';
import { evaluate, type Result } from './engine';
import { RULES } from './la-city';
import { PACK_ID } from './pack';

type L = { en: string; es: string };
interface Variant { label: L; make: () => Project }
const d = (label: L, fn: (p: Project) => void, base: () => Project = demoProject): Variant => ({ label, make: () => { const p = base(); fn(p); return p; } });
const move = (p: Project, dx: number) => { p.adu.footprint = p.adu.footprint.map(q => ({ x: q.x + dx, y: q.y })); };

/** Inputs tried, in order. The first one that gives a PASS (or FAIL, or a "need to know") for a rule is its example. */
export const VARIANTS: Variant[] = [
  d({ en: 'The demo lot: detached 20 x 20 ft garage, 8 ft ceiling, one bedroom with a 24 x 36 in escape window, sill 40 in.', es: 'El lote de ejemplo: garaje separado de 20 x 20 pies, techo de 8 pies, una recámara con ventana de escape de 24 x 36 pulg., antepecho de 40 pulg.' }, () => {}),
  d({ en: 'Demo lot with a 6 ft 6 in ceiling.', es: 'Lote de ejemplo con techo de 6 pies 6 pulg.' }, p => { p.adu.ceilingHeightMm = inch(78); }),
  d({ en: 'Demo lot with a 20 x 24 in bedroom window, sill 48 in.', es: 'Lote de ejemplo con ventana de recámara de 20 x 24 pulg., antepecho de 48 pulg.' }, p => { p.adu.windows = [{ id: 'w1', room: 'Bedroom', sleeping: true, clearWidthMm: inch(20), clearHeightMm: inch(24), sillMm: inch(48), gradeFloor: true }]; }),
  d({ en: 'Demo lot; the main house has fire sprinklers, the ADU plan has none.', es: 'Lote de ejemplo; la casa tiene rociadores, el plano del ADU no.' }, p => { p.site.flags.primarySprinklered = 'yes'; p.adu.sprinklered = 'no'; }),
  d({ en: 'Demo lot with the garage 2 ft from the side line and no 1-hour wall planned.', es: 'Lote de ejemplo con el garaje a 2 pies del lindero lateral y sin muro de 1 hora.' }, p => { const minX = Math.min(...p.adu.footprint.map(q => q.x)); move(p, ft(2) - minX); p.adu.ratedWallPlanned = 'no'; p.adu.openingsNearLine = 'no'; }),
  d({ en: 'Demo lot with the garage 2 ft from the side line and a 1-hour wall planned.', es: 'Lote de ejemplo con el garaje a 2 pies del lindero lateral y un muro de 1 hora planeado.' }, p => { const minX = Math.min(...p.adu.footprint.map(q => q.x)); move(p, ft(2) - minX); p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.eaveDepthMm = inch(6); p.adu.ratedEaveUndersidePlanned = 'yes'; }),
  d({ en: 'Demo lot, 400 ft hose pull from the street.', es: 'Lote de ejemplo, manguera de 400 pies desde la calle.' }, p => { p.adu.hosePullFt = 400; }),
  d({ en: 'Demo lot in both the Hillside Area and a Very High Fire Hazard zone (new ADU, not a conversion).', es: 'Lote de ejemplo en zona de Ladera y de Muy Alto Riesgo de Incendio (ADU nuevo, no conversión).' }, p => { p.site.flags.hillside = 'yes'; p.site.flags.vhfhsz = 'yes'; p.adu.mode = 'youadu'; }),
  d({ en: 'New detached ADU, 20 ft tall, not near transit.', es: 'ADU nuevo separado, 20 pies de alto, lejos del transporte.' }, p => { p.adu.mode = 'youadu'; p.adu.heightMm = ft(20); p.site.flags.transitHalfMile = 'no'; }),
  d({ en: 'New detached ADU, 15 ft tall.', es: 'ADU nuevo separado, 15 pies de alto.' }, p => { p.adu.mode = 'youadu'; p.adu.heightMm = ft(15); }),
  d({ en: 'Demo lot; the garage was built without a permit.', es: 'Lote de ejemplo; el garaje se construyó sin permiso.' }, p => { p.adu.existingStructurePermitted = 'no'; }),
  d({ en: 'Demo lot with no smoke or CO alarms planned.', es: 'Lote de ejemplo sin alarmas de humo ni de CO planeadas.' }, p => { p.adu.smokeCoPlanned = 'no'; p.adu.smokeHardwired = 'no'; }),
  d({ en: 'Demo lot with smoke alarms hardwired with battery backup.', es: 'Lote de ejemplo con alarmas de humo cableadas con batería de respaldo.' }, p => { p.adu.smokeHardwired = 'yes'; }),
  d({ en: 'Demo lot with 1,300 sq ft inside.', es: 'Lote de ejemplo con 1,300 pies² interiores.' }, p => { p.adu.interiorLivableSqFt = 1300; }),
  d({ en: 'Demo lot in a methane zone, the Coastal Zone and a historic district.', es: 'Lote de ejemplo en zona de metano, Zona Costera y distrito histórico.' }, p => { p.site.flags.methane = 'yes'; p.site.flags.coastal = 'yes'; p.site.flags.hpoz = 'yes'; }),
  d({ en: 'Demo lot, slab with no vapor retarder or epoxy.', es: 'Lote de ejemplo, losa sin barrera de vapor ni epóxico.' }, p => { p.adu.slabVaporBarrier = 'no'; }),
  d({ en: 'Demo lot, slab with a vapor retarder.', es: 'Lote de ejemplo, losa con barrera de vapor.' }, p => { p.adu.slabVaporBarrier = 'yes'; }),
  d({ en: 'Demo lot, two bedrooms, one escape window.', es: 'Lote de ejemplo, dos recámaras, una ventana de escape.' }, p => { p.adu.bedrooms = 2; }),
  d({ en: 'Demo lot, detached garage kept inside its walls.', es: 'Lote de ejemplo, garaje separado dentro de sus muros.' }, p => { p.adu.garageAttachment = 'detached'; p.adu.staysInsideWalls = 'yes'; }),
  d({ en: 'Demo lot, the ADU goes outside the garage walls.', es: 'Lote de ejemplo, el ADU sale de los muros del garaje.' }, p => { p.adu.garageAttachment = 'detached'; p.adu.staysInsideWalls = 'no'; }),
  d({ en: 'Demo lot, all-electric, 200 A panel.', es: 'Lote de ejemplo, todo eléctrico, tablero de 200 A.' }, p => { p.adu.allElectric = 'yes'; p.adu.panelAmps = 200; p.adu.separateGasMeter = 'no'; }),
  d({ en: 'Demo lot, the house has one unit rented.', es: 'Lote de ejemplo, la casa tiene una unidad rentada.' }, p => { p.site.flags.anyUnitRented = 'yes'; }),
  d({ en: 'Demo lot, owner-builder.', es: 'Lote de ejemplo, dueño-constructor.' }, p => { p.people.preparerRole = 'owner'; p.people.ownerName = 'Owner'; }),
  d({ en: 'Demo lot in the 2025 burn area, DWP easement within 10 ft.', es: 'Lote de ejemplo en la zona quemada de 2025, servidumbre de DWP a menos de 10 pies.' }, p => { p.site.flags.fireRebuild = 'yes'; p.site.flags.dwpEasement10ft = 'yes'; }),
  d({ en: 'Demo lot in unincorporated LA County.', es: 'Lote de ejemplo en zona no incorporada del Condado de LA.' }, p => { p.site.jurisdiction = 'la-county'; }),
  d({ en: 'Demo lot, AB 2533 legalization of a pre-2020 unit.', es: 'Lote de ejemplo, legalización AB 2533 de una unidad anterior a 2020.' }, p => { p.adu.legalization = true; p.adu.usedAsHomeBefore2020 = 'yes'; }),
  d({ en: 'Demo lot with one ADU already on the lot.', es: 'Lote de ejemplo con un ADU ya existente.' }, p => { p.site.existingAdus = 1; }),
  d({ en: 'Demo lot with the garage drawn partly past the back lot line.', es: 'Lote de ejemplo con el garaje dibujado en parte fuera del lindero trasero.' }, p => { p.adu.footprint = p.adu.footprint.map(q => ({ x: q.x, y: q.y + ft(10) })); }),
  d({ en: 'Demo lot that already has two ADUs.', es: 'Lote de ejemplo que ya tiene dos ADU.' }, p => { p.site.existingAdus = 2; }),
  d({ en: 'Demo lot, wood-frame garage.', es: 'Lote de ejemplo, garaje de madera.' }, p => { p.adu.garageConstruction = 'wood'; }),
  d({ en: 'Demo lot, masonry (block) garage.', es: 'Lote de ejemplo, garaje de mampostería (bloque).' }, p => { p.adu.garageConstruction = 'masonry'; }),
  d({ en: 'Demo lot with the garage 2 ft from the house.', es: 'Lote de ejemplo con el garaje a 2 pies de la casa.' }, p => { const top = Math.max(...p.site.primary.map(q => q.y)); const low = Math.min(...p.adu.footprint.map(q => q.y)); p.adu.footprint = p.adu.footprint.map(q => ({ x: q.x, y: q.y - (low - top - ft(2)) })); p.adu.houseFacingOpenings = 'no'; p.adu.houseWallRated = 'no'; }),
  d({ en: 'Demo lot with every wall 5 ft or more from the lot lines, 12 in eaves.', es: 'Lote de ejemplo con todos los muros a 5 pies o más de los linderos, aleros de 12 pulg.' }, p => { const x0 = Math.min(...p.adu.footprint.map(q => q.x)), y0 = Math.min(...p.adu.footprint.map(q => q.y)); p.adu.footprint = p.adu.footprint.map(q => ({ x: q.x - x0 + ft(15), y: q.y - y0 + ft(100) })); p.adu.ratedWallPlanned = 'no'; p.adu.openingsNearLine = 'no'; p.adu.eaveDepthMm = inch(12); p.adu.houseFacingOpenings = 'no'; }),
  d({ en: 'A new project with nothing filled in yet.', es: 'Un proyecto nuevo sin datos todavía.' }, () => {}, blankProject),
];

export interface Example { label: L; result: Result }
export interface RuleExamples { pass?: Example; fail?: Example; ask?: Example; info?: Example }
/** Examples for every rule (the vest date is fixed so the pages do not change from day to day). */
export function ruleExamples(today = new Date('2026-10-01T12:00:00Z')): Record<string, RuleExamples> {
  const out: Record<string, RuleExamples> = Object.fromEntries(RULES.map(r => [r.id, {}]));
  for (const v of VARIANTS) {
    const rep = evaluate(v.make(), RULES, PACK_ID, today);
    for (const r of rep.results) { const o = out[r.rule.id]; if (!o || r.unsupported) continue;
      if (r.status === 'PASS' && !o.pass) o.pass = { label: v.label, result: r };
      else if (r.status === 'FAIL' && !o.fail) o.fail = { label: v.label, result: r };
      else if (r.status === 'UNKNOWN' && !o.ask && r.next) o.ask = { label: v.label, result: r };
      else if (r.status === 'INFO' && !o.info) o.info = { label: v.label, result: r }; }
  }
  return out;
}
