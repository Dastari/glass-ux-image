import type { TextSpec } from "./spec.js";
export type MeasureText = (text: string) => number;
const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });
const words = new Intl.Segmenter("und", { granularity: "word" });
/** Greedy word wrap, using whole graphemes for overlong words. Explicit blank lines survive. */
export function wrapText(content: string, boxWidth: number | null, measure: MeasureText): string[] {
  if (boxWidth !== null && (!Number.isFinite(boxWidth) || boxWidth <= 0)) throw new RangeError("Invalid wrap width");
  return content.replace(/\r\n?/g, "\n").split("\n").flatMap(paragraph => {
    if (boxWidth === null || measure(paragraph) <= boxWidth) return [paragraph];
    const lines: string[] = [];
    let line = "";
    for (const { segment } of words.segment(paragraph)) {
      if (measure(line + segment) <= boxWidth) { line += segment; continue; }
      if (line) { lines.push(line.trimEnd()); line = ""; }
      if (!segment.trim()) continue;
      if (measure(segment) <= boxWidth) { line = segment; continue; }
      for (const { segment: cluster } of graphemes.segment(segment)) {
        if (line && measure(line + cluster) > boxWidth) { lines.push(line); line = ""; }
        line += cluster;
      }
    }
    if (line || !lines.length) lines.push(line);
    return lines;
  });
}
export interface TextLine {
  /** One complete shaped line, without a newline delimiter. */
  text: string;
  /** Shaped advance in document pixels. */
  width: number;
  /** Logical alignment anchor in document pixels. */
  x: number;
  /** Baseline position relative to the first line. */
  baseline: number;
}
export interface TextLayout {
  /** Wrap box width or the longest unwrapped advance. */
  width: number;
  /** Number of lines times the configured baseline distance. */
  height: number;
  /** Lines in logical paragraph order. */
  lines: TextLine[];
}
/** Pure layout. Measurement includes font shaping and letter spacing. x is a canvas anchor. */
export function layoutText(spec: TextSpec, measure: MeasureText): TextLayout {
  const lines = wrapText(spec.content, spec.boxWidth, measure).map(text => ({ text, width: measure(text) }));
  const width = spec.boxWidth ?? Math.max(0, ...lines.map(line => line.width));
  const right = spec.alignment === "end" ? spec.direction === "ltr" : spec.direction === "rtl";
  const x = spec.alignment === "center" ? width / 2 : right ? width : 0;
  return { width, height: lines.length * spec.lineHeight,
    lines: lines.map((line, i) => ({ ...line, x, baseline: i * spec.lineHeight })) };
}
