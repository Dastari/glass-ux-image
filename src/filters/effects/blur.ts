import { defineFilter, type Filter, type FilterPass } from '../../core/filter.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { common, frameUniforms, sample, safe, savePass, strength } from './shared.js';
/** Radius in document pixels; amount=0 (or radius=0) is neutral. Angle is degrees. */
export interface BlurParams {
    /** Effect amount; 0 is neutral and 1 is full strength. */
    amount: number;
    /** Sampling radius in document pixels. */
    radius: number;
    /** Motion direction in degrees. */
    angle?: number;
    /** Normalised document centre, default [.5, .5]. */
    centre?: readonly [
        number,
        number
    ];
    /** Normalised vertical focus position, default .5. */
    focus?: number;
    /** Normalised vertical focus-band width, default .2. */
    band?: number;
}
const radiusOf = (p: BlurParams, scale: number) => Math.max(0, safe(p.radius)) * scale;
/** Blend the finished blur back over the saved original by amount. */
const mixPass = (amount: number): FilterPass => ({ id: 'effects-mix', inputs: { uOriginal: 'original' }, uniforms: { uAmount: amount }, glsl: 'uniform sampler2D uOriginal; uniform float uAmount; vec4 filterPixel(ivec2 p){return mix(texelFetch(uOriginal,p,0),texelFetch(uSource,p,0),uAmount);}', cpu(s, t, ctx) { const o = ctx.inputs.uOriginal!; for (let i = 0; i < s.data.length; i++) t.data[i] = o.data[i]! + (s.data[i]! - o.data[i]!) * amount; } });
/** Lens blur pre-blurs by this share of its radius, which fills the gaps between the 33 disc taps. */
const LENS_FILL = .15;
/**
 * Fixed 17-tap line and 33-tap disc kernels bound shader work independently of radius. A line blur runs
 * twice, the second pass filling the gaps between the first pass's taps, so long streaks stay smooth; a
 * lens blur pre-blurs for the same reason and weights bright taps up, so highlights open into bokeh discs.
 * A radial (zoom) blur grows with distance from its centre and reaches `radius` at the farthest corner.
 */
