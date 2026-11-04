import type { ActionOverride, EditorSession } from '../session/index.js';
import { applyMetadataEdits, isWritableMetadataKey, listMetadata, mergeMetadataEdits, type MetadataChange } from '../io/metadata/edits.js';

/** Arguments every metadata action takes: the change, and the history label it records. */
export interface MetadataActionArgs { label?: string }
/** `metadata.set`: new values by recipe key (`exif:Artist`, `xmp:dc:title`, `iptc:Keywords`). An empty value removes the field. */
export interface MetadataSetArgs extends MetadataActionArgs { values: Readonly<Record<string, string | readonly string[]>> }
/** `metadata.remove`: recipe keys to remove. */
export interface MetadataRemoveArgs extends MetadataActionArgs { keys: readonly string[] }

/**
 * Record one metadata change as one undo step. The merged edits are applied to the source first,
 * so a change that cannot be written is refused here rather than failing a later export.
 */
function commitMetadata(session: EditorSession, change: MetadataChange, label?: string) {
  const metadata = session.original?.metadata;
  if ('set' in change) {
    const listed = new Map(listMetadata(applyMetadataEdits(metadata, session.state.recipe.metadata)).map(e => [e.key, e]));
    for (const key of Object.keys(change.set)) if (!isWritableMetadataKey(key) || listed.get(key)?.writable === false) throw new RangeError(`Metadata field ${key} cannot be written`);
  }
  const next = mergeMetadataEdits(session.state.recipe.metadata, change);
  applyMetadataEdits(metadata, next);
  session.commit({ metadata: next }, label ? { label } : {});
}
const ready = (session: EditorSession) => session.state.status === 'ready';
/** The four metadata actions. The Info tool registers them; a host composing the panel alone can register them too. */
export const metadataActions: readonly ActionOverride[] = [
  { id: 'metadata.set', enabled: ready, run: (session, args) => { const { values, label } = args as MetadataSetArgs; commitMetadata(session, { set: values }, label); } },
  { id: 'metadata.remove', enabled: ready, run: (session, args) => { const { keys, label } = args as MetadataRemoveArgs; commitMetadata(session, { remove: keys }, label); } },
  { id: 'metadata.removeGps', enabled: ready, run: (session, args) => commitMetadata(session, { removeGps: true }, (args as MetadataActionArgs | undefined)?.label) },
  { id: 'metadata.removeAll', enabled: ready, run: (session, args) => commitMetadata(session, { removeAll: true }, (args as MetadataActionArgs | undefined)?.label) },
];
/** Run a metadata change through its action, so `onAction` can see and refuse it. */
export function runMetadataChange(session: EditorSession, change: MetadataChange, label: string): unknown {
  if ('set' in change) return session.run('metadata.set', { values: change.set, label } satisfies MetadataSetArgs);
  if ('remove' in change) return session.run('metadata.remove', { keys: change.remove, label } satisfies MetadataRemoveArgs);
  return session.run('removeGps' in change ? 'metadata.removeGps' : 'metadata.removeAll', { label } satisfies MetadataActionArgs);
}
