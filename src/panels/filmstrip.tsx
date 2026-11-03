import { ScrollArea } from 'glass-ux/scroll-area';
import { Toolbar } from 'glass-ux/toolbar';
import { IconImage } from 'glass-ux/icons';
import { useMessages } from 'glass-ux/i18n';
import { useState } from 'react';
import { workspaceMessages, type WorkspaceMessages } from '../messages/workspace.js';
import type { EditorSession } from '../session/index.js';
/** One open picture. Its host-owned session retains independent history while inactive. */
export interface OpenPicture {
  /** Stable host identity. */
  id: string;
  /** Localised picture name. */
  label: string;
  /** The host owns the session's lifetime. */
  editor: EditorSession;
  /** Optional host-managed thumbnail URL. */
  thumbnail?: string;
}
/** Filmstrip selection never disposes or replaces a session. */
export interface FilmstripProps {
  /** Open pictures in host order. */
  pictures: readonly OpenPicture[];
  /** Controlled selected picture. */
  selectedId?: string | null;
  /** Initially selected picture; otherwise the first. */
  defaultSelectedId?: string | null;
  /** Host switches to this picture's session. */
  onSelectedIdChange?: (id:string, picture:OpenPicture)=>void;
  /** Localised words. */
  labels?: Partial<WorkspaceMessages>;
  /** Layout class. */
  className?: string;
}
/** A horizontally scrolling single-choice Glass UX toolbar, with arrow keys and named thumbnails. */
export function Filmstrip({pictures,selectedId,defaultSelectedId,onSelectedIdChange,labels,className}:FilmstripProps) {
  const [own,setOwn]=useState(defaultSelectedId??pictures[0]?.id??null),m=useMessages(workspaceMessages,{labels});
  return <div className={['gi-filmstrip',className].filter(Boolean).join(' ')}><ScrollArea orientation="horizontal" edges="fade"><Toolbar aria-label={m.filmstrip} overflow={false}><Toolbar.Group aria-label={m.filmstrip} value={(selectedId===undefined?own:selectedId)??''} onValueChange={id=>{if(selectedId===undefined)setOwn(id);const picture=pictures.find(p=>p.id===id);if(picture)onSelectedIdChange?.(id,picture);}}>{pictures.map(p=><Toolbar.Button key={p.id} className="gi-filmstrip-picture" value={p.id} label={p.label} showLabel icon={p.thumbnail?<img src={p.thumbnail} alt=""/>:<IconImage/>}/>)}</Toolbar.Group></Toolbar></ScrollArea></div>;
}
