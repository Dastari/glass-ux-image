import { describe, expect, it } from 'vitest';
import { concat, utf8 } from '../io/formats/bytes.js';
import { cameraExif, lightroomXmp, withJpegMetadata } from '../../e2e/fixtures/metadata.js';
import { listMetadata, readMetadata, readMetadataEntries, applyMetadataEdits } from '../io/metadata/index.js';
import { infoMessages } from '../messages/info.js';
import { buildInfoGroups, editValues, encodeDate, parseDate } from './info-model.js';

const m = infoMessages.defaults;
const jpeg = () => concat([new Uint8Array([255, 216]), new Uint8Array([255, 217])]);
const camera = () => readMetadata(withJpegMetadata(jpeg(), { exif: cameraExif({ orientation: 6 }), xmp: lightroomXmp(), iptc: true }));
const groups = (metadata = camera(), editable = true) => buildInfoGroups({ metadata, size: { width: 5464, height: 8192 } }, listMetadata(metadata), m, 'en-AU', editable);
const find = (list: ReturnType<typeof groups>, group: string, id: string) => list.find(g => g.id === group)?.rows.find(r => r.id === id);

describe('info groups', () => {
  it('reads camera, exposure, lens, date, location and description in readable form', () => {
    const list = groups();
    expect(list.map(g => g.id)).toEqual(['file', 'camera', 'exposure', 'lens', 'date', 'location', 'description', 'software', 'exif', 'xmp', 'iptc']);
    expect(find(list, 'file', 'orientation')?.value).toBe('Rotated 90° clockwise · Applied when opened');
    expect(find(list, 'file', 'dimensions')?.value).toBe('5,464 × 8,192 px · 44.8 MP');
    expect(find(list, 'exposure', 'exposure')?.value).toBe('1/250 s');
    expect(find(list, 'exposure', 'bias')?.value).toBe('-0.33 EV');
    expect(find(list, 'exposure', 'flash')?.value).toBe('Did not fire');
    expect(find(list, 'lens', 'focal')?.value).toBe('50 mm');
    expect(find(list, 'lens', 'maxAperture')?.value).toBe('ƒ/4');
    expect(find(list, 'date', 'taken')?.value).toBe('29 Oct 2026, 6:42:13 am (UTC+11:00)');
    expect(find(list, 'location', 'coordinates')).toMatchObject({ value: '33° 51′ 31.08″ S, 151° 12′ 33.48″ E', copy: '-33.858633, 151.209300' });
    expect(find(list, 'description', 'keywords')?.edit).toEqual({ kind: 'list', value: ['harbour', 'dawn', 'ferry'], keys: ['xmp:dc:subject', 'iptc:Keywords'] });
    expect(list.find(g => g.id === 'file')?.readOnly).toBe(true);
  });
  it('writes a shared field to every family the picture has, and only to its home when it has none', () => {
    const creator = find(groups(), 'description', 'creator')!;
    expect(creator.edit?.keys).toEqual(['xmp:dc:creator', 'exif:Artist', 'iptc:By-line']);
    expect(creator.remove).toEqual(['xmp:dc:creator', 'exif:Artist', 'iptc:By-line']);
    const bare = buildInfoGroups({ metadata: null }, [], m, 'en', true);
    expect(bare.find(g => g.id === 'description')?.rows.map(r => [r.id, r.edit?.keys])).toEqual([['title', ['xmp:dc:title']], ['caption', ['exif:ImageDescription']], ['creator', ['exif:Artist']], ['copyright', ['exif:Copyright']], ['keywords', ['xmp:dc:subject']], ['city', ['xmp:photoshop:City']], ['country', ['xmp:photoshop:Country']], ['comment', ['exif:UserComment']]]);
    // Read-only panels offer no edits and hide empty fields.
    expect(buildInfoGroups({ metadata: null }, [], m, 'en', false)).toEqual([]);
    expect(groups(camera(), false).flatMap(g => g.rows).some(r => r.edit || r.remove)).toBe(false);
  });
  it('turns edits into each family’s own form, and the result reads back', () => {
    const taken = find(groups(), 'date', 'taken')!;
    expect(taken.edit?.value).toBe('2026-10-29T06:42:13');
    const values = editValues(taken, '2026-11-04T09:30:05');
    expect(values).toEqual({ 'exif:DateTimeOriginal': '2026:11:04 09:30:05', 'xmp:exif:DateTimeOriginal': '2026-11-04T09:30:05', 'xmp:photoshop:DateCreated': '2026-11-04T09:30:05', 'iptc:DateCreated': '20261104', 'iptc:TimeCreated': '093005' });
    const edited = applyMetadataEdits(camera(), { set: values })!;
    expect(find(groups(edited), 'date', 'taken')?.value).toMatch(/^4 Nov 2026, 9:30:05 am/);
    expect(editValues(find(groups(), 'description', 'keywords')!, ['a', 'b'])).toEqual({ 'xmp:dc:subject': ['a', 'b'], 'iptc:Keywords': ['a', 'b'] });
  });
  it('shows an unreadable packet as one row and writes shared fields only to readable families', () => {
    const metadata = { ...camera(), packets: camera().packets.map(p => p.kind === 'xmp' ? { ...p, data: utf8('<x:xmpmeta><broken') } : p) };
    const { entries, unreadable } = readMetadataEntries(metadata);
    const list = buildInfoGroups({ metadata }, entries, m, 'en-AU', true, unreadable);
    expect(list.find(g => g.id === 'xmp')?.rows).toEqual([{ id: 'xmp:unreadable', label: 'XMP', value: 'Could not be read' }]);
    expect(find(list, 'description', 'creator')?.edit?.keys).toEqual(['exif:Artist', 'iptc:By-line']);
    // A field whose home family is unreadable goes to another family that can take it.
    const exifOnly = { ...metadata, packets: [{ kind: 'exif' as const, data: utf8('Exif\0\0MM\0*junk') }], presence: { exif: true, xmp: false, iptc: false } };
    expect(readMetadataEntries(exifOnly).unreadable).toEqual(['exif']);
    const bare = buildInfoGroups({ metadata: exifOnly }, [], m, 'en-AU', true, ['exif']);
    expect(find(bare, 'description', 'creator')?.edit?.keys).toEqual(['xmp:dc:creator']);
    expect(find(bare, 'description', 'title')?.edit?.keys).toEqual(['xmp:dc:title']);
  });
  it('parses and encodes dates across families', () => {
    expect(parseDate('2026:10:29 06:42:13')).toEqual({ iso: '2026-10-29T06:42:13' });
    expect(parseDate('2026-10-29T06:42:13+11:00')).toEqual({ iso: '2026-10-29T06:42:13', offset: '+11:00' });
    expect(parseDate('20261029')).toEqual({ iso: '2026-10-29T00:00:00' });
    expect(parseDate('soon')).toBeUndefined();
    expect(encodeDate('xmp:xmp:CreateDate', '2026-10-29T06:42')).toBe('2026-10-29T06:42:00');
  });
});
