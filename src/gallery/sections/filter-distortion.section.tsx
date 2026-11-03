import { CodeBlock } from "glass-ux/ai/code-block";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { EffectFamily } from "../effect-family.js";

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Before and after"
        description="Choose an effect, set its strength and drag the divider to compare it with the original."
      >
        <div className="w-full" data-live-demo="filter-distortion">
          <EffectFamily category="distortion" />
        </div>
      </Specimen>
      <h2>Usage</h2>
      <p>Hosts add effects through the effects tool, so each one is an undoable, labelled step.</p>
      <CodeBlock
        language="tsx"
        code={"import { effects } from 'glass-ux-image/tools/effects';\nimport type { EditorSession } from 'glass-ux-image/session';\n\nexport const tools = [effects];\n\n// One undoable step, which onAction can see and refuse.\nexport function addTwirl(editor: EditorSession) {\n  editor.run('effects.add', {\n    label: 'Twirl',\n    entry: {\n      id: 'twirl-1',\n      filter: 'twirl',\n      params: { amount: 0.7, radius: 150, wavelength: 40 },\n      strength: 0.8,\n    },\n  });\n}"}
      />
      <h2>API</h2>
      <p>
        Each effect is also a kernel in <code>glass-ux-image/filters/effects/distortion</code>, such as <code>twirl</code>, for headless use. A distortion kernel is a warp: it exposes <code>id</code>, <code>map</code> and <code>reach</code>, and moves pixels rather than changing them. Parameters are in document pixels. <code>strength</code> blends the effect with the picture before it, from 0 to 1.
      </p>
      <a href={`${import.meta.env.BASE_URL}api/`}>Kernel types and parameters</a>
    </SectionPage>
  );
}
