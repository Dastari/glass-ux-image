import {useState} from 'react';
import {Button} from 'glass-ux/button';
import {Segmented} from 'glass-ux/segmented';
import {Select} from 'glass-ux/select';
import {Field} from 'glass-ux/field';
import {SliderField} from 'glass-ux/slider';
import {useMessages} from 'glass-ux/i18n';
import {IconSparkle,IconSplitHorizontal} from 'glass-ux/icons';
import {useSessionState} from '../../react/index.js';
import {PanelActions,PanelGroup} from '../../react/panel-layout.js';
import {CurvesEditor} from '../../controls/curves.js';
import {LevelsEditor} from '../../controls/levels.js';
import {BalanceWheel} from '../../controls/balance-wheel.js';
import {COLOUR_RANGES,NEUTRAL,type Channel,type ColourRange,type DevelopParams} from '../../filters/develop/params.js';
import {developMessages} from '../../messages/develop.js';
import {HistogramPanel} from '../../panels/histogram.js';
import {useDevelop,type DevelopPanelProps} from './state.js';
export type {DevelopPanelProps} from './state.js';
type ScalarKey={ [K in keyof DevelopParams]:DevelopParams[K] extends number?K:never }[keyof DevelopParams];
function Sliders({controls,editor}:DevelopPanelProps&{controls:readonly ScalarKey[]}) {
  const {value,preview,commit}=useDevelop(editor),m=useMessages(developMessages);
  return <>{controls.map(key=><SliderField message="auto" key={key} size="sm" origin={0} label={m[key==='hueShift'?'hue':key]} min={key==='exposure'?-5:key==='hueShift'?-180:-100} max={key==='exposure'?5:key==='hueShift'?180:100} step={key==='exposure'?0.1:1} value={value[key]} onValueChange={n=>preview({[key]:n})} onValueCommitted={commit}/>)}</>;
}
/** Full Basic section: histogram, linear exposure, tone, white balance and colour. */
export function DevelopBasicPanel({editor}:DevelopPanelProps) {
  const {session}=useDevelop(editor),m=useMessages(developMessages),[busy,setBusy]=useState(false);
  const comparing=Boolean(useSessionState(session).toolData['develop.compare']);
  return <div className="gi-panel"><HistogramPanel editor={session}/>
    <div className="gi-panel-inline"><Button size="sm" variant="secondary" icon={<IconSparkle/>} status={busy?'pending':undefined} disabled={busy} onClick={async()=>{setBusy(true);try{await session.run('develop.autoEnhance');}finally{setBusy(false);}}}>{m.autoEnhance}</Button><Button size="sm" variant={comparing?'soft':'secondary'} icon={<IconSplitHorizontal/>} aria-label={m.comparison} aria-pressed={comparing} onClick={()=>session.run('develop.compare')}/></div>
    <div className="gi-develop-fields"><Sliders editor={session} controls={['exposure','brightness','contrast','highlights','shadows','whites','blacks']}/></div>
    <PanelGroup label={m.colour}><div className="gi-develop-fields"><Sliders editor={session} controls={['temperature','tint','saturation','vibrance','hueShift']}/></div></PanelGroup>
    <PanelActions><Button size="sm" variant="ghost" onClick={()=>session.run('edit.apply',{filters:{...session.state.draft.filters,develop:NEUTRAL}})}>{m.reset}</Button></PanelActions></div>;
}
function ChannelSelect({value,onChange}:{value:Channel;onChange:(value:Channel)=>void}) {
  const m=useMessages(developMessages);
  return <Field label={m.channel} message="auto"><Segmented collapse="auto" size="sm" aria-label={m.channel} options={(['rgb','red','green','blue'] as const).map(c=>({value:c,label:m[c]}))} value={value} onValueChange={v=>v&&onChange(v)}/></Field>;
}
/** Session-bound RGB and per-channel tone curves. */
export function ToneCurvePanel({editor}:DevelopPanelProps) {
  const {value,preview,commit}=useDevelop(editor),[channel,setChannel]=useState<Channel>('rgb');
  return <div className="gi-panel"><ChannelSelect value={channel} onChange={setChannel}/><CurvesEditor value={value.curves[channel]} onValueChange={points=>preview({curves:{...value.curves,[channel]:points}})} onValueCommitted={commit}/></div>;
}
/** Session-bound master and per-channel levels. */
export function DevelopLevelsPanel({editor}:DevelopPanelProps) {
  const {value,preview,commit}=useDevelop(editor),[channel,setChannel]=useState<Channel>('rgb');
  return <div className="gi-panel"><ChannelSelect value={channel} onChange={setChannel}/><LevelsEditor value={value.levels[channel]} onValueChange={levels=>preview({levels:{...value.levels,[channel]:levels}})} onValueCommitted={commit}/></div>;
}
/** Eight colour ranges with smoothly overlapping hue, saturation and luminance adjustments. */
export function HslPanel({editor}:DevelopPanelProps) {
  const {value,preview,commit}=useDevelop(editor),m=useMessages(developMessages),[range,setRange]=useState<ColourRange>('red');
  return <div className="gi-panel"><Field label={m.range} message="auto"><Select size="sm" aria-label={m.range} value={range} options={COLOUR_RANGES.map(c=>({value:c,label:m[c]}))} onValueChange={v=>v&&setRange(v)}/></Field>{(['hue','saturation','luminance'] as const).map(key=><SliderField message="auto" key={key} label={m[key]} size="sm" origin={0} min={-100} max={100} step={1} value={value.hsl[range][key]} onValueChange={n=>preview({hsl:{...value.hsl,[range]:{...value.hsl[range],[key]:n}}})} onValueCommitted={commit}/>)}</div>;
}
/** Shadow, midtone and highlight colour-balance wheels. */
export function ColourBalancePanel({editor}:DevelopPanelProps) {
  const {value,preview,commit}=useDevelop(editor),m=useMessages(developMessages),[range,setRange]=useState<'shadows'|'midtones'|'highlights'>('midtones');
  return <div className="gi-panel"><Field label={m.range} message="auto"><Segmented collapse="auto" size="sm" aria-label={m.range} value={range} options={(['shadows','midtones','highlights'] as const).map(c=>({value:c,label:m[c]}))} onValueChange={v=>v&&setRange(v)}/></Field><BalanceWheel key={range} className="gi-develop-balance" size="md" aria-label={m[range]} value={value.colourBalance[range]} onValueChange={v=>preview({colourBalance:{...value.colourBalance,[range]:v}})} onValueCommitted={commit}/></div>;
}
/** Saved-input clarity, texture and dehaze. */
export function DetailPanel({editor}:DevelopPanelProps) {return <div className="gi-panel"><Sliders editor={editor} controls={['clarity','texture','dehaze']}/></div>;}
