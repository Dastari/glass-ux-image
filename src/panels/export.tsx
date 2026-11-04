import { PercentInput } from 'glass-ux/percent-field';
import { Notice } from 'glass-ux/notice';
import { Skeleton } from 'glass-ux/skeleton';
import { Spinner } from 'glass-ux/spinner';
import { formatBytes } from 'glass-ux/byte-size-field';
import { useCallback, useMemo, useState } from 'react';
import { profileConversion } from '../io/colour/profile.js';
import { ActionButton } from 'glass-ux/button';
import { Select } from 'glass-ux/select';
import { NumberField } from 'glass-ux/number-field';
import { SettingRow } from 'glass-ux/setting-row';
import { Field } from 'glass-ux/field';
import { PanelActions, PanelGroup, PanelPair } from '../react/panel-layout.js';
import { Switch } from 'glass-ux/switch';
import { useMessages } from 'glass-ux/i18n';
import { useLocale } from 'glass-ux/locale';
import { filesMessages, type FilesMessages } from '../messages/files.js';
import { useExportFormats, useExportPreview, useImageExport, useImageMetadata } from '../react/files.js';

import type { EncodeOptions } from '../io/encode.js';
import type { EditorSession } from '../session/index.js';
/** Plain export values and callbacks; no editor/provider is required. */
export interface ExportPanelProps {
  /** Controlled export settings; omit to use local state. */
  value?:EncodeOptions;
  /** Initial settings when uncontrolled. */
  defaultValue?:EncodeOptions;
  /** Reports a complete settings object. */
  onValueChange?:(value:EncodeOptions)=>void;
  /** Inject composed pixels/encoding for a live compressed preview. */
  renderPreview?:(value:EncodeOptions)=>Promise<Blob>;
  /** The host decides what delivery means. Without this callback no Export button is shown. */
  onExport?:(value:EncodeOptions)=>unknown;
  /** Actual codec availability; omit to probe native and optional encoders on mount. */
  formats?:Readonly<Record<string,boolean>>;
  /** Temporarily prevent edits and delivery. */
  disabled?:boolean;
  /** A source profile offered as a destination. Supported RGB matrix/TRC profiles convert before embedding. */
  profile?:Uint8Array;
  /** Translated or host-supplied words. */
  labels?:Partial<FilesMessages>;
  /** Layout class. */
  className?:string;
}
/** Standalone export controls and the exact encoded preview/file size. */
export function ExportPanel({value,defaultValue,onValueChange,renderPreview,onExport,formats:provided,disabled,profile,labels,className}:ExportPanelProps) {
  const [local,setLocal]=useState<EncodeOptions>(()=>({type:'image/png',quality:.82,alpha:true,metadata:'strip',...defaultValue}));
  const settings=value??local,m=useMessages(filesMessages,{labels}),locale=useLocale();
  const detected=useExportFormats(),formats=provided??detected;
  const update=(patch:Partial<EncodeOptions>)=> {const next={...settings,...patch};if(value===undefined)setLocal(next);onValueChange?.(next);};
  const canConvert=useMemo(()=>!!profile&&!!profileConversion(profile).transform,[profile]);
  const preview=useExportPreview(settings,renderPreview);
  const [delivering,setDelivering]=useState(false),[deliveryError,setDeliveryError]=useState(false);
  const unavailable=!formats[settings.type??'image/png'];
  return <div className={['gi-panel','gi-files',className].filter(Boolean).join(' ')}>
    <PanelPair>
      <Field label={m.format} message="auto"><Select aria-label={m.format} size="sm" disabled={disabled||delivering} value={settings.type??'image/png'} options={['png','jpeg','webp','avif'].map(name=>({value:`image/${name}`,label:name.toUpperCase(),disabled:!formats[`image/${name}`],detail:formats[`image/${name}`]?undefined:m.unavailable}))} onValueChange={type=>{if(type)update({type});}}/></Field>
      <Field label={m.quality} message="auto"><PercentInput scale="fraction" aria-label={m.quality} size="sm" steppers={false} value={settings.quality??.82} disabled={disabled||settings.type==='image/png'} onValueChange={q=>{if(q!==null)update({quality:q});}}/></Field>
    </PanelPair>
    <SettingRow className="gi-panel-setting" label={m.alpha} control={<Switch size="sm" aria-label={m.alpha} checked={settings.alpha!==false&&settings.type!=='image/jpeg'} disabled={disabled||settings.type==='image/jpeg'} onCheckedChange={alpha=>update({alpha})}/>}/>
    <PanelGroup label={m.size}><PanelPair>
      <Field label={m.width} message="auto"><NumberField aria-label={m.width} size="sm" min={1} max={65536} unit="px" steppers={false} value={settings.width??null} disabled={disabled} onValueChange={n=>update({width:n??undefined})}/></Field>
      <Field label={m.height} message="auto"><NumberField aria-label={m.height} size="sm" min={1} max={65536} unit="px" steppers={false} value={settings.height??null} disabled={disabled} onValueChange={n=>update({height:n??undefined})}/></Field>
    </PanelPair></PanelGroup>
    <Field label={m.metadata} message="auto"><Select aria-label={m.metadata} size="sm" disabled={disabled} value={settings.metadata??'strip'} options={[{value:'preserve',label:m.preserve},{value:'strip',label:m.strip},{value:'strip-gps',label:m.stripGps}]} onValueChange={metadata=>{if(metadata)update({metadata:metadata as EncodeOptions['metadata']});}}/></Field>
    {profile&&<SettingRow label={m.icc} description={canConvert?m.iccNote:m.profileFallback} control={<Switch size="sm" aria-label={m.icc} disabled={disabled||!canConvert} checked={!!settings.icc} onCheckedChange={embed=>update({icc:embed?profile:undefined})}/>}/>}
    {renderPreview&&<figure className="gi-files-preview" aria-busy={preview.busy}><div>{preview.url ? <img src={preview.url} alt={m.preview}/> : <Skeleton.Block width="100%" height="100%"/>}</div><figcaption aria-live="polite">{preview.busy ? <Spinner label={m.loading}/> : preview.blob ? formatBytes(preview.blob.size,{locale}) : '\u00a0'}</figcaption></figure>}
    <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: unavailable||deliveryError||preview.error ? undefined : 'hidden'}}>{unavailable?m.unavailable:m.failed}</Notice></div>
    {onExport&&<PanelActions><ActionButton size="sm" variant="primary" disabled={disabled||unavailable||delivering} pendingLabel={m.pending} successLabel={m.done} errorLabel={m.error} onError={()=>setDeliveryError(true)} onAction={async()=> {setDelivering(true);setDeliveryError(false);try {await onExport(settings);} finally {setDelivering(false);}}}>{m.export}</ActionButton></PanelActions>}
  </div>;
}
/** Optional session binding; the base ExportPanel remains fully independent. */
export interface SessionExportPanelProps {
  /** Explicit editor or nearest ImageEditorProvider. */
  editor?:EditorSession;
  /** Initial output settings. */
  defaultValue?:EncodeOptions;
  /** Host word overrides. */
  labels?:Partial<FilesMessages>;
}
/** Session export controls with a compressed preview and host-controlled delivery. */
export function SessionExportPanel({editor,defaultValue,labels}:SessionExportPanelProps) {
  const api=useImageExport(editor),metadata=useImageMetadata(editor),[settings,setSettings]=useState<EncodeOptions>(()=>({type:'image/png',quality:.82,metadata:'strip',alpha:true,width:api.size?.width,height:api.size?.height,...defaultValue}));
  const sourceProfile=metadata.profile?.bytes;
  const outputSettings=useMemo(()=>settings.icc?{...settings,icc:sourceProfile&&profileConversion(sourceProfile).transform?sourceProfile:undefined}:settings,[settings,sourceProfile]);
  const deliver=useCallback((value:EncodeOptions)=>api.export(value),[api]);
  return <ExportPanel value={outputSettings} onValueChange={setSettings} renderPreview={api.ready?api.render:undefined} formats={api.formats} disabled={!api.ready} profile={metadata.profile?.bytes} onExport={api.canExport?deliver:undefined} labels={labels}/>;
}
export { useImageExport, useExportPreview, useExportFormats } from '../react/files.js';
