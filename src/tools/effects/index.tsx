import { IconFilter } from 'glass-ux/icons';
import { defineTool } from '../../react/tool.js';
import { effectsMessages } from '../../messages/effects.js';
import { effectsSessionTool } from './session.js';
import type { EffectCategory } from '../../filters/effects/catalogue.js';
import { EffectsStackPanel, FilterGalleryPanel } from './panel.js';
const categories: EffectCategory[] = ['blur', 'sharpness', 'artistic', 'vintage', 'light', 'distortion', 'pixel', 'noise', 'stylisation', 'grading'];
/** All effects, grouped into independently collapsible public gallery sections. */
export const effects = /* @__PURE__ */ defineTool({ ...effectsSessionTool, id: 'effects', messages: effectsMessages, group: 'effects', label: m => m.effects, icon: <IconFilter />, 
    Sections: [{ id: 'stack', label: m => m.stack, Panel: EffectsStackPanel }, ...categories.map(category => ({ id: category, label: (m: typeof effectsMessages.defaults) => m[category], Panel: () => <FilterGalleryPanel category={category}/> })), { id: 'presets', label: m => m.looks, Panel: () => <FilterGalleryPanel presets/> }]
});
export { effectsActions, readEffects, type EffectActionArgs } from './actions.js';
export { FilterGalleryPanel, EffectsStackPanel, type FilterGalleryPanelProps, type EffectsStackPanelProps } from './panel.js';
export { effectDefinitions, type EffectEntry, type EffectDefinition, type EffectCategory } from '../../filters/effects/catalogue.js';
export { effectStack, effectWarpStack, type EffectStackParams } from '../../filters/effects/stack.js';

export { effectsSessionTool } from './session.js';
