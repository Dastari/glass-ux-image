import { createPixels, pixelsFromRgba8, type PixelBuffer } from "../core/pixels.js";
import { tileRect, type Rect, type TileAddress } from "../core/pyramid.js";
import type { TileSource } from "../core/tile-source.js";
import { createTextCanvas, type TextCanvasFactory } from "./canvas.js";
import { layoutText, type TextLayout } from "./layout.js";
import { validateTextSpec, type TextSpec } from "./spec.js";

export interface TextSourceOptions {
  /** Creates the canvas boundary; defaults to OffscreenCanvas 2D. */
  canvas?: TextCanvasFactory;
  /** Maximum retained float pixel bytes. Oversized tiles are returned without caching. Default 8 MiB. */
  maxCacheBytes?: number;
}
export interface TextTileSource extends TileSource {
  readTile(tile: TileAddress): PixelBuffer;
  /** Document coordinates of the bitmap's top-left, including glyph overhang and effects.
   * The pipeline maps the entire bitmap through the layer quad; it does not apply this offset itself. */
  readonly bounds: Readonly<Rect>;
  /** Measured lines in document coordinates; returned as a defensive copy. */
  readonly layout: TextLayout;
  /** Retained linear float tile bytes, excluding caller-owned copies. */
  readonly cacheBytes: number;
  /** Snapshot new plain data, clear cached levels, and notify listeners over the old/new extent. */
  update(spec: TextSpec): void;
  /** Clear rendered tiles after the host loads/replaces a font, and remeasure. */
  invalidate(): void;
}

