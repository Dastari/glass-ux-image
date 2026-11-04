/**
 * Structured metadata fixtures, built byte by byte the way cameras and Adobe applications write them:
 * a camera EXIF block with a maker note, a thumbnail and GPS; a Lightroom-style XMP packet; and a
 * Photoshop IPTC block. No dependencies, so unit tests (Node) and browser tests share it.
 */
const enc = new TextEncoder();
const concat = (parts: readonly Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };

type Value = { type: 2; text: string } | { type: 3 | 4; values: number[] } | { type: 5 | 10; values: [number, number][] } | { type: 1 | 7; bytes: Uint8Array };
interface Field { tag: number; value: Value }
const ascii = (text: string): Value => ({ type: 2, text });
const short = (...values: number[]): Value => ({ type: 3, values });
const long = (...values: number[]): Value => ({ type: 4, values });
const rational = (...values: [number, number][]): Value => ({ type: 5, values });
const srational = (...values: [number, number][]): Value => ({ type: 10, values });
const undefinedBytes = (bytes: Uint8Array): Value => ({ type: 7, bytes });
const byte = (...values: number[]): Value => ({ type: 1, bytes: new Uint8Array(values) });

/** A TIFF payload laid out as cameras do: IFD0, the EXIF IFD, interop, GPS, then IFD1 with a thumbnail. */
export function tiffPayload(spec: { ifd0: Field[]; exif?: Field[]; gps?: Field[]; interop?: Field[]; thumbnail?: Uint8Array; makerNoteSelfOffset?: boolean }, littleEndian = true): Uint8Array {
  const le = littleEndian; let length = 8;
  const reserve = (n: number) => { const at = length; length += n + (n % 2); return at; };
  const sizeOf = (v: Value) => 'text' in v ? enc.encode(v.text).length + 1 : 'bytes' in v ? v.bytes.length : v.values.length * (v.type === 3 ? 2 : v.type === 4 ? 4 : 8);
  const out = new Uint8Array(1 << 16), view = new DataView(out.buffer);
  out.set(enc.encode(le ? 'II' : 'MM')); view.setUint16(2, 42, le); view.setUint32(4, 8, le);
  const writeValue = (at: number, v: Value) => {
    if (v.type === 2) out.set(enc.encode(v.text), at);
    else if ('bytes' in v) out.set(v.bytes, at);
    else if (v.type === 3 || v.type === 4) (v.values as number[]).forEach((n, i) => v.type === 3 ? view.setUint16(at + i * 2, n, le) : view.setUint32(at + i * 4, n, le));
    else (v.values as [number, number][]).forEach(([a, b], i) => { if (v.type === 5) { view.setUint32(at + i * 8, a, le); view.setUint32(at + i * 8 + 4, b, le); } else { view.setInt32(at + i * 8, a, le); view.setInt32(at + i * 8 + 4, b, le); } });
  };
  const count = (v: Value) => 'text' in v ? enc.encode(v.text).length + 1 : 'bytes' in v ? v.bytes.length : v.values.length;
  const directory = (fields: Field[], pointers: { tag: number; target: () => number }[], next: () => number) => {
    const all = [...fields.map(f => ({ ...f, pointer: undefined as undefined | (() => number) })), ...pointers.map(p => ({ tag: p.tag, value: long(0), pointer: p.target as undefined | (() => number) }))].sort((a, b) => a.tag - b.tag);
    const at = reserve(2 + all.length * 12 + 4);
    return { at, finish: () => {
      view.setUint16(at, all.length, le);
      all.forEach((f, i) => {
        const e = at + 2 + i * 12, size = sizeOf(f.value);
        view.setUint16(e, f.tag, le); view.setUint16(e + 2, f.value.type, le); view.setUint32(e + 4, count(f.value), le);
        if (f.pointer) { view.setUint32(e + 8, f.pointer(), le); return; }
        if (size <= 4) writeValue(e + 8, f.value);
        else { const data = reserve(size); writeValue(data, f.value); view.setUint32(e + 8, data, le); if (f.tag === 0x927c) makerNote = data; }
      });
      view.setUint32(at + 2 + all.length * 12, next(), le);
    } };
  };
  let makerNote = 0, exifAt = 0, gpsAt = 0, interopAt = 0, ifd1At = 0, thumbAt = 0;
  const pointers0 = [...(spec.exif ? [{ tag: 0x8769, target: () => exifAt }] : []), ...(spec.gps ? [{ tag: 0x8825, target: () => gpsAt }] : [])];
  // Reserve every directory first, so each pointer's target is known before any entry is written.
  const ifd0 = directory(spec.ifd0, pointers0, () => ifd1At);
  const exifDir = spec.exif ? directory(spec.exif, spec.interop ? [{ tag: 0xa005, target: () => interopAt }] : [], () => 0) : undefined;
  const interopDir = spec.interop ? directory(spec.interop, [], () => 0) : undefined;
  const gpsDir = spec.gps ? directory(spec.gps, [], () => 0) : undefined;
  const thumb = spec.thumbnail;
  const ifd1 = thumb ? directory([{ tag: 0x0103, value: short(6) }, { tag: 0x011a, value: rational([72, 1]) }, { tag: 0x011b, value: rational([72, 1]) }, { tag: 0x0128, value: short(2) }, { tag: 0x0202, value: long(thumb.length) }], [{ tag: 0x0201, target: () => thumbAt }], () => 0) : undefined;
  exifAt = exifDir?.at ?? 0; interopAt = interopDir?.at ?? 0; gpsAt = gpsDir?.at ?? 0; ifd1At = ifd1?.at ?? 0;
  if (thumb) { thumbAt = reserve(thumb.length); out.set(thumb, thumbAt); }
  for (const d of [ifd0, exifDir, interopDir, gpsDir, ifd1]) d?.finish();
  // Canon-style maker notes hold offsets relative to the TIFF header, so moving them breaks them.
  if (spec.makerNoteSelfOffset && makerNote) view.setUint32(makerNote + 4, makerNote, le);
  return out.slice(0, length);
}
/** A small baseline JPEG thumbnail stand-in: SOI, a comment and EOI. */
const thumbnailBytes = () => concat([new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0, 6]), enc.encode('thumb'.slice(0, 4)), new Uint8Array([0xff, 0xd9])]);

