import { defineWarp } from '../core/warp.js';
import { clamp, type StrokePoint } from './stroke.js';

/** JSON-compatible displacement grid. Values are source offsets, interleaved x/y. */
export interface LiquifyGrid {
  /** Work-space width in pixels. */ width: number;
  /** Work-space height in pixels. */ height: number;
  /** Number of lattice columns. */ columns: number;
  /** Number of lattice rows. */ rows: number;
  /** Interleaved source offsets, row major. */ displacement: number[];
}
/** Inverse displacement gesture. */
export type LiquifyMode = 'push' | 'twirl' | 'shrink' | 'expand' | 'reconstruct';
/** One displacement-grid gesture in work coordinates. */
export interface LiquifyDab extends StrokePoint {
  /** Affected radius in pixels. */ radius: number;
  /** Signed strength, −1 to 1. */ strength: number;
  /** Push distance along x. */ dx?: number;
  /** Push distance along y. */ dy?: number;
}
/** Create an identity lattice; the default cell size is 16 work-space pixels. */
export function createLiquifyGrid(width: number, height: number, cellSize = 16): LiquifyGrid {
  if (![width, height, cellSize].every(n => Number.isFinite(n) && n > 0)) throw new RangeError('Invalid liquify dimensions');
  const columns = Math.max(2, Math.ceil(width / cellSize) + 1), rows = Math.max(2, Math.ceil(height / cellSize) + 1);
  return { width, height, columns, rows, displacement: Array.from({ length: columns * rows * 2 }, () => 0) };
}
const component = (grid: LiquifyGrid, x: number, y: number, c: number): number => {
  const gx = clamp(x / grid.width, 0, 1) * (grid.columns - 1), gy = clamp(y / grid.height, 0, 1) * (grid.rows - 1);
  const ix = Math.min(grid.columns - 2, Math.floor(gx)), iy = Math.min(grid.rows - 2, Math.floor(gy)), u = gx - ix, v = gy - iy;
  const i = (iy * grid.columns + ix) * 2 + c;
  return grid.displacement[i]! * (1 - u) * (1 - v) + grid.displacement[i + 2]! * u * (1 - v) + grid.displacement[i + grid.columns * 2]! * (1 - u) * v + grid.displacement[i + grid.columns * 2 + 2]! * u * v;
};
/** Bilinear output-to-source map, consumed by defineWarp. */
export function mapLiquify(x: number, y: number, grid: LiquifyGrid): readonly [number, number] {
  return [x + component(grid, x, y, 0), y + component(grid, x, y, 1)];
}
/** Compose inverse mappings; repeated gestures never resample or soften picture pixels. */
export function liquifyDab(grid: LiquifyGrid, mode: LiquifyMode, dab: LiquifyDab): LiquifyGrid {
  if (![dab.x, dab.y, dab.radius, dab.strength, dab.dx ?? 0, dab.dy ?? 0].every(Number.isFinite) || dab.radius <= 0) throw new RangeError('Invalid liquify dab');
  const out = { ...grid, displacement: grid.displacement.slice() };
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.columns; col++) {
    const x = col * grid.width / (grid.columns - 1), y = row * grid.height / (grid.rows - 1), dx = x - dab.x, dy = y - dab.y;
    const distance = Math.hypot(dx, dy) / dab.radius;
    if (distance >= 1) continue;
    const weight = (1 - distance * distance) ** 2 * clamp(dab.strength, -1, 1), i = (row * grid.columns + col) * 2;
    if (mode === 'reconstruct') {
      out.displacement[i] = grid.displacement[i]! * (1 - Math.abs(weight));
      out.displacement[i + 1] = grid.displacement[i + 1]! * (1 - Math.abs(weight)); continue;
    }
    let sx = x, sy = y;
    if (mode === 'push') { sx -= (dab.dx ?? 0) * weight; sy -= (dab.dy ?? 0) * weight; }
    if (mode === 'twirl') { const a = -weight; sx = dab.x + dx * Math.cos(a) - dy * Math.sin(a); sy = dab.y + dx * Math.sin(a) + dy * Math.cos(a); }
    if (mode === 'shrink' || mode === 'expand') { const scale = Math.exp(weight * (mode === 'shrink' ? 1 : -1)); sx = dab.x + dx * scale; sy = dab.y + dy * scale; }
    out.displacement[i] = sx + component(grid, sx, sy, 0) - x;
    out.displacement[i + 1] = sy + component(grid, sx, sy, 1) - y;
  }
  return out;
}
/** Register this warp to interpret recipe.filters.liquify as a displacement grid. */
export const liquifyWarp = defineWarp<LiquifyGrid>({
  id: 'liquify', map: (x, y, grid) => mapLiquify(x, y, grid),
  reach: grid => { let max = 0; for (let i = 0; i < grid.displacement.length; i += 2) max = Math.max(max, Math.hypot(grid.displacement[i]!, grid.displacement[i + 1]!)); return max; },
});
