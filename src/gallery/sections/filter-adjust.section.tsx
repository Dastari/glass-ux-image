import { useState } from "react";
import { CodeBlock } from "glass-ux/ai/code-block";
import { SliderField } from "glass-ux/slider";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { adjust, type AdjustParams } from "glass-ux-image/filters/adjust";
import { FilterComparison } from "../effect-family.js";

export default function Section() {
  const [params, setParams] = useState<AdjustParams>({ brightness: 10, contrast: 15, saturation: 10, warmth: 25 });
  return (
    <SectionPage>
      <Specimen
        title="Before and after"
        description="Each value runs from −100 to 100, and 0 leaves the picture alone."
      >
        <div className="flex w-full flex-col gap-4" data-live-demo="filter-adjust">
          <div className="flex w-full max-w-md flex-col gap-1">
            <SliderField
              label="Brightness"
              origin={0}
              min={-100}
              max={100}
              step={1}
              value={params.brightness}
              onValueChange={(value) => setParams({ ...params, brightness: value })}
            />
            <SliderField
              label="Contrast"
              origin={0}
              min={-100}
              max={100}
              step={1}
              value={params.contrast}
              onValueChange={(value) => setParams({ ...params, contrast: value })}
            />
            <SliderField
              label="Saturation"
              origin={0}
              min={-100}
              max={100}
              step={1}
              value={params.saturation}
              onValueChange={(value) => setParams({ ...params, saturation: value })}
            />
            <SliderField
              label="Warmth"
              origin={0}
              min={-100}
              max={100}
              step={1}
              value={params.warmth}
              onValueChange={(value) => setParams({ ...params, warmth: value })}
            />
          </div>
          <FilterComparison filter={adjust} params={params} />
        </div>
      </Specimen>
      <h2>Usage</h2>
      <CodeBlock
        language="tsx"
        code={"import { adjust } from 'glass-ux-image/filters/adjust';\nimport type { EditorSession } from 'glass-ux-image/session';\n\n// Pass in the session's filters: createEditorSession({ source, filters }).\nexport const filters = [adjust];\n\n// The recipe holds the parameters under the filter's id.\nexport function warmUp(editor: EditorSession) {\n  editor.run('edit.apply', { filters: { [adjust.id]: { brightness: 10, contrast: 15, saturation: 10, warmth: 25 } } });\n}"}
      />
      <h2>API</h2>
      <p>
        <code>adjust</code> is a <code>Filter</code> with an id, <code>padding(params, scale)</code> and <code>passes(params, scale, frame)</code>. Its GLSL and TypeScript passes both work on linear premultiplied RGBA. Brightness is in stops at full scale, and contrast pivots on middle grey.
      </p>
      <a href={`${import.meta.env.BASE_URL}api/`}>Typed kernel API</a>
    </SectionPage>
  );
}
