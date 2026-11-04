import type { ActionOverride, EditorSession } from '../../session/index.js';
import { readRetouchSettings, setRetouchSettings, type RetouchKind } from './settings.js';

/** Photoshop's steps for [ and ]: finer for small brushes, coarser for large ones. */
const STEPS: readonly (readonly [below: number, step: number])[] = [[10, 1], [50, 5], [100, 10], [200, 25], [300, 50], [Infinity, 100]];
/** Smallest and largest brush diameters, matching the brush picker. */
export const BRUSH_SIZE_RANGE = [1, 500] as const;

/** The next brush diameter up (1) or down (-1), on Photoshop's steps, within the picker's range. */
export function nextBrushSize(size: number, direction: 1 | -1): number {
  const at = direction === 1 ? size : size - 1e-9, step = STEPS.find(([below]) => at < below)![1];
  const next = direction === 1 ? Math.floor(size / step) * step + step : Math.ceil(size / step) * step - step;
  return Math.max(BRUSH_SIZE_RANGE[0], Math.min(BRUSH_SIZE_RANGE[1], next));
}
/** Hardness in quarters, as Shift+[ and Shift+] change it. */
export function nextBrushHardness(hardness: number, direction: 1 | -1): number {
  return Math.max(0, Math.min(1, (direction === 1 ? Math.floor(hardness * 4 + 1e-9) + 1 : Math.ceil(hardness * 4 - 1e-9) - 1) / 4));
}
const activeKind = (session: EditorSession): RetouchKind | null => session.state.tool?.startsWith('retouch.') ? session.state.tool.slice(8) as RetouchKind : null;
const adjust = (change: (kind: RetouchKind, session: EditorSession) => void): ActionOverride['run'] => session => { const kind = activeKind(session); if (kind) change(kind, session); };

/**
 * Brush size and hardness from the keyboard while a retouch tool is active: [ and ] for size,
 * Shift with them for hardness, as in Photoshop. These change tool settings, not the picture, so
 * they record no history.
 */
export const brushKeyActions: readonly ActionOverride[] = [
  { id: 'brush.smaller', enabled: s => activeKind(s) !== null, run: adjust((kind, s) => setRetouchSettings(s, kind, { size: nextBrushSize(readRetouchSettings(s, kind).size, -1) })) },
  { id: 'brush.larger', enabled: s => activeKind(s) !== null, run: adjust((kind, s) => setRetouchSettings(s, kind, { size: nextBrushSize(readRetouchSettings(s, kind).size, 1) })) },
  { id: 'brush.softer', enabled: s => activeKind(s) !== null, run: adjust((kind, s) => setRetouchSettings(s, kind, { hardness: nextBrushHardness(readRetouchSettings(s, kind).hardness, -1) })) },
  { id: 'brush.harder', enabled: s => activeKind(s) !== null, run: adjust((kind, s) => setRetouchSettings(s, kind, { hardness: nextBrushHardness(readRetouchSettings(s, kind).hardness, 1) })) },
];
