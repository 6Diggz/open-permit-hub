import { ft, inch } from './units';
import { rect, type Poly } from './geom';
import { PACK_ID } from '../rules/pack';

export const FORMAT = 'permitpack';
export const FORMAT_VERSION = 1;

export type Tri = 'yes' | 'no' | 'unknown';
export type Role = 'owner' | 'drafter' | 'contractor' | 'architect' | 'engineer';
export type Mode = 'conversion' | 'youadu';

export type RoomUse = 'sleeping' | 'living' | 'bath' | 'kitchen';
export const ROOM_USES: RoomUse[] = ['sleeping', 'living', 'kitchen', 'bath'];
/** A door or window on one wall of a room. Window sizes are the clear opening (what escape rules measure). */
export interface Opening { id: string; kind: 'door' | 'window'; wall: number; offsetMm: number; widthMm: number; heightMm: number | null; sillMm: number | null }
/**
 * A room drawn inside the garage footprint. `poly` is in mm relative to the footprint's lower-left corner (so moving the ADU
 * moves its rooms). `tape` holds tape-measured sizes; when set they override the drawn size (rectangle rooms only).
 */
export interface Room { id: string; name: string; use: RoomUse; shape: 'rect' | 'poly'; poly: Poly; tape: { w: number | null; d: number | null }; ceilingMm: number | null; openings: Opening[] }
export type PinStatus = 'open' | 'resolved';
/** A numbered review pin on the site plan (model mm). Travels inside the .permitpack, so a reviewer needs no account. */
export interface Pin { id: string; n: number; x: number; y: number; comment: string; status: PinStatus; author: string; at: string; ref?: string }
/** One item of a city correction letter, answered as a checklist response. */
export interface Response { id: string; ref: string; text: string; response: string; sheet: string; done: boolean; pinId?: string }
/** Where parcel values came from. `fromMap` lists fields still holding the map's value (removed when the user edits one). */
export interface ParcelInfo { at: string; matched: string; cityName: string; fromMap: string[]; failed: string[]; pin: string }

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
    /** Other lot edges on a street or alley (a corner lot's side street, a rear alley). */ streetEdges?: number[];
    /** Zoning from the city map (e.g. R1-1), or typed by the user. */
    zone: string;
    parcel: ParcelInfo | null;
    /** Main building on the lot (sheet II-C is for an existing single-family dwelling only). */
    mainBuilding: 'sfd' | 'duplex' | 'multifamily' | 'unknown';
    /** ADUs and JADUs already on the lot, permitted or not (sheet II-C.5 unit mix). */
    existingAdus: number | null; existingJadus: number | null;
    primary: Poly; primaryHeightMm: number;
    flags: {
      hillside: Tri; vhfhsz: Tri; hpoz: Tri; coastal: Tri; methane: Tri; fireRebuild: Tri;
      transitHalfMile: Tri; easementsKnown: Tri; anyUnitRented: Tri; primarySprinklered: Tri;
      slopeOver10: Tri; dwpEasement10ft: Tri;
    };
    /** Other buildings on the lot besides the main house (second garage, shed, workshop). Each sets an assumed line halfway (sheet III-D.1). */
    otherBuildings: Tri;
    /** Closest distance from the ADU to any of those other buildings. */
    otherBuildingGapMm: number | null;
    /** The user checked ZIMAS and the lot is in LA City (needed when the address names another city). */
    jurisdictionConfirmed?: boolean;
  };
  adu: {
    mode: Mode; footprint: Poly; heightMm: number; interiorLivableSqFt: number | null;
    ceilingHeightMm: number | null; existingStructurePermitted: Tri; builtBefore2020: Tri;
    /** Was the structure already used as a separate home before 1/1/2020? Only this unlocks AB 2533 (Gov. Code §66332). */
    usedAsHomeBefore2020: Tri;
    /** Studio (0 bedrooms): does anyone sleep in the main room? Unknown is treated as yes (R310.1 every sleeping room). */
    mainRoomSleeping: Tri;
    /** Eave / roof overhang depth beyond the wall (sheet III-D.2, Table R302.1). */
    eaveDepthMm: number | null;
    /** Closest distance from the added entry area (up to 150 sq ft) to a side or rear line (sheet II-D.5 / II-G). */
    addedSetbackMm: number | null;
    addedAreaSqFt: number; removesGarageDoorWall: Tri; ratedWallPlanned: Tri; sprinklered: Tri;
    hosePullFt: number | null; windows: Window[]; roofPitchMatches: Tri; bedrooms: number;
    smokeCoPlanned: Tri; allElectric: Tri;
    /** Garage path (sheet II-C detached, II-G attached). */
    garageAttachment: 'detached' | 'attached' | 'unknown'; staysInsideWalls: Tri; addedForIngressOnly: Tri; /** A new story is being built on top of the garage (not existing space). */ newUpperFloor: Tri;
    /** AB 2533 legalization of a pre-2020 unpermitted unit (Gov. Code §66332). */
    legalization: boolean;
    slabVaporBarrier: Tri; openingsNearLine: Tri; /** Windows, doors, vents or eaves on the house wall that faces the ADU. */ houseFacingOpenings: Tri; smokeHardwired: Tri;
    panelAmps: number | null; separateGasMeter: Tri;
    /** Setbacks as written on the floor plan sheet, to compare with the site plan. */
    floorPlanSideSetbackMm: number | null; floorPlanRearSetbackMm: number | null;
    /** Wall construction of the existing garage. B&P §5537(a) exempts wood-frame only; masonry/concrete needs an architect or engineer. */
    garageConstruction: 'wood' | 'masonry' | 'concrete' | 'unknown';
    /** 1-hour rated eave underside where an eave is 2-5 ft from the line (LARC Table R302.1(1)). Separate from the wall rating. */
    ratedEaveUndersidePlanned: Tri;
    /** Rooms drawn inside the footprint (Rooms step). When there are rooms, bedrooms and escape windows come from them. */
    rooms: Room[];
  };
  markup: { pins: Pin[]; responses: Response[] };
  /** Answers to correction-sheet "ask" items: yes = shown on plans / handled, no = not yet, na = does not apply. */
  sheet: Record<string, 'yes' | 'no' | 'na'>;
  /** Correction-sheet "doc" items the user has attached. */
  docs: Record<string, boolean>;
  people: { ownerName: string; preparerRole: Role; preparerName: string; preparerLicense: string; language: 'en' | 'es';
    /** Licensed engineer for non-conventional parts (B&P §6737.1 / §5537(b)), e.g. the garage door wall. */
    engineerName: string };
  modules: Record<string, boolean>;
  dismissed: { ruleId: string; reason: string; at: string; ruleVersion: string }[];
  /** Sizes the user actually entered (defaults are placeholders, UX P0-3). */
  confirmed: { lot: boolean; house: boolean; adu: boolean };
  /** Save counter, used to detect a second tab writing the same project. */
  rev?: number;
  /** What was repaired when old or damaged data was opened (shown once to the user). */
  repairNotes?: string[];
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

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function blankProject(): Project {
  const now = new Date().toISOString();
  return {
    format: FORMAT, version: FORMAT_VERSION, id: uid(), createdAt: now, updatedAt: now,
    name: 'My garage conversion', applicationDate: null, rulePack: PACK_ID,
    site: {
      address: '', apn: '', jurisdiction: 'unknown', lotSource: 'manual', lotUncertaintyMm: ft(2),
      lot: rect(0, 0, ft(50), ft(130)), streetEdge: 0, zone: '', parcel: null, mainBuilding: 'unknown', existingAdus: null, existingJadus: null,
      primary: rect(ft(10), ft(20), ft(30), ft(45)), primaryHeightMm: ft(16), otherBuildings: 'unknown', otherBuildingGapMm: null,
      flags: { hillside: 'unknown', vhfhsz: 'unknown', hpoz: 'unknown', coastal: 'unknown', methane: 'unknown', fireRebuild: 'unknown', transitHalfMile: 'unknown', easementsKnown: 'unknown', anyUnitRented: 'unknown', primarySprinklered: 'unknown', slopeOver10: 'unknown', dwpEasement10ft: 'unknown' },
    },
    adu: {
      mode: 'conversion', footprint: rect(ft(15), ft(100), ft(20), ft(20)), heightMm: ft(12), interiorLivableSqFt: null,
      ceilingHeightMm: null, existingStructurePermitted: 'unknown', builtBefore2020: 'unknown', usedAsHomeBefore2020: 'unknown', mainRoomSleeping: 'unknown', eaveDepthMm: null, addedSetbackMm: null, addedAreaSqFt: 0,
      removesGarageDoorWall: 'unknown', ratedWallPlanned: 'unknown', sprinklered: 'unknown', hosePullFt: null,
      roofPitchMatches: 'unknown', windows: [], bedrooms: 1, smokeCoPlanned: 'unknown', allElectric: 'unknown',
      garageAttachment: 'unknown', staysInsideWalls: 'unknown', addedForIngressOnly: 'unknown', newUpperFloor: 'unknown', legalization: false,
      slabVaporBarrier: 'unknown', openingsNearLine: 'unknown', houseFacingOpenings: 'unknown', smokeHardwired: 'unknown', panelAmps: null, separateGasMeter: 'unknown',
      floorPlanSideSetbackMm: null, floorPlanRearSetbackMm: null, garageConstruction: 'unknown', ratedEaveUndersidePlanned: 'unknown', rooms: [],
    },
    markup: { pins: [], responses: [] },
    sheet: {}, docs: {},
    people: { ownerName: '', preparerRole: 'owner', preparerName: '', preparerLicense: '', language: 'en', engineerName: '' },
    modules: Object.fromEntries(MODULES.map(m => [m.id, true])),
    dismissed: [], confirmed: { lot: false, house: false, adu: false },
  };
}

