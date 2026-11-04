import { clampCrop, geometryMapping, homography, rectQuad, turnedSize, workSize, type Geometry, type Mapping, type Point, type Quad, type Rect, type Size } from '../core/index.js';
import type { EditRecipe } from '../session/index.js';
import { validQuad } from './transform-math.js';

/** A line drawn along an edge that should be vertical or horizontal, kept in source pixels so it stays on its feature. */
export interface PerspectiveGuide {
  a: Point;
  b: Point;
  axis: 'vertical' | 'horizontal';
}

/**
 * Perspective correction as plain data. It is kept in `recipe.filters.perspective` so undo, project
 * files and reopening restore the sliders and guides; what renders is `geometry.distort`, written from it.
 */
export interface PerspectiveSettings {
  /** Keystone of converging verticals, -100 to 100. Negative widens the top. */
  vertical: number;
  /** Keystone of converging horizontals, -100 to 100. Negative widens the left side. */
  horizontal: number;
  /** In-plane turn in degrees, clockwise positive, applied with the keystones. */
  rotate: number;
  /** Stretch, -100 to 100. Positive widens, negative heightens. */
  aspect: number;
  /** Zoom into the corrected picture, in percent from 100 to 200. The output size stays the same. */
  scale: number;
  /** Two to four guides solve vertical, horizontal and rotate together. */
  guides: readonly PerspectiveGuide[];
  /** Distortion already in place when perspective began, in turned pixels. Perspective applies on top of it. */
  base: Quad | null;
  /** The crop Scale wrote, so a crop the user drew is told apart and left alone. */
  frame: Rect | null;
}

/** Key in `recipe.filters` holding the perspective settings. No filter is registered under it. */
export const PERSPECTIVE = 'perspective';
/** At most this many guides. */
export const MAX_GUIDES = 4;
export const NEUTRAL_PERSPECTIVE: PerspectiveSettings = { vertical: 0, horizontal: 0, rotate: 0, aspect: 0, scale: 100, guides: [], base: null, frame: null };
/** Slider limits, shared by the panel and the guide solver. */
export const LIMITS = { tilt: 100, rotate: 20, aspect: 100, scale: [100, 200] as const };
/** Degrees of camera tilt per slider unit: ±100 is ±40°. */
const TILT = 0.4;
const RAD = Math.PI / 180;

const isPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v));
const isQuad = (q: unknown): q is Quad => Array.isArray(q) && q.length === 4 && q.every(isPoint);
const isRect = (r: unknown): r is Rect => !!r && typeof r === 'object' && (['x', 'y', 'width', 'height'] as const).every(k => Number.isFinite((r as Rect)[k]));
const finite = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Read stored settings, dropping anything malformed. Returns null when there are none. */
export function readSettings(value: unknown): PerspectiveSettings | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<PerspectiveSettings>;
  const guides = Array.isArray(v.guides) ? v.guides.filter((g): g is PerspectiveGuide => !!g && isPoint(g.a) && isPoint(g.b) && (g.axis === 'vertical' || g.axis === 'horizontal')).slice(0, MAX_GUIDES) : [];
  return {
    vertical: clamp(finite(v.vertical, 0), -LIMITS.tilt, LIMITS.tilt),
    horizontal: clamp(finite(v.horizontal, 0), -LIMITS.tilt, LIMITS.tilt),
    rotate: clamp(finite(v.rotate, 0), -LIMITS.rotate, LIMITS.rotate),
    aspect: clamp(finite(v.aspect, 0), -LIMITS.aspect, LIMITS.aspect),
    scale: clamp(finite(v.scale, 100), LIMITS.scale[0], LIMITS.scale[1]),
    guides, base: isQuad(v.base) ? v.base : null, frame: isRect(v.frame) ? v.frame : null,
  };
}

/** True when the settings change nothing beyond their base. */
export const isNeutral = (s: PerspectiveSettings) => !s.vertical && !s.horizontal && !s.rotate && !s.aspect && s.scale === 100;

