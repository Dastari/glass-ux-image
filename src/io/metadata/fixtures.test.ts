import { describe, expect, it } from 'vitest';
import { concat, utf8, FileDataError } from '../formats/bytes.js';
import { chunk, PNG_SIGNATURE } from '../formats/container.js';
import { editExif, orientationTransform, readExif, readMetadata, writeMetadata } from './index.js';
import { describeIcc, extractIcc, writeIcc } from './icc.js';
function tiff(gps=false) {
  const b=new Uint8Array(gps?112:26),v=new DataView(b.buffer); b.set(utf8('II')); v.setUint16(2,42,true); v.setUint32(4,8,true); v.setUint16(8,gps?2:1,true);
  v.setUint16(10,0x112,true); v.setUint16(12,3,true); v.setUint32(14,1,true); v.setUint16(18,6,true);
  if(gps) { v.setUint16(22,0x8825,true); v.setUint16(24,4,true); v.setUint32(26,1,true); v.setUint32(30,40,true); v.setUint16(40,1,true); v.setUint16(42,2,true); v.setUint16(44,5,true); v.setUint32(46,3,true); v.setUint32(50,64,true); for(let i=0;i<3;i++) { v.setUint32(64+i*8,30+i,true); v.setUint32(68+i*8,1,true); } }
  return b;
}
function png(extra:Uint8Array[]=[]) { const ihdr=new Uint8Array(13); ihdr[3]=ihdr[7]=1; ihdr[8]=8; ihdr[9]=6; return concat([PNG_SIGNATURE,chunk('IHDR',ihdr,'png'),...extra,chunk('IEND',new Uint8Array(),'png')]); }
function jpeg(extra:Uint8Array[]=[]) { return concat([new Uint8Array([255,216]),...extra,new Uint8Array([255,217])]); }
function webp() { const data=new Uint8Array([0x2f,0,0,0,0]); const body=chunk('VP8L',data,'webp'),h=new Uint8Array(12); h.set(utf8('RIFF')); new DataView(h.buffer).setUint32(4,body.length+4,true); h.set(utf8('WEBP'),8); return concat([h,body]); }
function profile(size=180) { const b=new Uint8Array(size),v=new DataView(b.buffer); v.setUint32(0,size); b.set(utf8('acsp'),36); v.setUint32(128,1); b.set(utf8('desc'),132); v.setUint32(136,144); v.setUint32(140,36); b.set(utf8('desc'),144); const name=utf8('Display P3\0'); v.setUint32(152,name.length); b.set(name,156); return b; }
describe('EXIF',()=> {
  it('reads orientation and GPS rationals; strips GPS bytes and normalises orientation',()=> { const b=tiff(true); expect(readExif(b).orientation).toBe(6); expect(readExif(b).gps?.latitude).toBeCloseTo(30+31/60+32/3600); const clean=editExif(b,{stripGps:true,normaliseOrientation:true}); expect(readExif(clean)).toEqual({orientation:1}); expect(clean.slice(40,88).every(v=>v===0)).toBe(true); expect(readExif(b).orientation).toBe(6); });
  it('handles both endian orders',()=> { const b=new Uint8Array(26),v=new DataView(b.buffer); b.set(utf8('MM')); v.setUint16(2,42); v.setUint32(4,8); v.setUint16(8,1); v.setUint16(10,0x112); v.setUint16(12,3); v.setUint32(14,1); v.setUint16(18,8); expect(readExif(b).orientation).toBe(8); });
  it('rejects cyclic IFD chains and bad rationals',()=> { const b=tiff(); new DataView(b.buffer).setUint32(22,8,true); expect(()=>readExif(b)).toThrow(FileDataError); const gps=tiff(true); gps.fill(0,68,72); expect(()=>readExif(gps)).toThrow(FileDataError); });
  it('maps all eight orientation cases',()=> { for(let i=1;i<=8;i++) { const t=orientationTransform(i,10,20); expect(t.matrix).toHaveLength(6); expect(t.width).toBe(i>=5?20:10); } expect(orientationTransform(6,10,20).matrix).toEqual([0,1,-1,0,20,0]); });
  it('rejects every truncated TIFF',()=> { const b=tiff(); for(let i=0;i<b.length;i++) expect(()=>readExif(b.slice(0,i))).toThrow(FileDataError); });
});
describe('metadata containers',()=> {
  const source=()=>jpeg([chunk('e1',concat([utf8('Exif\0\0'),tiff(true)]),'jpeg'),chunk('e1',concat([utf8('http://ns.adobe.com/xap/1.0/\0'),utf8('<tiff:Orientation>6</tiff:Orientation>')]),'jpeg'),chunk('ed',concat([utf8('Photoshop 3.0\0'+'8BIM'),new Uint8Array([4,4,0,0,0,0,0,4,0x1c,2,5,0])]),'jpeg')]);
  it('preserves original metadata in the same container',()=> { const m=readMetadata(source()); expect(m.presence).toEqual({exif:true,xmp:true,iptc:true}); const r=readMetadata(writeMetadata(jpeg(),m,{mode:'preserve'})); expect(r.packets).toEqual(m.packets); });
  for(const [name,build] of [['jpeg',jpeg],['png',png],['webp',webp]] as const) {
    it(`transfers EXIF to ${name} and fixes orientation`,()=> { const m=readMetadata(source()); m.packets=m.packets.filter(p=>p.kind==='exif'); const out=writeMetadata(build(),m,{mode:'preserve',pixelsOriented:true}); const result=readMetadata(out); expect(result.fields.orientation).toBe(1); expect(result.fields.gps).toBeDefined(); });
    it(`strips all metadata from ${name}`,()=> { const m=readMetadata(source()); m.packets=m.packets.filter(p=>p.kind==='exif'); const b=writeMetadata(build(),m,{mode:'strip-gps'}); expect(readMetadata(b).fields.gps).toBeUndefined(); expect(readMetadata(b).presence).toEqual({exif:true,xmp:false,iptc:false}); expect(readMetadata(writeMetadata(b,m,{mode:'strip'})).packets).toEqual([]); });
  }
  it('normalises XMP attribute and element orientation',()=> { const m=readMetadata(source()); m.packets=m.packets.filter(p=>p.kind==='xmp'); m.packets[0]!.data=utf8('<r tiff:Orientation="6"><tiff:Orientation>8</tiff:Orientation></r>'); expect(new TextDecoder().decode(readMetadata(writeMetadata(png(),m,{mode:'preserve',pixelsOriented:true})).packets[0]!.data)).toBe('<r tiff:Orientation="1"><tiff:Orientation>1</tiff:Orientation></r>'); });
  it('preserves PNG XMP and raw IPTC text exactly',()=> { const b=png([chunk('tEXt',utf8('Raw profile type iptc\0opaque'),'png'),chunk('iTXt',utf8('XML:com.adobe.xmp\0\0\0\0\0<rdf/>'),'png')]); const m=readMetadata(b); expect(m.presence.iptc&&m.presence.xmp).toBe(true); expect(readMetadata(writeMetadata(png(),m,{mode:'preserve'})).packets).toEqual(m.packets); });
  it('rejects cross-format IPTC instead of silently losing it',()=>expect(()=>writeMetadata(png(),readMetadata(source()),{mode:'preserve'})).toThrow(FileDataError));
  it('detects CRC corruption and truncated container lengths',()=> { const b=png(); b[20]=b[20]!^1; expect(()=>readMetadata(b)).toThrow(FileDataError); for(const b of [source(),png(),webp()]) for(let i=0;i<b.length;i++) expect(()=>readMetadata(b.slice(0,i))).toThrow(FileDataError); });
});
describe('ICC',()=> {
  for(const [name,build] of [['jpeg',jpeg],['png',png],['webp',webp]] as const) it(`extracts and re-embeds ${name} profile`,async()=> { const b=profile(); const encoded=await writeIcc(build(),b); expect((await extractIcc(encoded))?.bytes).toEqual(b); expect((await extractIcc(encoded))?.colourSpace).toBe('display-p3'); expect(await extractIcc(await writeIcc(encoded,null))).toBeNull(); });
  it('reassembles out-of-order JPEG segments and rejects duplicates',async()=> { const b=profile(70000); const encoded=await writeIcc(jpeg(),b); expect((await extractIcc(encoded))?.bytes).toEqual(b); const first=chunk('e2',concat([utf8('ICC_PROFILE\0'),new Uint8Array([1,2]),b.slice(0,100)]),'jpeg'); await expect(extractIcc(jpeg([first,first]))).rejects.toThrow(FileDataError); });
  it('rejects malicious tag bounds',()=> { const b=profile(); new DataView(b.buffer).setUint32(136,0xffffffff); expect(()=>describeIcc(b)).toThrow(FileDataError); });
  it('caps decompression output',async()=> { const b=png([chunk('iCCP',utf8('ICC\0\0bad'),'png')]); await expect(extractIcc(b,{inflate:async()=>new Uint8Array(16*1024*1024+1),deflate:async b=>b})).rejects.toThrow(FileDataError); });
});
it('mutated structured binary fixtures either parse or throw a typed error',()=> {
  let seed=431; const random=()=> { seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0; };
  const cases:[Uint8Array,(b:Uint8Array)=>unknown][]=[[tiff(true),readExif],[png([chunk('eXIf',tiff(),'png')]),readMetadata],[profile(),describeIcc]];
  for(const [fixture,parse] of cases) for(let n=0;n<300;n++) { const bytes=fixture.slice(); for(let i=0;i<1+random()%5;i++) bytes[random()%bytes.length]=random()&255; try { parse(bytes); } catch(error) { expect(error).toBeInstanceOf(FileDataError); } }
});
it('GPS-only keeps non-GPS XMP/IPTC and strips standard XMP GPS properties',()=> { const m=readMetadata(jpeg([chunk('e1',concat([utf8('Exif\0\0'),tiff(true)]),'jpeg'),chunk('e1',concat([utf8('http://ns.adobe.com/xap/1.0/\0'),utf8('<rdf x:GPSLatitude="12N" x:Model="Camera"><x:GPSLongitude>34E</x:GPSLongitude></rdf>')]),'jpeg')])); const out=readMetadata(writeMetadata(jpeg(),m,{mode:'strip-gps'})); expect(out.fields.gps).toBeUndefined(); const xmp=new TextDecoder().decode(out.packets.find(p=>p.kind==='xmp')!.data); expect(xmp).toContain('x:Model="Camera"'); expect(xmp).not.toContain('GPS'); });