/** A camera's EXIF: make, model, exposure, lens, dates with offsets, a maker note, GPS in the Southern Hemisphere and a thumbnail. */
export function cameraExif(options: { orientation?: number; gps?: boolean; littleEndian?: boolean } = {}): Uint8Array {
  const makerNote = new Uint8Array(32); makerNote.set(enc.encode('MKNT'));
  return tiffPayload({
    ifd0: [
      { tag: 0x010e, value: ascii('Harbour at dawn') }, { tag: 0x010f, value: ascii('Canon') }, { tag: 0x0110, value: ascii('Canon EOS R5') },
      { tag: 0x0112, value: short(options.orientation ?? 1) }, { tag: 0x011a, value: rational([300, 1]) }, { tag: 0x011b, value: rational([300, 1]) },
      { tag: 0x0128, value: short(2) }, { tag: 0x0131, value: ascii('Adobe Lightroom Classic 13.0 (Macintosh)') }, { tag: 0x0132, value: ascii('2026:10:30 08:15:00') },
      { tag: 0x013b, value: ascii('Alex Rivera') }, { tag: 0x8298, value: ascii('© 2026 Alex Rivera') },
    ],
    exif: [
      { tag: 0x829a, value: rational([1, 250]) }, { tag: 0x829d, value: rational([56, 10]) }, { tag: 0x8822, value: short(3) }, { tag: 0x8827, value: short(400) },
      { tag: 0x9000, value: undefinedBytes(enc.encode('0232')) }, { tag: 0x9003, value: ascii('2026:10:29 06:42:13') }, { tag: 0x9004, value: ascii('2026:10:29 06:42:13') },
      { tag: 0x9011, value: ascii('+11:00') }, { tag: 0x9204, value: srational([-1, 3]) }, { tag: 0x9205, value: rational([4, 1]) }, { tag: 0x9207, value: short(5) },
      { tag: 0x9209, value: short(16) }, { tag: 0x920a, value: rational([50, 1]) }, { tag: 0x927c, value: undefinedBytes(makerNote) },
      { tag: 0x9286, value: undefinedBytes(concat([enc.encode('ASCII\0\0\0'), enc.encode('Shot from the ferry')])) }, { tag: 0xa001, value: short(1) },
      { tag: 0xa002, value: long(8192) }, { tag: 0xa003, value: long(5464) }, { tag: 0xa402, value: short(0) }, { tag: 0xa403, value: short(0) },
      { tag: 0xa405, value: short(50) }, { tag: 0xa406, value: short(0) }, { tag: 0xa431, value: ascii('012345678901') },
      { tag: 0xa432, value: rational([24, 1], [105, 1], [4, 1], [4, 1]) }, { tag: 0xa433, value: ascii('Canon') }, { tag: 0xa434, value: ascii('RF24-105mm F4 L IS USM') },
    ],
    interop: [{ tag: 0x0001, value: ascii('R98') }, { tag: 0x0002, value: undefinedBytes(enc.encode('0100')) }],
    ...(options.gps === false ? {} : { gps: [
      { tag: 0x0000, value: byte(2, 3, 0, 0) }, { tag: 0x0001, value: ascii('S') }, { tag: 0x0002, value: rational([33, 1], [51, 1], [3108, 100]) },
      { tag: 0x0003, value: ascii('E') }, { tag: 0x0004, value: rational([151, 1], [12, 1], [3348, 100]) }, { tag: 0x0005, value: byte(0) },
      { tag: 0x0006, value: rational([125, 10]) }, { tag: 0x0007, value: rational([19, 1], [42, 1], [13, 1]) }, { tag: 0x001d, value: ascii('2026:10:28') },
    ] }),
    thumbnail: thumbnailBytes(),
    makerNoteSelfOffset: true,
  }, options.littleEndian ?? true);
}
/** Lightroom-style XMP: language alternatives, ordered and unordered arrays, attribute properties, a structure and GPS. */
export function lightroomXmp(): Uint8Array {
  return enc.encode(`<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
    xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/"
    xmlns:exif="http://ns.adobe.com/exif/1.0/"
    xmp:Rating="4" xmp:CreatorTool="Adobe Lightroom Classic 13.0 (Macintosh)" photoshop:City="Sydney" photoshop:Country="Australia"
    exif:GPSLatitude="33,51.518S" exif:GPSLongitude="151,12.558E">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Harbour at dawn</rdf:li></rdf:Alt></dc:title>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">Ferries crossing &amp; gulls</rdf:li></rdf:Alt></dc:description>
   <dc:creator><rdf:Seq><rdf:li>Alex Rivera</rdf:li></rdf:Seq></dc:creator>
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© 2026 Alex Rivera</rdf:li></rdf:Alt></dc:rights>
   <dc:subject><rdf:Bag><rdf:li>harbour</rdf:li><rdf:li>dawn</rdf:li><rdf:li>ferry</rdf:li></rdf:Bag></dc:subject>
   <Iptc4xmpCore:CreatorContactInfo Iptc4xmpCore:CiEmailWork="alex@example.com" Iptc4xmpCore:CiUrlWork="https://example.com"/>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`);
}
const iim = (record: number, dataset: number, value: Uint8Array | string) => { const data = typeof value === 'string' ? enc.encode(value) : value; return concat([new Uint8Array([0x1c, record, dataset, data.length >> 8, data.length & 255]), data]); };
/** IPTC IIM datasets as Photoshop writes them, declaring UTF-8. */
export function photoshopIim(): Uint8Array {
  return concat([iim(1, 90, new Uint8Array([0x1b, 0x25, 0x47])), iim(2, 0, new Uint8Array([0, 4])), iim(2, 5, 'Harbour at dawn'), iim(2, 25, 'harbour'), iim(2, 25, 'dawn'), iim(2, 25, 'ferry'), iim(2, 80, 'Alex Rivera'), iim(2, 90, 'Sydney'), iim(2, 101, 'Australia'), iim(2, 116, '© 2026 Alex Rivera'), iim(2, 120, 'Ferries crossing & gulls')]);
}
/** The JPEG APP13 body: `Photoshop 3.0`, a resolution resource that must survive, then the IPTC resource. */
export function photoshopApp13(): Uint8Array {
  const resource = (id: number, data: Uint8Array) => { const head = new Uint8Array(12); head.set(enc.encode('8BIM')); new DataView(head.buffer).setUint16(4, id); new DataView(head.buffer).setUint32(8, data.length); return concat([head, data, data.length % 2 ? new Uint8Array(1) : new Uint8Array()]); };
  return concat([enc.encode('Photoshop 3.0\0'), resource(0x03ed, new Uint8Array(16).fill(1)), resource(0x0404, photoshopIim())]);
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (type: string, data: Uint8Array) => { const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer); v.setUint32(0, data.length); out.set(enc.encode(type), 4); out.set(data, 8); v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length))); return out; };
const jpegSegment = (marker: number, data: Uint8Array) => { const head = new Uint8Array([0xff, marker, 0, 0]); new DataView(head.buffer).setUint16(2, data.length + 2); return concat([head, data]); };
const riff = (type: string, data: Uint8Array) => { const head = new Uint8Array(8); head.set(enc.encode(type)); new DataView(head.buffer).setUint32(4, data.length, true); return concat([head, data, data.length % 2 ? new Uint8Array(1) : new Uint8Array()]); };

