import { bounded, ensure, range, u16, u32 } from './bytes.js';
/** RAW preview discovery scans opaque bytes. Bound repeated failed JPEG walks and metadata probes,
 * so many nested false signatures cannot turn a small container into quadratic work. */
export function checkRawScan(bytes:Uint8Array) {
  bounded(bytes);let work=0,candidates=0,metadata=0,probes=0;const budget=Math.max(1024*1024,bytes.length*4);
  const jpegRanges:[number,number][]=[];
  for(let start=0;start<bytes.length-3;start++) {
    if(bytes[start]===255&&bytes[start+1]===216&&bytes[start+2]===255) {
      ensure(++candidates<=4096,'Too many RAW JPEG candidates');let p=start+2,scan=false;
      while(p<bytes.length) {
        ensure(++work<=budget,'RAW preview scan exceeds work budget');
        if(scan){const before=p;while(p<bytes.length&&bytes[p]!==255)p++;work+=p-before;}
        if(p>=bytes.length||bytes[p++]!==255)break;while(bytes[p]===255)p++;
        const marker=bytes[p++];if(marker===0&&scan)continue;if(marker===0xd9){jpegRanges.push([start,p]);start=p-1;break;}
        if(marker===undefined||marker===0xd8)break;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
        if(p+2>bytes.length)break;const n=u16(bytes,p);if(n<2||p+n>bytes.length)break;p+=n;scan=marker===0xda;
      }
    }
  }
  let jpeg=0;
  for(let start=0;start<bytes.length-3;start++) {
    while(jpeg<jpegRanges.length&&start>=jpegRanges[jpeg]![1])jpeg++;
    const inJpeg=jpeg<jpegRanges.length&&start>=jpegRanges[jpeg]![0];
    const cmt=bytes[start]===67&&bytes[start+1]===77&&bytes[start+2]===84&&bytes[start+3]===49;
    const exif=bytes[start]===69&&bytes[start+1]===120&&bytes[start+2]===105&&bytes[start+3]===102&&bytes[start+4]===0&&bytes[start+5]===0;
    if(cmt||(exif&&!inJpeg)) {
      ensure(++probes<=128,'Too many RAW metadata candidates');let length=bytes.length-start;
      if(cmt&&start>=4){length=u32(bytes,start-4);range(bytes,start-4,length);ensure(length>=8,'Invalid RAW metadata box');}
      metadata+=length;ensure(metadata<=budget,'RAW metadata scan exceeds work budget');
    }
  }
  ensure(work<=budget,'RAW preview scan exceeds work budget');
}
