import {useEffect,useState} from 'react';
import {CompareSlider} from 'glass-ux/compare-slider';
import {useMessages} from 'glass-ux/i18n';
import {pixelsToRgba8,type PixelBuffer} from '../../core/pixels.js';
import {useEditor,useSessionState} from '../../react/index.js';
import {useDevelopPreview} from '../../panels/histogram.js';
import {developMessages} from '../../messages/develop.js';
import type {EditRecipe,EditorSession} from '../../session/index.js';
function withoutDevelop(draft:EditRecipe):EditRecipe {
  const {develop:_develop,adjust:_adjust,...filters}=draft.filters;
  return {...draft,filters};
}
function usePreviewUrl(pixels?:PixelBuffer) {
  const [url,setUrl]=useState<string>();
  useEffect(()=>{
    if(!pixels)return;
    const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixelsToRgba8(pixels)),pixels.width,pixels.height),0,0);
    setUrl(canvas.toDataURL('image/png'));
  },[pixels]);
  return url;
}
/** Session-bound before/develop comparison, without reverting or committing the live draft. */
export interface DevelopCompareProps {
  /** Explicit editor or nearest provider. */
  editor?:EditorSession;
  /** Preview edge in pixels; defaults to 512. */
  maxEdge?:number;
  /** Divider percentage when controlled. */
  value?:number;
  /** Initial uncontrolled divider percentage. */
  defaultValue?:number;
  /** Divider change callback. */
  onValueChange?:(value:number)=>void;
  /** Layout class. */
  className?:string;
}
/** Glass UX's keyboard-operable comparison; both sides share the current geometry. */
export function DevelopCompare({editor,maxEdge=512,value,defaultValue,onValueChange,className}:DevelopCompareProps) {
  const session=useEditor(editor),m=useMessages(developMessages);
  const before=usePreviewUrl(useDevelopPreview(session,maxEdge,withoutDevelop).pixels);
  const after=usePreviewUrl(useDevelopPreview(session,maxEdge).pixels);
  return <div className={['gi-develop-compare',className].filter(Boolean).join(' ')} data-canvas-tool="" dir="ltr"><CompareSlider before={before?<img src={before} alt={m.before}/>:null} after={after?<img src={after} alt={m.after}/>:null} beforeLabel={m.before} afterLabel={m.after} aria-label={m.comparison} value={value} defaultValue={defaultValue} onValueChange={onValueChange}/></div>;
}
/** PhotoEditor overlay, toggled by the Basic section's comparison button. */
export function DevelopCompareOverlay() {
  const session=useEditor(undefined),{toolData}=useSessionState(session);
  return toolData['develop.compare']?<DevelopCompare editor={session}/>:null;
}
