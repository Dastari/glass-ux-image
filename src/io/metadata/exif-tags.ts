import { ascii, bounded, ensure, MAX_METADATA_BYTES, u16, u32, utf8, view } from '../formats/bytes.js';
import { walk, type Entry, type ExifIfd } from './tiff.js';

/** A typed EXIF value: text, a number, several numbers, or the length of opaque binary data. */
export type ExifValue = string | number | readonly number[] | { binary: number };
/** One readable EXIF entry. Unknown tags keep their numeric id as their name. */
export interface ExifEntry {
  /** Directory: the main image, its thumbnail, the EXIF sub-directory, GPS or interoperability. */
  ifd: ExifIfd;
  /** Numeric tag id. */
  tag: number;
  /** Standard tag name (`DateTimeOriginal`), or `ifd:0x1234` for a tag this table does not know. */
  name: string;
  /** TIFF field type, one to twelve. */
  type: number;
  /** Decoded value. Rationals read as numbers; text has trailing NULs removed. */
  value: ExifValue;
}

/** Standard tags by directory. Names follow the EXIF 3.0 and TIFF 6.0 specifications (ExifTool spellings). */
const IMAGE: Record<number, string> = {
  0x00fe: 'SubfileType', 0x0100: 'ImageWidth', 0x0101: 'ImageHeight', 0x0102: 'BitsPerSample', 0x0103: 'Compression',
  0x0106: 'PhotometricInterpretation', 0x010d: 'DocumentName', 0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0111: 'StripOffsets',
  0x0112: 'Orientation', 0x0115: 'SamplesPerPixel', 0x0116: 'RowsPerStrip', 0x0117: 'StripByteCounts', 0x011a: 'XResolution',
  0x011b: 'YResolution', 0x011c: 'PlanarConfiguration', 0x0128: 'ResolutionUnit', 0x012d: 'TransferFunction', 0x0131: 'Software',
  0x0132: 'ModifyDate', 0x013b: 'Artist', 0x013c: 'HostComputer', 0x013e: 'WhitePoint', 0x013f: 'PrimaryChromaticities',
  0x0142: 'TileWidth', 0x0143: 'TileLength', 0x0144: 'TileOffsets', 0x0145: 'TileByteCounts', 0x0152: 'ExtraSamples', 0x0153: 'SampleFormat',
  0x0201: 'ThumbnailOffset', 0x0202: 'ThumbnailLength', 0x0211: 'YCbCrCoefficients', 0x0212: 'YCbCrSubSampling',
  0x0213: 'YCbCrPositioning', 0x0214: 'ReferenceBlackWhite', 0x02bc: 'ApplicationNotes', 0x4746: 'Rating', 0x4749: 'RatingPercent',
  0x8298: 'Copyright', 0x83bb: 'IPTC-NAA', 0x8649: 'PhotoshopSettings', 0x8769: 'ExifOffset', 0x8773: 'ICC_Profile', 0x8825: 'GPSInfo',
  0x9c9b: 'XPTitle', 0x9c9c: 'XPComment', 0x9c9d: 'XPAuthor', 0x9c9e: 'XPKeywords', 0x9c9f: 'XPSubject', 0xc4a5: 'PrintIM',
  0xc612: 'DNGVersion', 0xc614: 'UniqueCameraModel',
};
const EXIF: Record<number, string> = {
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8824: 'SpectralSensitivity', 0x8827: 'ISO',
  0x8830: 'SensitivityType', 0x8831: 'StandardOutputSensitivity', 0x8832: 'RecommendedExposureIndex', 0x9000: 'ExifVersion',
  0x9003: 'DateTimeOriginal', 0x9004: 'CreateDate', 0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0x9012: 'OffsetTimeDigitized',
  0x9101: 'ComponentsConfiguration', 0x9102: 'CompressedBitsPerPixel', 0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue',
  0x9203: 'BrightnessValue', 0x9204: 'ExposureCompensation', 0x9205: 'MaxApertureValue', 0x9206: 'SubjectDistance',
  0x9207: 'MeteringMode', 0x9208: 'LightSource', 0x9209: 'Flash', 0x920a: 'FocalLength', 0x9214: 'SubjectArea', 0x927c: 'MakerNote',
  0x9286: 'UserComment', 0x9290: 'SubSecTime', 0x9291: 'SubSecTimeOriginal', 0x9292: 'SubSecTimeDigitized', 0xa000: 'FlashpixVersion',
  0xa001: 'ColorSpace', 0xa002: 'ExifImageWidth', 0xa003: 'ExifImageHeight', 0xa004: 'RelatedSoundFile', 0xa005: 'InteropOffset',
  0xa20b: 'FlashEnergy', 0xa20e: 'FocalPlaneXResolution', 0xa20f: 'FocalPlaneYResolution', 0xa210: 'FocalPlaneResolutionUnit',
  0xa214: 'SubjectLocation', 0xa215: 'ExposureIndex', 0xa217: 'SensingMethod', 0xa300: 'FileSource', 0xa301: 'SceneType',
  0xa302: 'CFAPattern', 0xa401: 'CustomRendered', 0xa402: 'ExposureMode', 0xa403: 'WhiteBalance', 0xa404: 'DigitalZoomRatio',
  0xa405: 'FocalLengthIn35mmFormat', 0xa406: 'SceneCaptureType', 0xa407: 'GainControl', 0xa408: 'Contrast', 0xa409: 'Saturation',
  0xa40a: 'Sharpness', 0xa40c: 'SubjectDistanceRange', 0xa420: 'ImageUniqueID', 0xa430: 'OwnerName', 0xa431: 'SerialNumber',
  0xa432: 'LensInfo', 0xa433: 'LensMake', 0xa434: 'LensModel', 0xa435: 'LensSerialNumber', 0xa460: 'CompositeImage', 0xa500: 'Gamma',
};
const GPS: Record<number, string> = {
  0x00: 'GPSVersionID', 0x01: 'GPSLatitudeRef', 0x02: 'GPSLatitude', 0x03: 'GPSLongitudeRef', 0x04: 'GPSLongitude', 0x05: 'GPSAltitudeRef',
  0x06: 'GPSAltitude', 0x07: 'GPSTimeStamp', 0x08: 'GPSSatellites', 0x09: 'GPSStatus', 0x0a: 'GPSMeasureMode', 0x0b: 'GPSDOP',
  0x0c: 'GPSSpeedRef', 0x0d: 'GPSSpeed', 0x0e: 'GPSTrackRef', 0x0f: 'GPSTrack', 0x10: 'GPSImgDirectionRef', 0x11: 'GPSImgDirection',
  0x12: 'GPSMapDatum', 0x13: 'GPSDestLatitudeRef', 0x14: 'GPSDestLatitude', 0x15: 'GPSDestLongitudeRef', 0x16: 'GPSDestLongitude',
  0x17: 'GPSDestBearingRef', 0x18: 'GPSDestBearing', 0x19: 'GPSDestDistanceRef', 0x1a: 'GPSDestDistance', 0x1b: 'GPSProcessingMethod',
  0x1c: 'GPSAreaInformation', 0x1d: 'GPSDateStamp', 0x1e: 'GPSDifferential', 0x1f: 'GPSHPositioningError',
};
const INTEROP: Record<number, string> = { 0x01: 'InteropIndex', 0x02: 'InteropVersion', 0x1000: 'RelatedImageFileFormat', 0x1001: 'RelatedImageWidth', 0x1002: 'RelatedImageHeight' };
const TABLES: Record<ExifIfd, Record<number, string>> = { ifd0: IMAGE, ifd1: IMAGE, exif: EXIF, gps: GPS, interop: INTEROP };
/** Pointers and offsets describe the file's structure. They are never listed, edited or removed. */
const STRUCTURE = new Set([0x8769, 0x8825, 0xa005, 0x0201, 0x0202, 0x0111, 0x0117, 0x0144, 0x0145]);
/** Text tags stored as `UNDEFINED` with an eight-byte character code. */
const CODED_TEXT = new Set([0x9286, 0x1b, 0x1c]);
/** Version tags: four ASCII digits stored as `UNDEFINED`. */
const VERSIONS = new Set([0x9000, 0xa000]);

