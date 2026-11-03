import { createPixels, type PixelBuffer } from '../core/pixels.js';
import type { Rect } from '../core/pyramid.js';
import { clamp, type BrushParams, type Dab, type RetouchTool, type StrokePoint } from './stroke.js';

/** Reuse one workspace per worker/store. No allocation in applyDab after capacity is warmed. */
export class DabWorkspace {
  /** Frozen pre-dab source pixels. */
  frozen = new Float32Array(0);
  /** Current Poisson correction. */
  solution = new Float32Array(0);
  /** Next Jacobi iteration. */
  next = new Float32Array(0);
  /** Destination minus sampled source colour. */
  difference = new Float32Array(0);
  /** Dirichlet boundary flags, one per pixel. */
  boundary = new Uint8Array(0);
  /** Grow scratch capacity to at least this many channel values. */
  ensure(length: number) {
    if (this.frozen.length < length) {
      this.frozen = new Float32Array(length);
      this.solution = new Float32Array(length);
      this.next = new Float32Array(length);
      this.difference = new Float32Array(length);
      this.boundary = new Uint8Array(length / 4);
    }
  }
}
/** Pixel region located in decoded source coordinates. */
export interface DabSurface extends PixelBuffer { /** Source x origin. */ x: number; /** Source y origin. */ y: number }
const index = (s: DabSurface, x: number, y: number) => (clamp(Math.floor(y) - s.y, 0, s.height - 1) * s.width + clamp(Math.floor(x) - s.x, 0, s.width - 1)) * 4;
const inside = (points: readonly StrokePoint[], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!, b = points[j]!;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};

/** Deterministic boundary matching: sample nearby texture with the closest ring, never the repair centre. */
export function findSpotSource(surface: DabSurface, dab: Dab, params: BrushParams): { x: number; y: number } {
  const radius = params.size / 2, search = Math.max(params.size, params.searchRadius ?? params.size * 3);
  let best = Infinity, bx = 0, by = 0;
  for (let oy = -search; oy <= search; oy += Math.max(2, radius)) for (let ox = -search; ox <= search; ox += Math.max(2, radius)) {
    if (Math.hypot(ox, oy) < params.size || dab.x + ox - radius < surface.x || dab.y + oy - radius < surface.y || dab.x + ox + radius >= surface.x + surface.width || dab.y + oy + radius >= surface.y + surface.height) continue;
    let score = 0;
    for (let n = 0; n < 16; n++) {
      const angle = n * Math.PI / 8, x = dab.x + Math.cos(angle) * radius, y = dab.y + Math.sin(angle) * radius;
      const a = index(surface, x, y), b = index(surface, x + ox, y + oy);
      for (let c = 0; c < 4; c++) score += (surface.data[a + c]! - surface.data[b + c]!) ** 2;
    }
    if (score < best) { best = score; bx = ox; by = oy; }
  }
  return { x: bx, y: by };
}

/**
 * Apply one dab to a region with a two-pixel halo. Source is frozen before any writes.
 * A sampled surface covers the offset source region for clone/heal/patch/smudge.
 * All outputs remain linear premultiplied; eraser removes pixels, not mask content.
 */
