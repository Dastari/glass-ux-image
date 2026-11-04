import { createPixels, pixelsToRgba8, type PixelBuffer } from '../core/pixels.js';
import { effectStack, type EffectStackParams } from '../filters/effects/stack.js';
import { effectWarpStack } from '../filters/effects/stack.js';
import { sample } from '../filters/effects/shared.js';
import type { FilterPass } from '../core/filter.js';
import { sampleThumbnail } from './filter-gallery-jobs.js';
interface Request {
    id: number;
    sourceId: number;
    /** Sent with the first job for a source; later jobs name it by id. */
    source?: PixelBuffer;
    /** Resample the source to this size first. */
    size?: { width: number; height: number };
    params: EffectStackParams;
    scale: number;
}
/** Recent sources by id: one per open gallery section. An evicted one is sent again. */
const sources = new Map<number, PixelBuffer>(), samples = new Map<string, PixelBuffer>();
self.onmessage = async (event: MessageEvent<Request>) => {
    const { id, sourceId, params, scale } = event.data;
    try {
        if (event.data.source) {
            sources.set(sourceId, event.data.source);
            if (sources.size > 16) sources.delete(sources.keys().next().value!);
        }
        const original = sources.get(sourceId);
        // Evicted: the page sends it again and retries.
        if (!original) { self.postMessage({ id, missing: true }); return; }
        const size = event.data.size, key = size ? `${sourceId}:${size.width}x${size.height}` : '';
        let source = original;
        if (size) {
            source = samples.get(key) ?? sampleThumbnail(original, size.width, size.height).pixels;
            samples.set(key, source);
            if (samples.size > 16) samples.delete(samples.keys().next().value!);
        }
        let current = createPixels(source.width, source.height);
        for (let y = 0; y < source.height; y++)
            for (let x = 0; x < source.width; x++) {
                const q = effectWarpStack.map((x + .5) / scale, (y + .5) / scale, params, { width: source.width / scale, height: source.height / scale });
                current.data.set(sample(source, q[0] * scale - .5, q[1] * scale - .5), (y * source.width + x) * 4);
            }
        const saved: Record<string, PixelBuffer> = {};
        const passes: FilterPass[] = effectStack.passes(params, scale, { x: 0, y: 0, width: source.width, height: source.height, documentWidth: source.width, documentHeight: source.height });
        for (const pass of passes) {
            const target = createPixels(source.width, source.height), inputs = Object.fromEntries(Object.entries(pass.inputs ?? {}).map(([sampler, name]) => [sampler, saved[name]!]));
            pass.cpu(current, target, { inputs, textures: pass.textures ?? {} });
            if (pass.save)
                saved[pass.save] = target;
            current = target;
        }
        const bytes = pixelsToRgba8(current), canvas = new OffscreenCanvas(current.width, current.height);
        canvas.getContext('2d', { willReadFrequently: true })!.putImageData(new ImageData(new Uint8ClampedArray(bytes), current.width, current.height), 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({ id, width: current.width, height: current.height, blob });
    }
    catch {
        self.postMessage({ id, error: true });
    }
};
