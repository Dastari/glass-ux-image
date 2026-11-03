import { useMemo,useState } from 'react';
import { CodeBlock } from 'glass-ux/ai/code-block';
import { Select } from 'glass-ux/select';
import { useMessages } from 'glass-ux/i18n';
import { workspaceMessages } from 'glass-ux-image/messages/workspace';
import { sceneSource } from './scene-source';
import { download } from './workspace-page';
import { SingleAdjustment } from './templates/single-adjustment';
import { AvatarCropper } from './templates/avatar-cropper';
import { ProductPhoto } from './templates/product-photo';
import { SocialPost } from './templates/social-post';
import { Annotator } from './templates/annotator';
import { DevelopView } from './templates/develop-view';
import { FullSuite } from './templates/full-suite';
const sources=import.meta.glob('./templates/*.tsx',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
const samples=[['singleSlider','single-adjustment'],['avatar','avatar-cropper'],['product','product-photo'],['social','social-post'],['annotator','annotator'],['developView','develop-view'],['fullSuite','full-suite']] as const;
/** Live compositions with complete source on the same page, smallest first. */
export function TemplatesPage(){
  const m=useMessages(workspaceMessages),[sample,setSample]=useState<string>('singleSlider'),src=useMemo(()=>sceneSource({width:900,height:600}),[]);
  const save=async(result:import('glass-ux-image/session').EditResult)=>download(await result.toBlob(), 'image.png');
  const name=samples.find(([id])=>id===sample)![1];
  return <div className="templates-page"><div className="templates-bar"><Select size="sm" aria-label={m.templates} value={sample} options={samples.map(([value])=>({value,label:m[value]}))} onValueChange={v=>v&&setSample(v)}/></div><div className="template-live" key={sample}>{sample==='singleSlider'?<SingleAdjustment/>:sample==='avatar'?<AvatarCropper src={src} onSave={save}/>:sample==='product'?<ProductPhoto src={src} onSave={save}/>:sample==='social'?<SocialPost src={src}/>:sample==='annotator'?<Annotator src={src}/>:sample==='developView'?<DevelopView src={src}/>:<FullSuite src={src}/>}</div><CodeBlock title={`${name}.tsx`} language="tsx" code={sources[`./templates/${name}.tsx`]!} maxLines={0}/></div>;
}
