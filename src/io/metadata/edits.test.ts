import { describe, expect, it } from 'vitest';
import { concat, FileDataError, utf8 } from '../formats/bytes.js';
import { chunk, PNG_SIGNATURE } from '../formats/container.js';
import { cameraExif, lightroomXmp, photoshopApp13, tinyPng, withJpegMetadata, withPngMetadata, withWebpMetadata } from '../../../e2e/fixtures/metadata.js';
import { editExifEntries, readExifEntries } from './exif-tags.js';
import { editXmpProperties, readXmpProperties } from './xmp-fields.js';
import { editIptc, readIptc } from './iptc.js';
import { applyMetadataEdits, listMetadata, mergeMetadataEdits, isWritableMetadataKey, readMetadataEntries } from './edits.js';
import { readFileInfo } from './file-info.js';
import { readMetadata, writeMetadata } from './index.js';

const jpeg = (extra: Uint8Array[] = []) => concat([new Uint8Array([255, 216]), ...extra, new Uint8Array([255, 217])]);
const value = (entries: ReturnType<typeof readExifEntries>, name: string) => entries.find(e => e.name === name)?.value;
const find = (bytes: Uint8Array, text: string) => { const needle = utf8(text); outer: for (let i = 0; i + needle.length <= bytes.length; i++) { for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer; return i; } return -1; };

describe('EXIF entries', () => {
  for (const littleEndian of [true, false]) it(`reads a camera's EXIF (${littleEndian ? 'Intel' : 'Motorola'} order)`, () => {
    const entries = readExifEntries(cameraExif({ littleEndian }));
    expect(value(entries, 'Make')).toBe('Canon');
    expect(value(entries, 'Model')).toBe('Canon EOS R5');
    expect(value(entries, 'ExposureTime')).toBeCloseTo(1 / 250);
    expect(value(entries, 'FNumber')).toBeCloseTo(5.6);
    expect(value(entries, 'ExposureCompensation')).toBeCloseTo(-1 / 3);
    expect(value(entries, 'ISO')).toBe(400);
    expect(value(entries, 'LensInfo')).toEqual([24, 105, 4, 4]);
    expect(value(entries, 'LensModel')).toBe('RF24-105mm F4 L IS USM');
    expect(value(entries, 'ExifVersion')).toBe('0232');
    expect(value(entries, 'UserComment')).toBe('Shot from the ferry');
    expect(value(entries, 'MakerNote')).toEqual({ binary: 32 });
    expect(value(entries, 'Copyright')).toBe('© 2026 Alex Rivera');
    expect(value(entries, 'GPSLatitudeRef')).toBe('S');
    expect(value(entries, 'GPSLatitude')).toEqual([33, 51, 31.08]);
    expect(value(entries, 'InteropIndex')).toBe('R98');
    expect(entries.some(e => e.name === 'ExifOffset' || e.name === 'GPSInfo')).toBe(false);
    expect(entries.filter(e => e.ifd === 'ifd1').map(e => e.name)).toContain('ifd1:Compression');
  });
  it('edits text in place of nothing it does not touch: maker note, thumbnail and unknown offsets stay put', () => {
    const source = cameraExif(), before = readExifEntries(source);
    const makerAt = find(source, 'MKNT'), thumbAt = find(source, 'thum');
    const out = editExifEntries(source, { set: { Artist: 'Sam Lee, staff photographer', LensSerialNumber: 'LS-889', ImageDescription: 'Hafen im Morgengrauen — Fähre' }, remove: ['Software'] });
    const after = readExifEntries(out);
    expect(value(after, 'Artist')).toBe('Sam Lee, staff photographer');
    expect(value(after, 'LensSerialNumber')).toBe('LS-889');
    expect(value(after, 'ImageDescription')).toBe('Hafen im Morgengrauen — Fähre');
    expect(value(after, 'Software')).toBeUndefined();
    // Every other entry reads exactly as before.
    const untouched = (list: typeof before) => list.filter(e => !['Artist', 'LensSerialNumber', 'ImageDescription', 'Software'].includes(e.name)).map(e => [e.name, e.value]);
    expect(untouched(after)).toEqual(untouched(before));
    // The maker note's self-relative offset still points at itself, and the thumbnail did not move.
    expect(find(out, 'MKNT')).toBe(makerAt);
    expect(new DataView(out.buffer).getUint32(makerAt + 4, true)).toBe(makerAt);
    expect(find(out, 'thum')).toBe(thumbAt);
    // A removed value is gone from the bytes, not just unlinked.
    expect(find(out, 'Adobe Lightroom')).toBe(-1);
    expect(find(out, 'Alex Rivera')).toBeGreaterThan(0); // Copyright is kept.
  });
  it('removes GPS completely and writes coded comments', () => {
    const out = editExifEntries(cameraExif(), { removeGps: true, set: { UserComment: 'Über den Hafen' } });
    const entries = readExifEntries(out);
    expect(entries.some(e => e.ifd === 'gps')).toBe(false);
    expect(value(entries, 'UserComment')).toBe('Über den Hafen');
    expect(find(out, '2026:10:28')).toBe(-1);
  });
  it('starts a payload for a picture with none, and refuses numeric or structural tags', () => {
    const out = editExifEntries(null, { set: { Artist: 'Sam', DateTimeOriginal: '2026:11:04 09:00:00' } });
    expect(readExifEntries(out).map(e => [e.name, e.value])).toEqual([['Artist', 'Sam'], ['DateTimeOriginal', '2026:11:04 09:00:00']]);
    expect(() => editExifEntries(null, { set: { FNumber: '2' } })).toThrow(FileDataError);
    expect(() => editExifEntries(null, { set: { ExifOffset: '2' } })).toThrow(FileDataError);
  });
  it('drops an emptied sub-directory and its pointer', () => {
    const exifNames = readExifEntries(cameraExif()).filter(e => e.ifd === 'exif' || e.ifd === 'interop').map(e => e.name);
    const out = editExifEntries(cameraExif(), { remove: exifNames });
    const entries = readExifEntries(out);
    expect(entries.some(e => e.ifd === 'exif' || e.ifd === 'interop')).toBe(false);
    expect(value(entries, 'Make')).toBe('Canon');
  });
});

