import { retryRead } from "./async.js";
import { createPixels, type PixelBuffer } from "./pixels.js";
import { coarsestLevel, tileKey, tileRect, type Rect, type Size } from "./pyramid.js";
import { assembleRegion, type TileCache } from "./tile-cache.js";
import type { TileSource } from "./tile-source.js";

/** Coordinates use pixel edges: the centre of the first pixel is (.5, .5). */
export type Point = readonly [number, number];
/** Clockwise corners: top left, top right, bottom right, bottom left. */
export type Quad = readonly [Point, Point, Point, Point];
/** Return null for transparent output. */
export type Mapping = (x: number, y: number) => Point | null;
/** Pure output-to-source displacement, before crop, in work-space pixels. */
export interface Warp<P = unknown> {
  id: string;
  map(x: number, y: number, params: P, size: Size): Point;
  /** Optional maximum displacement, useful for invalidation bounds. */
  reach?: (params: P) => number;
}
/** Declare an opt-in warp; register it in the session or a tool's filters. */
export const defineWarp = <P>(warp: Warp<P>): Warp<P> => warp;
/** Corners of a rectangle, using pixel edges. */
export const rectQuad = ({width, height}: Size): Quad => [[0,0],[width,0],[width,height],[0,height]];

/** Projective mapping between two quads. Rejects a singular quad. */
export function homography(from: Quad, to: Quad): Mapping {
  const rows: number[][] = [];
  for(let i=0;i<4;i++) {
    const [x,y]=from[i]!, [u,v]=to[i]!;
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for(let i=0;i<8;i++) {
    let pivot=i;
    for(let j=i+1;j<8;j++) if(Math.abs(rows[j]![i]!)>Math.abs(rows[pivot]![i]!)) pivot=j;
    [rows[i],rows[pivot]]=[rows[pivot]!,rows[i]!];
    const d=rows[i]![i]!;
    if(Math.abs(d)<1e-12) throw new RangeError("Singular quad");
    for(let k=i;k<=8;k++) rows[i]![k]!/=d;
    for(let j=0;j<8;j++) if(j!==i) { const f=rows[j]![i]!; for(let k=i;k<=8;k++) rows[j]![k]!-=f*rows[i]![k]!; }
  }
  const h=rows.map(r=>r[8]!);
  return (x,y) => { const d=h[6]!*x+h[7]!*y+1; return Math.abs(d)<1e-12 ? null : [(h[0]!*x+h[1]!*y+h[2]!)/d,(h[3]!*x+h[4]!*y+h[5]!)/d]; };
}
const cubic = (x: number) => { x=Math.abs(x); return x<=1 ? 1.5*x*x*x-2.5*x*x+1 : x<2 ? -.5*x*x*x+2.5*x*x-4*x+2 : 0; };

/**
 * Resample a cache through an output-to-source mapping. Mappings are interpolated on a 16 px grid;
 * each cell selects a pyramid level from its local footprint. Level zero uses Catmull–Rom bicubic,
 * previews use bilinear. Identity reads exact samples. Missing source positions are transparent.
 */
export function warpSource(cache: TileCache, mapping: Mapping, size: Size): TileSource {
  const footprints=new Map<string, {source:Rect; output:Rect}[]>();
  const intersects=(a:Rect,b:Rect)=>a.x<b.x+b.width&&a.y<b.y+b.height&&a.x+a.width>b.x&&a.y+a.height>b.y;
  return {
    ...size,
    idle: signal => cache.idle(signal),
    invalidated: listener => cache.subscribe(rect => {
      for(const cells of footprints.values()) {
        const affected=cells.filter(cell=>intersects(rect,cell.source));
        if(!affected.length)continue;
        const x=Math.min(...affected.map(c=>c.output.x)),y=Math.min(...affected.map(c=>c.output.y));
        listener({x,y,width:Math.max(...affected.map(c=>c.output.x+c.output.width))-x,height:Math.max(...affected.map(c=>c.output.y+c.output.height))-y});
      }
    }),
    async readTile(tile, signal) {
      const rect=tileRect(size,tile), scale=2**tile.level, out=createPixels(rect.width,rect.height);
      const cells: {source:Rect;output:Rect}[]=[];
      footprints.set(tileKey(tile),cells);
      let sliceStart=performance.now();
      const step=16;
      const grid=new Map<string,Point|null>();
      const at=(x:number,y:number) => {
        const key=`${x}/${y}`;
        if(!grid.has(key)) grid.set(key,mapping((rect.x+x)*scale,(rect.y+y)*scale));
        return grid.get(key)!;
      };
      for(let gy=0;gy<rect.height;gy+=step) for(let gx=0;gx<rect.width;gx+=step) {
        if(performance.now()-sliceStart>=8) {await new Promise<void>(resolve=>setTimeout(resolve));sliceStart=performance.now();}
        const ex=Math.min(gx+step,rect.width), ey=Math.min(gy+step,rect.height);
        const a=at(gx,gy),b=at(ex,gy),c=at(gx,ey),d=at(ex,ey);
        const fallback = !a||!b||!c||!d;
        const positions: (Point|null)[] = [];
        if(fallback) for(let y=gy;y<ey;y++)for(let x=gx;x<ex;x++)positions.push(mapping((rect.x+x+.5)*scale,(rect.y+y+.5)*scale));
        const valid = fallback ? positions.filter((p):p is Point=>p!==null) : [a!,b!,c!,d!];
        if(!valid.length)continue;
        const footprint=fallback ? scale : Math.max(Math.hypot(b![0]-a![0],b![1]-a![1])/(ex-gx),Math.hypot(c![0]-a![0],c![1]-a![1])/(ey-gy));
        const level=Math.min(coarsestLevel(cache.source),Math.max(0,Math.floor(Math.log2(Math.max(1,footprint)))));
        const factor=2**level, radius=level===0 ? 2 : 1;
        const xs=valid.map(p=>p[0]/factor-.5), ys=valid.map(p=>p[1]/factor-.5);
        const area: Rect={x:Math.floor(Math.min(...xs))-radius,y:Math.floor(Math.min(...ys))-radius,width:0,height:0};
        area.width=Math.ceil(Math.max(...xs))+radius-area.x+1; area.height=Math.ceil(Math.max(...ys))+radius-area.y+1;
        cells.push({source:{x:area.x*factor,y:area.y*factor,width:area.width*factor,height:area.height*factor},output:{x:(rect.x+gx)*scale,y:(rect.y+gy)*scale,width:(ex-gx)*scale,height:(ey-gy)*scale}});
        let region: PixelBuffer|null=assembleRegion(cache,cache.source,level,area);
        for(let attempt=0;!region;attempt++) { await retryRead(attempt,signal); await cache.idle(signal); region=assembleRegion(cache,cache.source,level,area); }
        for(let y=gy;y<ey;y++) for(let x=gx;x<ex;x++) {
          const u=(x+.5-gx)/(ex-gx),v=(y+.5-gy)/(ey-gy);
          const position=fallback ? positions[(y-gy)*(ex-gx)+x-gx] : [
            a![0]*(1-u)*(1-v)+b![0]*u*(1-v)+c![0]*(1-u)*v+d![0]*u*v,
            a![1]*(1-u)*(1-v)+b![1]*u*(1-v)+c![1]*(1-u)*v+d![1]*u*v
          ];
          if(!position)continue;
          let sx=position[0]!/factor-.5,sy=position[1]!/factor-.5;
          if(Math.abs(sx-Math.round(sx))<1e-10)sx=Math.round(sx);
          if(Math.abs(sy-Math.round(sy))<1e-10)sy=Math.round(sy);
          if(sx<-.5||sy<-.5||sx>=cache.source.width/factor-.5||sy>=cache.source.height/factor-.5) continue;
          const ix=Math.floor(sx),iy=Math.floor(sy);
          for(let ky=1-radius;ky<=radius;ky++) for(let kx=1-radius;kx<=radius;kx++) {
            const weight=level===0 ? cubic(sx-ix-kx)*cubic(sy-iy-ky) : (kx ? sx-ix : 1-(sx-ix))*(ky ? sy-iy : 1-(sy-iy));
            const i=((iy+ky-area.y)*area.width+ix+kx-area.x)*4, o=(y*out.width+x)*4;
            for(let ch=0;ch<4;ch++) out.data[o+ch]!+=region.data[i+ch]!*weight;
          }
        }
      }
      return out;
    }
  };
}
