import type { PixelBuffer } from '../core/pixels.js';
import type { EffectEntry } from '../filters/effects/catalogue.js';
/** Encoded worker output; no main-thread canvas is needed. */
export interface ThumbnailResult {
    /** Encoded thumbnail width in pixels. */
    width: number;
    /** Encoded thumbnail height in pixels. */
    height: number;
    /** Display-ready PNG encoded away from the main thread. */
    blob: Blob;
}
interface Job {
    id: number;
    source: PixelBuffer;
    entries: readonly EffectEntry[];
    scale: number;
    signal: AbortSignal;
    resolve: (value: ThumbnailResult) => void;
    reject: (error: Error) => void;
}
let worker: Worker | undefined, active: Job | undefined, nextId = 0, users = 0;
const queue: Job[] = [];
const cancelled = () => new Error('Thumbnail cancelled');
function pump() {
    if (active)
        return;
    while (queue.length) {
        const job = queue.shift()!;
        if (job.signal.aborted) {
            job.reject(cancelled());
            continue;
        }
        active = job;
        if (!worker) {
            worker = new Worker(new URL('./filter-gallery-worker.js', import.meta.url), { type: 'module' });
            worker.onmessage = (event: MessageEvent<ThumbnailResult & {
                error?: boolean;
            }>) => { const job = active; active = undefined; if (job) {
                if (job.signal.aborted)
                    job.reject(cancelled());
                else if (event.data.error)
                    job.reject(new Error('Thumbnail failed'));
                else
                    job.resolve(event.data);
            } pump(); };
            worker.onerror = () => { const job = active; active = undefined; worker?.terminate(); worker = undefined; job?.reject(new Error('Thumbnail worker failed')); pump(); };
        }
        worker.postMessage({ id: job.id, source: job.source, params: { entries: job.entries }, scale: job.scale });
        return;
    }
}
/** Share one worker across gallery sections; an abandoned gallery never publishes stale pixels. */
export function acquireThumbnails() { users++; return () => { if (--users === 0) {
    worker?.terminate();
    worker = undefined;
    active?.reject(cancelled());
    active = undefined;
    for (const job of queue.splice(0))
        job.reject(cancelled());
} }; }
export function renderThumbnail(source: PixelBuffer, entries: readonly EffectEntry[], scale: number, signal: AbortSignal): Promise<ThumbnailResult> {
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            if (active === job) {
                // The worker cannot be interrupted, and a silent one would block every later job.
                worker?.terminate();
                worker = undefined;
                active = undefined;
                job.reject(cancelled());
                pump();
                return;
            }
            const index = queue.indexOf(job);
            if (index >= 0) {
                queue.splice(index, 1);
                job.reject(cancelled());
            }
        };
        const settle = () => signal.removeEventListener('abort', onAbort);
        const job: Job = {
            id: nextId++, source, entries, scale, signal,
            resolve: (value) => { settle(); resolve(value); },
            reject: (error) => { settle(); reject(error); },
        };
        signal.addEventListener('abort', onAbort, { once: true });
        queue.push(job);
        pump();
    });
}
/** A thumbnail cut from a larger preview, and how much of the preview's width it covers. */
export interface ThumbnailSample {
    /** Linear premultiplied pixels at exactly the requested size. */
    pixels: PixelBuffer;
    /** Width of the cut in source pixels, to turn effect sizes into thumbnail pixels. */
    sourceWidth: number;
}
/**
 * The centre of `source` at the thumbnail's aspect ratio (as `object-fit: cover` would show it),
 * resampled to `width` × `height` by averaging every source pixel under each thumbnail pixel, so
 * shrinking never aliases and enlarging stays smooth. Pure, for workers and tests.
 */
export function sampleThumbnail(source: PixelBuffer, width: number, height: number): ThumbnailSample {
    const aspect = width / height, wide = source.width / source.height > aspect;
    const cutWidth = wide ? source.height * aspect : source.width, cutHeight = wide ? source.height : source.width / aspect;
    const left = (source.width - cutWidth) / 2, top = (source.height - cutHeight) / 2;
    const stepX = cutWidth / width, stepY = cutHeight / height;
    const out = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        const y0 = top + y * stepY, y1 = y0 + stepY;
        for (let x = 0; x < width; x++) {
            const x0 = left + x * stepX, x1 = x0 + stepX, o = (y * width + x) * 4;
            let total = 0;
            // Box filter over the footprint; a footprint under one pixel samples bilinearly instead.
            if (stepX >= 1 && stepY >= 1) {
                for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
                    const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
                    if (wy <= 0) continue;
                    const row = Math.min(source.height - 1, sy) * source.width;
                    for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
                        const w = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
                        if (w <= 0) continue;
                        const i = (row + Math.min(source.width - 1, sx)) * 4;
                        for (let c = 0; c < 4; c++) out[o + c]! += source.data[i + c]! * w;
                        total += w;
                    }
                }
                for (let c = 0; c < 4; c++) out[o + c]! /= total;
            }
            else {
                const fx = Math.max(0, Math.min(source.width - 1, (x0 + x1) / 2 - .5)), fy = Math.max(0, Math.min(source.height - 1, (y0 + y1) / 2 - .5));
                const ax = Math.floor(fx), ay = Math.floor(fy), bx = Math.min(source.width - 1, ax + 1), by = Math.min(source.height - 1, ay + 1), tx = fx - ax, ty = fy - ay;
                for (let c = 0; c < 4; c++) {
                    const at = (px: number, py: number) => source.data[(py * source.width + px) * 4 + c]!;
                    out[o + c] = (at(ax, ay) * (1 - tx) + at(bx, ay) * tx) * (1 - ty) + (at(ax, by) * (1 - tx) + at(bx, by) * tx) * ty;
                }
            }
        }
    }
    return { pixels: { width, height, data: out }, sourceWidth: cutWidth };
}
