import type { SessionTool } from '../../session/index.js';
import { effectFilters, effectWarps } from '../../filters/effects/catalogue.js';
import { effectStack, effectWarpStack } from '../../filters/effects/stack.js';
import { effectsActions } from './actions.js';
/** Headless registration, including direct recipe ids and duplicate-capable ordered stacks. No React. */
export const effectsSessionTool: SessionTool = {
  id: 'effects',
  filters: [...effectFilters, ...effectWarps, effectStack, effectWarpStack],
  actions: effectsActions,
};
