import { Button } from "glass-ux/button";
import { IconAdjust } from "glass-ux/icons";
import { useMessages } from "glass-ux/i18n";
import { SliderField } from "glass-ux/slider";
import { adjust as adjustFilter, NEUTRAL_ADJUST, type AdjustParams } from "../filters/adjust.js";
import { sharpen, type SharpenParams } from "../filters/sharpen.js";
import { imageEditorMessages, type ImageEditorMessages } from "../react/messages.js";
import { useEditorContext, useSessionState } from "../react/session-context.js";
import { defineTool } from "../react/tool.js";
import { PanelActions } from "../react/panel-layout.js";

const LEVELS: Array<keyof AdjustParams & keyof ImageEditorMessages> = ["brightness", "contrast", "saturation", "warmth"];

function AdjustPanel() {
  const session = useEditorContext();
  const { draft } = useSessionState(session);
  const messages = useMessages(imageEditorMessages);
  const levels = (draft.filters.adjust as AdjustParams | undefined) ?? NEUTRAL_ADJUST;
  const detail = (draft.filters.sharpen as SharpenParams | undefined) ?? { amount: 0 };
  const commit = () => session.run("edit.apply");
  const untouched = !draft.filters.adjust && !draft.filters.sharpen;

  const reset = () => {
    const { adjust: _adjust, sharpen: _sharpen, ...rest } = session.state.recipe.filters;
    session.run("edit.apply", { filters: rest });
  };

  return (
    <div className="gi-panel gi-develop-fields">
      {LEVELS.map((level) => (
        <SliderField
          key={level}
          label={messages[level]}
          origin={0}
          min={-100}
          max={100}
          step={1}
          size="sm"
          value={levels[level]}
          onValueChange={(value) => session.previewFilter("adjust", { ...levels, [level]: value })}
          onValueCommitted={commit}
        />
      ))}
      <SliderField
        label={messages.sharpen}
        min={0}
        max={100}
        step={1}
        size="sm"
        value={detail.amount}
        onValueChange={(amount) => session.previewFilter("sharpen", { amount })}
        onValueCommitted={commit}
      />
      <PanelActions>
        <Button variant="ghost" size="sm" disabled={untouched} onClick={reset}>
          {messages.reset}
        </Button>
      </PanelActions>
    </div>
  );
}

/** Brightness, contrast, saturation, warmth and sharpening. */
export const adjust = defineTool({
  id: "adjust",
  label: (messages) => messages.adjust,
  icon: <IconAdjust />,
  shortcut: "a",
  filters: [adjustFilter, sharpen],
  Panel: AdjustPanel,
});
