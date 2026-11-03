// Before and after on the sample photo, for the filter and effect pages.
import { useEffect, useState } from "react";
import { useMessages } from "glass-ux/i18n";
import { Segmented } from "glass-ux/segmented";
import { SliderField } from "glass-ux/slider";
import type { Filter } from "glass-ux-image/core";
import { BeforeAfter } from "glass-ux-image/editor";
import { useImageEditor, useSessionState } from "glass-ux-image/react";
import type { EditorSession } from "glass-ux-image/session";
import {
  effectDefinitions,
  effects,
  type EffectCategory,
} from "glass-ux-image/tools/effects";
import { samplePhoto } from "./sample.js";

/** The sample photo before and after the session's current recipe, at the photo's 3:2. */
export function Comparison({ editor }: { editor: EditorSession }) {
  return (
    <div className="relative aspect-3/2 w-full max-w-3xl overflow-hidden rounded-surface border border-line">
      <BeforeAfter editor={editor} maxEdge={1200} />
    </div>
  );
}

/** One headless filter on the sample photo, with its parameters in the recipe under its id. */
export function FilterComparison<P>({ filter, params }: { filter: Filter<P>; params: P }) {
  const editor = useImageEditor({ source: samplePhoto, filters: [filter] });
  const { status } = useSessionState(editor);
  // Compared by value: a section passes a fresh object on every render.
  const key = JSON.stringify(params);
  useEffect(() => {
    if (status === "ready") editor.run("edit.apply", { filters: { [filter.id]: JSON.parse(key) } });
  }, [editor, status, filter.id, key]);
  return <Comparison editor={editor} />;
}

/** What each built-in effect does, shown under the comparison. */
const purposes: Record<string, string> = {
  "gaussian-blur": "Softens the whole picture evenly. Use it for backgrounds, or behind text that must stay readable.",
  "lens-blur": "Imitates an out-of-focus lens: bright points spread into soft discs.",
  "motion-blur": "Smears the picture in one direction, as if the camera moved during the exposure.",
  "radial-blur": "Blurs outwards from the centre, for a sense of zoom or speed.",
  "tilt-shift": "Keeps a horizontal band sharp and blurs above and below it, so a wide scene looks like a model.",
  "detail-enhancement": "Lifts fine local contrast in textures such as foliage, rock and water.",
  "high-pass": "Keeps edges and fine detail and removes broad tone. Usually blended over the original to sharpen it.",
  "unsharp-mask": "Classic sharpening: raises contrast along edges, over the chosen radius.",
  cartoon: "Flattens colour into areas and darkens their edges, like an inked drawing.",
  "oil-painting": "Gathers nearby pixels into brush-like patches of colour.",
  "pencil-sketch": "Draws the picture's edges as pencil lines on white paper.",
  watercolour: "Softens colour into washes, darker where they meet.",
  faded: "Lifts the blacks and lowers saturation, like a print left in the sun.",
  "film-grain": "Adds fine grain, as on photographic film. The seed keeps the pattern the same on every render.",
  sepia: "Tones the picture in warm browns, like an early photographic print.",
  bloom: "Spreads the brightest areas into a soft glow. The threshold sets how bright an area must be.",
  glow: "Adds a soft halo around every bright area.",
  "lens-flare": "Adds the streak and rings a bright light makes inside a lens.",
  vignette: "Darkens the corners to draw the eye to the centre.",
  fisheye: "Bulges the centre outwards, like an ultra-wide lens.",
  ripple: "Moves pixels in rings, like a stone dropped in still water.",
  twirl: "Turns the centre further than the edges, in a spiral.",
  wave: "Displaces the picture in parallel waves.",
  halftone: "Rebuilds the picture from dots of varying size, like newspaper print.",
  mosaic: "Breaks the picture into tiles of flat colour.",
  pixelate: "Replaces each square cell with its average colour. Often used to hide a face or a number plate.",
  "add-noise": "Adds random variation to every pixel, for texture or to hide banding in smooth gradients.",
  "reduce-noise": "Smooths random speckle while keeping edges.",
  "remove-grain": "Removes fine grain from even areas such as sky and water.",
  emboss: "Shows edges as raised relief, lit from one side.",
  posterise: "Reduces each channel to a few levels, for flat bands of colour.",
  solarise: "Inverts the tones above a pivot, as when a print is exposed to light while it develops.",
  threshold: "Turns every pixel black or white around a pivot.",
  "lut-grading": "Maps every colour through a 3D lookup table, the format colourists exchange grades in. Hosts import .cube files; this demo supplies a small warm table.",
};

export interface EffectFamilyProps {
  /** The effects tool's category to show. */
  category: EffectCategory;
  /** Parameters for an effect, replacing its catalogue defaults. */
  params?: Readonly<Record<string, Record<string, unknown>>>;
}

/**
 * Every effect in a category on the sample photo: pick one, set its strength, and drag the
 * divider. Names come from the effects tool's message pack, so they follow the site's language.
 */
export function EffectFamily({ category, params = {} }: EffectFamilyProps) {
  const words = useMessages(effects.messages!) as Record<string, string>;
  const candidates = effectDefinitions.filter((d) => d.category === category);
  const [id, setId] = useState(candidates[0]!.id);
  const [strength, setStrength] = useState(100);
  const editor = useImageEditor({ source: samplePhoto, tools: [effects] });
  const { status } = useSessionState(editor);
  const selected = candidates.find((d) => d.id === id)!;
  const chosen = params[id] ?? selected.params;
  const key = JSON.stringify(chosen);
  useEffect(() => {
    if (status !== "ready") return;
    const entries = [{ id: "sample", filter: id, params: JSON.parse(key), strength: strength / 100 }];
    // Warps and filters run in separate stages, as the effects tool records them.
    editor.run("edit.apply", {
      filters:
        category === "distortion"
          ? { "effects-warps": { entries } }
          : { "effects-stack": { entries } },
    });
  }, [editor, status, id, strength, key, category]);
  const name = (label: string) => words[label] ?? label;
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {candidates.length > 1 && (
          <Segmented
            aria-label="Effect"
            value={id}
            onValueChange={setId}
            options={candidates.map((d) => ({ value: d.id, label: name(d.label) }))}
          />
        )}
        <SliderField
          className="min-w-64 flex-1"
          label={words.strength ?? "Strength"}
          min={0}
          max={100}
          step={5}
          value={strength}
          format={(value) => `${value}%`}
          onValueChange={setStrength}
        />
      </div>
      <Comparison editor={editor} />
      <p className="type-body text-fg-muted">
        <strong className="text-fg">{name(selected.label)}.</strong> {purposes[id]}
      </p>
    </div>
  );
}
