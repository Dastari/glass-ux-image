import type { BlendMode, FilterPass, PixelBuffer, Rect } from "../core/index.js";

import type { TileComposition } from "./compose.js";

/** Pixels held by a backend. Only that backend can read one. */
export interface Surface {
  readonly width: number;
  readonly height: number;
}

export interface BlendOptions {
  /** Where the base's top-left corner falls in `top`, which may be larger. */
  offsetX: number;
  offsetY: number;
  mode: BlendMode;
  opacity: number;
}

/** A piece of a surface to show, in the surface's pixels and the canvas's device pixels. */
export interface Draw {
  surface: Surface;
  source: Rect;
  target: Rect;
}

/** A checkerboard under the document's bounds, so transparent pixels read as transparent, as image editors draw it. */
export interface TransparencyGrid {
  /** Side of one square, in CSS pixels. Default 8. */
  size?: number;
  /** The two squares' colours, straight sRGB 0–1. Default a light and a mid grey. */
  colours?: readonly [readonly [number, number, number], readonly [number, number, number]];
}

/** A transparency grid as one frame draws it, resolved to the canvas. */
export interface PresentGrid {
  /** The document's bounds on the canvas, in device pixels, on the same rounding as the draws. */
  rect: Rect;
  /** Side of one square in whole device pixels. Squares count from the rectangle's corner, so they move with the picture. */
  cell: number;
  colours: readonly [readonly [number, number, number], readonly [number, number, number]];
}

export interface PresentOptions {
  /** Straight sRGB, 0–1, behind everything. */
  background: readonly [number, number, number];
  /** Show pixels as squares, for zoom above 100%. */
  pixelated: boolean;
  /** Drawn over the background and under the draws. */
  grid?: PresentGrid;
}

export type BackendKind = "webgl2" | "cpu";

export interface BackendInfo {
  kind: BackendKind;
  /** The GPU or driver, when the browser says. */
  renderer?: string;
  /** Why a better backend was not used. */
  fallbackReason?: string;
}

/**
 * The operations every renderer provides. All of them work in linear premultiplied RGBA, so a tile
 * composed here is the same, within rounding, whichever backend made it.
 */
export interface RenderBackend {
  readonly info: BackendInfo;
  readonly canvas: HTMLCanvasElement;
  /** Bytes currently held in surfaces. */
  readonly bytes: number;
  /** True once the backend has stopped working. Anything it read back after that is meaningless. */
  readonly lost: boolean;
  /** Full precision is used for blend functions whose divisions amplify half-float input error. */
  upload(pixels: PixelBuffer, precision?: "half" | "full"): Surface;
  allocate(width: number, height: number, precision?: "half" | "full"): Surface;
  release(surface: Surface): void;
  /** Run a filter pass from `source` into `target`, which is the same size. */
  runPass(pass: FilterPass, source: Surface, target: Surface, inputs?: Readonly<Record<string, Surface>>): void;
  /** Lay `top` over `base` into a new surface the size of `base`. Neither input changes. */
  blend(base: Surface, top: Surface, options: BlendOptions): Surface;
  read(surface: Surface): PixelBuffer;
  /** Optional off-thread tile composition. Its result belongs to the caller. */
  compose?(job: TileComposition, signal?: AbortSignal): Promise<Surface>;
  /** Set the canvas's size in device pixels. */
  resize(width: number, height: number): void;
  present(draws: readonly Draw[], options: PresentOptions): void;
  /** Called if the backend stops working. Returns the function that stops listening. */
  onLost(listener: (reason: string) => void): () => void;
  dispose(): void;
}

/** Signals that a requested rendering backend cannot initialise on this device. */
export class BackendUnavailableError extends Error {
  override name = "BackendUnavailableError";
}
