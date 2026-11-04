import { describe, expect, it } from "vitest";
import { createImageDocument, createPixels, pixelSource } from "../core/index.js";
import { CpuBackend } from "./cpu-backend.js";
import { Renderer } from "./renderer.js";
import type { Draw, PresentOptions } from "./types.js";

/** A CPU backend that records what each presentation was asked to draw. */
class RecordingBackend extends CpuBackend {
  frames: { draws: readonly Draw[]; options: PresentOptions }[] = [];
  override get canvas() { return { width: 1, height: 1 } as HTMLCanvasElement; }
  override resize() {}
  override present(draws: readonly Draw[], options: PresentOptions) { this.frames.push({ draws, options }); }
}

async function start(grid?: ConstructorParameters<typeof Renderer>[0]["transparencyGrid"]) {
  const pixels = createPixels(300, 200);
  const document = createImageDocument(pixelSource(pixels));
  const backend = new RecordingBackend();
  const renderer = new Renderer({ document, backend, transparencyGrid: grid });
  renderer.setView({ zoom: 1.5, width: 1000, height: 800, centerX: 140, centerY: 90 });
  await renderer.settle();
  return { renderer, backend, last: () => backend.frames.at(-1)! };
}

/** The box every draw covers together: the picture's bounds on the canvas. */
function covered(draws: readonly Draw[]) {
  const left = Math.min(...draws.map(d => d.target.x)), top = Math.min(...draws.map(d => d.target.y));
  const right = Math.max(...draws.map(d => d.target.x + d.target.width)), bottom = Math.max(...draws.map(d => d.target.y + d.target.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

describe("transparency grid", () => {
  it("is off unless asked for, so the engine's presentation is unchanged", async () => {
    const { last } = await start();
    expect(last().options.grid).toBeUndefined();
  });
  it("covers exactly the picture's bounds, on the draws' rounding, and follows the view", async () => {
    const { renderer, last } = await start(true);
    const { draws, options } = last();
    expect(draws.length).toBeGreaterThan(0);
    expect(options.grid!.rect).toEqual(covered(draws));
    expect(options.grid!.cell).toBe(8);
    renderer.setView({ zoom: 0.37, width: 1000, height: 800, centerX: 10.3, centerY: 400.7 });
    await renderer.settle();
    expect(last().options.grid!.rect).toEqual(covered(last().draws));
  });
  it("takes a size and colours, and can be turned off and on without a new renderer", async () => {
    const { renderer, backend, last } = await start({ size: 12, colours: [[1, 1, 1], [0.5, 0.5, 0.5]] });
    expect(last().options.grid).toMatchObject({ cell: 12, colours: [[1, 1, 1], [0.5, 0.5, 0.5]] });
    const before = backend.frames.length;
    renderer.setTransparencyGrid(false);
    renderer.frame(1000);
    expect(backend.frames.length).toBe(before + 1);
    expect(last().options.grid).toBeUndefined();
    renderer.setTransparencyGrid(true);
    renderer.frame(1000);
    expect(last().options.grid!.cell).toBe(8);
  });
});
