import { describe, expect, it, vi } from "vitest";
import {
  assembleRegion,
  coarsestLevel,
  createImageDocument,
  createPixels,
  documentToScreen,
  fitViewport,
  halve,
  levelForZoom,
  levelSize,
  linearToSrgb,
  panBy,
  pixelsFromRgba8,
  pixelsToRgba8,
  pixelSource,
  screenToDocument,
  solidSource,
  srgbToLinear,
  TileCache,
  tileRect,
  tilesInRect,
  visibleTiles,
  zoomAt,
  type PixelBuffer,
  type TileAddress,
} from "./index.js";

const doc = { width: 6000, height: 4000 };

/** Every pixel's red channel holds its own x, and green its y, so copies can be checked. */
function coordinates(width: number, height: number): PixelBuffer {
  const out = createPixels(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out.data.set([x, y, 0, 1], (y * width + x) * 4);
    }
  }
  return out;
}
const at = (p: PixelBuffer, x: number, y: number) => [...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)];

describe("colour", () => {
  it("round-trips every sRGB byte through linear light", () => {
    for (let i = 0; i < 256; i++) expect(Math.round(linearToSrgb(srgbToLinear(i / 255)) * 255)).toBe(i);
  });

  it("premultiplies on the way in and restores straight alpha on the way out", () => {
    const rgba = new Uint8ClampedArray([200, 100, 50, 128]);
    const pixels = pixelsFromRgba8(rgba, 1, 1);
    expect(pixels.data[0]).toBeCloseTo(srgbToLinear(200 / 255) * (128 / 255), 5);
    expect([...pixelsToRgba8(pixels)]).toEqual([200, 100, 50, 128]);
  });

  it("does not divide by zero for transparent pixels", () => {
    expect([...pixelsToRgba8(createPixels(1, 1))]).toEqual([0, 0, 0, 0]);
  });
});

describe("pyramid", () => {
  it("rounds levels up so the last pixel survives", () => {
    expect(levelSize({ width: 5, height: 3 }, 1)).toEqual({ width: 3, height: 2 });
  });

  it("stops at the first level that fits one tile", () => {
    expect(coarsestLevel(doc)).toBe(5);
    expect(coarsestLevel({ width: 10, height: 10 })).toBe(0);
    expect(levelSize(doc, 5).width).toBeLessThanOrEqual(256);
  });

  it("cuts edge tiles to the document", () => {
    const rect = tileRect({ width: 300, height: 256 }, { level: 0, x: 1, y: 0 });
    expect(rect).toEqual({ x: 256, y: 0, width: 44, height: 256 });
  });

  it("never lists tiles outside the document", () => {
    const tiles = tilesInRect({ width: 300, height: 300 }, 0, { x: -500, y: -500, width: 5000, height: 5000 });
    expect(tiles).toHaveLength(4);
  });
});

