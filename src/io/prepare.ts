import { bounded, ensure, MAX_FILE_BYTES } from './formats/bytes.js';
import { sniffFormat, gifFrameCount, rasteriseSvg, SVG_MAX_BYTES } from './formats/index.js';
import { checkImageDimensions } from './formats/dimensions.js';
import { browserSvgBoundary } from './formats/browser.js';
import { readMetadata } from './metadata/index.js';
import { extractIcc, writeIcc } from './metadata/icc.js';
import { assemble, chunks } from './formats/container.js';
/** Validated original source and a safe blob for native decoding. Never persists either. */
export async function prepareImage(blob:Blob,maxPixels=64*1024*1024) {
  ensure(blob.size<=MAX_FILE_BYTES,'Image exceeds byte limit'); const bytes=bounded(new Uint8Array(await blob.arrayBuffer())); const format=sniffFormat(bytes);
  const size=checkImageDimensions(bytes,maxPixels);
  const metadata=format==='jpeg'||format==='png'||format==='webp'?readMetadata(bytes):undefined;
  const icc=metadata?await extractIcc(bytes):null;
  let decodeBlob=blob;
  // Native colour management can clamp to sRGB before we see the samples. Strip the profile
  // only from the decoder copy; custom matrix/TRC conversion runs before pyramid downsampling.
  if(icc) {
    let unlabelled=await writeIcc(bytes,null);
    if(format==='png')unlabelled=assemble(unlabelled,chunks(unlabelled,'png').filter(c=>!['sRGB','gAMA','cHRM','cICP'].includes(c.type)).map(c=>c.raw),'png');
    decodeBlob=new Blob([unlabelled.slice()],{type:blob.type});
  }
  if(format==='svg') {
    bounded(bytes,SVG_MAX_BYTES);
    // SVG is parsed only by the strict browser boundary, with no network-capable elements.
    const boundary=browserSvgBoundary(),text=boundary.sanitise(new TextDecoder().decode(bytes));
    const root=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
    const view=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    const width=Number(root.getAttribute('width'))||view?.[2]||300,height=Number(root.getAttribute('height'))||view?.[3]||150;
    ensure(width*height<=maxPixels,'SVG exceeds pixel limit');
    decodeBlob=await rasteriseSvg(bytes,Math.ceil(width),Math.ceil(height),boundary);
  }
  return {originalBlob:blob,decodeBlob,format,frameCount:format==='gif'?gifFrameCount(bytes):1,metadata,icc,size};
}
