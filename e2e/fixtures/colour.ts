// Original, generated test data. No third-party profiles or image fixtures.
import { concat, utf8 } from '../../src/io/formats/bytes.js';
export const word=(n:number)=>{const bytes=new Uint8Array(4);new DataView(bytes.buffer).setUint32(0,n);return bytes;};
const fixed=(n:number)=>word(Math.round(n*65536));
export const parametric=(kind:number,params:number[])=>concat([utf8('para'),word(0),new Uint8Array([0,kind,0,0]),...params.map(fixed)]);
export function sampled(gamma:number,count=4097) {const bytes=new Uint8Array(12+count*2),v=new DataView(bytes.buffer);bytes.set(utf8('curv'));v.setUint32(8,count);for(let i=0;i<count;i++)v.setUint16(12+i*2,Math.round((i/(count-1))**gamma*65535));return bytes;}
export const srgbCurve=()=>parametric(4,[2.4,1/1.055,.055/1.055,1/12.92,.04045,0,0]);
export const matrices={
  srgb:[.4360747,.3850649,.1430804,.2225045,.7168786,.0606169,.0139322,.0971045,.7141733],
  p3:[.515102,.291965,.157153,.241182,.692236,.0665819,-.00104941,.0418818,.784378],
  adobe:[.6097559,.2052401,.149224,.3111242,.625656,.0632197,.0194811,.0608902,.7448387],
  prophoto:[.7976749,.1351917,.0313534,.2880402,.7118741,.0000857,0,0,.82521]
};
export function generatedProfile(matrix=matrices.p3,curve=srgbCurve(),version=4,extra:[string,Uint8Array][]=[]):Uint8Array {
  const desc=utf8('Generated colour fixture\0'),description=concat([utf8('desc'),word(0),word(desc.length),desc,new Uint8Array(80)]);
  const tags:[string,Uint8Array][]=[['desc',description],...['r','g','b'].map((key,i):[string,Uint8Array]=>[key+'XYZ',concat([utf8('XYZ '),word(0),fixed(matrix[i]!),fixed(matrix[3+i]!),fixed(matrix[6+i]!)])]),...['r','g','b'].map((key):[string,Uint8Array]=>[key+'TRC',curve]),...extra];
  let offset=132+tags.length*12;const table:Uint8Array[]=[],data:Uint8Array[]=[];
  for(const [key,value] of tags){table.push(concat([utf8(key),word(offset),word(value.length)]));const padded=new Uint8Array(Math.ceil(value.length/4)*4);padded.set(value);data.push(padded);offset+=padded.length;}
  const header=new Uint8Array(128),view=new DataView(header.buffer);view.setUint32(0,offset);header[8]=version;header.set(utf8('mntrRGB XYZ '),12);header.set(utf8('acsp'),36);view.setUint32(68,Math.round(.9642*65536));view.setUint32(72,65536);view.setUint32(76,Math.round(.8249*65536));
  return concat([header,word(tags.length),...table,...data]);
}
