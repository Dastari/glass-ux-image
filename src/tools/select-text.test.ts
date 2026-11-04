import { describe, expect, it } from 'vitest';
import { rectQuad } from '../core/index.js';
import { bakedTextQuad, scaleTextSpec, textEnlargement } from './select-text.js';
import { scaleQuad, translateQuad } from './select-math.js';

describe('sharp text after scaling', () => {
  it('scales every length in the spec', () => {
    const spec = { content: 'a', fontFamily: 'serif', fontWeight: 400, fontStyle: 'normal' as const, fontSize: 40, colour: [1, 1, 1, 1] as const, alignment: 'start' as const, direction: 'ltr' as const, lineHeight: 50, letterSpacing: 2, boxWidth: 300, outline: { width: 3, colour: [0, 0, 0, 1] as const }, shadow: { offsetX: 4, offsetY: -2, blur: 6, colour: [0, 0, 0, 1] as const } };
    const big = scaleTextSpec(spec, 2);
    expect([big.fontSize, big.lineHeight, big.letterSpacing, big.boxWidth, big.outline!.width, big.shadow!.offsetX, big.shadow!.offsetY, big.shadow!.blur]).toEqual([80, 100, 4, 600, 6, 8, -4, 12]);
    expect(scaleTextSpec({ ...spec, boxWidth: null }, 2).boxWidth).toBeNull();
  });
  it('measures enlargement and keeps an exactly doubled bitmap where the stretched one was', () => {
    const before = { x: -2, y: -40, width: 100, height: 50 }, quad = translateQuad(rectQuad(before), 30, 60);
    const scaled = scaleQuad(quad, 'se', [30 + 200, 60 + 100]);
    expect(textEnlargement(scaled, before)).toBeCloseTo(2, 6);
    const after = { x: -4, y: -80, width: 200, height: 100 };
    bakedTextQuad(scaled, before, after, 2).forEach((p, i) => { expect(p[0]).toBeCloseTo(scaled[i]![0], 6); expect(p[1]).toBeCloseTo(scaled[i]![1], 6); });
  });
});
