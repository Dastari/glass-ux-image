import { describe, expect, it } from "vitest";
import { AssetStore, BLEND_MODES, createPixels, geometryMapping, geometrySize, geometrySource, homography, IDENTITY_GEOMETRY, normaliseGeometry, pixelSource,  rectQuad, TileCache, warpSource } from "./index.js";
import { normaliseRecipe, recipesEqual } from "../session/recipe.js";
import { blendColour, blendPixels } from "../render/blend.js";

describe("geometry and resampling",()=>{
  it("normalises Stage 2 data and retains its exact integer source path",async()=>{
    const image=createPixels(5,3);image.data.forEach((_,i)=>image.data[i]=i/100);
    const recipe=normaliseRecipe({geometry:{...IDENTITY_GEOMETRY,rotation:90}});
    expect(recipe.geometry.angle).toBe(0);expect(recipe.layers).toEqual([]);expect(recipe.strokes).toEqual([]);
    const pixels=await geometrySource(new TileCache(pixelSource(image)),recipe.geometry).readTile({level:0,x:0,y:0});
    expect(Array.from(pixels.data.slice(0,4))).toEqual(Array.from(image.data.slice(40,44)));
  });
  it("is exact at identity, including partial grid cells and alpha",async()=>{
    const image=createPixels(35,21);
    for(let i=0;i<image.data.length;i++)image.data[i]=i%17/20;
    const source=warpSource(new TileCache(pixelSource(image)),(x,y)=>[x,y],image);
    expect((await source.readTile({level:0,x:0,y:0})).data).toEqual(image.data);
  });
  it("uses a coarse source level for a local reduction",async()=>{
    const source=pixelSource(createPixels(1024,1024)),reads:number[]=[];
    const cache=new TileCache({...source,readTile(tile){reads.push(tile.level);return source.readTile(tile);}});
    await warpSource(cache,(x,y)=>[x*4,y*4],{width:256,height:256}).readTile({level:0,x:0,y:0});
    expect(new Set(reads)).toEqual(new Set([2]));
  });
  it("maps projective quads in both directions",()=>{
    const from=rectQuad({width:80,height:60}),to=[[2,5],[90,0],[70,90],[0,60]] as const;
    const forward=homography(from,to),inverse=homography(to,from);
    for(let i=0;i<4;i++) {expect(forward(...from[i]!)![0]).toBeCloseTo(to[i]![0]);expect(forward(...from[i]!)![1]).toBeCloseTo(to[i]![1]);}
    const p=forward(31,24)!;expect(inverse(...p)![0]).toBeCloseTo(31);expect(inverse(...p)![1]).toBeCloseTo(24);
  });
  it("maps the entire geometry and grows or insets rotation bounds",()=>{
    const size={width:100,height:60},geometry={...normaliseGeometry(),rotation:90 as const,flipX:true,angle:17,distort:[[0,0],[70,3],[60,105],[-5,95]] as const,crop:{x:8,y:10,width:40,height:60},canvas:{rect:{x:-5,y:-6,width:50,height:72},fill:null},resize:{width:200,height:288}};
    expect(geometrySize(size,geometry)).toEqual({width:200,height:288});
    const map=geometryMapping(size,geometry),p=map.fromSource(40,30)!;
    const back=map.toSource(...p)!;expect(back[0]).toBeCloseTo(40);expect(back[1]).toBeCloseTo(30);
    const expand=geometrySize(size,{...normaliseGeometry(),angle:30});
    const inset=geometrySize(size,{...normaliseGeometry(),angle:30,angleFit:"inset"});
    expect(expand.width).toBeGreaterThan(size.width);expect(inset.width).toBeLessThan(size.width);
  });
  it("fills only outside the cropped picture on an expanded canvas",async()=>{
    const image=createPixels(8,8);for(let i=0;i<image.data.length;i+=4)image.data.set([.5,0,0,1],i);
    const source=geometrySource(new TileCache(pixelSource(image)),{...normaliseGeometry(),crop:{x:2,y:2,width:4,height:4},canvas:{rect:{x:-1,y:-1,width:6,height:6},fill:[0,0,1,1]}});
    const pixels=await source.readTile({level:0,x:0,y:0});
    expect(Array.from(pixels.data.slice(0,4))).toEqual([0,0,1,1]);
    expect(Array.from(pixels.data.slice((2*6+2)*4,(2*6+2)*4+4))).toEqual([.5,0,0,1]);
  });
});
describe("blend contract",()=>{
  for(const mode of BLEND_MODES)it(mode+" preserves finite premultiplied alpha and transparent inputs",()=>{
    const base=createPixels(1,1),top=createPixels(1,1);base.data.set([.1,.2,.3,.5]);top.data.set([.3,.2,.1,.6]);
    blendPixels(base,top,0,0,mode,.7);
    expect(base.data[3]).toBeCloseTo(.71);
    for(const c of base.data)expect(Number.isFinite(c)).toBe(true);
    const transparent=createPixels(1,1),original=base.data.slice();blendPixels(base,transparent,0,0,mode,1);expect(base.data).toEqual(original);
  });
  it("uses W3C non-separable luminance and channel blend definitions",()=>{
    expect(blendColour([.2,.4,.6],[.8,.5,.1],"difference")).toEqual([.6000000000000001,.09999999999999998,.5]);
    const result=blendColour([.2,.4,.6],[.8,.5,.1],"colour");
    expect(result[0]*.3+result[1]*.59+result[2]*.11).toBeCloseTo(.362);
  });
});
it("compares shared stroke payloads without traversing them",()=>{
  const payload={get points(){throw new Error("traversed shared payload");}}, a={strokes:[payload]};
  expect(recipesEqual({...a},{...a})).toBe(true);
});
it("deduplicates blobs by SHA-256 while retaining decoded assets",async()=>{
  const store=new AssetStore(),blob=new Blob(["asset"]),source=pixelSource(createPixels(1,1));
  const a=await store.add(blob,source),b=await store.add(blob);
  expect(a).toBe(b);expect(a).toHaveLength(64);expect(store.entries).toHaveLength(1);expect(store.get(a)?.source).toBe(source);
});
it("maps source invalidation to only sampled warp cells, including bicubic reach",async()=>{
  let changed:((rect: import("./pyramid.js").Rect)=>void)|undefined;
  const base=pixelSource(createPixels(768,32));
  const cache=new TileCache({...base,invalidated(listener){changed=listener;return()=>{};}});
  const source=warpSource(cache,(x,y)=>[x,y],base),dirty:import("./pyramid.js").Rect[]=[];
  source.invalidated!(rect=>dirty.push(rect));
  await Promise.all([0,1,2].map(x=>source.readTile({level:0,x,y:0})));
  changed!({x:252,y:10,width:2,height:2});
  expect(dirty.every(rect=>rect.x>=240&&rect.x+rect.width<=272)).toBe(true);
  expect(dirty).toHaveLength(2);
});
it("cancels pending geometry reads when their source cache is disposed",async()=>{
  const image=createPixels(8,8);
  const cache=new TileCache({...image,async readTile(){await new Promise(resolve=>setTimeout(resolve,1));return image;}});
  const pending=geometrySource(cache,normaliseGeometry()).readTile({level:0,x:0,y:0});
  cache.dispose();
  await expect(pending).rejects.toThrow("Tile cache disposed");
});
it("invalidates intersecting cached tiles at every pyramid level",async()=>{
  const source=pixelSource(createPixels(1024,512)),cache=new TileCache(source);
  const touched=[0,1,2].map(level=>({level,x:0,y:0})),untouched={level:0,x:3,y:0};
  for(const tile of [...touched,untouched])cache.request(tile);
  await cache.idle();const held=cache.peek(untouched);
  cache.invalidate({x:10,y:10,width:2,height:2});
  for(const tile of touched)expect(cache.peek(tile)).toBeUndefined();
  expect(cache.peek(untouched)).toBe(held);cache.dispose();
});
it("rejects a pending tile result invalidated before it arrived",async()=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const source=pixelSource(createPixels(16,16));
  const cache=new TileCache({...source,async readTile(tile){await gate;return source.readTile(tile);}});
  const tile={level:0,x:0,y:0};
  cache.request(tile);cache.invalidate({x:1,y:1,width:1,height:1});release();await cache.idle();
  expect(cache.peek(tile)).toBeUndefined();
  cache.request(tile);await cache.idle();expect(cache.peek(tile)).toBeDefined();cache.dispose();
});
