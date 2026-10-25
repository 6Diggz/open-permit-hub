// Regression tests for stress-test round 1 findings. Each test name starts with the finding id.
import { describe, it, expect } from 'vitest';
import { parseLength, fmtFtIn, ft, inch } from '../core/units';
import { rect, polyInside, clearanceToEdge, gap } from '../core/geom';
import { blankProject, demoProject, type Project } from '../core/model';
import { evaluate, checkCitations, validateCitations } from '../rules/engine';
import { RULES, PACK_ID, feeEstimate } from '../rules/la-city';
import { PACK, packFreshness } from '../rules/pack';
import { SHEET } from '../rules/ladbs-adu-2025';
import { migrate, serialize, openPack, encryptPack, readPackFile, passphraseProblem, MAX_WINDOWS } from '../core/permitpack';
import { makeStore } from '../core/store';

const st = (p: Project, id: string) => evaluate(p, RULES, PACK_ID, new Date('2026-10-24')).results.find(r => r.rule.id === id);
const ready = (p: Project) => evaluate(p, RULES, PACK_ID, new Date('2026-10-24')).overall;
/** A conversion that is READY except for whatever a test changes. */
function good(): Project {
  const p = demoProject(); p.site.apn = '5555-001-001';
  p.adu.footprint = rect(ft(20), ft(100), ft(20), ft(20)); // 10 ft from both side lines, 10 ft from rear
  p.adu.ratedWallPlanned = 'no'; p.adu.openingsNearLine = 'no'; p.adu.slabVaporBarrier = 'yes';
  p.site.flags.easementsKnown = 'yes'; p.docs['NRG.CF1R'] = true; p.docs['NRG.HERS'] = true;
  p.adu.floorPlanSideSetbackMm = ft(10); p.adu.floorPlanRearSetbackMm = ft(10); p.adu.panelAmps = 200;
  return p;
}

describe('qa-02 / COR-14 / qa-23 length parser', () => {
  it('qa-02 rejects zero denominators and non-finite sizes', () => {
    for (const s of ['1/0"', '5 1/0"', '20-1/0', 'Infinity', 'NaN', '1e400', '-0/0"', '9999999999999']) expect(parseLength(s), s).toBeNull();
  });
  it('COR-14 accepts phone smart quotes and bare inches after feet', () => {
    expect(parseLength('20’ 6”')).toBeCloseTo(ft(20) + inch(6));
    expect(parseLength('20′ 6″')).toBeCloseTo(ft(20) + inch(6));
    expect(parseLength("6'6")).toBeCloseTo(ft(6) + inch(6));
    expect(parseLength('5 ft 6')).toBeCloseTo(ft(5) + inch(6));
  });
  it('COR-14 rejects nonsense: 12+ inches after feet, negatives', () => {
    expect(parseLength('20-13')).toBeNull(); expect(parseLength(`6' 13"`)).toBeNull(); expect(parseLength("-5'")).toBeNull();
    expect(parseLength("-5'", { signed: true })).toBeCloseTo(-ft(5));
  });
  it('qa-23 Arabic-Indic and full-width digits', () => { expect(parseLength('٢٠')).toBeCloseTo(ft(20)); expect(parseLength('２０')).toBeCloseTo(ft(20)); });
  it('COR-13 fmtFtIn never prints NaN', () => { expect(fmtFtIn(NaN)).toBe('—'); expect(fmtFtIn(Infinity)).toBe('—'); });
});

describe('qa-02 saved data with bad numbers is repaired on load', () => {
  it('Infinity stored as null in the lot repairs instead of bricking', () => {
    const p = demoProject(); const raw = JSON.parse(serialize(p)); raw.site.lot[1].x = null; raw.adu.ceilingHeightMm = 'NaN'; raw.adu.windows[0].clearWidthMm = null; raw.adu.heightMm = -1;
    const m = migrate(raw);
    expect(m.site.lot.every(q => Number.isFinite(q.x))).toBe(true); expect(m.confirmed.lot).toBe(false);
    expect(m.adu.ceilingHeightMm).toBeNull(); expect(m.adu.heightMm).toBeGreaterThan(0);
    expect(m.repairNotes).toContain('lot size');
    expect(evaluate(m, RULES, PACK_ID).overall).not.toBe('READY_FOR_PREPARER');
  });
  it('appsec-05 an id that is not a UUID is replaced', () => { const raw = JSON.parse(serialize(demoProject())); raw.id = 'a\r\nATTACH:https://evil.example/x'; expect(migrate(raw).id).toMatch(/^[0-9a-f-]{36}$/); });
  it('appsec-04 window count is capped', () => { const raw = JSON.parse(serialize(demoProject())); raw.adu.windows = Array.from({ length: 5000 }, (_, i) => ({ ...raw.adu.windows[0], id: 'w' + i })); expect(migrate(raw).adu.windows.length).toBe(MAX_WINDOWS); });
});

