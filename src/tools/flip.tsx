import { Button } from 'glass-ux/button';
import { IconFlipHorizontal, IconFlipVertical } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { flipGeometry } from '../core/index.js';
import { geometryMessages } from '../messages/geometry.js';
import { imageEditorMessages } from '../react/messages.js';
import { useEditorContext } from '../react/session-context.js';
import { defineTool } from '../react/tool.js';
function FlipPanel() { const s = useEditorContext(), m = useMessages(imageEditorMessages), g = useMessages(geometryMessages); return <div className="gi-panel"><div className="gi-panel-buttons">{(['x', 'y'] as const).map(axis => <Button key={axis} size="sm" variant="secondary" icon={axis === 'x' ? <IconFlipHorizontal /> : <IconFlipVertical />} onClick={() => { if (s.state.sourceSize)
    s.commit({ geometry: flipGeometry(s.state.draft.geometry, s.state.sourceSize, axis) }, { label: g.flip }); }}>{axis === 'x' ? m.flipHorizontal : m.flipVertical}</Button>)}</div></div>; }
/** Mirror the image horizontally or vertically. */
export const flip = defineTool({ id: 'flip', group: 'geometry', messages: geometryMessages, label: m => m.flip, icon: <IconFlipHorizontal />, Panel: FlipPanel, reset: (r, s) => { let g = r.geometry; const size = s.state.sourceSize; if (size) { if (g.flipX) g = { ...g, ...flipGeometry(g, size, 'x') }; if (g.flipY) g = { ...g, ...flipGeometry(g, size, 'y') }; } return { geometry: g }; } });
