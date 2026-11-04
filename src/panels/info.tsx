import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Accordion } from 'glass-ux/accordion';
import { Button } from 'glass-ux/button';
import { CopyButton } from 'glass-ux/copy-button';
import { EmptyState } from 'glass-ux/empty-state';
import { FactList } from 'glass-ux/fact-list';
import { Input } from 'glass-ux/input';
import { TagInput } from 'glass-ux/tag-input';
import { Textarea } from 'glass-ux/textarea';
import { IconClose, IconEdit, IconInfo, IconMapPin, IconTrash } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { useLocale } from 'glass-ux/locale';
import { infoMessages, type InfoMessages } from '../messages/info.js';
import { filesMessages } from '../messages/files.js';
import { useEditor, useSessionState } from '../react/session-context.js';
import { applyMetadataEdits, readMetadataEntries, type MetadataChange, type MetadataEntry } from '../io/metadata/edits.js';
import { readFileInfo, type ImageFileInfo } from '../io/metadata/file-info.js';
import { readImageDpi } from '../io/metadata/resolution.js';
import { metadataActions, runMetadataChange } from '../tools/info-actions.js';
import { buildInfoGroups, editValues, formatters, type InfoGroup, type InfoRow, type InfoSource } from './info-model.js';
import type { EditorSession } from '../session/index.js';

export type { InfoSource, InfoGroup, InfoRow } from './info-model.js';

/** Everything about one picture, from plain values; no editor is needed. */
export interface ImageInfoPanelProps {
  /** What to describe. `metadata` should already carry any edits. */
  source: InfoSource;
  /** Called with each change and its history label. Without it the panel is read-only. */
  onChange?: (change: MetadataChange, label: string) => unknown;
  /** Open sections, controlled. Ids: file, camera, exposure, lens, date, location, description, software, all. */
  open?: readonly string[];
  /** Open sections at first, uncontrolled. Default: every section except All fields. */
  defaultOpen?: readonly string[];
  /** Called when sections open or close. */
  onOpenChange?: (open: string[]) => void;
  /** A note under the sections, such as the export policy; defaults to the export note while editable. */
  footnote?: ReactNode;
  /** Host word overrides. */
  labels?: Partial<InfoMessages>;
  /** Layout class. */
  className?: string;
}

