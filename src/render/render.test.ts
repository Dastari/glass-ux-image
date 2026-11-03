import { describe, expect, it, vi } from "vitest";
import { createImageDocument, createPixels, pixelSource, pixelsToRgba8, solidSource, type PixelBuffer, type TileSource } from "../core/index.js";
import { adjust, NEUTRAL_ADJUST } from "../filters/adjust.js";
import { gaussianBlur, gaussianKernel } from "../filters/gaussian-blur.js";
import { sharpen } from "../filters/sharpen.js";
import { blendPixels } from "./blend.js";
import { composeDocument } from "./compose.js";
import { CpuBackend } from "./cpu-backend.js";
import { Renderer } from "./renderer.js";

/** The CPU backend with its canvas taken away, so a renderer runs without a browser. */
class HeadlessBackend extends CpuBackend {
  drawn = 0;
  override get canvas() {
    return { width: 1, height: 1 } as HTMLCanvasElement;
  }
  override resize() {}
  override present(draws: readonly unknown[]) {
    this.drawn = draws.length;
  }
}

/** Noise with a fixed seed: hard edges everywhere, so any seam shows up as a difference. */
function noise(width: number, height: number): PixelBuffer {
  const out = createPixels(width, height);
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < out.data.length; i += 4) out.data.set([next(), next(), next(), 1], i);
  return out;
}

function start(source: TileSource, view = { zoom: 1, width: 4000, height: 4000 }) {
  const document = createImageDocument(source);
  const backend = new HeadlessBackend();
  const renderer = new Renderer({ document, backend });
  renderer.setView({ ...view, centerX: source.width / 2, centerY: source.height / 2 });
  return { document, backend, renderer };
}

/** Read the whole level 0 composite back through the renderer's tiles. */
function readAll(renderer: Renderer, width: number, height: number) {
  const out = createPixels(width, height);
  for (let ty = 0; ty * 256 < height; ty++) {
    for (let tx = 0; tx * 256 < width; tx++) {
      const tile = renderer.readTile({ level: 0, x: tx, y: ty })!;
      for (let row = 0; row < tile.height; row++) {
        const from = row * tile.width * 4;
        out.data.set(tile.data.subarray(from, from + tile.width * 4), ((ty * 256 + row) * width + tx * 256) * 4);
      }
    }
  }
  return out;
}

const frame = { x: 0, y: 0, width: 600, height: 400, documentWidth: 600, documentHeight: 400 };
const context = { inputs: {}, textures: {} };

const worst = (a: PixelBuffer, b: PixelBuffer) => a.data.reduce((most, value, i) => Math.max(most, Math.abs(value - b.data[i]!)), 0);

describe("blending", () => {
  const one = (r: number, a: number) => {
    const p = createPixels(1, 1);
    p.data.set([r * a, 0, 0, a]);
    return p;
  };
  const blended = (mode: "normal" | "multiply" | "screen", opacity = 1) => {
    const base = one(0.5, 1);
    blendPixels(base, one(0.5, 1), 0, 0, mode, opacity);
    return base.data[0];
  };

  it("matches the textbook results for opaque pixels", () => {
    expect(blended("normal")).toBeCloseTo(0.5);
    expect(blended("multiply")).toBeCloseTo(0.25);
    expect(blended("screen")).toBeCloseTo(0.75);
  });

  it("leaves the base alone at zero opacity", () => {
    expect(blended("multiply", 0)).toBeCloseTo(0.5);
  });

  it("keeps a transparent top from changing anything", () => {
    const base = one(0.5, 1);
    blendPixels(base, createPixels(1, 1), 0, 0, "screen", 1);
    expect(base.data[0]).toBeCloseTo(0.5);
  });

  it("reads the top from its offset", () => {
    const top = createPixels(3, 1);
    top.data.set([0, 0, 0, 1, 0.8, 0, 0, 1, 0, 0, 0, 1]);
    const base = createPixels(1, 1);
    blendPixels(base, top, 1, 0, "normal", 1);
    expect(base.data[0]).toBeCloseTo(0.8);
  });
});

