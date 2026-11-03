/** Shared limits for hostile binary input. Hosts should also cap decoded pixel counts. */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_METADATA_BYTES = 16 * 1024 * 1024;
/** Rejected file structure, bounds or unsupported container data. */
export class FileDataError extends Error {
  override name = 'FileDataError';
  constructor(public readonly code: 'invalid' | 'limit' | 'unsupported' | 'permission' | 'storage', message: string, options?: ErrorOptions) { super(message, options); }
}
export function ensure(ok: unknown, message = 'Malformed or truncated file'): asserts ok {
  if (!ok) throw new FileDataError('invalid', message);
}
export function bounded(bytes: Uint8Array, limit = MAX_FILE_BYTES) {
  if (bytes.length > limit) throw new FileDataError('limit', 'File exceeds the byte limit');
  return bytes;
}
export function range(b: Uint8Array, p: number, n: number) {
  ensure(Number.isSafeInteger(p) && Number.isSafeInteger(n) && p >= 0 && n >= 0 && p <= b.length - n);
}
export function view(b: Uint8Array, p: number, n: number) { range(b, p, n); return new DataView(b.buffer, b.byteOffset + p, n); }
export function u16(b: Uint8Array, p: number, le = false) { return view(b,p,2).getUint16(0,le); }
export function u32(b: Uint8Array, p: number, le = false) { return view(b,p,4).getUint32(0,le); }
export const ascii = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
export const utf8 = (s: string) => new TextEncoder().encode(s);
export function concat(parts: readonly Uint8Array[]) {
  const size = parts.reduce((n,b) => n+b.length,0);
  if (size > MAX_FILE_BYTES) throw new FileDataError('limit','Output exceeds byte limit');
  const out = new Uint8Array(size); let p=0;
  for (const part of parts) { out.set(part,p); p+=part.length; } return out;
}
export function crc32(b: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of b) { crc ^= byte; for (let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc ^ 0xffffffff) >>> 0;
}
