import { contextFilter } from "./conformance-context";
/* Renders the same documents on every backend, so a browser test can compare them. */
import { BLEND_MODES, createImageDocument, solidSource, type BlendMode, type PixelBuffer } from "glass-ux-image/core";
import { adjust, NEUTRAL_ADJUST } from "glass-ux-image/filters/adjust";
import { gaussianBlur } from "glass-ux-image/filters/gaussian-blur";
import { sharpen } from "glass-ux-image/filters/sharpen";
import { CpuBackend, Renderer, WebGL2Backend, type RenderBackend } from "glass-ux-image/render";
import { developScenes } from "./conformance-develop";
import { effectsScenes } from "./conformance-effects";
import { layer, SIZE, type Scene } from "./conformance-source";

export const scenes: Record<string, Scene> = {
  ...developScenes,
  ...effectsScenes,
  "filter context": (doc) => void doc.addLayer({source:layer(71),filters:[{filter:contextFilter,params:{sigma:3}}]}),
  "one layer": (doc) => void doc.addLayer({ source: layer(11) }),
  "blur, small": (doc) => void doc.addLayer({ source: layer(12), filters: [{ filter: gaussianBlur, params: { sigma: 1.5 } }] }),
  "blur, large": (doc) => void doc.addLayer({ source: layer(13), filters: [{ filter: gaussianBlur, params: { sigma: 24 } }] }),
  "blur, translucent": (doc) => void doc.addLayer({ source: layer(14, 0.6), filters: [{ filter: gaussianBlur, params: { sigma: 6 } }] }),
  "blur twice": (doc) =>
    void doc.addLayer({
      source: layer(15),
      filters: [
        { filter: gaussianBlur, params: { sigma: 3 } },
        { filter: gaussianBlur, params: { sigma: 5 } },
      ],
    }),
  "layer opacity": (doc) => {
    doc.addLayer({ source: layer(16) });
    doc.addLayer({ source: layer(17, 0.5), opacity: 0.4 });
  },
};
const adjusted = (seed: number, soften: number, params: Partial<typeof NEUTRAL_ADJUST>): Scene => (doc) =>
  void doc.addLayer({ source: layer(seed, soften), filters: [{ filter: adjust, params: { ...NEUTRAL_ADJUST, ...params } }] });
scenes["adjust: brightness"] = adjusted(51, 1, { brightness: 45 });
scenes["adjust: darker"] = adjusted(52, 1, { brightness: -70 });
scenes["adjust: contrast"] = adjusted(53, 1, { contrast: 60 });
scenes["adjust: flat"] = adjusted(54, 1, { contrast: -80 });
scenes["adjust: saturation"] = adjusted(55, 1, { saturation: 70 });
scenes["adjust: grey"] = adjusted(56, 1, { saturation: -100 });
scenes["adjust: warmth"] = adjusted(57, 1, { warmth: -60 });
scenes["adjust: all, translucent"] = adjusted(58, 0.6, { brightness: 20, contrast: 25, saturation: 30, warmth: 15 });
scenes["sharpen"] = (doc) => void doc.addLayer({ source: layer(61), filters: [{ filter: sharpen, params: { amount: 60 } }] });
scenes["sharpen, translucent"] = (doc) => void doc.addLayer({ source: layer(62, 0.6), filters: [{ filter: sharpen, params: { amount: 100 } }] });
scenes["adjust then sharpen"] = (doc) =>
  void doc.addLayer({
    source: layer(63),
    filters: [
      { filter: adjust, params: { ...NEUTRAL_ADJUST, contrast: 30, brightness: 15 } },
      { filter: sharpen, params: { amount: 40 } },
    ],
  });
for (const blend of BLEND_MODES) {
  scenes[`blend: ${blend}`] = (doc) => {
    doc.addLayer({ source: layer(21, 0.7) });
    doc.addLayer({ source: layer(22, 0.7), blend, opacity: 0.8 });
  };
}

async function render(scene: Scene, backend: RenderBackend, level: number) {
  const doc = createImageDocument(SIZE);
  scene(doc);
  const renderer = new Renderer({ document: doc, backend });
  const zoom = 2 ** -level;
  renderer.setView({ width: Math.ceil(SIZE.width * zoom), height: Math.ceil(SIZE.height * zoom), zoom, centerX: SIZE.width / 2, centerY: SIZE.height / 2 });
  await renderer.settle();
  return renderer;
}

function compare(a: PixelBuffer, b: PixelBuffer) {
  if (a.width !== b.width || a.height !== b.height) throw new Error("Tiles differ in size");
  // Half floats keep the same relative precision at every size, so a difference counts against the
  // value it sits on. Up to 1 this is the plain difference; above 1, as contrast can make, it scales.
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) {
    const size = Math.max(1, Math.abs(a.data[i]!), Math.abs(b.data[i]!));
    worst = Math.max(worst, Math.abs(a.data[i]! - b.data[i]!) / size);
  }
  return worst;
}

