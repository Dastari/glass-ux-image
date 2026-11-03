/**
 * A random identifier for layers, strokes and pictures.
 *
 * `crypto.randomUUID` exists only in secure contexts (HTTPS and localhost), so a page served over plain
 * HTTP on a local network would throw. `crypto.getRandomValues` works in every context, so this falls
 * back to it and formats an RFC 4122 version 4 identifier.
 */
export function createId(): string {
  const { crypto } = globalThis;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
