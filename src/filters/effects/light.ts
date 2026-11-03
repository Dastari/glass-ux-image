import { defineFilter, type FilterPass } from '../../core/filter.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { common, pointPass, strength, type AmountParams, type Colour } from './shared.js';
/** amount=0 is neutral. Radius is sigma in document pixels; threshold is linear luminance. */
export interface LightParams extends AmountParams {
    /** Sampling radius in document pixels. */
    radius?: number;
    /** Linear luminance threshold for bloom, default .7. */
    threshold?: number;
}
function spread(id: string, bright: boolean) {
    return defineFilter<LightParams>({ id, padding: (p, s) => strength(p.amount) ? gaussianBlur.padding({ sigma: Math.max(0, p.radius ?? 8) }, s) : 0,
        passes(p, s, f) {
            const amount = strength(p.amount), threshold = p.threshold ?? .7;
            if (!amount)
                return [];
            const original: FilterPass = { id: 'effects-original', save: 'original', uniforms: {}, glsl: 'vec4 filterPixel(ivec2 p){return texelFetch(uSource,p,0);}', cpu: (src, t) => t.data.set(src.data) };
            const extract: FilterPass = { id: `${id}-extract`, uniforms: { uThreshold: threshold }, glsl: `${common}\nuniform float uThreshold;vec4 filterPixel(ivec2 p){vec4 c=readAt(p);float l=luminance(straight(c));return c*${bright ? 'max(0.0,l-uThreshold)/max(l,.000001)' : '1.0'};}`,
                cpu(src, t) {
                    for (let i = 0; i < src.data.length; i += 4) {
                        const a = src.data[i + 3]!, l = a > 0 ? (src.data[i]! * .2126 + src.data[i + 1]! * .7152 + src.data[i + 2]! * .0722) / a : 0;
                        const w = bright ? Math.max(0, l - threshold) / Math.max(l, .000001) : 1;
                        for (let k = 0; k < 4; k++)
                            t.data[i + k] = src.data[i + k]! * w;
                    }
                } };
            return [original, extract, ...gaussianBlur.passes({ sigma: Math.max(0, p.radius ?? 8) }, s, f), { id, inputs: { uOriginal: 'original' }, uniforms: { uAmount: amount }, glsl: `${common}\nuniform sampler2D uOriginal;vec4 filterPixel(ivec2 p){vec4 o=texelFetch(uOriginal,p,0);return vec4(o.rgb+readAt(p).rgb*uAmount*o.a,o.a);}`,
                    cpu(src, t, ctx) {
                        const o = ctx.inputs.uOriginal!;
                        for (let i = 0; i < src.data.length; i += 4) {
                            const a = o.data[i + 3]!;
                            for (let k = 0; k < 3; k++)
                                t.data[i + k] = o.data[i + k]! + src.data[i + k]! * amount * a;
                            t.data[i + 3] = a;
                        }
                    } }];
        }
    });
}
/** Spread light above the threshold using a blurred saved input. */
export const bloom = /* @__PURE__ */ spread('bloom', true);
/** Blend a blurred source into the picture for a soft glow. */
export const glow = /* @__PURE__ */ spread('glow', false);
/** amount=0 is neutral. Centre is normalised document position; radius is document pixels. */
export interface FlareParams extends AmountParams {
    /** Normalised document centre, default [.5, .5]. */
    centre?: readonly [
        number,
        number
    ];
    /** Sampling radius in document pixels. */
    radius?: number;
    /** Straight linear RGB light colour. */
    colour?: Colour;
}
/** Procedural light flare with a document-pixel radius and normalised centre. */
export const lensFlare = /* @__PURE__ */ defineFilter<FlareParams>({ id: 'lens-flare', padding: () => 0, passes(p, s, f) {
        const a = strength(p.amount);
        if (!a)
            return [];
        const cx = (p.centre?.[0] ?? .25) * f.documentWidth, cy = (p.centre?.[1] ?? .25) * f.documentHeight, r = Math.max(.001, p.radius ?? 80) * s, tint = p.colour ?? [1, .8, .5];
        return [pointPass('lens-flare', f, s, a, 'vec2 d=(doc-uCentre)/uRadius;float r=length(d);float light=exp(-r*r*2.0)+.15*exp(-pow((r-1.5)*12.0,2.0));result=c+uTint*light;', (c, x, y) => { const d = Math.hypot(x - cx, y - cy) / r, v = Math.exp(-d * d * 2) + .15 * Math.exp(-(((d - 1.5) * 12) ** 2)); return c.map((n, k) => n + tint[k]! * v) as Colour; }, { uCentre: [cx, cy], uRadius: r, uTint: tint }, 'uniform vec2 uCentre;uniform float uRadius;uniform vec3 uTint;')];
    } });
/** amount=0 is neutral. Rounded elliptical falloff anchored to the full document. */
export const vignette = /* @__PURE__ */ defineFilter<AmountParams>({ id: 'vignette', padding: () => 0, passes(p, s, f) { const a = strength(p.amount); return a ? [pointPass('vignette', f, s, a, 'vec2 q=doc/uDocument*2.0-1.0;float d=clamp(dot(q,q)*.5,0.0,1.0);result=c*(1.0-d*d);', (c, x, y) => { const d = Math.min(1, ((x / f.documentWidth * 2 - 1) ** 2 + (y / f.documentHeight * 2 - 1) ** 2) * .5); return c.map(n => n * (1 - d * d)) as Colour; })] : []; } });
