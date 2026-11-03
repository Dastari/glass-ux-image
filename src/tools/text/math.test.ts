import { expect, it } from "vitest";
import { remeasureTextQuad, textQuad, textEditorTransform } from "./math.js";
import { homography, rectQuad, type LayerSpec } from "../../core/index.js";
it("places actual glyph overhang relative to the baseline anchor", () => {
  expect(textQuad({ x: -5, y: -40, width: 90, height: 50 }, [100, 80])).toEqual([[95, 40], [185, 40], [185, 90], [95, 90]]);
});
it("remeasures text without losing its transformed baseline anchor", () => {
  const old = { x: -5, y: -40, width: 90, height: 50 }, next = { x: -10, y: -45, width: 150, height: 80 };
  const layer = { quad: [[20, 30], [130, 45], [120, 100], [5, 80]] } as unknown as LayerSpec;
  const updated = remeasureTextQuad(layer, old, next);
  const before = homography(rectQuad(old), layer.quad)(-old.x, -old.y);
  const after = homography(rectQuad(next), updated)(-next.x, -next.y);
  expect(after![0]).toBeCloseTo(before![0], 8); expect(after![1]).toBeCloseTo(before![1], 8);
});

it("positions the editor through the same projective quad as the glyph bitmap", () => {
  const quad = [[20, 30], [130, 45], [120, 100], [5, 80]] as const;
  const css = textEditorTransform(quad, 90, 50);
  const matrix = css.slice(9, -1).split(",").map(Number);
  for (const [i, [x, y]] of [[0, 0], [90, 0], [90, 50], [0, 50]].entries()) {
    const w = matrix[3]! * x! + matrix[7]! * y! + 1;
    expect((matrix[0]! * x! + matrix[4]! * y! + matrix[12]!) / w).toBeCloseTo(quad[i]![0], 8);
    expect((matrix[1]! * x! + matrix[5]! * y! + matrix[13]!) / w).toBeCloseTo(quad[i]![1], 8);
  }
});
