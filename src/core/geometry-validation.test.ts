import { expect, it } from 'vitest';
import { geometrySize, normaliseGeometry, rotateGeometry } from './geometry.js';
import { GeometryError } from './geometry-validation.js';
import { normaliseRecipe } from '../session/recipe.js';
it.each([NaN,Infinity,-1,0,100000])('rejects invalid resize, crop and canvas dimensions (%s)',width=>{
  for(const field of ['resize','crop','canvas']){
    const rect={x:0,y:0,width,height:100000};
    expect(()=>normaliseRecipe({geometry:{...normaliseGeometry(),[field]:field==='canvas'?{rect,fill:null}:rect}})).toThrow(GeometryError);
  }
});
it('validates derived output bounds as well as the recipe itself',()=>{
  const g=normaliseGeometry({angle:45});
  expect(()=>geometrySize({width:8192,height:8192},g)).toThrow(GeometryError);
});
it('quarter turns rotate final resize and canvas dimensions with the picture',()=>{
  const size={width:16,height:8},g=normaliseGeometry({resize:{width:32,height:16},canvas:{rect:{x:-2,y:1,width:20,height:7},fill:null}});
  const next=rotateGeometry(g,size,1);expect(geometrySize(size,next)).toEqual({width:16,height:32});expect(next.canvas!.rect).toEqual({x:0,y:-2,width:7,height:20});
});