export interface Packets { exif?: Uint8Array; xmp?: Uint8Array; iptc?: boolean }
/** Insert packets after a JPEG's SOI, as cameras and Photoshop place them. */
export function withJpegMetadata(jpeg: Uint8Array, packets: Packets): Uint8Array {
  return concat([jpeg.subarray(0, 2), ...(packets.exif ? [jpegSegment(0xe1, concat([enc.encode('Exif\0\0'), packets.exif]))] : []), ...(packets.xmp ? [jpegSegment(0xe1, concat([enc.encode('http://ns.adobe.com/xap/1.0/\0'), packets.xmp]))] : []), ...(packets.iptc ? [jpegSegment(0xed, photoshopApp13())] : []), jpeg.subarray(2)]);
}
/** Insert eXIf, iTXt XMP and ImageMagick's hex IPTC text after a PNG's IHDR. */
export function withPngMetadata(png: Uint8Array, packets: Packets): Uint8Array {
  const ihdrEnd = 8 + 12 + new DataView(png.buffer, png.byteOffset).getUint32(8);
  const hex = Array.from(photoshopIim(), b => b.toString(16).padStart(2, '0')).join('').replace(/(.{72})/g, '$1\n');
  return concat([png.subarray(0, ihdrEnd), ...(packets.exif ? [pngChunk('eXIf', packets.exif)] : []), ...(packets.xmp ? [pngChunk('iTXt', concat([enc.encode('XML:com.adobe.xmp\0\0\0\0\0'), packets.xmp]))] : []), ...(packets.iptc ? [pngChunk('tEXt', enc.encode(`Raw profile type iptc\0\niptc\n${String(photoshopIim().length).padStart(8)}\n${hex}\n`))] : []), png.subarray(ihdrEnd)]);
}
/** Add EXIF and XMP to a simple lossy or lossless WebP, converting it to the extended layout they need. */
export function withWebpMetadata(webp: Uint8Array, packets: Packets): Uint8Array {
  const view = new DataView(webp.buffer, webp.byteOffset), chunks: Uint8Array[] = []; let width = 0, height = 0, alpha = false;
  for (let p = 12; p < webp.length;) {
    const type = new TextDecoder().decode(webp.subarray(p, p + 4)), n = view.getUint32(p + 4, true), body = webp.subarray(p + 8, p + 8 + n);
    if (type === 'VP8 ') { width = new DataView(body.buffer, body.byteOffset).getUint16(6, true) & 16383; height = new DataView(body.buffer, body.byteOffset).getUint16(8, true) & 16383; }
    if (type === 'VP8L') { const bits = new DataView(body.buffer, body.byteOffset).getUint32(1, true); width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1; alpha = !!(bits & 0x10000000); }
    if (type !== 'VP8X') chunks.push(riff(type, body));
    p += 8 + n + (n % 2);
  }
  const x = new Uint8Array(10); x[0] = (alpha ? 0x10 : 0) | (packets.exif ? 8 : 0) | (packets.xmp ? 4 : 0);
  for (let i = 0; i < 3; i++) { x[4 + i] = ((width - 1) >>> (8 * i)) & 255; x[7 + i] = ((height - 1) >>> (8 * i)) & 255; }
  const body = concat([enc.encode('WEBP'), riff('VP8X', x), ...chunks, ...(packets.exif ? [riff('EXIF', packets.exif)] : []), ...(packets.xmp ? [riff('XMP ', packets.xmp)] : [])]);
  return concat([enc.encode('RIFF'), (() => { const n = new Uint8Array(4); new DataView(n.buffer).setUint32(0, body.length, true); return n; })(), body]);
}
/** A tiny valid PNG (1×1, RGBA) for Node-only tests; browser tests use real encoder output. */
export function tinyPng(): Uint8Array {
  const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer); v.setUint32(0, 1); v.setUint32(4, 1); ihdr[8] = 8; ihdr[9] = 6;
  // Deflate stored block of one scanline: filter byte and four samples.
  const idat = new Uint8Array([0x78, 0x01, 0x01, 0x05, 0x00, 0xfa, 0xff, 0, 255, 0, 0, 255, 0x04, 0x00, 0x01, 0xff]);
  return concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array())]);
}
