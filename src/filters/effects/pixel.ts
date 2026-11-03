import { defineFilter } from '../../core/filter.js';
import { common, frameUniforms, sample, colour, luma, strength, type AmountParams } from './shared.js';
/** amount=0 is neutral; size is the cell edge in document pixels (default 8). */
export interface PixelParams extends AmountParams {
    /** Cell edge in document pixels. */
    size?: number;
}
function pixelEffect(id: string, mode: 'pixel' | 'mosaic' | 'halftone') {
    return defineFilter<PixelParams>({ id, precision: mode === "halftone" ? "full" : "half", padding: (p, s) => strength(p.amount) ? Math.ceil(Math.max(1, p.size ?? 8) * s) + 1 : 0,
        passes(p, s, f) {
            const a = strength(p.amount), size = Math.max(1, p.size ?? 8) * s;
            if (!a)
                return [];
            return [{ id, uniforms: { ...frameUniforms(f, s, a), uSize: size }, glsl: `${common}\nuniform float uSize;
 vec4 filterPixel(ivec2 p){vec2 doc=uOrigin+vec2(p)+.5;vec2 cell=floor(doc/uSize)*uSize;vec2 centre=cell+uSize*.5-uOrigin-.5;
 vec4 src=readAt(p),v=sampleAt(centre);
 ${mode === 'mosaic' ? 'v=vec4(0);for(int y=0;y<3;y++)for(int x=0;x<3;x++)v+=sampleAt(cell+vec2(float(x)+.5,float(y)+.5)*uSize/3.0-uOrigin-.5);v/=9.0;' : ''}
 ${mode === 'halftone' ? 'vec2 q=(doc-cell)/uSize-.5;float ink=step(length(q),sqrt(clamp(luminance(straight(v)),0.0,1.0))*.7071067811865476);v=vec4(vec3(ink)*src.a,src.a);' : ''}
 return mix(src,v,uAmount);}`,
                    cpu(source, target) {
                        for (let y = 0; y < source.height; y++)
                            for (let x = 0; x < source.width; x++) {
                                const dx = f.x + x + .5, dy = f.y + y + .5, cx = Math.floor(dx / size) * size, cy = Math.floor(dy / size) * size;
                                let v = sample(source, cx + size * .5 - f.x - .5, cy + size * .5 - f.y - .5);
                                const src = sample(source, x, y);
                                if (mode === 'mosaic') {
                                    v = [0, 0, 0, 0];
                                    for (let j = 0; j < 3; j++)
                                        for (let i = 0; i < 3; i++) {
                                            const q = sample(source, cx + (i + .5) * size / 3 - f.x - .5, cy + (j + .5) * size / 3 - f.y - .5);
                                            for (let k = 0; k < 4; k++)
                                                v[k]! += q[k]! / 9;
                                        }
                                }
                                if (mode === 'halftone') {
                                    const ink = Math.hypot((dx - cx) / size - .5, (dy - cy) / size - .5) <= Math.sqrt(Math.min(1, Math.max(0, luma(colour(v))))) * Math.SQRT1_2 ? 1 : 0;
                                    v = [ink * src[3], ink * src[3], ink * src[3], src[3]];
                                }
                                const i = (y * source.width + x) * 4;
                                for (let k = 0; k < 4; k++)
                                    target.data[i + k] = src[k]! + (v[k]! - src[k]!) * a;
                            }
                    } }];
        }
    });
}
/** Average pixels in document-space cells with an adjustable cell size. */
export const pixelate = /* @__PURE__ */ pixelEffect('pixelate', 'pixel');
/** Bounded sampling of document-space mosaic cells. */
export const mosaic = /* @__PURE__ */ pixelEffect('mosaic', 'mosaic');
/** Render luminance as a regular dot pattern while preserving transparent regions. */
export const halftone = /* @__PURE__ */ pixelEffect('halftone', 'halftone');
