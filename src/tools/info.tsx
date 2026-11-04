import { IconInfo } from 'glass-ux/icons';
import { defineTool } from '../react/tool.js';
import { infoMessages } from '../messages/info.js';
import { SessionImageInfoPanel } from '../panels/info.js';
import { metadataActions } from './info-actions.js';
/**
 * Everything about the picture: file, camera, exposure, lens, dates, location, description and every
 * EXIF, XMP and IPTC field. Fields are edited and removed through the `metadata.*` actions, kept in the
 * recipe and written on export when its metadata setting keeps metadata. It has its own rail button and no
 * single-key shortcut: Photoshop gives I to the eyedropper, and its File Info is Ctrl+Alt+Shift+I.
 */
export const infoTool = defineTool({ id: 'info', group: 'files', messages: infoMessages, label: m => m.info, icon: <IconInfo />, standalone: true, Panel: () => <SessionImageInfoPanel />, actions: metadataActions });
export { metadataActions, runMetadataChange, type MetadataActionArgs, type MetadataSetArgs, type MetadataRemoveArgs } from './info-actions.js';
export { ImageInfoPanel, SessionImageInfoPanel, useImageInfo, type ImageInfoPanelProps, type SessionImageInfoPanelProps } from '../panels/info.js';
