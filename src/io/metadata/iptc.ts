import { ascii, concat, ensure, FileDataError, range, u16, u32, utf8 } from '../formats/bytes.js';
import type { MetadataPacket } from './index.js';

/** IPTC IIM application record (2) datasets, with ExifTool's names. */
const NAMES: Readonly<Record<number, string>> = {
  0: 'ApplicationRecordVersion', 3: 'ObjectTypeReference', 4: 'ObjectAttributeReference', 5: 'ObjectName', 7: 'EditStatus',
  10: 'Urgency', 12: 'SubjectReference', 15: 'Category', 20: 'SupplementalCategories', 22: 'FixtureIdentifier', 25: 'Keywords',
  26: 'ContentLocationCode', 27: 'ContentLocationName', 30: 'ReleaseDate', 35: 'ReleaseTime', 37: 'ExpirationDate', 38: 'ExpirationTime',
  40: 'SpecialInstructions', 42: 'ActionAdvised', 45: 'ReferenceService', 47: 'ReferenceDate', 50: 'ReferenceNumber', 55: 'DateCreated',
  60: 'TimeCreated', 62: 'DigitalCreationDate', 63: 'DigitalCreationTime', 65: 'OriginatingProgram', 70: 'ProgramVersion',
  75: 'ObjectCycle', 80: 'By-line', 85: 'By-lineTitle', 90: 'City', 92: 'Sub-location', 95: 'Province-State',
  100: 'Country-PrimaryLocationCode', 101: 'Country-PrimaryLocationName', 103: 'OriginalTransmissionReference', 105: 'Headline',
  110: 'Credit', 115: 'Source', 116: 'CopyrightNotice', 118: 'Contact', 120: 'Caption-Abstract', 121: 'LocalCaption',
  122: 'Writer-Editor', 130: 'ImageType', 131: 'ImageOrientation', 135: 'LanguageIdentifier',
};
/** Datasets that may repeat; they read and write as lists. */
const REPEATABLE = new Set([4, 12, 20, 25, 80, 85, 118, 122]);
/** Text datasets a person can write. Binary, numeric-coded and reference datasets stay read-only. */
const WRITABLE = new Set([5, 15, 20, 25, 40, 55, 60, 65, 70, 80, 85, 90, 92, 95, 100, 101, 103, 105, 110, 115, 116, 118, 120, 122]);
const UTF8_MARK = new Uint8Array([0x1b, 0x25, 0x47]);
/** Datasets holding numbers or binary data rather than text, so a change of character set leaves them alone. */
const BINARY = new Set(['1:0', '1:20', '1:22', '1:90', '1:120', '1:122', '2:0', '2:125', '2:200', '2:201', '2:202']);
const isUtf8Mark = (data: Uint8Array) => UTF8_MARK.every((b, i) => data[i] === b);
/** Text in an undeclared or legacy character set: UTF-8 where the bytes are valid UTF-8, otherwise Latin-1, as other readers assume. */
const legacyText = (bytes: Uint8Array) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return ascii(bytes); } };

/** One IIM dataset from the application record. */
export interface IptcDataset {
  /** Dataset number in record 2. */
  dataset: number;
  /** ExifTool's name (`By-line`), or `2:123` for an unknown dataset. */
  name: string;
  /** Text value; repeatable datasets appear once per value. */
  value: string;
}
/** Dataset name to number. */
export const iptcDataset = (name: string) => { const hit = Object.entries(NAMES).find(([, n]) => n === name); return hit ? Number(hit[0]) : undefined; };
/** Whether a dataset name can be written. */
export const isWritableIptc = (name: string) => { const n = iptcDataset(name); return n !== undefined && WRITABLE.has(n); };
/** Whether a dataset holds a list. */
export const isRepeatableIptc = (name: string) => { const n = iptcDataset(name); return n !== undefined && REPEATABLE.has(n); };

interface Located { /** Bytes before the IIM block. */ before: Uint8Array; iim: Uint8Array; /** Bytes after it. */ after: Uint8Array; rebuild: (iim: Uint8Array) => Uint8Array }

