/**
 * Headless effects. All strength parameters use amount=0 as the neutral no-pass value,
 * and amount=1 for full strength. RGB is linear; alpha is premultiplied at every pass
 * boundary. Parameters, LUT samples and presets are serialisable plain data.
 *
 * Import individual families to select kernels. Point effects restore source alpha;
 * blur/pixel averaging filters also average alpha. Light effects retain HDR values.
 *
 * Spatial kernels deliberately use bounded sampling grids: 17 line taps, 33 lens-disc
 * taps, 5×5 artistic/bilateral grids and 3×3 mosaic grids. Large radii are approximate.
 * Gaussian-derived effects reuse the existing separable Gaussian implementation.
 *
 * .cube domains and samples are interpreted as linear RGB. Hosts must convert LUTs
 * authored for another transfer function before use. 1D shaper LUTs are unsupported.
 * All generated 3D atlases fit within WebGL2's minimum 4096-texel texture dimension.
 *
 * Browser conformance checks histogram bins, posterisation/threshold/halftone boundaries,
 * hash rounding and lens trigonometry at three pyramid levels. Discontinuous kernels
 * request full-float surfaces so half-float input rounding cannot select different bins.
 */
export * from './blur.js';
export * from './sharpness.js';
export * from './artistic.js';
export * from './vintage.js';
export * from './light.js';
export * from './distortion.js';
export * from './pixel.js';
export * from './noise.js';
export * from './stylisation.js';
export * from './grading.js';
export * from './cube.js';
export * from './presets.js';
