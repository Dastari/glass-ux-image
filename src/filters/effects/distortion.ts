import { defineWarp } from '../../core/warp.js';
/**
 * amount=0 is identity. Wave/ripple amounts are document-pixel displacements;
 * twirl amount is radians and fisheye amount is dimensionless (clamped to ±10).
 * Centre is normalised; radius/wavelength are document pixels; phase is radians.
 */
export interface DistortionParams {
    /** Pixels for wave/ripple, radians for twirl, dimensionless for fisheye; 0 is identity. */
    amount: number;
    /** Normalised document centre, default [.5, .5]. */
    centre?: readonly [
        number,
        number
    ];
    /** Sampling radius in document pixels. */
    radius?: number;
    /** Wave length in document pixels, default 40. */
    wavelength?: number;
    /** Wave phase in radians, default 0. */
    phase?: number;
}
function distortion(id: string, mode: 'fisheye' | 'wave' | 'ripple' | 'twirl') {
    return defineWarp<DistortionParams>({ id, map(x, y, p, size) {
            if (!p.amount)
                return [x, y];
            const cx = (p.centre?.[0] ?? .5) * size.width, cy = (p.centre?.[1] ?? .5) * size.height, dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), radius = Math.max(.001, p.radius ?? Math.min(size.width, size.height) * .5), wavelength = Math.max(.001, p.wavelength ?? 40), phase = p.phase ?? 0;
            if (mode === 'wave')
                return [x + p.amount * Math.sin(y / wavelength * Math.PI * 2 + phase), y];
            if (r >= radius || r === 0)
                return [x, y];
            const falloff = (1 - r / radius) ** 2;
            if (mode === 'twirl') {
                const a = p.amount * falloff, c = Math.cos(a), s = Math.sin(a);
                return [cx + dx * c - dy * s, cy + dx * s + dy * c];
            }
            const factor = mode === 'fisheye' ? Math.exp(Math.max(-10, Math.min(10, p.amount)) * falloff) : 1 + p.amount * Math.sin(r / wavelength * Math.PI * 2 + phase) * falloff / r;
            return [cx + dx * factor, cy + dy * factor];
        } });
}
/** Output-to-source radial lens distortion before filtering. */
export const fisheye = /* @__PURE__ */ distortion('fisheye', 'fisheye');
/** Output-to-source sinusoidal displacement with document-pixel wavelength. */
export const wave = /* @__PURE__ */ distortion('wave', 'wave');
/** Output-to-source concentric ripple around a normalised centre. */
export const ripple = /* @__PURE__ */ distortion('ripple', 'ripple');
/** Output-to-source angular displacement inside a bounded radius. */
export const twirl = /* @__PURE__ */ distortion('twirl', 'twirl');
