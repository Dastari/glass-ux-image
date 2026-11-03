import {useRef,useState} from 'react';
import {ColorWheel} from 'glass-ux/color-wheel';
import {useMessages} from 'glass-ux/i18n';
import {developMessages,type DevelopMessages} from '../messages/develop.js';
import type {Triple} from '../filters/develop/maths.js';

/** A wheel position: the OKLCH hue in degrees and how far from neutral, 0 to 100. */
export interface BalanceWheelValue { hue:number; amount:number }

// OKLab and linear sRGB (Björn Ottosson's matrices), for the direction a hue pushes red, green and blue.
const LIGHTNESS=.75,EPSILON=1e-3;
function oklabToRgb(L:number,a:number,b:number):Triple {
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
}
function rgbToOklab([r,g,b]:Triple):Triple {
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
const GREY=oklabToRgb(LIGHTNESS,0,0);
const round=(n:number)=>Math.round(n*100)/100||0;

/** Red, green and blue offsets (-100 to 100) that push towards `hue` by `amount`; the largest offset is `amount`. */
export function wheelToBalance({hue,amount}:BalanceWheelValue):Triple {
  const t=hue*Math.PI/180,c=oklabToRgb(LIGHTNESS,EPSILON*Math.cos(t),EPSILON*Math.sin(t));
  const d=c.map((v,i)=>v-GREY[i]!),peak=Math.max(...d.map(Math.abs));
  return d.map(v=>round(v/peak*amount)) as unknown as Triple;
}
/**
 * The wheel position for red, green and blue offsets: the hue they push towards and the largest
 * offset. A neutral offset keeps `hue`, so a wheel brought back to the centre remembers its colour.
 */
export function balanceToWheel(offsets:Triple,hue=0):BalanceWheelValue {
  const amount=Math.max(...offsets.map(Math.abs));
  if(amount<1e-6)return {hue,amount:0};
  const [,a,b]=rgbToOklab(offsets.map((v,i)=>GREY[i]!+v/amount*EPSILON) as unknown as Triple),[,a0,b0]=rgbToOklab(GREY);
  return {hue:((Math.atan2(b-b0,a-a0)*180/Math.PI)%360+360)%360,amount:Math.min(100,amount)};
}

/** A session-free colour balance for one tonal range, on Glass UX's colour wheel. */
export interface BalanceWheelProps {
  /** Controlled red, green and blue offsets, each -100 to 100; [0,0,0] is neutral. */
  value?: Triple;
  /** Initial uncontrolled offsets. */
  defaultValue?: Triple;
  /** Live offsets, while dragging too. */
  onValueChange?: (value:Triple)=>void;
  /** Final offsets, once per gesture or key press. */
  onValueCommitted?: (value:Triple)=>void;
  /** `sm` (default) for tool panels, or `md`. */
  size?: 'sm'|'md';
  /** `disc` (default) shows the colour itself; `ring` is quieter where several wheels sit together. */
  variant?: 'disc'|'ring';
  disabled?: boolean;
  /** Localised wording overrides. */
  labels?: Partial<DevelopMessages>;
  /** Accessible name, such as the tonal range. Defaults to "Colour balance". */
  'aria-label'?: string;
  /** Layout class. */
  className?: string;
}
/**
 * Push one tonal range towards a colour: the hue is the direction and the distance from the centre
 * is how far. The value stays the develop filter's red, green and blue offsets, so recipes are
 * unchanged; `wheelToBalance` and `balanceToWheel` convert between the two.
 */
export function BalanceWheel({value,defaultValue,onValueChange,onValueCommitted,size='sm',variant,disabled,labels,'aria-label':label,className}:BalanceWheelProps) {
  const [own,setOwn]=useState<Triple>(defaultValue??[0,0,0]),current=value??own,m=useMessages(developMessages,{labels});
  const hue=useRef<number|null>(null);
  const shown=balanceToWheel(current,hue.current??0);
  // Converting back and forth can move the hue by a fraction of a degree, so the wheel keeps its own while it is the source.
  if(hue.current===null||shown.amount>0)hue.current=shown.hue;
  const change=(next:BalanceWheelValue)=>{hue.current=next.hue;const offsets=wheelToBalance(next);if(value===undefined)setOwn(offsets);onValueChange?.(offsets);};
  return <ColorWheel className={className} size={size} {...(variant?{variant}:{})} readout disabled={disabled} aria-label={label??m.colourBalance} value={{hue:hue.current,amount:shown.amount}} onValueChange={change} onValueCommitted={next=>onValueCommitted?.(wheelToBalance(next))}/>;
}
