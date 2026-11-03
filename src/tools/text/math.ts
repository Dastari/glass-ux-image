import { homography, rectQuad, type LayerSpec, type Point, type Quad, type Rect } from "../../core/index.js";
/** Place a measured bitmap so its text anchor lies at the requested work-space point. */
export function textQuad(bounds: Rect, anchor: Point): Quad {
  const x = anchor[0] + bounds.x, y = anchor[1] + bounds.y;
  return [[x, y], [x + bounds.width, y], [x + bounds.width, y + bounds.height], [x, y + bounds.height]];
}
/** Preserve the existing projective transform and text anchor as glyph bounds change. */
export function remeasureTextQuad(layer: LayerSpec, oldBounds: Rect, nextBounds: Rect): Quad {
  const map = homography(rectQuad(oldBounds), layer.quad);
  const dx = nextBounds.x - oldBounds.x, dy = nextBounds.y - oldBounds.y;
  const quad = [[dx, dy], [dx + nextBounds.width, dy], [dx + nextBounds.width, dy + nextBounds.height], [dx, dy + nextBounds.height]];
  const result = quad.map(p => map(p[0]!, p[1]!));
  if (result.some(p => p === null)) throw new RangeError("Text edit crosses projective horizon");
  return result as unknown as Quad;
}

/** CSS projective transform from a local bitmap rectangle to a screen quad. */
export function textEditorTransform(quad: Quad, width: number, height: number): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(denominator) < 1e-12) throw new RangeError("Singular editor quad");
  const g = (sx * dy2 - dx2 * sy) / denominator, h = (dx1 * sy - sx * dy1) / denominator;
  return `matrix3d(${[(x1 - x0 + g * x1) / width, (y1 - y0 + g * y1) / width, 0, g / width,
    (x3 - x0 + h * x3) / height, (y3 - y0 + h * y3) / height, 0, h / height,
    0, 0, 1, 0, x0, y0, 0, 1].join(",")})`;
}
