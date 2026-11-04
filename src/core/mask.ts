import { createPixels, TILE_SIZE, type PixelBuffer } from "./pixels.js";
import { tileKey, tileRect, type Rect, type Size, type TileAddress } from "./pyramid.js";
import type { TileSource } from "./tile-source.js";

/**
 * A layer mask, as plain data. Its pixels are the starting fill plus any strokes with `mask: true`
 * on the layer, in the layer's own pixels. Only coverage (alpha) counts: 1 shows the layer, 0 hides it.
 */
export interface LayerMask {
  /** Coverage before any mask strokes: `reveal` shows the whole layer, `hide` shows none of it. */
  fill: "reveal" | "hide";
  /** A disabled mask keeps its strokes but has no effect on the picture. */
  enabled: boolean;
}

/** The starting coverage of a mask, as a tile source the size of its layer. Opaque white reveals. */
export function maskFillSource(size: Size, fill: LayerMask["fill"]): TileSource {
  const value = fill === "reveal" ? 1 : 0;
  const tiles = new Map<string, PixelBuffer>();
  return {
    width: size.width,
    height: size.height,
    readTile(tile) {
      // Tiles are borrowed and never written, so one buffer per tile shape is enough.
      const rect = tileRect(size, tile), key = `${rect.width}x${rect.height}`;
      let pixels = tiles.get(key);
      if (!pixels) { pixels = createPixels(rect.width, rect.height); pixels.data.fill(value); tiles.set(key, pixels); }
      return pixels;
    },
  };
}

