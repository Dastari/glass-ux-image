/* tokens:allow-file Converts composited image pixels to display colours. */
import { createPixels, pixelsToRgba8, type FilterPass, type PixelBuffer } from "../core/index.js";
import { blendPixels } from "./blend.js";
import type { BackendInfo, BlendOptions, Draw, PresentOptions, RenderBackend, Surface } from "./types.js";

class CpuSurface implements Surface {
  /** The surface in sRGB bytes, made the first time it is shown. */
  picture?: OffscreenCanvas;
  constructor(readonly pixels: PixelBuffer) {}
  get width() {
    return this.pixels.width;
  }
  get height() {
    return this.pixels.height;
  }
}

const css = ([r, g, b]: readonly [number, number, number]) => `rgb(${r * 255} ${g * 255} ${b * 255})`;

/** Everything in TypeScript, so it runs where WebGL2 does not and in tests without a browser. */
export class CpuBackend implements RenderBackend {
  readonly info: BackendInfo;
  readonly lost = false;
  #canvas?: HTMLCanvasElement;
  #bytes = 0;

  constructor(options: { fallbackReason?: string } = {}) {
    this.info = { kind: "cpu", ...options };
  }

  get canvas() {
    this.#canvas ??= document.createElement("canvas");
    return this.#canvas;
  }

  get bytes() {
    return this.#bytes;
  }

  #wrap(pixels: PixelBuffer) {
    this.#bytes += pixels.data.byteLength;
    return new CpuSurface(pixels);
  }

  upload(pixels: PixelBuffer) {
    return this.#wrap({ ...pixels, data: pixels.data.slice() });
  }

  allocate(width: number, height: number) {
    return this.#wrap(createPixels(width, height));
  }

  release(surface: Surface) {
    this.#bytes -= (surface as CpuSurface).pixels.data.byteLength;
  }

  runPass(pass: FilterPass, source: Surface, target: Surface, inputs: Readonly<Record<string, Surface>> = {}) {
    pass.cpu((source as CpuSurface).pixels, (target as CpuSurface).pixels, { inputs: Object.fromEntries(Object.entries(inputs).map(([name, surface]) => [name, (surface as CpuSurface).pixels])), textures: pass.textures ?? {} });
  }

  blend(base: Surface, top: Surface, { offsetX, offsetY, mode, opacity }: BlendOptions) {
    const out = this.upload((base as CpuSurface).pixels);
    blendPixels(out.pixels, (top as CpuSurface).pixels, offsetX, offsetY, mode, opacity);
    return out;
  }

  read(surface: Surface) {
    const { pixels } = surface as CpuSurface;
    return { ...pixels, data: pixels.data.slice() };
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  present(draws: readonly Draw[], { background, pixelated }: PresentOptions) {
    const context = this.canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.imageSmoothingEnabled = !pixelated;
    context.fillStyle = css(background);
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const { surface, source: s, target: t } of draws) {
      context.drawImage(this.#picture(surface as CpuSurface), s.x, s.y, s.width, s.height, t.x, t.y, t.width, t.height);
    }
  }

  #picture(surface: CpuSurface) {
    if (surface.picture) return surface.picture;
    const picture = new OffscreenCanvas(surface.width, surface.height);
    const bytes = pixelsToRgba8(surface.pixels) as ImageDataArray;
    picture.getContext("2d")!.putImageData(new ImageData(bytes, surface.width, surface.height), 0, 0);
    surface.picture = picture;
    return picture;
  }

  onLost(_listener: (reason: string) => void) {
    return () => {};
  }

  dispose() {}
}
