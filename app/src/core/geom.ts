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
const edges = (p: Poly) => p.map((a, i) => [a, p[(i + 1) % p.length]] as const);
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y; const L = dx * dx + dy * dy;
  let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
/** True when segments ab and cd properly cross (touching at an end or overlapping collinear counts as crossing). */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}
/** Shortest distance between two segments (0 when they cross). */
export function segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}
export function inside(p: Pt, poly: Poly): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
/** Min distance between the outlines of two polygons, edge to edge (not just vertices). */
export function minClearance(a: Poly, b: Poly): number {
  let d = Infinity;
  for (const [p, q] of edges(a)) for (const [r, s] of edges(b)) d = Math.min(d, segSegDist(p, q, r, s));
  return d;
}
/** Distance from polygon `inner` to one lot edge (index i -> i+1), edge to edge. */
export function clearanceToEdge(inner: Poly, outer: Poly, edge: number): number {
  const a = outer[edge], b = outer[(edge + 1) % outer.length];
  return Math.min(...edges(inner).map(([p, q]) => segSegDist(p, q, a, b)));
}
/** Every vertex inside and no edge of `inner` crosses an edge of `outer` (catches a lot corner cutting through). */
/** True when the point lies on the polygon's outline (within tol mm). */
export const onOutline = (p: Pt, poly: Poly, tol = 1) => edges(poly).some(([a, b]) => segDist(p, a, b) <= tol);
/** Inner lies within outer. Touching the outline counts as inside (a garage built on the lot line is on the lot). */
export function polyInside(inner: Poly, outer: Poly) {
  const inOrOn = (p: Pt, poly: Poly) => onOutline(p, poly) || inside(p, poly);
  if (!inner.every(p => inOrOn(p, outer))) return false;
  // Edge midpoints catch an edge that leaves and re-enters between two boundary vertices.
  if (!edges(inner).every(([p, q]) => inOrOn({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, outer))) return false;
  for (const [p, q] of edges(inner)) for (const [r, s] of edges(outer)) if (segmentsCross(p, q, r, s)) return false;
  return !outer.some(p => inside(p, inner) && !onOutline(p, inner));
}
/** True when the two shapes share any area (edge crossing, or one inside the other). */
export function overlaps(a: Poly, b: Poly): boolean {
  for (const [p, q] of edges(a)) for (const [r, s] of edges(b)) if (segmentsCross(p, q, r, s)) return true;
  return a.some(p => inside(p, b)) || b.some(p => inside(p, a));
}
export function gap(a: Poly, b: Poly): number { return overlaps(a, b) ? 0 : minClearance(a, b); }
export const translate = (p: Poly, dx: number, dy: number) => p.map(q => ({ x: q.x + dx, y: q.y + dy }));
