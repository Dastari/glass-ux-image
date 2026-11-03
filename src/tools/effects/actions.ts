import type { ActionOverride, EditorSession } from '../../session/index.js';
import type { EffectEntry } from '../../filters/effects/catalogue.js';
import { effectFilters, effectWarps } from '../../filters/effects/catalogue.js';
import type { EffectStackParams } from '../../filters/effects/stack.js';
/** Read an ordered stack without requiring React or the full editor. */
export function readEffects(session: EditorSession): readonly EffectEntry[] { return (session.state.draft.filters['effects-stack'] as EffectStackParams | undefined)?.entries ?? []; }
/** Plain action arguments, including the host's localised history label. */
export interface EffectActionArgs {
    /** History label for this edit. */
    label: string;
    /** Entry to add. */
    entry?: EffectEntry;
    /** Instance to remove, update or move. */
    id?: string;
    /** Replacement parameters/strength for an entry. */
    patch?: Partial<Pick<EffectEntry, 'params' | 'strength'>>;
    /** Final ordered instance ids. */
    order?: readonly string[];
    /** Entries appended by an imported LUT, look or preset. */
    entries?: readonly EffectEntry[];
}
/** Build only the warp recipe that is actually active, retaining the exact geometry path otherwise. */
export function effectRecipeFilters(session: EditorSession, entries: readonly EffectEntry[]): Record<string, unknown> {
    const filters: Record<string, unknown> = { ...session.state.draft.filters };
    const warps = entries.filter(e => e.strength > 0 && effectWarps.some(w => w.id === e.filter));
    if (entries.length)
        filters['effects-stack'] = { entries };
    else
        delete filters['effects-stack'];
    if (warps.length)
        filters['effects-warps'] = { entries: warps };
    else
        delete filters['effects-warps'];
    return filters;
}
function commit(session: EditorSession, entries: readonly EffectEntry[], label: string) {
    session.commit({ filters: effectRecipeFilters(session, entries) }, { label });
}
const known = (entry: EffectEntry) => effectFilters.some(f => f.id === entry.filter) || effectWarps.some(f => f.id === entry.filter);
/** Tool defaults; passing the same ids in session options overrides or hides these actions. */
export const effectsActions: readonly ActionOverride[] = ['add', 'remove', 'update', 'reorder', 'preset', 'import'].map(operation => ({ id: `effects.${operation}`, run(session, raw) {
        const args = raw as EffectActionArgs, old = readEffects(session);
        let next = old;
        if (operation === 'add' && args.entry && known(args.entry) && !old.some(e => e.id === args.entry!.id))
            next = [...old, args.entry];
        if (operation === 'remove')
            next = old.filter(e => e.id !== args.id);
        if (operation === 'update')
            next = old.map(e => e.id === args.id ? { ...e, ...args.patch } : e);
        if (operation === 'reorder' && args.order?.length === old.length && new Set(args.order).size === old.length && args.order.every(id => old.some(e => e.id === id)))
            next = args.order.map(id => old.find(e => e.id === id)!);
        if ((operation === 'preset' || operation === 'import') && args.entries?.every(known) && new Set([...old, ...args.entries].map(e => e.id)).size === old.length + args.entries.length)
            next = [...old, ...args.entries];
        if (next !== old)
            commit(session, next, args.label);
    } }));
