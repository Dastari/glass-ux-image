import { geometryMapping, geometrySize, type Geometry, type Point, type Size } from '../core/index.js';

/** Geometry with a coloured canvas made transparent, since Fill edges replaces that colour too. */
export const openCanvas = (geometry: Geometry): Geometry => geometry.canvas ? { ...geometry, canvas: { ...geometry.canvas, fill: null } } : geometry;

/**
 * Where the picture lands in the output, as a convex polygon in output pixels: the source's corners
 * through quarter turns, flips, distortion, free angle, crop, canvas and resize. Null when a corner
 * cannot be mapped.
 */
export function footprint(source: Size, geometry: Geometry): Point[] | null {
  const map = geometryMapping(source, geometry).fromSource;
  const corners = ([[0, 0], [source.width, 0], [source.width, source.height], [0, source.height]] as const).map(([x, y]) => map(x, y));
  return corners.every(Boolean) ? corners as Point[] : null;
}

/** Whether a point lies inside a convex polygon, with a little slack along its edges. */
function inside(polygon: readonly Point[], p: Point, slack: number) {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const side = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / length;
    if (Math.abs(side) <= slack) continue;
    if (sign && Math.sign(side) !== sign) return false;
    sign = Math.sign(side);
  }
  return true;
}

/**
 * Whether the geometry leaves part of the output without picture: the corners a free angle or a
 * perspective uncovers, or canvas added around it. Warps are not measured; pass `warped` to say one
 * is active, and the answer is yes.
 */
export function hasEmptyEdges(source: Size, geometry: Geometry, warped = false): boolean {
  if (warped) return true;
  const open = openCanvas(geometry);
  if (!open.angle && !open.distort && !open.canvas) return false;
  try {
    const polygon = footprint(source, open), size = geometrySize(source, open);
    if (!polygon) return true;
    return !([[0, 0], [size.width, 0], [size.width, size.height], [0, size.height]] as const).every(p => inside(polygon, p, .5));
  } catch { return false; }
}
