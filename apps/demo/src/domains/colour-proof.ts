// Opt-in browser tests exercise public entries, including the real decoding and codec workers.
import * as io from 'glass-ux-image/io';
import { createEditorSession } from 'glass-ux-image/session';
import { pixelsToRgba8 } from 'glass-ux-image/core';
const colourProof={io,createEditorSession,pixelsToRgba8};
declare global {interface Window {colourProof:typeof colourProof}}
window.colourProof=colourProof;
