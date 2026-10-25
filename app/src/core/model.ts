import { ft, inch } from './units';
import { rect, type Poly } from './geom';

export const FORMAT = 'permitpack';
export const FORMAT_VERSION = 1;

export type Tri = 'yes' | 'no' | 'unknown';
export type Role = 'owner' | 'drafter' | 'contractor' | 'architect' | 'engineer';
export type Mode = 'conversion' | 'youadu';

export interface Window { id: string; room: string; sleeping: boolean; clearWidthMm: number | null; clearHeightMm: number | null; sillMm: number | null; gradeFloor: boolean }
export interface Project {
  format: typeof FORMAT; version: number; id: string; createdAt: string; updatedAt: string;
  name: string;
  /** Rules vest on the date the application is deemed complete (PR09). Null = today. */
  applicationDate: string | null;
  rulePack: string; // pinned pack id+version
  site: {
    address: string; apn: string; jurisdiction: 'la-city' | 'la-county' | 'other' | 'unknown';
    lotSource: 'manual' | 'gis' | 'survey'; lotUncertaintyMm: number;
    lot: Poly; streetEdge: number; // index of lot edge facing street
    primary: Poly; primaryHeightMm: number;
    flags: {
      hillside: Tri; vhfhsz: Tri; hpoz: Tri; coastal: Tri; methane: Tri; fireRebuild: Tri;
      transitHalfMile: Tri; easementsKnown: Tri; anyUnitRented: Tri; primarySprinklered: Tri;
      slopeOver10: Tri;
    };
  };
  adu: {
    mode: Mode; footprint: Poly; heightMm: number; interiorLivableSqFt: number | null;
    ceilingHeightMm: number | null; existingStructurePermitted: Tri; builtBefore2020: Tri;
    addedAreaSqFt: number; removesGarageDoorWall: Tri; ratedWallPlanned: Tri; sprinklered: Tri;
    hosePullFt: number | null; windows: Window[]; roofPitchMatches: Tri; bedrooms: number;
    smokeCoPlanned: Tri; allElectric: Tri;
  };
  people: { ownerName: string; preparerRole: Role; preparerName: string; preparerLicense: string; language: 'en' | 'es' };
  modules: Record<string, boolean>;
  dismissed: { ruleId: string; reason: string; at: string; ruleVersion: string }[];
  /** Sizes the user actually entered (defaults are placeholders, UX P0-3). */
  confirmed: { lot: boolean; house: boolean; adu: boolean };
}

export const SAFETY_MODULES = ['fire', 'egress', 'structural'];
export const MODULES = [
  { id: 'zoning', label: 'Setbacks, height and size', safety: false },
  { id: 'fire', label: 'Fire separation and fire access', safety: true },
  { id: 'egress', label: 'Escape windows and alarms', safety: true },
  { id: 'structural', label: 'When an engineer is needed', safety: true },
  { id: 'hazards', label: 'Hillside, fire zone, historic, coast, methane', safety: false },
  { id: 'fees', label: 'Fees and size limits', safety: false },
  { id: 'energy', label: 'Energy code (Title 24) handoff', safety: false },
  { id: 'people', label: 'Owner-builder and tenant rules', safety: false },
  { id: 'clocks', label: 'Permit deadlines', safety: false },
] as const;

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export function blankProject(): Project {
  const now = new Date().toISOString();
  return {
    format: FORMAT, version: FORMAT_VERSION, id: uid(), createdAt: now, updatedAt: now,
    name: 'My garage conversion', applicationDate: null, rulePack: 'la-city@2026.10.0',
    site: {
      address: '', apn: '', jurisdiction: 'unknown', lotSource: 'manual', lotUncertaintyMm: ft(2),
      lot: rect(0, 0, ft(50), ft(130)), streetEdge: 0,
      primary: rect(ft(10), ft(20), ft(30), ft(45)), primaryHeightMm: ft(16),
      flags: { hillside: 'unknown', vhfhsz: 'unknown', hpoz: 'unknown', coastal: 'unknown', methane: 'unknown', fireRebuild: 'unknown', transitHalfMile: 'unknown', easementsKnown: 'unknown', anyUnitRented: 'unknown', primarySprinklered: 'unknown', slopeOver10: 'unknown' },
    },
    adu: {
      mode: 'conversion', footprint: rect(ft(15), ft(100), ft(20), ft(20)), heightMm: ft(12), interiorLivableSqFt: null,
      ceilingHeightMm: null, existingStructurePermitted: 'unknown', builtBefore2020: 'unknown', addedAreaSqFt: 0,
      removesGarageDoorWall: 'unknown', ratedWallPlanned: 'unknown', sprinklered: 'unknown', hosePullFt: null,
      roofPitchMatches: 'unknown', windows: [], bedrooms: 1, smokeCoPlanned: 'unknown', allElectric: 'unknown',
    },
    people: { ownerName: '', preparerRole: 'owner', preparerName: '', preparerLicense: '', language: 'en' },
    modules: Object.fromEntries(MODULES.map(m => [m.id, true])),
    dismissed: [], confirmed: { lot: false, house: false, adu: false },
  };
}

/** Demo parcel: reserved APN prefix 0000-, export blocked (UU1268/ctx). */
export function demoProject(): Project {
  const p = blankProject(); p.confirmed = { lot: true, house: true, adu: true };
  p.name = 'Demo lot (not a real address)';
  p.site.address = '123 Example St (demo)'; p.site.apn = '0000-000-000'; p.site.jurisdiction = 'la-city';
  p.site.flags = { ...p.site.flags, hillside: 'no', vhfhsz: 'no', hpoz: 'no', coastal: 'no', methane: 'no', fireRebuild: 'no', transitHalfMile: 'no', anyUnitRented: 'no', primarySprinklered: 'no', slopeOver10: 'no' };
  p.adu = { ...p.adu, interiorLivableSqFt: 380, ceilingHeightMm: inch(96), existingStructurePermitted: 'yes', builtBefore2020: 'yes', removesGarageDoorWall: 'yes', ratedWallPlanned: 'unknown', sprinklered: 'no', hosePullFt: 120, smokeCoPlanned: 'yes', allElectric: 'yes',
    windows: [{ id: 'w1', room: 'Bedroom', sleeping: true, clearWidthMm: inch(24), clearHeightMm: inch(36), sillMm: inch(40), gradeFloor: true }] };
  p.adu.footprint = [{ x: ft(46), y: ft(108) }, { x: ft(66), y: ft(108) }, { x: ft(66), y: ft(128) }, { x: ft(46), y: ft(128) }].map(q => ({ x: q.x - ft(18), y: q.y }));
  return p;
}
export const isDemo = (p: Project) => p.site.apn.startsWith('0000-');
