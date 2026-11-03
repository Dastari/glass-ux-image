import {useEffect,useRef,useState} from 'react';
import {Histogram} from 'glass-ux/charts';
import {Segmented} from 'glass-ux/segmented';
import {Surface} from 'glass-ux/surface';
import {useMessages} from 'glass-ux/i18n';
import {computeHistogram,type Histogram as HistogramData} from '../filters/develop/statistics.js';
import type {PixelBuffer} from '../core/pixels.js';
import {useEditor,useSessionState} from '../react/index.js';
import type {EditRecipe,EditorSession} from '../session/index.js';
import {developMessages} from '../messages/develop.js';
/** Latest completed preview. Requests coalesce, but completed frames remain visible during drags. */
export function useDevelopPreview(editor:EditorSession,maxEdge=192,recipe?: (draft:EditRecipe)=>EditRecipe) {
  const [pixels,setPixels]=useState<PixelBuffer>(),[failed,setFailed]=useState(false),getRecipe=useRef(recipe);getRecipe.current=recipe;
  useEffect(()=>{
    let active=true,running=false,pending=false,last:EditRecipe|undefined;
    const request=()=>{
      const state=editor.state;if(state.status!=='ready'||last===state.draft)return;
      last=state.draft;pending=true;if(!running){running=true;queueMicrotask(()=>void work());}
    };
    const work=async()=>{
      running=true;
      while(active&&pending){
        pending=false;
        try {
          const supplied=getRecipe.current?.(editor.state.draft);
          const next=await editor.readPreview(maxEdge,supplied?{recipe:supplied}:{});
          if(active){setPixels(next);setFailed(false);}
        }catch{if(active)setFailed(true);}
      }
      running=false;
    };
    const unsubscribe=editor.subscribe(request);request();
    return ()=>{active=false;unsubscribe();};
  },[editor,maxEdge]);
  return {pixels,failed};
}
/** Session-bound histogram panel; may be placed independently of any editor composition. */
export interface HistogramPanelProps {
  /** Explicit editor or nearest provider. */
  editor?:EditorSession;
  /** Preview maximum edge in pixels; defaults to 192. */
  maxEdge?:number;
  /** Bin count, defaults to 64. */
  bins?:number;
  /** Controlled histogram channel. */
  channel?:'red'|'green'|'blue'|'luminance';
  /** Starting channel when uncontrolled. */
  defaultChannel?:'red'|'green'|'blue'|'luminance';
  /** Channel selection callback. */
  onChannelChange?:(channel:'red'|'green'|'blue'|'luminance')=>void;
  /** Layout class. */
  className?:string;
}
/** Glass UX Histogram fed by readPreview, including uncommitted slider drafts. */
export function HistogramPanel({editor,maxEdge=192,bins=64,channel,defaultChannel='luminance',onChannelChange,className}:HistogramPanelProps) {
  const session=useEditor(editor);useSessionState(session);
  const {pixels,failed}=useDevelopPreview(session,maxEdge),m=useMessages(developMessages),[own,setOwn]=useState(defaultChannel),selected=channel??own;
  const data:HistogramData|undefined=pixels?computeHistogram(pixels,bins):undefined;
  const counts=data?.[selected]??new Float64Array(bins);
  return <div className={['gi-develop-histogram',className].filter(Boolean).join(' ')} data-testid="develop-histogram" data-weight={data?.weight??0} data-channel={selected}>
    <div className="gi-develop-histogram-head"><span className="gi-develop-histogram-title">{m.histogram}</span><Segmented size="sm" collapse="menu" aria-label={m.channel} options={(['luminance','red','green','blue'] as const).map(c=>({value:c,label:m[c]}))} value={selected} onValueChange={v=>{if(v){if(channel===undefined)setOwn(v);onChannelChange?.(v);}}}/></div>
    <Surface material="inset" radius="tile" className="gi-develop-histogram-chart"><Histogram label={m.histogram} countLabel={m.pixels} state={failed?'error':pixels?'ready':'loading'} errorText={m.error} bins={Array.from(counts,(count,i)=>({from:i/bins,to:(i+1)/bins,count}))}/></Surface>
  </div>;
}
