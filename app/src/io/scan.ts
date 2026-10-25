import type { Poly } from '../core/geom';
import { rect, bbox } from '../core/geom';

export interface ScanResult { footprint: Poly; heightMm: number; source: string; walls: number; note: string }

/** Same limits as the typed fields: plan sides 6-200 ft, room height 5-30 ft. Bigger files are refused before reading. */
export const SCAN_LIMITS = { sideMm: [6 * 304.8, 200 * 304.8], heightMm: [5 * 304.8, 30 * 304.8], bytes: 50 * 1024 * 1024 } as const;
/** Every scan goes through this before it touches the project. Throws a plain message for anything out of range. */
export function checkScan(r: ScanResult): ScanResult {
  const b = bbox(r.footprint), w = b.maxX - b.minX, d = b.maxY - b.minY;
  const okSide = (v: number) => Number.isFinite(v) && v >= SCAN_LIMITS.sideMm[0] && v <= SCAN_LIMITS.sideMm[1];
  if (!r.footprint.every(q => Number.isFinite(q.x) && Number.isFinite(q.y)) || !okSide(w) || !okSide(d)) throw new Error('This scan has sizes that cannot be a garage (each side must be 6 to 200 ft). Check the scan units, or type the sizes instead.');
  const h = Number.isFinite(r.heightMm) && r.heightMm >= SCAN_LIMITS.heightMm[0] && r.heightMm <= SCAN_LIMITS.heightMm[1] ? r.heightMm : 0;
  return { ...r, heightMm: h, note: h || !r.heightMm ? r.note : `${r.note} The scanned height looked wrong, so it was not used.` };
}

/** Apple RoomPlan CapturedRoom JSON (exported by scan apps). Walls: dimensions [w,h,d] m, transform 4x4 column-major. */
export function fromRoomPlanJSON(text: string): ScanResult {
  if (text.length > SCAN_LIMITS.bytes) throw new Error('This scan file is too large.');
  let j: any; try { j = JSON.parse(text); } catch { throw new Error('This file is not RoomPlan JSON.'); } const walls = j.walls ?? j.CapturedRoom?.walls;
  if (!Array.isArray(walls) || !walls.length) throw new Error('No walls found. Export the room as RoomPlan JSON, or use GLTF.');
  const pts: { x: number; y: number }[] = []; let h = 0;
  for (const w of walls) {
    const d = w.dimensions, t = w.transform; if (!d || !t) continue;
    if (!Array.isArray(d) || !(Number.isFinite(d[0]) && d[0] > 0 && Number.isFinite(d[1]) && d[1] > 0)) throw new Error('This scan has a wall with a broken or negative size. Scan again, or type the sizes instead.');
    const m = t.flat ? t.flat(2) : t; const half = d[0] / 2;
    const cx = m[12], cz = m[14], ax = m[0], az = m[2];
    pts.push({ x: (cx - ax * half) * 1000, y: (cz - az * half) * 1000 }, { x: (cx + ax * half) * 1000, y: (cz + az * half) * 1000 });
    h = Math.max(h, d[1] * 1000);
  }
  if (!pts.length) throw new Error('No walls found. Export the room as RoomPlan JSON, or use GLTF.');
  const b = bbox(pts);
  return checkScan({ footprint: rect(0, 0, b.maxX - b.minX, b.maxY - b.minY), heightMm: h, source: 'RoomPlan JSON', walls: walls.length, note: 'Outer box of the scanned walls. Check one length with a tape.' });
}

/** GLTF/GLB (Polycam free tier exports GLTF). Uses the model's bounding box in plan. */
export async function fromGLTF(buf: ArrayBuffer): Promise<ScanResult> {
  if (buf.byteLength > SCAN_LIMITS.bytes) throw new Error('This scan file is too large.');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { Box3 } = await import('three');
  const gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  const box = new Box3().setFromObject(gltf.scene);
  const w = (box.max.x - box.min.x) * 1000, d = (box.max.z - box.min.z) * 1000, h = (box.max.y - box.min.y) * 1000;
  if (!(w > 500 && d > 500)) throw new Error('This model looks too small to be a room. Check the scan units.');
  return checkScan({ footprint: rect(0, 0, w, d), heightMm: h, source: 'GLTF scan', walls: 0, note: 'Outer box of the scan. Clutter can make it bigger. Check one length with a tape.' });
}

/** Scale a scan to one tape-measured length. Returns factor and whether drift > 1% (UU stages fix). */
export function tapeCheck(scannedMm: number, tapedMm: number) {
  const f = tapedMm / scannedMm; return { factor: f, driftPct: Math.abs(1 - f) * 100, rescan: Math.abs(1 - f) > 0.05, warn: Math.abs(1 - f) > 0.01 };
}
