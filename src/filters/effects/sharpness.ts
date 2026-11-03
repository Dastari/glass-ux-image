import { defineFilter, type FilterPass } from '../../core/filter.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { common, colour, safe, strength } from './shared.js';
/** amount=0 is neutral; radius is Gaussian sigma in document pixels (default 1.2). */
export interface SharpnessParams {
    /** Effect amount; 0 is neutral and 1 is full strength. */
    amount: number;
    /** Sampling radius in document pixels. */
    radius?: number;
}
function sharpness(id: string, mode: 'unsharp' | 'high' | 'detail') {
    return defineFilter<SharpnessParams>({ id, padding: (p, s) => strength(p.amount) ? gaussianBlur.padding({ sigma: Math.max(0, safe(p.radius ?? 1.2)) }, s) : 0,
        passes(p, scale, frame) {
            const amount = strength(p.amount), blur = gaussianBlur.passes({ sigma: Math.max(0, safe(p.radius ?? 1.2)) }, scale, frame);
            if (!amount || !blur.length)
                return [];
            const save: FilterPass = { id: 'effects-original', save: 'original', uniforms: {}, glsl: 'vec4 filterPixel(ivec2 p){return texelFetch(uSource,p,0);}', cpu: (s, t) => t.data.set(s.data) };
            const expression = mode === 'high' ? 'vec3(.5)+c-b' : mode === 'detail' ? 'c+(c-b)*(1.0-abs(2.0*luminance(c)-1.0)) * 2.0' : 'c+(c-b)*2.0';
            return [save, ...blur, { id, inputs: { uOriginal: 'original' }, uniforms: { uAmount: amount },
                    glsl: `${common}\nuniform sampler2D uOriginal; vec4 filterPixel(ivec2 p){vec4 original=texelFetch(uOriginal,p,0); vec3 c=straight(original),b=straight(readAt(p)); return vec4(max(mix(c,${expression},uAmount),vec3(0))*original.a,original.a);}`,
                    cpu(s, t, ctx) {
                        const o = ctx.inputs.uOriginal!;
                        for (let i = 0; i < s.data.length; i += 4) {
                            const c = colour(Array.from(o.data.subarray(i, i + 4))), b = colour(Array.from(s.data.subarray(i, i + 4))), a = o.data[i + 3]!;
                            const weight = mode === 'detail' ? 2 * (1 - Math.abs(2 * (c[0] * .2126 + c[1] * .7152 + c[2] * .0722) - 1)) : 2;
                            for (let k = 0; k < 3; k++) {
                                const result = mode === 'high' ? .5 + c[k]! - b[k]! : c[k]! + (c[k]! - b[k]!) * weight;
                                t.data[i + k] = Math.max(0, c[k]! + (result - c[k]!) * amount) * a;
                            }
                            t.data[i + 3] = a;
                        }
                    }
                }];
        }
    });
}
/** Sharpen by subtracting a Gaussian low-frequency estimate from the source. */
export const unsharpMask = /* @__PURE__ */ sharpness('unsharp-mask', 'unsharp');
/** Extract detail around neutral grey using a Gaussian low-frequency estimate. */
export const highPass = /* @__PURE__ */ sharpness('high-pass', 'high');
/** Increase local detail using a bounded high-frequency estimate. */
export const detailEnhancement = /* @__PURE__ */ sharpness('detail-enhancement', 'detail');
