import { ascii, ensure, range, u16, u32 } from '../formats/bytes.js';

type Matrix = readonly number[];
export interface ToneCurve { decode(value:number):number; encode(value:number):number }
/** Matrix/TRC conversion, relative colourimetric via the ICC D50 PCS. No gamut clipping. */
export interface ColourTransform {
  /** Straight encoded source RGB to unclipped linear sRGB. */
  toLinear(r:number,g:number,b:number):number[];
  /** Linear sRGB to straight encoded destination RGB, bounded by the profile curves. */
  fromLinear(r:number,g:number,b:number):number[];
}
// IEC sRGB colourants, Bradford-adapted to the ICC D50 PCS (ICC RGB registry).
export const SRGB_D50 = [0.4360747,0.3850649,0.1430804,0.2225045,0.7168786,0.0606169,0.0139322,0.0971045,0.7141733] as const;
const multiply=(a:Matrix,b:Matrix)=>Array.from({length:9},(_,i)=>a[Math.floor(i/3)*3]!*b[i%3]!+a[Math.floor(i/3)*3+1]!*b[3+i%3]!+a[Math.floor(i/3)*3+2]!*b[6+i%3]!);
function inverse(m:Matrix) {
  const [a,b,c,d,e,f,g,h,i]=m as [number,number,number,number,number,number,number,number,number];
  const out=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const determinant=a*out[0]!+b*out[3]!+c*out[6]!;
  ensure(Number.isFinite(determinant)&&Math.abs(determinant)>1e-10,'Singular ICC matrix');
  return out.map(v=>v/determinant);
}
const apply=(m:Matrix,r:number,g:number,b:number)=>[m[0]!*r+m[1]!*g+m[2]!*b,m[3]!*r+m[4]!*g+m[5]!*b,m[6]!*r+m[7]!*g+m[8]!*b];
const fixed=(bytes:Uint8Array,at:number)=>{range(bytes,at,4);return new DataView(bytes.buffer,bytes.byteOffset+at,4).getInt32(0)/65536;};

