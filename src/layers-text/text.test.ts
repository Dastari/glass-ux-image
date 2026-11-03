import { describe, expect, it, vi } from "vitest";
import { pixelsFromRgba8 } from "../core/pixels.js";
import { AssetStore, defineLayerKind } from "../core/layers.js";
import { createTextLayerKind, createTextSource, layoutText, whenFontReady, wrapText,
  type TextCanvas, type TextSpec } from "./index.js";

const spec: TextSpec = { content: "abc", fontFamily: "sans-serif", fontWeight: 400,
  fontStyle: "normal", fontSize: 10, colour: [1, 0, 0, 1], alignment: "start", direction: "ltr",
  lineHeight: 12, letterSpacing: 0, boxWidth: null };
const measure = (text: string) => [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(text)].length * 10;
function fake() {
  let current = spec;
  const begin = vi.fn();
  const draw = vi.fn();
  const canvas: TextCanvas = {
    configure(next) { current = next; },
    measure(text) {
      const width = measure(text);
      const anchor = current.alignment === "center" ? width / 2 :
        (current.alignment === "start" ? current.direction === "rtl" : current.direction === "ltr") ? width : 0;
      return { width, actualBoundingBoxLeft: anchor + 2, actualBoundingBoxRight: width - anchor + 3,
        actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 3 };
    },
    begin, draw,
    read(width, height) {
      const bytes = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < bytes.length; i += 4) bytes.set([128, 64, 255, 128], i);
      return bytes;
    },
  };
  return { canvas, begin, draw };
}

describe("pure text layout", () => {
  it("wraps at words, keeps explicit blank lines, normalises newlines", () => {
    expect(wrapText("one two\r\n\nend\r", 35, measure)).toEqual(["one", "two", "", "end", ""]);
    expect(wrapText("one two", null, measure)).toEqual(["one two"]);
  });
  it("never splits combining sequences, emoji families or flags", () => {
    const clusters = ["e\u0301", "👨‍👩‍👧‍👦", "🇦🇺"];
    expect(wrapText(clusters.join(""), 10, measure)).toEqual(clusters);
    expect(wrapText("👨‍👩‍👧‍👦", 1, measure)).toEqual(["👨‍👩‍👧‍👦"]);
  });
  it("uses supplied shaping widths rather than summing character widths", () => {
    expect(wrapText("fi fi", 2, text => text.replaceAll("fi", "x").length)).toEqual(["fi", "fi"]);
  });
  it.each([ ["ltr", "start", 0], ["ltr", "end", 100], ["rtl", "start", 100],
    ["rtl", "end", 0], ["rtl", "center", 50] ] as const)("anchors %s %s", (direction, alignment, x) => {
    const layout = layoutText({ ...spec, content: "אב\nג", direction, alignment, boxWidth: 100 }, measure);
    expect(layout.lines.map(line => line.x)).toEqual([x, x]);
    expect(layout.lines.map(line => line.baseline)).toEqual([0, 12]);
  });
  it("rejects invalid wrap widths", () => { expect(() => wrapText("a", 0, measure)).toThrow(RangeError); });
});

