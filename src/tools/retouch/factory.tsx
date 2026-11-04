import { IconBrush, IconPatch, IconCopy, IconEye, IconReplace, IconDroplet, IconSun, IconFlame } from 'glass-ux/icons';
import { IconEraser, IconSharpen, IconSmudge, IconSponge, IconSpotHeal, IconPatchRegion } from '../../icons/retouch.js';
import { retouchMessages } from '../../messages/retouch.js';
import { defineTool } from '../../react/tool.js';
import { retouchStage } from '../../retouch/stage.js';
import { RetouchOverlay } from './overlay.js';
import { RetouchPanel } from './panel.js';
import { brushKeyActions } from './brush-keys.js';
import type { RetouchTool } from '../../retouch/stroke.js';

/** Build one opt-in tool; each public tool entry calls this separately. */
export function createRetouchTool(kind: RetouchTool, shortcut?: string) {
  return defineTool({ id: `retouch.${kind}`, group: 'retouch', messages: retouchMessages, label: words => words[kind], icon: ({brush:<IconBrush/>,eraser:<IconEraser/>,clone:<IconCopy/>,heal:<IconPatch/>, 'spot-heal':<IconSpotHeal/>,patch:<IconPatchRegion/>,blur:<IconDroplet/>,sharpen:<IconSharpen/>,smudge:<IconSmudge/>,dodge:<IconSun/>,burn:<IconFlame/>,sponge:<IconSponge/>, 'colour-replace':<IconReplace/>, 'red-eye':<IconEye/>})[kind], shortcut,
    stages: [retouchStage], actions: brushKeyActions,
    reset: recipe => ({ strokes: recipe.strokes.filter(stroke => stroke.tool !== kind) }),
    Panel: () => <RetouchPanel kind={kind} />, Overlay: () => <RetouchOverlay kind={kind} />,
  });
}
