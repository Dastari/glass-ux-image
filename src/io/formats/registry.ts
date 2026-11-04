import { sniffFormat, type ImportFormat } from './index.js';
import { bounded } from './bytes.js';
import { pixelLimit, type DecodedFormat, type FormatDecodeOptions } from './decoder.js';
/** A distinct lazy boundary for every advanced format. No codec is imported by the kits eagerly. */
export async function decodeFormat(blob:Blob,format:ImportFormat,options:FormatDecodeOptions={}):Promise<DecodedFormat> {
  options.signal?.throwIfAborted();const max=pixelLimit(options.maxPixels);
  if(format==='heif')return (await import('../../codecs/heif.js')).decodeHeif(blob,options);
  const bytes=bounded(new Uint8Array(await blob.arrayBuffer()));options.signal?.throwIfAborted();
  if(format==='tiff')return (await import('../../codecs/tiff.js')).decodeTiff(bytes,max);
  if(format==='psd')return (await import('../../codecs/psd.js')).decodePsd(bytes,max);
  if(format==='raw') {const {jpeg}=(await import('../../codecs/raw.js')).extractRawPreview(bytes,max);return {width:1,height:1,rgba:new Uint8Array(),preview:jpeg,importInfo:{kind:'raw-preview'}};}
  throw new Error(`No advanced decoder for ${sniffFormat(bytes)}`);
}
