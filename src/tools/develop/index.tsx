import {IconAdjust} from 'glass-ux/icons';
import {defineTool} from '../../react/index.js';
import {develop as developFilter} from '../../filters/develop/index.js';
import {developMessages} from '../../messages/develop.js';
import {developActions} from './actions.js';
import {DevelopBasicPanel,ToneCurvePanel,HslPanel,ColourBalancePanel,DetailPanel,DevelopLevelsPanel} from './panels.js';
import {DevelopCompareOverlay} from './compare.js';
export * from './panels.js';
export * from './actions.js';
export * from './compare.js';
export * from './state.js';
/** Complete develop tool; sections are public panels in Lightroom order. */
export const develop=defineTool({
  id:'develop',group:'develop',messages:developMessages,label:m=>m.develop,icon:<IconAdjust/>,
  filters:[developFilter],actions:developActions,Overlay:DevelopCompareOverlay,
  Sections:[
    {id:'basic',label:m=>m.basic,Panel:DevelopBasicPanel},
    {id:'tone-curve',label:m=>m.toneCurve,Panel:ToneCurvePanel},
    {id:'hsl',label:m=>m.hsl,Panel:HslPanel},
    {id:'colour-balance',label:m=>m.colourBalance,Panel:ColourBalancePanel},
    {id:'detail',label:m=>m.detail,Panel:DetailPanel},
    {id:'levels',label:m=>m.levels,Panel:DevelopLevelsPanel},
  ],
});
