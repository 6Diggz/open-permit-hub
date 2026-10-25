import type { Poly } from '../core/geom';
import { rect, bbox } from '../core/geom';

export interface ScanResult { footprint: Poly; heightMm: number; source: string; walls: number; note: string }

/** Apple RoomPlan CapturedRoom JSON (exported by scan apps). Walls: dimensions [w,h,d] m, transform 4x4 column-major. */
export function fromRoomPlanJSON(text: string): ScanResult {
  const j = JSON.parse(text); const walls = j.walls ?? j.CapturedRoom?.walls;
  if (!Array.isArray(walls) || !walls.length) throw new Error('No walls found. Export the room as RoomPlan JSON, or use GLTF.');
  const pts: { x: number; y: number }[] = []; let h = 0;
  for (const w of walls) {
    const d = w.dimensions, t = w.transform; if (!d || !t) continue;
    const m = t.flat ? t.flat(2) : t; const half = d[0] / 2;
    const cx = m[12], cz = m[14], ax = m[0], az = m[2];
    pts.push({ x: (cx - ax * half) * 1000, y: (cz - az * half) * 1000 }, { x: (cx + ax * half) * 1000, y: (cz + az * half) * 1000 });
    h = Math.max(h, d[1] * 1000);
  }
  const b = bbox(pts);
  return { footprint: rect(0, 0, b.maxX - b.minX, b.maxY - b.minY), heightMm: h, source: 'RoomPlan JSON', walls: walls.length, note: 'Outer box of the scanned walls. Check one length with a tape.' };
}

/** GLTF/GLB (Polycam free tier exports GLTF). Uses the model's bounding box in plan. */
export async function fromGLTF(buf: ArrayBuffer): Promise<ScanResult> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { Box3 } = await import('three');
  const gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  const box = new Box3().setFromObject(gltf.scene);
  const w = (box.max.x - box.min.x) * 1000, d = (box.max.z - box.min.z) * 1000, h = (box.max.y - box.min.y) * 1000;
  if (!(w > 500 && d > 500)) throw new Error('This model looks too small to be a room. Check the scan units.');
  return { footprint: rect(0, 0, w, d), heightMm: h, source: 'GLTF scan', walls: 0, note: 'Outer box of the scan. Clutter can make it bigger. Check one length with a tape.' };
}

/** Scale a scan to one tape-measured length. Returns factor and whether drift > 1% (UU stages fix). */
export function tapeCheck(scannedMm: number, tapedMm: number) {
  const f = tapedMm / scannedMm; return { factor: f, driftPct: Math.abs(1 - f) * 100, rescan: Math.abs(1 - f) > 0.05, warn: Math.abs(1 - f) > 0.01 };
}
