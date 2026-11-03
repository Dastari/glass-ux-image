import { expect, it } from 'vitest';
import { runBatch } from './index.js';
import { FileDataError } from '../formats/bytes.js';
it('limits concurrency, keeps ordered results and continues past a failed file',async()=> {
  let active=0,peak=0; const progress:number[]=[];
  const results=await runBatch([0,1,2,3,4],{concurrency:2,settings:{quality:0.8},renderOne:async n=> { active++; peak=Math.max(peak,active); await new Promise(resolve=>setTimeout(resolve,2)); active--; if(n===1) throw new Error('bad source'); return n*2; },onProgress:p=>progress.push(p.completed)});
  expect(peak).toBe(2); expect(progress).toEqual([1,2,3,4,5]); expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected','fulfilled','fulfilled','fulfilled']); expect(results[4]).toEqual({index:4,status:'fulfilled',value:8});
});
it('does not start pending sources after an abort and supplies a signal to active work',async()=> { const controller=new AbortController(),started:number[]=[]; const results=await runBatch([0,1,2],{concurrency:1,signal:controller.signal,settings:{},renderOne:async(n,_settings,context)=> { expect(context.signal).toBe(controller.signal); started.push(n); controller.abort('stop'); return n; }}); expect(started).toEqual([0]); expect(results.every(r=>r.status==='aborted')).toBe(true); });
it('isolates settings and observer failures',async()=> { const errors:unknown[]=[]; const results=await runBatch([1,2],{concurrency:1,settings:{quality:1},renderOne:async(_n,s)=> { const q=s.quality; s.quality=0; return q; },onProgress:()=> { throw new Error('observer'); },onObserverError:e=>errors.push(e)}); expect(results.map(r=>r.status==='fulfilled'&&r.value)).toEqual([1,1]); expect(errors).toHaveLength(2); });
it('validates limits and accepts empty input',async()=> { await expect(runBatch([],{settings:{},renderOne:async()=>0})).resolves.toEqual([]); await expect(runBatch([0],{concurrency:0,settings:{},renderOne:async()=>0})).rejects.toThrow(FileDataError); await expect(runBatch([0],{settings:{quality:2},renderOne:async()=>0})).rejects.toThrow(FileDataError); });
