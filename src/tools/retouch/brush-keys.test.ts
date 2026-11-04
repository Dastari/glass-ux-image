import { describe, expect, it } from 'vitest';
import { nextBrushHardness, nextBrushSize } from './brush-keys.js';

describe('brush keys', () => {
  it("steps size on Photoshop's scale, within the picker's range", () => {
    expect(nextBrushSize(1, -1)).toBe(1);
    expect(nextBrushSize(5, 1)).toBe(6);
    expect(nextBrushSize(10, 1)).toBe(15);
    expect(nextBrushSize(10, -1)).toBe(9);
    expect(nextBrushSize(12, 1)).toBe(15);
    expect(nextBrushSize(12, -1)).toBe(10);
    expect(nextBrushSize(50, 1)).toBe(60);
    expect(nextBrushSize(100, 1)).toBe(125);
    expect(nextBrushSize(250, 1)).toBe(300);
    expect(nextBrushSize(450, 1)).toBe(500);
    expect(nextBrushSize(500, 1)).toBe(500);
  });
  it('steps hardness in quarters', () => {
    expect(nextBrushHardness(.8, 1)).toBe(1);
    expect(nextBrushHardness(.8, -1)).toBe(.75);
    expect(nextBrushHardness(.75, -1)).toBe(.5);
    expect(nextBrushHardness(0, -1)).toBe(0);
  });
});
