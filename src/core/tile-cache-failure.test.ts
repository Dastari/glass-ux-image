import { expect, it, vi } from 'vitest';
import { TileCache } from './tile-cache.js';
import { geometrySource, normaliseGeometry } from './geometry.js';
import { warpSource } from './warp.js';
const tile={level:0,x:0,y:0};
it.each([false,true])('retains and reports tile errors, including synchronous throws (%s)',async sync=>{
  const error=new Error('read failed'),guard=new Error('idle guard');let reads=0,idles=0;
  const cache=new TileCache({width:1,height:1,readTile(){reads++;if(sync)throw error;return Promise.reject(error);},async idle(){if(++idles>=5)throw guard;}});
  const onError=vi.fn();cache.onError=onError;
  try{cache.request(tile);await expect(cache.idle()).rejects.toBe(error);cache.request(tile);await expect(cache.idle()).rejects.toBe(error);expect(reads).toBe(1);expect(onError).toHaveBeenCalledExactlyOnceWith(error,tile);}finally{cache.dispose();}
});
it.each(['geometry','warp'])('propagates upstream errors through %s',async kind=>{
  const error=new Error('upstream failed');let reads=0;
  const cache=new TileCache({width:16,height:16,readTile(){reads++;return Promise.reject(error);},async idle(){if(reads>=5)throw new Error('guard');}});
  const source=kind==='geometry'?geometrySource(cache,normaliseGeometry()):warpSource(cache,(x,y)=>[x,y],{width:16,height:16});
  try{await expect(source.readTile(tile)).rejects.toBe(error);expect(reads).toBe(1);}finally{cache.dispose();}
});
it('fails without a source idle hook, and recovers only after invalidation',async()=>{
  const error=new Error('offline');let failed=true,reads=0;
  const cache=new TileCache({width:1,height:1,readTile(){reads++;if(failed)throw error;return {width:1,height:1,data:new Float32Array(4)};}});
  try{cache.request(tile);await expect(cache.idle()).rejects.toBe(error);cache.request(tile);await expect(cache.idle()).rejects.toBe(error);expect(reads).toBe(1);
    failed=false;cache.invalidate({x:0,y:0,width:1,height:1});cache.request(tile);await cache.idle();expect(cache.peek(tile)).toBeDefined();expect(reads).toBe(2);
  }finally{cache.dispose();}
});
it.each(['read','idle'])('can abort an uncooperative source %s',async kind=>{
  const cache=new TileCache({width:1,height:1,readTile:()=>new Promise(()=>{}),...(kind==='idle'?{idle:()=>new Promise<void>(()=>{})}:{})});
  const controller=new AbortController(),reason=new Error('cancelled');cache.request(tile);
  const pending=cache.idle(controller.signal);controller.abort(reason);await expect(pending).rejects.toBe(reason);cache.dispose();
});
it('disposal interrupts an uncooperative source wait',async()=>{
  const cache=new TileCache({width:1,height:1,readTile:()=>new Promise(()=>{})});cache.request(tile);
  const pending=cache.idle();cache.dispose();await expect(pending).rejects.toThrow('Tile cache disposed');
});
import { assembleRegion, TileCacheBudget } from './tile-cache.js';
import { solidSource } from './tile-source.js';
it('keeps total retained pixels bounded across caches and cache replacement',async()=>{
  const budget=new TileCacheBudget(16*16*16*2),source=solidSource({width:16,height:16},[0,0,0,1]);
  const caches:TileCache[]=[];
  try {for(let i=0;i<12;i++){const cache=new TileCache(source,budget);caches.push(cache);cache.request(tile);await cache.idle();expect(caches.reduce((n,c)=>n+c.bytes,0)).toBeLessThanOrEqual(budget.bytes);}
    for(const cache of caches.splice(0,11))cache.dispose();
    caches[0]!.request(tile);await caches[0]!.idle();expect(caches[0]!.peek(tile)).toBeDefined();
  }finally{for(const cache of caches)cache.dispose();}
});
it('rejects an impossible cache region rather than repeatedly evicting and reloading it',()=>{
  const source=solidSource({width:16,height:16},[0,0,0,1]),cache=new TileCache(source,16);
  try{expect(()=>assembleRegion(cache,source,0,{x:0,y:0,width:16,height:16})).toThrow('Tile region exceeds cache budget');}finally{cache.dispose();}
});
