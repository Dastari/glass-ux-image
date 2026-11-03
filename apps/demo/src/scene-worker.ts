import { createPixels, levelSize, srgbToLinear, tileRect, type Size, type TileAddress } from "glass-ux-image/core";
import { pixel } from "./scene";

export interface SceneRequest {
  id: number;
  size: Size;
  tile: TileAddress;
}

/* Paints a tile directly at its level, so any part of the image costs the same at any zoom. */
self.onmessage = ({ data: { id, size, tile } }: MessageEvent<SceneRequest>) => {
  const rect = tileRect(size, tile);
  const level = levelSize(size, tile.level);
  const out = createPixels(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const [r, g, b] = pixel((rect.x + x + 0.5) / level.width, (rect.y + y + 0.5) / level.height);
      out.data.set([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1], (y * rect.width + x) * 4);
    }
  }
  self.postMessage({ id, pixels: out }, { transfer: [out.data.buffer] });
};
