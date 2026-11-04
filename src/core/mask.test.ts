import { describe, expect, it } from "vitest";
import { createBytePyramid } from "./byte-pyramid.js";
import { maskFillSource, maskedSource } from "./mask.js";
import { createPixels, type PixelBuffer } from "./pixels.js";
import { coarsestLevel, levelSize, tilesInRect, type Rect, type TileAddress } from "./pyramid.js";
import { pixelSource, type TileSource } from "./tile-source.js";

/** A source over a buffer that can change, counting reads per level. */
function editable(image: PixelBuffer) {
  let source = pixelSource(image);
  const listeners = new Set<(rect: Rect) => void>();
  const reads: number[] = [];
  return {
    reads,
    edit(rect: Rect, write: (i: number) => void) {
      for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) write((y * image.width + x) * 4);
      source = pixelSource(image);
      for (const listener of listeners) listener(rect);
    },
    source: {
      width: image.width,
      height: image.height,
      invalidated(listener: (rect: Rect) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      readTile(tile: TileAddress) { reads[tile.level] = (reads[tile.level] ?? 0) + 1; return source.readTile(tile); },
    } satisfies TileSource,
  };
}

/** Deterministic colour with transparent holes, and a mask with hidden, shown and soft parts. */
function scene(width: number, height: number) {
  const colour = createPixels(width, height), mask = createPixels(width, height);
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, alpha = (x + y) % 3 === 0 ? 0 : random();
    colour.data.set([random() * alpha, random() * alpha, random() * alpha, alpha], i);
    // Columns: hidden, shown, alternating hard, and soft noise.
    const band = Math.floor(x / 137) % 4;
    mask.data[i + 3] = band === 0 ? 0 : band === 1 ? 1 : band === 2 ? (x + y) % 2 : random();
  }
  return { colour, mask };
}

/** Every tile of a level, stitched into one buffer. */
async function level(source: TileSource, n: number): Promise<PixelBuffer> {
  const size = levelSize(source, n), out = createPixels(size.width, size.height);
  for (const tile of tilesInRect(source, n, { x: 0, y: 0, ...size })) {
    const pixels = await source.readTile(tile);
    for (let row = 0; row < pixels.height; row++) out.data.set(pixels.data.subarray(row * pixels.width * 4, (row + 1) * pixels.width * 4), ((tile.y * 256 + row) * size.width + tile.x * 256) * 4);
  }
  return out;
}

/** The masked picture at full resolution, then box-filtered: what each coarse level must show. */
function reference(colour: PixelBuffer, mask: PixelBuffer) {
  const product = createPixels(colour.width, colour.height);
  for (let i = 0; i < product.data.length; i += 4) for (let c = 0; c < 4; c++) product.data[i + c] = colour.data[i + c]! * mask.data[i + 3]!;
  return pixelSource(product);
}

function expectClose(actual: PixelBuffer, expected: PixelBuffer, tolerance = 1e-6) {
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  let worst = 0;
  for (let i = 0; i < actual.data.length; i++) worst = Math.max(worst, Math.abs(actual.data[i]! - expected.data[i]!));
  expect(worst).toBeLessThanOrEqual(tolerance);
}

