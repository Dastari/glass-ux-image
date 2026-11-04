import { numberFormat } from 'glass-ux/locale';
import { formatBytes } from 'glass-ux/byte-size-field';
import type { ImageMetadata } from '../io/metadata/index.js';
import type { MetadataEntry } from '../io/metadata/edits.js';
import type { ExifValue } from '../io/metadata/exif-tags.js';
import type { ImageFileInfo } from '../io/metadata/file-info.js';
import type { IccProfile } from '../io/metadata/icc.js';
import type { ImportInfo } from '../io/formats/decoder.js';
import type { InfoMessages } from '../messages/info.js';

/** How a row's value is edited. */
export type InfoEditKind = 'text' | 'multiline' | 'list' | 'datetime';
/** One label and value. Editable rows say which recipe keys a change writes. */
export interface InfoRow {
  id: string;
  label: string;
  /** Display text; empty when the field is not set. */
  value: string;
  /** Edit affordance: the current value and the keys a new value is written to. */
  edit?: { kind: InfoEditKind; value: string | readonly string[]; keys: readonly string[] };
  /** Keys removed together when the field is removed. */
  remove?: readonly string[];
  /** Text a copy button puts on the clipboard. */
  copy?: string;
}
export type InfoGroupId = 'file' | 'camera' | 'exposure' | 'lens' | 'date' | 'location' | 'description' | 'software' | 'exif' | 'xmp' | 'iptc';
export interface InfoGroup { id: InfoGroupId; label: string; rows: InfoRow[]; readOnly?: boolean }

/** What the panel describes. Every part is optional, so a host can pass whatever it has. */
export interface InfoSource {
  /** Metadata with any recipe edits applied. */
  metadata?: ImageMetadata | null;
  /** File name, when the source was a named file. */
  name?: string;
  /** Encoded size in bytes. */
  bytes?: number;
  /** Header facts from `readFileInfo`. */
  file?: ImageFileInfo;
  /** Upright pixel size as opened. */
  size?: { width: number; height: number } | null;
  /** Pixel size after the recipe's geometry, when it differs. */
  edited?: { width: number; height: number } | null;
  /** Embedded profile. */
  profile?: IccProfile | null;
  /** Resolution recorded in the file. */
  dpi?: { x: number; y: number } | null;
  /** Resolution a resize set for export. */
  exportDpi?: number;
  /** Import provenance. */
  importInfo?: ImportInfo;
  /** Animation frames or pages. */
  frames?: number;
  /** Layers imported from a layered file. */
  layers?: number;
}

