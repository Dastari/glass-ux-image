import { Surface } from 'glass-ux/surface';
import { BasicAdjustments } from 'glass-ux-image/tools/develop/basic';
/** Session-free control, small enough to use without an editor. */
export function SingleAdjustment(){return <div className="grid h-full place-items-center p-4"><Surface material="panel" radius="surface" padding="panel" className="w-full max-w-sm"><BasicAdjustments controls={['brightness']}/></Surface></div>;}
