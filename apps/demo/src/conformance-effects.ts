import * as effects from 'glass-ux-image/filters/effects';
import { effectStack } from 'glass-ux-image/filters/effects/stack';
import { type Filter, type PixelBuffer, createPixels } from 'glass-ux-image/core';
import { CpuBackend, WebGL2Backend, type RenderBackend, type Surface } from 'glass-ux-image/render';
import { layer, noise, type Scene } from './conformance-source';
const definitions: [
    Filter<any>,
    Record<string, unknown>
][] = [
    [effectStack, { entries: [{ id: 'a', filter: 'unsharp-mask', params: { amount: .4, radius: 2 }, strength: .7 }, { id: 'b', filter: 'unsharp-mask', params: { amount: .3, radius: 1 }, strength: .8 }, { id: 'c', filter: 'sepia', params: { amount: .4 }, strength: .6 }] }],
    [effects.gaussianBlur, { sigma: 3 }], [effects.motionBlur, { amount: .7, radius: 5, angle: 27 }], [effects.radialBlur, { amount: .8, radius: 4 }], [effects.lensBlur, { amount: .7, radius: 4 }], [effects.tiltShift, { amount: .7, radius: 2, band: .2 }],
    [effects.unsharpMask, { amount: .6, radius: 2 }], [effects.highPass, { amount: .7, radius: 2 }], [effects.detailEnhancement, { amount: .6, radius: 2 }],
    [effects.oilPainting, { amount: .8, radius: 2 }], [effects.pencilSketch, { amount: .7, radius: 2 }], [effects.watercolour, { amount: .8, radius: 2 }], [effects.cartoon, { amount: .8, radius: 2 }],
    [effects.sepia, { amount: .8 }], [effects.filmGrain, { amount: .7, seed: -2147483647, size: 2 }], [effects.faded, { amount: .8 }],
    [effects.bloom, { amount: .7, radius: 2, threshold: .4 }], [effects.glow, { amount: .7, radius: 2 }], [effects.lensFlare, { amount: .7, radius: 80 }], [effects.vignette, { amount: .8 }],
    [effects.pixelate, { amount: .8, size: 13 }], [effects.mosaic, { amount: .8, size: 13 }], [effects.halftone, { amount: .8, size: 13 }],
    [effects.addNoise, { amount: .7, seed: 2147483647 }], [effects.reduceNoise, { amount: .8, radius: 2 }], [effects.removeGrain, { amount: .8 }],
    [effects.posterise, { amount: .8, levels: 6 }], [effects.threshold, { amount: .8, pivot: .4 }], [effects.solarise, { amount: .8, pivot: .6 }], [effects.emboss, { amount: .7, radius: 2 }],
    [effects.lutGrading, { amount: .8, lut: effects.generateLut(5, c => [c[2] ** .8, c[0] * .9, c[1] ** 1.2]) }],
    [effects.colourGrade, { amount: .9, warmth: .4, tint: -.2, mono: .3, mix: [.4, .5, .1], contrast: .5, saturation: .3, shadows: [-.03, .01, .05], highlights: [.05, .02, -.04], fade: .3 }]
];
export const effectsScenes: Record<string, Scene> = Object.fromEntries(definitions.map(([filter, params], i) => [`effects: ${filter.id}`, doc => void doc.addLayer({ source: layer(100 + i, .6), filters: [{ filter, params }] })]));
function execute(backend: RenderBackend, filter: Filter<any>, params: Record<string, unknown>, source: PixelBuffer, x: number, y: number, documentWidth: number, documentHeight: number, scale: number) {
    const allocated: Surface[] = [];
    const upload = backend.upload(source, filter.precision);
    allocated.push(upload);
    let current = upload;
    const saved: Record<string, Surface> = {};
    try {
        for (const pass of filter.passes(params, scale, { x, y, width: source.width, height: source.height, documentWidth, documentHeight })) {
            const target = backend.allocate(source.width, source.height, filter.precision);
            allocated.push(target);
            const inputs = Object.fromEntries(Object.entries(pass.inputs ?? {}).map(([key, value]) => [key, saved[value]!]));
            backend.runPass(pass, current, target, inputs);
            if (pass.save)
                saved[pass.save] = target;
            current = target;
        }
        return backend.read(current);
    }
    finally {
        for (const surface of allocated)
            backend.release(surface);
    }
}
const anchored = ['vignette', 'tilt-shift', 'pixelate', 'mosaic', 'halftone', 'film-grain', 'add-noise', 'radial-blur', 'lens-flare'];
/** Compare each tile's interior against a whole surface through the same backend. */
async function seams(kind: 'cpu' | 'webgl2', level: number) {
    const backend = kind === 'cpu' ? new CpuBackend() : new WebGL2Backend(), source = noise(83, 61, 71, .7), scale = 2 ** -level;
    let worst = 0;
    try {
        for (const [filter, params] of definitions.filter(([f]) => anchored.includes(f.id))) {
            const whole = execute(backend, filter, params, source, 0, 0, source.width, source.height, scale), pad = filter.padding(params, scale);
            for (const vertical of [false, true])
                for (const half of [0, 1]) {
                    const length = vertical ? source.height : source.width, split = Math.floor(length / 2), start = half ? split : 0, end = half ? length : split, lo = Math.max(0, start - pad), hi = Math.min(length, end + pad), x0 = vertical ? 0 : lo, y0 = vertical ? lo : 0, width = vertical ? source.width : hi - lo, height = vertical ? hi - lo : source.height, tile = createPixels(width, height);
                    for (let y = 0; y < height; y++)
                        tile.data.set(source.data.subarray(((y + y0) * source.width + x0) * 4, ((y + y0) * source.width + x0 + width) * 4), y * width * 4);
                    const out = execute(backend, filter, params, tile, x0, y0, source.width, source.height, scale);
                    for (let y = vertical ? start : 0; y < (vertical ? end : source.height); y++)
                        for (let x = vertical ? 0 : start; x < (vertical ? source.width : end); x++)
                            for (let c = 0; c < 4; c++)
                                worst = Math.max(worst, Math.abs(out.data[((y - y0) * width + x - x0) * 4 + c]! - whole.data[(y * source.width + x) * 4 + c]!));
                }
            await new Promise(r => setTimeout(r));
        }
        return worst;
    }
    finally {
        backend.dispose();
    }
}
window.effectsConformance = { names: Object.keys(effectsScenes), seams };
declare global {
    interface Window {
        effectsConformance: {
            names: string[];
            seams: typeof seams;
        };
    }
}
