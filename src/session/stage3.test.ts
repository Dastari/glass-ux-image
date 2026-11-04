import { expect, it } from "vitest";
import { createEditorSession, type SourceStage } from "./index.js";
import { defineLayerKind, defineWarp, normaliseGeometry,  solidSource, type Rect, type TileSource } from "../core/index.js";
import { CpuBackend, Renderer } from "../render/index.js";
import { gaussianBlur } from "../filters/gaussian-blur.js";

const ready=async(s:ReturnType<typeof createEditorSession>)=>{
  while(s.state.status==="loading")await new Promise(resolve=>setTimeout(resolve));
  expect(s.state.status).toBe("ready");
};
class Headless extends CpuBackend {
  override get canvas(){return {width:768,height:256} as HTMLCanvasElement;}
  override resize(){}
  override present(){}
}
it("keeps labelled branches, navigates and intercepts every direct commit",async()=>{
  const actions:string[]=[];
  const s=createEditorSession({source:solidSource({width:8,height:8},[1,0,0,1]),onAction:(a,next)=>{actions.push(a.id);return next();}});
  await ready(s);
  s.commit({geometry:{...normaliseGeometry(),flipX:true}},{label:"Flip"});
  const flip=s.history.current.id;
  s.commit({geometry:{...normaliseGeometry(),flipY:true}},{label:"Other flip"});
  const old=s.history.current.id;s.undo();s.commit({geometry:{...normaliseGeometry(),angle:15}},{label:"Angle"});
  expect(s.history.nodes.find(n=>n.id===flip)?.children).toHaveLength(2);
  s.goTo(old);expect(s.state.recipe.geometry.flipY).toBe(true);expect(s.history.current.label).toBe("Other flip");
  expect(actions).toEqual(["edit.commit","edit.commit","edit.undo","edit.commit","edit.goTo"]);
  s.dispose();
});
it("lets hosts refuse geometry, strokes, layers and history actions",async()=>{
  const s=createEditorSession({source:solidSource({width:8,height:8},[1,0,0,1]),onAction:()=>{}});
  await ready(s);s.setGeometry({angle:10});s.setStrokes([{id:"1",tool:"test",params:{},points:[]}]);s.setLayers([]);s.commit({filters:{x:1}});
  expect(s.history.nodes).toHaveLength(1);expect(s.state.recipe.geometry.angle).toBe(0);expect(s.state.recipe.strokes).toEqual([]);
});
it("maps overlays and reads a small linear composite through geometry and a warp",async()=>{
  const shift=defineWarp<{dx:number}>({id:"shift",map:(x,y,p)=>[x-p.dx,y]});
  const s=createEditorSession({source:solidSource({width:64,height:32},[.2,.1,0,.5]),filters:[shift]});
  await ready(s);s.commit({geometry:{...normaliseGeometry(),resize:{width:128,height:64}},filters:{shift:{dx:2}}});
  expect(s.toSource(24,20)![0]).toBeCloseTo(10);expect(s.fromSource(10,10)![0]).toBeCloseTo(24);
  const pixels=await s.readPreview(32);expect([pixels.width,pixels.height]).toEqual([32,16]);expect(pixels.data[(8*32+8)*4]).toBeCloseTo(.2);
});
it("composes image and opt-in kinds through work-space quads and retains position when cropping",async()=>{
  const s=createEditorSession({source:solidSource({width:16,height:16},[1,0,0,1]),layerKinds:[defineLayerKind({kind:"test",source:()=>solidSource({width:4,height:4},[0,0,1,1])})]});
  await ready(s);
  s.assets.set({id:"green",source:solidSource({width:4,height:4},[0,1,0,1])});
  s.setLayers([{id:"blue",name:"Blue",kind:"test",visible:true,opacity:1,blend:"normal",quad:[[4,4],[8,4],[8,8],[4,8]]},{id:"green",name:"Green",kind:"image",asset:"green",visible:true,opacity:1,blend:"normal",quad:[[9,4],[13,4],[13,8],[9,8]]}]);
  s.setGeometry({crop:{x:4,y:4,width:10,height:8}});
  const p=await s.readPreview(16);
  expect(Array.from(p.data.slice(0,4))).toEqual([0,0,1,1]);
  expect(Array.from(p.data.slice(5*4,6*4))).toEqual([0,1,0,1]);
});

