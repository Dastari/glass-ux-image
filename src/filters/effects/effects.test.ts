import { describe, expect, it } from 'vitest';
import type { Filter, FilterFrame } from '../../core/filter.js';
import { createPixels, type PixelBuffer } from '../../core/pixels.js';
import * as effects from './index.js';
import { hash } from './shared.js';
const identity = effects.generateLut(2, c => c);
const cases: [
    Filter<any>,
    Record<string, unknown>
][] = [
    [effects.motionBlur, { radius: 2, angle: 23 }], [effects.radialBlur, { radius: 2 }], [effects.lensBlur, { radius: 2 }], [effects.tiltShift, { radius: 1, focus: .4, band: .2 }],
    [effects.unsharpMask, { radius: 1 }], [effects.highPass, { radius: 1 }], [effects.detailEnhancement, { radius: 1 }],
    [effects.oilPainting, { radius: 2 }], [effects.pencilSketch, { radius: 2 }], [effects.watercolour, { radius: 2 }], [effects.cartoon, { radius: 2 }],
    [effects.sepia, {}], [effects.filmGrain, { seed: -2147483647, size: 2 }], [effects.faded, {}],
    [effects.bloom, { radius: 1, threshold: .3 }], [effects.glow, { radius: 1 }], [effects.lensFlare, { radius: 10 }], [effects.vignette, {}],
    [effects.pixelate, { size: 7 }], [effects.mosaic, { size: 7 }], [effects.halftone, { size: 7 }],
    [effects.addNoise, { seed: 2147483647 }], [effects.reduceNoise, { radius: 2 }], [effects.removeGrain, {}],
    [effects.posterise, { levels: 4 }], [effects.threshold, {}], [effects.solarise, {}], [effects.emboss, { radius: 2 }],
    [effects.lutGrading, { lut: effects.generateLut(3, c => [c[2], c[0], c[1]]) }]
];
function frame(source: PixelBuffer, x = 0, y = 0, width = source.width, height = source.height): FilterFrame { return { x, y, width: source.width, height: source.height, documentWidth: width, documentHeight: height }; }
function run(filter: Filter<any>, params: Record<string, unknown>, source: PixelBuffer, f = frame(source), scale = 1): PixelBuffer {
    let current = source;
    const saved: Record<string, PixelBuffer> = {};
    for (const pass of filter.passes(params, scale, f)) {
        const target = createPixels(source.width, source.height), inputs: Record<string, PixelBuffer> = {};
        for (const [key, value] of Object.entries(pass.inputs ?? {}))
            inputs[key] = saved[value]!;
        pass.cpu(current, target, { inputs, textures: pass.textures ?? {} });
        if (pass.save)
            saved[pass.save] = target;
        current = target;
    }
    return current;
}
function picture(width = 42, height = 26): PixelBuffer {
    const p = createPixels(width, height);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4, a = (x + 2 * y) % 9 === 0 ? 0 : .25 + hash(x, y) * .75;
            p.data.set([hash(x, y, 2) * a, hash(x, y, 3) * a, hash(x, y, 4) * a, a], i);
        }
    return p;
}
function crop(p: PixelBuffer, x: number, y: number, width: number, height: number): PixelBuffer {
    const t = createPixels(width, height);
    for (let row = 0; row < height; row++)
        t.data.set(p.data.subarray(((row + y) * p.width + x) * 4, ((row + y) * p.width + x + width) * 4), row * width * 4);
    return t;
}
for (const [filter, params] of cases)
    describe(filter.id, () => {
        it('neutral returns no passes and is identity', () => { const p = picture(); expect(filter.passes({ ...params, amount: 0 }, 1, frame(p))).toEqual([]); expect(run(filter, { ...params, amount: 0 }, p)).toBe(p); expect(filter.padding({ ...params, amount: 0 }, 1)).toBe(0); });
        it('is deterministic and alpha safe', () => {
            const p = picture(9, 8), paramsOn = { ...params, amount: .8 }, a = run(filter, paramsOn, p), b = run(filter, paramsOn, p);
            expect(a.data).toEqual(b.data);
            for (let i = 0; i < a.data.length; i += 4) {
                expect(a.data[i + 3]).toBeGreaterThanOrEqual(0);
                expect(a.data[i + 3]).toBeLessThanOrEqual(1.000001);
                for (let k = 0; k < 3; k++) {
                    expect(Number.isFinite(a.data[i + k])).toBe(true);
                    expect(a.data[i + k]).toBeGreaterThanOrEqual(0);
                    if (a.data[i + 3] === 0)
                        expect(a.data[i + k]).toBe(0);
                }
            }
        });
        it.each([1, .25])('whole matches two overlapping horizontal and vertical tiles at scale %s', scale => {
            const p = picture(), on = { ...params, amount: .7 }, whole = run(filter, on, p, frame(p), scale), padding = filter.padding(on, scale);
            for (const vertical of [false, true])
                for (const half of [0, 1]) {
                    const length = vertical ? p.height : p.width, split = Math.floor(length / 2), start = half ? split : 0, end = half ? length : split, lo = Math.max(0, start - padding), hi = Math.min(length, end + padding);
                    const tile = vertical ? crop(p, 0, lo, p.width, hi - lo) : crop(p, lo, 0, hi - lo, p.height), f = frame(tile, vertical ? 0 : lo, vertical ? lo : 0, p.width, p.height), out = run(filter, on, tile, f, scale);
                    for (let y = vertical ? start : 0; y < (vertical ? end : p.height); y++)
                        for (let x = vertical ? 0 : start; x < (vertical ? p.width : end); x++)
                            for (let k = 0; k < 4; k++) {
                                const index = ((y - (vertical ? lo : 0)) * tile.width + x - (vertical ? 0 : lo)) * 4 + k;
                                expect(out.data[index]).toBeCloseTo(whole.data[(y * p.width + x) * 4 + k]!, 5);
                            }
                }
        });
    });
