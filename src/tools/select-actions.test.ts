import { describe, expect, it, vi } from 'vitest';
import { createEditorSession, type EditorSessionOptions } from '../session/index.js';
import { createPixels, pixelSource, rectQuad } from '../core/index.js';
import { layerActions, SELECTED_LAYER, selectedLayerId } from './select-actions.js';
import { translateQuad } from './select-math.js';

const fixture = { kind: 'fixture', source: () => pixelSource(createPixels(20, 10)) };
async function start(options: Partial<EditorSessionOptions> = {}) {
  const s = createEditorSession({ source: pixelSource(createPixels(100, 60)), layerKinds: [fixture], tools: [{ id: 'select', actions: layerActions }], ...options });
  await vi.waitFor(() => expect(s.state.status).toBe('ready'));
  const layer = (id: string) => ({ id, name: id, kind: 'fixture', visible: true, opacity: 1, blend: 'normal' as const, quad: rectQuad({ width: 20, height: 10 }) });
  s.commit({ layers: [layer('a'), layer('b')] }, { label: 'Layers' });
  return s;
}

describe('layer actions', () => {
  it('duplicate, delete and select are actions the host sees, each commit one labelled step', async () => {
    const seen: string[] = [];
    const s = await start({ onAction: (action, next) => { seen.push(action.id); return next(); } });
    seen.length = 0;
    expect(s.action('layers.duplicate').enabled).toBe(false);
    s.setToolData(SELECTED_LAYER, 'a');
    const copy = s.run('layers.duplicate', { label: 'Duplicate layer' }) as string;
    expect(s.state.recipe.layers!.map(l => l.id)).toEqual(['a', copy, 'b']);
    expect(selectedLayerId(s)).toBe(copy);
    expect(s.history.current.label).toBe('Duplicate layer');
    s.run('layers.delete', { label: 'Delete layer' });
    expect(s.state.recipe.layers!.map(l => l.id)).toEqual(['a', 'b']);
    expect(selectedLayerId(s)).toBeNull();
    expect(s.history.current.label).toBe('Delete layer');
    s.run('layers.selectAbove');
    expect(selectedLayerId(s)).toBe('b');
    s.run('layers.selectBelow');
    expect(selectedLayerId(s)).toBe('a');
    s.run('layers.deselect');
    expect(selectedLayerId(s)).toBeNull();
    expect(seen).toEqual(['layers.duplicate', 'layers.delete', 'layers.selectAbove', 'layers.selectBelow', 'layers.deselect']);
    s.undo();
    expect(s.state.recipe.layers).toHaveLength(3);
    s.dispose();
  });
  it('a refused delete leaves the layer and its selection', async () => {
    const s = await start({ onAction: (action, next) => action.id === 'layers.delete' ? undefined : next() });
    s.setToolData(SELECTED_LAYER, 'b');
    s.run('layers.delete', { label: 'Delete layer' });
    expect(s.state.recipe.layers).toHaveLength(2);
    expect(selectedLayerId(s)).toBe('b');
    s.dispose();
  });
  it('a moved draft commits as one step, and a refused commit is reverted by the caller', async () => {
    const s = await start({ onAction: (action, next) => action.id === 'edit.commit' && (action.args as { options: { label: string } }).options.label === 'Refused' ? undefined : next() });
    const before = s.history.nodes.length;
    for (const dx of [1, 2, 3]) s.preview({ layers: s.state.draft.layers!.map(l => l.id === 'a' ? { ...l, quad: translateQuad(rectQuad({ width: 20, height: 10 }), dx, 0) } : l) });
    s.commit({}, { label: 'Nudge' });
    expect(s.history.nodes.length).toBe(before + 1);
    expect(s.state.recipe.layers![0]!.quad[0]).toEqual([3, 0]);
    s.preview({ layers: s.state.draft.layers!.map(l => l.id === 'a' ? { ...l, quad: translateQuad(l.quad, 5, 0) } : l) });
    s.commit({}, { label: 'Refused' });
    expect(s.state.draft).not.toBe(s.state.recipe);
    s.revert();
    expect(s.state.draft.layers![0]!.quad[0]).toEqual([3, 0]);
    s.dispose();
  });
});
