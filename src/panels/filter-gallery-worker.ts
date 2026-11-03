import { createPixels, pixelsToRgba8, type PixelBuffer } from '../core/pixels.js';
import { effectStack, type EffectStackParams } from '../filters/effects/stack.js';
import { effectWarpStack } from '../filters/effects/stack.js';
import { sample } from '../filters/effects/shared.js';
import type { FilterPass } from '../core/filter.js';
interface Request {
    id: number;
    source: PixelBuffer;
    params: EffectStackParams;
    scale: number;
}
self.onmessage = async (event: MessageEvent<Request>) => {
    const { id, source, params, scale } = event.data;
    try {
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
