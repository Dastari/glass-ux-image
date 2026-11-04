import { readExif } from './tiff.js';
import { editExifEntries, isWritableExifTag, readExifEntries, type ExifValue } from './exif-tags.js';
import { editXmpProperties, emptyXmp, isExtendedXmp, isWritableXmpProperty, readXmpProperties } from './xmp-fields.js';
import { editIptc, isRepeatableIptc, isWritableIptc, readIptc } from './iptc.js';
import { editXmp } from './xmp.js';
import type { ImageMetadata, MetadataPacket } from './index.js';
import type { RasterFormat } from '../formats/container.js';

/**
 * Metadata changes kept in a recipe, relative to the source. Keys name one field in one family:
 * `exif:Artist`, `xmp:dc:title`, `iptc:Keywords`. Plain JSON, so recipes and project files keep it.
 */
export interface MetadataEdits {
  /** New values. Lists are for repeatable fields such as keywords. */
  set?: Readonly<Record<string, string | readonly string[]>>;
  /** Fields removed from the source. */
  remove?: readonly string[];
  /** Remove GPS from EXIF and the standard XMP GPS properties. */
  removeGps?: boolean;
  /** Start from no metadata at all. `set` then writes into fresh packets. */
  removeAll?: boolean;
}
/** One change, as a session action receives it. */
export type MetadataChange =
  | { set: Readonly<Record<string, string | readonly string[]>> }
  | { remove: readonly string[] }
  | { removeGps: true }
  | { removeAll: true };

/** A readable field: what the source holds after any edits. */
export interface MetadataEntry {
  /** Recipe key, `family:name`. */
  key: string;
  /** Metadata family. */
  family: 'exif' | 'xmp' | 'iptc';
  /** Field name within the family (`DateTimeOriginal`, `dc:creator`, `By-line`). */
  name: string;
  /** EXIF values keep their type; XMP and IPTC values are text, one item per list entry. */
  value: ExifValue | readonly string[];
  /** The value can be replaced with text. */
  writable: boolean;
  /** The field can be removed. */
  removable: boolean;
}

const familyOf = (key: string) => key.slice(0, key.indexOf(':')) as MetadataEntry['family'];
const nameOf = (key: string) => key.slice(key.indexOf(':') + 1);

/** Whether a key can hold a new value. IPTC fields are written only where the source already has IPTC. */
export function isWritableMetadataKey(key: string): boolean {
  const family = familyOf(key), name = nameOf(key);
  return family === 'exif' ? isWritableExifTag(name) : family === 'xmp' ? isWritableXmpProperty(name) : family === 'iptc' ? isWritableIptc(name) : false;
}
/** Whether a field holds a list of values. */
export const isListMetadataKey = (key: string) => familyOf(key) === 'iptc' ? isRepeatableIptc(nameOf(key)) : ['xmp:dc:subject', 'xmp:dc:creator', 'xmp:photoshop:SupplementalCategories', 'xmp:lr:hierarchicalSubject'].includes(key);

/** Fields read from a picture's metadata, and the families whose packets could not be read. */
export interface MetadataEntries {
  entries: MetadataEntry[];
  /** Families with a packet that is malformed; their fields are missing from `entries`. */
  unreadable: MetadataEntry['family'][];
}
/**
 * Every EXIF, XMP and IPTC field, in family order. Thumbnail directories and file structure are left out.
 * A malformed packet never throws: its family is listed in `unreadable` and the other packets still read.
 */
export function readMetadataEntries(metadata: ImageMetadata | null | undefined): MetadataEntries {
  const out: MetadataEntry[] = [], unreadable = new Set<MetadataEntry['family']>();
  for (const packet of metadata?.packets ?? []) {
    let read: MetadataEntry[];
    try { read = readPacket(packet); } catch { unreadable.add(packet.kind); continue; }
    for (const entry of read) {
      const existing = entry.family === 'iptc' ? out.find(o => o.key === entry.key) : undefined;
      if (existing) existing.value = [...existing.value as string[], ...entry.value as string[]];
      else if (entry.family === 'xmp' && out.some(o => o.key === entry.key)) continue;
      else out.push(entry);
    }
  }
  return { entries: out, unreadable: [...unreadable] };
}
/** One packet's fields, read in full before any is kept, so a packet that fails part-way adds nothing. */
function readPacket(packet: MetadataPacket): MetadataEntry[] {
  const out: MetadataEntry[] = [];
  if (packet.kind === 'exif') {
    for (const e of readExifEntries(packet.data)) {
      if (e.ifd === 'ifd1') continue;
      out.push({ key: `exif:${e.name}`, family: 'exif', name: e.name, value: e.value, writable: isWritableExifTag(e.name), removable: e.name !== 'Orientation' });
    }
  } else if (packet.kind === 'xmp') {
    for (const p of readXmpProperties(packet.data)) {
      if (out.some(o => o.key === `xmp:${p.name}`)) continue;
      out.push({ key: `xmp:${p.name}`, family: 'xmp', name: p.name, value: p.values, writable: p.form !== 'struct' && isWritableXmpProperty(p.name), removable: !p.name.endsWith(':Orientation') });
    }
  } else {
    for (const d of readIptc(packet) ?? []) {
      const existing = out.find(o => o.key === `iptc:${d.name}`);
      if (existing) { existing.value = [...existing.value as string[], d.value]; continue; }
      out.push({ key: `iptc:${d.name}`, family: 'iptc', name: d.name, value: [d.value], writable: isWritableIptc(d.name), removable: true });
    }
  }
  return out;
}
/** Every readable EXIF, XMP and IPTC field, in family order; see `readMetadataEntries`. */
export const listMetadata = (metadata: ImageMetadata | null | undefined): MetadataEntry[] => readMetadataEntries(metadata).entries;

