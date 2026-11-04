/// <reference lib="webworker" />
import { encodeRasterImage, type EncodeOptions } from '../io/encode-core.js';
import { fillEdgePixels, type FillRequest } from './inpaint.js';

/** What the fill worker receives: the picture and how to encode the result. */
export interface FillWorkerRequest extends FillRequest { encode: EncodeOptions }
/** Messages from the fill worker: progress, then the encoded picture or a failure. */
export type FillReply = { type: 'progress'; value: number } | { type: 'done'; blob: Blob | null; filled: number } | { type: 'error'; message: string };

const post = (reply: FillReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
self.onmessage = async (event: MessageEvent<FillWorkerRequest>) => {
  try {
    const { encode, ...request } = event.data, { width, height } = request.pixels;
    let last = 0;
    const { bytes, filled } = await fillEdgePixels(request, { sliceMs: 100, onProgress: value => { if (value - last >= .01) { last = value; post({ type: 'progress', value: value * .95 }); } } });
    // Encoding here keeps the canvas work off the page's thread too.
    post({ type: 'done', blob: filled ? await encodeRasterImage(bytes, width, height, encode) : null, filled });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
