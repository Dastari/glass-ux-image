import { prepareImage } from './prepare.js';
import { createColourPyramid } from './colour/index.js';
import type { TileAddress } from "../core/pyramid.js";

export type WorkerRequest = { type: "open"; blob: Blob; maxPixels?:number } | { type: "tile"; id: number; tile: TileAddress };

/* Decoding and the pyramid are the slow parts of opening a photo, so neither runs on the page. */
let pyramid: ReturnType<typeof createColourPyramid> | undefined;

async function open(blob: Blob,maxPixels?:number) {
  const prepared=await prepareImage(blob,maxPixels);
  const bitmap = await createImageBitmap(prepared.decodeBlob,{imageOrientation:'from-image',colorSpaceConversion:'none'});
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  pyramid = createColourPyramid(context.getImageData(0, 0, width, height).data, { width, height },prepared.icc);
  return { width, height, metadata:prepared.metadata,icc:prepared.icc,frameCount:prepared.frameCount };
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if(data.type==='open') {
      self.postMessage({type:'opened',...(await open(data.blob,data.maxPixels))});
    } else {
      if(!pyramid)throw new Error('Image worker has not opened a source');
      // readTile returns a fresh allocation; the pyramid's backing levels are never transferred.
      const pixels=pyramid.readTile(data.tile);
      self.postMessage({type:'tile',id:data.id,pixels},{transfer:[pixels.data.buffer]});
    }
  } catch(error) {
    // An async event-handler rejection is not a Worker.onerror event in the parent. Reply for
    // tile/transfer failures as well as decode failures, so no client promise is left waiting.
    self.postMessage({type:'failed',id:data.type==='tile'?data.id:undefined,message:error instanceof Error?error.message:String(error)});
  }
};
