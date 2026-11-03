/** Wait for a source without letting an uncooperative source prevent cancellation. */
export function abortable<T>(work: PromiseLike<T> | T, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(work);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, {once:true});
    Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
/** A finite retry guard for reads repeatedly invalidated or evicted before they can be used. */
export async function retryRead(attempt: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (attempt >= 64) throw new Error('Tile source did not stabilise after 64 attempts');
  await abortable(new Promise<void>(resolve => setTimeout(resolve, 0)), signal);
}
