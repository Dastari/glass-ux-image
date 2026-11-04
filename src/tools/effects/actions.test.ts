import { decode } from '../../filters/effects/shared.js';
import { expect, it } from 'vitest';
import { createEditorSession } from '../../session/session.js';
import { solidSource } from '../../core/tile-source.js';
import { effectStack, effectWarpStack } from '../../filters/effects/stack.js';
import { createPixels } from '../../core/pixels.js';
import { effectsActions, readEffects } from './actions.js';
const e = (id: string, filter = 'sepia') => ({ id, filter, params: { amount: 1 }, strength: 1 });
it('actions support duplicate effects, ordering, strength, removal, history and vetoes', async () => {
    const calls: string[] = [];
    let veto = false;
    const s = createEditorSession({ source: solidSource({ width: 4, height: 4 }, [.1, .2, .3, 1]), tools: [{ id: 'effects', filters: [effectStack, effectWarpStack], actions: effectsActions }], onAction: (a, next) => { calls.push(a.id); if (!veto)
            return next(); } });
    await new Promise<void>(resolve => { if (s.state.status === 'ready')
        resolve();
    else {
        const stop = s.subscribe(() => { if (s.state.status === 'ready') {
            stop();
            resolve();
        } });
    } });
    try {
        s.run('effects.add', { entry: e('one'), label: 'Add one' });
        s.run('effects.add', { entry: e('two'), label: 'Add two' });
        expect(readEffects(s).map(e => e.id)).toEqual(['one', 'two']);
        expect(s.state.recipe.filters['effects-warps']).toBeUndefined();
        s.run('effects.reorder', { order: ['two', 'one'], label: 'Reorder' });
        expect(readEffects(s)[0]!.id).toBe('two');
        expect(s.history.current.label).toBe('Reorder');
        s.run('effects.update', { id: 'two', patch: { strength: .3 }, label: 'Strength' });
        expect(readEffects(s)[0]!.strength).toBe(.3);
        s.undo();
        expect(readEffects(s)[0]!.strength).toBe(1);
        s.redo();
        expect(readEffects(s)[0]!.strength).toBe(.3);
        veto = true;
        s.run('effects.remove', { id: 'one', label: 'Remove' });
        expect(readEffects(s)).toHaveLength(2);
        veto = false;
        s.run('effects.remove', { id: 'one', label: 'Remove' });
        expect(readEffects(s)).toHaveLength(1);
        expect(calls).toContain('effects.remove');
        s.run('effects.add', { entry: e('wave', 'wave'), label: 'Wave' });
        expect(s.state.recipe.filters['effects-warps']).toEqual({ entries: [e('wave', 'wave')] });
        s.run('effects.remove', { id: 'wave', label: 'Remove warp' });
        expect(s.state.recipe.filters['effects-warps']).toBeUndefined();
    }
    finally {
        s.dispose();
    }
});
it('stack isolates saved inputs between duplicate multipass filters', () => {
    const source = createPixels(5, 5);
    for (let i = 0; i < source.data.length; i += 4)
        source.data.set([.1, .2, .3, .5], i);
    const entries = [e('a', 'high-pass'), e('b', 'high-pass')].map(e => ({ ...e, params: { amount: 1, radius: 1 } }));
    const passes = effectStack.passes({ entries }, 1, { x: 0, y: 0, width: 5, height: 5, documentWidth: 5, documentHeight: 5 });
    expect(new Set(passes.map(p => p.save).filter(Boolean)).size).toBe(4);
    let current = source;
    const saved: Record<string, typeof source> = {};
    for (const pass of passes) {
        const target = createPixels(5, 5);
        pass.cpu(current, target, { inputs: Object.fromEntries(Object.entries(pass.inputs ?? {}).map(([name, key]) => [name, saved[key]!])), textures: pass.textures ?? {} });
        if (pass.save)
            saved[pass.save] = target;
        current = target;
    }
    expect(current.data[0]).toBeCloseTo(decode(.5) * .5);
    expect(current.data[3]).toBe(.5);
});

import { effectsSessionTool } from './session.js';
import { EMPTY_RECIPE } from '../../session/recipe.js';
it('headless registration supports direct recipe filter and warp ids', async () => {
    const session = createEditorSession({ source: solidSource({ width: 4, height: 4 }, [.1, .2, .3, 1]), tools: [effectsSessionTool], recipe: { geometry: EMPTY_RECIPE.geometry, filters: { sepia: { amount: 1 }, wave: { amount: 1, wavelength: 4 } } } });
    await new Promise<void>(resolve => { if (session.state.status === 'ready') resolve(); else { const stop = session.subscribe(() => { if (session.state.status === 'ready') { stop(); resolve(); } }); } });
    try {
        expect(session.document!.layers[0]!.filters.map(f => f.filter.id)).toEqual(['sepia']);
        expect(session.toSource(1, 1)).toEqual([2, 1]);
        expect(session.action('effects.add').available).toBe(true);
    } finally { session.dispose(); }
});
