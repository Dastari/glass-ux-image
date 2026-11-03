import { GeometryError, validateGeometry, validateImageSize } from "./geometry-validation.js";
import { retryRead } from "./async.js";
import { warpSource, homography, rectQuad, type Mapping, type Quad, type Point } from "./warp.js";
import { createPixels, type PixelBuffer } from "./pixels.js";
import { levelSize, tileRect, type Rect, type Size, type TileAddress } from "./pyramid.js";
import { assembleRegion, type TileCache } from "./tile-cache.js";
import type { TileSource } from "./tile-source.js";

export type QuarterTurn = 0 | 90 | 180 | 270;

/**
 * How a picture is turned and trimmed, without touching its pixels. Rotation comes first, then the
 * flips, so a flip always mirrors what is on screen. `crop` is in the turned picture's pixels.
 */
export interface Geometry {
  rotation: QuarterTurn;
  flipX: boolean;
  flipY: boolean;
  crop: Rect | null;
  angle?: number;
  angleFit?: "expand" | "inset";
  distort?: Quad | null;
  canvas?: { rect: Rect; fill: readonly [number, number, number, number] | null } | null;
  resize?: { width: number; height: number; dpi?: number } | null;
}

/** Unturned, unflipped geometry with no crop, warp or output resize. */
export const IDENTITY_GEOMETRY: Geometry = { rotation: 0, flipX: false, flipY: false, crop: null };

/** The picture's size after rotation, before any crop. */
export function turnedSize(source: Size, rotation: QuarterTurn): Size {
  return rotation === 90 || rotation === 270 ? { width: source.height, height: source.width } : { width: source.width, height: source.height };
}

/** The picture's size with every part of the geometry applied. */
export function geometrySize(source: Size, geometry: Geometry): Size {
  validateGeometry(geometry);
  const size = geometry.resize ?? geometry.canvas?.rect ?? geometry.crop ?? workSize(source, geometry);
  validateImageSize(size);
  return { width: Math.max(1, Math.round(size.width)), height: Math.max(1, Math.round(size.height)) };
}

/** Turn what is on screen a quarter clockwise (1) or anticlockwise (-1). The crop turns with it. */
export function rotateGeometry(geometry: Geometry, source: Size, direction: 1 | -1): Geometry {
  const { width, height } = workSize(source, geometry);
  const { crop } = geometry;
  const turned = crop && (direction === 1 ? { x: height - crop.y - crop.height, y: crop.x, width: crop.height, height: crop.width } : { x: crop.y, y: width - crop.x - crop.width, width: crop.height, height: crop.width });
  const basis=turnedSize(source,geometry.rotation);
  const order=direction === 1 ? [3,0,1,2] : [1,2,3,0];
  const distort=geometry.distort && order.map(i => {const [x,y]=geometry.distort![i]!;return direction === 1 ? [basis.height-y,x] : [y,basis.width-x];}) as unknown as Quad;
  // A quarter turn after a flip is the same as the turn first and the other flip.
  return { ...geometry, rotation: ((geometry.rotation + direction * 90 + 360) % 360) as QuarterTurn, flipX: geometry.flipY, flipY: geometry.flipX, crop: turned,
    ...(geometry.distort ? {distort} : {}),
    ...(geometry.resize ? {resize: {...geometry.resize,width:geometry.resize.height,height:geometry.resize.width}} : {}),
    ...(geometry.canvas ? {canvas: {...geometry.canvas,rect: direction === 1 ? {x:(crop?.height ?? height)-geometry.canvas.rect.y-geometry.canvas.rect.height,y:geometry.canvas.rect.x,width:geometry.canvas.rect.height,height:geometry.canvas.rect.width} : {x:geometry.canvas.rect.y,y:(crop?.width ?? width)-geometry.canvas.rect.x-geometry.canvas.rect.width,width:geometry.canvas.rect.height,height:geometry.canvas.rect.width}}} : {}) };
}

/** Mirror what is on screen. The crop stays over the same part of the picture. */
export function flipGeometry(geometry: Geometry, source: Size, axis: "x" | "y"): Geometry {
  const { width, height } = workSize(source, geometry);
  const { crop, canvas, distort } = geometry;
  const turned = turnedSize(source, geometry.rotation);
  // F R(a) = R(-a) F. Conjugate the quad by F as flips precede distortion.
  const order = axis === "x" ? [1,0,3,2] : [3,2,1,0];
  const mirrored = distort && order.map(i => { const [x,y] = distort[i]!; return axis === "x" ? [turned.width-x,y] : [x,turned.height-y]; }) as unknown as Quad | null | undefined;
  return { ...geometry,
    ...(axis === "x" ? {flipX: !geometry.flipX} : {flipY: !geometry.flipY}),
    ...(geometry.angle ? {angle: -geometry.angle} : {}),
    ...(distort ? {distort: mirrored} : {}),
    ...(canvas ? {canvas: {...canvas, rect: {...canvas.rect, ...(axis === "x" ? {x: (crop?.width ?? width)-canvas.rect.x-canvas.rect.width} : {y: (crop?.height ?? height)-canvas.rect.y-canvas.rect.height})}}} : {}),
    crop: crop && {...crop, ...(axis === "x" ? {x: width-crop.x-crop.width} : {y: height-crop.y-crop.height})}
  };
}

