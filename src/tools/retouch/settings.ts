/* tokens:allow-file Replacement target is image colour data, independent of theme. */
import { srgbToLinear } from '../../core/pixels.js';
import { defaultBrush, type BrushValues } from '../../controls/brush-picker.js';
import type { EditorSession } from '../../session/index.js';
import type { BrushParams, RetouchTool, StrokePoint } from '../../retouch/stroke.js';
import type { LiquifyMode } from '../../retouch/liquify.js';
/** A painting tool or the displacement-grid tool. */
export type RetouchKind = RetouchTool | 'liquify';
/** Plain settings stored in toolData, never in pixel buffers. */
export interface RetouchSettings extends BrushValues {
  /** Effect strength, 0–1. */ strength: number;
  /** Tonal weighting for dodge and burn. */ tonalRange: NonNullable<BrushParams['tonalRange']>;
  /** Reduce rather than increase saturation. */ desaturate: boolean;
  /** Source point for cloning, healing or patching, in decoded source pixels. */ source: StrokePoint | null;
  /** Polygon defining a patch destination. */ selection: readonly StrokePoint[];
  /** Whether the next drag selects a patch rectangle. */ selecting: boolean;
  /** Liquify gesture. */ mode: LiquifyMode;
  /** Colour to replace, in display sRGB hex. */ targetColour: string;
  /** Euclidean linear RGB matching tolerance. */ tolerance: number;
}
/** Read settings without requiring a particular editor composition. */
export function readRetouchSettings(session: EditorSession, kind: RetouchKind): RetouchSettings {
  return { ...defaultBrush, strength: .5, tonalRange: 'all', desaturate: false, source: null, selection: [], selecting: kind === 'patch', mode: 'push', targetColour: '#ff0000', tolerance: .3, ...session.state.toolData[`retouch.${kind}`] as Partial<RetouchSettings> };
}
/** Update controls only; image changes must still pass through a session action. */
export function setRetouchSettings(session: EditorSession, kind: RetouchKind, patch: Partial<RetouchSettings>): void {
  session.setToolData(`retouch.${kind}`, { ...readRetouchSettings(session, kind), ...patch });
}
/** Convert the display colour at the painting API edge. */
export function linearColour(hex: string): readonly [number, number, number, number] {
  let value = hex.trim().slice(1);
  if (value.length === 3 || value.length === 4) value = Array.from(value, c => c + c).join('');
  if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) throw new RangeError('Expected an sRGB hex colour');
  const channel = (i: number) => Number.parseInt(value.slice(i, i + 2), 16) / 255;
  return [srgbToLinear(channel(0)), srgbToLinear(channel(2)), srgbToLinear(channel(4)), value.length === 8 ? channel(6) : 1];
}
/** Materialise a brush kernel's plain parameters. */
export function brushParams(settings: RetouchSettings, point: StrokePoint): BrushParams {
  const target = linearColour(settings.targetColour);
  return { size: settings.size, hardness: settings.hardness, opacity: settings.opacity, flow: settings.flow, colour: linearColour(settings.colour), strength: settings.strength, tonalRange: settings.tonalRange, desaturate: settings.desaturate, tolerance: settings.tolerance, targetColour: [target[0], target[1], target[2]], ...(settings.source ? { sourceOffset: { x: settings.source.x - point.x, y: settings.source.y - point.y } } : {}) };
}
