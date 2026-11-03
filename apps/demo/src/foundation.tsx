import { createRoot } from "react-dom/client";
import { useState } from "react";
import { AppearanceProvider } from "glass-ux/appearance";
import { TooltipProvider } from "glass-ux/tooltip";
import { defineMessages } from "glass-ux/i18n";
import { Button } from "glass-ux/button";
import { IconCrop } from "glass-ux/icons";
import { createEditorSession } from "glass-ux-image/session";
import { solidSource, normaliseGeometry } from "glass-ux-image/core";
import { CpuBackend, WebGL2Backend, Renderer } from "glass-ux-image/render";
import { PhotoEditorView } from "glass-ux-image/photo-editor";
import { defineTool, ImageEditorProvider, useImageHistory, useLayers } from "glass-ux-image/react";
import { ImageCanvas, type CanvasPointer } from "glass-ux-image/canvas";
import "glass-ux-image/styles.css";
import "./styles.css";

const pointerSession=createEditorSession({source:solidSource({width:600,height:400},[.2,.4,.6,1])});
const session=createEditorSession({source:solidSource({width:600,height:400},[.2,.4,.6,1])});
function History() {
  const history=useImageHistory(),layers=useLayers();
  return <output data-testid="tree">{history.nodes.length}:{history.current.label}:{layers.layers.length}</output>;
}
const tool=defineTool({messages:defineMessages("foundation", {crop:"Crop",rotate:"Rotate"}),id:"proof",group:"geometry",label:m=>m.crop,icon:<IconCrop/>,Sections:[
  {id:"crop",label:m=>m.crop,Panel:()=> <Button onClick={()=>session.commit({geometry:{...normaliseGeometry(),angle:5}},{label:"Angle"})}>Apply</Button>},
  {id:"rotate",label:m=>m.rotate,Panel:History}
]});
session.registerTools([tool]);
function App() {
  const [pointer,setPointer]=useState<CanvasPointer|null>(null);
  return <><div style={{blockSize:500,inlineSize:800}}><PhotoEditorView editor={session} tools={[tool]} /></div>
    <div style={{blockSize:400,inlineSize:800,display:"grid"}}><ImageEditorProvider editor={pointerSession}><ImageCanvas onDocumentPointer={setPointer}><div data-canvas-tool style={{position:"absolute",inset:0}} /></ImageCanvas></ImageEditorProvider></div>
    <output data-testid="pointer">{pointer ? `${pointer.phase}:${pointer.x.toFixed(2)}:${pointer.y.toFixed(2)}` : ""}</output>
  </>;
}
// The second canvas is a separate session so it does not replace PhotoEditor's renderer/view controls.
async function exportBoth() {
  const s=createEditorSession({source:solidSource({width:64,height:48},[.2,.4,.6,1])});
  while(s.state.status==="loading")await new Promise(resolve=>setTimeout(resolve));
  s.assets.set({id:"overlay",source:solidSource({width:10,height:10},[.3,.2,.1,.5])});
  s.commit({geometry:{...normaliseGeometry(),angle:17,canvas:{rect:{x:-2,y:-2,width:80,height:64},fill:[.1,.1,.1,1]},resize:{width:100,height:80}},layers:[{id:"overlay",kind:"image",asset:"overlay",name:"Overlay",visible:true,opacity:.8,blend:"colour-dodge",quad:[[10,12],[42,9],[39,40],[12,42]]}]});
  const outputs:number[][]=[];
  for(const backend of [new WebGL2Backend(),new CpuBackend()]) {
    const renderer=new Renderer({document:s.document!,backend});s.attach(renderer);
    outputs.push(Array.from(new Uint8Array(await (await s.result().toBlob({type:"image/png"})).arrayBuffer())));
    s.attach(undefined);renderer.dispose();
  }
  s.dispose();
  return outputs;
}
window.foundation={session,pointerSession,exportBoth};
declare global { interface Window { foundation: {session:typeof session;pointerSession:typeof pointerSession;exportBoth:typeof exportBoth} } }
createRoot(document.getElementById("root")!).render(<AppearanceProvider><TooltipProvider><ImageEditorProvider editor={session}><App /></ImageEditorProvider></TooltipProvider></AppearanceProvider>);