/** Whether a set of edits changes nothing. */
export const metadataEditsEmpty = (edits: MetadataEdits | undefined) => !edits || (!edits.removeAll && !edits.removeGps && !Object.keys(edits.set ?? {}).length && !(edits.remove ?? []).length);

/** Fold one change into the recipe's edits. Removing everything clears earlier changes, since nothing remains for them to change. */
export function mergeMetadataEdits(base: MetadataEdits | undefined, change: MetadataChange): MetadataEdits {
  const set = { ...base?.set }, remove = new Set(base?.remove ?? []);
  let removeGps = base?.removeGps ?? false, removeAll = base?.removeAll ?? false;
  if ('removeAll' in change) return { removeAll: true };
  if ('removeGps' in change) removeGps = true;
  if ('set' in change) for (const [key, value] of Object.entries(change.set)) {
    const empty = typeof value === 'string' ? !value.trim() : !value.some(v => v.trim());
    if (empty) { delete set[key]; remove.add(key); } else { set[key] = typeof value === 'string' ? value.trim() : value.map(v => v.trim()).filter(Boolean); remove.delete(key); }
  }
  if ('remove' in change) for (const key of change.remove) { delete set[key]; remove.add(key); }
  return { ...(Object.keys(set).length ? { set } : {}), ...(remove.size ? { remove: [...remove] } : {}), ...(removeGps ? { removeGps } : {}), ...(removeAll ? { removeAll } : {}) };
}

const isExtended = (packet: MetadataPacket) => packet.kind === 'xmp' && isExtendedXmp(packet.data);
/**
 * Apply recipe edits to source metadata, returning new packets. The source is not changed. A field
 * set where its family has no packet starts one, except IPTC, which is only edited where it exists.
 */
export function applyMetadataEdits(metadata: ImageMetadata | undefined, edits: MetadataEdits | undefined, format: RasterFormat = 'jpeg'): ImageMetadata | undefined {
  if (metadataEditsEmpty(edits)) return metadata;
  const e = edits!;
  let packets: MetadataPacket[] = e.removeAll ? [] : [...(metadata?.packets ?? [])];
  const byFamily = (family: MetadataEntry['family']) => ({
    // A recipe from a project file may name fields this version cannot write; they are skipped, not fatal to an export.
    set: Object.fromEntries(Object.entries(e.set ?? {}).filter(([key]) => familyOf(key) === family && isWritableMetadataKey(key)).map(([key, value]) => [nameOf(key), value])),
    remove: (e.remove ?? []).filter(key => familyOf(key) === family).map(nameOf),
  });
  const exif = byFamily('exif'), exifIndex = packets.findIndex(p => p.kind === 'exif');
  if ((exifIndex >= 0 && (exif.remove.length || e.removeGps)) || Object.keys(exif.set).length) {
    const set = Object.fromEntries(Object.entries(exif.set).map(([key, value]) => [key, typeof value === 'string' ? value : value.join('; ')]));
    const data = editExifEntries(exifIndex >= 0 ? packets[exifIndex]!.data : null, { set, remove: exif.remove, removeGps: e.removeGps });
    if (exifIndex >= 0) packets[exifIndex] = { ...packets[exifIndex]!, data }; else packets = [{ kind: 'exif', data }, ...packets];
  }
  const xmp = byFamily('xmp'), xmpIndex = packets.findIndex(p => p.kind === 'xmp' && !isExtended(p));
  if ((xmpIndex >= 0 && (xmp.remove.length || e.removeGps)) || Object.keys(xmp.set).length) {
    let data = editXmpProperties(xmpIndex >= 0 ? packets[xmpIndex]!.data : emptyXmp(), xmp);
    if (e.removeGps) data = editXmp(data, { stripGps: true });
    if (xmpIndex >= 0) packets[xmpIndex] = { ...packets[xmpIndex]!, data }; else packets = [...packets, { kind: 'xmp', data }];
  }
  const iptc = byFamily('iptc');
  if (Object.keys(iptc.set).length || iptc.remove.length) packets = packets.map(p => p.kind === 'iptc' && readIptc(p) ? editIptc(p, iptc) : p);
  const exifPacket = packets.find(p => p.kind === 'exif');
  return {
    format: metadata?.format ?? format, packets,
    // An EXIF packet the edits left alone keeps the fields already read, so a family edit never rereads it.
    fields: !exifPacket ? {} : metadata && metadata.packets.includes(exifPacket) ? metadata.fields : readExif(exifPacket.data),
    presence: { exif: packets.some(p => p.kind === 'exif'), xmp: packets.some(p => p.kind === 'xmp'), iptc: packets.some(p => p.kind === 'iptc') },
  };
}
