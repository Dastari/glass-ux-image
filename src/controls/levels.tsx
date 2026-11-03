import {useState} from 'react';
import {NumberField} from 'glass-ux/number-field';
import {Field} from 'glass-ux/field';
import {useMessages} from 'glass-ux/i18n';
import {developMessages,type DevelopMessages} from '../messages/develop.js';
import {NEUTRAL_LEVELS,type Levels} from '../filters/develop/maths.js';
export type {Levels} from '../filters/develop/maths.js';
/** Session-free normalised levels, supporting controlled or uncontrolled values. */
export interface LevelsEditorProps {
  /** Controlled levels. */
  value?: Levels;
  /** Initial uncontrolled levels; defaults to neutral. */
  defaultValue?: Levels;
  /** Live levels, including typing, steppers and arrow keys. */
  onValueChange?: (value:Levels)=>void;
  /** Final levels when focus leaves a field. */
  onValueCommitted?: (value:Levels)=>void;
  /** Disable editing. */
  disabled?: boolean;
  /** Localised wording overrides. */
  labels?: Partial<DevelopMessages>;
  /** Accessible group name; defaults to Levels. */
  'aria-label'?: string;
  /** Layout class. */
  className?: string;
}
/** Keyboard-accessible input endpoints, gamma and output endpoints, using Glass UX fields. */
export function LevelsEditor({value,defaultValue,onValueChange,onValueCommitted,disabled,labels,'aria-label':label,className}:LevelsEditorProps) {
  const [own,setOwn]=useState(defaultValue??{...NEUTRAL_LEVELS}); const current=value??own;
  const m=useMessages(developMessages,{labels});
  const update=(key:keyof Levels,n:number|null)=>{
    if(n===null)return;
    const next={...current,[key]:n}; if(value===undefined)setOwn(next); onValueChange?.(next);
  };
  return <div role="group" aria-label={label??m.levels} className={['gi-develop-fields',className].filter(Boolean).join(' ')}>
    {(['inputBlack','gamma','inputWhite','outputBlack','outputWhite'] as const).map(key=><Field key={key} label={m[key]} message="auto">
      <NumberField size="sm" value={current[key]} min={key==='gamma'?0.1:key==='inputWhite'?current.inputBlack+0.001:0} max={key==='gamma'?10:key==='inputBlack'?current.inputWhite-0.001:1} step={key==='gamma'?0.05:0.01} disabled={disabled} onValueChange={n=>update(key,n)} onBlur={()=>onValueCommitted?.(current)} />
    </Field>)}
  </div>;
}
