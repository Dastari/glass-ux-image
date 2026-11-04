import {
  createPixels,
  type FilterPass,
  type PixelBuffer,
} from "../core/index.js";
import { blendPixels } from "./blend.js";
import type {
  BackendInfo,
  BlendOptions,
  Draw,
  PresentOptions,
  RenderBackend,
  Surface,
} from "./types.js";

export class CpuSurface implements Surface {
  /** The surface in sRGB bytes, made the first time it is shown. */
  picture?: OffscreenCanvas;
  constructor(
    readonly pixels: PixelBuffer,
    readonly displayBytes?: Uint8ClampedArray,
  ) {}
  get width() {
    return this.pixels.width;
  }
  get height() {
    return this.pixels.height;
  }
}

/** The synchronous primitives used inside the worker and by headless hosts. */
export class CpuSurfaces implements RenderBackend {
  readonly info: BackendInfo = { kind: "cpu" };
  readonly lost = false;
  #bytes = 0;
  get bytes() {
    return this.#bytes;
  }
  get canvas(): HTMLCanvasElement {
    throw new Error("Headless CPU surfaces have no canvas");
  }
  wrap(pixels: PixelBuffer, bytes?: Uint8ClampedArray) {
    this.#bytes += pixels.data.byteLength + (bytes?.byteLength ?? 0);
    return new CpuSurface(pixels, bytes);
  }

  upload(pixels: PixelBuffer) {
    return this.wrap({ ...pixels, data: pixels.data.slice() });
  }

  allocate(width: number, height: number) {
    return this.wrap(createPixels(width, height));
  }

  release(surface: Surface) {
    const cpu = surface as CpuSurface;
    this.#bytes -=
      cpu.pixels.data.byteLength + (cpu.displayBytes?.byteLength ?? 0);
  }

  runPass(
    pass: FilterPass,
    source: Surface,
    target: Surface,
    inputs: Readonly<Record<string, Surface>> = {},
  ) {
    pass.cpu((source as CpuSurface).pixels, (target as CpuSurface).pixels, {
      inputs: Object.fromEntries(
        Object.entries(inputs).map(([name, surface]) => [
          name,
          (surface as CpuSurface).pixels,
        ]),
      ),
      textures: pass.textures ?? {},
    });
  }

  blend(
    base: Surface,
    top: Surface,
    { offsetX, offsetY, mode, opacity }: BlendOptions,
  ) {
    const out = this.upload((base as CpuSurface).pixels);
    blendPixels(
      out.pixels,
      (top as CpuSurface).pixels,
      offsetX,
      offsetY,
      mode,
      opacity,
    );
    return out;
  }

  read(surface: Surface) {
    const { pixels } = surface as CpuSurface;
    return { ...pixels, data: pixels.data.slice() };
  }

  resize(_width: number, _height: number) {}
  present(_draws: readonly Draw[], _options: PresentOptions) {}
  onLost(_listener: (reason: string) => void) {
    return () => {};
  }
  dispose() {}
}