/** Keep a crop inside the turned picture, on whole pixels, at least one pixel in size. */
export function clampCrop(crop: Rect, bounds: Size): Rect {
  const x = Math.max(0, Math.min(bounds.width - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(bounds.height - 1, Math.round(crop.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(bounds.width - x, Math.round(crop.width))),
    height: Math.max(1, Math.min(bounds.height - y, Math.round(crop.height))),
  };
}

/** The largest rectangle of this aspect that fits inside `bounds`, centred in it. */
export function fitAspect(bounds: Rect, aspect: number): Rect {
  const width = Math.min(bounds.width, bounds.height * aspect);
  const height = width / aspect;
  return { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2, width, height };
}

/** Where a pixel of the turned picture comes from in the source, at the same level. */
function fromTurned(rotation: QuarterTurn, full: Size, x: number, y: number) {
  switch (rotation) {
    case 90:
      return { x: y, y: full.height - 1 - x };
    case 180:
      return { x: full.width - 1 - x, y: full.height - 1 - y };
    case 270:
      return { x: full.width - 1 - y, y: x };
    default:
      return { x, y };
  }
}


/**
 * A source showing another through a geometry. Pyramid levels are mapped directly, so a preview at
 * 25% reads only level 2 of the original. Below level 0 a crop's origin rounds to the level's grid.
 */
export function geometrySource(cache: TileCache, geometry: Geometry): TileSource {
  const { source } = cache;
  if (geometry.angle || geometry.distort || geometry.canvas || geometry.resize) {
    const warped = warpSource(cache, geometryMapping(source, geometry).toSource, geometrySize(source, geometry));
    return canvasSource(warped, geometry, workSize(source, geometry));
  }

  const { rotation, flipX, flipY, crop } = geometry;
  const size = geometrySize(source, geometry);
  const turned = turnedSize(source, rotation);

  async function readTile(tile: TileAddress, signal?: AbortSignal): Promise<PixelBuffer> {
    const rect = tileRect(size, tile);
    const scale = 2 ** tile.level;
    const originX = crop ? Math.floor(crop.x / scale) : 0;
    const originY = crop ? Math.floor(crop.y / scale) : 0;
    const full = levelSize(source, tile.level);
    const shown = levelSize(turned, tile.level);

    // Each corner of the wanted area, through flips and rotation, bounds what to read.
    const place = (x: number, y: number) => {
      const turnedX = originX + rect.x + x;
      const turnedY = originY + rect.y + y;
      return fromTurned(rotation, full, flipX ? shown.width - 1 - turnedX : turnedX, flipY ? shown.height - 1 - turnedY : turnedY);
    };
    const a = place(0, 0);
    const b = place(rect.width - 1, rect.height - 1);
    const area: Rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 };

    let region = assembleRegion(cache, source, tile.level, area);
    for (let attempt=0; !region; attempt++) {
      await retryRead(attempt, signal);
      await cache.idle(signal);
      region = assembleRegion(cache, source, tile.level, area);
    }

    const out = createPixels(rect.width, rect.height);
    for (let y = 0; y < rect.height; y++) {
      for (let x = 0; x < rect.width; x++) {
        const from = place(x, y);
        const i = ((from.y - area.y) * area.width + (from.x - area.x)) * 4;
        const o = (y * rect.width + x) * 4;
        out.data[o] = region.data[i]!;
        out.data[o + 1] = region.data[i + 1]!;
        out.data[o + 2] = region.data[i + 2]!;
        out.data[o + 3] = region.data[i + 3]!;
      }
    }
    return out;
  }

  return { ...size, readTile, idle: signal => cache.idle(signal), invalidated: listener => cache.subscribe(rect => {
    const map = geometryMapping(source, geometry).fromSource;
    const points = rectQuad(rect).map(([x,y]) => map(x+rect.x,y+rect.y));
    if(points.some(p=>!p)) return listener({x:0,y:0,...size});
    const xs=points.map(p=>p![0]), ys=points.map(p=>p![1]);
    listener({x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)});
  }) };
}


