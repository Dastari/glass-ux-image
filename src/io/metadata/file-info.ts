import { ascii, bounded, ensure, MAX_FILE_BYTES, range, u16, u32 } from '../formats/bytes.js';
import { gifFrameCount, sniffFormat, type ImportFormat } from '../formats/index.js';
import { walk } from './tiff.js';

/** What a file's headers say about how its pixels are stored. Fields a format does not record are absent. */
export interface ImageFileInfo {
  /** Container, from the byte signature. */
  format: ImportFormat;
  /** Stored width, before orientation. */
  width?: number;
  /** Stored height, before orientation. */
  height?: number;
  /** Bits per channel. */
  bitDepth?: number;
  /** How colour is stored. JPEG's YCbCr reads as RGB, as photo applications show it. */
  colour?: 'rgb' | 'grey' | 'indexed' | 'cmyk' | 'lab' | 'multichannel' | 'bitmap';
  /** Whether the file stores transparency. */
  alpha?: boolean;
  /** Lossy or lossless coding. */
  compression?: 'lossy' | 'lossless';
  /** Progressive JPEG, or interlaced PNG and GIF. */
  progressive?: boolean;
  /** JPEG chroma subsampling, such as `4:2:0`. */
  subsampling?: string;
  /** Animation frames or pages, when more than one is possible. */
  frames?: number;
}

