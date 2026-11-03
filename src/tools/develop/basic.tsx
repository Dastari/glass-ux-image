import {useState} from 'react';
import {Button} from 'glass-ux/button';
import {IconAdjust} from 'glass-ux/icons';
import {useMessages} from 'glass-ux/i18n';
import {SliderField} from 'glass-ux/slider';
import {adjust,NEUTRAL_ADJUST,type AdjustParams} from '../../filters/adjust.js';
import {developMessages,type DevelopMessages} from '../../messages/develop.js';
import {defineTool,useEditor,useSessionState} from '../../react/index.js';
import type {EditorSession} from '../../session/index.js';
import {PanelActions} from '../../react/panel-layout.js';
/** Session-free simple adjustments. This entry imports no curves, HSL tables or full develop engine. */
export interface BasicAdjustmentsProps {
  /** Controlled brightness, contrast, saturation and warmth values (-100…100). */
  value?:AdjustParams;
  /** Initial uncontrolled adjustments. */
  defaultValue?:AdjustParams;
  /** Live values. */
  onValueChange?:(value:AdjustParams)=>void;
  /** Values on pointer release or a keyboard step. */
  onValueCommitted?:(value:AdjustParams)=>void;
  /** Which simple controls to expose; defaults to all four. */
  controls?:readonly (keyof AdjustParams)[];
  /** Disable all sliders. */
  disabled?:boolean;
  /** Localised wording overrides. */
  labels?:Partial<DevelopMessages>;
}
/** A host can render just one slider, without a provider or an editor. */
export function BasicAdjustments({value,defaultValue,onValueChange,onValueCommitted,controls=['brightness','contrast','saturation','warmth'],disabled,labels}:BasicAdjustmentsProps) {
  const [own,setOwn]=useState(defaultValue??NEUTRAL_ADJUST),current=value??own,m=useMessages(developMessages,{labels});
  return <div className="gi-develop-fields">{controls.map(key=><SliderField message="auto" key={key} label={m[key==='warmth'?'temperature':key]} size="sm" origin={0} min={-100} max={100} step={1} disabled={disabled} value={current[key]} onValueChange={n=>{const next={...current,[key]:n};if(value===undefined)setOwn(next);onValueChange?.(next);}} onValueCommitted={n=>onValueCommitted?.({...current,[key]:n})}/>)}</div>;
}
/** Props for the simple session-bound panel. */
export interface BasicPanelProps {
  /** Explicit session or the nearest provider. */
  editor?:EditorSession;
  /** Optional subset of controls. */
  controls?:readonly (keyof AdjustParams)[];
}
/** Session binding over BasicAdjustments; committed changes use edit.apply. */
export function BasicPanel({editor,controls}:BasicPanelProps) {
  const session=useEditor(editor),{draft}=useSessionState(session),m=useMessages(developMessages);
  const value=(draft.filters.adjust as AdjustParams|undefined)??NEUTRAL_ADJUST;
  return <div className="gi-panel"><BasicAdjustments value={value} controls={controls} onValueChange={v=>session.previewFilter('adjust',v)} onValueCommitted={v=>session.run('edit.apply',{filters:{...session.state.draft.filters,adjust:v}})}/><PanelActions><Button size="sm" variant="ghost" onClick={()=>session.run('edit.apply',{filters:{...draft.filters,adjust:NEUTRAL_ADJUST}})}>{m.reset}</Button></PanelActions></div>;
}
/** Simple brightness, contrast and colour tool for basic kits. Imports no advanced develop code. */
export const basicDevelop=defineTool({id:'basic-develop',messages:developMessages,group:'develop',label:m=>m.basic,icon:<IconAdjust/>,filters:[adjust],Panel:BasicPanel});
