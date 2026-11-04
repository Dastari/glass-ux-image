/**
 * Content-aware fill for empty edges: multi-scale PatchMatch inpainting (Barnes et al. 2009) with
 * Wexler-style expectation–maximisation voting. It runs on straight-alpha sRGB bytes, because patch
 * distances should follow what the eye sees, and blends the result in linear light at the boundary.
 * Pure TypeScript with no DOM, so it runs in a worker or a test.
 */
import { linearToSrgb, pixelsToRgba8, srgbToLinear, type PixelBuffer } from '../core/pixels.js';
import type { Point } from '../core/warp.js';

export interface InpaintOptions {
  signal?: AbortSignal;
  /** Fraction of the work done, from 0 to 1. */
  onProgress?: (fraction: number) => void;
  /** Yield to the caller's event loop. Given, the work pauses about every `sliceMs`. */
  pause?: () => Promise<void>;
  /** Milliseconds between pauses. Default 8, the renderer's frame budget. */
  sliceMs?: number;
  /** Seed for the random search, so a fill is repeatable. */
  seed?: number;
}

const NONE = 0, VALID = 1, TARGET = 2;
interface Level { w: number; h: number; rgba: Uint8ClampedArray; known: Uint8Array }

/** Work in slices, checking cancellation and yielding when a pause is supplied. */
class Slicer {
  #start = performance.now();
  #done = 0;
  readonly options: InpaintOptions;
  readonly total: number;
  constructor(options: InpaintOptions, total: number) { this.options = options; this.total = total; }
  async tick(units = 0) {
    this.#done += units;
    if (performance.now() - this.#start < (this.options.sliceMs ?? 8)) return;
    this.options.signal?.throwIfAborted();
    this.options.onProgress?.(Math.min(.99, this.#done / Math.max(1, this.total)));
    if (this.options.pause) await this.options.pause();
    this.options.signal?.throwIfAborted();
    this.#start = performance.now();
  }
}

/** A cheap, repeatable random stream (xorshift32). */
function random(seed: number) {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Halve a level. A coarse pixel is a target when any child is, and a source only when all children are. */
function downsample(l: Level): Level {
  const w = Math.ceil(l.w / 2), h = Math.ceil(l.h / 2), rgba = new Uint8ClampedArray(w * h * 4), known = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0, target = false, all = true;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const fx = x * 2 + dx, fy = y * 2 + dy;
      if (fx >= l.w || fy >= l.h) continue;
      const i = fy * l.w + fx, k = l.known[i]!;
      if (k === TARGET) target = true;
      if (k !== VALID) { all = false; continue; }
      r += l.rgba[i * 4]!; g += l.rgba[i * 4 + 1]!; b += l.rgba[i * 4 + 2]!; n++;
    }
    const o = y * w + x;
    known[o] = target ? TARGET : all ? VALID : NONE;
    if (n) { rgba[o * 4] = r / n; rgba[o * 4 + 1] = g / n; rgba[o * 4 + 2] = b / n; }
    rgba[o * 4 + 3] = 255;
  }
  return { w, h, rgba, known };
}

/** Pixels whose whole (2r+1)² patch lies inside the picture and is known: candidate patch sources. */
function sourceCentres(l: Level, r: number): Uint8Array {
  const { w, h } = l, rows = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run = l.known[y * w + x] === VALID ? run + 1 : 0;
      if (run >= 2 * r + 1) rows[y * w + x - r] = 1;
    }
  }
  for (let x = r; x < w - r; x++) {
    let run = 0;
    for (let y = 0; y < h; y++) {
      run = rows[y * w + x] ? run + 1 : 0;
      if (run >= 2 * r + 1) out[(y - r) * w + x] = 1;
    }
  }
  return out;
}

