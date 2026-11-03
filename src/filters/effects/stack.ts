import { defineFilter, type FilterPass } from '../../core/filter.js';
import { defineWarp } from '../../core/warp.js';
import { effectFilters, effectWarps, type EffectEntry } from './catalogue.js';
import { strength } from './shared.js';
/** Ordered duplicate-capable stack; empty entries (or all zero strengths) produce no passes. */
export interface EffectStackParams {
    /** Effects in application order. Warps are registered separately before crop, per the engine pipeline. */
    entries: readonly EffectEntry[];
}
/** Ordered effect-stack filter that blends each registered kernel by its instance strength. */
export const effectStack = /* @__PURE__ */ defineFilter<EffectStackParams>({ id: 'effects-stack', precision: 'full',
    padding: ({ entries }, scale) => entries.reduce((sum, e) => sum + (strength(e.strength) ? effectFilters.find(f => f.id === e.filter)?.padding(e.params, scale) ?? 0 : 0), 0),
    passes({ entries }, scale, frame) {
        return entries.flatMap((entry, index) => {
            const filter = effectFilters.find(f => f.id === entry.filter), amount = strength(entry.strength);
            if (!filter || !amount)
                return [];
            const passes = filter.passes(entry.params, scale, frame);
            if (!passes.length)
                return [];
            const name = `stack:${index}:input`;
            const original: FilterPass = { id: 'effects-stack-original', save: name, uniforms: {}, glsl: 'vec4 filterPixel(ivec2 p){return texelFetch(uSource,p,0);}', cpu: (s, t) => t.data.set(s.data) };
            return [original, ...passes.map(p => ({ ...p, ...(p.save ? { save: `stack:${index}:${p.save}` } : {}), ...(p.inputs ? { inputs: Object.fromEntries(Object.entries(p.inputs).map(([sampler, key]) => [sampler, `stack:${index}:${key}`])) } : {}) })), { id: 'effects-stack-strength', inputs: { uStackOriginal: name }, uniforms: { uStrength: amount }, glsl: 'uniform sampler2D uStackOriginal; uniform float uStrength;vec4 filterPixel(ivec2 p){return mix(texelFetch(uStackOriginal,p,0),texelFetch(uSource,p,0),uStrength);}', cpu(s, t, ctx) { const o = ctx.inputs.uStackOriginal!; for (let i = 0; i < s.data.length; i++)
                        t.data[i] = o.data[i]! + (s.data[i]! - o.data[i]!) * amount; } }];
        });
    }
});
/** Ordered warps, evaluated backwards because each maps output to source. */
export const effectWarpStack = /* @__PURE__ */ defineWarp<EffectStackParams>({ id: 'effects-warps', map(x, y, { entries }, size) { let p: readonly [
        number,
        number
    ] = [x, y]; for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i]!, w = effectWarps.find(w => w.id === e.filter), amount = strength(e.strength);
        if (w && amount) {
            const q = w.map(p[0], p[1], e.params, size);
            p = [p[0] + (q[0] - p[0]) * amount, p[1] + (q[1] - p[1]) * amount];
        }
    } return p; } });
