/** Content-aware fill for the empty edges that rotation, perspective and added canvas leave. */
export { inpaint, edgeMask, fillEdgePixels, type InpaintOptions, type FillRequest } from './inpaint.js';
export { footprint, hasEmptyEdges, openCanvas } from './edges.js';
export { fillEdges, NoEmptyEdgesError, type FillEdgesOptions } from './fill-edges.js';
