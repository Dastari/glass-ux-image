import { textFont, type TextSpec } from "./spec.js";
export interface TextFontSet {
  /** Load matching faces for the given CSS font and text. */
  load(font: string, text?: string): Promise<unknown>;
}
/** Font readiness policy; loading and fallback decisions belong to the host. */
export interface TextFontReadyOptions {
  /** Maximum wait before returning false. Default 3000 ms. */
  timeoutMs?: number;
  /** FontFaceSet-compatible host adapter; defaults to document/worker fonts. */
  fonts?: TextFontSet;
}
/** Hosts load web fonts first, then create/invalidate text sources. Never waits indefinitely.
 * false means unavailable, failed or timed out: the host may use its declared fallback font. */
export async function whenFontReady(spec: TextSpec, options: TextFontReadyOptions = {}): Promise<boolean> {
  const fonts = options.fonts ?? (globalThis as typeof globalThis & { fonts?: TextFontSet }).fonts ??
    (typeof document === "undefined" ? undefined : document.fonts);
  if (!fonts) return false;
  const timeout = options.timeoutMs ?? 3000;
  if (!Number.isFinite(timeout) || timeout < 0) throw new RangeError("Invalid font timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fonts.load(textFont(spec), spec.content || "Mg")).then(result =>
        !Array.isArray(result) || result.length > 0),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeout); }),
    ]);
  } catch { return false; }
  finally { clearTimeout(timer); }
}
