import type { Rect } from '../core/pyramid.js';

/** Pixel tools recognised by the opt-in retouch source stage. */
export type RetouchTool = 'brush' | 'eraser' | 'clone' | 'heal' | 'spot-heal' | 'patch' | 'blur' | 'sharpen' | 'smudge' | 'dodge' | 'burn' | 'sponge' | 'colour-replace' | 'red-eye';
/** Pointer sample in decoded source coordinates, measured from pixel edges. */
export interface StrokePoint {
  /** Source x coordinate. */ x: number;
  /** Source y coordinate. */ y: number;
  /** Normalised pressure, 0–1; absent means 1. */ pressure?: number;
}
/** Parameters serialised with each stroke. All colours here are linear. */
export interface BrushParams {
  /** Diameter in source pixels. */ size: number;
  /** Fully covered radius fraction, 0–1; default .75. */ hardness?: number;
  /** Per-dab opacity, 0–1; default 1. */ opacity?: number;
  /** Per-dab deposition, 0–1; default 1. */ flow?: number;
  /** Distance between dabs as a fraction of the diameter; default .2. */ spacing?: number;
  /** Straight (unassociated), linear RGBA; only brush deposits this alpha. */ colour?: readonly [number, number, number, number];
  /** Clone/heal/patch sample displacement: source minus destination. */ sourceOffset?: { /** Horizontal displacement. */ x: number; /** Vertical displacement. */ y: number };
  /** Effect strength, 0–1; default .5. */ strength?: number;
  /** Luminance weighting for dodge and burn; default all. */ tonalRange?: 'all' | 'shadows' | 'midtones' | 'highlights';
  /** Reduce saturation with the sponge. */ desaturate?: boolean;
  /** Straight linear RGB colour to replace. */ targetColour?: readonly [number, number, number];
  /** Linear RGB matching distance; default .3. */ tolerance?: number;
  /** Source-coordinate polygon; patch only changes pixels inside it. */ selection?: readonly StrokePoint[];
  /** Spot-healing search distance in source pixels; default three diameters. */ searchRadius?: number;
}
/** An immutable, deterministic, JSON-compatible pixel stroke. */
export interface Stroke {
  /** Stable recipe identity. */ id: string;
  /** Pixel kernel to replay. */ tool: RetouchTool;
  /** Frozen kernel settings. */ params: BrushParams;
  /** Source-coordinate path. */ points: readonly StrokePoint[];
  /** Optional layer target, with points in that layer's pixels; base stages ignore these. */ layer?: string;
  /** Paint the target layer's mask (coverage in alpha) rather than its pixels. */ mask?: boolean;
}
/** One evenly spaced, pressure-interpolated brush application. */
export interface Dab extends StrokePoint {
  /** Interpolated pressure. */ pressure: number;
  /** Horizontal distance from the previous dab. */ dx: number;
  /** Vertical distance from the previous dab. */ dy: number;
}
/** Clamp a scalar to a closed interval. */
export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/** Arc-length spacing, independent of event segmentation; no random state or clock. */
export function* strokeDabs(stroke: Stroke): Generator<Dab> {
  const { points, params } = stroke;
  if (!Number.isFinite(params.size) || params.size <= 0) throw new RangeError('Brush size must be positive');
  for (const p of points) if (![p.x, p.y, p.pressure ?? 1].every(Number.isFinite)) throw new RangeError('Non-finite stroke point');
  if (!points.length) return;
  const step = Math.max(.25, params.size * clamp(params.spacing ?? .2, .01, 1));
  const first = points[0]!;
  let lastX = first.x, lastY = first.y, remaining = step;
  yield { ...first, pressure: clamp(first.pressure ?? 1), dx: 0, dy: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let distance = remaining;
    while (distance <= length) {
      const t = distance / length, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      yield { x, y, pressure: clamp((a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t), dx: x - lastX, dy: y - lastY };
      lastX = x; lastY = y; distance += step;
    }
    remaining = distance - length;
  }
}
/** Conservative source-pixel rectangle covering a dab's nominal diameter. */
export function dabRect(dab: StrokePoint, size: number): Rect {
  const x = Math.floor(dab.x - size / 2), y = Math.floor(dab.y - size / 2);
  return { x, y, width: Math.ceil(dab.x + size / 2) - x, height: Math.ceil(dab.y + size / 2) - y };
}
