import { readProject, writeProject } from './index.js';
self.onmessage=({data}:MessageEvent)=> {
  try {if(data.type==='write') {const bytes=writeProject(data.project);self.postMessage({bytes},[bytes.buffer]);}else self.postMessage({project:readProject(new Uint8Array(data.bytes))});}
  catch(error) {self.postMessage({error:error instanceof Error?error.message:String(error),version:(error as {version?:number}).version});}
};