/** Image information in readable groups, with every EXIF, XMP and IPTC field beneath. */
export function ImageInfoPanel({ source, onChange, open, defaultOpen, onOpenChange, footnote, labels, className }: ImageInfoPanelProps) {
  const m = useMessages(infoMessages, { labels }), locale = useLocale(), editable = !!onChange;
  // Malformed packets read as unreadable rather than throwing, so one bad block never takes the panel down.
  const { entries, unreadable } = useMemo(() => readMetadataEntries(source.metadata), [source.metadata]);
  const groups = useMemo(() => buildInfoGroups(source, entries, m, locale, editable, unreadable), [source, entries, m, locale, editable, unreadable]);
  const [error, setError] = useState(false);
  const change = async (next: MetadataChange, label: string) => {
    setError(false);
    try { await onChange?.(next, label); } catch { setError(true); }
  };
  const readable = groups.filter(g => g.id !== 'exif' && g.id !== 'xmp' && g.id !== 'iptc'), raw = groups.filter(g => g.id === 'exif' || g.id === 'xmp' || g.id === 'iptc');
  const initial = defaultOpen ?? readable.map(g => g.id);
  const hasGps = entries.some(e => e.name.startsWith('GPS') || /:GPS/.test(e.key));
  const rowsOf = (group: InfoGroup) => <FactList className="gi-info-facts" facts={group.rows.map(row => ({ label: row.label, value: <InfoValue row={row} m={m} onChange={editable ? change : undefined} /> }))} />;
  return <div className={['gi-panel', 'gi-info', className].filter(Boolean).join(' ')}>
    <InfoSummary source={source} entries={entries} m={m} locale={locale} />
    {error && <p role="alert" className="gi-info-error">{m.editFailed}</p>}
    <Accordion.Root multiple {...(open ? { value: [...open] } : { defaultValue: [...initial] })} onValueChange={value => onOpenChange?.(value as string[])}>
      {readable.map(group => <Accordion.Item key={group.id} value={group.id} title={group.label} level={3} meta={group.readOnly ? m.readOnly : undefined}>
        {rowsOf(group)}
        {group.id === 'location' && editable && hasGps && <div className="gi-info-actions"><Button size="sm" variant="secondary" icon={<IconMapPin />} onClick={() => void change({ removeGps: true }, m.removeLocation)}>{m.removeLocation}</Button></div>}
      </Accordion.Item>)}
      {raw.length > 0 && <Accordion.Item value="all" title={m.groupAll} level={3} meta={String(entries.length)}>
        {raw.map(group => <section key={group.id} className="gi-info-family" aria-label={group.label}>
          <h4 className="gi-info-overline">{group.label}<span>{group.rows.length}</span></h4>
          {rowsOf(group)}
        </section>)}
      </Accordion.Item>}
    </Accordion.Root>
    {!entries.length && !unreadable.length && !editable && <EmptyState icon={<IconInfo />}>{m.noMetadata}</EmptyState>}
    {editable && <div className="gi-info-footer">
      {entries.length > 0 && <Button size="sm" variant="ghost" icon={<IconTrash />} onClick={() => void change({ removeAll: true }, m.removeAll)}>{m.removeAll}</Button>}
      <p className="gi-panel-hint">{footnote ?? m.exportNote}</p>
    </div>}
    {!editable && footnote && <p className="gi-panel-hint">{footnote}</p>}
  </div>;
}

/** Lightroom's line under the histogram: the name, the file, and the exposure at a glance. */
function InfoSummary({ source, entries, m, locale }: { source: InfoSource; entries: readonly MetadataEntry[]; m: InfoMessages; locale: string }) {
  const f = formatters(m, locale), value = (key: string) => { const v = entries.find(e => e.key === key)?.value; return typeof v === 'number' ? v : undefined; };
  const iso = value('exif:ISO'), focal = value('exif:FocalLength'), fNumber = value('exif:FNumber'), exposure = value('exif:ExposureTime');
  const camera = [entries.find(e => e.key === 'exif:Model')?.value].filter((v): v is string => typeof v === 'string' && !!v)[0];
  const capture = [iso !== undefined ? `ISO ${f.n(iso, 0)}` : undefined, focal ? m.millimetres(f.n(focal, 0)) : undefined, fNumber ? f.aperture(fNumber) : undefined, exposure ? f.exposure(exposure) : undefined].filter((v): v is string => !!v);
  const facts = [source.file ? (({ jpeg: 'JPEG', png: 'PNG', webp: 'WebP', gif: 'GIF', svg: 'SVG', tiff: 'TIFF', psd: 'PSD', raw: 'RAW', heif: 'HEIF' } as Record<string, string>)[source.file.format]) : undefined, source.size ? `${f.n(source.size.width, 0)} × ${f.n(source.size.height, 0)}` : undefined].filter(Boolean);
  if (!source.name && !facts.length && !capture.length && !camera) return null;
  return <header className="gi-info-summary">
    {(source.name || camera) && <p className="gi-info-title">{source.name ?? camera}</p>}
    {facts.length > 0 && <p className="gi-info-subtitle">{isolated([...facts, ...(source.name && camera ? [camera] : [])].join(' · '))}</p>}
    {capture.length > 0 && <ul className="gi-info-capture" aria-label={m.groupExposure}>{capture.map(item => <li key={item}><bdi>{item}</bdi></li>)}</ul>}
  </header>;
}

