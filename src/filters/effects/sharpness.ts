import { defineFilter } from '../../core/filter.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { common, perceptual, colour, encodeColour, decode, luma, safe, savePass, strength } from './shared.js';
/** amount=0 is neutral; radius is Gaussian sigma in document pixels (default 1.2). */
export interface SharpnessParams {
    /** Effect amount; 0 is neutral and 1 is full strength. */
    amount: number;
    /** Sampling radius in document pixels. */
    radius?: number;
}
/** Perceptual gain on the detail at full strength: 120% for unsharp mask, 80% for detail enhancement. */
const GAIN = { unsharp: 1.2, detail: .8 };
/**
 * Sharpness works on perceptual luminance, as Lightroom's sharpening does: the detail is the difference between
 * the picture and its Gaussian blur, added to every channel alike, so edges gain contrast without colour
 * fringes. Detail enhancement weights it towards the midtones, for local contrast without clipping. High pass
 * keeps each channel's detail around a perceptual mid grey, as Photoshop's High Pass shows it.
 */
function sharpness(id: string, mode: 'unsharp' | 'high' | 'detail') {
    return defineFilter<SharpnessParams>({ id, padding: (p, s) => strength(p.amount) ? gaussianBlur.padding({ sigma: Math.max(0, safe(p.radius ?? 1.2)) }, s) : 0,
        passes(p, scale, frame) {
            const amount = strength(p.amount), blur = gaussianBlur.passes({ sigma: Math.max(0, safe(p.radius ?? 1.2)) }, scale, frame);
            if (!amount || !blur.length)
                return [];
            const gain = mode === 'high' ? 1 : GAIN[mode];
            const expression = mode === 'high' ? 'vec3(.5)+e-b' : mode === 'detail' ? 'e+vec3((luminance(e)-luminance(b))*uGain*(1.0-abs(2.0*clamp(luminance(e),0.0,1.0)-1.0)))' : 'e+vec3((luminance(e)-luminance(b))*uGain)';
            return [savePass('original'), ...blur, { id, inputs: { uOriginal: 'original' }, uniforms: { uAmount: amount, uGain: gain },
                    glsl: `${common}\n${perceptual}\nuniform sampler2D uOriginal; uniform float uGain; vec4 filterPixel(ivec2 p){vec4 original=texelFetch(uOriginal,p,0); vec3 c=straight(original),e=encode(c),b=encode(straight(readAt(p))); return vec4(max(mix(c,decode(${expression}),uAmount),vec3(0))*original.a,original.a);}`,
                    cpu(s, t, ctx) {
                        const o = ctx.inputs.uOriginal!;
                        for (let i = 0; i < s.data.length; i += 4) {
                            const c = colour(o.data.subarray(i, i + 4) as unknown as number[]), e = encodeColour(c), b = encodeColour(colour(s.data.subarray(i, i + 4) as unknown as number[])), a = o.data[i + 3]!;
                            const l = luma(e), d = (l - luma(b)) * gain * (mode === 'detail' ? 1 - Math.abs(2 * Math.min(1, Math.max(0, l)) - 1) : 1);
                            for (let k = 0; k < 3; k++) {
                                const result = decode(mode === 'high' ? .5 + e[k]! - b[k]! : e[k]! + d);
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
