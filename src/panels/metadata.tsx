import { EmptyState } from 'glass-ux/empty-state';
import { IconInfo } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { numberFormat, useLocale } from 'glass-ux/locale';
import { SettingRow } from 'glass-ux/setting-row';
import { filesMessages, type FilesMessages } from '../messages/files.js';
import { useImageMetadata } from '../react/files.js';
import { useEditor } from '../react/session-context.js';
import { profileConversion } from '../io/colour/profile.js';
import type { ImageMetadata } from '../io/metadata/index.js';
import type { IccProfile } from '../io/metadata/icc.js';
import type { EditorSession } from '../session/index.js';
const formatMetadataNumber=(locale:string,value:number)=>numberFormat(locale,{maximumFractionDigits:8}).format(value);

/** Read-only metadata with plain values; no image editor is needed. */
export interface MetadataPanelProps {
  /** Parsed source metadata, or null when absent. */
  value:ImageMetadata|null;
  /** Optional extracted ICC description. */
  profile?:IccProfile|null;
  /** Import provenance, including preview-only RAW sources. */
  importInfo?:{kind:string};
  /** Host word overrides. */
  labels?:Partial<FilesMessages>;
  /** Layout class. */
  className?:string;
}
/** Read-only metadata and profile descriptions from plain host values, without a session. */
export function MetadataPanel({value,profile,importInfo,labels,className}:MetadataPanelProps) {
  const m=useMessages(filesMessages,{labels}),locale=useLocale();
  const keys=['cameraMake','cameraModel','lens','exposureSeconds','aperture','iso','focalLengthMm','date','orientation'] as const;
  return <div className={['gi-panel','gi-files',className].filter(Boolean).join(' ')}>
    {!value&&!profile&&<EmptyState icon={<IconInfo/>}>{m.empty}</EmptyState>}
    {value&&keys.filter(key=>value.fields[key]!==undefined).map(key=><SettingRow key={key} label={m[key]} value={typeof value.fields[key]==='number'?formatMetadataNumber(locale,value.fields[key] as number):value.fields[key] as string}/>)}
    {value?.fields.gps&&<SettingRow label={m.gps} value={Object.values(value.fields.gps).filter(v=>v!==undefined).map(v=>formatMetadataNumber(locale,v)).join(' · ')}/>}
    {value&&<><SettingRow label="EXIF" value={value.presence.exif?'✓':'—'}/><SettingRow label="XMP" value={value.presence.xmp?'✓':'—'}/><SettingRow label="IPTC" value={value.presence.iptc?'✓':'—'}/></>}
    {profile&&<SettingRow label={m.profile} value={profile.description}/>}
    {profile&&!profileConversion(profile.bytes).transform&&<p role="note" className="gi-panel-hint">{m.profileFallback}</p>}
    {importInfo?.kind==='raw-preview'&&<p role="note" className="gi-panel-hint">{m.rawPreview}</p>}
  </div>;
}
/** Session metadata binding. */
export interface SessionMetadataPanelProps {
  /** Explicit editor or nearest provider. */
  editor?:EditorSession;
  /** Host word overrides. */
  labels?:Partial<FilesMessages>;
}
/** Read original source metadata from an explicit session or its provider. */
export function SessionMetadataPanel({editor,labels}:SessionMetadataPanelProps) {const session=useEditor(editor),{metadata,profile}=useImageMetadata(session);return <MetadataPanel value={metadata} profile={profile} importInfo={session.original?.importInfo} labels={labels}/>;}
export { useImageMetadata } from '../react/files.js';
