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
