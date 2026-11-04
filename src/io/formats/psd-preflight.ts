import { ascii, bounded, ensure, MAX_METADATA_BYTES, range, u16, u32, view } from './bytes.js';
import { validateRaster } from './decoder.js';
/** Validate PSD counts, parent-relative section bounds and raster budgets before ag-psd parses it.
 * ag-psd additionally limits decoded bitmap memory and ZIP output to expected channel sizes. */
export function checkPsd(bytes:Uint8Array,limit:number) {
  bounded(bytes);range(bytes,0,26);ensure(ascii(bytes.subarray(0,4))==='8BPS'&&u16(bytes,4)===1,'Unsupported PSD header');
  const width=u32(bytes,18),height=u32(bytes,14);validateRaster({width,height},limit);ensure(width<=30000&&height<=30000,'Invalid PSD dimensions');
  const channels=u16(bytes,12),depth=u16(bytes,22);ensure(channels>=1&&channels<=57&&[1,8,16,32].includes(depth),'Invalid PSD channels/depth');
  let layers=0,channelTotal=0,pixels=width*height,metadata=0,blocks=0;
  const inside=(p:number,n:number,end:number)=>{ensure(p+n<=end,'PSD section exceeds parent bounds');range(bytes,p,n);};
  const section=(p:number,end:number)=>{inside(p,4,end);const n=u32(bytes,p);inside(p+4,n,end);return {start:p+4,end:p+4+n};};
  const box=(p:number,end:number)=> {
    inside(p,16,end);const top=view(bytes,p,4).getInt32(0),left=view(bytes,p+4,4).getInt32(0),bottom=view(bytes,p+8,4).getInt32(0),right=view(bytes,p+12,4).getInt32(0);
    const width=Math.max(0,right-left),height=Math.max(0,bottom-top);ensure(width<=30000&&height<=30000,'Invalid PSD layer size');
    if(width&&height){validateRaster({width,height},limit);pixels+=width*height;ensure(pixels<=limit*8,'PSD layers exceed pixel budget');}
  };
  function additional(start:number,end:number,nesting:number) {
    ensure(nesting<=8,'PSD layer nesting exceeds limit');
    for(let p=start;p<end;) {
      // PSD writers may pad the end of an extra-data section with zero bytes.
      if(bytes[p]===0){p++;continue;}
      inside(p,12,end);ensure(++blocks<=16384,'Too many PSD additional blocks');
      const sig=ascii(bytes.subarray(p,p+4)),key=ascii(bytes.subarray(p+4,p+8));ensure(sig==='8BIM'||sig==='8B64','Invalid PSD additional block');
      let header=12,n=u32(bytes,p+8);if(sig==='8B64'){ensure(n===0,'PSD block exceeds limit');inside(p,16,end);n=u32(bytes,p+12);header=16;}
      inside(p+header,n,end);
      if(['Layr','Lr16','Lr32'].includes(key))layerInfo(p+header,p+header+n,nesting+1);
      else {metadata+=n;ensure(metadata<=MAX_METADATA_BYTES,'PSD metadata exceeds allocation budget');}
      p+=header+n+(n%2);ensure(p<=end,'PSD block padding exceeds parent');
    }
  }
  function layerInfo(start:number,end:number,nesting:number) {
    if(start===end)return;inside(start,2,end);const count=Math.abs(view(bytes,start,2).getInt16(0));layers+=count;
    ensure(layers<=4096&&count<=Math.floor((end-start-2)/34),'Too many PSD layers');let p=start+2;const payloads:number[]=[];
    for(let i=0;i<count;i++) {
      box(p,end);inside(p+16,2,end);const n=u16(bytes,p+16);channelTotal+=n;
      ensure(n<=57&&channelTotal<=16384,'Too many PSD layer channels');inside(p+18,n*6+12,end);
      for(let c=0;c<n;c++){const length=u32(bytes,p+20+c*6);ensure(length!==1,'Invalid PSD channel length');payloads.push(length);}
      p+=18+n*6;ensure(ascii(bytes.subarray(p,p+4))==='8BIM','Invalid PSD blend signature');p+=12;
      const extra=section(p,end);p=extra.end;let q=extra.start;
      const mask=section(q,extra.end);if(mask.start<mask.end) {
        box(mask.start,mask.end);inside(mask.start,18,mask.end);
        // Real-mask rectangles follow the flags/default colour pair in ordinary extended masks.
        const remaining=mask.end-mask.start-18,flags=bytes[mask.start+17]!;
        if(remaining>=18&&!(flags&16))box(mask.start+20,mask.end);
      }
      q=mask.end;const blending=section(q,extra.end);metadata+=blending.end-blending.start;q=blending.end;
      inside(q,1,extra.end);const name=bytes[q]!+1;inside(q,name,extra.end);q+=name+(4-name%4)%4;
      ensure(q<=extra.end&&metadata<=MAX_METADATA_BYTES,'PSD metadata exceeds allocation budget');additional(q,extra.end,nesting);
    }
    for(const length of payloads){inside(p,length,end);if(length>=2)ensure(u16(bytes,p)<=3,'Invalid PSD compression');p+=length;}
  }
  let p=26;const colour=section(p,bytes.length);p=colour.end;const resources=section(p,bytes.length);ensure(resources.end-resources.start<=MAX_METADATA_BYTES,'PSD resources exceed limit');p=resources.end;
  const layerMask=section(p,bytes.length);p=layerMask.end;
  if(layerMask.start<layerMask.end) {
    const info=section(layerMask.start,layerMask.end);layerInfo(info.start,info.end,0);
    let q=info.end+((info.end-info.start)%2);if(q<layerMask.end){const global=section(q,layerMask.end);q=global.end;}additional(q,layerMask.end,0);
  }
  inside(p,2,bytes.length);const compression=u16(bytes,p);ensure(compression<=3,'Invalid PSD composite compression');
  const channelSize=Math.ceil(width*depth/8)*height;
  if(compression===0)inside(p+2,channelSize*channels,bytes.length);
  if(compression===1) {
    const count=height*channels;inside(p+2,count*2,bytes.length);let size=0;
    for(let i=0;i<count;i++)size+=u16(bytes,p+2+i*2);inside(p+2+count*2,size,bytes.length);
  }
}
