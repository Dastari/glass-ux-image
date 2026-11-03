import { crop } from '../tools/crop.js';
import { resize } from '../tools/resize.js';
import { rotate } from '../tools/rotate.js';
import { flip } from '../tools/flip.js';
import { straighten } from '../tools/straighten.js';
import { canvasSize } from '../tools/canvas-size.js';
import { move } from '../tools/move.js';
import { transform } from '../tools/transform.js';
import { develop } from '../tools/develop/index.js';
import { spotHealing } from '../tools/retouch/spot-heal.js';
import { effects } from '../tools/effects/index.js';
/** Geometry, complete develop, spot healing and effects; independent of advanced. */
export const standard = [develop, crop, resize, rotate, flip, straighten, canvasSize, move, transform, spotHealing, effects];
export default standard;
