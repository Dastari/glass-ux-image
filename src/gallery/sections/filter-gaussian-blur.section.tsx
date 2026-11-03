import { useState } from "react";
import { CodeBlock } from "glass-ux/ai/code-block";
import { SliderField } from "glass-ux/slider";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { gaussianBlur, type GaussianBlurParams } from "glass-ux-image/filters/gaussian-blur";
import { FilterComparison } from "../effect-family.js";

export default function Section() {
  const [params, setParams] = useState<GaussianBlurParams>({ sigma: 6 });
  return (
    <SectionPage>
      <Specimen
        title="Before and after"
        description="Sigma is in document pixels, so the result looks the same at every zoom."
      >
        <div className="flex w-full flex-col gap-4" data-live-demo="filter-gaussian-blur">
          <div className="flex w-full max-w-md flex-col gap-1">
            <SliderField
              label="Sigma"
              min={0}
              max={24}
              step={0.5}
              value={params.sigma}
              format={(value) => `${value} px`}
              onValueChange={(value) => setParams({ ...params, sigma: value })}
            />
          </div>
          <FilterComparison filter={gaussianBlur} params={params} />
        </div>
      </Specimen>
      <h2>Usage</h2>
      <CodeBlock
        language="tsx"
        code={"import { gaussianBlur } from 'glass-ux-image/filters/gaussian-blur';\nimport type { EditorSession } from 'glass-ux-image/session';\n\n// Pass in the session's filters: createEditorSession({ source, filters }).\nexport const filters = [gaussianBlur];\n\n// The recipe holds the parameters under the filter's id.\nexport function softenBackground(editor: EditorSession) {\n  editor.run('edit.apply', { filters: { [gaussianBlur.id]: { sigma: 6 } } });\n}"}
      />
      <h2>API</h2>
      <p>
        <code>gaussianBlur</code> is a <code>Filter</code> whose padding grows with sigma, so tiles blur across their edges without seams. Below about half a pixel at the level being drawn it skips the pass.
      </p>
      <a href={`${import.meta.env.BASE_URL}api/`}>Typed kernel API</a>
    </SectionPage>
  );
}
