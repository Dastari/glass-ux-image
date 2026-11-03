import { expect, it } from "vitest";
import { normaliseGeometry, solidSource } from "../core/index.js";
import { createEditorSession } from "../session/index.js";
import { adjust } from "../filters/adjust.js";
import { defineTool, toolResetChange } from "./tool.js";

const ready=async(s:ReturnType<typeof createEditorSession>)=>{while(s.state.status==="loading")await new Promise(r=>setTimeout(r));};

it("offers a reset only when it would change the recipe, and falls back to the tool's own filters",async()=>{
  const turn=defineTool({id:"turn",label:()=>"Turn",icon:null,reset:r=>({geometry:{...r.geometry,angle:0}})});
  const tone=defineTool({id:"tone",label:()=>"Tone",icon:null,filters:[adjust]});
  const plain=defineTool({id:"plain",label:()=>"Plain",icon:null});
  const s=createEditorSession({source:solidSource({width:8,height:8},[1,0,0,1]),tools:[turn,tone,plain]});
  await ready(s);
  expect(toolResetChange(s,turn)).toBeNull();
  expect(toolResetChange(s,tone)).toBeNull();
  s.commit({geometry:{...normaliseGeometry(),angle:5},filters:{adjust:{exposure:1},other:{amount:1}}});
  expect(toolResetChange(s,turn)?.geometry?.angle).toBe(0);
  expect(toolResetChange(s,tone)).toEqual({filters:{other:{amount:1}}});
  expect(toolResetChange(s,plain)).toBeNull();
  s.dispose();
});
