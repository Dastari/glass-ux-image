import { useState } from "react";
import { SliderField } from "glass-ux/slider";
import { SectionPage, Specimen } from "glass-ux-docs-kit/react";
import { BrushCursor } from "glass-ux-image/controls/brush-cursor";

const photo = `${import.meta.env.BASE_URL}sample.png`;

function BrushCursorSample() {
  const [size, setSize] = useState(80);
  const [hardness, setHardness] = useState(60);
  const [at, setAt] = useState({ x: 240, y: 150 });
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <SliderField label="Size" min={8} max={200} value={size} onValueChange={setSize} format={(v) => `${v} px`} />
        <SliderField label="Hardness" min={0} max={100} value={hardness} onValueChange={setHardness} format={(v) => `${v}%`} />
      </div>
      <div
        className="relative cursor-none overflow-hidden rounded-surface border border-line"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAt({ x: event.clientX - box.left, y: event.clientY - box.top });
        }}
      >
        <img src={photo} alt="A mountain lake at dusk, with snow on the far ridge and pines in the foreground" draggable={false} className="block aspect-3/2 w-full select-none" />
        <BrushCursor x={at.x} y={at.y} radiusX={size / 2} hardness={hardness / 100} />
      </div>
    </div>
  );
}

export default function Section() {
  return (
    <SectionPage>
      <Specimen
        title="Size and hardness"
        description="Move the pointer over the photo. The outer ring is the brush's size; the dashed inner ring is where it paints at full strength. It is drawn in screen pixels, so it stays sharp at any zoom."
      >
        <div data-live-demo="brush-cursor" className="w-full">
          <BrushCursorSample />
        </div>
      </Specimen>
    </SectionPage>
  );
}
