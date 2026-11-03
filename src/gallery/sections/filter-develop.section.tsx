import { useState } from "react";
import { CodeBlock } from "glass-ux/ai/code-block";
import { SliderField } from "glass-ux/slider";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { develop, type DevelopParams } from "glass-ux-image/filters/develop";
import { FilterComparison } from "../effect-family.js";

export default function Section() {
  const [params, setParams] = useState<Partial<DevelopParams>>({ exposure: 0.3, highlights: -40, shadows: 45, temperature: 15 });
  return (
    <SectionPage>
      <Specimen
        title="Before and after"
        description="A recipe holds only the settings that differ from neutral; these are four of them."
      >
        <div className="flex w-full flex-col gap-4" data-live-demo="filter-develop">
          <div className="flex w-full max-w-md flex-col gap-1">
            <SliderField
              label="Exposure"
              origin={0}
              min={-3}
              max={3}
              step={0.05}
              value={params.exposure}
              format={(value) => `${value} stops`}
              onValueChange={(value) => setParams({ ...params, exposure: value })}
            />
            <SliderField
              label="Highlights"
              origin={0}
              min={-100}
              max={100}
              step={1}
              value={params.highlights}
              onValueChange={(value) => setParams({ ...params, highlights: value })}
            />
            <SliderField
              label="Shadows"
              origin={0}
              min={-100}
              max={100}
              step={1}
              value={params.shadows}
              onValueChange={(value) => setParams({ ...params, shadows: value })}
            />
            <SliderField
              label="Temperature"
              origin={0}
              min={-100}
              max={100}
              step={1}
              value={params.temperature}
              onValueChange={(value) => setParams({ ...params, temperature: value })}
            />
          </div>
          <FilterComparison filter={develop} params={params} />
        </div>
      </Specimen>
      <h2>Usage</h2>
      <CodeBlock
        language="tsx"
        code={"import { develop } from 'glass-ux-image/filters/develop';\nimport type { EditorSession } from 'glass-ux-image/session';\n\n// Pass in the session's filters: createEditorSession({ source, filters }).\nexport const filters = [develop];\n\n// The recipe holds the parameters under the filter's id.\nexport function openShadows(editor: EditorSession) {\n  editor.run('edit.apply', { filters: { [develop.id]: { exposure: 0.3, highlights: -40, shadows: 45, temperature: 15 } } });\n}"}
      />
      <h2>API</h2>
      <p>
        <code>develop</code> is a <code>Filter</code> over <code>Partial&lt;DevelopParams&gt;</code>: missing settings are neutral. Exposure is in stops from −5 to 5, two-way sliders run from −100 to 100, and curves, levels, HSL and colour balance are nested records. Local controls such as clarity widen its padding.
      </p>
      <a href={`${import.meta.env.BASE_URL}api/`}>Typed kernel API</a>
    </SectionPage>
  );
}