describe("gaussian blur", () => {
  it("has a kernel that sums to one", () => {
    const kernel = gaussianKernel(4);
    const total = kernel.reduce((sum, weight, i) => sum + (i === 0 ? weight : weight * 2), 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("leaves a flat colour unchanged, including at the edges", () => {
    const image = createPixels(8, 8);
    for (let i = 0; i < image.data.length; i += 4) image.data.set([0.25, 0.5, 0.75, 1], i);
    const target = createPixels(8, 8);
    for (const pass of gaussianBlur.passes({ sigma: 2 }, 1, frame)) pass.cpu(image, target, context);
    expect(worst(image, target)).toBeLessThan(1e-5);
  });

  it("does nothing, and needs no padding, when too small to see", () => {
    expect(gaussianBlur.passes({ sigma: 0 }, 1, frame)).toEqual([]);
    expect(gaussianBlur.padding({ sigma: 0 }, 1)).toBe(0);
    expect(gaussianBlur.passes({ sigma: 1 }, 1 / 32, frame)).toEqual([]);
  });

  it("scales with the level being drawn", () => {
    expect(gaussianBlur.padding({ sigma: 8 }, 1)).toBe(24);
    expect(gaussianBlur.padding({ sigma: 8 }, 1 / 4)).toBe(6);
  });
});

describe("adjust", () => {
  const pixel = (r: number, g: number, b: number, a = 1) => {
    const p = createPixels(1, 1);
    p.data.set([r * a, g * a, b * a, a]);
    return p;
  };
  const run = (source: PixelBuffer, params: Partial<typeof NEUTRAL_ADJUST>) => {
    const target = createPixels(1, 1);
    const [pass] = adjust.passes({ ...NEUTRAL_ADJUST, ...params }, 1, frame);
    pass!.cpu(source, target, context);
    return [...target.data];
  };

  it("has no passes when neutral", () => {
    expect(adjust.passes(NEUTRAL_ADJUST, 1, frame)).toEqual([]);
  });

  it("doubles light at two thirds brightness, which is one stop", () => {
    expect(run(pixel(0.1, 0.1, 0.1), { brightness: 100 / 1.5 })[0]).toBeCloseTo(0.2, 4);
  });

  it("keeps middle grey where it is under contrast, and spreads what surrounds it", () => {
    expect(run(pixel(0.18, 0.18, 0.18), { contrast: 60 })[0]).toBeCloseTo(0.18, 4);
    expect(run(pixel(0.5, 0.5, 0.5), { contrast: 60 })[0]).toBeGreaterThan(0.5);
    expect(run(pixel(0.05, 0.05, 0.05), { contrast: 60 })[0]).toBeLessThan(0.05);
  });

  it("removes all colour at -100 saturation", () => {
    const [r, g, b] = run(pixel(0.8, 0.2, 0.1), { saturation: -100 });
    expect(r).toBeCloseTo(g!, 5);
    expect(g).toBeCloseTo(b!, 5);
  });

  it("warms by adding red and taking blue", () => {
    const [r, , b] = run(pixel(0.5, 0.5, 0.5), { warmth: 50 });
    expect(r).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
  });

  it("works on the colour, so alpha is untouched and stays premultiplied", () => {
    const opaque = run(pixel(0.4, 0.3, 0.2), { brightness: 30, contrast: 20 });
    const half = run(pixel(0.4, 0.3, 0.2, 0.5), { brightness: 30, contrast: 20 });
    expect(half[3]).toBe(0.5);
    expect(half[0]).toBeCloseTo(opaque[0]! * 0.5, 5);
  });

  it("leaves transparent pixels alone", () => {
    expect(run(createPixels(1, 1), { brightness: 50 })).toEqual([0, 0, 0, 0]);
  });
});

describe("sharpen", () => {
  it("has no passes at zero, or below the level where detail is left", () => {
    expect(sharpen.passes({ amount: 0 }, 1, frame)).toEqual([]);
    expect(sharpen.passes({ amount: 50 }, 1 / 8, frame)).toEqual([]);
    expect(sharpen.padding({ amount: 50 }, 1 / 8)).toBe(0);
  });

  it("leaves a flat colour unchanged", () => {
    const image = createPixels(9, 9);
    for (let i = 0; i < image.data.length; i += 4) image.data.set([0.25, 0.5, 0.75, 1], i);
    const target = createPixels(9, 9);
    sharpen.passes({ amount: 80 }, 1, frame)[0]!.cpu(image, target, context);
    expect(worst(image, target)).toBeLessThan(1e-5);
  });

  it("raises an edge and stays inside the valid range", () => {
    const image = createPixels(9, 1);
    for (let x = 0; x < 9; x++) image.data.set(x < 5 ? [0.2, 0.2, 0.2, 1] : [0.8, 0.8, 0.8, 1], x * 4);
    const target = createPixels(9, 1);
    sharpen.passes({ amount: 100 }, 1, frame)[0]!.cpu(image, target, context);
    expect(target.data[5 * 4]).toBeGreaterThan(0.8);
    expect(target.data[4 * 4]).toBeLessThan(0.2);
    for (let i = 0; i < target.data.length; i += 4) expect(target.data[i]).toBeLessThanOrEqual(target.data[i + 3]!);
  });
});

describe("export", () => {
  it("matches the composed tiles, and reports progress and cancellation", async () => {
    const image = noise(600, 400);
    const document = createImageDocument(image);
    document.addLayer({ source: pixelSource(image), filters: [{ filter: gaussianBlur, params: { sigma: 3 } }] });
    const progress: number[] = [];
    const { width, height, bytes } = await composeDocument(new HeadlessBackend(), document, { onProgress: (value) => progress.push(value) });
    expect([width, height]).toEqual([600, 400]);
    expect(progress.at(-1)).toBe(1);

    const { renderer } = (() => {
      const backend = new HeadlessBackend();
      const live = new Renderer({ document, backend });
      live.setView({ width: 600, height: 400, zoom: 1, centerX: 300, centerY: 200 });
      return { renderer: live };
    })();
    await renderer.settle();
    const expected = pixelsToRgba8(readAll(renderer, 600, 400));
    expect(bytes).toEqual(expected);

    const controller = new AbortController();
    controller.abort(new Error("Stopped"));
    await expect(composeDocument(new HeadlessBackend(), document, { signal: controller.signal })).rejects.toThrow("Stopped");
  });

  it("composes a coarser level for a smaller result", async () => {
    const document = createImageDocument({ width: 600, height: 400 });
    document.addLayer({ source: pixelSource(noise(600, 400)) });
    const { width, height } = await composeDocument(new HeadlessBackend(), document, { level: 1 });
    expect([width, height]).toEqual([300, 200]);
  });
});

describe("renderer", () => {
  it("draws nothing wrong for a document with no layers", async () => {
    const { renderer, document } = start(solidSource({ width: 300, height: 300 }, [0, 0, 0, 0]));
    expect(document.layers).toHaveLength(0);
    await renderer.settle();
    expect(renderer.stats.pendingTiles).toBe(0);
  });

  it("composes a layer exactly, tile by tile", async () => {
    const image = noise(600, 400);
    const { document, renderer } = start(pixelSource(image));
    document.addLayer({ source: pixelSource(image) });
    await renderer.settle();
    expect(worst(readAll(renderer, 600, 400), image)).toBe(0);
  });

  it("blurs across tile boundaries with no seam", async () => {
    const image = noise(600, 400);
    const source = pixelSource(image);
    const { document, renderer } = start(source);
    document.addLayer({ source, filters: [{ filter: gaussianBlur, params: { sigma: 6 } }] });
    await renderer.settle();

    // The same blur over the whole image at once: tiling must not change a single pixel.
    let whole = image;
    for (const pass of gaussianBlur.passes({ sigma: 6 }, 1, frame)) {
      const target = createPixels(600, 400);
      pass.cpu(whole, target, context);
      whole = target;
    }
    expect(worst(readAll(renderer, 600, 400), whole)).toBeLessThan(1e-4);
  });

  it("stacks layers bottom to top", async () => {
    const size = { width: 300, height: 300 };
    const { document, renderer } = start(solidSource(size, [0, 0, 0, 0]));
    document.addLayer({ source: solidSource(size, [0.5, 0.5, 0.5, 1]) });
    document.addLayer({ source: solidSource(size, [0.5, 0, 0, 1]), blend: "multiply" });
    await renderer.settle();
    const [r, g] = renderer.readTile({ level: 0, x: 0, y: 0 })!.data;
    expect(r).toBeCloseTo(0.25);
    expect(g).toBeCloseTo(0);
  });

  it("recomposes after a change, and skips hidden layers", async () => {
    const size = { width: 300, height: 300 };
    const { document, renderer } = start(solidSource(size, [0, 0, 0, 0]));
    const layer = document.addLayer({ source: solidSource(size, [1, 1, 1, 1]) });
    await renderer.settle();
    expect(renderer.readTile({ level: 0, x: 0, y: 0 })!.data[0]).toBeCloseTo(1);
    document.updateLayer(layer.id, { visible: false });
    await renderer.settle();
    expect(renderer.readTile({ level: 0, x: 0, y: 0 })!.data[0]).toBe(0);
  });

  it("settles within frame budgets and yields to other tasks instead of composing every tile in one task", async () => {
    let clock = 0, taskRan = false;
    const clockSpy = vi.spyOn(performance, "now").mockImplementation(() => clock += 3);
    const source = solidSource({ width: 600, height: 600 }, [1, 1, 1, 1]);
    const document = createImageDocument(source); document.addLayer({ source });
    const frames: number[] = [];
    const renderer = new Renderer({ document, backend: new HeadlessBackend(), onFrame: stats => frames.push(stats.composedTiles) });
    renderer.setView({ width: 600, height: 600, zoom: 1, centerX: 300, centerY: 300 });
    const timer = setTimeout(() => { taskRan = true; }, 0);
    try {
      await renderer.settle();
      expect(taskRan).toBe(true);
      expect(frames.filter(count => count > 0).length).toBeGreaterThan(1);
      expect(renderer.stats.pendingTiles).toBe(0);
    } finally { clearTimeout(timer); clockSpy.mockRestore(); renderer.dispose(); document.dispose(); }
  });

  it("reports dirty tiles immediately between frames instead of the last frame's zero", async () => {
    const source = solidSource({ width: 600, height: 600 }, [1, 1, 1, 1]);
    const { document, renderer } = start(source, { zoom: 1, width: 600, height: 600 });
    document.addLayer({ source });
    await renderer.settle();
    const frames = renderer.stats.frames;
    expect(renderer.stats.pendingTiles).toBe(0);
    document.invalidate({ x: 30, y: 30, width: 8, height: 8 });
    expect(renderer.stats.frames).toBe(frames);
    expect(renderer.stats.pendingTiles).toBe(2); // one visible tile and its coarse fallback
    await renderer.settle();
    expect(renderer.stats.pendingTiles).toBe(0);
    renderer.dispose();
  });

  it("does not stall while slow tiles load, and shows them when they arrive", async () => {
    let release!: () => void;
    const gate = new Promise<void>((done) => (release = done));
    const size = { width: 600, height: 600 };
    const solid = solidSource(size, [1, 0, 0, 1]);
    const slow: TileSource = { ...size, readTile: async (tile) => (await gate, solid.readTile(tile)) };
    const { document, renderer, backend } = start(solidSource(size, [0, 0, 0, 0]), { zoom: 1, width: 600, height: 600 });
    document.addLayer({ source: slow });
    renderer.frame();
    expect(renderer.stats.pendingTiles).toBeGreaterThan(0);
    expect(backend.drawn).toBe(0);
    release();
    await renderer.settle();
    expect(renderer.stats.pendingTiles).toBe(0);
    expect(backend.drawn).toBe(9);
  });

  it("draws a coarser tile until the sharp one is ready", async () => {
    const size = { width: 1000, height: 1000 };
    const source = solidSource(size, [1, 1, 1, 1]);
    const { document, renderer, backend } = start(solidSource(size, [0, 0, 0, 0]), { zoom: 0.25, width: 250, height: 250 });
    document.addLayer({ source });
    await renderer.settle();
    backend.drawn = 0;
    renderer.setView({ width: 400, height: 400, zoom: 1, centerX: 500, centerY: 500 });
    renderer.frame(0);
    expect(renderer.stats.pendingTiles).toBeGreaterThan(0);
    expect(backend.drawn).toBeGreaterThan(0);
  });

  it("composes at most what the frame budget allows, plus one", async () => {
    const size = { width: 2000, height: 2000 };
    const { document, renderer } = start(solidSource(size, [0, 0, 0, 0]));
    document.addLayer({ source: solidSource(size, [1, 1, 1, 1]) });
    await renderer.settle();
    document.updateLayer(document.layers[0]!.id, { opacity: 0.5 });
    renderer.frame(0);
    expect(renderer.stats.pendingTiles).toBeGreaterThan(1);
  });

  it("evicts composed tiles it is not showing, past its budget", async () => {
    const size = { width: 2560, height: 2560 };
    const document = createImageDocument(size);
    document.addLayer({ source: solidSource(size, [1, 1, 1, 1]) });
    const backend = new HeadlessBackend();
    const renderer = new Renderer({ document, backend, composedBudget: 1 });
    renderer.setView({ width: 256, height: 256, zoom: 1, centerX: 128, centerY: 128 });
    await renderer.settle();
    renderer.setView({ width: 256, height: 256, zoom: 1, centerX: 2400, centerY: 2400 });
    await renderer.settle();
    expect(renderer.readTile({ level: 0, x: 0, y: 0 })).toBeUndefined();
  });

  it("reports a source that fails instead of throwing", async () => {
    const size = { width: 100, height: 100 };
    const onError = vi.fn();
    const document = createImageDocument(size);
    document.addLayer({ source: { ...size, readTile: () => Promise.reject(new Error("offline")) } });
    const renderer = new Renderer({ document, backend: new HeadlessBackend(), onError });
    renderer.setView({ width: 100, height: 100, zoom: 1, centerX: 50, centerY: 50 });
    renderer.frame();
    await new Promise((done) => setTimeout(done));
    expect(onError).toHaveBeenCalled();
  });

  it("keeps the last picture up when the document changes, until the new one can draw", async () => {
    const size = { width: 300, height: 300 };
    const { document, renderer, backend } = start(solidSource(size, [0, 0, 0, 0]));
    document.addLayer({ source: solidSource(size, [1, 1, 1, 1]) });
    await renderer.settle();
    const present = vi.spyOn(backend, "present");
    const next = createImageDocument(size);
    next.addLayer({ source: { ...size, readTile: () => new Promise(() => {}) } });
    renderer.setDocument(next);
    renderer.frame();
    expect(present).not.toHaveBeenCalled();
  });

  it("moves to the fallback when its backend is lost", async () => {
    const size = { width: 300, height: 300 };
    const document = createImageDocument(size);
    document.addLayer({ source: solidSource(size, [1, 1, 1, 1]) });
    let lose: (reason: string) => void = () => {};
    class Fragile extends HeadlessBackend {
      override onLost(listener: (reason: string) => void) {
        lose = listener;
        return () => {};
      }
    }
    const replacement = new HeadlessBackend();
    const onBackendChange = vi.fn();
    const renderer = new Renderer({ document, backend: new Fragile(), fallback: () => replacement, onBackendChange });
    renderer.setView({ width: 300, height: 300, zoom: 1, centerX: 150, centerY: 150 });
    await renderer.settle();
    lose("context lost");
    expect(renderer.backend).toBe(replacement);
    expect(onBackendChange).toHaveBeenCalledWith(replacement);
    await renderer.settle();
    expect(renderer.readTile({ level: 0, x: 0, y: 0 })!.data[0]).toBeCloseTo(1);
  });
});

describe("Phase 0 filter and dirty-tile contracts",()=>{
  it("supplies padded global frames, saved inputs and RGBA data textures, without leaking surfaces",async()=>{
    const backend=new HeadlessBackend(),size={width:600,height:10},document=createImageDocument(size);
    document.addLayer({source:solidSource(size,[.2,.1,0,.5]),filters:[{
      filter:{
        id:"context-test",padding:()=>3,
        passes(_params,_scale,frame){
          return [
            {id:"keep",save:"original",glsl:"",uniforms:{},cpu:(a,b)=>b.data.set(a.data)},
            {id:"zero",glsl:"",uniforms:{},cpu:(_a,b)=>b.data.fill(0)},
            {id:"combine",glsl:"",uniforms:{},inputs:{uOriginal:"original"},textures:{uTable:{width:1,height:1,data:new Float32Array([.1,0,0,1])}},cpu(a,b,context){
              for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
                const i=(y*a.width+x)*4;
                b.data[i]=context.inputs.uOriginal!.data[i]!+context.textures.uTable!.data[0]!+Math.max(0,Math.min(599,frame.x+x))/frame.documentWidth*.1;
                b.data[i+3]=.5;
              }
            }}
          ];
        }
      },params:{}
    }]});
    const renderer=new Renderer({document,backend});renderer.setView({width:600,height:10,centerX:300,centerY:5,zoom:1});await renderer.settle();
    for(const x of [0,255,256,599])expect(renderer.readTile({level:0,x:Math.floor(x/256),y:0})!.data[(x%256)*4]).toBeCloseTo(.3+x/600*.1);
    renderer.dispose();expect(backend.bytes).toBe(0);
  });
  it("retains both regions when several invalidations arrive before the next frame",async()=>{
    const size={width:768,height:256},source=solidSource(size,[1,0,0,1]),{renderer,document,backend}=start(source);
    document.addLayer({source});await renderer.settle();
    const blend=vi.spyOn(backend,"blend");
    document.invalidate({x:20,y:50,width:2,height:2});document.invalidate({x:600,y:50,width:2,height:2});
    await renderer.settle();
    expect(blend).toHaveBeenCalledTimes(3); // two distant tiles and the coarsest fallback
    renderer.dispose();
  });
});
