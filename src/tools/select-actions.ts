import type { ActionOverride, EditorSession } from '../session/index.js';
import { createId } from '../core/id.js';
import { layerCopy, neighbourLayer } from './select-math.js';

/** Tool data key holding the chosen layer; the Layers panel, retouch and text tools share it. */
export const SELECTED_LAYER = 'layers.selectedId';
/** Arguments for the labelled layer actions. */
export interface LayerActionArgs {
    /** Layer to act on. Defaults to the selected layer. */
    id?: string;
    /** History label for the step. */
    label?: string;
}
/** The selected layer's id, when it still exists. */
export function selectedLayerId(session: EditorSession): string | null {
    const id = session.state.toolData[SELECTED_LAYER] as string | null | undefined;
    return id && session.state.recipe.layers?.some(layer => layer.id === id) ? id : null;
}
const target = (session: EditorSession, args: unknown) => (args as LayerActionArgs | undefined)?.id ?? selectedLayerId(session);
const label = (args: unknown) => (args as LayerActionArgs | undefined)?.label;
const indexOf = (session: EditorSession, id: string | null) => id ? (session.state.recipe.layers ?? []).findIndex(layer => layer.id === id) : -1;

/**
 * Photoshop's layer commands as session actions, so `onAction` sees and can refuse each one:
 * duplicate (Ctrl+J), merge down (Ctrl+E), merge visible (Ctrl+Shift+E), delete, and choosing the
 * layer above or below (Alt+] and Alt+[). Each committed change is one labelled undo step. Merging
 * loads its renderer only when it runs.
 */
export const layerActions: readonly ActionOverride[] = [
    {
        id: 'layers.duplicate', enabled: s => selectedLayerId(s) !== null,
        run: (s, args) => {
            const copy = layerCopy(s.state.recipe, target(s, args) ?? '', createId());
            if (!copy) return null;
            s.commit(copy.change, { label: label(args) });
            if (!s.state.recipe.layers?.some(layer => layer.id === copy.id)) return null;
            s.setToolData(SELECTED_LAYER, copy.id);
            return copy.id;
        },
    },
    {
        id: 'layers.delete', enabled: s => selectedLayerId(s) !== null,
        run: (s, args) => {
            const id = target(s, args), { layers = [], strokes = [] } = s.state.recipe;
            if (!id || !layers.some(layer => layer.id === id)) return;
            s.commit({ layers: layers.filter(layer => layer.id !== id), strokes: strokes.filter(stroke => stroke.layer !== id) }, { label: label(args) });
            if (!s.state.recipe.layers?.some(layer => layer.id === id)) s.setToolData(SELECTED_LAYER, null);
        },
    },
    {
        id: 'layers.mergeDown', enabled: s => s.state.status === 'ready' && indexOf(s, selectedLayerId(s)) > 0,
        run: async (s, args) => {
            const id = target(s, args), index = indexOf(s, id);
            if (!id || index < 1) return;
            const { mergeLayerRange } = await import('./layers/operations.js');
            await mergeLayerRange(s, id, label(args) ?? '');
            const merged = s.state.recipe.layers?.[index - 1];
            if (merged) s.setToolData(SELECTED_LAYER, merged.id);
        },
    },
    {
        id: 'layers.mergeVisible', enabled: s => s.state.status === 'ready' && (s.state.recipe.layers?.length ?? 0) > 0,
        run: async (s, args) => { await s.flatten({ label: label(args) ?? '' }); s.setToolData(SELECTED_LAYER, null); },
    },
    { id: 'layers.selectAbove', enabled: s => (s.state.draft.layers?.length ?? 0) > 0, run: s => s.setToolData(SELECTED_LAYER, neighbourLayer(s.state.draft.layers ?? [], selectedLayerId(s), 1)) },
    { id: 'layers.selectBelow', enabled: s => (s.state.draft.layers?.length ?? 0) > 0, run: s => s.setToolData(SELECTED_LAYER, neighbourLayer(s.state.draft.layers ?? [], selectedLayerId(s), -1)) },
    { id: 'layers.deselect', enabled: s => selectedLayerId(s) !== null, run: s => s.setToolData(SELECTED_LAYER, null) },
];
