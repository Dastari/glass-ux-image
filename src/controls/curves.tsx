import {useRef,useState} from 'react';
import {Button} from 'glass-ux/button';
import {Field} from 'glass-ux/field';
import {NumberField} from 'glass-ux/number-field';
import {Select} from 'glass-ux/select';
import {useMessages} from 'glass-ux/i18n';
import {formatPercent,useLocale} from 'glass-ux/locale';
import {developMessages,type DevelopMessages} from '../messages/develop.js';
import {clamp,curveSpline,IDENTITY_CURVE,type CurvePoint} from '../filters/develop/maths.js';
export type {CurvePoint} from '../filters/develop/maths.js';
/** Plain normalised spline points, with no editor/session dependency. */
export interface CurvesEditorProps {
  /** Controlled points, strictly increasing in x, with endpoints at x=0 and x=1. */
  value?: readonly CurvePoint[];
  /** Initial uncontrolled points, defaulting to the identity. */
  defaultValue?: readonly CurvePoint[];
  /** Live points during a drag, key or numeric change. */
  onValueChange?: (value:readonly CurvePoint[])=>void;
  /** Final points on release, a key step, or field blur. */
  onValueCommitted?: (value:readonly CurvePoint[])=>void;
  /** Disable all editing. */
  disabled?: boolean;
  /** Localised wording overrides. */
  labels?: Partial<DevelopMessages>;
  /** Accessible name of the curve editor. */
  'aria-label'?: string;
  /** Layout class. */
  className?: string;
}
/** An image-specific spline graph; Glass UX fields expose every point to keyboard users. */
export function CurvesEditor({value,defaultValue,onValueChange,onValueCommitted,disabled,labels,'aria-label':label,className}:CurvesEditorProps) {
  const [own,setOwn]=useState(defaultValue??IDENTITY_CURVE),[selected,setSelected]=useState(0);
  const points=value??own, latest=useRef(points); latest.current=points;
  const index=Math.min(selected,points.length-1),point=points[index]!;
  const m=useMessages(developMessages,{labels}),locale=useLocale();
  const publish=(next:readonly CurvePoint[],commit=false)=>{latest.current=next;if(value===undefined)setOwn(next);onValueChange?.(next);if(commit)onValueCommitted?.(next);};
  const move=(i:number,x:number,y:number,commit=false)=>{
    const next=latest.current.map((p,j)=>j===i ? [i===0?0:i===latest.current.length-1?1:clamp(x,latest.current[i-1]![0]+0.001,latest.current[i+1]![0]-0.001),clamp(y)] as const:p);
    publish(next,commit);
  };
  const spline=curveSpline(points),path=Array.from({length:129},(_,i)=>`${i?'L':'M'} ${i/128*256} ${(1-spline(i/128))*256}`).join(' ');
  const add=()=>{
    let at=0;for(let i=1;i<points.length-1;i++)if(points[i+1]![0]-points[i]![0]>points[at+1]![0]-points[at]![0])at=i;
    const x=(points[at]![0]+points[at+1]![0])/2;const next=[...points.slice(0,at+1),[x,spline(x)] as const,...points.slice(at+1)];setSelected(at+1);publish(next,true);
  };
  return <div role="group" aria-label={label??m.toneCurve} className={['gi-develop-fields',className].filter(Boolean).join(' ')}>
    <svg className="gi-develop-curve" viewBox="-12 -12 280 280" aria-hidden="true">
      <path className="gi-develop-curve-grid" d="M0 0H256V256H0Z M0 128H256 M128 0V256 M0 256L256 0"/>
      <path className="gi-develop-curve-line" d={path}/>
      {points.map(([x,y],i)=><g key={i} onPointerDown={event=>{if(disabled)return;setSelected(i);event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const rect=event.currentTarget.ownerSVGElement!.getBoundingClientRect();move(i,((event.clientX-rect.left)/rect.width*280-12)/256,1-((event.clientY-rect.top)/rect.height*280-12)/256);}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId)){event.currentTarget.releasePointerCapture(event.pointerId);onValueCommitted?.(latest.current);}}} onPointerCancel={()=>{onValueCommitted?.(latest.current);}}>
        <circle cx={x*256} cy={(1-y)*256} r="22" className="gi-develop-curve-hit"/>
        <circle cx={x*256} cy={(1-y)*256} r="7" className="gi-develop-curve-point" data-selected={i===index?'':undefined}/>
      </g>)}
    </svg>
    <Field label={m.point} message="auto"><Select size="sm" aria-label={m.point} value={String(index)} disabled={disabled} options={points.map((p,i)=>({value:String(i),label:formatPercent(locale,p[0]*100,0)}))} onValueChange={v=>v!==null&&setSelected(Number(v))}/></Field>
    <Field label={m.input} message="auto"><NumberField size="sm" value={point[0]} min={index===0?0:points[index-1]![0]+0.001} max={index===points.length-1?1:points[index+1]![0]-0.001} step={0.01} disabled={disabled||index===0||index===points.length-1} onValueChange={n=>n!==null&&move(index,n,point[1])} onBlur={()=>onValueCommitted?.(latest.current)}/></Field>
    <Field label={m.output} message="auto"><NumberField size="sm" value={point[1]} min={0} max={1} step={0.01} disabled={disabled} onValueChange={n=>n!==null&&move(index,point[0],n)} onBlur={()=>onValueCommitted?.(latest.current)}/></Field>
    <div className="gi-develop-buttons"><Button size="sm" variant="secondary" disabled={disabled||points.length>=32} onClick={add}>{m.addPoint}</Button><Button size="sm" variant="ghost" disabled={disabled||index===0||index===points.length-1} onClick={()=>{publish(points.filter((_,i)=>i!==index),true);setSelected(index-1);}}>{m.removePoint}</Button></div>
  </div>;
}