/** ICC curveType and parametricCurveType (functions 0–4), including monotone sampled TRCs. */
export function readToneCurve(bytes:Uint8Array):ToneCurve {
  range(bytes,0,12); const type=ascii(bytes.subarray(0,4)); let decode:(x:number)=>number,encode:(x:number)=>number;
  if(type==='curv') {
    const n=u32(bytes,8);ensure(n<=65536);range(bytes,12,n*2);
    if(!n){decode=x=>x;encode=x=>x;}
    else if(n===1) {const gamma=u16(bytes,12)/256;ensure(gamma>0);decode=x=>x**gamma;encode=x=>x**(1/gamma);}
    else {
      const values=Array.from({length:n},(_,i)=>u16(bytes,12+i*2)/65535);
      ensure(values.every((v,i)=>!i||v>=values[i-1]!),'Non-monotone ICC curve');
      decode=x=>{const at=Math.max(0,Math.min(1,x))*(n-1),i=Math.min(n-2,Math.floor(at));return values[i]!+(values[i+1]!-values[i]!)*(at-i);};
      encode=value=>{let low=0,high=n-1;while(high-low>1){const mid=(low+high)>>>1;if(values[mid]!<value)low=mid;else high=mid;}const span=values[high]!-values[low]!;return (low+(span?(value-values[low]!)/span:0))/(n-1);};
    }
  } else {
    ensure(type==='para','Unsupported ICC curve');const kind=u16(bytes,8),counts=[1,3,4,5,7];ensure(kind<=4);range(bytes,12,counts[kind]!*4);
    const [gamma,a=1,b=0,c=0,d=0,e=0,f=0]=Array.from({length:counts[kind]!},(_,i)=>fixed(bytes,12+i*4));
    ensure(gamma!>0&&gamma!<=16&&a>0,'Invalid ICC curve parameters');
    decode=x=>kind===0?x**gamma!:kind===1?(x>=-b/a?Math.max(0,a*x+b)**gamma!:0):kind===2?(x>=-b/a?Math.max(0,a*x+b)**gamma!+c:c):kind===3?(x>=d?Math.max(0,a*x+b)**gamma!:c*x):(x>=d?Math.max(0,a*x+b)**gamma!+e:c*x+f);
    encode=y=>kind===0?y**(1/gamma!):kind===1?(y**(1/gamma!)-b)/a:kind===2?((y-c)**(1/gamma!)-b)/a:kind===3?(y>=decode(d)?(y**(1/gamma!)-b)/a:c>0?Math.min(d,y/c):d):(y>=decode(d)?((y-e)**(1/gamma!)-b)/a:c>0?Math.min(d,(y-f)/c):d);
  }
  let previous=-Infinity;
  for(let i=0;i<=1024;i++) {const value=decode(i/1024);ensure(Number.isFinite(value)&&value>=previous-0.0002,'Invalid ICC tone curve');previous=value;}
  ensure(decode(1)>decode(0),'Constant ICC tone curve');
  return {decode,encode(value) {
    if(value<=decode(0))return 0;if(value>=decode(1))return 1;
    return Math.max(0,Math.min(1,encode(value)));
  }};
}
export type ProfileFailure='lut'|'space'|'version'|'invalid';
export type ProfileConversion={transform:ColourTransform;reason?:never}|{transform:null;reason:ProfileFailure};
/** Bounded matrix/TRC RGB profiles only. A2B/B2A, device links, Lab and ICCmax fall back explicitly. */
export function profileConversion(bytes:Uint8Array):ProfileConversion {
  try {
    range(bytes,0,132);ensure(bytes.length<=16*1024*1024&&u32(bytes,0)===bytes.length&&ascii(bytes.subarray(36,40))==='acsp');
    if(bytes[8]!==2&&bytes[8]!==4)return {transform:null,reason:'version'};
    if(ascii(bytes.subarray(16,20))!=='RGB '||ascii(bytes.subarray(20,24))!=='XYZ '||!['scnr','mntr','prtr','spac'].includes(ascii(bytes.subarray(12,16))))return {transform:null,reason:'space'};
    const count=u32(bytes,128);ensure(count<=4096);range(bytes,132,count*12);const tags=new Map<string,Uint8Array>();
    for(let i=0;i<count;i++) {const at=132+i*12,key=ascii(bytes.subarray(at,at+4)),offset=u32(bytes,at+4),size=u32(bytes,at+8);range(bytes,offset,size);ensure(offset>=132+count*12&&!tags.has(key));tags.set(key,bytes.subarray(offset,offset+size));}
    if([...tags.keys()].some(key=>/^(?:A2B|B2A|D2B|B2D)/.test(key)))return {transform:null,reason:'lut'};
    const curves=['rTRC','gTRC','bTRC'].map(key=>readToneCurve(tags.get(key)??new Uint8Array()));
    const columns=['rXYZ','gXYZ','bXYZ'].map(key=>{const tag=tags.get(key)??new Uint8Array();range(tag,0,20);ensure(ascii(tag.subarray(0,4))==='XYZ ');return [fixed(tag,8),fixed(tag,12),fixed(tag,16)];});
    const matrix=Array.from({length:9},(_,i)=>columns[i%3]![Math.floor(i/3)]!);
    const forward=multiply(inverse(SRGB_D50),matrix),reverse=multiply(inverse(matrix),SRGB_D50);
    return {transform:{toLinear(r,g,b){return apply(forward,curves[0]!.decode(r),curves[1]!.decode(g),curves[2]!.decode(b));},fromLinear(r,g,b){return apply(reverse,r,g,b).map((v,i)=>curves[i]!.encode(Math.abs(v)<1e-12?0:v));}}};
  } catch {return {transform:null,reason:'invalid'};}
}