/** Name a tag as the reader does: its standard name, `ifd1:Name` for the thumbnail, or `ifd:0x1234`. */
export function exifTagName(ifd: ExifIfd, tag: number): string {
  const name = TABLES[ifd][tag];
  if (!name) return `${ifd}:0x${tag.toString(16).padStart(4, '0')}`;
  return ifd === 'ifd1' ? `ifd1:${name}` : name;
}
/** Resolve a tag name back to its directory and id; only standard main-image, EXIF and GPS tags resolve. */
export function exifTagByName(name: string): { ifd: ExifIfd; tag: number } | undefined {
  for (const ifd of ['ifd0', 'exif', 'gps', 'interop'] as const) {
    for (const [tag, known] of Object.entries(TABLES[ifd])) if (known === name) return { ifd, tag: Number(tag) };
  }
  const raw = /^(ifd0|ifd1|exif|gps|interop):0x([0-9a-f]{4})$/.exec(name);
  return raw ? { ifd: raw[1] as ExifIfd, tag: parseInt(raw[2]!, 16) } : undefined;
}
/** Text tags a person can write: plain ASCII fields and the coded user comment, in the main image or EXIF directory. */
export function isWritableExifTag(name: string): boolean {
  const found = exifTagByName(name);
  if (!found || (found.ifd !== 'ifd0' && found.ifd !== 'exif')) return false;
  return WRITABLE.has(found.tag);
}
const WRITABLE = new Set([0x010d, 0x010e, 0x010f, 0x0110, 0x0131, 0x0132, 0x013b, 0x013c, 0x8298, 0x9003, 0x9004, 0x9010, 0x9011, 0x9012, 0x9286, 0xa420, 0xa430, 0xa431, 0xa433, 0xa434, 0xa435]);