/** Fill the geometry defaults without changing Stage 2 semantics. */
export function normaliseGeometry(geometry: Partial<Geometry> = {}): Required<Geometry> {
  if (!geometry || typeof geometry !== "object" || Array.isArray(geometry)) throw new GeometryError("Geometry must be an object");
  const result = { ...IDENTITY_GEOMETRY, ...geometry, angle: geometry.angle ?? 0, angleFit: geometry.angleFit ?? "expand", distort: geometry.distort ?? null, canvas: geometry.canvas ?? null, resize: geometry.resize ?? null };
  validateGeometry(result);
  return result;
}
/** Work-space bounds after distortion and free rotation, before warps and crop. */
export function workSize(source: Size, geometry: Geometry): Size {
  return workTransform(source, geometry).size;
}
function workTransform(source: Size, geometry: Geometry) {
  const turned=turnedSize(source,geometry.rotation), quad=geometry.distort ?? rectQuad(turned);
  const xs=quad.map(p=>p[0]),ys=quad.map(p=>p[1]);
  const left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
  const angle=(geometry.angle ?? 0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  let width=Math.abs(w*c)+Math.abs(h*s),height=Math.abs(w*s)+Math.abs(h*c);
  if(geometry.angleFit==="inset") {
    const aspect=turned.width/turned.height;
    height=Math.min(w/(Math.abs(c)*aspect+Math.abs(s)),h/(Math.abs(s)*aspect+Math.abs(c)));
    width=height*aspect;
  }
  const size={width:Math.max(1,Math.round(width)),height:Math.max(1,Math.round(height))};
  const forward: Mapping=(x,y)=>[(x-left-w/2)*c-(y-top-h/2)*s+size.width/2,(x-left-w/2)*s+(y-top-h/2)*c+size.height/2];
  const inverse: Mapping=(x,y)=>[(x-size.width/2)*c+(y-size.height/2)*s+left+w/2,-(x-size.width/2)*s+(y-size.height/2)*c+top+h/2];
  validateImageSize(size);
  return {size,forward,inverse};
}
/** Bidirectional geometry mapping in pixel-edge coordinates. Warps are supplied separately by sessions. */
export function geometryMapping(source: Size, geometry: Geometry): {toSource: Mapping; fromSource: Mapping; toWork: Mapping; fromWork: Mapping} {
  const turned=turnedSize(source,geometry.rotation), work=workTransform(source,geometry);
  const quad=geometry.distort ?? rectQuad(turned);
  const distort=homography(rectQuad(turned),quad),undistort=homography(quad,rectQuad(turned));
  const turn=(x:number,y:number):Point => {
    let p:Point;
    switch(geometry.rotation) { case 90:p=[source.height-y,x];break;case 180:p=[source.width-x,source.height-y];break;case 270:p=[y,source.width-x];break;default:p=[x,y]; }
    return [geometry.flipX?turned.width-p[0]:p[0],geometry.flipY?turned.height-p[1]:p[1]];
  };
  const unturn=(x:number,y:number):Point => {
    if(geometry.flipX)x=turned.width-x;if(geometry.flipY)y=turned.height-y;
    switch(geometry.rotation) {case 90:return [y,source.height-x];case 180:return [source.width-x,source.height-y];case 270:return [source.width-y,x];default:return [x,y];}
  };
  const crop=geometry.crop ?? {x:0,y:0,...work.size},canvas=geometry.canvas?.rect ?? {x:0,y:0,width:crop.width,height:crop.height},size=geometrySize(source,geometry);
  const fromWork:Mapping=(x,y)=>[(x-crop.x-canvas.x)*size.width/canvas.width,(y-crop.y-canvas.y)*size.height/canvas.height];
  const toWork:Mapping=(x,y)=>[x*canvas.width/size.width+canvas.x+crop.x,y*canvas.height/size.height+canvas.y+crop.y];
  const fromSource:Mapping=(x,y)=>{const p=turn(x,y),q=distort(...p);return q ? work.forward(...q) : null;};
  const toSourceWork:Mapping=(x,y)=>{const p=work.inverse(x,y),q=p&&undistort(...p);return q ? unturn(...q) : null;};
  return {
    fromWork,toWork,
    fromSource:(x,y)=>{const p=fromSource(x,y);return p&&fromWork(...p);},
    toSource:(x,y)=>{
      const p=toWork(x,y);
      if(!p)return null;
      return toSourceWork(...p);
    }
  };
}


/** Apply canvas bounds and its premultiplied fill to an already mapped output source. */
export function canvasSource(source: TileSource, geometry: Geometry, work: Size): TileSource {
  if(!geometry.canvas)return source;
  const {rect}=geometry.canvas,fill=geometry.canvas.fill ?? [0,0,0,0];
  const bounds=geometry.crop ?? {x:0,y:0,...work};
  return {...source, async readTile(tile, signal) {
    const pixels=await source.readTile(tile, signal),area=tileRect(source,tile),scale=2**tile.level;
    const resizeX=rect.width/source.width,resizeY=rect.height/source.height;
    for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++) {
      const cx=rect.x+(area.x+x+.5)*scale*resizeX,cy=rect.y+(area.y+y+.5)*scale*resizeY;
      if(cx<0||cy<0||cx>=bounds.width||cy>=bounds.height)pixels.data.set(fill,(y*pixels.width+x)*4);
    }
    return pixels;
  }};
}