describe('XMP properties', () => {
  it('reads alternatives, arrays, attributes and structures under canonical prefixes', () => {
    const props = Object.fromEntries(readXmpProperties(lightroomXmp()).map(p => [p.name, p]));
    expect(props['dc:title']).toMatchObject({ values: ['Harbour at dawn'], form: 'Alt' });
    expect(props['dc:description']!.values).toEqual(['Ferries crossing & gulls']);
    expect(props['dc:subject']).toMatchObject({ values: ['harbour', 'dawn', 'ferry'], form: 'Bag' });
    expect(props['dc:creator']!.form).toBe('Seq');
    expect(props['xmp:Rating']).toMatchObject({ values: ['4'], form: 'simple' });
    expect(props['Iptc4xmpCore:CreatorContactInfo']).toMatchObject({ form: 'struct', values: ['Iptc4xmpCore:CiEmailWork: alex@example.com', 'Iptc4xmpCore:CiUrlWork: https://example.com'] });
    // A file's own alias resolves to the canonical prefix.
    const aliased = readXmpProperties(utf8('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:d="http://purl.org/dc/elements/1.1/" d:format="image/jpeg"/></rdf:RDF></x:xmpmeta>'));
    expect(aliased).toEqual([{ name: 'dc:format', namespace: 'http://purl.org/dc/elements/1.1/', values: ['image/jpeg'], form: 'simple' }]);
  });
  it('edits properties and leaves every other byte alone', () => {
    const out = editXmpProperties(lightroomXmp(), { set: { 'dc:title': 'Ferry <wake>', 'dc:subject': ['ferry', 'Sydney'], 'photoshop:City': 'Manly', 'xmpRights:Marked': 'True' }, remove: ['xmp:Rating'] });
    const text = new TextDecoder().decode(out), props = Object.fromEntries(readXmpProperties(out).map(p => [p.name, p]));
    expect(props['dc:title']).toMatchObject({ values: ['Ferry <wake>'], form: 'Alt' });
    expect(props['dc:subject']).toMatchObject({ values: ['ferry', 'Sydney'], form: 'Bag' });
    expect(props['photoshop:City']!.values).toEqual(['Manly']);
    expect(props['xmpRights:Marked']!.values).toEqual(['True']);
    expect(props['xmp:Rating']).toBeUndefined();
    expect(text).toContain('x:xmptk="Adobe XMP Core 7.0-c000"');
    expect(text).toContain('Ferry &lt;wake&gt;');
    expect(props['Iptc4xmpCore:CreatorContactInfo']).toBeDefined();
  });
  it('writes into a self-closing description and into a fresh packet', () => {
    const closed = utf8('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""/></rdf:RDF></x:xmpmeta>');
    expect(readXmpProperties(editXmpProperties(closed, { set: { 'dc:creator': 'Sam' } }))).toMatchObject([{ name: 'dc:creator', values: ['Sam'], form: 'Seq' }]);
    expect(readXmpProperties(editXmpProperties(null, { set: { 'xmp:Label': 'Red' } }))).toMatchObject([{ name: 'xmp:Label', values: ['Red'] }]);
    expect(() => editXmpProperties(null, { set: { 'nope:Thing': 'x' } })).toThrow(FileDataError);
  });
  it('rejects entity declarations', () => expect(() => readXmpProperties(utf8('<!DOCTYPE x [<!ENTITY a "b">]><x/>'))).toThrow(FileDataError));
  it('writes arrays with a prefixed RDF name when the file binds RDF as the default namespace', () => {
    const source = utf8('<x:xmpmeta xmlns:x="adobe:ns:meta/"><RDF xmlns="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><Description><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/"><Alt><li xml:lang="x-default">Old</li></Alt></dc:title></Description></RDF></x:xmpmeta>');
    expect(readXmpProperties(source)[0]?.values).toEqual(['Old']);
    const out = editXmpProperties(source, { set: { 'dc:title': 'New', 'dc:subject': ['a', 'b'] } }), text = new TextDecoder().decode(out);
    expect(text).not.toMatch(/<\/?:/);
    expect(readXmpProperties(out)).toMatchObject([{ name: 'dc:title', values: ['New'], form: 'Alt' }, { name: 'dc:subject', values: ['a', 'b'], form: 'Bag' }]);
  });
  it('uses the RDF prefix in scope where each property is written', () => {
    // The first description rebinds `r` away from RDF; the replaced property sits in a second description where `r` is RDF.
    const source = utf8('<x:xmpmeta xmlns:x="adobe:ns:meta/"><r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description xmlns:dc="http://purl.org/dc/elements/1.1/"/><r:Description><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/"><r:Seq><r:li>Old</r:li></r:Seq></dc:creator></r:Description></r:RDF></x:xmpmeta>');
    const out = editXmpProperties(source, { set: { 'dc:creator': ['Sam', 'Alex'], 'dc:rights': '© Sam' } });
    expect(new TextDecoder().decode(out)).toContain('<r:Seq><r:li>Sam</r:li><r:li>Alex</r:li></r:Seq>');
    expect(readXmpProperties(out)).toMatchObject([{ name: 'dc:rights', values: ['© Sam'], form: 'Alt' }, { name: 'dc:creator', values: ['Sam', 'Alex'], form: 'Seq' }]);
  });
  it('drops control characters XML 1.0 forbids', () => {
    const out = editXmpProperties(null, { set: { 'dc:title': 'Bell\u0007 tab\there' } });
    expect(out.some(b => b < 9)).toBe(false);
    expect(readXmpProperties(out)[0]?.values).toEqual(['Bell tab\there']);
  });
  it('treats extended XMP as opaque from its bytes, whatever its binary header holds', () => {
    // GUID, then a full length of 100,000 (0x000186a0) and an offset: not valid UTF-8.
    const extended = concat([utf8('http://ns.adobe.com/xmp/extension/\0'), utf8('0123456789ABCDEF0123456789ABCDEF'), new Uint8Array([0, 1, 0x86, 0xa0, 0, 0, 0, 0]), utf8('<x>')]);
    expect(readXmpProperties(extended)).toEqual([]);
    expect(() => editXmpProperties(extended, { set: { 'dc:title': 'x' } })).toThrow('Editing extended XMP is unsupported');
  });
});

