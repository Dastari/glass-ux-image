/* Shared by the conformance scene files, so each domain adds scenes without touching another's. */
import { createPixels, pixelSource, type ImageDocument, type PixelBuffer } from "glass-ux-image/core";

export function noise(width: number, height: number, seed: number, soften = 1): PixelBuffer {
  const out = createPixels(width, height);
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < out.data.length; i += 4) {
    const a = next() * soften + (1 - soften);
    out.data.set([next() * a, next() * a, next() * a, a], i);
  }
  return out;
}

export const SIZE = { width: 620, height: 400 };
export const layer = (seed: number, soften?: number) => pixelSource(noise(SIZE.width, SIZE.height, seed, soften));

export type Scene = (doc: ImageDocument) => void;