const decoder = new TextDecoder('utf-8', { fatal: true });
/** ASCII fields often carry UTF-8 in practice; fall back to Latin-1 for older writers. */
function text(bytes: Uint8Array): string {
  const end = bytes.indexOf(0), body = end < 0 ? bytes : bytes.subarray(0, end);
  try { return decoder.decode(body).trim(); } catch { return ascii(body).trim(); }
}
function codedText(bytes: Uint8Array, le: boolean): string {
  if (bytes.length < 8) return '';
  const code = ascii(bytes.subarray(0, 8)), body = bytes.subarray(8);
  if (code.startsWith('UNICODE')) {
    // EXIF says UCS-2 in the file's byte order; some writers use big-endian regardless, and mark it with a BOM.
    const bom = body[0] === 0xfe && body[1] === 0xff ? 'utf-16be' : body[0] === 0xff && body[1] === 0xfe ? 'utf-16le' : le ? 'utf-16le' : 'utf-16be';
    return new TextDecoder(bom).decode(body.subarray(body.length % 2)).replace(/\0+$/, '').replace(/^﻿/, '').trim();
  }
  if (code.startsWith('ASCII') || code === '\0\0\0\0\0\0\0\0') return text(body);
  return '';
}

/** Decode every entry of a bounded TIFF payload, in file order. Structural pointers are skipped. */
export function readExifEntries(bytes: Uint8Array, limit = MAX_METADATA_BYTES): ExifEntry[] {
  const { entries, le } = walk(bytes, limit), out: ExifEntry[] = [];
  for (const e of entries) {
    if (STRUCTURE.has(e.tag) && (e.ifd === 'ifd0' || e.ifd === 'ifd1' || e.ifd === 'exif')) continue;
    out.push({ ifd: e.ifd, tag: e.tag, name: exifTagName(e.ifd, e.tag), type: e.type, value: decodeEntry(bytes, e, le) });
  }
  return out;
}
function decodeEntry(bytes: Uint8Array, e: Entry, le: boolean): ExifValue {
  const raw = bytes.subarray(e.data, e.data + e.size);
  if (e.type === 2) return text(raw.subarray(0, Math.min(raw.length, 65535)));
  if (e.ifd !== 'gps' && e.tag >= 0x9c9b && e.tag <= 0x9c9f && e.type === 1) return new TextDecoder('utf-16le').decode(raw.subarray(0, raw.length - (raw.length % 2))).replace(/\0+$/, '');
  if (e.type === 7) {
    if (CODED_TEXT.has(e.tag) && (e.ifd === 'exif' ? e.tag === 0x9286 : e.ifd === 'gps')) return codedText(raw, le);
    if (VERSIONS.has(e.tag) || (e.ifd === 'interop' && e.tag === 2)) return ascii(raw.subarray(0, 4)).replace(/\0/g, '');
    if (e.size === 1) return raw[0]!;
    return { binary: e.size };
  }
  // Long arrays (strip tables, curves) are summarised rather than decoded.
  if (e.count > 64) return { binary: e.size };
  const values: number[] = [];
  for (let i = 0; i < e.count; i++) values.push(number(bytes, e, i, le));
  return values.length === 1 ? values[0]! : values;
}
function number(bytes: Uint8Array, e: Entry, i: number, le: boolean): number {
  switch (e.type) {
    case 1: return bytes[e.data + i]!;
    case 6: return view(bytes, e.data + i, 1).getInt8(0);
    case 3: return u16(bytes, e.data + i * 2, le);
    case 8: return view(bytes, e.data + i * 2, 2).getInt16(0, le);
    case 4: return u32(bytes, e.data + i * 4, le);
    case 9: return view(bytes, e.data + i * 4, 4).getInt32(0, le);
    case 11: return view(bytes, e.data + i * 4, 4).getFloat32(0, le);
    case 12: return view(bytes, e.data + i * 8, 8).getFloat64(0, le);
    default: {
      const v = view(bytes, e.data + i * 8, 8), signed = e.type === 10;
      const a = signed ? v.getInt32(0, le) : v.getUint32(0, le), b = signed ? v.getInt32(4, le) : v.getUint32(4, le);
      // A zero denominator is legal for "unknown" (0/0); it reads as zero rather than failing the whole payload.
      return b === 0 ? 0 : a / b;
    }
  }
}

