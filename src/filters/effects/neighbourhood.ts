import { defineFilter } from '../../core/filter.js';
import { common, frameUniforms, sample, colour, luma, strength, type AmountParams } from './shared.js';
/** amount=0 is neutral. Radius is in document pixels, bounded to a 5×5 sampling grid. */
export interface NeighbourhoodParams extends AmountParams {
    /** Sampling radius in document pixels. */
    radius?: number;
    /** Bilateral colour-distance tolerance, default .15. */
    tolerance?: number;
}
/** Shared bounded kernels. Oil uses a luminance histogram; denoising uses bilateral weights. */
export function neighbourhood(id: string, mode: 'oil' | 'pencil' | 'watercolour' | 'cartoon' | 'reduce' | 'grain' | 'emboss') {
    return defineFilter<NeighbourhoodParams>({ id, precision: ["oil", "watercolour", "cartoon"].includes(mode) ? "full" : "half", padding: (p, s) => strength(p.amount) ? Math.ceil(Math.max(0, p.radius ?? (mode === 'grain' ? 3 : 2)) * s) + 1 : 0,
        passes(p, s, f) {
            const amount = strength(p.amount), radius = Math.max(0, p.radius ?? (mode === 'grain' ? 3 : 2)) * s, tolerance = Math.max(.001, p.tolerance ?? .15);
            if (!amount)
                return [];
            const final = mode === 'pencil' ? 'vec3(1.0-clamp(length(c-mean)*4.0,0.0,1.0))' : mode === 'watercolour' ? 'floor(mean*8.0+.5)/8.0' : mode === 'cartoon' ? 'floor(mean*5.0+.5)/5.0*(1.0-clamp(length(c-mean)*4.0,0.0,1.0))' : mode === 'emboss' ? 'vec3(.5)+straight(sampleAt(vec2(p)+vec2(uRadius)))-straight(sampleAt(vec2(p)-vec2(uRadius)))' : 'mean';
            return [{ id, uniforms: { ...frameUniforms(f, s, amount), uRadius: radius, uTolerance: tolerance },
                    glsl: `${common}\nuniform float uRadius; uniform float uTolerance;
 vec4 filterPixel(ivec2 p){vec4 src=readAt(p);vec3 c=straight(src),sum=vec3(0);float total=0.0;
 ${mode === 'oil' ? 'vec3 bins[8]; float counts[8]; for(int j=0;j<8;j++){bins[j]=vec3(0);counts[j]=0.0;}' : ''}
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++) {vec4 v=sampleAt(vec2(p)+vec2(x,y)*uRadius*.5);vec3 q=straight(v);
 float w=${mode === 'reduce' || mode === 'grain' ? 'exp(-dot(q-c,q-c)/(uTolerance*uTolerance))*v.a' : 'v.a'};
 ${mode === 'oil' ? 'int bin=int(clamp(floor(luminance(q)*8.0),0.0,7.0)); bins[bin]+=q*w;counts[bin]+=w;' : (mode === 'watercolour' || mode === 'cartoon' ? 'sum+=v.rgb;total+=v.a;' : 'sum+=q*w;total+=w;')} }
 ${mode === 'oil' ? 'for(int j=0;j<8;j++){if(counts[j]>total){total=counts[j];sum=bins[j];}}' : ''}
 vec3 mean=total>0.0?sum/total:c;vec3 result=${final};return vec4(max(mix(c,result,uAmount),vec3(0))*src.a,src.a);}`,
                    cpu(source, target) {
                        for (let y = 0; y < source.height; y++)
                            for (let x = 0; x < source.width; x++) {
                                const src = sample(source, x, y), c = colour(src), sum = [0, 0, 0], bins = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
                                let total = 0;
                                for (let dy = -2; dy <= 2; dy++)
                                    for (let dx = -2; dx <= 2; dx++) {
                                        const v = sample(source, x + dx * radius * .5, y + dy * radius * .5), q = colour(v);
                                        const d = q.reduce((n, v, k) => n + (v - c[k]!) ** 2, 0);
                                        const w = (mode === 'reduce' || mode === 'grain' ? Math.exp(-d / (tolerance * tolerance)) : 1) * v[3];
                                        if (mode === 'oil') {
                                            const b = bins[Math.min(7, Math.max(0, Math.floor(luma(q) * 8)))]!;
                                            for (let k = 0; k < 3; k++)
                                                b[k]! += q[k]! * w;
                                            b[3]! += w;
                                        }
                                        else {
                                            for (let k = 0; k < 3; k++)
                                                sum[k] = mode === 'watercolour' || mode === 'cartoon' ? Math.fround(sum[k]! + v[k]!) : sum[k]! + q[k]! * w;
                                            total = mode === 'watercolour' || mode === 'cartoon' ? Math.fround(total + v[3]) : total + w;
                                        }
                                    }
                                if (mode === 'oil')
                                    for (const b of bins)
                                        if (b[3]! > total) {
                                            total = b[3]!;
                                            for (let k = 0; k < 3; k++)
                                                sum[k] = b[k]!;
                                        }
                                const mean = sum.map((v, k) => total > 0 ? (mode === 'watercolour' || mode === 'cartoon' ? Math.fround(v / total) : v / total) : c[k]!), edge = Math.min(1, Math.hypot(...c.map((v, k) => v - mean[k]!)) * 4);
                                const lo = mode === 'emboss' ? colour(sample(source, x - radius, y - radius)) : c, hi = mode === 'emboss' ? colour(sample(source, x + radius, y + radius)) : c;
                                const i = (y * source.width + x) * 4;
                                for (let k = 0; k < 3; k++) {
                                    const result = mode === 'pencil' ? 1 - edge : mode === 'watercolour' ? Math.floor(mean[k]! * 8 + .5) / 8 : mode === 'cartoon' ? Math.floor(mean[k]! * 5 + .5) / 5 * (1 - edge) : mode === 'emboss' ? .5 + hi[k]! - lo[k]! : mean[k]!;
                                    target.data[i + k] = Math.max(0, c[k]! + (result - c[k]!) * amount) * src[3];
                                }
                                target.data[i + 3] = src[3];
                            }
                    }
                }];
        }
    });
}
/** Neighbourhood relief using directional intensity differences. */
export const emboss = /* @__PURE__ */ neighbourhood('emboss', 'emboss');
