import { select } from '../tools/select.js';
import { layers } from '../tools/layers/index.js';
import { text } from '../tools/text/index.js';
import { transform } from '../tools/transform.js';
import { brush, eraser, cloneStamp, healingBrush, patch, blurBrush, sharpenBrush, smudge, dodge, burn, sponge, colourReplacement, redEyeRemoval, liquify } from '../tools/retouch/index.js';
/**
 * Additional layer, painting and retouch tools. Combine with standard for the full suite. Select
 * (Photoshop's Move tool with Auto-Select) comes first, so it leads the rail and is active on opening.
 */
export const advanced = [select, layers, text, brush, eraser, cloneStamp, healingBrush, patch, blurBrush, sharpenBrush, smudge, dodge, burn, sponge, colourReplacement, redEyeRemoval, transform, liquify];
export default advanced;