it("reconciles a test stage and recomposes only dirty tiles plus filter padding at every level",async()=>{
  const size={width:768,height:256};
  let notify:((rect:Rect)=>void)|undefined,last:unknown,applied=0,colour=0;
  const base=solidSource(size,[0,0,0,1]);
  const staged:TileSource={...size,invalidated(listener){notify=listener;return()=>{notify=undefined;};},async readTile(tile){const p=await base.readTile(tile);if(colour) {
    const scale=2**tile.level;
    for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++) {
      const dx=(tile.x*256+x)*scale,dy=(tile.y*256+y)*scale;
      if(dx<254&&dy<102&&dx+scale>252&&dy+scale>100)p.data[(y*p.width+x)*4]=colour;
    }
  }return p;}};
  const stage:SourceStage={id:"test",apply(_base,recipe){
    if(recipe.strokes!==last){last=recipe.strokes;applied++;colour=recipe.strokes?.length ? .5 : 0;notify?.({x:252,y:100,width:2,height:2});}
    return staged;
  }};
  const s=createEditorSession({source:base,stages:[stage],filters:[gaussianBlur]});await ready(s);
  s.commit({filters:{"gaussian-blur":{sigma:2}}});
  const backend=new Headless(),renderer=new Renderer({document:s.document!,backend});s.attach(renderer);
  renderer.setView({width:768,height:256,zoom:1,centerX:384,centerY:128});await renderer.settle();
  const before=[0,1,2].map(x=>renderer.readTile({level:0,x,y:0})!.data);
  const blends=backend.blend.bind(backend),reads:number[]=[];
  backend.blend=(a,b,o)=>{reads.push(a.width);return blends(a,b,o);};
  s.setStrokes([{id:"one",tool:"test",params:{},points:[{x:252,y:100}]}]);
  await renderer.settle();
  expect(reads).toHaveLength(3); // two level-zero tiles (padding crosses x=256), one coarsest tile
  expect(renderer.readTile({level:0,x:0,y:0})!.data[(100*256+252)*4]).toBeGreaterThan(0);
  expect(renderer.readTile({level:0,x:1,y:0})!.data[100*256*4]).toBeGreaterThan(0);
  expect(renderer.readTile({level:0,x:2,y:0})!.data).toEqual(before[2]);
  expect(applied).toBe(2);
  renderer.dispose();s.dispose();
});
it("keeps canvas fill after a warp and resize",async()=>{
  const identity=defineWarp({id:"identity",map:(x:number,y:number)=>[x,y] as const});
  const s=createEditorSession({source:solidSource({width:4,height:4},[1,0,0,1]),filters:[identity]});
  await ready(s);s.commit({filters:{identity:{}},geometry:{...normaliseGeometry(),canvas:{rect:{x:-2,y:-2,width:8,height:8},fill:[0,0,1,1]},resize:{width:16,height:16}}});
  const pixels=await s.readPreview(16);
  expect(Array.from(pixels.data.slice(0,4))).toEqual([0,0,1,1]);
  expect(Array.from(pixels.data.slice((8*16+8)*4,(8*16+8)*4+4))).toEqual([1,0,0,1]);
});
it("restarts from the opened picture: one labelled step, earlier steps dropped, refusable by the host",async()=>{
  const actions:string[]=[];let refuse=false;
  const s=createEditorSession({source:solidSource({width:8,height:8},[1,0,0,1]),onAction:(a,next)=>{actions.push(a.id);return refuse&&a.id==="edit.restart"?undefined:next();}});
  await ready(s);
  s.commit({geometry:{...normaliseGeometry(),angle:12}},{label:"Angle"});
  s.commit({filters:{grain:{amount:1}}},{label:"Grain"});
  s.restart({filters:{look:{amount:1}}},{label:"Preset"});
  expect(s.history.nodes.map(n=>n.label)).toEqual(["","Preset"]);
  expect(s.state.recipe.geometry.angle).toBe(0);
  expect(s.state.recipe.filters).toEqual({look:{amount:1}});
  expect(s.state.canUndo).toBe(true);
  s.undo();expect(s.history.current.id).toBe("0");expect(s.state.recipe.filters).toEqual({});
  s.redo();expect(s.history.current.label).toBe("Preset");
  // Restarting with no change leaves only the original.
  s.restart();expect(s.history.nodes.map(n=>n.label)).toEqual([""]);expect(s.state.canUndo).toBe(false);
  refuse=true;s.commit({filters:{grain:{amount:1}}},{label:"Grain"});s.restart({},{label:"Refused"});
  expect(s.history.nodes.map(n=>n.label)).toEqual(["","Grain"]);
  expect(actions.filter(id=>id==="edit.restart")).toHaveLength(3);
  s.dispose();
});
it("commits a held draft before history moves, so Undo removes only that draft's step",async()=>{
  const s=createEditorSession({source:solidSource({width:8,height:8},[1,0,0,1])});
  await ready(s);
  s.commit({geometry:{...normaliseGeometry(),angle:10}},{label:"Turn"});
  // A tool previews a nudge and holds it for a burst, as Select's arrow keys do.
  s.preview({geometry:{...s.state.draft.geometry,angle:12}});
  let held=true;
  const release=s.holdDraft(()=>{if(held){held=false;s.commit({},{label:"Nudge"});}});
  s.undo();
  expect(s.history.current.label).toBe("Turn");
  expect(s.state.recipe.geometry.angle).toBe(10);
  release();
  s.dispose();
});
it("reset clears metadata edits as well",async()=>{
  const s=createEditorSession({source:solidSource({width:8,height:8},[1,0,0,1])});
  await ready(s);
  s.commit({metadata:{set:{"exif:Artist":"Someone"}}} as never,{label:"Artist"});
  expect(s.state.recipe.metadata).toBeDefined();
  s.reset();
  expect(s.state.recipe.metadata).toBeUndefined();
  s.dispose();
});
