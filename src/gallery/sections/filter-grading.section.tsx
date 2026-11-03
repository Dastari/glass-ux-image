import { CodeBlock } from "glass-ux/ai/code-block";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { generateLut } from "glass-ux-image/filters/effects/grading";
import { EffectFamily } from "../effect-family.js";

// A warm grade: blue pulled down, green slightly. Hosts usually import a .cube file instead.
const warm = generateLut(17, ([r, g, b]) => [r, g * 0.94, b * 0.78]);

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Before and after"
        description="Set the strength and drag the divider to compare the graded photo with the original."
      >
        <div className="w-full" data-live-demo="filter-grading">
          <EffectFamily
            category="grading"
            params={{ "lut-grading": { amount: 1, lut: { ...warm, title: "Warm" } } }}
          />
        </div>
      </Specimen>
      <h2>Usage</h2>
      <p>
        The effects panel imports <code>.cube</code> files. A host can also build a table in code
        and add it as an undoable step.
      </p>
      <CodeBlock
        language="tsx"
        code={
          "import { effects } from 'glass-ux-image/tools/effects';\nimport { generateLut } from 'glass-ux-image/filters/effects/grading';\nimport type { EditorSession } from 'glass-ux-image/session';\n\nexport const tools = [effects];\n\nconst warm = generateLut(17, ([r, g, b]) => [r, g * 0.94, b * 0.78]);\n\nexport function addWarmGrade(editor: EditorSession) {\n  editor.run('effects.add', {\n    label: 'Warm grade',\n    entry: {\n      id: 'warm-1',\n      filter: 'lut-grading',\n      params: { amount: 1, lut: warm },\n      strength: 1,\n    },\n  });\n}"
        }
      />
      <h2>API</h2>
      <p>
        <code>lutGrading</code> in <code>glass-ux-image/filters/effects/grading</code> maps linear RGB
        through a <code>Lut3D</code>: a cube of 2 to 64 samples a side, red varying fastest. No
        transfer function is applied, so a table made for display-encoded colour needs converting
        first. <code>validateLut</code> checks a table before it renders; <code>amount</code> 0 or
        a <code>null</code> table is neutral.
      </p>
      <a href={`${import.meta.env.BASE_URL}api/`}>Kernel types and parameters</a>
    </SectionPage>
  );
}