/** Limits for a masked source's own cache of coarse tiles. */
export interface MaskedSourceOptions {
  /** Retained bytes of computed coarse tiles; default 32 MiB. Level 0 is never cached here. */
  maxBytes?: number;
  /** Yield between tiles when a coarse read runs past its 4 ms slice; default a zero timeout. */
  yield?: () => Promise<void>;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.y < b.y + b.height && b.x < a.x + a.width && b.y < a.y + a.height;
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Multiply a layer's premultiplied pixels by a mask's coverage. Both sources must be the same
 * size. Changes to either reach the renderer as dirty rectangles.
 *
 * Level 0 is the exact product. A coarse pixel must be the average of the masked full-resolution
 * pixels under it, which is not the product of the two averages, so a coarse level is built from
 * the masked level below it. Most pixels need no descent: mask coverage lies in [0, 1], so a coarse
 * coverage of exactly 0 or 1 means every pixel under it is 0 or 1 and the product is already
 * exact, as it is where the layer is fully transparent. Only pixels under part coverage, such as a
 * soft brush edge, read the level below. While anything subscribes to `invalidated`, computed
 * coarse tiles are kept in a bounded cache and dropped when either source reports a change.
 */
export function maskedSource(pixels: TileSource, mask: TileSource, options: MaskedSourceOptions = {}): TileSource {
  if (pixels.width !== mask.width || pixels.height !== mask.height) throw new RangeError("A mask must match its layer's size");
  const size: Size = { width: pixels.width, height: pixels.height };
  const maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
  const pause = options.yield ?? nextTask;
  const listeners = new Set<(rect: Rect) => void>();
  const cache = new Map<string, { rect: Rect; pixels: PixelBuffer }>();
  let bytes = 0, generation = 0, deadline = 0;
  let stops: (() => void)[] = [];

  const forget = (key: string) => {
    const entry = cache.get(key);
    if (entry) { bytes -= entry.pixels.data.byteLength; cache.delete(key); }
  };
  const changed = (rect: Rect) => {
    generation++;
    for (const [key, entry] of cache) if (overlaps(entry.rect, rect)) forget(key);
    for (const listener of listeners) listener(rect);
  };
  const remember = (key: string, tile: TileAddress, out: PixelBuffer) => {
    const rect = tileRect(size, tile), scale = 2 ** tile.level;
    cache.set(key, { rect: { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale }, pixels: out });
    bytes += out.data.byteLength;
    for (const [oldest] of cache) { if (bytes <= maxBytes) break; forget(oldest); }
  };

  async function read(tile: TileAddress, signal?: AbortSignal): Promise<PixelBuffer> {
    const key = tileKey(tile), hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit.pixels; }
    const start = generation;
    const [colour, coverage] = await Promise.all([pixels.readTile(tile, signal), mask.readTile(tile, signal)]);
    const out = createPixels(colour.width, colour.height), a = colour.data, m = coverage.data, o = out.data;
    const partial = tile.level > 0 ? new Uint8Array(out.width * out.height) : undefined;
    // Which of the four child tiles below hold pixels under part coverage.
    let children = 0;
    for (let i = 0, p = 0; i < o.length; i += 4, p++) {
      const k = Math.max(0, Math.min(1, m[i + 3]!));
      o[i] = a[i]! * k; o[i + 1] = a[i + 1]! * k; o[i + 2] = a[i + 2]! * k; o[i + 3] = a[i + 3]! * k;
      if (partial && k > 0 && k < 1 && a[i + 3] !== 0) {
        partial[p] = 1;
        const x = p % out.width, y = (p - x) / out.width;
        children |= 1 << ((y >= TILE_SIZE / 2 ? 2 : 0) + (x >= TILE_SIZE / 2 ? 1 : 0));
      }
    }
    for (let quadrant = 0; partial && quadrant < 4; quadrant++) {
      if (!(children & (1 << quadrant))) continue;
      if (performance.now() >= deadline) { await pause(); signal?.throwIfAborted(); deadline = performance.now() + 4; }
      const qx = quadrant & 1, qy = quadrant >> 1;
      const below = await read({ level: tile.level - 1, x: tile.x * 2 + qx, y: tile.y * 2 + qy }, signal), b = below.data;
      // The core box filter: average two by two, repeating the last row or column at an odd edge.
      const x0 = qx * TILE_SIZE / 2, y0 = qy * TILE_SIZE / 2;
      const x1 = Math.min(out.width, x0 + TILE_SIZE / 2), y1 = Math.min(out.height, y0 + TILE_SIZE / 2);
      for (let y = y0; y < y1; y++) {
        const top = (y - y0) * 2, bottom = Math.min(top + 1, below.height - 1);
        for (let x = x0; x < x1; x++) {
          if (!partial[y * out.width + x]) continue;
          const left = (x - x0) * 2, right = Math.min(left + 1, below.width - 1);
          const i = (y * out.width + x) * 4, tl = (top * below.width + left) * 4, tr = (top * below.width + right) * 4;
          const bl = (bottom * below.width + left) * 4, br = (bottom * below.width + right) * 4;
          for (let c = 0; c < 4; c++) o[i + c] = (b[tl + c]! + b[tr + c]! + b[bl + c]! + b[br + c]!) / 4;
        }
      }
    }
    // Keep coarse tiles only while change reports arrive, and only if nothing changed meanwhile.
    if (tile.level > 0 && listeners.size && start === generation) remember(key, tile, out);
    return out;
  }

  return {
    width: size.width,
    height: size.height,
    invalidated(listener: (rect: Rect) => void) {
      listeners.add(listener);
      if (listeners.size === 1) stops = [pixels.invalidated?.(changed), mask.invalidated?.(changed)].filter(stop => stop !== undefined);
      return () => {
        if (!listeners.delete(listener) || listeners.size) return;
        for (const stop of stops) stop();
        stops = []; cache.clear(); bytes = 0; generation++;
      };
    },
    async idle(signal?: AbortSignal) { await Promise.all([pixels.idle?.(signal), mask.idle?.(signal)]); },
    readTile(tile: TileAddress, signal?: AbortSignal) {
      deadline = performance.now() + 4;
      return read(tile, signal);
    },
  };
}
