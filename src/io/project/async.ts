import { FileDataError, MAX_FILE_BYTES } from '../formats/bytes.js';
import { ProjectVersionError, type ImageProject } from './index.js';
function request(message:object,signal?:AbortSignal):Promise<{bytes?:Uint8Array;project?:ImageProject}> {
  return new Promise((resolve,reject)=> {
    signal?.throwIfAborted();let worker:Worker;
    try {worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});}catch(cause){reject(new FileDataError('unsupported','Project workers are unavailable',{cause}));return;}
    const stop=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{stop();reject(signal?.reason);};signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=event=>{event.preventDefault();stop();reject(new FileDataError('invalid','Project worker failed'));};
    worker.onmessage=({data}:MessageEvent)=>{stop();if(data.error)reject(data.version?new ProjectVersionError(data.version):new FileDataError('invalid',data.error));else resolve(data);};
    try {worker.postMessage(message);}catch(cause){stop();reject(new FileDataError('invalid','Project cannot be cloned',{cause}));}
  });
}
/** Package a project off the frame thread, without writing or persisting it. */
export async function encodeProject(project:ImageProject,signal?:AbortSignal):Promise<Blob> {
  const result=await request({type:'write',project},signal);if(!result.bytes)throw new FileDataError('invalid','Project worker returned no bytes');return new Blob([result.bytes.slice()],{type:'application/x-guxi'});
}
/** Validate/unpack a complete project in a worker; the host separately chooses whether to open it. */
export async function decodeProject(blob:Blob,signal?:AbortSignal):Promise<ImageProject> {
  if(blob.size>MAX_FILE_BYTES)throw new FileDataError('limit','Project exceeds byte limit');const bytes=await blob.arrayBuffer();const result=await request({type:'read',bytes},signal);if(!result.project)throw new FileDataError('invalid','Project worker returned no data');return result.project;
}