/** Read headers only; no pixel data is decoded. A damaged header yields what was read before it. */
export function readFileInfo(bytes: Uint8Array): ImageFileInfo {
  bounded(bytes, MAX_FILE_BYTES);
  const format = sniffFormat(bytes), info: ImageFileInfo = { format };
  try {
    if (format === 'png') png(bytes, info);
    else if (format === 'jpeg') jpeg(bytes, info);
    else if (format === 'webp') webp(bytes, info);
    else if (format === 'gif') gif(bytes, info);
    else if (format === 'tiff') tiff(bytes, info);
    else if (format === 'psd') psd(bytes, info);
  } catch { /* Keep what the readable part of the header said. */ }
  return info;
}
function png(bytes: Uint8Array, info: ImageFileInfo) {
  ensure(ascii(bytes.subarray(12, 16)) === 'IHDR');
  info.width = u32(bytes, 16); info.height = u32(bytes, 20); info.bitDepth = bytes[24]!;
  const type = bytes[25]!; info.colour = type === 3 ? 'indexed' : type === 0 || type === 4 ? 'grey' : 'rgb'; info.alpha = type === 4 || type === 6;
  info.progressive = bytes[28] === 1; info.compression = 'lossless';
  for (let p = 8; p + 8 <= bytes.length;) {
    const n = u32(bytes, p), kind = ascii(bytes.subarray(p + 4, p + 8));
    if (kind === 'tRNS') info.alpha = true;
    if (kind === 'acTL') { range(bytes, p + 8, 4); info.frames = u32(bytes, p + 8); }
    if (kind === 'IDAT' || kind === 'IEND') break;
    p += 12 + n;
  }
}
function jpeg(bytes: Uint8Array, info: ImageFileInfo) {
  info.compression = 'lossy';
  let adobe: number | undefined;
  for (let p = 2; p < bytes.length;) {
    ensure(bytes[p++] === 255); while (bytes[p] === 255) p++;
    const marker = bytes[p++]!; if (marker === 0xda || marker === 0xd9) break;
    const length = u16(bytes, p); range(bytes, p, length);
    if (marker === 0xee && ascii(bytes.subarray(p + 2, p + 7)) === 'Adobe' && length >= 14) adobe = bytes[p + 13];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      info.bitDepth = bytes[p + 2]!; info.height = u16(bytes, p + 3); info.width = u16(bytes, p + 5);
      const components = bytes[p + 7]!;
      info.colour = components === 1 ? 'grey' : components === 4 ? 'cmyk' : 'rgb';
      info.progressive = [0xc2, 0xc6, 0xca, 0xce].includes(marker);
      if ([0xc3, 0xc7, 0xcb, 0xcf].includes(marker)) info.compression = 'lossless';
      if (components === 3 && adobe !== 0) {
        const h = bytes[p + 9]! >> 4, v = bytes[p + 9]! & 15, ch = bytes[p + 12]! >> 4, cv = bytes[p + 12]! & 15;
        const x = h / ch, y = v / cv;
        info.subsampling = x === 1 && y === 1 ? '4:4:4' : x === 2 && y === 1 ? '4:2:2' : x === 2 && y === 2 ? '4:2:0' : x === 4 && y === 1 ? '4:1:1' : x === 1 && y === 2 ? '4:4:0' : undefined;
      }
      break;
    }
    p += length;
  }
  info.alpha = false;
}
function webp(bytes: Uint8Array, info: ImageFileInfo) {
  let frames = 0;
  for (let p = 12; p + 8 <= bytes.length;) {
    const type = ascii(bytes.subarray(p, p + 4)), n = u32(bytes, p + 4, true); range(bytes, p + 8, n);
    if (type === 'VP8X') { const flags = bytes[p + 8]!; info.alpha = !!(flags & 0x10); if (flags & 0x02) info.frames = 0; info.width = 1 + bytes[p + 12]! + bytes[p + 13]! * 256 + bytes[p + 14]! * 65536; info.height = 1 + bytes[p + 15]! + bytes[p + 16]! * 256 + bytes[p + 17]! * 65536; }
    if (type === 'ALPH') info.alpha = true;
    if (type === 'VP8L') { info.compression ??= 'lossless'; const bits = u32(bytes, p + 9, true); info.width ??= (bits & 16383) + 1; info.height ??= ((bits >>> 14) & 16383) + 1; if (bits & 0x10000000) info.alpha = true; }
    if (type === 'VP8 ') { info.compression ??= 'lossy'; info.width ??= u16(bytes, p + 14, true) & 16383; info.height ??= u16(bytes, p + 16, true) & 16383; }
    if (type === 'ANMF') { frames++; const inner = ascii(bytes.subarray(p + 24, p + 28)); info.compression ??= inner === 'VP8L' ? 'lossless' : inner === 'VP8 ' || inner === 'ALPH' ? 'lossy' : undefined; }
    p += 8 + n + (n % 2);
  }
  if (info.frames !== undefined || frames) info.frames = frames;
  info.bitDepth = 8; info.colour = 'rgb'; info.alpha ??= false;
}
function gif(bytes: Uint8Array, info: ImageFileInfo) {
  info.width = u16(bytes, 6, true); info.height = u16(bytes, 8, true); info.colour = 'indexed'; info.compression = 'lossless';
  info.bitDepth = 8; info.frames = gifFrameCount(bytes);
}
function tiff(bytes: Uint8Array, info: ImageFileInfo) {
  const { entries, directories, le } = walk(bytes, MAX_FILE_BYTES);
  const first = (tag: number) => { const e = entries.find(e => e.ifd === 'ifd0' && e.tag === tag); return e ? (e.type === 3 ? u16(bytes, e.data, le) : u32(bytes, e.data, le)) : undefined; };
  info.width = first(0x100); info.height = first(0x101); info.bitDepth = first(0x102) ?? 1;
  const photometric = first(0x106), samples = first(0x115) ?? 1, compression = first(0x103) ?? 1;
  info.colour = photometric === 0 || photometric === 1 ? (info.bitDepth === 1 ? 'bitmap' : 'grey') : photometric === 3 ? 'indexed' : photometric === 5 ? 'cmyk' : photometric === 8 || photometric === 9 ? 'lab' : 'rgb';
  const base = info.colour === 'cmyk' ? 4 : info.colour === 'rgb' || info.colour === 'lab' ? 3 : 1;
  info.alpha = samples > base; info.compression = [6, 7, 34892, 34712].includes(compression) ? 'lossy' : 'lossless';
  info.frames = directories.filter(d => d.ifd === 'ifd0' || d.ifd === 'ifd1').length;
}
function psd(bytes: Uint8Array, info: ImageFileInfo) {
  range(bytes, 0, 26);
  const channels = u16(bytes, 12), mode = u16(bytes, 24);
  info.height = u32(bytes, 14); info.width = u32(bytes, 18); info.bitDepth = u16(bytes, 22); info.compression = 'lossless';
  info.colour = mode === 0 ? 'bitmap' : mode === 1 || mode === 8 ? 'grey' : mode === 2 ? 'indexed' : mode === 4 ? 'cmyk' : mode === 7 ? 'multichannel' : mode === 9 ? 'lab' : 'rgb';
  const base = info.colour === 'cmyk' ? 4 : info.colour === 'rgb' || info.colour === 'lab' ? 3 : 1;
  info.alpha = info.colour !== 'multichannel' && channels > base;
}
