import { abortable, retryRead } from "../core/async.js";
import {
  validateImageSize,
  assembleRegion,
  levelSize,
  pixelsToRgba8,
  TILE_GUTTER,
  TILE_SIZE,
  TileCache,
  TileCacheBudget,
  tileRect,
  type ImageDocument,
  type PixelBuffer,
  type Rect,
  type TileAddress,
  type TileSource,
} from "../core/index.js";
import type { RenderBackend, Surface } from "./types.js";

/** Finds the tile cache for a layer's source. */
export type CacheLookup = (source: TileSource) => TileCache;

/**
 * Compose one tile with its gutter into a new surface. Null means pixels have not arrived; they
 * have been requested. The screen and export both come through here, so they cannot disagree.
 */
export function composeTile(backend: RenderBackend, document: ImageDocument, tile: TileAddress, cacheFor: CacheLookup): Surface | null {
  const scale = 2 ** -tile.level;
  const inner = tileRect(document, tile);
  const outer: Rect = { x: inner.x - TILE_GUTTER, y: inner.y - TILE_GUTTER, width: inner.width + TILE_GUTTER * 2, height: inner.height + TILE_GUTTER * 2 };

  const inputs: Array<{ pixels: PixelBuffer; padding: number; layer: ImageDocument["layers"][number] }> = [];
  let ready = true;
  for (const layer of document.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const padding = layer.filters.reduce((total, { filter, params }) => total + filter.padding(params, scale), 0);
    const region = { x: outer.x - padding, y: outer.y - padding, width: outer.width + padding * 2, height: outer.height + padding * 2 };
    const pixels = assembleRegion(cacheFor(layer.source), document, tile.level, region);
    if (pixels) inputs.push({ pixels, padding, layer });
    else ready = false;
  }
  if (!ready) return null;

  // Non-separable modes and dodge/burn divide by near-zero colour differences: quantising either input to half floats first
  // can amplify a sub-0.001 input error beyond conformance. Discontinuous filters also request
  // full precision: half-float input rounding can otherwise select a different output bin.
  const precision = document.layers.some(layer => layer.visible && (["colour-dodge","colour-burn","hue","saturation","colour","luminosity"].includes(layer.blend) || layer.filters.some(({filter})=>filter.precision==="full"))) ? "full" : "half";
  let result: Surface = backend.allocate(outer.width, outer.height, precision);
  for (const { pixels, padding, layer } of inputs) {
    let source: Surface = backend.upload(pixels, precision);
    for (const { filter, params } of layer.filters) {
      const saved = new Map<string, Surface>();
      const held = new Set<Surface>();
      const frame = { x: outer.x - padding, y: outer.y - padding, width: pixels.width, height: pixels.height, documentWidth: levelSize(document, tile.level).width, documentHeight: levelSize(document, tile.level).height };
      try {
        for (const pass of filter.passes(params, scale, frame)) {
          const inputs = Object.fromEntries(Object.entries(pass.inputs ?? {}).map(([sampler, name]) => {
            const surface = saved.get(name);
            if (!surface) throw new Error(`Missing saved filter input: ${name}`);
            return [sampler, surface];
          }));
          const target = backend.allocate(source.width, source.height, precision);
          backend.runPass(pass, source, target, inputs);
          if (!held.has(source)) backend.release(source);
          source = target;
          if (pass.save) { saved.set(pass.save, target); held.add(target); }
        }
      } finally {
        for (const surface of held) if (surface !== source) backend.release(surface);
      }
    }
    const blended = backend.blend(result, source, { offsetX: padding, offsetY: padding, mode: layer.blend, opacity: layer.opacity });
    backend.release(source);
    backend.release(result);
    result = blended;
  }
  return result;
}

export interface ComposeOptions {
  /** Pyramid level to compose. 0 is full resolution. */
  level?: number;
  signal?: AbortSignal;
  /** Called with a fraction from 0 to 1 as tiles finish. */
  onProgress?: (fraction: number) => void;
  /** Keep this long between yields, so the page stays responsive. */
  sliceMs?: number;
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

/**
 * The whole document as straight-alpha sRGB bytes, a tile at a time. Rejects with the signal's reason
 * if aborted.
 */
export async function composeDocument(backend: RenderBackend, document: ImageDocument, options: ComposeOptions = {}) {
  const { level = 0, signal, onProgress, sliceMs = 12 } = options;
  const budget = new TileCacheBudget(256 * 1024 * 1024);
  const caches = new Map<TileSource, TileCache>();
  const cacheFor: CacheLookup = (source) => {
    let cache = caches.get(source);
    if (!cache) caches.set(source, (cache = new TileCache(source, budget)));
    return cache;
  };

  try {
  const { width, height } = levelSize(document, level);
  validateImageSize({width,height});
  const bytes = new Uint8ClampedArray(width * height * 4);
  const columns = Math.ceil(width / TILE_SIZE);
  const rows = Math.ceil(height / TILE_SIZE);
  let sliceStart = performance.now();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      signal?.throwIfAborted();
      const tile = { level, x, y };
      let surface = composeTile(backend, document, tile, cacheFor);
      for (let attempt=0; !surface; attempt++) {
        await retryRead(attempt, signal);
        await abortable(Promise.all([...caches.values()].map((cache) => cache.idle(signal))), signal);
        signal?.throwIfAborted();
        surface = composeTile(backend, document, tile, cacheFor);
      }
      const read = backend.read(surface);
      backend.release(surface);
      const inner = tileRect(document, tile);
      const tileBytes = pixelsToRgba8(read);
      for (let row = 0; row < inner.height; row++) {
        const from = ((row + TILE_GUTTER) * read.width + TILE_GUTTER) * 4;
        bytes.set(tileBytes.subarray(from, from + inner.width * 4), ((inner.y + row) * width + inner.x) * 4);
      }
      onProgress?.((y * columns + x + 1) / (rows * columns));
      if (performance.now() - sliceStart >= sliceMs) {
        await nextTask();
        sliceStart = performance.now();
      }
    }
  }
  return { width, height, bytes };
  } finally { for(const cache of caches.values()) cache.dispose(); }
}