/** Pixels within r of a target: every patch that covers a pixel to fill. Raster order. */
function activePixels(l: Level, r: number): Int32Array {
  const { w, h } = l, rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    // Two sweeps give the nearest target on either side within r.
    let last = -Infinity;
    for (let x = 0; x < w; x++) { if (l.known[y * w + x] === TARGET) last = x; if (x - last <= r) rows[y * w + x] = 1; }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (l.known[y * w + x] === TARGET) last = x; if (last - x <= r) rows[y * w + x] = 1; }
  }
  const marked = new Uint8Array(w * h);
  let count = 0;
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) { if (rows[y * w + x]) last = y; if (y - last <= r && !marked[y * w + x]) { marked[y * w + x] = 1; count++; } }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (rows[y * w + x]) last = y; if (last - y <= r && !marked[y * w + x]) { marked[y * w + x] = 1; count++; } }
  }
  const out = new Int32Array(count);
  for (let i = 0, n = 0; i < w * h; i++) if (marked[i]) out[n++] = i;
  return out;
}

/** Fill targets from their known neighbours, nearest first: a smooth start for the coarsest level. */
function onionFill(l: Level) {
  const { w, h, known, rgba } = l, set = new Uint8Array(w * h), queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (let i = 0; i < w * h; i++) if (known[i] === VALID) set[i] = 1;
  for (let i = 0; i < w * h; i++) if (known[i] === TARGET) {
    const x = i % w, y = (i / w) | 0;
    if ((x > 0 && set[i - 1]) || (x < w - 1 && set[i + 1]) || (y > 0 && set[i - w]) || (y < h - 1 && set[i + w])) { queue[tail++] = i; set[i] = 2; }
  }
  if (!tail) { for (let i = 0; i < w * h; i++) if (known[i] === TARGET) rgba.fill(128, i * 4, i * 4 + 3); return; }
  while (head < tail) {
    const i = queue[head++]!, x = i % w, y = (i / w) | 0;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (set[j] === 1) { r += rgba[j * 4]!; g += rgba[j * 4 + 1]!; b += rgba[j * 4 + 2]!; n++; }
      else if (!set[j] && known[j] === TARGET) { set[j] = 2; queue[tail++] = j; }
    }
    if (n) { rgba[i * 4] = r / n; rgba[i * 4 + 1] = g / n; rgba[i * 4 + 2] = b / n; }
    set[i] = 1;
  }
}

interface Field { active: Int32Array; slot: Int32Array; nnf: Int32Array; dist: Float32Array }

/** Mean squared colour difference over the pixels both patches know, or Infinity past `limit`. */
function distance(l: Level, r: number, p: number, q: number, limit: number): number {
  const { w, h, rgba, known } = l, x = p % w, y = (p / w) | 0, area = (2 * r + 1) ** 2, cap = limit * area;
  let sum = 0, count = 0;
  for (let dy = -r; dy <= r; dy++) {
    const py = y + dy;
    if (py < 0 || py >= h) continue;
    for (let dx = -r; dx <= r; dx++) {
      const px = x + dx;
      if (px < 0 || px >= w) continue;
      const t = py * w + px;
      if (known[t] === NONE) continue;
      const a = t * 4, b = (q + dy * w + dx) * 4;
      const dr = rgba[a]! - rgba[b]!, dg = rgba[a + 1]! - rgba[b + 1]!, db = rgba[a + 2]! - rgba[b + 2]!;
      sum += dr * dr + dg * dg + db * db; count++;
    }
    if (sum > cap) return Infinity;
  }
  return count ? sum / count : Infinity;
}

/** One PatchMatch sweep: propagate good offsets from scanned neighbours, then search at halving radii. */
async function sweep(l: Level, r: number, f: Field, centres: Uint8Array, forward: boolean, window: number, rand: () => number, slicer: Slicer) {
  const { w, h } = l, { active, slot, nnf, dist } = f, n = active.length, step = forward ? 1 : -1;
  for (let k = 0; k < n; k++) {
    if ((k & 2047) === 2047) await slicer.tick(2048);
    const i = forward ? k : n - 1 - k, p = active[i]!, x = p % w, y = (p / w) | 0;
    let best = dist[i]!, bq = nnf[i]!;
    // The scanned neighbours' offsets, shifted back by one: coherent matches spread along the scan.
    for (let side = 0; side < 2; side++) {
      const nx = side ? x : x - step, ny = side ? y - step : y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const s = slot[ny * w + nx]!;
      if (s < 0) continue;
      const m = nnf[s]!, qx = m % w + (x - nx), qy = ((m / w) | 0) + (y - ny);
      if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
      const q = qy * w + qx;
      if (q === bq || !centres[q]) continue;
      const d = distance(l, r, p, q, best);
      if (d < best) { best = d; bq = q; }
    }
    for (let radius = window; radius >= 1; radius >>= 1) {
      const bx = bq % w, by = (bq / w) | 0;
      const qx = Math.max(0, Math.min(w - 1, Math.round(bx + (rand() * 2 - 1) * radius))), qy = Math.max(0, Math.min(h - 1, Math.round(by + (rand() * 2 - 1) * radius)));
      const q = qy * w + qx;
      if (q === bq || !centres[q]) continue;
      const d = distance(l, r, p, q, best);
      if (d < best) { best = d; bq = q; }
    }
    nnf[i] = bq; dist[i] = best;
  }
}