it('known linear-light sepia, faded, threshold and posterise values', () => { const p = createPixels(1, 1); p.data.set([.25, .125, .0625, .5]); const c = run(effects.sepia, { amount: 1 }, p); expect(c.data[0]).toBeCloseTo((.5 * .393 + .25 * .769 + .125 * .189) * .5); expect(run(effects.faded, { amount: 1 }, p).data[0]).toBeCloseTo(.24); expect(run(effects.threshold, { amount: 1, pivot: .28 }, p).data[0]).toBe(.5); expect(run(effects.posterise, { amount: 1, levels: 3 }, p).data[0]).toBe(.25); });
it('blur preserves constant premultiplied colours; high-pass gives mid grey', () => {
    const p = createPixels(9, 9);
    for (let i = 0; i < p.data.length; i += 4)
        p.data.set([.1, .2, .3, .5], i);
    for (const filter of [effects.motionBlur, effects.radialBlur, effects.lensBlur, effects.tiltShift]) {
        const out = run(filter, { amount: 1, radius: 1 }, p);
        out.data.forEach((v, i) => expect(v).toBeCloseTo(p.data[i]!, 6));
    }
    expect(run(effects.highPass, { amount: 1, radius: 1 }, p).data[0]).toBeCloseTo(.25);
});
it('transparent input stays exactly transparent in every effect', () => {
    for (const [filter, params] of cases)
        expect(run(filter, { ...params, amount: 1 }, createPixels(4, 3)).data).toEqual(new Float32Array(48));
});
it('document-pixel radii and grain cells scale with previews', () => { const p = picture(), f = frame(p); expect(effects.motionBlur.passes({ amount: 1, radius: 20 }, .25, f)[0]!.uniforms.uRadius).toBe(5); const c = effects.addNoise.passes({ amount: 1, size: 4 }, .25, f)[0]!; expect(c.uniforms.uScale).toBe(.25); expect(c.uniforms.uSize).toBe(4); });
it('hash has stable integer vectors and signed seed wrap', () => { expect(hash(0, 0)).toBe(0); expect(hash(1, 2, 3)).toBe(0.3663558945991099); expect(hash(-1, -2, -3)).toBe(hash(-1, -2, 4294967293)); });
for (const warp of [effects.fisheye, effects.wave, effects.ripple, effects.twirl])
    it(`${warp.id}: neutral identity, finite deterministic mapping`, () => { const size = { width: 100, height: 80 }; expect(warp.map(23, 31, { amount: 0 }, size)).toEqual([23, 31]); const p = { amount: .7 }; expect(warp.map(23, 31, p, size)).toEqual(warp.map(23, 31, p, size)); expect(warp.map(23, 31, p, size).every(Number.isFinite)).toBe(true); expect(warp.map(50, 40, p, size).every(Number.isFinite)).toBe(true); });