describe('IPTC', () => {
  const packet = () => ({ kind: 'iptc' as const, data: photoshopApp13() });
  it('reads UTF-8 datasets, listing repeated keywords', () => {
    const datasets = readIptc(packet())!;
    expect(datasets.filter(d => d.name === 'Keywords').map(d => d.value)).toEqual(['harbour', 'dawn', 'ferry']);
    expect(datasets.find(d => d.name === 'CopyrightNotice')?.value).toBe('© 2026 Alex Rivera');
    expect(datasets.find(d => d.name === 'Caption-Abstract')?.value).toBe('Ferries crossing & gulls');
  });
  it('rewrites the application record and keeps other Photoshop resources', () => {
    const out = editIptc(packet(), { set: { Keywords: ['harbour', 'Sydney Harbour'], 'By-line': 'Sam Lee' }, remove: ['City'] });
    const datasets = readIptc(out)!;
    expect(datasets.filter(d => d.name === 'Keywords').map(d => d.value)).toEqual(['harbour', 'Sydney Harbour']);
    expect(datasets.find(d => d.name === 'By-line')?.value).toBe('Sam Lee');
    expect(datasets.some(d => d.name === 'City')).toBe(false);
    expect(out.data.subarray(14, 18)).toEqual(utf8('8BIM'));
    expect(out.data[18]).toBe(0x03); expect(out.data[19]).toBe(0xed);
  });
  it('reads and edits ImageMagick hex text in PNG', () => {
    const meta = readMetadata(withPngMetadata(tinyPng(), { iptc: true }));
    const iptc = meta.packets.find(p => p.kind === 'iptc')!;
    expect(readIptc(iptc)?.find(d => d.name === 'City')?.value).toBe('Sydney');
    const edited = editIptc(iptc, { set: { City: 'Hobart' } });
    expect(readIptc(edited)?.find(d => d.name === 'City')?.value).toBe('Hobart');
    expect(readIptc({ kind: 'iptc', data: utf8('Raw profile type iptc\0x'), containerType: 'zTXt' })).toBeNull();
  });
  const dataset = (record: number, number: number, data: Uint8Array) => concat([new Uint8Array([0x1c, record, number, data.length >> 8, data.length & 255]), data]);
  const resource = (iim: Uint8Array) => { const size = new Uint8Array(4); new DataView(size.buffer).setUint32(0, iim.length); return { kind: 'iptc' as const, data: concat([utf8('Photoshop 3.0\0'), utf8('8BIM'), new Uint8Array([4, 4, 0, 0]), size, iim, iim.length % 2 ? new Uint8Array(1) : new Uint8Array()]) }; };
  const latin1 = (text: string) => Uint8Array.from(text, c => c.charCodeAt(0));
  it('converts kept Latin-1 text when a new value makes the block UTF-8', () => {
    const source = resource(concat([dataset(2, 90, latin1('Café')), dataset(2, 120, latin1('Fête à Montréal'))]));
    expect(readIptc(source)?.map(d => d.value)).toEqual(['Café', 'Fête à Montréal']);
    const edited = readIptc(editIptc(source, { set: { 'By-line': 'Zoë' } }))!;
    expect(Object.fromEntries(edited.map(d => [d.name, d.value]))).toEqual({ 'By-line': 'Zoë', City: 'Café', 'Caption-Abstract': 'Fête à Montréal' });
  });
  it('replaces a Latin-1 declaration rather than writing UTF-8 under it', () => {
    const source = resource(concat([dataset(1, 90, new Uint8Array([0x1b, 0x2e, 0x41])), dataset(2, 90, latin1('Café'))]));
    const out = editIptc(source, { set: { 'By-line': 'Zoë' } });
    expect(Object.fromEntries(readIptc(out)!.map(d => [d.name, d.value]))).toEqual({ 'By-line': 'Zoë', City: 'Café' });
    expect(find(out.data, '\x1b%G')).toBeGreaterThan(0);
    expect(find(out.data, '\x1b.A')).toBe(-1);
    // ASCII edits leave a legacy declaration and its text alone.
    const ascii = editIptc(source, { set: { 'By-line': 'Zoe' } }).data, city = concat([new Uint8Array([0x1c, 2, 90, 0, 4]), latin1('Café')]);
    expect(find(ascii, '\x1b.A')).toBeGreaterThan(0);
    expect(ascii.findIndex((_, i) => city.every((b, j) => ascii[i + j] === b))).toBeGreaterThan(0);
  });
  it('keeps binary datasets and long values through an edit', () => {
    const preview = new Uint8Array(40000).map((_, i) => (i * 7) & 255);
    const long = concat([new Uint8Array([0x1c, 2, 202, 0x80, 4, 0, 0, 0x9c, 0x40]), preview]);
    const source = resource(concat([dataset(2, 0, new Uint8Array([0, 4])), dataset(2, 90, latin1('Café')), long]));
    const out = editIptc(source, { set: { 'By-line': 'Zoë' } });
    expect(find(out.data, '\x1c\x02\x00\x00\x02\x00\x04')).toBeGreaterThan(0);
    const at = out.data.findIndex((b, i) => b === 0x1c && out.data[i + 1] === 2 && out.data[i + 2] === 202);
    expect([...out.data.subarray(at + 3, at + 9)]).toEqual([0x80, 4, 0, 0, 0x9c, 0x40]);
    expect(out.data.subarray(at + 9, at + 9 + preview.length)).toEqual(preview);
    expect(readIptc(out)?.find(d => d.name === 'City')?.value).toBe('Café');
  });
});

