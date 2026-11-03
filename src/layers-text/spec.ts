/** Straight-alpha sRGB in 0–1. Conversion belongs only to the rasteriser. */
export type TextColour = readonly [number, number, number, number];
/** Plain data. All lengths are document pixels. Load web fonts before creating a source. */
export interface TextSpec {
  /** Plain Unicode content; newlines delimit paragraphs. No markup is interpreted. */
  content: string;
  /** CSS font-family list including any fallback. */
  fontFamily: string;
  /** CSS font weight, from 1 to 1000, or a named weight. */
  fontWeight: number | "normal" | "bold";
  /** CSS font slant. */
  fontStyle: "normal" | "italic" | "oblique";
  /** Font size in document pixels. */
  fontSize: number;
  /** Straight sRGB text fill and alpha in 0–1. */
  colour: TextColour;
  /** Logical alignment relative to the wrap box or longest line. */
  alignment: "start" | "center" | "end";
  /** Explicit paragraph direction, independent of the host chrome. */
  direction: "ltr" | "rtl";
  /** Baseline distance in document pixels, not a multiplier. */
  lineHeight: number;
  /** Extra document pixels between graphemes, using native shaping. */
  letterSpacing: number;
  /** null disables wrapping; newlines always break lines. */
  boxWidth: number | null;
  /** Optional rounded outline; width is its outward radius in document pixels. */
  outline?: {
    /** Outward stroke radius in document pixels. */
    width: number;
    /** Straight sRGB stroke colour. */
    colour: TextColour;
  };
  /** Optional canvas shadow in document pixels and straight sRGB. */
  shadow?: {
    /** Horizontal offset in image space, never mirrored. */
    offsetX: number;
    /** Vertical offset in image space. */
    offsetY: number;
    /** Canvas shadow blur radius in document pixels. */
    blur: number;
    /** Straight sRGB shadow colour. */
    colour: TextColour;
  };
}
/** Reject invalid text layout and colour values before rasterisation. */
export function validateTextSpec(spec: TextSpec): void {
  const positive = [spec.fontSize, spec.lineHeight, ...(spec.boxWidth === null ? [] : [spec.boxWidth])];
  const finite = [spec.letterSpacing, spec.outline?.width ?? 0, spec.shadow?.blur ?? 0,
    spec.shadow?.offsetX ?? 0, spec.shadow?.offsetY ?? 0];
  if (positive.some(n => !Number.isFinite(n) || n <= 0) || finite.some(n => !Number.isFinite(n)) ||
    (spec.outline?.width ?? 0) < 0 || (spec.shadow?.blur ?? 0) < 0) throw new RangeError("Invalid text dimensions");
  for (const colour of [spec.colour, spec.outline?.colour, spec.shadow?.colour]) {
    if (colour && (colour.length !== 4 || colour.some(n => !Number.isFinite(n) || n < 0 || n > 1))) {
      throw new RangeError("Text colours must be straight sRGB RGBA in 0–1");
    }
  }
}
/** Construct a canvas font declaration from a validated text specification. */
export const textFont = (spec: TextSpec) => `${spec.fontStyle} ${spec.fontWeight} ${spec.fontSize}px ${spec.fontFamily}`;
