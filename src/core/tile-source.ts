import { createPixels, TILE_SIZE, type PixelBuffer } from "./pixels.js";
import { coarsestLevel, levelSize, tileRect, type Rect, type Size, type TileAddress } from "./pyramid.js";

/**
 * Supplies a layer's pixels one tile at a time. It may be asynchronous and slow, so a decoder in a
 * worker, a remote document and a procedural image all look the same to the renderer. Each buffer
 * is the size `tileRect` gives for its address.
 */
export interface TileSource extends Size {
  /** Subscribe to changed source-coordinate rectangles at full resolution. */
  invalidated?: (listener: (rect: Rect) => void) => () => void;
  /** Wait for already queued source edits to publish their invalidations; does not request pixels. */
  idle?: (signal?: AbortSignal) => Promise<void>;
  readTile(tile: TileAddress, signal?: AbortSignal): Promise<PixelBuffer> | PixelBuffer;
}

/** The same colour everywhere, in premultiplied linear light. */
export function solidSource(size: Size, color: readonly [number, number, number, number]): TileSource {
  return {
    ...size,
    readTile(tile) {
      const rect = tileRect(size, tile);
      const out = createPixels(rect.width, rect.height);
      for (let i = 0; i < out.data.length; i += 4) out.data.set(color, i);
      return out;
    },
  };
}

/** Halve a buffer with a box filter. Odd edges repeat their last row or column. */
export function halve(source: PixelBuffer): PixelBuffer {
  const width = Math.ceil(source.width / 2);
  const height = Math.ceil(source.height / 2);
  const out = createPixels(width, height);
  const { data } = source;
  for (let y = 0; y < height; y++) {
    const top = y * 2;
    const bottom = Math.min(top + 1, source.height - 1);
    for (let x = 0; x < width; x++) {
      const left = x * 2;
      const right = Math.min(left + 1, source.width - 1);
      for (let c = 0; c < 4; c++) {
        const a = data[(top * source.width + left) * 4 + c]!;
        const b = data[(top * source.width + right) * 4 + c]!;
        const d = data[(bottom * source.width + left) * 4 + c]!;
        const e = data[(bottom * source.width + right) * 4 + c]!;
        out.data[(y * width + x) * 4 + c] = (a + b + d + e) / 4;
      }
    }
  }
  return out;
}

/** A tile source over a fully decoded image, with its pyramid built up front. */
export function pixelSource(image: PixelBuffer): TileSource {
  const levels = [image];
  for (let level = 1; level <= coarsestLevel(image); level++) levels.push(halve(levels[level - 1]!));
  return {
    width: image.width,
    height: image.height,
    readTile(tile) {
      const level = levels[tile.level];
      if (!level) throw new RangeError(`No pyramid level ${tile.level}`);
      const rect = tileRect(image, tile);
      const out = createPixels(rect.width, rect.height);
      for (let row = 0; row < rect.height; row++) {
        const start = ((rect.y + row) * level.width + rect.x) * 4;
        out.data.set(level.data.subarray(start, start + rect.width * 4), row * rect.width * 4);
      }
      return out;
    },
  };
}

/** Number of level 0 tiles a document of this size has, for memory reporting. */
export const tileCount = (size: Size) => {
  const full = levelSize(size, 0);
  return Math.ceil(full.width / TILE_SIZE) * Math.ceil(full.height / TILE_SIZE);
};