it('identity and channel-swap LUTs use trilinear lookup, domains, and float32 atlas', () => {
    expect(effects.lookupLut(identity, [.23, .52, .78])).toEqual([.23, .52, .78]);
    const swap = effects.generateLut(3, c => [c[2], c[0], c[1]]);
    expect(effects.lookupLut(swap, [.23, .52, .78])).toEqual([.78, .23, .52]);
    const lut = { ...identity, domainMin: [-1, -1, -1] as [
            number,
            number,
            number
        ], domainMax: [1, 1, 1] as [
            number,
            number,
            number
        ] };
    expect(effects.lookupLut(lut, [0, 0, 0])).toEqual([.5, .5, .5]);
    expect(effects.lookupLut(identity, [-1, 2, .5])).toEqual([0, 1, .5]);
    const a = effects.lutAtlas(swap);
    expect([a.width, a.height]).toEqual([9, 3]);
    expect(Array.from(a.data.slice((1 * 9 + 2 * 3 + 0) * 4, (1 * 9 + 2 * 3 + 0) * 4 + 4))).toEqual([1, 0, .5, 1]);
});
it('local artistic and denoise kernels have known flat-field results', () => {
    const p = createPixels(7, 7);
    for (let i = 0; i < p.data.length; i += 4)
        p.data.set([.125, .125, .125, .5], i);
    for (const effect of [effects.oilPainting, effects.reduceNoise, effects.removeGrain, effects.watercolour])
        expect(run(effect, { amount: 1, radius: 2 }, p).data[0]).toBeCloseTo(.125);
    expect(run(effects.pencilSketch, { amount: 1 }, p).data[0]).toBeCloseTo(.5);
    expect(run(effects.emboss, { amount: 1 }, p).data[0]).toBeCloseTo(.25);
    expect(run(effects.cartoon, { amount: 1 }, p).data[0]).toBeCloseTo(.1);
});
it('pixelate and mosaic use document-aligned cell samples', () => {
    const p = createPixels(4, 4);
    for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
            p.data.set([x / 4, y / 4, 0, 1], (y * 4 + x) * 4);
    expect(run(effects.pixelate, { amount: 1, size: 2 }, p).data[0]).toBeCloseTo(.125);
    expect(run(effects.mosaic, { amount: 1, size: 2 }, p).data[(1 * 4 + 1) * 4]).toBeCloseTo(.1388888889);
});
it('vignette preserves the document centre and darkens edges; glow preserves alpha', () => {
    const p = createPixels(5, 5);
    for (let i = 0; i < p.data.length; i += 4)
        p.data.set([.5, .5, .5, .5], i);
    const v = run(effects.vignette, { amount: 1 }, p);
    expect(v.data[12 * 4]).toBe(.5);
    expect(v.data[0]).toBeLessThan(.5);
    const g = run(effects.glow, { amount: 1, radius: 1 }, p);
    expect(g.data[0]).toBeCloseTo(.75);
    expect(g.data[3]).toBe(.5);
});
it('solarise and seeded noise have known channel values', () => {
    const p = createPixels(1, 1);
    p.data.set([.4, .1, .2, .5]);
    expect(run(effects.solarise, { amount: 1 }, p).data[0]).toBeCloseTo(.1);
    const out = run(effects.addNoise, { amount: 1, seed: 3 }, p);
    expect(out.data[0]).toBeCloseTo((.8 + hash(0, 0, 3) - .5) * .5);
});
it('effects leave their input untouched', () => {
    for (const [effect, params] of cases) {
        const p = picture(5, 5), before = p.data.slice();
        run(effect, { ...params, amount: 1 }, p);
        expect(p.data).toEqual(before);
    }
});
it('distortion maps are output-to-source with documented units', () => {
    const size = { width: 100, height: 80 };
    expect(effects.wave.map(10, 10, { amount: 5, wavelength: 40 }, size)).toEqual([15, 10]);
    const [x, y] = effects.twirl.map(60, 40, { amount: Math.PI, radius: 20 }, size);
    expect(x).toBeCloseTo(50 + 10 * Math.SQRT1_2);
    expect(y).toBeCloseTo(40 + 10 * Math.SQRT1_2);
});
it('LUT interpolation mixes all eight corners rather than slicing blue', () => {
    const lut = effects.generateLut(2, c => [c[0] * c[1] * c[2], c[0] * c[2], c[1] * c[2]]);
    const out = effects.lookupLut(lut, [.2, .4, .8]);
    expect(out[0]).toBeCloseTo(.064);
    expect(out[1]).toBeCloseTo(.16);
    expect(out[2]).toBeCloseTo(.32);
});