/** Each target pixel becomes the similarity-weighted mean of what the patches covering it propose. */
async function vote(l: Level, r: number, f: Field, slicer: Slicer) {
  const { w, h, rgba, known } = l, { active, slot, nnf, dist } = f, n = active.length, acc = new Float32Array(n * 4);
  let total = 0, finite = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(dist[i]!)) { total += dist[i]!; finite++; }
  const spread = 2 * Math.max(1, finite ? total / finite : 1);
  for (let i = 0; i < n; i++) {
    if ((i & 2047) === 2047) await slicer.tick(1024);
    const d = dist[i]!;
    if (!Number.isFinite(d)) continue;
    const p = active[i]!, q = nnf[i]!, x = p % w, y = (p / w) | 0, weight = Math.exp(-d / spread) + 1e-6;
    for (let dy = -r; dy <= r; dy++) {
      const py = y + dy;
      if (py < 0 || py >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const px = x + dx;
        if (px < 0 || px >= w) continue;
        const t = py * w + px;
        if (known[t] !== TARGET) continue;
        const s = slot[t]! * 4, b = (q + dy * w + dx) * 4;
        acc[s] = acc[s]! + rgba[b]! * weight; acc[s + 1] = acc[s + 1]! + rgba[b + 1]! * weight; acc[s + 2] = acc[s + 2]! + rgba[b + 2]! * weight; acc[s + 3] = acc[s + 3]! + weight;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const p = active[i]!, s = i * 4;
    if (known[p] !== TARGET || !acc[s + 3]) continue;
    rgba[p * 4] = acc[s]! / acc[s + 3]!; rgba[p * 4 + 1] = acc[s + 1]! / acc[s + 3]!; rgba[p * 4 + 2] = acc[s + 2]! / acc[s + 3]!;
  }
}

function centreList(centres: Uint8Array) {
  let n = 0;
  for (let i = 0; i < centres.length; i++) if (centres[i]) n++;
  const list = new Int32Array(n);
  for (let i = 0, k = 0; i < centres.length; i++) if (centres[i]) list[k++] = i;
  return list;
}

/** Patch radius by level size: 7 × 7 where it is cheap, 5 × 5 on large levels. */
const radiusFor = (pixels: number) => pixels > 1_000_000 ? 2 : 3;
/** Expectation–maximisation and PatchMatch rounds by active area: coarse levels refine, fine levels polish. */
const scheduleFor = (active: number, coarsest: boolean) => coarsest ? { em: 6, pm: 3 } : active < 250_000 ? { em: 4, pm: 2 } : active < 1_500_000 ? { em: 2, pm: 2 } : { em: 1, pm: 1 };

/**
 * Fill every pixel marked in `mask` from the rest of the picture. `bytes` are straight-alpha sRGB RGBA;
 * pixels with full alpha outside the mask are the sources. Marked pixels that are partly covered keep
 * their own colour in front of the fill, mixed in linear light, and all marked pixels end opaque.
 * Returns `bytes`, changed in place.
 */
export async function inpaint(bytes: Uint8ClampedArray, width: number, height: number, mask: Uint8Array, options: InpaintOptions = {}): Promise<Uint8ClampedArray> {
  if (bytes.length !== width * height * 4 || mask.length !== width * height) throw new RangeError('Pixels and mask must match the size');
  const known = new Uint8Array(width * height);
  let count = 0;
  for (let i = 0; i < width * height; i++) {
    if (mask[i]) { known[i] = TARGET; count++; }
    else if (bytes[i * 4 + 3] === 255) known[i] = VALID;
  }
  if (!count) return bytes;
  const targets = new Int32Array(count);
  for (let i = 0, k = 0; i < width * height; i++) if (mask[i]) targets[k++] = i;
  // Keep what partly covered pixels showed, to lay back over the fill at the end.
  const kept = new Uint8ClampedArray(targets.length * 4);
  targets.forEach((t, k) => kept.set(bytes.subarray(t * 4, t * 4 + 4), k * 4));

  const levels: Level[] = [{ w: width, h: height, rgba: bytes, known }];
  while (true) {
    const top = levels[levels.length - 1]!;
    if (Math.max(top.w, top.h) <= 128 || Math.min(top.w, top.h) < 24) break;
    const next = downsample(top);
    if (!centreList(sourceCentres(next, 3)).length) break;
    levels.push(next);
  }
  const plans = levels.map((l, i) => { const r = radiusFor(l.w * l.h), active = activePixels(l, r); return { r, active, ...scheduleFor(active.length, i === levels.length - 1) }; });
  const total = plans.reduce((n, p) => n + p.active.length * (p.em * (p.pm + 1) + 1), 0);
  const slicer = new Slicer(options, total), rand = random(options.seed ?? 1);

  let previous: { level: Level; field: Field } | null = null;
  for (let index = levels.length - 1; index >= 0; index--) {
    const l = levels[index]!, { r, active, em, pm } = plans[index]!, { w, h } = l;
    const centres = sourceCentres(l, r), list = centreList(centres);
    if (!list.length) { onionFill(l); previous = null; continue; }
    const slot = new Int32Array(w * h).fill(-1);
    active.forEach((p, i) => { slot[p] = i; });
    const field: Field = { active, slot, nnf: new Int32Array(active.length), dist: new Float32Array(active.length) };
    if (!previous) onionFill(l);
    else {
      // Start from the coarser answer: its colours for the targets and its offsets, doubled.
      const c = previous.level, cf = previous.field;
      for (let i = 0; i < w * h; i++) if (l.known[i] === TARGET) {
        const j = (((i / w) | 0) >> 1) * c.w + ((i % w) >> 1);
        l.rgba[i * 4] = c.rgba[j * 4]!; l.rgba[i * 4 + 1] = c.rgba[j * 4 + 1]!; l.rgba[i * 4 + 2] = c.rgba[j * 4 + 2]!;
      }
      for (let i = 0; i < active.length; i++) {
        const p = active[i]!, x = p % w, y = (p / w) | 0, s = cf.slot[(y >> 1) * c.w + (x >> 1)]!;
        let q = -1;
        if (s >= 0) {
          const m = cf.nnf[s]!, qx = (m % c.w) * 2 + (x & 1), qy = ((m / c.w) | 0) * 2 + (y & 1);
          if (qx < w && qy < h && centres[qy * w + qx]) q = qy * w + qx;
        }
        field.nnf[i] = q >= 0 ? q : list[Math.floor(rand() * list.length)]!;
      }
    }
    if (!previous) for (let i = 0; i < active.length; i++) field.nnf[i] = list[Math.floor(rand() * list.length)]!;
    for (let i = 0; i < active.length; i++) {
      field.dist[i] = distance(l, r, active[i]!, field.nnf[i]!, Infinity);
      if ((i & 4095) === 4095) await slicer.tick(0);
    }
    // Coarse levels may search the whole picture; finer ones refine an answer that is already close.
    const window = previous ? Math.min(Math.max(w, h), 32) : Math.max(w, h);
    if (previous) await vote(l, r, field, slicer);
    for (let e = 0; e < em; e++) {
      for (let k = 0; k < pm; k++) await sweep(l, r, field, centres, (e * pm + k) % 2 === 0, window, rand, slicer);
      await vote(l, r, field, slicer);
    }
    previous = { level: l, field };
  }

  // Lay what partly covered pixels showed back over the fill, in linear light, and make every target opaque.
  targets.forEach((t, k) => {
    const a = kept[k * 4 + 3]! / 255, o = t * 4;
    for (let c = 0; c < 3; c++) bytes[o + c] = linearToSrgb(srgbToLinear(kept[k * 4 + c]! / 255) * a + srgbToLinear(bytes[o + c]! / 255) * (1 - a)) * 255;
    bytes[o + 3] = 255;
  });
  options.onProgress?.(1);
  return bytes;
}

/**
 * Mark the empty edges of a composed picture: pixels outside the picture's footprint (a convex polygon
 * in output pixels), and partly covered pixels at its border. Pixels the picture itself left transparent
 * stay as they are. Without a footprint, every pixel that is not fully opaque is marked.
 */
export function edgeMask(bytes: Uint8ClampedArray, width: number, height: number, footprint: readonly Point[] | null): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (!footprint) { for (let i = 0; i < width * height; i++) if (bytes[i * 4 + 3]! < 255) mask[i] = 1; return mask; }
  // Scanline spans of the convex footprint at each row's centre.
  const outside = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const cy = y + .5;
    let lo = Infinity, hi = -Infinity;
    footprint.forEach((a, i) => {
      const b = footprint[(i + 1) % footprint.length]!;
      if ((a[1] <= cy && b[1] >= cy) || (b[1] <= cy && a[1] >= cy)) {
        const x = a[1] === b[1] ? null : a[0] + (cy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
        for (const v of x === null ? [a[0], b[0]] : [x]) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
    });
    for (let x = 0; x < width; x++) if (!(x + .5 >= lo && x + .5 <= hi)) outside[y * width + x] = 1;
  }
  // Within two pixels of the outside, anything not fully opaque belongs to the edge too.
  const band = 2, near = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    let last = -Infinity;
    for (let x = 0; x < width; x++) { if (outside[y * width + x]) last = x; if (x - last <= band) near[y * width + x] = 1; }
    last = Infinity;
    for (let x = width - 1; x >= 0; x--) { if (outside[y * width + x]) last = x; if (last - x <= band) near[y * width + x] = 1; }
  }
  for (let x = 0; x < width; x++) {
    let last = -Infinity;
    for (let y = 0; y < height; y++) { if (outside[y * width + x]) last = y; if (y - last <= band) near[y * width + x] = 1; }
    last = Infinity;
    for (let y = height - 1; y >= 0; y--) { if (outside[y * width + x]) last = y; if (last - y <= band) near[y * width + x] = 1; }
  }
  for (let i = 0; i < width * height; i++) if (outside[i] || (near[i] && bytes[i * 4 + 3]! < 255)) mask[i] = 1;
  return mask;
}

