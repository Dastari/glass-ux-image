import { expect, it } from 'vitest';
import { geometryMapping, geometrySize, workSize, flipGeometry, normaliseGeometry, type QuarterTurn } from './geometry.js';
it.each([0,30,90,-135])('mirrors mapped screen points at angle %s, preserving crop contents',angle=>{
  const size={width:160,height:80};
  for(const rotation of [0,90,180,270] as QuarterTurn[])for(const axis of ['x','y'] as const)for(const cropped of [false,true]){
    const base=normaliseGeometry({angle,rotation});const work=workSize(size,base);
    const g={...base,crop:cropped?{x:work.width/4,y:work.height/4,width:work.width/2,height:work.height/2}:null};
    const next=flipGeometry(g,size,axis),out=geometrySize(size,g);
    for(const point of [[20,10],[80,40],[130,60]]){
      const a=geometryMapping(size,g).fromSource(point[0]!,point[1]!)!,b=geometryMapping(size,next).fromSource(point[0]!,point[1]!)!;
      expect(b[0]).toBeCloseTo(axis==='x'?out.width-a[0]:a[0],5);expect(b[1]).toBeCloseTo(axis==='y'?out.height-a[1]:a[1],5);
      const back=geometryMapping(size,next).toSource(...b)!;expect(back[0]).toBeCloseTo(point[0]!,5);expect(back[1]).toBeCloseTo(point[1]!,5);
    }
  }
});
it('mirrors a distorted, cropped, canvas-resized picture in output space',()=>{
  const size={width:160,height:80};
  const g=normaliseGeometry({rotation:90,angle:30,distort:[[4,2],[75,7],[83,152],[-2,163]],crop:{x:12,y:14,width:60,height:80},canvas:{rect:{x:-10,y:8,width:100,height:70},fill:null},resize:{width:200,height:140}});
  for(const axis of ['x','y'] as const){const next=flipGeometry(g,size,axis);for(const [x,y] of [[10,20],[80,40],[140,70]]){
    const a=geometryMapping(size,g).fromSource(x!,y!)!,b=geometryMapping(size,next).fromSource(x!,y!)!;
    expect(b[0]).toBeCloseTo(axis==='x'?200-a[0]:a[0]);expect(b[1]).toBeCloseTo(axis==='y'?140-a[1]:a[1]);
  }}
});
import { rotateGeometry } from './geometry.js';
it('quarter turns rotate mapped points after distortion, crop, canvas and resize',()=>{
  const size={width:160,height:80};
  const g=normaliseGeometry({rotation:90,angle:30,distort:[[4,2],[75,7],[83,152],[-2,163]],crop:{x:12,y:14,width:60,height:80},canvas:{rect:{x:-10,y:8,width:100,height:70},fill:null},resize:{width:200,height:140}});
  for(const direction of [1,-1] as const){const next=rotateGeometry(g,size,direction);for(const [x,y] of [[10,20],[80,40],[140,70]]){
    const a=geometryMapping(size,g).fromSource(x!,y!)!,b=geometryMapping(size,next).fromSource(x!,y!)!;
    expect(b[0]).toBeCloseTo(direction===1?140-a[1]:a[1]);expect(b[1]).toBeCloseTo(direction===1?a[0]:200-a[0]);
  }}
});
