import { geometryMapping, geometrySize, IDENTITY_GEOMETRY, type LayerSpec, type Quad } from '../core/index.js';
import { encodeRasterImage } from '../io/encode-core.js';
import type { EditorSession, EditRecipe } from '../session/index.js';
import { footprint, openCanvas } from './edges.js';
import { fillEdgePixels } from './inpaint.js';
import type { FillReply, FillWorkerRequest } from './inpaint-worker.js';

export interface FillEdgesOptions {
  /** History label for the one undo step. */
  label: string;
  signal?: AbortSignal;
  /** Fraction done, from 0 to 1. Reading the picture is the first tenth. */
  onProgress?: (fraction: number) => void;
  /** Makes the worker that fills. Override it if your bundler needs a different worker URL. */
  worker?: () => Worker;
  /** Seed for the random search, so a fill can be repeated. */
  seed?: number;
}

/** Thrown when the geometry leaves nothing to fill, so the caller can say so. */
export class NoEmptyEdgesError extends Error { override name = 'NoEmptyEdgesError'; }

const defaultWorker = () => new Worker(new URL('./inpaint-worker.js', import.meta.url), { type: 'module' });
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve));

/** Fill and encode in a worker when one can start, else on this thread in frame-sized slices. */
function runFill(request: FillWorkerRequest, options: FillEdgesOptions): Promise<{ blob: Blob | null; filled: number }> {
  const progress = (value: number) => options.onProgress?.(.1 + value * .85);
  if (typeof Worker === 'undefined' && !options.worker) return fillEdgePixels(request, { signal: options.signal, onProgress: v => progress(v * .95), pause: nextTask })
    .then(async ({ bytes, filled }) => ({ filled, blob: filled ? await encodeRasterImage(bytes, request.pixels.width, request.pixels.height, request.encode) : null }));
  return new Promise((resolve, reject) => {
    const worker = (options.worker ?? defaultWorker)();
    const stop = (error?: unknown, result?: { blob: Blob | null; filled: number }) => {
      worker.terminate();
      options.signal?.removeEventListener('abort', abort);
      if (result) resolve(result); else reject(error);
    };
    const abort = () => stop(options.signal!.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<FillReply>) => {
      const reply = event.data;
      if (reply.type === 'progress') progress(reply.value);
      else if (reply.type === 'done') stop(undefined, { blob: reply.blob, filled: reply.filled });
      else stop(new Error(reply.message));
    };
    worker.onerror = event => { event.preventDefault(); stop(new Error(event.message || 'Fill worker failed')); };
    worker.postMessage(request, [request.pixels.data.buffer]);
  });
}

/**
 * Synthesise the empty edges that a free angle, perspective or added canvas leave, from the picture's
 * own content. The base picture is baked with its strokes, geometry and warps into a new source, as
 * flatten does, so the work becomes one undo step that restores the source and recipe together.
 * Filters stay live on the new base, layers keep their place, and the host sees the commit through
 * `onAction`. Rejects with `NoEmptyEdgesError` when nothing is empty.
 */
export async function fillEdges(session: EditorSession, options: FillEdgesOptions): Promise<void> {
  const recipe = session.state.recipe, source = session.state.sourceSize, original = session.original;
  if (session.state.status !== 'ready' || !source || !original) throw new Error('The picture has not loaded');
  const signal = options.signal ? AbortSignal.any([options.signal, session.signal]) : session.signal;
  const warps = new Set(session.renderingParts.filters.filter(filter => 'map' in filter).map(filter => filter.id));
  const warped = Object.keys(recipe.filters).some(id => warps.has(id));
  // Only the base picture is baked: its strokes, geometry and warps, with any canvas colour left open.
  const geometry = openCanvas(recipe.geometry);
  const base: EditRecipe = { ...recipe, geometry, filters: Object.fromEntries(Object.entries(recipe.filters).filter(([id]) => warps.has(id))), layers: [], strokes: (recipe.strokes ?? []).filter(stroke => !stroke.layer) };
  const size = geometrySize(source, geometry);
  options.onProgress?.(0);
  const pixels = await session.readPreview(Math.max(size.width, size.height), { recipe: base, signal });
  signal.throwIfAborted();
  options.onProgress?.(.1);
  const encode = { type: 'image/png', ...(recipe.geometry.resize?.dpi ? { dpi: recipe.geometry.resize.dpi } : {}), ...(original.metadata ? { originalMetadata: original.metadata } : {}) };
  const { blob, filled } = await runFill({ pixels, footprint: warped ? null : footprint(source, geometry), encode, ...(options.seed === undefined ? {} : { seed: options.seed }) }, { ...options, signal });
  if (!filled || !blob) throw new NoEmptyEdgesError('There are no empty edges to fill');
  signal.throwIfAborted();
  const decoded = await session.decodeImage(blob);
  signal.throwIfAborted();
  if (session.state.recipe !== recipe || session.original !== original) throw new Error('The picture changed while its edges were being filled');
  // Layers are placed in work space; the new base's pixels are the old output, so carry their corners there.
  const mapping = geometryMapping(source, recipe.geometry);
  const layers = (recipe.layers ?? []).map((layer): LayerSpec => ({ ...layer, quad: layer.quad.map(([x, y]) => mapping.fromWork(x, y) ?? [x, y]) as unknown as Quad }));
  const filters = Object.fromEntries(Object.entries(recipe.filters).filter(([id]) => !warps.has(id) && id !== 'perspective'));
  options.onProgress?.(1);
  session.commit({ geometry: { ...IDENTITY_GEOMETRY }, filters, layers, strokes: (recipe.strokes ?? []).filter(stroke => stroke.layer) }, { label: options.label, source: decoded });
}
