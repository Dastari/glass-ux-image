# Choosing a level

Start with the smallest public part that does the job. CurvesEditor, LevelsEditor, BalanceWheel, BrushPicker, BlendModeSelect, AnchorPicker and BasicAdjustments accept plain values without a session. They can edit host data unrelated to a photo.

## A standalone curve

```tsx
import { useState } from 'react';
import { CurvesEditor, type CurvePoint } from 'glass-ux-image/controls/curves';
export function Curve() {
  const [value,setValue] = useState<readonly CurvePoint[]>([[0,0],[1,1]]);
  return <CurvesEditor value={value} onValueChange={setValue}/>;
}
```

Use PhotoEditor for a bounded photo task, ImageEditor for a workspace, hooks for a host layout, and core/render/session with no React for processing.

| Kit | Included work |
| --- | --- |
| basic | Crop, resize, rotate and simple brightness, contrast and colour |
| standard | Geometry, full develop, spot healing and effects |
| advanced | Layers, text, painting, retouching, transform and liquify |

Kits are arrays, not modes. Advanced does not automatically include standard. Combine lists by id to remove duplicates.

```tsx
import { ImageEditor } from 'glass-ux-image/editor';
import { standard } from 'glass-ux-image/kits/standard';
import { advanced } from 'glass-ux-image/kits/advanced';
const tools = [...new Map([...standard,...advanced].map(tool=>[tool.id,tool])).values()];
export function Suite({src}: {src: Blob}) { return <ImageEditor src={src} tools={tools}/>; }
```

The live templates progress from a single adjustment to avatar cropping, a product window, social text, annotation, develop and the full suite. Each shows its copyable source. Imports determine the bundle; see [performance](performance.md).