/** Demo parcel: reserved APN prefix 0000-, export blocked (UU1268/ctx). */
export function demoProject(): Project {
  const p = blankProject(); p.confirmed = { lot: true, house: true, adu: true };
  p.name = 'Demo lot (not a real address)';
  p.site.address = '123 Example St (demo)'; p.site.apn = '0000-000-000'; p.site.jurisdiction = 'la-city'; p.site.mainBuilding = 'sfd'; p.site.otherBuildings = 'no'; p.site.existingAdus = 0; p.site.existingJadus = 0;
  p.site.flags = { ...p.site.flags, hillside: 'no', vhfhsz: 'no', hpoz: 'no', coastal: 'no', methane: 'no', fireRebuild: 'no', transitHalfMile: 'no', anyUnitRented: 'no', primarySprinklered: 'no', slopeOver10: 'no', dwpEasement10ft: 'no' };
  p.adu = { ...p.adu, interiorLivableSqFt: 380, ceilingHeightMm: inch(96), existingStructurePermitted: 'yes', builtBefore2020: 'yes', removesGarageDoorWall: 'yes', ratedWallPlanned: 'unknown', sprinklered: 'no', hosePullFt: 120, smokeCoPlanned: 'yes', allElectric: 'yes', garageAttachment: 'detached', garageConstruction: 'wood', staysInsideWalls: 'yes', smokeHardwired: 'yes', slabVaporBarrier: 'unknown', eaveDepthMm: 0,
    windows: [{ id: 'w1', room: 'Bedroom', sleeping: true, clearWidthMm: inch(24), clearHeightMm: inch(36), sillMm: inch(40), gradeFloor: true }] };
  p.adu.footprint = [{ x: ft(46), y: ft(108) }, { x: ft(66), y: ft(108) }, { x: ft(66), y: ft(128) }, { x: ft(46), y: ft(128) }].map(q => ({ x: q.x - ft(18), y: q.y }));
  return p;
}
export const isDemo = (p: Project) => p.site.apn.startsWith('0000-');