export function applyDab(surface: DabSurface, tool: RetouchTool, params: BrushParams, dab: Dab, workspace: DabWorkspace, sampled: DabSurface = surface, offset = params.sourceOffset ?? { x: 0, y: 0 }): void {
  const { width, height, data } = surface;
  workspace.ensure(data.length);
  const frozen = workspace.frozen;
  frozen.set(data);
  const source = sampled === surface ? frozen : sampled.data;
  const radius = params.size / 2 * Math.max(.01, dab.pressure), hardness = clamp(params.hardness ?? .75);
  const amount = clamp(params.opacity ?? 1) * clamp(params.flow ?? 1) * dab.pressure;
  const strength = clamp(params.strength ?? .5);
  const colour = params.colour ?? (tool === 'colour-replace' ? [1, 0, 0, 1] : [0, 0, 0, 1]);
  const left = Math.max(0, Math.floor(dab.x - radius) - surface.x), right = Math.min(width, Math.ceil(dab.x + radius) - surface.x);
  const top = Math.max(0, Math.floor(dab.y - radius) - surface.y), bottom = Math.min(height, Math.ceil(dab.y + radius) - surface.y);
  // Screened Poisson: solve correction field relative to source texture with destination
  // Dirichlet boundary. Twelve Jacobi iterations keep the solve bounded at brush sizes.
  const healing = tool === 'heal' || tool === 'spot-heal' || tool === 'patch';
  if (healing) {
    const u = workspace.solution, v = workspace.next, difference = workspace.difference, boundary = workspace.boundary;
    u.fill(0, 0, data.length); v.fill(0, 0, data.length);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const gx = surface.x + x + .5, gy = surface.y + y + .5;
      const i = (y * width + x) * 4, si = index(sampled, gx + offset.x, gy + offset.y);
      boundary[i / 4] = Number(Math.hypot(gx - dab.x, gy - dab.y) >= radius - 1 || x === 0 || y === 0 || x === width - 1 || y === height - 1);
      const sa = source[si + 3]!, da = frozen[i + 3]!;
      for (let c = 0; c < 3; c++) {
        difference[i + c] = (da > 0 ? frozen[i + c]! / da : 0) - (sa > 0 ? source[si + c]! / sa : 0);
        if (boundary[i / 4]) u[i + c] = v[i + c] = difference[i + c]!;
      }
    }
    for (let iteration = 0; iteration < 12; iteration++) {
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const i = (y * width + x) * 4;
        if (boundary[i / 4]) continue;
        for (let c = 0; c < 3; c++) v[i + c] = (u[i - 4 + c]! + u[i + 4 + c]! + u[i - width * 4 + c]! + u[i + width * 4 + c]! + difference[i + c]! * .02) / 4.02;
      }
      u.set(v);
    }
  }

  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const gx = x + surface.x + .5, gy = y + surface.y + .5;
    const distance = Math.hypot(gx - dab.x, gy - dab.y) / radius;
    if (distance >= 1 || (tool === 'patch' && params.selection && !inside(params.selection, gx, gy))) continue;
    const weight = amount * (distance <= hardness ? 1 : (1 - distance) / Math.max(1e-9, 1 - hardness));
    const i = (y * width + x) * 4, alpha = frozen[i + 3]!;
    if (tool === 'eraser') { for (let c = 0; c < 4; c++) data[i + c] = frozen[i + c]! * (1 - weight); continue; }
    if (tool === 'brush') {
      const a = clamp(colour[3]!) * weight;
      for (let c = 0; c < 3; c++) data[i + c] = colour[c]! * a + frozen[i + c]! * (1 - a);
      data[i + 3] = a + alpha * (1 - a); continue;
    }
    const r = alpha > 0 ? frozen[i]! / alpha : 0, g = alpha > 0 ? frozen[i + 1]! / alpha : 0, b = alpha > 0 ? frozen[i + 2]! / alpha : 0;
    const lum = .2126 * r + .7152 * g + .0722 * b;
    const tonal = params.tonalRange === 'shadows' ? (1 - clamp(lum)) ** 2 : params.tonalRange === 'highlights' ? clamp(lum) ** 2 : params.tonalRange === 'midtones' ? 4 * clamp(lum) * (1 - clamp(lum)) : 1;
    let replacementWeight = weight;
    if (tool === 'colour-replace' && params.targetColour) {
      const t = params.targetColour;
      replacementWeight *= clamp(1 - Math.hypot(r - t[0], g - t[1], b - t[2]) / Math.max(.001, params.tolerance ?? .3));
    }
    const si = index(sampled, gx + offset.x, gy + offset.y);
    for (let c = 0; c < 3; c++) {
      const original = frozen[i + c]!;
      let value = original;
      switch (tool) {
        case 'clone': value = source[si + c]!; break;
        case 'smudge': value = original + (source[si + c]! - original) * strength; break;
        case 'heal': case 'spot-heal': case 'patch': {
          const sa = source[si + 3]!;
          value = Math.max(0, (sa > 0 ? source[si + c]! / sa : 0) + workspace.solution[i + c]!) * alpha; break;
        }
        case 'blur': case 'sharpen': {
          const l = Math.max(0, x - 1) * 4 + c, m = x * 4 + c, r = Math.min(width - 1, x + 1) * 4 + c;
          const a = Math.max(0, y - 1) * width * 4, b = y * width * 4, d = Math.min(height - 1, y + 1) * width * 4;
          const sum = frozen[a + l]! + frozen[a + m]! + frozen[a + r]! + frozen[b + l]! + frozen[b + m]! + frozen[b + r]! + frozen[d + l]! + frozen[d + m]! + frozen[d + r]!;
          value = tool === 'blur' ? original + (sum / 9 - original) * strength : Math.max(0, original + (original - sum / 9) * strength); break;
        }
        case 'dodge': value = original * 2 ** (strength * tonal); break;
        case 'burn': value = original * 2 ** (-strength * tonal); break;
        case 'sponge': value = Math.max(0, lum * alpha + (original - lum * alpha) * (1 + (params.desaturate ? -1 : 1) * strength)); break;
        case 'colour-replace': {
          const l = .2126 * colour[0]! + .7152 * colour[1]! + .0722 * colour[2]!;
          value = l > 1e-9 ? colour[c]! * lum / l * alpha : lum * alpha; break;
        }
        case 'red-eye': if (r > Math.max(g, b) * 1.5 && r > .1) value = (c === 0 ? (g + b) / 2 : c === 1 ? g : b) * alpha; break;
      }
      if (healing || tool === 'colour-replace') value = original + (value - original) * strength;
      data[i + c] = original + (value - original) * replacementWeight;
    }
    if (tool === 'clone' || tool === 'smudge') data[i + 3] = alpha + (source[si + 3]! - alpha) * weight * (tool === 'smudge' ? strength : 1);
    // Zero alpha must have zero colour, including neighbourhood filters on transparent edges.
    if (data[i + 3] === 0) data.fill(0, i, i + 3);
  }
}

/** Allocate a surface for direct headless use. Stores reuse their own region buffers. */
export const createDabSurface = (rect: Rect): DabSurface => ({ ...createPixels(rect.width, rect.height), x: rect.x, y: rect.y });
