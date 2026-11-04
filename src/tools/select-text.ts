import { homography, rectQuad, type LayerSpec, type Quad, type Rect } from '../core/index.js';
import type { TextSpec } from '../layers-text/spec.js';
import type { EditorSession } from '../session/index.js';

/** Every length in a text spec times a factor, as scaling text in Photoshop changes its point size. */
export function scaleTextSpec(spec: TextSpec, k: number): TextSpec {
  return { ...spec, fontSize: spec.fontSize * k, lineHeight: spec.lineHeight * k, letterSpacing: spec.letterSpacing * k, boxWidth: spec.boxWidth === null ? null : spec.boxWidth * k,
    ...(spec.outline ? { outline: { ...spec.outline, width: spec.outline.width * k } } : {}),
    ...(spec.shadow ? { shadow: { ...spec.shadow, offsetX: spec.shadow.offsetX * k, offsetY: spec.shadow.offsetY * k, blur: spec.shadow.blur * k } } : {}) };
}
/** How far a text bitmap is enlarged on its quad: the larger of its two edge scales. */
export function textEnlargement(quad: Quad, bounds: Rect): number {
  return Math.max(Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]) / bounds.width, Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]) / bounds.height);
}
/**
 * The quad for text re-set at `k` times its size, so it lands where the enlarged bitmap was: each
 * corner of the new bitmap is taken back to the old text's coordinates and through the old quad.
 */
export function bakedTextQuad(quad: Quad, oldBounds: Rect, newBounds: Rect, k: number): Quad {
  const map = homography(rectQuad(oldBounds), quad);
  return rectQuad(newBounds).map(([u, v]) => map((newBounds.x + u) / k - oldBounds.x, (newBounds.y + v) / k - oldBounds.y) ?? [u, v]) as unknown as Quad;
}
/**
 * Re-set a text layer that a scale has enlarged at the larger size, so it stays sharp: the bitmap is
 * never stretched past its own pixels. Shrinking keeps the size, as the pyramid draws it sharply.
 * Loads the text measurer only when it runs.
 */
export async function sharpenScaledText(session: EditorSession, id: string): Promise<void> {
  const layer = session.state.draft.layers?.find(item => item.id === id);
  if (layer?.kind !== 'text' || !layer.data) return;
  const { createTextSource } = await import('../layers-text/rasteriser.js');
  const spec = layer.data as TextSpec, before = createTextSource(spec).bounds, k = textEnlargement(layer.quad, before);
  if (!(k > 1.01) || session.state.draft.layers?.find(item => item.id === id) !== layer) return;
  const next = scaleTextSpec(spec, k), after = createTextSource(next).bounds;
  const sharp: LayerSpec = { ...layer, data: next, quad: bakedTextQuad(layer.quad, before, after, k) };
  session.preview({ layers: session.state.draft.layers!.map(item => item.id === id ? sharp : item) });
}
