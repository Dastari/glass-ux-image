import { defineFilter, type FilterPass } from '../../core/filter.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { common, perceptual, pointPass, savePass, strength, encodeColour, decode, luma, smoothstep, type AmountParams, type Colour } from './shared.js';
/** amount=0 is neutral. Radius is sigma in document pixels; threshold is linear luminance. */
export interface LightParams extends AmountParams {
    /** Sampling radius in document pixels. */
    radius?: number;
    /** Linear luminance threshold for bloom, default .7. */
    threshold?: number;
}
/** Glow screens in at most this share of the blurred light. */
const GLOW = .7;
function spread(id: string, bright: boolean) {
    return defineFilter<LightParams>({ id, padding: (p, s) => strength(p.amount) ? gaussianBlur.padding({ sigma: Math.max(0, p.radius ?? 8) }, s) : 0,
        passes(p, s, f) {
            const amount = strength(p.amount), threshold = p.threshold ?? .7;
            if (!amount)
                return [];
            const extract: FilterPass = { id: `${id}-extract`, uniforms: { uThreshold: threshold }, glsl: `${common}\nuniform float uThreshold;vec4 filterPixel(ivec2 p){vec4 c=readAt(p);float l=luminance(straight(c));return c*${bright ? 'max(0.0,l-uThreshold)/max(l,.000001)' : '1.0'};}`,
                cpu(src, t) {
                    for (let i = 0; i < src.data.length; i += 4) {
                        const a = src.data[i + 3]!, l = a > 0 ? (src.data[i]! * .2126 + src.data[i + 1]! * .7152 + src.data[i + 2]! * .0722) / a : 0;
                        const w = bright ? Math.max(0, l - threshold) / Math.max(l, .000001) : 1;
                        for (let k = 0; k < 4; k++)
                            t.data[i + k] = src.data[i + k]! * w;
                    }
                } };
            const blur = gaussianBlur.passes({ sigma: Math.max(0, p.radius ?? 8) }, s, f);
            // Bloom adds the blurred light above the threshold, as light spills in a lens.
            const add: FilterPass = { id, inputs: { uOriginal: 'original' }, uniforms: { uAmount: amount }, glsl: `${common}\nuniform sampler2D uOriginal;vec4 filterPixel(ivec2 p){vec4 o=texelFetch(uOriginal,p,0);return vec4(o.rgb+readAt(p).rgb*uAmount*o.a,o.a);}`,
                cpu(src, t, ctx) {
                    const o = ctx.inputs.uOriginal!;
                    for (let i = 0; i < src.data.length; i += 4) {
                        const a = o.data[i + 3]!;
                        for (let k = 0; k < 3; k++)
                            t.data[i + k] = o.data[i + k]! + src.data[i + k]! * amount * a;
                        t.data[i + 3] = a;
                    }
                } };
            // Glow screens a blurred copy over the picture in perceptual space, weighted to its brighter parts,
            // as a soft-focus or diffuse-glow filter does: midtones bloom, nothing doubles or clips.
            const screen: FilterPass = { id, inputs: { uOriginal: 'original' }, uniforms: { uAmount: amount, uGlow: GLOW }, glsl: `${common}\n${perceptual}\nuniform sampler2D uOriginal;uniform float uGlow;
vec4 filterPixel(ivec2 p){vec4 o=texelFetch(uOriginal,p,0);vec3 c=straight(o),e=encode(c),g=encode(straight(readAt(p)));
 e=1.0-(1.0-e)*(1.0-clamp(g,0.0,1.0)*uGlow*smoothstep(.2,.9,luminance(g)));return vec4(max(mix(c,decode(e),uAmount),vec3(0))*o.a,o.a);}`,
                cpu(src, t, ctx) {
                    const o = ctx.inputs.uOriginal!;
                    for (let i = 0; i < src.data.length; i += 4) {
                        const a = o.data[i + 3]!, b = src.data[i + 3]!;
                        const c: Colour = a > 0 ? [o.data[i]! / a, o.data[i + 1]! / a, o.data[i + 2]! / a] : [0, 0, 0], g = encodeColour(b > 0 ? [src.data[i]! / b, src.data[i + 1]! / b, src.data[i + 2]! / b] : [0, 0, 0]), e = encodeColour(c), w = GLOW * smoothstep(.2, .9, luma(g));
                        for (let k = 0; k < 3; k++)
                            t.data[i + k] = Math.max(0, c[k]! + (decode(1 - (1 - e[k]!) * (1 - Math.min(1, Math.max(0, g[k]!)) * w)) - c[k]!) * amount) * a;
                        t.data[i + 3] = a;
                    }
                } };
            return [savePass('original'), extract, ...blur, bright ? add : screen];
        }
    });
}
/** Spread light above the threshold using a blurred saved input. */
export const bloom = /* @__PURE__ */ spread('bloom', true);
/** Screen a blurred copy over the picture for a soft glow. */
export const glow = /* @__PURE__ */ spread('glow', false);
/** amount=0 is neutral. Centre is normalised document position; radius is document pixels. */
export interface FlareParams extends AmountParams {
    /** Normalised document centre, default [.25, .25]. */
    centre?: readonly [
        number,
        number
    ];
    /** Radius of the bright core in document pixels. */
    radius?: number;
    /** Straight linear RGB light colour. */
    colour?: Colour;
}
/** Ghosts along the line from the light through the picture's centre: position on it, size and colour. */
const GHOSTS: readonly (readonly [number, number, Colour])[] = [[.45, .35, [.05, .07, .03]], [.8, .9, [.02, .035, .05]], [1.25, .55, [.06, .035, .015]], [1.6, 1.6, [.012, .02, .03]], [2.05, .3, [.05, .03, .05]]];
const flareGlsl = GHOSTS.map(([t, k, c]) => `result+=vec3(${c.map(v => v.toFixed(3)).join(',')})*ghost((doc-uCentre-uAxis*${t.toFixed(2)})/(uRadius*${k.toFixed(2)}));`).join('');
/**
 * A procedural lens flare, added in linear light: a hot core and soft halo, six thin aperture rays, a faint
 * halo ring and coloured aperture ghosts along the line through the picture's centre, as a camera lens
 * scatters a bright light. Centre is normalised; radius is the core size in document pixels.
 */
