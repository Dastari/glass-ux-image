import type { EditorSession } from '../../session/index.js';
import type { Stroke } from '../../retouch/stroke.js';
import { brushParams, readPaintTarget, readRetouchSettings, targeted } from './settings.js';
import { createId } from '../../core/id.js';
/** Fill the chosen polygon from its source texture as one labelled, vetoable action. */
export function applyPatch(session: EditorSession, label: string): void {
  const settings = readRetouchSettings(session, 'patch'), points = settings.selection;
  if (!settings.source || points.length < 3) return;
  const xs = points.map(p => p.x), ys = points.map(p => p.y), left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left, height = Math.max(...ys) - top;
  const centre = { x: left + width / 2, y: top + height / 2 };
  // A selected area can be much larger than a brush. Cover it in bounded, overlapping
  // dabs so the store's between-dab budget remains effective for large patches.
  const size = 128, step = size / 2, rows = Math.max(1, Math.ceil(height / step));
  const path = [];
  for (let row = 0; row <= rows; row++) {
    const y = top + height * row / rows;
    path.push({ x: row % 2 ? left + width : left, y }, { x: row % 2 ? left : left + width, y });
  }
  const stroke: Stroke = targeted({ id: createId(), tool: 'patch' as const, params: { ...brushParams(settings, centre), size, spacing: .5, hardness: 1, selection: points }, points: path }, readPaintTarget(session));
  session.commit({ strokes: [...(session.state.recipe.strokes ?? []), stroke] }, { label });
  session.revert();
}