function sampled(kind: 'motion' | 'radial' | 'lens'): Filter<BlurParams> {
    const fill = (radius: number, scale: number) => kind === 'lens' ? gaussianBlur.padding({ sigma: radius * LENS_FILL }, scale) : Math.ceil(radius * scale / 16) + 1;
    return defineFilter<BlurParams>({ id: `${kind}-blur`,
        padding: (p, s) => strength(p.amount) && radiusOf(p, s) > 0 ? Math.ceil(radiusOf(p, s)) + 1 + fill(Math.max(0, safe(p.radius)), s) : 0,
        passes(p, scale, frame) {
            const radius = radiusOf(p, scale), amount = strength(p.amount);
            if (!amount || radius === 0)
                return [];
            const angle = safe(p.angle ?? 0) * Math.PI / 180, direction = [Math.cos(angle), Math.sin(angle)];
            const centre = [(p.centre?.[0] ?? .5) * frame.documentWidth, (p.centre?.[1] ?? .5) * frame.documentHeight];
            const far = Math.max(1, Math.hypot(Math.max(centre[0]!, frame.documentWidth - centre[0]!), Math.max(centre[1]!, frame.documentHeight - centre[1]!)));
            const count = kind === 'lens' ? 33 : 17;
            const pass = (length: number): FilterPass => ({ id: `${kind}-blur`, uniforms: { ...frameUniforms(frame, scale, 1), uRadius: length, uDirection: direction, uCentre: centre, uZoom: 1 / far },
                    glsl: `${common}
uniform float uRadius; uniform vec2 uDirection; uniform vec2 uCentre; uniform float uZoom;
vec4 filterPixel(ivec2 p) {
 vec4 sum=vec4(0); float total=0.0; vec2 delta=uOrigin+vec2(p)+.5-uCentre;
 vec2 dir=${kind === 'radial' ? 'delta*uZoom' : 'uDirection'};
 for(int i=0;i<${count};i++) {
 ${kind === 'lens' ? `float r=sqrt(float(i)/32.0)*uRadius; float a=float(i)*2.399963229728653;
 vec2 offset=r*vec2(cos(a),sin(a));` : `vec2 offset=dir*uRadius*(float(i)/8.0-1.0);`}
 vec4 v=sampleAt(vec2(p)+offset); float w=${kind === 'lens' ? '1.0+4.0*smoothstep(.8,2.0,luminance(straight(v)))' : '1.0'};
 sum+=v*w; total+=w;
 }
 return sum/total;
}`,
                    cpu(source, target) {
                        for (let y = 0; y < source.height; y++)
                            for (let x = 0; x < source.width; x++) {
                                const dx = frame.x + x + .5 - centre[0]!, dy = frame.y + y + .5 - centre[1]!;
                                const dir = kind === 'radial' ? [dx / far, dy / far] : direction, sums = [0, 0, 0, 0];
                                let total = 0;
                                for (let j = 0; j < count; j++) {
                                    const r = Math.sqrt(j / 32) * length, a = j * 2.399963229728653;
                                    const ox = kind === 'lens' ? r * Math.cos(a) : dir[0]! * length * (j / 8 - 1);
                                    const oy = kind === 'lens' ? r * Math.sin(a) : dir[1]! * length * (j / 8 - 1);
                                    const c = sample(source, x + ox, y + oy);
                                    let w = 1;
                                    if (kind === 'lens') { const l = c[3] > 0 ? (c[0] * .2126 + c[1] * .7152 + c[2] * .0722) / c[3] : 0, t = Math.min(1, Math.max(0, (l - .8) / 1.2)); w = 1 + 4 * t * t * (3 - 2 * t); }
                                    for (let k = 0; k < 4; k++)
                                        sums[k]! += c[k]! * w;
                                    total += w;
                                }
                                const i = (y * source.width + x) * 4;
                                for (let k = 0; k < 4; k++)
                                    target.data[i + k] = sums[k]! / total;
                            }
                    } });
            const blur = kind === 'lens' ? [...gaussianBlur.passes({ sigma: Math.max(0, safe(p.radius)) * LENS_FILL }, scale, frame), pass(radius)] : [pass(radius), pass(radius / 16)];
            return amount < 1 ? [savePass('original'), ...blur, mixPass(amount)] : blur;
        }
    });
}
/** Directional line blur with radius in document pixels and angle in degrees. */
export const motionBlur = /* @__PURE__ */ sampled('motion');
/** Radial blur about a normalised centre; amount controls the blend. */
export const radialBlur = /* @__PURE__ */ sampled('radial');
/** Disc-sampled lens blur with bounded sampling and a document-pixel radius. */
export const lensBlur = /* @__PURE__ */ sampled('lens');
/** Focus and band are normalised vertical document positions; default .5 and .2. */
export const tiltShift = /* @__PURE__ */ defineFilter<BlurParams>({ id: 'tilt-shift',
    padding: (p, s) => strength(p.amount) ? gaussianBlur.padding({ sigma: Math.max(0, safe(p.radius)) }, s) : 0,
    passes(p, scale, frame) {
        const amount = strength(p.amount), sigma = Math.max(0, safe(p.radius)), focus = safe(p.focus ?? .5), band = Math.max(.001, safe(p.band ?? .2));
        const blur = gaussianBlur.passes({ sigma }, scale, frame);
        if (!amount || !blur.length)
            return [];
        const save: FilterPass = { id: 'effects-original', save: 'original', uniforms: {}, glsl: 'vec4 filterPixel(ivec2 p) { return texelFetch(uSource,p,0); }', cpu: (s, t) => t.data.set(s.data) };
        return [save, ...blur, { id: 'tilt-shift', inputs: { uOriginal: 'original' }, uniforms: { ...frameUniforms(frame, scale, amount), uFocus: focus, uBand: band },
                glsl: `${common}\nuniform sampler2D uOriginal; uniform float uFocus; uniform float uBand;
vec4 filterPixel(ivec2 p) { float d=abs((uOrigin.y+float(p.y)+.5)/uDocument.y-uFocus); float t=clamp((d-uBand*.5)/uBand,0.0,1.0)*uAmount; return mix(texelFetch(uOriginal,p,0),readAt(p),t); }`,
                cpu(s, t, ctx) {
                    const original = ctx.inputs.uOriginal!;
                    for (let y = 0; y < s.height; y++)
                        for (let x = 0; x < s.width; x++) {
                            const weight = Math.min(1, Math.max(0, (Math.abs((frame.y + y + .5) / frame.documentHeight - focus) - band * .5) / band)) * amount;
                            const i = (y * s.width + x) * 4;
                            for (let k = 0; k < 4; k++)
                                t.data[i + k] = original.data[i + k]! * (1 - weight) + s.data[i + k]! * weight;
                        }
                }
            }];
    }
});
export { gaussianBlur } from '../gaussian-blur.js';
