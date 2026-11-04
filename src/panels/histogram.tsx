import {useEffect,useMemo,useRef,useState} from 'react';
import {Histogram} from 'glass-ux/charts';
import {useElementSize} from 'glass-ux/hooks';
import {Segmented} from 'glass-ux/segmented';
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
/** What the histogram shows: the three colour channels overlaid, luminance, or one channel. */
export type HistogramChannel='rgb'|'luminance'|'red'|'green'|'blue';
const CHANNELS=['rgb','luminance','red','green','blue'] as const satisfies readonly HistogramChannel[];
const COLOURS=['red','green','blue'] as const;
/** Columns about 7 px apart: wide enough that Histogram's 2 px gap reads as a gap, not as stripes. */
export function autoBins(width:number){return Math.max(16,Math.min(128,Math.round((width||224)/7/8)*8));}
/** Session-bound histogram panel; may be placed independently of any editor composition. */
export interface HistogramPanelProps {
  /** Explicit editor or nearest provider. */
  editor?:EditorSession;
  /** Preview maximum edge in pixels; defaults to 192. */
  maxEdge?:number;
  /** Bin count. By default it follows the chart's width, about one column per 7 pixels, so columns stay legible at any size. */
  bins?:number;
  /** Controlled histogram channel. */
  channel?:HistogramChannel;
  /** Starting channel when uncontrolled: the red, green and blue channels overlaid by default. */
  defaultChannel?:HistogramChannel;
  /** Channel selection callback. */
  onChannelChange?:(channel:HistogramChannel)=>void;
  /** Layout class. */
  className?:string;
}
/**
 * Glass UX Histogram fed by readPreview, including uncommitted slider drafts. RGB overlays one
 * histogram per channel, each in its own colour, so where channels agree reads as neutral.
 */
export function HistogramPanel({editor,maxEdge=192,bins:fixedBins,channel,defaultChannel='rgb',onChannelChange,className}:HistogramPanelProps) {
  const session=useEditor(editor);useSessionState(session);
  const well=useRef<HTMLDivElement>(null),{width}=useElementSize(well),bins=fixedBins??autoBins(width);
  const {pixels,failed}=useDevelopPreview(session,maxEdge),m=useMessages(developMessages),[own,setOwn]=useState<HistogramChannel>(defaultChannel),selected=channel??own;
  const data:HistogramData|undefined=useMemo(()=>pixels?computeHistogram(pixels,bins):undefined,[pixels,bins]);
  const state=failed?'error':pixels?'ready':'loading';
  const chart=(c:Exclude<HistogramChannel,'rgb'>,label:string)=>{
    const counts=data?.[c]??new Float64Array(bins);
    return <Histogram key={c} data-histogram-channel={c} label={label} countLabel={m.pixels} state={state} errorText={m.error} bins={Array.from(counts,(count,i)=>({from:i/bins,to:(i+1)/bins,count}))}/>;
  };
  return <div className={['gi-develop-histogram',className].filter(Boolean).join(' ')} data-testid="develop-histogram" data-weight={data?.weight??0} data-channel={selected}>
    <div className="gi-develop-histogram-head"><span className="gi-develop-histogram-title">{m.histogram}</span><Segmented size="sm" collapse="menu" aria-label={m.channel} options={CHANNELS.map(c=>({value:c,label:m[c]}))} value={selected} onValueChange={v=>{if(v){if(channel===undefined)setOwn(v);onChannelChange?.(v);}}}/></div>
    <div ref={well} className="gi-develop-histogram-chart" data-channel={selected} data-mode="dark">
      {selected==='rgb'
        ?<div className="gi-develop-histogram-rgb" role="group" aria-label={m.histogram}>{COLOURS.map(c=>chart(c,m[c]))}</div>
        :chart(selected,selected==='luminance'?m.histogram:m[selected])}
    </div>
  </div>;
}
