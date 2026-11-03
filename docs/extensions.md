# Writing extensions

A tool declares UI and rendering parts; it does not create a second editor. Select it through tool.select. A Panel can use useEditorContext and preview, then commit once on release. Export it from a public entry.

## Declare a tool

```tsx
import { defineTool, useEditorContext } from 'glass-ux-image/react';
import { IconRotateCw } from 'glass-ux/icons';
function Panel() { const editor=useEditorContext(); return <button onClick={()=>editor.run('image.rotateRight')}>Turn right</button>; }
export const turn=defineTool({id:'host.turn',label:()=> 'Turn',icon:<IconRotateCw/>,Panel});
```

A filter declares CPU and GLSL passes together. This example preserves alpha and scales linear colour. Add it to session filters and put gain parameters under its id in recipe.filters. Add CPU/WebGL conformance scenes before shipping it.

```ts
import { defineFilter } from 'glass-ux-image/core';
export const gain=defineFilter<{gain:number}>({id:'host.gain',padding:()=>0,passes:params=>[{
  id:'host.gain',uniforms:{uGain:params.gain},
  glsl:'uniform float uGain; vec4 filterPixel(ivec2 p) { vec4 c = texelFetch(uSource,p,0); return vec4(c.rgb*uGain,c.a); }',
  cpu(source,target) { for(let i=0;i<source.data.length;i++) target.data[i]=source.data[i]!*(i%4===3?1:params.gain); }
}]});
```

A warp maps output positions back to source positions before filters. It has no GLSL pass. Missing samples become transparent through warpSource. A layer kind supplies a TileSource; the compositor supplies geometry, opacity and blend. Register the kind with session layerKinds and store serialisable data in LayerSpec.data.

```ts
import { defineWarp, defineLayerKind, type TileSource } from 'glass-ux-image/core';
export const offset=defineWarp<{x:number;y:number}>({id:'host.offset',map:(x,y,p)=>[x-p.x,y-p.y],reach:p=>Math.hypot(p.x,p.y)});
export function sourceKind(source:TileSource) { return defineLayerKind({kind:'host.source',source:()=>source}); }
```

Use Glass UX messages for domain words, keyboard alternatives for pointer gestures and semantic tokens for chrome. Keep authentication, persistence and application data in the host.