describe('recipe edits', () => {
  const source = () => readMetadata(withJpegMetadata(jpeg(), { exif: cameraExif(), xmp: lightroomXmp(), iptc: true }));
  it('folds changes: set, clear, remove, remove GPS and remove all', () => {
    let edits = mergeMetadataEdits(undefined, { set: { 'exif:Artist': 'Sam' } });
    edits = mergeMetadataEdits(edits, { remove: ['xmp:xmp:Rating'] });
    edits = mergeMetadataEdits(edits, { set: { 'iptc:Keywords': ['a', ' ', 'b '] } });
    expect(edits).toEqual({ set: { 'exif:Artist': 'Sam', 'iptc:Keywords': ['a', 'b'] }, remove: ['xmp:xmp:Rating'] });
    edits = mergeMetadataEdits(edits, { set: { 'exif:Artist': '  ' } });
    expect(edits.set).toEqual({ 'iptc:Keywords': ['a', 'b'] }); expect(edits.remove).toContain('exif:Artist');
    expect(mergeMetadataEdits(mergeMetadataEdits(edits, { removeGps: true }), { removeAll: true })).toEqual({ removeAll: true });
  });
  it('lists every field once, with what can be written and removed', () => {
    const list = listMetadata(source()), byKey = Object.fromEntries(list.map(e => [e.key, e]));
    expect(byKey['exif:Artist']).toMatchObject({ writable: true, removable: true, value: 'Alex Rivera' });
    expect(byKey['exif:FNumber']).toMatchObject({ writable: false, removable: true });
    expect(byKey['exif:Orientation']).toMatchObject({ writable: false, removable: false });
    expect(byKey['xmp:dc:subject']!.value).toEqual(['harbour', 'dawn', 'ferry']);
    expect(byKey['iptc:Keywords']!.value).toEqual(['harbour', 'dawn', 'ferry']);
    expect(byKey['xmp:Iptc4xmpCore:CreatorContactInfo']!.writable).toBe(false);
    expect(new Set(list.map(e => e.key)).size).toBe(list.length);
    expect(isWritableMetadataKey('iptc:Keywords') && isWritableMetadataKey('xmp:dc:title') && !isWritableMetadataKey('exif:ISO')).toBe(true);
  });
  for (const [name, build] of [['JPEG', () => jpeg()], ['PNG', () => tinyPng()], ['WebP', () => withWebpMetadata(webpLossless(), {})]] as const) it(`writes edited metadata into ${name} on export`, () => {
    const original = name === 'JPEG' ? source() : readMetadata(name === 'PNG' ? withPngMetadata(tinyPng(), { exif: cameraExif(), xmp: lightroomXmp() }) : withWebpMetadata(webpLossless(), { exif: cameraExif(), xmp: lightroomXmp() }));
    const edits = { set: { 'exif:Artist': 'Sam Lee', 'xmp:dc:title': 'Ferry wake', ...(name === 'JPEG' ? { 'iptc:Keywords': ['ferry'] } : {}) }, remove: ['exif:Software'], removeGps: true };
    const edited = applyMetadataEdits(original, edits)!;
    const out = readMetadata(writeMetadata(build(), edited, { mode: 'preserve', pixelsOriented: true }));
    const list = Object.fromEntries(listMetadata(out).map(e => [e.key, e.value]));
    expect(list['exif:Artist']).toBe('Sam Lee');
    expect(list['exif:Software']).toBeUndefined();
    expect(list['xmp:dc:title']).toEqual(['Ferry wake']);
    expect(Object.keys(list).some(k => /GPS/.test(k))).toBe(false);
    if (name === 'JPEG') expect(list['iptc:Keywords']).toEqual(['ferry']);
    // The source is untouched.
    expect(listMetadata(original).find(e => e.key === 'exif:Artist')?.value).toBe('Alex Rivera');
    // The policy still decides: a strip export writes none of it.
    expect(readMetadata(writeMetadata(build(), edited, { mode: 'strip' })).packets).toEqual([]);
  });
  it('removing everything and then adding a field starts fresh packets', () => {
    const edited = applyMetadataEdits(source(), { removeAll: true, set: { 'exif:Copyright': '© Sam', 'xmp:dc:title': 'New' } })!;
    expect(edited.packets.map(p => p.kind)).toEqual(['exif', 'xmp']);
    expect(listMetadata(edited).map(e => e.key)).toEqual(['exif:Copyright', 'xmp:dc:title']);
    expect(applyMetadataEdits(source(), { removeAll: true })!.packets).toEqual([]);
  });
  it('lists a malformed packet as unreadable and still reads the others', () => {
    const extended = concat([utf8('http://ns.adobe.com/xmp/extension/\0'), utf8('0123456789ABCDEF0123456789ABCDEF'), new Uint8Array([0, 1, 0x86, 0xa0, 0, 0, 0, 0]), utf8('<x>')]);
    const metadata = { ...source(), packets: [...source().packets, { kind: 'xmp' as const, data: extended }, { kind: 'xmp' as const, data: utf8('<x:xmpmeta><broken') }] };
    const { entries, unreadable } = readMetadataEntries(metadata);
    expect(unreadable).toEqual(['xmp']);
    expect(entries.find(e => e.key === 'exif:Artist')?.value).toBe('Alex Rivera');
    expect(entries.find(e => e.key === 'xmp:dc:title')?.value).toEqual(['Harbour at dawn']);
    expect(listMetadata(metadata)).toEqual(entries);
    const bad = { ...source(), packets: [{ kind: 'exif' as const, data: utf8('Exif\0\0MM\0*junk') }, ...source().packets.filter(p => p.kind !== 'exif')] };
    expect(readMetadataEntries(bad).unreadable).toEqual(['exif']);
    expect(readMetadataEntries(bad).entries.some(e => e.family === 'exif')).toBe(false);
  });
  it('no edits returns the source as it was', () => { const m = source(); expect(applyMetadataEdits(m, {})).toBe(m); expect(applyMetadataEdits(m, undefined)).toBe(m); });
});