const FORMAT_NAMES: Record<string, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP', gif: 'GIF', svg: 'SVG', tiff: 'TIFF', psd: 'PSD', raw: 'RAW', heif: 'HEIF', avif: 'AVIF' };
/** Semantic fields shared between families, in the order a reader prefers them, and where a new value goes when no family has one. */
interface Semantic { id: string; label: keyof InfoMessages; keys: readonly string[]; create: string; kind: InfoEditKind }
const semantic = (id: string, label: keyof InfoMessages, keys: string[], create = keys[0]!, kind: InfoEditKind = 'text'): Semantic => ({ id, label, keys, create, kind });
const DESCRIPTION: Semantic[] = [
  semantic('title', 'title', ['xmp:dc:title', 'iptc:ObjectName']),
  semantic('caption', 'caption', ['xmp:dc:description', 'exif:ImageDescription', 'iptc:Caption-Abstract'], 'exif:ImageDescription', 'multiline'),
  semantic('creator', 'creator', ['xmp:dc:creator', 'exif:Artist', 'iptc:By-line'], 'exif:Artist'),
  semantic('copyright', 'copyright', ['xmp:dc:rights', 'exif:Copyright', 'iptc:CopyrightNotice'], 'exif:Copyright'),
  semantic('keywords', 'keywords', ['xmp:dc:subject', 'iptc:Keywords'], 'xmp:dc:subject', 'list'),
  semantic('city', 'city', ['xmp:photoshop:City', 'iptc:City']),
  semantic('country', 'country', ['xmp:photoshop:Country', 'iptc:Country-PrimaryLocationName']),
  semantic('comment', 'comment', ['exif:UserComment'], 'exif:UserComment', 'multiline'),
];
const CAMERA: Semantic[] = [
  semantic('make', 'make', ['exif:Make', 'xmp:tiff:Make']),
  semantic('model', 'model', ['exif:Model', 'xmp:tiff:Model']),
  semantic('serial', 'serialNumber', ['exif:SerialNumber', 'xmp:exifEX:BodySerialNumber', 'xmp:aux:SerialNumber']),
  semantic('owner', 'owner', ['exif:OwnerName', 'xmp:exifEX:CameraOwnerName']),
];
const LENS_TEXT: Semantic[] = [
  semantic('lens', 'lens', ['exif:LensModel', 'xmp:exifEX:LensModel', 'xmp:aux:Lens']),
  semantic('lensMake', 'lensMake', ['exif:LensMake', 'xmp:exifEX:LensMake']),
];
const LENS_SERIAL = semantic('lensSerial', 'lensSerial', ['exif:LensSerialNumber', 'xmp:exifEX:LensSerialNumber', 'xmp:aux:LensSerialNumber']);
const DATES: Semantic[] = [
  semantic('taken', 'taken', ['exif:DateTimeOriginal', 'xmp:exif:DateTimeOriginal', 'xmp:photoshop:DateCreated', 'iptc:DateCreated'], 'exif:DateTimeOriginal', 'datetime'),
  semantic('digitised', 'digitised', ['exif:CreateDate', 'xmp:exif:DateTimeDigitized', 'xmp:xmp:CreateDate'], 'exif:CreateDate', 'datetime'),
  semantic('modified', 'modified', ['exif:ModifyDate', 'xmp:xmp:ModifyDate'], 'exif:ModifyDate', 'datetime'),
];
const SOFTWARE: Semantic[] = [
  semantic('software', 'software', ['exif:Software']),
  semantic('creatorTool', 'creatorTool', ['xmp:xmp:CreatorTool']),
  semantic('computer', 'computer', ['exif:HostComputer']),
];

type Family = MetadataEntry['family'];
const familyOf = (key: string) => key.slice(0, key.indexOf(':')) as Family;
/**
 * Keys a value for this field is written to: every family the picture already has, or the field's home when
 * it has none. A family whose packet could not be read is never written, since its packet cannot be edited.
 */
function targets(field: Semantic, metadata: ImageMetadata | null | undefined, entries: readonly MetadataEntry[], unreadable: readonly Family[]): string[] {
  const present = metadata?.presence ?? { exif: false, xmp: false, iptc: false };
  const iptcReadable = entries.some(e => e.family === 'iptc');
  const keys = field.keys.filter(key => { const family = familyOf(key); return !unreadable.includes(family) && (family === 'iptc' ? iptcReadable && present.iptc : present[family]); });
  // IPTC times live in a second dataset beside the date.
  if (keys.includes('iptc:DateCreated')) keys.push('iptc:TimeCreated');
  if (keys.length) return keys;
  const home = [field.create, ...field.keys].find(key => familyOf(key) !== 'iptc' && !unreadable.includes(familyOf(key)));
  return [home ?? field.create];
}

/** Turn an ISO `YYYY-MM-DDTHH:MM:SS` value into each family's own date form. */
export function encodeDate(key: string, iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso);
  if (!match) return iso;
  const [, y, mo, d, h, mi, s = '00'] = match;
  if (key.startsWith('exif:')) return `${y}:${mo}:${d} ${h}:${mi}:${s}`;
  if (key === 'iptc:DateCreated') return `${y}${mo}${d}`;
  if (key === 'iptc:TimeCreated') return `${h}${mi}${s}`;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}