/** What a worker or the fallback receives: the composed picture in working pixels and its footprint. */
export interface FillRequest { pixels: PixelBuffer; footprint: readonly Point[] | null; seed?: number }

/** Convert, mark and fill in one go, yielding between slices. Returns straight-alpha sRGB bytes. */
export async function fillEdgePixels({ pixels, footprint, seed }: FillRequest, options: InpaintOptions = {}): Promise<{ bytes: Uint8ClampedArray; filled: number }> {
  const { width, height, data } = pixels, bytes = new Uint8ClampedArray(width * height * 4), rows = Math.max(1, Math.floor(65536 / width));
  const slicer = new Slicer({ ...options, onProgress: undefined }, 1);
  for (let y = 0; y < height; y += rows) {
    const end = Math.min(height, y + rows);
    pixelsToRgba8({ width, height: end - y, data: data.subarray(y * width * 4, end * width * 4) }, bytes.subarray(y * width * 4, end * width * 4));
    await slicer.tick();
  }
  const mask = edgeMask(bytes, width, height, footprint);
  let filled = 0;
  for (let i = 0; i < mask.length; i++) filled += mask[i]!;
  if (filled) await inpaint(bytes, width, height, mask, { ...options, ...(seed === undefined ? {} : { seed }) });
  return { bytes, filled };
}
