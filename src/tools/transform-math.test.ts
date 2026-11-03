import { describe, it, expect } from 'vitest';
import { rectQuad } from '../core/index.js';
import { anchoredCanvas, canvasFill, horizonAngle, levelAngle, lineLean, transformQuad, validQuad, wrapAngle } from './transform-math.js';
describe('geometry maths', () => {
    it('anchors canvas expansion and shrink at all nine cells', () => { for (let n = 0; n < 9; n++) {
        const anchor = n as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
        expect(anchoredCanvas({ width: 100, height: 80 }, { width: 200, height: 120 }, anchor)).toEqual({ x: -100 * (n % 3) / 2, y: -40 * Math.floor(n / 3) / 2, width: 200, height: 120 });
    } });
    it('ignores stale rectangle origins when reanchoring', () => { const old = { x: 100, y: 0, width: 200, height: 100 }; expect(anchoredCanvas({ width: 400, height: 300 }, old, 4)).toEqual({ x: 100, y: 100, width: 200, height: 100 }); });
    it('levels a horizon in either drag direction', () => { expect(horizonAngle([0, 0], [100, 100])).toBe(-45); expect(horizonAngle([100, 100], [0, 0])).toBe(-45); });
    it('measures a line against the nearest axis, clockwise positive', () => {
        expect(lineLean([0, 0], [100, 10]).axis).toBe('horizontal');
        expect(lineLean([0, 0], [100, 10]).lean).toBeCloseTo(5.71, 2);
        expect(lineLean([100, 10], [0, 0]).lean).toBeCloseTo(5.71, 2);
        expect(lineLean([0, 0], [10, 100])).toEqual({ axis: 'vertical', lean: expect.closeTo(-5.71, 2) });
        expect(lineLean([0, 0], [-10, 100]).lean).toBeCloseTo(5.71, 2);
    });
    it('levels a line from the angle already applied, wrapping past a half turn', () => {
        expect(levelAngle(0, [0, 0], [100, 10])).toBeCloseTo(-5.71, 2);
        expect(levelAngle(3, [0, 0], [10, 100])).toBeCloseTo(8.71, 2);
        expect(levelAngle(178, [0, 0], [100, -10])).toBeCloseTo(-176.29, 2);
        expect(wrapAngle(-180)).toBe(180);
        expect(wrapAngle(540)).toBe(180);
    });
    it('rotates and translates quads without changing their centre', () => { const q = rectQuad({ width: 100, height: 50 }); expect(transformQuad(q, 1, 1, 180, 0, 10, 20)[0]![0]).toBeCloseTo(110); expect(validQuad(transformQuad(q, 2, .5, 37, 12))).toBe(true); expect(validQuad([[0, 0], [100, 0], [0, 100], [100, 100]])).toBe(false); });
    it('converts sRGB fill to linear premultiplied pixels', () => { expect(canvasFill('#ff000080')).toEqual([128 / 255, 0, 0, 128 / 255]); expect(canvasFill('#808080')[0]).toBeCloseTo(.21586, 4); });
});
