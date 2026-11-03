import { describe, expect, it } from "vitest";
import {
  clampCrop,
  createBytePyramid,
  createPixels,
  fitAspect,
  flipGeometry,
  geometrySize,
  geometrySource,
  IDENTITY_GEOMETRY,
  pixelSource,
  pixelsFromRgba8,
  rotateGeometry,
  TileCache,
  type Geometry,
  type PixelBuffer,
} from "./index.js";

/** Every pixel holds its own coordinates, so any transform can be checked exactly. */
function marked(width: number, height: number): PixelBuffer {
  const out = createPixels(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.data.set([x, y, 0, 1], (y * width + x) * 4);
  return out;
}
const at = (p: PixelBuffer, x: number, y: number) => [p.data[(y * p.width + x) * 4], p.data[(y * p.width + x) * 4 + 1]];

async function shown(image: PixelBuffer, geometry: Geometry, level = 0, tile = { x: 0, y: 0 }) {
  return geometrySource(new TileCache(pixelSource(image)), geometry).readTile({ level, ...tile });
}

describe("geometry", () => {
  const image = marked(4, 3);

  it("turns a picture clockwise", async () => {
    const out = await shown(image, { ...IDENTITY_GEOMETRY, rotation: 90 });
    expect([out.width, out.height]).toEqual([3, 4]);
    expect(at(out, 0, 0)).toEqual([0, 2]);
    expect(at(out, 2, 0)).toEqual([0, 0]);
    expect(at(out, 2, 3)).toEqual([3, 0]);
  });

  it("turns a picture half way and anticlockwise", async () => {
    expect(at(await shown(image, { ...IDENTITY_GEOMETRY, rotation: 180 }), 0, 0)).toEqual([3, 2]);
    const left = await shown(image, { ...IDENTITY_GEOMETRY, rotation: 270 });
    expect(at(left, 0, 0)).toEqual([3, 0]);
    expect(at(left, 2, 3)).toEqual([0, 2]);
  });

  it("mirrors on screen, after rotation", async () => {
    expect(at(await shown(image, { ...IDENTITY_GEOMETRY, flipX: true }), 0, 0)).toEqual([3, 0]);
    expect(at(await shown(image, { ...IDENTITY_GEOMETRY, flipY: true }), 0, 0)).toEqual([0, 2]);
    expect(at(await shown(image, { ...IDENTITY_GEOMETRY, rotation: 90, flipX: true }), 0, 0)).toEqual([0, 0]);
  });

  it("crops in the turned picture", async () => {
    const out = await shown(image, { ...IDENTITY_GEOMETRY, rotation: 90, crop: { x: 1, y: 2, width: 2, height: 1 } });
    expect([out.width, out.height]).toEqual([2, 1]);
    expect(at(out, 0, 0)).toEqual([2, 1]);
  });

  it("reads across tile boundaries and out of edge tiles", async () => {
    const big = marked(700, 300);
    const geometry = { ...IDENTITY_GEOMETRY, rotation: 90 as const };
    const tile = await shown(big, geometry, 0, { x: 0, y: 1 });
    expect(tile.width).toBe(256);
    expect(at(tile, 0, 0)).toEqual([256, 299]);
    expect(at(tile, 255, 0)).toEqual([256, 44]);
  });

  it("shows coarser levels in the same place", async () => {
    const big = marked(600, 400);
    const out = await shown(big, { ...IDENTITY_GEOMETRY, rotation: 180 }, 1);
    const value = at(out, 0, 0)[0]!;
    expect(value).toBeGreaterThan(597);
  });

  const steps: Array<(g: Geometry, size: { width: number; height: number }) => Geometry> = [
    (g, s) => rotateGeometry(g, s, 1),
    (g, s) => rotateGeometry(g, s, -1),
    (g, s) => flipGeometry(g, s, "x"),
    (g, s) => flipGeometry(g, s, "y"),
  ];

  it("keeps the crop over the same pixels through any sequence of turns and flips", async () => {
    const start = { ...IDENTITY_GEOMETRY, crop: { x: 3, y: 2, width: 9, height: 4 } };
    const picture = marked(20, 11);
    const wanted = await shown(picture, start);
    const seen = (p: PixelBuffer) => new Set(Array.from({ length: p.width * p.height }, (_, i) => `${p.data[i * 4]},${p.data[i * 4 + 1]}`));
    let seed = 12345;
    for (let round = 0; round < 40; round++) {
      let geometry: Geometry = start;
      for (let move = 0; move < 6; move++) {
        seed = (seed * 16807) % 2147483647;
        geometry = steps[seed % 4]!(geometry, picture);
      }
      const out = await shown(picture, geometry);
      expect(seen(out)).toEqual(seen(wanted));
    }
  });

  it("returns to the start after four turns", () => {
    const size = { width: 20, height: 11 };
    let geometry: Geometry = { rotation: 0, flipX: true, flipY: false, crop: { x: 3, y: 2, width: 9, height: 4 } };
    const start = geometry;
    for (let i = 0; i < 4; i++) geometry = rotateGeometry(geometry, size, 1);
    expect(geometry).toEqual(start);
  });

  it("reports the size after each step", () => {
    const size = { width: 20, height: 11 };
    expect(geometrySize(size, IDENTITY_GEOMETRY)).toEqual(size);
    expect(geometrySize(size, { ...IDENTITY_GEOMETRY, rotation: 270 })).toEqual({ width: 11, height: 20 });
    expect(geometrySize(size, { ...IDENTITY_GEOMETRY, crop: { x: 0, y: 0, width: 5, height: 6 } })).toEqual({ width: 5, height: 6 });
  });

  it("keeps a crop on whole pixels inside the picture", () => {
    expect(clampCrop({ x: -5.4, y: 2.2, width: 500, height: 0 }, { width: 100, height: 50 })).toEqual({ x: 0, y: 2, width: 100, height: 1 });
  });

  it("fits an aspect ratio inside a box", () => {
    expect(fitAspect({ x: 0, y: 0, width: 200, height: 100 }, 1)).toEqual({ x: 50, y: 0, width: 100, height: 100 });
    expect(fitAspect({ x: 0, y: 0, width: 200, height: 100 }, 4)).toEqual({ x: 0, y: 25, width: 200, height: 50 });
  });
});

describe("byte pyramid", () => {
  const bytes = () => {
    const rgba = new Uint8ClampedArray(600 * 400 * 4);
    let seed = 99;
    for (let i = 0; i < rgba.length; i++) rgba[i] = (seed = (seed * 16807) % 2147483647) % 256;
    return rgba;
  };

  it("matches working pixels exactly at full size", () => {
    const rgba = bytes();
    const tile = createBytePyramid(rgba, { width: 600, height: 400 }).readTile({ level: 0, x: 1, y: 0 });
    const full = pixelsFromRgba8(rgba, 600, 400);
    const expected = pixelSource(full).readTile({ level: 0, x: 1, y: 0 }) as PixelBuffer;
    expect(tile.data).toEqual(expected.data);
  });

  it("agrees with the float pyramid at coarser levels, to 16-bit rounding", () => {
    const rgba = bytes();
    const pyramid = createBytePyramid(rgba, { width: 600, height: 400 });
    const floats = pixelSource(pixelsFromRgba8(rgba, 600, 400));
    for (const level of [1, 2]) {
      const a = pyramid.readTile({ level, x: 0, y: 0 });
      const b = floats.readTile({ level, x: 0, y: 0 }) as PixelBuffer;
      const worst = a.data.reduce((most, value, i) => Math.max(most, Math.abs(value - b.data[i]!)), 0);
      expect(worst).toBeLessThan(3 / 65535);
    }
  });
});
