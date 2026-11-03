import { defineFilter, type Filter, type FilterPass } from '../../core/filter.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { common, frameUniforms, sample, safe, strength } from './shared.js';
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
/** Fixed 17-tap line and 33-tap disc kernels bound shader work independently of radius. */
function sampled(kind: 'motion' | 'radial' | 'lens'): Filter<BlurParams> {
    return defineFilter<BlurParams>({ id: `${kind}-blur`,
        padding: (p, s) => strength(p.amount) ? Math.ceil(radiusOf(p, s)) + 1 : 0,
        passes(p, scale, frame) {
            const radius = radiusOf(p, scale), amount = strength(p.amount);
            if (!amount || radius === 0)
                return [];
            const angle = safe(p.angle ?? 0) * Math.PI / 180, direction = [Math.cos(angle), Math.sin(angle)];
            const centre = [(p.centre?.[0] ?? .5) * frame.documentWidth, (p.centre?.[1] ?? .5) * frame.documentHeight];
            const count = kind === 'lens' ? 33 : 17;
            return [{ id: `${kind}-blur`, uniforms: { ...frameUniforms(frame, scale, amount), uRadius: radius, uDirection: direction, uCentre: centre },
                    glsl: `${common}
uniform float uRadius; uniform vec2 uDirection; uniform vec2 uCentre;
vec4 filterPixel(ivec2 p) {
 vec4 sum=vec4(0); vec2 delta=uOrigin+vec2(p)+.5-uCentre;
 vec2 dir=${kind === 'radial' ? 'delta/max(1.0,length(delta))' : 'uDirection'};
 for(int i=0;i<${count};i++) {
 ${kind === 'lens' ? `float r=sqrt(float(i)/32.0)*uRadius; float a=float(i)*2.399963229728653;
 vec2 offset=r*vec2(cos(a),sin(a));` : `vec2 offset=dir*uRadius*(float(i)/8.0-1.0);`}
 sum+=sampleAt(vec2(p)+offset);
 }
 return mix(readAt(p),sum/${count}.0,uAmount);
}`,
                    cpu(source, target) {
                        for (let y = 0; y < source.height; y++)
                            for (let x = 0; x < source.width; x++) {
                                const dx = frame.x + x + .5 - centre[0]!, dy = frame.y + y + .5 - centre[1]!, len = Math.max(1, Math.hypot(dx, dy));
                                const dir = kind === 'radial' ? [dx / len, dy / len] : direction, sums = [0, 0, 0, 0];
                                for (let j = 0; j < count; j++) {
                                    const r = Math.sqrt(j / 32) * radius, a = j * 2.399963229728653;
                                    const ox = kind === 'lens' ? r * Math.cos(a) : dir[0]! * radius * (j / 8 - 1);
                                    const oy = kind === 'lens' ? r * Math.sin(a) : dir[1]! * radius * (j / 8 - 1);
                                    const c = sample(source, x + ox, y + oy);
                                    for (let k = 0; k < 4; k++)
                                        sums[k]! += c[k]!;
                                }
                                const i = (y * source.width + x) * 4;
                                for (let k = 0; k < 4; k++)
                                    target.data[i + k] = source.data[i + k]! * (1 - amount) + sums[k]! / count * amount;
                            }
                    } }];
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
