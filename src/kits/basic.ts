import { crop } from '../tools/crop.js';
import { resize } from '../tools/resize.js';
import { rotate } from '../tools/rotate.js';
import { basicDevelop } from '../tools/develop/basic.js';
/** Small photo controls. A plain array: spread, filter or extend it in the host. */
export const basic = [crop, resize, rotate, basicDevelop];
export default basic;