/** Read any family's date into ISO local time, with its UTC offset when recorded. */
export function parseDate(text: string): { iso: string; offset?: string } | undefined {
  const exif = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/.exec(text.trim());
  if (exif) { const [, y, mo, d, h, mi, s = '00', offset] = exif; return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}`, ...(offset ? { offset: offset === 'Z' ? '+00:00' : offset } : {}) }; }
  const iptc = /^(\d{4})(\d{2})(\d{2})$/.exec(text.trim());
  if (iptc) return { iso: `${iptc[1]}-${iptc[2]}-${iptc[3]}T00:00:00` };
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (date) return { iso: `${date[0]}T00:00:00` };
  return undefined;
}

/** Locale-aware formatting for every value the panel shows. */
export function formatters(m: InfoMessages, locale: string) {
  const n = (value: number, digits = 2) => numberFormat(locale, { maximumFractionDigits: digits }).format(value);
  const raw = (value: ExifValue | readonly string[]): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return n(value, 6);
    if ('binary' in value) return m.binary(formatBytes(value.binary, { locale }));
    return (value as readonly (string | number)[]).map(v => typeof v === 'number' ? n(v, 6) : v).join(typeof value[0] === 'string' ? '; ' : ', ');
  };
  const date = (text: string, offset?: string) => {
    const parsed = parseDate(text); if (!parsed) return text;
    const [y, mo, d, h, mi, s] = parsed.iso.split(/[-T:]/).map(Number) as [number, number, number, number, number, number];
    const value = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    if (Number.isNaN(value.getTime())) return text;
    const formatted = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(value);
    const zone = offset ?? parsed.offset;
    return zone ? `${formatted} (UTC${zone.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')})` : formatted;
  };
  const exposure = (seconds: number) => m.seconds(seconds >= 0.3 || seconds === 0 ? n(seconds, 1) : `1/${n(Math.round(1 / seconds), 0)}`);
  const aperture = (f: number) => `ƒ/${n(f, 1)}`;
  const dms = (degrees: number, positive: string, negative: string) => {
    const sign = degrees < 0 ? negative : positive, a = Math.abs(degrees), d = Math.floor(a), mFloat = (a - d) * 60, mm = Math.floor(mFloat), s = (mFloat - mm) * 60;
    return `${n(d, 0)}° ${n(mm, 0)}′ ${n(s, 2)}″ ${sign}`;
  };
  return { n, raw, date, exposure, aperture, dms };
}

const textOf = (value: MetadataEntry['value'] | undefined): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value || undefined;
  if (Array.isArray(value) && typeof value[0] === 'string') return (value as string[]).filter(Boolean).join('; ') || undefined;
  return undefined;
};
const listOf = (value: MetadataEntry['value'] | undefined): string[] => typeof value === 'string' ? value.split(/[;,]\s*/).filter(Boolean) : Array.isArray(value) && typeof value[0] === 'string' ? [...value as string[]].filter(Boolean) : [];