export const lensFlare = /* @__PURE__ */ defineFilter<FlareParams>({ id: 'lens-flare', padding: () => 0, passes(p, s, f) {
        const a = strength(p.amount);
        if (!a)
            return [];
        const cx = (p.centre?.[0] ?? .25) * f.documentWidth, cy = (p.centre?.[1] ?? .25) * f.documentHeight, r = Math.max(.001, p.radius ?? 50) * s, tint = p.colour ?? [1, .8, .5];
        const ax = f.documentWidth / 2 - cx, ay = f.documentHeight / 2 - cy;
        const ghost = (dx: number, dy: number) => { const x = Math.hypot(dx, dy); return (1 - smoothstep(.75, 1, x)) * (.6 + .4 * x); };
        return [pointPass('lens-flare', f, s, a, `vec2 v=(doc-uCentre)/uRadius;float r=length(v),u=v.x/max(r,.0001),k=abs(4.0*u*u*u-3.0*u);
 float light=exp(-r*r*6.0)*1.5+.35/(1.0+r*r*3.0)+pow(k,60.0)*exp(-r*.7)*.35*smoothstep(0.0,.2,r)+.06*exp(-pow((r-3.0)*4.0,2.0));
 result=c+uTint*light;${flareGlsl}`, (c, x, y) => {
            const vx = (x - cx) / r, vy = (y - cy) / r, d = Math.hypot(vx, vy), u = vx / Math.max(d, .0001), k = Math.abs(4 * u * u * u - 3 * u);
            const light = Math.exp(-d * d * 6) * 1.5 + .35 / (1 + d * d * 3) + k ** 60 * Math.exp(-d * .7) * .35 * smoothstep(0, .2, d) + .06 * Math.exp(-(((d - 3) * 4) ** 2));
            const out = c.map((n, i) => n + tint[i]! * light) as Colour;
            for (const [t, size, colour] of GHOSTS) {
                const g = ghost((x - cx - ax * t) / (r * size), (y - cy - ay * t) / (r * size));
                for (let i = 0; i < 3; i++) out[i]! += colour[i]! * g;
            }
            return out;
        }, { uCentre: [cx, cy], uAxis: [ax, ay], uRadius: r, uTint: tint }, 'uniform vec2 uCentre;uniform vec2 uAxis;uniform float uRadius;uniform vec3 uTint;float ghost(vec2 d){float x=length(d);return (1.0-smoothstep(.75,1.0,x))*(.6+.4*x);}')];
    } });
/** Exposure at the corners at full strength, in stops. */
const VIGNETTE_STOPS = 1.4;
/**
 * amount=0 is neutral. A soft elliptical fall-off fitted to the whole document, as an exposure change in
 * linear light: the centre is untouched, the edges darken gently and the corners by 1.4 stops.
 */
export const vignette = /* @__PURE__ */ defineFilter<AmountParams>({ id: 'vignette', padding: () => 0, passes(p, s, f) { const a = strength(p.amount); return a ? [pointPass('vignette', f, s, a, 'vec2 q=doc/uDocument*2.0-1.0;float w=smoothstep(.35,1.0,length(q)*.70710678);result=c*exp2(-uStops*w*w);', (c, x, y) => { const w = smoothstep(.35, 1, Math.hypot(x / f.documentWidth * 2 - 1, y / f.documentHeight * 2 - 1) * Math.SQRT1_2), k = 2 ** (-VIGNETTE_STOPS * w * w); return c.map(n => n * k) as Colour; }, { uStops: VIGNETTE_STOPS }, 'uniform float uStops;')] : []; } });
