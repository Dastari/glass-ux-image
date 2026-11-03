import { describe, expect, it } from 'vitest';
import { FileDataError } from '../formats/bytes.js';
import { indexZip, readProject, readZip, writeProject, writeZip, ProjectVersionError, type ImageProject } from './index.js';
function project():ImageProject { return {manifest:{version:1,recipe:{geometry:{rotation:0},layers:[{id:'1',asset:'overlay'}],strokes:[]},source:{path:'blobs/source',mime:'image/png'},assets:{overlay:{path:'blobs/overlay',mime:'image/webp'}}},blobs:new Map([['blobs/source',new Uint8Array([0,255,1,8])],['blobs/overlay',new Uint8Array([4,3,2,1])]])}; }
describe('stored ZIP/project',()=> {
  it('round trips original source and every asset byte for byte, deterministically',()=> { const p=project(),bytes=writeProject(p),restored=readProject(bytes); expect(restored.manifest).toEqual(p.manifest); expect(restored.blobs).toEqual(p.blobs); expect(writeProject(restored)).toEqual(bytes); const index=indexZip(bytes); expect(index.map(r=>r.name)).toEqual(['manifest.json','blobs/overlay','blobs/source']); for(const r of index) expect(bytes.slice(r.offset,r.offset+r.length)).toEqual(readZip(bytes).find(e=>e.name===r.name)!.bytes); });
  it('rejects missing assets and preserves typed newer-version errors',()=> { const p=project(); p.blobs=new Map(); expect(()=>writeProject(p)).toThrow(FileDataError); const bytes=writeZip([{name:'manifest.json',bytes:new TextEncoder().encode('{"version":2}')}]); expect(()=>readProject(bytes)).toThrow(ProjectVersionError); });
  it('rejects path traversal, duplicates, CRC changes, compressed/encrypted archives',()=> { for(const name of ['../a','/abs','a/../../b','a\\b','a//b']) expect(()=>writeZip([{name,bytes:new Uint8Array()}])).toThrow(FileDataError); expect(()=>writeZip([{name:'a',bytes:new Uint8Array()},{name:'a',bytes:new Uint8Array()}])).toThrow(FileDataError); const b=writeProject(project()),index=indexZip(b); b[index[1]!.offset]=b[index[1]!.offset]!^1; expect(()=>readZip(b)).toThrow(FileDataError); for(const at of [6,8]) { const b=writeProject(project()); b[at]=1; expect(()=>readZip(b)).toThrow(FileDataError); } });
  it('rejects every truncated archive',()=> { const b=writeProject(project()); for(let i=0;i<b.length;i++) expect(()=>readProject(b.slice(0,i))).toThrow(FileDataError); });
  it('rejects excessive JSON nesting and non-JSON recipe data',()=> { const p=project(); let nested:unknown=0; for(let i=0;i<70;i++) nested=[nested]; p.manifest.recipe=nested as never; expect(()=>writeProject(p)).toThrow(FileDataError); p.manifest.recipe=Infinity; expect(()=>writeProject(p)).toThrow(FileDataError); });
});
it('mutated ZIP offsets, headers and manifest payloads fail with typed errors',()=> { const fixture=writeProject(project()); let seed=934; for(let n=0;n<500;n++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; const bytes=fixture.slice(); const at=seed%bytes.length; bytes[at]=bytes[at]!^((seed>>>24)||1); try { readProject(bytes); } catch(error) { expect(error).toBeInstanceOf(FileDataError); } } });
it('rejects excessive dimensions in untrusted project JSON before decoding assets',()=>{
  for(const geometry of [{resize:{width:100000,height:100000}},{crop:{x:0,y:0,width:100000,height:100000}},{canvas:{rect:{x:0,y:0,width:100000,height:100000},fill:null}}]){
    const p=project();(p.manifest.recipe as Record<string,unknown>).geometry=geometry;
    const bytes=writeZip([{name:'manifest.json',bytes:new TextEncoder().encode(JSON.stringify(p.manifest))},...[...p.blobs].map(([name,bytes])=>({name,bytes}))]);
    expect(()=>readProject(bytes)).toThrow(FileDataError);
  }
});
