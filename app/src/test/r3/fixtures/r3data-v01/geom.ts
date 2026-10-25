// Local parcel frame (origin = lot corner), mm, float64. Never State Plane in geometry (UU008).
export type Pt = { x: number; y: number };
export type Poly = Pt[];

export const rect = (x: number, y: number, w: number, h: number): Poly => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];
export function area(p: Poly): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].y - p[j].x * p[i].y; }
  return Math.abs(a) / 2;
}
export function bbox(p: Poly) {
  const xs = p.map(q => q.x), ys = p.map(q => q.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y; const L = dx * dx + dy * dy;
  let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
export function inside(p: Pt, poly: Poly): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
/** Min distance from any vertex/edge of `inner` to the edges of `outer` (inner assumed inside). */
export function minClearance(inner: Poly, outer: Poly): number {
  let d = Infinity;
  for (const p of inner) for (let i = 0; i < outer.length; i++) d = Math.min(d, segDist(p, outer[i], outer[(i + 1) % outer.length]));
  for (const p of outer) for (let i = 0; i < inner.length; i++) d = Math.min(d, segDist(p, inner[i], inner[(i + 1) % inner.length]));
  return d;
}
/** Distance from polygon to one lot edge (index i -> i+1). */
export function clearanceToEdge(inner: Poly, outer: Poly, edge: number): number {
  const a = outer[edge], b = outer[(edge + 1) % outer.length];
  return Math.min(...inner.map(p => segDist(p, a, b)));
}
export function polyInside(inner: Poly, outer: Poly) { return inner.every(p => inside(p, outer)); }
export function overlaps(a: Poly, b: Poly): boolean {
  const A = bbox(a), B = bbox(b);
  return A.minX < B.maxX && A.maxX > B.minX && A.minY < B.maxY && A.maxY > B.minY;
}
export function gap(a: Poly, b: Poly): number { return overlaps(a, b) ? 0 : minClearance(a, b); }
export const translate = (p: Poly, dx: number, dy: number) => p.map(q => ({ x: q.x + dx, y: q.y + dy }));