/** Each part of a value takes its own direction, so numbers, units and words in another script never reorder each other. */
const isolated = (text: string) => text.split(/( · |, )/).map((part, i) => i % 2 ? part : <bdi key={i}>{part}</bdi>);
/** One value, with its edit, copy and remove controls. Keyboard: Tab to Edit, Enter, type, Enter commits, Escape cancels. */
function InfoValue({ row, m, onChange }: { row: InfoRow; m: InfoMessages; onChange?: (change: MetadataChange, label: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false), editButton = useRef<HTMLButtonElement>(null), returnFocus = useRef(false);
  useEffect(() => { if (!editing && returnFocus.current) { returnFocus.current = false; editButton.current?.focus(); } }, [editing]);
  const edit = row.edit;
  const finish = (value?: string | readonly string[]) => {
    returnFocus.current = true; setEditing(false);
    if (value === undefined || !edit || !onChange) return;
    const before = typeof edit.value === 'string' ? edit.value : edit.value.join('\n'), after = typeof value === 'string' ? value.trim() : value.join('\n');
    if (before === after) return;
    void onChange({ set: editValues(row, value) }, m.changed(row.label));
  };
  if (edit && onChange && edit.kind === 'list') {
    // Lists edit in place as chips: each added or removed keyword is one change.
    return <div className="gi-info-value gi-info-list">
      <TagInput size="sm" aria-label={row.label} value={[...edit.value]} placeholder={m.notSet} onValueChange={values => void onChange({ set: editValues(row, values) }, m.changed(row.label))} />
      {row.remove && row.remove.length > 0 && <Button size="xs" variant="ghost" className="gi-info-act" icon={<IconClose />} aria-label={m.remove(row.label)} onClick={() => void onChange({ remove: row.remove! }, m.remove(row.label))} />}
    </div>;
  }
  if (editing && edit) return <div className="gi-info-value" data-editing="">
    <InfoEditor row={row} onDone={finish} />
  </div>;
  return <div className="gi-info-value" data-empty={row.value ? undefined : ''}>
    <span className="gi-info-text" onDoubleClick={edit && onChange ? () => setEditing(true) : undefined}>{row.value ? isolated(row.value) : m.notSet}</span>
    <span className="gi-info-acts">
      {row.copy && <CopyButton size="xs" variant="ghost" className="gi-info-act" value={row.copy} label={m.copyCoordinates} />}
      {edit && onChange && <Button ref={editButton} size="xs" variant="ghost" className="gi-info-act" icon={<IconEdit />} aria-label={m.edit(row.label)} onClick={() => setEditing(true)} />}
      {onChange && row.remove && row.remove.length > 0 && <Button size="xs" variant="ghost" className="gi-info-act" icon={<IconClose />} aria-label={m.remove(row.label)} onClick={() => void onChange({ remove: row.remove! }, m.remove(row.label))} />}
    </span>
  </div>;
}
function InfoEditor({ row, onDone }: { row: InfoRow; onDone: (value?: string) => void }) {
  const edit = row.edit!, initial = typeof edit.value === 'string' ? edit.value : edit.value.join(', ');
  const [text, setText] = useState(initial), done = useRef(false);
  const end = (value?: string) => { if (done.current) return; done.current = true; onDone(value); };
  const keys = (event: KeyboardEvent, multiline: boolean) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); end(); }
    else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) { event.preventDefault(); end(text); }
  };
  if (edit.kind === 'multiline') return <Textarea aria-label={row.label} autoFocus minRows={2} maxRows={6} value={text} onValueChange={setText} onKeyDown={e => keys(e, true)} onBlur={() => end(text)} />;
  return <Input size="sm" aria-label={row.label} autoFocus type={edit.kind === 'datetime' ? 'datetime-local' : 'text'} step={edit.kind === 'datetime' ? 1 : undefined} value={text} onValueChange={setText} onKeyDown={e => keys(e, false)} onBlur={() => end(text)} />;
}