async function difference(scene: Scene, level: number) {
  const gpu = await render(scene, new WebGL2Backend(), level);
  const cpu = await render(scene, new CpuBackend(), level);
  let worst = 0;
  let tiles = 0;
  const rows = Math.ceil(SIZE.height / 2 ** level / 256);
  const columns = Math.ceil(SIZE.width / 2 ** level / 256);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      worst = Math.max(worst, compare(gpu.readTile({ level, x, y })!, cpu.readTile({ level, x, y })!));
      tiles++;
    }
  }
  gpu.dispose();
  cpu.dispose();
  return { worst, tiles };
}

/** A canvas pixel in 0–255, read back the way each backend's canvas allows. */
function canvasBytes(canvas: HTMLCanvasElement) {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(canvas, 0, 0);
  return context.getImageData(0, 0, copy.width, copy.height).data;
}

/** Draw a flat colour at awkward zooms. Any seam between tiles leaves a pixel of another colour. */
async function seams(backend: RenderBackend, blend: BlendMode = "normal") {
  const size = { width: 1000, height: 800 };
  const doc = createImageDocument(size);
  doc.addLayer({ source: solidSource(size, [0.2, 0.4, 0.6, 1]) });
  if(blend!=="normal")doc.addLayer({source:solidSource(size,[.3,.3,.3,1]),blend});
  const renderer = new Renderer({ document: doc, backend, background: [0, 0, 0] });
  let spread = 0;
  for (const zoom of [1, 0.73, 0.5, 0.37, 1.41, 3.3]) {
    renderer.setView({ width: 300, height: 240, zoom, centerX: 511.3, centerY: 397.7 });
    await renderer.settle();
    const bytes = canvasBytes(backend.canvas);
    const base = [bytes[0]!, bytes[1]!, bytes[2]!];
    if(!base.some(value=>value>0))throw new Error("Blank composed surface");
    for (let i = 0; i < bytes.length; i += 4) {
      for (let c = 0; c < 3; c++) spread = Math.max(spread, Math.abs(bytes[i + c]! - base[c]!));
    }
  }
  renderer.dispose();
  return spread;
}

/** Show one document at 100% on both backends and compare what reaches the screen. */
async function presentDifference() {
  const doc = () => {
    const next = createImageDocument(SIZE);
    next.addLayer({ source: layer(31), filters: [{ filter: gaussianBlur, params: { sigma: 2 } }] });
    return next;
  };
  const show = async (backend: RenderBackend) => {
    const renderer = new Renderer({ document: doc(), backend });
    renderer.setView({ width: SIZE.width, height: SIZE.height, zoom: 1, centerX: SIZE.width / 2, centerY: SIZE.height / 2 });
    await renderer.settle();
    const bytes = canvasBytes(backend.canvas);
    renderer.dispose();
    return bytes;
  };
  const gpu = await show(new WebGL2Backend());
  const cpu = await show(new CpuBackend());
  let worst = 0;
  let large = 0;
  for (let i = 0; i < gpu.length; i++) {
    const gap = Math.abs(gpu[i]! - cpu[i]!);
    worst = Math.max(worst, gap);
    if (gap > 1) large++;
  }
  return { worst, largeShare: large / gpu.length };
}

/** Does the harness notice a wrong kernel? A suite that cannot fail proves nothing. */
async function brokenKernel() {
  const broken = { ...gaussianBlur, passes: (params: { sigma: number }, scale: number, frame: import("glass-ux-image/core").FilterFrame) => gaussianBlur.passes({ sigma: params.sigma * 1.04 }, scale, frame) };
  const size = SIZE;
  const source = layer(41);
  const make = (filter: typeof gaussianBlur, backend: RenderBackend) => {
    const next = createImageDocument(size);
    next.addLayer({ source, filters: [{ filter, params: { sigma: 6 } }] });
    return new Renderer({ document: next, backend });
  };
  const view = { width: size.width, height: size.height, zoom: 1, centerX: size.width / 2, centerY: size.height / 2 };
  const gpu = make(gaussianBlur, new WebGL2Backend());
  const cpu = make(broken, new CpuBackend());
  gpu.setView(view);
  cpu.setView(view);
  await gpu.settle();
  await cpu.settle();
  const worst = compare(gpu.readTile({ level: 0, x: 0, y: 0 })!, cpu.readTile({ level: 0, x: 0, y: 0 })!);
  gpu.dispose();
  cpu.dispose();
  return worst;
}

const conformance = { names: Object.keys(scenes), difference: (name: string, level: number) => difference(scenes[name]!, level), seams: (kind: "webgl2" | "cpu", blend?: BlendMode) => seams(kind === "webgl2" ? new WebGL2Backend() : new CpuBackend(),blend), presentDifference, brokenKernel, renderer: () => new WebGL2Backend().info };

declare global {
  interface Window {
    conformance: typeof conformance;
  }
}
window.conformance = conformance;