/** Rasterises each tile directly at 2^-level. No full-resolution bitmap or mip downsampling. */
export function createTextSource(initial: TextSpec, options: TextSourceOptions = {}): TextTileSource {
  const factory = options.canvas ?? createTextCanvas;
  const maxBytes = options.maxCacheBytes ?? 8 * 1024 * 1024;
  if (!Number.isFinite(maxBytes) || maxBytes < 0) throw new RangeError("Invalid text cache limit");
  const canvas = factory();
  let spec: TextSpec;
  let signature = "";
  let layout: TextLayout;
  let bounds: Rect;
  let ink: Rect[];
  let cacheBytes = 0;
  const cache = new Map<string, PixelBuffer>();
  const listeners = new Set<(rect: Rect) => void>();
  const prepare = (next: TextSpec) => {
    validateTextSpec(next);
    // Do not retain mutable host data, including nested colours/effects.
    const snapshot = JSON.parse(JSON.stringify(next)) as TextSpec;
    canvas.configure(snapshot);
    const nextLayout = layoutText(snapshot, text => canvas.measure(text).width);
    const nextInk = nextLayout.lines.map(line => {
      const m = canvas.measure(line.text || "Mg");
      return { x: line.x - m.actualBoundingBoxLeft, y: line.baseline - m.actualBoundingBoxAscent,
        width: line.text ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : 0,
        height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
    });
    const outline = snapshot.outline?.width ?? 0;
    // Canvas shadowBlur is Gaussian-like: three blur radii plus one pixel conservatively bounds its byte support.
    const blur = (snapshot.shadow?.blur ?? 0) * 3;
    const left = outline + 1 + (snapshot.shadow ? Math.max(0, blur - snapshot.shadow.offsetX) : 0);
    const right = outline + 1 + (snapshot.shadow ? Math.max(0, blur + snapshot.shadow.offsetX) : 0);
    const top = outline + 1 + (snapshot.shadow ? Math.max(0, blur - snapshot.shadow.offsetY) : 0);
    const bottom = outline + 1 + (snapshot.shadow ? Math.max(0, blur + snapshot.shadow.offsetY) : 0);
    const x = Math.floor(Math.min(0, ...nextInk.map(r => r.x)) - left);
    const y = Math.floor(Math.min(...nextInk.map(r => r.y)) - top);
    const farX = Math.ceil(Math.max(nextLayout.width, ...nextInk.map(r => r.x + r.width)) + right);
    const farY = Math.ceil(Math.max(...nextInk.map(r => r.y + r.height)) + bottom);
    const nextBounds = { x, y, width: Math.max(1, farX - x), height: Math.max(1, farY - y) };
    if (Object.values(nextBounds).some(n => !Number.isSafeInteger(n))) throw new RangeError("Text bounds exceed safe coordinates");
    spec = snapshot; signature = JSON.stringify(snapshot); layout = nextLayout; bounds = nextBounds;
    ink = nextInk.map(r => ({ x: r.x - left, y: r.y - top, width: r.width + left + right, height: r.height + top + bottom }));
    cache.clear(); cacheBytes = 0;
  };
  prepare(initial);
  const refresh = (next: TextSpec) => {
    const oldWidth = bounds.width, oldHeight = bounds.height;
    prepare(next);
    for (const listener of listeners) listener({ x: 0, y: 0, width: Math.max(oldWidth, bounds.width), height: Math.max(oldHeight, bounds.height) });
  };
  return {
    get width() { return bounds.width; }, get height() { return bounds.height; },
    get bounds() { return { ...bounds }; },
    get layout() { return { ...layout, lines: layout.lines.map(line => ({ ...line })) }; },
    get cacheBytes() { return cacheBytes; },
    invalidated(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(next) { if (JSON.stringify(next) !== signature) refresh(next); },
    invalidate() { refresh(spec); },
    readTile(tile: TileAddress) {
      if (![tile.level, tile.x, tile.y].every(n => Number.isSafeInteger(n) && n >= 0) || tile.level > 52) {
        throw new RangeError("Invalid text tile address");
      }
      const rect = tileRect(bounds, tile);
      if (rect.width <= 0 || rect.height <= 0) throw new RangeError("Text tile outside source");
      const key = `${tile.level}/${tile.x}/${tile.y}`;
      const hit = cache.get(key);
      // Copies protect the cache from a consumer modifying its returned PixelBuffer.
      if (hit) { cache.delete(key); cache.set(key, hit); return { ...hit, data: hit.data.slice() }; }
      const scale = 2 ** -tile.level;
      // Rasterise an overlap so Canvas shadow/stroke intermediates do not clip at tile edges.
      const halo = Math.ceil(((spec.outline?.width ?? 0) + (spec.shadow?.blur ?? 0) * 3 +
        Math.max(Math.abs(spec.shadow?.offsetX ?? 0), Math.abs(spec.shadow?.offsetY ?? 0))) * scale);
      const originX = bounds.x + (rect.x - halo) / scale, originY = bounds.y + (rect.y - halo) / scale;
      const renderWidth = rect.width + halo * 2, renderHeight = rect.height + halo * 2;
      canvas.begin(renderWidth, renderHeight, scale, originX, originY);
      for (let i = 0; i < layout.lines.length; i++) {
        const r = ink[i]!;
        if (r.x + r.width < originX || r.x > originX + renderWidth / scale ||
          r.y + r.height < originY || r.y > originY + renderHeight / scale) continue;
        const line = layout.lines[i]!;
        if (line.text) canvas.draw(line.text, line.x, line.baseline, spec, scale);
      }
      const bytes = canvas.read(renderWidth, renderHeight);
      if (bytes.length !== renderWidth * renderHeight * 4) throw new Error("Invalid text canvas pixel length");
      const inner = new Uint8ClampedArray(rect.width * rect.height * 4);
      for (let row = 0; row < rect.height; row++) {
        const start = ((row + halo) * renderWidth + halo) * 4;
        inner.set(bytes.subarray(start, start + rect.width * 4), row * rect.width * 4);
      }
      const pixels = pixelsFromRgba8(inner, rect.width, rect.height);
      const size = pixels.data.byteLength;
      if (size <= maxBytes) {
        while (cacheBytes + size > maxBytes && cache.size) {
          const oldest = cache.keys().next().value!;
          cacheBytes -= cache.get(oldest)!.data.byteLength; cache.delete(oldest);
        }
        cache.set(key, pixels); cacheBytes += size;
        const copy = createPixels(pixels.width, pixels.height); copy.data.set(pixels.data); return copy;
      }
      return pixels;
    },
  };
}
