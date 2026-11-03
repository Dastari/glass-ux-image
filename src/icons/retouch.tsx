import { createIcon } from 'glass-ux/icon';
/** Eraser with a cleared baseline. */
export const IconEraser = createIcon('image-eraser', <><path d="m4 13 8-8a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-7 7H9l-5-4a2 2 0 0 1 0-3Z"/><path d="m8 9 8 8M13 20h8"/></>);
/** Fine triangular sharpening edge. */
export const IconSharpen = createIcon('image-sharpen', <><path d="m12 3 9 18H3Z"/><path d="M12 10v7"/></>);
/** Finger pulling a short smear. */
export const IconSmudge = createIcon('image-smudge', <><path d="M8 13V5a2 2 0 0 1 4 0v6l3-2a3 3 0 0 1 4 4l-4 7H9l-5-5a2 2 0 0 1 3-3l3 3"/></>);
/** Sponge block with large pores. */
export const IconSponge = createIcon('image-sponge', <><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="7" cy="10" r="1" className="d"/><circle cx="12" cy="14" r="1" className="d"/><circle cx="17" cy="10" r="1" className="d"/></>);
/** Healing capsule with a brush stroke. */
export const IconSpotHeal = createIcon('image-spot-heal', <><path d="m5 12 7-7a4 4 0 0 1 6 6l-7 7a4 4 0 0 1-6-6ZM8 9l7 7M17 3v3M20 6h-3"/></>);
/** Selected region receiving replacement texture. */
export const IconPatchRegion = createIcon('image-patch-region', <><rect x="3" y="8" width="13" height="13" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v11M7 13l3 3 7-7"/></>);