describe("text rasteriser and tiles", () => {
  it("measures overhang, ascent and descent; converts bytes exactly as image decoding", () => {
    const f = fake();
    const source = createTextSource(spec, { canvas: () => f.canvas });
    expect(source.bounds).toEqual({ x: -3, y: -9, width: 37, height: 13 });
    const pixels = source.readTile({ level: 0, x: 0, y: 0 });
    expect(pixels.data.slice(0, 4)).toEqual(pixelsFromRgba8(new Uint8ClampedArray([128, 64, 255, 128]), 1, 1).data);
    expect(f.begin).toHaveBeenCalledWith(37, 13, 1, -3, -9);
  });
  it("renders the requested level directly, keeping wrap and baselines stable", () => {
    const f = fake();
    const source = createTextSource({ ...spec, content: "one two", boxWidth: 35 }, { canvas: () => f.canvas });
    const pixels = source.readTile({ level: 2, x: 0, y: 0 });
    expect(pixels.width).toBe(Math.ceil(source.width / 4));
    expect(f.begin.mock.calls[0]![2]).toBe(0.25);
    expect(f.draw.mock.calls.map(call => [call[0], call[2], call[4]])).toEqual([["one", 0, 0.25], ["two", 12, 0.25]]);
  });
  it("caches by level, protects cached pixels, snapshots specs and invalidates on change", () => {
    const f = fake(), mutable = { ...spec };
    const source = createTextSource(mutable, { canvas: () => f.canvas });
    mutable.content = "external mutation";
    const tile = { level: 0, x: 0, y: 0 };
    source.readTile(tile).data.fill(0);
    expect(source.readTile(tile).data[0]).toBeGreaterThan(0);
    expect(f.begin).toHaveBeenCalledTimes(1);
    expect(f.draw.mock.calls[0]![0]).toBe("abc");
    const listener = vi.fn(), unsubscribe = source.invalidated!(listener);
    source.update({ ...spec });
    expect(listener).not.toHaveBeenCalled();
    source.update({ ...spec, content: "longer" });
    expect(source.cacheBytes).toBe(0);
    expect(listener).toHaveBeenCalledWith({ x: 0, y: 0, width: source.width, height: source.height });
    source.readTile(tile);
    source.invalidate();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe(); source.invalidate(); expect(listener).toHaveBeenCalledTimes(2);
  });
  it("enforces the byte budget and evicts least recently used tiles", () => {
    const f = fake();
    const source = createTextSource({ ...spec, content: "a".repeat(60) }, { canvas: () => f.canvas, maxCacheBytes: 256 * 13 * 16 });
    const a = { level: 0, x: 0, y: 0 }, b = { ...a, x: 1 };
    source.readTile(a); source.readTile(b); source.readTile(a);
    expect(f.begin).toHaveBeenCalledTimes(3);
    expect(source.cacheBytes).toBeLessThanOrEqual(256 * 13 * 16);
    const noCache = createTextSource(spec, { canvas: () => f.canvas, maxCacheBytes: 0 });
    noCache.readTile(a); expect(noCache.cacheBytes).toBe(0);
  });
  it("reads edge tiles and rejects invalid addresses", () => {
    const source = createTextSource({ ...spec, content: "a".repeat(60) }, { canvas: () => fake().canvas });
    expect(source.readTile({ level: 0, x: 2, y: 0 }).width).toBe(source.width - 512);
    for (const tile of [{ level: -1, x: 0, y: 0 }, { level: 0, x: 3, y: 0 }, { level: 0.5, x: 0, y: 0 }]) {
      expect(() => source.readTile(tile)).toThrow(RangeError);
    }
  });
  it("includes outline and shadow extents in the bounds", () => {
    const source = createTextSource({ ...spec, outline: { width: 2, colour: [0, 0, 0, 1] },
      shadow: { offsetX: -5, offsetY: 4, blur: 3, colour: [0, 0, 0, 0.5] } }, { canvas: () => fake().canvas });
    expect(source.bounds).toEqual({ x: -19, y: -16, width: 59, height: 35 });
  });
  it("reuses equal spec snapshots and bounds the layer-kind source cache", () => {
    const canvas = vi.fn(() => fake().canvas);
    const kind = createTextLayerKind({ canvas, maxSources: 1 });
    const layer = { id: "text", name: "Text", kind: "text", visible: true, opacity: 1,
      blend: "normal" as const, quad: [[0, 0], [100, 0], [100, 100], [0, 100]] as const, data: spec };
    const context = { assets: new AssetStore() };
    const first = kind.source(layer, context);
    expect(kind.source({ ...layer, id: "another", data: { ...spec } }, context)).toBe(first);
    expect(canvas).toHaveBeenCalledTimes(1);
    expect(kind.source({ ...layer, data: { ...spec, content: "different" } }, context)).not.toBe(first);
    expect(kind.source(layer, context)).not.toBe(first);
    expect(canvas).toHaveBeenCalledTimes(3);
  });
  it("rejects invalid dimensions and limits before rasterising", () => {
    const canvas = () => fake().canvas;
    expect(() => createTextSource({ ...spec, fontSize: 0 }, { canvas })).toThrow(RangeError);
    expect(() => createTextSource({ ...spec, letterSpacing: NaN }, { canvas })).toThrow(RangeError);
    expect(() => createTextSource(spec, { canvas, maxCacheBytes: -1 })).toThrow(RangeError);
    expect(() => createTextLayerKind({ maxSources: 0 })).toThrow(RangeError);
  });
  it("implements the landed core LayerKind contract without session dependencies", () => {
    const kind = defineLayerKind(createTextLayerKind({ canvas: () => fake().canvas }));
    const source = kind.source({ id: "text", name: "Text", kind: "text", visible: true, opacity: 1,
      blend: "normal", quad: [[0, 0], [100, 0], [100, 100], [0, 100]], data: spec }, { assets: new AssetStore() });
    expect(kind.kind).toBe("text"); expect(source.width).toBe(37);
  });
});

describe("font readiness", () => {
  it("reports loading, missing faces and rejected loads", async () => {
    expect(await whenFontReady(spec, { fonts: { load: async () => [{}] } })).toBe(true);
    expect(await whenFontReady(spec, { fonts: { load: async () => [] } })).toBe(false);
    expect(await whenFontReady(spec, { fonts: { load: async () => { throw new Error("failed"); } } })).toBe(false);
    expect(await whenFontReady(spec)).toBe(false);
  });
  it("times out a hanging font set", async () => {
    vi.useFakeTimers();
    try {
      const pending = whenFontReady(spec, { timeoutMs: 20, fonts: { load: () => new Promise(() => {}) } });
      await vi.advanceTimersByTimeAsync(20); expect(await pending).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
