import { createElement } from 'react';
import { IconMove } from 'glass-ux/icons';
import { retouchMessages } from '../../messages/retouch.js';
import { defineTool } from '../../react/tool.js';
import { createLiquifyGrid, liquifyDab, liquifyWarp } from '../../retouch/liquify.js';
import { RetouchOverlay } from './overlay.js';
import { RetouchPanel } from './panel.js';
const interaction = { create: createLiquifyGrid, apply: liquifyDab };
/** Opt-in liquify warp tool; its displacement engine is absent from individual pixel-tool entries. */
export const liquify = /* @__PURE__ */ defineTool({
  id: 'retouch.liquify', group: 'retouch', messages: retouchMessages, label: words => words.liquify,
  icon: createElement(IconMove), filters: [liquifyWarp],
  Panel: () => createElement(RetouchPanel, { kind: 'liquify' }),
  Overlay: () => createElement(RetouchOverlay, { kind: 'liquify', liquify: interaction }),
});
