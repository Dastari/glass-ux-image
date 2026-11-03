import { IconDownload, IconInfo, IconFolder, IconFolderOpen } from 'glass-ux/icons';
import { defineTool } from '../react/tool.js';
import { filesMessages } from '../messages/files.js';
import { SessionExportPanel } from '../panels/export.js';
import { SessionMetadataPanel } from '../panels/metadata.js';
import { SessionBatchPanel } from '../panels/batch.js';
import { FilesPanel } from './export/files-panel.js';
/** Export controls with live compressed preview; no destination is assumed. */
export const exportTool=defineTool({id:'files.export',group:'files',messages:filesMessages,label:m=>m.export,icon:<IconDownload/>,Panel:SessionExportPanel});
/** Read-only original metadata. */
export const metadataTool=defineTool({id:'files.metadata',group:'files',messages:filesMessages,label:m=>m.metadata,icon:<IconInfo/>,Panel:SessionMetadataPanel});
/** Independent files with the current recipe. */
export const batchTool=defineTool({id:'files.batch',group:'files',messages:filesMessages,label:m=>m.batch,icon:<IconFolder/>,Panel:SessionBatchPanel});
/** Open, clipboard, project and recovery actions. */
export const filesTool=defineTool({id:'files.open',group:'files',messages:filesMessages,label:m=>m.files,icon:<IconFolderOpen/>,Panel:FilesPanel});
export { FilesPanel, type FilesPanelProps } from './export/files-panel.js';
