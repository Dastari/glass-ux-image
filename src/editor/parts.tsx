import { useEffect, useState, type ReactNode } from 'react';
import { Accordion } from 'glass-ux/accordion';
import { Toolbar } from 'glass-ux/toolbar';
import { CompareSlider } from 'glass-ux/compare-slider';
import { useMessages } from 'glass-ux/i18n';
import { imageEditorMessages, toolResetChange, useEditor, useSessionState, type ImageTool } from '../react/index.js';
import { pixelsToRgba8 } from '../core/index.js';
import { workspaceMessages } from '../messages/workspace.js';
import type { EditorSession } from '../session/index.js';

/** Shared public tool presentation props. */
export interface ToolSettingsProps {
  /** Tool whose public panels should be shown. */
  tool: ImageTool;
}
/** The tool's own domain words, respecting locale and MessagesProvider. */
export function useToolMessages(tool:ImageTool) {return useMessages(tool.messages??imageEditorMessages);}
/** A tool's public Panel or collapsible Sections, independently of either editor composition. */
export function ToolSettings({tool}:ToolSettingsProps) {
  const m=useToolMessages(tool);
  return tool.Sections?<Accordion.Root key={tool.id} multiple defaultValue={tool.group==='effects'?[]:tool.Sections.slice(0,1).map(s=>s.id)}>{tool.Sections.map(({id,label,Panel})=><Accordion.Item key={id} value={id} title={label(m)}><Panel/></Accordion.Item>)}</Accordion.Root>:tool.Panel?<tool.Panel/>:null;
}
/** Public presentation bridge, useful to hosts building action labels from tool descriptors. */
export function ToolLabel({tool, onLabel}:ToolSettingsProps & {
  /** Reports localised name changes. */
  onLabel:(id:string,label:string)=>void;
}) {
  const m=useToolMessages(tool),label=tool.label(m);
  useEffect(()=>onLabel(tool.id,label),[tool.id,label,onLabel]);
  return null;
}
/** A labelled tool strip which folds related tools into Glass UX flyouts. */
export interface ToolRailProps {
  /** Only these tools are offered. */
  tools:readonly ImageTool[];
  /** Explicit editor or nearest provider. */
  editor?:EditorSession;
  /** Resolved labels, for sharing with a host's action set. */
  toolLabels?:Readonly<Record<string,string>>;
  /** Optional shared command runner; otherwise selection uses the session action. */
  onToolSelect?:(id:string)=>void;
  /** Show a Reset button at the end that removes the chosen tool's edits as one undo step. Default true. */
  reset?:boolean;
  /**
   * What happens when the tools do not fit one row. `fold` (default) folds them into the toolbar's
   * More menu; `wrap` keeps every tool in sight on further rows, with Reset at the end of the first.
   * Since Glass UX 0.18 a choice group folds one tool at a time, so `fold` suits a narrow column too.
   */
  layout?:'fold'|'wrap';
}
/**
 * One single-choice toolbar; large kits group by public tool family. A tool marked `standalone`
 * keeps its own button after its family's flyout, except a standalone first tool, which leads the
 * rail on its own as Photoshop's Move tool does.
 */
export function ToolRail({tools,editor,toolLabels={},onToolSelect,reset=true,layout='fold'}:ToolRailProps) {
  const session=useEditor(editor),state=useSessionState(session),m=useMessages(workspaceMessages),base=useMessages(imageEditorMessages);
  const lead=tools[0]?.standalone?tools[0]:undefined,rest=lead?tools.slice(1):tools;
  const groups=[...new Set(rest.map(t=>t.group??'geometry'))];
  const disabled=state.status!=='ready';
  const labelOf=(t:ImageTool)=>toolLabels[t.id]??t.label(t.messages?.defaults??base);
  const button=(t:ImageTool)=><Toolbar.Button key={t.id} value={t.id} label={labelOf(t)} icon={t.icon} disabled={disabled}/>;
  const active=tools.find(t=>t.id===state.tool),change=active?toolResetChange(session,active):null;
  return <div className="gi-tool-rail" data-layout={layout}><Toolbar aria-label={base.tools} overflow={layout==='fold'}><Toolbar.Group aria-label={base.tools} value={state.tool??''} onValueChange={id=>onToolSelect?onToolSelect(id):session.run('tool.select',id)}>
    {lead&&button(lead)}
    {groups.flatMap(group=>{
      const family=rest.filter(t=>(t.group??'geometry')===group),folded=family.filter(t=>!t.standalone);
      const members=folded.map(t=>({value:t.id,label:labelOf(t),icon:t.icon,disabled}));
      // A family of one is a plain tool button: the flyout's corner mark would promise tools that are not there.
      const head=folded.length===0?[]:folded.length===1?[button(folded[0]!)]:[<Toolbar.Flyout key={group} label={m[group]} tools={members}/>];
      return [...head,...family.filter(t=>t.standalone).map(button)];
    })}
  </Toolbar.Group>
  {/* Always present, so the row does not shift as tools change; it names what it resets. */}
  {/* Direct children, not a fragment: the toolbar reads each item's priority from its own children. */}
  {reset&&<Toolbar.Spacer/>}
  {reset&&<Toolbar.Button label={base.reset} showLabel priority="always" tooltip={active?base.resetTool(labelOf(active)):false} disabledReason={change?undefined:base.nothingToReset} onClick={()=>{if(change&&active)session.commit(change,{label:base.resetTool(labelOf(active))});}}/>}
  </Toolbar></div>;
}
/** Whole-picture comparison. It reads previews without changing recipes or undo history. */
export interface BeforeAfterProps {
  /** Explicit editor or nearest provider. */
  editor?:EditorSession;
  /** Preview's longest edge; defaults to 768. */
  maxEdge?:number;
  /** Extra overlay content. */
  children?:ReactNode;
}
/** Public comparison on Glass UX CompareSlider; image coordinates always stay left-to-right. */
export function BeforeAfter({editor,maxEdge=768,children}:BeforeAfterProps) {
  const session=useEditor(editor),state=useSessionState(session),m=useMessages(workspaceMessages),[urls,setUrls]=useState<string[]>([]);
  useEffect(()=>{
    let cancelled=false;
    const timer=setTimeout(()=>{void Promise.all([session.readPreview(maxEdge,{recipe:session.history.nodes[0]!.recipe}),session.readPreview(maxEdge)]).then(pictures=>{
      if(cancelled)return;
      setUrls(pictures.map(p=>{const c=document.createElement('canvas');c.width=p.width;c.height=p.height;c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixelsToRgba8(p)),p.width,p.height),0,0);return c.toDataURL();}));
    }).catch(()=>{});},100);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[session,state.recipe,maxEdge]);
  return <div className="gi-workspace-compare" dir="ltr" data-canvas-tool=""><CompareSlider aria-label={m.compare} beforeLabel={m.before} afterLabel={m.after} before={urls[0]?<img src={urls[0]} alt={m.before}/>:null} after={urls[1]?<img src={urls[1]} alt={m.after}/>:null}/>{children}</div>;
}