describe('qa-01 / appsec-09 / qa-33 / appsec-07 opening packs', () => {
  it('qa-01 a plain backup restores without asking for a passphrase', async () => {
    const p = demoProject(); let asked = false;
    const out = await readPackFile(serialize(p), async () => { asked = true; return null; });
    expect(asked).toBe(false); expect(out?.id).toBe(p.id);
  });
  it('appsec-09 a plain pack that mentions "permitpack-encrypted" in text is not treated as locked', async () => {
    const p = demoProject(); p.name = 'notes: permitpack-encrypted'; let asked = false;
    expect((await readPackFile(serialize(p), async () => { asked = true; return null; }))?.name).toBe(p.name); expect(asked).toBe(false);
  });
  it('qa-01 a locked pack asks, and cancel opens nothing', async () => {
    const enc = await encryptPack(demoProject(), 'correct horse battery');
    expect(await readPackFile(enc, async () => null)).toBeNull();
    expect((await readPackFile(enc, async () => 'correct horse battery'))?.site.apn).toBe('0000-000-000');
  });
  it('qa-33 damaged files give a plain message, not a parser message', async () => {
    await expect(readPackFile('{{{garbage', async () => null)).rejects.toThrow('This file is damaged or is not a permit pack.');
    const enc = await encryptPack(demoProject(), 'correct horse battery');
    await expect(readPackFile(enc.slice(0, enc.length / 2), async () => 'x')).rejects.toThrow(/damaged/);
    await expect(readPackFile('x'.repeat(6 * 1024 * 1024), async () => null)).rejects.toThrow(/too large/);
  });
  it('appsec-07 v1 packs still open; header edits and newer versions are caught', async () => {
    // Build a v1 pack exactly as the old code did (no additional data).
    const te = new TextEncoder(); const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const k0 = await crypto.subtle.importKey('raw', te.encode('old pass phrase'), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' }, k0, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, te.encode(serialize(demoProject()))));
    const v1 = JSON.stringify({ format: 'permitpack-encrypted', v: 1, kdf: 'PBKDF2-SHA256-600000', salt: b64(salt), iv: b64(iv), ct: b64(ct) });
    expect((await openPack(v1, 'old pass phrase')).site.apn).toBe('0000-000-000');
    const v2 = JSON.parse(await encryptPack(demoProject(), 'correct horse battery'));
    await expect(openPack(JSON.stringify({ ...v2, v: 3 }), 'correct horse battery')).rejects.toThrow(/newer version/);
    await expect(openPack(JSON.stringify({ ...v2, v: 1 }), 'correct horse battery')).rejects.toThrow(/Wrong passphrase/); // header is authenticated
  });
  it('appsec-08 common passphrases are refused', () => { expect(passphraseProblem('password')).toBeTruthy(); expect(passphraseProblem('12345678')).toBeTruthy(); expect(passphraseProblem('copper lamp river')).toBeNull(); });
});

describe('qa-04 two tabs on the same project', () => {
  it('qa-04 the second writer gets a conflict instead of silently overwriting', () => {
    const mem: Record<string, string> = {}; const kv = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
    const tabA = makeStore(() => kv), tabB = makeStore(() => kv);
    const p = blankProject(); expect(tabA.save(p)).toBe('ok');
    const a = tabA.open(p.id), b = tabB.open(p.id);
    b.site.address = 'TAB B'; expect(tabB.save(b)).toBe('ok');
    a.site.apn = 'TAB A'; expect(tabA.save(a)).toBe('conflict');
    expect(tabA.open(p.id).site.address).toBe('TAB B'); // B's edit kept
    expect(tabA.save({ ...a, site: { ...a.site, address: 'TAB A keeps' } }, { force: true })).toBe('ok');
  });
});

describe('COR-03 geometry uses edges, not only vertices', () => {
  it('COR-03 a lot corner near the middle of an ADU wall is measured', () => {
    // Pentagon lot whose extra vertex sits 1 ft behind the ADU rear wall.
    const lot = [{ x: 0, y: 0 }, { x: ft(50), y: 0 }, { x: ft(50), y: ft(130) }, { x: ft(25), y: ft(121) }, { x: 0, y: ft(130) }];
    const fp = rect(ft(15), ft(100), ft(20), ft(20));
    expect(Math.min(...lot.map((_, i) => clearanceToEdge(fp, lot, i)))).toBeLessThan(ft(1.01));
  });
  it('COR-03 a lot edge that cuts through the ADU is not "inside"', () => {
    const lot = [{ x: 0, y: 0 }, { x: ft(50), y: 0 }, { x: ft(50), y: ft(130) }, { x: ft(25), y: ft(110) }, { x: 0, y: ft(130) }];
    expect(polyInside(rect(ft(15), ft(100), ft(20), ft(25)), lot)).toBe(false);
  });
});

describe('COR-01 fire separation counts the house (assumed property line)', () => {
  it('COR-01 garage 2 ft from the house fails unless rated and without openings', () => {
    const p = good(); p.site.primary = rect(ft(20), ft(73), ft(20), ft(25)); // house rear wall at 98 ft, ADU front at 100 ft
    expect(gap(p.adu.footprint, p.site.primary)).toBeCloseTo(ft(2));
    expect(st(p, 'FIR-01')!.status).toBe('FAIL'); expect(st(p, 'FIR-01')!.msg.en).toContain('assumed line');
    p.adu.openingsNearLine = 'yes'; expect(st(p, 'FIR-02')!.status).toBe('FAIL');
    expect(ready(p)).toBe('FIX_ISSUES');
    p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; expect(st(p, 'FIR-01')!.status).toBe('PASS'); expect(st(p, 'FIR-02')!.status).toBe('PASS');
  });
  it('COR-01 an attached garage converted inside the house is not measured to the house', () => {
    const p = good(); p.adu.garageAttachment = 'attached'; p.site.primary = rect(ft(20), ft(73), ft(20), ft(27));
    expect(st(p, 'FIR-01')!.status).toBe('PASS');
  });
});

describe('COR-02 / COR-05 escape windows per sleeping room', () => {
  const w = (room: string, wIn: number, hIn: number) => ({ id: room + wIn, room, sleeping: true, clearWidthMm: inch(wIn), clearHeightMm: inch(hIn), sillMm: inch(40), gradeFloor: true });
  it('COR-02 two bedrooms but both windows in one room is not a PASS', () => {
    const p = good(); p.adu.bedrooms = 2; p.adu.windows = [w('Bedroom', 24, 36), w('Bedroom', 24, 36)];
    expect(st(p, 'EGR-01')!.status).toBe('UNKNOWN'); expect(ready(p)).not.toBe('READY_FOR_PREPARER');
    p.adu.windows = [w('Bedroom 1', 24, 36), w('Bedroom 2', 24, 36)]; expect(st(p, 'EGR-01')!.status).toBe('PASS');
  });
  it('COR-02 an extra small window in a room with a good one does not fail', () => {
    const p = good(); p.adu.windows = [w('Bedroom', 24, 36), w('Bedroom', 12, 12)]; expect(st(p, 'EGR-01')!.status).toBe('PASS');
    p.adu.windows = [w('Bedroom', 12, 12)]; expect(st(p, 'EGR-01')!.status).toBe('FAIL');
  });
  it('COR-05 a studio with no windows is checked, not hidden', () => {
    const p = good(); p.adu.bedrooms = 0; p.adu.windows = [];
    expect(st(p, 'EGR-01')!.status).toBe('UNKNOWN'); expect(ready(p)).not.toBe('READY_FOR_PREPARER');
    p.adu.windows = [w('Main room', 24, 36)]; expect(st(p, 'EGR-01')!.status).toBe('PASS');
    p.adu.windows = []; p.adu.mainRoomSleeping = 'no'; expect(st(p, 'EGR-01')!.status).toBe('UNKNOWN'); expect(ready(p)).not.toBe('READY_FOR_PREPARER'); // R2-COR-04: was INFO
  });
  it('COR-13 NaN or negative window sizes are never a PASS', () => {
    const p = good(); p.adu.windows = [{ ...w('Bedroom', 24, 36), clearWidthMm: NaN }]; expect(st(p, 'EGR-01')!.status).not.toBe('PASS');
    p.adu.windows = [{ ...w('Bedroom', 24, 36), sillMm: -inch(100) }]; expect(st(p, 'EGR-01')!.status).not.toBe('PASS');
    const q = good(); q.adu.ceilingHeightMm = NaN; expect(st(q, 'CEI-01')!.msg.en).not.toContain('NaN'); expect(st(q, 'CEI-01')!.status).toBe('UNKNOWN');
    q.adu.hosePullFt = NaN; expect(st(q, 'ACC-01')!.status).toBe('UNKNOWN');
  });
});

describe('COR-04 safety FAILs cannot be dismissed into READY', () => {
  it('COR-04 low ceiling + dismissed stays FIX_ISSUES', () => {
    const p = good(); expect(ready(p)).toBe('READY_FOR_PREPARER');
    p.adu.ceilingHeightMm = inch(78); p.dismissed.push({ ruleId: 'CEI-01', reason: 'it is fine', at: '', ruleVersion: '1' });
    expect(st(p, 'CEI-01')!.dismissed).toBeUndefined(); expect(ready(p)).toBe('FIX_ISSUES');
  });
});

describe('COR-06 / COR-07 / COR-08 / COR-09 / COR-10 / COR-15', () => {
  it('COR-06 the entry addition gets its own setback check and counts for fire', () => {
    const p = good(); p.adu.addedAreaSqFt = 120; p.adu.addedForIngressOnly = 'yes';
    expect(st(p, 'ADD-01')!.status).toBe('UNKNOWN');
    p.adu.addedSetbackMm = ft(1); expect(st(p, 'ADD-01')!.status).toBe('UNKNOWN'); expect(st(p, 'FIR-01')!.status).toBe('FAIL');
    p.adu.addedSetbackMm = ft(6); expect(st(p, 'ADD-01')!.status).toBe('PASS');
  });
  it('COR-07 an unpermitted garage is not treated as an AB 2533 unit', () => {
    const p = good(); p.adu.existingStructurePermitted = 'no'; p.adu.builtBefore2020 = 'yes';
    expect(st(p, 'SET-01')!.status).toBe('UNKNOWN');
    p.adu.usedAsHomeBefore2020 = 'yes'; expect(st(p, 'SET-01')!.status).toBe('INFO');
    p.adu.legalization = true; p.adu.usedAsHomeBefore2020 = 'no'; expect(st(p, 'LEG-01')!.status).toBe('FAIL');
  });
  it('COR-08 duplex lots are not supported; a lot with an ADU already fails the unit mix', () => {
    const p = good(); p.site.mainBuilding = 'duplex'; expect(ready(p)).toBe('NOT_SUPPORTED');
    p.site.mainBuilding = 'sfd'; p.site.existingAdus = 1; expect(st(p, 'MIX-01')!.status).toBe('FAIL');
    p.site.existingAdus = 0; p.site.existingJadus = 1; expect(st(p, 'MIX-01')!.status).toBe('PASS');
    p.site.mainBuilding = 'unknown'; expect(st(p, 'MIX-01')!.status).toBe('UNKNOWN');
  });
  it('COR-09 hillside + very high fire is a note for a conversion', () => {
    const p = good(); p.site.flags.hillside = 'yes'; p.site.flags.vhfhsz = 'yes'; p.site.flags.slopeOver10 = 'no';
    expect(st(p, 'HAZ-01')!.status).toBe('INFO');
  });
  it('COR-10 conversion: connection fee is $0, not "still applies"', () => {
    const p = good(); expect(feeEstimate(p).outcome.msg.en).toContain('Connection or capacity fee: $0'); expect(feeEstimate(p).outcome.msg.en).not.toContain('connection fees still apply');
    p.adu.mode = 'youadu'; expect(feeEstimate(p).outcome.msg.en).toContain('Connection fees may apply');
  });
  it('COR-15 an eave too close to the line fails even with a rated wall', () => {
    const p = good(); p.adu.footprint = rect(ft(3), ft(100), ft(20), ft(20)); p.adu.ratedWallPlanned = 'yes'; p.adu.eaveDepthMm = inch(18);
    expect(st(p, 'FIR-01')!.status).toBe('FAIL');
    p.adu.eaveDepthMm = null; expect(st(p, 'FIR-01')!.status).toBe('UNKNOWN');
    p.adu.eaveDepthMm = 0; expect(st(p, 'FIR-01')!.status).toBe('PASS');
  });
});

describe('COR-16 / COR-17 / COR-18 / COR-11 / OUT-01 citations', () => {
  it('COR-16 height rule names high-quality transit corridors', () => { const r = RULES.find(x => x.id === 'HGT-01')!; expect(r.cites[0].code).toContain('high-quality transit corridor'); });
  it('COR-17 sprinkler FAIL cites sheet III-E.4', () => { const p = good(); p.site.flags.primarySprinklered = 'yes'; p.adu.sprinklered = 'no'; expect(st(p, 'SPK-01')!.msg.en).toContain('III-E.4'); expect(RULES.find(x => x.id === 'SPK-01')!.cites.some(c => c.code.includes('III-E.4'))).toBe(true); });
  it('COR-18 permit life of 2 years is listed', () => { expect(st(good(), 'CLK-01')!.msg.en).toContain('2 years'); });
  it('COR-11 every LARC/LABC cite carries an edition from the pack', () => {
    RULES.flatMap(r => r.cites).filter(c => /\b(LARC|LABC)\b/.test(c.code)).forEach(c => expect(c.edition, c.code).toContain(PACK.sheet.codes.split(' ')[0]));
  });
  it('OUT-01 one code cycle: the sheet catalog reads the pack, and PACK_ID is the only id', () => {
    expect(SHEET.codes).toBe(PACK.sheet.codes); expect(PACK_ID).toBe(`la-city@${PACK.version}`); expect(blankProject().rulePack).toBe(PACK_ID);
  });
  it('OUT-02 the pack warns when it is past its review date or a new year', () => {
    expect(packFreshness(new Date('2026-10-24T12:00:00')).stale).toBe(false);
    expect(packFreshness(new Date('2027-01-02T12:00:00')).stale).toBe(true);
  });
});

describe('appsec-02 citation guard checks code sections too', () => {
  it('appsec-02 invented statute sections are not ok', () => {
    const r = checkCitations('Per LAMC 12.22 A.99(z) and Gov. Code 99999 this plan passes and needs no permit.', RULES);
    expect(r.ok).toBe(false); expect(r.unknown_codes).toEqual(expect.arrayContaining(['LAMC 12.22 A.99(Z)', 'GOV 99999']));
  });
  it('appsec-02 real cites pass, and COVID-19 is not a rule id', () => {
    expect(checkCitations('See EGR-01, LARC R310.2 and Gov. Code §66314(d)(7).', RULES).ok).toBe(true);
    expect(validateCitations('During COVID-19 and AB-2533', RULES)).toEqual([]);
  });
});

import { ES } from '../ui/es';
import { MODULES } from '../core/model';
import { CITES_ES } from '../rules/cites-es';
import { exportBlockers } from '../rules/engine';
describe('parity-08 Spanish mode covers groups, blockers and citations', () => {
  it('parity-08 every check group label, export blocker and citation has Spanish', () => {
    MODULES.forEach(m => expect(ES as Record<string, string>, m.label).toHaveProperty([m.label]));
    const p = demoProject(); p.site.jurisdiction = 'other'; p.modules.fire = false; p.modules.egress = false; p.modules.structural = false; p.adu.removesGarageDoorWall = 'yes'; p.people.preparerRole = 'owner';
    exportBlockers(p, evaluate(p, RULES, PACK_ID)).forEach(b => expect(ES as Record<string, string>, b).toHaveProperty([b]));
    RULES.flatMap(r => r.cites).forEach(c => expect(CITES_ES, c.code).toHaveProperty([c.code]));
    ['Use a passphrase of 8 or more characters.', 'That passphrase is too easy to guess. Use 3 or 4 unrelated words.'].forEach(k => expect(ES as Record<string, string>).toHaveProperty([k]));
  });
});

import { History } from '../core/undo';
import { lengthTooLarge } from '../core/units';
describe('qa-25 / parity-07 / qa-22 input handling', () => {
  it('qa-25 typing in one field is one undo step', () => {
    const h = new History(0); h.push(1, 'addr', 1000); h.push(2, 'addr', 1500); h.push(3, 'addr', 2000); expect(h.undo()).toBe(true); expect(h.present).toBe(0);
    h.push(5, undefined, 9000); h.push(6, 'addr', 9100); h.push(7, 'apn', 9200); h.undo(); expect(h.present).toBe(6);
  });
  it('parity-07 a huge size is recognized as too large (not a format error)', () => { expect(lengthTooLarge("99999'")).toBe(true); expect(lengthTooLarge("50'")).toBe(false); expect(lengthTooLarge('abc')).toBe(false); });
  it('qa-22 bedrooms must be a small whole number', () => { const p = good(); p.adu.bedrooms = 2.5; expect(st(p, 'GEO-01')!.status).not.toBe('PASS'); p.adu.bedrooms = 100000; expect(st(p, 'GEO-01')!.status).not.toBe('PASS'); });
});
