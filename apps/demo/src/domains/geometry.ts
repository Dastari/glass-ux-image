import type { ImageTool } from 'glass-ux-image/react';
import { crop } from 'glass-ux-image/tools/crop';
import { resize } from 'glass-ux-image/tools/resize';
import { rotate } from 'glass-ux-image/tools/rotate';
import { flip } from 'glass-ux-image/tools/flip';
import { straighten } from 'glass-ux-image/tools/straighten';
import { canvasSize } from 'glass-ux-image/tools/canvas-size';
import { move } from 'glass-ux-image/tools/move';
import { transform } from 'glass-ux-image/tools/transform';
import { perspective } from 'glass-ux-image/tools/perspective';
/** Independently importable geometry tools. */
export const geometryTools: readonly ImageTool[] = [crop, resize, rotate, flip, straighten, canvasSize, move, transform, perspective];
