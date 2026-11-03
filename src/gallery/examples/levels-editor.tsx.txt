import { useState } from "react";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { LevelsEditor, type Levels } from "glass-ux-image/controls/levels";

function LevelsEditorSample() {
  const [levels, setLevels] = useState<Levels>({
    inputBlack: 0.06,
    gamma: 1.2,
    inputWhite: 0.94,
    outputBlack: 0,
    outputWhite: 1,
  });
  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <LevelsEditor value={levels} onValueChange={setLevels} />
      <output aria-live="polite" className="type-caption text-fg-muted">
        Input {levels.inputBlack.toFixed(2)} to {levels.inputWhite.toFixed(2)}, gamma{" "}
        {levels.gamma.toFixed(2)}, output {levels.outputBlack.toFixed(2)} to{" "}
        {levels.outputWhite.toFixed(2)}
      </output>
    </div>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Black, gamma and white points"
        description="Plain values from 0 to 1. Pulling the input black and white points in stretches a flat photo's tones; a gamma above 1 lifts the midtones."
      >
        <div data-live-demo="levels-editor" className="w-full">
          <LevelsEditorSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