function webpLossless() { const data = new Uint8Array([0x2f, 0, 0, 0, 0]); const body = chunk('VP8L', data, 'webp'), h = new Uint8Array(12); h.set(utf8('RIFF')); new DataView(h.buffer).setUint32(4, body.length + 4, true); h.set(utf8('WEBP'), 8); return concat([h, body]); }

describe('file headers', () => {
  it('describes PNG, JPEG, WebP and GIF storage', () => {
    expect(readFileInfo(tinyPng())).toEqual({ format: 'png', width: 1, height: 1, bitDepth: 8, colour: 'rgb', alpha: true, progressive: false, compression: 'lossless' });
    const sof = new Uint8Array([0xff, 0xc2, 0, 17, 8, 0, 12, 0, 16, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    expect(readFileInfo(jpeg([sof]))).toMatchObject({ format: 'jpeg', width: 16, height: 12, bitDepth: 8, colour: 'rgb', progressive: true, subsampling: '4:2:0', compression: 'lossy', alpha: false });
    expect(readFileInfo(withWebpMetadata(webpLossless(), { exif: cameraExif() }))).toMatchObject({ format: 'webp', compression: 'lossless', width: 1, height: 1 });
    const gif = concat([utf8('GIF89a'), new Uint8Array([4, 0, 3, 0, 0, 0, 0]), new Uint8Array([0x2c, 0, 0, 0, 0, 4, 0, 3, 0, 0, 2, 2, 0x44, 0x01, 0, 0x2c, 0, 0, 0, 0, 4, 0, 3, 0, 0, 2, 2, 0x44, 0x01, 0, 0x3b])]);
    expect(readFileInfo(gif)).toMatchObject({ format: 'gif', width: 4, height: 3, colour: 'indexed', frames: 2 });
  });
  it('reports APNG frames and PNG transparency chunks', () => {
    const png = tinyPng(), ihdrEnd = 8 + 25;
    const actl = chunk('acTL', new Uint8Array([0, 0, 0, 3, 0, 0, 0, 0]), 'png');
    expect(readFileInfo(concat([png.subarray(0, ihdrEnd), actl, png.subarray(ihdrEnd)])).frames).toBe(3);
    expect(PNG_SIGNATURE.length).toBe(8);
  });
});

it('mutated metadata either parses or throws a typed error', () => {
  let seed = 977; const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const cases: [Uint8Array, (b: Uint8Array) => unknown][] = [[cameraExif(), readExifEntries], [cameraExif(), b => editExifEntries(b, { set: { Artist: 'x' }, removeGps: true })], [lightroomXmp(), readXmpProperties], [photoshopApp13(), b => readIptc({ kind: 'iptc', data: b })]];
  for (const [fixture, parse] of cases) for (let n = 0; n < 300; n++) {
    const bytes = fixture.slice(); for (let i = 0; i < 1 + random() % 5; i++) bytes[random() % bytes.length] = random() & 255;
    try { parse(bytes); } catch (error) { expect(error).toBeInstanceOf(FileDataError); }
  }
});
