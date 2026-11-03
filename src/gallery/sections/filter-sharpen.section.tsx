import { useState } from "react";
import { CodeBlock } from "glass-ux/ai/code-block";
import { SliderField } from "glass-ux/slider";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { sharpen, type SharpenParams } from "glass-ux-image/filters/sharpen";
import { FilterComparison } from "../effect-family.js";

export default function Section() {
  const [params, setParams] = useState<SharpenParams>({ amount: 60 });
  return (
    <SectionPage>
      <Specimen
        title="Before and after"
        description="Amount runs from 0 to 100; the spread is fixed in document pixels."
      >
        <div className="flex w-full flex-col gap-4" data-live-demo="filter-sharpen">
          <div className="flex w-full max-w-md flex-col gap-1">
            <SliderField
              label="Amount"
              min={0}
              max={100}
              step={1}
              value={params.amount}
              onValueChange={(value) => setParams({ ...params, amount: value })}
            />
          </div>
          <FilterComparison filter={sharpen} params={params} />
        </div>
      </Specimen>
      <h2>Usage</h2>
      <CodeBlock
        language="tsx"
        code={"import { sharpen } from 'glass-ux-image/filters/sharpen';\nimport type { EditorSession } from 'glass-ux-image/session';\n\n// Pass in the session's filters: createEditorSession({ source, filters }).\nexport const filters = [sharpen];\n\n// The recipe holds the parameters under the filter's id.\nexport function crispen(editor: EditorSession) {\n  editor.run('edit.apply', { filters: { [sharpen.id]: { amount: 60 } } });\n}"}
      />
      <h2>API</h2>
      <p>
        <code>sharpen</code> is a <code>Filter</code> with matching GLSL and TypeScript passes. Its spread is fixed in document pixels; where the level being drawn has no detail left at that spread, it does nothing.
      </p>
      <a href={`${import.meta.env.BASE_URL}api/`}>Typed kernel API</a>
    </SectionPage>
  );
}