/** Signed decimal degrees from EXIF rationals or an XMP `DD,MM.mmmK` string. */
function coordinate(entries: Map<string, MetadataEntry>, axis: 'Latitude' | 'Longitude'): number | undefined {
  const exif = entries.get(`exif:GPS${axis}`)?.value, ref = textOf(entries.get(`exif:GPS${axis}Ref`)?.value);
  if (Array.isArray(exif) && typeof exif[0] === 'number') {
    const [d = 0, mm = 0, s = 0] = exif as number[], value = d + mm / 60 + s / 3600;
    return ref === 'S' || ref === 'W' ? -value : value;
  }
  const xmp = textOf(entries.get(`xmp:exif:GPS${axis}`)?.value);
  const match = xmp && /^(\d+),(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?([NSEW])$/.exec(xmp);
  if (match) { const value = Number(match[1]) + Number(match[2]) / 60 + Number(match[3] ?? 0) / 3600; return match[4] === 'S' || match[4] === 'W' ? -value : value; }
  return undefined;
}

/**
 * Every group the panel shows, in reading order. Editing affordances appear only when `editable`.
 * `unreadable` names families whose packet could not be read (from `readMetadataEntries`); each shows one row saying so.
 */
export function buildInfoGroups(source: InfoSource, entries: readonly MetadataEntry[], m: InfoMessages, locale: string, editable: boolean, unreadable: readonly Family[] = []): InfoGroup[] {
  const f = formatters(m, locale), byKey = new Map(entries.map(e => [e.key, e]));
  const number = (key: string) => { const v = byKey.get(key)?.value; return typeof v === 'number' ? v : Array.isArray(v) && typeof v[0] === 'number' ? v[0] as number : typeof v === 'string' && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : undefined; };
  const removeKeys = (keys: readonly string[]) => keys.filter(key => byKey.get(key)?.removable);
  const field = (s: Semantic, options: { always?: boolean } = {}): InfoRow | undefined => {
    const present = s.keys.map(key => byKey.get(key)).find(e => e && (s.kind === 'list' ? listOf(e.value).length : textOf(e.value)));
    if (!present && !(options.always && editable)) return undefined;
    const text = present ? (s.kind === 'list' ? listOf(present.value).join(', ') : s.kind === 'datetime' ? f.date(textOf(present.value)!, textOf(byKey.get(s.id === 'taken' ? 'exif:OffsetTimeOriginal' : s.id === 'digitised' ? 'exif:OffsetTimeDigitized' : 'exif:OffsetTime')?.value)) : textOf(present.value)!) : '';
    const current = present ? (s.kind === 'list' ? listOf(present.value) : s.kind === 'datetime' ? parseDate(textOf(present.value)!)?.iso ?? '' : textOf(present.value)!) : s.kind === 'list' ? [] : '';
    const writable = s.keys.some(key => byKey.get(key)?.writable) || !present;
    return { id: s.id, label: m[s.label] as string, value: text, ...(editable && writable ? { edit: { kind: s.kind, value: current, keys: targets(s, source.metadata, entries, unreadable) } } : {}), ...(editable && present ? { remove: removeKeys(s.keys) } : {}) };
  };
  const reading = (id: string, label: string, keys: readonly string[], value: string | undefined): InfoRow | undefined =>
    value === undefined ? undefined : { id, label, value, ...(editable ? { remove: removeKeys([...keys, ...keys.filter(k => k.startsWith('exif:')).map(k => `xmp:exif:${k.slice(5)}`)]) } : {}) };
  const rows = (list: (InfoRow | undefined)[]) => list.filter((row): row is InfoRow => !!row && (row.value !== '' || !!row.edit));
  const groups: InfoGroup[] = [];

  // File: read from the headers and the decoded picture, never edited.
  const file = source.file, fileRows: (InfoRow | undefined)[] = [];
  if (source.name) fileRows.push({ id: 'name', label: m.name, value: source.name });
  if (file) {
    const colour = file.colour === 'rgb' ? (file.alpha ? m.rgba : m.rgb) : file.colour === 'grey' ? (file.alpha ? m.greyAlpha : m.grey) : file.colour ? m[file.colour] : file.format === 'svg' ? m.vector : undefined;
    fileRows.push({ id: 'type', label: m.type, value: [FORMAT_NAMES[file.format] ?? file.format.toUpperCase(), colour].filter(Boolean).join(' · ') });
    const compression = [file.compression === 'lossless' ? m.lossless : file.compression === 'lossy' ? m.lossy : undefined, file.progressive ? (file.format === 'jpeg' ? m.progressive : m.interlaced) : undefined, file.subsampling].filter(Boolean);
    if (compression.length) fileRows.push({ id: 'compression', label: m.compression, value: compression.join(' · ') });
    if (file.bitDepth) fileRows.push({ id: 'bitDepth', label: m.bitDepth, value: m.bitsPerChannel(f.n(file.bitDepth, 0)) });
  }
  if (source.bytes !== undefined) fileRows.push({ id: 'fileSize', label: m.fileSize, value: formatBytes(source.bytes, { locale }) });
  if (source.size) fileRows.push({ id: 'dimensions', label: m.dimensions, value: `${f.n(source.size.width, 0)} × ${f.n(source.size.height, 0)} px · ${m.megapixels(f.n(source.size.width * source.size.height / 1e6, 1))}` });
  if (source.edited && source.size && (source.edited.width !== source.size.width || source.edited.height !== source.size.height)) fileRows.push({ id: 'afterEdits', label: m.afterEdits, value: `${f.n(source.edited.width, 0)} × ${f.n(source.edited.height, 0)} px` });
  if (source.profile !== undefined || file) {
    const profile = source.profile;
    fileRows.push({ id: 'profile', label: m.profile, value: profile ? `${profile.description} · ${profile.conversion === 'matrix-trc' ? m.converted : m.notConverted}` : m.noProfile });
  }
  if (file || source.dpi !== undefined) {
    const dpi = source.dpi ? (Math.abs(source.dpi.x - source.dpi.y) < 0.5 ? m.ppi(f.n(source.dpi.x, 0)) : `${m.ppi(f.n(source.dpi.x, 0))} × ${f.n(source.dpi.y, 0)}`) : m.notRecorded;
    fileRows.push({ id: 'resolution', label: m.resolution, value: source.exportDpi ? `${dpi} · ${m.ppiOnExport(f.n(source.exportDpi, 0))}` : dpi });
  }
  const orientation = source.metadata?.fields.orientation;
  if (orientation) {
    const names = [m.orientationNormal, m.orientationMirrored, m.orientation180, m.orientationFlipped, m.orientationTransposed, m.orientationCw, m.orientationTransverse, m.orientationCcw];
    fileRows.push({ id: 'orientation', label: m.orientation, value: orientation === 1 ? names[0]! : `${names[orientation - 1]} · ${m.appliedOnOpen}` });
  }
  if (source.frames && source.frames > 1) fileRows.push({ id: 'frames', label: source.importInfo?.kind === 'tiff' ? m.pages : m.frames, value: m.frameCount(f.n(source.frames, 0)) });
  if (source.layers) fileRows.push({ id: 'layers', label: m.layers, value: m.layerCount(f.n(source.layers, 0)) });
  if (source.importInfo?.kind === 'raw-preview') fileRows.push({ id: 'source', label: m.source, value: m.rawPreview });
  const fileList = rows(fileRows);
  if (fileList.length) groups.push({ id: 'file', label: m.groupFile, rows: fileList, readOnly: true });

  // Camera and capture.
  groups.push({ id: 'camera', label: m.groupCamera, rows: rows(CAMERA.map(s => field(s))) });
  const program = number('exif:ExposureProgram'), metering = number('exif:MeteringMode'), flash = number('exif:Flash');
  const whiteBalance = number('exif:WhiteBalance'), mode = number('exif:ExposureMode'), scene = number('exif:SceneCaptureType');
  const exposure = number('exif:ExposureTime'), fNumber = number('exif:FNumber'), iso = number('exif:ISO'), bias = number('exif:ExposureCompensation');
  groups.push({ id: 'exposure', label: m.groupExposure, rows: rows([
    reading('exposure', m.exposure, ['exif:ExposureTime', 'exif:ShutterSpeedValue'], exposure !== undefined && exposure > 0 ? f.exposure(exposure) : undefined),
    reading('aperture', m.aperture, ['exif:FNumber', 'exif:ApertureValue'], fNumber ? f.aperture(fNumber) : undefined),
    reading('iso', m.iso, ['exif:ISO', 'xmp:exif:ISOSpeedRatings'], iso !== undefined ? f.n(iso, 0) : undefined),
    reading('bias', m.exposureCompensation, ['exif:ExposureCompensation'], bias !== undefined ? m.ev(numberFormat(locale, { maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(bias)) : undefined),
    reading('program', m.program, ['exif:ExposureProgram'], program ? [m.programManual, m.programNormal, m.programAperture, m.programShutter, m.programCreative, m.programAction, m.programPortrait, m.programLandscape][program - 1] : undefined),
    reading('metering', m.metering, ['exif:MeteringMode'], metering ? [m.meteringAverage, m.meteringCentre, m.meteringSpot, m.meteringMultiSpot, m.meteringPattern, m.meteringPartial][metering - 1] : undefined),
    reading('flash', m.flash, ['exif:Flash'], flash === undefined ? undefined : flash & 0x20 ? m.flashNone : flash & 1 ? m.flashFired : m.flashNotFired),
    reading('whiteBalance', m.whiteBalance, ['exif:WhiteBalance'], whiteBalance === undefined ? undefined : whiteBalance === 0 ? m.auto : m.manual),
    reading('exposureMode', m.exposureMode, ['exif:ExposureMode'], mode === undefined ? undefined : [m.auto, m.manual, m.autoBracket][mode]),
    reading('scene', m.scene, ['exif:SceneCaptureType'], scene === undefined ? undefined : [m.sceneStandard, m.sceneLandscape, m.scenePortrait, m.sceneNight][scene]),
  ]) });
  const focal = number('exif:FocalLength'), focal35 = number('exif:FocalLengthIn35mmFormat'), lensInfo = byKey.get('exif:LensInfo')?.value, maxAperture = number('exif:MaxApertureValue');
  const range = Array.isArray(lensInfo) && lensInfo.length === 4 && typeof lensInfo[0] === 'number' ? lensInfo as number[] : undefined;
  groups.push({ id: 'lens', label: m.groupLens, rows: rows([
    ...LENS_TEXT.map(s => field(s)),
    reading('focal', m.focalLength, ['exif:FocalLength', 'exif:FocalLengthIn35mmFormat'], focal ? [m.millimetres(f.n(focal, 1)), focal35 && focal35 !== focal ? m.equivalent(f.n(focal35, 0)) : undefined].filter(Boolean).join(' · ') : undefined),
    reading('lensRange', m.lensRange, ['exif:LensInfo'], range ? `${m.millimetres(range[0] === range[1] ? f.n(range[0]!, 0) : `${f.n(range[0]!, 0)}–${f.n(range[1]!, 0)}`)} · ${f.aperture(range[2]!)}${range[3] && range[3] !== range[2] ? `–${f.n(range[3], 1)}` : ''}` : undefined),
    reading('maxAperture', m.maxAperture, ['exif:MaxApertureValue'], maxAperture !== undefined ? f.aperture(Math.pow(2, maxAperture / 2)) : undefined),
    field(LENS_SERIAL),
  ]) });
  groups.push({ id: 'date', label: m.groupDate, rows: rows(DATES.map(s => field(s))) });

  // Location: one coordinate pair, removed as a whole.
  const latitude = coordinate(byKey, 'Latitude'), longitude = coordinate(byKey, 'Longitude');
  const altitude = number('exif:GPSAltitude'), below = number('exif:GPSAltitudeRef') === 1;
  const stamp = byKey.get('exif:GPSTimeStamp')?.value, day = textOf(byKey.get('exif:GPSDateStamp')?.value);
  const time = Array.isArray(stamp) && stamp.length === 3 ? (stamp as number[]).map(v => String(Math.floor(v)).padStart(2, '0')).join(':') : undefined;
  groups.push({ id: 'location', label: m.groupLocation, rows: rows([
    latitude !== undefined && longitude !== undefined ? { id: 'coordinates', label: m.coordinates, value: `${f.dms(latitude, m.north, m.south)}, ${f.dms(longitude, m.east, m.west)}`, copy: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` } : undefined,
    altitude !== undefined ? { id: 'altitude', label: m.altitude, value: (below ? m.belowSea : m.aboveSea)(f.n(altitude, 1)) } : undefined,
    day && time ? { id: 'gpsTime', label: m.gpsTime, value: f.date(`${day} ${time}`, '+00:00') } : undefined,
  ]) });
  groups.push({ id: 'description', label: m.groupDescription, rows: rows(DESCRIPTION.map(s => field(s, { always: true }))) });
  groups.push({ id: 'software', label: m.groupSoftware, rows: rows(SOFTWARE.map(s => field(s))) });

  // Every field, as stored, for anything the readable groups do not cover.
  for (const family of ['exif', 'xmp', 'iptc'] as const) {
    const list = entries.filter(e => e.family === family).map((e): InfoRow => {
      const list = Array.isArray(e.value) && typeof e.value[0] === 'string' && e.value.length > 1;
      const isDate = /Date|DateTime|ModifyDate|CreateDate/.test(e.name) && typeof e.value === 'string' && !!parseDate(e.value);
      return { id: e.key, label: e.name, value: f.raw(e.value), ...(editable && e.writable ? { edit: { kind: list || e.key === 'xmp:dc:subject' || e.key === 'iptc:Keywords' ? 'list' as const : isDate && family === 'exif' ? 'datetime' as const : 'text' as const, value: list || e.key === 'xmp:dc:subject' || e.key === 'iptc:Keywords' ? listOf(e.value) : isDate && family === 'exif' ? parseDate(e.value as string)!.iso : textOf(e.value) ?? '', keys: [e.key] } } : {}), ...(editable && e.removable ? { remove: [e.key] } : {}) };
    });
    if (unreadable.includes(family)) list.push({ id: `${family}:unreadable`, label: family.toUpperCase(), value: m.unreadable });
    if (list.length) groups.push({ id: family, label: family.toUpperCase(), rows: list });
  }
  return groups.filter(g => g.rows.length);
}

/** The values one edit writes: dates in each family's form, lists where the family holds lists. */
export function editValues(row: InfoRow, value: string | readonly string[]): Record<string, string | readonly string[]> {
  const keys = row.edit?.keys ?? [];
  return Object.fromEntries(keys.map(key => {
    if (row.edit?.kind === 'datetime') return [key, typeof value === 'string' && value ? encodeDate(key, value) : ''];
    if (row.edit?.kind === 'list') { const list = typeof value === 'string' ? value.split(/[;,]\s*/) : value; return [key, key.startsWith('exif:') ? list.join('; ') : list]; }
    return [key, value];
  }));
}