describe("viewport", () => {
  const canvas = { width: 1000, height: 800 };

  it("fits a document inside its margin", () => {
    const view = fitViewport(doc, canvas, 20);
    expect(view.zoom).toBeCloseTo(960 / 6000);
    expect(documentToScreen(view, 0, 2000).x).toBeCloseTo(20);
  });

  it("converts between screen and document both ways", () => {
    const view = { ...fitViewport(doc, canvas), zoom: 0.37, centerX: 1234, centerY: 567 };
    const point = screenToDocument(view, 321, 123);
    const back = documentToScreen(view, point.x, point.y);
    expect(back.x).toBeCloseTo(321);
    expect(back.y).toBeCloseTo(123);
  });

  it("keeps the point under the pointer still while zooming", () => {
    const view = fitViewport(doc, canvas);
    const before = screenToDocument(view, 700, 200);
    const zoomed = zoomAt(view, 3.7, 700, 200);
    const after = screenToDocument(zoomed, 700, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("moves the image with the drag", () => {
    const view = fitViewport(doc, canvas);
    const moved = panBy(view, 100, 0);
    expect(documentToScreen(moved, 3000, 2000).x - documentToScreen(view, 3000, 2000).x).toBeCloseTo(100);
  });

  it("uses full resolution from 50% up, then halves", () => {
    expect(levelForZoom(doc, 4)).toBe(0);
    expect(levelForZoom(doc, 1)).toBe(0);
    expect(levelForZoom(doc, 0.75)).toBe(0);
    expect(levelForZoom(doc, 0.5)).toBe(1);
    expect(levelForZoom(doc, 0.26)).toBe(1);
    expect(levelForZoom(doc, 0.001)).toBe(5);
  });

  it("orders tiles from the centre outward", () => {
    const view = { ...fitViewport(doc, canvas), zoom: 1, centerX: 3000, centerY: 2000 };
    const [first] = visibleTiles(doc, view, 0);
    expect(first).toMatchObject({ x: 11, y: 7 });
  });

  it("shows few tiles zoomed in, so memory follows the viewport", () => {
    const view = { ...fitViewport(doc, canvas), zoom: 1, centerX: 3000, centerY: 2000 };
    expect(visibleTiles(doc, view, 0).length).toBeLessThan(30);
  });
});

describe("tile sources", () => {
  it("averages when halving, repeating the last row and column of odd sizes", () => {
    const image = createPixels(3, 1);
    image.data.set([1, 0, 0, 1, 3, 0, 0, 1, 5, 0, 0, 1]);
    const half = halve(image);
    expect(half.width).toBe(2);
    expect(at(half, 0, 0)[0]).toBe(2);
    expect(at(half, 1, 0)[0]).toBe(5);
  });

  it("serves the right pixels for a tile", async () => {
    const source = pixelSource(coordinates(300, 300));
    const tile = await source.readTile({ level: 0, x: 1, y: 0 });
    expect(tile.width).toBe(44);
    expect(at(tile, 0, 5).slice(0, 2)).toEqual([256, 5]);
  });

  it("refuses a level it does not have", () => {
    expect(() => pixelSource(coordinates(4, 4)).readTile({ level: 3, x: 0, y: 0 })).toThrow(RangeError);
  });
});

describe("tile cache", () => {
  const tile = (x: number): TileAddress => ({ level: 0, x, y: 0 });
  const source = solidSource({ width: 2560, height: 256 }, [0, 0, 0, 1]);

  it("reads each tile once, however often it is requested", async () => {
    const readTile = vi.fn(source.readTile);
    const cache = new TileCache({ ...source, readTile });
    cache.request(tile(0));
    cache.request(tile(0));
    await cache.idle();
    cache.request(tile(0));
    await cache.idle();
    expect(readTile).toHaveBeenCalledTimes(1);
  });

  it("drops the least recently used tile past its budget", async () => {
    const bytes = 256 * 256 * 16;
    const cache = new TileCache(source, bytes * 2);
    for (const x of [0, 1]) cache.request(tile(x));
    await cache.idle();
    cache.peek(tile(0));
    cache.request(tile(2));
    await cache.idle();
    expect(cache.peek(tile(1))).toBeUndefined();
    expect(cache.peek(tile(0))).toBeDefined();
    expect(cache.bytes).toBe(bytes * 2);
  });

  it("reports a failed read and rejects waiters", async () => {
    const onError = vi.fn();
    const cache = new TileCache({ ...source, readTile: () => Promise.reject(new Error("offline")) });
    cache.onError = onError;
    cache.request(tile(0));
    await expect(cache.idle()).rejects.toThrow("offline");
    expect(onError).toHaveBeenCalledOnce();
    expect(cache.peek(tile(0))).toBeUndefined();
  });
});

describe("assembling regions", () => {
  const size = { width: 600, height: 300 };
  const image = coordinates(size.width, size.height);

  async function ready(rect: { x: number; y: number; width: number; height: number }) {
    const cache = new TileCache(pixelSource(image));
    expect(assembleRegion(cache, size, 0, rect)).toBeNull();
    await cache.idle();
    return assembleRegion(cache, size, 0, rect)!;
  }

  it("joins pixels across tile boundaries", async () => {
    const out = await ready({ x: 250, y: 250, width: 20, height: 20 });
    expect(at(out, 0, 0).slice(0, 2)).toEqual([250, 250]);
    expect(at(out, 19, 19).slice(0, 2)).toEqual([269, 269]);
    expect(at(out, 6, 6).slice(0, 2)).toEqual([256, 256]);
  });

  it("repeats the nearest edge past the document", async () => {
    const out = await ready({ x: -2, y: -2, width: 4, height: 4 });
    expect(at(out, 0, 0).slice(0, 2)).toEqual([0, 0]);
    expect(at(out, 3, 3).slice(0, 2)).toEqual([1, 1]);
    const far = await ready({ x: 598, y: 298, width: 4, height: 4 });
    expect(at(far, 3, 3).slice(0, 2)).toEqual([599, 299]);
  });
});

describe("documents", () => {
  const source = solidSource(doc, [0, 0, 0, 1]);

  it("raises its revision and tells subscribers on every change", () => {
    const document = createImageDocument(doc);
    const listener = vi.fn();
    const stop = document.subscribe(listener);
    const layer = document.addLayer({ source });
    document.updateLayer(layer.id, { opacity: 0.5 });
    expect(document.revision).toBe(2);
    expect(document.layers[0]?.opacity).toBe(0.5);
    stop();
    document.removeLayer(layer.id);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(document.layers).toHaveLength(0);
  });

  it("refuses a layer of the wrong size", () => {
    const document = createImageDocument({ width: 10, height: 10 });
    expect(() => document.addLayer({ source })).toThrow(RangeError);
  });
});
