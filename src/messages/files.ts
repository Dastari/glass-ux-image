import { defineMessages } from 'glass-ux/i18n';
import type { MessageValues } from './types.js';
/** Words for standalone file parts and their session-bound compositions. */
export const filesMessages=defineMessages('imageEditor.files',{
  "size": "Size",
  export:'Export',metadata:'Metadata',batch:'Batch',format:'Format',quality:'Quality',width:'Width',height:'Height',alpha:'Keep transparency',preserve:'Preserve',strip:'Strip all',stripGps:'Strip GPS',preview:'Compressed preview',bytes:'Bytes',unavailable:'Unavailable',loading:'Preparing preview',failed:'The operation could not be completed',open:'Open image',projectOpen:'Open project',projectSave:'Save project',paste:'Paste image',copy:'Copy image',drop:'Open or drop an image',browse:'Browse locations',run:'Run batch',cancel:'Cancel',files:'Images',progress:'Completed',empty:'No metadata',cameraMake:'Camera make',cameraModel:'Camera model',lens:'Lens',exposureSeconds:'Exposure (seconds)',aperture:'Aperture',iso:'ISO',focalLengthMm:'Focal length (mm)',date:'Date',orientation:'Original orientation',gps:'GPS',profile:'Colour profile',recover:'Recover',autosave:'Autosave snapshot',pending:'Working',done:'Done',error:'Failed',aborted:'Cancelled',noExport:'The host has no export destination',icc:'Convert to source profile',iccNote:'Convert pixels and embed the source profile. Otherwise export sRGB.',profileFallback:'Unsupported ICC profile: LUT-based, non-RGB or invalid matrix/TRC. Treated as sRGB.',rawPreview:'Embedded JPEG preview only. RAW sensor data is not demosaiced.',project:'Project',recovery:'Recovery snapshots',sources:'Source images'
});
export type FilesMessages=MessageValues<typeof filesMessages.defaults>;

// Typed packs and overrides: Glass UX merges namespaces through its catalog module.
declare module "glass-ux/i18n/catalog" {
  interface MessageCatalog { "imageEditor.files": FilesMessages }
}
