import { useEffect, useRef, useState } from 'react';
import { Button } from 'glass-ux/button';
import { useAnnounce } from 'glass-ux/hooks';
import { useMessages } from 'glass-ux/i18n';
import { IconSparkle } from 'glass-ux/icons';
import { Notice } from 'glass-ux/notice';
import { Progress } from 'glass-ux/progress';
import { hasEmptyEdges } from '../fill/edges.js';
import type { FillEdgesOptions } from '../fill/fill-edges.js';
import { geometryMessages } from '../messages/geometry.js';
import { PanelHint } from '../react/panel-layout.js';
import { useEditorContext, useSessionState } from '../react/session-context.js';
import type { ActionOverride, EditorSession } from '../session/index.js';

export { hasEmptyEdges, footprint } from '../fill/edges.js';
export type { FillEdgesOptions } from '../fill/fill-edges.js';

/** Action id for Fill edges. Hosts see it, with its options, through `onAction`. */
export const FILL_EDGES = 'image.fillEdges';

/**
 * Fill the empty edges as one undo step. The engine loads on first use, so a tool that offers the
 * button ships none of it until it is pressed. Tools that show `FillEdges` list this in `actions`.
 */
export const fillEdgesAction: ActionOverride = {
  id: FILL_EDGES,
  enabled: session => session.state.status === 'ready',
  run: async (session, args) => (await import('../fill/fill-edges.js')).fillEdges(session, args as FillEdgesOptions),
};

/** Whether the edit showing now leaves empty edges, counting active warps as possibly so. */
export function sessionHasEmptyEdges(session: EditorSession): boolean {
  const { draft: recipe, sourceSize } = session.state;
  if (!sourceSize) return false;
  const warps = session.renderingParts.filters.filter(filter => 'map' in filter && recipe.filters[filter.id] !== undefined);
  return hasEmptyEdges(sourceSize, recipe.geometry, warps.length > 0);
}

/**
 * The Fill edges control for a tool panel: an explanation, the button, then progress with Cancel while
 * the worker fills. Runs `image.fillEdges`, so a host can refuse it. `before` runs first, for a tool
 * with a draft to commit.
 */
export function FillEdges({ before }: { /** Commit anything the tool still holds in draft. */ before?: () => void }) {
  const session = useEditorContext();
  useSessionState(session);
  const m = useMessages(geometryMessages), announce = useAnnounce();
  const [progress, setProgress] = useState<number | null>(null), [failed, setFailed] = useState<'none' | 'failed' | null>(null);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  const empty = sessionHasEmptyEdges(session);
  const start = async () => {
    before?.();
    const controller = new AbortController();
    running.current = controller;
    setFailed(null); setProgress(0);
    try {
      const done = session.run(FILL_EDGES, { label: m.fillEdges, signal: controller.signal, onProgress: (value: number) => { if (running.current === controller) setProgress(value); } } satisfies FillEdgesOptions);
      await done;
      if (done !== undefined && !controller.signal.aborted) announce(m.edgesFilled);
    } catch (error) {
      if (!controller.signal.aborted) setFailed((error as Error)?.name === 'NoEmptyEdgesError' ? 'none' : 'failed');
    } finally {
      if (running.current === controller) { running.current = null; setProgress(null); }
    }
  };
  const cancel = () => { running.current?.abort(); running.current = null; setProgress(null); };
  return <div className="gi-fill-edges">
    <PanelHint>{m.fillEdgesHint}</PanelHint>
    {progress === null
      ? <Button size="sm" variant="secondary" icon={<IconSparkle />} disabledReason={empty ? undefined : m.noEmptyEdges} onClick={start}>{m.fillEdges}</Button>
      : <Progress size="sm" value={Math.round(progress * 100)} max={100} label={m.fillingEdges} action={<Button size="xs" variant="ghost" onClick={cancel}>{m.cancel}</Button>} />}
    {failed && <Notice compact tone={failed === 'none' ? 'info' : 'danger'}>{failed === 'none' ? m.noEmptyEdges : m.fillFailed}</Notice>}
  </div>;
}
