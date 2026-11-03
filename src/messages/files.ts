import { defineMessages } from 'glass-ux/i18n';
import type { MessageValues } from './types.js';
/** Words for standalone file parts and their session-bound compositions. */
export const filesMessages=defineMessages('imageEditor.files',{
  "size": "Size",
  export:'Export',metadata:'Metadata',batch:'Batch',format:'Format',quality:'Quality',width:'Width',height:'Height',alpha:'Keep transparency',preserve:'Preserve',strip:'Strip all',stripGps:'Strip GPS',preview:'Compressed preview',bytes:'Bytes',unavailable:'Unavailable',loading:'Preparing preview',failed:'The operation could not be completed',open:'Open image',projectOpen:'Open project',projectSave:'Save project',paste:'Paste image',copy:'Copy image',drop:'Open or drop an image',browse:'Browse locations',run:'Run batch',cancel:'Cancel',files:'Images',progress:'Completed',empty:'No metadata',cameraMake:'Camera make',cameraModel:'Camera model',lens:'Lens',exposureSeconds:'Exposure (seconds)',aperture:'Aperture',iso:'ISO',focalLengthMm:'Focal length (mm)',date:'Date',orientation:'Original orientation',gps:'GPS',profile:'Colour profile',recover:'Recover',autosave:'Autosave snapshot',pending:'Pending',done:'Done',error:'Failed',aborted:'Cancelled',noExport:'The host has no export destination',icc:'Embed source profile',iccNote:'Embedding a profile does not convert sRGB pixels to that colour space',avifMetadata:'AVIF exports remove EXIF, XMP, IPTC and ICC profiles.',project:'Project',recovery:'Recovery snapshots',sources:'Source images'
});
export type FilesMessages=MessageValues<typeof filesMessages.defaults>;
