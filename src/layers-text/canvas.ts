/* tokens:allow-file Converts document text colours to canvas paint. */
import { textFont, type TextSpec } from "./spec.js";
/** Small DOM boundary, injectable in tests and non-browser hosts. */
export interface TextCanvas {
  /** Configure font, native letter spacing, direction and logical alignment. */
  configure(spec: TextSpec): void;
  /** Native shaped advance and actual ink extents, relative to the configured anchor. */
  measure(text: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number;
    actualBoundingBoxAscent: number; actualBoundingBoxDescent: number };
  /** Reset to transparency and map document coordinates to bitmap pixels. */
  begin(width: number, height: number, scale: number, originX: number, originY: number): void;
  /** Draw one complete shaped line with effects, keeping bidirectional runs intact. */
  draw(text: string, x: number, baseline: number, spec: TextSpec, scale: number): void;
  /** Read straight-alpha sRGB bytes from the top-left bitmap rectangle. */
  read(width: number, height: number): Uint8ClampedArray;
}
export type TextCanvasFactory = () => TextCanvas;
const cssColour = (c: readonly number[]) => `rgba(${c[0]! * 255},${c[1]! * 255},${c[2]! * 255},${c[3]})`;
/** Canvas 2D on OffscreenCanvas; never creates a document element. */
export const createTextCanvas: TextCanvasFactory = () => {
  const canvas = new OffscreenCanvas(1, 1);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable");
  const configure = (spec: TextSpec) => {
    context.font = textFont(spec);
    context.direction = spec.direction;
    context.textAlign = spec.alignment;
    context.textBaseline = "alphabetic";
    if (!("letterSpacing" in context) && spec.letterSpacing !== 0) throw new Error("Canvas letterSpacing is unavailable");
    context.letterSpacing = `${spec.letterSpacing}px`;
  };
  return {
    configure,
    measure: text => context.measureText(text),
    begin(width, height, scale, originX, originY) {
      canvas.width = width; canvas.height = height;
      context.setTransform(scale, 0, 0, scale, -originX * scale, -originY * scale);
    },
    draw(text, x, baseline, spec, scale) {
      configure(spec);
      context.fillStyle = cssColour(spec.colour);
      context.lineJoin = "round";
      context.shadowColor = spec.shadow ? cssColour(spec.shadow.colour) : "transparent";
      context.shadowBlur = (spec.shadow?.blur ?? 0) * scale;
      context.shadowOffsetX = (spec.shadow?.offsetX ?? 0) * scale;
      context.shadowOffsetY = (spec.shadow?.offsetY ?? 0) * scale;
      if (spec.outline && spec.outline.width > 0) {
        context.strokeStyle = cssColour(spec.outline.colour);
        context.lineWidth = spec.outline.width * 2;
        context.strokeText(text, x, baseline);
      }
      context.fillText(text, x, baseline);
    },
    read: (width, height) => context.getImageData(0, 0, width, height, { colorSpace: "srgb" }).data,
  };
};