/** Changes to a TIFF payload. Names are those `readExifEntries` reports. */
export interface ExifEdit {
  /** Text values for writable tags (see `isWritableExifTag`). */
  set?: Readonly<Record<string, string>>;
  /** Tags to remove. Their value bytes are zeroed, not just unlinked. */
  remove?: readonly string[];
  /** Remove the GPS directory and every GPS value. */
  removeGps?: boolean;
}
interface Raw { tag: number; bytes: Uint8Array }
/** A minimal little-endian TIFF with an empty main directory, for a picture that had no EXIF. */
export function emptyExif(): Uint8Array {
  const out = new Uint8Array(14), v = new DataView(out.buffer);
  out.set(utf8('II')); v.setUint16(2, 42, true); v.setUint32(4, 8, true);
  return out;
}
/**
 * Edit a TIFF payload without moving anything that might be referenced by offset (maker notes,
 * thumbnails, unknown tags). Changed directories and new values are appended; the old directory
 * bytes and removed values are zeroed so a removed field cannot be recovered from the export.
 */
export function editExifEntries(source: Uint8Array | null, edit: ExifEdit): Uint8Array {
  const bytes = source ?? emptyExif();
  const { entries, directories, le } = walk(bytes);
  const tail: Uint8Array[] = [];
  let length = bytes.length + (bytes.length % 2);
  const append = (data: Uint8Array) => { const at = length; tail.push(data); length += data.length; if (data.length % 2) { tail.push(new Uint8Array(1)); length++; } return at; };
  const zero: { offset: number; size: number }[] = [];
  const lists = new Map<ExifIfd, Raw[]>();
  const dirOf = (ifd: ExifIfd) => directories.find(d => d.ifd === ifd);
  for (const ifd of ['ifd0', 'exif', 'gps', 'interop'] as const) {
    const d = dirOf(ifd);
    if (d) lists.set(ifd, entries.filter(e => e.at >= d.offset + 2 && e.at < d.offset + d.size - 4).map(e => ({ tag: e.tag, bytes: bytes.slice(e.at, e.at + 12) })));
  }
  const changed = new Set<ExifIfd>();
  const dropValue = (e: Entry) => { if (e.size > 4) zero.push({ offset: e.data, size: e.size }); };
  const remove = (ifd: ExifIfd, tag: number) => {
    const list = lists.get(ifd); if (!list) return;
    const at = list.findIndex(r => r.tag === tag); if (at < 0) return;
    list.splice(at, 1); changed.add(ifd);
    const entry = entries.find(e => e.ifd === ifd && e.tag === tag); if (entry) dropValue(entry);
  };
  if (edit.removeGps && lists.has('gps')) {
    for (const e of entries.filter(e => e.ifd === 'gps')) dropValue(e);
    const d = dirOf('gps')!; zero.push({ offset: d.offset, size: d.size });
    lists.delete('gps'); remove('ifd0', 0x8825);
  }
  for (const name of edit.remove ?? []) {
    const found = exifTagByName(name);
    if (!found || STRUCTURE.has(found.tag) || found.ifd === 'ifd1') continue;
    remove(found.ifd, found.tag);
  }
  for (const [name, value] of Object.entries(edit.set ?? {})) {
    ensure(isWritableExifTag(name), `EXIF ${name} cannot be written`);
    const { ifd, tag } = exifTagByName(name)!;
    const coded = tag === 0x9286;
    const data = coded ? encodeComment(value, le) : new Uint8Array([...utf8(value), 0]);
    const entry = new Uint8Array(12), v = new DataView(entry.buffer);
    v.setUint16(0, tag, le); v.setUint16(2, coded ? 7 : 2, le); v.setUint32(4, data.length, le);
    if (data.length <= 4) entry.set(data, 8); else v.setUint32(8, append(data), le);
    remove(ifd, tag);
    if (!lists.has(ifd)) lists.set(ifd, []);
    lists.get(ifd)!.push({ tag, bytes: entry }); changed.add(ifd);
  }
  if (!changed.size) return bytes;
  // A changed child moves, so its parent's pointer changes too.
  const pointer = (parent: ExifIfd, tag: number, child: ExifIfd) => {
    if (!changed.has(child)) return;
    const list = lists.get(child)!;
    if (!list.length && child !== 'ifd0') { lists.delete(child); remove(parent, tag); const d = dirOf(child); if (d) zero.push({ offset: d.offset, size: d.size }); return; }
    const at = writeDirectory(child, child === 'ifd0' ? next : 0);
    const entry = new Uint8Array(12), v = new DataView(entry.buffer);
    v.setUint16(0, tag, le); v.setUint16(2, 4, le); v.setUint32(4, 1, le); v.setUint32(8, at, le);
    const parentList = lists.get(parent) ?? (lists.set(parent, []), lists.get(parent)!);
    const old = parentList.findIndex(r => r.tag === tag); if (old >= 0) parentList.splice(old, 1);
    parentList.push({ tag, bytes: entry }); changed.add(parent);
  };
  const root = dirOf('ifd0'), next = root ? u32(bytes, root.offset + root.size - 4, le) : 0;
  const writeDirectory = (ifd: ExifIfd, successor: number) => {
    const list = lists.get(ifd)!.sort((a, b) => a.tag - b.tag);
    ensure(list.length <= 4096, 'Too many EXIF entries');
    const dir = new Uint8Array(2 + list.length * 12 + 4), v = new DataView(dir.buffer);
    v.setUint16(0, list.length, le); list.forEach((r, i) => dir.set(r.bytes, 2 + i * 12)); v.setUint32(2 + list.length * 12, successor, le);
    const old = dirOf(ifd); if (old) zero.push({ offset: old.offset, size: old.size });
    return append(dir);
  };
  pointer('exif', 0xa005, 'interop');
  pointer('ifd0', 0x8769, 'exif');
  pointer('ifd0', 0x8825, 'gps');
  if (!lists.has('ifd0')) lists.set('ifd0', []);
  const rootAt = changed.has('ifd0') ? writeDirectory('ifd0', next) : root!.offset;
  const result = new Uint8Array(length);
  bounded(result, MAX_METADATA_BYTES);
  result.set(bytes);
  // Zero only what nothing kept still reads: values shared with a kept entry in a hostile file, the
  // thumbnail directory and its image are left alone.
  const kept: { offset: number; size: number }[] = [];
  for (const list of lists.values()) for (const r of list) {
    const v = new DataView(r.bytes.buffer, r.bytes.byteOffset, 12), size = v.getUint32(4, le) * (TYPE_SIZES[v.getUint16(2, le)] ?? 1);
    if (size > 4) kept.push({ offset: v.getUint32(8, le), size });
  }
  for (const d of directories.filter(d => d.ifd === 'ifd1')) kept.push(d);
  for (const e of entries.filter(e => e.ifd === 'ifd1')) {
    if (e.size > 4) kept.push({ offset: e.data, size: e.size });
    if (e.tag === 0x0201) { const length = entries.find(t => t.ifd === 'ifd1' && t.tag === 0x0202); if (length) kept.push({ offset: u32(bytes, e.data, le), size: u32(bytes, length.data, le) }); }
  }
  const overlaps = (a: { offset: number; size: number }) => kept.some(b => a.offset < b.offset + b.size && b.offset < a.offset + a.size);
  for (const r of zero) if (!overlaps(r)) result.fill(0, r.offset, r.offset + r.size);
  let at = bytes.length + (bytes.length % 2);
  for (const part of tail) { result.set(part, at); at += part.length; }
  new DataView(result.buffer).setUint32(4, rootAt, le);
  return result;
}
const TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
/** A user comment is ASCII when it can be, otherwise UCS-2 in the file's byte order. */
function encodeComment(value: string, le: boolean): Uint8Array {
  if (/^[\x20-\x7e\n\r\t]*$/.test(value)) return new Uint8Array([...utf8('ASCII\0\0\0'), ...utf8(value)]);
  const out = new Uint8Array(8 + value.length * 2), v = new DataView(out.buffer);
  out.set(utf8('UNICODE\0'));
  for (let i = 0; i < value.length; i++) v.setUint16(8 + i * 2, value.charCodeAt(i), le);
  return out;
}