describe("maskedSource", () => {
  it("averages masked full-resolution pixels, not the product of averages", async () => {
    // The review's case: alternating opaque red and transparent pixels, masked by matching coverage.
    const rgba = Uint8Array.from({ length: 512 * 4 }, (_, i) => (i % 8 === 0 || i % 8 === 3 ? 255 : 0));
    const source = { width: 512, height: 1, ...createBytePyramid(rgba, { width: 512, height: 1 }) };
    const masked = maskedSource(source, source);
    const fine = await masked.readTile({ level: 0, x: 0, y: 0 }), coarse = await masked.readTile({ level: 1, x: 0, y: 0 });
    expect([fine.data[3], fine.data[7]]).toEqual([1, 0]);
    expect(coarse.data[3]).toBeCloseTo(0.5, 6);
    expect(coarse.data[0]).toBeCloseTo(0.5, 6);
  });

  it("matches the box-filtered masked picture at every level, odd edges included", async () => {
    const { colour, mask } = scene(1101, 613);
    const masked = maskedSource(pixelSource(colour), pixelSource(mask)), expected = reference(colour, mask);
    expect(coarsestLevel(masked)).toBe(3);
    for (let n = 0; n <= 3; n++) expectClose(await level(masked, n), await level(expected, n));
  });

  it("keeps level 0, which export reads, the exact product", async () => {
    const { colour, mask } = scene(300, 260);
    const masked = maskedSource(pixelSource(colour), pixelSource(mask));
    expectClose(await level(masked, 0), await level(reference(colour, mask), 0), 0);
  });

  it("reads no finer level where coverage is wholly shown or hidden", async () => {
    const colour = editable(scene(1024, 1024).colour), fill = maskFillSource(colour.source, "reveal");
    const masked = maskedSource(colour.source, fill);
    await masked.readTile({ level: 2, x: 0, y: 0 });
    expect(colour.reads).toEqual([undefined, undefined, 1]);
    const hidden = maskedSource(colour.source, maskFillSource(colour.source, "hide"));
    expect((await hidden.readTile({ level: 2, x: 0, y: 0 })).data.every(value => value === 0)).toBe(true);
  });

  it("descends only under part coverage", async () => {
    const image = scene(1024, 1024).colour, cover = createPixels(1024, 1024);
    // One soft square in the top-left level 0 tile; the rest is shown.
    for (let i = 3; i < cover.data.length; i += 4) cover.data[i] = 1;
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) cover.data[(y * 1024 + x) * 4 + 3] = 0.5;
    const colour = editable(image), masked = maskedSource(colour.source, pixelSource(cover));
    expectClose(await masked.readTile({ level: 2, x: 0, y: 0 }), await reference(image, cover).readTile({ level: 2, x: 0, y: 0 }));
    expect(colour.reads).toEqual([1, 1, 1]);
  });

  it("caches coarse tiles while watched and drops them when either source changes", async () => {
    const { colour: image, mask: cover } = scene(700, 520);
    const colour = editable(image), coverage = editable(cover), masked = maskedSource(colour.source, coverage.source);
    const changes: Rect[] = [];
    const stop = masked.invalidated!(rect => changes.push(rect));
    const tile = { level: 2, x: 0, y: 0 };
    await masked.readTile(tile);
    const firstReads = colour.reads.reduce((a, b) => a + (b ?? 0), 0);
    await masked.readTile(tile);
    expect(colour.reads.reduce((a, b) => a + (b ?? 0), 0)).toBe(firstReads);

    // Hide a block of the mask, then of the layer: each change must reach the coarse level.
    coverage.edit({ x: 300, y: 200, width: 64, height: 64 }, i => { cover.data[i + 3] = 0.25; });
    expectClose(await masked.readTile(tile), await reference(image, cover).readTile(tile));
    colour.edit({ x: 40, y: 30, width: 50, height: 50 }, i => { image.data.set([0.2, 0.1, 0.05, 0.5], i); });
    expectClose(await masked.readTile(tile), await reference(image, cover).readTile(tile));
    expect(changes).toHaveLength(2);

    stop();
    // Unwatched, nothing is kept, so a silent edit still shows.
    const before = colour.reads.reduce((a, b) => a + (b ?? 0), 0);
    await masked.readTile(tile);
    expect(colour.reads.reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(before);
  });

  it("holds no more coarse tiles than its byte limit", async () => {
    const { colour: image, mask: cover } = scene(1101, 613);
    const colour = editable(image), masked = maskedSource(colour.source, pixelSource(cover), { maxBytes: 0 });
    const stop = masked.invalidated!(() => {});
    const tile = { level: 3, x: 0, y: 0 };
    await masked.readTile(tile);
    const reads = colour.reads.reduce((a, b) => a + (b ?? 0), 0);
    await masked.readTile(tile);
    expect(colour.reads.reduce((a, b) => a + (b ?? 0), 0)).toBe(2 * reads);
    stop();
  });

  it("yields between tiles on a long coarse read and honours cancellation", async () => {
    const { colour, mask } = scene(1101, 613);
    let pauses = 0;
    const controller = new AbortController();
    const masked = maskedSource(pixelSource(colour), pixelSource(mask), { yield: async () => { pauses++; controller.abort(new Error("stop")); } });
    const realNow = performance.now.bind(performance);
    let clock = 0;
    performance.now = () => (clock += 10);
    try { await expect(masked.readTile({ level: 3, x: 0, y: 0 }, controller.signal)).rejects.toThrow("stop"); }
    finally { performance.now = realNow; }
    expect(pauses).toBe(1);
  });
});
