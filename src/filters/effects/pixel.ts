import { defineFilter, type FilterPass } from '../../core/filter.js';
import { gaussianBlur } from '../gaussian-blur.js';
import { common, perceptual, frameUniforms, sample, colour, encodeColour, decode, luma, savePass, smoothstep, strength, type AmountParams } from './shared.js';
/** amount=0 is neutral; size is the cell edge in document pixels (default 8). */
export interface PixelParams extends AmountParams {
    /** Cell edge in document pixels. */
    size?: number;
}
/** Grout between mosaic tiles, as a share of the tile. */
const GROUT = .05;
/** Darkest ink of the halftone, in perceptual units. */
const INK = .08;
const cellAverage = (mode: string) => `vec4 cellAverage(vec2 cell){vec4 v=vec4(0);for(int y=0;y<3;y++)for(int x=0;x<3;x++)v+=sampleAt(cell+vec2(float(x)+.5,float(y)+.5)*uSize/3.0-uOrigin-.5);return v/9.0;}${mode}`;
/**
 * Pixel effects first blur by a sixth of a cell, so the nine samples of each cell stand for every pixel in
 * it and the result is a true cell average, without aliasing at any zoom.
 */
function pixelEffect(id: string, mode: 'pixel' | 'mosaic' | 'halftone') {
    const blurOf = (size: number) => size / (mode === 'halftone' ? 4 : 6);
    return defineFilter<PixelParams>({ id, precision: mode === 'halftone' ? 'full' : 'half', padding: (p, s) => { const size = Math.max(1, p.size ?? 8); return strength(p.amount) ? Math.ceil(size * s * (mode === 'halftone' ? 1.5 : 1)) + 2 + gaussianBlur.padding({ sigma: blurOf(size) }, s) : 0; },
        passes(p, s, f) {
            const a = strength(p.amount), cellSize = Math.max(1, p.size ?? 8), size = cellSize * s;
            if (!a)
                return [];
            const glsl = mode === 'halftone'
                // A 45° screen of black dots on white paper; each dot's area matches the darkness of its cell.
                ? `vec4 filterPixel(ivec2 p){vec4 src=texelFetch(uOriginal,p,0);vec2 doc=uOrigin+vec2(p)+.5;
 vec2 q=mat2(.70710678,-.70710678,.70710678,.70710678)*doc/uSize,cell=floor(q)+.5,f=q-cell;
 vec2 centre=mat2(.70710678,.70710678,-.70710678,.70710678)*cell*uSize;vec4 v=sampleAt(centre-uOrigin-.5);
 float k=1.0-clamp(luminance(encode(straight(v))),0.0,1.0),r=k<.785?sqrt(k/3.14159265):.5+(k-.785)*.963;
 float w=.5/uSize,ink=1.0-smoothstep(r-w,r+w,length(f));if(k<.004)ink=0.0;ink=mix(ink,k,clamp((3.0-uSize)/1.5,0.0,1.0));
 vec3 e=vec3(mix(1.0,uInk,ink));return mix(src,vec4(decode(e)*src.a,src.a),uAmount);}`
                : `vec4 filterPixel(ivec2 p){vec4 src=texelFetch(uOriginal,p,0);vec2 doc=uOrigin+vec2(p)+.5,cell=floor(doc/uSize)*uSize;vec4 v=cellAverage(cell);
 ${mode === 'mosaic' ? 'vec2 t=(doc-cell)/uSize;float edge=min(min(t.x,1.0-t.x),min(t.y,1.0-t.y)),w=.5/uSize,g=1.0-smoothstep(uGrout-w,uGrout+w,edge);vec3 e=encode(straight(v))*(1.0+.06*((1.0-smoothstep(0.0,.3,t.x+t.y))-smoothstep(1.7,2.0,t.x+t.y)));e=mix(e,vec3(.16),g);v=vec4(decode(e)*v.a,v.a);' : ''}
 return mix(src,v,uAmount);}`;
            const pass: FilterPass = { id, inputs: { uOriginal: 'original' }, uniforms: { ...frameUniforms(f, s, a), uSize: size, uGrout: GROUT, uInk: INK },
                glsl: `${common}\n${perceptual}\nuniform sampler2D uOriginal;uniform float uSize;uniform float uGrout;uniform float uInk;\n${mode === 'halftone' ? '' : cellAverage('')}\n${glsl}`,
                cpu(source, target, ctx) {
                    const original = ctx.inputs.uOriginal!;
                    for (let y = 0; y < source.height; y++)
                        for (let x = 0; x < source.width; x++) {
                            const dx = f.x + x + .5, dy = f.y + y + .5, i = (y * source.width + x) * 4, src = original.data.subarray(i, i + 4);
                            let v: number[] = [0, 0, 0, 0];
                            if (mode === 'halftone') {
                                const h = Math.SQRT1_2, qx = (h * dx + h * dy) / size, qy = (-h * dx + h * dy) / size, cx = Math.floor(qx) + .5, cy = Math.floor(qy) + .5;
                                const px = (h * cx - h * cy) * size, py = (h * cx + h * cy) * size, c = sample(source, px - f.x - .5, py - f.y - .5);
                                const k = 1 - Math.min(1, Math.max(0, luma(encodeColour(colour(c))))), r = k < .785 ? Math.sqrt(k / Math.PI) : .5 + (k - .785) * .963, w = .5 / size;
                                const dot = k < .004 ? 0 : 1 - smoothstep(r - w, r + w, Math.hypot(qx - cx, qy - cy)), ink = dot + (k - dot) * Math.min(1, Math.max(0, (3 - size) / 1.5)), g = decode(1 + (INK - 1) * ink);
                                v = [g * src[3]!, g * src[3]!, g * src[3]!, src[3]!];
                            }
                            else {
                                const cx = Math.floor(dx / size) * size, cy = Math.floor(dy / size) * size;
                                for (let j = 0; j < 3; j++)
                                    for (let n = 0; n < 3; n++) {
                                        const q = sample(source, cx + (n + .5) * size / 3 - f.x - .5, cy + (j + .5) * size / 3 - f.y - .5);
                                        for (let k = 0; k < 4; k++)
                                            v[k]! += q[k]!;
                                    }
                                v = v.map(n => n / 9);
                                if (mode === 'mosaic') {
                                    const tx = (dx - cx) / size, ty = (dy - cy) / size, edge = Math.min(tx, 1 - tx, ty, 1 - ty), w = .5 / size, g = 1 - smoothstep(GROUT - w, GROUT + w, edge);
                                    const bevel = 1 + .06 * ((1 - smoothstep(0, .3, tx + ty)) - smoothstep(1.7, 2, tx + ty)), e = encodeColour(colour(v)).map(n => { const b = n * bevel; return b + (.16 - b) * g; });
                                    v = [...e.map(n => decode(n) * v[3]!), v[3]!];
                                }
                            }
                            for (let k = 0; k < 4; k++)
                                target.data[i + k] = src[k]! + (v[k]! - src[k]!) * a;
                        }
                } };
            return [savePass('original'), ...gaussianBlur.passes({ sigma: blurOf(cellSize) }, s, f), pass];
        }
    });
}
/** Average pixels in document-space cells with an adjustable cell size. */
export const pixelate = /* @__PURE__ */ pixelEffect('pixelate', 'pixel');
/** Averaged document-space tiles with dark grout and a slight bevel, like Photoshop's Mosaic Tiles. */
export const mosaic = /* @__PURE__ */ pixelEffect('mosaic', 'mosaic');
/**
 * A 45° screen of black dots on white paper, sized by darkness; transparent regions are preserved. Dots under
 * three pixels of the level being drawn fade to their average ink, so zoomed-out views show the tone, not moiré.
 */
export const halftone = /* @__PURE__ */ pixelEffect('halftone', 'halftone');