function bounds(quad: Quad) {
  const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The correction as a point mapping in turned pixels, applied after the base distortion: a camera
 * turned about its three axes, with the focal length of a normal lens (the frame's diagonal). The
 * frame's centre stays put at unit scale, so detail there keeps its resolution. Aspect and scale follow.
 */
export function perspectiveMapping(frame: Rect, s: Pick<PerspectiveSettings, 'vertical' | 'horizontal' | 'rotate' | 'aspect' | 'scale'>): Mapping {
  const cx = frame.x + frame.width / 2, cy = frame.y + frame.height / 2, f = Math.hypot(frame.width, frame.height);
  const tx = -s.vertical * TILT * RAD, ty = s.horizontal * TILT * RAD, tz = s.rotate * RAD;
  const [cxs, sx] = [Math.cos(tx), Math.sin(tx)], [cys, sy] = [Math.cos(ty), Math.sin(ty)], [czs, sz] = [Math.cos(tz), Math.sin(tz)];
  // R = Rz · Ry · Rx, in image axes: x right, y down, z into the scene.
  const rx = [[1, 0, 0], [0, cxs, -sx], [0, sx, cxs]], ry = [[cys, 0, sy], [0, 1, 0], [-sy, 0, cys]], rz = [[czs, -sz, 0], [sz, czs, 0], [0, 0, 1]];
  const mul = (a: number[][], b: number[][]) => a.map(row => b[0]!.map((_, j) => row.reduce((n, v, k) => n + v * b[k]![j]!, 0)));
  const r = mul(rz, mul(ry, rx));
  const project = (x: number, y: number): Point | null => {
    const X = x - cx, Y = y - cy;
    const px = r[0]![0]! * X + r[0]![1]! * Y + r[0]![2]! * f, py = r[1]![0]! * X + r[1]![1]! * Y + r[1]![2]! * f, pz = r[2]![0]! * X + r[2]![1]! * Y + r[2]![2]! * f;
    return pz <= f * 1e-3 ? null : [f * px / pz, f * py / pz];
  };
  const o = project(cx, cy)!, ex = project(cx + 1, cy)!, ey = project(cx, cy + 1)!;
  const det = (ex[0] - o[0]) * (ey[1] - o[1]) - (ex[1] - o[1]) * (ey[0] - o[0]);
  const k = 1 / Math.sqrt(Math.abs(det)), stretch = 2 ** (s.aspect / 200), zoom = s.scale / 100;
  return (x, y) => {
    const p = project(x, y);
    return p && [cx + (p[0] - o[0]) * k * stretch * zoom, cy + (p[1] - o[1]) * k / stretch * zoom];
  };
}

/** The picture's corners in turned pixels for these settings, or null when the view would fold. */
export function perspectiveQuad(turned: Size, s: PerspectiveSettings): Quad | null {
  const base = s.base ?? rectQuad(turned), map = perspectiveMapping(bounds(base), s);
  const quad = base.map(p => map(p[0], p[1]));
  return quad.every(Boolean) && validQuad(quad as unknown as Quad) ? quad as unknown as Quad : null;
}

const near = (a: Quad, b: Quad, size: Size) => {
  const tolerance = Math.max(size.width, size.height) * 1e-7 + 1e-6;
  return a.every((p, i) => Math.abs(p[0] - b[i]![0]) <= tolerance && Math.abs(p[1] - b[i]![1]) <= tolerance);
};

/**
 * The perspective settings that describe this recipe. Stored settings count only while they still
 * produce its distortion; once another tool changes the corners (Transform, a quarter turn, a flip),
 * perspective starts again from those corners, keeping only the guides.
 */
export function perspectiveOf(recipe: EditRecipe, source: Size): PerspectiveSettings {
  const turned = turnedSize(source, recipe.geometry.rotation), stored = readSettings(recipe.filters[PERSPECTIVE]);
  const distort = recipe.geometry.distort ?? null;
  if (stored) {
    const quad = isNeutral(stored) ? stored.base ?? rectQuad(turned) : perspectiveQuad(turned, stored);
    if (quad && near(quad, distort ?? rectQuad(turned), turned)) return stored;
  }
  return { ...NEUTRAL_PERSPECTIVE, base: distort, guides: stored?.guides ?? [] };
}

/** A crop of `size` centred in `bounds`, on whole pixels. */
const centred = (size: Size, bounds: Size): Rect => {
  const width = Math.min(bounds.width, Math.round(size.width)), height = Math.min(bounds.height, Math.round(size.height));
  return { x: Math.round((bounds.width - width) / 2), y: Math.round((bounds.height - height) / 2), width, height };
};
const sameRect = (a: Rect | null | undefined, b: Rect | null | undefined) => !a || !b ? !a && !b : a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * The recipe change that applies these settings: the distortion, and for Scale above 100% a crop that
 * keeps the output size. A crop the user drew is kept and clamped instead. Null when the settings
 * cannot be shown (the view would fold, or the picture would pass the size limit).
 */
export function perspectiveChange(recipe: EditRecipe, source: Size, settings: PerspectiveSettings): Pick<EditRecipe, 'geometry' | 'filters'> | null {
  const geometry = recipe.geometry, turned = turnedSize(source, geometry.rotation);
  const neutral = isNeutral(settings);
  const quad = neutral ? settings.base : perspectiveQuad(turned, settings);
  if (!neutral && !quad) return null;
  const filters = { ...recipe.filters };
  delete filters[PERSPECTIVE];
  const previous = readSettings(recipe.filters[PERSPECTIVE]);
  const owned = !geometry.crop || sameRect(geometry.crop, previous?.frame);
  let next: Geometry = { ...geometry, distort: quad };
  let frame: Rect | null = null;
  try {
    if (owned) {
      next = { ...next, crop: null };
      if (settings.scale > 100) {
        const unscaled = perspectiveQuad(turned, { ...settings, scale: 100 }) ?? quad;
        const whole = workSize(source, { ...geometry, distort: unscaled, crop: null }), zoomed = workSize(source, { ...next, crop: null });
        frame = centred(whole, zoomed);
        next = { ...next, crop: frame };
      }
    } else if (geometry.crop) next = { ...next, crop: clampCrop(geometry.crop, workSize(source, { ...next, crop: null })) };
    geometryMapping(source, next);
  } catch { return null; }
  const keep = !neutral || settings.guides.length > 0;
  return { geometry: next, filters: keep ? { ...filters, [PERSPECTIVE]: { ...settings, frame } } : filters };
}

/** A guide's lean from its axis on screen, in degrees, clockwise positive. */
export function guideLean(a: Point, b: Point, axis: PerspectiveGuide['axis']): number {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  if (axis === 'vertical') { if (dy < 0) { dx = -dx; dy = -dy; } return -Math.atan2(dx, dy) / RAD; }
  if (dx < 0) { dx = -dx; dy = -dy; }
  return Math.atan2(dy, dx) / RAD;
}

/**
 * Solve vertical, horizontal and rotate so every guide shows level or plumb, by damped least squares.
 * Guides are in turned pixels, before the base distortion. `angle` is the free angle applied after
 * perspective. Unconstrained values are held near zero. Aspect and scale are kept as they are.
 */
export function solveGuides(turned: Size, settings: PerspectiveSettings, guides: readonly PerspectiveGuide[], angle = 0): PerspectiveSettings {
  if (guides.length < 2) return settings;
  const base = settings.base ?? rectQuad(turned), frame = bounds(base);
  const intoBase = settings.base ? homography(rectQuad(turned), settings.base) : (x: number, y: number): Point | null => [x, y];
  const ends = guides.map(g => ({ a: intoBase(...g.a), b: intoBase(...g.b), axis: g.axis }));
  if (ends.some(e => !e.a || !e.b)) return settings;
  const c = Math.cos(angle * RAD), s = Math.sin(angle * RAD), turn = (p: Point): Point => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  const lo = [-LIMITS.tilt, -LIMITS.tilt, -LIMITS.rotate], hi = [LIMITS.tilt, LIMITS.tilt, LIMITS.rotate];
  const residuals = (p: number[]): number[] | null => {
    const map = perspectiveMapping(frame, { vertical: p[0]!, horizontal: p[1]!, rotate: p[2]!, aspect: settings.aspect, scale: 100 });
    const out: number[] = [];
    for (const e of ends) {
      const a = map(...e.a!), b = map(...e.b!);
      if (!a || !b) return null;
      out.push(guideLean(turn(a), turn(b), e.axis));
    }
    // A light pull to zero settles what the guides leave free, such as horizontal with only vertical guides.
    return [...out, p[0]! * TILT * .02, p[1]! * TILT * .02, p[2]! * .02];
  };
  const cost = (r: number[]) => r.reduce((n, v) => n + v * v, 0);
  let p = [0, 0, 0], r = residuals(p)!, damping = 1e-3;
  for (let iteration = 0; iteration < 60 && r; iteration++) {
    const jacobian = [0, 1, 2].map(j => { const q = [...p]; q[j]! += 1e-3; const rq = residuals(q); return rq ? rq.map((v, i) => (v - r[i]!) / 1e-3) : null; });
    if (jacobian.some(column => !column)) break;
    // Normal equations (JᵀJ + λ diag) δ = -Jᵀr, three unknowns.
    const a = [0, 1, 2].map(i => [0, 1, 2].map(j => jacobian[i]!.reduce((n, v, k) => n + v * jacobian[j]![k]!, 0)));
    const g = [0, 1, 2].map(i => jacobian[i]!.reduce((n, v, k) => n + v * r[k]!, 0));
    let improved = false;
    for (let attempt = 0; attempt < 8 && !improved; attempt++) {
      const m = a.map((row, i) => row.map((v, j) => v + (i === j ? damping * (a[i]![i]! || 1) : 0)));
      const step = solve3(m, g.map(v => -v));
      if (!step) { damping *= 10; continue; }
      const q = p.map((v, i) => clamp(v + step[i]!, lo[i]!, hi[i]!)), rq = residuals(q);
      if (rq && cost(rq) < cost(r)) { const moved = Math.max(...q.map((v, i) => Math.abs(v - p[i]!))); p = q; r = rq; damping = Math.max(1e-7, damping / 10); improved = true; if (moved < 1e-6) iteration = 60; }
      else damping *= 10;
    }
    if (!improved) break;
  }
  // Tenths, as the sliders show them; never a negative zero.
  const round = (v: number) => Math.round(v * 10) / 10 || 0;
  return { ...settings, vertical: round(p[0]!), horizontal: round(p[1]!), rotate: round(p[2]!) };
}

function solve3(m: number[][], b: number[]): number[] | null {
  const a = m.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let j = i + 1; j < 3; j++) if (Math.abs(a[j]![i]!) > Math.abs(a[pivot]![i]!)) pivot = j;
    [a[i], a[pivot]] = [a[pivot]!, a[i]!];
    const d = a[i]![i]!;
    if (Math.abs(d) < 1e-14) return null;
    for (let k = i; k < 4; k++) a[i]![k]! /= d;
    for (let j = 0; j < 3; j++) if (j !== i) { const f = a[j]![i]!; for (let k = i; k < 4; k++) a[j]![k]! -= f * a[i]![k]!; }
  }
  return a.map(row => row[3]!);
}

/** Where guides drawn in source pixels sit in turned pixels, before any distortion. */
export function guidesInTurned(source: Size, geometry: Geometry, guides: readonly PerspectiveGuide[]): PerspectiveGuide[] {
  const turn = geometryMapping(source, { rotation: geometry.rotation, flipX: geometry.flipX, flipY: geometry.flipY, crop: null });
  return guides.flatMap(g => { const a = turn.fromSource(...g.a), b = turn.fromSource(...g.b); return a && b ? [{ a, b, axis: g.axis }] : []; });
}