const fileCache = new WeakMap<Blob, Promise<{ file: ImageFileInfo; dpi: { x: number; y: number } | null }>>();
/** Header facts for a blob, read once per blob. */
function fileFacts(blob: Blob) {
  let cached = fileCache.get(blob);
  if (!cached) {
    cached = blob.arrayBuffer().then(buffer => { const bytes = new Uint8Array(buffer); let dpi: { x: number; y: number } | null = null; try { dpi = readImageDpi(bytes); } catch { /* No readable resolution. */ } return { file: readFileInfo(bytes), dpi }; });
    fileCache.set(blob, cached);
  }
  return cached;
}
/** Everything the panel shows, from a session: source facts, edited metadata and the current size. No panel needed. */
export function useImageInfo(editor?: EditorSession): InfoSource & { ready: boolean; carried: boolean } {
  const session = useEditor(editor), state = useSessionState(session), opened = session.openedSource, base = session.original;
  const [facts, setFacts] = useState<{ blob: Blob; file: ImageFileInfo; dpi: { x: number; y: number } | null }>();
  const blob = opened?.originalBlob;
  useEffect(() => { if (!blob) return; let live = true; void fileFacts(blob).then(f => { if (live) setFacts({ blob, ...f }); }).catch(() => {}); return () => { live = false; }; }, [blob]);
  const current = facts && facts.blob === blob ? facts : undefined;
  const format = current?.file.format;
  const metadata = useMemo(() => {
    try { return applyMetadataEdits(base?.metadata, state.recipe.metadata, format === 'png' || format === 'webp' ? format : 'jpeg') ?? null; } catch { return base?.metadata ?? null; }
  }, [base?.metadata, state.recipe.metadata, format]);
  return {
    ready: state.status === 'ready',
    carried: !!opened?.metadata || !format || format === 'jpeg' || format === 'png' || format === 'webp',
    metadata,
    ...(blob instanceof File && blob.name ? { name: blob.name } : {}),
    ...(blob ? { bytes: blob.size } : {}),
    ...(current ? { file: current.file, dpi: current.dpi } : {}),
    size: state.sourceSize,
    edited: state.size,
    profile: opened?.icc ?? null,
    ...(state.recipe.geometry.resize?.dpi ? { exportDpi: state.recipe.geometry.resize.dpi } : {}),
    ...(opened?.importInfo ? { importInfo: opened.importInfo } : {}),
    frames: opened?.frameCount ?? current?.file.frames ?? opened?.importInfo?.pageCount,
    ...(opened?.importedLayers?.length ? { layers: opened.importedLayers.length } : {}),
  };
}

/** Session-bound information. Changes run through the metadata actions, which it registers if the host has not. */
export interface SessionImageInfoPanelProps {
  /** Explicit editor or nearest provider. */
  editor?: EditorSession;
  /** Make it read-only even when the actions are available. */
  readOnly?: boolean;
  /** Host word overrides. */
  labels?: Partial<InfoMessages>;
}
export function SessionImageInfoPanel({ editor, readOnly, labels }: SessionImageInfoPanelProps) {
  const session = useEditor(editor), { ready, carried, ...source } = useImageInfo(session), files = useMessages(filesMessages), m = useMessages(infoMessages, { labels });
  useEffect(() => session.registerActions(metadataActions), [session]);
  const editable = ready && !readOnly && session.action('metadata.set').enabled;
  const notes = [!carried ? m.notCarried : undefined, source.profile && source.profile.conversion !== 'matrix-trc' ? files.profileFallback : undefined, source.importInfo?.kind === 'raw-preview' ? files.rawPreview : undefined, ...(source.importInfo?.warnings ?? [])].filter(Boolean);
  const footnote = notes.length || editable ? <>{notes.map(note => <span key={note} role="note" className="gi-info-note">{note}</span>)}{editable && <span>{m.exportNote}</span>}</> : undefined;
  return <ImageInfoPanel source={source} labels={labels} footnote={footnote} {...(editable ? { onChange: (change: MetadataChange, label: string) => runMetadataChange(session, change, label) } : {})} />;
}