/** Photoshop image resources (`8BIM` blocks); the IPTC block is resource 0x0404. */
function resources(data: Uint8Array, start: number): Located | null {
  let p = start;
  while (p < data.length) {
    range(data, p, 7); ensure(ascii(data.subarray(p, p + 4)) === '8BIM', 'Invalid Photoshop resource');
    const blockStart = p, id = u16(data, p + 4), nameBytes = data[p + 6]! + 1; p += 6 + nameBytes + (nameBytes % 2);
    const size = u32(data, p); p += 4; range(data, p, size + (size % 2));
    if (id === 0x0404) {
      const header = data.slice(blockStart, p - 4), before = data.slice(0, blockStart), after = data.slice(p + size + (size % 2));
      return { before, iim: data.slice(p, p + size), after, rebuild: iim => {
        const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, iim.length);
        return concat([before, header, length, iim, iim.length % 2 ? new Uint8Array(1) : new Uint8Array(), after]);
      } };
    }
    p += size + (size % 2);
  }
  return null;
}
/** ImageMagick's hex text profile: a newline, the profile name, the byte count and hex lines. */
function hexProfile(text: string): Uint8Array {
  const match = /^\s*\n?\s*[\w-]+\s*\n\s*(\d+)\s*\n([\s\S]*)$/.exec(text); ensure(match, 'Invalid PNG raw profile');
  const length = Number(match[1]), hex = match[2]!.replace(/\s+/g, ''); ensure(Number.isSafeInteger(length) && hex.length >= length * 2 && length <= 16 * 1024 * 1024, 'Invalid PNG raw profile');
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) { const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16); ensure(!Number.isNaN(byte), 'Invalid PNG raw profile'); out[i] = byte; }
  return out;
}
function writeHexProfile(name: string, bytes: Uint8Array): string {
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `\n${name}\n${String(bytes.length).padStart(8, ' ')}\n${hex.replace(/(.{72})/g, '$1\n')}\n`;
}
function locate(packet: MetadataPacket): Located | null {
  const data = packet.data;
  if (ascii(data.subarray(0, 14)) === 'Photoshop 3.0\0') return resources(data, 14);
  // PNG text chunk: keyword, then tEXt text or uncompressed iTXt text.
  const zero = data.indexOf(0); ensure(zero > 0, 'Invalid PNG text chunk');
  const keyword = ascii(data.subarray(0, zero));
  let textStart = zero + 1;
  const type = packet.containerType ?? 'tEXt';
  if (type === 'zTXt') throw new FileDataError('unsupported', 'Compressed IPTC text is unsupported');
  if (type === 'iTXt') {
    ensure(data[textStart] === 0, 'Compressed IPTC text is unsupported'); textStart += 2;
    for (let i = 0; i < 2; i++) { const end = data.indexOf(0, textStart); ensure(end >= textStart, 'Invalid PNG text chunk'); textStart = end + 1; }
  }
  const head = data.slice(0, textStart), text = type === 'iTXt' ? new TextDecoder().decode(data.subarray(textStart)) : ascii(data.subarray(textStart));
  const profileName = /^\s*\n?\s*([\w-]+)/.exec(text)?.[1] ?? keyword.replace(/^Raw profile type /i, '');
  const bytes = hexProfile(text);
  const pack = (inner: Uint8Array) => concat([head, utf8(writeHexProfile(profileName, inner))]);
  if (ascii(bytes.subarray(0, 4)) === '8BIM') {
    const inner = resources(bytes, 0); if (!inner) return null;
    return { ...inner, rebuild: iim => pack(inner.rebuild(iim)) };
  }
  return { before: new Uint8Array(), iim: bytes, after: new Uint8Array(), rebuild: pack };
}
interface Record_ { record: number; dataset: number; data: Uint8Array }
/** A dataset's tag. Values of 32 KB or more, such as preview data, use the extended four-byte length. */
function header(r: Record_): Uint8Array {
  const n = r.data.length;
  if (n < 0x8000) return new Uint8Array([0x1c, r.record, r.dataset, n >> 8, n & 255]);
  ensure(n <= 0xffffffff, 'IPTC value too long');
  return new Uint8Array([0x1c, r.record, r.dataset, 0x80, 4, n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}
function records(iim: Uint8Array): Record_[] {
  const out: Record_[] = []; let p = 0;
  while (p < iim.length) {
    if (iim[p] !== 0x1c) { ensure(iim.subarray(p).every(b => b === 0), 'Invalid IPTC record'); break; }
    range(iim, p, 5); const record = iim[p + 1]!, dataset = iim[p + 2]!; let size = u16(iim, p + 3); p += 5;
    if (size & 0x8000) { const n = size & 0x7fff; ensure(n <= 4, 'Unsupported IPTC length'); range(iim, p, n); size = 0; for (let i = 0; i < n; i++) size = size * 256 + iim[p + i]!; p += n; }
    range(iim, p, size); out.push({ record, dataset, data: iim.slice(p, p + size) }); p += size;
    ensure(out.length <= 8192, 'Too many IPTC records');
  }
  return out;
}

/** Application-record datasets, or null when the block is compressed or absent. */
export function readIptc(packet: MetadataPacket): IptcDataset[] | null {
  let located: Located | null;
  try { located = locate(packet); } catch (error) { if (error instanceof FileDataError && error.code === 'unsupported') return null; throw error; }
  if (!located) return null;
  const all = records(located.iim);
  const utf = all.some(r => r.record === 1 && r.dataset === 90 && isUtf8Mark(r.data));
  const decode = (bytes: Uint8Array) => utf ? new TextDecoder().decode(bytes) : legacyText(bytes);
  return all.filter(r => r.record === 2 && r.dataset !== 0).map(r => ({ dataset: r.dataset, name: NAMES[r.dataset] ?? `2:${r.dataset}`, value: decode(r.data).replace(/\0+$/, '').trim() }));
}
/** Changes to IPTC datasets by name. */
export interface IptcEdit { set?: Readonly<Record<string, string | readonly string[]>>; remove?: readonly string[] }
/**
 * Rewrite the application record, keeping the envelope record, other resources and unknown datasets.
 * Text is written as UTF-8. When a new value needs UTF-8 and the block does not yet declare it, every kept
 * text dataset is converted from its old character set first, so declaring UTF-8 changes no existing value.
 */
export function editIptc(packet: MetadataPacket, edit: IptcEdit): MetadataPacket {
  const located = locate(packet); ensure(located, 'No IPTC block');
  const all = records(located.iim);
  const drop = new Set<number>();
  for (const name of edit.remove ?? []) { const n = iptcDataset(name) ?? (/^2:(\d+)$/.exec(name) ? Number(/^2:(\d+)$/.exec(name)![1]) : undefined); if (n !== undefined) drop.add(n); }
  const added: Record_[] = [];
  for (const [name, raw] of Object.entries(edit.set ?? {})) {
    const n = iptcDataset(name); ensure(n !== undefined && WRITABLE.has(n), `IPTC ${name} cannot be written`);
    drop.add(n);
    const values = (typeof raw === 'string' ? [raw] : [...raw]).map(v => v.trim()).filter(Boolean);
    for (const value of REPEATABLE.has(n) ? values : values.slice(0, 1)) added.push({ record: 2, dataset: n, data: utf8(value) });
  }
  let kept = all.filter(r => !(r.record === 2 && drop.has(r.dataset)));
  // Declare UTF-8 once, in the envelope, whenever anything written is not plain ASCII. A legacy declaration
  // (such as Latin-1) is replaced, and the text it governed is converted to match.
  const declared = kept.some(r => r.record === 1 && r.dataset === 90 && isUtf8Mark(r.data));
  if (added.some(r => r.data.some(b => b > 0x7f)) && !declared) {
    kept = kept.filter(r => !(r.record === 1 && r.dataset === 90)).map(r => r.record <= 2 && !BINARY.has(`${r.record}:${r.dataset}`) && r.data.some(b => b > 0x7f) ? { ...r, data: utf8(legacyText(r.data)) } : r);
    kept = [{ record: 1, dataset: 90, data: UTF8_MARK }, ...kept];
  }
  const ordered = [...kept.filter(r => r.record < 2), ...[...kept.filter(r => r.record === 2), ...added].sort((a, b) => a.dataset - b.dataset), ...kept.filter(r => r.record > 2)];
  const iim = concat(ordered.map(r => concat([header(r), r.data])));
  return { ...packet, data: located.rebuild(iim) };
}
