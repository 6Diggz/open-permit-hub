/**
 * One source of truth for the rule pack: id, version, dates and the code cycle.
 * Every export, the UI, the MCP server and the correction-sheet catalog read these values.
 */
export const PACK = {
  jurisdiction: 'la-city',
  version: '2026.10.2',
  /** Rules apply to applications deemed complete on or after this date. */
  effectiveFrom: '2026-01-01',
  /** Day a maintainer last checked the rules against the sources. */
  verifiedOn: '2026-10-24',
  /** After this day the app warns that the rules may be out of date. */
  reviewBy: '2027-01-01',
  sheet: {
    form: 'PC/STR/Corr.Lst.20A', rev: '10/01/2025',
    url: 'https://dbs.lacity.gov/sites/default/files/efs/forms/pc17/PC.STR.Corr.Lst.20A.pdf',
    /** What the sheet itself prints (checked 2026-10-24: "code sections of the 2023 edition of the Los Angeles Codes"). */
    codes: '2023 LABC/LARC',
  },
  /** State code cycle in force for applications from 2026-01-01 (California Building Standards Code, 2025 edition). */
  stateCycle: '2025 California codes (effective 2026-01-01)',
  /** LA City's local adoption of the 2025 state cycle (2026 LABC/LARC). Section numbers not yet checked against it. */
  localCycleNote: 'Section numbers follow the 2023 LABC/LARC printed on the LADBS sheet. Matching 2026 LABC/LARC numbers: UNVERIFIED.',
} as const;

export const PACK_ID = `${PACK.jurisdiction}@${PACK.version}`;
/** Edition label to attach to LA code section cites (LARC/LABC), from the sheet. */
export const LA_ED = PACK.sheet.codes.split(' ')[0]; // "2023"

export type Freshness = { stale: boolean; reason: string; reasonEs: string };
/** Stale when the review date has passed, or a new Jan 1 (new state laws) has passed since verification. */
/** Also stale when the application (vesting) date is past the review date or in a later year: a 2027 filing gets 2027 laws. */
export function packFreshness(today = new Date(), vestDate?: string | null): Freshness {
  const d = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const later = [d, ...(vestDate && /^\d{4}-\d{2}-\d{2}$/.test(vestDate) ? [vestDate] : [])].sort().pop()!;
  const newYear = later.slice(0, 4) > PACK.verifiedOn.slice(0, 4);
  if (later > d) { if (later >= PACK.reviewBy || newYear) return { stale: true,
    reason: `Your application date (${later}) is after these rules were last checked (${PACK.verifiedOn}). New state laws start each January 1. Check for an app update before you rely on them.`,
    reasonEs: `Su fecha de solicitud (${later}) es posterior a la última revisión de estas reglas (${PACK.verifiedOn}). Las leyes estatales nuevas empiezan cada 1 de enero. Busque una actualización antes de confiar en ellas.` }; }
  if (d >= PACK.reviewBy || newYear) return { stale: true,
    reason: `These rules were last checked on ${PACK.verifiedOn}. New state laws start each January 1. Check for an app update before you rely on them.`,
    reasonEs: `Estas reglas se revisaron por última vez el ${PACK.verifiedOn}. Las leyes estatales nuevas empiezan cada 1 de enero. Busque una actualización antes de confiar en ellas.` };
  return { stale: false, reason: `Rules checked on ${PACK.verifiedOn}.`, reasonEs: `Reglas revisadas el ${PACK.verifiedOn}.` };
}

/** The "which rules" line for the card, PDF and HTML. The vesting date shows only when the user set a filing date (it is not a freshness claim). */
export function rulesLine(applicationDate: string | null, pack: string, es: boolean, today = new Date()): { text: string; stale: boolean } {
  const fr = packFreshness(today, applicationDate);
  const filed = applicationDate ? (es ? `Reglas para solicitudes presentadas el ${applicationDate} · ` : `Rules for applications filed ${applicationDate} · `) : '';
  const base = es ? `paquete de reglas ${pack}, revisado por última vez el ${PACK.verifiedOn}` : `rule pack ${pack}, last checked ${PACK.verifiedOn}`;
  return { text: filed + base + (fr.stale ? ` · ${es ? fr.reasonEs : fr.reason}` : ''), stale: fr.stale };
}
