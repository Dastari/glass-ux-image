import { useMessages } from 'glass-ux/i18n';
import { filesMessages, type FilesMessages } from '../messages/files.js';
import type { InfoMessages } from '../messages/info.js';
import { profileConversion } from '../io/colour/profile.js';
import type { ImageMetadata, MetadataChange } from '../io/metadata/index.js';
import type { IccProfile } from '../io/metadata/icc.js';
import type { EditorSession } from '../session/index.js';
import { ImageInfoPanel, SessionImageInfoPanel } from './info.js';

/** Metadata from plain values; no image editor is needed. */
export interface MetadataPanelProps {
  /** Parsed source metadata, or null when absent. Pass it with any edits applied. */
  value:ImageMetadata|null;
  /** Optional extracted ICC description. */
  profile?:IccProfile|null;
  /** Import provenance, including preview-only RAW sources. */
  importInfo?:{kind:string};
  /** Called with each change and its history label. Without it the panel is read-only. */
  onChange?:(change:MetadataChange,label:string)=>unknown;
  /** Host word overrides for the notes. */
  labels?:Partial<FilesMessages>;
  /** Host word overrides for fields and groups. */
  infoLabels?:Partial<InfoMessages>;
  /** Layout class. */
  className?:string;
}
/** Every EXIF, XMP and IPTC field in readable groups, from plain host values, without a session. */
export function MetadataPanel({value,profile,importInfo,onChange,labels,infoLabels,className}:MetadataPanelProps) {
  const m=useMessages(filesMessages,{labels});
  const notes=[profile&&!profileConversion(profile.bytes).transform?m.profileFallback:undefined,importInfo?.kind==='raw-preview'?m.rawPreview:undefined].filter(Boolean);
  return <ImageInfoPanel className={['gi-files',className].filter(Boolean).join(' ')} source={{metadata:value,...(profile!==undefined?{profile}:{})}} labels={infoLabels} {...(onChange?{onChange}:{})} footnote={notes.length?notes.map(note=><span key={note} role="note" className="gi-info-note">{note}</span>):undefined}/>;
}
/** Session metadata binding. */
export interface SessionMetadataPanelProps {
  /** Explicit editor or nearest provider. */
  editor?: EditorSession;
  /** Host word overrides. */
  labels?: Partial<InfoMessages>;
}
/** The session's picture: file facts, metadata with the recipe's edits, and editing through the metadata actions. */
export function SessionMetadataPanel({editor,labels}:SessionMetadataPanelProps) {return <SessionImageInfoPanel editor={editor} labels={labels}/>;}
export { useImageMetadata } from '../react/files.js';
