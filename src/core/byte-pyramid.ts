import { createPixels, srgbToLinear, type PixelBuffer } from "./pixels.js";
import { coarsestLevel, levelSize, tileRect, type Size, type TileAddress } from "./pyramid.js";

const decode = new Float32Array(256);
for (let i = 0; i < 256; i++) decode[i] = srgbToLinear(i / 255);

/** Linear premultiplied RGBA in 16 bits: half the memory of floats, and plenty for a preview. */
function firstLevel(rgba: Uint8Array | Uint8ClampedArray, size: Size) {
  const target = levelSize(size, 1);
  const out = new Uint16Array(target.width * target.height * 4);
  const totals = new Float32Array(4);
  for (let y = 0; y < target.height; y++) {
    const top = y * 2;
    const bottom = Math.min(top + 1, size.height - 1);
    for (let x = 0; x < target.width; x++) {
      const left = x * 2;
      const right = Math.min(left + 1, size.width - 1);
      totals.fill(0);
      for (const [row, column] of [[top, left], [top, right], [bottom, left], [bottom, right]] as const) {
        const i = (row * size.width + column) * 4;
        const alpha = rgba[i + 3]! / 255;
        totals[0]! += decode[rgba[i]!]! * alpha;
        totals[1]! += decode[rgba[i + 1]!]! * alpha;
        totals[2]! += decode[rgba[i + 2]!]! * alpha;
        totals[3]! += alpha;
      }
      const o = (y * target.width + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = (totals[c]! / 4) * 65535 + 0.5;
    }
  }
  return out;
}

function halveLevel(source: Uint16Array, size: Size) {
  const target = { width: Math.ceil(size.width / 2), height: Math.ceil(size.height / 2) };
  const out = new Uint16Array(target.width * target.height * 4);
  for (let y = 0; y < target.height; y++) {
    const top = y * 2 * size.width * 4;
    const bottom = Math.min(y * 2 + 1, size.height - 1) * size.width * 4;
    for (let x = 0; x < target.width; x++) {
      const left = x * 2 * 4;
      const right = Math.min(x * 2 + 1, size.width - 1) * 4;
      const o = (y * target.width + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[o + c] = (source[top + left + c]! + source[top + right + c]! + source[bottom + left + c]! + source[bottom + right + c]! + 2) >> 2;
      }
    }
  }
  return out;
}

/**
 * A decoded image kept as sRGB bytes, with 16-bit levels above it. Only requested tiles
 * convert to linear premultiplied floats; the original bytes remain available for reuse.
 */
export function createBytePyramid(rgba: Uint8Array | Uint8ClampedArray, size: Size) {
  const levels: Uint16Array[] = [];
  const top = coarsestLevel(size);
  if (top >= 1) levels[1] = firstLevel(rgba, size);
  for (let level = 2; level <= top; level++) levels[level] = halveLevel(levels[level - 1]!, levelSize(size, level - 1));

  return {
    readTile(tile: TileAddress): PixelBuffer {
      const rect = tileRect(size, tile);
      const out = createPixels(rect.width, rect.height);
      const { width } = levelSize(size, tile.level);
      if (tile.level === 0) {
        for (let y = 0; y < rect.height; y++) {
          for (let x = 0; x < rect.width; x++) {
            const i = ((rect.y + y) * width + rect.x + x) * 4;
            const o = (y * rect.width + x) * 4;
            const alpha = rgba[i + 3]! / 255;
            out.data[o] = decode[rgba[i]!]! * alpha;
            out.data[o + 1] = decode[rgba[i + 1]!]! * alpha;
            out.data[o + 2] = decode[rgba[i + 2]!]! * alpha;
            out.data[o + 3] = alpha;
          }
        }
        return out;
      }
      const level = levels[tile.level];
      if (!level) throw new RangeError(`No pyramid level ${tile.level}`);
      for (let y = 0; y < rect.height; y++) {
        const start = ((rect.y + y) * width + rect.x) * 4;
        for (let i = 0; i < rect.width * 4; i++) out.data[y * rect.width * 4 + i] = level[start + i]! / 65535;
      }
      return out;
    },
  };
}
