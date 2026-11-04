import { ensure, range, u16 } from './bytes.js';
/** Check PackBits before UTIF can run past the input or spend time on discarded output. */
export function checkPackBits(bytes:Uint8Array,size:number) {
  let p=0,out=0;
  while(p<bytes.length) {
    const control=bytes[p++]!;
    if(control===128)continue;
    const n=control<128?control+1:257-control,read=control<128?n:1;
    range(bytes,p,read);p+=read;out+=n;ensure(out<=size,'TIFF PackBits exceeds strip size');
  }
  ensure(out===size,'Truncated TIFF PackBits strip');
}
/** Bounded TIFF LZW, with early code-size changes. Invalid codes never form dictionary cycles. */
export function inflateTiffLzw(bytes:Uint8Array,size:number) {
  const out=new Uint8Array(size),prefix=new Uint16Array(4096),suffix=new Uint8Array(4096),stack=new Uint8Array(4096);
  let bit=0,width=9,next=258,previous=-1,p=0,ended=false;
  while(bit+width<=bytes.length*8) {
    let code=0;for(let i=0;i<width;i++,bit++)code=(code<<1)|((bytes[bit>>>3]!>>>(7-(bit&7)))&1);
    if(code===256){width=9;next=258;previous=-1;continue;}
    if(code===257){ended=true;break;}
    ensure(code<next||(code===next&&previous>=0),'Invalid TIFF LZW code');
    const original=code;let n=0;
    if(code===next){stack[n++]=0;code=previous;}
    while(code>=258){ensure(code<next&&n<4095,'Invalid TIFF LZW dictionary');stack[n++]=suffix[code]!;code=prefix[code]!;}
    ensure(code<256,'Invalid TIFF LZW code');const first=code;stack[n++]=first;
    if(original===next)stack[0]=first;
    ensure(p+n<=size,'TIFF LZW exceeds strip size');while(n)out[p++]=stack[--n]!;
    if(previous>=0&&next<4096){prefix[next]=previous;suffix[next++]=first;if(next===(1<<width)-1&&width<12)width++;}
    previous=original;
  }
  ensure(ended&&p===size,'Truncated TIFF LZW strip');return out;
}
/** JPEG's own SOF and DNL, rather than TIFF dimensions, control its internal allocations.
 * Walk entropy markers too: UTIF handles DNL by recursively decoding with a new height. */
export function checkTiffJpeg(bytes:Uint8Array,width:number,height:number,tables=false) {
  ensure(u16(bytes,0)===0xffd8,'Invalid TIFF JPEG header');let p=2,found=false,entropy=false,markers=0,finished=false,channels=0;
  while(p<bytes.length) {
    if(entropy){while(p<bytes.length&&bytes[p]!==255)p++;}
    ensure(bytes[p++]===255,'Invalid TIFF JPEG marker');while(bytes[p]===255)p++;
    range(bytes,p,1);const marker=bytes[p++]!;
    if(entropy&&(marker===0||(marker>=0xd0&&marker<=0xd7)))continue;
    entropy=false;ensure(++markers<=65536,'Too many TIFF JPEG markers');if(marker===0xd9){finished=true;break;}
    const n=u16(bytes,p);ensure(n>=2);range(bytes,p,n);
    if(tables)ensure([0xc4,0xdb,0xdd].includes(marker),'Invalid TIFF JPEG tables');
    else if([0xc0,0xc1,0xc2].includes(marker)) {
      ensure(!found&&n>=8&&bytes[p+2]===8,'Unsupported TIFF JPEG frame');
      ensure(u16(bytes,p+3)===height&&u16(bytes,p+5)===width,'TIFF JPEG dimensions disagree');
      channels=bytes[p+7]!;ensure(channels>=1&&channels<=3&&n===8+channels*3,'Unsupported TIFF JPEG channels');
      let maxH=0,maxV=0;const sampling:number[]=[];
      for(let c=0;c<channels;c++) {
        const s=bytes[p+9+c*3]!;ensure((s>>>4)>=1&&(s>>>4)<=4&&(s&15)>=1&&(s&15)<=4,'Invalid TIFF JPEG sampling');sampling.push(s);maxH=Math.max(maxH,s>>>4);maxV=Math.max(maxV,s&15);
      }
      const mcusX=Math.ceil(width/(8*maxH)),mcusY=Math.ceil(height/(8*maxV));
      const allocation=sampling.reduce((sum,s)=>sum+128*mcusY*(s&15)*(mcusX*(s>>>4)+1),0)+width*height*channels;
      ensure(allocation<=512*1024*1024,'TIFF JPEG exceeds allocation budget');found=true;
    } else ensure(![0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf,0xdc].includes(marker),'Unsupported TIFF JPEG frame');
    if(marker===0xda){ensure(found,'Missing TIFF JPEG frame');ensure(n>=6&&bytes[p+2]!<=channels&&n===6+bytes[p+2]!*2,'Invalid TIFF JPEG scan');entropy=true;}
    p+=n;
  }
  ensure(finished&&(tables||found),'Incomplete TIFF JPEG stream');
}
